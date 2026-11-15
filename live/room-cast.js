export function createRoomCast({onChange, onError}) {
  let stream = null;
  let busy = false;
  let generation = 0;

  function notify() {
    onChange({stream, busy});
  }

  function stop() {
    if (!stream && !busy) return;
    generation++;
    const previous = stream;
    stream = null;
    busy = false;
    previous?.getTracks().forEach(track => track.stop());
    notify();
  }

  async function start() {
    if (busy || stream) return;
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      onError(new Error('To share your screen, open this room in a desktop browser that supports screen sharing.'));
      return;
    }

    const attempt = ++generation;
    busy = true;
    notify();
    let failure;
    try {
      const selected = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false});
      const video = selected.getVideoTracks()[0];
      if (attempt !== generation || video?.readyState !== 'live') {
        selected.getTracks().forEach(track => track.stop());
        if (attempt === generation) failure = 'No screen video was received. Choose a window to share again.';
        return;
      }
      stream = selected;
      video.addEventListener('ended', () => {
        if (stream === selected) stop();
      }, {once: true});
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        failure = 'Screen sharing did not start. You can choose a window to share again.';
      } else if (error?.name === 'NotReadableError') {
        failure = 'The selected screen could not be read. Check your system’s screen recording permissions.';
      } else if (error?.name !== 'AbortError') {
        failure = 'Could not start screen sharing. Try again.';
      }
    } finally {
      if (attempt === generation) {
        busy = false;
        notify();
        if (failure) onError(new Error(failure));
      }
    }
  }

  return {start, stop, get stream() { return stream; }, get busy() { return busy; }};
}
