// Stops and starts containers by talking to podman's API over its unix socket.
//
// Safety: the status service can only touch containers whose names are on the
// `allowed` list, matched exactly. Anything else is refused BEFORE any network
// call is made. This matters because the socket can control every container
// of the user that runs podman.
const http = require('node:http');

function controlContainer(name, action, allowed, socketPath) {
  if (!Array.isArray(allowed) || !allowed.includes(name)) {
    return Promise.resolve({ ok: false, error: 'not-allowed' });
  }
  if (action !== 'stop' && action !== 'start') {
    return Promise.resolve({ ok: false, error: 'bad-action' });
  }
  return new Promise((resolve) => {
    const req = http.request(
      { socketPath, method: 'POST', path: `/v4.0.0/libpod/containers/${name}/${action}` },
      (res) => {
        res.resume();
        // 204 = done, 304 = it was already in that state; both are fine.
        resolve(res.statusCode === 204 || res.statusCode === 304
          ? { ok: true }
          : { ok: false, error: `podman-status-${res.statusCode}` });
      }
    );
    req.on('error', () => resolve({ ok: false, error: 'podman-unavailable' }));
    req.setTimeout(10000, () => req.destroy());
    req.end();
  });
}

// Is the socket reachable at all? Used so the page can hide the teacher buttons.
function socketAvailable(socketPath) {
  return new Promise((resolve) => {
    const req = http.request({ socketPath, method: 'GET', path: '/_ping' }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

module.exports = { controlContainer, socketAvailable };
