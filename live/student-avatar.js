import * as THREE from '../three.module.min.js';
import {GLTFLoader} from '../GLTFLoader.js';
import {createGaussianSurface} from './student-gaussians.js?v=first-person-cat-55';
import {createStudentBacking} from './student-skin.js?v=first-person-cat-55';
import {bindStudentFirstPersonArm, createStudentArms, STUDENT_EYES} from './student-first-person.js?v=block-vr-56';
import {studentSeatMount} from './shared-seating.js?v=student-avatar-49';
import {createStudentSpectacles} from './student-spectacles.js?v=student-avatar-49';
import {createStudentCollar} from './student-collar.js?v=first-person-cat-55';

const detailFile = new URL('./student-cat-detail.glb?v=student-avatar-49', import.meta.url);
const {clamp, smoothstep} = THREE.MathUtils;
const head = 1, shoulder = 2, elbow = 3, tailRoot = 4, tailBend = 5, tailTip = 6;
const leftHip = 7, leftKnee = 8, rightHip = 9, rightKnee = 10;
const wrist = 11;
// Bend angles of the root, middle and tip, followed by the root lift and depth.
const seatedTail = [[-.33,.25,.64],[-.13,.01,.34],[-.02,.07,.175],.084,-.018];
const standingTail = [[0,0,0],[0,0,0],[0,0,0],0,0];
const bones = [
  {pivot:[0, 0, 0]},
  {pivot:[-.006, .528, -.057]}, // Head, with the attached eyes and glasses
  {pivot:[-.157, .479, -.045]},
  {pivot:[-.223, .390, -.033], parent:shoulder},
  {pivot:[0, .145, -.127]},
  {pivot:[0, .177, -.227], parent:tailRoot},
  {pivot:[-.028, .293, -.269], parent:tailBend},
  {pivot:[-.083, .224, -.044]},
  {pivot:[-.079, .116, -.026], parent:leftHip},
  {pivot:[.083, .224, -.044]},
  {pivot:[.079, .116, -.026], parent:rightHip},
  {pivot:[-.267, .316, -.030], parent:elbow},
].map(bone => ({...bone, pivot:new THREE.Vector3(...bone.pivot)}));
const localPivots = [
  ...bones.map(({pivot})=>pivot),
  new THREE.Vector3(.151,.479,-.045),
  new THREE.Vector3(.214,.390,-.037),
  new THREE.Vector3(.258,.316,-.034),
];
let detailPromise;

function loadDetail() {
  detailPromise ??= new GLTFLoader().loadAsync(detailFile.href).then(({scene}) => {
    scene.traverse(object => {
      if (!object.isMesh) return;
      const original = object.material;
      // Match the baked lighting in the splat colours.
      object.material = new THREE.MeshBasicMaterial({
        map:original.map, color:original.color, vertexColors:original.vertexColors,
        side:original.side, toneMapped:false,
      });
      original.dispose();
    });
    return scene;
  }).catch(error => {
    detailPromise = null;
    throw error;
  });
  return detailPromise;
}

function setWeights(skin, i, first, second, amount, mix) {
  const total = Math.round(amount * 255);
  const secondary = Math.round(total * mix);
  skin[i] = first;
  skin[i + 1] = second;
  skin[i + 2] = total - secondary;
  skin[i + 3] = secondary;
}

