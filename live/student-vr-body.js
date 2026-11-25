import * as THREE from '../three.module.min.js';
import {SEATED_STUDENT_HEIGHT} from './shared-seating.js?v=block-vr-56';
import {createXRStudentHands} from './xr-student-hands.js?v=local-vr-cat-55';
import {createBlockStudent} from './block-student.js?v=block-vr-56';

function wristTarget() {
  return {position:new THREE.Vector3(), quaternion:new THREE.Quaternion(), strength:0};
}

// A self avatar belongs to the chair. The viewer and tracked hands use that
// fixed coordinate system while the headset moves freely around the seat.
export function createLocalStudentBody(parent, {
  height=SEATED_STUDENT_HEIGHT, onChange=()=>{}, onError=()=>{},
} = {}) {
  const anchor=new THREE.Group();
  anchor.name='Local student body';
  anchor.visible=false;
  parent.add(anchor);

  const block=createBlockStudent({firstPerson:true,height});
  anchor.add(block.object);
  const hands=createXRStudentHands();
  const inverseAnchor=new THREE.Matrix4(), inverseRotation=new THREE.Quaternion();
  const left=wristTarget(), right=wristTarget();
  const pose={leftHand:null,rightHand:null};
  let avatar=block, choice='simple', orangeCat=null, loading=null, tracked=false;

  function showAppearance() {
    const next=choice==='orange-cat' && orangeCat ? orangeCat : block;
    if (avatar===next) return;
    avatar.object.visible=false;
    next.object.visible=true;
    avatar=next;
    if (anchor.visible) onChange();
  }

  function preload() {
    if (choice!=='orange-cat' || orangeCat || loading) return;
    loading=import('./student-avatar.js?v=block-vr-56').then(async ({createStudentAvatar})=>{
      const next=createStudentAvatar({height,seated:true,firstPerson:true,progressive:true});
      void next.ready.catch(error=>{
        if (choice==='orange-cat' && anchor.visible && orangeCat===next) onError(error,'detail');
      });
      await next.bodyReady;
      orangeCat=next;
      next.object.visible=false;
      anchor.add(next.object);
      showAppearance();
    }).catch(error=>{
      if (choice==='orange-cat' && anchor.visible) onError(error,'body');
    }).finally(()=>{loading=null;});
  }

  function setAppearance(next) {
    choice=next;
    showAppearance();
    if (anchor.visible) preload();
  }

  function resetInput() {
    hands.reset();
    pose.leftHand=pose.rightHand=null;
  }

  function setSeat({x,y,z,yaw}) {
    anchor.position.set(x,y,z);
    // The cat faces +Z in its asset, while chairs face -Z at yaw zero.
    anchor.rotation.y=yaw+Math.PI;
  }

  function setVisible(visible, {tracked:useTracking=false} = {}) {
    const nextTracking=visible && useTracking;
    if (tracked!==nextTracking || (anchor.visible && !visible)) resetInput();
    tracked=nextTracking;
    if (visible) preload();
    if (anchor.visible===visible) return;
    anchor.visible=visible;
    onChange();
  }

  function eyePosition(out) {
    // Both representations register their eye and body coordinates to the chair.
    return anchor.localToWorld(out.copy(avatar.eyePosition));
  }

  function toLocal(target, hand) {
    if (!hand.strength) return null;
    target.position.copy(hand.position).applyMatrix4(inverseAnchor);
    target.quaternion.copy(hand.quaternion).premultiply(inverseRotation);
    target.strength=hand.strength;
    return target;
  }

  function update(time, {frame,referenceSpace,rig,dt} = {}) {
    if (!anchor.visible) return;
    if (tracked) {
      const wrists=hands.update(frame,referenceSpace,rig,dt);
      anchor.updateWorldMatrix(true,false);
      inverseAnchor.copy(anchor.matrixWorld).invert();
      anchor.getWorldQuaternion(inverseRotation).invert();
      pose.leftHand=toLocal(left,wrists.leftHand);
      pose.rightHand=toLocal(right,wrists.rightHand);
    }
    avatar.update(time,pose);
  }

  return {setSeat,setVisible,setAppearance,preload,eyePosition,resetInput,update};
}
