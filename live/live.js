import {BoardModel, newRoomCode} from './board-model.js';
import {ClassroomPeer} from './rtc.js';
import {MOLECULE_CATALOG} from '../molecule-catalog.js?v=quiet-shape-31';
import {createRoomCast} from './room-cast.js?v=station-room-38';
import {createRoomPointer} from './room-pointer.js?v=station-room-38';
import {mountAppointment} from './appointment.js?v=medieval-lounge-40';
import {mountRoomInvitation, roomCodeFromURL, roomServiceOrigin} from './room-invitation.js?v=trio-online-54';
import {stationView} from './room-sky.js?v=frog-peer-74';
import {createPreviewRoom, isPagesPreview, PREVIEW_NOTICE} from './preview-room.js?v=frog-seat-61';
import {avatarPreference} from './avatar-preference.js?v=frog-seat-61';

import {lookupBoardMolecule, recognizeBoardMolecule, selectCircledInk, strokesAtEraser} from './board-chemistry.js?v=ink-chemboard-42';

const roomService = roomServiceOrigin(document.body.dataset.roomService);
const configurationError = roomService === null ? 'The room service is misconfigured. Contact the classroom host.' : '';
const soloPreview = roomService === '' && isPagesPreview(window.location.hostname);
const previewRoom = soloPreview ? createPreviewRoom({onEvent:applyEvent}) : null;

const $ = id => document.getElementById(id);
const board = new BoardModel();
const canvas = $('board');
const ctx = canvas.getContext('2d');
const workspace = $('workspace');
const lobbyDialog = $('join-dialog');
const moleculePicker = $('molecule-select');
const correction = $('ink-correction');
const avatarMenu = $('avatar-menu');
const avatarButtons = [...avatarMenu.querySelectorAll('[data-avatar]')];
const errors = {
  role_taken:'That role already has an occupant in this room.',
  room_not_found:'Room not found. Ask the teacher to open it and check the code.',
  invalid_join:'Enter a room code with 6–12 letters or digits.',
  invalid_code:'Use 6–12 letters or digits.',
  session_expired:'Your session has expired. Rejoin the classroom.',
  room_full:'Both student seats are occupied. Ask the teacher for another room code.',
  board_full:'The whiteboard is full. Check with the room before clearing it.',
  rate_limited:'Too many requests. Try again in a moment.',
  request_timeout:'The room service took too long to respond. If you were joining, try again in a minute.',
  stale_epoch:'The board was just cleared. That stroke was discarded.',
  invalid_molecule:'This molecule is unavailable.',
  invalid_chemistry:'Circle one formula or name at a time.',
  missing_stroke:'Some of that ink was erased. Write and circle it again.',
  chemistry_full:'Erase one of the three labels to make room for another model.',
  ink_already_linked:'That ink already has a model.',
  teacher_required:'The teacher controls this tool.',
  host_key_required:'This teacher access key was not accepted.',
};
let session = null, generation = 0, joining = false, leaving = false;
const peers = new Map();
let microphone = null, cameraStream = null, pollController = null, sequence = 0;
const capturing = {audio:false,video:false};
let stroke = null, pointerId = null, penColor = '#243447';
let eraser = false, erasePath = null, inkTarget = null, inkRevision = 0, chemistry = [];
let inkNoteUntil = 0;
const pendingPoses=new Map();
let poseTimer=null, sendingPose=false;
let online = false, clearBusy = false, uploadQueue = Promise.resolve(), pendingWrites = 0;
let frame = null;
let hostedCode = null;
let hostFormCode = null;
let checkingEntry = false;
let modelDrag = null;
let currentMolecule = null, confirmedMolecule = null, moleculeRenderer = null, moleculeLoad = null;
let remotePresentation = false, boardDuringPresentation = false, lastCastStream = null, castRevision = 0;
let activeAvatar = avatarPreference.current, trackedHead = null;
const mediaText = text => { $('media-status').textContent = text; };
const boardText = text => { $('board-status').textContent = text; };
const message = error => errors[error.code] || (error.name === 'AbortError' ? 'Connection cancelled.' : error.message || 'Connection unavailable.');
function roomStatus(text) {
  $('connection-status').textContent = soloPreview ? PREVIEW_NOTICE : text;
  if (soloPreview && text) mediaText(text);
}
function updateRoomOccupancy() {
  const capacity = session?.seat ? 3 : 2;
  roomStatus(soloPreview ? '' : `${peers.size+1} / ${capacity} joined`);
}

async function api(path, body, {token = session?.token, signal, keepalive = false} = {}) {
  if (configurationError) throw new Error(configurationError);
  if (previewRoom) return previewRoom.request(path, body, {token});
  const headers = {'Accept':'application/json'};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    const response = await fetch(`${roomService}/live-api/${path}`, {method:body === undefined ? 'GET' : 'POST',headers,body:body === undefined ? undefined : JSON.stringify(body),signal:signal || controller?.signal,keepalive,cache:'no-store',credentials:'omit',redirect:'error'});
    let data;
    try { data = await response.json(); } catch { throw new Error('The room service could not respond. Check the invitation and try again.'); }
    if (!response.ok) { const e = new Error(data.message || 'The request could not be completed. Try again.'); e.code = data.error; e.data = data; throw e; }
    return data;
  } catch (e) {
    if (controller?.signal.aborted) { const timeout = new Error('Request timed out'); timeout.code = 'request_timeout'; throw timeout; }
    throw e;
  } finally { if (timer) clearTimeout(timer); }
}

// Keep the latest pose while a request is in flight, and never replay it into a new room.
function roomPublisher(route, onSaved = () => {}, onFailure = boardText, interval = 85, teacherOnly = true) {
  let pending = null, sending = false;
  return async function publish(value) {
    if (!session || (teacherOnly && session.role!=='teacher') || !online) return;
    pending = {value, generation, token:session.token};
    if (sending) return;
    sending = true;
    try {
      while (pending) {
        const next = pending;
        pending = null;
        if (next.generation !== generation || !online) continue;
        try {
          const result = await api(route, next.value, {token:next.token});
          if (next.generation === generation) onSaved(result);
        } catch (error) {
          if (next.generation === generation) onFailure(message(error), next.value);
        }
        if (interval) await new Promise(resolve => setTimeout(resolve, interval));
      }
    } finally { sending = false; }
  };
}

