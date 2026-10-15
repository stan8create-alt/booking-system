const { google } = require('googleapis');
const {
  SOURCE_TAG, SOURCE_URL, SOURCE_TITLE,
  bookingsBlobStore, writeBookingBlob, readHistory, hydrateBooking,
} = require('./_booking-utils');

function checkAuth(event) {
  const token = event.headers['x-admin-token'];
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    const user = decoded.slice(0, colonIdx);
    const pass = decoded.slice(colonIdx + 1);
    return user === (process.env.ADMIN_USERNAME || 'login') &&
           pass === (process.env.ADMIN_PASSWORD || 'password');
  } catch { return false; }
}

function buildDescription(b) {
  return [
    `📍 Store: ${b.store}`,
    `🏢 Zone: ${b.zoneName}`,
    `⏱ Duration: ${b.durLabel}`,
    `👤 On-Site Contact: ${b.contact}${b.contactPhone ? ' · ' + b.contactPhone : ''}`,
    ``,
    `📧 Booked by: ${b.strategistName} (${b.strategistEmail})`,
    b.notes ? `📝 Notes: ${b.notes}` : null,
  ].filter(v => v !== null).join('\n');
}

// A restore brings back what the strategist/admin fills in — never the
// date/time/store, which live on the calendar event and may have changed since.
const CONTENT_FIELDS = ['packages', 'packageDetail', 'scriptLink', 'notes', 'contact', 'contactPhone'];

const summarize = (d) => ({
  packages: d.packages || [],
  packageDetailKeys: Object.keys(d.packageDetail || {}),
  hasScript: !!d.scriptLink,
  contact: d.contact || '',
});

/* Admin only.
     GET  ?eventId=…                → saved versions, newest first (summaries only)
     POST { eventId, ts }           → roll the booking's content back to that version.
   A restore is itself saved to history, so it can be undone the same way. */
exports.handler = async (event) => {
  if (!checkAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  const store = bookingsBlobStore(event);

  if (event.httpMethod === 'GET') {
    const eventId = (event.queryStringParameters || {}).eventId;
    if (!eventId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing eventId' }) };
    const versions = (await readHistory(eventId)).slice().reverse().map(v => ({ ts: v.ts, source: v.source, ...summarize(v.data || {}) }));
    return { statusCode: 200, body: JSON.stringify({ versions }) };
  }

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }
  const { eventId, ts } = payload;
  if (!eventId || !ts) return { statusCode: 400, body: JSON.stringify({ error: 'Missing eventId or ts' }) };

  const version = (await readHistory(eventId)).find(v => v.ts === ts);
  if (!version) return { statusCode: 404, body: JSON.stringify({ error: 'That version is no longer available' }) };

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const existing = await calendar.events.get({ calendarId: 'primary', eventId });
    const hydrated = await hydrateBooking(existing.data, store);
    if (!hydrated) return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found' }) };

    const restored = { ...hydrated.bookingData };
    CONTENT_FIELDS.forEach(k => { if (version.data[k] !== undefined) restored[k] = version.data[k]; });
    delete restored._recoveredFromDescription;

    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'none',
      requestBody: {
        description: buildDescription(restored),
        source: { title: SOURCE_TITLE, url: SOURCE_URL },
        extendedProperties: { private: { source: SOURCE_TAG, bookingData: JSON.stringify(restored) } },
      },
    });
    await writeBookingBlob(store, eventId, restored, 'restore');
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
