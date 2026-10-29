/* Admin only: look in Dropbox now for new files on in-progress projects.
   Body: { number? } (one project, or the newest that aren't delivered), { auto: true } (same, skipped if a check ran in the last minute), or { status: true } to only report
   when the scheduled check last ran. Returns the numbers that changed and that last run. */
const U = require('./_ops-utils');
const Detect = require('./_ops-detect');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = body.number ? String(body.number) : null;
  if (number && !/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });
  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const lastRun = await store.get('settings/detect-last-run', { type: 'json' }).catch(() => null);
  if (body.status === true) return U.json(200, { lastRun });
  const r = await Detect.runAndRecord(store, { number, minGapMs: body.auto === true ? 60000 : 0 });   // auto: the hub opening, at most once a minute
  return U.json(200, { changed: r.changed, skipped: !!r.skipped, lastRun: r.lastRun });
};
