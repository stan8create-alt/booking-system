const { google } = require('googleapis');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { date, startTime, duration, dealership, notes, bookedBy } = JSON.parse(event.body);

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const calendar = google.calendar({ version: 'v3', auth });

  const durationMap = { '30min': 30, '1hr': 60, '2hr': 120, '4hr': 240, 'allday': 480 };
  const minutes = durationMap[duration] || 60;

  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(start.getTime() + minutes * 60000);
  const toISO = (d) => d.toISOString();

  try {
    const ev = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `📷 Content Shoot — ${dealership}`,
        description: `Booked by: ${bookedBy}\nDuration: ${duration}\nNotes: ${notes || 'None'}`,
        start: { dateTime: toISO(start), timeZone: 'America/Toronto' },
        end: { dateTime: toISO(end), timeZone: 'America/Toronto' },
      },
    });
    return { statusCode: 200, body: JSON.stringify({ success: true, eventId: ev.data.id }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
