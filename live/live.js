import {BoardModel, newRoomCode} from './board-model.js';
import {ClassroomPeer} from './rtc.js';
import {MOLECULE_CATALOG} from '../molecule-catalog.js?v=quiet-shape-31';
import {createRoomCast} from './room-cast.js?v=station-room-38';
import {createRoomPointer} from './room-pointer.js?v=station-room-38';
import {mountAppointment} from './appointment.js?v=medieval-lounge-40';
import {mountRoomInvitation, roomCodeFromURL} from './room-invitation.js?v=medieval-lounge-40';
import {stationView} from './room-sky.js?v=medieval-lounge-40';
import {createPreviewRoom, isPagesPreview, PREVIEW_NOTICE} from './preview-room.js?v=medieval-lounge-40';

const soloPreview = isPagesPreview(window.location.hostname);
const previewRoom = soloPreview ? createPreviewRoom({onEvent:applyEvent}) : null;

const $ = id => document.getElementById(id);
const board = new BoardModel();
const canvas = $('board');
const ctx = canvas.getContext('2d');
const workspace = $('workspace');
const lobbyDialog = $('join-dialog');
const moleculePicker = $('molecule-select');
const errors = {
  role_taken:'This room already has someone in that role.',
  room_not_found:'Room not found. Ask the teacher to open it and check the code.',
  invalid_join:'Enter a room code with 6–12 letters or digits.',
  invalid_code:'Use 6–12 letters or digits.',
  session_expired:'Your session has expired. Rejoin the classroom.',
  room_full:'This classroom is full. Try another room code.',
  board_full:'The whiteboard is full. Agree with your partner before clearing it.',
  rate_limited:'Too many requests. Try again in a moment.',
  request_timeout:'The local server took too long to respond. If you were joining, try again in a minute.',
  stale_epoch:'The board was just cleared. That stroke was discarded.',
  invalid_molecule:'This molecule is unavailable.',
  teacher_required:'The teacher controls this tool.',
};
let session = null, generation = 0, joining = false, leaving = false, peer = null, other = null;
let microphone = null, cameraStream = null, pollController = null, sequence = 0;
const capturing = {audio:false,video:false};
let stroke = null, flushTimer = null, pointerId = null, penColor = '#243447';
let online = false, clearBusy = false, uploadQueue = Promise.resolve(), pendingWrites = 0;
let frame = null;
let hostedCode = null;
let modelDrag = null;
let currentMolecule = null, confirmedMolecule = null, moleculeRenderer = null, moleculeLoad = null;
let remotePresentation = false, boardDuringPresentation = false, lastCastStream = null, castRevision = 0;
const mediaText = text => { $('media-status').textContent = text; };
const boardText = text => { $('board-status').textContent = text; };
const message = error => errors[error.code] || (error.name === 'AbortError' ? 'Connection cancelled.' : error.message || 'Connection unavailable.');
function roomStatus(text) {
  $('connection-status').textContent = soloPreview ? PREVIEW_NOTICE : text;
  if (soloPreview && text && !/^(Waiting |Both participants)/.test(text)) mediaText(text);
}

