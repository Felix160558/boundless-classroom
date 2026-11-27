import * as THREE from '../three.module.min.js';

const baseSoleY=-1.969;
const legExtension=.086;
const additionalLegLength=.262;
const hipY=-.920;
const previousSoleY=baseSoleY-legExtension-additionalLegLength;
export const frogLegLengthIncrease=.06*(hipY-previousSoleY);
export const frogFeetY=previousSoleY-frogLegLengthIncrease;

const TAU=Math.PI*2;
const waistX=.224;
const waistZ=-.197;
const waistWidth=.308;
const waistDepth=.245;
const modelOriginZ=-.151;
// Sections of the original blue textile above its truncated lower edge.
// Continue their shallow folds from beneath the overlap with the original waist.
const skirtJoin=[
  1.0124,1.0146,.9991,.9691,.955,.939,.923,.911,.908,.9091,.8827,.8685,
  .8629,.8574,.8388,.8349,.8229,.8148,.8204,.7718,.7674,.7164,.6999,.7203,
  .6885,.7016,.7288,.7437,.7574,.7726,.8076,.8162,.8249,.8586,.8709,.8931,
  .9199,.9444,.9475,.9692,.9924,1.0069,1.035,1.0361,1.024,1.0211,1.0772,1.0271
];
const skirtFlare=[
  1.0302,1.0261,1.0067,1.0205,1.021,1.053,1.0465,1.0479,1.1006,1.0504,1.0358,1.0164,
  1.0075,1.0115,1.0185,1.049,1.0927,1.0903,1.0988,1.1282,1.1112,1.0883,1.0593,1.0348,
  1.0267,1.0415,1.0779,1.0987,1.1002,1.1125,1.1023,1.0766,1.0431,1.0255,1.0096,.996,
  1.0056,1.0193,1.0252,1.0366,1.0488,1.0825,1.084,1.0638,1.0508,1.0448,1.038,1.0369
];

const rgb=value=>new THREE.Color(value);
const mix=THREE.MathUtils.lerp;
const smooth=THREE.MathUtils.smoothstep;

function fittedLegY(y,keepBootShape=false){
  // Extend the thigh and shin around the knee, with a gradual join to the hip.
  // The added length is complete by the boot rim to preserve the footwear fit.
  const firstFit=.77*smooth(-y,1.10,1.64)+.23*smooth(-y,1.57,1.82);
  const extraFit=.53*smooth(-y,1.10,1.385)+.47*smooth(-y,1.345,1.62);
  return y-legExtension*firstFit-additionalLegLength*extraFit-frogLegLengthIncrease*(keepBootShape?1:extraFit);
}

const kneeY=fittedLegY(-1.358);
const ankleY=fittedLegY(-1.820);
const thighHeight=hipY-kneeY;
const shinHeight=kneeY-ankleY;

export function frogSeatMount(scale,seatTop=.625,seatFront=.31){
  const standingHip=(hipY-frogFeetY)*scale;
  const hipHeight=seatTop+.101*scale;
  // The existing chair is high for this character's ankles. The upper thighs
  // meet the soft front edge, then slope toward the knees outside the seat.
  const hipZ=seatFront-.039;
  return {y:hipHeight-standingHip,z:hipZ-(waistZ-modelOriginZ)*scale,
    approachZ:seatFront+.060-(waistZ-modelOriginZ)*scale,lean:.065,hipY,hipHeight};
}

function presentLegs(scale,mountY,progress){
  const ay=ankleY-mountY/scale;
  const down=hipY-ay;
  const maximum=thighHeight+shinHeight;
  const fore=Math.sqrt(Math.max(0,maximum**2-down**2));
  const az=Math.min(.67,.83*fore)*progress;
  const distance=Math.min(maximum,Math.hypot(down,az));
  const along=(thighHeight**2-shinHeight**2+distance**2)/(2*distance);
  const bend=Math.sqrt(Math.max(0,thighHeight**2-along**2));
  const ky=hipY-(down*along-az*bend)/distance;
  const kz=(az*along+down*bend)/distance;
  return {ky,kz,ay,az,
    thighCos:(hipY-ky)/thighHeight,thighSin:kz/thighHeight,
    shinCos:(ky-ay)/shinHeight,shinSin:(az-kz)/shinHeight};
}

