import {isPagesPreview} from './preview-room.js?v=trio-online-54';

const codePattern = /^[A-Z0-9]{6,12}$/;
const localNotice = 'Local preview link · opens on this Mac';

// Read a value supplied by the page owner. A blank value uses the built-in
// mode, while null means the supplied deployment value is invalid.
export function roomServiceOrigin(value = '') {
  const configured = value.trim();
  if (!configured) return '';
  try {
    const endpoint = new URL(configured);
    if (endpoint.protocol === 'https:' &&
        [endpoint.origin, endpoint.origin + '/'].includes(configured)) return endpoint.origin;
  } catch { /* Invalid origin. */ }
  return null;
}

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

export function createRoomInvitation({code, topic = '', when = ''}, href = window.location.href, {live = false} = {}) {
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
  const title = typeof topic === 'string' && topic.trim() ? topic.trim().slice(0, 70) : 'Boundless Classroom · Shared Classroom';
  const details = [title, typeof when === 'string' ? when.slice(0, 200) : '', `Room code: ${code}`].filter(Boolean).join('\n');
  const notice = local ? localNotice : live ? 'Live classroom link' :
    isPagesPreview(source.hostname) ? 'Solo preview link · each visitor opens an independent classroom' : '';
  const text = [details, url.href, notice].filter(Boolean).join('\n');
  return {code, url:url.href, title, details, text, notice};
}

export function mountRoomInvitation({onStatus, live = false, configurationError = ''}) {
  const $ = id => document.getElementById(id);
  const dialog = $('share-dialog');
  const input = $('share-link');
  const code = $('share-code');
  const feedback = $('share-feedback');
  const copy = $('copy-share-link');
  let current = null;

  function status(note, invitation = current) {
    const text = [note, invitation?.notice].filter(Boolean).join(' ');
    feedback.textContent = text;
    onStatus(text);
  }

  function showManualCopy() {
    status('Select and copy the link above.');
    input.focus();
    input.select();
  }

  $('close-share').addEventListener('click', () => dialog.close());
  input.addEventListener('click', () => input.select());
  code.addEventListener('click', () => code.select());
  copy.addEventListener('click', async () => {
    if (!current || copy.disabled) return;
    copy.disabled = true;
    const invitation = current;
    try {
      await navigator.clipboard.writeText(invitation.text);
      if (current===invitation && dialog.open) status('Invitation copied.', invitation);
    } catch {
      if (current===invitation && dialog.open) showManualCopy();
    } finally {
      copy.disabled = false;
    }
  });

  return async function shareInvitation(details) {
    try {
      if (configurationError) throw new Error(configurationError);
      const invitation = createRoomInvitation(details, window.location.href, {live});
      current = invitation;
      code.value=invitation.code;
      input.value=invitation.url;
      const topic=typeof details.topic==='string'?details.topic.trim().slice(0,70):'';
      $('share-details').textContent = [topic,details.when,'Share the same link or room code with both students.'].filter(Boolean).join('\n');
      feedback.textContent=invitation.notice;
      if (!dialog.open) dialog.showModal();
    } catch (error) {
      onStatus(error.message || 'The invitation could not be prepared.');
    }
  };
}
