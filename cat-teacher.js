import * as THREE from './three.module.min.js';

const VERSION='refined-cat-22';
const TOPOLOGY_VERSION='fluid-cat-6';
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
export function createTailMotion(meshes,tailRig,onMotion=()=>{}){
  const mesh=meshes.find(object=>object.geometry.attributes.position.count===tailRig.vertexCount);
  if(!mesh||tailRig.assetVersion!==TOPOLOGY_VERSION)throw new Error('Tail rig does not match the teacher asset.');
  const source=mesh.geometry;
  if(source.morphAttributes.position?.length)throw new Error('The tail must attach only to the neutral body mesh.');
  // Install a fresh geometry once, then update its existing position buffer.
  // This standard BufferAttribute path also avoids adding morph layouts after a draw.
  const geometry=source.clone(),original=source.getAttribute('position');
  const values=new Float32Array(original.count*3);
  for(let i=0;i<original.count;i++){values[i*3]=original.getX(i);values[i*3+1]=original.getY(i);values[i*3+2]=original.getZ(i);}
  const position=new THREE.BufferAttribute(values,3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',position);mesh.geometry=geometry;source.dispose();
  if(geometry.boundingBox)geometry.boundingBox.expandByScalar(.04);
  if(geometry.boundingSphere)geometry.boundingSphere.radius+=.04;
  const pivot=[.075,.07,-.075],vertices=[];
  let first=original.count,last=0,tipIndex=0,tipWeight=-1;
  for(let i=0;i<tailRig.weights.length;i+=2){
    const index=tailRig.weights[i],weight=tailRig.weights[i+1],offset=index*3;
    vertices.push({index,offset,weight,x:values[offset]-pivot[0],y:values[offset+1]-pivot[1],z:values[offset+2]-pivot[2]});
    first=Math.min(first,index);last=Math.max(last,index);
    if(weight>tipWeight){tipIndex=index;tipWeight=weight;}
  }
  const tipRest=[values[tipIndex*3],values[tipIndex*3+1],values[tipIndex*3+2]];
  mesh.userData.tailVertexSet=new Set(vertices.map(vertex=>vertex.index));
  const seed=Math.random()*Math.PI*2,seed2=Math.random()*Math.PI*2;
  let origin=null,lastReport=-Infinity,lastMode;
  return (elapsedSeconds,reducedMotion=false)=>{
    if(!Number.isFinite(elapsedSeconds))return;
    if(origin===null)origin=elapsedSeconds;
    const t=Math.max(0,elapsedSeconds-origin);
    // Closed-form wall-time motion: low FPS cannot slow the cat's clock.
    const phase=seed+.92*t+.12*Math.sin(.19*t+seed2)+.07*Math.sin(.31*t+seed);
    const envelope=1-(1+t/.7)*Math.exp(-t/.7);
    const amplitude=reducedMotion?0:envelope*(.65+.10*Math.sin(.17*t+seed)+.05*Math.sin(.29*t+seed2));
    for(const vertex of vertices){
      const {offset,weight,x,y,z}=vertex,lag=.32*weight;
      const swing=.16*amplitude*weight*Math.sin(phase-lag);
      const follow=.025*amplitude*weight*weight*Math.sin(phase-.45-lag);
      const ca=Math.cos(swing),sa=Math.sin(swing),cb=Math.cos(follow),sb=Math.sin(follow);
      const bentX=ca*x-sa*y,bentY=sa*x+ca*y;
      values[offset]=pivot[0]+cb*bentX+sb*z;
      values[offset+1]=pivot[1]+bentY;
      values[offset+2]=pivot[2]-sb*bentX+cb*z;
    }
    position.clearUpdateRanges();position.addUpdateRange(first*3,(last-first+1)*3);position.needsUpdate=true;
    const mode=reducedMotion?'reduced':'active';
    if(t-lastReport>=1||lastMode!==mode){
      lastReport=t;lastMode=mode;
      onMotion({mode,pose:tipRest.map((value,k)=>Number((values[tipIndex*3+k]-value).toFixed(6)))});
    }
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
  let updateTail=()=>{},updateFur=()=>{};
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
            if(original.map)original.map.anisotropy=16;
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
      const tailReady=import('./cat-tail-rig.js?v=time-tail-19').then(({default:tailRig})=>{
        clearTimeout(tailTimer);
        updateTail=createTailMotion(bodyMeshes,tailRig,detail=>onState('teacher-tail-motion',detail));onState('teacher-tail-ready');
      }).catch(()=>{clearTimeout(tailTimer);onState('teacher-tail-error');});
      // Fine strands are an optional detail layer; the classroom/model render first.
      Promise.all([tailReady,import('./cat-fur.js?v=refined-cat-22')]).then(async([,{attachFineFur}])=>{
        updateFur=await attachFineFur(bodyMeshes[0],faceMeshes[0]);
        onState('teacher-detail-ready');
      }).catch(error=>{console.warn('Teacher fine fur is unavailable.',error);onState('teacher-detail-error');});
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
  function update(dt,{reducedMotion=false,xr=false,time=null}={}){
    if(!model)return;clock+=dt;
    updateTail(Number.isFinite(time)?time:clock,reducedMotion);
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
    updateFur();
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
