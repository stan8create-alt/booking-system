const { google } = require('googleapis');

// Public endpoint: lets the person who made a booking edit ONLY the content
// packages (and notes) of their own booking. Email must match the booking's
// stored strategistEmail. Date/time/store/contact are never changed here.
function buildDescription(b) {
  return [
    `📍 Store: ${b.store}`,
    `🏢 Zone: ${b.zoneName}`,
    `⏱ Duration: ${b.durLabel}`,
    `👤 On-Site Contact: ${b.contact}${b.contactPhone ? ' · ' + b.contactPhone : ''}`,
    `📦 Content: ${(b.packages || []).join(', ')}`,
    ``,
    `📧 Booked by: ${b.strategistName} (${b.strategistEmail})`,
    b.notes ? `📝 Notes: ${b.notes}` : null,
  ].filter(v => v !== null).join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }
  const { eventId, email, packages, packageDetail, notes } = payload;
  if (!eventId || !email) return { statusCode: 400, body: JSON.stringify({ error: 'Missing eventId or email' }) };
  const target = email.trim().toLowerCase();

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    // Fetch the existing event and verify ownership by email
    const existing = await calendar.events.get({ calendarId: 'primary', eventId });
    let bookingData = {};
    try { bookingData = JSON.parse(existing.data.extendedProperties?.private?.bookingData || '{}'); } catch {}

    if ((bookingData.strategistEmail || '').trim().toLowerCase() !== target) {
      return { statusCode: 403, body: JSON.stringify({ error: 'This booking does not belong to that email' }) };
    }

    // Merge ONLY package-related fields + notes. Everything else stays as-is.
    const updated = {
      ...bookingData,
      packages: Array.isArray(packages) ? packages : bookingData.packages,
      packageDetail: packageDetail || bookingData.packageDetail || {},
      notes: notes != null ? notes : bookingData.notes,
    };

    // Patch description + metadata only — do NOT touch start/end (no reschedule).
    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: {
        description: buildDescription(updated),
        extendedProperties: {
          private: {
            source: 'zanchin-booking',
            bookingData: JSON.stringify(updated),
          },
        },
      },
    });
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
