const { google } = require('googleapis');

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
    }).filter(b => b.id);

    return { statusCode: 200, body: JSON.stringify({ bookings }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
