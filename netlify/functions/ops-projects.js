/* Project list for the Ops Hub table. The editor only sees projects assigned to
   them; admins see everything plus the list of people they can assign to.
   ?since=<rev> answers { unchanged: true } cheaply when no project has changed since that marker.
   Projects numbered below FIRST_SHOWN are not listed (and are never read from storage, so the list loads
   faster and costs less). They stay in storage untouched; lower the number here, or set the
   OPS_MIN_PROJECT_NUMBER environment variable, to show older ones again. */
const U = require('./_ops-utils');

const FIRST_SHOWN = Number.parseInt(process.env.OPS_MIN_PROJECT_NUMBER, 10) || 651;
const shown = (key) => {
  const n = Number.parseInt(String(key).replace(/^projects\//, ''), 10);
  return Number.isNaN(n) || n >= FIRST_SHOWN;
};

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
      projects = (await Promise.all(blobs.filter(b => shown(b.key)).map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);
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
