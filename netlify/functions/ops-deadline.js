/* Set or clear a project's "needed by" date (date only, no time). Admin only.
   Body: { number, date: 'YYYY-MM-DD' | null }. */
const U = require('./_ops-utils');

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  const y = d.getUTCFullYear();
  return d.toISOString().slice(0, 10) === s && y >= 2020 && y <= 2100;   // rejects 2026-02-31 and the like
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }
  const number = String(body.number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });

  const date = body.date == null || body.date === '' ? null : String(body.date);
  if (date !== null && !validDate(date)) return U.json(400, { error: 'That is not a valid date' });

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project) return U.json(404, { error: 'Project not found' });

  project.neededBy = date;
  await store.setJSON(`projects/${number}`, project);
  return U.json(200, { project });
};