const sendMolecule = roomPublisher('molecule', result => {
  confirmedMolecule = result.molecule;
}, (note, attempted) => {
  if (currentMolecule === attempted) showMolecule(confirmedMolecule);
  boardText(note);
});
const sendPointer = roomPublisher('pointer');
const sendPresentation = roomPublisher('presentation', undefined, mediaText, 0);
const sendCamera = roomPublisher('camera', undefined, mediaText, 0, false);
const sendAvatar = roomPublisher('avatar', undefined, () => {}, 120, false);
const pointer = createRoomPointer(workspace, canvas, {
  onMove:sendPointer,
  pointOnBoard:point,
  showInScene:state=>{
    if (!stationView.ready) return false;
    stationView.setPointer(state);
    return true;
  },
});
const cast = createRoomCast({onChange:castChanged, onError:error => mediaText(error.message)});

for (const entry of Object.values(MOLECULE_CATALOG)) {
  const option = document.createElement('option');
  option.value = entry.id;
  option.textContent = `${entry.englishName || entry.formula} · ${entry.formula}`;
  moleculePicker.append(option);
}

function renderMolecule() {
  const host = $('molecule-viewport');
  workspace.dataset.molecule = currentMolecule?.id ? 'visible' : 'hidden';
  host.hidden = stationView.ready || !currentMolecule?.id;
  moleculeRenderer?.show(stationView.ready?null:currentMolecule,session?.role==='teacher');
  workspace.dispatchEvent(new CustomEvent('room-molecule-change',{detail:currentMolecule}));
}

function showMolecule(state) {
  currentMolecule = state?.id && Object.hasOwn(MOLECULE_CATALOG,state.id) ? state : null;
  moleculePicker.value = currentMolecule?.id ?? '';
  if (currentMolecule && !stationView.ready && !moleculeLoad) {
    moleculeLoad = import('./room-molecule.js?v=station-room-38').then(({createRoomMolecule}) => {
      moleculeRenderer = createRoomMolecule($('molecule-viewport'), {
        onRotate:next => {
          currentMolecule = next;
          workspace.dispatchEvent(new CustomEvent('room-molecule-change',{detail:next}));
          void sendMolecule(next);
        },
        onError:note => {
          workspace.dataset.molecule = 'hidden';
          boardText(note);
        },
      });
      renderMolecule();
    }).catch(() => {
      workspace.dataset.molecule = 'hidden';
      $('molecule-viewport').hidden = true;
      boardText('The molecule could not be loaded.');
    });
  }
  renderMolecule();
}
workspace.addEventListener('station-ready',renderMolecule);

moleculePicker.addEventListener('change', () => {
  if (session?.role !== 'teacher' || !online) {
    moleculePicker.value = currentMolecule?.id ?? '';
    return;
  }
  const next = {id:moleculePicker.value || null,yaw:0,pitch:0};
  showMolecule(next);
  void sendMolecule(next);
  $('tools').open = false;
});

function updateProjection() {
  const teacher = session?.role === 'teacher';
  const active = teacher ? Boolean(cast.stream) : Boolean(session && remotePresentation);
  const display = teacher ? cast.stream : active ? $('remote-video').srcObject : null;
  const video = $('projected-video');
  const visible = active && !boardDuringPresentation;
  $('projection').hidden = !visible;
  $('projection-toggle').hidden = !active;
  $('projection-toggle').textContent = visible ? 'Show Whiteboard' : 'Show Screen';
  if (video.srcObject !== display) video.srcObject = display;
  $('projection-status').textContent = visible && !display?.getVideoTracks().some(track => !track.muted && track.readyState === 'live') ? 'Waiting for the shared screen…' : '';
  if (visible && display && video.paused) void video.play().catch(() => {});
}

function sendingStream() {
  const tracks=[
    ...((cast.stream || cameraStream)?.getVideoTracks() || []),
    ...(microphone?.getAudioTracks() || []),
  ];
  return tracks.length ? new MediaStream(tracks) : null;
}

async function setPeerStreams() {
  const stream = sendingStream();
  const connectedPeers = [...peers.values()].filter(remote => remote.connection);
  const updates = await Promise.allSettled(connectedPeers.map(remote => remote.connection.setStream(stream)));
  return updates.every(({status},index) => {
    const remote = connectedPeers[index];
    return status==='fulfilled' || peers.get(remote.person.peerId)!==remote;
  });
}

async function castChanged({stream:display}) {
  updateMediaButtons();
  if (lastCastStream === display) return;
  lastCastStream = display;
  boardDuringPresentation = false;
  updateProjection();
  if (session?.role !== 'teacher') return;
  const revision = ++castRevision, roomGeneration = generation;
  const updated = await setPeerStreams();
  if (revision !== castRevision || roomGeneration !== generation) return;
  void sendPresentation({active:Boolean(display)});
  if (display && !updated) mediaText('Some participants may not see the shared screen.');
}

function setPointerMode(enabled) {
  if (enabled) setEraser(false);
  pointer.setEnabled(enabled);
  $('pointer-toggle').setAttribute('aria-pressed',String(enabled));
  $('tools').querySelector('summary').textContent = enabled ? 'End Pointing' : 'Whiteboard Tools';
  workspace.dataset.pointing = String(enabled);
  if (enabled) cancelStroke();
}

$('pointer-toggle').addEventListener('click', () => {
  if (session?.role !== 'teacher' || !online) return;
  setPointerMode(!pointer.isEnabled());
  $('tools').open = false;
});
$('tools').querySelector('summary').addEventListener('click', event => {
  if (!pointer.isEnabled()) return;
  event.preventDefault();
  setPointerMode(false);
});
$('cast-toggle').addEventListener('click', () => {
  if (session?.role !== 'teacher' || !online) return;
  if (cast.stream) cast.stop();
  else void cast.start();
});
$('projection-toggle').addEventListener('click', () => {
  boardDuringPresentation = !boardDuringPresentation;
  updateProjection();
});

