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
    deck:new THREE.MeshStandardMaterial({color:0xa3a6a4,roughness:.6,metalness:.25}),
    edge:new THREE.MeshStandardMaterial({color:0x3d4651,roughness:.38,metalness:.7}),
    white:new THREE.MeshStandardMaterial({color:0xe1e2da,roughness:.48,metalness:.2}),
    dark:new THREE.MeshStandardMaterial({color:0x202a35,roughness:.5,metalness:.45}),
    glow:new THREE.MeshStandardMaterial({color:0xeeeadc,emissive:0xd5d9d5,emissiveIntensity:.65,roughness:.5})
  };
  scene.add(new THREE.HemisphereLight(0xbacde6,0x343039,1.65));
  const key=new THREE.DirectionalLight(0xfff1d6,3.1);key.position.set(-3,9,5);key.castShadow=true;
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
  mesh(new THREE.CylinderGeometry(6.24,6.24,.07,112),new THREE.MeshStandardMaterial({color:0x4d5661,roughness:.8,metalness:.4}),room,0,-.075,0);
  ring(6.3,-.19,0xe9e8df,.7);
  ring(6.65,-.46,0xb4c7df,.14);
  ring(7.5,-.9,0x9cabc0,.045);
  const floor=box(9.2,.13,6.9,materials.deck,0,.025,0);
  // Restrained panels and an open architectural frame: no enclosed walls.
  const seamMat=new THREE.LineBasicMaterial({color:0x4a515a,transparent:true,opacity:.18});
  for(let i=-3;i<=3;i++){
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i*1.2,.096,-3.35),new THREE.Vector3(i*1.2,.096,3.35)]);
    room.add(new THREE.Line(geo,seamMat));
  }
  const frameMat=new THREE.MeshStandardMaterial({color:0xa7b1bb,roughness:.35,metalness:.7});
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
  floorLabel('TEACHER',-2.6,-.8);floorLabel('LEARNER',.8,2.8);

  function createCat(){
    const cat=new THREE.Group();cat.position.set(-2.45,.1,-1.2);room.add(cat);
    const fur=new THREE.MeshStandardMaterial({color:0xb7854f,roughness:.93});
    const cream=new THREE.MeshStandardMaterial({color:0xf0d7a4,roughness:.94});
    const muzzle=new THREE.MeshStandardMaterial({color:0xf0dfc3,roughness:.95});
    const black=new THREE.MeshStandardMaterial({color:0x131b17,roughness:.18});
    const eyeGold=new THREE.MeshStandardMaterial({color:0xadb684,roughness:.3});
    const pink=new THREE.MeshStandardMaterial({color:0xc79b91,roughness:.85});
    sphere(.5,fur,0,.57,0,cat,[.86,1.1,.73]);sphere(.3,cream,0,.54,.28,cat,[1,1.23,.44]);
    sphere(.53,fur,0,1.25,.01,cat,[1.1,.98,.9]);sphere(.43,cream,0,1.23,.22,cat,[1.2,.98,.64]);
    for(const s of [-1,1]){
      const ear=mesh(new THREE.ConeGeometry(.23,.4,3),fur,cat,s*.37,1.66,-.02);ear.rotation.z=-s*.23;
      const inner=mesh(new THREE.ConeGeometry(.135,.25,3),pink,cat,s*.37,1.67,.09);inner.rotation.z=-s*.23;
      sphere(.115,eyeGold,s*.23,1.3,.487,cat,[1,.98,.35]);
      sphere(.075,black,s*.23,1.3,.52,cat,[.86,1.08,.4]);
      sphere(.022,materials.white,s*.21,1.33,.55,cat);
      sphere(.145,muzzle,s*.14,1.09,.43,cat,[1.04,.9,.55]);
      sphere(.16,cream,s*.27,.17,.2,cat,[1,.75,1.25]);
      for(let j=0;j<3;j++){
        const pts=[[s*.21,1.08+j*.035,.49],[s*.57,1.05+j*.075,.48]];
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:0xe2d8c2,transparent:true,opacity:.65}));cat.add(line);
      }
    }
    sphere(.05,pink,0,1.105,.528,cat,[1.2,.7,.6]);
    tube([[.32,.3,-.15],[.65,.4,-.36],[.77,.68,-.26],[.7,.85,-.13]],.10,fur,cat);
    const collar=mesh(new THREE.TorusGeometry(.34,.035,8,40),new THREE.MeshStandardMaterial({color:0x506b63,roughness:.6}),cat,0,.89,.06);
    collar.rotation.x=Math.PI/2;
    sphere(.06,new THREE.MeshStandardMaterial({color:0xc5a566,metalness:.7,roughness:.35}),0,.86,.37,cat);
    cat.rotation.y=.14;return cat;
  }
  const cat=createCat();

  // All celestial imagery is generated locally: no textures, tracking, or external CDNs.
  const random=seeded();
  const starPositions=[],starColors=[];
  for(let i=0;i<4300;i++){
    const theta=random()*TAU,u=random()*2-1,r=115+random()*110;
    starPositions.push(r*Math.sqrt(1-u*u)*Math.cos(theta),r*u,r*Math.sqrt(1-u*u)*Math.sin(theta));
    const a=.21+random()*.62;starColors.push(a*.91,a*.94,a);
  }
  const starGeo=new THREE.BufferGeometry();
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));starGeo.setAttribute('color',new THREE.Float32BufferAttribute(starColors,3));
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({size:.31,vertexColors:true,transparent:true,opacity:.8,sizeAttenuation:true,depthWrite:false}));scene.add(stars);
  function glowTexture(){
    const c=document.createElement('canvas');c.width=c.height=128;
    const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,244,216,.92)');g.addColorStop(.08,'rgba(245,232,203,.75)');
    g.addColorStop(.2,'rgba(197,209,233,.13)');g.addColorStop(1,'rgba(150,177,216,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  const glow=glowTexture();
  for(const p of [[-45,35,-95],[70,24,-85],[-100,-7,-75],[38,-18,-95],[25,58,-120]]){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,transparent:true,opacity:.7,depthWrite:false}));
    sprite.position.set(...p);sprite.scale.set(1.8,1.8,1.8);scene.add(sprite);
  }
  const galaxyCanvas=document.createElement('canvas');galaxyCanvas.width=2048;galaxyCanvas.height=768;
  const gc=galaxyCanvas.getContext('2d');
  const cloud=gc.createRadialGradient(1024,384,20,1024,384,900);
  cloud.addColorStop(0,'rgba(183,181,173,.22)');cloud.addColorStop(.3,'rgba(107,121,153,.10)');cloud.addColorStop(1,'rgba(30,46,83,0)');
  gc.save();gc.translate(1024,384);gc.scale(1,.24);gc.translate(-1024,-384);gc.fillStyle=cloud;gc.fillRect(0,-1000,2048,2800);gc.restore();
  for(let i=0;i<9000;i++){
    const x=random()*2048,spread=14+Math.sin(x/2048*Math.PI)*65;
    const y=384+(random()+random()+random()-1.5)*spread;
    const alpha=(.018+random()*.18)*Math.sin(x/2048*Math.PI);
    gc.fillStyle='rgba(192,199,218,'+alpha.toFixed(3)+')';gc.beginPath();gc.arc(x,y,random()<.015?1.3:random()*.7+.12,0,TAU);gc.fill();
  }
  const galaxy=new THREE.Mesh(new THREE.PlaneGeometry(220,82.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(galaxyCanvas),transparent:true,depthWrite:false,opacity:.8}));
  galaxy.position.set(-85,42,-135);galaxy.rotation.z=.32;scene.add(galaxy);
  const sun=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0xffcf89,opacity:.9,depthWrite:false}));
  sun.position.set(-18,3,-125);sun.scale.set(6,6,6);scene.add(sun);
  const solar=new THREE.Group();solar.position.set(-18,3,-126);solar.rotation.z=-.3;solar.rotation.x=.85;scene.add(solar);
  for(const radius of [5,8,12,17])ring(radius,0,0x8d9bb3,.05,solar);
  for(const [r,a,size,color] of [[5,1,.32,0xbfa383],[8,3,.52,0x6f869c],[12,5,.66,0x928a82],[17,2,.9,0xb4a58d]]){
    sphere(size,new THREE.MeshBasicMaterial({color}),r*Math.cos(a),0,r*Math.sin(a),solar);
  }

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
  function resize(){const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();pose();}
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
    if(!renderer.xr.isPresenting){
      const smoothing=reduceMotion.matches?1:1-Math.exp(-dt*4);
      camera.position.lerp(desiredPosition,smoothing);target.lerp(desiredTarget,smoothing);
      const look=target.clone();if(!reduceMotion.matches&&!moving){look.x+=pointerX*.18;look.y-=pointerY*.12;}camera.lookAt(look);
      room.position.y=reduceMotion.matches?0:Math.sin(time*.00035)*.045;
      cat.scale.y=1+(reduceMotion.matches?0:Math.sin(time*.0016)*.009);
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
