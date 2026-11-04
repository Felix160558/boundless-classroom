import * as THREE from './three.module.min.js';

const VERSION='fluid-cat-6';
const ease=x=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*t*(t*(t*6-15)+10);};
function envelope(t,attack,hold,release){
  if(t<0)return 0;
  if(t<attack)return ease(t/attack);
  if(t<attack+hold)return 1;
  return 1-ease((t-attack-hold)/release);
}
// Critically damped weights retain their position AND velocity when interrupted.
function approach(state,target,dt,tau){
  const omega=2/tau,decay=Math.exp(-omega*dt),offset=state.value-target;
  const step=(state.velocity+omega*offset)*dt;
  state.velocity=(state.velocity-omega*step)*decay;
  state.value=THREE.MathUtils.clamp(target+(offset+step)*decay,0,1);
}

// A soft, connected bend of the existing tail surface, anchored at its root.
// Geometry, original texture, head shape and character scale stay untouched.
function createTailMotion(meshes,tailRig){
  const mesh=meshes.find(object=>object.geometry.attributes.position.count===tailRig.vertexCount);
  if(!mesh||tailRig.assetVersion!==VERSION)throw new Error('Tail rig does not match the teacher asset.');
  const weights=new Float32Array(tailRig.vertexCount);
  for(let i=0;i<tailRig.weights.length;i+=2)weights[tailRig.weights[i]]=tailRig.weights[i+1];
  mesh.geometry.setAttribute('teacherTailWeight',new THREE.BufferAttribute(weights,1));
  const motion=new THREE.Vector4();
  const shader=material=>{
    material.onBeforeCompile=program=>{
      program.uniforms.teacherTailMotion={value:motion};
      program.vertexShader='uniform vec4 teacherTailMotion;\nattribute float teacherTailWeight;\n'+program.vertexShader.replace('#include <project_vertex>',
        'float teacherTailPhase = teacherTailMotion.z - 0.32 * teacherTailWeight;\n'+
        'transformed.x += teacherTailMotion.x * teacherTailWeight * (sin(teacherTailPhase) + 0.14 * sin(teacherTailMotion.w + 1.8 - 0.42 * teacherTailWeight));\n'+
        'transformed.z += teacherTailMotion.y * teacherTailWeight * teacherTailWeight * sin(teacherTailPhase - 0.45);\n#include <project_vertex>');
    };
    material.customProgramCacheKey=()=> 'boundless-gentle-tail-16';return material;
  };
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(material=>shader(material.clone())):shader(mesh.material.clone());
  const side=Array.isArray(mesh.material)?mesh.material[0].side:mesh.material.side;
  mesh.customDepthMaterial=shader(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side}));
  if(mesh.geometry.boundingBox)mesh.geometry.boundingBox.expandByScalar(.022);
  if(mesh.geometry.boundingSphere)mesh.geometry.boundingSphere.radius+=.022;
  const amplitude={value:0,velocity:0},speed={value:.85,velocity:0};
  let phase=Math.random()*Math.PI*2,followPhase=phase*.63,clock=0,nextChange=0,targetAmplitude=.55,targetSpeed=.85;
  function damp(state,target,dt,tau){
    const omega=2/tau,decay=Math.exp(-omega*dt),difference=state.value-target,step=(state.velocity+omega*difference)*dt;
    state.velocity=(state.velocity-omega*step)*decay;state.value=target+(difference+step)*decay;
  }
  return (dt,reducedMotion)=>{
    clock+=dt;
    if(clock>=nextChange){targetAmplitude=.4+Math.random()*.45;targetSpeed=.65+Math.random()*.45;nextChange=clock+4+Math.random()*6;}
    damp(amplitude,reducedMotion?0:targetAmplitude,dt,1.8);damp(speed,targetSpeed,dt,2.2);
    phase=(phase+dt*speed.value)%(Math.PI*2);followPhase=(followPhase+dt*speed.value*.63)%(Math.PI*2);
    motion.set(.018*amplitude.value,.002*amplitude.value,phase,followPhase);
  };
}

