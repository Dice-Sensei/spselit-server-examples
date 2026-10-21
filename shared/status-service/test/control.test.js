const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { controlContainer } = require('../podman');

function sockPath(tag) {
  return process.platform === 'win32'
    ? '\\\\.\\pipe\\' + `status-test-${process.pid}-${tag}`
    : path.join(os.tmpdir(), `status-test-${process.pid}-${tag}.sock`);
}

function fakePodman(tag) {
  const seen = [];
  const sock = sockPath(tag);
  const server = http.createServer((req, res) => { seen.push(`${req.method} ${req.url}`); res.statusCode = 204; res.end(); });
  return new Promise((resolve) => server.listen(sock, () => resolve({ server, sock, seen })));
}

for (const bad of ['db; rm', '../x', 'db%2f', 'db ', '', 'other']) {
  test(`name ${JSON.stringify(bad)} is refused without touching the socket`, async () => {
    const { server, sock, seen } = await fakePodman('bad' + Math.random().toString(36).slice(2, 6));
    const r = await controlContainer(bad, 'stop', ['db'], sock);
    server.close();
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(seen, []);
  });
}

test('an unknown action is refused', async () => {
  const r = await controlContainer('db', 'delete', ['db'], sockPath('none'));
  assert.strictEqual(r.ok, false);
});

test('a missing socket gives podman-unavailable', async () => {
  const r = await controlContainer('db', 'stop', ['db'], sockPath('missing'));
  assert.deepStrictEqual(r, { ok: false, error: 'podman-unavailable' });
});

for (const action of ['stop', 'start']) {
  test(`allowed name sends exactly the ${action} request`, async () => {
    const { server, sock, seen } = await fakePodman(action);
    const r = await controlContainer('db', action, ['db'], sock);
    server.close();
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(seen, [action === 'stop' ? 'POST /v4.0.0/libpod/containers/db/stop?timeout=2' : 'POST /v4.0.0/libpod/containers/db/start']);
  });
}
