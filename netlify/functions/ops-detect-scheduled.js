/* Runs on a timer (schedule in netlify.toml). Looks in Dropbox for new files on projects that aren't
   delivered yet (RAW Files -> files uploaded, Video Exports -> delivered) and sends the matching emails.
   Written in the same style as the other hub functions. The result of each run is saved so it can be
   checked with ops-detect { status: true }. */
const U = require('./_ops-utils');
const Detect = require('./_ops-detect');

exports.handler = async (event) => {
  const store = U.opsStore(event);
  if (!store) { console.error('[ops-detect-scheduled] storage unavailable'); return { statusCode: 503 }; }
  let changed = [], error = null;
  try { changed = await Detect.checkAll(store); }
  catch (e) { error = e.message; console.error('[ops-detect-scheduled]', e.message); }
  if (changed.length) console.log('[ops-detect-scheduled] new files on', changed.join(', '));
  try { await store.setJSON('settings/detect-last-run', { at: Date.now(), changed, error }); } catch { /* not worth failing the run */ }
  return { statusCode: 200, body: JSON.stringify({ changed, error }) };
};
