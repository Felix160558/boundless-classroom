import * as THREE from './three.module.min.js';
import {prepareHeadMesh,bindHead,createTeacherPresence} from './cat-presence.js?v=teacher-presence-26';

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

// The supplied texture's real lip seam: two sloping branches below the philtrum.
// Open the mesh at that seam, keeping original vertex IDs for the fur anchors.
const mouthProfile={center:-.0024,width:.021,y(x){const d=x+.0024;return .08085268-.61131492*Math.abs(d)-1.65960438*d*d+.01470566*d;}};
function splitLipSeam(mesh){
  const geometry=mesh.geometry;
  const attributes=Object.entries(geometry.attributes).map(([name,a])=>({name,size:a.itemSize,values:Array.from({length:a.count*a.itemSize},(_,i)=>a[['getX','getY','getZ','getW'][i%a.itemSize]](Math.floor(i/a.itemSize)))}));
  const morphs=(geometry.morphAttributes.position||[]).map(a=>({size:3,values:Array.from({length:a.count*3},(_,i)=>a[['getX','getY','getZ'][i%3]](Math.floor(i/3)))}));
  const pos=attributes.find(a=>a.name==='position').values;
  const fields=[...attributes,...morphs],sides=new Map(),pairs=new Map(),index=[];
  const sign=i=>pos[i*3+1]-mouthProfile.y(pos[i*3]);
  function edge(a,b){
    if(a>b)[a,b]=[b,a];const key=a+':'+b;
    if(pairs.has(key))return pairs.get(key);
    const fa=sign(a);let lo=0,hi=1;
    for(let k=0;k<18;k++){
      const t=(lo+hi)/2,x=pos[a*3]+(pos[b*3]-pos[a*3])*t,y=pos[a*3+1]+(pos[b*3+1]-pos[a*3+1])*t;
      if((y-mouthProfile.y(x)>=0)===(fa>=0))lo=t;else hi=t;
    }
    const t=(lo+hi)/2,upper=pos.length/3;
    for(const field of fields){for(let k=0;k<field.size;k++)field.values.push(field.values[a*field.size+k]*(1-t)+field.values[b*field.size+k]*t);}
    const lower=pos.length/3;
    for(const field of fields){for(let k=0;k<field.size;k++)field.values.push(field.values[upper*field.size+k]);}
    sides.set(upper,1);sides.set(lower,-1);const pair={upper,lower,x:pos[upper*3]};pairs.set(key,pair);return pair;
  }
  function part(tri,upper){
    const polygon=[];
    for(let i=0;i<3;i++){
      const a=tri[i],b=tri[(i+1)%3],ina=upper?sign(a)>=0:sign(a)<0,inb=upper?sign(b)>=0:sign(b)<0;
      if(ina)polygon.push(a);
      if(ina!==inb){const pair=edge(a,b);polygon.push(upper?pair.upper:pair.lower);}
    }
    for(let i=1;i<polygon.length-1;i++)index.push(polygon[0],polygon[i],polygon[i+1]);
  }
  const original=geometry.index;
  for(let i=0;i<original.count;i+=3){
    const tri=[original.getX(i),original.getX(i+1),original.getX(i+2)],f=tri.map(sign);
    const local=tri.every(v=>Math.abs(pos[v*3]-mouthProfile.center)<.030&&pos[v*3+2]>.100&&pos[v*3+2]<.126);
    if(local&&Math.min(...f)<0&&Math.max(...f)>=0){part(tri,true);part(tri,false);}else index.push(...tri);
  }
  for(const a of attributes)geometry.setAttribute(a.name,new THREE.Float32BufferAttribute(a.values,a.size));
  geometry.morphAttributes.position=morphs.map(a=>new THREE.Float32BufferAttribute(a.values,3));
  geometry.setIndex(index);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const seam=[...pairs.values()].filter(p=>Math.abs(p.x-mouthProfile.center)<=mouthProfile.width+.001).sort((a,b)=>a.x-b.x);
  mesh.userData.mouthSeam=mouthProfile;
  return {sides,seam};
}

