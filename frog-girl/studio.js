import * as THREE from '../three.module.min.js';

const rad=THREE.MathUtils.degToRad;
const clamp=THREE.MathUtils.clamp;

// Neutral studio reflections for clear eyes, damp cloth and drops. The sun
// itself is a scene light so its cast shadow and highlight can travel together.
function studioReflections(renderer){
  const w=256,h=128,data=new Uint16Array(w*h*4);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const a=(i+.5)/w*2*Math.PI-Math.PI,e=(j+.5)/h*Math.PI-Math.PI/2;
    const x=Math.cos(a)*Math.cos(e),y=Math.sin(e),z=Math.sin(a)*Math.cos(e);
    const sky=.18+.34*Math.max(y,0), horizon=.10*Math.exp(-y*y*8);
    const window=(Math.exp(-((x+.67)**2/.042+(y-.43)**2/.15+(z-.57)**2/.13))+
      .5*Math.exp(-((x-.78)**2/.09+(y-.29)**2/.22+(z+.45)**2/.055)))*2.6;
    const idx=4*(j*w+i);
    for(const [k,value] of [sky+horizon+window,sky*1.055+horizon+window*1.02,sky*1.09+horizon+window*1.04,1].entries()){
      data[idx+k]=THREE.DataUtils.toHalfFloat(value);
    }
  }
  const map=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.HalfFloatType);
  map.mapping=THREE.EquirectangularReflectionMapping;map.needsUpdate=true;
  const baker=new THREE.PMREMGenerator(renderer),environment=baker.fromEquirectangular(map);
  map.dispose();baker.dispose();return environment;
}

