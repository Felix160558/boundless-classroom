import * as THREE from './three.module.min.js';
import {frameRepair} from './cat-teacher-frame-data.js?v=teacher-gaussian-51';
import {faceRepair} from './cat-teacher-face-data.js?v=teacher-face-53';

function finishFace(face) {
  const geometry = face.geometry;
  const position = geometry.attributes.position;
  const repair = Uint8Array.from(atob(frameRepair), character => character.charCodeAt(0));
  const records = new DataView(repair.buffer);
  const color = new THREE.Color();
  const paint = new Float32Array(position.count * 4);
  for (let offset = 0; offset < records.byteLength; offset += 8) {
    const index = records.getUint16(offset, true);
    if (index >= position.count) continue;
    const depth = records.getInt16(offset + 2, true) / 1e6;
    position.setZ(index, position.getZ(index) + depth);

    const weight = repair[offset + 7] / 255;
    color.setRGB(repair[offset + 4] / 255, repair[offset + 5] / 255,
      repair[offset + 6] / 255, THREE.SRGBColorSpace);
    // Store premultiplied color so triangles fading into the original atlas
    // have a continuous fringe even when only one vertex has a repair value.
    paint.set([color.r * weight, color.g * weight, color.b * weight, weight], index * 4);
  }
  const detail = Uint8Array.from(atob(faceRepair), character => character.charCodeAt(0));
  const patches = new DataView(detail.buffer);
  for (let offset = 0; offset < patches.byteLength; offset += 6) {
    const index = patches.getUint16(offset, true);
    if (index >= position.count) continue;
    const weight = detail[offset + 5] / 255;
    const keep = 1 - weight;
    const start = index * 4;
    color.setRGB(detail[offset + 2] / 255, detail[offset + 3] / 255,
      detail[offset + 4] / 255, THREE.SRGBColorSpace);
    // Add the localized paint over the existing repair in linear light.
    paint[start] = paint[start] * keep + color.r * weight;
    paint[start + 1] = paint[start + 1] * keep + color.g * weight;
    paint[start + 2] = paint[start + 2] * keep + color.b * weight;
    paint[start + 3] = paint[start + 3] * keep + weight;
  }
  position.needsUpdate = true;
  geometry.setAttribute('teacherFrameRepair', new THREE.BufferAttribute(paint, 4));
  const material = face.material.clone();
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 teacherFrameRepair;
        varying vec4 vTeacherFrameRepair;
        varying vec3 vTeacherFacePosition;
      `)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTeacherFrameRepair = teacherFrameRepair;
        vTeacherFacePosition = position;
      `);
    // Roll off only the brightest texels within the two existing pupil glints.
    // Sampling the original pigment here preserves the shape of the reflection.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vTeacherFrameRepair;
        varying vec3 vTeacherFacePosition;
        float catchlightMask(vec3 center, vec3 radii) {
          return 1. - smoothstep(.55, 1., length((vTeacherFacePosition - center) / radii));
        }
      `)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = diffuseColor.rgb * (1. - vTeacherFrameRepair.a) + vTeacherFrameRepair.rgb;
        float leftGlint = catchlightMask(vec3(-.0429, .1278, .0879), vec3(.0057, .0052, .0043));
        float rightGlint = catchlightMask(vec3(.0198, .1268, .0917), vec3(.0047, .0041, .0044));
        float eyeLight = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
        diffuseColor.rgb *= 1. - .24 * max(leftGlint, rightGlint) * smoothstep(.46, .89, eyeLight);
      `);
  };
  material.customProgramCacheKey = () => 'teacher-face-repair';
  face.material = material;
}

class SpectacleRim extends THREE.Curve {
  constructor(center, radii, depthSlope) {
    super();
    this.center = center;
    this.radii = radii;
    this.depthSlope = depthSlope;
  }

  getPoint(time, point = new THREE.Vector3()) {
    const angle = time * Math.PI * 2;
    const x = Math.cos(angle) * this.radii[0];
    const y = Math.sin(angle) * this.radii[1];
    return point.set(this.center[0] + x, this.center[1] + y,
      this.center[2] + this.depthSlope[0] * x + this.depthSlope[1] * y);
  }
}

