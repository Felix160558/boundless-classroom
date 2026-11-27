import * as THREE from './three.module.min.js';
import {createCatTeacher} from './cat-teacher.js?v=teacher-face-53';
import {createMoleculeStage} from './molecule-lesson.js?v=quiet-shape-31';
import {createSpaceSky} from './space-sky.js?v=medieval-lounge-40';
import {createLocalStudentBody} from './live/student-vr-body.js?v=frog-peer-74';
import {createXRAvatarMenu} from './live/xr-avatar-menu.js?v=frog-seat-61';
import {avatarPreference} from './live/avatar-preference.js?v=frog-seat-61';

const TAU = Math.PI * 2;

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
  renderer.xr.setReferenceSpaceType('local');
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden','true');
  const camera=new THREE.PerspectiveCamera(42,1,.1,600);
  const rig=new THREE.Group();rig.add(camera);scene.add(rig);
  const seatPosition=new THREE.Vector3(),nextSeatPosition=new THREE.Vector3();
  const seatDirection=new THREE.Vector3(),xrHeadPosition=new THREE.Vector3(),xrForward=new THREE.Vector3();
  let seatBaseYaw=-.245,seatYaw=-.245,seatPitch=.065,desiredSeatYaw=-.245,desiredSeatPitch=.065,xrSeatPending=false;
  const room=new THREE.Group();scene.add(room);
  const moleculeStage=createMoleculeStage(room);
  let molecularState={ids:[],dipole:false},moleculeDragging=false;
  let mode='home',zoom=1,dragX=0,dragY=0,pointerX=0,pointerY=0;
  let moving=false,lastX=0,lastY=0,lastTime=0,frameTime=0,session=null,openingXR=false,xrAvatarMenu=null;
  let boardTitle='Stay curious.', boardSubtitle='Every question is a beginning.',boardLesson=null;
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
  // A complete, quiet glass enclosure. The existing cosmos remains visible
  // through all panes; no opaque room backdrop or new environment is loaded.
  const glass=new THREE.MeshPhysicalMaterial({color:0xc4d2e1,transparent:true,opacity:.045,roughness:.08,metalness:.08,clearcoat:1,clearcoatRoughness:.08,side:THREE.DoubleSide,depthWrite:false});
  const glassEdges=new THREE.LineBasicMaterial({color:0xb8c8d8,transparent:true,opacity:.16,depthWrite:false});
  function pane(width,height,x,y,z,rx=0,ry=0){
    const geometry=new THREE.PlaneGeometry(width,height),window=mesh(geometry,glass,room,x,y,z);
    window.rotation.set(rx,ry,0);window.castShadow=false;window.receiveShadow=false;
    const border=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),glassEdges);
    window.add(border);return window;
  }
  pane(8.9,3.76,0,1.98,-3.3);
  pane(8.9,3.76,0,1.98,3.3);
  pane(6.6,3.76,-4.45,1.98,0,0,Math.PI/2);
  pane(6.6,3.76,4.45,1.98,0,0,Math.PI/2);
  pane(8.9,6.6,0,3.86,0,Math.PI/2);
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
    if(boardLesson){
      c.fillStyle='#303b37';c.textAlign='left';let size=56;
      do{c.font=size+'px Arial, sans-serif';size-=2;}while(c.measureText(boardLesson.title).width>1310&&size>=34);
      c.fillText(boardLesson.title,100,214);
      c.font='40px Arial, sans-serif';
      const rows=boardLesson.points.map(point=>wrapBoardText(point,1250,2));
      const height=rows.reduce((sum,lines)=>sum+lines.length*46,0)+(rows.length-1)*20;
      let y=282+Math.max(0,(300-height)/2)+34;
      for(const lines of rows){
        c.fillStyle='#b19a75';c.beginPath();c.arc(114,y-13,5,0,Math.PI*2);c.fill();
        c.fillStyle='#45514a';for(const line of lines){c.fillText(line,145,y);y+=46;}y+=20;
      }
    }else{
      c.textAlign='center';c.fillStyle='#303b37';c.font='72px Georgia';c.fillText(boardTitle,768,338);
      c.fillStyle='#7b857b';c.font='28px Arial';c.fillText(boardSubtitle,768,415);
    }
    c.textAlign='center';
    c.fillStyle='#9aa193';c.font='18px Arial';c.fillText('LOVE   ·   SHARE   ·   PEACE',768,642);boardTexture.needsUpdate=true;
  }
  function wrapBoardText(text,width,maxLines){
    const chars=[...text],lines=[];let line='';
    for(let i=0;i<chars.length;i++){
      if(boardCtx.measureText(line+chars[i]).width<=width){line+=chars[i];continue;}
      if(lines.length===maxLines-1){
        while(line&&boardCtx.measureText(line+'…').width>width)line=[...line].slice(0,-1).join('');
        lines.push(line.trimEnd()+'…');return lines;
      }
      const gap=line.lastIndexOf(' ');
      if(gap>line.length*.45){lines.push(line.slice(0,gap));line=line.slice(gap+1)+chars[i];}
      else{lines.push(line);line=chars[i].trimStart();}
    }
    if(line)lines.push(line);return lines;
  }
  drawBoard();
  // One desk, one chair. No additional dashboard or classroom clutter.
  const table=new THREE.Group();table.position.set(.8,0,1.1);room.add(table);
  const desktopShape=new THREE.Shape(),w=.925,d=.455,r=.055;
  desktopShape.moveTo(-w+r,-d);desktopShape.lineTo(w-r,-d);desktopShape.quadraticCurveTo(w,-d,w,-d+r);
  desktopShape.lineTo(w,d-r);desktopShape.quadraticCurveTo(w,d,w-r,d);desktopShape.lineTo(-w+r,d);
  desktopShape.quadraticCurveTo(-w,d,-w,d-r);desktopShape.lineTo(-w,-d+r);desktopShape.quadraticCurveTo(-w,-d,-w+r,-d);
  const desktopGeometry=new THREE.ExtrudeGeometry(desktopShape,{depth:.065,bevelEnabled:true,bevelSize:.012,bevelThickness:.01,bevelSegments:3,steps:1,curveSegments:10});
  desktopGeometry.rotateX(-Math.PI/2);desktopGeometry.translate(0,.91,0);
  mesh(desktopGeometry,new THREE.MeshPhysicalMaterial({color:0xc9c9b7,roughness:.43,clearcoat:.25,clearcoatRoughness:.32}),table);
  for(const x of [-.76,.76])for(const z of [-.32,.32])box(.04,.82,.04,materials.edge,x,.49,z,table);
  const chair=new THREE.Group();chair.position.set(.8,0,2.06);room.add(chair);
  const studentBody=createLocalStudentBody(room,{
    onChange:alignStudentEyes,
    onError:(_,phase)=>onState('student-body-error',phase),
  });
  studentBody.setSeat({x:chair.position.x,y:chair.position.y,z:chair.position.z,yaw:chair.rotation.y});
  studentBody.setAppearance(avatarPreference.current);
  studentBody.eyePosition(seatPosition);
  avatarPreference.subscribe(avatar=>{
    studentBody.setAppearance(avatar);
    if(mode==='classroom')studentBody.preload();
  });
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
  const seatGeometry=roundedChairPanel(.62,.62,.09,.11,.017);
  seatGeometry.rotateX(-Math.PI/2);
  mesh(seatGeometry,materials.dark,chair,0,.58,0);
  mesh(roundedChairPanel(.61,.62,.065,.13,.014),materials.white,chair,0,.95,.29);
  // Rounded tubes soften the supports too; rear posts continue into the backrest.
  const frontLeg=new THREE.CapsuleGeometry(.018,.444,12,32);
  const rearLeg=new THREE.CapsuleGeometry(.018,.934,12,32);
  for(const x of [-.25,.25]){
    mesh(frontLeg,materials.edge,chair,x,.31,-.24);
    mesh(rearLeg,materials.edge,chair,x,.555,.30);
  }
  // Teacher and learner locations are physical floor markers in the scene.
  function floorLabel(text,x,z){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#536172';ctx.textAlign='center';ctx.font='24px Arial';ctx.fillText(text,256,76);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const p=mesh(new THREE.PlaneGeometry(1.65,.41),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false}),room,x,.104,z);
    p.rotation.x=-Math.PI/2;p.castShadow=false;return p;
  }
  const teacherMarker=floorLabel('TEACHER',-2.6,.9);floorLabel('LEARNER',.8,2.8);

  const teacher=createCatTeacher(onState),teacherSpot=new THREE.Group();
  teacherSpot.position.set(-2.55,0,.35);room.add(teacherSpot);
  teacher.group.position.x=0;teacher.group.position.z=0;teacherSpot.add(teacher.group);
  function placeTeacher(seated){
    teacherSpot.position.set(seated?-2.2:-2.55,0,seated?-1.65:.35);
    teacherSpot.rotation.y=seated?Math.atan2(seatPosition.x-teacherSpot.position.x,seatPosition.z-teacherSpot.position.z)-.25:0;
    teacherMarker.position.set(seated?-2.2:-2.6,.104,seated?-1.05:.9);
  }

  const spaceSky=createSpaceSky(scene,{compact:container.clientWidth<650});

  function seatLook(yaw,pitch,out){
    return out.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).add(seatPosition);
  }
  function pose(){
    const w=container.clientWidth,h=container.clientHeight;
    const portrait=w<650;
    const compactClassroom=mode==='classroom'&&window.matchMedia('(max-width:600px)').matches;
    // Retain the original teacher framing while rendering live space under the chat.
    const visibleHeight=compactClassroom?h*.45:h;
    const fov=mode==='vr'?(portrait?78:66):compactClassroom?
      THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(42)*.5)*h/visibleHeight)):42;
    if(!renderer.xr.isPresenting){
      camera.fov=fov;
      camera.near=mode==='vr'?.035:.1;
      if(mode==='classroom'){
        const panelWidth=document.querySelector('.chat-panel')?.getBoundingClientRect().width||0;
        camera.setViewOffset(w,h,compactClassroom?0:panelWidth*.5,compactClassroom?(h-visibleHeight)*.5:0,w,h);
      }else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    if(mode==='vr'){
      desiredPosition.copy(seatPosition);
      desiredSeatYaw=seatBaseYaw+dragX;desiredSeatPitch=THREE.MathUtils.clamp(.065+dragY,-1.25,1.25);
      seatLook(desiredSeatYaw,desiredSeatPitch,desiredTarget);return;
    }
    const portraitFit=portrait?Math.max(1,.67/camera.aspect):1;
    if(mode==='home'){
      desiredPosition.set(portrait?15:12,portrait?12.2:9.2,portrait?22:18).multiplyScalar(zoom*portraitFit);
      desiredTarget.set(0,portrait?1.7:2.65,0);
    }else if(molecularState.ids.length>0){
      // Conversation models are viewed nearly head-on: molecules, the board and the
      // original teacher remain in the same physical room, above the desk.
      desiredPosition.set(.8,3.0,10.5).multiplyScalar(zoom*portraitFit);
      desiredTarget.set(0,1.75,-.5);
    }else{
      desiredPosition.set(8.1,5.7,12.3).multiplyScalar(zoom);desiredTarget.set(0,1.35,0);
    }
    desiredPosition.applyAxisAngle(new THREE.Vector3(0,1,0),dragX);desiredPosition.y+=dragY;
  }
  function snapView(){
    camera.position.copy(desiredPosition);target.copy(desiredTarget);
    seatYaw=desiredSeatYaw;seatPitch=desiredSeatPitch;camera.lookAt(target);
  }
  function alignStudentEyes(){
    if(mode!=='vr')return;
    studentBody.eyePosition(nextSeatPosition);
    if(renderer.xr.isPresenting&&!xrSeatPending){
      rig.position.add(nextSeatPosition).sub(seatPosition);
      rig.updateMatrixWorld(true);
    }
    seatPosition.copy(nextSeatPosition);
    placeTeacher(true);
    pose();
  }
  function resize(){const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);spaceSky.resize(h,renderer.getPixelRatio());camera.aspect=w/h;camera.updateProjectionMatrix();pose();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();snapView();

  let previousPinch=0,tapCandidate=null,hovered=false,hoverStarted=0,lastLook=-10,teacherTime=0;
  const touches=new Map(),teacherRay=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
  const canvas=renderer.domElement;
  function pointerRay(e){
    const rect=canvas.getBoundingClientRect();
    pointerNdc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    camera.updateMatrixWorld();room.updateMatrixWorld(true);teacherRay.setFromCamera(pointerNdc,camera);
    return teacherRay;
  }
  function hitsTeacher(e,precise=false){return teacher.hitTest(pointerRay(e),precise);}
  function hitsMolecule(e){
    return molecularState.ids.length>0&&mode!=='home'&&moleculeStage.hitTest(pointerRay(e));
  }
  function pointerDown(e){
    tapCandidate=touches.size===0?{id:e.pointerId,x:e.clientX,y:e.clientY,cancelled:false}:null;
    moleculeDragging=touches.size===0&&hitsMolecule(e);
    hovered=false;
    moving=true;lastX=e.clientX;lastY=e.clientY;
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
    if(touches.size===2){const p=[...touches.values()];previousPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  }
  function pointerMove(e){
    const rect=canvas.getBoundingClientRect();pointerX=(e.clientX-rect.left)/rect.width-.5;pointerY=(e.clientY-rect.top)/rect.height-.5;
    if(!moving){
      const overMolecule=e.pointerType!=='touch'&&hitsMolecule(e);
      const over=e.pointerType!=='touch'&&!overMolecule&&hitsTeacher(e);
      if(over&&!hovered)hoverStarted=teacherTime;hovered=over;
      canvas.style.cursor=over?'pointer':'grab';return;
    }
    if(tapCandidate&&Math.hypot(e.clientX-tapCandidate.x,e.clientY-tapCandidate.y)>8)tapCandidate.cancelled=true;
    if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size===2){
      moleculeDragging=false;
      const p=[...touches.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
      if(mode!=='vr'&&previousPinch>0)zoom=THREE.MathUtils.clamp(zoom*previousPinch/Math.max(1,distance),.6,1.65);previousPinch=distance;
    }else if(moleculeDragging){
      moleculeStage.rotate((e.clientX-lastX)*.006,(e.clientY-lastY)*.006);
    }else if(mode==='vr'){
      const yaw=dragX-(e.clientX-lastX)*.003;
      dragX=Math.atan2(Math.sin(yaw),Math.cos(yaw));
      dragY=THREE.MathUtils.clamp(dragY+(e.clientY-lastY)*.003,-1.315,1.185);
    }else{dragX=THREE.MathUtils.clamp(dragX-(e.clientX-lastX)*.003,-1.05,1.05);dragY=THREE.MathUtils.clamp(dragY+(e.clientY-lastY)*.008,-2,5);}
    lastX=e.clientX;lastY=e.clientY;pose();
  }
  function pointerUp(e){
    const tap=e.type==='pointerup'&&tapCandidate?.id===e.pointerId&&!tapCandidate.cancelled&&touches.size===1;
    const wasMoleculeDragging=moleculeDragging;
    touches.delete(e.pointerId);moving=touches.size>0;previousPinch=0;tapCandidate=null;
    if(!moving)moleculeDragging=false;
    if(moving){const remaining=touches.values().next().value;lastX=remaining.x;lastY=remaining.y;}
    if(tap&&!wasMoleculeDragging&&hitsTeacher(e,true))teacher.react('tap');
    canvas.style.cursor='grab';
  }
  function wheel(e){if(mode==='home')return;e.preventDefault();if(mode==='vr')return;zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.0005,.6,1.65);pose();}
  canvas.style.cursor='grab';canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerleave',()=>{hovered=false;});
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
  canvas.addEventListener('wheel',wheel,{passive:false});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onState('lost');});
  canvas.addEventListener('webglcontextrestored',()=>onState('restored'));

  container.addEventListener('keydown',e=>{
    if(mode==='classroom'&&molecularState.ids.length>0&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();
      moleculeStage.rotate(e.key==='ArrowLeft'?-.12:e.key==='ArrowRight'?.12:0,e.key==='ArrowUp'?-.12:e.key==='ArrowDown'?.12:0);
      return;
    }
    if(mode!=='vr'||renderer.xr.isPresenting||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='ArrowLeft')dragX-=.075;if(e.key==='ArrowRight')dragX+=.075;
    if(e.key==='ArrowUp')dragY+=.065;if(e.key==='ArrowDown')dragY-=.065;
    dragX=Math.atan2(Math.sin(dragX),Math.cos(dragX));dragY=THREE.MathUtils.clamp(dragY,-1.315,1.185);pose();
  });
  function setMode(next){
    if(next===mode){pose();return;}
    const wasSeated=mode==='vr';mode=next;zoom=1;dragX=dragY=0;
    if(mode==='vr'){seatBaseYaw=container.clientWidth<650?-.45:-.245;room.position.y=0;}
    studentBody.setVisible(mode==='vr',{tracked:Boolean(session)});
    if(mode==='classroom')studentBody.preload();
    if(wasSeated&&mode!=='vr'&&session)void session.end().catch(()=>{});
    placeTeacher(mode==='vr');teacher.setClassroomMode(mode==='classroom'||mode==='vr');
    moleculeStage.group.visible=mode!=='home'&&molecularState.ids.length>0;
    container.tabIndex=mode==='vr'||molecularState.ids.length>0&&mode==='classroom'?0:-1;container.setAttribute('role',container.tabIndex===0?'region':'img');
    pose();
    // Enter/leave directly at the seat, never fly through the desk or glass.
    if(wasSeated||mode==='vr')snapView();
  }
  function setBoard(title,subtitle){boardLesson=null;boardTitle=title;boardSubtitle=subtitle;drawBoard();}
  function setLesson(notes){boardLesson={title:notes.title,points:notes.points.slice(0,3)};drawBoard();}
  function setMolecularScene(next={}){
    const starting=molecularState.ids.length===0;
    const ids=moleculeStage.setModels(next.ids||[],{dipole:next.dipole===true});
    molecularState={ids,dipole:next.dipole===true};
    moleculeStage.group.visible=mode!=='home'&&ids.length>0;
    moleculeDragging=false;
    if(starting&&ids.length&&mode==='classroom'){zoom=1;dragX=dragY=0;}
    container.tabIndex=mode==='vr'||ids.length>0&&mode==='classroom'?0:-1;
    container.setAttribute('role',container.tabIndex===0?'region':'img');
    pose();
  }
  renderer.setAnimationLoop((time,xrFrame)=>{
    // Render capped at 40fps outside XR; pause animation work while the tab is hidden.
    if(document.hidden&&!renderer.xr.isPresenting)return;
    if(!renderer.xr.isPresenting && time-frameTime<25)return;frameTime=time;
    const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
    const referenceSpace=xrFrame&&renderer.xr.isPresenting?renderer.xr.getReferenceSpace():null;
    if(referenceSpace&&xrSeatPending){
      const viewer=xrFrame.getViewerPose(referenceSpace);
      if(viewer){
        const orientation=viewer.transform.orientation,position=viewer.transform.position;
        xrForward.set(0,0,-1).applyQuaternion(new THREE.Quaternion(orientation.x,orientation.y,orientation.z,orientation.w));
        const heading=Math.atan2(xrForward.x,-xrForward.z);
        rig.rotation.set(0,heading-seatBaseYaw,0);
        xrHeadPosition.set(position.x,position.y,position.z).applyQuaternion(rig.quaternion);
        rig.position.copy(seatPosition).sub(xrHeadPosition);rig.updateMatrixWorld(true);xrSeatPending=false;
      }
    }
    teacherTime+=dt;
    if(hovered&&!moving&&teacherTime-hoverStarted>.65&&teacherTime-lastLook>7){
      teacher.react('look',pointerX*2);lastLook=teacherTime;hoverStarted=Infinity;
    }
    teacher.update(dt,{reducedMotion:reduceMotion.matches,xr:mode==='vr'||renderer.xr.isPresenting,time:time/1000});
    moleculeStage.update(reduceMotion.matches?0:time/1000,dt);
    spaceSky.update(reduceMotion.matches||renderer.xr.isPresenting?0:dt);
    if(!renderer.xr.isPresenting){
      const smoothing=reduceMotion.matches?1:1-Math.exp(-dt*(mode==='vr'?9:4));
      if(mode==='vr'){
        seatYaw+=Math.atan2(Math.sin(desiredSeatYaw-seatYaw),Math.cos(desiredSeatYaw-seatYaw))*smoothing;
        seatPitch=THREE.MathUtils.lerp(seatPitch,desiredSeatPitch,smoothing);
        camera.position.copy(seatPosition);camera.lookAt(seatLook(seatYaw,seatPitch,seatDirection));
        room.position.y=0;
      }else{
        camera.position.lerp(desiredPosition,smoothing);target.lerp(desiredTarget,smoothing);
        const look=target.clone();if(!reduceMotion.matches&&!moving){look.x+=pointerX*.18;look.y-=pointerY*.12;}camera.lookAt(look);
        room.position.y=reduceMotion.matches?0:Math.sin(time*.00035)*.045;
      }
    }else room.position.y=0;
    if(mode==='vr')studentBody.update(time/1000,{
      frame:xrSeatPending?null:xrFrame,referenceSpace,rig,dt,
    });
    if(referenceSpace&&!xrSeatPending)xrAvatarMenu?.update(xrFrame,referenceSpace);
    renderer.render(scene,camera);
  });
  async function immersiveSupported(){if(!isSecureContext||!navigator.xr)return false;try{return await navigator.xr.isSessionSupported('immersive-vr');}catch{return false;}}
  async function enterImmersive(){
    if(session||openingXR||mode!=='vr')return;
    if(!isSecureContext||!navigator.xr)throw new Error('此浏览器或设备不支持沉浸式头显。');
    openingXR=true;
    try{
      // Request from the button gesture. The seated calibration does not need
      // a physical floor-level origin to preserve the headset's relative pose.
      const active=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['hand-tracking']});
      if(mode!=='vr'){await active.end();return;}
      session=active;
      xrSeatPending=true;
      studentBody.setVisible(true,{tracked:true});
      let referenceSpace=null;
      const resetSeat=()=>{xrSeatPending=true;studentBody.resetInput();};
      function restoreSeat(){
        referenceSpace?.removeEventListener('reset',resetSeat);
        xrAvatarMenu?.attach(null);
        xrSeatPending=false;studentBody.setVisible(mode==='vr');studentBody.resetInput();
        rig.position.set(0,0,0);rig.rotation.set(0,0,0);pose();
        camera.fov=mode==='vr'?(container.clientWidth<650?78:66):42;
        camera.updateProjectionMatrix();snapView();
      }
      active.addEventListener('end',()=>{
        if(session!==active)return;
        session=null;restoreSeat();onState('xr-end');
      },{once:true});
      try{await renderer.xr.setSession(active);}
      catch(error){
        if(session===active){session=null;restoreSeat();}
        await active.end().catch(()=>{});
        throw error;
      }
      if(session!==active)return;
      referenceSpace=renderer.xr.getReferenceSpace();
      referenceSpace?.addEventListener('reset',resetSeat);
      xrAvatarMenu??=createXRAvatarMenu(scene,rig,()=>renderer.xr.getReferenceSpace(),
        ()=>avatarPreference.current,avatar=>avatarPreference.select(avatar),
        {unlocked:()=>avatarPreference.unlocked,language:'zh'});
      xrAvatarMenu.attach(active,{position:seatPosition.toArray(),yaw:-seatBaseYaw});
      onState('xr-start');
    }finally{
      openingXR=false;
    }
  }
  onState('ready');
  teacher.load();
  return {setMode,setBoard,setLesson,setMolecularScene,resize,greetTeacher:()=>teacher.react('tap'),setTeacherSpeech:event=>teacher.setSpeech(event),setTeacherLearningState:state=>teacher.setLearningState(state),immersiveSupported,enterImmersive,async endImmersive(){if(session)await session.end();}};
}
