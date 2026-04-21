const { google } = require('googleapis');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { summary, description, startDateTime, endDateTime, bookingData } = JSON.parse(event.body);

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const ev = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      requestBody: {
        summary,
        description,
        start: { dateTime: startDateTime, timeZone: 'America/Toronto' },
        end: { dateTime: endDateTime, timeZone: 'America/Toronto' },
        attendees: [{ email: 'stan.8create@gmail.com' }],
        extendedProperties: {
          private: {
            source: 'zanchin-booking',
            bookingData: JSON.stringify(bookingData || {}),
          },
        },
      },
    });
    return { statusCode: 200, body: JSON.stringify({ success: true, eventId: ev.data.id }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
