const U = require('./_ops-utils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  return U.json(200, { ok: true }, { 'Set-Cookie': U.clearSessionCookie() });
};
