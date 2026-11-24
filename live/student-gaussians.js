import * as THREE from '../three.module.min.js';
import {createStudentGroom} from './student-groom.js?v=student-avatar-49';
import {textileCoverage} from './student-textile.js?v=student-avatar-49';

const file = new URL('./student-cat-splats.bin?v=student-avatar-49', import.meta.url);
const textureWidth = 512;
const depthBins = 768;
let assetPromise;

function texture(data, height, type) {
  const result = new THREE.DataTexture(data, textureWidth, height, THREE.RGBAFormat, type);
  result.needsUpdate = true;
  return result;
}

function packFloats(source, count, height, fourth) {
  const result = new Float32Array(textureWidth * height * 4);
  for (let index = 0; index < count; index++) {
    const from = index * 3, to = index * 4;
    result[to] = source[from];
    result[to + 1] = source[from + 1];
    result[to + 2] = source[from + 2];
    result[to + 3] = fourth;
  }
  return texture(result, height, THREE.FloatType);
}

async function readAsset() {
  const response = await fetch(file);
  if (!response.ok) throw new Error('The orange cat surface could not load.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 8) throw new Error('The orange cat surface is incomplete.');
  const header = new DataView(buffer);
  const count = header.getUint32(0, true);
  const sigma = header.getFloat32(4, true);
  if (count < 1 || count > 500000 || !(sigma > 0 && sigma < .05) || buffer.byteLength !== 8 + count * 28) {
    throw new Error('The orange cat surface has an invalid format.');
  }
  const centers = new Float32Array(buffer, 8, count * 3);
  const normals = new Float32Array(buffer, 8 + count * 12, count * 3);
  const colors = new Uint8Array(buffer, 8 + count * 24, count * 4);
  const height = Math.ceil(count / textureWidth);
  const rgba = new Uint8Array(textureWidth * height * 4);
  rgba.set(colors);
  return {
    centers, colors, count, height,
    centerTexture:packFloats(centers, count, height, sigma),
    normalTexture:packFloats(normals, count, height, 0),
    colorTexture:texture(rgba, height, THREE.UnsignedByteType),
  };
}

const vertexShader = /* glsl */ `
  uniform sampler2D centers;
  uniform sampler2D normals;
  uniform sampler2D colors;
  uniform sampler2D skinning;
  uniform mat4 joints[JOINTS];
  uniform vec2 viewport;
  in float orderIndex;
  out vec2 gaussianOffset;
  flat out vec4 linearColor;

  ${textileCoverage}

  vec3 fromSRGB(vec3 srgb) {
    return mix(srgb / 12.92, pow((srgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), srgb));
  }
  vec2 projectDirection(vec3 direction, vec2 center, float w) {
    vec4 d = projectionMatrix * vec4(direction, 0.);
    return (d.xy - center * d.w) / w;
  }
  void main() {
    int id = int(orderIndex);
    ivec2 pixel = ivec2(id % WIDTH, id / WIDTH);
    vec4 rest = texelFetch(centers, pixel, 0);
    vec3 n = normalize(texelFetch(normals, pixel, 0).xyz);
    vec4 color = texelFetch(colors, pixel, 0);
    vec4 weights = texelFetch(skinning, pixel, 0);
    int first = int(round(weights.x * 255.));
    int second = int(round(weights.y * 255.));
    mat4 transform = modelViewMatrix * (joints[0] * (1. - weights.z - weights.w)
      + joints[first] * weights.z + joints[second] * weights.w);
    vec4 viewPosition = transform * vec4(rest.xyz, 1.);
    vec4 clip = projectionMatrix * viewPosition;
    if (clip.w <= 0.0001 || clip.z < -clip.w) {
      gl_Position = vec4(2., 2., 2., 1.);
      gaussianOffset = vec2(3.);
      linearColor = vec4(0.);
      return;
    }

    vec3 u = normalize(cross(n, abs(n.y) < .95 ? vec3(0., 1., 0.) : vec3(1., 0., 0.)));
    vec3 v = cross(n, u);
    vec2 center = clip.xy / clip.w;
    mat3 orientation = mat3(transform);
    vec2 du = projectDirection(orientation * u * rest.w, center, clip.w);
    vec2 dv = projectDirection(orientation * v * rest.w, center, clip.w);
    vec2 dn = projectDirection(orientation * n * rest.w * .24, center, clip.w);

    // Project all three Gaussian axes, then factor the 2D covariance.
    vec3 x = vec3(du.x, dv.x, dn.x), y = vec3(du.y, dv.y, dn.y);
    vec2 pixelSigma = vec2(.42) / max(viewport, vec2(1.));
    float a = sqrt(dot(x, x) + pixelSigma.x * pixelSigma.x);
    float b = dot(x, y) / a;
    float c = sqrt(max(dot(y, y) + pixelSigma.y * pixelSigma.y - b * b, 1e-12));
    gaussianOffset = position.xy * 3.;
    clip.xy += vec2(a * gaussianOffset.x, b * gaussianOffset.x + c * gaussianOffset.y) * clip.w;
    gl_Position = clip;
    // The opaque surface covers the inside. Soften points seen from behind
    // the shell while keeping the fuzzy edge visible at grazing angles.
    float facing = dot(normalize(orientation * n), normalize(-viewPosition.xyz));
    float visibility = mix(.31, 1., smoothstep(-.48, .12, facing));
    vec3 surfaceColor = fromSRGB(color.rgb);
    float textile = step(.998,color.a) * max(avatarWovenVest(rest.xyz,surfaceColor),avatarShirt(rest.xyz,surfaceColor));
    linearColor = vec4(surfaceColor, visibility * (1.-.55 * textile));
  }
`;

const fragmentShader = /* glsl */ `
  in vec2 gaussianOffset;
  flat in vec4 linearColor;
  out vec4 splatColor;
  #define gl_FragColor splatColor
  void main() {
    float distanceSquared = dot(gaussianOffset, gaussianOffset);
    if (distanceSquared > 9.) discard;
    float opacity = .98 * linearColor.a * exp(-.5 * distanceSquared);
    if (opacity < .006) discard;
    gl_FragColor = vec4(linearColor.rgb, opacity);
    #include <colorspace_fragment>
  }
`;

function depthOrder(asset, skin, joints, indices) {
  const {centers, count} = asset;
  const counts = new Uint32Array(depthBins);
  const bins = new Uint16Array(count);
  const coefficients = new Float32Array(joints.length * 4);
  const modelView = new THREE.Matrix4();
  const previous = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let sortedAt = -Infinity;
  return (camera, object) => {
    const now = performance.now();
    if (now - sortedAt < 72) return;
    const e = modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld).elements;
    direction.set(e[2], e[6], e[10]).normalize();
    if (now - sortedAt < 125 && previous.dot(direction) > .9998) return;
    sortedAt = now;
    previous.copy(direction);
    for (let joint = 0; joint < joints.length; joint++) {
      const m = joints[joint].elements, k = joint * 4;
      for (let column = 0; column < 4; column++) {
        const j = column * 4;
        coefficients[k + column] = direction.x * m[j] + direction.y * m[j + 1] + direction.z * m[j + 2];
      }
    }
    counts.fill(0);
    for (let index = 0; index < count; index++) {
      const i = index * 3, j = index * 4;
      const x = centers[i], y = centers[i + 1], z = centers[i + 2];
      const a = skin[j] * 4, b = skin[j + 1] * 4;
      const base = direction.x * x + direction.y * y + direction.z * z;
      let depth = base - direction.y * .5;
      if (skin[j + 2]) {
        const first = coefficients[a] * x + coefficients[a + 1] * y + coefficients[a + 2] * z + coefficients[a + 3];
        depth += (first - base) * (skin[j + 2] / 255);
      }
      if (skin[j + 3]) {
        const second = coefficients[b] * x + coefficients[b + 1] * y + coefficients[b + 2] * z + coefficients[b + 3];
        depth += (second - base) * (skin[j + 3] / 255);
      }
      const bin = Math.max(0, Math.min(depthBins - 1, ((depth + 1.1) * (depthBins / 2.2)) | 0));
      bins[index] = bin;
      counts[bin]++;
    }
    let offset = 0;
    for (let bin = 0; bin < depthBins; bin++) {
      const size = counts[bin];
      counts[bin] = offset;
      offset += size;
    }
    for (let index = 0; index < count; index++) indices.array[counts[bins[index]]++] = index;
    indices.needsUpdate = true;
  };
}

