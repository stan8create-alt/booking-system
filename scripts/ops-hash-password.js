/* Generate OPS_USERS + OPS_SESSION_SECRET for the Ops Hub.
   Usage: node scripts/ops-hash-password.js
   Prompts for each person's password (input is hidden) and prints the env var
   values to paste into Netlify. Nothing is written to disk. Press Enter on a
   name to leave that person out for now (add them later by running it again). */
const readline = require('readline');
const crypto = require('crypto');
const { hashPassword } = require('../netlify/functions/_ops-utils');

const PEOPLE = [
  { username: 'stan',   name: 'Stan',   role: 'admin' },
  { username: 'andrew', name: 'Andrew', role: 'admin' },
  { username: 'chris',  name: 'Chris',  role: 'editor' },
];

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
  return new Promise(res => rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); }));
}

(async () => {
  const users = [];
  for (const p of PEOPLE) {
    const pw = await ask(`Password for ${p.name} (${p.role}), min 12 chars, or Enter to skip: `);
    if (pw === '') continue;
    const email = (await ask(`Email for ${p.name} (Enter to skip for now): `)).trim();
    if (pw.length < 12) { console.error('Too short — start over.'); process.exit(1); }
    users.push({ ...p, email, hash: hashPassword(pw) });
  }
  if (!users.length) { console.error('No one added.'); process.exit(1); }
  console.log('\nOPS_USERS=' + JSON.stringify(users));
  console.log('OPS_SESSION_SECRET=' + crypto.randomBytes(48).toString('base64url'));
})();