function drawStroke(s, width, height) {
  if (!s.points.length) return;
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width * Math.min(width,height) / 1000;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  s.points.forEach(([x,y], i) => i ? ctx.lineTo(x*width,y*height) : ctx.moveTo(x*width,y*height));
  if (s.points.length === 1) { ctx.arc(s.points[0][0]*width,s.points[0][1]*height,ctx.lineWidth/2,0,Math.PI*2); ctx.fill(); }
  else ctx.stroke();
}
function render() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null; const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(rect.width*ratio), height = Math.round(rect.height*ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.clearRect(0,0,width,height);
    board.values().forEach(s => drawStroke(s,width,height));
    if (stroke) drawStroke(stroke,width,height);
    $('board-hint').hidden = board.values().length > 0 || Boolean(stroke);
    workspace.dispatchEvent(new Event('board-ink'));
  });
}
new ResizeObserver(render).observe(canvas);
function cancelStroke() {
  const active = pointerId;
  stroke = null; erasePath = null; pointerId = null;
  if (active !== null && workspace.hasPointerCapture(active)) workspace.releasePointerCapture(active);
  render();
}
function updateChemistry(entries) {
  chemistry = entries;
  workspace.dispatchEvent(new CustomEvent('room-board-chemistry',{detail:entries}));
}
function scheduleChemistryPose(delay=70) {
  if (poseTimer!==null || sendingPose || !pendingPoses.size || !online) return;
  poseTimer=setTimeout(flushChemistryPose,delay);
}
async function flushChemistryPose() {
  poseTimer=null;
  if (!session || !online || sendingPose) return;
  const next=pendingPoses.entries().next().value;
  if (!next) return;
  const [key,change]=next;
  pendingPoses.delete(key);
  if (change.epoch!==board.epoch || !chemistry.some(item=>item.key===key)) { scheduleChemistryPose(); return; }
  sendingPose=true;
  const {token}=session, g=generation;
  try { await api('chemistry-pose',{key,epoch:change.epoch,rotation:change.rotation},{token}); }
  catch (error) {
    if (g===generation && change.epoch===board.epoch && chemistry.some(item=>item.key===key) &&
        !['missing_stroke','stale_epoch','session_expired','teacher_required','invalid_chemistry'].includes(error.code) &&
        !pendingPoses.has(key) && (change.retries || 0)<2) {
      pendingPoses.set(key,{...change,retries:(change.retries || 0)+1});
    }
  } finally { sendingPose=false; scheduleChemistryPose(70); }
}
workspace.addEventListener('room-chemistry-pose',event=>{
  if (soloPreview || session?.role!=='teacher') return;
  const {key,rotation,final}=event.detail;
  if (!chemistry.some(item=>item.key===key)) return;
  pendingPoses.set(key,{rotation,epoch:board.epoch});
  if (final && poseTimer!==null) { clearTimeout(poseTimer); poseTimer=null; }
  scheduleChemistryPose(final?0:70);
});
function updatePresence() {
  const role=soloPreview?null:session?.role || null;
  const seat=role ? session.seat || role : null;
  if (role) {
    workspace.dataset.roomRole=role;
    workspace.dataset.seat=seat;
  } else {
    delete workspace.dataset.roomRole;
    delete workspace.dataset.seat;
  }
  const detail={role,seat,peers:role ? [...peers.values()].map(remote=>remote.person) : []};
  workspace.dispatchEvent(new CustomEvent('room-presence',{detail}));
}
function syncAvatar() {
  if (!soloPreview && session) void sendAvatar({avatar:activeAvatar,...trackedHead});
}
function renderAvatarChoice() {
  avatarMenu.hidden=false;
  $('look-in-mirror').hidden=Boolean(session);
  workspace.dataset.avatar=activeAvatar;
  if (session) workspace.dispatchEvent(new Event('room-local-avatar'));
  for (const button of avatarButtons) {
    button.setAttribute('aria-pressed',String(button.dataset.avatar===activeAvatar));
    if (button.dataset.avatar==='orange-cat') {
      button.textContent=avatarPreference.unlocked?'Orange Cat':'Unlock Orange Cat';
    }
  }
}
avatarPreference.subscribe(()=>{
  const changed=activeAvatar!==avatarPreference.current;
  activeAvatar=avatarPreference.current;
  if (changed) trackedHead=null;
  renderAvatarChoice();
  if (changed) syncAvatar();
});
for (const button of avatarButtons) {
  button.addEventListener('click',()=>{
    avatarPreference.select(button.dataset.avatar);
    avatarMenu.open=false;
    avatarMenu.querySelector('summary').focus();
  });
}
renderAvatarChoice();
document.addEventListener('pointerdown',event=>{
  if (avatarMenu.open && !avatarMenu.contains(event.target)) avatarMenu.open=false;
});
document.addEventListener('keydown',event=>{
  if (event.key!=='Escape' || !avatarMenu.open) return;
  avatarMenu.open=false;
  avatarMenu.querySelector('summary').focus();
  event.preventDefault();
});
workspace.addEventListener('room-avatar-choice',event=>{
  if (session) avatarPreference.select(event.detail);
});
workspace.addEventListener('room-vr-mode',event=>{
  if (!event.detail && trackedHead) { trackedHead=null; syncAvatar(); }
});
workspace.addEventListener('room-avatar-head',event=>{
  if (!session || soloPreview) return;
  trackedHead=event.detail;
  syncAvatar();
});
workspace.addEventListener('station-ready',updatePresence);
workspace.addEventListener('station-ready',()=>updateChemistry(chemistry));
function cancelInkSelection() {
  inkRevision++; inkTarget=null;
  if (correction.open) correction.close();
}
function setEraser(enabled) {
  eraser=enabled;
  $('eraser').setAttribute('aria-pressed',String(enabled));
  workspace.dataset.eraser=String(enabled);
}
function inkNote(text) { inkNoteUntil=performance.now()+3500; boardText(text); }
const aspect = () => canvas.clientWidth / canvas.clientHeight || 2.1;
function addInkPoint(path, next) {
  const last = path.at(-1);
  if (last && Math.hypot(last[0]-next[0],last[1]-next[1]) < .0005) return;
  if (path.length >= 512) path.splice(0,path.length,...path.filter((_,i)=>i%2===0 || i===path.length-1));
  path.push(next);
}
function updateBoardStatus() {
  if (performance.now()<inkNoteUntil) return;
  if (soloPreview) { boardText('Whiteboard · this tab only'); return; }
  if (!online) boardText('Reconnecting. Writing is paused.');
  else if (pendingWrites) boardText(`Syncing ${pendingWrites}…`);
  else boardText(peers.size ? 'Whiteboard synced' : 'Whiteboard ready');
}
function queueBoard(operation) {
  if (!session || !online || clearBusy) return Promise.resolve(false);
  const {token}=session, epoch=board.epoch, g=generation;
  if (pendingWrites>=12) { inkNote('The connection is busy. Try again in a moment.'); return Promise.resolve(false); }
  if (operation.stroke) board.addPending(operation.stroke);
  pendingWrites++; render(); updateBoardStatus();
  const task=uploadQueue.then(async()=>{
    if (g!==generation || epoch!==board.epoch) return false;
    try { await api('board',{epoch,...operation},{token}); return g===generation && epoch===board.epoch; }
    catch(error) {
      if (g!==generation || epoch!==board.epoch) return false;
      if (operation.stroke) board.reject(operation.stroke.id);
      if (error.code==='stale_epoch') cancelStroke();
      inkNote(message(error)); render(); return false;
    }
  }).finally(()=>{
    if (g===generation) {
      pendingWrites--;
      if (!pendingWrites && online) setTimeout(()=>{if (g===generation) updateBoardStatus();},3600);
    }
  });
  uploadQueue=task;
  return task;
}
function addSelectedModel(target,id) {
  if (target.g!==generation || target.epoch!==board.epoch || target.revision!==inkRevision) return;
  if (!stationView.ready) { inkNote('This browser cannot display the 3D classroom.'); return; }
  void queueBoard({chemistry:{key:crypto.randomUUID(),id,strokes:target.strokes}});
}
async function identifyInk(selected,ratio) {
  if (!soloPreview && session?.role!=='teacher') { inkNote('The teacher opens 3D models.'); return; }
  cancelInkSelection();
  const ids=selected.map(ink=>ink.id);
  if (chemistry.some(item=>item.strokes.some(id=>ids.includes(id)))) { inkNote('Circle only ink that has no model yet.'); return; }
  if (chemistry.length>=3) { inkNote(errors.chemistry_full); return; }
  const target={g:generation,epoch:board.epoch,revision:inkRevision,strokes:ids};
  let result;
  try { result=await recognizeBoardMolecule(selected,ratio); } catch { result={text:'',ids:[]}; }
  if (!session || target.g!==generation || target.epoch!==board.epoch || target.revision!==inkRevision) return;
  if (result.ids.length===1) { addSelectedModel(target,result.ids[0]); return; }
  inkTarget=target;
  $('ink-name').value=result.text;
  $('ink-correction-status').textContent='';
  correction.showModal();
  $('ink-name').select();
}
$('ink-cancel').addEventListener('click',cancelInkSelection);
correction.addEventListener('close',()=>{ if (!correction.open) inkTarget=null; });
$('ink-correction-form').addEventListener('submit',event=>{
  event.preventDefault();
  if (!inkTarget) return;
  const {ids}=lookupBoardMolecule($('ink-name').value);
  if (ids.length!==1) {
    $('ink-correction-status').textContent=ids.length ? 'Try a more specific chemical name.' : 'No ChemBoard model matches that name or formula.';
    return;
  }
  const target=inkTarget; correction.close(); inkTarget=null;
  addSelectedModel(target,ids[0]);
});
function point(event, clamp=false) {
  if (stationView.ready) return stationView.boardPoint(event,clamp);
  const rect=canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x=(event.clientX-rect.left)/rect.width, y=(event.clientY-rect.top)/rect.height;
  if (!clamp && (x<0 || x>1 || y<0 || y>1)) return null;
  return [Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))];
}
workspace.addEventListener('pointerdown', e => {
  if (!session || e.altKey || (e.pointerType==='mouse' && e.button!==0)) return;
  const chemKey=stationView.ready && (soloPreview || session.role==='teacher') && !eraser && !pointer.isEnabled() ? stationView.boardChemHit(e) : null;
  if (chemKey || (stationView.ready && !eraser && currentMolecule && online && session.role==='teacher' && stationView.hitModel(e))) {
    if (pointerId!==null || modelDrag) return;
    e.preventDefault();
    modelDrag={id:e.pointerId,x:e.clientX,y:e.clientY,chemKey};
    workspace.setPointerCapture(e.pointerId);
    return;
  }
  if (!stationView.ready && e.target!==canvas) return;
  const start=point(e);
  if (!start) return;
  e.preventDefault();
  if (!online || clearBusy || pointer.isEnabled() || pointerId!==null || modelDrag || !$('projection').hidden) return;
  pointerId=e.pointerId; workspace.setPointerCapture(pointerId);
  if (eraser) erasePath=[start];
  else stroke={id:crypto.randomUUID(),color:penColor,width:Number($('pen-width').value),points:[start]};
  render();
});
workspace.addEventListener('pointermove', e => {
  if (modelDrag?.id===e.pointerId && modelDrag.chemKey) {
    stationView.boardChemRotate(modelDrag.chemKey,(e.clientX-modelDrag.x)*.018,(e.clientY-modelDrag.y)*.018);
    modelDrag.x=e.clientX; modelDrag.y=e.clientY; return;
  }
  if (modelDrag?.id===e.pointerId && currentMolecule && online) {
    const yaw=currentMolecule.yaw+(e.clientX-modelDrag.x)*.018;
    const pitch=currentMolecule.pitch+(e.clientY-modelDrag.y)*.018;
    modelDrag.x=e.clientX; modelDrag.y=e.clientY;
    const tau=Math.PI*2;
    const next={id:currentMolecule.id,yaw:((yaw+Math.PI)%tau+tau)%tau-Math.PI,pitch:Math.max(-1.35,Math.min(1.35,pitch))};
    currentMolecule=next;
    workspace.dispatchEvent(new CustomEvent('room-molecule-change',{detail:next}));
    void sendMolecule(next);
    return;
  }
  if (stationView.ready && e.pointerType==='mouse') {
    workspace.dataset.cursor = point(e) ? pointer.isEnabled()?'hand':$('projection').hidden?'board':'screen' : 'look';
  }
  if (e.pointerId!==pointerId || !online) return;
  const position=point(e,true);
  if (!position) return;
  if (erasePath) addInkPoint(erasePath,position);
  else if (stroke) { addInkPoint(stroke.points,position); render(); }
});
function finishStroke(e) {
  if (modelDrag?.id===e.pointerId) {
    if (modelDrag.chemKey) stationView.boardChemFinish(modelDrag.chemKey);
    modelDrag=null;
  }
  if (e.pointerId!==pointerId) return;
  if (e.type!=='pointerup') { cancelStroke(); return; }
  const completed=stroke, trail=erasePath, ratio=aspect();
  const last=point(e,true);
  if (last && (trail || completed)) addInkPoint(trail || completed.points,last);
  cancelStroke();
  if (trail) {
    const erased=strokesAtEraser(trail,board.values(),ratio);
    for (let i=0;i<erased.length;i+=128) void queueBoard({erase:erased.slice(i,i+128)});
  } else if (completed) {
    const selected=selectCircledInk(completed.points,board.values(),ratio);
    if (selected?.length && (soloPreview || session?.role==='teacher')) void identifyInk(selected,ratio);
    else void queueBoard({stroke:completed});
  }
}
workspace.addEventListener('pointerup', finishStroke);
workspace.addEventListener('pointercancel', finishStroke);
workspace.addEventListener('lostpointercapture', finishStroke);
$('eraser').addEventListener('click',()=>{
  cancelStroke();
  if (!eraser && pointer.isEnabled()) setPointerMode(false);
  setEraser(!eraser);
  if (eraser) $('tools').open=false;
});
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
  setEraser(false); penColor=button.dataset.color; document.querySelectorAll('[data-color]').forEach(b => { const selected=b===button; b.classList.toggle('active',selected); b.setAttribute('aria-pressed',String(selected)); });
}));
$('clear').addEventListener('click', async () => {
  if (!session || !online || clearBusy || !window.confirm(soloPreview ? 'Clear this preview whiteboard? This cannot be undone.' : 'Clear the shared whiteboard for everyone? This cannot be undone.')) return;
  clearBusy=true; $('clear').disabled=true; cancelStroke(); const g=generation;
  try { await uploadQueue; if (g!==generation) return; const cleared=await api('board',{epoch:board.epoch,clear:true});
    if (g===generation && board.clear(cleared.epoch)) { cancelInkSelection(); updateChemistry([]); render(); } }
  catch(e) { if(g===generation) boardText(message(e)); }
  finally { if(g===generation) { clearBusy=false; $('clear').disabled=false; } }
});

