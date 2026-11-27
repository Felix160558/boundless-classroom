import * as THREE from '../three.module.min.js';
import {createLeafOptics} from './leaf-optics.js';
import {createDewMaterial} from './water.js';

const tau = 2 * Math.PI;
const hub = new THREE.Vector3(-.311, .502, .176);
const arc = Math.PI / 12;
const radii = [0,.24,.50,.76,1];

// Native asset units. Each radial section records the desired reach and four
// heights, from the midrib to the edge. One side curls down past the hand.
const sections = [
  [1.21, .223,.268,.218,.184],
  [1.19, .200,.233,.193,.172],
  [1.11, .158,.215,.176,.154],
  [1.06, .107,.162,.133,.120],
  [.96, .032,.085,.077,.059],
  [.88,-.021,.013,.023,-.010],
  [.83,-.046,-.063,-.080,-.131],
  [.81,-.068,-.124,-.184,-.246],
  [.75,-.080,-.139,-.241,-.374],
  [.69,-.085,-.145,-.253,-.415],
  [.67,-.087,-.140,-.235,-.389],
  [.69,-.087,-.136,-.215,-.348],
  [.75,-.085,-.131,-.200,-.302],
  [.83,-.073,-.105,-.176,-.243],
  [.87,-.059,-.079,-.112,-.151],
  [.92,-.037,-.050,-.069,-.090],
  [1.00,-.007,.018,-.008,-.030],
  [1.08, .047,.104,.103,.094],
  [1.10, .103,.212,.282,.292],
  [1.13, .162,.302,.344,.361],
  [1.22, .221,.355,.388,.400],
  [1.24, .243,.371,.388,.366],
  [1.22, .257,.359,.348,.294],
  [1.22, .250,.328,.277,.233],
];
const veins = Array.from({length:17},(_,i)=>({
  angle:tau*i/17+.067*Math.sin(i*1.307),
  curl:.055*Math.cos(i*2.27)
}));

function hermite(t, a, b, slopeA, slopeB) {
  return a + t*(slopeA+t*((3-2*t)*(b-a)-(2-t)*slopeA-(1-t)*slopeB));
}

function polarSection(a, column) {
  const position = THREE.MathUtils.euclideanModulo(a, tau)/arc;
  const i = Math.floor(position) % sections.length;
  const n = sections.length;
  const previous = sections[(i+n-1)%n][column];
  const from = sections[i][column];
  const to = sections[(i+1)%n][column];
  const next = sections[(i+2)%n][column];
  return hermite(position-Math.floor(position),from,to,(to-previous)*.5,(next-from)*.5);
}

function blade(r, a) {
  if(r===0)return hub.clone();
  const reach=polarSection(a,0)*(1+r**4*(.021*Math.sin(12*a+.45)+.008*Math.sin(23*a)));
  const j=r<=.24?0:r<=.50?1:r<=.76?2:3;
  const sample=i=>i===0?0:polarSection(a,i);
  const v0=sample(j),v1=sample(j+1),span=radii[j+1]-radii[j];
  const slope0=j===0?.42*v1:(v1-sample(j-1))*span/(radii[j+1]-radii[j-1]);
  const slope1=j===3?v1-v0:(sample(j+2)-v0)*span/(radii[j+2]-radii[j]);
  const height=hermite((r-radii[j])/span,v0,v1,slope0,slope1);
  const margin=r**4*(.012*Math.sin(8*a+.94)+.005*Math.sin(17*a-.67));
  const folds=.007*r**1.4*Math.cos(17*a+.58*r*Math.cos(a));
  return new THREE.Vector3(hub.x+.80*r*reach*Math.cos(a),hub.y+height+margin+folds,
    hub.z+.56*r*reach*Math.sin(a));
}

