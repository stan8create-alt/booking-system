const { google } = require('googleapis');
const {
  SOURCE_TAG, SOURCE_URL, SOURCE_TITLE,
  bookingsBlobStore, writeBookingBlob, hydrateBooking,
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

// Calendar description is a bare-bones reminder only — no content-package or
// script details, which live entirely on the website.
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!checkAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  const { eventId, bookingData, startDateTime, endDateTime } = JSON.parse(event.body);

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  // Guard against wiping package detail: the admin client edits from its cached
  // copy, which can be a stripped stub. If the server still has detail for a
  // package that stays selected, keep it unless the client sent new detail.
  delete bookingData._recoveredFromDescription;
  try {
    const existing = await calendar.events.get({ calendarId: 'primary', eventId });
    const hydrated = await hydrateBooking(existing.data, bookingsBlobStore(event));
    const oldDetail = (hydrated && hydrated.bookingData && hydrated.bookingData.packageDetail) || {};
    const merged = { ...(bookingData.packageDetail || {}) };
    for (const id of bookingData.packages || []) {
      if (!merged[id] && oldDetail[id]) merged[id] = oldDetail[id];
    }
    bookingData.packageDetail = merged;
  } catch (e) { console.error('[update-booking] could not merge existing detail:', e.message); }

  const patch = {
    summary: `📷 ${bookingData.store} — Content Shoot`,
    description: buildDescription(bookingData),
    // Always re-set our identifying fields. If a prior outside-the-portal edit
    // stripped extendedProperties.private, this restores them.
    source: { title: SOURCE_TITLE, url: SOURCE_URL },
    extendedProperties: {
      private: {
        source: SOURCE_TAG,
        bookingData: JSON.stringify(bookingData),
      },
    },
  };

  if (startDateTime) patch.start = { dateTime: startDateTime, timeZone: 'America/Toronto' };
  if (endDateTime) patch.end = { dateTime: endDateTime, timeZone: 'America/Toronto' };

  try {
    await calendar.events.patch({ calendarId: 'primary', eventId, requestBody: patch });
    // Mirror to blob — durable backup for the full bookingData incl. per-package detail.
    const store = bookingsBlobStore(event);
    await writeBookingBlob(store, eventId, bookingData, 'admin-edit');
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
