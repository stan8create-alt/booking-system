/* Shared helpers for the Ops Hub (/ops). Everything here is separate from the
   strategist booking side — nothing in this file is imported by booking code.

   Auth model: three named logins (Stan, Andrew, Chris), each with their own
   password. Users come from the OPS_USERS env var (JSON array, see
   scripts/ops-hash-password.js); sessions are HMAC-signed cookies keyed by
   OPS_SESSION_SECRET. If either env var is missing, login FAILS CLOSED. */
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const OPS_STORE_NAME = 'ops';
const COOKIE_NAME = 'ops_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
const MAX_FAILS = 5;
const LOCKOUT_SECONDS = 15 * 60;

/* ── users / passwords ── */
function loadUsers() {
  try {
    const list = JSON.parse(process.env.OPS_USERS || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// hash format: scrypt$<N>$<saltHex>$<keyHex>
function hashPassword(password, saltHex) {
  const N = 16384;
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N });
  return `scrypt$${N}$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, n, saltHex, keyHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n) });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

/* ── signed session cookie ── */
function secret() {
  const s = process.env.OPS_SESSION_SECRET || '';
  return s.length >= 32 ? s : null;
}
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function sign(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

function makeSessionCookie(user) {
  const payload = b64u(JSON.stringify({
    u: user.username, n: user.name, r: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }));
  return `${COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}
function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function readCookie(event, name) {
  const header = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/* Returns { username, name, role } for a valid session, else null. A user that
   has been removed from OPS_USERS since the cookie was issued is rejected. */
function getSession(event) {
  if (!secret()) return null;
  const raw = readCookie(event, COOKIE_NAME);
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    const user = loadUsers().find(u => u.username === data.u);
    if (!user) return null;
    return { username: user.username, name: user.name, role: user.role };
  } catch { return null; }
}

/* roles: array of allowed roles, or omitted for any signed-in user.
   Returns { session } or { response } (a ready 401/403). */
function requireSession(event, roles) {
  const session = getSession(event);
  if (!session) return { response: json(401, { error: 'Not signed in' }) };
  if (roles && !roles.includes(session.role)) return { response: json(403, { error: 'Not allowed' }) };
  return { session };
}

/* ── storage ── */
let storeOverride = null; // local-dev only: lets local-dev/ops-server.js swap in a file-backed store
function setStoreOverride(s) { storeOverride = s; }
function opsStore(event) {
  if (storeOverride) return storeOverride;
  try {
    if (event) connectLambda(event);
    return getStore(OPS_STORE_NAME);
  } catch (e) {
    console.error('[ops] store unavailable:', e.message);
    return null;
  }
}

/* ── login throttling (per username + per IP, kept in the ops store) ── */
async function throttleState(store, key) {
  if (!store) return { fails: 0, until: 0 };
  try { return (await store.get(`throttle/${key}`, { type: 'json' })) || { fails: 0, until: 0 }; }
  catch { return { fails: 0, until: 0 }; }
}
async function isLockedOut(store, keys) {
  const now = Date.now() / 1000;
  for (const k of keys) {
    const s = await throttleState(store, k);
    if (s.until && s.until > now) return Math.ceil(s.until - now);
  }
  return 0;
}
async function recordFailure(store, keys) {
  if (!store) return;
  const now = Date.now() / 1000;
  for (const k of keys) {
    const s = await throttleState(store, k);
    const fails = (s.until && s.until < now ? 0 : s.fails) + 1;
    await store.setJSON(`throttle/${k}`, {
      fails, until: fails >= MAX_FAILS ? now + LOCKOUT_SECONDS : 0,
    });
  }
}
async function clearFailures(store, keys) {
  if (!store) return;
  for (const k of keys) { try { await store.delete(`throttle/${k}`); } catch { /* ignore */ } }
}

function clientIp(event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'unknown').split(',')[0].trim();
}

/* A project can have several people on it. `assignees` is the list of usernames;
   projects saved before multi-assign only have the single `assignedTo`. */
function assigneesOf(project) {
  if (project && Array.isArray(project.assignees)) return project.assignees;
  return project && project.assignedTo ? [project.assignedTo] : [];
}

/* Highest urgency among the videos that still need editing — folder videos
   (project.videos, keyed by folder name; `folderNames` limits it to folders that
   currently exist) plus manually added ones (project.manualVideos). */
function urgencyOf(project, folderNames) {
  const rank = ['regular', 'urgent', 'asap'];
  let best = 'regular';
  const consider = (v) => { if (v && v.include !== false && rank.indexOf(v.urgency) > rank.indexOf(best)) best = v.urgency; };
  const saved = (project && project.videos) || {};
  (folderNames || Object.keys(saved)).forEach(n => consider(saved[n]));
  ((project && project.manualVideos) || []).forEach(consider);
  return best;
}

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  };
}

module.exports = {
  loadUsers, hashPassword, verifyPassword, secret,
  makeSessionCookie, clearSessionCookie, getSession, requireSession, assigneesOf, urgencyOf,
  opsStore, setStoreOverride, isLockedOut, recordFailure, clearFailures, clientIp, json,
};
