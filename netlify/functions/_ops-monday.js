/* monday.com helper: one subitem per project under the dealership's item, with
   the Dropbox delivery link posted as an update (same as the old app).
   Env: MONDAY_TOKEN; OPS_MONDAY_ENABLED=false skips monday entirely (local testing). */
const { MONDAY_ITEM_IDS } = require('./_ops-config');

function enabled() {
  return process.env.OPS_MONDAY_ENABLED !== 'false' && !!process.env.MONDAY_TOKEN;
}

async function gql(query, variables) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: process.env.MONDAY_TOKEN, 'Content-Type': 'application/json', 'API-Version': '2024-01' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok || data.errors) throw new Error(JSON.stringify(data.errors || res.status));
  return data.data;
}

/* Never throws: returns { ok, id?, skipped?, error? } so a monday failure
   doesn't undo a project whose Dropbox folders already exist. */
async function postProject(dealership, projectFolderName, dropboxLink) {
  if (!enabled()) return { ok: false, skipped: true };
  const parent = MONDAY_ITEM_IDS[dealership];
  if (!parent) return { ok: false, error: `No monday item for '${dealership}'` };
  try {
    const sub = await gql(
      'mutation($parent: ID!, $name: String!) { create_subitem(parent_item_id: $parent, item_name: $name) { id } }',
      { parent: String(parent), name: projectFolderName });
    const id = sub.create_subitem.id;
    await gql(
      'mutation($id: ID!, $body: String!) { create_update(item_id: $id, body: $body) { id } }',
      { id: String(id), body: `Dropbox Delivery Folder: ${dropboxLink}` });
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String(e.message).slice(0, 300) };
  }
}

module.exports = { postProject, enabled };