export async function openStudio(){
  const canvas=document.querySelector('#portrait'),stage=document.querySelector('#stage');
  const params=new URLSearchParams(location.search),model=params.get('model');
  const requestedFinish=params.get('finish');
  const original=model!=='study';
  const animateAvatar=original&&params.get('avatar')==='1';
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
  const finishMode=!animateAvatar&&requestedFinish==='original'?'original':'repaired';
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=original?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.025,600);
  const reflections=studioReflections(renderer);scene.environment=reflections.texture;
  let imported=null,face=null,leaf=null,classroom=null,avatarMotion=null,createChair=null;
  let idle=null,seating=null;
  if(original){
    const [character,display,motion,chair]=await Promise.all([
      import('./frog-character.js?v=frog-hair-73'),import('./classroom-preview.js').catch(error=>{
        console.warn('Classroom background unavailable.',error);
        return null;
      }),animateAvatar?import('./frog-motion.js?v=frog-leaf-70').catch(error=>{
        console.warn('Avatar motion unavailable.',error);
        return null;
      }):null,animateAvatar?import('../live/classroom-chair.js?v=student-avatar-49').catch(error=>{
        console.warn('Preview chair unavailable.',error);
        return null;
      }):null
    ]);
    const status=document.querySelector('#status');
    imported=await character.loadFrogCharacter({
      brow:finishMode==='repaired'?(params.get('brow')||'clean'):'before',
      onProgress:message=>{status.textContent=message;}
    });
    scene.add(imported.group);
    if(display)classroom=display.createClassroomPreview(scene,camera);
    avatarMotion=motion;
    createChair=chair?.createClassroomChair;
  }else{
    const [{createFace},{createHairHood},{createBust},{createLotus}]=await Promise.all([
      import('./face.js'),import('./hair-hood.js'),import('./bust.js'),import('./lotus.js')
    ]);
    face=createFace();leaf=createLotus();scene.add(createBust(),createHairHood(),face.group,leaf.group);
  }
  const sky=new THREE.HemisphereLight(0xf6f9ff,original?0xe4d7cd:0xc2d4ae,original ? .87 : 1.05);
  const fill=new THREE.DirectionalLight(0xe5f3ff,.44);fill.position.set(1.8,1.5,3.2);fill.target.position.y=1;
  const leafBounce=new THREE.SpotLight(0xe5edbc,0,2.2,1.02,.93,2);
  leafBounce.position.set(-.32,1.94,.16);leafBounce.target.position.set(.04,1.15,.14);
  const bladeNormal=new THREE.Vector3(-.22,1,-.36).normalize();
  const sun=new THREE.DirectionalLight(original?0xfff7ef:0xffecd1,original?1.65:2.36);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  if(original)sun.shadow.radius=2.8;
  Object.assign(sun.shadow.camera,{left:-1.62,right:1.62,top:1.63,bottom:-1.63,near:.3,far:9});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.0017;sun.shadow.bias=-.00012;
  sun.target.position.set(-.18,1.14,0);
  scene.add(sky,fill,fill.target,leafBounce,leafBounce.target,sun,sun.target);
  // A low glazed oval finishes the cut of the study, without enclosing it.
  const footProfile=[[.001,-.008],[.438,-.008],[.452,-.004],[.463,.003],[.466,.013],[.464,.021],[.457,.030],[.445,.034],[.001,.034]];
  const foot=new THREE.Mesh(new THREE.LatheGeometry(footProfile.map(([x,y])=>new THREE.Vector2(x,y)),120),
    new THREE.MeshStandardMaterial({color:0x839c8a,roughness:.53,metalness:.08}));
  foot.scale.z=.74;foot.castShadow=true;foot.receiveShadow=true;if(!original)scene.add(foot);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.ShadowMaterial({opacity:.13}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.009;ground.receiveShadow=true;scene.add(ground);

  const keyDir=new THREE.Vector3(),target=new THREE.Vector3(),goalTarget=new THREE.Vector3();
  const controls={theta:.61,phi:.072,zoom:1,face:false};
  const movingView={theta:controls.theta,phi:controls.phi,distance:0};
  const light=document.querySelector('#light'),label=document.querySelector('#light-label');
  const sweepButton=document.querySelector('#light-sweep');
  const classroomButton=document.querySelector('#toggle-classroom');
  const sitButton=document.querySelector('#toggle-seat');
  const openingLight=original&&params.get('light')==='back'?145:-35;
  light.value=openingLight;
  const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const poseFrameInterval=1000/30-1;
  let distance=3.8,frame=0,lastFrame=0,viewWidth=0,viewHeight=0,inClassroom=false;
  let requestedDraw=false,idleLast=null,idleElapsed=0,idleStill=false;
  let seatProgress=0,seatTarget=0,seatTween=null;
  let sweepPlaying=false,sweepElapsed=0,sweepLast=null;
  function stopSweep(reset=true){
    sweepPlaying=false;sweepLast=null;
    if(reset)sweepElapsed=0;
    sweepButton.textContent=reset?'移灯':'继续';
    sweepButton.setAttribute('aria-label',reset?'播放侧前光到叶后逆光的镜头':'继续移灯');
    sweepButton.title=reset?'播放移灯镜头':'继续移灯';
  }
  function startSweep(){
    sweepPlaying=true;sweepLast=null;sweepButton.textContent='暂停';
    sweepButton.setAttribute('aria-label','暂停移灯');sweepButton.title='暂停移灯';
    requestDraw();
  }
  function applyLight(redraw=true){
    const deg=Number(light.value),a=rad(deg);
    const height=original ? .74+.10*Math.sin(a) : .95+.16*Math.sin(a);
    keyDir.set(Math.sin(a),height,Math.cos(a)).normalize();
    if(imported){
      sun.target.position.copy(imported.group.position);
      sun.target.position.y+=.92;
    }
    sun.position.copy(sun.target.position).addScaledVector(keyDir,4.8);
    // Only a soft fraction of the light on the leaf reaches the portrait below.
    leafBounce.intensity=original?0:.095*Math.max(0,keyDir.dot(bladeNormal));
    const exposure=clamp(.25+.61*Math.max(0,keyDir.z)+.11*keyDir.y,.15,1);
    face?.setLight(keyDir,exposure);leaf?.setLight(keyDir,1.22);
    imported?.finish?.setLight(keyDir,sun.intensity);
    label.value=Math.abs(deg)>110?(original?'逆光':'透叶逆光'):Math.abs(deg)>56?'侧光':Math.abs(deg)<17?'正面光':'侧前光';
    light.setAttribute('aria-valuetext',label.value+' '+deg+'°');
    renderer.shadowMap.needsUpdate=true;if(redraw)requestDraw();
  }
  function fit(){
    const w=stage.clientWidth,h=stage.clientHeight;
    if(!w||!h)return;
    const pixelRatio=Math.min(window.devicePixelRatio||1,3,Math.sqrt(5_800_000/(w*h)));
    if(viewWidth!==w||viewHeight!==h||pixelRatio!==renderer.getPixelRatio()){
      viewWidth=w;viewHeight=h;
      renderer.setDrawingBufferSize(w,h,pixelRatio);camera.aspect=w/h;camera.updateProjectionMatrix();
      classroom?.sky.resize(h,pixelRatio);
    }
    const halfHeight=controls.face?.45:1.44,halfWidth=controls.face?.43:1.30;
    distance=Math.max(halfHeight,halfWidth/camera.aspect)/Math.tan(rad(camera.fov*.5))*controls.zoom;
    goalTarget.set(controls.face?0:-.31,controls.face?1.34:1.24,controls.face?.135:.02);
    if(imported){
      const subject=imported.fitData();
      goalTarget.copy(controls.face?subject.faceCenter:subject.center);
      const span=controls.face?Math.max(.28,.34/camera.aspect):Math.max(subject.halfHeight,subject.halfWidth/camera.aspect)*1.07;
      distance=(span/Math.tan(rad(camera.fov*.5))+(controls.face?.16:subject.depthMargin*.46))*controls.zoom;
    }
    requestDraw();
  }
  function setSeatProgress(progress){
    seatProgress=progress;
    seating.set(progress);
    renderer.shadowMap.needsUpdate=true;
  }
  function toggleSeat(){
    seatTarget=1-seatTarget;
    sitButton.textContent=seatTarget?'站起':'坐下';
    if(motionPreference.matches){
      seatTween=null;
      setSeatProgress(seatTarget);
    }else{
      const duration=Math.max(220,1000*avatarMotion.FROG_SEAT_DURATION*Math.abs(seatTarget-seatProgress));
      seatTween={from:seatProgress,duration,elapsed:0,last:null};
    }
    requestDraw();
  }
  function advanceSeat(time){
    const tween=seatTween;
    if(tween.last!==null)tween.elapsed+=Math.min(time-tween.last,125);
    tween.last=time;
    const progress=clamp(tween.elapsed/tween.duration,0,1);
    setSeatProgress(THREE.MathUtils.lerp(tween.from,seatTarget,progress));
    if(progress===1)seatTween=null;
  }
  function draw(time){
    frame=0;
    const animate=Boolean(idle&&!motionPreference.matches);
    // Sample the unobtrusive idle at about 30 Hz without limiting the
    // camera and light controls to that rate while they are in use.
    const idleDue=animate&&(idleLast===null||time-idleLast>=poseFrameInterval);
    const seatDue=seatTween&&(animate?idleDue:seatTween.last===null||time-seatTween.last>=poseFrameInterval);
    if(!requestedDraw&&!idleDue&&!seatDue){
      if(animate||seatTween)scheduleFrame();
      return;
    }
    requestedDraw=false;
    if(seatDue)advanceSeat(time);
    if(idleDue){
      if(idleLast!==null)idleElapsed+=Math.min((time-idleLast)/1000,.125);
      idleLast=time;
      idleStill=false;
      idle.update(idleElapsed);
      renderer.shadowMap.needsUpdate=true;
    }else if(idle&&!animate&&!idleStill){
      idle.update(idleElapsed,{still:true});
      idleStill=true;
      renderer.shadowMap.needsUpdate=true;
    }
    if(sweepPlaying){
      // A cold shader compile or a background tab should not skip the shot.
      if(sweepLast!==null)sweepElapsed+=Math.min(time-sweepLast,125);
      sweepLast=time;
      const progress=clamp(sweepElapsed/7600,0,1);
      const ease=progress*progress*(3-2*progress);
      light.value=-35-110*ease;
      applyLight(false);
      if(progress>=1)stopSweep();
    }
    const dt=Math.min((time-lastFrame)/1000,.05);lastFrame=time;
    if(inClassroom)classroom.sky.update(dt);
    const t=motionPreference.matches?1:1-Math.exp(-dt*18);
    movingView.theta+=(controls.theta-movingView.theta)*t;movingView.phi+=(controls.phi-movingView.phi)*t;
    movingView.distance+=(distance-movingView.distance)*t;target.lerp(goalTarget,t);
    const d=movingView.distance,theta=movingView.theta,phi=movingView.phi;
    camera.position.set(d*Math.sin(theta)*Math.cos(phi),d*Math.sin(phi),d*Math.cos(theta)*Math.cos(phi)).add(target);
    camera.lookAt(target);imported?.finish?.prepareView(renderer,camera);renderer.render(scene,camera);
    if(sweepPlaying||Math.abs(controls.theta-theta)+Math.abs(controls.phi-phi)+Math.abs(d-distance)+target.distanceTo(goalTarget)>.0002)requestDraw();
    else if(animate||seatTween)scheduleFrame();
  }
  function scheduleFrame(){
    if(!frame&&((!idle&&!seating)||!document.hidden))frame=requestAnimationFrame(draw);
  }
  function requestDraw(){requestedDraw=true;scheduleFrame();}
  const bustButton=document.querySelector('#bust'),eyeButton=document.querySelector('#eyes');
  if(imported)bustButton.textContent='全身';
  function setClassroom(enabled){
    inClassroom=Boolean(enabled&&classroom);
    if(classroom){
      classroom.group.visible=inClassroom;
      classroomButton.setAttribute('aria-pressed',String(inClassroom));
      classroomButton.textContent=inClassroom?'柔光背景':'教室';
      imported.group.position.copy(classroom.displayPosition).multiplyScalar(inClassroom?1:0);
    }
    scene.background=inClassroom?classroom.background:null;
    ground.visible=!inClassroom;
    stage.closest('main').classList.toggle('classroom-view',inClassroom);
    fit();
    target.copy(goalTarget);
    applyLight();
  }
  function setView(close){
    controls.face=close;controls.zoom=1;
    bustButton.setAttribute('aria-pressed',String(!close));eyeButton.setAttribute('aria-pressed',String(close));
    fit();
  }
  function zoom(factor){controls.zoom=clamp(controls.zoom*factor,.46,1.8);fit();}
  function turn(yaw,pitch){
    controls.theta+=yaw;
    controls.phi=clamp(controls.phi+pitch,-.38,1.04);requestDraw();
  }
  function faceAngle(){
    const delta=.61-movingView.theta;
    controls.theta=movingView.theta+Math.atan2(Math.sin(delta),Math.cos(delta));
    controls.phi=.072;
  }
  function reset(){stopSweep();faceAngle();setView(false);light.value=openingLight;applyLight();}
  const pointers=new Map();
  const span=()=>{const [a,b]=pointers.values();return Math.hypot(a.x-b.x,a.y-b.y);};
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',e=>{
    const last=pointers.get(e.pointerId);if(!last)return;
    const old=pointers.size===2?span():0;
    const dx=e.clientX-last.x,dy=e.clientY-last.y;
    last.x=e.clientX;last.y=e.clientY;
    if(pointers.size===1)turn(-dx*.0075,dy*.006);
    else if(pointers.size===2&&old>2&&span()>2)zoom(old/span());
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>pointers.delete(e.pointerId));
  canvas.addEventListener('wheel',e=>{e.preventDefault();const scale=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;zoom(Math.exp(clamp(e.deltaY*scale,-140,140)*.0017));},{passive:false});
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='Home')reset();
    else if(e.key==='+'||e.key==='=')zoom(.86);else if(e.key==='-')zoom(1.16);
    else turn(e.key==='ArrowLeft'?-.12:e.key==='ArrowRight'?.12:0,e.key==='ArrowUp'?.08:e.key==='ArrowDown'?-.08:0);
  });
  bustButton.addEventListener('click',()=>setView(false));
  eyeButton.addEventListener('click',()=>{faceAngle();setView(true);});
  document.querySelector('#reset').addEventListener('click',reset);
  light.addEventListener('input',()=>{stopSweep();applyLight();});
  if(original){
    sweepButton.hidden=false;
    sweepButton.addEventListener('click',()=>{if(sweepPlaying)stopSweep(false);else startSweep();});
  }
  if(classroom){
    classroomButton.hidden=false;
    classroomButton.addEventListener('click',()=>setClassroom(!inClassroom));
    const preferredScene=params.get('scene');
    setClassroom(animateAvatar?preferredScene==='classroom':preferredScene!=='studio');
  }
  if(imported?.finish){
    // A pose can be addressed by timestamp without starting playback in the still studio.
    imported.finish.setTime(Number(params.get('poseTime')));
    imported.finish.show(finishMode);
    if(avatarMotion?.createFrogIdle){
      try{
        idle=await avatarMotion.createFrogIdle(imported.upperBody);
      }catch(error){
        console.warn('Could not apply avatar motion.',error);
      }
    }
    if(avatarMotion?.createFrogSeating&&createChair){
      const chair=createChair({
        dark:new THREE.MeshStandardMaterial({color:0x223044,roughness:.64}),
        white:new THREE.MeshStandardMaterial({color:0xe4e8e8,roughness:.75}),
        edge:new THREE.MeshStandardMaterial({color:0x434e50,metalness:.42,roughness:.43}),
      });
      const ratio=imported.scale/.55;
      chair.scale.setScalar(ratio);
      chair.rotation.y=Math.PI;
      chair.position.y=-.09*ratio;
      try{
        seating=avatarMotion.createFrogSeating(imported,{seatTop:.535*ratio});
        setSeatProgress(0);
        imported.group.add(chair);
        sitButton.hidden=false;
        sitButton.addEventListener('click',toggleSeat);
      }catch(error){
        seating=null;
        console.warn('Could not prepare the seating preview.',error);
      }
    }
  }else if(imported){
    const error=document.querySelector('#finish-error');
    error.textContent='精修素材未载入，当前显示原模型。';error.hidden=false;
  }
  if(idle||seating){
    // Resume the observed phase, including after switching to a background tab.
    motionPreference.addEventListener('change',()=>{
      idleLast=null;
      if(seatTween&&motionPreference.matches){
        seatTween=null;
        setSeatProgress(seatTarget);
      }
      requestDraw();
    });
    document.addEventListener('visibilitychange',()=>{
      idleLast=null;
      if(seatTween)seatTween.last=null;
      if(document.hidden){
        cancelAnimationFrame(frame);
        frame=0;
      }else{
        lastFrame=performance.now();
        requestDraw();
      }
    });
  }
  new ResizeObserver(fit).observe(stage);setView(params.get('view')==='eyes');target.copy(goalTarget);movingView.distance=distance;
  applyLight();lastFrame=performance.now();
  if(original&&params.get('light')==='sweep'&&!motionPreference.matches)startSweep();
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();const msg=document.querySelector('#status');msg.hidden=false;msg.textContent='图形画面已暂停，恢复后会重新显示。';
  });
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
}
