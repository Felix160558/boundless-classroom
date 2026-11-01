import * as THREE from './three.module.min.js';
import {GLTFLoader} from './GLTFLoader.js';
import {MeshoptDecoder} from './meshopt_decoder.mjs';

// The original character and supplied expression meshes share one small download.
// Expressions are rigid poses: never squash, stretch or deform the face.
export function createCatTeacher(onState=()=>{}) {
  const group=new THREE.Group();group.position.set(-2.55,.1,.35);group.rotation.y=.25;
  const heads=new Map(),headMeshes=new Map(),materials=new Map();
  const bounds=new THREE.Box3(),headBounds=new THREE.Box3(),point=new THREE.Vector3();
  const deltaRotation=new THREE.Quaternion(),euler=new THREE.Euler();
  let model=null,body=null,bodyMeshes=[],expression='neutral',reaction=null,pending=null;
  let clock=0,nextBlink=5.2,blinkUntil=0,tapNumber=0,lastTap=-10,inClassroom=false;
  const meshList=node=>{const list=[];node.traverse(object=>{if(object.isMesh)list.push(object);});return list;};
  function face(name){
    if(expression===name&&model)return;
    expression=name;
    for(const [key,head] of heads)head.object.visible=key===name;
  }
  function react(kind='tap',direction=0){
    if(!model){pending={kind,direction};return;}
    if(kind==='tap'&&clock-lastTap<.45)return;
    if(kind==='look'&&reaction)return;
    if(kind==='tap'){lastTap=clock;tapNumber++;}
    reaction={kind,direction:THREE.MathUtils.clamp(direction,-1,1),elapsed:0,
      duration:kind==='welcome'?2.5:kind==='tap'?1.9:1.6,
      face:kind==='tap'&&tapNumber%2===1?'wink':'happy'};
    blinkUntil=0;
  }
  async function load(){
    onState('teacher-loading');
    try{
      const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const asset=await loader.loadAsync(new URL('./cat-teacher.glb?v=lively-cat-5',import.meta.url).href,event=>{
        if(event.total>0)onState('teacher-progress',Math.min(99,Math.round(event.loaded/event.total*100)));
      });
      const teacher=asset.scene;body=teacher.getObjectByName('Body');
      const neutral=teacher.getObjectByName('Face_neutral');
      if(!body||!neutral)throw new Error('The teacher asset is incomplete.');
      teacher.updateWorldMatrix(true,true);
      bounds.setFromObject(body);bounds.union(headBounds.setFromObject(neutral));
      const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const fit=2.25/Math.max(size.y,.001);teacher.scale.setScalar(fit);
      teacher.position.set(-center.x*fit,-bounds.min.y*fit,-center.z*fit);
      teacher.traverse(object=>{
        if(object.name.startsWith('Face_')){
          const name=object.name.slice(5);
          heads.set(name,{object,rotation:object.quaternion.clone()});
          headMeshes.set(name,meshList(object));object.visible=name==='neutral';
        }
        if(!object.isMesh)return;
        object.castShadow=true;object.receiveShadow=false;
        const convert=original=>{
          if(!materials.has(original))materials.set(original,new THREE.MeshBasicMaterial({
            map:original.map,color:original.color,side:original.side,toneMapped:false
          }));
          return materials.get(original);
        };
        object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
      });
      for(const original of materials.keys())original.dispose();
      bodyMeshes=meshList(body);model=teacher;group.add(model);face('neutral');
      onState('teacher-ready');
      const first=pending||(inClassroom?{kind:'welcome',direction:0}:null);pending=null;
      if(first)react(first.kind,first.direction);
    }catch(error){
      console.warn('The cat teacher could not be loaded.',error);onState('teacher-error');
    }
  }
  function setClassroomMode(active){
    if(active&&!inClassroom)react('welcome');
    if(!active&&pending?.kind==='welcome')pending=null;
    inClassroom=active;
  }
  function update(dt,{reducedMotion=false,xr=false}={}){
    if(!model)return;
    clock+=dt;
    let x=0,y=0,z=0;
    if(reaction){
      reaction.elapsed+=dt;
      const t=Math.min(1,reaction.elapsed/reaction.duration),arc=Math.sin(Math.PI*t);
      face(t>.08&&t<.8?reaction.face:'neutral');
      if(!reducedMotion&&!xr){
        x=arc*.022*(reaction.kind==='welcome'?1:-.5);
        z=arc*(reaction.face==='wink'?-.032:.018);
        y=arc*reaction.direction*.035;
      }
      if(t===1){reaction=null;face('neutral');nextBlink=clock+4.5;}
    }else if(!reducedMotion&&!xr){
      if(clock>=nextBlink){blinkUntil=clock+.15;nextBlink=clock+5.2+(Math.sin(clock*7)+1)*1.4;}
      face(clock<blinkUntil?'blink':'neutral');
    }else face('neutral');
    // All movement is rigid and small; the original face proportions stay fixed.
    deltaRotation.setFromEuler(euler.set(x,y,z));
    for(const head of heads.values())head.object.quaternion.copy(head.rotation).multiply(deltaRotation);
    group.position.y=.1+(!reducedMotion&&!xr?Math.sin(clock*1.5)*.004:0);
  }
  function hitTest(raycaster,precise=false){
    if(!model)return false;
    group.updateWorldMatrix(true,true);
    bounds.setFromObject(body);bounds.union(headBounds.setFromObject(heads.get(expression).object));
    if(!raycaster.ray.intersectBox(bounds,point))return false;
    return !precise||raycaster.intersectObjects([...bodyMeshes,...headMeshes.get(expression)],false).length>0;
  }
  return {group,load,react,update,hitTest,setClassroomMode};
}
