const test = require('node:test');
const assert = require('node:assert');
const { createBackend } = require('../server');

async function start(name) {
  const s = createBackend(name);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return s;
}

test('/health answers 200 ok', async () => {
  const s = await start('x');
  const r = await fetch(`http://127.0.0.1:${s.address().port}/health`);
  s.close();
  assert.strictEqual(r.status, 200);
  assert.strictEqual(await r.text(), 'ok');
});

test('the page names the server and counts requests', async () => {
  const s = await start('back-a');
  const base = `http://127.0.0.1:${s.address().port}/`;
  await fetch(base);
  const text = await (await fetch(base)).text();
  s.close();
  assert.ok(text.includes('back-a'));
  assert.ok(text.includes('request 2'));
});

test('the name is HTML-escaped', async () => {
  const s = await start('<b>x');
  const text = await (await fetch(`http://127.0.0.1:${s.address().port}/`)).text();
  s.close();
  assert.ok(!text.includes('<b>x'));
});
