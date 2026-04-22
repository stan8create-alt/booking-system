const { google } = require('googleapis');

exports.handler = async (event) => {
  const { date } = event.queryStringParameters || {};
  if (!date) return { statusCode: 400, body: JSON.stringify({ error: 'Missing date' }) };

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date(`${date}T00:00:00-05:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59-05:00`).toISOString();

  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin, timeMax,
      singleEvents: true,
      maxResults: 50,
      privateExtendedProperty: 'source=zanchin-booking',
    });
    const events = res.data.items || [];
    const zones = {};
    events.forEach(ev => {
      let bd = {};
      try { bd = JSON.parse(ev.extendedProperties?.private?.bookingData || '{}'); } catch {}
      const zone = bd.zone;
      if (zone) zones[zone] = (zones[zone] || 0) + 1;
    });
    // Return array of {zone, bookedCount}
    const summary = Object.entries(zones).map(([zone, bookedCount]) => ({ zone, bookedCount }));
    return { statusCode: 200, body: JSON.stringify({ summary }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
