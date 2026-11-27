import * as THREE from '../three.module.min.js';
import {createSpaceSky} from '../space-sky.js?v=medieval-lounge-40';
import {BOARD_DEPTH, createStationCabin} from './station-cabin.js?v=frog-peer-74';
import {createCastleLounge} from './castle-lounge.js?v=star-window-41';
import {createLoungeMirror} from './lounge-mirror.js?v=frog-peer-74';
import {createLoungeMirrorAvatar} from './lounge-mirror-avatar.js?v=frog-peer-74';

import {createPreviewMolecules} from './preview-molecules.js?v=shared-classroom-43';
import {createSharedSeating, seatPose, seatedView, SHARED_BOARD, SHARED_FLOOR, FURNITURE_INSET,
  SEATED_STUDENT_HEIGHT} from './shared-seating.js?v=frog-hair-73';
import {createLocalStudentBody} from './student-vr-body.js?v=frog-peer-74';
import {createXRAvatarMenu} from './xr-avatar-menu.js?v=frog-seat-61';
import {avatarPreference} from './avatar-preference.js?v=frog-seat-61';

export const stationView = {
  ready:false,
  boardPoint:()=>null,
  hitModel:()=>false,
  setPointer:()=>{},
  boardChemHit:()=>null,
  boardChemRotate:()=>{},
  boardChemFinish:()=>{},
};