function bindSeating(group){
  const [skirt,...legs]=group.children;
  const bind=(mesh)=>{
    const geometry=mesh.geometry,positions=geometry.attributes.position,normals=geometry.attributes.normal;
    positions.setUsage(THREE.DynamicDrawUsage);
    normals.setUsage(THREE.DynamicDrawUsage);
    // A conservative shared bound covers every posed version without rescanning
    // the mesh during an XR transition.
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius+=.92;
    return {positions,normals,rest:positions.array.slice(),restNormals:normals.array.slice()};
  };
  const cloth=bind(skirt);
  const legParts=legs.map(leg=>({z:leg.position.z,yaw:leg.rotation.y,parts:leg.children.map(bind)}));
  let lastProgress=0,lastScale=null,lastSeatTop=null,lastSeatFront=null,lastApproach=false;
  const result={y:0,z:0,lean:0};
  function updateGeometry(part,transform){
    const {positions,normals,rest,restNormals}=part;
    for(let i=0;i<positions.count;i++){
      const j=i*3;
      transform(positions,normals,i,rest[j],rest[j+1],rest[j+2],restNormals[j],restNormals[j+1],restNormals[j+2]);
    }
    positions.needsUpdate=normals.needsUpdate=true;
  }
  function restore(part){
    part.positions.array.set(part.rest);
    part.normals.array.set(part.restNormals);
    part.positions.needsUpdate=part.normals.needsUpdate=true;
  }
  group.userData.setSeatedPose=(time,{scale=.55,seatTop=.625,seatFront=.31,approach=false}={})=>{
    // The caller drives normalized progress. Ease it here so the hip and cloth
    // come to a rest together. Standing uses the untouched bind positions.
    const progress=smooth(time,0,1);
    if(progress===lastProgress&&scale===lastScale&&seatTop===lastSeatTop&&seatFront===lastSeatFront&&approach===lastApproach)return result;
    lastProgress=progress;lastScale=scale;lastSeatTop=seatTop;lastSeatFront=seatFront;lastApproach=approach;
    const mount=frogSeatMount(scale,seatTop,seatFront);
    const startZ=approach?mount.approachZ:0;
    if(progress===0){
      restore(cloth);
      for(const leg of legParts)for(const part of leg.parts)restore(part);
      result.y=0;result.z=startZ;result.lean=0;
      return result;
    }
    result.y=mount.y*progress;result.z=mix(startZ,mount.z,progress);result.lean=mount.lean*progress;
    const pose=presentLegs(scale,result.y,progress);
    const localSeatY=frogFeetY+(seatTop-result.y)/scale+.003;
    const frontFade=.051;
    const settling=approach?1:smooth(progress,.60,.95);
    const surfaceRise=(y,z)=>Math.max(0,localSeatY-y)*settling*(1-smooth(z,seatFront-.002,seatFront+frontFade));

    updateGeometry(cloth,(positions,_normals,i,x,y,z)=>{
      const hem=smooth(-y,.809,1.153);
      const front=smooth(z,waistZ+.005,waistZ+.184);
      // Carry the front fabric over the bent thighs while the upper seam and
      // the back of the skirt remain at the waist and cushion respectively.
      const posedZ=z+front*hem*.43*pose.kz;
      const looseY=y+.146*front*hem*progress;
      const lift=surfaceRise(looseY,result.z+(posedZ-modelOriginZ)*scale);
      positions.setXYZ(i,x,looseY+lift,posedZ);
    });
    skirt.geometry.computeVertexNormals();

    for(const leg of legParts){
      const c=Math.cos(leg.yaw),s=Math.sin(leg.yaw),side=Math.sign(leg.yaw);
      for(const part of leg.parts)updateGeometry(part,(positions,normals,i,x,y,z,nx,ny,nz)=>{
        const thighWeight=smooth(y,kneeY-.061,kneeY+.061);
        const bootWeight=1-smooth(y,ankleY-.029,ankleY+.125);
        const thighY=hipY+pose.thighCos*(y-hipY)+pose.thighSin*z;
        const thighZ=-pose.thighSin*(y-hipY)+pose.thighCos*z;
        const shinY=pose.ky+pose.shinCos*(y-kneeY)+pose.shinSin*z;
        const shinZ=pose.kz-pose.shinSin*(y-kneeY)+pose.shinCos*z;
        const posedZ=mix(mix(shinZ,thighZ,thighWeight),z+pose.az,bootWeight);
        const looseY=mix(mix(shinY,thighY,thighWeight),y+pose.ay-ankleY,bootWeight);
        // Let the planted ankles move slightly apart and relax the toes
        // outward. The knees stay just as close as in the standing pose.
        const ankleSpread=side*.035*progress*(1-smooth(y,ankleY+.04,kneeY-.028));
        const toeTurn=side*.055*progress*(1-smooth(y,ankleY-.030,ankleY+.035));
        const toeCos=Math.cos(toeTurn),toeSin=Math.sin(toeTurn),fromAnkle=posedZ-pose.az;
        const seatedX=toeCos*x+toeSin*fromAnkle+ankleSpread;
        const seatedZ=pose.az+toeCos*fromAnkle-toeSin*x;
        const sceneZ=result.z+(leg.z-modelOriginZ+c*seatedZ-s*seatedX)*scale;
        const lift=smooth(y,kneeY-.071,kneeY+.03)*surfaceRise(looseY,sceneZ);
        positions.setXYZ(i,seatedX,looseY+lift,seatedZ);
        const cos=mix(mix(pose.shinCos,pose.thighCos,thighWeight),1,bootWeight);
        const sin=mix(mix(pose.shinSin,pose.thighSin,thighWeight),0,bootWeight);
        const nY=cos*ny+sin*nz,nZ=-sin*ny+cos*nz;
        const length=Math.hypot(nx,nY,nZ)||1;
        normals.setXYZ(i,(toeCos*nx+toeSin*nZ)/length,nY/length,(toeCos*nZ-toeSin*nx)/length);
      });
    }
    return result;
  };
}

