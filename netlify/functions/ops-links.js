/* Extra links on a project (client folder, reference video, …) shown as pills in
   the quick-look panel, next to the built-in RAW / exports / delivery links.
   Admin only. Body: { number, action: 'add', label, url } or { number, action: 'remove', id }. */
const crypto = require('crypto');
const U = require('./_ops-utils');

const MAX_LINKS = 20;

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
  const links = project.extraLinks || [];

  if (body.action === 'add') {
    const label = String(body.label || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40);
    let url;
    try {
      url = new URL(String(body.url || '').trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('scheme');
    } catch { return U.json(400, { error: 'Enter a full link starting with https://' }); }
    if (!label) return U.json(400, { error: 'Give the link a name' });
    if (url.href.length > 500) return U.json(400, { error: 'That link is too long' });
    if (links.length >= MAX_LINKS) return U.json(400, { error: `Up to ${MAX_LINKS} extra links per project` });
    project.extraLinks = links.concat({ id: crypto.randomUUID(), label, url: url.href });
  } else if (body.action === 'remove') {
    project.extraLinks = links.filter(l => l.id !== body.id);
  } else {
    return U.json(400, { error: 'Unknown action' });
  }

  await store.setJSON(`projects/${number}`, project);
  return U.json(200, { project });
};
