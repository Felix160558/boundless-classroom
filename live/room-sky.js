import * as THREE from '../three.module.min.js';
import {createSpaceSky} from '../space-sky.js?v=medieval-lounge-40';
import {createStationCabin} from './station-cabin.js?v=medieval-lounge-40';
import {createCastleLounge} from './castle-lounge.js?v=star-window-41';

export const stationView = {
  ready:false,
  boardPoint:()=>null,
  hitModel:()=>false,
  setPointer:()=>{},
};

const get = id => document.getElementById(id);
const container = get('room-sky');
const vrButton = get('station-vr');
const status = get('station-vr-status');
const centerButton = get('center-station');
const profileDialog = get('teacher-dialog');
const gallery = get('portrait-gallery');
const profileButtons = [...gallery.querySelectorAll('[data-teacher]')];

function openProfile(id) {
  const index = ['teacher-1','teacher-2','teacher-3'].indexOf(id);
  if (index<0 || document.body.dataset.station!=='lounge') return;
  get('teacher-image').style.backgroundPosition = `${index*50}% center`;
  profileDialog.showModal();
}
profileButtons.forEach(button=>button.addEventListener('click',()=>openProfile(button.dataset.teacher)));
get('close-teacher').addEventListener('click',()=>profileDialog.close());
if (container) requestAnimationFrame(startStation);

