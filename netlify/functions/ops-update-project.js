/* Save a project's editing instructions (admin only). Spokesperson names are
   remembered with their position so the form can suggest and autofill them. */
const U = require('./_ops-utils');

const FORMATS = ['', '9x16', '16x9', 'both'];
const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = String(body.number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });

  const i = body.instructions || {};
  const format = FORMATS.includes(i.format) ? i.format : '';
  const instructions = {
    spokesperson: clip(i.spokesperson, 80),
    position: clip(i.position, 120),
    format,
    notes: clip(i.notes, 2000),
  };

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project) return U.json(404, { error: 'Project not found' });

  project.instructions = instructions;
  await store.setJSON(`projects/${number}`, project);

  let spokespeople = (await store.get('settings/spokespeople', { type: 'json' })) || {};
  if (instructions.spokesperson && spokespeople[instructions.spokesperson] !== instructions.position) {
    spokespeople[instructions.spokesperson] = instructions.position;
    await store.setJSON('settings/spokespeople', spokespeople);
  }
  return U.json(200, { project, spokespeople });
};
