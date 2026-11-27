import * as THREE from '../three.module.min.js';
import {bindPortraitSupport,createPortraitSplats,loadPortraitSplats} from './portrait-gaussians.js';
import {bindPortraitSurface,loadPortraitRegions} from './portrait-surface.js';
import {createFrogLeaf} from './held-leaf.js?v=frog-leaf-70';

async function readBytes(file){
  const response=await fetch(new URL('./local-source/'+file,import.meta.url));
  if(!response.ok)throw new Error('Missing portrait data: '+file);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadPortrait(brow){
  const folder=new URL('./local-source/',import.meta.url);
  const loader=new THREE.TextureLoader();
  const load=file=>loader.loadAsync(new URL(file,folder).href);
  const patches=[];
  if(brow!=='before')patches.push(brow==='lift'?'portrait-brow-lift':'portrait-brow-clean');
  patches.push('portrait-hair-brown');
  const [atlas,...tiles]=await Promise.all([
    load('portrait-polished.webp'),
    ...patches.map(patch=>Promise.all([
      load(`${patch}.webp`),
      fetch(new URL(`${patch}.json`,folder)).then(response=>{
        if(!response.ok)throw new Error('Missing portrait patch placement.');
        return response.json();
      }),
    ]).catch(error=>{
      console.warn(`Portrait patch unavailable: ${patch}`,error);
      return null;
    })),
  ]);
  const assembled=document.createElement('canvas');
  assembled.width=atlas.image.width;
  assembled.height=atlas.image.height;
  const paint=assembled.getContext('2d',{alpha:false});
  if(!paint)return atlas;
  paint.imageSmoothingEnabled=false;
  paint.drawImage(atlas.image,0,0);
  for(const tile of tiles){
    if(!tile)continue;
    const [detail,{x,y,width,height,atlasWidth,atlasHeight}]=tile;
    if(atlasWidth===assembled.width&&atlasHeight===assembled.height&&
      detail.image.width===width&&detail.image.height===height&&x>=0&&y>=0&&x+width<=atlasWidth&&y+height<=atlasHeight){
      paint.drawImage(detail.image,x,y);
    }else console.warn('Portrait patch does not match the atlas.');
    detail.dispose();
  }
  atlas.dispose();
  return new THREE.CanvasTexture(assembled);
}

export async function loadRefinements({withGaussians=false,edgeDensity=true,brow='clean'}={}){
  const points=edgeDensity?'portrait-splats-edges.bin':'portrait-splats.bin';
  const colors=edgeDensity?'portrait-pigment-polished-edges.bin':'portrait-pigment-polished.bin';
  const forehead=brow==='before'||brow==='lift'?'portrait-face-geometry.bin':'portrait-brow-clean-geometry.bin';
  const sampled=withGaussians?Promise.all([loadPortraitSplats(points),readBytes(colors)]):null;
  const [blade,dew,flowers,head,strands,skirt,hand,handSleeve,raisedHand,stem,coat,
    portrait,regions,facePatch,hairPatch,coatPatch,gaussianAssets]=await Promise.all([
    readBytes('leaf-faces.bin'),readBytes('dew-faces.bin'),readBytes('flower-faces.bin'),
    readBytes('portrait-head-faces.bin'),readBytes('strand-trim-faces.bin'),
    readBytes('skirt-trim-faces.bin'),readBytes('hand-trim-faces.bin'),readBytes('hand-sleeve-faces.bin'),
    readBytes('upper-hand-trim-faces.bin'),readBytes('stem-trim-faces.bin'),readBytes('coat-faces.bin'),
    loadPortrait(brow),loadPortraitRegions(),
    readBytes(forehead),readBytes('hair-surface.bin'),readBytes('coat-surface.bin'),sampled
  ]);
  const [splats,pigments]=gaussianAssets??[];
  return {blade,dew,flowers,head,strands,skirt,hand,handSleeve,raisedHand,stem,coat,splats,pigments,
    portrait,regions,facePatch,hairPatch,coatPatch};
}

function selected(mask,triangle){
  return (mask[triangle>>>3]&(1<<(triangle&7)))!==0;
}

function validateSource(geometry,masks){
  const indices=geometry.index?.array;
  if(indices?.length!==3670872||geometry.attributes.position.count!==715534||
     masks.some(mask=>mask.length!==Math.ceil(indices.length/24))){
    throw new Error('The selection does not match result-4.');
  }
  let fingerprint=2166136261;
  for(const index of indices)fingerprint=Math.imul(fingerprint^index,16777619);
  if((fingerprint>>>0)!==954728734)throw new Error('Unexpected triangle order for result-4.');
  return indices;
}

function makeGeometry(attributes,indices){
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(attributes))geometry.setAttribute(name,attribute);
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  const position=attributes.position;
  const box=new THREE.Box3(),point=new THREE.Vector3(),seen=new Uint8Array(position.count);
  for(const index of indices){
    if(seen[index])continue;
    seen[index]=1;
    box.expandByPoint(point.fromBufferAttribute(position,index));
  }
  geometry.boundingBox=box;
  geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

function partition(indices,classify,partCount){
  const counts=new Uint32Array(partCount);
  const parts=new Int8Array(indices.length/3);
  for(let triangle=0;triangle<parts.length;triangle++){
    const part=classify(triangle);
    parts[triangle]=part;
    if(part>=0)counts[part]+=3;
  }
  if(counts.some(count=>count===0))throw new Error('Empty portrait selection.');
  const output=Array.from(counts,count=>new Uint32Array(count));
  const offset=new Uint32Array(partCount);
  for(let triangle=0;triangle<parts.length;triangle++){
    const part=parts[triangle];
    if(part<0)continue;
    const array=output[part],index=triangle*3,at=offset[part];
    array[at]=indices[index];array[at+1]=indices[index+1];array[at+2]=indices[index+2];
    offset[part]+=3;
  }
  return output;
}

function sourceMesh(root){
  const meshes=[];
  root.traverse(object=>{if(object.isMesh)meshes.push(object);});
  if(meshes.length!==1||Array.isArray(meshes[0].material))throw new Error('Unexpected result-4 scene layout.');
  return meshes[0];
}

export async function trimOriginalGeometry(root){
  const [flowers,skirt]=await Promise.all([readBytes('flower-faces.bin'),readBytes('skirt-trim-faces.bin')]);
  const mesh=sourceMesh(root),geometry=mesh.geometry;
  const indices=validateSource(geometry,[flowers,skirt]);
  const [kept]=partition(indices,triangle=>selected(flowers,triangle)||selected(skirt,triangle)?-1:0,1);
  mesh.geometry=makeGeometry(geometry.attributes,kept);
}

function repairedAttributes(geometry,patches,gripIndices,sleeveIndices){
  const position=geometry.attributes.position.clone(),normal=geometry.attributes.normal.clone();
  const adjusted=new Uint8Array(position.count);
  const fixed=new Uint8Array(position.count);
  const source=geometry.attributes.position;
  const positionKey=vertex=>[source.getX(vertex),source.getY(vertex),source.getZ(vertex)].join(',');
  const gripPositions=new Set();
  for(const indices of [gripIndices,sleeveIndices]){
    for(const vertex of indices){
      if(fixed[vertex])continue;
      fixed[vertex]=1;
      gripPositions.add(positionKey(vertex));
    }
  }
  for(const [patch,stride] of patches){
    if(!patch.length||patch.length%stride!==0)throw new Error('Invalid portrait surface patch.');
    const data=new DataView(patch.buffer,patch.byteOffset,patch.byteLength);
    for(let offset=0;offset<patch.length;offset+=stride){
      const vertex=data.getUint32(offset,true);
      if(vertex>=position.count)throw new Error('Invalid portrait surface index.');
      // The original grips share source vertices and UV seams with the cuffs.
      if(adjusted[vertex]||fixed[vertex]||gripPositions.has(positionKey(vertex)))continue;
      if(stride===20){
        position.setZ(vertex,position.getZ(vertex)+data.getFloat32(offset+4,true));
      }else{
        position.setXYZ(vertex,position.getX(vertex)+data.getFloat32(offset+4,true),
          position.getY(vertex)+data.getFloat32(offset+8,true),position.getZ(vertex)+data.getFloat32(offset+12,true));
      }
      const n=offset+stride-12;
      normal.setXYZ(vertex,data.getFloat32(n,true),data.getFloat32(n+4,true),data.getFloat32(n+8,true));
      adjusted[vertex]=1;
    }
  }
  return {attributes:{...geometry.attributes,position,normal},adjusted};
}

export function createPortraitFinish(root,{blade,dew,flowers,head,strands,skirt,hand,handSleeve,raisedHand,stem,coat,
  splats,pigments,portrait,regions,facePatch,hairPatch,coatPatch}){
  const mesh=sourceMesh(root),originalGeometry=mesh.geometry,original=mesh.material;
  const indices=validateSource(originalGeometry,[blade,dew,flowers,head,strands,skirt,hand,handSleeve,raisedHand,stem,coat]);
  const retired=flowers.map((value,index)=>value|skirt[index]);
  const [raw]=partition(indices,triangle=>selected(retired,triangle)?-1:0,1);
  const omitted=retired.map((value,index)=>value|blade[index]|dew[index]|strands[index]);
  const grips=hand.map((value,index)=>value|raisedHand[index]|stem[index]);
  const [bust,face,garment,originalGrips,originalSleeve]=partition(indices,triangle=>{
    if(selected(omitted,triangle))return -1;
    if(selected(handSleeve,triangle))return 4;
    if(selected(grips,triangle))return 3;
    if(selected(coat,triangle))return 2;
    return selected(head,triangle)?1:0;
  },5);
  const {attributes,adjusted}=repairedAttributes(originalGeometry,
    [[facePatch,20],[hairPatch,28],[coatPatch,28]],originalGrips,originalSleeve);
  // The old point anchors cannot follow surfaces that were reshaped offline.
  for(let i=0;splats&&i<indices.length;i+=3){
    const triangle=i/3;
    if(selected(grips,triangle)||adjusted[indices[i]]||adjusted[indices[i+1]]||adjusted[indices[i+2]]){
      omitted[triangle>>>3]|=1<<(triangle&7);
    }
  }

  const support=original.clone();
  portrait.colorSpace=THREE.SRGBColorSpace;portrait.flipY=false;
  portrait.anisotropy=Math.max(8,original.map.anisotropy);
  portrait.wrapS=original.map.wrapS;portrait.wrapT=original.map.wrapT;
  portrait.needsUpdate=true;support.map=portrait;
  const gaussian=splats?createPortraitSplats(splats,originalGeometry,support,pigments,omitted):null;
  const pose=gaussian?.excursion??{value:0};
  bindPortraitSupport(support,pose);
  bindPortraitSurface(support,regions);
  if(gaussian)bindPortraitSurface(gaussian.object.material,regions);
  const depth=bindPortraitSupport(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),pose);

  const parts=new THREE.Group();
  parts.position.copy(mesh.position);parts.quaternion.copy(mesh.quaternion);parts.scale.copy(mesh.scale);
  const upper=new THREE.Mesh(makeGeometry(attributes,bust),support);
  const portraitHead=new THREE.Mesh(makeGeometry(attributes,face),support);
  const raincoat=new THREE.Mesh(makeGeometry(attributes,garment),support);
  const sleeveEnd=new THREE.Mesh(makeGeometry(originalGeometry.attributes,originalSleeve),support);
  const heldStalk=new THREE.Mesh(makeGeometry(originalGeometry.attributes,originalGrips),original);
  heldStalk.name='Original hands, cuffs and stalk';
  heldStalk.castShadow=heldStalk.receiveShadow=true;
  upper.name='Neck, waist and lining details';
  portraitHead.name='Head and hair';
  raincoat.name='Frog hood and raincoat';
  for(const part of [upper,portraitHead,raincoat,sleeveEnd]){
    part.castShadow=part.receiveShadow=true;
    part.customDepthMaterial=depth;
  }
  const leaf=createFrogLeaf();
  parts.add(upper,portraitHead,raincoat,sleeveEnd,heldStalk,leaf.group);
  if(gaussian)parts.add(gaussian.object);
  mesh.parent.add(parts);
  mesh.geometry=makeGeometry(originalGeometry.attributes,raw);
  return {
    setLight:leaf.setLight,
    setTime(seconds){gaussian?.setTime(seconds);},
    prepareView(renderer,camera){gaussian?.prepareView(renderer,camera);},
    show(version){
      mesh.visible=version==='original';
      parts.visible=!mesh.visible;
      if(gaussian)gaussian.object.visible=version==='gaussian';
    }
  };
}
