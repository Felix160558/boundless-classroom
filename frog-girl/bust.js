import * as THREE from '../three.module.min.js';

const TAU = 2 * Math.PI;
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const C = color => new THREE.Color(color);
const mix = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;
function finish(color, roughness, options = {}) {
  return new THREE.MeshStandardMaterial({color, roughness, ...options});
}
function mount(parent, name, geometry, mat) {
  const mesh = new THREE.Mesh(geometry,mat);
  mesh.name=name; mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh);
  return mesh;
}
// Closed angular sections share a vertex at the seam, so highlights can cross it.
function wrap(parent,name,mat,sections,sides,sample,colorAt) {
  const vertices=[],indices=[],colors=[];
  for (let j=0;j<=sections;j++) {
    for(let i=0;i<sides;i++) {
      const a=i*TAU/sides,t=j/sections;
      vertices.push(...sample(a,t).toArray());
      if(colorAt) colors.push(...colorAt(a,t).toArray());
      if(j<sections){
        const next=(i+1)%sides, k=j*sides+i, r=j*sides+next;
        indices.push(k,r,k+sides,r,r+sides,k+sides);
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  if(colorAt)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();return mount(parent,name,g,mat);
}
function rail(coords){return new THREE.CatmullRomCurve3(coords.map(p=>Array.isArray(p)?V(...p):p));}
function axes(tangent){
  let x=V(1,0,0);
  if(Math.abs(tangent.x)>.97)x=V(0,1,0);
  x.addScaledVector(tangent,-x.dot(tangent)).normalize();
  return [x,V(0,0,0).crossVectors(x,tangent).normalize()];
}
// Use parallel transport for folded sleeves and bent fingers. Rings never flip
// at an elbow, including when the path approaches a horizontal tangent.
function loft(parent,name,mat,curve,sections,sides,section,colorAt){
  const frames=curve.computeFrenetFrames(sections,false);
  const startT=curve.getTangentAt(0), [startX]=axes(startT);
  const angle=Math.atan2(startX.dot(frames.binormals[0]),startX.dot(frames.normals[0]));
  const sample=(a,t)=>{
    const j=Math.round(t*sections), [rx,rz,offset=0]=section(t,a);
    const dx=Math.sin(a)*rx,dz=Math.cos(a)*rz;
    // binormal = tangent x normal. The positive face of each front ring uses -binormal.
    const nx=dx*Math.cos(angle)+dz*Math.sin(angle), bz=dx*Math.sin(angle)-dz*Math.cos(angle);
    return curve.getPointAt(t).addScaledVector(frames.normals[j],nx)
      .addScaledVector(frames.binormals[j],bz).addScaledVector(frames.tangents[j],offset);
  };
  return wrap(parent,name,mat,sections,sides,sample,colorAt);
}
function stroke(parent,name,points,width,mat,segments=28){
  return mount(parent,name,new THREE.TubeGeometry(rail(points),segments,width,7,false),mat);
}
function ellipsoid(parent,name,position,scale,mat){
  const mesh=mount(parent,name,new THREE.SphereGeometry(1,32,20),mat);
  mesh.position.copy(position); mesh.scale.set(...scale);return mesh;
}
function profile(value, rows){
  for(let i=1;i<rows.length;i++)if(value<=rows[i][0]){
    const p=rows[i-1],q=rows[i],u=(value-p[0])/(q[0]-p[0]);
    return mix(p[1],q[1],u);
  }
  return rows[rows.length-1][1];
}
const coatWidth=[[0,.305],[.07,.327],[.23,.345],[.47,.353],[.62,.369],[.79,.393],[.86,.390],[.91,.356],[.96,.274],[1,.134]];
const coatDepth=[[0,.180],[.15,.202],[.4,.218],[.64,.211],[.80,.186],[.90,.159],[1,.112]];
function coatPoint(a,t){
  const front=Math.cos(a), side=Math.sin(a);
  const fold=(.0045*Math.cos(11*a+1.2*t)+.0034*Math.cos(7*a-3*t)+.0025*Math.cos(17*a))*
    (.21+.79*(1-smooth(t,.45,.99)));
  const width=profile(t,coatWidth)+fold,depth=profile(t,coatDepth)+fold;
  const notch=.075*Math.max(front,0)**8;
  return V(side*width,.048+.842*t-(1-smooth(1-t,0,.23))*notch,
    (.019*t-.005)+(front<0?.92:1)*front*depth);
}
function trimPath(parent,name,count,fn,width,material){
  const points=Array.from({length:count+1},(_,i)=>fn(i/count));
  stroke(parent,name,points,width,material,count*2);
}
function coat(parent,m){
  const low=C('#96ad68'), light=C('#c7d789');
  wrap(parent,'Tailored raincoat',m.cloth,48,128,coatPoint,(a,t)=>
    low.clone().lerp(light,.28+.48*t+.12*Math.cos(a)+.045*Math.sin(3*a+2*t)));
  // A cutaway hem still has a modeled underside, including at a low orbit angle.
  ellipsoid(parent,'Finished raincoat hem',V(0,.050,-.004),[.307,.028,.182],m.hem);
  trimPath(parent,'Turned hem seam',64,u=>coatPoint(TAU*u,.025),.0023,m.border);
  trimPath(parent,'Collar binding',64,u=>coatPoint(TAU*u,1),.0034,m.piping);
  // The pale belly panel follows the actual fabric volume and narrows under the placket.
  const p=[],ind=[], rows=22,columns=48;
  for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
    const u=i/columns, a=(u-.5)*1.78, top=.48-.18*Math.pow(Math.abs(2*u-1),1.6);
    const q=coatPoint(a,.002+(top-.002)*j/rows);
    q.x+=.0024*Math.sin(a);q.z+=.0024*Math.cos(a);p.push(q.x,q.y,q.z);
    if(j<rows&&i<columns){const k=j*(columns+1)+i;ind.push(k,k+1,k+columns+1,k+1,k+columns+2,k+columns+1);}
  }
  const bib=new THREE.BufferGeometry();bib.setAttribute('position',new THREE.Float32BufferAttribute(p,3));bib.setIndex(ind);bib.computeVertexNormals();
  mount(parent,'Pale celadon front panel',bib,m.panel);
  const placketPoint=(u,side)=>{
    const t=mix(.015,.995,u),a=side*.094+.016*Math.sin(u*3.5);
    const q=coatPoint(a,t);q.z+=.006;return q;
  };
  const strip=[],stripIdx=[];
  for(let j=0;j<=48;j++){
    strip.push(...placketPoint(j/48,-1).toArray(),...placketPoint(j/48,1).toArray());
    if(j<48){const k=j*2;stripIdx.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(strip,3));g.setIndex(stripIdx);g.computeVertexNormals();
  mount(parent,'Folded front placket',g,m.placket);
  for(const sign of [-1,1])trimPath(parent,'Placket topstitch',40,u=>placketPoint(u,sign),.0016,m.piping);
  for(const t of [.69,.47,.25]){
    const q=coatPoint(.005,t);q.z+=.013;
    ellipsoid(parent,'Carved horn button',q,[.0216,.0225,.007],m.button);
    const z=q.z+.0065;
    for(const s of [-1,1])stroke(parent,'Crossed button thread',[
      V(q.x-.0065,q.y-s*.008,z),V(q.x,q.y,z+.001),V(q.x+.0065,q.y+s*.008,z)],.0017,m.thread,8);
  }
  for(const s of [-1,1]){
    trimPath(parent,'Side seam',35,u=>{
      const q=coatPoint(s*(1.50+.08*Math.sin(Math.PI*u)),mix(.02,.91,u));q.x+=s*.001;return q;
    },.0018,m.border);
    // Two darts below the back yoke, gently tapered like real garment seams.
    trimPath(parent,'Back shoulder tuck',24,u=>{
      const q=coatPoint(Math.PI+s*mix(.37,.53,u),mix(.45,.88,u));q.z-=.0016;return q;
    },.0017,m.border);
  }
  trimPath(parent,'Back yoke',40,u=>{
    const a=Math.PI+mix(-1.04,1.04,u),q=coatPoint(a,.79+.045*(2*u-1)**2);q.z-=.002;return q;
  },.0026,m.piping);
}
function neck(parent,m){
  wrap(parent,'Neck',m.skin,32,64,(a,t)=>{
    const width=.090+.043*(1-smooth(t,0,.4))+.012*smooth(t,.65,1);
    const dz=.094+.022*(1-smooth(t,0,.35));
    return V(Math.sin(a)*width,.795+.31*t,.016+Math.cos(a)*dz);
  },(a,t)=>C('#ffe4d6').lerp(C('#f1c5b5'),smooth(t,.53,1)*.78));
}
// Palm-side coordinates are in a frame tilted the same way as the leaf stalk.
const stemAxis=V(-.52,1,.033).normalize();
const gripAcross=V(1,.52,0).normalize();
const gripFront=V(0,0,0).crossVectors(gripAcross,stemAxis).normalize();
function grip(y,s){
  const center=V(.15-.52*y,y,.36+.033*y);
  return (x,u,z)=>center.clone().addScaledVector(gripAcross,x*s)
    .addScaledVector(stemAxis,u).addScaledVector(gripFront,z);
}
function hand(parent,m,at,side){
  const skinBase=C('#ffe4d6'),warm=C('#f5c9b9');
  // Slightly arched palm tapers into wrist and into the bases of the four fingers.
  wrap(parent,'Cupped palm',m.skin,32,56,(a,t)=>{
    const w=profile(t,[[0,.029],[.15,.031],[.32,.040],[.64,.047],[.87,.041],[.98,.023],[1,.004]]);
    const d=profile(t,[[0,.027],[.3,.026],[.55,.032],[.8,.029],[1,.004]]);
    const cross=Math.sin(a)*w;
    return at(.082-.040*t+cross,-.132+.193*t,-.030+.012*t+Math.cos(a)*d);
  },(a,t)=>skinBase.clone().lerp(warm,.09+.14*Math.pow(Math.sin(a),2)+.08*(1-t)));
  // Four partially closed fingers lie on staggered paths around the same stalk.
  const digits=[{u:.043,r:.0136,l:1},{u:.014,r:.0145,l:1.07},{u:-.015,r:.0137,l:.96},{u:-.041,r:.0117,l:.80}];
  for(const {u,r,l} of digits){
    const pts=[[.061,u-.008,-.01],[.051,u+.001,.006],[.029,u+.010,.022],
      [.006,u+.012,.024],[-.016*l,u+.006,.019],[-.026*l,u-.002,.005],[-.019*l,u-.008,-.011]];
    const curve=rail(pts.map(q=>at(...q)));
    loft(parent,'Curled finger',m.skin,curve,30,20,(t)=>{
      const pad=profile(t,[[0,.76],[.1,.97],[.40,.90],[.53,1.0],[.72,.82],[.84,.83],[.94,.65],[1,.001]]);
      return [r*pad,r*pad*.92];
    },(a,t)=>skinBase.clone().lerp(warm,.08+.33*smooth(t,.61,.99)));
  }
  const thumbPath=[[.076,-.067,-.013],[.080,-.040,.007],[.069,-.009,.027],
    [.058,.025,.036],[.045,.048,.036],[.029,.058,.030],[.016,.060,.018],[.012,.060,.011]];
  loft(parent,'Opposed thumb',m.skin,rail(thumbPath.map(q=>at(...q))),32,24,t=>{
    const radius=profile(t,[[0,.027],[.24,.028],[.49,.020],[.64,.018],[.80,.016],[.92,.014],[1,.001]]);
    return [radius,radius*.88];
  },(a,t)=>skinBase.clone().lerp(warm,.12+.24*t));
  // The visible thumb nail follows the distal phalanx instead of pointing outwards.
  const nail=ellipsoid(parent,'Warm translucent thumbnail',at(.030,.062,.040),[.0068,.013,.0027],m.nail);
  nail.quaternion.setFromUnitVectors(V(0,1,0),at(.016,.060,.018).sub(at(.045,.048,.036)).normalize());
  return at(.082,-.130,-.030);
}
function cuff(parent,m,begin,end){
  const axis=end.clone().sub(begin).normalize(),[x,z]=axes(axis);
  function sample(a,t){
    const wave=Math.sin(9*a+.35*Math.sin(3*a))+.28*Math.cos(5*a+.7);
    const gathered=profile(t,[[0,.062],[.14,.058],[.31,.049],[.56,.056],[1,.077]]);
    const radial=gathered+(t*t*.008+.0017)*wave;
    return begin.clone().lerp(end,t)
      .addScaledVector(x,Math.sin(a)*radial).addScaledVector(z,Math.cos(a)*radial*.9)
      .addScaledVector(axis,.010*t*t*Math.cos(9*a+.46));
  }
  const light=C('#f1d68e'),dark=C('#c49b52');
  wrap(parent,'Gathered golden cuff',m.cloth,25,96,sample,(a,t)=>dark.clone().lerp(light,.24+.42*t+.13*Math.cos(9*a)));
  trimPath(parent,'Turned cuff edge',78,u=>sample(u*TAU,1),.0025,m.goldPiping);
  trimPath(parent,'Cuff gathered stitch',60,u=>sample(u*TAU,.29),.0015,m.goldPiping);
  // Model the turned-in lining so the sleeve has thickness at the lifted wrist.
  wrap(parent,'Inner cuff facing',m.cuffInside,10,96,(a,t)=>{
    const rim=sample(a,1),inner=end.clone().addScaledVector(axis,-.016)
      .addScaledVector(x,Math.sin(a)*.034).addScaledVector(z,Math.cos(a)*.030);
    return inner.lerp(rim,t);
  });
}
function sleeve(parent,m,side,wrist){
  const upper=side<0;
  const pts=upper?[V(-.286,.772,-.002),V(-.392,.739,.012),V(-.446,.580,.042),
    V(-.465,.475,.105),V(-.426,.508,.189),V(-.377,.600,.265),wrist]:
    [V(.287,.772,-.002),V(.393,.738,.009),V(.441,.557,.026),V(.457,.371,.062),
      V(.430,.255,.109),V(.348,.226,.190),V(.227,.223,.261),wrist];
  const curve=rail(pts),u=upper?.903:.916;
  const cuffStart=curve.getPointAt(u), cuffEnd=wrist.clone().addScaledVector(curve.getTangentAt(.998),.008);
  const sleevePts=Array.from({length:40},(_,i)=>curve.getPointAt((u+.024)*i/39));
  const low=C('#89a95f'),high=C('#c6d991');
  loft(parent,upper?'Lifted coat sleeve':'Crossed coat sleeve',m.cloth,rail(sleevePts),68,64,(t,a)=>{
    const radius=profile(t,[[0,.076],[.13,.106],[.31,.100],[.50,.099],[.67,.102],[.85,.095],[1,.070]]);
    const elbow=upper?.56:.55;
    const pinch=Math.exp(-((t-elbow)**2)/.019);
    const folds=.0068*Math.sin(a*4+2*t)+.0040*Math.cos(a*7-4*t)+
      .009*pinch*Math.cos(27*t+1.7*Math.sin(a));
    const radiusWithFolds=radius+folds;
    return [radiusWithFolds,radiusWithFolds*.94];
  },(a,t)=>low.clone().lerp(high,.38+.15*Math.cos(a)+.19*(1-t)));
  cuff(parent,m,cuffStart,cuffEnd);
}
export function createBust(){
  const group=new THREE.Group();group.name='Raincoat, neck and grasping hands';
  const cloth=finish(0xffffff,.83,{vertexColors:true,side:THREE.DoubleSide});
  const m={cloth,hem:finish('#98b174',.88),panel:finish('#cedcbb',.86),
    border:finish('#93a872',.91),piping:finish('#b7c88b',.86),placket:finish('#c4d299',.80,{side:THREE.DoubleSide}),
    button:finish('#b7995a',.52),thread:finish('#6b623a',.94),
    goldPiping:finish('#ead09a',.85),cuffInside:finish('#d0ab69',.89,{side:THREE.DoubleSide}),
    skin:finish(0xffffff,.68,{vertexColors:true,side:THREE.DoubleSide}),nail:finish('#edc6bb',.49)};
  neck(group,m);coat(group,m);
  for(const side of [-1,1]){
    const wrist=hand(group,m,grip(side<0?.85:.28,side),side);
    sleeve(group,m,side,wrist);
  }
  return group;
}
