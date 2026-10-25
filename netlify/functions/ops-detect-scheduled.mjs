/* Runs every 5 minutes on Netlify (schedule below). Looks in Dropbox for new files on projects
   that aren't delivered yet: files in RAW Files, files in Video Exports (which also sends the
   "delivered" email). This is what keeps progress current on the live site; Dropbox can't call
   us on its own. The result of each run is saved so it can be checked (see ops-detect). */
import Detect from './_ops-detect.js';
import U from './_ops-utils.js';

export default async () => {
  const store = U.opsStore();     // scheduled functions get Netlify Blobs automatically
  let changed = [];
  let error = null;
  try {
    changed = await Detect.checkAll(store);
  } catch (e) {
    error = e.message;
    console.error('[ops-detect-scheduled]', e.message);
  }
  if (changed.length) console.log('[ops-detect-scheduled] new files on', changed.join(', '));
  try { if (store) await store.setJSON('settings/detect-last-run', { at: Date.now(), changed, error }); } catch { /* not worth failing the run */ }
  return new Response(JSON.stringify({ changed, error }), { status: 200 });
};

export const config = { schedule: '*/5 * * * *' };
