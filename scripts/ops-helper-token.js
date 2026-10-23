/* Makes a secret token for one Mac helper.
   Usage: node scripts/ops-helper-token.js stan
   Put the TOKEN in that Mac's helper config. Add the OPS_HELPERS entry (the hash, not the
   token) to the hub's environment. The hub never stores the token itself. */
const crypto = require('crypto');
const machine = (process.argv[2] || '').toLowerCase();
if (!/^[a-z]+$/.test(machine)) { console.error('Usage: node scripts/ops-helper-token.js <stan|andrew>'); process.exit(1); }
const token = crypto.randomBytes(32).toString('base64url');
console.log(`machine: ${machine}\nTOKEN (goes in the helper's config.json): ${token}\nOPS_HELPERS entry: "${machine}":"${crypto.createHash('sha256').update(token).digest('hex')}"`);
