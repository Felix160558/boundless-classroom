// GitHub Pages has no room server. This adapter is deliberately tab-local:
// it never opens a connection, shares state or silently replaces a failed server.
export const PREVIEW_NOTICE = 'Solo preview · live sessions are not connected';
export function isPagesPreview(hostname) {
  return /^(?:[a-z0-9-]+\.)+github\.io$/i.test(hostname);
}

export function createPreviewRoom({onEvent = () => {}} = {}) {
  let token = null, epoch = 0, strokes = new Map(), pointCount = 0;
  const fail = code => { throw Object.assign(new Error(code), {code}); };
  function reset() { epoch = 0; strokes = new Map(); pointCount = 0; }

  return {
    async request(path, body, {token: provided} = {}) {
      if (path === 'join') {
        if (!/^[A-Z0-9]{6,12}$/.test(body?.code || '')) fail('invalid_code');
        reset();
        token = globalThis.crypto.randomUUID();
        // Every visitor explores their own room and can try its teaching tools.
        return {token, peerId:token, role:'teacher', sequence:0, epoch, board:[], peers:[],
          iceServers:[], molecule:null, pointer:{active:false,x:0,y:0}, presentation:{active:false}};
      }
      if (!token || provided !== token) fail('session_expired');
      if (path === 'leave') { token = null; reset(); return {ok:true}; }
      if (path === 'board') {
        if (body?.epoch !== epoch) fail('stale_epoch');
        if (body.clear === true) {
          strokes.clear(); pointCount = 0; epoch++;
          onEvent({type:'board-clear',epoch});
        } else if (body.stroke?.id && Array.isArray(body.stroke.points)) {
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
