import * as THREE from './three.module.min.js';

const clamp=THREE.MathUtils.clamp;
const smooth=x=>{const t=clamp(x,0,1);return t*t*t*(t*(t*6-15)+10);};
function envelope(t,attack,hold,release){
  if(t<0)return 0;
  if(t<attack)return smooth(t/attack);
  if(t<attack+hold)return 1;
  return 1-smooth((t-attack-hold)/release);
}
function damp(value,target,dt,tau){
  const omega=2/tau,decay=Math.exp(-omega*dt),offset=value.value-target;
  const change=(value.velocity+omega*offset)*dt;
  value.velocity=(value.velocity-omega*change)*decay;
  value.value=target+(offset+change)*decay;
  return value.value;
}

// Bind the original face, including glasses, rather than rotating the full cat.
export function prepareHeadMesh(original){
  const mesh=new THREE.SkinnedMesh(original.geometry,original.material);
  mesh.name=original.name;mesh.position.copy(original.position);
  mesh.quaternion.copy(original.quaternion);mesh.scale.copy(original.scale);
  mesh.userData={...original.userData};mesh.frustumCulled=false;
  mesh.morphTargetDictionary={...original.morphTargetDictionary};
  mesh.morphTargetInfluences=[...(original.morphTargetInfluences||[])];
  for(const child of [...original.children])mesh.add(child);
  original.parent.add(mesh);original.removeFromParent();
  return mesh;
}

export function bindHead(mesh){
  const geometry=mesh.geometry,position=geometry.attributes.position;
  const indices=new Uint16Array(position.count*4),weights=new Float32Array(position.count*4);
  for(let i=0;i<position.count;i++){
    // The cut at the collar remains pinned; the face above this short neck band
    // moves rigidly, so cheeks, ears and glasses keep their proportions.
    const weight=smooth((position.getY(i)-.002)/.043),offset=i*4;
    indices[offset]=0;indices[offset+1]=1;weights[offset]=1-weight;weights[offset+1]=weight;
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  mesh.boundingBox=geometry.boundingBox.clone().expandByScalar(.016);
  mesh.boundingSphere=geometry.boundingSphere.clone();mesh.boundingSphere.radius+=.016;
  const root=new THREE.Bone(),joint=new THREE.Bone();root.name='Collar anchor';joint.name='Gentle head joint';
  const pivot=new THREE.Vector3(0,.008,0);joint.position.copy(pivot);root.add(joint);mesh.add(root);
  mesh.updateWorldMatrix(true,true);const skeleton=new THREE.Skeleton([root,joint]);mesh.bind(skeleton);
  const pose=new THREE.Matrix4(),inversePivot=new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z);
  const attachments=new THREE.Group();attachments.name='Head attachments';attachments.matrixAutoUpdate=false;mesh.add(attachments);
  // Fur consumes the same local transform on the GPU; no per-frame mesh copy.
  mesh.userData.headPoseMatrix=pose;
  return {attachments,update(pitch,tilt,yaw=0){
    joint.rotation.set(pitch,yaw,tilt,'YXZ');
    pose.makeRotationFromQuaternion(joint.quaternion);pose.setPosition(pivot);pose.multiply(inversePivot);
    attachments.matrix.copy(pose);attachments.matrixWorldNeedsUpdate=true;
    mesh.parent.updateWorldMatrix(true,false);mesh.updateMatrixWorld(true);skeleton.update();
  }};
}

