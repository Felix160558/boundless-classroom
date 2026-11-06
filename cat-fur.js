import * as THREE from './three.module.min.js';

const STRIDE=32;
const linear=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const vertexShader=`
attribute vec3 root;
attribute vec3 strandNormal;
attribute vec3 flow;
attribute vec3 strandColor;
attribute vec2 dimensions;
attribute float variation;
attribute float headWeight;
uniform mat4 headPose;
varying vec3 vColor;
varying vec2 vStrand;
varying float vDistance;
void main(){
  float t=position.y;
  vec3 n=normalize(strandNormal),g=normalize(flow);
  vec3 curve=root+n*dimensions.x*(.68*t-.12*t*t)+g*dimensions.x*.64*t*t;
  vec3 tangent=normalize(n*(.68-.24*t)+g*1.28*t);
  curve=mix(curve,(headPose*vec4(curve,1.)).xyz,headWeight);
  tangent=normalize(mix(tangent,mat3(headPose)*tangent,headWeight));
  vec4 mv=modelViewMatrix*vec4(curve,1.);
  vec3 vt=normalize(mat3(modelViewMatrix)*tangent);
  vec3 side=normalize(cross(vt,normalize(-mv.xyz))+vec3(.00001,0.,0.));
  float scale=length(modelViewMatrix[0].xyz);
  float taper=mix(1.,.06,t*t);
  mv.xyz+=side*position.x*dimensions.y*scale*taper;
  gl_Position=projectionMatrix*mv;
  vStrand=vec2(position.x,t);
  vColor=strandColor*(.96+variation*.08)*mix(.90,1.08,t);
  vDistance=length((modelViewMatrix*vec4(root,1.)).xyz)/max(scale,.0001);
}`;
const fragmentShader=`
varying vec3 vColor;
varying vec2 vStrand;
varying float vDistance;
void main(){
  float edge=1.-smoothstep(.42,1.,abs(vStrand.x));
  float tips=smoothstep(0.,.055,vStrand.y)*(1.-smoothstep(.72,1.,vStrand.y));
  float distanceFade=1.-smoothstep(1.35,3.4,vDistance);
  float alpha=edge*tips*distanceFade*.72;
  if(alpha<.018)discard;
  gl_FragColor=vec4(vColor,alpha);
  #include <colorspace_fragment>
}`;

