const { google } = require('googleapis');
const {
  ZONES, SOURCE_TAG, SOURCE_URL, SOURCE_TITLE,
  bookingsBlobStore, writeBookingBlob, isEmailAuthorized,
} = require('./_booking-utils');

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

// Same bare-bones reminder as create-booking / update-booking.
function buildDescription(b) {
  return [
    `📍 Store: ${b.store}`,
    `🏢 Zone: ${b.zoneName}`,
    `⏱ Duration: ${b.durLabel}`,
    `👤 On-Site Contact: ${b.contact}${b.contactPhone ? ' · ' + b.contactPhone : ''}`,
    ``,
    `📧 Booked by: ${b.strategistName} (${b.strategistEmail})`,
    b.notes ? `📝 Notes: ${b.notes}` : null,
  ].filter(v => v !== null).join('\n');
}

const pad = (n) => String(n).padStart(2, '0');
const toLocalISO = (date, mins) => `${date}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;

/* Admin-only "master booking": creates a booking for any day/time with NO
   availability checks — it ignores zone locks, mall capacity, the weekly cap,
   the notice window, full-day blocks, and overlaps with other events. The
   admin token is the only gate, so this power never reaches the public form. */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!checkAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  let b;
  try { b = JSON.parse(event.body).bookingData; } catch { b = null; }
  if (!b) return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };

  const bad = (error) => ({ statusCode: 400, body: JSON.stringify({ error }) });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return bad('A valid date is required');
  if (!Number.isInteger(b.startMin) || !Number.isInteger(b.endMin) || b.startMin < 0 || b.endMin > 1440 || b.endMin <= b.startMin) {
    return bad('End time must be after start time');
  }
  if (!b.store || !ZONES[b.zone]) return bad('A dealership is required');
  const email = (b.strategistEmail || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('A valid strategist email is required');

  // Server owns the identity/derived fields; everything else comes from the admin form.
  const bookingData = {
    ...b,
    id: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now(),
    status: 'confirmed',
    zoneName: ZONES[b.zone].name,
    durMins: b.endMin - b.startMin,
    strategistEmail: email,
    packages: Array.isArray(b.packages) ? b.packages : [],
    packageDetail: b.packageDetail || {},
    adminCreated: true,
  };

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const ev = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      requestBody: {
        summary: `📷 ${bookingData.store} — Content Shoot`,
        description: buildDescription(bookingData),
        start: { dateTime: toLocalISO(bookingData.date, bookingData.startMin), timeZone: 'America/Toronto' },
        end: { dateTime: toLocalISO(bookingData.date, bookingData.endMin), timeZone: 'America/Toronto' },
        attendees: [{ email: 'stan@8create.ca' }, { email: 'andrewkotovych@gmail.com' }],
        source: { title: SOURCE_TITLE, url: SOURCE_URL },
        extendedProperties: {
          private: { source: SOURCE_TAG, bookingData: JSON.stringify(bookingData) },
        },
      },
    });
    await writeBookingBlob(bookingsBlobStore(), ev.data.id, bookingData);
    // Deliberately no ensureEditingBlocks(): a hand-placed squeeze-in shouldn't
    // trigger automatic Full Day Editing blocks on other days.
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        eventId: ev.data.id,
        // update-my-booking enforces the allowlist, so warn if they couldn't edit it.
        emailNotAuthorized: !isEmailAuthorized(email),
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
