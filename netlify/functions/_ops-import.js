/* Bring projects that already exist in Dropbox into the Ops Hub list. Read-only
   against Dropbox: it lists folders and looks up share links that already exist,
   it never creates anything there.

   Layout it understands (same as project creation):
     <root>/<Brand>/<Dealership>/NNNN_<Dealership>_<Project>_<YYYY-MM-DD>_<who>
     <root>/Zanchin/NNNN_<...>
   Only 4-digit numbers are imported. Progress comes from what is in the folders:
   anything in RAW Files = files uploaded, anything in Video Exports = delivered
   (which also implies the files were downloaded). */
const D = require('./_ops-dropbox');

/* Projects dated on or before this day count as finished when imported, so old folders
   that were never filled in don't clutter the "in the works" list. */
const DONE_THROUGH = '2026-10-15';

const SKIP_TOP = /^(0000|01_|Drone)/;
const SUBFOLDERS = { raw: 'RAW Files', exports: 'Video Exports' };

function importRoot() { return (process.env.OPS_IMPORT_ROOT || D.root()).replace(/\/+$/, ''); }

/* Pull number / project name / date out of a folder name. */
function parseFolder(name) {
  const m = name.match(/^(\d{4})_(.*)$/);
  if (!m) return null;
  const date = (m[2].match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
  const head = date ? m[2].slice(0, m[2].indexOf(date)) : m[2];
  const parts = head.split('_').map(s => s.trim()).filter(Boolean);
  const project = (parts.length > 1 ? parts.slice(1).join(' - ') : parts[0] || '').trim();
  return { number: m[1], project: project || name, date };
}

/* Runs fn over items, a few at a time (keeps the scan fast without hammering Dropbox). */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/* One list of every project folder under the root: [{ number, brand, dealership, folder, path }]. */
async function scan() {
  const root = importRoot();
  const brands = (await D.listFolder(root)).filter(e => e['.tag'] === 'folder' && !SKIP_TOP.test(e.name));
  const perBrand = await mapLimit(brands, 6, async (b) => {
    const items = [];
    const level1 = (await D.listFolder(`${root}/${b.name}`)).filter(e => e['.tag'] === 'folder');
    const nested = [];
    for (const k of level1) {
      if (/^\d{4}_/.test(k.name)) items.push({ brand: b.name, dealership: b.name, folder: k.name, path: `${root}/${b.name}/${k.name}` });
      else nested.push(k);
    }
    const lists = await mapLimit(nested, 4, async (k) => ({ k, kids: (await D.listFolder(`${root}/${b.name}/${k.name}`)).filter(e => e['.tag'] === 'folder') }));
    for (const { k, kids } of lists) {
      for (const s of kids) if (/^\d{4}_/.test(s.name)) items.push({ brand: b.name, dealership: k.name, folder: s.name, path: `${root}/${b.name}/${k.name}/${s.name}` });
    }
    return items;
  });
  const items = perBrand.flat();
  items.sort((a, b) => a.folder.localeCompare(b.folder));
  return items;
}

/* The path must sit under the import root and name a numbered project folder. */
function validItem(it) {
  return it && typeof it.path === 'string' && typeof it.folder === 'string'
    && it.path.startsWith(importRoot() + '/') && !it.path.includes('..')
    && /^\d{4}_/.test(it.folder) && !it.folder.startsWith('0000_') && it.path.endsWith('/' + it.folder);
}

function stamp(date) {
  const t = date ? Date.parse(date + 'T12:00:00Z') : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

/* Marks an imported record fully done if it is old enough. Returns true if it changed. */
function markLegacyDone(rec) {
  if (!rec || !rec.imported || (rec.date && rec.date > DONE_THROUGH)) return false; // undated folders are old ones
  let changed = false;
  for (const k of ['folderCreatedAt', 'rawUploadedAt', 'rawDownloadedAt', 'finalUploadedAt']) {
    if (!rec[k]) { rec[k] = stamp(rec.date || DONE_THROUGH); changed = true; }
  }
  return changed;
}

/* Build the stored record for one scanned folder (a few read-only Dropbox calls). */
async function buildRecord(it) {
  const parsed = parseFolder(it.folder);
  const [raw, exps, deliveryLink, rawLink, exportsLink] = await Promise.all([
    D.listFolderOrEmpty(`${it.path}/${SUBFOLDERS.raw}`),
    D.listFolderOrEmpty(`${it.path}/${SUBFOLDERS.exports}`),
    D.existingSharedLink(it.path),
    D.existingSharedLink(`${it.path}/${SUBFOLDERS.raw}`),
    D.existingSharedLink(`${it.path}/${SUBFOLDERS.exports}`),
  ]);
  const at = stamp(parsed.date);
  const hasRaw = raw.length > 0, delivered = exps.some(e => e['.tag'] === 'file');
  const rec = {
    number: parsed.number, dealership: it.dealership, brand: it.brand, name: parsed.project,
    folder: it.folder, date: parsed.date, dropboxPath: it.path,
    deliveryLink, rawLink, exportsLink, monday: { ok: false, skipped: true },
    createdBy: null, imported: true,
    folderCreatedAt: at,
    rawUploadedAt: hasRaw || delivered ? at : null,
    rawDownloadedAt: delivered ? at : null,
    finalUploadedAt: delivered ? at : null,
    assignees: [], localMirror: { status: 'n/a' },
  };
  markLegacyDone(rec);
  return rec;
}

module.exports = { DONE_THROUGH, markLegacyDone, importRoot, parseFolder, scan, validItem, buildRecord };