function makeGroom(mesh,data,count,offset,head){
  const view=new DataView(data),geometry=new THREE.InstancedBufferGeometry();
  const strip=[],indices=[];
  for(let row=0;row<=4;row++){
    strip.push(-1,row/4,0,1,row/4,0);
    if(row<4){const k=row*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(strip,3));geometry.setIndex(indices);
  const roots=new Float32Array(count*3),normals=new Float32Array(count*3),flows=new Float32Array(count*3),colors=new Float32Array(count*3),dimensions=new Float32Array(count*2),seeds=new Float32Array(count);
  const headWeights=new Float32Array(count);
  const anchors=[],tail=mesh.userData.tailVertexSet;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),na=new THREE.Vector3(),nb=new THREE.Vector3(),nc=new THREE.Vector3();
  const point=new THREE.Vector3(),normal=new THREE.Vector3(),flow=new THREE.Vector3(),edge=new THREE.Vector3(),face=new THREE.Vector3();
  const rotation=new THREE.Quaternion();
  const initialNormal=new THREE.Vector3(),initialFlow=new THREE.Vector3(),oldFace=new THREE.Vector3();
  function vertex(attribute,index,out,morphs,weights){
    out.fromBufferAttribute(attribute,index);
    for(let j=0;j<morphs.length;j++){
      const morph=morphs[j],weight=weights[j]||0;
      if(weight){out.x+=morph.getX(index)*weight;out.y+=morph.getY(index)*weight;out.z+=morph.getZ(index)*weight;}
    }
  }
  function resolve(anchor,transport=false){
    // Always read the CURRENT geometry: tail motion installs its own dynamic buffer.
    const g=mesh.geometry,position=g.getAttribute('position'),n=g.getAttribute('normal');
    const morphs=g.morphAttributes.position||[],weights=mesh.morphTargetInfluences||[];
    vertex(position,anchor.i,a,morphs,weights);vertex(position,anchor.j,b,morphs,weights);vertex(position,anchor.k,c,morphs,weights);
    point.copy(a).multiplyScalar(anchor.u).addScaledVector(b,anchor.v).addScaledVector(c,1-anchor.u-anchor.v);
    normal.copy(na.fromBufferAttribute(n,anchor.i)).multiplyScalar(anchor.u).addScaledVector(nb.fromBufferAttribute(n,anchor.j),anchor.v).addScaledVector(nc.fromBufferAttribute(n,anchor.k),1-anchor.u-anchor.v).normalize();
    face.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
    if(transport){
      oldFace.fromArray(anchor.frame);rotation.setFromUnitVectors(oldFace,face);
      normal.copy(initialNormal.fromArray(anchor.normal)).applyQuaternion(rotation);
      flow.copy(initialFlow.fromArray(anchor.flow)).applyQuaternion(rotation);
    }else{
      // Short, combed fibers: cheek fur falls outward/down, ear tufts follow the tip.
      if(head)flow.set(point.x*3,point.y>.185?.7:-1,.04);
      else if(point.z<-.02&&point.x>.035)flow.set(.45,.7,-.1);
      else flow.set(point.x*.4,-1,.05);
      flow.addScaledVector(normal,-flow.dot(normal));
      if(flow.lengthSq()<.0001)flow.set(1,0,0).addScaledVector(normal,-normal.x);
      flow.normalize();
      anchor.normal=normal.toArray();anchor.flow=flow.toArray();anchor.frame=face.toArray();
    }
    point.addScaledVector(normal,-.000025); // Bury the root, with no floating seam.
    point.toArray(roots,anchor.index*3);normal.toArray(normals,anchor.index*3);flow.toArray(flows,anchor.index*3);
  }
  for(let i=0;i<count;i++){
    const p=offset+i*STRIDE,anchor={index:i,i:view.getUint32(p,true),j:view.getUint32(p+4,true),k:view.getUint32(p+8,true),u:view.getFloat32(p+12,true),v:view.getFloat32(p+16,true)};
    resolve(anchor);
    if(head&&mesh.geometry.attributes.skinWeight){
      const weights=mesh.geometry.attributes.skinWeight;
      headWeights[i]=weights.getY(anchor.i)*anchor.u+weights.getY(anchor.j)*anchor.v+weights.getY(anchor.k)*(1-anchor.u-anchor.v);
    }
    dimensions[i*2]=view.getFloat32(p+20,true)*1.65;dimensions[i*2+1]=view.getFloat32(p+24,true)*1.5;
    // Omit only strands whose old triangle now crosses the real lip seam.
    const seam=mesh.userData.mouthSeam;
    if(seam&&Math.abs(point.x-seam.center)<seam.width&&point.z>.100){
      const p=mesh.geometry.attributes.position,ids=[anchor.i,anchor.j,anchor.k];
      const signs=ids.map(id=>p.getY(id)-seam.y(p.getX(id)));
      if(Math.min(...signs)<0&&Math.max(...signs)>=0){dimensions[i*2]=0;dimensions[i*2+1]=0;}
    }
    for(let k=0;k<3;k++)colors[i*3+k]=linear(view.getUint8(p+28+k)/255);
    seeds[i]=view.getUint8(p+31)/255;
    const movingFace=(mesh.geometry.morphAttributes.position||[]).some(morph=>[anchor.i,anchor.j,anchor.k].some(index=>Math.abs(morph.getX(index))+Math.abs(morph.getY(index))+Math.abs(morph.getZ(index))>1e-9));
    if(movingFace||tail&&[anchor.i,anchor.j,anchor.k].some(index=>tail.has(index)))anchors.push(anchor);
  }
  for(const [name,array,size] of [['root',roots,3],['strandNormal',normals,3],['flow',flows,3],['strandColor',colors,3],['dimensions',dimensions,2],['variation',seeds,1],['headWeight',headWeights,1]]){
    const attribute=new THREE.InstancedBufferAttribute(array,size);
    if(['root','strandNormal','flow'].includes(name))attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name,attribute);
  }
  geometry.instanceCount=count;
  geometry.boundingBox=new THREE.Box3().setFromArray(roots).expandByScalar(.002);
  geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const uniforms={headPose:{value:mesh.userData.headPoseMatrix||new THREE.Matrix4()}};
  const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const fur=new THREE.Mesh(geometry,material);fur.name=head?'Face fine undercoat':'Body fine undercoat';fur.frustumCulled=false;fur.renderOrder=2;fur.userData.teacherDetail=true;mesh.add(fur);
  let previousWeights=[];
  return ()=>{
    const weights=mesh.morphTargetInfluences||[];
    if(!anchors.length||head&&weights.length===previousWeights.length&&weights.every((weight,index)=>Math.abs(weight-previousWeights[index])<.00001))return;
    previousWeights=weights.slice();
    for(const anchor of anchors)resolve(anchor,true);
    for(const key of ['root','strandNormal','flow'])geometry.getAttribute(key).needsUpdate=true;
  };
}

export async function attachFineFur(body,head){
  const response=await fetch(new URL('./cat-fur.bin?v=refined-cat-22',import.meta.url),{credentials:'same-origin'});
  if(!response.ok)throw new Error('Fine fur data could not be loaded.');
  const data=await response.arrayBuffer(),header=new DataView(data);
  if(header.getUint32(0,true)!==0x32464342||header.getUint32(4,true)!==22)throw new Error('Fine fur data version mismatch.');
  const bodies=header.getUint32(8,true),faces=header.getUint32(12,true);
  if(data.byteLength!==16+(bodies+faces)*STRIDE||bodies+faces>80000)throw new Error('Fine fur data is incomplete.');
  const updateBody=makeGroom(body,data,bodies,16,false),updateFace=makeGroom(head,data,faces,16+bodies*STRIDE,true);
  return ()=>{updateBody();updateFace();};
}