function surfaceGeometry() {
  const positions=[],uv=[],indices=[];
  const rays=224,rings=50;
  function add(r,a){
    const point=blade(r,a);
    positions.push(point.x,point.y,point.z);
    uv.push(.5+.46*r*Math.cos(a),.5+.46*r*Math.sin(a));
  }
  add(0,0);
  for(let j=1;j<=rings;j++){
    const r=j/rings,offset=1+(j-1)*rays;
    for(let i=0;i<rays;i++){
      add(r,tau*i/rays);
      const current=offset+i,next=offset+(i+1)%rays;
      if(j===1)indices.push(0,next,current);
      else indices.push(current-rays,next-rays,current,next-rays,next,current);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function materialMaps() {
  const size=1536,mid=size/2,span=.46*size;
  function context(){
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=size;
    return canvas.getContext('2d');
  }
  const color=context(),thickness=context();
  const tint=color.createLinearGradient(size*.13,size*.84,size*.89,size*.27);
  tint.addColorStop(0,'#4a7859');
  tint.addColorStop(.43,'#638f73');
  tint.addColorStop(.76,'#4d876d');
  tint.addColorStop(1,'#367760');
  color.fillStyle=tint;
  color.fillRect(0,0,size,size);
  thickness.fillStyle='#292929';
  thickness.fillRect(0,0,size,size);
  const project=(r,a)=>[mid+span*r*Math.cos(a),mid+span*r*Math.sin(a)];
  const pathAngle=(vein,r)=>vein.angle+vein.curl*r*r;
  function stroke(ctx,points,width,pigment){
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.strokeStyle=pigment;
    ctx.lineWidth=width;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
    ctx.stroke();
  }
  const ranges=Array.from({length:32},(_,i)=>.034+.969*i/31);
  for(let i=0;i<veins.length;i++){
    const vein=veins[i],next=veins[(i+1)%veins.length];
    color.beginPath();
    color.moveTo(mid,mid);
    for(const r of ranges)color.lineTo(...project(r,pathAngle(vein,r)));
    for(let j=ranges.length-1;j>=0;j--){
      const r=ranges[j];
      color.lineTo(...project(r,pathAngle(next,r)));
    }
    color.closePath();
    color.fillStyle=i%2?'rgba(180,206,119,.045)':'rgba(25,70,61,.065)';
    color.fill();
    const primary=ranges.map(r=>project(r,pathAngle(vein,r)));
    for(let k=0;k<primary.length-1;k++){
      const width=1.20+5.1*(1-ranges[k])**1.42;
      const segment=primary.slice(k,k+2);
      stroke(color,segment,width+1.4,'rgba(34,67,48,.37)');
      stroke(color,segment,width*.57,'rgba(152,177,120,.60)');
      stroke(thickness,segment,width+1.6,'#979797');
    }
    for(let j=0;j<12;j++){
      const r=.118+j*.071+.009*Math.sin(i*7.4+j*9.1);
      for(const side of [-1,1]){
        const length=(.075+.031*Math.sin(j*.34+i))*Math.min(1,(1.018-r)*13);
        const angles=.162+.018*Math.cos(i*3.2+j);
        const point=t=>project(r+t*length,pathAngle(vein,r+t*length)+side*angles*Math.sin(t*1.7));
        const branch=Array.from({length:13},(_,k)=>point(k/12));
        stroke(color,branch,1.05,'rgba(197,219,159,.25)');
        stroke(thickness,branch,1.35,'#606060');
        for(let k=1;k<=2;k++){
          const t=k/3,rr=r+t*length;
          const a=pathAngle(vein,rr)+side*angles*Math.sin(t*1.7);
          stroke(color,[point(t),project(rr+.020,a+side*.033),project(rr+.029,a+side*.052)],.70,'rgba(201,215,145,.13)');
        }
      }
    }
  }
  const petiole=color.createRadialGradient(mid,mid,5,mid,mid,52);
  petiole.addColorStop(0,'rgba(136,148,80,.88)');
  petiole.addColorStop(.34,'rgba(120,151,88,.38)');
  petiole.addColorStop(1,'rgba(116,153,105,0)');
  color.fillStyle=petiole;
  color.fillRect(mid-52,mid-52,104,104);
  function texture(ctx,colorSpace){
    const map=new THREE.CanvasTexture(ctx.canvas);
    map.flipY=false;
    map.colorSpace=colorSpace;
    map.anisotropy=8;
    return map;
  }
  return {pigment:texture(color,THREE.SRGBColorSpace),veins:texture(thickness,THREE.NoColorSpace)};
}

function connectStem(group){
  // Keep the scanned stalk through both original grips. Join only its upper
  // end to the independently modeled canopy.
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.276,.405,.177),new THREE.Vector3(-.292,.439,.177),
    new THREE.Vector3(-.308,.475,.1765),hub.clone()
  ]);
  const branch=new THREE.Mesh(new THREE.TubeGeometry(curve,26,.018,20,false),
    new THREE.MeshStandardMaterial({color:0x587f48,roughness:.66}));
  branch.name='Petiole joint';
  branch.castShadow=branch.receiveShadow=true;
  group.add(branch);
}

