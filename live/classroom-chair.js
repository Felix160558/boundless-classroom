import * as THREE from '../three.module.min.js';
import {CHAIR_SEAT_HEIGHT,CHAIR_SEAT_THICKNESS} from './shared-seating.js?v=student-avatar-49';

// One closed, mirrored surface per panel. Shared rings and analytic normals
// keep the flat faces and rounded edges continuous at every corner.
function roundedChairPanel(width,height,thickness,radius,bevel){
  const cornerSegments=32,edgeSegments=24,perimeter=[],quarter=[];
  const cx=width/2-radius,cy=height/2-radius,halfDepth=thickness/2;
  // Reuse one quadrant's samples with exact sign changes. The tangent ends
  // are explicit 0/1 values, without duplicate arc/line junction vertices.
  for(let i=0;i<=cornerSegments;i++){
    const angle=i/cornerSegments*Math.PI/2;
    const c=i===cornerSegments?0:Math.cos(angle),s=i===0?0:Math.sin(angle);
    quarter.push([c,s]);
  }
  for(let quadrant=0;quadrant<4;quadrant++)for(let i=0;i<=cornerSegments;i++){
    const [c,s]=quarter[quadrant%2===0?i:cornerSegments-i];
    if(quadrant===0)perimeter.push([cx,cy,c,s]);
    if(quadrant===1)perimeter.push([-cx,cy,-c,s]);
    if(quadrant===2)perimeter.push([-cx,-cy,-c,-s]);
    if(quadrant===3)perimeter.push([cx,-cy,c,-s]);
  }
  const positions=[],normals=[],indices=[],stride=perimeter.length;
  function addRing(sine,cosine,side){
    const r=radius-bevel+bevel*sine,z=side*(halfDepth-bevel+bevel*cosine);
    for(const [x,y,nx,ny] of perimeter){
      positions.push(x+nx*r,y+ny*r,z);
      normals.push(nx*sine,ny*sine,side*cosine);
    }
  }
  function edgeRing(i,side){
    const angle=i/edgeSegments*Math.PI/2;
    addRing(i===edgeSegments?1:Math.sin(angle),i===edgeSegments?0:Math.cos(angle),side);
  }
  for(let i=0;i<=edgeSegments;i++)edgeRing(i,1);
  for(let i=edgeSegments;i>=0;i--)edgeRing(i,-1);
  const ringCount=positions.length/(stride*3);
  for(let ring=0;ring<ringCount-1;ring++)for(let i=0;i<stride;i++){
    const next=(i+1)%stride,a=ring*stride+i,b=a+stride,c=ring*stride+next,d=c+stride;
    indices.push(a,b,c,c,b,d);
  }
  const frontCenter=positions.length/3,backCenter=frontCenter+1,lastRing=(ringCount-1)*stride;
  positions.push(0,0,halfDepth,0,0,-halfDepth);normals.push(0,0,1,0,0,-1);
  for(let i=0;i<stride;i++){
    const next=(i+1)%stride;
    indices.push(frontCenter,i,next,backCenter,lastRing+next,lastRing+i);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setIndex(indices);return geometry;
}

export function createClassroomChair(materials) {
  function mesh(geometry, material, parent, x=0, y=0, z=0) {
    const object = new THREE.Mesh(geometry,material);
    object.position.set(x,y,z);
    object.castShadow = !material.transparent;
    object.receiveShadow = !material.transparent;
    parent.add(object);
  }
  const chair=new THREE.Group();
  const seatGeometry=roundedChairPanel(.62,.62,CHAIR_SEAT_THICKNESS,.11,.017);
  seatGeometry.rotateX(-Math.PI/2);
  mesh(seatGeometry,materials.dark,chair,0,CHAIR_SEAT_HEIGHT,0);
  mesh(roundedChairPanel(.61,.62,.065,.13,.014),materials.white,chair,0,.95,.29);
  // Rounded tubes soften the supports too; rear posts continue into the backrest.
  const frontLeg=new THREE.CapsuleGeometry(.018,.444,12,32);
  const rearLeg=new THREE.CapsuleGeometry(.018,.934,12,32);
  for(const x of [-.25,.25]){
    mesh(frontLeg,materials.edge,chair,x,.31,-.24);
    mesh(rearLeg,materials.edge,chair,x,.555,.30);
  }
  return chair;
}
