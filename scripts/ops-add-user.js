/* Adds (or replaces) one person in the hub's user list.
   Usage: node scripts/ops-add-user.js '<the one line the person sent you>'
          node scripts/ops-add-user.js --set-email <username> <email>
   Keeps the current list in .env.users (git-ignored; it holds only password hashes) and the
   helper tokens' hashes in .env.helpers. When done it copies the two lines to paste into
   Netlify (Site configuration > Environment variables > Import from a .env file; say
   yes to overwrite) onto your clipboard. Nothing secret is printed. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const USERS = path.join(ROOT, '.env.users');
const HELPERS = path.join(ROOT, '.env.helpers');

/* Change only someone's email (e.g. when Chris's address is ready):
   node scripts/ops-add-user.js --set-email chris chris@example.com */
if (process.argv[2] === '--set-email') {
  const [, , , who, mail] = process.argv;
  const list = JSON.parse(fs.readFileSync(USERS, 'utf8'));
  const u = list.find(x => x.username === who);
  if (!u || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail || '')) { console.error('Usage: --set-email <username> <email>'); process.exit(1); }
  u.email = mail;
  fs.writeFileSync(USERS, JSON.stringify(list));
  const hp = JSON.parse(fs.readFileSync(HELPERS, 'utf8'));
  execSync('pbcopy', { input: `OPS_USERS='${JSON.stringify(list)}'\nOPS_HELPERS='${JSON.stringify(hp)}'\n` });
  console.log(`Set ${u.name}'s email. The two lines for Netlify are on your clipboard.`);
  process.exit(0);
}

let entry;
try { entry = JSON.parse(process.argv[2] || ''); } catch { console.error('Paste the whole line in single quotes.'); process.exit(1); }
const ok = entry && /^[a-z]{2,20}$/.test(entry.username) && typeof entry.name === 'string' && ['admin', 'editor'].includes(entry.role)
  && /^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(entry.hash || '') && /^[^\s@]*@?[^\s@]*$/.test(entry.email || '');
if (!ok) { console.error('That line does not look right (username, name, role, email and hash are needed).'); process.exit(1); }

const users = JSON.parse(fs.readFileSync(USERS, 'utf8'));
const clean = { username: entry.username, name: entry.name, role: entry.role, email: entry.email || '', hash: entry.hash };
const i = users.findIndex(u => u.username === clean.username);
if (i >= 0) users[i] = clean; else users.push(clean);
fs.writeFileSync(USERS, JSON.stringify(users));

const helpers = JSON.parse(fs.readFileSync(HELPERS, 'utf8'));
const out = `OPS_USERS='${JSON.stringify(users)}'\nOPS_HELPERS='${JSON.stringify(helpers)}'\n`;
execSync('pbcopy', { input: out });
console.log(`${i >= 0 ? 'Updated' : 'Added'} ${clean.name}. Users now: ${users.map(u => u.username).join(', ')}. Helper tokens for: ${Object.keys(helpers).join(', ')}.`);
console.log('The two lines for Netlify are on your clipboard.');
