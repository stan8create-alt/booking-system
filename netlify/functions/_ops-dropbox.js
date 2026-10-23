/* Dropbox helpers for the Ops Hub. Plain fetch, no SDK.
   Env: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN,
        OPS_DROPBOX_ROOT (default /ZAG), OPS_COUNTER_SEED (only used when the
        counter file does not exist yet). */

const crypto = require('crypto');

const API = 'https://api.dropboxapi.com/2/';
const CONTENT = 'https://content.dropboxapi.com/2/';

function root() { return (process.env.OPS_DROPBOX_ROOT || '/ZAG').replace(/\/+$/, ''); }
function counterPath() { return `${root()}/0000_DO_NOT_TOUCH/counter.json`; }

class DropboxError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

let cached = { token: null, exp: 0 };
async function accessToken() {
  if (cached.token && cached.exp > Date.now() + 60_000) return cached.token;
  const { DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN } = process.env;
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    throw new DropboxError('Dropbox is not configured', 500);
  }
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: DROPBOX_REFRESH_TOKEN,
      client_id: DROPBOX_APP_KEY, client_secret: DROPBOX_APP_SECRET,
    }),
  });
  if (!res.ok) throw new DropboxError('Dropbox sign-in failed', res.status);
  const data = await res.json();
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in || 14_400) * 1000 };
  return cached.token;
}

/* Dropbox answers 429 / too_many_write_operations when several writes hit the
   same namespace at once (e.g. two people creating projects together). Retry
   with jittered backoff, honouring retry_after when given. */
async function withRetry(doFetch) {
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch();
    if (res.status !== 429 || attempt >= 6) return res;
    let wait = 0;
    try { wait = Number((await res.clone().json()).error.retry_after) || 0; } catch { /* no hint */ }
    await new Promise(r => setTimeout(r, Math.max(wait * 1000, 300 * 2 ** attempt) + Math.random() * 250));
  }
}

async function rpc(endpoint, arg) {
  const res = await withRetry(async () => fetch(API + endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  }));
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) throw new DropboxError(`Dropbox ${endpoint} failed (${res.status})`, res.status, json || text);
  return json;
}

/* Creates the folder and any missing parents. An existing folder is fine. */
async function ensureFolder(path) {
  try {
    await rpc('files/create_folder_v2', { path, autorename: false });
  } catch (e) {
    const conflict = e.status === 409 && JSON.stringify(e.body || '').includes('conflict');
    if (!conflict) throw e;
  }
}

async function getSharedLink(path) {
  try {
    const r = await rpc('sharing/create_shared_link_with_settings', { path });
    return r.url;
  } catch (e) {
    if (e.status === 409 && JSON.stringify(e.body || '').includes('shared_link_already_exists')) {
      const r = await rpc('sharing/list_shared_links', { path, direct_only: true });
      if (r.links && r.links[0]) return r.links[0].url;
    }
    throw e;
  }
}

async function listFolder(path) {
  const out = [];
  let r = await rpc('files/list_folder', { path, recursive: false });
  out.push(...r.entries);
  while (r.has_more) {
    r = await rpc('files/list_folder/continue', { cursor: r.cursor });
    out.push(...r.entries);
  }
  return out;
}

/* ── project-number counter ──
   Dropbox is the single source of truth. The counter is a tiny JSON file
   ({"last": N}, the same shape the old app wrote). A number is CLAIMED by
   uploading N+1 with mode "update" against the revision we read, so two people
   claiming at once can never both succeed — the loser gets a conflict and
   re-reads. */
async function readCounter() {
  const res = await withRetry(async () => fetch(CONTENT + 'files/download', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Dropbox-API-Arg': JSON.stringify({ path: counterPath() }) },
  }));
  if (res.status === 409) return null; // file does not exist yet
  if (!res.ok) throw new DropboxError(`Dropbox counter read failed (${res.status})`, res.status);
  const meta = JSON.parse(res.headers.get('dropbox-api-result'));
  const last = Number(JSON.parse(await res.text()).last);
  if (!Number.isInteger(last) || last < 0) throw new DropboxError('Counter file is corrupt', 500);
  return { last, rev: meta.rev };
}

