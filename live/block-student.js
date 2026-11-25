import * as THREE from '../three.module.min.js';

const referenceHeight=1.4;
const cube=new THREE.BoxGeometry();
const up=new THREE.Vector3(0,1,0);
const restWristRotation=new THREE.Quaternion().setFromAxisAngle(up,Math.PI);

export function blockStudentEye(height=referenceHeight,out=new THREE.Vector3()) {
  return out.set(0,1.29,.028).multiplyScalar(height/referenceHeight);
}

function surface(color,roughness=.82) {
  return new THREE.MeshStandardMaterial({color,roughness});
}

function block(parent,material,x,y,z,width,height,depth) {
  const mesh=new THREE.Mesh(cube,material);
  mesh.position.set(x,y,z);
  mesh.scale.set(width,height,depth);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}

function arm(figure,side,scale,materials) {
  const shoulder=new THREE.Vector3(side*.218,1.077,-.052);
  const restWrist=new THREE.Vector3(side*.183,.844,.349);
  const upperLength=.279, forearmLength=.263;
  const upper=block(figure,materials.knit,0,0,0,.114,upperLength+.029,.119);
  const forearm=block(figure,materials.knit,0,0,0,.100,forearmLength+.020,.102);
  block(forearm,materials.trim,0,.447,0,1.035,.102,1.025);
  const palm=new THREE.Group();
  figure.add(palm);
  // Match XR wrist axes: toward the fingers is -Z, and the back of the hand is +Y.
  block(palm,materials.skin,0,-.003,-.040,.086,.073,.107);
  const target=new THREE.Vector3(), direction=new THREE.Vector3(), pole=new THREE.Vector3(), elbow=new THREE.Vector3();

  function positionLimb(mesh,start,end) {
    mesh.position.lerpVectors(start,end,.5);
    direction.subVectors(end,start).normalize();
    mesh.quaternion.setFromUnitVectors(up,direction);
  }

  return function poseArm(tracked) {
    const strength=tracked?.strength ?? 0;
    target.copy(restWrist);
    palm.quaternion.copy(restWristRotation);
    if (strength>0) {
      direction.copy(tracked.position).divideScalar(scale);
      target.lerp(direction,strength);
      target.y=Math.max(.71,target.y);
      target.z=Math.max(-.11,target.z);
      if (target.z<.16) target.x=side*Math.max(.169,side*target.x);
      palm.quaternion.slerp(tracked.quaternion,strength);
    }

    direction.subVectors(target,shoulder);
    const length=direction.length();
    if (length<.0001) direction.set(side,-1,.2);
    direction.normalize();
    const reach=THREE.MathUtils.clamp(length,.093,upperLength+forearmLength-.005);
    target.copy(shoulder).addScaledVector(direction,reach);

    // Keep the elbow down and clear of the torso as the wrist moves.
    pole.set(side*.34,-1,-.45);
    pole.addScaledVector(direction,-pole.dot(direction));
    if (pole.lengthSq()<.00001) {
      pole.set(side,0,0).addScaledVector(direction,-side*direction.x);
    }
    pole.normalize();
    const along=(upperLength**2-forearmLength**2+reach**2)/(2*reach);
    elbow.copy(shoulder).addScaledVector(direction,along)
      .addScaledVector(pole,Math.sqrt(Math.max(0,upperLength**2-along**2)));

    positionLimb(upper,shoulder,elbow);
    positionLimb(forearm,elbow,target);
    palm.position.copy(target);
  };
}

export function createBlockStudent({firstPerson=false,height=referenceHeight,teacher=false}={}) {
  const object=new THREE.Group();
  object.name='Block student';
  const figure=new THREE.Group();
  const scale=height/referenceHeight;
  figure.scale.setScalar(scale);
  object.add(figure);
  const materials={
    knit:surface(teacher?0x3c4959:0x617787),
    trim:surface(teacher?0x506075:0x7d8f9a),
    pants:surface(0x343f4c),
    shoes:surface(0x262d37),
    shirt:surface(0xd1d9d9),
    skin:surface(0xcdb8a7),
    hair:surface(0x524943),
    eyes:surface(0x273140,.62),
  };

  block(figure,materials.pants,0,.676,-.056,.347,.102,.225);
  block(figure,materials.knit,0,.923,-.039,.360,.393,.266);
  block(figure,materials.trim,0,.745,-.039,.364,.033,.269);
  block(figure,materials.shirt,0,1.098,.035,.159,.052,.143);
  block(figure,materials.skin,0,1.134,-.069,.110,.059,.104);
  for (const side of [-1,1]) {
    block(figure,materials.pants,side*.101,.716,.165,.184,.160,.449);
    block(figure,materials.pants,side*.101,.450,.332,.163,.420,.150);
    block(figure,materials.shoes,side*.101,.171,.350,.181,.142,.207);
  }

  let head=null;
  if (!firstPerson) {
    head=new THREE.Group();
    head.position.set(0,1.156,-.112);
    head.rotation.order='YXZ';
    figure.add(head);
    block(head,materials.skin,0,.128,0,.270,.262,.275);
    block(head,materials.hair,0,.244,-.013,.280,.058,.284);
    block(head,materials.hair,0,.164,-.118,.277,.115,.078);
    block(head,materials.hair,.092,.206,.110,.111,.084,.059);
    for (const side of [-1,1]) {
      block(head,materials.eyes,side*.057,.129,.139,.027,.024,.005);
    }
  }

  // The figure's +X is the seated viewer's left when facing the classroom.
  const left=arm(figure,1,scale,materials), right=arm(figure,-1,scale,materials);
  function update(_time,{leftHand,rightHand,headYaw=0,headPitch=0}={}) {
    left(leftHand);
    right(rightHand);
    if (head) {
      head.rotation.y=THREE.MathUtils.clamp(headYaw,-.85,.85);
      head.rotation.x=THREE.MathUtils.clamp(headPitch,-.52,.52);
    }
  }
  update(0);
  return {object,eyePosition:blockStudentEye(height),update};
}