const get = id => document.getElementById(id);
const container = get('room-sky');
const vrButton = get('station-vr');
const status = get('station-vr-status');
const centerButton = get('center-station');
const mirrorButton = get('look-in-mirror');
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
  let roomRole=workspace.dataset.roomRole || null;
  let roomSeat=workspace.dataset.seat || roomRole;
  const canRotate=()=>roomRole!=='student';
  const seating=createSharedSeating(cabin.group,()=>{needsFrame=true;});
  const avatarMenu=createXRAvatarMenu(scene,rig,()=>renderer.xr.getReferenceSpace(),()=>avatarPreference.current,
    avatar=>workspace.dispatchEvent(new CustomEvent('room-avatar-choice',{detail:avatar})),
    {unlocked:()=>avatarPreference.unlocked});
  const chemistry=createPreviewMolecules(cabin.group,{rig,canRotate,onPose:(key,rotation,final=false)=>{
    if (roomRole==='teacher') workspace.dispatchEvent(new CustomEvent('room-chemistry-pose',{detail:{key,rotation,final}}));
  }});
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
  const seatedEye=new THREE.Vector3();
  const eyeShift=new THREE.Vector3();
  const mirrorCenter=new THREE.Vector3(),mirrorViewer=new THREE.Vector3(),mirrorDirection=new THREE.Vector3();
  let preview=false, xrSession=null, xrSupported=false, opening=false, ownFullscreen=false;
  let yaw=0,pitch=0,drag=null,lastFrame=null,needsFrame=true,layoutRequest=null,xrAlign=false;
  let mirrorFocused=false;
  let xrEyeAnchor=null, xrReferenceSpace=null;
  let lastHead=null,lastHeadAt=-Infinity;
  const xrUp=new THREE.Vector3(0,1,0);
  lounge.group.userData.requestRender=()=>{needsFrame=true;};
  const inClassroom=()=>document.body.dataset.station==='classroom';
  const usesAvatarView=()=>inClassroom()&&(preview||avatarPreference.current==='frog-girl');
  const mirror=createLoungeMirror(lounge.group,scene);
  const reflection=createLoungeMirrorAvatar(lounge.group,()=>{needsFrame=true;});
  reflection.setAppearance(avatarPreference.current);
  avatarPreference.subscribe(avatar=>{
    reflection.setAppearance(avatar);
    needsFrame=true;
  });
  const localBody=createLocalStudentBody(cabin.group,{
    height:SEATED_STUDENT_HEIGHT,
    onChange:refreshAvatarView,
    onError:(_error,phase)=>{
      if (!usesAvatarView()) return;
      status.textContent=phase==='detail'
        ? 'Orange Cat is ready. Fur detail could not load.'
        : 'Orange Cat could not load. Block Figure is ready.';
    },
  });

  function localSeat() {
    if (!inClassroom()) return null;
    if (roomRole) {
      const seat=seatPose(roomSeat);
      return seat?{...seat,y:SHARED_FLOOR-FURNITURE_INSET}:null;
    }
    // Solo previews build one chair at the origin on their responsive floor.
    const boardSurface=cabin.boardSurface();
    const floor=boardSurface?Math.min(SHARED_FLOOR,boardSurface.y-boardSurface.height*.5-.17):SHARED_FLOOR;
    return {x:0,y:floor-FURNITURE_INSET,z:0,yaw:0};
  }

  function syncLocalBody() {
    const seat=localSeat();
    if (seat) localBody.setSeat(seat);
    localBody.setVisible(Boolean(seat&&usesAvatarView()),{tracked:Boolean(xrSession)});
  }

  function prepareAvatar() {
    if (!inClassroom()) return;
    localBody.setAppearance(avatarPreference.current);
    localBody.preload();
  }

  function refreshAvatarView() {
    if (!xrSession) pose();
    else if (!xrAlign && xrEyeAnchor && inClassroom()) {
      // Move the calibrated seat when the visible body changes. Preserve the
      // wearer's head orientation and real-world offset from the seat.
      eyeShift.fromArray(viewerSeat().position).sub(xrEyeAnchor);
      rig.position.add(eyeShift);
      xrEyeAnchor.add(eyeShift);
      rig.updateMatrixWorld(true);
    }
    needsFrame=true;
  }

  function resetXRSeat() {
    xrAlign=true;
    localBody.resetInput();
  }

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
    camera.fov=width<680?65:classroom?(roomRole?64:51):55;
    camera.updateProjectionMatrix();
    // The same live, three-dimensional sky is outside both rooms. Opaque
    // castle masonry still occludes it; the rear glazing opens onto it.
    scene.background.set('#07090e');
    galaxy.visible=true;
    lounge.group.visible=!classroom;
    cabin.group.visible=classroom;
    reflection.setActive(!classroom);
    sky.resize(height,renderer.getPixelRatio());
    cabin.layout(camera,width,height,classroom?board.getBoundingClientRect():null,classroom,roomRole?SHARED_BOARD:null);
    const surface=cabin.boardSurface();
    chemistry.layout(surface ? {...surface,shared:Boolean(roomRole)} : null);
    lounge.layout(camera,width,height);
    syncLocalBody();
    pose();
  }
  scene.background=new THREE.Color('#07090e');

  function scheduleLayout() {
    if (layoutRequest===null) layoutRequest=requestAnimationFrame(layout);
  }

  const viewerSeat = () => {
    const seat=inClassroom()?roomSeat:null;
    const view=seatedView(seat,workspace.dataset.avatar);
    if (usesAvatarView()&&localSeat()) view.position=localBody.eyePosition(seatedEye).toArray();
    if (seat==='student-2') {
      const [x,,z]=view.position;
      const boardYaw=Math.atan2(x-SHARED_BOARD.x,BOARD_DEPTH+z);
      // Turn the gaze toward the board while keeping the angled chair fixed.
      view.yaw=Math.max(boardYaw,view.yaw-Math.PI/4);
    }
    return view;
  };
  function pose() {
    const seated=inClassroom() && (roomSeat || preview);
    const view=viewerSeat();
    if (xrSession) camera.position.set(0,0,0);
    else {
      camera.position.fromArray(view.position);
      if (mirrorFocused&&!inClassroom()) {
        mirror.glass.getWorldPosition(mirrorCenter);
        camera.position.set(mirrorCenter.x-2.75,-.13,mirrorCenter.z);
      }
      if (inClassroom() && roomSeat==='student-2' && avatarPreference.current==='frog-girl') {
        // The side chair is next to the desk. A small lean into the aisle
        // lets the browser's look-down control emulate moving the head past it.
        const lean=THREE.MathUtils.smootherstep(-pitch,.92,1.20)
          *THREE.MathUtils.smoothstep(Math.cos(yaw),.45,.85);
        camera.position.x+=.06*lean;
        camera.position.y-=.0132*lean;
      }
    }
    camera.rotation.set(xrSession?0:pitch-(seated ? .06 : 0),xrSession?0:view.yaw+yaw,0,'YXZ');
    camera.updateMatrixWorld(true);
    centerButton.hidden=!mirrorFocused&&Math.abs(yaw)+Math.abs(pitch)<.005;
    positionPortraitButtons();
    needsFrame=true;
  }
  function centerView(){mirrorFocused=false;yaw=0;pitch=0;pose();}
  centerButton.addEventListener('click',centerView);
  mirrorButton.addEventListener('click',()=>{
    if(inClassroom()||xrSession)return;
    mirrorButton.closest('details').open=false;
    mirrorFocused=true;yaw=-Math.PI/2;pitch=-.14;pose();
    centerButton.focus({preventScroll:true});
  });

  function describePreview() {
    status.textContent=preview&&!xrSession
      ? (inClassroom()&&canRotate()?'Drag the room to look around, or drag a molecule to turn it. Esc to return.':'Drag to look around. Press Esc to return.')
      : '';
  }

  function setPreview(value) {
    preview=value;
    if (value) document.body.dataset.stationPreview='true';
    else delete document.body.dataset.stationPreview;
    vrButton.setAttribute('aria-pressed',String(value));
    vrButton.textContent=value?(inClassroom()?'Back to Classroom':'Back to Lounge'):'Enter VR';
    mirrorFocused=false;yaw=0;pitch=0;drag=null;
    for (const surface of [container,workspace,lobby]) surface.classList.remove('is-looking');
    describePreview();
    if (inClassroom()) workspace.dispatchEvent(new CustomEvent('room-vr-mode',{detail:value}));
    syncLocalBody();
    pose();
  }

  function exitPreview() {
    xrReferenceSpace?.removeEventListener('reset',resetXRSeat);
    xrReferenceSpace=null;
    rig.position.set(0,0,0);
    rig.rotation.set(0,0,0);
    xrAlign=false;
    xrEyeAnchor=null;
    localBody.resetInput();
    avatarMenu.attach(null);
    lastHead=null;lastHeadAt=-Infinity;
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
      const session=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['hand-tracking']});
      if (requestedRoom!==document.body.dataset.station) {await session.end();return;}
      xrSession=session;
      resetXRSeat();
      session.addEventListener('end',()=>{
        if (xrSession!==session) return;
        xrSession=null;chemistry.attachXR(null);exitPreview();scheduleLayout();
      },{once:true});
      setPreview(true);
      try {
        await renderer.xr.setSession(session);
        if (xrSession!==session) return;
        xrReferenceSpace=renderer.xr.getReferenceSpace();
        xrReferenceSpace?.addEventListener('reset',resetXRSeat);
        if (inClassroom()) {
          chemistry.attachXR(session);
          avatarMenu.attach(session,viewerSeat());
        }
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
      const model=immersiveOnly&&inClassroom()&&canRotate()?chemistry.hitTest(rayAt(event)):null;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,model};
      surface.setPointerCapture(event.pointerId);
      surface.classList.add('is-looking');
    });
    surface.addEventListener('pointermove',event=>{
      if (drag?.id!==event.pointerId) return;
      if (drag.model) chemistry.rotate(drag.model,(event.clientX-drag.x)*.018,(event.clientY-drag.y)*.018);
      else look((event.clientX-drag.x)*.0043,(event.clientY-drag.y)*.0043);
      needsFrame=true;
      drag.x=event.clientX;drag.y=event.clientY;
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      surface.addEventListener(type,event=>{
        if (drag?.id!==event.pointerId) return;
        if (drag.model) chemistry.finish(drag.model);
        drag=null;surface.classList.remove('is-looking');
      });
    }
  }
  bindLook(workspace,false);
  bindLook(lobby,false);
  bindLook(container,true);
  document.addEventListener('keydown',event=>{
    if (xrSession||event.defaultPrevented||document.querySelector('dialog[open]')) return;
    if (event.key==='Escape'&&mirrorFocused) {centerView();return;}
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
  workspace.addEventListener('room-board-chemistry',event=>{
    chemistry.setModels(event.detail);needsFrame=true;
  });
  workspace.addEventListener('room-presence',event=>{
    const {role,seat=role,peers=[]}=event.detail;
    if (roomRole!==role || roomSeat!==seat) {
      roomRole=role;
      roomSeat=seat;
      if (xrSession) resetXRSeat();
      syncLocalBody();
      pose(); scheduleLayout();
    }
    seating.show(roomSeat,peers);
    needsFrame=true;
  });
  workspace.addEventListener('room-local-avatar',()=>{
    describePreview();
    prepareAvatar();
    syncLocalBody();
    lastHead=null;
    if (!xrSession) pose();
  });
  new MutationObserver(()=>{
    if (xrSession) void xrSession.end().catch(()=>{});
    if (preview) exitPreview();
    prepareAvatar();
    syncLocalBody();
    reflection.setActive(!inClassroom());
    centerView();scheduleLayout();
  }).observe(document.body,{attributes:true,attributeFilter:['data-station']});
  const observer=new ResizeObserver(scheduleLayout);
  observer.observe(container);observer.observe(board);
  layout();prepareAvatar();
  stationView.boardPoint=(event,clamp=false)=>cabin.boardPoint(rayAt(event).ray,clamp);
  stationView.hitModel=event=>cabin.hitModel(rayAt(event));
  stationView.boardChemHit=event=>chemistry.hitTest(rayAt(event));
  stationView.boardChemRotate=(key,dx,dy)=>{chemistry.rotate(key,dx,dy);needsFrame=true;};
  stationView.boardChemFinish=key=>chemistry.finish(key);
  stationView.setPointer=state=>{cabin.setPointer(state);needsFrame=true;};
  stationView.ready=true;
  document.body.dataset.stationRendered='true';
  workspace.dispatchEvent(new Event('station-ready'));

  renderer.setAnimationLoop((time,xrFrame)=>{
    const immersive=renderer.xr.isPresenting;
    if (document.hidden&&!immersive) return;
    const refSpace=immersive&&xrFrame?renderer.xr.getReferenceSpace():null;
    if (refSpace && xrAlign) {
      const viewer=xrFrame.getViewerPose(refSpace);
      if (viewer) {
        const {position,orientation}=viewer.transform;
        headQuaternion.set(orientation.x,orientation.y,orientation.z,orientation.w);
        headDirection.set(0,0,-1).applyQuaternion(headQuaternion);
        const view=viewerSeat();
        const [x,y,z]=view.position;
        xrEyeAnchor=new THREE.Vector3(x,y,z);
        rig.rotation.y=Math.atan2(headDirection.x,-headDirection.z)+view.yaw;
        rig.position.set(position.x,position.y,position.z).applyAxisAngle(xrUp,rig.rotation.y).negate();
        rig.position.x+=x; rig.position.y+=y; rig.position.z+=z;
        rig.updateMatrixWorld(true);
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
      if (usesAvatarView()) localBody.update(time/1000,{
        frame:refSpace&&!xrAlign?xrFrame:null,
        referenceSpace:refSpace,
        rig,
        dt:elapsed,
      });
      if (refSpace&&!xrAlign) {
        chemistry.updateXR(xrFrame,refSpace);
        avatarMenu.update(xrFrame,refSpace);
        const seat=seatPose(roomSeat);
        if (!seat) lastHead=null;
        else if (time-lastHeadAt>=125) {
          const viewer=xrFrame.getViewerPose(refSpace);
          if (viewer) {
            const q=viewer.transform.orientation;
            headQuaternion.set(q.x,q.y,q.z,q.w);
            headDirection.set(0,0,-1).applyQuaternion(headQuaternion).applyAxisAngle(xrUp,rig.rotation.y-seat.yaw);
            const headYaw=THREE.MathUtils.clamp(Math.atan2(-headDirection.x,-headDirection.z),-.90,.90);
            const headPitch=THREE.MathUtils.clamp(-Math.asin(THREE.MathUtils.clamp(headDirection.y,-1,1)),-.55,.55);
            if (!lastHead || Math.hypot(headYaw-lastHead.headYaw,headPitch-lastHead.headPitch)>.025) {
              lastHead={headYaw,headPitch};lastHeadAt=time;
              workspace.dispatchEvent(new CustomEvent('room-avatar-head',{detail:lastHead}));
            }
          }
        }
      }
      seating.update(time/1000,elapsed,reduce.matches);
      chemistry.update(time/1000,elapsed);
    } else {
      lounge.update(time,elapsed,reduce.matches);
      const viewer=refSpace&&xrFrame.getViewerPose(refSpace);
      if(viewer){
        const {position,orientation}=viewer.transform;
        mirrorViewer.set(position.x,position.y,position.z).applyMatrix4(rig.matrixWorld);
        headQuaternion.set(orientation.x,orientation.y,orientation.z,orientation.w);
        mirrorDirection.set(0,0,-1).applyQuaternion(headQuaternion).transformDirection(rig.matrixWorld);
      }else{
        camera.getWorldPosition(mirrorViewer);
        camera.getWorldDirection(mirrorDirection);
      }
      lounge.group.worldToLocal(mirrorViewer);
      const lookYaw=Math.atan2(-mirrorDirection.x,-mirrorDirection.z);
      reflection.update(time/1000,{localViewer:mirrorViewer,lookYaw,reducedMotion:reduce.matches});
    }
    renderer.render(scene,camera);
  });
}
