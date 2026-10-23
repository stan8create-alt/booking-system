/* Save one video's instructions + urgency (admin only). The video must currently
   exist as a folder in the project's Dropbox "RAW Files", so arbitrary names can't
   be stored. Also keeps project.urgency = the highest urgency among included videos
   so the table can show a badge without listing Dropbox. */
const U = require('./_ops-utils');
const D = require('./_ops-dropbox');

const FORMATS = ['', '9x16', '16x9', 'both'];
const URGENCY = ['regular', 'urgent', 'asap'];  // keep in sync with _ops-utils urgencyOf
const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = String(body.number || '');
  const video = String(body.video || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });
  if (!video) return U.json(400, { error: 'Missing video' });

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project) return U.json(404, { error: 'Project not found' });

  let folders;
  try {
    folders = (await D.listFolder(`${project.dropboxPath}/RAW Files`)).filter(e => e['.tag'] === 'folder').map(e => e.name);
  } catch { return U.json(502, { error: 'Could not read RAW Files from Dropbox' }); }
  if (!folders.includes(video)) return U.json(404, { error: 'That video folder no longer exists' });

  const entry = {
    include: body.include !== false,
    urgency: URGENCY.includes(body.urgency) ? body.urgency : 'regular',
    spokesperson: clip(body.spokesperson, 200),
    position: clip(body.position, 120),
    format: FORMATS.includes(body.format) ? body.format : '',
    notes: clip(body.notes, 2000),
  };
  project.videos = { ...(project.videos || {}), [video]: entry };

  project.urgency = U.urgencyOf(project, folders);
  await store.setJSON(`projects/${number}`, project);

  const spokespeople = (await store.get('settings/spokespeople', { type: 'json' })) || {};
  if (entry.spokesperson && spokespeople[entry.spokesperson] !== entry.position) {
    spokespeople[entry.spokesperson] = entry.position;
    await store.setJSON('settings/spokespeople', spokespeople);
  }
  return U.json(200, { project, spokespeople });
};
