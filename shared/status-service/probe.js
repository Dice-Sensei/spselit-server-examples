// Asks each target "are you alive?" and reports the answer.
// A target counts as up only if it answers with a 2xx status in time.

async function probeOne(target, timeoutMs) {
  const start = Date.now();
  try {
    const res = await fetch(target.url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { name: target.name, up: false, ms: null };
    const result = { name: target.name, up: true, ms: Date.now() - start };
    // Some targets (for example Patroni) answer with JSON describing themselves.
    // If it names a role, pass the interesting parts through to the live page.
    if ((res.headers.get('content-type') || '').includes('json')) {
      const body = await res.json().catch(() => null);
      if (body && typeof body.role === 'string') {
        result.role = body.role;
        if ('lag' in body) result.lag = body.lag;
        if (typeof body.replication_state === 'string') result.replication_state = body.replication_state;
      }
    }
    return result;
  } catch {
    return { name: target.name, up: false, ms: null };
  }
}

// Patroni answers 503 on a node that is not the leader when asked about "primary",
// but answers 200 with its role on "/". Callers choose the URL; we only judge the status.
function probeAll(targets, timeoutMs) {
  return Promise.all(targets.map((t) => probeOne(t, timeoutMs)));
}

module.exports = { probeAll };
