/* Slow backup timer (schedule in netlify.toml, every 2 hours). The Dropbox webhook (ops-dropbox-webhook)
   is the normal trigger; this only catches anything it missed. The result of each run is saved so it can
   be checked with ops-detect { status: true }. */
const U = require('./_ops-utils');
const Detect = require('./_ops-detect');

exports.handler = async (event) => {
  const store = U.opsStore(event);
  if (!store) { console.error('[ops-detect-scheduled] storage unavailable'); return { statusCode: 503 }; }
  const r = await Detect.runAndRecord(store);
  if (r.changed.length) console.log('[ops-detect-scheduled] new files on', r.changed.join(', '));
  return { statusCode: 200, body: JSON.stringify({ changed: r.changed, error: r.lastRun.error }) };
};