async function api(path, body, {token = session?.token, signal, keepalive = false} = {}) {
  if (previewRoom) return previewRoom.request(path, body, {token});
  const headers = {'Accept':'application/json'};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    const response = await fetch(`/live-api/${path}`, {method:body === undefined ? 'GET' : 'POST',headers,body:body === undefined ? undefined : JSON.stringify(body),signal:signal || controller?.signal,keepalive,cache:'no-store',credentials:'omit'});
    let data;
    try { data = await response.json(); } catch { throw new Error('Open this classroom from the local preview.'); }
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

async function castChanged({stream:display}) {
  updateMediaButtons();
  if (lastCastStream === display) return;
  lastCastStream = display;
  boardDuringPresentation = false;
  updateProjection();
  if (session?.role !== 'teacher') return;
  const revision = ++castRevision, roomGeneration = generation;
  try {
    await peer?.setStream(sendingStream());
    if (revision !== castRevision || roomGeneration !== generation) return;
    void sendPresentation({active:Boolean(display)});
  } catch {
    if (revision !== castRevision || roomGeneration !== generation) return;
    cast.stop();
    mediaText('The shared screen could not be sent.');
  }
}

function setPointerMode(enabled) {
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
function cancelStroke() { clearTimeout(flushTimer); flushTimer = null; stroke = null; pointerId = null; render(); }
function updateBoardStatus() {
  if (soloPreview) { boardText('Whiteboard · this tab only'); return; }
  if (!online) boardText('Reconnecting. Writing is paused.');
  else if (pendingWrites) boardText(`Syncing ${pendingWrites}…`);
  else boardText(other ? 'Whiteboard synced' : 'Whiteboard ready');
}
function flushStroke(continuing = false) {
  clearTimeout(flushTimer); flushTimer = null;
  if (!stroke || !session) return;
  const sent = stroke, epoch = board.epoch, token = session.token, g = generation;
  const last = sent.points.at(-1); stroke = continuing ? {...sent,id:crypto.randomUUID(),points:[last]} : null;
  if (pendingWrites >= 12) { cancelStroke(); boardText('The connection is busy. Try writing again in a moment.'); return; }
  board.addPending(sent); pendingWrites++; render(); updateBoardStatus();
  uploadQueue = uploadQueue.then(async () => {
    if (g !== generation || epoch !== board.epoch) return;
    try { await api('board',{epoch,stroke:sent},{token}); }
    catch (e) {
      if (g !== generation) return;
      board.reject(sent.id);
      // Poll events are the sole source of stroke snapshots. A delayed HTTP error
      // must never roll back a newer clear or erase already-consumed strokes.
      if (e.code === 'stale_epoch') cancelStroke();
      boardText(message(e)); render();
    }
  }).finally(() => { if (g === generation) { pendingWrites--; if (!pendingWrites && online) setTimeout(() => { if (g === generation) updateBoardStatus(); },1200); } });
}
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
  if (stationView.ready && currentMolecule && online && session.role==='teacher' && stationView.hitModel(e)) {
    if (pointerId!==null || modelDrag) return;
    e.preventDefault();
    modelDrag={id:e.pointerId,x:e.clientX,y:e.clientY};
    workspace.setPointerCapture(e.pointerId);
    return;
  }
  if (!stationView.ready && e.target!==canvas) return;
  const start=point(e);
  if (!start) return;
  e.preventDefault();
  if (!online || clearBusy || pointer.isEnabled() || pointerId!==null || modelDrag || !$('projection').hidden) return;
  pointerId=e.pointerId; workspace.setPointerCapture(pointerId);
  stroke={id:crypto.randomUUID(),color:penColor,width:Number($('pen-width').value),points:[start]};
  render();
});
workspace.addEventListener('pointermove', e => {
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
  if (e.pointerId !== pointerId || !stroke || !online) return;
  const position=point(e,true);
  if (!position) return;
  stroke.points.push(position); render();
  if (stroke.points.length >= 40) flushStroke(true);
  else if (!flushTimer) flushTimer=setTimeout(() => { if (stroke && stroke.points.length > 1) flushStroke(true); },120);
});
function finishStroke(e) {
  if (modelDrag?.id===e.pointerId) modelDrag=null;
  if(e.pointerId!==pointerId) return;
  flushStroke(false); pointerId=null; render();
}
workspace.addEventListener('pointerup', finishStroke);
workspace.addEventListener('pointercancel', finishStroke);
workspace.addEventListener('lostpointercapture', finishStroke);
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
  penColor=button.dataset.color; document.querySelectorAll('[data-color]').forEach(b => { const selected=b===button; b.classList.toggle('active',selected); b.setAttribute('aria-pressed',String(selected)); });
}));
$('clear').addEventListener('click', async () => {
  if (!session || !online || clearBusy || !window.confirm(soloPreview ? 'Clear this preview whiteboard? This cannot be undone.' : 'Clear the whiteboard for both participants? This cannot be undone.')) return;
  clearBusy=true; $('clear').disabled=true; cancelStroke(); const g=generation;
  try { await uploadQueue; if (g!==generation) return; const cleared=await api('board',{epoch:board.epoch,clear:true});
    if (g===generation) { board.clear(cleared.epoch); render(); } }
  catch(e) { if(g===generation) boardText(message(e)); }
  finally { if(g===generation) { clearBusy=false; $('clear').disabled=false; } }
});