async function writeCounter(last, mode) {
  const res = await withRetry(async () => fetch(CONTENT + 'files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: counterPath(), mode, autorename: false, mute: true }),
    },
    // The unique id matters: Dropbox treats an upload whose bytes equal the current
    // file as a harmless no-op even with a stale rev, which would let two people
    // claim the same number. Distinct content forces a real revision check.
    body: JSON.stringify({ last, claim: crypto.randomUUID(), at: new Date().toISOString() }),
  }));
  if (res.ok) return true;
  if (res.status === 409) return false; // revision / path conflict: someone else won
  throw new DropboxError(`Dropbox counter write failed (${res.status})`, res.status);
}

/* Read-only: the number the next project will get, as a 4-digit string. Never
   writes. A missing counter needs an explicit OPS_COUNTER_SEED, same as claiming. */
async function peekNextNumber() {
  const cur = await readCounter();
  if (cur) return String(cur.last + 1).padStart(4, '0');
  const seed = process.env.OPS_COUNTER_SEED;
  if (seed === undefined || seed === '' || !Number.isInteger(Number(seed))) {
    throw new DropboxError('Counter file not found and OPS_COUNTER_SEED is not set', 500);
  }
  return String(Number(seed) + 1).padStart(4, '0');
}

/* Returns { number: 688 }. Never resets: a missing counter requires an explicit
   OPS_COUNTER_SEED, so a Dropbox hiccup can't silently restart numbering at 1. */
async function claimNextNumber(mirrorLast) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let cur = await readCounter();
    if (!cur) {
      const seed = process.env.OPS_COUNTER_SEED;
      if (seed === undefined || seed === '' || !Number.isInteger(Number(seed))) {
        throw new DropboxError('Counter file not found and OPS_COUNTER_SEED is not set', 500);
      }
      if (await writeCounter(Number(seed), { '.tag': 'add' })) cur = await readCounter();
      else continue; // someone created it first
    }
    if (mirrorLast != null && mirrorLast > cur.last) {
      throw new DropboxError(`Counter mismatch: Dropbox says ${cur.last}, last recorded is ${mirrorLast}. Check before creating.`, 409);
    }
    const next = cur.last + 1;
    if (await writeCounter(next, { '.tag': 'update', update: cur.rev })) return { number: next };
  }
  throw new DropboxError('Could not claim a project number (busy). Try again.', 409);
}

/* Best-effort undo if creation fails right after claiming: only rolls back when
   the counter is still exactly our number, so it can never erase someone
   else's claim. */
async function releaseNumber(number) {
  try {
    const cur = await readCounter();
    if (cur && cur.last === number) await writeCounter(number - 1, { '.tag': 'update', update: cur.rev });
  } catch { /* leave a gap rather than risk corrupting the counter */ }
}

/* Read-only helpers for importing existing projects (never create anything). */
async function listFolderOrEmpty(path) {
  try { return await listFolder(path); }
  catch (e) { if (e.status === 409) return []; throw e; }
}
async function existingSharedLink(path) {
  try {
    const r = await rpc('sharing/list_shared_links', { path, direct_only: true });
    return (r.links && r.links[0] && r.links[0].url) || null;
  } catch (e) { if (e.status === 409) return null; throw e; }
}

/* True if the folder (or anything inside it) holds a real file. Skips macOS junk like ._x and .DS_Store. */
async function hasRealFile(path) {
  let r;
  try { r = await rpc('files/list_folder', { path, recursive: true, limit: 200 }); }
  catch (e) { if (e.status === 409) return false; throw e; }
  for (let page = 0; page < 10; page++) {
    if (r.entries.some(e => e['.tag'] === 'file' && !e.name.startsWith('.'))) return true;
    if (!r.has_more) return false;
    r = await rpc('files/list_folder/continue', { cursor: r.cursor });
  }
  return false;
}

module.exports = {
  root, counterPath, DropboxError, hasRealFile,
  ensureFolder, getSharedLink, listFolder, listFolderOrEmpty, existingSharedLink,
  readCounter, writeCounter, peekNextNumber, claimNextNumber, releaseNumber,
};
