// The status service: a tiny web server with three jobs.
//   GET  /api/status   -> who is up, how fast (the live page polls this)
//   POST /api/control  -> stop/start an allow-listed container (teachers only, see gateway)
//   GET  /, /teacher/  -> the live page, and the same page with buttons
//
// Settings come from environment variables so each example configures it in compose.yaml.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { probeAll } = require('./probe');
const { controlContainer, socketAvailable } = require('./podman');

const FILES = {
  '/': ['index.html', 'text/html'],
  '/teacher/': ['teacher.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
};

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('too-large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function createApp(cfg) {
  return http.createServer(async (req, res) => {
    const pathname = req.url.split('?')[0];

    if (req.method === 'GET' && pathname === '/api/status') {
      const [targets, controlsAvailable] = await Promise.all([
        probeAll(cfg.targets, cfg.timeoutMs),
        socketAvailable(cfg.socketPath),
      ]);
      const out = { caption: cfg.caption, targets, controlsAvailable, controllable: cfg.controllable };
      // Database clusters: nodes that report a role but none is the writer means nobody can write.
      const withRole = targets.filter((t) => t.role);
      if (withRole.length > 0 && !withRole.some((t) => ['primary', 'master', 'leader'].includes(t.role))) {
        out.warning = 'No leader: the database cannot accept writes right now.';
      }
      return send(res, 200, out);
    }

    if (req.method === 'POST' && pathname === '/api/control') {
      let input;
      try { input = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'bad-json' }); }
      const result = await controlContainer(String(input && input.name), input && input.action, cfg.controllable, cfg.socketPath);
      if (result.ok) return send(res, 200, result);
      const status = result.error === 'not-allowed' || result.error === 'bad-action' ? 403
        : result.error === 'podman-unavailable' ? 503 : 502;
      return send(res, status, result);
    }

    if (req.method === 'GET' && FILES[pathname]) {
      const [file, type] = FILES[pathname];
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', file), 'utf8'), type);
    }

    send(res, 404, { error: 'not-found' });
  });
}

if (require.main === module) {
  const cfg = {
    caption: process.env.CAPTION || '',
    targets: JSON.parse(process.env.TARGETS || '[]'),
    controllable: (process.env.CONTROLLABLE || '').split(',').filter(Boolean),
    socketPath: process.env.PODMAN_SOCKET || '/run/podman/podman.sock',
    timeoutMs: 1500,
  };
  createApp(cfg).listen(Number(process.env.PORT || 3000), () => console.log('status service ready'));
}

module.exports = { createApp };
