// GitHub Pages has no room server. This adapter is deliberately tab-local:
// it never opens a connection, shares state or silently replaces a failed server.
import {MOLECULE_CATALOG} from '../molecule-catalog.js?v=quiet-shape-31';

export const PREVIEW_NOTICE = 'Solo preview · live sessions are not connected';
export function isPagesPreview(hostname) {
  return /^(?:[a-z0-9-]+\.)+github\.io$/i.test(hostname);
}

const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const validIds = values => Array.isArray(values) && values.length >= 1 && values.length <= 128 &&
  values.every(validId) && new Set(values).size === values.length;
const operations = ['stroke','clear','erase','chemistry'];

// Null angles release the tracked pose so rendering can return to its idle motion.
export function avatarState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !Object.keys(data).every(key => ['avatar', 'headYaw', 'headPitch'].includes(key)) ||
      !['simple', 'orange-cat'].includes(data.avatar)) return null;
  const {avatar, headYaw = null, headPitch = null} = data;
  if (headYaw === null && headPitch === null) return {avatar, headYaw, headPitch};
  if (!Number.isFinite(headYaw) || !Number.isFinite(headPitch)) return null;
  return {
    avatar, headYaw: Math.max(-0.9, Math.min(0.9, headYaw)),
    headPitch: Math.max(-0.55, Math.min(0.55, headPitch)),
  };
}

// The local room server and the static preview apply the same board protocol.
export function boardOperation(data) {
  if (!data || typeof data!=='object' || !Number.isSafeInteger(data.epoch)) return null;
  const key = Object.keys(data).filter(name=>name!=='epoch');
  return key.length===1 && operations.includes(key[0]) ? key[0] : null;
}

export function chemistryToAdd(entry, entries, hasStroke, fail) {
  if (!entry || typeof entry!=='object' || !Object.keys(entry).every(k=>['key','id','strokes'].includes(k)) ||
      !validId(entry.key) || typeof entry.id!=='string' || !Object.hasOwn(MOLECULE_CATALOG,entry.id) || !validIds(entry.strokes)) {
    fail('invalid_chemistry');
  }
  if (!entry.strokes.every(hasStroke)) fail('missing_stroke');
  const source = new Set(entry.strokes);
  for (const saved of entries) {
    if (saved.key!==entry.key && !saved.strokes.some(id=>source.has(id))) continue;
    if (saved.id===entry.id && saved.strokes.length===source.size && saved.strokes.every(id=>source.has(id))) return null;
    fail('ink_already_linked');
  }
  if (entries.length>=3) fail('chemistry_full');
  return {key:entry.key,id:entry.id,strokes:[...entry.strokes]};
}

export function strokesToErase(ids, hasStroke, fail) {
  if (!validIds(ids)) fail('invalid_board');
  return new Set(ids.filter(hasStroke));
}

export function unlinkErasedInk(entries, removed) {
  return entries.filter(entry=>!entry.strokes.some(id=>removed.has(id)));
}

export function createPreviewRoom({onEvent = () => {}} = {}) {
  let token = null, epoch = 0, strokes = new Map(), pointCount = 0, chemistry = [];
  const fail = code => { throw Object.assign(new Error(code), {code}); };
  function reset() { epoch = 0; strokes = new Map(); pointCount = 0; chemistry = []; }

  return {
    async request(path, body, {token: provided} = {}) {
      if (path === 'join') {
        if (!/^[A-Z0-9]{6,12}$/.test(body?.code || '')) fail('invalid_code');
        reset();
        token = globalThis.crypto.randomUUID();
        // Every visitor explores their own room and can try its teaching tools.
        return {token, peerId:token, role:'teacher', sequence:0, epoch, board:[], chemistry:[], peers:[],
          iceServers:[], molecule:null, pointer:{active:false,x:0,y:0}, presentation:{active:false}};
      }
      if (!token || provided !== token) fail('session_expired');
      if (path === 'leave') { token = null; reset(); return {ok:true}; }
      if (path === 'avatar') {
        const state = avatarState(body);
        if (!state) fail('invalid_avatar');
        return {ok:true,...state};
      }
      if (path === 'board') {
        const operation = boardOperation(body);
        if (!operation) fail('invalid_board');
        if (body.epoch !== epoch) fail('stale_epoch');
        if (operation==='clear' && body.clear===true) {
          strokes.clear(); pointCount = 0; chemistry = []; epoch++;
          onEvent({type:'board-clear',epoch});
        } else if (operation==='erase') {
          const removed = strokesToErase(body.erase,id=>strokes.has(id),fail);
          if (removed.size) {
            for (const id of removed) {
              pointCount -= strokes.get(id).points.length;
              strokes.delete(id);
            }
            chemistry = unlinkErasedInk(chemistry,removed);
            onEvent({type:'board-erase',epoch,erase:[...removed]});
          }
        } else if (operation==='chemistry') {
          const entry = chemistryToAdd(body.chemistry,chemistry,id=>strokes.has(id),fail);
          if (entry) {
            chemistry.push(entry);
            onEvent({type:'board-chemistry',epoch,chemistry:structuredClone(entry)});
          }
        } else if (operation==='stroke' && body.stroke?.id && Array.isArray(body.stroke.points)) {
          if (!strokes.has(body.stroke.id)) {
            if (strokes.size >= 1000 || pointCount + body.stroke.points.length > 40000) fail('board_full');
            const stroke = structuredClone(body.stroke);
            strokes.set(stroke.id,stroke); pointCount += stroke.points.length;
            onEvent({type:'board-stroke',epoch,stroke});
          }
        } else fail('invalid_board');
        return {ok:true,epoch};
      }
      if (path === 'molecule') return {ok:true,molecule:structuredClone(body)};
      if (path === 'pointer') return {ok:true,pointer:structuredClone(body)};
      if (path === 'presentation') return {ok:true,presentation:{active:Boolean(body?.active)}};
      fail('preview_unavailable');
    },
  };
}
