const U = require('./_ops-utils');

exports.handler = async (event) => {
  const session = U.getSession(event);
  if (!session) return U.json(401, { error: 'Not signed in' });
  return U.json(200, { user: session });
};
