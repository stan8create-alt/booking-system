/* Manual "done" override for a project (admin only). Normally a project counts as
   done when its final exports land in Dropbox; this lets Stan/Andrew mark one done
   without exports, or reopen one that was marked done.
   Body: { number, done: true | false | null }  (null = back to automatic). */
const U = require('./_ops-utils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { session, response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = String(body.number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });
  if (![true, false, null].includes(body.done)) return U.json(400, { error: 'Bad value' });

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project) return U.json(404, { error: 'Project not found' });

  if (body.done === null) {
    delete project.manualDone; delete project.manualDoneBy; delete project.manualDoneAt;
  } else {
    project.manualDone = body.done; project.manualDoneBy = session.username; project.manualDoneAt = Date.now();
  }
  await store.setJSON(`projects/${number}`, project);
  return U.json(200, { project });
};
