const { google } = require('googleapis');

exports.handler = async (event) => {
  const { date, from, to } = event.queryStringParameters || {};

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  let timeMin, timeMax, rangeMode = false;
  if (from && to) {
    timeMin = new Date(`${from}T00:00:00-05:00`).toISOString();
    timeMax = new Date(`${to}T23:59:59-05:00`).toISOString();
    rangeMode = true;
  } else if (date) {
    timeMin = new Date(`${date}T00:00:00-05:00`).toISOString();
    timeMax = new Date(`${date}T23:59:59-05:00`).toISOString();
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing date or from/to' }) };
  }

  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin, timeMax,
      singleEvents: true,
      maxResults: 250,
      privateExtendedProperty: 'source=zanchin-booking',
    });

    const events = res.data.items || [];

    if (rangeMode) {
      // Return { byDate: { 'YYYY-MM-DD': [{zone, bookedCount}] } }
      const byDate = {};
      events.forEach(ev => {
        let bd = {};
        try { bd = JSON.parse(ev.extendedProperties?.private?.bookingData || '{}'); } catch {}
        const zone = bd.zone;
        if (!zone) return;
        // Determine the ET date of the event
        const start = ev.start?.dateTime || ev.start?.date;
        if (!start) return;
        const etDate = new Date(start).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
        if (!byDate[etDate]) byDate[etDate] = {};
        byDate[etDate][zone] = (byDate[etDate][zone] || 0) + 1;
      });
      // Flatten to {date: [{zone, bookedCount}]}
      const result = {};
      Object.entries(byDate).forEach(([d, zones]) => {
        result[d] = Object.entries(zones).map(([zone, bookedCount]) => ({ zone, bookedCount }));
      });
      return { statusCode: 200, body: JSON.stringify({ byDate: result }) };
    } else {
      const zones = {};
      events.forEach(ev => {
        let bd = {};
        try { bd = JSON.parse(ev.extendedProperties?.private?.bookingData || '{}'); } catch {}
        const zone = bd.zone;
        if (zone) zones[zone] = (zones[zone] || 0) + 1;
      });
      const summary = Object.entries(zones).map(([zone, bookedCount]) => ({ zone, bookedCount }));
      return { statusCode: 200, body: JSON.stringify({ summary }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