// Interior follows the actual lip edges. The original face occludes it naturally.
function createOralDetail(mesh,seam){
  const detail=new THREE.Group();detail.name='Connected lips and oral lining';detail.visible=false;mesh.add(detail);
  const segments=64,rows=12,points=new Float32Array((segments+1)*(rows+1)*3),colors=[],indices=[];
  const inner=new THREE.Color(0x42282b),edgeColor=new THREE.Color(0x93655e),color=new THREE.Color();
  for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){
    color.copy(edgeColor).lerp(inner,Math.sin(j/rows*Math.PI));colors.push(color.r,color.g,color.b);
    if(i<segments&&j<rows){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
  const pocket=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false}));pocket.frustumCulled=false;detail.add(pocket);
  const samples=[];
  function binding(x){
    let k=0;while(k<seam.length-2&&seam[k+1].x<x)k++;
    const a=seam[k],b=seam[Math.min(seam.length-1,k+1)];
    return {a,b,t:THREE.MathUtils.clamp((x-a.x)/Math.max(.000001,b.x-a.x),0,1)};
  }
  for(let i=0;i<=segments;i++)samples.push(binding(mouthProfile.center+mouthProfile.width*(i/segments*2-1)));
  const a=new THREE.Vector3(),b=new THREE.Vector3(),upper=new THREE.Vector3(),lower=new THREE.Vector3();
  function read(bind,side,out){mesh.getVertexPosition(bind.a[side],a);mesh.getVertexPosition(bind.b[side],b);return out.copy(a).lerp(b,bind.t);}
  const teeth=[];
  for(const side of [-1,1]){
    const profile=[[0,-.0025],[.00017,-.00245],[.00043,-.00215],[.00068,-.0014],[.00086,-.0004],[.0009,0],[0,.0002]].map(p=>new THREE.Vector2(...p));
    const toothGeometry=new THREE.LatheGeometry(profile,32);toothGeometry.rotateZ(side*-.10);
    const tooth=new THREE.Mesh(toothGeometry,new THREE.MeshBasicMaterial({color:0xf1e0c6,toneMapped:false}));
    tooth.name=side<0?'Left upper canine':'Right upper canine';tooth.frustumCulled=false;detail.add(tooth);teeth.push({tooth,bind:binding(mouthProfile.center+side*.007)});
  }
  return amount=>{
    detail.visible=amount>.004;if(!detail.visible)return;
    for(let i=0;i<=segments;i++){
      read(samples[i],'upper',upper);read(samples[i],'lower',lower);
      const depth=.0065*Math.pow(Math.sin(Math.PI*i/segments),.5);
      for(let j=0;j<=rows;j++){
        const t=j/rows,k=(j*(segments+1)+i)*3;
        points[k]=THREE.MathUtils.lerp(upper.x,lower.x,t);
        points[k+1]=THREE.MathUtils.lerp(upper.y,lower.y,t);
        points[k+2]=THREE.MathUtils.lerp(upper.z,lower.z,t)-.00012-depth*Math.sin(Math.PI*t);
      }
    }
    geometry.attributes.position.needsUpdate=true;
    for(const {tooth,bind} of teeth){read(bind,'upper',upper);tooth.position.copy(upper);tooth.position.y+=.00065;tooth.position.z-=.0019;}
  };
}