function closePeer() {
  peer?.close();
  peer=null;
  other=null;
  $('remote-video').srcObject=null;
  $('play-remote').hidden=true;
  showRemoteVideo();
}

function showRemoteVideo() {
  const presenting=session?.role==='student' && remotePresentation;
  const active=Boolean(other?.cameraActive && !presenting);
  const track=$('remote-video').srcObject?.getVideoTracks()[0];
  workspace.dataset.remoteCamera=String(active);
  $('remote-display').hidden=!(active && track?.readyState==='live' && !track.muted);
  updateProjection();
}

function connectPeer(person) {
  if (other?.peerId===person.peerId) {
    other=person;
    showRemoteVideo();
    return;
  }
  closePeer();
  other=person;
  $('remote-caption').textContent=person.role==='teacher'?'Teacher':'Student';
  roomStatus('Both participants joined');
  updateBoardStatus();
  if (!globalThis.RTCPeerConnection) {
    mediaText('Video and audio are unavailable in this browser. The whiteboard is ready.');
    return;
  }
  const g=generation, token=session.token, target=person.peerId;
  peer=new ClassroomPeer({
    polite:session.role==='student',
    iceServers:session.iceServers || [],
    send:payload => {
      if (g!==generation || other?.peerId!==target) return Promise.resolve();
      return api('signal',{target,...payload},{token});
    },
    onStream:remote => {
      if (g!==generation || other?.peerId!==target) return;
      const video=$('remote-video');
      video.srcObject=remote;
      remote.getTracks().forEach(track=>{
        track.onunmute=showRemoteVideo;
        track.onmute=showRemoteVideo;
        track.onended=showRemoteVideo;
      });
      showRemoteVideo();
      video.play().then(()=>{
        if (video.srcObject===remote) $('play-remote').hidden=true;
      }).catch(()=>{
        if (video.srcObject===remote) $('play-remote').hidden=false;
      });
    },
    onState:state=>{
      if (g!==generation || other?.peerId!==target) return;
      if (state==='connected') mediaText('Call connected');
      else if (state==='failed') mediaText('The call could not connect. Rejoin the room to retry.');
      else if (state==='disconnected') mediaText('Call interrupted. You can still use the whiteboard.');
      else if (state==='connecting') mediaText('Connecting the call…');
    },
    onError:()=>{
      if (g===generation) mediaText('Call setup was interrupted. Rejoin the room to retry.');
    },
  });
  peer.setStream(sendingStream()).catch(()=>mediaText('Could not connect your audio or video.'));
}

function updateMediaButtons() {
  const micOn=Boolean(microphone?.getAudioTracks().some(track=>track.enabled && track.readyState==='live'));
  const videoOn=Boolean(cameraStream?.getVideoTracks().some(track=>track.readyState==='live' && track.enabled));
  $('start-media').disabled=capturing.audio;
  $('start-media').hidden=soloPreview || Boolean(microphone);
  $('mute').hidden=!microphone;
  $('stop-media').hidden=!microphone;
  $('mute').textContent=micOn?'Mute Mic':'Unmute Mic';
  $('mute').setAttribute('aria-pressed',String(!micOn));
  $('camera-toggle').hidden=soloPreview;
  $('camera-toggle').disabled=soloPreview || capturing.video;
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
  await peer?.setStream(sendingStream());
}

async function startCapture(kind) {
  const isVideo=kind==='video';
  const device=isVideo?'camera':'microphone';
  if (soloPreview || !session || capturing[kind] || (isVideo?cameraStream:microphone)) return;
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
    await peer?.setStream(sendingStream());
    if (g!==generation || (isVideo?cameraStream:microphone)!==acquired) return;
    if (isVideo) void sendCamera({active:true});
    mediaText(isVideo?'Camera is on':'Microphone is on');
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
  microphone?.getAudioTracks().forEach(track=>{track.enabled=!track.enabled;});
  updateMediaButtons();
});
$('play-remote').addEventListener('click',()=>{
  $('remote-video').play().then(()=>{$('play-remote').hidden=true;})
    .catch(()=>mediaText('Allow audio playback in your browser.'));
});

