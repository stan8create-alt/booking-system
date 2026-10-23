/* Sends one email through the Gmail API with the Ops Hub's own OAuth token
   (separate from the booking site's Google token). Plain fetch, no extra packages.
   Env: OPS_GMAIL_CLIENT_ID, OPS_GMAIL_CLIENT_SECRET, OPS_GMAIL_REFRESH_TOKEN
   (created once by scripts/ops-gmail-auth.js). The email goes out as the account
   that authorized it. */

const configured = () => !!(process.env.OPS_GMAIL_CLIENT_ID && process.env.OPS_GMAIL_CLIENT_SECRET && process.env.OPS_GMAIL_REFRESH_TOKEN);

let cached = { token: null, exp: 0 };
async function accessToken() {
  if (cached.token && cached.exp > Date.now() + 60000) return cached.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.OPS_GMAIL_CLIENT_ID, client_secret: process.env.OPS_GMAIL_CLIENT_SECRET,
      refresh_token: process.env.OPS_GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google token refresh failed (${res.status}${j.error ? ' ' + j.error : ''})`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s) => s.replace(/(.{76})/g, '$1\r\n');
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const noBreaks = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

/* message: { from, to, subject, text, html } → raw RFC 822 text */
function buildMime(m) {
  const boundary = 'ops_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(body))}\r\n`;
  return [
    `From: Zanchin Hub <${noBreaks(m.from)}>`,
    `To: ${noBreaks(m.to)}`,
    `Subject: ${header(noBreaks(m.subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    part('text/plain', m.text) + part('text/html', m.html) + `--${boundary}--`,
  ].join('\r\n');
}

async function sendGmail(m) {
  const raw = Buffer.from(buildMime(m)).toString('base64url');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gmail send failed (${res.status}) ${t.slice(0, 200)}`);
  }
}

module.exports = { configured, sendGmail, buildMime };
