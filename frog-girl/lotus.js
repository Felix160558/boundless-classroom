import * as THREE from '../three.module.min.js';
import {createDewMaterial} from './water.js';

const tau = Math.PI * 2;
const ribs = Array.from({length: 19}, (_, i) => ({
  a: tau * i / 19 + .031 * Math.sin(i * 2.13),
  bend: .065 * Math.cos(i * 2.27)
}));
const hub = new THREE.Vector3(-.49, 1.97, .02);
const ribAngle = (rib, r) => rib.a + rib.bend * r * r;
const angleDiff = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));

function blade(r, a) {
  const c=Math.cos(a), s=Math.sin(a);
  const edge = 1 + .047*Math.cos(5*a-.8) + .029*Math.sin(8*a+1.4) + .014*Math.cos(13*a);
  const x=1.02*r*c*edge, z=.69*r*s*edge;
  let ribFold=0;
  for(const rib of ribs){
    const d=angleDiff(a,ribAngle(rib,r));
    ribFold+=Math.exp(-d*d/.006)*.013*r;
  }
  // Peltate insertion, a shallow basin and one folded, lifting margin.
  const bowl=.112*(1-Math.exp(-7*r*r))-.04*r*r;
  const rolled=.13*Math.exp(-Math.pow(angleDiff(a,2.52)/.48,2))*Math.pow(r,4);
  const ripples=(.031*Math.sin(6*a+.7)+.016*Math.sin(9*a))*Math.pow(r,3);
  return new THREE.Vector3(hub.x+x,hub.y+.22*x+.36*z+bowl+rolled+ripples-ribFold,hub.z+z);
}

function leafMaps() {
  const size=1536;
  function canvas(){const c=document.createElement('canvas');c.width=c.height=size;return c.getContext('2d');}
  const paint=canvas(), thickness=canvas();
  const unit=size*.474, center=size/2;
  const uv=(r,a)=>[center+unit*r*Math.cos(a),center+unit*r*Math.sin(a)];
  const wash=paint.createLinearGradient(100,140,1400,1240);
  wash.addColorStop(0,'#78b39d');wash.addColorStop(.38,'#569c76');wash.addColorStop(.78,'#83b65c');wash.addColorStop(1,'#a4c779');
  paint.fillStyle=wash;paint.fillRect(0,0,size,size);
  thickness.fillStyle='#dfdfdf';thickness.fillRect(0,0,size,size);
  let seed=1823;
  const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function line(ctx,points,width,color){
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.stroke();
  }
  for(let i=0;i<ribs.length;i++){
    const rib=ribs[i],next=ribs[(i+1)%ribs.length];
    const sector=(r,a)=>uv(r,ribAngle(rib,r)+a*(((ribAngle(next,r)-ribAngle(rib,r))+tau)%tau));
    // Delicate unequal washes between rib fans are part of the leaf's pigment.
    paint.beginPath();paint.moveTo(center,center);
    for(let j=0;j<=12;j++)paint.lineTo(...sector(1.08,j/12));
    paint.closePath();paint.fillStyle=i%2?'rgba(211,232,134,.048)':'rgba(18,101,95,.055)';paint.fill();
    for(let j=0;j<13;j++){
      const at=.075+j*.068+(rnd()-.5)*.018;
      for(const sign of [1,-1]){
        const reach=Math.min(1.012-at,.085+.06*at);
        const get=(t)=>uv(at+reach*t,ribAngle(rib,at+reach*t)+sign*(.116+.035*rndFixed(i,j))*Math.sin(1.54*t));
        const pts=Array.from({length:13},(_,k)=>get(k/12));
        line(paint,pts,1.0+.7*(1-at),'rgba(195,222,160,.48)');
        line(thickness,pts,1.6,'#a8a8a8');
        for(let k=1;k<=3;k++){
          const t=k/4, start=get(t);
          const rr=at+reach*t,aa=ribAngle(rib,rr)+sign*(.116+.035*rndFixed(i,j))*Math.sin(1.54*t);
          line(paint,[start,uv(rr+.019,aa+sign*.011),uv(rr+.030,aa+sign*.027)],1,'rgba(216,231,166,.29)');
        }
      }
    }
    const path=Array.from({length:49},(_,k)=>uv(k/48,ribAngle(rib,k/48)));
    for(let k=0;k<48;k++){
      const w=1+5.5*(1-k/48)**1.4;
      line(paint,path.slice(k,k+2),w+2,'rgba(47,102,67,.42)');
      line(paint,path.slice(k,k+2),w,'#a3be83');line(thickness,path.slice(k,k+2),w+2,'#686868');
    }
  }
  const centerWash=paint.createRadialGradient(center,center,0,center,center,45);
  centerWash.addColorStop(0,'rgba(223,209,134,.96)');centerWash.addColorStop(.23,'rgba(181,196,117,.7)');centerWash.addColorStop(1,'rgba(138,177,100,0)');
  paint.fillStyle=centerWash;paint.fillRect(center-45,center-45,90,90);
  function texture(ctx,color=false){
    const t=new THREE.CanvasTexture(ctx.canvas);t.flipY=false;t.anisotropy=8;
    if(color)t.colorSpace=THREE.SRGBColorSpace;return t;
  }
  return {map:texture(paint,true),thickness:texture(thickness)};
}
function rndFixed(i,j){return (Math.sin(i*4.35+j*3.71)+1)*.5;}