export async function createGaussianSurface(joints, bindVertex) {
  assetPromise ??= readAsset().catch(error => {
    assetPromise = null;
    throw error;
  });
  const asset = await assetPromise;
  const skin = new Uint8Array(textureWidth * asset.height * 4);
  const order = new Float32Array(asset.count);
  for (let index = 0; index < asset.count; index++) {
    const from = index * 3;
    bindVertex(asset.centers[from], asset.centers[from + 1], asset.centers[from + 2], asset.colors[index * 4 + 3], skin, index * 4);
    order[index] = index;
  }
  const skinTexture = texture(skin, asset.height, THREE.UnsignedByteType);
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  const indices = new THREE.InstancedBufferAttribute(order, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('orderIndex', indices);
  geometry.instanceCount = asset.count;

  const viewport = new THREE.Vector2(1, 1);
  const viewportRect = new THREE.Vector4();
  const material = new THREE.ShaderMaterial({
    glslVersion:THREE.GLSL3, defines:{JOINTS:joints.length, WIDTH:textureWidth},
    transparent:true, depthWrite:false, toneMapped:false, vertexShader, fragmentShader,
    uniforms:{
      centers:{value:asset.centerTexture}, normals:{value:asset.normalTexture},
      colors:{value:asset.colorTexture}, skinning:{value:skinTexture}, joints:{value:joints},
      viewport:{value:viewport},
    },
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'Skinned anisotropic Gaussian surface';
  surface.frustumCulled = false;
  const sort = depthOrder(asset, skin, joints, indices);
  surface.onBeforeRender = (renderer, scene, camera) => {
    const rect = camera.viewport || renderer.getCurrentViewport(viewportRect);
    viewport.set(rect.z, rect.w);
    sort(camera, surface);
  };
  const groom = createStudentGroom(asset,skinTexture,joints,textureWidth);
  const object = new THREE.Group();
  object.name = 'Orange cat coat and whiskers';
  object.add(surface,...groom);
  return {
    object, count:asset.count,
    dispose() {
      for (const mesh of object.children) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      skinTexture.dispose();
    },
  };
}
