import * as THREE from '../three.module.min.js';

const sides = ['left', 'right'];
const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(0, 0, -1);

function poseBuffer() {
  return { position:new THREE.Vector3(), quaternion:new THREE.Quaternion() };
}

function createHandState() {
  return {
    output:{ ...poseBuffer(), strength:0, tracking:null },
    sample:{ ...poseBuffer(), source:null, priority:0 },
    source:null, weight:0,
  };
}

function readPose(pose, target) {
  if (!pose || pose.emulatedPosition) return false;
  const {position, orientation} = pose.transform;
  if (![position.x, position.y, position.z, orientation.x, orientation.y, orientation.z, orientation.w].every(Number.isFinite)) {
    return false;
  }
  target.position.copy(position);
  target.quaternion.copy(orientation);
  if (target.quaternion.lengthSq() < .25) return false;
  target.quaternion.normalize();
  return true;
}

function gripToWrist(side) {
  // Grip +Y points toward the arm and ±X points out through the back of the hand.
  const sign = side === 'left' ? -1 : 1;
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, sign), new THREE.Vector3(sign, 0, 0), up,
  );
  return {
    rotation:new THREE.Quaternion().setFromRotationMatrix(basis),
    offset:new THREE.Vector3(sign * .011, .048, 0),
  };
}

/** Returns both wrists in scene world space, with -Z toward the fingers and +Y out of the back of the hand. */
export function createXRStudentHands() {
  const hands = {left:createHandState(), right:createHandState()};
  const result = {leftHand:hands.left.output, rightHand:hands.right.output};
  const grip = {left:gripToWrist('left'), right:gripToWrist('right')};
  const pose = poseBuffer();
  const rigPosition = new THREE.Vector3(), rigRotation = new THREE.Quaternion(), rigScale = new THREE.Vector3();
  const wristOffset = new THREE.Vector3(), boneDirection = new THREE.Vector3();
  const dorsal = new THREE.Vector3(), sideways = new THREE.Vector3(), towardWrist = new THREE.Vector3();
  const handBasis = new THREE.Matrix4();
  let session = null, space = null;

  function reset() {
    session = space = null;
    for (const side of sides) {
      const hand = hands[side];
      hand.source = hand.sample.source = null;
      hand.weight = hand.sample.priority = hand.output.strength = 0;
      hand.output.position.set(0, 0, 0);
      hand.output.quaternion.identity();
      hand.output.tracking = null;
    }
  }

  function trackSource(frame, referenceSpace, source, side) {
    try {
      if (source.hand) {
        const wrist = source.hand.get('wrist');
        if (!wrist || !readPose(frame.getJointPose?.(wrist, referenceSpace), pose)) return false;
        const knuckle = source.hand.get('middle-finger-phalanx-proximal');
        const knucklePose = knuckle && frame.getJointPose(knuckle, referenceSpace);
        if (knucklePose && !knucklePose.emulatedPosition) {
          // The middle knuckle stabilizes the wrist-to-fingers direction on optical input.
          boneDirection.copy(knucklePose.transform.position).sub(pose.position);
          const length = boneDirection.length();
          if (length > .025 && length < .14) {
            boneDirection.multiplyScalar(1 / length);
            towardWrist.copy(forward).applyQuaternion(pose.quaternion);
            if (towardWrist.dot(boneDirection) > .6) {
              towardWrist.copy(boneDirection).negate();
              dorsal.copy(up).applyQuaternion(pose.quaternion);
              sideways.crossVectors(dorsal, towardWrist).normalize();
              dorsal.crossVectors(towardWrist, sideways).normalize();
              pose.quaternion.setFromRotationMatrix(handBasis.makeBasis(sideways, dorsal, towardWrist)).normalize();
            }
          }
        }
        return true;
      }
      if (!readPose(frame.getPose(source.gripSpace, referenceSpace), pose)) return false;
      const {offset, rotation} = grip[side];
      pose.position.add(wristOffset.copy(offset).applyQuaternion(pose.quaternion));
      pose.quaternion.multiply(rotation);
      return true;
    } catch {
      // A session can lose tracking or replace its reference space between frames.
      return false;
    }
  }

  function update(frame, referenceSpace, rig, dt = 1 / 60) {
    const activeSession = frame?.session;
    if (activeSession && (activeSession !== session || referenceSpace !== space)) {
      reset();
      session = activeSession;
      space = referenceSpace;
    }
    const elapsed = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .05) : 1 / 60;
    for (const side of sides) {
      hands[side].sample.source = null;
      hands[side].sample.priority = 0;
    }
    if (activeSession && referenceSpace && rig) {
      rig.updateWorldMatrix(true, false);
      rig.matrixWorld.decompose(rigPosition, rigRotation, rigScale);
      for (const source of activeSession.inputSources) {
        const side = source.handedness;
        if (side !== 'left' && side !== 'right') continue;
        const priority = source.hand ? 2 : source.gripSpace && source.targetRayMode === 'tracked-pointer' ? 1 : 0;
        const hand = hands[side], sample = hand.sample;
        if (!priority || priority < sample.priority || (priority === sample.priority && source !== hand.source)) continue;
        if (!trackSource(frame, referenceSpace, source, side)) continue;
        sample.source = source;
        sample.priority = priority;
        sample.position.copy(pose.position).applyMatrix4(rig.matrixWorld);
        sample.quaternion.copy(pose.quaternion).premultiply(rigRotation).normalize();
      }
    }
    for (const side of sides) {
      const hand = hands[side], {output, sample} = hand;
      if (sample.source && (!hand.source || hand.source === sample.source)) {
        if (!hand.source) {
          hand.source = sample.source;
          output.tracking = sample.priority === 2 ? 'hand' : 'controller';
          output.position.copy(sample.position);
          output.quaternion.copy(sample.quaternion);
        } else {
          const distance = output.position.distanceTo(sample.position);
          const rate = 26 + 19 * Math.min(distance / .12, 1);
          output.position.lerp(sample.position, 1 - Math.exp(-rate * elapsed));
          output.quaternion.slerp(sample.quaternion, 1 - Math.exp(-29 * elapsed));
        }
        hand.weight = Math.min(1, hand.weight + elapsed / .15);
      } else {
        // Ease back to the resting paws before accepting a different tracking source.
        hand.weight = Math.max(0, hand.weight - elapsed / .20);
        if (!hand.weight) {
          hand.source = null;
          output.tracking = null;
        }
      }
      output.strength = THREE.MathUtils.smoothstep(hand.weight, 0, 1);
    }
    return result;
  }

  return {update, reset};
}
