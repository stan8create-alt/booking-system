/* Admin only: sends a small test email to the signed-in person (or, with { everyone: true }, a
   personalised one to every person), so email can be proven on the
   live site. In test mode it goes to OPS_MAIL_TEST_TO; in live mode to the person's own address.
   Returns what happened in plain terms. */
const U = require('./_ops-utils');
const Mail = require('./_ops-mail');
const Email = require('./_ops-email');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { session, response } = U.requireSession(event, ['admin']);
  if (response) return response;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { /* plain test */ }

  if (body.everyone === true) {      // a personalised test to every person in the hub (each at their own address in live mode)
    const results = [];
    for (const u of U.loadUsers()) {
      const res = await Mail.send({ username: u.username, kind: 'test', ...Email.testEmail({ recipientName: u.name, role: u.role }) });
      results.push({ user: u.username, ...res });
    }
    return U.json(200, { mode: Mail.mode(), results });
  }

  const r = Mail.resolveRecipient(session.username);
  const res = await Mail.send({
    username: session.username, kind: 'test',
    subject: 'Zanchin Hub test email',
    text: `Hi ${session.name},\n\nThis is a test from the Zanchin Hub. If you can read it, email is working.`,
    html: `<div style="font:15px/1.5 Arial,sans-serif"><p>Hi ${session.name},</p><p>This is a test from the Zanchin Hub. If you can read it, <strong>email is working</strong>.</p></div>`,
  });
  return U.json(200, { mode: Mail.mode(), wouldGoTo: r ? (r.test ? `${r.to || '(no test address set)'} (test mode; real address ${r.real || 'none'})` : r.to) : null, ...res });
};
