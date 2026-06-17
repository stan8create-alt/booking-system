const { google } = require('googleapis');
const {
  SOURCE_TAG, SOURCE_URL, SOURCE_TITLE,
  bookingsBlobStore, writeBookingBlob, isEmailAuthorized,
} = require('./_booking-utils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { summary, description, startDateTime, endDateTime, bookingData } = JSON.parse(event.body);

  // Authorization gate: only allowlisted emails may create bookings. This is the
  // real lock — the client form can be bypassed by POSTing here directly.
  const bookerEmail = (bookingData && bookingData.strategistEmail) || '';
  if (!isEmailAuthorized(bookerEmail)) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'This email is not authorized to book. Please contact your administrator.' }),
    };
  }

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
        attendees: [{ email: 'stan@8create.ca' }],
        // Durable secondary identifier — survives GCal UI edits much better than
        // extendedProperties.private (which guest accept-sync can strip).
        source: { title: SOURCE_TITLE, url: SOURCE_URL },
        extendedProperties: {
          private: {
            source: SOURCE_TAG,
            bookingData: JSON.stringify(bookingData || {}),
          },
        },
      },
    });
    // Mirror to Netlify Blob — the durable backup for full bookingData
    // (incl. per-package details that can't be recovered from the description).
    const store = bookingsBlobStore();
    await writeBookingBlob(store, ev.data.id, bookingData || {});

    return { statusCode: 200, body: JSON.stringify({ success: true, eventId: ev.data.id }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
