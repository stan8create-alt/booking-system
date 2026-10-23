/* The videos of a project = the sub-folders inside its Dropbox "RAW Files" folder
   (folder name = video name) plus any videos added by hand (project.manualVideos). Each video carries its own instructions + urgency,
   stored on the project record under `videos[name]`. Read-only; see ops-update-video. */
const U = require('./_ops-utils');
const D = require('./_ops-dropbox');

const DEFAULT_VIDEO = { include: true, urgency: 'regular', spokesperson: '', position: '', format: '', notes: '' };

exports.handler = async (event) => {
  const { session, response } = U.requireSession(event);
  if (response) return response;

  const number = String((event.queryStringParameters || {}).number || '');
  if (!/^\d{4,}$/.test(number)) return U.json(400, { error: 'Bad project number' });

  const store = U.opsStore(event);
  if (!store) return U.json(503, { error: 'Storage unavailable' });
  const project = await store.get(`projects/${number}`, { type: 'json' });
  if (!project || (session.role === 'editor' && !U.assigneesOf(project).includes(session.username))) {
    return U.json(404, { error: 'Project not found' });
  }
  const spokespeople = (await store.get('settings/spokespeople', { type: 'json' })) || {};

  const manual = (project.manualVideos || []).map(v => ({ ...DEFAULT_VIDEO, link: '', ...v, kind: 'manual' }));

  let entries;
  try {
    entries = await D.listFolder(`${project.dropboxPath}/RAW Files`);
  } catch (e) {
    console.error('[ops-videos]', e.message);
    return U.json(200, { project, spokespeople, videos: manual, looseFiles: 0, error: 'Could not read RAW Files from Dropbox' });
  }

  const names = entries.filter(e => e['.tag'] === 'folder').map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const saved = project.videos || {};
  const videos = names.map(name => ({ name, ...DEFAULT_VIDEO, ...(saved[name] || {}), kind: 'dropbox' })).concat(manual);
  return U.json(200, { project, spokespeople, videos, looseFiles: entries.filter(e => e['.tag'] === 'file').length });
};