function leafShell() {
  const rings=34, divide=190, positions=[],uv=[],index=[];
  const emit=(r,a)=>{const p=blade(r,a);positions.push(p.x,p.y,p.z);uv.push(.5+.474*r*Math.cos(a),.5+.474*r*Math.sin(a));};
  emit(0,0);
  for(let j=1;j<=rings;j++){
    const r=j/rings;
    for(let i=0;i<divide;i++)emit(r,tau*i/divide);
    for(let i=0;i<divide;i++){
      const here=1+(j-1)*divide+i,after=1+(j-1)*divide+(i+1)%divide;
      if(j===1)index.push(0,after,here);
      else index.push(here-divide,after-divide,here,after-divide,after,here);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();
  return g;
}

export function createLotus() {
  const group=new THREE.Group();group.name='Lotus parasol';
  const {map,thickness}=leafMaps();
  const key={value:new THREE.Vector3()}, through={value:1};
  const tissue=new THREE.MeshPhysicalMaterial({map,side:THREE.DoubleSide,roughness:.53,clearcoat:.20,clearcoatRoughness:.42});
  tissue.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{lotusKey:key,lotusLight:through,veinThickness:{value:thickness}});
    shader.vertexShader='varying vec3 leafWorldNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nleafWorldNormal = normalize(mat3(modelMatrix)*objectNormal);');
    shader.fragmentShader='varying vec3 leafWorldNormal; uniform vec3 lotusKey; uniform float lotusLight; uniform sampler2D veinThickness;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 sheetNormal=normalize(leafWorldNormal)*(gl_FrontFacing?1.0:-1.0);
      float backlit=max(0.0,-dot(sheetNormal,lotusKey));
      float thinness=texture2D(veinThickness,vMapUv).r;
      outgoingLight+=diffuseColor.rgb*vec3(1.19,1.21,.61)*thinness*pow(backlit,.76)*lotusLight;
      #include <opaque_fragment>`);
  };
  const canopy=new THREE.Mesh(leafShell(),tissue);
  canopy.name='Veined translucent lotus blade';canopy.castShadow=true;canopy.receiveShadow=true;group.add(canopy);
  const petiole=new THREE.CatmullRomCurve3([
    [.15-.52*.065,.065,.36+.033*.065], [.15-.52*.28,.28,.36+.033*.28], [.15-.52*.85,.85,.36+.033*.85],
    [-.458,1.18,.398],[-.555,1.49,.307],[-.54,1.78,.152],[hub.x,hub.y-.003,hub.z]
  ].map(p=>new THREE.Vector3(...p)));
  const stemMaterial=new THREE.MeshStandardMaterial({color:0x667e42,roughness:.55});
  const stalk=new THREE.Mesh(new THREE.TubeGeometry(petiole,85,.0115,12,false),stemMaterial);
  stalk.name='Lotus petiole';stalk.castShadow=true;group.add(stalk);
  // Tangible droplets share a glass material. Both the studio environment and
  // the movable key contribute reflections; the opaque leaf is visible through them.
  const dew=createDewMaterial({singleHighlight:false});
  const droplet=new THREE.SphereGeometry(1,24,18);
  const hangingGeo=droplet.clone(), xyz=hangingGeo.attributes.position;
  for(let i=0;i<xyz.count;i++){
    const y=xyz.getY(i), taper=1-.40*Math.max(y,0)**1.5;
    xyz.setXYZ(i,xyz.getX(i)*taper,y+.40*Math.max(y,0)**2,xyz.getZ(i)*taper);
  }
  hangingGeo.computeVertexNormals();
  for(const [a,s] of [[.27,.014],[.94,.023],[1.18,.009],[1.66,.017],[2.12,.026],[2.86,.013],[3.43,.016],[4.42,.018],[5.35,.013],[5.93,.018]]){
    const drop=new THREE.Mesh(hangingGeo,dew);drop.scale.set(s,s*1.26,s);
    drop.position.copy(blade(.997,a));drop.position.y-=s*1.36;group.add(drop);
  }
  for(const [r,a,s] of [[.88,2.24,.018],[.77,.95,.012],[.62,2.86,.013],[.94,.42,.021],[.91,.52,.009],[.52,4.75,.016],[.71,5.32,.012],[.86,1.68,.013]]){
    const drop=new THREE.Mesh(droplet,dew);
    const p=blade(r,a),n=blade(r,a+.0004).sub(p).cross(blade(r+.0004,a).sub(p)).normalize();
    drop.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);
    drop.position.copy(p).addScaledVector(n,s*.24);drop.scale.set(s,s*.64,.93*s);group.add(drop);
  }
  return {group,setLight(direction,power){key.value.copy(direction);through.value=power;}};
}
