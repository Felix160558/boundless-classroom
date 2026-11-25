import * as THREE from '../three.module.min.js';
import {deformableMaterial} from './student-skin.js?v=first-person-cat-55';

// Rest-pose sections around the model's neck. Each section has a lower and
// upper edge, with radii measured at the lower edge, middle, and upper edge.
// The opening between the first and last sections leaves the tie exposed.
const neck = [
  [.350, .509, .559, .141, .136, .122],
  [.500, .514, .561, .139, .133, .121],
  [.650, .521, .560, .134, .129, .123],
  [.785, .524, .559, .131, .127, .124],
  [1.178, .527, .556, .127, .122, .121],
  [1.571, .531, .553, .123, .118, .118],
  [1.963, .526, .549, .123, .119, .118],
  [2.356, .519, .546, .117, .115, .116],
  [2.749, .519, .546, .111, .111, .115],
  [3.142, .519, .547, .109, .112, .118],
  [3.534, .519, .547, .113, .115, .120],
  [3.927, .522, .547, .124, .121, .123],
  [4.320, .525, .548, .132, .129, .129],
  [4.712, .532, .552, .133, .127, .127],
  [5.105, .532, .557, .133, .130, .130],
  [5.498, .525, .559, .136, .132, .130],
  [5.633, .522, .559, .137, .134, .129],
  [5.783, .516, .560, .142, .136, .131],
  [5.933, .512, .560, .141, .137, .136],
];

// Closed cross section. The shallow step after the rounded lower lip reads
// as a turned cloth edge, while the upper return stays tucked into the neck.
const fold = [
  [0, -.0032, .92], [.015, .0008, .96], [.055, .0036, .99],
  [.11, .0050, 1], [.16, .0049, .99], [.22, .0034, .94],
  [.27, .0030, .97], [.35, .0034, .99], [.60, .0036, 1],
  [.82, .0034, 1.01], [.94, .0029, 1.01], [1, .0011, 1],
  [1.02, -.0013, .97], [.99, -.0054, .92], [.06, -.0063, .91],
];

function collarGeometry(bindVertex) {
  const positions = [], colors = [], indices = [];
  const cream = new THREE.Color(0xf3ebe5);
  const sectionSize = fold.length;
  const steps = 6;
  const sectionCount = (neck.length - 1) * steps + 1;
  const binding = new Uint8Array((sectionCount * sectionSize + 2) * 4);

  for (let index = 0; index < sectionCount; index++) {
    const left = Math.min(Math.floor(index / steps), neck.length - 2);
    const amount = index / steps - left;
    const [angle, bottom, top, low, middle, high] = neck[left].map(
      (value, component) => THREE.MathUtils.lerp(value, neck[left + 1][component], amount),
    );
    const xAxis = Math.sin(angle), zAxis = Math.cos(angle);
    const shape = middle - (low + high) / 2;
    // A slight softening at the two front tips helps the folded collar end
    // naturally beside the knot instead of looking like a cut tube.
    const lip = THREE.MathUtils.smoothstep(Math.min(index, sectionCount - 1 - index), 0, steps);
    for (const [height, offset, shade] of fold) {
      const radius = THREE.MathUtils.lerp(low, high, height) + 4 * height * (1 - height) * shape;
      const restRadius = radius + offset * (.54 + .46 * lip);
      const x = xAxis * restRadius, z = zAxis * restRadius - .040;
      const y = THREE.MathUtils.lerp(bottom, top, height);
      bindVertex(x, y, z, 255, binding, (positions.length / 3) * 4);
      positions.push(x, y, z);
      const light = shade * (.981 + .019 * Math.cos(angle));
      colors.push(cream.r * light, cream.g * light, cream.b * light);
    }
    if (index === 0) continue;
    for (let row = 0; row < sectionSize; row++) {
      const a = (index - 1) * sectionSize + row;
      const b = (index - 1) * sectionSize + (row + 1) % sectionSize;
      indices.push(a, a + sectionSize, b, b, a + sectionSize, b + sectionSize);
    }
  }

  // Close each tip so the inner fabric can also be seen from the side.
  for (const start of [0, (sectionCount - 1) * sectionSize]) {
    const center = new THREE.Vector3();
    for (let row = 0; row < sectionSize; row++) {
      center.x += positions[(start + row) * 3];
      center.y += positions[(start + row) * 3 + 1];
      center.z += positions[(start + row) * 3 + 2];
    }
    center.divideScalar(sectionSize);
    const i = positions.length / 3;
    bindVertex(center.x, center.y, center.z, 255, binding, i * 4);
    positions.push(center.x, center.y, center.z);
    colors.push(cream.r * .96, cream.g * .96, cream.b * .96);
    for (let row = 0; row < sectionSize; row++) {
      indices.push(i, start + row, start + (row + 1) % sectionSize);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('avatarBinding', new THREE.BufferAttribute(binding, 4, true));
  geometry.computeVertexNormals();
  return geometry;
}

export function createStudentCollar({joints, bindVertex}) {
  const collar = new THREE.Group();
  collar.name = 'Folded white shirt collar';
  const material = deformableMaterial({
    map: null, color: new THREE.Color(0xffffff), vertexColors: true, side: THREE.DoubleSide,
  }, joints);
  const cloth = new THREE.Mesh(collarGeometry(bindVertex), material);
  cloth.frustumCulled = false;
  collar.add(cloth);
  return collar;
}