function makeSpectacles() {
  const frame = new THREE.Group();
  frame.name = 'Teacher espresso round spectacles';
  const material = new THREE.MeshBasicMaterial({vertexColors:true, toneMapped:false});
  const espresso = new THREE.Color(0x51382e);
  const softLight = new THREE.Vector3(-.38, .78, .50).normalize();
  const normal = new THREE.Vector3();

  function tube(curve, radius, steps, closed = false) {
    const geometry = new THREE.TubeGeometry(curve, steps, radius, 12, closed);
    const normals = geometry.attributes.normal;
    const colors = new Float32Array(normals.count * 3);
    for (let vertex = 0; vertex < normals.count; vertex++) {
      normal.fromBufferAttribute(normals, vertex);
      const shade = .84 + .29 * Math.max(0, normal.dot(softLight));
      colors.set([espresso.r * shade, espresso.g * shade, espresso.b * shade], vertex * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    frame.add(new THREE.Mesh(geometry, material));
  }

  const left = new SpectacleRim([-.0445,.1254,.1072], [.0256,.0258], [.120,-.162]);
  const right = new SpectacleRim([.0356,.1254,.1079], [.0269,.0256], [-.112,-.158]);
  tube(left,.00158,96,true);
  tube(right,.00158,96,true);

  const point = (x,y,z) => new THREE.Vector3(x,y,z);
  tube(new THREE.CatmullRomCurve3([
    left.getPoint(.024), point(-.0108,.1319,.1129),
    point(.0005,.1321,.1131), right.getPoint(.477),
  ]), .00129, 32);
  tube(new THREE.CatmullRomCurve3([
    left.getPoint(.469), point(-.076,.1286,.092), point(-.083,.1258,.067),
    point(-.096,.1203,.049), point(-.108,.1140,.034), point(-.112,.1115,.015),
  ]), .00127, 44);
  tube(new THREE.CatmullRomCurve3([
    right.getPoint(.028), point(.073,.1286,.094), point(.082,.1242,.073),
    point(.092,.1193,.049), point(.104,.1155,.032), point(.109,.1115,.016),
  ]), .00127, 44);
  return frame;
}

// Collar tips follow the drape of each white atlas panel beside the tie.
// The attached book sits in front of the right tip at its lower edge.
const panels = [
  {
    upper:[[-.070,.331,.058],[-.055,.332,.073],[-.036,.332,.084],[-.023,.3288,.087]],
    lower:[[-.070,.330,.059],[-.055,.319,.068],[-.034,.305,.073],[-.013,.296,.094]],
  },
  {
    upper:[[.068,.331,.052],[.055,.332,.068],[.039,.331,.082],[.022,.328,.085]],
    lower:[[.068,.330,.053],[.054,.318,.069],[.037,.308,.087],[.020,.299,.092]],
  },
];
const foldedEdge = [
  [0, -.0018, .91], [0, .0010, .98], [.10, .0018, 1.01],
  [.40, .0020, 1.015], [.72, .0020, 1.0], [.88, .0029, 1.0],
  [.96, .0025, .98], [1, .0015, .95], [1.02, .0002, .91],
  [1.02, -.0014, .88], [.96, -.0023, .92], [.05, -.0023, .93],
];

function makeCollar() {
  const collar = new THREE.Group();
  collar.name = 'Teacher folded ivory shirt collar';
  const material = new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.DoubleSide, toneMapped:false});
  const ivory = new THREE.Color(0xefe4dd);
  const point = new THREE.Vector3();
  for (const panel of panels) {
    const top = new THREE.CatmullRomCurve3(panel.upper.map(values => new THREE.Vector3(...values)));
    const hem = new THREE.CatmullRomCurve3(panel.lower.map(values => new THREE.Vector3(...values)));
    const positions = [], colors = [], indices = [];
    const steps = 32;
    const rows = foldedEdge.length;
    for (let step = 0; step <= steps; step++) {
      const amount = step / steps;
      const a = top.getPoint(amount), b = hem.getPoint(amount);
      const thickness = THREE.MathUtils.lerp(.3,1,THREE.MathUtils.smoothstep(amount,0,.23));
      for (let row = 0; row < rows; row++) {
        const [progress, offset, shade] = foldedEdge[row];
        point.copy(a).lerp(b, progress);
        point.z += offset * thickness;
        positions.push(point.x, point.y, point.z);
        const light = shade * (.971 + .029 * Math.sin(amount * Math.PI / 2));
        colors.push(ivory.r * light, ivory.g * light, ivory.b * light);
        if (!step) continue;
        const current = step * rows + row;
        const next = step * rows + (row + 1) % rows;
        indices.push(current - rows, current, next - rows, current, next, next - rows);
      }
    }
    for (const offset of [0, steps * rows]) {
      for (let row = 1; row < rows - 1; row++) indices.push(offset, offset + row, offset + row + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    collar.add(new THREE.Mesh(geometry, material));
  }
  return collar;
}

export function attachTeacherAccessories({face, body, headAttachments}) {
  finishFace(face);
  headAttachments.add(makeSpectacles());
  body.add(makeCollar());
}
