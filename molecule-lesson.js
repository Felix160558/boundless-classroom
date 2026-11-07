import * as THREE from './three.module.min.js';

// Reused from ChemBoard's local SDFs, retaining original coordinates below:
// public/molecules/H2O.sdf (PubChem CID 962), CO2.sdf (PubChem CID 280).
// A rigid basis change makes water's molecular plane readable on entry, then
// a small educational idealization opens its stored ~103.98° angle to 104.5°.
// Each original O–H length is preserved; ChemBoard's source SDF is untouched.
// Arrow lengths are qualitative teaching graphics, not calculated dipole values.
export const MOLECULE_STRUCTURES = Object.freeze({
  H2O: { atoms: [['O', 0, 0, 0], ['H', .2774, .8929, .2544], ['H', .6068, -.2383, -.7169]], bonds: [[0, 1, 1], [0, 2, 1]], angle: '≈104.5°', source: 'PubChem CID 962 · ChemBoard H2O.sdf' },
  CO2: { atoms: [['O', -1.197, 0, 0], ['O', 1.197, 0, 0], ['C', 0, 0, 0]], bonds: [[0, 2, 2], [1, 2, 2]], angle: '180°', source: 'PubChem CID 280 · ChemBoard CO2.sdf' }
});

export function createMoleculeLesson(parent) {
  const group = new THREE.Group(); group.name = 'ChemBoard molecular comparison'; parent.add(group);
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const objects = [], hitObjects = [], resources = new Set(), layers = [];
  let step = null, yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0, lastTime = 0;
  const up = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const palette = { O: 0xb9665f, H: 0xf1eee4, C: 0x68737b, bond: 0xbcc8cc, dipole: 0xa2d0c9, net: 0xe9c993 };

  function layer(parentObject, fromStep = 0) {
    const node = new THREE.Group(); parentObject.add(node);
    const state = { node, materials: [], opacity: 0, fromStep };
    layers.push(state); return state;
  }
  function material(color, state, basic = false) {
    const mat = basic ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, toneMapped: false }) :
      new THREE.MeshStandardMaterial({ color, roughness: .36, metalness: .04, transparent: true, opacity: 0 });
    state.materials.push(mat); resources.add(mat); return mat;
  }
  function addMesh(geometry, mat, state, position) {
    resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat); if (position) mesh.position.copy(position);
    state.node.add(mesh); return mesh;
  }
  function rod(a, b, radius, mat, state) {
    const delta = b.clone().sub(a), length = delta.length();
    if (length < .00001) return;
    const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, length, 20), mat, state, a.clone().add(b).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(up, delta.normalize()); return mesh;
  }
  function label(text, x, y, width, state, color = '#eee9dd', height = .22) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 144;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 768, 144);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 68px Arial, sans-serif';
    // A narrow dark halo keeps text legible against the pale physical board.
    ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(8,14,20,.85)'; ctx.strokeText(text, 384, 72);
    ctx.fillStyle = color; ctx.fillText(text, 384, 72);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; resources.add(texture);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    resources.add(mat); state.materials.push(mat);
    const sprite = new THREE.Sprite(mat); sprite.position.set(x, y, .09); sprite.scale.set(width, height, 1); state.node.add(sprite); return sprite;
  }
  function arrow(start, end, state, color = palette.dipole, cross = true) {
    const mat = material(color, state, true), direction = end.clone().sub(start).normalize();
    const headLength = .085, shaftEnd = end.clone().addScaledVector(direction, -headLength * .75);
    rod(start, shaftEnd, .012, mat, state);
    const head = addMesh(new THREE.ConeGeometry(.035, headLength, 24), mat, state, end.clone().addScaledVector(direction, -headLength * .5));
    head.quaternion.setFromUnitVectors(up, direction);
    if (cross) {
      let side = direction.clone().cross(zAxis);
      if (side.lengthSq() < .01) side = direction.clone().cross(up);
      side.normalize().multiplyScalar(.039);
      rod(start.clone().sub(side), start.clone().add(side), .009, mat, state);
    }
  }
  function arc(center, from, to, state, isWater) {
    const radius = .22, points = [], mat = material(0xadb9ba, state, true);
    if (isWater) {
      const a = from.clone().sub(center).normalize(), b = to.clone().sub(center).normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
      const axis = new THREE.Vector3().crossVectors(a, b).normalize();
      for (let i = 0; i <= 40; i++) points.push(a.clone().applyAxisAngle(axis, angle * i / 40).multiplyScalar(radius).add(center));
    } else {
      for (let i = 0; i <= 40; i++) { const a = Math.PI * i / 40; points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0).add(center)); }
    }
    const curve = new THREE.CatmullRomCurve3(points); addMesh(new THREE.TubeGeometry(curve, 40, .006, 6, false), mat, state);
  }

  for (const [key, slotX] of [['H2O', -.95], ['CO2', .95]]) {
    const structure = MOLECULE_STRUCTURES[key], water = key === 'H2O';
    const holder = new THREE.Group(); holder.position.set(slotX, 1.45, -.15); group.add(holder);
    const turning = new THREE.Group(); holder.add(turning);
    const solids = layer(turning), geometryNotes = layer(turning), dipoles = layer(turning, 1), resultant = layer(turning, 2), caption = layer(holder);
    const positions = structure.atoms.map(atom => new THREE.Vector3(...atom.slice(1)));
    if (water) {
      const x = positions[1].clone().sub(positions[2]).normalize();
      const y = positions[1].clone().add(positions[2]).normalize().negate();
      const z = new THREE.Vector3().crossVectors(x, y).normalize();
      // Gram-Schmidt makes this a strict orthonormal rotation despite rounded SDF coordinates.
      x.crossVectors(y, z).normalize();
      for (const p of positions) { const raw = p.clone(); p.set(raw.dot(x), raw.dot(y), raw.dot(z)); }
      // Symmetric local directions make the displayed angle match the teaching reference.
      // Only the angle is idealized (~0.52° total); neither O–H bond is stretched.
      const halfAngle = THREE.MathUtils.degToRad(104.5 / 2);
      for (let i = 1; i <= 2; i++) {
        const length = positions[i].length();
        positions[i].set((i === 1 ? 1 : -1) * Math.sin(halfAngle), -Math.cos(halfAngle), 0).multiplyScalar(length);
      }
      for (const p of positions) { p.multiplyScalar(.52); p.y += .13; }
    } else for (const p of positions) p.multiplyScalar(.48);

    const atomMaterials = {};
    for (let i = 0; i < structure.atoms.length; i++) {
      const element = structure.atoms[i][0], radius = element === 'H' ? .11 : element === 'O' ? .17 : .15;
      atomMaterials[element] ||= material(palette[element], solids);
      const atom = addMesh(new THREE.SphereGeometry(radius, 40, 28), atomMaterials[element], solids, positions[i]);
      atom.name = `${key} atom ${i + 1} ${element}`; hitObjects.push(atom);
    }
    const bondMat = material(palette.bond, solids);
    for (const [a, b, order] of structure.bonds) {
      for (let n = 0; n < order; n++) {
        const offset = new THREE.Vector3(0, order === 2 ? (n ? .045 : -.045) : 0, 0);
        const bond = rod(positions[a].clone().add(offset), positions[b].clone().add(offset), order === 2 ? .025 : .038, bondMat, solids);
        if (bond) hitObjects.push(bond);
      }
    }
    const center = positions[water ? 0 : 2];
    arc(center, positions[water ? 1 : 0], positions[water ? 2 : 1], geometryNotes, water);
    label(water ? 'H₂O  ·  ≈104.5°' : 'CO₂  ·  180°', 0, -.48, 1.18, caption, '#eee9dd', .22);

    if (water) {
      for (const h of [positions[1], positions[2]]) {
        const towardO = center.clone().sub(h).normalize();
        const start = h.clone().addScaledVector(towardO, .08), end = center.clone().addScaledVector(towardO, -.11);
        start.z += .20; end.z += .20; arrow(start, end, dipoles);
      }
      arrow(new THREE.Vector3(.55, -.23, .16), new THREE.Vector3(.55, .40, .16), resultant, palette.net);
      label('μ ≠ 0', .48, .56, .61, resultant, '#efd9b7', .19);
    } else {
      for (const o of [positions[0], positions[1]]) {
        const toO = o.clone().sub(center).normalize();
        const start = center.clone().addScaledVector(toO, .13), end = o.clone().addScaledVector(toO, -.08);
        start.z += .20; end.z += .20; arrow(start, end, dipoles);
      }
      // Equal and opposite chemical bond-dipole arrows already carry the cancellation.
      // Do not draw a resultant arrow for a molecule with zero net dipole.
      label('μ = 0', 0, .56, .61, resultant, '#efd9b7', .19);
    }
    objects.push({ holder, turning, baseY: holder.position.y });
  }
  group.visible = false;
  return {
    group,
    setStep(next) {
      const selected = Number.isInteger(next) && next >= 0 && next <= 3 ? next : null;
      if (step === null && selected !== null) { targetYaw = targetPitch = yaw = pitch = 0; }
      step = selected;
      // Returning home removes the learning objects immediately, leaving its existing composition untouched.
      if (step === null) { group.visible = false; for (const state of layers) state.opacity = 0; }
      else group.visible = true;
    },
    update(time, delta) {
      if (!group.visible) return;
      const dt = Math.min(.05, Math.max(0, Number.isFinite(delta) ? delta : time - lastTime)); lastTime = time;
      const blend = 1 - Math.exp(-dt * (reduced.matches ? 22 : 9));
      yaw += (targetYaw - yaw) * blend; pitch += (targetPitch - pitch) * blend;
      for (let i = 0; i < objects.length; i++) {
        const object = objects[i]; object.turning.rotation.set(pitch, yaw, 0);
        object.holder.position.y = object.baseY + (reduced.matches ? 0 : Math.sin(time * .65 + i * .8) * .009);
      }
      for (const state of layers) {
        const target = step >= state.fromStep ? 1 : 0;
        state.opacity += (target - state.opacity) * blend;
        state.node.visible = state.opacity > .002;
        for (const mat of state.materials) mat.opacity = state.opacity;
      }
    },
    rotate(dx, dy) {
      if (step === null || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      targetYaw += THREE.MathUtils.clamp(dx, -.5, .5);
      targetPitch = THREE.MathUtils.clamp(targetPitch + THREE.MathUtils.clamp(dy, -.5, .5), -1.15, 1.15);
    },
    hitTest(raycaster) {
      if (step === null || !group.visible) return false;
      group.updateWorldMatrix(true, true);
      return raycaster.intersectObjects(hitObjects, false).length > 0;
    },
    dispose() { parent.remove(group); for (const resource of resources) resource.dispose(); resources.clear(); }
  };
}
