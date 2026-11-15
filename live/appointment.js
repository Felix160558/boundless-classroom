const storageKey = 'boundless_station_appointment_v1';
const codePattern = /^[A-Z0-9]{6,12}$/;
const pad = number => String(number).padStart(2,'0');

function localFields(date) {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function readAppointment() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved.topic!=='string' || saved.topic.length>70 ||
        typeof saved.code!=='string' || !codePattern.test(saved.code) ||
        typeof saved.startsAt!=='string' || !Number.isFinite(Date.parse(saved.startsAt))) return null;
    return saved;
  } catch {
    return null;
  }
}

function displayTime(appointment) {
  const date = new Date(appointment.startsAt);
  const options = {dateStyle:'medium', timeStyle:'short'};
  try {
    const zone = appointment.zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `${new Intl.DateTimeFormat('en',{...options,timeZone:zone}).format(date)} · ${zone}`;
  } catch {
    return new Intl.DateTimeFormat('en',options).format(date);
  }
}

export function mountAppointment({onOpenRoom,newRoomCode,onStatus,onShare}) {
  const $ = id => document.getElementById(id);
  const dialog = $('appointment-dialog');
  const topic = $('appointment-topic');
  const day = $('appointment-date');
  const time = $('appointment-time');
  const feedback = $('appointment-feedback');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let appointment = readAppointment();

  function render() {
    $('appointment-summary').hidden = !appointment;
    if (!appointment) return;
    $('appointment-label').textContent = appointment.topic || 'One-to-One Classroom';
    const when = $('appointment-when');
    when.dateTime = appointment.startsAt;
    when.textContent = displayTime(appointment);
  }

  $('open-appointment').addEventListener('click', () => {
    const now = Date.now();
    const scheduled = Date.parse(appointment?.startsAt);
    const nextQuarter = Math.ceil((now+3600000)/900000)*900000;
    const values = localFields(new Date(scheduled>now ? scheduled : nextQuarter));
    day.min = localFields(new Date(now)).date;
    day.value = values.date;
    time.value = values.time;
    topic.value = appointment?.topic || '';
    $('appointment-zone').textContent = zone ? `Time zone: ${zone}` : 'Local time';
    feedback.textContent = '';
    dialog.showModal();
  });

  $('close-appointment').addEventListener('click', () => dialog.close());
  $('appointment-form').addEventListener('submit', event => {
    event.preventDefault();
    const start = new Date(`${day.value}T${time.value}`);
    const fields = localFields(start);
    if (!Number.isFinite(start.getTime()) || start.getTime()<=Date.now() ||
        fields.date!==day.value || fields.time!==time.value) {
      feedback.textContent = 'Choose a valid date and time in the future.';
      return;
    }
    appointment = {
      topic:topic.value.trim(), startsAt:start.toISOString(), zone,
      code:appointment?.code || newRoomCode(),
    };
    let saved = true;
    try { localStorage.setItem(storageKey,JSON.stringify(appointment)); }
    catch { saved = false; }
    render();
    dialog.close();
    onStatus(saved ? 'Appointment saved. You can now share the invitation.' : 'Share or copy the invitation before closing this page to keep your appointment details.');
  });

  $('appointment-copy').addEventListener('click', () => {
    if (!appointment) return;
    void onShare({code:appointment.code, topic:appointment.topic, when:displayTime(appointment)});
  });

  $('appointment-open').addEventListener('click', () => {
    if (appointment) void onOpenRoom(appointment.code);
  });
  render();
  return {
    invitationFor(code) {
      return appointment?.code === code ? {code, topic:appointment.topic, when:displayTime(appointment)} : {code};
    },
  };
}
