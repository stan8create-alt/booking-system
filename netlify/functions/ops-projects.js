/* Project list for the Ops Hub table. The editor only sees projects assigned to
   them; admins see everything plus the list of people they can assign to.
   ?since=<rev> answers { unchanged: true } cheaply when no project has changed since that marker. */
const U = require('./_ops-utils');

exports.handler = async (event) => {
  const { session, response } = U.requireSession(event);
  if (response) return response;

  const store = U.opsStore(event);
  let projects = [], rev = '0';
  if (store) {
    try {
      rev = await U.getRev(store);   // read first: a change during the load shows up on the next check
      const since = (event.queryStringParameters || {}).since;
      if (since && since === rev) return U.json(200, { unchanged: true, rev });
      const { blobs } = await store.list({ prefix: 'projects/' });
      projects = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
    } catch (e) {
      console.error('[ops-projects] list failed:', e.message);
      return U.json(500, { error: 'Could not load projects' });
    }
  }

  if (session.role === 'editor') projects = projects.filter(p => U.assigneesOf(p).includes(session.username));
  projects.sort((a, b) => String(b.number).localeCompare(String(a.number)));
  const users = U.loadUsers().map(u => ({ username: u.username, name: u.name }));
  return U.json(200, { projects, users, rev });
};
