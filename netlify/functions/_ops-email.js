/* Email content for the Ops Hub: what the editor receives when assigned, and what
   Stan + Andrew receive when the final exports land. Plain text + a simple HTML copy. */
const D = require('./_ops-dropbox');

const DEFAULT_VIDEO = { include: true, urgency: 'regular', spokesperson: '', position: '', format: '', notes: '' };
const URGENCY = { regular: 'Regular', urgent: 'URGENT', asap: 'ASAP' };
const FORMAT = { '9x16': '9x16 (vertical)', '16x9': '16x9 (horizontal)', both: '9x16 + 16x9 (both)' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function niceDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/* Videos that should be edited: RAW Files sub-folders (merged with their saved
   instructions) plus manual ones, minus anything switched off. */
async function collectVideos(project) {
  const saved = project.videos || {};
  let names = [];
  try {
    names = (await D.listFolder(`${project.dropboxPath}/RAW Files`)).filter(e => e['.tag'] === 'folder').map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch (e) { console.error('[ops-email] could not list RAW Files:', e.message); }
  const folder = names.map(name => ({ name, ...DEFAULT_VIDEO, ...(saved[name] || {}) }));
  const manual = (project.manualVideos || []).map(v => ({ ...DEFAULT_VIDEO, ...v }));
  return folder.concat(manual).filter(v => v.include !== false);
}

function videoLines(v) {
  const who = [v.spokesperson, v.position].map(s => String(s || '').trim()).filter(Boolean).join(', ');
  return [
    ['Spokesperson', who], ['Format', FORMAT[v.format] || ''], ['Notes', String(v.notes || '').trim()], ['Footage', v.link || ''],
  ].filter(([, val]) => val);
}

/* OPS_BASE_URL wins; otherwise Netlify's own URL (the site's main address) at runtime. */
const BASE = () => (process.env.OPS_BASE_URL || process.env.URL || '').replace(/\/+$/, '');
const hubLink = (p) => (BASE() ? `${BASE()}/ops?project=${encodeURIComponent(p.number)}` : '');

/* To the person newly assigned (the editor). */
function assignedEmail({ project: p, videos, recipientName, byName }) {
  const urgency = (p.urgency && p.urgency !== 'regular') ? URGENCY[p.urgency] : '';
  const title = `${p.number} · ${p.dealership} — ${p.name}`;
  const subject = `${urgency ? `[${urgency}] ` : ''}New project for you: ${title}`;
  const needed = niceDate(p.neededBy);
  const hub = hubLink(p);

  const t = [];
  t.push(`Hi ${recipientName},`, '', `${byName || 'Someone'} put you on a project. Quick summary:`, '', title);
  if (needed) t.push(`Needed by: ${needed}`);
  if (urgency) t.push(`Urgency: ${urgency}`);
  t.push('', videos.length ? `Videos to edit (${videos.length}):` : 'No videos are set up on this project yet.');
  videos.forEach((v, i) => {
    t.push('', `${i + 1}. ${v.name}${v.urgency && v.urgency !== 'regular' ? `  [${URGENCY[v.urgency]}]` : ''}`);
    const lines = videoLines(v);
    if (lines.length) lines.forEach(([k, val]) => t.push(`   ${k}: ${val}`)); else t.push('   (no instructions)');
  });
  if (hub) t.push('', `Open this project in the hub: ${hub}`);

  const h = [];
  h.push(`<div style="font:15px/1.5 Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:560px">`);
  h.push(`<p>Hi ${esc(recipientName)},</p><p>${esc(byName || 'Someone')} put you on a project. Quick summary:</p>`);
  h.push(`<h2 style="margin:18px 0 4px;font-size:18px">${esc(title)}</h2>`);
  if (needed || urgency) h.push(`<p style="margin:0;color:#555">${[needed && `Needed by <strong>${esc(needed)}</strong>`, urgency && `Urgency <strong>${esc(urgency)}</strong>`].filter(Boolean).join(' · ')}</p>`);
  h.push(`<h3 style="margin:22px 0 8px;font-size:15px">${videos.length ? `Videos to edit (${videos.length})` : 'No videos are set up on this project yet.'}</h3>`);
  videos.forEach((v, i) => {
    const lines = videoLines(v);
    h.push(`<div style="margin:0 0 10px;padding:10px 12px;border:1px solid #e3e3e3;border-radius:8px"><strong>${i + 1}. ${esc(v.name)}</strong>${v.urgency && v.urgency !== 'regular' ? ` <span style="color:#c0392b;font-weight:700">${esc(URGENCY[v.urgency])}</span>` : ''}`
      + (lines.length ? lines.map(([k, val]) => `<div style="margin-top:4px"><span style="color:#777">${esc(k)}:</span> ${/^https?:/.test(val) ? `<a href="${esc(val)}">${esc(val)}</a>` : esc(val).replace(/\n/g, '<br>')}</div>`).join('') : '<div style="margin-top:4px;color:#777">(no instructions)</div>') + '</div>');
  });
  if (hub) h.push(`<p style="margin:24px 0 0"><a href="${esc(hub)}" style="display:inline-block;padding:11px 20px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Open this project in the hub</a></p>`);
  h.push('</div>');

  return { subject, text: t.join('\n'), html: h.join('') };
}

/* To Stan + Andrew when the final exports land. */
function deliveredEmail({ project: p, recipientName }) {
  const title = `${p.number} · ${p.dealership} — ${p.name}`;
  const subject = `Final video delivered: ${title}`;
  const link = p.exportsLink || p.deliveryLink || '';
  const t = [`Hi ${recipientName},`, '', `The final exports for ${title} are in Dropbox.`];
  if (link) t.push('', `Video exports: ${link}`);
  const hub = hubLink(p);
  if (hub) t.push(`Open in the hub: ${hub}`);
  const html = `<div style="font:15px/1.5 Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:560px"><p>Hi ${esc(recipientName)},</p>`
    + `<p>The final exports for <strong>${esc(title)}</strong> are in Dropbox.</p>`
    + (link ? `<p><a href="${esc(link)}">Open the video exports</a></p>` : '')
    + (hub ? `<p><a href="${esc(hub)}">Open in the hub</a></p>` : '') + '</div>';
  return { subject, text: t.join('\n'), html };
}

module.exports = { collectVideos, assignedEmail, deliveredEmail };