// Curved eyelids gradually cover the original, stationary eyes. Glasses and
// eyeballs are never scaled or replaced. The small lids reuse the original fur map.
function createEyelid(rig,material,parent){
  const layers=[],columns=28,rows=12,creasePoints=columns+1;
  const creaseGeometry=new THREE.BufferGeometry();
  creaseGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(creasePoints*3),3).setUsage(THREE.DynamicDrawUsage));
  const crease=new THREE.Line(creaseGeometry,new THREE.LineBasicMaterial({color:0x755235,transparent:true,opacity:0,depthWrite:false}));
  crease.frustumCulled=false;parent.add(crease);
  function depth(x,y){
    const g=rig.grid,u=THREE.MathUtils.clamp((x+1)*.5*(g-1),0,g-1),v=THREE.MathUtils.clamp((y+1)*.5*(g-1),0,g-1);
    const x0=Math.floor(u),y0=Math.floor(v),x1=Math.min(g-1,x0+1),y1=Math.min(g-1,y0+1);
    const a=THREE.MathUtils.lerp(rig.depthGrid[y0*g+x0],rig.depthGrid[y0*g+x1],u-x0);
    const b=THREE.MathUtils.lerp(rig.depthGrid[y1*g+x0],rig.depthGrid[y1*g+x1],u-x0);
    return THREE.MathUtils.lerp(a,b,v-y0);
  }
  for(const upper of [true,false]){
    const geometry=new THREE.BufferGeometry(),positions=new Float32Array((columns+1)*(rows+1)*3),uvs=new Float32Array((columns+1)*(rows+1)*2),indices=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
      const k=j*(columns+1)+i;
      uvs[k*2]=rig.furUV[0]+(i/columns-.5)*.003;
      uvs[k*2+1]=rig.furUV[1]+(j/rows-.5)*.003;
      if(i<columns&&j<rows){const b=k+columns+1;indices.push(k,b,k+1,k+1,b,b+1);}
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(indices);
    const lid=new THREE.Mesh(geometry,material);lid.visible=false;lid.frustumCulled=false;parent.add(lid);
    layers.push({upper,lid,geometry,positions});
  }
  let previous=-1;
  return amount=>{
    if(Math.abs(amount-previous)<.00001)return;previous=amount;
    for(const layer of layers){
      layer.lid.visible=amount>.0001;
      for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
        const x=i/columns*2-1,edge=Math.sqrt(Math.max(0,1-x*x));
        const outer=(layer.upper?1:-1)*edge,closed=.12*edge;
        const seam=THREE.MathUtils.lerp(outer,closed,amount);
        const y=THREE.MathUtils.lerp(outer,seam,j/rows),k=(j*(columns+1)+i)*3;
        layer.positions[k]=rig.center[0]+x*rig.radius[0];
        layer.positions[k+1]=rig.center[1]+y*rig.radius[1];
        layer.positions[k+2]=depth(x,y);
      }
      layer.geometry.attributes.position.needsUpdate=true;
    }
    crease.visible=amount>.01;crease.material.opacity=amount*amount*.58;
    const line=creaseGeometry.attributes.position;
    for(let i=0;i<=columns;i++){
      const x=i/columns*2-1,edge=Math.sqrt(Math.max(0,1-x*x)),y=THREE.MathUtils.lerp(edge,.12*edge,amount);
      line.setXYZ(i,rig.center[0]+x*rig.radius[0],rig.center[1]+y*rig.radius[1],depth(x,y)+.0001);
    }
    line.needsUpdate=true;
  };
}

