// Draws the live page. It asks /api/status every 2 seconds and paints one box per target.
// The teacher page sets data-teacher on <body>, which adds stop/start buttons and the
// "try this" hint. All text from info.json goes in with textContent, never as HTML.
const defaultTitle = document.getElementById('title').textContent;
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
    ? 'UP' + (t.role ? ' · ' + t.role + (t.replication_state ? ' (' + t.replication_state + ')' : '') : '') + (t.lag != null ? ' (lag ' + t.lag + ')' : '') + (t.ms != null ? ' · ' + t.ms + ' ms' : '')
    : 'DOWN' + (t.error ? ' (' + t.error + ')' : '');
  state.className = 'status';
  div.append(label, state);
  const roleText = data.info && data.info.roles && data.info.roles[t.name];
  if (typeof roleText === 'string' && roleText) {
    const role = document.createElement('p');
    role.className = 'role';
    role.textContent = roleText;
    div.append(role);
  }
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
    const info = data.info || {};
    document.getElementById('title').textContent = info.title || defaultTitle;
    document.getElementById('about').textContent = info.about || data.caption || '';
    const hint = document.getElementById('tryThis');
    if (hint) {
      hint.textContent = info.tryThis ? 'Try this: ' + info.tryThis : '';
      hint.hidden = !info.tryThis;
    }
    document.getElementById('targets').replaceChildren(...data.targets.map((t) => box(t, data)));
    document.getElementById('warning').textContent = data.warning || '';
    document.getElementById('note').textContent = isTeacher && !data.controlsAvailable
      ? 'Controls unavailable: podman socket not reachable.' : '';
  } catch {
    document.getElementById('note').textContent = 'Live page cannot reach the status service.';
  }
}
refresh();
setInterval(refresh, 2000);
