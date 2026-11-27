import * as THREE from '../three.module.min.js';

const {clamp, lerp, smoothstep} = THREE.MathUtils;
const PI = Math.PI;
const profile = [ // height, half-width, front, back; model faces +Z
  [1.000,.001,.107,.105], [1.009,.044,.136,.077], [1.030,.098,.164,.010],
  [1.071,.163,.190,-.090], [1.128,.219,.210,-.160], [1.202,.264,.222,-.203],
  [1.281,.284,.227,-.224], [1.347,.288,.223,-.229], [1.429,.284,.225,-.226],
  [1.501,.269,.218,-.214], [1.567,.225,.178,-.183], [1.617,.151,.118,-.131],
  [1.649,.077,.059,-.081], [1.660,.001,-.005,-.007]
];
const sq = x => x*x;
const bell = (x,y,rx,ry) => Math.exp(-sq(x/rx)-sq(y/ry));
const widthAt = (y,c) => {
  let i=1;
  while(i<profile.length-1 && profile[i][0]<y) i++;
  const a=profile[i-1],b=profile[i],p=profile[Math.max(0,i-2)],q=profile[Math.min(profile.length-1,i+1)];
  const h=b[0]-a[0],t=clamp((y-a[0])/h,0,1);
  const da=(b[c]-p[c])/(b[0]-p[0]),db=(q[c]-a[c])/(q[0]-a[0]);
  return lerp(a[c],b[c],t*t*(3-2*t)) + h*t*(1-t)*((1-t)*da-t*db);
};

// One continuous facial surface. The orbital hollows, cheekbones, nose and lips
// stay attached in silhouette when orbiting or moving the grazing light.
function relief(x,y){
  const a=Math.abs(x);
  return -.023*bell(a-.127,y-1.338,.091,.042)
    +.014*bell(a-.143,y-1.393,.096,.036)
    +.023*bell(a-.165,y-1.263,.098,.066)
    +.026*bell(x,y-1.318,.024,.086)
    +.047*bell(x,y-1.261,.030,.029)
    +.016*bell(a-.023,y-1.251,.016,.012)
    -.009*bell(x,y-1.237,.019,.009)
    +.009*bell(x,y-1.191,.038,.042)
    +.007*bell(a-.016,y-1.176,.023,.009)
    +.012*bell(x,y-1.162,.036,.011)
    -.005*bell(x,y-1.145,.040,.008)
    +.006*bell(x,y-1.078,.064,.026);
}
function frontAt(x,y){
  const w=widthAt(y,1),f=widthAt(y,2),b=widthAt(y,3);
  const facing=Math.sqrt(Math.max(0,1-sq(x/w)));
  return (f+b)*.5+(f-b)*.5*Math.pow(facing,.79)+relief(x,y)*smoothstep(facing,0,.50);
}
function grid(nx,ny,sample,{reverse=false,wrap=false}={}){
  const pos=[],col=[],uv=[],idx=[],n=wrap?nx:nx+1;
  for(let j=0;j<=ny;j++)for(let i=0;i<n;i++){
    const u=i/nx,v=j/ny,p=sample(u,v);
    pos.push(p.x,p.y,p.z);uv.push(...(p.uv||[u,v]));
    if(p.color)col.push(p.color.r,p.color.g,p.color.b);
    if(i<nx&&j<ny){
      const a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;
      if(reverse)idx.push(a,c,b,b,c,d);else idx.push(a,b,c,b,d,c);
    }
  }
  const g=new THREE.BufferGeometry();g.setIndex(idx);
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  if(col.length)g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.computeVertexNormals();return g;
}
function standard(color,roughness=.63){return new THREE.MeshStandardMaterial({color,roughness});}
function mesh(parent,name,geo,mat){
  const o=new THREE.Mesh(geo,mat);o.name=name;o.receiveShadow=true;parent.add(o);return o;
}
function skinTone(x,y,facing){
  const a=Math.abs(x),color=new THREE.Color('#ffe4d6');
  const blush=bell(a-.165,y-1.271,.083,.045)*.61;
  color.lerp(new THREE.Color('#f3b0b3'),blush*facing);
  color.lerp(new THREE.Color('#e4a7a6'),.37*facing*bell(x,y-1.256,.033,.019));
  color.lerp(new THREE.Color('#da9e92'),.35*facing*bell(x,y-1.171,.047,.014));
  color.lerp(new THREE.Color('#c68c85'),.15*facing*bell(a-.13,y-1.365,.09,.036));
  return color;
}
function makeHead(group){
  const geo=grid(160,144,(u,v)=>{
    const a=u*PI*2,y=lerp(1,1.66,.5-.5*Math.cos(PI*v)),x=widthAt(y,1)*Math.sin(a);
    const c=Math.cos(a),b=widthAt(y,3),f=widthAt(y,2);
    const z=c>0?frontAt(x,y):(b+f)*.5+c*(f-b)*.5;
    return {x,y,z,color:skinTone(x,y,Math.max(0,c))};
  },{wrap:true});
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,roughness:.60,specularIntensity:.21});
  const head=mesh(group,'Face · porcelain and rose undertones',geo,material);head.castShadow=true;
}

