/* Add a note to a project's thread. Admins can note any project; the editor only
   projects assigned to them. */
const crypto = require('crypto');
const U = require('./_ops-utils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { session, response } = U.requireSession(event);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = String(body.number || '');
  const text = String(body.text || '').replace(/\u0000/g, '').trim().slice(0, 2000);
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });
  if (!text) return U.json(400, { error: 'Write a note first' });

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project || (session.role === 'editor' && !U.assigneesOf(project).includes(session.username))) {
    return U.json(404, { error: 'Project not found' });
  }

  project.notes = (project.notes || []).concat({
    id: crypto.randomUUID(), by: session.username, name: session.name, at: Date.now(), text,
  }).slice(-200);
  await store.setJSON(`projects/${number}`, project);
  return U.json(200, { project });
};