function applyEvent(event) {
  if (event.type==='peer-joined') connectPeer(event.peer || {peerId:event.peerId,role:session.role==='teacher'?'student':'teacher'});
  else if(event.type==='peer-left' && (event.peer?.peerId || event.peerId)===other?.peerId) {
    closePeer();
    roomStatus('Waiting for the other participant');
    mediaText(microphone || cameraStream ? 'Your devices are still on' : '');
    updateBoardStatus();
  }
  else if(event.type==='peer-camera' && event.peerId===other?.peerId) {
    other.cameraActive=event.active;
    showRemoteVideo();
  }
  else if(event.type==='signal') { if(event.peerId===other?.peerId) peer?.receive(event); }
  else if(event.type==='board-stroke') { board.accept(event.epoch,event.stroke); render(); }
  else if(event.type==='board-clear') { if(board.clear(event.epoch)) { cancelStroke(); render(); } }
  else if(event.type==='molecule-state' && session.role==='student') showMolecule(event.molecule);
  else if(event.type==='pointer-state' && session.role==='student') pointer.show(event.pointer);
  else if(event.type==='presentation-state' && session.role==='student') {
    remotePresentation = event.presentation.active;
    boardDuringPresentation = false;
    showRemoteVideo();
  }
  else if(event.type==='resync') {
    board.adoptSnapshot(event.epoch,event.board); cancelStroke(); render();
    if (session.role==='student') {
      showMolecule(event.molecule);
      pointer.show(event.pointer);
      remotePresentation = Boolean(event.presentation?.active);
      showRemoteVideo();
    }
    // Recovering board history must not interrupt a healthy call with the same
    // person. connectPeer replaces media only when the peer identity changes.
    if(event.peers.length) connectPeer(event.peers[0]);
    else { closePeer(); roomStatus('Waiting for the other participant'); }
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
      if (reconnected) void sendCamera({active:Boolean(cameraStream)});
      if (reconnected && session.role==='teacher') {
        void sendPointer({active:false,x:0,y:0});
        void sendPresentation({active:Boolean(cast.stream)});
      }
      roomStatus(other?'Both participants joined':'Waiting for the other participant'); updateBoardStatus();
    } catch(e) {
      if(g!==generation) return;
      if(e.code==='session_expired') { await leave(message(e)); return; }
      online=false; cancelStroke(); setPointerMode(false); pointer.show(null);
      failures++; roomStatus('Reconnecting…'); updateBoardStatus();
      if(failures>=7) { await leave('The connection could not recover. Check the local server and rejoin.'); return; }
      await new Promise(resolve=>setTimeout(resolve,Math.min(500*2**failures,5000)));
    } finally { clearTimeout(timeout); }
  }
}
async function leave(note='',unloading=false) {
  if (leaving) return;
  leaving=true;
  const previous=session, g=++generation; session=null; online=false; joining=false; pollController?.abort(); cancelStroke();
  modelDrag=null;
  cast.stop(); remotePresentation=false; boardDuringPresentation=false;
  setPointerMode(false); pointer.show(null); confirmedMolecule=null; showMolecule(null);
  // Release the role before allowing a new join. On pagehide, start keepalive
  // immediately, before an awaited device cleanup can yield to page teardown.
  let released=true;
  const release=previous ? api('leave',{}, {token:previous.token,keepalive:unloading}).catch(()=>{released=false;}) : Promise.resolve();
  closePeer();
  for (const source of [microphone,cameraStream]) source?.getTracks().forEach(track=>track.stop());
  microphone=null; cameraStream=null; capturing.audio=false; capturing.video=false;
  pendingWrites=0; uploadQueue=Promise.resolve(); clearBusy=false;
  board.reset(0,[]); $('room').hidden=true; $('lobby').hidden=false;
  document.body.dataset.station='lounge';
  document.title='The Common Room · Boundless Classroom';
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
}

