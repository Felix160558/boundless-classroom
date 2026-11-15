import {isPagesPreview} from './preview-room.js?v=medieval-lounge-40';

const codePattern = /^[A-Z0-9]{6,12}$/;
const localNotice = 'Local preview link · opens on this Mac';

function validCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return codePattern.test(code) ? code : null;
}

export function roomCodeFromURL(href) {
  try {
    const codes = new URL(href).searchParams.getAll('room');
    return codes.length === 1 ? validCode(codes[0]) : null;
  } catch {
    return null;
  }
}

export function createRoomInvitation({code, topic = '', when = ''}, href = window.location.href) {
  code = validCode(code);
  if (!code) throw new Error('Use a room code with 6–12 letters or digits.');
  const source = new URL(href);
  if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Open the classroom from the local preview.');
  // Preserve the project directory on GitHub Pages, but discard credentials, unrelated queries and fragments.
  const directory = source.pathname.endsWith('/live') ? source.pathname+'/' : new URL('./', source).pathname;
  const url = new URL(directory, source.origin);
  url.searchParams.set('room', code);
  const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
    /^127\./.test(url.hostname) || url.hostname === '[::1]';
  const title = typeof topic === 'string' && topic.trim() ? topic.trim().slice(0, 70) : 'Boundless Classroom · One-to-One Classroom';
  const details = [title, typeof when === 'string' ? when.slice(0, 200) : '', `Room code: ${code}`].filter(Boolean).join('\n');
  const notice = local ? localNotice : isPagesPreview(source.hostname) ? 'Solo preview link · each visitor opens an independent classroom' : '';
  const text = [details, url.href, notice].filter(Boolean).join('\n');
  return {url:url.href, title, details, text, notice};
}

export function mountRoomInvitation({onStatus}) {
  const $ = id => document.getElementById(id);
  const dialog = $('share-dialog');
  const input = $('share-link');
  const feedback = $('share-feedback');
  const copy = $('copy-share-link');
  let current = null, sharing = false;

  function status(note, invitation = current) {
    const text = [note, invitation?.notice].filter(Boolean).join(' ');
    feedback.textContent = text;
    onStatus(text);
  }

  function showManualCopy(invitation) {
    input.value = invitation.url;
    if ($('share-details')) $('share-details').textContent = invitation.details;
    status('Select and copy the link below.', invitation);
    if (!dialog.open) dialog.showModal();
    input.focus();
    input.select();
  }

  $('close-share').addEventListener('click', () => dialog.close());
  input.addEventListener('click', () => input.select());
  copy.addEventListener('click', async () => {
    if (!current || copy.disabled) return;
    copy.disabled = true;
    const invitation = current;
    try {
      await navigator.clipboard.writeText(invitation.text);
      status('Invitation copied.', invitation);
    } catch {
      showManualCopy(invitation);
    } finally {
      copy.disabled = false;
    }
  });

  return async function shareInvitation(details) {
    if (sharing) return;
    sharing = true;
    try {
      const invitation = createRoomInvitation(details);
      current = invitation;
      const payload = {title:invitation.title, text:[invitation.details, invitation.notice].filter(Boolean).join('\n'), url:invitation.url};
      let canShare = false;
      try {
        canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare(payload);
      } catch { /* The clipboard fallback remains available. */ }
      if (canShare) {
        try {
          await navigator.share(payload);
          status('Invitation shared.', invitation);
          return;
        } catch (error) {
          if (error?.name === 'AbortError') {
            status('Sharing cancelled.', invitation);
            return;
          }
        }
      }
      try {
        await navigator.clipboard.writeText(invitation.text);
        status('Invitation copied.', invitation);
      } catch {
        showManualCopy(invitation);
      }
    } catch (error) {
      onStatus(error.message || 'The invitation could not be prepared.');
    } finally {
      sharing = false;
    }
  };
}
