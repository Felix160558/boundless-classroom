import * as THREE from './three.module.min.js';
import {MOLECULE_CATALOG} from './molecule-catalog.js?v=quiet-shape-31';

// ChemBoard's finite atom/bond catalogue is rendered in the existing classroom.
// No coordinates, charges or dipole directions are guessed from a chat reply.
// Chemical arrows use a positive cross-tail and point toward the negative end.
export function createMoleculeStage(parent) {
  const group=new THREE.Group();group.name='Conversation molecular models';parent.add(group);
  const reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  const resources=new Set(),objects=[],hitObjects=[];
  const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1);
  const palette={H:0xf1eee4,C:0x68737b,N:0x8198bf,O:0xb9665f,F:0x8ab9a2,Cl:0x80ae92,Br:0xa48169,I:0x9a88b2,S:0xc7b67c,P:0xc49a79,B:0xb8a091,Si:0x9fa9ad};
  const radii={H:.23,C:.34,N:.32,O:.32,F:.29,Cl:.41,Br:.44,I:.48,S:.39,P:.39,B:.34,Si:.40};
  let ids=[],dipole=false,reveal=0,activeModel=0;
  function keep(resource){resources.add(resource);return resource;}
  function material(color,basic=false){
    return keep(basic?new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,toneMapped:false}):new THREE.MeshStandardMaterial({color,roughness:.38,metalness:.04,transparent:true,opacity:0}));
  }
  function mesh(geometry,mat,parentObject,position){
    const item=new THREE.Mesh(keep(geometry),mat);if(position)item.position.copy(position);parentObject.add(item);return item;
  }
  function rod(start,end,radius,mat,parentObject){
    const direction=end.clone().sub(start),length=direction.length();if(length<1e-6)return null;
    const item=mesh(new THREE.CylinderGeometry(radius,radius,length,16),mat,parentObject,start.clone().add(end).multiplyScalar(.5));
    item.quaternion.setFromUnitVectors(up,direction.normalize());return item;
  }
  function label(text,position,width,parentObject,color='#eee9dd',height=.20){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=144;
    const ctx=canvas.getContext('2d');ctx.textAlign='center';ctx.textBaseline='middle';
    let size=68;do{ctx.font=`500 ${size}px Arial, sans-serif`;size-=2;}while(ctx.measureText(text).width>720&&size>28);
    ctx.lineJoin='round';ctx.lineWidth=9;ctx.strokeStyle='rgba(8,14,20,.84)';ctx.strokeText(text,384,72);ctx.fillStyle=color;ctx.fillText(text,384,72);
    const map=keep(new THREE.CanvasTexture(canvas));map.colorSpace=THREE.SRGBColorSpace;
    const mat=keep(new THREE.SpriteMaterial({map,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
    const sprite=new THREE.Sprite(mat);sprite.position.copy(position);sprite.scale.set(width,height,1);parentObject.add(sprite);return sprite;
  }
  function arrow(start,end,parentObject){
    const mat=material(0xe9c993,true),direction=end.clone().sub(start).normalize(),headLength=.10;
    rod(start,end.clone().addScaledVector(direction,-headLength*.7),.013,mat,parentObject);
    const head=mesh(new THREE.ConeGeometry(.041,headLength,24),mat,parentObject,end.clone().addScaledVector(direction,-headLength*.5));head.quaternion.setFromUnitVectors(up,direction);
    let side=direction.clone().cross(forward);if(side.lengthSq()<.01)side=direction.clone().cross(up);side.normalize().multiplyScalar(.046);
    rod(start.clone().sub(side),start.clone().add(side),.009,mat,parentObject);
  }
  function safeDirection(entry){
    const d=entry.dipole?.direction;
    if(entry.dipole?.kind!=='polar'||!Array.isArray(d)||d.length!==3||!d.every(Number.isFinite))return null;
    const vector=new THREE.Vector3(...d);return vector.lengthSq()>1e-10?vector.normalize():null;
  }
  function basisFor(positions,direction){
    // A strict rigid basis shows planar shapes face-on. 3D geometry remains 3D.
    let x=new THREE.Vector3(1,0,0),best=0;
    for(let a=0;a<positions.length;a++)for(let b=a+1;b<positions.length;b++){
      const candidate=positions[b].clone().sub(positions[a]),length=candidate.lengthSq();if(length>best){best=length;x.copy(candidate);}
    }
    if(best<1e-10)return vector=>vector.clone();
    x.normalize();let y;
    if(direction){
      y=direction.clone();x.addScaledVector(y,-x.dot(y));
      if(x.lengthSq()<1e-6){x.copy(Math.abs(y.x)<.8?new THREE.Vector3(1,0,0):up);x.addScaledVector(y,-x.dot(y));}
      x.normalize();
    }else{
      y=new THREE.Vector3();best=0;
      for(const point of positions){const candidate=point.clone().addScaledVector(x,-point.dot(x));if(candidate.lengthSq()>best){best=candidate.lengthSq();y.copy(candidate);}}
      if(y.lengthSq()<1e-6){y.copy(Math.abs(x.y)<.8?up:forward);y.addScaledVector(x,-y.dot(x));}y.normalize();
    }
    const z=new THREE.Vector3().crossVectors(x,y).normalize();y.crossVectors(z,x).normalize();
    return vector=>new THREE.Vector3(vector.dot(x),vector.dot(y),vector.dot(z));
  }
  function destroyModels(){
    group.clear();objects.length=hitObjects.length=0;for(const resource of resources)resource.dispose();resources.clear();
  }
  function build(entry,slot,count){
    const holder=new THREE.Group(),turning=new THREE.Group(),body=new THREE.Group(),overlay=new THREE.Group();
    holder.position.set(count===1?0:(slot===0?-.98:.98),1.48,-.15);group.add(holder);holder.add(turning);turning.add(body,overlay);
    const raw=entry.atoms.map(atom=>new THREE.Vector3(...atom.slice(1))),center=new THREE.Box3().setFromPoints(raw).getCenter(new THREE.Vector3());
    const centered=raw.map(point=>point.sub(center)),direction=safeDirection(entry),orient=basisFor(centered,direction);
    const positions=centered.map(orient),box=new THREE.Box3().setFromPoints(positions),size=box.getSize(new THREE.Vector3());
    const span=Math.max(size.x,size.y,size.z,.1),scale=Math.min(.65,(count===1?1.40:1.08)/span);
    for(const point of positions)point.multiplyScalar(scale);
    const atomMaterials={},atomRadii=[];
    for(let i=0;i<entry.atoms.length;i++){
      const element=entry.atoms[i][0],radius=Math.max(.035,(radii[element]||.35)*scale);atomRadii.push(radius);
      atomMaterials[element]||=material(palette[element]||0xa9a6a2);
      const atom=mesh(new THREE.SphereGeometry(radius,32,24),atomMaterials[element],body,positions[i]);atom.name=`${entry.id} ${element} ${i+1}`;atom.userData.modelIndex=slot;hitObjects.push(atom);
    }
    const bondMat=material(0xbcc8cc);
    for(const [a,b,rawOrder] of entry.bonds){
      if(!positions[a]||!positions[b]||a===b)continue;
      const axis=positions[b].clone().sub(positions[a]).normalize();
      // Use a bond-perpendicular offset, including non-horizontal double/triple bonds.
      let side=new THREE.Vector3().crossVectors(axis,forward);if(side.lengthSq()<.02)side.crossVectors(axis,up);side.normalize();
      const order=rawOrder===2||rawOrder===3?rawOrder:1;
      const radius=Math.max(.009,Math.min(.035,scale*(order===1?.065:.043))),spacing=radius*2.9;
      for(let rail=0;rail<order;rail++){
        const offset=side.clone().multiplyScalar((rail-(order-1)/2)*spacing);
        const bond=rod(positions[a].clone().add(offset),positions[b].clone().add(offset),radius,bondMat,body);if(bond){bond.userData.modelIndex=slot;hitObjects.push(bond);}
      }
    }
    const extents=new THREE.Box3().setFromPoints(positions),modelRadius=Math.max(...positions.map((point,i)=>point.length()+atomRadii[i]));
    const captionY=extents.min.y-Math.max(...atomRadii)-.18;
    const displayFormula=String(entry.formula||entry.id).replace(/[0-9]/g,d=>'₀₁₂₃₄₅₆₇₈₉'[Number(d)]);
    label(displayFormula,new THREE.Vector3(0,captionY,.06),count===1?1.45:1.15,holder);
    // Shape names belong on the whiteboard; leave the 3D model visually quiet.
    if(entry.dipole?.kind==='zero'){
      label('μ = 0',new THREE.Vector3(0,extents.max.y+.28,.08),.65,overlay,'#efd9b7',.19);
    }else if(direction){
      const net=orient(direction).normalize(),side=new THREE.Vector3(net.y,-net.x,0);
      if(side.lengthSq()<.01)side.set(1,0,0);side.normalize();
      const mid=side.multiplyScalar(modelRadius+.20),start=mid.clone().addScaledVector(net,-.32),end=mid.clone().addScaledVector(net,.32);
      arrow(start,end,overlay);label('net',end.clone().addScaledVector(net,.16),.55,overlay,'#efd9b7',.16);
    }
    const bodyMaterials=[],overlayMaterials=[];
    // Collect by ancestry rather than naming; every overlay follows the molecule's rotation.
    holder.traverse(node=>{if(!node.material)return;let inOverlay=false,p=node;while(p&&p!==holder){if(p===overlay){inOverlay=true;break;}p=p.parent;}(inOverlay?overlayMaterials:bodyMaterials).push(node.material);});
    objects.push({holder,turning,overlay,baseY:holder.position.y,bodyMaterials:[...new Set(bodyMaterials)],overlayMaterials:[...new Set(overlayMaterials)],overlayOpacity:0,yaw:0,pitch:0,targetYaw:0,targetPitch:0});
  }
  group.visible=false;
  return {
    group,
    setModels(nextIds,{dipole:showDipole=false}={}){
      const selected=[...new Set(Array.isArray(nextIds)?nextIds:[])].filter(id=>typeof id==='string'&&Object.hasOwn(MOLECULE_CATALOG,id)).slice(0,2);
      dipole=showDipole===true;
      if(selected.join('|')!==ids.join('|')){
        destroyModels();ids=selected;activeModel=0;reveal=0;
        ids.forEach((id,index)=>build(MOLECULE_CATALOG[id],index,ids.length));
      }
      group.visible=ids.length>0;
      return [...ids];
    },
    update(time,delta){
      if(!group.visible)return;
      const dt=Math.min(.05,Math.max(0,Number.isFinite(delta)?delta:0)),blend=1-Math.exp(-dt*(reduced.matches?24:9));
      reveal+=(1-reveal)*blend;
      for(let i=0;i<objects.length;i++){
        const object=objects[i];object.yaw+=(object.targetYaw-object.yaw)*blend;object.pitch+=(object.targetPitch-object.pitch)*blend;object.turning.rotation.set(object.pitch,object.yaw,0);object.holder.position.y=object.baseY+(reduced.matches?0:Math.sin(time*.65+i*.8)*.007);
        object.overlayOpacity+=((dipole?1:0)-object.overlayOpacity)*blend;object.overlay.visible=object.overlayOpacity>.002;
        for(const mat of object.bodyMaterials)mat.opacity=reveal;
        for(const mat of object.overlayMaterials)mat.opacity=reveal*object.overlayOpacity;
      }
    },
    rotate(dx,dy){
      if(!ids.length||!Number.isFinite(dx)||!Number.isFinite(dy))return;
      const object=objects[activeModel]||objects[0];if(!object)return;
      object.targetYaw+=THREE.MathUtils.clamp(dx,-.5,.5);object.targetPitch=THREE.MathUtils.clamp(object.targetPitch+THREE.MathUtils.clamp(dy,-.5,.5),-1.35,1.35);
    },
    hitTest(raycaster){if(!ids.length||!group.visible)return false;group.updateWorldMatrix(true,true);const hit=raycaster.intersectObjects(hitObjects,false)[0];if(hit)activeModel=hit.object.userData.modelIndex||0;return Boolean(hit);},
    dispose(){destroyModels();parent.remove(group);}
  };
}
