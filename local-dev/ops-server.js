/**
 * Local-only server for previewing the Ops Hub (/ops). Separate from
 * local-dev/server.js so the booking mock is untouched.
 *
 * Serves ops.html and runs the real ops-* handlers with throwaway DEV logins
 * (below — never used in production). Reads the git-ignored .env for Dropbox/
 * monday settings (which point at a TEST Dropbox root with monday off) and keeps
 * project records in local-dev/.ops-data/ instead of Netlify Blobs.
 * Pass --demo to also show made-up sample rows.
 *
 * Run: node local-dev/ops-server.js   (http://localhost:8889/ops)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// Minimal .env loader (no dependency).
try {
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { console.log('[ops-dev] no .env found — Dropbox/monday features will report not configured'); }

const U = require('../netlify/functions/_ops-utils');

// File-backed stand-in for the Netlify Blobs store (get/setJSON/delete/list).
function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (k) => path.join(dir, encodeURIComponent(k) + '.json');
  return {
    async get(k) { try { return JSON.parse(fs.readFileSync(file(k), 'utf8')); } catch { return null; } },
    async setJSON(k, v) { fs.writeFileSync(file(k), JSON.stringify(v)); },
    async delete(k) { try { fs.unlinkSync(file(k)); } catch { /* gone */ } },
    async list({ prefix = '' } = {}) {
      const keys = fs.readdirSync(dir).map(f => decodeURIComponent(f.replace(/\.json$/, ''))).filter(k => k.startsWith(prefix));
      return { blobs: keys.map(key => ({ key })) };
    },
  };
}
U.setStoreOverride(fileStore(path.join(__dirname, '.ops-data')));

/* By default emails never leave this machine locally: they are written to local-dev/.ops-outbox and shown at /ops-outbox. */
const OUTBOX = path.join(__dirname, '.ops-outbox');
if (process.env.OPS_MAIL_TRANSPORT !== 'gmail') require('../netlify/functions/_ops-mail').setTransport(async (m) => {  // OPS_MAIL_TRANSPORT=gmail in .env sends for real instead
  fs.mkdirSync(OUTBOX, { recursive: true });
  const id = `${Date.now()}-${m.kind}-${m.recipient.toLowerCase()}`;
  fs.writeFileSync(path.join(OUTBOX, id + '.json'), JSON.stringify({ id, at: new Date().toISOString(), ...m }, null, 2));
});
const escH = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function outboxPage(id) {
  const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).filter(f => f.endsWith('.json')).sort().reverse() : [];
  const shell = (body) => `<!doctype html><meta charset="utf-8"><title>Ops outbox</title><body style="font:14px Arial;max-width:760px;margin:30px auto;padding:0 16px;color:#222">${body}`;
  if (id) {
    const f = path.join(OUTBOX, path.basename(id) + '.json');
    if (!fs.existsSync(f)) return shell('<p>Not found. <a href="/ops-outbox">Back</a></p>');
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    return shell(`<p><a href="/ops-outbox">&larr; Outbox</a></p><table style="font-size:13px;color:#555;margin-bottom:12px"><tr><td>From</td><td>${escH(m.from || '(not set)')}</td></tr><tr><td>To</td><td>${escH(m.to)}</td></tr><tr><td>Subject</td><td><strong style="color:#222">${escH(m.subject)}</strong></td></tr></table><div style="border:1px solid #ddd;border-radius:8px;padding:18px">${m.html}</div>`);
  }
  const rows = files.map(f => { const m = JSON.parse(fs.readFileSync(path.join(OUTBOX, f), 'utf8')); return `<li style="margin:8px 0"><a href="/ops-outbox/${escH(m.id)}">${escH(m.subject)}</a><br><span style="color:#777;font-size:12px">${escH(m.at)} → ${escH(m.to)}</span></li>`; }).join('');
  return shell(`<h2>Ops outbox (local only, nothing is really sent)</h2>${rows ? `<ul style="padding-left:18px">${rows}</ul>` : '<p>No emails yet.</p>'}`);
}

const PORT = process.env.PORT || 8889;
const ROOT = path.join(__dirname, '..');

const DEV_LOGINS = [
  { username: 'stan',   name: 'Stan',   role: 'admin',  email: 'stan@8create.ca',            password: 'dev-stan-local-1' },
  { username: 'andrew', name: 'Andrew', role: 'admin',  email: 'andrewkotovych@gmail.com',  password: 'dev-andrew-local-1' },
  { username: 'chris',  name: 'Chris',  role: 'editor', email: '',                          password: 'dev-chris-local-1' },   // Chris's address is added last
];
// Dev-only helper tokens (the Mac helper authenticates with these when pointed at this server)
process.env.OPS_HELPERS = JSON.stringify({
  stan: require('crypto').createHash('sha256').update('dev-helper-stan-local').digest('hex'),
  andrew: require('crypto').createHash('sha256').update('dev-helper-andrew-local').digest('hex'),
});
process.env.OPS_SESSION_SECRET = 'local-dev-secret-local-dev-secret-local-dev';
process.env.OPS_USERS = JSON.stringify(DEV_LOGINS.map(({ password, ...u }) => ({ ...u, hash: U.hashPassword(password) })));

