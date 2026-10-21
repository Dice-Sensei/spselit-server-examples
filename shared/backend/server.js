// A tiny website used as the "back server" in the examples.
// It shows which server answered, so students can SEE the load being shared.
const http = require('node:http');

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function createBackend(name) {
  let count = 0;
  return http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }
    count += 1;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Demo site</title>
<h1>Hello from ${escapeHtml(name)}</h1>
<p>This is request ${count} handled by this server.</p>`);
  });
}

if (require.main === module) {
  const name = process.env.NAME || 'backend';
  createBackend(name).listen(Number(process.env.PORT || 3000), () => console.log(`${name} ready`));
}

// Exit promptly on `podman stop` (Node as PID 1 ignores SIGTERM by default).
process.on('SIGTERM', () => process.exit(0));

module.exports = { createBackend };
