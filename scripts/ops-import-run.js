/* Loads the projects that already exist in Dropbox into a hub (run once after the first deploy).
   Usage: node scripts/ops-import-run.js <hub_url> <username>
   Asks for the password (hidden). Safe to run again: projects already in the hub are skipped,
   and nothing in Dropbox is changed (the one exception is the small "ensure-links" step at the end,
   which creates RAW/Exports share links for projects still in the works). */
const readline = require('readline');

const [base, username] = [(process.argv[2] || '').replace(/\/+$/, ''), process.argv[3]];
if (!base || !username) { console.error('Usage: node scripts/ops-import-run.js <hub_url> <username>'); process.exit(1); }

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
  const call = async (body) => {
    const r = await fetch(`${base}/.netlify/functions/ops-import`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${j.error || ''}`);
    return j;
  };
  console.log('Scanning Dropbox...');
  const { items, root } = await call({ action: 'scan' });
  const list = items.filter(i => !i.folder.startsWith('0000_')).reverse();   // newest first
  console.log(`Found ${list.length} project folders under ${root}. Importing...`);
  let saved = 0, skipped = 0; const failed = [];
  for (let i = 0; i < list.length; i += 8) {
    const r = await call({ action: 'import', items: list.slice(i, i + 8) });
    saved += r.saved.length; skipped += r.skipped.length; failed.push(...r.failed);
    process.stdout.write(`\r  ${Math.min(i + 8, list.length)}/${list.length}`);
  }
  console.log(`\nSaved ${saved}, already there ${skipped}, failed ${failed.length}.`);
  failed.forEach(f => console.log('  failed:', f.folder, f.error));
  console.log('Marking old projects as done:', JSON.stringify(await call({ action: 'legacy-done' })));
  console.log('Creating missing RAW/Exports links for projects in the works:', JSON.stringify(await call({ action: 'ensure-links' })));
})().catch(e => { console.error('\nStopped:', e.message); process.exit(1); });