function updateAudioButton() {
  $('play-remote').hidden = ![...peers.values()].some(remote => remote.audioBlocked);
}

async function playRemoteAudio(remote) {
  const {audio} = remote;
  const stream = audio?.srcObject;
  if (!stream) return true;
  let playing = true;
  try { await audio.play(); }
  catch { playing = false; }
  if (peers.get(remote.person.peerId)===remote && audio.srcObject===stream) {
    remote.audioBlocked = !playing;
    updateAudioButton();
    return playing;
  }
  return true;
}

function removePeer(peerId) {
  const remote = peers.get(peerId);
  if (!remote) return false;
  peers.delete(peerId);
  if (remote.audio) {
    remote.audio.srcObject = null;
    remote.audio.remove();
  }
  remote.connection?.close();
  return true;
}

function showRemoteVideo() {
  const presenting=session?.role==='student' && remotePresentation;
  const sources=[...peers.values()];
  const source=sources.find(remote => presenting ? remote.person.role==='teacher' : remote.person.cameraActive);
  const display=source?.stream?.getVideoTracks().length ? source.stream : null;
  const video=$('remote-video');
  if (video.srcObject!==display) video.srcObject=display;
  const track=display?.getVideoTracks()[0];
  const active=Boolean(source && !presenting);
  workspace.dataset.remoteCamera=String(active);
  $('remote-display').hidden=!(active && track?.readyState==='live' && !track.muted);
  if (active && display && video.paused) void video.play().catch(()=>{});
  updateProjection();
}

