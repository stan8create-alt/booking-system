/* Next project number + Dropbox reachability, for the New Project page's number
   box, Refresh button and status pill. Read-only. */
const U = require('./_ops-utils');
const D = require('./_ops-dropbox');

exports.handler = async (event) => {
  const { response } = U.requireSession(event, ['admin']);
  if (response) return response;
  try {
    const number = await D.peekNextNumber();
    return U.json(200, { number, dropbox: true, saveTarget: D.root() });
  } catch (e) {
    console.error('[ops-number]', e.message);
    return U.json(200, { number: '—', dropbox: false, saveTarget: D.root(), error: e.message });
  }
};
