/* Videos added by hand to a project's edit list (for footage that isn't a folder in
   RAW Files). Admin only. Body: { number, action: 'add' | 'update' | 'remove', id?, ...fields }.
   Fields: name, link (optional https link to the footage), include, urgency,
   spokesperson, position, format ('', '9x16', '16x9', 'both'), notes. */
const crypto = require('crypto');
const U = require('./_ops-utils');

const FORMATS = ['', '9x16', '16x9', 'both'];
const URGENCY = ['regular', 'urgent', 'asap'];
const MAX_MANUAL = 30;
const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

/* '' for no link, null for an invalid one */
function cleanLink(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    if (!['http:', 'https:'].includes(u.protocol) || u.href.length > 500) return null;
    return u.href;
  } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = String(body.number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project) return U.json(404, { error: 'Project not found' });
  const list = project.manualVideos || [];
  let video = null;

  if (body.action === 'add') {
    if (list.length >= MAX_MANUAL) return U.json(400, { error: `Up to ${MAX_MANUAL} manual videos per project` });
    video = { id: crypto.randomUUID(), name: clip(body.name, 80) || 'New video', link: '', include: true, urgency: 'regular',
              spokesperson: '', position: '', format: '', notes: '', createdAt: Date.now() };
    project.manualVideos = list.concat(video);
  } else if (body.action === 'update') {
    const i = list.findIndex(v => v.id === body.id);
    if (i < 0) return U.json(404, { error: 'Video not found' });
    const link = cleanLink(body.link);
    if (link === null) return U.json(400, { error: 'Enter a full link starting with https://' });
    video = {
      ...list[i],
      name: clip(body.name, 80) || list[i].name,
      link,
      include: body.include !== false,
      urgency: URGENCY.includes(body.urgency) ? body.urgency : 'regular',
      spokesperson: clip(body.spokesperson, 200),
      position: clip(body.position, 120),
      format: FORMATS.includes(body.format) ? body.format : '',
      notes: clip(body.notes, 2000),
    };
    project.manualVideos = list.map((v, j) => (j === i ? video : v));
  } else if (body.action === 'remove') {
    project.manualVideos = list.filter(v => v.id !== body.id);
  } else {
    return U.json(400, { error: 'Unknown action' });
  }

  project.urgency = U.urgencyOf(project, null);
  await store.setJSON(`projects/${number}`, project);

  let spokespeople = (await store.get('settings/spokespeople', { type: 'json' })) || {};
  if (video && video.spokesperson && spokespeople[video.spokesperson] !== video.position) {
    spokespeople[video.spokesperson] = video.position;
    await store.setJSON('settings/spokespeople', spokespeople);
  }
  return U.json(200, { project, video, spokespeople });
};
