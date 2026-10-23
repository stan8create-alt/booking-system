/* Endpoint for the Mac helper (mac-helper/zanchin_helper.py) that builds the local
   Zanchin 12 folders. Not for browsers: each Mac has its own secret token, sent as
   "Authorization: Bearer <token>". OPS_HELPERS is a JSON object of machine name →
   SHA-256 of that machine's token (made by scripts/ops-helper-token.js).

   POST { action: 'pending' }                       → projects waiting for this machine
   POST { action: 'done',   number, path, lightroom } → folders created
   POST { action: 'failed', number, error }         → try again later (stays pending)
   A helper can only see and touch projects assigned to its own machine. */
const crypto = require('crypto');
const U = require('./_ops-utils');

function machineFor(event) {
  const h = event.headers || {};
  const m = String(h.authorization || h.Authorization || '').match(/^Bearer\s+(\S+)$/);
  if (!m) return null;
  let table; try { table = JSON.parse(process.env.OPS_HELPERS || '{}'); } catch { return null; }
  const got = Buffer.from(crypto.createHash('sha256').update(m[1]).digest('hex'));
  for (const [machine, hash] of Object.entries(table)) {
    const want = Buffer.from(String(hash));
    if (want.length === got.length && crypto.timingSafeEqual(want, got)) return machine;
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const machine = machineFor(event);
  if (!machine) return U.json(401, { error: 'Unknown helper' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });

  if (body.action === 'pending') {
    const { blobs } = await store.list({ prefix: 'projects/' });
    const out = [];
    for (const b of blobs) {
      const p = await store.get(b.key, { type: 'json' });
      if (p && p.localMirror && p.localMirror.status === 'pending' && p.localMirror.machine === machine) {
        out.push({ number: p.number, folder: p.folder });
      }
    }
    return U.json(200, { machine, pending: out });
  }

  if (body.action === 'done' || body.action === 'failed') {
    const number = String(body.number || '');
    if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });
    const p = await store.get(`projects/${number}`, { type: 'json' });
    if (!p || !p.localMirror || p.localMirror.machine !== machine) return U.json(404, { error: 'Not your project' });
    if (body.action === 'done') {
      p.localMirror = { status: 'done', machine, path: String(body.path || '').slice(0, 300), doneAt: Date.now(), lightroom: body.lightroom !== false };
    } else {
      p.localMirror = { ...p.localMirror, lastError: String(body.error || 'Failed').slice(0, 200), lastTryAt: Date.now() };
    }
    await store.setJSON(`projects/${number}`, p);
    return U.json(200, { ok: true });
  }
  return U.json(400, { error: 'Unknown action' });
};