function updateRemoteMedia() {
  updatePresence();
  updateAudioButton();
  showRemoteVideo();
}

function reportCallState() {
  const states = [...peers.values()].map(remote => remote.state);
  if (states.includes('failed') || states.includes('disconnected')) {
    mediaText(states.includes('connected') ? 'One voice connection was interrupted.' : 'Voice was interrupted. Rejoin to retry.');
  } else if (states.includes('connecting')) {
    mediaText('Connecting voice…');
  } else if (states.includes('connected')) {
    mediaText('Voice connected');
  }
}

function upsertPeer(person) {
  const {peerId:target,role}=person;
  if (!target || target===session.peerId) return;
  const peerView={...person,seat:person.seat || role};
  const existing=peers.get(target);
  if (existing) { existing.person=peerView; return; }
  const remote={person:peerView,connection:null,stream:null,audio:null,audioBlocked:false,state:'new'};
  peers.set(target,remote);
  if (!globalThis.RTCPeerConnection) {
    mediaText('Voice is unavailable in this browser. The whiteboard is ready.');
    return;
  }
  const g=generation, token=session.token;
  const isCurrent=()=>g===generation && peers.get(target)===remote;
  const onFailure=()=>{
    if (!isCurrent()) return;
    remote.state='failed';
    reportCallState();
  };
  try {
    remote.connection=new ClassroomPeer({
      // Every peer pair must choose opposite sides, including two students.
      polite:session.peerId>target,
      iceServers:session.iceServers || [],
      send:async payload=>{
        if (!isCurrent()) return;
        try { await api('signal',{target,...payload},{token}); }
        catch (error) { if (isCurrent() && error.code!=='peer_not_found') throw error; }
      },
      onStream:stream=>{
        if (!isCurrent()) return;
        remote.stream=stream;
        const audioTracks=stream.getAudioTracks();
        if (audioTracks.length && remote.audio?.srcObject?.getAudioTracks()[0]!==audioTracks[0]) {
          if (!remote.audio) {
            remote.audio=document.createElement('audio');
            remote.audio.autoplay=true;
            $('remote-audio').append(remote.audio);
          }
          remote.audio.srcObject=new MediaStream(audioTracks);
          void playRemoteAudio(remote);
        }
        for (const track of stream.getVideoTracks()) {
          const update=()=>{ if (isCurrent()) showRemoteVideo(); };
          track.onunmute=update;
          track.onmute=update;
          track.onended=update;
        }
        showRemoteVideo();
      },
      onState:state=>{
        if (!isCurrent()) return;
        remote.state=state;
        reportCallState();
      },
      onError:onFailure,
    });
    void remote.connection.setStream(sendingStream()).catch(onFailure);
  } catch { onFailure(); }
}

