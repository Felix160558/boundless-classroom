import * as THREE from '../three.module.min.js';
import {createBlockStudent} from './block-student.js?v=block-vr-56';
import {LOUNGE_MIRROR_LAYER} from './lounge-mirror.js?v=frog-peer-74';

const floorY=-1.92;
const standingHeight=1.84;
const blockHeight=1.4;
const appearances=new Set(['simple','orange-cat','frog-girl']);

function standingBlock(){
  const avatar=createBlockStudent({height:standingHeight});
  const figure=avatar.object.children[0];
  // Keep the participant's existing block palette and head. In the lounge,
  // line the upper/lower blocks up with the shoes instead of the chair.
  const stance=new Map([
    [.716,{y:.505,z:-.043,height:.339,depth:.179}],
    [.450,{y:.229,z:-.044,height:.237,depth:.150}],
    [.171,{y:.063,z:-.005,height:.126,depth:.233}],
  ]);
  for(const piece of figure.children){
    const leg=piece.isMesh?stance.get(piece.position.y):null;
    if(!leg)continue;
    piece.position.y=leg.y;
    piece.position.z=leg.z;
    piece.scale.y=leg.height;
    piece.scale.z=leg.depth;
  }
  const bounds=new THREE.Box3().setFromObject(avatar.object);
  avatar.object.scale.setScalar(standingHeight/(bounds.max.y-bounds.min.y));
  const left=restWrist(1),right=restWrist(-1);
  function restWrist(side){
    return {position:new THREE.Vector3(side*.234,.704,.014).multiplyScalar(standingHeight/blockHeight),
      quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.33),strength:1};
  }
  return {object:avatar.object,update(time,still){
    avatar.update(time,{leftHand:left,rightHand:right,headYaw:still?0:.018*Math.sin(.81*time)});
  }};
}

async function standingCat(){
  const {createStudentAvatar}=await import('./student-avatar.js?v=block-vr-56');
  const avatar=createStudentAvatar({height:1.8,seated:false});
  await avatar.ready;
  // The backing mesh defines floor height. The billboard planes do not.
  const body=avatar.object.getObjectByName('Body');
  if(body){
    const bounds=new THREE.Box3().setFromObject(body);
    avatar.object.position.y-=bounds.min.y;
  }
  return {object:avatar.object,update(time,still){
    avatar.update(still?0:time,{raise:0,tail:still?0:.68});
  }};
}

async function standingFrog(){
  const [{loadFrogCharacter},{createFrogIdle}]=await Promise.all([
    import('../frog-girl/frog-character.js?v=frog-hair-73'),
    import('../frog-girl/frog-motion.js?v=frog-leaf-70'),
  ]);
  const avatar=await loadFrogCharacter({height:1.86});
  if(!avatar.finish)throw new Error('Frog Girl refinements could not load.');
  avatar.finish.show('repaired');
  const idle=await createFrogIdle(avatar.upperBody);
  return {object:avatar.group,update(time,still){idle.update(time,{still});}};
}

export function createLoungeMirrorAvatar(parent,onChange=()=>{}){
  const group=new THREE.Group();
  group.name='Reservation mirror self avatar';
  group.visible=false;
  group.layers.set(LOUNGE_MIRROR_LAYER);
  group.position.y=floorY;
  parent.add(group);
  const available=new Map(),loading=new Set();
  let active=false,appearance='simple',current=null,startTime=null;

  function attach(key,avatar){
    avatar.object.traverse(object=>{
      object.layers.set(LOUNGE_MIRROR_LAYER);
      // The reflected body should not cast a shadow in the direct room view.
      object.castShadow=false;
    });
    avatar.object.visible=false;
    group.add(avatar.object);
    available.set(key,avatar);
  }
  function show(){
    const avatar=available.get(appearance)??available.get('simple');
    if(avatar===current)return;
    if(current)current.object.visible=false;
    avatar.object.visible=true;
    current=avatar;
    startTime=null;
    onChange();
  }
  function loadSelected(){
    if(!active||available.has(appearance)||loading.has(appearance))return;
    const key=appearance;
    const create=key==='frog-girl'?standingFrog:standingCat;
    loading.add(key);
    void create().then(avatar=>{
      attach(key,avatar);
      if(active)show();
    }).catch(error=>console.warn('The selected mirror avatar could not load.',error))
      .finally(()=>loading.delete(key));
  }
  attach('simple',standingBlock());
  current=available.get('simple');
  current.object.visible=true;
  return {
    group,
    setAppearance(value){
      appearance=appearances.has(value)?value:'simple';
      show();
      loadSelected();
    },
    setActive(value){
      const next=Boolean(value);
      if(next===active)return;
      active=next;
      group.visible=active;
      startTime=null;
      if(active){show();loadSelected();}
      onChange();
    },
    update(timeSeconds,{localViewer,lookYaw=0,reducedMotion=false}={}){
      if(!active)return;
      if(localViewer)group.position.set(localViewer.x,floorY,localViewer.z);
      group.rotation.y=lookYaw+Math.PI;
      startTime??=timeSeconds;
      current.update(Math.max(0,timeSeconds-startTime),reducedMotion);
    },
  };
}
