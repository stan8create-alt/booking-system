/**
 * TEMPORARY diagnostic endpoint — DELETE AFTER VERIFYING THE FIX.
 *
 * Returns the raw Google Calendar events for a given date so we can see
 * exactly what shape the description text + extendedProperties have on
 * tag-stripped events.
 *
 * Usage:
 *   GET /.netlify/functions/_debug-event?date=2026-06-16&key=<DEBUG_KEY>
 *
 * The `key` must match the DEBUG_KEY env var (or the default below) to
 * prevent random callers from inspecting calendar contents.
 */
const { google } = require('googleapis');

const DEFAULT_KEY = 'zanchin-debug-2026'; // override by setting DEBUG_KEY in Netlify

exports.handler = async (event) => {
  const { date, key } = event.queryStringParameters || {};
  const expected = process.env.DEBUG_KEY || DEFAULT_KEY;
  if (key !== expected) return { statusCode: 401, body: JSON.stringify({ error: 'Wrong or missing key' }) };
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
    });
    const events = (res.data.items || []).map((ev) => ({
      id: ev.id,
      summary: ev.summary,
      start: ev.start,
      end: ev.end,
      description: ev.description,
      descriptionPreview: (ev.description || '').slice(0, 300),
      hasExtendedPrivate: !!ev.extendedProperties?.private,
      privateKeys: Object.keys(ev.extendedProperties?.private || {}),
      hasSourceTag: ev.extendedProperties?.private?.source === 'zanchin-booking',
      hasBookingData: !!ev.extendedProperties?.private?.bookingData,
      bookingDataLen: (ev.extendedProperties?.private?.bookingData || '').length,
      source: ev.source,
      attendees: (ev.attendees || []).map((a) => ({ email: a.email, responseStatus: a.responseStatus })),
      organizer: ev.organizer,
      creator: ev.creator,
    }));
    return { statusCode: 200, body: JSON.stringify({ events }, null, 2) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