function bindVertex(seated, firstPerson, x, y, z, part, skin, index) {
  if (part === 254) {
    const baseWeight = Math.max(smoothstep(-z, .125, .194), smoothstep(y, .165, .235));
    const rootWeight = seated ? .56 + .44 * baseWeight : baseWeight;
    if (y > .235) {
      setWeights(skin,index,tailBend,tailTip,rootWeight,smoothstep(y,.235,.338));
    } else {
      setWeights(skin,index,tailRoot,tailBend,rootWeight,Math.max(smoothstep(-z,.183,.248),smoothstep(y,.170,.235)));
    }
    return;
  }
  const neckWeight = smoothstep(y, .505, .572);
  if (neckWeight > 0) {
    setWeights(skin,index,head,0,neckWeight,0);
    return;
  }
  if (firstPerson && bindStudentFirstPersonArm(x,y,skin,index)) return;
  // Follow the actual silhouette of this sleeve. Below the elbow, keep the
  // wrist and paw together and put the narrow transition next to the vest.
  const armEdge = .157 + .144 * Math.max(0, .50 - y)
    + .012 * (1 - smoothstep(y, .277, .318));
  const blendWidth = .012 + .017 * smoothstep(y, .35, .475);
  const armWeight = (firstPerson ? 0 : smoothstep(-x, armEdge - blendWidth, armEdge + blendWidth))
    * smoothstep(y, .218, .249) * (1 - smoothstep(y, .470, .515));
  if (armWeight > 0) {
    if (y <= .365) {
      setWeights(skin,index,elbow,wrist,armWeight,1-smoothstep(y,.276,.327));
    } else {
      setWeights(skin,index,shoulder,elbow,armWeight,1-smoothstep(y,.365,.432));
    }
    return;
  }
  if (seated && y < .298) {
    const [hip, knee] = x < 0 ? [leftHip,leftKnee] : [rightHip,rightKnee];
    // Keep the back of the shorts on the seat while the thighs roll forward.
    const rump = smoothstep(y,.113,.192) * (1 - smoothstep(z,-.139,-.061));
    const legWeight = (1 - smoothstep(y,.178,.290)) * (1 - .40 * rump);
    setWeights(skin,index,hip,knee,legWeight,1-smoothstep(y,.088,.142));
  }
}

function motion(time) {
  const phase = (time % 14 + 14) % 14;
  const glance = smoothstep(phase, .7, 2.45) * (1 - smoothstep(phase, 3.35, 5.3));
  const greeting = smoothstep(phase, 5.48, 6.74) * (1 - smoothstep(phase, 7.78, 9.43));
  const settle = smoothstep(phase, 9.5, 11.1) * (1 - smoothstep(phase, 12.05, 13.7));
  return {
    yaw:-.233 * glance + .178 * settle + .021 * Math.sin(time * .89),
    pitch:.049 * glance - .050 * greeting,
    raise:greeting,
  };
}