function reconcilePeers(list) {
  // Keep active calls when reconnecting to the room's event stream.
  const ids=new Set(list.map(person=>person.peerId));
  for (const id of peers.keys()) if (!ids.has(id)) removePeer(id);
  for (const person of list) upsertPeer(person);
  updateRemoteMedia();
  reportCallState();
}

function updateMediaButtons() {
  const micOn=Boolean(microphone?.getAudioTracks().some(track=>track.enabled && track.readyState==='live'));
  const videoOn=Boolean(cameraStream?.getVideoTracks().some(track=>track.readyState==='live' && track.enabled));
  $('start-media').disabled=capturing.audio;
  $('start-media').hidden=soloPreview || Boolean(microphone);
  $('mute').hidden=!microphone;
  $('stop-media').hidden=true;
  $('mute').textContent='Mute Mic';
  $('mute').setAttribute('aria-pressed',String(micOn));
  $('camera-toggle').hidden=true;
  $('camera-toggle').disabled=true;
  $('camera-toggle').textContent=videoOn?'Turn Off Camera':'Enable Camera';
  $('camera-toggle').setAttribute('aria-pressed',String(videoOn));
  workspace.dataset.localCamera=String(videoOn && !cast.stream);
  $('local-display').hidden=!videoOn || Boolean(cast.stream);
  const localVideo=$('local-video');
  if (localVideo.srcObject!==cameraStream) {
    localVideo.srcObject=cameraStream;
    if (cameraStream) void localVideo.play().catch(()=>{});
  }
  $('cast-toggle').hidden=session?.role!=='teacher';
  $('cast-toggle').disabled=cast.busy;
  $('cast-toggle').textContent=cast.stream?(soloPreview?'Stop Projection':'Stop Sharing'):(soloPreview?'Project Screen':'Share Screen');
  $('cast-toggle').setAttribute('aria-pressed',String(Boolean(cast.stream)));
}

async function stopCapture(kind) {
  const source=kind==='video'?cameraStream:microphone;
  if (kind==='video') cameraStream=null;
  else microphone=null;
  source?.getTracks().forEach(track=>track.stop());
  updateMediaButtons();
  if (kind==='video') void sendCamera({active:false});
  return setPeerStreams();
}

async function startCapture(kind) {
  const isVideo=kind==='video';
  const device=isVideo?'camera':'microphone';
  if (soloPreview || isVideo || !session || capturing[kind] || (isVideo?cameraStream:microphone)) return;
  if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    mediaText('Device access requires localhost or a secure HTTPS page.');
    return;
  }
  const g=generation;
  capturing[kind]=true;
  updateMediaButtons();
  mediaText('Allow the '+device+' in your browser.');
  let acquired=null;
  try {
    acquired=await navigator.mediaDevices.getUserMedia({
      video:isVideo?{width:{ideal:960},height:{ideal:720},frameRate:{ideal:20,max:30}}:false,
      audio:isVideo?false:{echoCancellation:true,noiseSuppression:true},
    });
    if (g!==generation || !session) {
      acquired.getTracks().forEach(track=>track.stop());
      return;
    }
    const track=acquired.getTracks().find(item=>item.kind===kind && item.readyState==='live');
    if (!track) {
      acquired.getTracks().forEach(item=>item.stop());
      throw new Error('No live '+device+' track');
    }
    if (isVideo) cameraStream=acquired;
    else microphone=acquired;
    updateMediaButtons();
    track.addEventListener('ended',()=>{
      if ((isVideo?cameraStream:microphone)===acquired) void stopCapture(kind).catch(()=>{});
    },{once:true});
    const updated=await setPeerStreams();
    if (g!==generation || (isVideo?cameraStream:microphone)!==acquired) return;
    if (isVideo) void sendCamera({active:true});
    mediaText(isVideo?'Camera is on':updated?'Microphone is on':'Microphone is on. Some participants may not hear you.');
  } catch(error) {
    if (g!==generation) return;
    if (acquired && (isVideo?cameraStream:microphone)===acquired) {
      await stopCapture(kind).catch(()=>{});
    }
    if (g!==generation) return;
    if (error.name==='NotAllowedError') mediaText('Permission for the '+device+' was declined.');
    else if (error.name==='NotFoundError') mediaText('No '+device+' was found.');
    else mediaText('Could not start the '+device+'. Try again.');
  } finally {
    if (g===generation) {
      capturing[kind]=false;
      updateMediaButtons();
    }
  }
}

$('start-media').addEventListener('click',()=>void startCapture('audio'));
$('camera-toggle').addEventListener('click',()=>{
  if (cameraStream) void stopCapture('video').catch(()=>mediaText('Could not update the camera.'));
  else void startCapture('video');
});
$('stop-media').addEventListener('click',()=>void stopCapture('audio').catch(()=>mediaText('Could not update the microphone.')));
$('mute').addEventListener('click',()=>{
  const g=generation;
  void stopCapture('audio').then(()=>{
    if (g===generation && !microphone) mediaText('Microphone is off');
  }).catch(()=>{ if (g===generation) mediaText('Could not update the microphone.'); });
});
$('play-remote').addEventListener('click',()=>{
  const g=generation;
  void Promise.all([...peers.values()].map(playRemoteAudio)).then(results=>{
    if (g===generation && results.includes(false)) mediaText('Allow audio playback in your browser.');
  });
});

