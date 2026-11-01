import * as THREE from './three.module.min.js';

const TAU = Math.PI * 2;
function seeded(seed=71){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const ease=(a,b,t)=>a+(b-a)*t;

export function createSpace(container, onState=()=>{}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#07090e');
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.xr.enabled=true;
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden','true');
  const camera=new THREE.PerspectiveCamera(42,1,.1,600);
  const rig=new THREE.Group();rig.add(camera);scene.add(rig);
  const room=new THREE.Group();scene.add(room);
  let mode='home',zoom=1,dragX=0,dragY=0,pointerX=0,pointerY=0;
  let moving=false,lastX=0,lastY=0,lastTime=0,frameTime=0,session=null;
  let boardTitle='Stay curious.', boardSubtitle='Every question is a beginning.';
  const desiredPosition=new THREE.Vector3(),desiredTarget=new THREE.Vector3(),target=new THREE.Vector3(0,1,0);
  const materials={
    deck:new THREE.MeshPhysicalMaterial({color:0xc5c7c3,roughness:.29,metalness:.38,clearcoat:.35,clearcoatRoughness:.3}),
    edge:new THREE.MeshStandardMaterial({color:0x343943,roughness:.27,metalness:.72}),
    white:new THREE.MeshStandardMaterial({color:0xe1e2da,roughness:.48,metalness:.2}),
    dark:new THREE.MeshStandardMaterial({color:0x202a35,roughness:.5,metalness:.45}),
    glow:new THREE.MeshStandardMaterial({color:0xeeeadc,emissive:0xd5d9d5,emissiveIntensity:.65,roughness:.5})
  };
  scene.add(new THREE.HemisphereLight(0xcbd7e8,0x343039,1.55));
  const key=new THREE.DirectionalLight(0xfff3e1,2.7);key.position.set(-3,9,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-9;key.shadow.camera.right=9;
  key.shadow.camera.top=8;key.shadow.camera.bottom=-8;key.shadow.normalBias=.035;key.shadow.bias=-.0002;scene.add(key);
  const fill=new THREE.DirectionalLight(0x758fae,1.2);fill.position.set(7,4,-5);scene.add(fill);
  const lamp=new THREE.PointLight(0xfff3db,23,16,2);lamp.position.set(0,4,0);room.add(lamp);

  function mesh(geometry,material,parent=room,x=0,y=0,z=0){
    const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);
    object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  }
  function box(w,h,d,mat,x=0,y=0,z=0,parent=room){return mesh(new THREE.BoxGeometry(w,h,d),mat,parent,x,y,z);}
  function sphere(r,mat,x,y,z,parent=room,scale=[1,1,1]){
    const o=mesh(new THREE.SphereGeometry(r,32,24),mat,parent,x,y,z);o.scale.set(...scale);return o;
  }
  function tube(points,r,mat,parent=room){
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),36,r,8,false),mat,parent);
  }
  function ring(radius,y,color=0xb8c7d9,opacity=.25,parent=room){
    const points=[];for(let i=0;i<=160;i++){const a=i/160*TAU;points.push(new THREE.Vector3(Math.cos(a)*radius,y,Math.sin(a)*radius));}
    const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity}));parent.add(o);return o;
  }
  // A single physical stage, viewed from outside on the landing page and from within in XR.
  mesh(new THREE.CylinderGeometry(6.35,6.1,.32,112),materials.edge,room,0,-.28,0);
  mesh(new THREE.CylinderGeometry(6.24,6.24,.07,112),new THREE.MeshStandardMaterial({color:0x343d48,roughness:.43,metalness:.58}),room,0,-.075,0);
  ring(6.3,-.19,0xffe1b9,.9);
  const rimLight=mesh(new THREE.TorusGeometry(6.30,.014,8,160),new THREE.MeshBasicMaterial({color:0xffdfb7}),room,0,-.19,0);rimLight.rotation.x=Math.PI/2;
  const rimHalo=mesh(new THREE.RingGeometry(6.22,6.43,160),new THREE.MeshBasicMaterial({color:0xe1c6a1,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),room,0,-.19,0);rimHalo.rotation.x=-Math.PI/2;
  ring(6.65,-.46,0xb4c7df,.14);
  ring(7.5,-.9,0x9cabc0,.045);
  const floor=box(9.2,.13,6.9,materials.deck,0,.025,0);
  // Very faint glazing catches the frame light while keeping the classroom visually open.
  const glass=new THREE.MeshPhysicalMaterial({color:0xaab8ca,transparent:true,opacity:.028,roughness:.12,metalness:.08,side:THREE.DoubleSide,depthWrite:false});
  const backGlass=mesh(new THREE.PlaneGeometry(8.9,3.7),glass,room,0,1.95,-3.3);backGlass.castShadow=false;
  const sideGlass=mesh(new THREE.PlaneGeometry(6.6,3.7),glass,room,-4.45,1.95,0);sideGlass.rotation.y=Math.PI/2;sideGlass.castShadow=false;
  // Restrained panels and a fine architectural frame.
  const seamMat=new THREE.LineBasicMaterial({color:0x4a515a,transparent:true,opacity:.18});
  for(let i=-3;i<=3;i++){
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i*1.2,.096,-3.35),new THREE.Vector3(i*1.2,.096,3.35)]);
    room.add(new THREE.Line(geo,seamMat));
  }
  const frameMat=new THREE.MeshStandardMaterial({color:0xc5c2b9,emissive:0xe2ceb0,emissiveIntensity:.11,roughness:.25,metalness:.65});
  for(const x of [-4.45,4.45])for(const z of [-3.3,3.3])box(.045,3.8,.045,frameMat,x,1.95,z);
  for(const x of [-4.45,4.45])box(.055,.055,6.65,frameMat,x,3.87,0);
  for(const z of [-3.3,3.3])box(8.95,.055,.055,frameMat,0,3.87,z);
  box(7.9,.028,.038,materials.glow,0,3.81,-3.26);
  box(.028,.028,5.9,materials.glow,-4.4,3.81,0);
  box(.028,.028,5.9,materials.glow,4.4,3.81,0);

  const boardCanvas=document.createElement('canvas');boardCanvas.width=1536;boardCanvas.height=720;
  const boardCtx=boardCanvas.getContext('2d');
  const boardTexture=new THREE.CanvasTexture(boardCanvas);boardTexture.colorSpace=THREE.SRGBColorSpace;
  const boardMaterial=new THREE.MeshBasicMaterial({map:boardTexture,toneMapped:false});
  box(5.55,2.6,.11,materials.dark,0,2.24,-2.8);
  const board=mesh(new THREE.PlaneGeometry(5.42,2.46),boardMaterial,room,0,2.24,-2.738);
  for(const x of [-1.9,1.9])box(.065,1.1,.08,materials.edge,x,.62,-2.8);
  box(5.5,.04,.2,materials.white,0,.92,-2.7);
  function drawBoard(){
    const c=boardCtx;c.fillStyle='#e6e7df';c.fillRect(0,0,1536,720);
    c.fillStyle='#6c776e';c.font='22px Arial';c.textAlign='left';c.fillText('BOUNDLESS CLASSROOM',86,84);
    c.textAlign='right';c.fillText('001',1450,84);
    c.strokeStyle='#a9b2a5';c.lineWidth=1;c.beginPath();c.moveTo(86,118);c.lineTo(1450,118);c.stroke();
    c.textAlign='center';c.fillStyle='#303b37';c.font='72px Georgia';c.fillText(boardTitle,768,338);
    c.fillStyle='#7b857b';c.font='28px Arial';c.fillText(boardSubtitle,768,415);
    c.fillStyle='#9aa193';c.font='18px Arial';c.fillText('LOVE   ·   SHARE   ·   PEACE',768,642);boardTexture.needsUpdate=true;
  }
  drawBoard();
  // One desk, one chair. No additional dashboard or classroom clutter.
  const table=new THREE.Group();table.position.set(.8,0,1.1);room.add(table);
  box(1.85,.09,.91,new THREE.MeshStandardMaterial({color:0xc9c9b7,roughness:.58}),0,.94,0,table);
  for(const x of [-.76,.76])for(const z of [-.32,.32])box(.04,.82,.04,materials.edge,x,.49,z,table);
  const chair=new THREE.Group();chair.position.set(.8,0,2.06);room.add(chair);
  box(.62,.09,.62,materials.dark,0,.58,0,chair);
  box(.61,.62,.065,materials.white,0,.95,.29,chair);
  for(const x of [-.25,.25])for(const z of [-.24,.24])box(.035,.48,.035,materials.edge,x,.31,z,chair);
  // Teacher and learner locations are physical floor markers in the scene.
  function floorLabel(text,x,z){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#536172';ctx.textAlign='center';ctx.font='24px Arial';ctx.fillText(text,256,76);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const p=mesh(new THREE.PlaneGeometry(1.65,.41),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false}),room,x,.104,z);
    p.rotation.x=-Math.PI/2;p.castShadow=false;
  }
  floorLabel('TEACHER',-2.6,.9);floorLabel('LEARNER',.8,2.8);

  function createCat(){
    // Full 3D character built from the supplied front / side / back design sheet.
    const cat=new THREE.Group();cat.position.set(-2.55,.1,.35);cat.scale.setScalar(.90);cat.rotation.y=.25;room.add(cat);
    const randomFur=seeded(83);
    const fur=new THREE.MeshStandardMaterial({color:0xdca052,roughness:.96});
    const cream=new THREE.MeshStandardMaterial({color:0xf4dfba,roughness:.98});
    const pink=new THREE.MeshStandardMaterial({color:0xe2ada2,roughness:.92});
    const navy=new THREE.MeshStandardMaterial({color:0x30394b,roughness:.8});
    const gold=new THREE.MeshStandardMaterial({color:0xc5a66a,metalness:.58,roughness:.4});
    const spectacles=new THREE.MeshStandardMaterial({color:0x58462f,metalness:.72,roughness:.3});
    function knitTexture(){
      const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
      ctx.fillStyle='#888';ctx.fillRect(0,0,256,256);ctx.lineWidth=3;ctx.lineCap='round';
      for(let x=-16;x<272;x+=16)for(let y=-24;y<280;y+=24){
        ctx.strokeStyle='#b0b0b0';ctx.beginPath();ctx.moveTo(x-5,y-8);ctx.quadraticCurveTo(x-3,y+3,x,y+7);ctx.stroke();
        ctx.strokeStyle='#666';ctx.beginPath();ctx.moveTo(x+5,y-8);ctx.quadraticCurveTo(x+3,y+3,x,y+7);ctx.stroke();
      }
      const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,2);return t;
    }
    const knit=knitTexture();
    const vest=new THREE.MeshStandardMaterial({color:0xd9bea0,roughness:.96,bumpMap:knit,bumpScale:.012});
    const shirt=new THREE.MeshStandardMaterial({color:0xf4eee3,roughness:.93,bumpMap:knit,bumpScale:.002});
    const trousers=new THREE.MeshStandardMaterial({color:0xb9a083,roughness:1,bumpMap:knit,bumpScale:.003});
    function clothPatch(vertices,mat){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
      g.setIndex(vertices.length===3?[0,1,2]:[0,1,2,0,2,3]);g.computeVertexNormals();
      const o=mesh(g,mat,cat);o.material.side=THREE.DoubleSide;return o;
    }
    // Short trousers, separate grounded paws and a continuous knitted torso.
    for(const side of [-1,1]){
      const leg=mesh(new THREE.CapsuleGeometry(.185,.17,8,24),trousers,cat,side*.20,.34,0);leg.scale.z=.86;
      const hem=mesh(new THREE.TorusGeometry(.18,.012,6,32),trousers,cat,side*.20,.205,.005);hem.rotation.x=Math.PI/2;hem.scale.y=.86;
      sphere(.185,cream,side*.20,.105,.10,cat,[1.04,.56,1.25]);
      for(const offset of [-.052,.052]){
        const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(side*.20+offset,.12,.315),new THREE.Vector3(side*.20+offset,.16,.29),new THREE.Vector3(side*.20+offset,.18,.25));
        cat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(8)),new THREE.LineBasicMaterial({color:0xb69974,transparent:true,opacity:.33})));
      }
    }
    const torsoProfile=[[.27,.50],[.36,.52],[.425,.68],[.435,.99],[.39,1.23],[.30,1.39],[.235,1.44]].map(v=>new THREE.Vector2(...v));
    const torso=mesh(new THREE.LatheGeometry(torsoProfile,48),vest,cat);torso.scale.z=.72;
    // Ribbed hem and neckline remain readable at the home-page scale.
    const hem=mesh(new THREE.TorusGeometry(.325,.034,8,48),vest,cat,0,.53,0);hem.rotation.x=Math.PI/2;hem.scale.set(1.10,.72,1);
    clothPatch([[-.31,1.36,.20],[0,1.03,.323],[.31,1.36,.20]],shirt);
    tube([[-.32,1.38,.215],[0,1.045,.34],[.32,1.38,.215]],.023,navy,cat);
    tube([[-.35,1.39,.20],[0,1.006,.35],[.35,1.39,.20]],.014,cream,cat);
    clothPatch([[-.07,1.435,.245],[-.31,1.365,.24],[-.13,1.215,.338],[0,1.355,.33]],shirt);
    clothPatch([[.07,1.435,.245],[.31,1.365,.24],[.13,1.215,.338],[0,1.355,.33]],shirt);
    clothPatch([[-.06,1.35,.35],[.055,1.35,.35],[.063,1.27,.37],[0,1.235,.38]],navy);
    clothPatch([[-.037,1.26,.383],[.035,1.26,.383],[.075,1.105,.351],[0,1.065,.358]],navy);
    tube([[-.026,1.23,.39],[.054,1.19,.377]],.006,gold,cat);
    tube([[-.009,1.14,.374],[.051,1.11,.367]],.006,gold,cat);
    // Folded shirt sleeves and softly bent arms, with the left paw holding the book.
    const leftArm=new THREE.Group();leftArm.position.set(-.40,1.21,0);leftArm.rotation.z=-.18;cat.add(leftArm);
    sphere(.18,shirt,0,-.105,0,leftArm,[1,1.35,.96]);
    const cuff=mesh(new THREE.TorusGeometry(.15,.033,8,28),shirt,leftArm,0,-.285,.005);cuff.rotation.x=Math.PI/2;
    sphere(.143,fur,0,-.36,.025,leftArm,[.97,1.12,.95]);sphere(.153,cream,.005,-.48,.065,leftArm,[1,.91,1.0]);
    const rightArm=new THREE.Group();rightArm.position.set(.40,1.21,0);rightArm.rotation.z=.32;cat.add(rightArm);
    sphere(.18,shirt,0,-.10,0,rightArm,[1,1.15,1]);
    const rightCuff=mesh(new THREE.TorusGeometry(.15,.03,8,28),shirt,rightArm,0,-.24,.08);rightCuff.rotation.x=Math.PI/2;
    // A navy chemistry textbook, with its own generated cover, page block and gold spine.
    const book=new THREE.Group();book.position.set(.41,.98,.405);book.rotation.z=-.10;book.rotation.y=-.12;cat.add(book);
    box(.54,.77,.105,new THREE.MeshStandardMaterial({color:0xdad2bd,roughness:.9}),0,0,0,book);
    box(.585,.82,.018,navy,0,0,.064,book);box(.585,.82,.018,navy,0,0,-.064,book);
    box(.035,.82,.15,navy,-.282,0,0,book);
    for(const y of [-.32,.30])box(.027,.018,.153,gold,-.282,y,0,book);
    const cover=document.createElement('canvas');cover.width=768;cover.height=1024;
    const bc=cover.getContext('2d');bc.fillStyle='#30394b';bc.fillRect(0,0,768,1024);
    bc.strokeStyle='#bfa66c';bc.lineWidth=3;bc.strokeRect(42,42,684,940);bc.strokeRect(58,58,652,908);
    bc.fillStyle='#ddc58a';bc.textAlign='center';bc.font='bold 86px Georgia';bc.fillText('Chemistry',384,265);
    bc.lineWidth=5;bc.beginPath();for(let i=0;i<=6;i++){const a=i/6*TAU-Math.PI/2;const x=384+112*Math.cos(a),y=510+112*Math.sin(a);if(i===0)bc.moveTo(x,y);else bc.lineTo(x,y);}bc.stroke();
    for(let i=0;i<6;i++){const a=i/6*TAU-Math.PI/2;bc.beginPath();bc.arc(384+112*Math.cos(a),510+112*Math.sin(a),9,0,TAU);bc.fill();}
    bc.font='22px Arial';bc.fillText('BOUNDLESS CLASSROOM',384,870);
    const coverMap=new THREE.CanvasTexture(cover);coverMap.colorSpace=THREE.SRGBColorSpace;
    mesh(new THREE.PlaneGeometry(.566,.797),new THREE.MeshBasicMaterial({map:coverMap,toneMapped:false}),book,0,0,.076);
    tube([[.43,1.0,.12],[.49,.94,.32],[.61,.99,.52]],.115,fur,cat);
    sphere(.155,fur,.61,.99,.52,cat,[.90,1.0,.78]);
    sphere(.115,cream,.61,.96,.585,cat,[1.05,.88,.36]);
    // Broad amber-eyed head with a pale muzzle that blends into the cheek fur.
    const head=new THREE.Group();head.position.set(0,1.82,.01);head.rotation.z=.018;cat.add(head);
    const headGeo=new THREE.SphereGeometry(.55,64,48),colors=[];
    const baseGold=new THREE.Color(0xd59549),pale=new THREE.Color(0xf4e1bd),stripeColor=new THREE.Color(0xbf7f40);
    const hp=headGeo.attributes.position;
    for(let i=0;i<hp.count;i++){
      const x=hp.getX(i),y=hp.getY(i),z=hp.getZ(i);
      const chin=THREE.MathUtils.smoothstep(-y,-.06,.30)*THREE.MathUtils.smoothstep(z,-.14,.27);
      const color=baseGold.clone().lerp(pale,chin*.94);
      const stripe=(Math.exp(-x*x/.0009)+Math.exp(-Math.pow(Math.abs(x)-.13-.18*y,2)/.0008))*.18;
      color.lerp(stripeColor,Math.min(.3,stripe)*THREE.MathUtils.smoothstep(y,.10,.38)*THREE.MathUtils.smoothstep(z,.13,.38));
      colors.push(color.r,color.g,color.b);
    }
    headGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const headMesh=mesh(headGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97}),head);headMesh.scale.set(1.13,.96,.94);
    // Fine instanced cutout strands soften the silhouette without turning it into a fur sphere.
    const furCanvas=document.createElement('canvas');furCanvas.width=64;furCanvas.height=128;const fc=furCanvas.getContext('2d');
    fc.fillStyle='#000';fc.fillRect(0,0,64,128);fc.lineCap='round';
    for(let i=0;i<13;i++){
      const x=12+randomFur()*40;fc.strokeStyle='rgba(255,255,255,'+(.5+randomFur()*.5)+')';fc.lineWidth=.9+randomFur()*1.2;
      fc.beginPath();fc.moveTo(x,126);fc.quadraticCurveTo(x-6+randomFur()*12,62,x-9+randomFur()*18,8+randomFur()*20);fc.stroke();
    }
    const furAlpha=new THREE.CanvasTexture(furCanvas);
    const strandMat=new THREE.MeshBasicMaterial({color:0xffffff,alphaMap:furAlpha,alphaTest:.20,side:THREE.DoubleSide,toneMapped:false});
    const strandGeo=new THREE.PlaneGeometry(1,1);
    const hair=new THREE.InstancedMesh(strandGeo,strandMat,1300);hair.castShadow=false;hair.receiveShadow=true;head.add(hair);
    const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
    for(let i=0;i<1300;i++){
      const a=randomFur()*TAU,u=randomFur()*2-1;const n=new THREE.Vector3(Math.sqrt(1-u*u)*Math.cos(a),u,Math.sqrt(1-u*u)*Math.sin(a));
      const face=n.z>.35&&n.y<.80&&n.y>-.75;
      const length=face?.022:.055+randomFur()*.035;
      dummy.position.set(n.x*.55*1.13,n.y*.55*.96,n.z*.55*.94);dummy.position.addScaledVector(n,length*.28);
      dummy.quaternion.setFromUnitVectors(up,n);dummy.rotateY(randomFur()*TAU);dummy.scale.set(face?0:.018+randomFur()*.018,face?0:length,1);dummy.updateMatrix();hair.setMatrixAt(i,dummy.matrix);
      const col=new THREE.Color(0xf0d29c).lerp(new THREE.Color(0xf5e4c7),THREE.MathUtils.smoothstep(-n.y,-.15,.62)*THREE.MathUtils.smoothstep(n.z,-.3,.5));
      col.multiplyScalar(.94+randomFur()*.16);hair.setColorAt(i,col);
    }
    function softEar(w,h){const e=new THREE.Shape();e.moveTo(-w/2,0);e.bezierCurveTo(-w*.50,h*.3,-w*.27,h*.91,-w*.07,h);e.bezierCurveTo(w*.10,h*1.04,w*.31,h*.55,w/2,0);e.quadraticCurveTo(0,-.045,-w/2,0);return e;}
    const iris=new THREE.MeshPhysicalMaterial({color:0xb99a4d,roughness:.25,clearcoat:.65});
    const pupil=new THREE.MeshPhysicalMaterial({color:0x151a17,roughness:.10,clearcoat:1});
    const eyeRim=new THREE.MeshStandardMaterial({color:0x6a5032,roughness:.8});
    const highlight=new THREE.MeshBasicMaterial({color:0xfffcf1});
    for(const side of [-1,1]){
      const ear=new THREE.Group();ear.position.set(side*.385,.39,-.025);ear.rotation.z=-side*.17;head.add(ear);
      const geo=new THREE.ExtrudeGeometry(softEar(.30,.35),{depth:.06,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:16});
      mesh(geo,fur,ear);mesh(new THREE.ShapeGeometry(softEar(.20,.26),20),pink,ear,0,.026,.091);
      const eye=new THREE.Group();eye.position.set(side*.227,.049,.457);eye.rotation.y=side*.21;head.add(eye);
      sphere(.142,eyeRim,0,0,0,eye,[1,.99,.20]);sphere(.131,iris,0,0,.019,eye,[1,.98,.21]);
      sphere(.096,pupil,-side*.009,.002,.044,eye,[.89,1.03,.24]);
      sphere(.032,highlight,-.029,.042,.071,eye,[1,.94,.20]);sphere(.010,highlight,.028,-.034,.069,eye,[1,1,.20]);
      const frame=mesh(new THREE.TorusGeometry(.172,.009,10,64),spectacles,head,side*.227,.049,.532);frame.rotation.y=side*.18;
      tube([[side*.398,.055,.50],[side*.57,.07,.35],[side*.57,.045,.12]],.008,spectacles,head);
      sphere(.174,cream,side*.116,-.179,.445,head,[1.10,.71,.45]);
      for(let j=0;j<3;j++){
        const y=-.16+j*.033,curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.20,y,.48),new THREE.Vector3(side*.40,y+.012*(j-1),.49),new THREE.Vector3(side*.64,y+.053*(j-1),.44)]);
        head.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(12)),new THREE.LineBasicMaterial({color:0xf3e2c3,transparent:true,opacity:.72})));
      }
    }
    tube([[-.055,.052,.55],[0,.083,.568],[.055,.052,.55]],.007,spectacles,head);
    sphere(.044,new THREE.MeshStandardMaterial({color:0xcc9289,roughness:.75}),0,-.145,.533,head,[1.08,.70,.50]);
    for(const side of [-1,1]){
      const c=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,-.172,.520),new THREE.Vector3(side*.03,-.224,.516),new THREE.Vector3(side*.079,-.204,.502));
      head.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(12)),new THREE.LineBasicMaterial({color:0x9e7862,transparent:true,opacity:.65})));
    }
    // A bushy curled tail is visible from the side and back, matching the character sheet.
    const tailCurve=new THREE.CatmullRomCurve3([[0,.46,-.27],[.44,.48,-.43],[.63,.72,-.46],[.57,1.04,-.46],[.38,1.13,-.42]].map(v=>new THREE.Vector3(...v)));
    mesh(new THREE.TubeGeometry(tailCurve,40,.14,16,false),fur,cat);
    sphere(.147,cream,.38,1.13,-.42,cat);
    const tailHair=new THREE.InstancedMesh(strandGeo,strandMat,600);tailHair.castShadow=false;cat.add(tailHair);
    for(let i=0;i<600;i++){
      const t=randomFur(),center=tailCurve.getPoint(t),tangent=tailCurve.getTangent(t);let n=new THREE.Vector3(Math.cos(i*2.4),Math.sin(i*2.4),Math.cos(i*.79));n.addScaledVector(tangent,-n.dot(tangent)).normalize();
      const length=.065+randomFur()*.055;dummy.position.copy(center).addScaledVector(n,.14+length*.22);dummy.quaternion.setFromUnitVectors(up,n);dummy.rotateY(randomFur()*TAU);dummy.scale.set(.027,length,1);dummy.updateMatrix();tailHair.setMatrixAt(i,dummy.matrix);tailHair.setColorAt(i,new THREE.Color(0xeec286).lerp(new THREE.Color(0xf5e1bd),t*.60));
    }
    return cat;
  }
  const cat=createCat();

  // A volumetric particle ribbon: every point has real depth, never a flat galaxy card.
  // No solid planets or solar-system orbit decorations.
  const random=seeded(149),skyTime={value:0},pointScale={value:1};
  function gaussian(){return Math.sqrt(-2*Math.log(Math.max(.00001,random())))*Math.cos(TAU*random());}
  function particleField(data,flow=0,soft=false){
    const geometry=new THREE.BufferGeometry();
    for(const [name,values,size] of [['position',data.position,3],['aColor',data.color,3],['aSize',data.size,1],['aAlpha',data.alpha,1],['aPhase',data.phase,1],['aSpeed',data.speed,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:skyTime,uPointScale:pointScale,uFlow:{value:flow},uSoft:{value:soft?1:0}},
      transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:`
        uniform float uTime;
        uniform float uPointScale;
        uniform float uFlow;
        uniform float uSoft;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aPhase;
        attribute float aSpeed;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vec3 p=position;
          if(uFlow>.5){
            p.y=mod(p.y+uTime*(.42+aSpeed*.55)+180.,360.)-180.;
            p.x+=sin(uTime*.055+aPhase)*.7;
          }else{
            p.y+=sin(uTime*.075+p.x*.021)*2.3;
            p.z+=cos(uTime*.045+p.x*.015)*2.6;
          }
          vec4 viewPosition=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*viewPosition;
          gl_PointSize=clamp(aSize*uPointScale/max(1.,-viewPosition.z),1.35,uSoft>.5?180.:22.);
          vColor=aColor;
          vAlpha=aAlpha*(.73+.27*sin(uTime*(.48+aSpeed*.65)+aPhase));
        }`,
      fragmentShader:`
        uniform float uSoft;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float radius=length(gl_PointCoord-.5)*2.;
          if(radius>1.)discard;
          float core=exp(-radius*radius*(uSoft>.5?2.8:3.4));
          gl_FragColor=vec4(vColor,core*vAlpha);
          #include <colorspace_fragment>
        }`
    });
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;return points;
  }
  function particleData(){return {position:[],color:[],size:[],alpha:[],phase:[],speed:[]};}
  function pushParticle(data,x,y,z,size,alpha,tint){
    data.position.push(x,y,z);data.color.push(tint*.94,tint*.97,tint);
    data.size.push(size);data.alpha.push(alpha);data.phase.push(random()*TAU);data.speed.push(random());
  }
  const distant=particleData();
  for(let i=0;i<3500;i++){
    const a=random()*TAU,u=random()*2-1,r=90+random()*160;
    pushParticle(distant,r*Math.sqrt(1-u*u)*Math.cos(a),u*180,r*Math.sqrt(1-u*u)*Math.sin(a),.40+random()*.90,.60+random()*.40,.57+random()*.4);
  }
  scene.add(particleField(distant,1));
  // Continuous curved dust veils replace the previous broad, spotted fog particles.
  const nebula=new THREE.Group();nebula.position.set(-58,-35,-95);nebula.rotation.set(0,.59,-.30);scene.add(nebula);
  const compact=container.clientWidth<650,ribbonLayers=[];
  function noiseHash(x,y){let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
  function noise(x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    return ease(ease(noiseHash(ix,iy),noiseHash(ix+1,iy),sx),ease(noiseHash(ix,iy+1),noiseHash(ix+1,iy+1),sx),sy);
  }
  function fbm(x,y){let value=0,amplitude=.55;for(let i=0;i<5;i++){value+=noise(x,y)*amplitude;x=x*2.04+3.7;y=y*2.03+1.9;amplitude*=.48;}return value;}
  function makeVeilTexture(){
    const c=document.createElement('canvas');c.width=1536;c.height=384;
    const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height),data=pixels.data;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      const u=x/(c.width-1),v=y/(c.height-1)*2-1;
      const flow=fbm(u*7.5+9,2.8+v*2.2),filament=fbm(u*28+3,v*10+11);
      const bend=(flow-.46)*1.15+Math.sin(u*9.4)*.10;
      const d=v-bend,width=.24+.18*flow;
      const core=Math.exp(-d*d/(width*width));
      const veil=Math.exp(-d*d/.22)*(.24+.62*filament);
      const folds=Math.pow(Math.max(.05,filament),1.4);
      const edge=Math.pow(Math.sin(Math.PI*u),.30);
      const alpha=Math.min(1,(core*(.06+folds*1.9)+veil*.36)*edge);
      const i=(y*c.width+x)*4;
      data[i]=187+filament*32;data[i+1]=199+filament*29;data[i+2]=216+filament*23;data[i+3]=Math.round(alpha*220);
    }
    ctx.putImageData(pixels,0,0);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
  }
  const veilMap=makeVeilTexture();
  function spine(u){return Math.sin(u*4.1+.3)*10.5+Math.sin(u*8.2)*2.2;}
  const layerSettings=[[-10,24,.11,-3.6],[-4,15,.19,1.5],[1,8,.25,0],[7,17,.16,3],[14,27,.10,-1.2]];
  for(let layer=0;layer<layerSettings.length;layer++){
    const [depth,width,opacity,offset]=layerSettings[layer],vertices=[],uvs=[],indices=[];
    const nx=160,ny=18;
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const u=i/nx*2-1,v=j/ny*2-1;
      const breathing=1+.12*Math.sin(u*5+layer);
      vertices.push(u*185,spine(u)+offset+Math.sin(u*10+layer*2)*(layer-2)*.65+v*width*breathing,Math.sin(u*2.5)*9+depth+v*v*3.5+Math.sin(u*6+layer)*1.4);
      uvs.push(i/nx,j/ny);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*(nx+1)+i;indices.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
    const material=new THREE.MeshBasicMaterial({map:veilMap,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    const veil=new THREE.Mesh(geometry,material);veil.frustumCulled=false;nebula.add(veil);ribbonLayers.push({mesh:veil,opacity,phase:layer*.9});
  }
  const dust=particleData(),count=compact?24000:42000;
  for(let i=0;i<count;i++){
    const u=random()*2-1,x=u*185;
    const spread=3.5+4.5*(.5+.5*Math.sin(u*4.8+1));
    const y=spine(u)+gaussian()*spread,z=Math.sin(u*2.5)*9+gaussian()*8.5;
    const edge=Math.pow(Math.max(0,1-u*u),.45),bright=random();
    pushParticle(dust,x,y,z,.24+Math.pow(bright,5)*.85,(.18+random()*.28)*edge,.58+random()*.37);
  }
  nebula.add(particleField(dust));
  // Occasional small glints provide a gentle focal rhythm, without any solid celestial bodies.
  function glintTexture(){
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
    const g=ctx.createRadialGradient(128,128,0,128,128,120);g.addColorStop(0,'rgba(241,247,255,1)');g.addColorStop(.025,'rgba(226,236,255,.9)');g.addColorStop(.10,'rgba(199,218,255,.28)');g.addColorStop(1,'rgba(160,184,230,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='rgba(228,238,255,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(128,58);ctx.lineTo(128,198);ctx.moveTo(58,128);ctx.lineTo(198,128);ctx.stroke();
    return new THREE.CanvasTexture(c);
  }
  const glintMap=glintTexture(),glints=[];
  for(const [x,scale] of [[-104,4.5],[72,6.2]]){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glintMap,transparent:true,depthWrite:false,opacity:.55,blending:THREE.AdditiveBlending}));
    sprite.position.set(x,spine(x/185),Math.sin(x/185*2.5)*9+8);sprite.scale.set(scale,scale,scale);nebula.add(sprite);glints.push(sprite);
  }
  const near=particleData();
  for(let i=0;i<150;i++){
    const a=random()*TAU,r=72+random()*45;
    pushParticle(near,Math.cos(a)*r,(random()-.5)*180,Math.sin(a)*r,.32+random()*.65,.30+random()*.44,.80+random()*.18);
  }
  scene.add(particleField(near,1));

  function pose(){
    const portrait=container.clientWidth<650;
    const portraitFit=portrait?Math.max(1,.67/camera.aspect):1;
    if(mode==='home'){
      desiredPosition.set(portrait?15:12,portrait?12.2:9.2,portrait?22:18).multiplyScalar(zoom*portraitFit);
      desiredTarget.set(0,portrait?1.7:2.65,0);
    } else if(mode==='classroom'){
      desiredPosition.set(8.1,5.7,12.3).multiplyScalar(zoom);desiredTarget.set(0,1.35,0);
    } else {
      desiredPosition.set(portrait?15:10.5,portrait?9:5.5,portrait?22:14.5).multiplyScalar(zoom*portraitFit);
      desiredTarget.set(-.6,1.6,0);
    }
    desiredPosition.applyAxisAngle(new THREE.Vector3(0,1,0),dragX);
    desiredPosition.y+=dragY;
  }
  function resize(){const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);pointScale.value=h*renderer.getPixelRatio()*.5;camera.aspect=w/h;camera.updateProjectionMatrix();pose();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  camera.position.copy(desiredPosition);target.copy(desiredTarget);camera.lookAt(target);

  let previousPinch=0;const touches=new Map();
  const canvas=renderer.domElement;
  function pointerDown(e){
    moving=true;lastX=e.clientX;lastY=e.clientY;
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
    if(touches.size===2){const p=[...touches.values()];previousPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  }
  function pointerMove(e){
    const rect=canvas.getBoundingClientRect();pointerX=(e.clientX-rect.left)/rect.width-.5;pointerY=(e.clientY-rect.top)/rect.height-.5;
    if(!moving)return;
    if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size===2){
      const p=[...touches.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
      if(previousPinch>0)zoom=THREE.MathUtils.clamp(zoom*previousPinch/Math.max(1,distance),.6,1.65);previousPinch=distance;
    }else{dragX=THREE.MathUtils.clamp(dragX-(e.clientX-lastX)*.003,-1.05,1.05);dragY=THREE.MathUtils.clamp(dragY+(e.clientY-lastY)*.008,-2,5);}
    lastX=e.clientX;lastY=e.clientY;pose();
  }
  function pointerUp(e){touches.delete(e.pointerId);moving=touches.size>0;previousPinch=0;canvas.style.cursor='grab';}
  function wheel(e){if(mode==='home')return;e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.0005,.6,1.65);pose();}
  canvas.style.cursor='grab';canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
  canvas.addEventListener('wheel',wheel,{passive:false});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onState('lost');});
  canvas.addEventListener('webglcontextrestored',()=>onState('restored'));

  function setMode(next){mode=next;zoom=1;dragX=dragY=0;pose();}
  function setBoard(title,subtitle){boardTitle=title;boardSubtitle=subtitle;drawBoard();}
  renderer.setAnimationLoop(time=>{
    // Render capped at 40fps outside XR; pause animation work while the tab is hidden.
    if(document.hidden&&!renderer.xr.isPresenting)return;
    if(!renderer.xr.isPresenting && time-frameTime<25)return;frameTime=time;
    const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
    if(!reduceMotion.matches&&!renderer.xr.isPresenting)skyTime.value+=dt;
    for(const layer of ribbonLayers){layer.mesh.position.y=Math.sin(skyTime.value*.06+layer.phase)*.65;layer.mesh.material.opacity=layer.opacity*(.95+.05*Math.sin(skyTime.value*.09+layer.phase));}
    glints.forEach((glint,i)=>{glint.material.opacity=.49+.10*Math.sin(skyTime.value*.42+i*2);});
    if(!renderer.xr.isPresenting){
      const smoothing=reduceMotion.matches?1:1-Math.exp(-dt*4);
      camera.position.lerp(desiredPosition,smoothing);target.lerp(desiredTarget,smoothing);
      const look=target.clone();if(!reduceMotion.matches&&!moving){look.x+=pointerX*.18;look.y-=pointerY*.12;}camera.lookAt(look);
      room.position.y=reduceMotion.matches?0:Math.sin(time*.00035)*.045;
      cat.scale.y=.90*(1+(reduceMotion.matches?0:Math.sin(time*.0016)*.006));
    } else room.position.y=0;
    renderer.render(scene,camera);
  });
  async function immersiveSupported(){if(!isSecureContext||!navigator.xr)return false;try{return await navigator.xr.isSessionSupported('immersive-vr');}catch{return false;}}
  async function enterImmersive(){
    if(!(await immersiveSupported()))throw new Error('此浏览器或设备不支持沉浸式头显。');
    session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor']});
    renderer.xr.setReferenceSpaceType('local-floor');
    rig.position.set(.8,0,2.5);camera.position.set(0,1.6,0);camera.rotation.set(0,0,0);
    try{await renderer.xr.setSession(session);}catch(error){await session.end();session=null;rig.position.set(0,0,0);pose();throw error;}
    session.addEventListener('end',()=>{session=null;rig.position.set(0,0,0);pose();onState('xr-end');},{once:true});
    onState('xr-start');
  }
  onState('ready');
  return {setMode,setBoard,resize,immersiveSupported,enterImmersive,async endImmersive(){if(session)await session.end();}};
}
