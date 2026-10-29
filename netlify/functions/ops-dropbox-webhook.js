/* Dropbox calls this when files change in the account, so uploads show up in the hub within seconds
   without anything polling. Setup: Dropbox App Console > the app > Webhooks > add the URL of this function.
   GET ?challenge=...  -> Dropbox's one-time URL check (echo the challenge).
   POST                -> a change notification, signed with the app secret (X-Dropbox-Signature); on a
                          valid one, look at the newest not-yet-delivered projects (skipped if a check
                          ran in the last 10 seconds). Nothing else here is reachable without the signature. */
const crypto = require('crypto');
const U = require('./_ops-utils');
const Detect = require('./_ops-detect');

const text = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' }, body });

function validSignature(event) {
  const secret = process.env.DROPBOX_APP_SECRET;
  const h = event.headers || {};
  const got = String(h['x-dropbox-signature'] || h['X-Dropbox-Signature'] || '');
  if (!secret || !got) return false;
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : Buffer.from(event.body || '', 'utf8');
  const want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return want.length === got.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') return text(200, String((event.queryStringParameters || {}).challenge || ''));
  if (event.httpMethod !== 'POST') return text(405, 'Method Not Allowed');
  if (!validSignature(event)) return text(403, 'Bad signature');
  const store = U.opsStore(event);
  if (!store) return text(503, 'Storage unavailable');
  const r = await Detect.runAndRecord(store, { minGapMs: 10000 });
  if (r.changed.length) console.log('[ops-dropbox-webhook] new files on', r.changed.join(', '));
  return text(200, 'ok');
};