// Small gestures are driven by classroom intent. Randomness changes each gesture
// gently at its start; it never injects noise into a moving pose.
export function createTeacherPresence(){
  const rand=(a,b)=>a+(b-a)*Math.random();
  let state='idle',active=false,speaking=false,paused=false,clock=0;
  let gesture=null,nextBlink=3+Math.random()*3,blinkStart=-100,lastGesture=-100,lastAccent=-100;
  let nextIdleSmile=rand(6,10);
  let blinkClose=.095,blinkOpen=.15;
  const pitch={value:0,velocity:0},tilt={value:0,velocity:0},yaw={value:0,velocity:0};
  function cue(kind,force=false){
    if(!force&&clock-lastGesture<2.7)return;
    const settings={
      welcome:{pitch:.025,smile:.36,attack:.34,hold:.13,release:.62},
      listen:{pitch:.012,tilt:rand(.032,.047)*(Math.random()<.5?-1:1),smile:.12,attack:.39,hold:.55,release:.86},
      acknowledge:{pitch:rand(.019,.028),smile:.13,attack:.28,hold:.08,release:.48},
      explain:{pitch:.019,yaw:.047,tilt:-.010,smile:.15,attack:.38,hold:.17,release:.68},
      finish:{pitch:rand(.012,.018),smile:.29,attack:.32,hold:.18,release:.73},
      look:{tilt:rand(.021,.033)*(Math.random()<.5?-1:1),smile:.22,attack:.37,hold:.32,release:.72},
      accent:{pitch:.010,smile:.12,attack:.28,hold:.05,release:.48},
      'idle-smile':{smile:rand(.19,.23),attack:.38,hold:.18,release:.64},
    };
    gesture={...settings[kind],kind,start:clock};lastGesture=clock;
  }
  function setState(next){
    if(!['idle','listening','thinking','responding','settled'].includes(next)||state===next)return;
    state=next;if(!active)return;
    if(next==='listening'){gesture=null;cue('listen',true);}
    else if(next==='thinking'){gesture=null;cue('acknowledge',true);nextBlink=clock+rand(.6,1.1);}
    else if(next==='responding'&&!speaking)cue('finish');
    else if(next==='idle'||next==='settled')nextIdleSmile=clock+rand(6,10);
  }
  function setSpeech(event){
    if(event.type==='start'){
      speaking=true;paused=false;lastAccent=clock;
      if(active)cue('explain',true);
    }
    else if(event.type==='resume'){speaking=true;paused=false;}
    else if(event.type==='pause')paused=true;
    else if(event.type==='stop'){
      const completed=speaking;speaking=false;paused=false;
      if(completed){
        nextIdleSmile=clock+rand(7,11);
        if(active&&!['thinking','listening'].includes(state))cue('finish',true);
      }
    }else if(event.type==='boundary'&&event.name==='sentence'&&speaking&&!paused&&clock-lastAccent>9){
      cue('accent');lastAccent=clock;
    }
  }
  function setActive(value){
    if(value===active)return;active=value;
    nextIdleSmile=clock+rand(6,10);
    if(!active){state='idle';gesture=null;speaking=false;paused=false;}
  }
  function react(kind){
    if(speaking||active&&['thinking','listening'].includes(state))return;
    cue(kind==='welcome'?'welcome':'look',kind==='welcome');
  }
  function update(dt,{reducedMotion=false,xr=false}={}){
    clock+=dt;
    let smile=active?(state==='thinking'?.035:state==='listening'?.075:.10):0;
    if(speaking&&!paused)smile=.09;
    if(reducedMotion&&gesture?.kind==='idle-smile'){
      gesture=null;
      nextIdleSmile=clock+rand(6,10);
    }
    if(!reducedMotion&&!speaking&&!gesture&&(state==='idle'||state==='settled')&&
        clock>=nextIdleSmile&&clock-lastGesture>=2.7){
      cue('idle-smile');
      nextIdleSmile=clock+rand(14,24);
    }
    let headPitch=0,headTilt=0,headYaw=0;
    if(gesture){
      const e=envelope(clock-gesture.start,gesture.attack,gesture.hold,gesture.release);
      smile=Math.max(smile,gesture.smile*e);
      headPitch=(gesture.pitch||0)*e;headTilt=(gesture.tilt||0)*e;headYaw=(gesture.yaw||0)*e;
      if(clock-gesture.start>=gesture.attack+gesture.hold+gesture.release)gesture=null;
    }
    if(!reducedMotion&&clock>=nextBlink){
      blinkStart=clock;
      blinkClose=rand(.085,.105);blinkOpen=rand(.128,.172);
      nextBlink=clock+rand(3.8,7.4);
    }
    const blink=reducedMotion?0:envelope(clock-blinkStart,blinkClose,.026,blinkOpen);
    const lid=Math.max(smile*.10,blink),amount=reducedMotion?0:xr?.55:1;
    return {smile,lid,pitch:damp(pitch,headPitch*amount,dt,.13),tilt:damp(tilt,headTilt*amount,dt,.18),yaw:damp(yaw,headYaw*amount,dt,.17)};
  }
  return {setState,setSpeech,setActive,react,update};
}
