/* One-time Gmail authorization for the Ops Hub emails.
   Usage: node scripts/ops-gmail-auth.js
   Needs OPS_GMAIL_CLIENT_ID and OPS_GMAIL_CLIENT_SECRET in .env (a Google "Desktop app"
   OAuth client). Opens a Google consent page, you sign in as the sending account, and the
   refresh token is saved straight into .env as OPS_GMAIL_REFRESH_TOKEN. Nothing secret is
   printed. The token can only SEND email (no reading). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ENV = path.join(__dirname, '..', '.env');
const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}`;

function readEnv() {
  const out = {};
  try { for (const l of fs.readFileSync(ENV, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) out[m[1]] = m[2]; } } catch { /* none yet */ }
  return out;
}
function setEnv(key, value) {
  let text = ''; try { text = fs.readFileSync(ENV, 'utf8'); } catch { /* new file */ }
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : text.replace(/\n?$/, '\n') + `${key}=${value}\n`;
  fs.writeFileSync(ENV, text);
}

const env = readEnv();
const WANT = (env.OPS_MAIL_FROM || 'stan.8create@gmail.com').toLowerCase();   // the account emails are sent from
const id = env.OPS_GMAIL_CLIENT_ID, secret = env.OPS_GMAIL_CLIENT_SECRET;
if (!id || !secret) {
  console.error('Add OPS_GMAIL_CLIENT_ID and OPS_GMAIL_CLIENT_SECRET to .env first.');
  process.exit(1);
}

const state = require('crypto').randomBytes(16).toString('hex');
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: REDIRECT, response_type: 'code', state,
  scope: 'https://www.googleapis.com/auth/gmail.send openid email',
  access_type: 'offline', prompt: 'select_account consent',
});

const server = http.createServer(async (req, res) => {
  const q = new URL(req.url, REDIRECT).searchParams;
  if (!q.get('code') && !q.get('error')) { res.writeHead(404); return res.end(); }
  const done = (msg, code) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<body style="font:16px Arial;padding:40px">${msg}<br><br>You can close this tab.</body>`); console.log(msg.replace(/<[^>]+>/g, '')); server.close(); process.exitCode = code; };
  if (q.get('error')) return done('Google said: ' + q.get('error'), 1);
  if (q.get('state') !== state) return done('Security check failed (state mismatch). Run it again.', 1);
  try {
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: q.get('code'), client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
    });
    const t = await tr.json();
    if (!tr.ok) return done('Google rejected the code: ' + (t.error_description || t.error), 1);
    if (!t.refresh_token) return done('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and run this again.', 1);
    const who = JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString()).email || '';
    if (who.toLowerCase() !== WANT) return done(`You signed in as ${who}, but emails should come from ${WANT}. Nothing was saved. Run it again and pick ${WANT}.`, 1);
    setEnv('OPS_GMAIL_REFRESH_TOKEN', t.refresh_token);
    done(`Connected as <strong>${who}</strong>. The token was saved to .env.`, 0);
  } catch (e) { done('Something went wrong: ' + e.message, 1); }
});

server.listen(PORT, () => {
  console.log('Opening Google sign-in... if nothing opens, paste this into your browser:\n\n' + url + '\n');
  exec(`open "${url}"`);
});
