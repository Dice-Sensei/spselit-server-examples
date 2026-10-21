// Draws the live page. It asks /api/status every 2 seconds and paints one box per target.
// The teacher page sets data-teacher on <body>, which adds stop/start buttons.
const isTeacher = document.body.dataset.teacher === 'true';

async function control(name, action) {
  const r = await fetch('/api/control', { method: 'POST', body: JSON.stringify({ name, action }) });
  if (!r.ok) alert('Could not ' + action + ' ' + name + ' (' + r.status + ')');
  refresh();
}

function box(t, data) {
  const div = document.createElement('div');
  div.className = 'box ' + (t.up ? 'up' : 'down');
  const label = document.createElement('strong');
  label.textContent = t.name;
  const state = document.createElement('span');
  state.textContent = t.up
    ? (t.role ? t.role : 'up') + (t.lag != null ? ' (lag ' + t.lag + ')' : '') + (t.ms != null ? ' · ' + t.ms + ' ms' : '')
    : 'DOWN';
  div.append(label, state);
  if (isTeacher && data.controlsAvailable && data.controllable.includes(t.name)) {
    const b = document.createElement('button');
    b.textContent = t.up ? 'Stop' : 'Start';
    b.onclick = () => control(t.name, t.up ? 'stop' : 'start');
    div.append(b);
  }
  return div;
}

async function refresh() {
  try {
    const data = await (await fetch('/api/status')).json();
    document.getElementById('caption').textContent = data.caption;
    document.getElementById('targets').replaceChildren(...data.targets.map((t) => box(t, data)));
    document.getElementById('note').textContent = isTeacher && !data.controlsAvailable
      ? 'Controls unavailable: podman socket not reachable.' : '';
  } catch {
    document.getElementById('note').textContent = 'Live page cannot reach the status service.';
  }
}
refresh();
setInterval(refresh, 2000);
