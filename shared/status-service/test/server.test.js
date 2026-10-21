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
