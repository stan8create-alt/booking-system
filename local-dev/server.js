/**
 * Local-only mock of the Netlify Functions backend, for building/testing the
 * booking-flow-v2 changes without ever touching the real Google Calendar or
 * Netlify Blobs. Serves the real index.html (read fresh on every request, so
 * edits show up on reload) and fakes every /.netlify/functions/* route
 * against an in-memory store seeded from fixtures/bookings.json.
 *
 * State resets to the seed file on every restart — that's intentional, so
 * each test run starts from the same known data.
 *
 * Run: node local-dev/server.js   (or `npm run dev:local`)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { ZONES, STORE_ZONE, AUTHORIZED_EMAILS } = require('./zones');

const PORT = process.env.PORT || 8888;
const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const SEED_PATH = path.join(__dirname, 'fixtures', 'bookings.json');

const ADMIN_USERNAME = 'login';
const ADMIN_PASSWORD = 'password';

let bookings = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
console.log(`[local-dev] loaded ${bookings.length} seed bookings`);

/* ── ET time helpers (mirrors _booking-utils.js isoToET, minus the module) ── */
function isoToET(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    mins: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
  };
}
// Simplified US/Canada DST rule — accurate enough for a local fixture server.
function etOffsetForDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const month = d.getUTCMonth(); // 0=Jan
  if (month > 2 && month < 10) return '-04:00'; // Apr–Oct always EDT
  if (month === 2) return d.getUTCDate() >= 8 ? '-04:00' : '-05:00';  // roughly 2nd Sun March
  if (month === 10) return d.getUTCDate() < 1 ? '-04:00' : '-05:00'; // roughly 1st Sun Nov
  return '-05:00';
}
function minsToISO(dateStr, mins) {
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${dateStr}T${hh}:${mm}:00${etOffsetForDate(dateStr)}`;
}
function minsToTime12(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* ── allowlist (mirrors isEmailAuthorized in _booking-utils.js) ── */
function isEmailAuthorized(email) {
  if (!AUTHORIZED_EMAILS.length) return true;
  return AUTHORIZED_EMAILS.includes((email || '').trim().toLowerCase());
}

/* ── admin auth (mirrors admin-auth.js / checkAuth in each admin function) ── */
function checkAdminAuth(req) {
  const token = req.headers['x-admin-token'];
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    return decoded.slice(0, i) === ADMIN_USERNAME && decoded.slice(i + 1) === ADMIN_PASSWORD;
  } catch { return false; }
}

function zoneCountsForDate(dateStr) {
  const counts = {};
  bookings.filter(b => b.date === dateStr && b.status !== 'cancelled')
    .forEach(b => { counts[b.zone] = (counts[b.zone] || 0) + 1; });
  return counts;
}

function sendJSON(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/* ── route handlers ── */
const routes = {
  'GET /.netlify/functions/get-busy': (req, res, q) => {
    const { date, from, to } = q;
    const inRange = (d) => (from && to) ? (d >= from && d <= to) : d === date;
    if (!date && !(from && to)) return sendJSON(res, 400, { error: 'Missing date or from/to' });
    const busy = bookings
      .filter(b => b.status !== 'cancelled' && inRange(b.date))
      .map(b => ({ start: minsToISO(b.date, b.startMin), end: minsToISO(b.date, b.endMin) }));
    sendJSON(res, 200, { busy });
  },

  'GET /.netlify/functions/get-day-info': (req, res, q) => {
    const { date, from, to } = q;
    if (from && to) {
      const byDate = {};
      for (const b of bookings) {
        if (b.status === 'cancelled' || b.date < from || b.date > to) continue;
        byDate[b.date] = byDate[b.date] || {};
        byDate[b.date][b.zone] = (byDate[b.date][b.zone] || 0) + 1;
      }
      const result = {};
      Object.entries(byDate).forEach(([d, zones]) => {
        result[d] = Object.entries(zones).map(([zone, bookedCount]) => ({ zone, bookedCount }));
      });
      return sendJSON(res, 200, { byDate: result });
    }
    if (date) {
      const counts = zoneCountsForDate(date);
      const summary = Object.entries(counts).map(([zone, bookedCount]) => ({ zone, bookedCount }));
      return sendJSON(res, 200, { summary });
    }
    sendJSON(res, 400, { error: 'Missing date or from/to' });
  },

  'GET /.netlify/functions/get-bookings': (req, res) => {
    if (!checkAdminAuth(req)) return sendJSON(res, 401, { error: 'Unauthorized' });
    sendJSON(res, 200, { bookings: bookings.filter(b => b.status !== 'cancelled') });
  },

  'GET /.netlify/functions/get-my-bookings': (req, res, q) => {
    const email = (q.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return sendJSON(res, 400, { error: 'A valid email is required' });
    sendJSON(res, 200, { bookings: bookings.filter(b => (b.strategistEmail || '').toLowerCase() === email) });
  },

  'POST /.netlify/functions/check-email': async (req, res) => {
    const body = JSON.parse((await readBody(req)) || '{}');
    sendJSON(res, 200, { authorized: isEmailAuthorized(body.email), enforced: AUTHORIZED_EMAILS.length > 0 });
  },

  'POST /.netlify/functions/create-booking': async (req, res) => {
    const body = JSON.parse((await readBody(req)) || '{}');
    const { startDateTime, endDateTime, bookingData } = body;
    const bookerEmail = (bookingData && bookingData.strategistEmail) || '';
    if (!isEmailAuthorized(bookerEmail)) {
      return sendJSON(res, 403, { error: 'This email is not authorized to book. Please contact your administrator.' });
    }
    const s = isoToET(startDateTime), e = isoToET(endDateTime);
    const id = 'bk_' + randomUUID().slice(0, 8);
    const eventId = 'local-ev-' + randomUUID().slice(0, 8);
    const record = {
      ...bookingData, id, eventId, status: 'confirmed',
      date: s.dateStr, startMin: s.mins, endMin: e.mins, createdAt: Date.now(),
    };
    bookings.push(record);
    console.log(`[local-dev] created booking ${eventId}: ${record.store} on ${record.date} ${minsToTime12(record.startMin)}-${minsToTime12(record.endMin)}`);
    sendJSON(res, 200, { success: true, eventId });
  },

  'POST /.netlify/functions/update-booking': async (req, res) => {
    if (!checkAdminAuth(req)) return sendJSON(res, 401, { error: 'Unauthorized' });
    const body = JSON.parse((await readBody(req)) || '{}');
    const { eventId, bookingData, startDateTime, endDateTime } = body;
    const rec = bookings.find(b => b.eventId === eventId);
    if (!rec) return sendJSON(res, 404, { error: 'Not found' });
    Object.assign(rec, bookingData);
    if (startDateTime) { const s = isoToET(startDateTime); rec.date = s.dateStr; rec.startMin = s.mins; }
    if (endDateTime) { const e = isoToET(endDateTime); rec.endMin = e.mins; }
    sendJSON(res, 200, { success: true });
  },

  'POST /.netlify/functions/update-my-booking': async (req, res) => {
    const body = JSON.parse((await readBody(req)) || '{}');
    const { eventId, email, packages, packageDetail, notes } = body;
    if (!eventId || !email) return sendJSON(res, 400, { error: 'Missing eventId or email' });
    const target = email.trim().toLowerCase();
    if (!isEmailAuthorized(target)) return sendJSON(res, 403, { error: 'This email is not authorized to book. Please contact your administrator.' });
    const rec = bookings.find(b => b.eventId === eventId);
    if (!rec) return sendJSON(res, 404, { error: 'Booking not found' });
    if ((rec.strategistEmail || '').trim().toLowerCase() !== target) {
      return sendJSON(res, 403, { error: 'This booking does not belong to that email' });
    }
    if (Array.isArray(packages)) rec.packages = packages;
    if (packageDetail) rec.packageDetail = packageDetail;
    if (notes != null) rec.notes = notes;
    sendJSON(res, 200, { success: true });
  },

  'POST /.netlify/functions/delete-booking': async (req, res) => {
    if (!checkAdminAuth(req)) return sendJSON(res, 401, { error: 'Unauthorized' });
    const body = JSON.parse((await readBody(req)) || '{}');
    const before = bookings.length;
    bookings = bookings.filter(b => b.eventId !== body.eventId);
    sendJSON(res, 200, { success: true, removed: before - bookings.length });
  },

  'POST /.netlify/functions/admin-auth': async (req, res) => {
    const body = JSON.parse((await readBody(req)) || '{}');
    if (body.username === ADMIN_USERNAME && body.password === ADMIN_PASSWORD) {
      return sendJSON(res, 200, { token: Buffer.from(`${body.username}:${body.password}`).toString('base64') });
    }
    sendJSON(res, 401, { error: 'Invalid credentials' });
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const q = Object.fromEntries(url.searchParams.entries());

  if (routes[key]) {
    try {
      await routes[key](req, res, q);
    } catch (err) {
      console.error(`[local-dev] ${key} threw:`, err);
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    fs.readFile(INDEX_HTML, 'utf8', (err, data) => {
      if (err) { res.writeHead(500); return res.end('Could not read index.html'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
});

server.listen(PORT, () => {
  console.log(`[local-dev] serving index.html + mock functions at http://localhost:${PORT}`);
  console.log(`[local-dev] admin login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  console.log(`[local-dev] authorized emails: ${AUTHORIZED_EMAILS.join(', ')}`);
});
