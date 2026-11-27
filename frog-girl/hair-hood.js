import * as THREE from '../three.module.min.js';

const {clamp, lerp, smoothstep} = THREE.MathUtils;
const tau = 2 * Math.PI;
const point = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(parent, name, geometry, material) {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function surface(columns, rows, sample, reverse = false) {
  const positions = [], colors = [], indices = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const {p, color} = sample(i / columns, j / rows);
      positions.push(p.x, p.y, p.z);
      if (color) colors.push(color.r, color.g, color.b);
      if (i === columns || j === rows) continue;
      const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1, d = c + 1;
      if (reverse) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function seam(parent, name, pts, radius, material, segments = 72) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const item = mesh(parent, name, new THREE.TubeGeometry(curve, segments, radius, 7, false), material);
  item.castShadow = false;
}

// Each station is height, half width, front, back and opening angle.
// Below the temples the two corners flare away from the hair like folded cloth.
const hoodStations = [
  [1.765,0,.0125,.0125,0], [1.751,.125,.120,-.089,0],
  [1.715,.236,.207,-.173,0], [1.665,.302,.267,-.230,0],
  [1.611,.333,.277,-.260,.255], [1.544,.350,.288,-.278,.49],
  [1.461,.360,.303,-.290,.716], [1.354,.369,.315,-.297,.921],
  [1.242,.376,.321,-.304,1.036], [1.123,.391,.323,-.302,1.104],
  [1.030,.408,.314,-.289,1.142], [.961,.417,.307,-.270,1.16],
  [.917,.413,.296,-.249,1.165],
];

function hoodPoint(u, v) {
  const k = clamp(v, 0, 1) * (hoodStations.length - 1);
  const i = Math.min(Math.floor(k), hoodStations.length - 2), f = k - i;
  const a = hoodStations[Math.max(0, i - 1)], b = hoodStations[i];
  const c = hoodStations[i + 1], d = hoodStations[Math.min(i + 2, hoodStations.length - 1)];
  const values = b.map((value, n) => {
    const slope0 = (c[n] - a[n]) * .5, slope1 = (d[n] - value) * .5;
    return value + f * (slope0 + f * (3 * (c[n] - value) - 2 * slope0 - slope1 +
      f * (2 * (value - c[n]) + slope0 + slope1)));
  });
  const [y, width, front, back, angle] = values;
  const theta = lerp(Math.max(0, angle), tau - Math.max(0, angle), u);
  const lower = smoothstep(v, .48, 1);
  const fold = lower * (.016 * Math.cos(theta * 6 + v * 2.1) + .009 * Math.sin(theta * 9 - v * 3));
  const x = Math.sin(theta) * (width + fold);
  const z = (front + back) * .5 + Math.cos(theta) * ((front - back) * .5 + fold);
  const hem = lower * lower * (.034 * Math.cos(2 * theta + .35) - .033);
  return point(x, y + hem, z);
}

function hoodNormal(u, v) {
  const diff = .0003;
  const a = hoodPoint(clamp(u + diff, 0, 1), v).sub(hoodPoint(clamp(u - diff, 0, 1), v));
  const b = hoodPoint(u, clamp(v + diff, 0, 1)).sub(hoodPoint(u, clamp(v - diff, 0, 1)));
  return b.cross(a).normalize();
}

function addHood(group) {
  const rootColor = new THREE.Color(0x3e7961);
  const foldedColor = new THREE.Color(0x567d43);
  const shell = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: .47, clearcoat: .24, clearcoatRoughness: .36,
    side: THREE.FrontSide,
  });
  const lining = new THREE.MeshStandardMaterial({color:0x849345, roughness:.79, side:THREE.FrontSide});
  const cord = new THREE.MeshStandardMaterial({color:0x304e36, roughness:.55});
  const stitch = new THREE.MeshStandardMaterial({color:0x9fac71, roughness:.73});
  mesh(group, 'Rain hood · shell', surface(104, 68, (u,v) => ({
    p: hoodPoint(u,v),
    color: rootColor.clone().lerp(foldedColor, smoothstep(v,.39,1) * .54)
      .multiplyScalar(.985 + .015 * Math.sin(6 * tau * u + 4 * v)),
  }), true), shell);
  mesh(group, 'Rain hood · woven lining', surface(88, 60, (u,v) => ({
    p: hoodPoint(u,v).addScaledVector(hoodNormal(u,v),-.0042),
  })), lining);
  // The rolled opening and hem join both surfaces and cast a thin real shadow.
  for (const edge of [0,1]) {
    const pts = [], inner = [];
    for(let i=0; i<=56; i++) {
      const v=lerp(.25,1,i/56);
      pts.push(hoodPoint(edge,v).addScaledVector(hoodNormal(edge,v),-.0015));
      const u = edge===0 ? .0026 : .9974;
      inner.push(hoodPoint(u,v).addScaledVector(hoodNormal(u,v),.0009));
    }
    seam(group, 'Folded face opening', pts, .0034, cord);
    seam(group, 'Edge welt', inner, .0012, stitch);
  }
  const hem = [], crown = [];
  for(let i=0; i<=90; i++) hem.push(hoodPoint(i/90,1).addScaledVector(hoodNormal(i/90,1),-.0015));
  seam(group,'Hem piping',hem,.0027,cord);
  for(let i=0;i<=22;i++) crown.push(hoodPoint(0,.25*(1-i/22)));
  for(let i=1;i<=80;i++) crown.push(hoodPoint(.5,i/80).addScaledVector(hoodNormal(.5,i/80),.0005));
  seam(group,'Back panel seam',crown,.0018,cord);

  const eyeBase = new THREE.MeshPhysicalMaterial({color:0x547e50,roughness:.41,clearcoat:.32,clearcoatRoughness:.29});
  const eyeRim = new THREE.MeshStandardMaterial({color:0x627f4c, roughness:.53});
  const eyePaint = new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.32,clearcoat:.48,clearcoatRoughness:.22});
  const upperColor = new THREE.Color(0x274d40), lowerColor = new THREE.Color(0x4d7748);
  const ink=new THREE.Color(0x1a3935);
  const dampSpec = new THREE.MeshStandardMaterial({color:0xd6ece1,roughness:.22});
  const beadSphere = new THREE.SphereGeometry(1,32,24);
  for(const side of [-1,1]) {
    const badge = new THREE.Group();
    badge.position.set(side*.258,1.653,.106);
    badge.rotation.set(-.11,side*.29,side*-.09,'YXZ');
    group.add(badge);
    const base=mesh(badge,'Frog hood · raised eye',beadSphere,eyeBase);
    base.scale.set(.107,.115,.103);
    const eyeDisc=mesh(badge,'Frog hood · glazed detail',surface(72,18,(u,v)=>{
      const a=tau*u, r=lerp(.001,1,v);
      const nx=r*Math.cos(a)*.592, ny=r*Math.sin(a)*.557+.022;
      const z=Math.sqrt(Math.max(0,1-nx*nx-ny*ny))*.103+.0008;
      const color=upperColor.clone().lerp(lowerColor,clamp((1-ny*1.6)*.55,0,1))
        .lerp(ink,.48*(1-smoothstep(r,.23,.91)));
      return {p:point(.107*nx,.115*ny,z),color};
    },true),eyePaint);
    eyeDisc.castShadow=false;
    const glint=mesh(badge,'Glaze accent',beadSphere,dampSpec);
    glint.position.set(-.014,.027,.101);glint.scale.set(.0052,.0067,.0018);
    glint.castShadow=false;
    const topArc=Array.from({length:24},(_,i)=>{
      const a=lerp(.24,2.86,i/23);
      return point(.102*Math.cos(a),.108*Math.sin(a),.023);
    });
    seam(badge,'Raised stitched surround',topArc,.0013,eyeRim,32);
  }

  const dew = new THREE.MeshPhysicalMaterial({
    color:0xd0e9d1,roughness:.13,metalness:.05,transparent:true,opacity:.59,
    depthWrite:false,clearcoat:1,clearcoatRoughness:.1,
  });
  for(const [u,v,r] of [[.014,.505,.0065],[.028,.535,.003],[.973,.44,.007],[.985,.46,.0034],
    [.971,.749,.004],[.988,.792,.0075],[.086,.34,.0045],[.892,.36,.003]]) {
    const n=hoodNormal(u,v),p=hoodPoint(u,v).addScaledVector(n,r*.28);
    const bead=mesh(group,'Droplet on rain hood',beadSphere,dew);
    bead.position.copy(p);bead.quaternion.setFromUnitVectors(point(0,0,1),n);
    bead.scale.set(r,r*1.32,r*.82);bead.castShadow=false;
  }
}

