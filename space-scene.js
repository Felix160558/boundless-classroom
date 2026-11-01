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
    // A compact golden cat: broad cheeks, small rounded ears and grounded paws.
    const cat=new THREE.Group();cat.position.set(-2.45,.1,-1.2);room.add(cat);
    const fur=new THREE.MeshStandardMaterial({color:0xd5a15f,roughness:.94});
    const lightFur=new THREE.MeshStandardMaterial({color:0xe8be80,roughness:.96});
    const cream=new THREE.MeshStandardMaterial({color:0xf2dfb8,roughness:.98});
    const pink=new THREE.MeshStandardMaterial({color:0xd8a499,roughness:.87});
    const noseMat=new THREE.MeshStandardMaterial({color:0xb8877c,roughness:.65});
    const eyeRim=new THREE.MeshStandardMaterial({color:0x69533b,roughness:.7});
    const iris=new THREE.MeshPhysicalMaterial({color:0x9ea77a,roughness:.3,clearcoat:.4});
    const pupil=new THREE.MeshPhysicalMaterial({color:0x101713,roughness:.13,clearcoat:1});
    const shine=new THREE.MeshBasicMaterial({color:0xfff8e8});
    // Vertex color blends the pale chin into the golden head without a separate face plate.
    const headGeo=new THREE.SphereGeometry(.61,48,36),headColors=[];
    const gold=new THREE.Color(0xd5a15f),pale=new THREE.Color(0xf1ddb7);
    const hp=headGeo.attributes.position;
    for(let i=0;i<hp.count;i++){
      const y=hp.getY(i),z=hp.getZ(i);
      const chin=THREE.MathUtils.smoothstep(-y,-.02,.36)*THREE.MathUtils.smoothstep(z,-.15,.32);
      const col=gold.clone().lerp(pale,chin*.88);headColors.push(col.r,col.g,col.b);
    }
    headGeo.setAttribute('color',new THREE.Float32BufferAttribute(headColors,3));
    const headMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93});
    sphere(.57,fur,0,.58,-.13,cat,[1.04,1.1,.94]);
    sphere(.40,lightFur,0,.72,.21,cat,[1.05,1.05,.67]);
    sphere(.32,cream,0,.67,.39,cat,[.92,1.05,.28]);
    for(const side of [-1,1]){
      sphere(.32,fur,side*.39,.31,-.16,cat,[1.0,.88,1.23]);
      sphere(.19,lightFur,side*.26,.36,.37,cat,[.91,1.3,.94]);
      sphere(.22,lightFur,side*.26,.15,.53,cat,[1.02,.64,1.25]);
      // Short toe creases, rather than separate bead-like toes.
      for(const offset of [-.065,.065]){
        const toe= new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side*.26+offset,.175,.75),new THREE.Vector3(side*.26+offset,.205,.68)
        ]),new THREE.LineBasicMaterial({color:0xb58c59,transparent:true,opacity:.35}));cat.add(toe);
      }
    }
    const head=new THREE.Group();head.position.set(0,1.18,.06);head.rotation.z=.035;cat.add(head);
    const headMesh=mesh(headGeo,headMat,head);headMesh.scale.set(1.12,.94,.92);
    // Small soft triangular ears with rounded edges and a recessed inner ear.
    function earShape(w,h){
      const shape=new THREE.Shape();shape.moveTo(-w/2,0);
      shape.bezierCurveTo(-w*.52,h*.18,-w*.34,h*.82,-w*.12,h*.98);
      shape.bezierCurveTo(0,h*1.07,w*.12,h*.98,w*.23,h*.76);
      shape.bezierCurveTo(w*.43,h*.42,w*.56,h*.10,w/2,0);
      shape.quadraticCurveTo(0,-h*.12,-w/2,0);return shape;
    }
    for(const side of [-1,1]){
      const ear=new THREE.Group();ear.position.set(side*.43,.43,-.06);ear.rotation.z=-side*.20;head.add(ear);
      const outer=new THREE.ExtrudeGeometry(earShape(.33,.30),{depth:.075,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:.035,bevelThickness:.035,curveSegments:12});
      mesh(outer,fur,ear,0,0,0);
      const inner=new THREE.ShapeGeometry(earShape(.20,.20),20);
      mesh(inner,pink,ear,0,.032,.115);
      const eye=new THREE.Group();eye.position.set(side*.245,.055,.492);eye.rotation.y=side*.31;head.add(eye);
      sphere(.143,eyeRim,0,0,0,eye,[1,.90,.22]);
      sphere(.128,iris,0,.001,.022,eye,[1,.88,.20]);
      sphere(.096,pupil,0,.002,.043,eye,[.86,1,.24]);
      sphere(.027,shine,-.025,.038,.068,eye,[1,1,.28]);
      sphere(.010,shine,.032,-.034,.066,eye,[1,1,.25]);
      sphere(.215,lightFur,side*.27,-.17,.394,head,[1.16,.92,.52]);
      sphere(.132,cream,side*.106,-.225,.501,head,[1.1,.72,.45]);
      for(let j=0;j<3;j++){
        const y=-.21+j*.045;
        const pts=[[side*.22,y,.49],[side*.43,y+.015*(j-1),.51],[side*.66,y+.05*(j-1),.48]];
        const whisker=new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v))).getPoints(10)),new THREE.LineBasicMaterial({color:0xf1e2c6,transparent:true,opacity:.65}));head.add(whisker);
      }
    }
    sphere(.047,noseMat,0,-.19,.566,head,[1.08,.63,.48]);
    const mouthMat=new THREE.LineBasicMaterial({color:0x97765e,transparent:true,opacity:.7});
    for(const side of [-1,1]){
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,-.221,.555),new THREE.Vector3(side*.03,-.268,.55),new THREE.Vector3(side*.078,-.251,.54));
      head.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(12)),mouthMat));
    }
    tube([[.39,.24,-.30],[.68,.19,-.34],[.79,.17,-.05],[.67,.16,.20],[.48,.16,.22]],.12,fur,cat);
    cat.rotation.y=.28;return cat;
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
          gl_PointSize=clamp(aSize*uPointScale/max(1.,-viewPosition.z),1.0,uSoft>.5?180.:22.);
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
          float core=exp(-radius*radius*(uSoft>.5?2.8:5.5));
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
    pushParticle(distant,r*Math.sqrt(1-u*u)*Math.cos(a),u*180,r*Math.sqrt(1-u*u)*Math.sin(a),.25+random()*.55,.45+random()*.55,.57+random()*.4);
  }
  scene.add(particleField(distant,1));
  const nebula=new THREE.Group();nebula.position.set(-58,-30,-95);nebula.rotation.set(0,.59,-.42);scene.add(nebula);
  const dust=particleData(),haze=particleData();
  const compact=container.clientWidth<650;
  const count=compact?36000:65000;
  for(let i=0;i<count;i++){
    const u=random()*2-1,x=u*180,branch=random()<.65?0:1;
    const spine=Math.sin(u*3.1+.4)*14+Math.sin(u*8.2)*3.5;
    const separation=branch?17+Math.sin(u*4.5)*8:-8;
    const thickness=3+7*(.5+.5*Math.sin(u*4.4+1.6));
    const y=spine+separation+gaussian()*thickness;
    const z=Math.sin(u*3.4)*18+gaussian()*(branch?10:17);
    const edge=Math.pow(Math.max(0,1-u*u),.45);
    const bright=random();
    pushParticle(dust,x,y,z,.28+Math.pow(bright,3)*.95,(.20+random()*.35)*edge,.43+random()*.40);
  }
  for(let i=0;i<(compact?900:1600);i++){
    const u=random()*2-1,x=u*180;
    const y=Math.sin(u*3.1+.4)*14-6+gaussian()*14,z=Math.sin(u*3.4)*18+gaussian()*20;
    pushParticle(haze,x,y,z,18+random()*30,.055*Math.pow(Math.max(0,1-u*u),.7),.35);
  }
  nebula.add(particleField(haze,0,true));nebula.add(particleField(dust));
  // Sparse nearer points give depth through larger, softer glints and a different drift speed.
  const near=particleData();
  for(let i=0;i<260;i++){
    const a=random()*TAU,r=64+random()*35;
    pushParticle(near,Math.cos(a)*r,(random()-.5)*180,Math.sin(a)*r,.40+random()*.95,.42+random()*.48,.75+random()*.23);
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
