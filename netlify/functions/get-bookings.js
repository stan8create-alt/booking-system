const { google } = require('googleapis');
const {
  isOurEvent, hydrateBooking, selfHealEvent, bookingsBlobStore,
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

exports.handler = async (event) => {
  if (!checkAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const timeMin = new Date(now); timeMin.setMonth(timeMin.getMonth() - 6);
  const timeMax = new Date(now); timeMax.setMonth(timeMax.getMonth() + 12);

  const store = bookingsBlobStore();

  try {
    // We no longer hard-filter by `privateExtendedProperty: 'source=zanchin-booking'`
    // server-side, because that tag can be stripped by outside-the-portal edits
    // (e.g. a non-Google guest accepting an invite). Instead, fetch everything in
    // range and identify our events via any of: source tag, event.source.url,
    // or portal-shaped description (see _booking-utils.isOurEvent).
    let allEvents = [];
    let pageToken;
    do {
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        maxResults: 250,
        pageToken,
      });
      allEvents = allEvents.concat(res.data.items || []);
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    const ours = allEvents.filter(isOurEvent);

    const healTasks = [];
    const bookings = [];
    for (const ev of ours) {
      const hydrated = await hydrateBooking(ev, store);
      if (!hydrated) continue;
      bookings.push({ ...hydrated.bookingData, eventId: ev.id });
      // Self-heal in background: restore stripped tag and/or missing blob.
      if (hydrated.needsExtendedProps || hydrated.needsBlob) {
        healTasks.push(
          selfHealEvent(calendar, ev, hydrated.bookingData, store, {
            restoreExtendedProps: hydrated.needsExtendedProps,
            restoreBlob: hydrated.needsBlob,
          })
        );
      }
    }
    // Fire-and-forget — don't block the response on healing.
    Promise.all(healTasks).catch(() => null);

    // Frontend filters on `b.id`; keep that contract.
    return { statusCode: 200, body: JSON.stringify({ bookings: bookings.filter((b) => b.id) }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
