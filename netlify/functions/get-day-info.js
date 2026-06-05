const { google } = require('googleapis');
const {
  isOurEvent, hydrateBooking, selfHealEvent, bookingsBlobStore, isoToET,
} = require('./_booking-utils');

exports.handler = async (event) => {
  const { date, from, to } = event.queryStringParameters || {};

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: 'v3', auth });
  const store = bookingsBlobStore();

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
    // No more hard `privateExtendedProperty` filter — identify via isOurEvent()
    // so tag-stripped events still count toward the zone lock.
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin, timeMax,
      singleEvents: true,
      maxResults: 250,
    });
    const ours = (res.data.items || []).filter(isOurEvent);

    const healTasks = [];
    const enriched = [];
    for (const ev of ours) {
      const hydrated = await hydrateBooking(ev, store);
      if (!hydrated || !hydrated.bookingData?.zone) continue;
      enriched.push({ ev, bookingData: hydrated.bookingData });
      if (hydrated.needsExtendedProps || hydrated.needsBlob) {
        healTasks.push(
          selfHealEvent(calendar, ev, hydrated.bookingData, store, {
            restoreExtendedProps: hydrated.needsExtendedProps,
            restoreBlob: hydrated.needsBlob,
          })
        );
      }
    }
    Promise.all(healTasks).catch(() => null);

    if (rangeMode) {
      // Group counts by ET date and zone.
      const byDate = {};
      enriched.forEach(({ ev, bookingData }) => {
        const start = ev.start?.dateTime || ev.start?.date;
        if (!start) return;
        const etDate = isoToET(start).dateStr;
        if (!byDate[etDate]) byDate[etDate] = {};
        byDate[etDate][bookingData.zone] = (byDate[etDate][bookingData.zone] || 0) + 1;
      });
      const result = {};
      Object.entries(byDate).forEach(([d, zones]) => {
        result[d] = Object.entries(zones).map(([zone, bookedCount]) => ({ zone, bookedCount }));
      });
      return { statusCode: 200, body: JSON.stringify({ byDate: result }) };
    } else {
      const zones = {};
      enriched.forEach(({ bookingData }) => {
        zones[bookingData.zone] = (zones[bookingData.zone] || 0) + 1;
      });
      const summary = Object.entries(zones).map(([zone, bookedCount]) => ({ zone, bookedCount }));
      return { statusCode: 200, body: JSON.stringify({ summary }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