// Two localized mouth poses share the original face and its texture.
// Install before the first draw: eyes, nose, glasses and head scale stay fixed.
function createSpeechMouth(mesh){
  const {sides,seam}=splitLipSeam(mesh);
  const geometry=mesh.geometry,position=geometry.getAttribute('position');
  const opening=new Float32Array(position.count*3),rounding=new Float32Array(position.count*3);
  const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const center=mouthProfile.center;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i),offset=i*3;
    const below=sides.has(i)?sides.get(i)<0:y<mouthProfile.y(x);
    const sideWeight=1-smooth(.55,1,Math.abs(x-center)/mouthProfile.width);
    const weight=below?sideWeight*smooth(.025,.054,y)*smooth(.075,.103,z):0;
    // A small jaw hinge carries the lower lip and chin together; corners taper.
    const angle=.068*weight,dy=y-.052,dz=z-.030;
    opening[offset+1]=Math.cos(angle)*dy-Math.sin(angle)*dz-dy;
    opening[offset+2]=Math.sin(angle)*dy+Math.cos(angle)*dz-dz;
    const radius=((x-center)/.030)**2+((y-.076)/.026)**2;
    const mask=Math.pow(Math.max(0,1-radius),3)*smooth(.100,.114,z);
    rounding[offset]=-.099*(x-center)*mask;rounding[offset+2]=.00099*mask;
  }
  const originalNames={...mesh.morphTargetDictionary},originalWeights=[...(mesh.morphTargetInfluences||[])];
  const targets=geometry.morphAttributes.position;
  const openIndex=targets.length,roundIndex=openIndex+1;
  targets.push(new THREE.BufferAttribute(opening,3),new THREE.BufferAttribute(rounding,3));
  geometry.morphTargetsRelative=true;mesh.updateMorphTargets();
  mesh.morphTargetDictionary={...originalNames,SpeechOpen:openIndex,SpeechRound:roundIndex};
  originalWeights.forEach((value,index)=>{mesh.morphTargetInfluences[index]=value;});
  const open={value:0,velocity:0},round={value:0,velocity:0},gape={value:0,velocity:0};
  const oralDetail=seam.length>1?createOralDetail(mesh,seam):()=>{};
  let active=false,paused=false,time=0,started=0,boundary=-100,dipUntil=-100,speechText='',boundaryStress=0;
  function setSpeech(event={}){
    if(event.type==='start'){active=true;paused=false;started=time;boundary=-100;dipUntil=-100;boundaryStress=0;speechText=String(event.text||'');}
    else if(event.type==='stop'){active=false;paused=false;}
    else if(event.type==='pause')paused=true;
    else if(event.type==='resume'){active=true;paused=false;}
    else if(event.type==='boundary'&&active&&!paused){
      boundary=time;
      const index=Number.isFinite(event.charIndex)?event.charIndex:0;
      const before=String(event.text||speechText).slice(Math.max(0,index-3),index).trimEnd();
      const phrase=speechText.slice(index,index+14);
      boundaryStress=/[!！?？]|重点|关键|记住|注意|important|remember|key\b/i.test(phrase)?.85:((index*13+(speechText.charCodeAt(index)||0))%11<2?.55:.12);
      if(event.name==='sentence'||/[。！？.!?]$/.test(before))dipUntil=time+.12;
      else if(/[，,；;：:]$/.test(before))dipUntil=time+.065;
    }
  }
  function update(dt,reducedMotion){
    time+=dt;
    const t=Math.max(0,time-started),phase=Math.PI*2*(3.65*t+.045*Math.sin(1.8*t)+.025*Math.sin(.73*t));
    const syllable=Math.pow(.5-.5*Math.cos(phase),1.3);
    const variation=.82+.12*Math.sin(2.1*t)+.06*Math.sin(4.3*t+.7);
    const onset=ease(t/.18),accent=Math.exp(-Math.max(0,time-boundary)*11);
    const dip=time<dipUntil?.25:1,level=active&&!paused?onset*(reducedMotion?.35:1)*dip:0;
    // Web Speech exposes boundaries, not measured pitch: occasional smooth
    // phrase swells provide a restrained fallback even without boundary events.
    const phraseSwell=Math.pow(.5+.5*Math.sin(1.35*t+.45*Math.sin(.51*t)),8);
    const stress=Math.max(.82*phraseSwell,boundaryStress*accent);
    approach(open,level*(.10+.52*syllable)*variation*(1+.10*accent),dt,active&&!paused?.045:.085);
    approach(round,level*.20*(.5+.5*Math.sin(2.3*t+.5)),dt,.085);
    approach(gape,level*ease((stress-.16)/.62)*(.30+.70*syllable),dt,active&&!paused?.06:.10);
    const jawAmount=Math.min(.95,open.value+.32*gape.value);
    mesh.morphTargetInfluences[openIndex]=jawAmount;
    mesh.morphTargetInfluences[roundIndex]=round.value;
    oralDetail(jawAmount);
  }
  return {setSpeech,update};
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
  let model=null,body=null,head=null,bodyMeshes=[],faceMeshes=[],pending=null;
  let clock=0,lastTap=-10,inClassroom=false;
  let updateTail=()=>{},updateFur=()=>{},speechMouth=null,speechEvent=null,headRig=null;
  const presence=createTeacherPresence();
  const meshList=node=>{const list=[];node.traverse(object=>{if(object.isMesh)list.push(object);});return list;};
  function react(kind='tap',direction=0){
    if(!model){pending={kind,direction};return;}
    if(kind==='tap'&&clock-lastTap<.5)return;
    if(kind==='tap')lastTap=clock;
    presence.react(kind);
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
      head=prepareHeadMesh(head);
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
      speechMouth=createSpeechMouth(faceMeshes[0]);
      headRig=bindHead(faceMeshes[0]);
      if(speechEvent){speechMouth.setSpeech(speechEvent);if(speechEvent.paused)speechMouth.setSpeech({type:'pause'});}
      const faceMaterial=Array.isArray(faceMeshes[0].material)?faceMeshes[0].material[0]:faceMeshes[0].material;
      for(const rig of head.userData.eyeRig)eyelids.push(createEyelid(rig,faceMaterial,headRig.attachments));
      model=teacher;group.add(model);onState('teacher-ready');
      // Optional idle motion must never hold the whole classroom or model hostage.
      const tailTimer=setTimeout(()=>onState('teacher-tail-error'),30000);
      const tailReady=import('./cat-tail-rig.js?v=time-tail-19').then(({default:tailRig})=>{
        clearTimeout(tailTimer);
        updateTail=createTailMotion(bodyMeshes,tailRig,detail=>onState('teacher-tail-motion',detail));onState('teacher-tail-ready');
      }).catch(()=>{clearTimeout(tailTimer);onState('teacher-tail-error');});
      // Fine strands are an optional detail layer; the classroom/model render first.
      Promise.all([tailReady,import('./cat-fur.js?v=teacher-presence-26')]).then(async([,{attachFineFur}])=>{
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
    presence.setActive(active);
    if(active&&!inClassroom)react('welcome');
    if(!active&&pending?.kind==='welcome')pending=null;
    inClassroom=active;
    if(!active)setSpeech({type:'stop'});
  }
  function setSpeech(event){
    presence.setSpeech(event);
    if(event.type==='start')speechEvent={type:'start',text:event.text,paused:false};
    else if(event.type==='stop')speechEvent=null;
    else if(event.type==='pause'&&speechEvent)speechEvent.paused=true;
    else if(event.type==='resume'){speechEvent=speechEvent||{type:'start'};speechEvent.paused=false;}
    speechMouth?.setSpeech(event);
  }
  function update(dt,{reducedMotion=false,xr=false,time=null}={}){
    if(!model)return;clock+=dt;
    updateTail(Number.isFinite(time)?time:clock,reducedMotion);
    const pose=presence.update(dt,{reducedMotion,xr});
    approach(smile,pose.smile,dt,.12);approach(left,pose.lid,dt,.035);approach(right,pose.lid,dt,.035);
    for(const {mesh,index} of morphs)mesh.morphTargetInfluences[index]=smile.value;
    headRig.update(pose.pitch,pose.tilt);
    speechMouth?.update(dt,reducedMotion);
    updateFur();
    eyelids[0](left.value);eyelids[1](right.value);
    // Feet, body and collar stay still. Only the locally bound head responds.
  }
  function hitTest(raycaster,precise=false){
    if(!model)return false;
    group.updateWorldMatrix(true,true);
    bounds.setFromObject(body);bounds.union(headBounds.setFromObject(head));
    if(!raycaster.ray.intersectBox(bounds,point))return false;
    return !precise||raycaster.intersectObjects([...bodyMeshes,...faceMeshes],false).length>0;
  }
  return {group,load,react,update,hitTest,setClassroomMode,setSpeech,setLearningState:state=>presence.setState(state)};
}