function startStation() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  } catch {
    vrButton.addEventListener('click',()=>{status.textContent='This browser cannot display the 3D room.';});
    return;
  }
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.xr.enabled=true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.domElement.setAttribute('aria-hidden','true');
  container.append(renderer.domElement);

  const scene=new THREE.Scene();
  const galaxy=new THREE.Group();
  galaxy.rotation.set(.25,-.47,.045);
  scene.add(galaxy);
  const sky=createSpaceSky(galaxy,{compact:true});
  const camera=new THREE.PerspectiveCamera(51,1,.06,600);
  camera.rotation.order='YXZ';
  const rig=new THREE.Group();
  rig.add(camera);
  scene.add(rig);
  const board=get('board'), workspace=get('workspace'), lobby=get('lobby');
  const cabin=createStationCabin(scene,{
    board,workspace,localVideo:get('local-video'),remoteVideo:get('remote-video'),
    projectedVideo:get('projected-video'),projection:get('projection'),
  });
  const lounge=createCastleLounge(scene);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const raycaster=new THREE.Raycaster();
  const screen=new THREE.Vector2();
  const cameraPosition=new THREE.Vector3();
  const center=new THREE.Vector3();
  const normal=new THREE.Vector3();
  const projected=new THREE.Vector3();
  const headDirection=new THREE.Vector3();
  const headQuaternion=new THREE.Quaternion();
  let preview=false, xrSession=null, xrSupported=false, opening=false, ownFullscreen=false;
  let yaw=0,pitch=0,drag=null,lastFrame=null,needsFrame=true,layoutRequest=null,xrAlign=false;
  lounge.group.userData.requestRender=()=>{needsFrame=true;};
  const inClassroom=()=>document.body.dataset.station==='classroom';

  function rayAt(event) {
    const rect=container.getBoundingClientRect();
    screen.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(screen,camera);
    return raycaster;
  }

  function positionPortraitButtons() {
    if (inClassroom() || preview) {
      gallery.hidden=true;
      return;
    }
    gallery.hidden=false;
    scene.updateMatrixWorld(true);
    camera.getWorldPosition(cameraPosition);
    const width=container.clientWidth, height=container.clientHeight;
    for (const {id,mesh} of lounge.portraits) {
      const button=profileButtons.find(item=>item.dataset.teacher===id);
      if (!button) continue;
      mesh.geometry.computeBoundingBox();
      const bounds=mesh.geometry.boundingBox;
      mesh.getWorldPosition(center);
      normal.set(0,0,1).transformDirection(mesh.matrixWorld);
      const facing=normal.dot(cameraPosition.clone().sub(center))>0;
      projected.copy(center).project(camera);
      button.hidden=!facing || projected.z<-1 || projected.z>1;
      if (button.hidden) continue;
      const corners=[
        [bounds.min.x,bounds.min.y],[bounds.max.x,bounds.min.y],
        [bounds.min.x,bounds.max.y],[bounds.max.x,bounds.max.y],
      ].map(([x,y])=>new THREE.Vector3(x,y,0).applyMatrix4(mesh.matrixWorld).project(camera));
      const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x));
      const top=Math.max(...corners.map(p=>p.y)),bottom=Math.min(...corners.map(p=>p.y));
      button.hidden=right< -1 || left>1 || bottom>1 || top< -1;
      button.style.left=`${(left+1)*width*.5}px`;
      button.style.top=`${(1-top)*height*.5}px`;
      button.style.width=`${(right-left)*width*.5}px`;
      button.style.height=`${(top-bottom)*height*.5}px`;
    }
  }

  function layout() {
    layoutRequest=null;
    if (renderer.xr.isPresenting) return;
    const width=container.clientWidth,height=container.clientHeight;
    if (!width||!height) return;
    const classroom=inClassroom();
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.fov=width<680?65:classroom?51:55;
    camera.updateProjectionMatrix();
    // The same live, three-dimensional sky is outside both rooms. Opaque
    // castle masonry still occludes it; the rear glazing opens onto it.
    scene.background.set('#07090e');
    galaxy.visible=true;
    lounge.group.visible=!classroom;
    cabin.group.visible=classroom;
    sky.resize(height,renderer.getPixelRatio());
    cabin.layout(camera,width,height,classroom?board.getBoundingClientRect():null,classroom);
    lounge.layout(camera,width,height);
    positionPortraitButtons();
    needsFrame=true;
  }
  scene.background=new THREE.Color('#07090e');

  function scheduleLayout() {
    if (layoutRequest===null) layoutRequest=requestAnimationFrame(layout);
  }

  function pose() {
    camera.position.set(0,0,0);
    camera.rotation.set(pitch,yaw,0,'YXZ');
    camera.updateMatrixWorld(true);
    centerButton.hidden=Math.abs(yaw)+Math.abs(pitch)<.005;
    positionPortraitButtons();
    needsFrame=true;
  }
  centerButton.addEventListener('click',()=>{yaw=0;pitch=0;pose();});

  function setPreview(value) {
    preview=value;
    if (value) document.body.dataset.stationPreview='true';
    else delete document.body.dataset.stationPreview;
    vrButton.setAttribute('aria-pressed',String(value));
    vrButton.textContent=value?(inClassroom()?'Back to Classroom':'Back to Lounge'):'Enter VR';
    yaw=0;pitch=0;drag=null;
    for (const surface of [container,workspace,lobby]) surface.classList.remove('is-looking');
    pose();
    status.textContent=value&&!xrSession?'Drag to look around. Press Esc to return.':'';
  }

  function exitPreview() {
    rig.position.set(0,0,0);
    rig.rotation.set(0,0,0);
    xrAlign=false;
    setPreview(false);
    if (ownFullscreen&&document.fullscreenElement===document.documentElement) {
      void document.exitFullscreen().catch(()=>{});
    }
    ownFullscreen=false;
  }
  async function enterBrowserPreview() {
    setPreview(true);
    if (document.fullscreenElement||!document.documentElement.requestFullscreen) return;
    try {
      await document.documentElement.requestFullscreen();
      ownFullscreen=true;
      if (!preview) {
        await document.exitFullscreen();
        ownFullscreen=false;
      }
    } catch {
      // Embedded browser panels can still offer drag-to-look.
    }
  }
  if (navigator.xr?.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr')
      .then(supported=>{xrSupported=supported;}).catch(()=>{});
  }
  vrButton.addEventListener('click',async()=>{
    if (opening) return;
    if (xrSession) {await xrSession.end().catch(()=>{});return;}
    if (preview) {exitPreview();return;}
    if (!xrSupported) {void enterBrowserPreview();return;}
    opening=true;vrButton.disabled=true;
    try {
      const requestedRoom=document.body.dataset.station;
      const session=await navigator.xr.requestSession('immersive-vr');
      if (requestedRoom!==document.body.dataset.station) {await session.end();return;}
      xrSession=session;
      session.addEventListener('end',()=>{
        if (xrSession!==session) return;
        xrSession=null;exitPreview();scheduleLayout();
      },{once:true});
      setPreview(true);
      try {
        await renderer.xr.setSession(session);
        xrAlign=true;
      } catch(error) {
        await session.end().catch(()=>{});
        throw error;
      }
    } catch {
      xrSession=null;
      void enterBrowserPreview();
    } finally {opening=false;vrButton.disabled=false;}
  });

  function look(dx,dy) {
    yaw=THREE.MathUtils.euclideanModulo(yaw+dx+Math.PI,Math.PI*2)-Math.PI;
    pitch=THREE.MathUtils.clamp(pitch+dy,-1.28,1.28);
    pose();
  }
  function bindLook(surface,immersiveOnly) {
    const target=immersiveOnly?surface:document;
    target.addEventListener('pointerdown',event=>{
      if (!surface.contains(event.target)||event.defaultPrevented||xrSession||drag||event.button!==0||preview!==immersiveOnly) return;
      if (event.target.closest('button,a,input,select,summary,dialog')) return;
      if ((surface===workspace&&!inClassroom())||(surface===lobby&&inClassroom())) return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY};
      surface.setPointerCapture(event.pointerId);
      surface.classList.add('is-looking');
    });
    surface.addEventListener('pointermove',event=>{
      if (drag?.id!==event.pointerId) return;
      look((event.clientX-drag.x)*.0043,(event.clientY-drag.y)*.0043);
      drag.x=event.clientX;drag.y=event.clientY;
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      surface.addEventListener(type,event=>{
        if (drag?.id!==event.pointerId) return;
        drag=null;surface.classList.remove('is-looking');
      });
    }
  }
  bindLook(workspace,false);
  bindLook(lobby,false);
  bindLook(container,true);
  document.addEventListener('keydown',event=>{
    if (xrSession||document.querySelector('dialog[open]')) return;
    if (event.key==='Escape'&&preview) {exitPreview();return;}
    if (event.target.closest?.('input,select,textarea,[contenteditable]')) return;
    const directions={ArrowLeft:[.065,0],ArrowRight:[-.065,0],ArrowUp:[0,.065],ArrowDown:[0,-.065]};
    const movement=directions[event.key];
    if (!movement) return;
    event.preventDefault();look(...movement);
  });
  document.addEventListener('fullscreenchange',()=>{
    if (ownFullscreen&&!document.fullscreenElement) exitPreview();
    scheduleLayout();
  });
  document.addEventListener('visibilitychange',()=>{lastFrame=null;needsFrame=true;});
  reduce.addEventListener('change',()=>{needsFrame=true;});
  workspace.addEventListener('room-molecule-change',event=>{
    cabin.setModel(event.detail);needsFrame=true;
  });
  new MutationObserver(()=>{
    if (xrSession) void xrSession.end().catch(()=>{});
    if (preview) exitPreview();
    yaw=0;pitch=0;pose();scheduleLayout();
  }).observe(document.body,{attributes:true,attributeFilter:['data-station']});
  const observer=new ResizeObserver(scheduleLayout);
  observer.observe(container);observer.observe(board);
  layout();pose();
  stationView.boardPoint=(event,clamp=false)=>cabin.boardPoint(rayAt(event).ray,clamp);
  stationView.hitModel=event=>cabin.hitModel(rayAt(event));
  stationView.setPointer=state=>{cabin.setPointer(state);needsFrame=true;};
  stationView.ready=true;
  document.body.dataset.stationRendered='true';
  workspace.dispatchEvent(new Event('station-ready'));

  renderer.setAnimationLoop((time,xrFrame)=>{
    const immersive=renderer.xr.isPresenting;
    if (document.hidden&&!immersive) return;
    if (immersive&&xrAlign&&xrFrame) {
      const viewer=xrFrame.getViewerPose(renderer.xr.getReferenceSpace());
      if (viewer) {
        const {position,orientation}=viewer.transform;
        headQuaternion.set(orientation.x,orientation.y,orientation.z,orientation.w);
        headDirection.set(0,0,-1).applyQuaternion(headQuaternion);
        rig.rotation.y=Math.atan2(headDirection.x,-headDirection.z);
        rig.position.copy(new THREE.Vector3(position.x,position.y,position.z).applyAxisAngle(new THREE.Vector3(0,1,0),rig.rotation.y)).negate();
        xrAlign=false;
      }
    }
    const since=lastFrame===null?34:time-lastFrame;
    if (!immersive&&!needsFrame&&since<32) return;
    if (!immersive&&reduce.matches&&!preview&&!inClassroom()&&!needsFrame) return;
    lastFrame=time;needsFrame=false;
    const elapsed=Math.max(0,Math.min(since/1000,.05));
    sky.update(reduce.matches?0:elapsed);
    if (inClassroom()) {
      cabin.update(time,elapsed,preview);
    } else lounge.update(time,elapsed,reduce.matches);
    renderer.render(scene,camera);
  });
}