async function readModel(url,onProgress){
  let cache=null;
  try{if('caches'in globalThis)cache=await caches.open('boundless-teacher-model-v1');}catch{}
  if(cache){
    try{const saved=await cache.match(url);if(saved)return {bytes:await saved.arrayBuffer(),cache,stored:null};}catch{}
  }
  const controller=new AbortController();let stalled;
  const keepAlive=()=>{clearTimeout(stalled);stalled=setTimeout(()=>controller.abort(),45000);};
  keepAlive();
  try{
    const response=await fetch(url,{credentials:'same-origin',priority:'low',signal:controller.signal});
    if(!response.ok)throw new Error('Model download failed: '+response.status);
    const stored=cache?response.clone():null,total=Number(response.headers.get('content-length'))||0;
    if(!response.body?.getReader)return {bytes:await response.arrayBuffer(),cache,stored};
    const reader=response.body.getReader(),chunks=[];let length=0;
    for(;;){const {value,done}=await reader.read();if(done)break;keepAlive();chunks.push(value);length+=value.length;if(total)onProgress(Math.min(99,Math.round(length/total*100)));}
    const bytes=new Uint8Array(length);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return {bytes:bytes.buffer,cache,stored};
  }finally{clearTimeout(stalled);}
}
async function storeModel(cache,url,response){
  if(!cache||!response)return;
  try{
    await cache.put(url,response);
    const path=new URL(url).pathname;
    for(const key of await cache.keys())if(new URL(key.url).pathname===path&&key.url!==url)await cache.delete(key);
  }catch{} // Cache restrictions never prevent the normal classroom from loading.
}