function material(color,roughness,options={}){
  return new THREE.MeshStandardMaterial({color,roughness,...options});
}

function mount(parent,name,geometry,surface){
  const mesh=new THREE.Mesh(geometry,surface);
  mesh.name=name;
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}

// Build descending, closed rings with shared normals around each circumference.
// Add intermediate rings so the fitted garments and toe do not read as stacked bands.
function rings(parent,name,rows,segments,surface,positionAt,colorAt){
  const positions=[],colors=[],indices=[];
  let ring=0;
  const sample=row=>{
    for(let i=0;i<segments;i++){
      const a=i*TAU/segments;
      positions.push(...positionAt(row,a));
      if(colorAt)colors.push(...colorAt(row,a).toArray());
      if(ring){
        const current=ring*segments+i,next=ring*segments+(i+1)%segments;
        indices.push(current-segments,current,next-segments,next-segments,current,next);
      }
    }
    ring++;
  };
  sample(rows[0]);
  for(let i=1;i<rows.length;i++){
    const before=rows[i-1],after=rows[i];
    for(let j=1;j<=4;j++){
      const t=j/4;
      sample(before.map((value,index)=>mix(value,after[index],t)));
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(colorAt)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mount(parent,name,geometry,surface);
}

function skirtShape([y,width,depth,fold,lift],a){
  const index=a*skirtJoin.length/TAU,previous=Math.floor(index);
  const a0=previous%skirtJoin.length,a1=(previous+1)%skirtJoin.length;
  const step=index-previous,flaring=smooth(-y,.810,.965);
  const inherited=mix(mix(skirtJoin[a0],skirtJoin[a1],step),mix(skirtFlare[a0],skirtFlare[a1],step),flaring);
  const r=inherited+fold*(.66*Math.sin(11*a+.4*Math.sin(a*3))+ .34*Math.cos(17*a+.42));
  return [waistX+width*r*Math.sin(a),y+lift*(.40*Math.cos(a+.40)+.60*Math.cos(a*3-.70)),
    waistZ+depth*r*Math.cos(a)];
}

function makeSkirt(parent){
  const fabric=material(0xffffff,.88,{vertexColors:true});
  const join=rgb('#b9d0ed'),light=rgb('#bbcfe7'),shadow=rgb('#a7bbd7'),folded=rgb('#95aac8');
  rings(parent,'Continued pleated rain skirt',[
    [-.790,waistWidth*.965,waistDepth*.949,0,0],
    [-.805,waistWidth*.995,waistDepth*.993,0,0],
    [-.819,.309,.246,0,0],
    [-.858,.312,.247,.003,.001],
    [-.911,.316,.250,.008,.002],
    [-.978,.324,.253,.012,.004],
    [-1.036,.333,.260,.017,.008],
    [-1.112,.346,.267,.021,.010],
    [-1.145,.354,.272,.022,.011],
    // Sewn hem folds to the inside of the same unbroken cloth.
    [-1.157,.354,.271,.022,.011],
    [-1.156,.350,.267,.022,.011],
    [-1.148,.345,.263,.021,.010],
    [-1.129,.341,.260,.020,.009]
  ],144,fabric,skirtShape,([y],a)=>{
    const depth=smooth(-y,.819,1.104);
    const ridge=.53+.26*Math.sin(11*a+.4*Math.sin(a*3))+.11*Math.cos(17*a+.42);
    const cloth=shadow.clone().lerp(light,mix(.88,ridge,.57*depth));
    return join.clone().lerp(cloth,depth).lerp(folded,.22*smooth(-y,1.146,1.158));
  });
}

function makeLeg(parent,side,surfaces){
  const pivot=new THREE.Group();
  pivot.position.set(waistX+side*.1165,0,waistZ+side*.006);
  pivot.rotation.y=side*.045;
  parent.add(pivot);

  const legPosition=([y,x,z,width,depth],a)=>[x+width*Math.sin(a),fittedLegY(y),z+depth*Math.cos(a)];
  const lean=side*.005;
  rings(pivot,'Thigh and knee',[
    [-1.086,-lean*.45,-.018,.111,.105],[-1.166,-lean*.23,-.015,.108,.103],
    [-1.235,lean*.14,-.008,.104,.097],[-1.302,lean*.45,.002,.094,.086],
    [-1.358,lean*.73,.009,.087,.081],[-1.398,lean,.007,.085,.080],
    [-1.447,lean,.003,.087,.081],[-1.507,lean,-.009,.089,.082],[-1.545,lean,-.017,.086,.081]
  ],56,surfaces.skin,legPosition);
  const knit=rgb('#dfdfd0'),rib=rgb('#c7d0c5');
  rings(pivot,'Knitted rain sock',[
    [-1.507,lean,-.009,.089,.082],[-1.515,lean,-.010,.093,.085],
    [-1.535,lean,-.014,.093,.085],[-1.570,lean,-.021,.089,.083],
    [-1.619,lean*.94,-.027,.085,.080],[-1.666,lean*.80,-.031,.082,.078]
  ],72,surfaces.sock,([y,x,z,width,depth],a)=>{
    const detail=.0009*Math.cos(a*54);
    return legPosition([y,x,z,width+detail,depth+detail],a);
  },([y],a)=>knit.clone().lerp(rib,.09+.13*Math.cos(a*54)*Math.cos(a*54)+.21*smooth(-y,1.523,1.616)));

  const bootPosition=([y,x,z,width,front,back,crease],a)=>{
    const s=Math.sin(a),c=Math.cos(a);
    // A rounded, broad toe and comparatively narrow heel.
    const xShape=Math.sign(s)*Math.pow(Math.abs(s),mix(1,.82,smooth(-y,1.78,1.936)));
    const zShape=Math.sign(c)*Math.pow(Math.abs(c),mix(1,.86,smooth(-y,1.758,1.945)));
    const ripple=crease*(Math.sin(3*a+.4)+.36*Math.sin(5*a-.50));
    return [x+xShape*(width+ripple)*(1+.085*c),fittedLegY(y,true),z+zShape*((c>0?front:back)+ripple)];
  };
  const upper=[
    [-1.622,lean*.94,-.027,.083,.078,.078,0],[-1.621,lean*.94,-.027,.091,.086,.084,0],
    [-1.627,lean*.92,-.027,.097,.092,.091,.0005],[-1.643,lean*.90,-.028,.100,.095,.094,.0006],
    [-1.660,lean*.79,-.030,.099,.093,.093,.001],[-1.696,lean*.72,-.034,.099,.092,.093,.0015],
    [-1.737,lean*.57,-.037,.094,.090,.094,.002],[-1.778,lean*.41,-.040,.087,.088,.088,.002],
    [-1.807,lean*.29,-.043,.078,.091,.083,.0025],[-1.834,lean*.16,-.036,.078,.106,.081,.0032],
    [-1.861,lean*.09,-.029,.087,.151,.092,.002],[-1.884,0,-.024,.098,.193,.102,.0012],
    [-1.905,0,-.023,.104,.215,.107,.0004],[-1.927,0,-.023,.107,.219,.107,0],
    [-1.946,0,-.023,.106,.220,.106,0]
  ];
  rings(pivot,'Moulded olive rain boot',upper,80,surfaces.rubber,bootPosition);
  rings(pivot,'Flexible boot tread',[
    [-1.937,0,-.023,.105,.219,.106,0],[-1.945,0,-.023,.109,.224,.109,0],
    [-1.956,0,-.023,.110,.225,.110,0],[-1.964,0,-.023,.104,.219,.105,0],
    [baseSoleY,0,-.023,.098,.214,.101,0],[baseSoleY,0,0,.001,.001,.001,0]
  ],80,surfaces.sole,bootPosition);

  const back=new THREE.CatmullRomCurve3([
    [lean-.022,-1.666,-.120],[lean-.017,-1.635,-.127],[lean,-1.611,-.133],
    [lean+.017,-1.635,-.127],[lean+.022,-1.666,-.120]
  ].map(([x,y,z])=>new THREE.Vector3(x,fittedLegY(y,true),z)));
  mount(pivot,'Rear woven boot loop',new THREE.TubeGeometry(back,24,.0064,8,false),surfaces.tab);
}

export function createFrogLowerBody(){
  const group=new THREE.Group();
  group.name='Jumping Frog · lower body';
  const surfaces={
    skin:material('#e6bda9',.69),
    sock:material(0xffffff,.96,{vertexColors:true}),
    rubber:new THREE.MeshPhysicalMaterial({color:'#46654f',roughness:.42,clearcoat:.14,clearcoatRoughness:.49}),
    sole:material('#344a41',.88),
    tab:material('#a5b08a',.93)
  };
  makeSkirt(group);
  for(const side of [-1,1])makeLeg(group,side,surfaces);
  bindSeating(group);
  return group;
}