const DEMO_PROJECTS = [
  { number: '0687', dealership: 'LOV', name: 'Service Video + Leila Videos', date: '2026-09-23',
    rawLink: '#', exportsLink: '#', assignees: ['chris'],
    folderCreatedAt: 1, rawUploadedAt: 1, rawDownloadedAt: 1, finalUploadedAt: null },
  { number: '0684', dealership: 'Woodbridge Toyota', name: 'Winter Tires 2026', date: '2026-09-14',
    rawLink: '#', exportsLink: '#', assignees: ['chris'],
    folderCreatedAt: 1, rawUploadedAt: 1, rawDownloadedAt: 1, finalUploadedAt: 1 },
  { number: '0688', dealership: 'Maple Mazda', name: 'Spring Service Promo', date: '2026-10-02',
    rawLink: '#', exportsLink: '#', assignees: [],
    folderCreatedAt: 1, rawUploadedAt: 1, rawDownloadedAt: null, finalUploadedAt: null },
  { number: '0689', dealership: 'MB Maple', name: 'Certified Pre-Owned', date: '2026-10-14',
    rawLink: '#', exportsLink: '#', assignees: [],
    folderCreatedAt: 1, rawUploadedAt: null, rawDownloadedAt: null, finalUploadedAt: null },
];

const handlers = {
  'admin-auth': require('../netlify/functions/admin-auth').handler, // booking login, to test the shared sign-in at /
  'ops-login': require('../netlify/functions/ops-login').handler,
  'ops-logout': require('../netlify/functions/ops-logout').handler,
  'ops-me': require('../netlify/functions/ops-me').handler,
  'ops-projects': async (event) => {
    const real = await require('../netlify/functions/ops-projects').handler(event);
    if (!process.argv.includes('--demo') || real.statusCode !== 200) return real;
    const { session } = U.requireSession(event);
    const demo = session.role === 'editor' ? DEMO_PROJECTS.filter(p => p.assignees.includes(session.username)) : DEMO_PROJECTS;
    return U.json(200, { projects: [...JSON.parse(real.body).projects, ...demo] });
  },
  'ops-create-project': require('../netlify/functions/ops-create-project').handler,
  'ops-dealerships': require('../netlify/functions/ops-dealerships').handler,
  'ops-project': require('../netlify/functions/ops-project').handler,
  'ops-update-project': require('../netlify/functions/ops-update-project').handler,
  'ops-add-note': require('../netlify/functions/ops-add-note').handler,
  'ops-videos': require('../netlify/functions/ops-videos').handler,
  'ops-update-video': require('../netlify/functions/ops-update-video').handler,
  'ops-links': require('../netlify/functions/ops-links').handler,
  'ops-manual-video': require('../netlify/functions/ops-manual-video').handler,
  'ops-deadline': require('../netlify/functions/ops-deadline').handler,
  'ops-headshots': require('../netlify/functions/ops-headshots').handler,
  'ops-assign': require('../netlify/functions/ops-assign').handler,
  'ops-import': require('../netlify/functions/ops-import').handler,
  'ops-complete': require('../netlify/functions/ops-complete').handler,
  'ops-detect': require('../netlify/functions/ops-detect').handler,
  'ops-helper': require('../netlify/functions/ops-helper').handler,
  'ops-number': require('../netlify/functions/ops-number').handler,
};

/* Locally Dropbox can't call us, so look for new files every 15 seconds (the deployed hub gets a webhook + a schedule instead). */
if (process.env.OPS_DETECT_POLL !== 'off') {
  const Detect = require('../netlify/functions/_ops-detect');
  let busy = false;
  setInterval(async () => {
    if (busy) return; busy = true;
    try { const ch = await Detect.checkAll(U.opsStore()); if (ch.length) console.log('[ops-dev] detected new files on', ch.join(', ')); }
    catch (e) { console.error('[ops-dev] detect failed:', e.message); }
    busy = false;
  }, 15000);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const fn = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/);
  if (fn && handlers[fn[1]]) {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      const out = await handlers[fn[1]]({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: Object.fromEntries(url.searchParams) });
      // Chrome only needs Secure dropped for plain http on non-localhost; keep it for fidelity.
      res.writeHead(out.statusCode, out.headers);
      res.end(out.body);
    });
    return;
  }
  if (url.pathname === '/ops-outbox' || url.pathname.startsWith('/ops-outbox/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(outboxPage(url.pathname.split('/')[2]));
  }
  const page = { '/ops': 'ops.html', '/ops.html': 'ops.html', '/ops-new': 'ops-new.html', '/ops-new.html': 'ops-new.html', '/': 'index.html' }[url.pathname];
  if (page) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(ROOT, page)));
  }
  res.writeHead(404); res.end('Not found');
}).listen(PORT, () => console.log(`[ops-dev] http://localhost:${PORT}/ops  (dev logins are listed in local-dev/ops-server.js)`));