function applyEvent(event) {
  if (event.type==='peer-joined') {
    upsertPeer(event.peer || {peerId:event.peerId,role:session.role==='teacher'?'student':'teacher'});
    updateRemoteMedia();
  }
  else if(event.type==='peer-left' && removePeer(event.peer?.peerId || event.peerId)) {
    updateRemoteMedia();
    if (peers.size) reportCallState();
    else mediaText(microphone || cameraStream ? 'Your devices are still on' : '');
  }
  else if(event.type==='peer-camera') {
    const remote=peers.get(event.peerId);
    if (remote) {
      remote.person.cameraActive=event.active;
      showRemoteVideo();
    }
  }
  else if(event.type==='peer-avatar') {
    const remote=peers.get(event.peerId);
    if (remote) {
      const {avatar,headYaw,headPitch}=event.peer ?? event;
      Object.assign(remote.person,{avatar,headYaw,headPitch});
      updatePresence();
    }
  }
  else if(event.type==='signal') { void peers.get(event.peerId)?.connection?.receive(event); }
  else if(event.type==='board-stroke') { board.accept(event.epoch,event.stroke); render(); }
  else if(event.type==='board-erase' && event.epoch===board.epoch) {
    const erased=new Set(event.erase);
    for (const id of erased) { board.strokes.delete(id); board.reject(id); }
    if (inkTarget?.strokes.some(id=>erased.has(id))) cancelInkSelection();
    updateChemistry(chemistry.filter(item=>!item.strokes.some(id=>erased.has(id)))); render();
  }
  else if(event.type==='board-chemistry' && event.epoch===board.epoch && !chemistry.some(item=>item.key===event.chemistry.key)) {
    updateChemistry([...chemistry,event.chemistry]);
  }
  else if(event.type==='chemistry-pose' && event.epoch===board.epoch) {
    if (chemistry.some(item=>item.key===event.key)) {
      updateChemistry(chemistry.map(item=>item.key===event.key?{...item,rotation:event.rotation}:item));
    }
  }
  else if(event.type==='board-clear') { if(board.clear(event.epoch)) { cancelStroke(); cancelInkSelection(); updateChemistry([]); render(); } }
  else if(event.type==='molecule-state' && session.role==='student') showMolecule(event.molecule);
  else if(event.type==='pointer-state' && session.role==='student') pointer.show(event.pointer);
  else if(event.type==='presentation-state' && session.role==='student') {
    remotePresentation = event.presentation.active;
    boardDuringPresentation = false;
    showRemoteVideo();
  }
  else if(event.type==='resync') {
    if (board.adoptSnapshot(event.epoch,event.board)) { cancelStroke(); cancelInkSelection(); updateChemistry(event.chemistry || []); render(); }
    if (session.role==='student') {
      showMolecule(event.molecule);
      pointer.show(event.pointer);
      remotePresentation = Boolean(event.presentation?.active);
    }
    reconcilePeers(event.peers);
  }
}
async function poll(g) {
  let failures=0;
  while(g===generation&&session) {
    const controller=new AbortController(); pollController=controller;
    const timeout=setTimeout(()=>controller.abort(),30000);
    try {
      const result=await api(`events?after=${sequence}`,undefined,{signal:controller.signal});
      if(g!==generation) return;
      for(const event of result.events) applyEvent(event);
      const reconnected = !online;
      sequence=result.sequence; online=true; failures=0;
      if (reconnected) scheduleChemistryPose(0);
      if (reconnected) syncAvatar();
      if (reconnected && cameraStream) void sendCamera({active:true});
      if (reconnected && session.role==='teacher') {
        void sendPointer({active:false,x:0,y:0});
        void sendPresentation({active:Boolean(cast.stream)});
      }
      updateRoomOccupancy(); updateBoardStatus();
    } catch(e) {
      if(g!==generation) return;
      if(e.code==='session_expired') { await leave(message(e)); return; }
      online=false; cancelStroke(); setPointerMode(false); pointer.show(null);
      failures++; roomStatus('Reconnecting…'); updateBoardStatus();
      if(failures>=7) { await leave('The connection could not recover. Reopen the invitation and rejoin.'); return; }
      await new Promise(resolve=>setTimeout(resolve,Math.min(500*2**failures,5000)));
    } finally { clearTimeout(timeout); }
  }
}
async function leave(note='',unloading=false) {
  if (leaving) return;
  leaving=true;
  const previous=session, g=++generation; session=null; online=false; joining=false; pollController?.abort(); cancelStroke();
  trackedHead=null; renderAvatarChoice();
  modelDrag=null;
  pendingPoses.clear(); clearTimeout(poseTimer); poseTimer=null;
  cast.stop(); remotePresentation=false; boardDuringPresentation=false;
  setPointerMode(false); pointer.show(null); confirmedMolecule=null; showMolecule(null);
  // Release the role before allowing a new join. On pagehide, start keepalive
  // immediately, before an awaited device cleanup can yield to page teardown.
  let released=true;
  const release=previous ? api('leave',{}, {token:previous.token,keepalive:unloading}).catch(()=>{released=false;}) : Promise.resolve();
  for (const id of peers.keys()) removePeer(id);
  updateRemoteMedia();
  for (const dialog of [$('share-dialog'),$('host-dialog')]) if (dialog.open) dialog.close();
  for (const source of [microphone,cameraStream]) source?.getTracks().forEach(track=>track.stop());
  microphone=null; cameraStream=null; capturing.audio=false; capturing.video=false;
  pendingWrites=0; uploadQueue=Promise.resolve(); clearBusy=false;
  board.reset(0,[]); cancelInkSelection(); updateChemistry([]); setEraser(false); inkNoteUntil=0; $('room').hidden=true; $('lobby').hidden=false;
  document.body.dataset.station='lounge';
  document.title='The Common Room · Boundless Classroom';
  renderAvatarChoice();
  $('room-header').hidden=true; $('preview-label').hidden=false; $('tools').open=false;
  setJoinBusy(true); $('clear').disabled=false;
  joinStatus(previous?'Leaving the classroom…':note); updateMediaButtons();
  await release;
  if (g!==generation) return;
  leaving=false; setJoinBusy(false);
  joinStatus(released?note:'Your devices are off. If your role is still occupied, try rejoining in a minute.');
}
$('leave').addEventListener('click',()=>{void leave('',true);});
window.addEventListener('pagehide',()=>{leave('',true);});
function setJoinBusy(busy) {
  $('join').disabled=busy;
  $('create-room').disabled=busy;
  $('close-entry').disabled=busy;
  $('open-appointment').disabled=busy;
  $('appointment-open').disabled=busy;
  $('choose-live').disabled=busy;
  $('host-form').querySelector('[type="submit"]').disabled=busy;
}

