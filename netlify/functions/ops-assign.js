/* Set who is on a project (any of the Ops users, none, or several).
   Body: { number, assignees: ['stan', 'chris'] }. Assigning the editor is also what
   makes the project appear in their queue. Anyone newly added (other than the person
   doing the assigning) is emailed the project details; mail never blocks the save. */
const U = require('./_ops-utils');
const Mail = require('./_ops-mail');
const Email = require('./_ops-email');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { session, response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }

  const number = String(body.number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });

  const known = U.loadUsers().map(u => String(u.username).toLowerCase());
  const asked = Array.isArray(body.assignees) ? body.assignees : [];
  const assignees = [...new Set(asked.map(a => String(a).toLowerCase()))];
  if (assignees.some(a => !known.includes(a))) return U.json(400, { error: 'Unknown user' });
  // keep the same order as the user list so the avatar group never reshuffles
  assignees.sort((a, b) => known.indexOf(a) - known.indexOf(b));

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project) return U.json(404, { error: 'Project not found' });

  const before = U.assigneesOf(project);
  project.assignees = assignees;
  if (!assignees.includes('stan')) project.headshotsAddedStan = false;   // Stan removed by hand: the headshots tick no longer owns his assignment
  delete project.assignedTo;           // replaced by the list
  project.assignedAt = assignees.length ? Date.now() : null;
  project.assignedBy = assignees.length ? session.username : null;
  const added = assignees.filter(a => !before.includes(a) && a !== session.username);
  const mail = [];
  if (added.length && Mail.mode() !== 'off') {
    const videos = await Email.collectVideos(project);
    for (const username of added) {
      const r = Mail.resolveRecipient(username);
      const msg = Email.assignedEmail({ project, videos, recipientName: r ? r.name : username, byName: session.name });
      const res = await Mail.send({ username, kind: 'assigned', ...msg });
      mail.push({ to: username, ...res });
      (project.mailLog = project.mailLog || []).push({ kind: 'assigned', to: username, at: Date.now(), sent: res.sent, reason: res.reason || null });
    }
  }
  await store.setJSON(`projects/${number}`, project);
  return U.json(200, { project, mail });
};