function addHair(group) {
  const capMaterial = new THREE.MeshStandardMaterial({color:0x55493a,roughness:.68});
  mesh(group,'Chestnut hair · underlayer',surface(104,45,(u,v)=>{
    const a=u*tau, front=(Math.cos(a)+1)*.5;
    const lower=1.041+.374*smoothstep(front,.64,.97)+.009*Math.sin(5*a);
    const phi=lerp(.006,Math.acos((lower-1.354)/.339),v);
    const ring=Math.sin(phi);
    return {p:point(.308*ring*Math.sin(a),1.354+.339*Math.cos(phi),.006+.267*ring*Math.cos(a))};
  },true),capMaterial);

  const fiber=new THREE.MeshPhysicalMaterial({
    vertexColors:true,roughness:.52,clearcoat:.12,clearcoatRoughness:.44,
  });
  const colors=['#665442','#705e49','#78654f','#695946','#80705c','#584b3c','#74604a'];
  // A lock is one rounded, lens-shaped section. Its two ridges divide the
  // highlight without baking a light direction into the hair colour.
  function lock(name, control, colorIndex, normal=point(0,0,1), rib=0) {
    const curve=new THREE.CatmullRomCurve3(control.map(p=>point(...p.slice(0,3))));
    const base=new THREE.Color(colors[colorIndex]),under=new THREE.Color('#4a4037');
    const rim=new THREE.Color('#ad987e'),tint=new THREE.Color();
    const model=surface(26,42,(u,v)=>{
      const pos=curve.getPoint(v),tangent=curve.getTangent(v).normalize();
      const side=new THREE.Vector3().crossVectors(tangent,normal).normalize();
      const top=new THREE.Vector3().crossVectors(side,tangent).normalize();
      const idx=Math.min(Math.floor(v*(control.length-1)),control.length-2);
      const t=v*(control.length-1)-idx;
      const width=lerp(control[idx][3],control[idx+1][3],t);
      const a=tau*u,cs=Math.cos(a),sn=Math.sin(a);
      const track=cs+.12*Math.sin(v*4+colorIndex);
      const ridge=.81+.23*Math.exp(-Math.pow((track+.24)*3.1,2));
      const depth=width*(sn>=0?.28:.18)+.00018;
      pos.addScaledVector(side,width*cs).addScaledVector(top,depth*sn*ridge);
      tint.copy(base).lerp(under,.18*(1-sn)*.5);
      const thread=sn>0?Math.exp(-Math.pow((track-.33)*12,2))*.14+
        Math.exp(-Math.pow((track+.68)*11,2))*.08:0;
      tint.lerp(rim,thread*(.55+.45*Math.sin(Math.PI*v))*rib+.024*Math.max(0,sn));
      return {p:pos,color:tint};
    },true);
    mesh(group,name,model,fiber);
  }

  // Broad, parted fringe panels. Roots sit under the pointed seam and the
  // tips step across the forehead, leaving both irises unobstructed.
  lock('Fringe · left swept base',[
    [-.005,1.65,.164,.042],[-.066,1.587,.209,.074],[-.145,1.523,.231,.074],
    [-.193,1.463,.218,.056],[-.223,1.414,.187,.029],[-.243,1.380,.164,.0007]],0);
  lock('Fringe · left silk fringe',[
    [-.011,1.655,.170,.022],[-.047,1.586,.232,.051],[-.084,1.516,.258,.049],
    [-.104,1.451,.267,.042],[-.144,1.403,.258,.017],[-.168,1.389,.249,.00055]],2,point(-.18,0,1),1);
  lock('Fringe · central tapered panel',[
    [.006,1.651,.175,.021],[.010,1.595,.218,.046],[.003,1.526,.258,.049],
    [-.014,1.451,.276,.044],[-.032,1.406,.274,.027],[-.054,1.391,.269,.0007]],4,point(-.06,0,1),1);
  lock('Fringe · short centre strand',[
    [.013,1.648,.171,.009],[.048,1.588,.220,.028],[.065,1.515,.254,.033],
    [.056,1.450,.270,.026],[.043,1.414,.270,.013],[.028,1.404,.266,.0006]],2,point(.1,0,1),1);
  lock('Fringe · sweeping right part',[
    [.020,1.647,.168,.023],[.089,1.593,.207,.047],[.149,1.542,.225,.055],
    [.201,1.474,.217,.053],[.235,1.431,.194,.031],[.252,1.393,.169,.0006]],1,point(.36,0,.94),1);
  lock('Fringe · narrow right flyaway',[
    [.043,1.635,.183,.008],[.095,1.568,.237,.018],[.142,1.510,.257,.019],
    [.193,1.458,.244,.014],[.215,1.413,.217,.0006]],4,point(.19,0,.98),.78);

  // The long pieces fall out of the temples, then turn over the jacket. The
  // room under the chin stays open between the two separate strands.
  for(const s of [-1,1]){
    const mirror=stops=>stops.map(([x,y,z,w])=>[s*x,y,z,w]);
    const side=point(s*.43,0,.9);
    lock('Long lock · inner shadow',mirror([
      [.241,1.191,.129,.055],[.269,1.080,.114,.050],[.237,.981,.128,.043],
      [.202,.875,.153,.039],[.200,.763,.199,.034],[.226,.649,.220,.036],
      [.223,.51,.226,.032],[.186,.374,.236,.024],[.199,.242,.241,.002]]),5,side);
    lock('Long lock · folded chestnut',mirror([
      [.269,1.165,.132,.035],[.242,1.063,.159,.043],[.201,.966,.152,.039],
      [.194,.871,.179,.038],[.226,.765,.218,.043],[.250,.64,.231,.044],
      [.242,.512,.235,.046],[.199,.369,.245,.038],[.184,.247,.239,.016],
      [.192,.186+(s<0?.035:0),.227,.0008]]),1,point(s*.2,0,1),1);
    lock('Long lock · loose edge',mirror([
      [.248,1.094,.151,.009],[.196,.988,.159,.014],[.167,.881,.170,.012],
      [.181,.772,.206,.017],[.205,.671,.240,.020],[.211,.544,.254,.017],
      [.183,.429,.255,.015],[.172,.333,.25,.012],[.18,.284,.244,.00065]]),3,side,.8);

    // Temple hair folds forward across the cheek, then opens again. Slight
    // left/right offsets keep the face framed when seen in three-quarter view.
    const yOffset=s<0?.013:0;
    const temple=stops=>mirror(stops).map(([x,y,z,w],i)=>[x,y+yOffset*(i/5),z,w]);
    lock('Temple · outer wave',temple([
      [.184,1.538,.137,.049],[.243,1.451,.152,.060],[.284,1.353,.131,.057],
      [.297,1.259,.144,.061],[.279,1.197,.166,.044],[.223,1.171,.185,.021],
      [.192,1.193,.199,.0007]]),5,side);
    lock('Temple · broad cheek sweep',temple([
      [.190,1.495,.181,.032],[.236,1.426,.199,.049],[.268,1.352,.179,.052],
      [.276,1.277,.185,.059],[.252,1.234,.217,.048],[.212,1.221,.239,.032],
      [.169,1.247,.246,.0007]]),1,point(s*.45,0,.92),1);
    lock('Temple · upper light ribbon',temple([
      [.218,1.453,.194,.013],[.257,1.394,.194,.022],[.275,1.334,.182,.029],
      [.262,1.279,.216,.034],[.233,1.253,.241,.023],[.202,1.264,.250,.00065]]),4,side,1);
    lock('Temple · lower ribbon',temple([
      [.285,1.361,.122,.024],[.301,1.296,.131,.030],[.305,1.245,.149,.036],
      [.284,1.197,.169,.045],[.245,1.164,.194,.035],[.213,1.162,.211,.022],
      [.188,1.18,.218,.0007]]),2,side,1);
    lock('Nape · curled end',temple([
      [.281,1.208,.116,.028],[.276,1.150,.153,.041],[.25,1.096,.186,.034],
      [.22,1.062,.191,.026],[.215,1.035,.181,.016],[.232,1.025,.174,.0008]]),3,side,.8);
    lock('Nape · second tapered end',temple([
      [.291,1.206,.101,.019],[.292,1.144,.121,.025],[.278,1.097,.142,.019],
      [.248,1.069,.164,.015],[.239,1.048,.162,.009],[.245,1.037,.157,.0007]]),0,side,1);
  }
}

export function createHairHood() {
  const group = new THREE.Group();
  group.name = 'Frog girl · chestnut hair and tailored rain hood';
  addHair(group);
  addHood(group);
  return group;
}
