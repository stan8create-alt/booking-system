const { google } = require('googleapis');

exports.handler = async (event) => {
  const { date, from, to } = event.queryStringParameters || {};

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const calendar = google.calendar({ version: 'v3', auth });

  let timeMin, timeMax;
  if (from && to) {
    timeMin = new Date(`${from}T00:00:00-05:00`).toISOString();
    timeMax = new Date(`${to}T23:59:59-05:00`).toISOString();
  } else if (date) {
    timeMin = new Date(`${date}T00:00:00-05:00`).toISOString();
    timeMax = new Date(`${date}T23:59:59-05:00`).toISOString();
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing date or from/to params' }) };
  }

  try {
    const res = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: 'primary' }] },
    });
    const busy = res.data.calendars.primary.busy;
    return { statusCode: 200, body: JSON.stringify({ busy }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
