import * as THREE from '../three.module.min.js';
import {MOLECULE_CATALOG} from '../molecule-catalog.js?v=quiet-shape-31';
import {createMoleculeStage} from '../molecule-lesson.js?v=reservation-room-36';

export const MAX_PREVIEW_MOLECULES = 4;

export function createPreviewMolecules(parent, {rig}) {
  const display = new THREE.Group();
  display.name = 'Whiteboard molecular display';
  display.visible = false;
  parent.add(display);
  const models = new Map();
  const sources = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const xAxis = new THREE.Vector3(1,0,0);
  const yAxis = new THREE.Vector3(0,1,0);
  const wristRotation = new THREE.Quaternion();
  const referenceRotation = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const referenceToDisplay = new THREE.Matrix4();
  const pivotToWorld = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const digit = new THREE.Vector3();
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  let tipGeometry = null, tipMaterial = null;
  let surface = null, session = null;

  function layout(next) {
    surface = next && next.width>0 && next.height>0 ? next : null;
    display.visible = Boolean(surface && models.size);
    if (!display.visible) return;
    const {x,y,width,height,z} = surface;
    const immersive = Boolean(session);
    const count = models.size;
    // In the headset the same display sits above the learner's desk, in
    // arm's reach. In the browser it sits nearer the lower half of the board.
    const centerX = immersive ? 0 : x*(1-.80/-z);
    const centerY = immersive ? -.23 : y-height*.28;
    const centerZ = immersive ? -.63 : z+.80;
    const targetRadius = immersive ? (count>2 ? .078 : .115) : Math.min(count>2?.30:.46,height*.19,width/(count*2.7));
    const stride = immersive ? (count>2?.175:.255) : Math.min(.99,width*.80/count);
    let index = 0;
    for (const entry of models.values()) {
      const offset = (index++-(count-1)*.5)*stride;
      entry.holder.position.set(centerX+offset,centerY,centerZ);
      entry.holder.scale.setScalar(targetRadius/entry.radius);
    }
  }

  function build(id) {
    const holder = new THREE.Group();
    holder.name = `Whiteboard model ${id}`;
    display.add(holder);
    const visual = new THREE.Group();
    holder.add(visual);
    const stage = createMoleculeStage(visual);
    stage.setModels([id]);
    // A one-model stage includes a presentation-height offset. Cancel that
    // offset here so the molecule rotates around its center, not around its foot.
    const inner = stage.group.children[0];
    visual.position.copy(inner.position).negate();
    holder.updateWorldMatrix(true,true);
    pivotToWorld.copy(holder.matrixWorld).invert();
    let radius = .05;
    const materials = new Set();
    const relative = new THREE.Matrix4();
    stage.group.traverse(node => {
      if (node.isSprite) node.visible = false;
      if (!node.isMesh || node.userData.modelIndex !== 0) return;
      node.geometry.computeBoundingSphere();
      const bounds = node.geometry.boundingSphere;
      relative.multiplyMatrices(pivotToWorld,node.matrixWorld);
      radius = Math.max(radius,point.copy(bounds.center).applyMatrix4(relative).length() + bounds.radius*relative.getMaxScaleOnAxis());
      materials.add(node.material);
    });
    for (const material of materials) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0;
    }
    return {id,holder,stage,radius,materials,target:new THREE.Quaternion(),heldBy:null,glow:0};
  }

  function setModels(next) {
    const requested = new Map();
    for (const item of Array.isArray(next)?next:[]) {
      if (requested.size>=MAX_PREVIEW_MOLECULES) break;
      if (typeof item?.key !== 'string' || typeof item.id !== 'string' || !Object.hasOwn(MOLECULE_CATALOG,item.id)) continue;
      requested.set(item.key,item.id);
    }
    const retained = new Map();
    for (const [key,entry] of models) {
      if (requested.get(key)===entry.id) retained.set(key,entry);
      else {
        if (entry.heldBy) release(entry.heldBy);
        entry.stage.dispose();
        entry.holder.removeFromParent();
      }
    }
    models.clear();
    for (const [key,id] of requested) models.set(key,retained.get(key)||build(id));
    layout(surface);
  }

  function hitTest(raycaster) {
    if (!display.visible) return null;
    for (const [key,entry] of models) if (entry.stage.hitTest(raycaster)) return key;
    return null;
  }

  function rotate(key,dx,dy) {
    const entry = models.get(key);
    if (!entry || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    entry.target.premultiply(rotation.setFromAxisAngle(yAxis,THREE.MathUtils.clamp(dx,-.55,.55)));
    entry.target.premultiply(rotation.setFromAxisAngle(xAxis,THREE.MathUtils.clamp(dy,-.55,.55))).normalize();
  }

  function update(seconds,delta) {
    if (!display.visible) return;
    const dt = THREE.MathUtils.clamp(delta,0,.05);
    for (const entry of models.values()) {
      entry.stage.update(reduced.matches?0:seconds,dt);
      entry.holder.quaternion.slerp(entry.target,reduced.matches?1:1-Math.exp(-dt*(entry.heldBy?35:20)));
      const glow = entry.glow+(Number(Boolean(entry.heldBy))*.12-entry.glow)*(1-Math.exp(-dt*15));
      if (Math.abs(glow-entry.glow)>.0001) {
        entry.glow = glow;
        for (const material of entry.materials) material.emissiveIntensity = glow;
      }
    }
  }

  function inputState(source) {
    if (!sources.has(source)) {
      let tip = null;
      if (source.hand) {
        tipGeometry ||= new THREE.SphereGeometry(.006,12,8);
        tipMaterial ||= new THREE.MeshBasicMaterial({color:0xffe5b7,toneMapped:false});
        tip = new THREE.Mesh(tipGeometry,tipMaterial);
        tip.visible = false;
        display.add(tip);
      }
      sources.set(source,{tip,buttons:new Set(),pinching:false,begin:false,holding:null,offset:new THREE.Quaternion()});
    }
    return sources.get(source);
  }

  function release(state) {
    if (!state.holding) return;
    state.holding.heldBy = null;
    state.holding = null;
  }

  function forget() {
    for (const state of sources.values()) {
      release(state);
      state.tip?.removeFromParent();
    }
    sources.clear();
  }

  function controllerDown(event) {
    const source = event.inputSource;
    if (source.hand || source.targetRayMode!=='tracked-pointer') return;
    const state = inputState(source);
    if (!state.buttons.size) state.begin = true;
    state.buttons.add(event.type);
  }

  function controllerUp(event) {
    const state = sources.get(event.inputSource);
    if (!state) return;
    state.buttons.delete(event.type==='selectend'?'selectstart':'squeezestart');
    if (!state.buttons.size) {
      state.begin = false;
      release(state);
    }
  }

  function sourcesChanged(event) {
    for (const source of event.removed) {
      const state = sources.get(source);
      if (state) {
        release(state);
        state.tip?.removeFromParent();
      }
      sources.delete(source);
    }
  }

  function attachXR(next) {
    if (next===session) return;
    const bindings = [['squeezestart',controllerDown],['selectstart',controllerDown],['squeezeend',controllerUp],['selectend',controllerUp],['inputsourceschange',sourcesChanged]];
    for (const [type,listener] of bindings) session?.removeEventListener(type,listener);
    forget();
    session = next;
    for (const [type,listener] of bindings) session?.addEventListener(type,listener);
    layout(surface);
  }

  function nearest(contact, controllerRay) {
    let nearby = null, rayHit = null, bestNear = Infinity, bestRay = Infinity;
    for (const entry of models.values()) {
      if (entry.heldBy) continue;
      const radius = entry.radius*entry.holder.scale.x;
      const distance = contact.distanceToSquared(entry.holder.position);
      if (distance<bestNear && distance<(radius+.03)**2) { bestNear = distance; nearby = entry; }
      if (controllerRay) {
        sphere.set(entry.holder.position,radius+.028);
        if (controllerRay.intersectSphere(sphere,hit)) {
          const depth = hit.distanceToSquared(controllerRay.origin);
          if (depth<bestRay) { bestRay = depth; rayHit = entry; }
        }
      }
    }
    return nearby||rayHit;
  }

  function applyGrip(state,orientation,contact,begin,controllerRay=null) {
    wristRotation.set(orientation.x,orientation.y,orientation.z,orientation.w).premultiply(referenceRotation).normalize();
    if (begin && !state.holding) {
      const entry = nearest(contact,controllerRay);
      if (entry) {
        state.holding = entry;
        entry.heldBy = state;
        state.offset.copy(wristRotation).invert().multiply(entry.holder.quaternion);
      }
    }
    if (state.holding) state.holding.target.copy(wristRotation).multiply(state.offset);
  }

  function updateXR(frame,referenceSpace) {
    if (!session || !display.visible || !frame || !referenceSpace) return;
    rig.updateWorldMatrix(true,false);
    display.updateWorldMatrix(true,false);
    referenceToDisplay.copy(display.matrixWorld).invert().multiply(rig.matrixWorld);
    referenceRotation.setFromRotationMatrix(referenceToDisplay).normalize();
    for (const source of session.inputSources) {
      if (source.hand) {
        const state = inputState(source);
        const joint = name => {
          const space = source.hand.get(name);
          return space && frame.getJointPose?.(space,referenceSpace)?.transform;
        };
        const thumb = joint('thumb-tip'), index = joint('index-finger-tip'), wrist = joint('wrist');
        if (!thumb || !index || !wrist) {
          release(state);
          state.tip.visible = false;
          continue;
        }
        point.set(thumb.position.x,thumb.position.y,thumb.position.z);
        digit.set(index.position.x,index.position.y,index.position.z);
        const wasPinching = state.pinching;
        state.pinching = point.distanceToSquared(digit) < (wasPinching?.040:.026)**2;
        point.add(digit).multiplyScalar(.5).applyMatrix4(referenceToDisplay);
        if (!state.pinching) release(state);
        else applyGrip(state,wrist.orientation,point,!wasPinching);
        // Native hands may be invisible in an opaque headset. Show only a tiny
        // pinch point near the display, so learners can place the grip by sight.
        state.tip.position.copy(point);
        state.tip.visible = Boolean(state.holding);
        if (!state.tip.visible) for (const entry of models.values()) {
          if (point.distanceToSquared(entry.holder.position)<(entry.radius*entry.holder.scale.x+.12)**2) {
            state.tip.visible = true;
            break;
          }
        }
      } else {
        const state = sources.get(source);
        if (!state || !state.buttons.size) continue;
        const target = frame.getPose(source.targetRaySpace,referenceSpace)?.transform;
        const grip = source.gripSpace && frame.getPose(source.gripSpace,referenceSpace)?.transform || target;
        if (!grip) { release(state); state.begin=false; continue; }
        point.set(grip.position.x,grip.position.y,grip.position.z).applyMatrix4(referenceToDisplay);
        if (target) {
          rotation.set(target.orientation.x,target.orientation.y,target.orientation.z,target.orientation.w);
          ray.origin.set(target.position.x,target.position.y,target.position.z).applyMatrix4(referenceToDisplay);
          ray.direction.set(0,0,-1).applyQuaternion(rotation).transformDirection(referenceToDisplay);
        }
        applyGrip(state,grip.orientation,point,state.begin,target?ray:null);
        state.begin = false;
      }
    }
  }

  function dispose() {
    attachXR(null);
    setModels([]);
    tipGeometry?.dispose();
    tipMaterial?.dispose();
    display.removeFromParent();
  }

  return {layout,setModels,hitTest,rotate,update,attachXR,updateXR,dispose};
}
