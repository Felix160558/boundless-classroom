import * as THREE from './three.module.min.js';
import {teacherSleeveColorShader} from './cat-teacher-sleeve.js?v=teacher-detail-52';

const source = new URL('./teacher-cat-splats.bin?v=teacher-detail-52', import.meta.url);
const stride = 20, headerSize = 36;
const layerKinds = ['surface', 'coat', 'undercoat'];
const identity = new THREE.Matrix4();
let assetPromise;

async function readAsset() {
  const response = await fetch(source, {credentials:'same-origin'});
  if (!response.ok) throw new Error('The teacher Gaussian surface could not load.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < headerSize) throw new Error('The teacher Gaussian surface is incomplete.');
  const data = new DataView(buffer);
  const counts = [12, 16, 20, 24, 28, 32].map(offset => data.getUint32(offset, true));
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (data.getUint32(0, true) !== 0x32475442 || total > 265000 || counts.includes(0)
      || buffer.byteLength !== headerSize + total * stride) {
    throw new Error('The teacher Gaussian data does not match this version.');
  }
  return {data, counts, bodyVertices:data.getUint32(4, true), faceVertices:data.getUint32(8, true)};
}

const vertexShader = /* glsl */ `
attribute vec3 gaussianRoot;
attribute vec3 gaussianNormal;
attribute vec2 gaussianRadius;
attribute vec2 atlasUV;
attribute float headWeight;
#ifdef REPAIRED_SLEEVE
  attribute float sleeveRepair;
  ${teacherSleeveColorShader}
#endif
#ifdef REPAIRED_FACE
  attribute vec4 faceRepair;
#endif
uniform mat4 headPose;
uniform sampler2D atlas;
uniform vec2 viewport;
varying vec2 vOffset;
varying vec4 vColor;

vec2 projectAxis(vec3 axis, vec2 center, float w) {
  vec4 d = projectionMatrix * vec4(axis, 0.);
  return (d.xy - center * d.w) / w;
}

void rejectSplat() {
  gl_Position = vec4(2., 2., 2., 1.);
  vOffset = vec2(3.);
  vColor = vec4(0.);
}

void main() {
  vec3 n = normalize(gaussianNormal);
  vec3 direction = vec3(gaussianRoot.x * 3., -1., .06);
  #ifdef COAT
    if (gaussianRoot.y > .171 && gaussianRoot.z < .055) direction.y = .82;
    #ifndef FACE
      if (gaussianRoot.z < -.025 && gaussianRoot.x > .026) direction = vec3(.52, .75, -.1);
    #endif
    vec3 tangency = direction - n * dot(direction, n);
    vec3 fallback = cross(n, abs(n.y) < .95 ? vec3(0., 1., 0.) : vec3(1., 0., 0.));
    vec3 flow = normalize(dot(tangency, tangency) > 1e-5 ? tangency : fallback);
    vec3 a = normalize(n * .61 + flow * .79);
    vec3 b = normalize(cross(n, flow));
    vec3 c = cross(a, b);
    vec3 p = gaussianRoot + a * gaussianRadius.x * .42;
    vec3 extents = vec3(gaussianRadius.x * .40, gaussianRadius.y * .97, gaussianRadius.y * 1.18);
  #else
    vec3 a = normalize(cross(n, abs(n.y) < .95 ? vec3(0., 1., 0.) : vec3(1., 0., 0.)));
    vec3 b = cross(n, a);
    vec3 c = n;
    vec3 p = gaussianRoot + n * .000075;
    vec3 extents = vec3(gaussianRadius, gaussianRadius.y * .20);
  #endif

  mat3 orientation = mat3(modelViewMatrix) * (mat3(1.) * (1. - headWeight) + mat3(headPose) * headWeight);
  p = mix(p, (headPose * vec4(p, 1.)).xyz, headWeight);
  vec4 view = modelViewMatrix * vec4(p, 1.);
  vec4 clip = projectionMatrix * view;
  if (clip.w <= .0001 || clip.z < -clip.w) {
    rejectSplat();
    return;
  }
  #ifdef COAT
    float distance = length(view.xyz) / max(length(modelViewMatrix[0].xyz), .0001);
    #ifdef UNDERCOAT
      float proximity = 1. - smoothstep(1.55, 3.05, distance);
    #else
      float proximity = 1. - smoothstep(1.2, 3.30, distance);
    #endif
    if (proximity < .005) {
      rejectSplat();
      return;
    }
  #endif
  vec2 center = clip.xy / clip.w;
  vec2 u = projectAxis(orientation * a * extents.x, center, clip.w);
  vec2 v = projectAxis(orientation * b * extents.y, center, clip.w);
  vec2 w = projectAxis(orientation * c * extents.z, center, clip.w);
  // Factor the projected covariance of the three-dimensional ellipsoid.
  vec3 x = vec3(u.x, v.x, w.x), y = vec3(u.y, v.y, w.y);
  // A screen-space footprint smooths near-pixel hair without amplifying it.
  vec2 pixel = vec2(.58) / max(viewport, vec2(1.));
  float xx = dot(x, x);
  float xy = dot(x, y);
  float yy = dot(y, y);
  float scaleX = sqrt(xx + pixel.x * pixel.x);
  float shear = xy / scaleX;
  float scaleY = sqrt(max(yy + pixel.y * pixel.y - shear * shear, 1e-12));
  float energy = sqrt(max(xx * yy - xy * xy, 0.)) / (scaleX * scaleY);
  vOffset = position.xy * 3.;
  clip.xy += vec2(scaleX * vOffset.x, shear * vOffset.x + scaleY * vOffset.y) * clip.w;
  gl_Position = clip;

  float facing = dot(normalize(orientation * n), normalize(-view.xyz));
  vec3 color = texture2D(atlas, atlasUV).rgb;
  #ifdef REPAIRED_SLEEVE
    color = repairTeacherSleeveColor(color, sleeveRepair);
  #endif
  #ifdef REPAIRED_FACE
    color = color * (1. - faceRepair.a) + faceRepair.rgb;
  #endif
  #ifdef COAT
    float fiberTone = mix(.977, 1.045, fract(dot(atlasUV, vec2(928.1, 312.7))));
    float opacity = mix(.13, .66, smoothstep(-.36, .16, facing)) * proximity;
    #ifdef UNDERCOAT
      opacity *= .74;
    #endif
    #ifdef REPAIRED_SLEEVE
      opacity *= 1. - clamp(sleeveRepair, 0., 1.);
    #endif
    vColor = vec4(color * fiberTone, opacity * mix(.56, 1., energy));
  #else
    vColor = vec4(color, .61 * smoothstep(-.18, .36, facing) * mix(.68, 1., energy));
  #endif
}`;

const fragmentShader = /* glsl */ `
varying vec2 vOffset;
varying vec4 vColor;
void main() {
  float r2 = dot(vOffset, vOffset);
  float alpha = vColor.a * exp(-.5 * r2);
  if (r2 > 9. || alpha < .013) discard;
  gl_FragColor = vec4(vColor.rgb, alpha);
  #include <colorspace_fragment>
}`;

function animatedVertices(mesh, face) {
  const {geometry, userData} = mesh;
  if (!face) return [userData.tailVertexSet, userData.teacherArmVertexSet, userData.teacherBreathVertexSet]
    .filter(Boolean);
  const ids = new Set();
  for (const morph of geometry.morphAttributes.position ?? []) {
    for (let index = 0; index < morph.count; index++) {
      if (Math.abs(morph.getX(index)) + Math.abs(morph.getY(index)) + Math.abs(morph.getZ(index)) > 1e-8) ids.add(index);
    }
  }
  return [ids];
}

function appendLayer(mesh, data, offset, count, face, kind, moved, vertexCount) {
  const rest = mesh.geometry.attributes;
  const sleeveRepair = !face && rest.teacherSleeveRepair;
  const sleeveBlend = sleeveRepair ? new Float32Array(count) : null;
  const framePaint = face && rest.teacherFrameRepair?.array;
  const faceBlend = framePaint ? new Float32Array(count * 4) : null;
  const normalBuffer = new Float32Array(count * 3), rootBuffer = new Float32Array(count * 3);
  const uvBuffer = new Float32Array(count * 2), radius = new Float32Array(count * 2);
  const headWeight = new Float32Array(count);
  const indices = new Uint32Array(count * 3), barycentric = new Float32Array(count * 3);
  const dynamic = [], fixed = [];
  for (let i = 0; i < count; i++) {
    const at = offset + i * stride;
    const a = data.getUint32(at, true), b = data.getUint32(at + 4, true), c = data.getUint32(at + 8, true);
    if (Math.max(a, b, c) >= vertexCount) throw new Error('A teacher Gaussian anchor is outside the source mesh.');
    (moved.some(set => set.has(a) || set.has(b) || set.has(c)) ? dynamic : fixed).push(at);
  }
  // Animated samples occupy the first contiguous range. Subsequent uploads do
  // not resend the fixed garment and facial regions.
  const ordered = dynamic.concat(fixed);
  const moving = dynamic.length;
  const normal = new THREE.Vector3();

  function interpolate(attribute, index) {
    const k = index * 3, a = indices[k], b = indices[k + 1], c = indices[k + 2];
    const u = barycentric[k], v = barycentric[k + 1], w = barycentric[k + 2];
    return normal.set(
      attribute.getX(a) * u + attribute.getX(b) * v + attribute.getX(c) * w,
      attribute.getY(a) * u + attribute.getY(b) * v + attribute.getY(c) * w,
      attribute.getZ(a) * u + attribute.getZ(b) * v + attribute.getZ(c) * w,
    );
  }

  for (let i = 0; i < count; i++) {
    const at = ordered[i], k = i * 3;
    const a = data.getUint32(at, true), b = data.getUint32(at + 4, true), c = data.getUint32(at + 8, true);
    const u = data.getUint16(at + 12, true) / 65535, v = data.getUint16(at + 14, true) / 65535, w = 1 - u - v;
    indices[k] = a; indices[k + 1] = b; indices[k + 2] = c;
    barycentric[k] = u; barycentric[k + 1] = v; barycentric[k + 2] = w;
    interpolate(rest.position, i).toArray(rootBuffer, k);
    interpolate(rest.normal, i).normalize().toArray(normalBuffer, k);
    uvBuffer[i * 2] = rest.uv.getX(a) * u + rest.uv.getX(b) * v + rest.uv.getX(c) * w;
    uvBuffer[i * 2 + 1] = rest.uv.getY(a) * u + rest.uv.getY(b) * v + rest.uv.getY(c) * w;
    radius[i * 2] = data.getUint16(at + 16, true) / 1e6;
    radius[i * 2 + 1] = data.getUint16(at + 18, true) / 1e6;
    if (face && rest.skinWeight) headWeight[i] = rest.skinWeight.getY(a) * u + rest.skinWeight.getY(b) * v + rest.skinWeight.getY(c) * w;
    if (sleeveBlend) sleeveBlend[i] = sleeveRepair.getX(a) * u + sleeveRepair.getX(b) * v + sleeveRepair.getX(c) * w;
    if (faceBlend) {
      for (let channel = 0; channel < 4; channel++) {
        faceBlend[i * 4 + channel] = framePaint[a * 4 + channel] * u
          + framePaint[b * 4 + channel] * v + framePaint[c * 4 + channel] * w;
      }
    }
  }

  const geometry = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(2, 2);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  geometry.instanceCount = count;
  // Template quads are units of sigma, not world-space geometry. These bounds
  // keep the existing model hit envelope tied to the actual rested surface.
  geometry.boundingBox = new THREE.Box3().setFromArray(rootBuffer).expandByScalar(.006);
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const root = new THREE.InstancedBufferAttribute(rootBuffer, 3).setUsage(THREE.DynamicDrawUsage);
  const direction = new THREE.InstancedBufferAttribute(normalBuffer, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('gaussianRoot', root);
  geometry.setAttribute('gaussianNormal', direction);
  geometry.setAttribute('gaussianRadius', new THREE.InstancedBufferAttribute(radius, 2));
  geometry.setAttribute('atlasUV', new THREE.InstancedBufferAttribute(uvBuffer, 2));
  geometry.setAttribute('headWeight', new THREE.InstancedBufferAttribute(headWeight, 1));
  if (sleeveBlend) geometry.setAttribute('sleeveRepair', new THREE.InstancedBufferAttribute(sleeveBlend, 1));
  if (faceBlend) geometry.setAttribute('faceRepair', new THREE.InstancedBufferAttribute(faceBlend, 4));

  const surface = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const viewport = new THREE.Vector2(1, 1), rectangle = new THREE.Vector4();
  const coat = kind !== 'surface';
  const material = new THREE.ShaderMaterial({
    defines:{
      ...(face ? {FACE:1} : {}),
      ...(coat ? {COAT:1} : {}),
      ...(kind === 'undercoat' ? {UNDERCOAT:1} : {}),
      ...(sleeveBlend ? {REPAIRED_SLEEVE:1} : {}),
      ...(faceBlend ? {REPAIRED_FACE:1} : {}),
    },
    transparent:true, depthWrite:false, toneMapped:false, vertexShader, fragmentShader,
    uniforms:{atlas:{value:surface.map}, viewport:{value:viewport}, headPose:{value:mesh.userData.headPoseMatrix ?? identity}},
  });
  const object = new THREE.Mesh(geometry, material);
  object.name = {
    surface:'Anisotropic Gaussian surface',
    coat:'Anisotropic Gaussian fur coat',
    undercoat:'Anisotropic Gaussian fine undercoat',
  }[kind];
  object.userData.teacherDetail = true;
  object.frustumCulled = false;
  object.renderOrder = 2 + layerKinds.indexOf(kind);
  object.onBeforeRender = (renderer, _scene, camera) => {
    const rect = camera.viewport ?? renderer.getCurrentViewport(rectangle);
    viewport.set(rect.z, rect.w);
  };

  const position = new THREE.Vector3();
  let previousVersion = -1, previousNormals = -1, previousWeights = [];
  function dirty(attribute) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, moving * 3);
    attribute.needsUpdate = true;
  }
  return {
    object,
    update() {
      if (!moving) return;
      const {geometry, morphTargetInfluences:weights = []} = mesh;
      const attributes = geometry.attributes;
      const motion = attributes.position.version !== previousVersion;
      const normals = attributes.normal.version !== previousNormals;
      const morph = weights.some((weight, index) => Math.abs(weight - (previousWeights[index] ?? 0)) > 1e-5);
      if (!motion && !normals && !morph) return;
      const targets = geometry.morphAttributes.position ?? [];
      for (let i = 0; i < moving; i++) {
        position.copy(interpolate(attributes.position, i));
        for (let k = 0; k < targets.length; k++) if (weights[k]) position.addScaledVector(interpolate(targets[k], i), weights[k]);
        position.toArray(rootBuffer, i * 3);
        if (normals) interpolate(attributes.normal, i).normalize().toArray(normalBuffer, i * 3);
      }
      previousVersion = attributes.position.version;
      previousNormals = attributes.normal.version;
      previousWeights = weights.slice();
      dirty(root);
      if (normals) dirty(direction);
    },
    dispose() {
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

export async function attachTeacherGaussians({body, face}) {
  assetPromise ??= readAsset().catch(error => { assetPromise = null; throw error; });
  const {data, counts, bodyVertices, faceVertices} = await assetPromise;
  if (body.geometry.attributes.position.count !== bodyVertices || face.geometry.attributes.position.count < faceVertices) {
    throw new Error('The teacher Gaussian asset requires the original vertex identities.');
  }
  const layers = [];
  let offset = headerSize;
  try {
    for (const [mesh, isFace, vertices, start] of [[body, false, bodyVertices, 0], [face, true, faceVertices, layerKinds.length]]) {
      const moved = animatedVertices(mesh, isFace);
      for (let index = 0; index < layerKinds.length; index++) {
        const count = counts[start + index];
        const layer = appendLayer(mesh, data, offset, count, isFace, layerKinds[index], moved, vertices);
        mesh.add(layer.object);
        layers.push(layer);
        offset += count * stride;
      }
    }
  } catch (error) {
    for (const layer of layers) layer.dispose();
    throw error;
  }
  return {
    update() { for (const layer of layers) layer.update(); },
    dispose() { for (const layer of layers) layer.dispose(); },
  };
}
