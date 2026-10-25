/* Sends a test email through the live hub, to prove email works.
   Usage: node scripts/ops-mail-test.js <hub_url> <username>   (asks for the password, hidden)
   Optional second check: node scripts/ops-mail-test.js <hub_url> <username> --detect
   also shows when the 5-minute file check last ran. */
const readline = require('readline');
const [base, username] = [(process.argv[2] || '').replace(/\/+$/, ''), process.argv[3]];
if (!base || !username) { console.error('Usage: node scripts/ops-mail-test.js <hub_url> <username> [--detect]'); process.exit(1); }
function askHidden(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
  return new Promise(res => rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); }));
}
(async () => {
  const password = await askHidden(`Password for ${username}: `);
  const login = await fetch(`${base}/.netlify/functions/ops-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!login.ok) { console.error('Sign-in failed:', (await login.json().catch(() => ({}))).error || login.status); process.exit(1); }
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const call = async (fn, body) => { const r = await fetch(`${base}/.netlify/functions/${fn}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }; };

  const m = await call('ops-mail-test');
  if (!m.ok) { console.log('The hub does not have the email test yet (HTTP ' + m.status + '). Has the latest version been deployed?'); }
  else if (m.data.sent) console.log(`Email SENT in ${m.data.mode} mode, to ${m.data.to}. Check that inbox (and Spam).`);
  else console.log(`Email NOT sent (${m.data.mode} mode): ${m.data.reason}`);

  if (process.argv.includes('--detect')) {
    const d = await call('ops-detect', { status: true });
    const last = d.data && d.data.lastRun;
    console.log(last ? `File check last ran ${Math.round((Date.now() - last.at) / 60000)} min ago (new files on: ${(last.changed || []).join(', ') || 'none'}${last.error ? '; error: ' + last.error : ''}).`
                     : 'The scheduled file check has not run yet.');
  }
})().catch(e => { console.error('Stopped:', e.message); process.exit(1); });