// All eye details share the same curved almond-shaped aperture. Iris and pupil
// disappear naturally under the lids from every angle, including in profile.
function eyeBoundary(u){
  const t=clamp(u,0,1),arc=Math.pow(Math.max(0,Math.sin(t*PI)),.83);
  const base=1.322+.015*t;
  return {top:base+.040*arc*(1.08-.14*t),bottom:base-.026*arc,x:.038+.172*t};
}
function eyePoint(side,u,v){
  const {top,bottom,x:a}=eyeBoundary(u),x=side*a,y=lerp(bottom,top,v);
  const dome=Math.pow(Math.max(0,4*v*(1-v)*Math.sin(PI*u)),.83);
  return {x,y,z:frontAt(x,y)+.0017+.013*dome,uv:[(x-side*.123)/.042,(y-1.332)/.047]};
}
function eyeMaterial(light,level){
  const m=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.30,specularIntensity:.24,clearcoat:.18,clearcoatRoughness:.21});
  m.onBeforeCompile=shader=>{
    shader.uniforms.frogLight=light;shader.uniforms.frogExposure=level;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec2 eyeCoords; varying vec3 eyeWorld;`).replace('#include <begin_vertex>',`#include <begin_vertex>
      eyeCoords=uv; eyeWorld=(modelMatrix*vec4(position,1.)).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 eyeCoords; varying vec3 eyeWorld;
      uniform vec3 frogLight; uniform float frogExposure;`).replace('#include <color_fragment>',`#include <color_fragment>
      {
      vec2 p=eyeCoords;
      float rr=length(p), a=atan(p.y,p.x), aa=max(.011,fwidth(rr));
      float warm=smoothstep(.68,2.,abs(p.x));
      vec3 sclera=mix(vec3(.92,.855,.849),vec3(.83,.644,.631),warm*.56);
      sclera*=1.-.11*smoothstep(.35,.85,p.y);
      float lower=smoothstep(-.37,.78,-p.y);
      vec3 stroma=mix(vec3(.102,.038,.256),vec3(.127,.555,.827),lower);
      stroma+=vec3(.15,.053,.32)*exp(-11.*(p.y+.10)*(p.y+.10));
      float line1=(.5+.5*sin(61.*a+sin(17.*a)*1.9+4.*rr));
      float line2=(.5+.5*sin(105.*a+2.7*sin(23.*a)-5.*rr));
      float band=smoothstep(.32,.62,rr)*(1.-smoothstep(.8,1.,rr));
      stroma+=vec3(.061,.068,.089)*(line1*line2)*band;
      stroma=mix(stroma,vec3(.038,.030,.103),.89*smoothstep(.78,.98,rr));
      float pupilRadius=mix(.425,.315,frogExposure);
      float pupil=1.-smoothstep(pupilRadius-aa,pupilRadius+aa,length((p-vec2(0.,.19))/vec2(.89,1.04)));
      stroma=mix(stroma,vec3(.035,.018,.080),pupil);
      vec3 irisColor=mix(sclera,stroma,1.-smoothstep(.965-aa,.965+aa,rr));
      vec3 incoming=normalize(frogLight+normalize(cameraPosition-eyeWorld));
      vec2 g=vec2(incoming.x*.68,.26+incoming.y*.59);
      vec2 d=(p-g)/vec2(.117,.170);float glint=1.-smoothstep(.75,1.1,length(d));
      d=(p-g-vec2(.13,-.13))/vec2(.033,.045);glint+=.62*(1.-smoothstep(.67,1.2,length(d)));
      glint*=1.-smoothstep(.83,.98,rr);
      irisColor+=vec3(.12,.23,.31)*exp(-160.*(rr-.70)*(rr-.70))*smoothstep(.38,.78,-p.y)*(.35+.65*line1);
      diffuseColor.rgb*=irisColor;
      totalEmissiveRadiance+=vec3(.99,.97,.93)*glint*(.22+.82*frogExposure);
      }
    `);
  };
  return m;
}
function ribbon(group,name,side,fn,color,steps=42){
  const geo=grid(steps,3,(u,v)=>{
    const b=fn(u),x=b.x+b.nx*(v-.5)*b.width,y=b.y+b.ny*(v-.5)*b.width;
    return {x,y,z:frontAt(x,y)+b.offset+Math.sin(PI*v)*b.width*.13};
  },{reverse:side<0});
  const m=standard(color,.54);m.side=THREE.DoubleSide;return mesh(group,name,geo,m);
}
function trace(group,name,side,points,widthAtT,offset,color,steps=40){
  const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(x,y,0)),false,'centripetal');
  return ribbon(group,name,side,t=>{
    const p=curve.getPoint(t),d=curve.getTangent(t);
    return {x:side*p.x,y:p.y,nx:-side*d.y,ny:d.x,width:widthAtT(t),offset};
  },color,steps);
}
function buildEye(group,side,mat){
  const label=side<0?'Left':'Right';
  const white=mesh(group,`${label} eye · sclera, iris and cornea`,grid(56,24,(u,v)=>eyePoint(side,u,v),{reverse:side<0}),mat);
  white.castShadow=false;
  // A rounded upper fold rises into the skin just above the lash roots.
  const fold=grid(54,10,(u,v)=>{
    const b=eyeBoundary(u),a=Math.sin(u*PI)**.72,x=side*b.x;
    const y=b.top+v*(.019*a+.0001);
    return {x,y,z:frontAt(x,y)+.001+(.0038+.0025*Math.sin(PI*v))*a*(1-v),color:skinTone(x,y,1)};
  },{reverse:side<0});
  mesh(group,`${label} upper eyelid`,fold,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.69}));
  ribbon(group,`${label} upper lash line`,side,u=>{
    const b=eyeBoundary(u);
    return {x:side*b.x,y:b.top,nx:0,ny:1,width:.0005+.0085*Math.sin(PI*u)**.65*(.35+u),offset:.00445};
  },'#432e38',60);
  for(let k=0;k<4;k++){
    const t=.60+k*.098,b=eyeBoundary(t),ext=.008+k*.0025,lift=.009+(k===2?.005:0);
    trace(group,`${label} tapered outer lash ${k+1}`,side,[[b.x-.006,b.top-.001],[b.x+.003,b.top+.0025],[b.x+ext,b.top+lift]],
      u=>.0063*(1-u)**1.28+.00004,.0050,'#493339',18);
  }
  ribbon(group,`${label} lower waterline`,side,u=>{
    const b=eyeBoundary(u);
    return {x:side*b.x,y:b.bottom,nx:0,ny:1,width:.001+.0028*Math.sin(PI*u),offset:.0022};
  },'#c7908e');
  const corners=[[.181,eyeBoundary(.83).bottom],[.196,eyeBoundary(.92).bottom+.0006],[.210,eyeBoundary(1).bottom]];
  trace(group,`${label} outer lower lashes`,side,corners,u=>.003*Math.sin(PI*u)**.8,.003,'#80535a',25);
  const crease=[[.052,1.350],[.091,1.378],[.138,1.383],[.179,1.378],[.204,1.362]];
  trace(group,`${label} soft lid crease`,side,crease,u=>.0019*Math.sin(PI*u)**.77,.00095,'#dda8a2');
  trace(group,`${label} tapered brow`,side,[[.047,1.391],[.085,1.401],[.145,1.417],[.192,1.414],[.210,1.405]],
    u=>(.0036+.0060*Math.sin(PI*u))*Math.sin(PI*u)**.45,.00125,'#765745');
}
function mouth(group){
  // The central mouth seam is narrow and soft, with a slight difference at the corners.
  const count=54;
  const seam=t=>1.176+.0018*Math.cos(2*PI*t)-.0015*Math.sin(PI*t*2)+.002*t;
  const geo=grid(count,6,(u,v)=>{
    const x=lerp(-.041,.043,u),y=seam(u)+(.5-v)*(.002+.0065*Math.pow(Math.sin(PI*u),.65));
    return {x,y,z:frontAt(x,y)+.00105};
  },{reverse:true});
  mesh(group,'Mouth · quiet parted smile',geo,standard('#885558',.71));
  for(const side of [-1,1]){
    trace(group,'Corner of smile',side,[[.035,1.176],[.041,1.178],[.047,1.181]],u=>.0048*(1-u),.00135,'#b77c73',14);
    trace(group,'Nostril',side,[[.014,1.248],[.020,1.247],[.024,1.249]],u=>.0025*Math.sin(PI*u),.001,'#c58e82',15);
  }
  ribbon(group,'Lower lip satin',1,u=>({x:lerp(-.029,.031,u),y:1.163+.0025*sq(u*2-1),nx:0,ny:1,width:.00225*Math.sin(PI*u),offset:.0008}),'#f6c3b6',30);
}
function ear(group,side){
  // The pinna has a raised rim and recessed concha, not a sphere attached to the cheek.
  const geo=grid(54,20,(u,v)=>{
    const a=2*PI*u,ca=Math.cos(a),sa=Math.sin(a),rim=Math.exp(-sq((v-.81)/.13));
    const x=side*(.265+.030*(1-v*v)+.018*rim+.007*sa*v);
    const y=1.303+v*(.070*sa+.009*ca),z=-.014+v*(.033*ca+.006*sa);
    const color=new THREE.Color('#fbd5c1').lerp(new THREE.Color('#d99f98'),.72*(1-smoothstep(v,.30,.79)));
    return {x,y,z,color};
  },{wrap:true,reverse:side>0});
  const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.69,side:THREE.DoubleSide});
  mesh(group,'Ear · helix and concha',geo,m);
}
export function createFace(){
  const group=new THREE.Group();group.name='Frog girl · portrait';
  const light={value:new THREE.Vector3(-.45,.70,.55).normalize()},level={value:.66};
  makeHead(group);
  const cornea=eyeMaterial(light,level);
  for(const side of [-1,1]){buildEye(group,side,cornea);ear(group,side);}
  mouth(group);
  return {group,setLight(direction,intensity){
    light.value.copy(direction).normalize();
    level.value=clamp(intensity,0,1);
  }};
}
