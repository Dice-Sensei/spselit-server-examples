const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createApp } = require('../server');

async function start(cfg) {
  const app = createApp({ caption: 'hello', targets: [], controllable: ['back-a'], socketPath: '/nonexistent.sock', timeoutMs: 300, ...cfg });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  return app;
}
const url = (app, p) => `http://127.0.0.1:${app.address().port}${p}`;

test('status lists targets, caption, and says controls are unavailable without a socket', async () => {
  const up = http.createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1');
  await new Promise((r) => up.once('listening', r));
  const app = await start({ targets: [{ name: 'a', url: `http://127.0.0.1:${up.address().port}/` }] });
  const body = await (await fetch(url(app, '/api/status'))).json();
  app.close(); up.close();
  assert.strictEqual(body.caption, 'hello');
  assert.strictEqual(body.targets[0].up, true);
  assert.strictEqual(body.controlsAvailable, false);
});

test('control with a name outside the allowlist is 403', async () => {
  const app = await start({});
  const r = await fetch(url(app, '/api/control'), { method: 'POST', body: JSON.stringify({ name: 'evil', action: 'stop' }) });
  app.close();
  assert.strictEqual(r.status, 403);
});

test('control with malformed JSON is 400', async () => {
  const app = await start({});
  const r = await fetch(url(app, '/api/control'), { method: 'POST', body: 'not json' });
  app.close();
  assert.strictEqual(r.status, 400);
});

test('control for an allowed name with no podman socket is 503', async () => {
  const app = await start({});
  const r = await fetch(url(app, '/api/control'), { method: 'POST', body: JSON.stringify({ name: 'back-a', action: 'stop' }) });
  app.close();
  assert.strictEqual(r.status, 503);
});

test('the live page is served at /', async () => {
  const app = await start({});
  const r = await fetch(url(app, '/'));
  const text = await r.text();
  const js = await (await fetch(url(app, '/app.js'))).text();
  app.close();
  assert.strictEqual(r.status, 200);
  assert.ok(text.includes('/app.js'));
  assert.ok(js.includes('/api/status'));
});

function patroniLike(role) {
  const s = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ role, replication_state: 'streaming' })); });
  return new Promise((resolve) => s.listen(0, '127.0.0.1', () => resolve(s)));
}

test('warning appears when nodes report roles but none is the leader', async () => {
  const a = await patroniLike('replica'); const b = await patroniLike('replica');
  const app = await start({ targets: [
    { name: 'a', url: `http://127.0.0.1:${a.address().port}/` },
    { name: 'b', url: `http://127.0.0.1:${b.address().port}/` }] });
  const body = await (await fetch(url(app, '/api/status'))).json();
  app.close(); a.close(); b.close();
  assert.match(body.warning, /No leader/);
  assert.strictEqual(body.targets[0].replication_state, 'streaming');
});

test('no warning when one node is primary', async () => {
  const a = await patroniLike('primary'); const b = await patroniLike('replica');
  const app = await start({ targets: [
    { name: 'a', url: `http://127.0.0.1:${a.address().port}/` },
    { name: 'b', url: `http://127.0.0.1:${b.address().port}/` }] });
  const body = await (await fetch(url(app, '/api/status'))).json();
  app.close(); a.close(); b.close();
  assert.strictEqual(body.warning, undefined);
});

test('no warning for targets that report no roles (plain websites)', async () => {
  const app = await start({ targets: [] });
  const body = await (await fetch(url(app, '/api/status'))).json();
  app.close();
  assert.strictEqual(body.warning, undefined);
});

test('concurrent and back-to-back status requests share one probe round', async () => {
  let hits = 0;
  const target = http.createServer((q, r) => { hits += 1; r.end('ok'); }).listen(0, '127.0.0.1');
  await new Promise((r) => target.once('listening', r));
  const app = await start({ cacheMs: 1000, targets: [{ name: 't', url: `http://127.0.0.1:${target.address().port}/` }] });
  await Promise.all([1, 2, 3, 4, 5].map(() => fetch(url(app, '/api/status')).then((r) => r.json())));
  await fetch(url(app, '/api/status')).then((r) => r.json());
  app.close(); target.close();
  assert.strictEqual(hits, 1);
});

test('a status request after the cache expires probes again', async () => {
  let hits = 0;
  const target = http.createServer((q, r) => { hits += 1; r.end('ok'); }).listen(0, '127.0.0.1');
  await new Promise((r) => target.once('listening', r));
  const app = await start({ cacheMs: 50, targets: [{ name: 't', url: `http://127.0.0.1:${target.address().port}/` }] });
  await fetch(url(app, '/api/status')).then((r) => r.json());
  await new Promise((r) => setTimeout(r, 120));
  await fetch(url(app, '/api/status')).then((r) => r.json());
  app.close(); target.close();
  assert.strictEqual(hits, 2);
});

// --- info.json: plain-words text for the live page ---
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function infoFile(content) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'info-')), 'info.json');
  if (content !== undefined) fs.writeFileSync(f, content);
  return f;
}
async function statusBody(app) { const b = await (await fetch(url(app, '/api/status'))).json(); app.close(); return b; }

test('status includes info from the info file', async () => {
  const app = await start({ infoFile: infoFile('{"title":"T","roles":{"a":"R"}}') });
  const body = await statusBody(app);
  assert.strictEqual(body.info.title, 'T');
  assert.strictEqual(body.info.roles.a, 'R');
});

test('info is null when the file is missing, and the caption still works', async () => {
  const app = await start({ infoFile: infoFile(undefined) });
  const body = await statusBody(app);
  assert.strictEqual(body.info, null);
  assert.strictEqual(body.caption, 'hello');
});

test('info is null when no info file is configured', async () => {
  const app = await start({});
  assert.strictEqual((await statusBody(app)).info, null);
});

test('info is null when the file is not valid JSON', async () => {
  const app = await start({ infoFile: infoFile('{nope') });
  assert.strictEqual((await statusBody(app)).info, null);
});

test('info is null when the JSON is not an object', async () => {
  for (const content of ['[1]', 'null', '"x"']) {
    const app = await start({ infoFile: infoFile(content) });
    assert.strictEqual((await statusBody(app)).info, null, content);
  }
});

test('info edits show up without a restart', async () => {
  const f = infoFile('{"title":"one"}');
  const app = await start({ infoFile: f, cacheMs: 60000 });
  const first = await (await fetch(url(app, '/api/status'))).json();
  fs.writeFileSync(f, '{"title":"two"}');
  const second = await (await fetch(url(app, '/api/status'))).json();
  app.close();
  assert.strictEqual(first.info.title, 'one');
  assert.strictEqual(second.info.title, 'two');
});
