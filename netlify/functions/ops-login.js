const U = require('./_ops-utils');

// Pre-computed hash used so unknown usernames cost the same time as wrong passwords.
const DUMMY_HASH = U.hashPassword('not-a-real-password');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  if (!U.secret() || U.loadUsers().length === 0) {
    return U.json(503, { error: 'Ops login is not configured yet' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) return U.json(400, { error: 'Enter your username and password' });

  const store = U.opsStore(event);
  const keys = [`user-${username}`, `ip-${U.clientIp(event)}`];

  const wait = await U.isLockedOut(store, keys);
  if (wait) return U.json(429, { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` });

  const user = U.loadUsers().find(u => String(u.username).toLowerCase() === username);
  const ok = U.verifyPassword(password, user ? user.hash : DUMMY_HASH) && !!user;
  if (!ok) {
    await U.recordFailure(store, keys);
    return U.json(401, { error: 'Wrong username or password' });
  }

  await U.clearFailures(store, keys);
  return U.json(200, { user: { username: user.username, name: user.name, role: user.role } },
    { 'Set-Cookie': U.makeSessionCookie(user) });
};
