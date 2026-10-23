/* Sending side of the Ops Hub emails. Everything here is best-effort: send() never
   throws, so a mail problem can never block assigning a project or saving anything.

   OPS_MAIL_MODE:
     off   (default) nothing is sent
     test  every email goes to OPS_MAIL_TEST_TO instead of the real person, with a
           "[TEST → who]" subject, so the real flow can be tried safely
     live  emails go to each person's own address (OPS_USERS[].email)
   OPS_MAIL_FROM is the sender address (must be the Gmail account that authorized).
   The transport is the Gmail API when OPS_GMAIL_* is set; local-dev/ops-server.js can
   swap in a file "outbox" with setTransport instead. */
const U = require('./_ops-utils');
const Gmail = require('./_ops-gmail');

let transport = null; // local-dev: (message) => Promise
function setTransport(fn) { transport = fn; }

const mode = () => (process.env.OPS_MAIL_MODE || 'off').toLowerCase();
const fromAddress = () => process.env.OPS_MAIL_FROM || '';

/* Works out the real address for a username and where the email actually goes. */
function resolveRecipient(username) {
  const user = U.loadUsers().find(u => String(u.username).toLowerCase() === String(username).toLowerCase());
  if (!user) return null;
  const real = user.email || '';
  if (mode() === 'test') {
    const to = process.env.OPS_MAIL_TEST_TO || '';
    return { name: user.name, real, to, test: true };
  }
  return { name: user.name, real, to: real, test: false };
}

/* message: { username, subject, text, html, kind } → { sent, to?, reason? } */
async function send(message) {
  try {
    if (mode() === 'off') return { sent: false, reason: 'Mail is off' };
    const r = resolveRecipient(message.username);
    if (!r) return { sent: false, reason: 'Unknown user' };
    if (!r.to) return { sent: false, reason: r.test ? 'No test address set' : `${r.name} has no email address yet` };

    let { subject, text, html } = message;
    if (r.test) {
      const label = `[TEST → ${r.name}${r.real ? ` <${r.real}>` : ' (no address yet)'}]`;
      subject = `${label} ${subject}`;
      const banner = `Test mode: this would have gone to ${r.name}${r.real ? ` (${r.real})` : ' (no address set yet)'}.`;
      text = `${banner}\n\n${text}`;
      html = `<p style="margin:0 0 16px;padding:8px 12px;background:#fff7e0;border:1px solid #f0d78c;border-radius:6px;font:13px Arial,sans-serif;color:#7a5b00">${banner}</p>${html}`;
    }
    const out = { from: fromAddress(), to: r.to, subject, text, html, kind: message.kind || 'mail', recipient: r.name };
    const send = transport || (Gmail.configured() ? Gmail.sendGmail : null);
    if (!send) return { sent: false, reason: 'Gmail is not connected yet' };
    await send(out);
    return { sent: true, to: r.to };
  } catch (e) {
    console.error('[ops-mail] send failed:', e.message);
    return { sent: false, reason: 'Send failed' };
  }
}

module.exports = { setTransport, send, mode, resolveRecipient };
