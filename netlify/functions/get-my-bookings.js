const { google } = require('googleapis');
const {
  isOurEvent, hydrateBooking, selfHealEvent, bookingsBlobStore,
} = require('./_booking-utils');

// Public endpoint: returns bookings made with a given email (past + future).
// No admin auth — but only ever returns bookings whose strategistEmail matches
// the provided email (case-insensitive), so callers only see their own.
exports.handler = async (event) => {
  const { email } = event.queryStringParameters || {};
  if (!email || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A valid email is required' }) };
  }
  const target = email.trim().toLowerCase();

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });
  const store = bookingsBlobStore();

  const now = new Date();
  const timeMin = new Date(now); timeMin.setMonth(timeMin.getMonth() - 12);
  const timeMax = new Date(now); timeMax.setMonth(timeMax.getMonth() + 12);

  try {
    // No more hard `privateExtendedProperty` filter — pick our events up via
    // isOurEvent() so tag-stripped events still surface for their owner.
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
      const bd = hydrated.bookingData;
      if (!bd.id || (bd.strategistEmail || '').trim().toLowerCase() !== target) continue;
      bookings.push({ ...bd, eventId: ev.id });
      if (hydrated.needsExtendedProps || hydrated.needsBlob) {
        healTasks.push(
          selfHealEvent(calendar, ev, bd, store, {
            restoreExtendedProps: hydrated.needsExtendedProps,
            restoreBlob: hydrated.needsBlob,
          })
        );
      }
    }
    Promise.all(healTasks).catch(() => null);

    return { statusCode: 200, body: JSON.stringify({ bookings }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
