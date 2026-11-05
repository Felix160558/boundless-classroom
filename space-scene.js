import * as THREE from './three.module.min.js';
import {createCatTeacher} from './cat-teacher.js?v=refined-cat-22';

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
  const seatPosition=new THREE.Vector3(.8,1.38,2.06);
  const seatDirection=new THREE.Vector3(),xrHeadPosition=new THREE.Vector3(),xrForward=new THREE.Vector3();
  let seatBaseYaw=-.245,seatYaw=-.245,seatPitch=.065,desiredSeatYaw=-.245,desiredSeatPitch=.065,xrSeatPending=false;
  const room=new THREE.Group();scene.add(room);
  let mode='home',zoom=1,dragX=0,dragY=0,pointerX=0,pointerY=0;
  let moving=false,lastX=0,lastY=0,lastTime=0,frameTime=0,session=null;
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
  // A closed panoramic ribbon carries the same soft dust through the whole sky.
  // Its curved tails meet behind the classroom, without a visible start or finish.
  const nebula=new THREE.Group();nebula.position.set(-58,-35,-95);nebula.rotation.set(0,.59,-.30);scene.add(nebula);
  const compact=container.clientWidth<650,ribbonLayers=[],ribbonRadius=130;
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
      const u=x/(c.width-1),v=y/(c.height-1)*2-1,angle=u*TAU;
      // Sampling noise around a circle makes both texture edges agree in value
      // and slope, so the longer band has no repeated-card seam or end fade.
      const flow=fbm(Math.cos(angle)*2.4+v*.6+9,Math.sin(angle)*2.4+v*2.2+2.8);
      const filament=fbm(Math.cos(angle)*8.9+v*3+3,Math.sin(angle)*8.9+v*10+11);
      const bend=(flow-.46)*1.15+Math.sin(angle*2)*.10;
      const d=v-bend,width=.24+.18*flow;
      const core=Math.exp(-d*d/(width*width));
      const veil=Math.exp(-d*d/.22)*(.24+.62*filament);
      const folds=Math.pow(Math.max(.05,filament),1.4);
      const edge=Math.pow(Math.max(0,1-v*v),1.25);
      const alpha=Math.min(1,(core*(.06+folds*1.9)+veil*.36)*edge);
      const i=(y*c.width+x)*4;
      data[i]=187+filament*32;data[i+1]=199+filament*29;data[i+2]=216+filament*23;data[i+3]=Math.round(alpha*220);
    }
    ctx.putImageData(pixels,0,0);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
  }
  const veilMap=makeVeilTexture();
  function spine(angle){return Math.sin(angle*3+.3)*10.5+Math.sin(angle*6)*2.2;}
  function ribbonPosition(angle,height=0,depth=0){
    const radius=ribbonRadius-depth;
    return [Math.sin(angle)*radius,spine(angle)+height,ribbonRadius-Math.cos(angle)*radius+Math.sin(angle*2)*9];
  }
  const layerSettings=[[-10,24,.11,-3.6],[-4,15,.19,1.5],[1,8,.25,0],[7,17,.16,3],[14,27,.10,-1.2]];
  for(let layer=0;layer<layerSettings.length;layer++){
    const [depth,width,opacity,offset]=layerSettings[layer],vertices=[],uvs=[],indices=[];
    const nx=320,ny=18;
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const angle=(i/nx-.5)*TAU,v=j/ny*2-1;
      const breathing=1+.12*Math.sin(angle*4+layer);
      vertices.push(...ribbonPosition(angle,offset+Math.sin(angle*7+layer*2)*(layer-2)*.65+v*width*breathing,depth+v*v*3.5+Math.sin(angle*4+layer)*1.4));
      uvs.push(i/nx,j/ny);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*(nx+1)+i;indices.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
    const material=new THREE.MeshBasicMaterial({map:veilMap,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    const veil=new THREE.Mesh(geometry,material);veil.frustumCulled=false;nebula.add(veil);ribbonLayers.push({mesh:veil,opacity,phase:layer*.9});
  }
  // Roughly twice the former length; keep fine-grain density along the extension.
  const dust=particleData(),count=compact?48000:84000;
  for(let i=0;i<count;i++){
    const angle=(random()-.5)*TAU;
    const spread=3.5+4.5*(.5+.5*Math.sin(angle*3+1));
    const [x,y,z]=ribbonPosition(angle,gaussian()*spread,gaussian()*8.5),bright=random();
    pushParticle(dust,x,y,z,.24+Math.pow(bright,5)*.85,.18+random()*.28,.58+random()*.37);
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
    sprite.position.set(...ribbonPosition(x/ribbonRadius,0,8));sprite.scale.set(scale,scale,scale);nebula.add(sprite);glints.push(sprite);
  }
  const near=particleData();
  for(let i=0;i<150;i++){
    const a=random()*TAU,r=72+random()*45;
    pushParticle(near,Math.cos(a)*r,(random()-.5)*180,Math.sin(a)*r,.32+random()*.65,.30+random()*.44,.80+random()*.18);
  }
  scene.add(particleField(near,1));

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
    }else{
      desiredPosition.set(8.1,5.7,12.3).multiplyScalar(zoom);desiredTarget.set(0,1.35,0);
    }
    desiredPosition.applyAxisAngle(new THREE.Vector3(0,1,0),dragX);desiredPosition.y+=dragY;
  }
  function snapView(){
    camera.position.copy(desiredPosition);target.copy(desiredTarget);
    seatYaw=desiredSeatYaw;seatPitch=desiredSeatPitch;camera.lookAt(target);
  }
  function resize(){const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);pointScale.value=h*renderer.getPixelRatio()*.5;camera.aspect=w/h;camera.updateProjectionMatrix();pose();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();snapView();

  let previousPinch=0,tapCandidate=null,hovered=false,hoverStarted=0,lastLook=-10,teacherTime=0;
  const touches=new Map(),teacherRay=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
  const canvas=renderer.domElement;
  function hitsTeacher(e,precise=false){
    const rect=canvas.getBoundingClientRect();
    pointerNdc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    camera.updateMatrixWorld();teacherRay.setFromCamera(pointerNdc,camera);
    return teacher.hitTest(teacherRay,precise);
  }
  function pointerDown(e){
    tapCandidate=touches.size===0?{id:e.pointerId,x:e.clientX,y:e.clientY,cancelled:false}:null;
    hovered=false;
    moving=true;lastX=e.clientX;lastY=e.clientY;
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
    if(touches.size===2){const p=[...touches.values()];previousPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  }
  function pointerMove(e){
    const rect=canvas.getBoundingClientRect();pointerX=(e.clientX-rect.left)/rect.width-.5;pointerY=(e.clientY-rect.top)/rect.height-.5;
    if(!moving){
      const over=e.pointerType!=='touch'&&hitsTeacher(e);
      if(over&&!hovered)hoverStarted=teacherTime;hovered=over;
      canvas.style.cursor=over?'pointer':'grab';return;
    }
    if(tapCandidate&&Math.hypot(e.clientX-tapCandidate.x,e.clientY-tapCandidate.y)>8)tapCandidate.cancelled=true;
    if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size===2){
      const p=[...touches.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
      if(mode!=='vr'&&previousPinch>0)zoom=THREE.MathUtils.clamp(zoom*previousPinch/Math.max(1,distance),.6,1.65);previousPinch=distance;
    }else if(mode==='vr'){
      const yaw=dragX-(e.clientX-lastX)*.003;
      dragX=Math.atan2(Math.sin(yaw),Math.cos(yaw));
      dragY=THREE.MathUtils.clamp(dragY+(e.clientY-lastY)*.003,-1.315,1.185);
    }else{dragX=THREE.MathUtils.clamp(dragX-(e.clientX-lastX)*.003,-1.05,1.05);dragY=THREE.MathUtils.clamp(dragY+(e.clientY-lastY)*.008,-2,5);}
    lastX=e.clientX;lastY=e.clientY;pose();
  }
  function pointerUp(e){
    const tap=e.type==='pointerup'&&tapCandidate?.id===e.pointerId&&!tapCandidate.cancelled&&touches.size===1;
    touches.delete(e.pointerId);moving=touches.size>0;previousPinch=0;tapCandidate=null;
    if(moving){const remaining=touches.values().next().value;lastX=remaining.x;lastY=remaining.y;}
    if(tap&&hitsTeacher(e,true))teacher.react('tap');
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
    placeTeacher(mode==='vr');teacher.setClassroomMode(mode==='classroom'||mode==='vr');
    container.tabIndex=mode==='vr'?0:-1;container.setAttribute('role',mode==='vr'?'region':'img');
    pose();
    // Enter/leave directly at the seat, never fly through the desk or glass.
    if(wasSeated||mode==='vr')snapView();
  }
  function setBoard(title,subtitle){boardLesson=null;boardTitle=title;boardSubtitle=subtitle;drawBoard();}
  function setLesson(notes){boardLesson={title:notes.title,points:notes.points.slice(0,3)};drawBoard();}
  renderer.setAnimationLoop((time,xrFrame)=>{
    // Render capped at 40fps outside XR; pause animation work while the tab is hidden.
    if(document.hidden&&!renderer.xr.isPresenting)return;
    if(!renderer.xr.isPresenting && time-frameTime<25)return;frameTime=time;
    const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;
    if(renderer.xr.isPresenting&&xrSeatPending&&xrFrame){
      const viewer=xrFrame.getViewerPose(renderer.xr.getReferenceSpace());
      if(viewer){
        const orientation=viewer.transform.orientation,position=viewer.transform.position;
        xrForward.set(0,0,-1).applyQuaternion(new THREE.Quaternion(orientation.x,orientation.y,orientation.z,orientation.w));
        const heading=Math.atan2(xrForward.x,-xrForward.z);
        rig.rotation.set(0,heading+.245,0);
        xrHeadPosition.set(position.x,position.y,position.z).applyQuaternion(rig.quaternion);
        rig.position.copy(seatPosition).sub(xrHeadPosition);rig.updateMatrixWorld(true);xrSeatPending=false;
      }
    }
    teacherTime+=dt;
    if(hovered&&!moving&&teacherTime-hoverStarted>.65&&teacherTime-lastLook>7){
      teacher.react('look',pointerX*2);lastLook=teacherTime;hoverStarted=Infinity;
    }
    teacher.update(dt,{reducedMotion:reduceMotion.matches,xr:renderer.xr.isPresenting,time:time/1000});
    if(!reduceMotion.matches&&!renderer.xr.isPresenting)skyTime.value+=dt;
    for(const layer of ribbonLayers){layer.mesh.position.y=Math.sin(skyTime.value*.06+layer.phase)*.65;layer.mesh.material.opacity=layer.opacity*(.95+.05*Math.sin(skyTime.value*.09+layer.phase));}
    glints.forEach((glint,i)=>{glint.material.opacity=.49+.10*Math.sin(skyTime.value*.42+i*2);});
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
    renderer.render(scene,camera);
  });
  async function immersiveSupported(){if(!isSecureContext||!navigator.xr)return false;try{return await navigator.xr.isSessionSupported('immersive-vr');}catch{return false;}}
  async function enterImmersive(){
    if(!(await immersiveSupported()))throw new Error('此浏览器或设备不支持沉浸式头显。');
    const active=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor']});session=active;
    renderer.xr.setReferenceSpaceType('local-floor');xrSeatPending=true;
    // The first tracked frame aligns the seat; keep the desktop camera still while XR starts.
    function restoreSeat(){
      xrSeatPending=false;rig.position.set(0,0,0);rig.rotation.set(0,0,0);pose();
      camera.fov=mode==='vr'?(container.clientWidth<650?78:66):42;camera.updateProjectionMatrix();snapView();
    }
    active.addEventListener('end',()=>{if(session!==active)return;session=null;restoreSeat();onState('xr-end');},{once:true});
    try{await renderer.xr.setSession(active);}catch(error){await active.end();session=null;restoreSeat();throw error;}
    if(session!==active)return;
    onState('xr-start');
  }
  onState('ready');
  teacher.load();
  return {setMode,setBoard,setLesson,resize,greetTeacher:()=>teacher.react('tap'),immersiveSupported,enterImmersive,async endImmersive(){if(session)await session.end();}};
}
