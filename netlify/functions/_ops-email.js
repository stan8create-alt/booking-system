/* Email content for the Ops Hub: what the editor receives when assigned, and what
   Stan + Andrew receive when the final exports land. Plain text + a simple HTML copy. */
const D = require('./_ops-dropbox');
const U = require('./_ops-utils');

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
  t.push(`Footage: ${p.rawUploadedAt ? 'uploaded and ready to download' : 'not uploaded yet (you will get an email when it is)'}`);
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
  h.push(`<p style="margin:6px 0 0;color:#555">Footage: <strong>${p.rawUploadedAt ? 'uploaded and ready to download' : 'not uploaded yet'}</strong>${p.rawUploadedAt ? '' : ' (you will get an email when it is)'}</p>`);
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

const BUTTON = 'display:inline-block;padding:11px 20px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px';
const button = (url, label) => `<p style="margin:24px 0 0"><a href="${esc(url)}" style="${BUTTON}">${esc(label)}</a></p>`;
const wrapHtml = (inner) => `<div style="font:15px/1.5 Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:560px">${inner}</div>`;
const titleOf = (p) => `${p.number} · ${p.dealership} — ${p.name}`;

/* Who hears about a new note: everyone on the project except the author. When the editor writes,
   the admins hear too, so a question never goes unseen. */
function noteRecipients(project, authorUsername) {
  const users = U.loadUsers();
  const set = new Set(U.assigneesOf(project));
  const author = users.find(u => u.username === authorUsername);
  if (author && author.role === 'editor') users.filter(u => u.role === 'admin').forEach(u => set.add(u.username));
  set.delete(authorUsername);
  return [...set].filter(name => users.some(u => u.username === name));
}

/* Who hears that the footage landed: the people on the project. Stan is skipped when he is only on it
   because the "headshots were taken" switch added him. */
function footageRecipients(project) {
  return U.assigneesOf(project).filter(name => !(name === 'stan' && project.headshotsAddedStan));
}

/* A new chat note on a project. */
function noteEmail({ project: p, authorName, text, recipientName }) {
  const title = titleOf(p), hub = hubLink(p);
  const subject = `New note on ${title}`;
  const t = [`Hi ${recipientName},`, '', `${authorName} wrote a note on ${title}:`, '', text.trim()];
  if (hub) t.push('', `Open this project in the hub: ${hub}`);
  const html = wrapHtml(`<p>Hi ${esc(recipientName)},</p><p><strong>${esc(authorName)}</strong> wrote a note on <strong>${esc(title)}</strong>:</p>`
    + `<div style="margin:12px 0;padding:12px 14px;border-left:3px solid #1a1a1a;background:#f5f5f5;border-radius:4px">${esc(text.trim()).replace(/\n/g, '<br>')}</div>`
    + (hub ? button(hub, 'Open this project in the hub') : ''));
  return { subject, text: t.join('\n'), html };
}

/* The footage for a project is now in Dropbox. */
function footageEmail({ project: p, videos, recipientName }) {
  const title = titleOf(p), hub = hubLink(p);
  const urgency = (p.urgency && p.urgency !== 'regular') ? URGENCY[p.urgency] : '';
  const needed = niceDate(p.neededBy);
  const subject = `${urgency ? `[${urgency}] ` : ''}Footage is ready: ${title}`;
  const t = [`Hi ${recipientName},`, '', `The footage for ${title} is uploaded to Dropbox and ready to download.`];
  if (needed) t.push(`Needed by: ${needed}`);
  if (urgency) t.push(`Urgency: ${urgency}`);
  if (videos.length) t.push('', `Videos to edit (${videos.length}): ${videos.map(v => v.name).join(', ')}`);
  if (p.rawLink) t.push('', `Download the footage: ${p.rawLink}`);
  if (hub) t.push(`Open this project in the hub: ${hub}`);
  const html = wrapHtml(`<p>Hi ${esc(recipientName)},</p><p>The footage for <strong>${esc(title)}</strong> is uploaded to Dropbox and ready to download.</p>`
    + ((needed || urgency) ? `<p style="margin:0;color:#555">${[needed && `Needed by <strong>${esc(needed)}</strong>`, urgency && `Urgency <strong>${esc(urgency)}</strong>`].filter(Boolean).join(' · ')}</p>` : '')
    + (videos.length ? `<p style="margin:12px 0 0;color:#555">Videos to edit (${videos.length}): ${esc(videos.map(v => v.name).join(', '))}</p>` : '')
    + (p.rawLink ? button(p.rawLink, 'Download the footage') : '')
    + (hub ? `<p style="margin:14px 0 0"><a href="${esc(hub)}">Open this project in the hub</a></p>` : ''));
  return { subject, text: t.join('\n'), html };
}

/* Test message that also explains what each person will receive. */
function testEmail({ recipientName, role }) {
  const items = role === 'editor'
    ? ['when a project is assigned to you', 'when the footage for one of your projects is uploaded', 'when Stan or Andrew writes a note on one of your projects']
    : ['when a project is assigned to you', 'when the footage for one of your projects is uploaded', 'when the final exports land on any project', 'when someone writes a note on one of your projects'];
  const subject = 'Zanchin Hub test email';
  const t = [`Hi ${recipientName},`, '', 'This is a test from the Zanchin Hub to check that email works. There is nothing you need to do.', '',
    'From now on you will get an email:', ...items.map(i => `  - ${i}`)];
  const html = wrapHtml(`<p>Hi ${esc(recipientName)},</p><p>This is a test from the Zanchin Hub to check that email works. <strong>There is nothing you need to do.</strong></p>`
    + `<p style="margin:16px 0 4px">From now on you will get an email:</p><ul style="margin:0;padding-left:20px">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
    + (BASE() ? `<p style="margin:18px 0 0;color:#555">The hub: <a href="${esc(BASE())}/ops">${esc(BASE())}/ops</a></p>` : ''));
  return { subject, text: t.join('\n'), html };
}

module.exports = { collectVideos, assignedEmail, deliveredEmail, noteEmail, footageEmail, testEmail, noteRecipients, footageRecipients };