function joinStatus(note) {
  $('lobby-status').textContent=lobbyDialog.open?'':note;
  $('join-status').textContent=lobbyDialog.open?note:'';
}

$('choose-live').addEventListener('click', () => {
  lobbyDialog.showModal();
  joinStatus('');
});
$('close-entry').addEventListener('click', () => lobbyDialog.close());
lobbyDialog.addEventListener('cancel', event => {
  if (joining || leaving) event.preventDefault();
});
$('room-title').addEventListener('click', async () => {
  if (!session) return;
  try { await navigator.clipboard.writeText(session.code); roomStatus('Room code copied'); }
  catch { roomStatus('Copy the room code manually'); }
});
$('join-form').addEventListener('submit', event => {
  event.preventDefault();
  const code=$('room-code').value.trim().toUpperCase();
  void joinRoom(code===hostedCode?'teacher':'student',code);
});
$('create-room').addEventListener('click', () => void joinRoom('teacher',newRoomCode()));

async function joinRoom(role, code) {
  if(joining||leaving||session) return;
  if (soloPreview) role='teacher';
  joining=true; const g=++generation; setJoinBusy(true); joinStatus('Opening the classroom…');
  try {
    const joined=await api('join',{code,role});
    if(g!==generation) { api('leave',{}, {token:joined.token}).catch(()=>{}); return; }
    session={...joined,role,code}; sequence=joined.sequence; online=true; board.reset(joined.epoch,joined.board);
    if (role==='teacher') hostedCode=code;
    $('room-code').value=code;
    lobbyDialog.close();
    joinStatus('');
    $('lobby').hidden=true; $('room').hidden=false; $('room-title').textContent=code;
    document.body.dataset.station='classroom';
    document.title='Classroom · Boundless Classroom';
    $('room-title').setAttribute('aria-label',`Copy room code ${code}`);
    $('room-header').hidden=false; $('preview-label').hidden=true;
    $('teacher-tools').hidden=role!=='teacher'; workspace.dataset.role=role;
    confirmedMolecule=joined.molecule;
    showMolecule(joined.molecule);
    pointer.show(joined.pointer);
    remotePresentation=Boolean(joined.presentation?.active);
    updateProjection();
    $('self-caption').textContent=role==='teacher'?'You · Teacher':'You · Student'; $('remote-caption').textContent=role==='teacher'?'Student':'Teacher';
    mediaText(''); updateMediaButtons(); roomStatus('Waiting for a participant'); updateBoardStatus(); render();
    if(joined.peers.length) connectPeer(joined.peers[0]);
    window.scrollTo(0,0);
    $('room').focus({preventScroll:true});
    if (!soloPreview) poll(g);
  } catch(error) { if(g===generation) joinStatus(message(error)); }
  finally { if(g===generation) { joining=false; setJoinBusy(false); } }
}

const shareInvitation = mountRoomInvitation({
  onStatus:note => session ? roomStatus(note) : joinStatus(note),
});
const appointments = mountAppointment({
  newRoomCode,
  onOpenRoom:code => joinRoom('teacher',code),
  onStatus:joinStatus,
  onShare:shareInvitation,
});
$('share-room').addEventListener('click', () => {
  if (session) void shareInvitation(appointments.invitationFor(session.code));
});

const invitedCode = roomCodeFromURL(window.location.href);
if (invitedCode) {
  $('room-code').value = invitedCode;
  lobbyDialog.showModal();
  joinStatus(soloPreview ? 'This link opens your own preview. Live sessions are not connected.' : 'Invitation ready. Join as a student when the teacher has opened the room.');
}

if (soloPreview) {
  $('board').setAttribute('aria-label','Preview whiteboard. Write with a mouse or stylus; contents stay in this tab.');
  document.querySelector('.board-panel').setAttribute('aria-label','Preview whiteboard');
  document.querySelector('.appointment-note').textContent='Saved in this browser only. Invitations open independent previews; they do not book a live lesson.';
  if (!invitedCode) joinStatus(PREVIEW_NOTICE);
  updateMediaButtons();
}
