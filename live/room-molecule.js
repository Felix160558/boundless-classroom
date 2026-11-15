import * as THREE from '../three.module.min.js';
import {MOLECULE_CATALOG} from '../molecule-catalog.js?v=quiet-shape-31';
import {createMoleculeStage} from '../molecule-lesson.js?v=reservation-room-36';

export function createRoomMolecule(host, {onRotate, onError}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let scene, camera, renderer, stage;
  let state = null, enabled = false, failed = false, drag = null;
  let frame = null, lastFrame = null;

  function initialize() {
    if (renderer || failed) return;
    try {
      renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
    } catch {
      failed = true;
      onError('This device cannot display the 3D molecule.');
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden','true');
    host.append(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1,1,1,-1,.1,30);
    camera.position.set(0,1.33,6);
    camera.lookAt(0,1.33,0);
    scene.add(new THREE.HemisphereLight(0xfff5e1,0x96a7c2,2));
    const key = new THREE.DirectionalLight(0xffefd0,2.3);
    key.position.set(-2,4,3);
    scene.add(key);
    stage = createMoleculeStage(scene);
  }

  function schedule() {
    if (state && renderer && !document.hidden && frame===null) frame=requestAnimationFrame(draw);
  }

  function draw(time) {
    frame = null;
    if (!state || document.hidden) return;
    if (reducedMotion.matches) {
      for (let i=0;i<8;i++) stage.update(0,.05);
      renderer.render(scene,camera);
      return;
    }
    if (lastFrame===null || time-lastFrame>=28) {
      const dt = lastFrame===null ? .05 : Math.min((time-lastFrame)/1000,.05);
      lastFrame=time;
      stage.update(time/1000,dt);
      renderer.render(scene,camera);
    }
    schedule();
  }

  function resize() {
    if (!renderer || !state || !host.clientWidth || !host.clientHeight) return;
    const width=host.clientWidth, height=host.clientHeight, aspect=width/height;
    const halfHeight=Math.max(1.06,1.02/aspect);
    camera.left=-halfHeight*aspect; camera.right=halfHeight*aspect;
    camera.top=halfHeight; camera.bottom=-halfHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
    renderer.setSize(width,height,false);
    schedule();
  }

  function show(next, interactive=false) {
    const entry=next?.id && Object.hasOwn(MOLECULE_CATALOG,next.id) ? MOLECULE_CATALOG[next.id] : null;
    const changed=state?.id!==entry?.id;
    state=entry ? next : null;
    enabled=Boolean(state && interactive);
    host.hidden=!state;
    host.dataset.interactive=String(enabled);
    host.tabIndex=enabled ? 0 : -1;
    if (changed || !enabled) endDrag();
    if (!state) {
      stage?.setModels([]);
      if (frame!==null) cancelAnimationFrame(frame);
      frame=null; lastFrame=null;
      return;
    }
    host.setAttribute('role','region');
    host.setAttribute('aria-label',`3D model of ${entry.englishName}${enabled ? '. Drag or use the arrow keys to rotate.' : ''}`);
    initialize();
    if (!renderer) {
      host.hidden=true;
      return;
    }
    stage.setModels([state.id]);
    stage.setOrientation(state.yaw,state.pitch);
    resize();
  }

  function rotate(dx, dy) {
    const yaw=THREE.MathUtils.euclideanModulo(state.yaw+dx+Math.PI,Math.PI*2)-Math.PI;
    const pitch=THREE.MathUtils.clamp(state.pitch+dy,-1.35,1.35);
    state={id:state.id,yaw,pitch};
    stage.setOrientation(yaw,pitch);
    schedule();
    onRotate(state);
  }

  function endDrag() {
    const previous=drag;
    drag=null;
    host.dataset.rotating='false';
    if (previous && host.hasPointerCapture(previous.id)) host.releasePointerCapture(previous.id);
  }

  host.addEventListener('pointerdown', event => {
    if (!enabled || !stage || drag || event.button!==0) return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    host.setPointerCapture(event.pointerId);
    host.dataset.rotating='true';
  });
  host.addEventListener('pointermove', event => {
    if (drag?.id!==event.pointerId) return;
    const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
    drag.x=event.clientX; drag.y=event.clientY;
    rotate(dx*.018,dy*.018);
  });
  for (const eventName of ['pointerup','pointercancel','lostpointercapture']) {
    host.addEventListener(eventName, event => {
      if (drag?.id===event.pointerId) endDrag();
    });
  }
  const arrowTurns = {ArrowLeft:[-.17,0],ArrowRight:[.17,0],ArrowUp:[0,-.17],ArrowDown:[0,.17]};
  host.addEventListener('keydown', event => {
    if (!enabled || !stage || !Object.hasOwn(arrowTurns,event.key)) return;
    event.preventDefault();
    rotate(...arrowTurns[event.key]);
  });
  new ResizeObserver(resize).observe(host);
  document.addEventListener('visibilitychange', () => {
    lastFrame=null;
    if (document.hidden && frame!==null) {
      cancelAnimationFrame(frame);
      frame=null;
    } else schedule();
  });
  reducedMotion.addEventListener('change',schedule);
  return {show};
}