function scatterDew(group) {
  const water=createDewMaterial();
  const sphere=new THREE.SphereGeometry(1,36,24),hanging=sphere.clone();
  const shape=hanging.attributes.position;
  for(let i=0;i<shape.count;i++){
    const y=shape.getY(i),narrow=Math.max(0,y)**1.3;
    shape.setXYZ(i,shape.getX(i)*(1-.45*narrow),y+.33*narrow,shape.getZ(i)*(1-.45*narrow));
  }
  hanging.computeVertexNormals();
  const up=new THREE.Vector3(0,1,0);
  for(const [a,size] of [[.21,.012],[.87,.010],[1.51,.010],[2.48,.020],[2.83,.010],[3.20,.014],[4.10,.009],[5.02,.014],[5.72,.011]]){
    const drop=new THREE.Mesh(hanging,water);
    drop.name='Hanging dew';
    drop.scale.set(.81*size,1.15*size,.82*size);
    drop.position.copy(blade(.996,a));
    drop.position.y-=size*1.26;
    group.add(drop);
  }
  for(const [r,a,size] of [[.82,.36,.016],[.62,1.51,.010],[.89,2.34,.013],[.88,3.65,.010],
                         [.56,4.45,.012],[.90,4.88,.012],[.71,5.28,.017],[.91,5.38,.006],[.93,5.99,.012]]){
    const point=blade(r,a);
    const normal=blade(r,a+.0005).sub(point).cross(blade(r+.0005,a).sub(point)).normalize();
    const drop=new THREE.Mesh(sphere,water);
    drop.name='Dew on lamina';
    drop.quaternion.setFromUnitVectors(up,normal);
    drop.position.copy(point).addScaledVector(normal,size*.30);
    drop.scale.set(size,size*.64,size*.93);
    group.add(drop);
  }
}

export function createFrogLeaf() {
  const group=new THREE.Group();
  group.name='Lotus-leaf parasol';
  const pivot=new THREE.Group();
  pivot.name='Lotus leaf pivot';
  pivot.position.copy(hub);
  const surface=new THREE.Group();
  surface.position.copy(hub).negate();
  pivot.add(surface);
  group.add(pivot);
  const {pigment,veins}=materialMaps();
  const source=new THREE.MeshPhysicalMaterial({
    map:pigment,side:THREE.DoubleSide,roughness:.52,clearcoat:.22,clearcoatRoughness:.38
  });
  const {material,setLight}=createLeafOptics(source,veins);
  source.dispose();
  const canopy=new THREE.Mesh(surfaceGeometry(),material);
  canopy.name='Veined leaf blade';
  canopy.castShadow=true;
  canopy.receiveShadow=true;
  surface.add(canopy);
  connectStem(group);
  scatterDew(surface);
  return {group,setLight};
}
