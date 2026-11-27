import * as THREE from '../three.module.min.js';
import {createFrogLowerBody,frogLegLengthIncrease} from './full-body.js?v=frog-blink-69';

export async function loadFrogCharacter({onProgress=()=>{},withGaussians=false,height,edgeDensity=true,modelScale,brow=withGaussians?'before':'clean'}={}){
  const {GLTFLoader}=await import('../GLTFLoader.js');
  const refinements=import('./lotus-finish.js?v=frog-hair-73').then(async api=>{
    const assets=await api.loadRefinements({withGaussians,edgeDensity,brow});
    return root=>api.createPortraitFinish(root,assets);
  }).catch(error=>{console.warn('Portrait refinements unavailable.',error);return null;});
  const url=new URL('./local-source/result-4.glb',import.meta.url);
  onProgress('正在载入原模型…');
  let gltf;
  try{
    gltf=await new GLTFLoader().loadAsync(url.href,event=>{
      if(!event.total)return;
      const pct=Math.min(100,Math.round(100*event.loaded/event.total));
      onProgress(pct===100?'正在准备模型和贴图…':'正在载入原模型 '+pct+'%');
    });
  }catch(cause){
    throw Object.assign(new Error('Original GLB load failed',{cause}),{userMessage:'原模型或贴图未能载入，请刷新页面重试。'});
  }
  const source=gltf.scene,subjects=[];
  source.traverse(o=>{if(o.isMesh){subjects.push(o);o.castShadow=true;o.receiveShadow=true;}});
  let finish=null;
  const prepare=await refinements;
  if(prepare){
    try{finish=prepare(source);}
    catch(error){console.warn('Original geometry does not match the lotus selection.',error);}
  }
  if(finish){
    finish.show('original');
  }else{
    try{
      const {trimOriginalGeometry}=await import('./lotus-finish.js?v=frog-hair-73');
      await trimOriginalGeometry(source);
    }catch(error){console.warn('Could not trim the replaced source geometry.',error);}
  }
  // Frame the retained subject, excluding deleted props and splat billboard extents.
  source.updateMatrixWorld(true);
  const box=new THREE.Box3();
  for(const subject of subjects){
    if(!subject.geometry.boundingBox)subject.geometry.computeBoundingBox();
    box.union(subject.geometry.boundingBox.clone().applyMatrix4(subject.matrixWorld));
  }
  const lowerBody=createFrogLowerBody();
  box.union(new THREE.Box3().setFromObject(lowerBody));
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  // The preview retains its upper-body scale as the legs gain length.
  const scale=modelScale??(height===undefined?1.78/(size.y-frogLegLengthIncrease):height/size.y);
  const group=new THREE.Group(),model=new THREE.Group();
  group.name='Frog Girl';
  model.scale.setScalar(scale);
  // Use the waist as the character origin. The broad leaf extends to one side.
  model.position.set(-.205*scale,-box.min.y*scale,.151*scale);
  model.add(source,lowerBody);group.add(model);
  const face=new THREE.Vector3(.226,.228,-.034);
  return {group,finish,model,upperBody:source,lowerBody,scale,fitData(){
    return {
      faceCenter:model.localToWorld(face.clone()),
      center:model.localToWorld(center.clone()),
      halfHeight:size.y*scale*.5,halfWidth:size.x*scale*.5,
      depthMargin:Math.hypot(size.x,size.z)*scale*.5
    };
  }};
}
