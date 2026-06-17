const { google } = require('googleapis');
const {
  SOURCE_TAG, SOURCE_URL, SOURCE_TITLE,
  bookingsBlobStore, writeBookingBlob, hydrateBooking, isEmailAuthorized,
} = require('./_booking-utils');

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
    b.scriptLink ? `📝 Script: ${b.scriptLink}` : null,
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

  // Same allowlist gate as create — only authorized emails may edit bookings.
  if (!isEmailAuthorized(target)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'This email is not authorized to book. Please contact your administrator.' }) };
  }

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });
  const store = bookingsBlobStore();

  try {
    // Fetch the existing event and HYDRATE — works even if extendedProperties
    // was stripped (falls back to Netlify Blob, then description parsing).
    const existing = await calendar.events.get({ calendarId: 'primary', eventId });
    const hydrated = await hydrateBooking(existing.data, store);
    if (!hydrated) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found' }) };
    }
    const bookingData = hydrated.bookingData;

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
    delete updated._recoveredFromDescription; // breadcrumb only — don't persist

    // Patch description + metadata only — do NOT touch start/end (no reschedule).
    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: {
        description: buildDescription(updated),
        // Always re-set identifying fields; restores them if previously stripped.
        source: { title: SOURCE_TITLE, url: SOURCE_URL },
        extendedProperties: {
          private: {
            source: SOURCE_TAG,
            bookingData: JSON.stringify(updated),
          },
        },
      },
    });
    // Mirror to blob — durable backup of full bookingData incl. per-package detail.
    await writeBookingBlob(store, eventId, updated);
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
