const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { probeAll } = require('../probe');

function listen(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(s));
  });
}

test('a reachable target is reported up with a response time', async () => {
  const s = await listen((req, res) => res.end('ok'));
  const [r] = await probeAll([{ name: 'a', url: `http://127.0.0.1:${s.address().port}/` }], 1000);
  s.close();
  assert.strictEqual(r.name, 'a');
  assert.strictEqual(r.up, true);
  assert.ok(typeof r.ms === 'number');
});

test('a closed port is reported down with null ms', async () => {
  const s = await listen((req, res) => res.end('ok'));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  const [r] = await probeAll([{ name: 'b', url: `http://127.0.0.1:${port}/` }], 1000);
  assert.deepStrictEqual({ up: r.up, ms: r.ms }, { up: false, ms: null });
});

test('a hanging target is reported down within the timeout', async () => {
  const s = await listen(() => {});
  const t0 = Date.now();
  const [r] = await probeAll([{ name: 'c', url: `http://127.0.0.1:${s.address().port}/` }], 300);
  const took = Date.now() - t0;
  s.closeAllConnections();
  s.close();
  assert.strictEqual(r.up, false);
  assert.ok(took < 500, `took ${took}ms`);
});

test('a non-2xx answer counts as down', async () => {
  const s = await listen((req, res) => { res.statusCode = 503; res.end('no'); });
  const [r] = await probeAll([{ name: 'd', url: `http://127.0.0.1:${s.address().port}/` }], 1000);
  s.close();
  assert.strictEqual(r.up, false);
});

test('a JSON answer with a role passes role and lag through', async () => {
  const s = await listen((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ role: 'replica', state: 'running', replication_state: 'streaming', lag: 0 }));
  });
  const [r] = await probeAll([{ name: 'pg2', url: `http://127.0.0.1:${s.address().port}/` }], 1000);
  s.close();
  assert.strictEqual(r.role, 'replica');
  assert.strictEqual(r.lag, 0);
});

test('every probe opens a fresh connection (no reuse of old ones)', async () => {
  let connections = 0;
  const s = http.createServer((req, res) => res.end('ok'));
  s.on('connection', () => { connections += 1; });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const target = { name: 'k', url: `http://127.0.0.1:${s.address().port}/` };
  await probeAll([target], 1000);
  await probeAll([target], 1000);
  s.closeAllConnections();
  s.close();
  assert.strictEqual(connections, 2);
});

test('a target that was down and comes back on the same port is seen up again', async () => {
  const first = await listen((req, res) => res.end('ok'));
  const port = first.address().port;
  const target = { name: 'r', url: `http://127.0.0.1:${port}/` };
  assert.strictEqual((await probeAll([target], 500))[0].up, true);
  first.closeAllConnections();
  await new Promise((r) => first.close(r));
  assert.strictEqual((await probeAll([target], 500))[0].up, false);
  const second = await new Promise((resolve) => {
    const s = http.createServer((req, res) => res.end('ok')).listen(port, '127.0.0.1', () => resolve(s));
  });
  const after = await probeAll([target], 500);
  second.close();
  assert.strictEqual(after[0].up, true);
});

test('a down target says why: refused, timeout, or the HTTP status', async () => {
  const closed = await listen((req, res) => res.end('ok'));
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  const refused = (await probeAll([{ name: 'a', url: `http://127.0.0.1:${port}/` }], 500))[0];
  assert.match(refused.error, /ECONNREFUSED/);

  const hang = await listen(() => {});
  const slow = (await probeAll([{ name: 'b', url: `http://127.0.0.1:${hang.address().port}/` }], 200))[0];
  hang.closeAllConnections(); hang.close();
  assert.strictEqual(slow.error, 'timeout');

  const bad = await listen((req, res) => { res.statusCode = 503; res.end('no'); });
  const status = (await probeAll([{ name: 'c', url: `http://127.0.0.1:${bad.address().port}/` }], 500))[0];
  bad.close();
  assert.strictEqual(status.error, 'HTTP 503');
});
