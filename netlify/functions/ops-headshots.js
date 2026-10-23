/* Mark whether headshots were taken on a project's shoot days (admin only).
   Ticking it assigns Stan automatically; unticking removes him again only if the
   tick is what added him (so an assignment made by hand is never undone).
   Body: { number, taken: true | false }. */
const U = require('./_ops-utils');

const HEADSHOT_USER = 'stan';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = String(body.number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });
  const taken = body.taken === true;

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project) return U.json(404, { error: 'Project not found' });

  const order = U.loadUsers().map(u => String(u.username).toLowerCase());
  const sortLikeUsers = (list) => list.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  let assignees = U.assigneesOf(project).slice();

  if (taken) {
    if (order.includes(HEADSHOT_USER) && !assignees.includes(HEADSHOT_USER)) {
      assignees = sortLikeUsers(assignees.concat(HEADSHOT_USER));
      project.headshotsAddedStan = true;
    } else if (project.headshotsAddedStan === undefined) {
      project.headshotsAddedStan = false;
    }
  } else if (project.headshotsAddedStan) {
    assignees = assignees.filter(a => a !== HEADSHOT_USER);
    project.headshotsAddedStan = false;
  }

  project.headshots = taken;
  project.assignees = assignees;
  delete project.assignedTo;
  await store.setJSON(`projects/${number}`, project);
  return U.json(200, { project });
};
