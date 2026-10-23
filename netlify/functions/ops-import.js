/* Admin only. Brings projects that already exist in Dropbox into the Ops Hub list.
     { action: 'scan' }                  → every numbered project folder found
     { action: 'import', items: [...] }  → saves up to 8 of them (items from a scan)
     { action: 'ensure-links' }          → creates missing RAW/Exports share links for in-works imported projects
     { action: 'legacy-done' }           → marks imported projects dated on/before Oct 15 2026 as done
   Existing records are never overwritten, so it is safe to run again. */
const U = require('./_ops-utils');
const I = require('./_ops-import');

const BATCH = 8; // keeps one request under the default Netlify function time limit

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });

  try {
    if (body.action === 'scan') {
      const items = await I.scan();
      return U.json(200, { root: I.importRoot(), count: items.length, items });
    }
    if (body.action === 'import') {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, BATCH).filter(I.validItem);
      const out = { saved: [], skipped: [], failed: [] };
      for (const it of items) {
        const number = it.folder.slice(0, 4);
        try {
          if (await store.get(`projects/${number}`, { type: 'json' })) { out.skipped.push(it.folder); continue; }
          await store.setJSON(`projects/${number}`, await I.buildRecord(it));
          out.saved.push(number);
        } catch (e) { out.failed.push({ folder: it.folder, error: e.message }); }
      }
      return U.json(200, out);
    }
    if (body.action === 'legacy-done') { // no Dropbox calls: re-applies the "old = done" rule to saved records
      const { blobs } = await store.list({ prefix: 'projects/' });
      let changed = 0;
      for (const b of blobs) {
        const rec = await store.get(b.key, { type: 'json' });
        if (I.markLegacyDone(rec)) { await store.setJSON(b.key, rec); changed++; }
      }
      return U.json(200, { through: I.DONE_THROUGH, changed });
    }
    if (body.action === 'ensure-links') { // in-works imported projects need RAW + Exports links (done ones only use Delivery)
      const D = require('./_ops-dropbox');
      const { blobs } = await store.list({ prefix: 'projects/' });
      const out = { created: [], failed: [] };
      for (const b of blobs) {
        const rec = await store.get(b.key, { type: 'json' });
        const done = rec && (rec.manualDone === true || (rec.manualDone !== false && !!rec.finalUploadedAt));
        if (!rec || !rec.imported || done || !rec.dropboxPath || (rec.rawLink && rec.exportsLink)) continue;
        try {
          if (!rec.rawLink) rec.rawLink = await D.getSharedLink(`${rec.dropboxPath}/RAW Files`);
          if (!rec.exportsLink) rec.exportsLink = await D.getSharedLink(`${rec.dropboxPath}/Video Exports`);
          await store.setJSON(b.key, rec);
          out.created.push(rec.number);
        } catch (e) { out.failed.push({ number: rec.number, error: e.message }); }
      }
      return U.json(200, out);
    }
    return U.json(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[ops-import]', e.message);
    return U.json(500, { error: 'Import failed: ' + e.message });
  }
};
