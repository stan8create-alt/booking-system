const { google } = require('googleapis');

exports.handler = async (event) => {
  const { date } = event.queryStringParameters;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date(`${date}T00:00:00-05:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59-05:00`).toISOString();

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
