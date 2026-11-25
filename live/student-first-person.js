import * as THREE from '../three.module.min.js';

// The v49 neck ends at the folded collar. The local shell keeps only the
// geometry below this cut; the normal avatar still includes the full head.
export const STUDENT_NECKLINE = .552;
export const STUDENT_EYES = Object.freeze([0,.730,.119]);

const armIds = {
  right:[2,3,11],
  left:[12,13,14],
};

export function bindStudentFirstPersonArm(x,y,skin,index) {
  const shoulderEdge = .153 + .145 * Math.max(0,.50-y);
  const edgeWidth = .013 + .015 * THREE.MathUtils.smoothstep(y,.35,.475);
  const ownership = THREE.MathUtils.smoothstep(Math.abs(x),shoulderEdge-edgeWidth,shoulderEdge+edgeWidth)
    * THREE.MathUtils.smoothstep(y,.214,.243) * (1 - THREE.MathUtils.smoothstep(y,.467,.512));
  if (!ownership) return false;
  const [shoulder,elbow,wrist] = armIds[x < 0 ? 'right' : 'left'];
  const [a,b,mix] = y <= .365
    ? [elbow,wrist,1-THREE.MathUtils.smoothstep(y,.292,.341)]
    : [shoulder,elbow,1-THREE.MathUtils.smoothstep(y,.365,.434)];
  const total = Math.round(255*ownership);
  const secondary = Math.round(total*mix);
  skin[index] = a;
  skin[index+1] = b;
  skin[index+2] = total-secondary;
  skin[index+3] = secondary;
  return true;
}

function putJoint(matrix,rotation,sourcePivot,destination,offset) {
  offset.copy(sourcePivot).applyQuaternion(rotation).negate().add(destination);
  matrix.makeRotationFromQuaternion(rotation).setPosition(offset);
}

function makeArm(side,joints,pivots) {
  const wristRest = new THREE.Vector3(side*.204,.372,.102);
  const [shoulderId,elbowId,wristId] = armIds[side < 0 ? 'right' : 'left'];
  const [shoulder,elbow,wrist] = [shoulderId,elbowId,wristId].map(id=>pivots[id]);
  const restUpper = elbow.clone().sub(shoulder);
  const restLower = wrist.clone().sub(elbow);
  const upperLength = restUpper.length(), lowerLength = restLower.length();
  restUpper.normalize(); restLower.normalize();

  // Register the paw's model axes to the tracked convention: -Z follows the
  // fingers and +Y points out of the back of each hand.
  const palmZ = restLower.clone().negate();
  const palmX = new THREE.Vector3(0,0,1).cross(palmZ).normalize();
  const palmY = palmZ.clone().cross(palmX);
  const palmInverse = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(palmX,palmY,palmZ),
  ).invert();
  const desired = new THREE.Vector3(), axis = new THREE.Vector3(), pole = new THREE.Vector3();
  const elbowTarget = new THREE.Vector3(), lower = new THREE.Vector3(), upper = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const shoulderPose = new THREE.Quaternion(), elbowPose = new THREE.Quaternion(), wristPose = new THREE.Quaternion();
  const trackedPose = new THREE.Quaternion();

  function update(input,visualOffset,scale) {
    desired.copy(wristRest);
    const mix = input?.position ? THREE.MathUtils.clamp(input.strength ?? 1,0,1) : 0;
    if (mix > 0 && Number.isFinite(input.position.lengthSq())) {
      lower.copy(input.position).sub(visualOffset).divideScalar(scale);
      desired.lerp(lower,mix);
      // A wrist can reach across the front of the vest when it clears the
      // chest. In the body volume keep it to its own side.
      desired.y = Math.max(desired.y,.234);
      desired.z = Math.max(desired.z,-.045);
      const clear = THREE.MathUtils.smoothstep(desired.z,.040,.175);
      desired.x = side*Math.max(side*desired.x,THREE.MathUtils.lerp(.180,-.15,clear));
    }

    axis.copy(desired).sub(shoulder);
    const originalDistance = axis.length();
    if (originalDistance < .00001) axis.set(side,-1,.1);
    axis.normalize();
    const distance = THREE.MathUtils.clamp(originalDistance,Math.abs(upperLength-lowerLength)+.015,upperLength+lowerLength-.003);
    desired.copy(shoulder).addScaledVector(axis,distance);

    // Push elbows down and out toward the side of the chair. Joint lengths
    // stay fixed even when a physical wrist extends beyond the kitten's reach.
    pole.set(side*.85,-.76,-.42);
    pole.addScaledVector(axis,-pole.dot(axis));
    if (pole.lengthSq() < 1e-5) {
      pole.set(side,0,0);
      pole.addScaledVector(axis,-pole.dot(axis));
    }
    pole.normalize();
    const along = (upperLength**2-lowerLength**2+distance**2)/(2*distance);
    const elbowOffset = Math.sqrt(Math.max(0,upperLength**2-along**2));
    elbowTarget.copy(shoulder).addScaledVector(axis,along).addScaledVector(pole,elbowOffset);

    upper.copy(elbowTarget).sub(shoulder).normalize();
    lower.copy(desired).sub(elbowTarget).normalize();
    shoulderPose.setFromUnitVectors(restUpper,upper);
    upper.copy(restLower).applyQuaternion(shoulderPose);
    elbowPose.setFromUnitVectors(upper,lower).multiply(shoulderPose);
    wristPose.copy(elbowPose);
    if (input?.quaternion && mix > 0 && Number.isFinite(input.quaternion.lengthSq())) {
      trackedPose.copy(input.quaternion).normalize().multiply(palmInverse);
      wristPose.rotateTowards(trackedPose,.72*mix);
    }
    putJoint(joints[shoulderId],shoulderPose,shoulder,shoulder,offset);
    putJoint(joints[elbowId],elbowPose,elbow,elbowTarget,offset);
    putJoint(joints[wristId],wristPose,wrist,desired,offset);
  }
  return update;
}

export function createStudentArms(joints,pivots,visualOffset,scale) {
  const left = makeArm(1,joints,pivots);
  const right = makeArm(-1,joints,pivots);
  return (leftHand,rightHand) => {
    left(leftHand,visualOffset,scale);
    right(rightHand,visualOffset,scale);
  };
}