function joinStatus(note) {
  $('lobby-status').textContent=lobbyDialog.open?'':note;
  $('join-status').textContent=lobbyDialog.open?note:'';
}

$('choose-live').addEventListener('click', () => {
  lobbyDialog.showModal();
  joinStatus(configurationError);
});
$('close-entry').addEventListener('click', () => lobbyDialog.close());
lobbyDialog.addEventListener('cancel', event => {
  if (joining || leaving) event.preventDefault();
});
$('room-title').addEventListener('click', async () => {
  if (!session) return;
  const code=session.code;
  try { await navigator.clipboard.writeText(code); if (session?.code===code) mediaText('Room code copied'); }
  catch { if (session?.code===code) void shareInvitation(appointments.invitationFor(code)); }
});
$('join-form').addEventListener('submit', event => {
  event.preventDefault();
  const code=$('room-code').value.trim().toUpperCase();
  void (code===hostedCode?openTeacherRoom(code):joinRoom('student',code));
});
$('create-room').addEventListener('click', () => void openTeacherRoom(newRoomCode()));

async function openTeacherRoom(code) {
  if (checkingEntry || joining || leaving || session) return;
  if (soloPreview) return joinRoom('teacher',code);
  checkingEntry=true; setJoinBusy(true);
  let config;
  try { config=await api('config'); }
  catch(error) { joinStatus(message(error)); return; }
  finally { checkingEntry=false; setJoinBusy(false); }
  if (!config.hostKeyRequired) return joinRoom('teacher',code);
  hostFormCode=code;
  if (lobbyDialog.open) lobbyDialog.close();
  $('host-feedback').textContent='';
  $('host-dialog').showModal();
  $('host-key').focus();
}
$('close-host').addEventListener('click',()=>{if (!joining) $('host-dialog').close();});
$('host-dialog').addEventListener('cancel',event=>{if (joining) event.preventDefault();});
$('host-dialog').addEventListener('close',()=>{hostFormCode=null; $('host-key').value='';});
$('host-form').addEventListener('submit',event=>{
  event.preventDefault();
  if (!hostFormCode || joining) return;
  const hostKey=$('host-key').value;
  $('host-key').value='';
  $('host-feedback').textContent='Opening the classroom…';
  void joinRoom('teacher',hostFormCode,hostKey);
});

async function joinRoom(role, code, hostKey) {
  if(joining||leaving||session) return;
  if (soloPreview) role='teacher';
  joining=true; const g=++generation; setJoinBusy(true); joinStatus('Opening the classroom…');
  try {
    const joined=await api('join',{code,role,...(hostKey?{hostKey}:{})});
    if(g!==generation) { api('leave',{}, {token:joined.token}).catch(()=>{}); return; }
    session={...joined,role,code}; sequence=joined.sequence; online=true; board.reset(joined.epoch,joined.board); updateChemistry(joined.chemistry || []);
    activeAvatar=avatarPreference.current; trackedHead=null;
    renderAvatarChoice();
    if (activeAvatar!=='simple') syncAvatar();
    if (role==='teacher') hostedCode=code;
    if (!soloPreview && role==='student') {
      const returnURL=new URL(window.location.href);
      returnURL.searchParams.set('room',code);
      try { history.replaceState(null,'',returnURL); } catch { /* The room still works in embedded browsers. */ }
    }
    $('room-code').value=code;
    lobbyDialog.close();
    if ($('host-dialog').open) $('host-dialog').close();
    joinStatus('');
    $('lobby').hidden=true; $('room').hidden=false; $('room-title').textContent=code;
    document.body.dataset.station='classroom';
    document.title='Classroom · Boundless Classroom';
    $('room-title').setAttribute('aria-label',`Copy room code ${code}`);
    $('room-header').hidden=false; $('preview-label').hidden=true;
    $('share-room').hidden=role!=='teacher';
    $('teacher-tools').hidden=role!=='teacher'; workspace.dataset.role=role;
    updatePresence();
    confirmedMolecule=joined.molecule;
    showMolecule(joined.molecule);
    pointer.show(joined.pointer);
    remotePresentation=Boolean(joined.presentation?.active);
    updateProjection();
    $('self-caption').textContent=role==='teacher'?'You · Teacher':'You · Student'; $('remote-caption').textContent=role==='teacher'?'Student':'Teacher';
    mediaText(''); updateMediaButtons(); reconcilePeers(joined.peers); updateRoomOccupancy(); updateBoardStatus(); render();
    window.scrollTo(0,0);
    $('room').focus({preventScroll:true});
    if (!soloPreview) poll(g);
  } catch(error) {
    if (g!==generation) return;
    if ($('host-dialog').open) { $('host-feedback').textContent=message(error); $('host-key').focus(); }
    else joinStatus(message(error));
  }
  finally { if(g===generation) { joining=false; setJoinBusy(false); } }
}

const shareInvitation = mountRoomInvitation({
  live:Boolean(roomService),
  configurationError,
  onStatus:note => session ? roomStatus(note) : joinStatus(note),
});
const appointments = mountAppointment({
  newRoomCode,
  onOpenRoom:openTeacherRoom,
  onStatus:joinStatus,
  onShare:shareInvitation,
});
$('share-room').addEventListener('click', () => {
  if (session?.role==='teacher') void shareInvitation(appointments.invitationFor(session.code));
});

const invitedCode = roomCodeFromURL(window.location.href);
if (invitedCode) {
  $('room-code').value = invitedCode;
  lobbyDialog.showModal();
  joinStatus(configurationError || (soloPreview ? 'This link opens your own preview. Live sessions are not connected.' :
    'Invitation ready. Join as a student when the teacher has opened the room.'));
} else if (configurationError) {
  joinStatus(configurationError);
}

if (soloPreview) {
  $('board').setAttribute('aria-label','Preview whiteboard. Write with a mouse or stylus; contents stay in this tab.');
  document.querySelector('.board-panel').setAttribute('aria-label','Preview whiteboard');
  document.querySelector('.appointment-note').textContent='Saved in this browser only. Invitations open independent previews; they do not book a live lesson.';
  if (!invitedCode) joinStatus(PREVIEW_NOTICE);
  updateMediaButtons();
}