export function createStudentAvatar({height=1.32, seated=false, firstPerson=false, progressive=false}={}) {
  const object = new THREE.Group();
  object.name = 'Orange Cat student';
  const visual = new THREE.Group();
  visual.scale.setScalar(height);
  const [tailRootRest,tailBendRest,tailTipRest,tailLift,tailDepth] = seated ? seatedTail : standingTail;
  // The outer origin stays at the center of the chair's base.
  if (seated) {
    const mount = studentSeatMount(height);
    visual.position.set(0,mount.y,mount.z);
  }
  object.add(visual);

  const eyePosition = new THREE.Vector3(...STUDENT_EYES).multiplyScalar(height).add(visual.position);
  const joints = Array.from({length:firstPerson ? localPivots.length : bones.length},()=>new THREE.Matrix4());
  const arms = firstPerson ? createStudentArms(joints,localPivots,visual.position,height) : null;
  const eyeMount = new THREE.Group();
  eyeMount.matrixAutoUpdate = false;
  if (!firstPerson) visual.add(eyeMount);
  const rotation = new THREE.Euler(0,0,0,'YXZ');
  const translatedPivot = new THREE.Vector3();
  const resources = [];
  let disposed = false;

  function pose(joint, x, y, z, lift=0, forward=0) {
    const bone = bones[joint], matrix = joints[joint];
    matrix.makeRotationFromEuler(rotation.set(x,y,z));
    translatedPivot.copy(bone.pivot).applyMatrix4(matrix).negate().add(bone.pivot);
    matrix.setPosition(translatedPivot);
    if (bone.parent) matrix.premultiply(joints[bone.parent]);
    if (lift || forward) {
      translatedPivot.setFromMatrixPosition(matrix);
      translatedPivot.y += lift;
      translatedPivot.z += forward;
      matrix.setPosition(translatedPivot);
    }
  }

  function update(time, {headYaw,headPitch,raise,tail,leftHand,rightHand}={}) {
    const demo = motion(time);
    const lift = clamp(raise ?? demo.raise, 0, 1);
    const bend = smoothstep(lift,.08,1);
    const curl = smoothstep(lift,.35,1);
    const tailEnergy = clamp(tail ?? 1, 0, 1) * (seated ? .72 : 1);
    const sway = (lag) => tailEnergy * (
      .67 * Math.sin(time * 1.34 - lag) + .33 * Math.sin(time * .81 - .65 * lag)
    );
    if (arms) {
      arms(leftHand,rightHand);
    } else {
      pose(head,clamp(headPitch ?? -demo.pitch,-.53,.53),clamp(headYaw ?? demo.yaw,-.88,.88),.025 * lift);
      pose(shoulder,-.27 * lift,-.045 * lift,-.18 * lift);
      pose(elbow,-.86 * bend,.11 * bend,-.055 * bend);
      pose(wrist,.12 * curl,-.055 * curl,.08 * curl);
    }
    // In the chair, the tail leaves the shorts low before curving out to the
    // side. The small sway follows this curve and stays clear of the vest.
    pose(tailRoot,tailRootRest[0],tailRootRest[1] + .075 * sway(0),tailRootRest[2],tailLift,tailDepth);
    pose(tailBend,tailBendRest[0] - .020 * sway(.27),
      tailBendRest[1] + .095 * sway(.28),tailBendRest[2] - .045 * sway(.19));
    pose(tailTip,tailTipRest[0] + .028 * sway(.60),
      tailTipRest[1] + .104 * sway(.59),tailTipRest[2] + .053 * sway(.56));
    if (seated) {
      pose(leftHip,-1.30,-.04,-.03,0,.024);
      pose(rightHip,-1.30,.04,.03,0,.024);
      pose(leftKnee,1.13,0,0,-.024,.039);
      pose(rightKnee,1.13,0,0,-.024,.039);
    }
    eyeMount.matrix.copy(joints[head]);
    eyeMount.matrixWorldNeedsUpdate = true;
  }

  update(0);
  const bind = (x,y,z,part,skin,index) => bindVertex(seated,firstPerson,x,y,z,part,skin,index);
  function track(model) {
    if (disposed) model.dispose();
    else resources.push(model);
    return model;
  }
  function mountAccessory(parent, accessory) {
    parent.add(accessory);
    track({dispose() {
      const materials = new Set();
      accessory.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        materials.add(mesh.material);
      });
      for (const material of materials) material.dispose();
    }});
  }
  function mountCollar() {
    mountAccessory(visual,createStudentCollar({joints,bindVertex:bind}));
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    object.removeFromParent();
    visual.clear();
    object.clear();
    for (const resource of resources) resource.dispose();
    resources.length = 0;
  }
  if (firstPerson && progressive) {
    // Put the textured seated body and its collar in place before refining the coat.
    const bodyReady = createStudentBacking(joints,bind,{firstPerson}).then(backing => {
      track(backing);
      if (!disposed) {
        visual.add(backing.object);
        mountCollar();
      }
    }).catch(error => {
      dispose();
      throw error;
    });
    const ready = bodyReady.then(async () => {
      if (disposed) return {gaussianCount:0};
      const model = track(await createGaussianSurface(joints,bind,{firstPerson}));
      if (!disposed) visual.add(model.object);
      return {gaussianCount:model.count};
    });
    return {object,eyePosition,bodyReady,ready,update,dispose};
  }
  const ready = Promise.all([
    createGaussianSurface(joints,bind,{firstPerson}).then(track),
    createStudentBacking(joints,bind,{firstPerson}).then(track),
    firstPerson ? null : loadDetail(),
  ]).then(([model,backing,details]) => {
    if (!disposed) {
      visual.add(backing.object,model.object);
      if (details) {
        eyeMount.add(details.clone());
        mountAccessory(eyeMount,createStudentSpectacles());
      }
      mountCollar();
    }
    return {gaussianCount:model.count};
  }).catch(error => {
    dispose();
    throw error;
  });
  return {object,eyePosition,bodyReady:ready,ready,update,dispose};
}
