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
