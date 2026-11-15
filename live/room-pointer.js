const INACTIVE = Object.freeze({ active: false, x: 0, y: 0 });
const clamp01 = value => Math.min(1, Math.max(0, value));

/** A floating hand whose fingertip follows board-relative coordinates. */
export function createRoomPointer(workspace, boardCanvas, {onMove, pointOnBoard, showInScene} = {}) {
  const layer = document.createElement('div');
  layer.className = 'room-pointer';
  layer.hidden = true;
  layer.setAttribute('aria-hidden', 'true');
  const hand = document.createElement('img');
  hand.src = new URL('./wizard-hand.png?v=station-room-37',import.meta.url).href;
  hand.alt = '';
  hand.draggable = false;
  hand.decoding = 'async';
  layer.append(hand);
  workspace.append(layer);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = false;
  let localActive = false;
  let state = INACTIVE;
  let displayed = null;
  let frame = null;

  function schedulePaint() {
    if (state.active && frame === null) frame = requestAnimationFrame(paint);
  }

  function paint() {
    frame = null;
    if (!state.active) return;
    const board = boardCanvas.getBoundingClientRect();
    const room = workspace.getBoundingClientRect();
    if (!board.width || !board.height) {
      layer.hidden = true;
      return;
    }
    const blend = enabled || reducedMotion.matches ? 1 : 0.5;
    const previous = displayed ?? state;
    const x = previous.x + (state.x - previous.x) * blend;
    const y = previous.y + (state.y - previous.y) * blend;
    displayed = { x, y };

    const tipX = board.left - room.left + x * board.width;
    const tipY = board.top - room.top + y * board.height;
    const width = Math.min(99, Math.max(69, board.height * .164));
    const height = width * 1199/1312;
    // Align the illustrated fingertip, including when mirrored near the edge.
    const mirror = tipX + width*.888 > room.width;
    const left = tipX - width*(mirror?.888:.112);
    const top = tipY - height*.138;
    hand.style.width = width+'px';
    hand.style.height = height+'px';
    hand.style.transform = `translate3d(${left}px,${top}px,0) scaleX(${mirror?-1:1})`;
    layer.hidden = false;
    if (Math.abs(state.x - x) + Math.abs(state.y - y) > 0.0005) schedulePaint();
  }

  function show(next) {
    state = next?.active && Number.isFinite(next.x) && Number.isFinite(next.y)
      ? { active: true, x: clamp01(next.x), y: clamp01(next.y) }
      : INACTIVE;
    if (showInScene?.(state)) layer.hidden=true;
    else if (state.active) schedulePaint();
    else {
      displayed = null;
      layer.hidden = true;
    }
  }

  function move(event) {
    if (!enabled || event.pointerType !== 'mouse') return;
    const point = pointOnBoard(event);
    if (!point) {
      leave();
      return;
    }
    const next = {
      active: true,
      x: point[0],
      y: point[1],
    };
    localActive = true;
    show(next);
    onMove?.(next);
  }

  function leave() {
    if (!localActive) return;
    localActive = false;
    show(INACTIVE);
    onMove?.(INACTIVE);
  }

  // The projection uses the same normalized surface as the writing canvas.
  workspace.addEventListener('pointerenter', move);
  workspace.addEventListener('pointermove', move, true);
  workspace.addEventListener('pointerleave', leave);
  workspace.addEventListener('pointercancel', leave, true);
  window.addEventListener('blur', leave);
  const resize = new ResizeObserver(schedulePaint);
  resize.observe(workspace);
  resize.observe(boardCanvas);

  return {
    show,
    setEnabled(value) {
      enabled = value === true;
      boardCanvas.classList.toggle('room-pointer-target', enabled);
      if (!enabled) leave();
    },
    isEnabled: () => enabled,
    destroy() {
      leave();
      if (frame !== null) cancelAnimationFrame(frame);
      resize.disconnect();
      workspace.removeEventListener('pointerenter', move);
      workspace.removeEventListener('pointermove', move, true);
      workspace.removeEventListener('pointerleave', leave);
      workspace.removeEventListener('pointercancel', leave, true);
      boardCanvas.classList.remove('room-pointer-target');
      window.removeEventListener('blur', leave);
      layer.remove();
    },
  };
}
