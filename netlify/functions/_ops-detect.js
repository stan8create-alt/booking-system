/* Automatic progress from Dropbox. Run by the Dropbox webhook, a slow backup timer, and when an admin opens the hub. For a project that is not delivered yet it looks
   for real files in "RAW Files" (step 2: files uploaded) and "Video Exports"
   (step 4: final exports uploaded; step 3 can't be seen by Dropbox, so it is filled in
   with step 4). The first time files land in RAW Files, the people on the project get a
   "footage is ready" email; the first time the final exports appear, Stan and Andrew get the
   "delivered" email. Flags only ever turn on here; nothing is switched back off. */
const U = require('./_ops-utils');
const D = require('./_ops-dropbox');
const Mail = require('./_ops-mail');
const Email = require('./_ops-email');

const NOTIFY = ['stan', 'andrew'];

/* Returns { changed, project } — saves the project if anything changed. */
async function checkProject(store, project) {
  if (!project || !project.dropboxPath || project.finalUploadedAt) return { changed: false, project };
  const now = Date.now();
  let changed = false;
  let rawJustLanded = false;

  if (!project.rawUploadedAt && await D.hasRealFile(`${project.dropboxPath}/RAW Files`)) {
    project.rawUploadedAt = now; changed = true; rawJustLanded = true;
  }
  const delivered = await D.hasRealFile(`${project.dropboxPath}/Video Exports`);
  if (delivered) {
    project.finalUploadedAt = now;
    if (!project.rawUploadedAt) project.rawUploadedAt = now;
    if (!project.rawDownloadedAt) project.rawDownloadedAt = now;
    changed = true;
  }
  if (changed) await store.setJSON(`projects/${project.number}`, project);

  if (rawJustLanded && !delivered && !project.rawMailAt && Mail.mode() !== 'off') {   // if the finals are already there too, the delivered email is enough
    const videos = await Email.collectVideos(project);
    for (const username of Email.footageRecipients(project)) {
      const r = Mail.resolveRecipient(username);
      if (!r) continue;
      const res = await Mail.send({ username, kind: 'footage', ...Email.footageEmail({ project, videos, recipientName: r.name }) });
      (project.mailLog = project.mailLog || []).push({ kind: 'footage', to: username, at: Date.now(), sent: res.sent, reason: res.reason || null });
    }
    project.rawMailAt = Date.now();
    await store.setJSON(`projects/${project.number}`, project);
  }

  if (delivered && !project.deliveredMailAt) {      // after saving, so a mail problem can't undo the detection
    for (const username of NOTIFY) {
      const r = Mail.resolveRecipient(username);
      if (!r) continue;
      const msg = Email.deliveredEmail({ project, recipientName: r.name });
      const res = await Mail.send({ username, kind: 'delivered', ...msg });
      (project.mailLog = project.mailLog || []).push({ kind: 'delivered', to: username, at: Date.now(), sent: res.sent, reason: res.reason || null });
    }
    project.deliveredMailAt = Date.now();
    await store.setJSON(`projects/${project.number}`, project);
  }
  return { changed, project };
}

const OPEN_LIMIT = 15;   // only the newest not-yet-delivered projects are looked at

/* Checks the newest projects that aren't delivered yet (or just one). Returns the numbers that changed. */
async function checkAll(store, onlyNumber) {
  let numbers;
  if (onlyNumber) numbers = [onlyNumber];
  else numbers = await U.cached(store, 'open-projects', async () => {     // the list is rebuilt only when a project changed
    const { blobs } = await store.list({ prefix: 'projects/' });
    const open = [];
    for (const b of blobs) {
      const p = await store.get(b.key, { type: 'json' });
      if (p && p.dropboxPath && !p.finalUploadedAt) open.push(p.number);
    }
    return open.sort((a, b) => String(b).localeCompare(String(a))).slice(0, OPEN_LIMIT);
  });
  const out = [];
  for (const n of numbers) {
    const p = await store.get(`projects/${n}`, { type: 'json' });
    if (!p || p.finalUploadedAt) continue;
    try { if ((await checkProject(store, p)).changed) out.push(p.number); }
    catch (e) { console.error('[ops-detect]', p.number, e.message); }
  }
  return out;
}

/* One check that also records when it ran (shown by ops-detect { status: true }). With minGapMs it
   skips when a check ran that recently, so bursts of Dropbox notifications don't pile up. */
async function runAndRecord(store, { number = null, minGapMs = 0, error = null } = {}) {
  if (minGapMs) {
    const last = await store.get('settings/detect-last-run', { type: 'json' }).catch(() => null);
    if (last && Date.now() - last.at < minGapMs) return { changed: [], skipped: true, lastRun: last };
  }
  let changed = [], err = error;
  try { changed = await checkAll(store, number); }
  catch (e) { err = e.message; console.error('[ops-detect]', e.message); }
  const lastRun = { at: Date.now(), changed, error: err };
  try { await store.setJSON('settings/detect-last-run', lastRun); } catch { /* not worth failing the run */ }
  return { changed, lastRun };
}

module.exports = { checkProject, checkAll, runAndRecord };