export function createCatTeacher(onState=()=>{}) {
  const group=new THREE.Group();group.position.set(-2.55,.1,.35);group.rotation.y=.25;
  const bounds=new THREE.Box3(),headBounds=new THREE.Box3(),point=new THREE.Vector3();
  const materials=new Map(),morphs=[],eyelids=[];
  const smile={value:0,velocity:0},left={value:0,velocity:0},right={value:0,velocity:0};
  let model=null,body=null,head=null,bodyMeshes=[],faceMeshes=[],reaction=null,pending=null;
  let clock=0,nextBlink=5.2,blinkStarted=-100,tapNumber=0,lastTap=-10,inClassroom=false;
  let updateTail=()=>{};
  const meshList=node=>{const list=[];node.traverse(object=>{if(object.isMesh)list.push(object);});return list;};
  function react(kind='tap',direction=0){
    if(!model){pending={kind,direction};return;}
    if(kind==='tap'&&clock-lastTap<.5)return;
    if(kind==='look'&&reaction)return;
    if(kind==='tap'){lastTap=clock;tapNumber++;}
    const welcome=kind==='welcome',look=kind==='look';
    reaction={kind,direction:THREE.MathUtils.clamp(direction,-1,1),elapsed:0,
      attack:welcome ? .65 : look ? .45 : .5,
      hold:welcome ? .9 : look ? .45 : .75,release:welcome ? .85 : look ? .65 : .7,
      amount:welcome ? 1 : look ? .55 : .85,wink:kind==='tap'&&tapNumber%2===1};
    // Leave the current facial weights and their velocities untouched.
  }
  async function load(){
    onState('teacher-loading');
    const url=new URL('./cat-teacher.glb?v='+VERSION,import.meta.url).href;
    let cached=null;
    try{
      // Downloads and decoding tools are independent of the first classroom render.
      const [download,{GLTFLoader},{MeshoptDecoder}]=await Promise.all([
        readModel(url,percent=>onState('teacher-progress',percent)),
        import('./GLTFLoader.js'),import('./meshopt_decoder.mjs')
      ]);cached=download.cache;
      const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const asset=await loader.parseAsync(download.bytes,new URL('./',import.meta.url).href);
      const teacher=asset.scene;body=teacher.getObjectByName('Body');head=teacher.getObjectByName('Face_neutral');
      if(!body||!head)throw new Error('The teacher asset is incomplete.');
      teacher.updateWorldMatrix(true,true);
      // Fit once from the neutral geometry. No expression ever changes this scale.
      bounds.setFromObject(body,true);bounds.union(headBounds.setFromObject(head,true));
      const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const fit=2.25/Math.max(size.y,.001);teacher.scale.setScalar(fit);
      teacher.position.set(-center.x*fit,-bounds.min.y*fit,-center.z*fit);
      teacher.traverse(object=>{
        if(!object.isMesh)return;
        object.castShadow=true;object.receiveShadow=false;
        const convert=original=>{
          if(!materials.has(original)){
            if(original.map)original.map.anisotropy=8;
            materials.set(original,new THREE.MeshBasicMaterial({map:original.map,color:original.color,side:original.side,toneMapped:false}));
          }
          return materials.get(original);
        };
        object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
        if(object.morphTargetInfluences?.length)morphs.push({mesh:object,index:object.morphTargetDictionary?.Smile??0});
      });
      if(!morphs.length||head.userData.eyeRig?.length!==2)throw new Error('The continuous face rig is missing.');
      for(const original of materials.keys())original.dispose();
      bodyMeshes=meshList(body);faceMeshes=meshList(head);
      const faceMaterial=Array.isArray(faceMeshes[0].material)?faceMeshes[0].material[0]:faceMeshes[0].material;
      for(const rig of head.userData.eyeRig)eyelids.push(createEyelid(rig,faceMaterial,head));
      model=teacher;group.add(model);onState('teacher-ready');
      // Optional idle motion must never hold the whole classroom or model hostage.
      const tailTimer=setTimeout(()=>onState('teacher-tail-error'),30000);
      import('./cat-tail-rig.js?v=gentle-tail-16').then(({default:tailRig})=>{
        clearTimeout(tailTimer);
        updateTail=createTailMotion(bodyMeshes,tailRig);onState('teacher-tail-ready');
      }).catch(()=>{clearTimeout(tailTimer);onState('teacher-tail-error');});
      void storeModel(download.cache,url,download.stored);
      const first=pending||(inClassroom?{kind:'welcome',direction:0}:null);pending=null;
      if(first)react(first.kind,first.direction);
    }catch(error){
      if(cached)void cached.delete(url).catch(()=>{});
      console.warn('The cat teacher could not be loaded.',error);onState('teacher-error');
    }
  }
  function setClassroomMode(active){
    if(active&&!inClassroom)react('welcome');
    if(!active&&pending?.kind==='welcome')pending=null;
    inClassroom=active;
  }
  function update(dt,{reducedMotion=false,xr=false}={}){
    if(!model)return;clock+=dt;
    updateTail(dt,reducedMotion);
    let warmth=0,lidLeft=0,lidRight=0,turn=0,lean=0;
    if(reaction){
      reaction.elapsed+=dt;
      const e=envelope(reaction.elapsed,reaction.attack,reaction.hold,reaction.release);
      warmth=e*reaction.amount;lidLeft=lidRight=warmth*.15;
      if(reaction.wink)lidLeft=Math.max(lidLeft,envelope(reaction.elapsed-.5,.16,.12,.24));
      if(!reducedMotion&&!xr){turn=e*reaction.direction*.014;lean=e*(reaction.kind==='welcome' ? .006 : 0);}
      if(reaction.elapsed>=reaction.attack+reaction.hold+reaction.release){reaction=null;nextBlink=clock+4.5;}
    }else if(!reducedMotion&&!xr){
      if(clock>=nextBlink){blinkStarted=clock;nextBlink=clock+5.2+(Math.sin(clock*7)+1)*1.4;}
      lidLeft=lidRight=envelope(clock-blinkStarted,.1,.025,.16);
    }
    approach(smile,warmth,dt,.1);approach(left,lidLeft,dt,.035);approach(right,lidRight,dt,.035);
    for(const {mesh,index} of morphs)mesh.morphTargetInfluences[index]=smile.value;
    eyelids[0](left.value);eyelids[1](right.value);
    // The complete head retains one geometry, one fixed scale and one outline.
    group.rotation.set(lean,.25+turn,0);
    group.position.y=.1+(!reducedMotion&&!xr?Math.sin(clock*1.5)*.002:0);
  }
  function hitTest(raycaster,precise=false){
    if(!model)return false;
    group.updateWorldMatrix(true,true);
    bounds.setFromObject(body);bounds.union(headBounds.setFromObject(head));
    if(!raycaster.ray.intersectBox(bounds,point))return false;
    return !precise||raycaster.intersectObjects([...bodyMeshes,...faceMeshes],false).length>0;
  }
  return {group,load,react,update,hitTest,setClassroomMode};
}
