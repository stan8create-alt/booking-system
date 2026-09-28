const { isEmailAuthorized, authorizedEmails } = require('./_booking-utils');

/* Simple in-memory per-IP rate limit against the allowlist-probing concern —
   this endpoint answers "is this email authorized?" for arbitrary input.
   Leaks across Netlify's ephemeral/plural containers, but raises the cost of
   a bulk scan enough to matter for ~a dozen lines, no dependency. */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const ip = event.headers['x-nf-client-connection-ip'] || 'unknown';
  if (rateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };
  }

  let email = '';
  try { ({ email } = JSON.parse(event.body || '{}')); } catch {}

  const enforced = authorizedEmails().length > 0;
  if (!enforced) console.warn('check-email: AUTHORIZED_EMAILS unset — allowlist disabled, gate is a no-op');

  // Always 200 — the client distinguishes "server said no" (deny) from
  // "server broke" (fail open), which are opposite treatments in the UI.
  return {
    statusCode: 200,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorized: isEmailAuthorized(email), enforced }),
  };
};
