/* One project for the quick-look panel, plus the saved spokesperson list.
   The editor can only open projects assigned to them. */
const U = require('./_ops-utils');

exports.handler = async (event) => {
  const { session, response } = U.requireSession(event);
  if (response) return response;

  const number = String((event.queryStringParameters || {}).number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });

  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project || (session.role === 'editor' && !U.assigneesOf(project).includes(session.username))) {
    return U.json(404, { error: 'Project not found' });
  }
  const spokespeople = (await store.get('settings/spokespeople', { type: 'json' })) || {};
  return U.json(200, { project, spokespeople });
};
