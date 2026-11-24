import * as THREE from '../three.module.min.js';
import {createStudentAvatar} from './student-avatar.js?v=student-avatar-49';
import {createClassroomChair} from './classroom-chair.js?v=student-avatar-49';
import {FURNITURE_INSET} from './shared-seating.js?v=student-avatar-49';

const view = document.getElementById('avatar-view');
const status = document.getElementById('avatar-status');
const button = document.getElementById('motion-toggle');
const poseLink = document.getElementById('avatar-pose');
const seated = new URLSearchParams(window.location.search).get('pose') === 'seated';
const {clamp} = THREE.MathUtils;

if (seated) {
  poseLink.href = '?v=student-avatar-49';
  poseLink.textContent = 'Standing view';
  view.setAttribute('aria-label', 'Interactive seated 3D avatar');
}

function addStage(scene) {
  const disk = new THREE.Mesh(
    new THREE.CylinderGeometry(.59,.61,.032,96),
    new THREE.MeshBasicMaterial({color:0x222a35,toneMapped:false})
  );
  disk.position.y = -.024;
  scene.add(disk);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(.585,.588,96),
    new THREE.MeshBasicMaterial({color:0x767c85,side:THREE.DoubleSide,toneMapped:false})
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = -.007;
  scene.add(rim);

  const shadow = document.createElement('canvas');
  shadow.width = shadow.height = 96;
  const ctx = shadow.getContext('2d');
  const glow = ctx.createRadialGradient(48,48,0,48,48,48);
  glow.addColorStop(0, 'rgba(4, 8, 14, .86)');
  glow.addColorStop(.4, 'rgba(4, 8, 14, .54)');
  glow.addColorStop(1, 'rgba(4, 8, 14, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0,0,96,96);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(.92,.65),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadow),transparent:true,depthWrite:false,toneMapped:false})
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0,-.006,-.03);
  scene.add(contact);
}

function addPreviewChair(scene, mount) {
  const chair = createClassroomChair({
    edge:new THREE.MeshStandardMaterial({color:0x343943,roughness:.27,metalness:.72}),
    white:new THREE.MeshStandardMaterial({color:0xe1e2da,roughness:.48,metalness:.2}),
    dark:new THREE.MeshStandardMaterial({color:0x202a35,roughness:.5,metalness:.45}),
  });
  chair.rotation.y = Math.PI;
  mount.add(chair);

  const hemisphere = new THREE.HemisphereLight(0xcbd7e8,0x343039,1.55);
  const key = new THREE.DirectionalLight(0xe3efff,2.7);
  const fill = new THREE.DirectionalLight(0x758fae,1.2);
  key.position.set(-2.2,4.5,3);
  fill.position.set(3,2,-2);
  scene.add(hemisphere,key,fill);
}

function start() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', {alpha:true, antialias:true});
  if (!context) {
    status.textContent = 'This avatar preview needs a browser with WebGL 2.';
    return;
  }
  const renderer = new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (seated) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
  }
  renderer.setClearColor(0,0);
  view.append(renderer.domElement);

  const scene = new THREE.Scene();
  addStage(scene);
  const camera = new THREE.PerspectiveCamera(35,1,.045,30);
  const target = seated ? new THREE.Vector3(0,.83,.04) : new THREE.Vector3(0,.71,-.025);
  const avatar = createStudentAvatar({height:seated ? 1.4 : 1.48,seated});
  if (seated) {
    const mount = new THREE.Group();
    mount.position.y = -FURNITURE_INSET;
    mount.add(avatar.object);
    addPreviewChair(scene,mount);
    scene.add(mount);
  } else {
    scene.add(avatar.object);
  }

  let yaw = seated ? .67 : .19, elevation = .17, distance = seated ? 3.55 : 3.2;
  let previous, modelTime = 0, drag;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loaded = false;
  function setMotion() {
    button.textContent = paused ? 'Play motion' : 'Pause motion';
  }
  setMotion();
  button.addEventListener('click', () => {
    paused = !paused;
    setMotion();
  });
  avatar.ready.then(() => {
    loaded = true;
    status.hidden = true;
    button.disabled = false;
  }).catch(() => {
    status.textContent = 'The avatar could not load. Refresh to try again.';
  });

  function resize() {
    const {clientWidth:width,clientHeight:height} = view;
    if (!width || !height) return;
    const maxRatio = Math.sqrt(12_000_000 / (width * height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2.5,maxRatio));
    renderer.setSize(width,height,false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(view);
  resize();

  view.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY};
    view.setPointerCapture(event.pointerId);
    view.classList.add('is-dragging');
  });
  view.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    yaw -= (event.clientX - drag.x) * .009;
    elevation = clamp(elevation + (event.clientY - drag.y) * .009,-.24,1.03);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  view.addEventListener('lostpointercapture', () => {
    drag = null;
    view.classList.remove('is-dragging');
  });
  view.addEventListener('wheel', event => {
    event.preventDefault();
    distance = clamp(distance * Math.exp(event.deltaY * .001),1.8,5.6);
  }, {passive:false});
  view.addEventListener('keydown', event => {
    const directions = {ArrowLeft:[.12,0],ArrowRight:[-.12,0],ArrowUp:[0,.09],ArrowDown:[0,-.09]};
    const change = directions[event.key];
    if (!change) return;
    event.preventDefault();
    yaw += change[0];
    elevation = clamp(elevation + change[1],-.24,1.03);
  });

  renderer.setAnimationLoop(milliseconds => {
    const delta = previous === undefined ? 0 : Math.min((milliseconds - previous) / 1000,.05);
    previous = milliseconds;
    if (loaded && !paused) modelTime += delta;
    if (loaded) avatar.update(modelTime);
    const d = distance * (camera.aspect < 1.22 ? 1.12 : 1);
    const radius = Math.cos(elevation) * d;
    camera.position.set(target.x + Math.sin(yaw)*radius,target.y + Math.sin(elevation)*d,target.z + Math.cos(yaw)*radius);
    camera.lookAt(target);
    renderer.render(scene,camera);
  });
}

start();
