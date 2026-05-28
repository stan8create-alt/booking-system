const { google } = require('googleapis');

// Public endpoint: returns bookings made with a given email (past + future).
// No admin auth — but only ever returns bookings whose strategistEmail matches
// the provided email exactly (case-insensitive), so callers only see their own.
exports.handler = async (event) => {
  const { email } = event.queryStringParameters || {};
  if (!email || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'A valid email is required' }) };
  }
  const target = email.trim().toLowerCase();

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const timeMin = new Date(now); timeMin.setMonth(timeMin.getMonth() - 12);
  const timeMax = new Date(now); timeMax.setMonth(timeMax.getMonth() + 12);

  try {
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
        privateExtendedProperty: 'source=zanchin-booking',
      });
      allEvents = allEvents.concat(res.data.items || []);
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    const bookings = allEvents.map(ev => {
      let bookingData = {};
      try { bookingData = JSON.parse(ev.extendedProperties?.private?.bookingData || '{}'); } catch {}
      return { ...bookingData, eventId: ev.id };
    }).filter(b => b.id && (b.strategistEmail || '').trim().toLowerCase() === target);

    return { statusCode: 200, body: JSON.stringify({ bookings }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
