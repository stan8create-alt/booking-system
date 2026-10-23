/* Create a project online — replaces the Mac app's run_project_creation for the
   Dropbox + monday.com part. Live order: claim number → Dropbox folders + links →
   monday post → save record. The Zanchin 12 / Lightroom side is mirrored later by
   the Mac helper on the creator's machine (record.localMirror.status === 'pending').

   DRY RUN is the default: set OPS_LIVE_CREATE=true to actually claim a number and
   write to Dropbox / monday. In dry run nothing is created or saved; the log shows
   what each step would do so the page can be checked end to end. */
const U = require('./_ops-utils');
const { resolveDealership } = require('./_ops-config');
const D = require('./_ops-dropbox');
const M = require('./_ops-monday');

const SUFFIX = 'zanchin';
const SUBFOLDERS = ['Photo Exports', 'Project File', 'RAW Files', 'Video Exports'];

function cleanProjectName(raw) {
  return String(raw || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80);
}

function todayToronto() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date()); // YYYY-MM-DD
}

const fail = (message, log, status = 200) => U.json(status, { result: { ok: false, message, log } });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return U.json(405, { error: 'Method Not Allowed' });
  const { session, response } = U.requireSession(event, ['admin']);
  if (response) return response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return U.json(400, { error: 'Bad request' }); }

  const live = process.env.OPS_LIVE_CREATE === 'true';
  const log = [];

  const match = resolveDealership(body.dealership);
  if (!match) return fail('Dealership not recognized.', log);
  const projectName = cleanProjectName(body.projectName);
  if (!projectName) return fail('Enter a project name.', log);

  const store = U.opsStore(event);
  if (!store) return fail('Storage unavailable.', log, 503);

  let claimed = null;
  try {
    let number;
    if (live) {
      const mirror = await store.get('counter/last', { type: 'json' });
      claimed = (await D.claimNextNumber(mirror && mirror.last)).number;
      number = String(claimed).padStart(4, '0');
    } else {
      number = await D.peekNextNumber(); // dry run: show the number, don't take it
    }

    const date = todayToronto();
    const folder = `${number}_${match.dealership}_${projectName}_${date}_${SUFFIX}`;
    const base = match.brand === 'Zanchin'
      ? `${D.root()}/Zanchin/${folder}`
      : `${D.root()}/${match.brand}/${match.dealership}/${folder}`;

    const result = {
      ok: true, dryRun: !live, number, match_note: match.note,
      brand: match.brand, dealership: match.dealership, folder, location: base,
      dropbox_ok: false, dropbox_link: null, monday_ok: false, monday_error: null,
    };

    if (!live) {
      log.push('Creating project folders... (not wired yet — nothing created)');
      log.push('Uploading delivery folder to Dropbox... (not wired yet — skipped)');
      log.push('Creating monday.com subitem and posting link... (not wired yet — skipped)');
      return U.json(200, { result, log });
    }

    if (await store.get(`projects/${number}`, { type: 'json' })) {
      throw new D.DropboxError(`Project ${number} already exists in the hub. Nothing was overwritten.`, 409, null);
    }
    log.push('Creating project folders...');
    for (const sub of SUBFOLDERS) await D.ensureFolder(`${base}/${sub}`);
    log.push('Creating Dropbox share links...');
    const [deliveryLink, rawLink, exportsLink] = await Promise.all([
      D.getSharedLink(base), D.getSharedLink(`${base}/RAW Files`), D.getSharedLink(`${base}/Video Exports`),
    ]);
    result.dropbox_ok = true; result.dropbox_link = deliveryLink;

    // Folders exist: this number is used for good.
    await store.setJSON('counter/last', { last: claimed });

    log.push('Creating monday.com subitem and posting link...');
    const monday = await M.postProject(match.dealership, folder, deliveryLink);
    result.monday_ok = monday.ok; result.monday_error = monday.error || null;

    const project = {
      number, dealership: match.dealership, brand: match.brand, name: projectName, folder, date,
      dropboxPath: base, deliveryLink, rawLink, exportsLink, monday,
      createdBy: session.username, folderCreatedAt: Date.now(),
      rawUploadedAt: null, rawDownloadedAt: null, finalUploadedAt: null,
      assignees: [], localMirror: { status: 'pending', machine: session.username },
    };
    await store.setJSON(`projects/${number}`, project);
    return U.json(200, { result, log, project });
  } catch (e) {
    console.error('[ops-create-project]', e.message, e.body ? JSON.stringify(e.body).slice(0, 300) : '');
    if (claimed != null) await D.releaseNumber(claimed);
    const known = e instanceof D.DropboxError && (e.status === 409 || /not configured|OPS_COUNTER_SEED/.test(e.message));
    return fail(known ? e.message : 'Could not create the project. No number was used — try again.', log);
  }
};
