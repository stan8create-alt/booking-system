/**
 * Shared booking hydration / persistence helpers.
 *
 * A portal-created Google Calendar event can lose its
 * `extendedProperties.private.source` tag (and the `bookingData` JSON inside it)
 * when an outside-the-portal action modifies it — most commonly when a non-Google
 * guest accepts an invite and their calendar system round-trips the event back
 * without preserving Google's private extended properties.
 *
 * To make the system robust against this, every booking is stored in THREE places:
 *   1. extendedProperties.private.bookingData  — primary, fast, server-side filterable
 *   2. Netlify Blob keyed by eventId           — durable backup, survives any GCal strip
 *   3. The event description                    — human-readable + parseable fallback
 *   4. event.source.url                         — secondary identifier signal
 *
 * `hydrateBooking()` reads in that order. If a higher layer is missing,
 * `selfHealEvent()` writes it back so the event recovers on the next read.
 */

const { getStore } = require('@netlify/blobs');

/* Zone map mirrors the frontend ZONES constant. Used to reverse-lookup the
   zone key from the friendly zone name found in a stripped event's description. */
const ZONES = {
  woodbridge:  { name: 'Woodbridge Auto Mall',  maxPerDay: 4 },
  maple:       { name: 'Maple Auto Mall',       maxPerDay: 3 },
  stouffville: { name: 'Stouffville Auto Mall', maxPerDay: 4 },
  mississauga: { name: 'Mississauga Auto Mall', maxPerDay: 2 },
  fullday:     { name: 'Full-Day Location',     maxPerDay: 1 },
};

const SOURCE_TAG = 'zanchin-booking';
const SOURCE_URL = 'https://zanchin-booking.netlify.app';
const SOURCE_TITLE = 'Zanchin Content Shoot Booking';
const BLOB_STORE_NAME = 'bookings';

/* Mirrors the PACKAGES array in index.html. Used to map the friendly labels
   found in a stripped event's description back to canonical package ids. */
const PACKAGE_LABEL_TO_ID = {
  'Ethnic Videos': 'ethnic',
  'Sales Video': 'salesvideo',
  'Walkaround': 'walkaround',
  'Service Video': 'service',
  'Headshots': 'headshots',
  'Photo Session': 'gmb',
  'Event Coverage': 'event',
  'Lifestyle Content': 'event', // legacy label that mapped to the same slot
  'Social Media Content': 'social',
  'Sales Rep. Intro Video': 'salesrep',
};
function packageLabelToId(label) {
  // Strip "3× " / "10× " count prefixes the success-screen / admin-view formatters add
  const stripped = (label || '').replace(/^\d+\s*[x×]\s*/i, '').trim();
  return PACKAGE_LABEL_TO_ID[stripped] || null;
}

/* Convert an ISO datetime + IANA tz to {dateStr, mins} in that tz. */
function isoToET(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    mins: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
  };
}

function zoneKeyFromName(name) {
  if (!name) return '';
  const target = name.trim().toLowerCase();
  for (const [key, z] of Object.entries(ZONES)) {
    if (z.name.toLowerCase() === target) return key;
  }
  return '';
}

/* Google Calendar's web UI sometimes saves descriptions as HTML (rich-text
   editor converts newlines to <br> / <p>). Normalize to plain text with \n
   separators so our parsing works the same way regardless. */
function descToPlain(description) {
  if (!description || typeof description !== 'string') return '';
  return description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/?(div|span|b|i|u|strong|em|font)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/* A description is "portal-shaped" if it contains BOTH the Store and Zone
   markers. Order and surrounding formatting don't matter (handles the case
   where GCal's rich-text editor re-wraps the text on save). This pattern is
   specific enough that unrelated events won't be misidentified. */
function isPortalDescription(description) {
  if (!description || typeof description !== 'string') return false;
  const plain = descToPlain(description);
  return plain.includes('📍 Store:') && plain.includes('🏢 Zone:');
}

/* Parse the structured portal description into a partial bookingData.
   Per-package detail (headshot names, video entries, etc.) cannot be recovered
   from the description — only the top-level metadata. */
function parseDescriptionAsBookingData(description, event) {
  const plain = descToPlain(description);
  const get = (label) => {
    const re = new RegExp('^' + label + '(.*)$', 'm');
    const m = plain.match(re);
    return m ? m[1].trim() : '';
  };
  const store = get('📍 Store:\\s*');
  const zoneName = get('🏢 Zone:\\s*');
  const durLabel = get('⏱ Duration:\\s*');
  const contactLine = get('👤 On-Site Contact:\\s*');
  const packagesLine = get('📦 Content:\\s*');
  const scriptLink = get('📝 Script:\\s*');
  const bookedByLine = get('📧 Booked by:\\s*');
  const notesMatch = plain.match(/📝 Notes:\s*([\s\S]*?)$/);

  // Contact + phone: "Name · 416-555-0100"
  let contact = contactLine, contactPhone = '';
  const sepIdx = contactLine.indexOf(' · ');
  if (sepIdx !== -1) { contact = contactLine.slice(0, sepIdx); contactPhone = contactLine.slice(sepIdx + 3); }

  // Booked by: "Name (email@x)"
  let strategistName = bookedByLine, strategistEmail = '';
  const em = bookedByLine.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (em) { strategistName = em[1].trim(); strategistEmail = em[2].trim(); }

  // Convert friendly labels in the description (e.g. "3× Headshots, Walkaround")
  // back to canonical package ids. Unknown labels are kept verbatim so the admin
  // tag list still shows something rather than silently dropping them.
  const rawPackageLabels = packagesLine ? packagesLine.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const packages = rawPackageLabels.map((lbl) => packageLabelToId(lbl) || lbl);
  const zone = zoneKeyFromName(zoneName);

  // Date/time from the event itself
  const startISO = event.start?.dateTime || event.start?.date;
  const endISO = event.end?.dateTime || event.end?.date;
  let date = '', startMin = 0, endMin = 0, durMins = 0;
  if (startISO && endISO) {
    const s = isoToET(startISO);
    const e = isoToET(endISO);
    date = s.dateStr;
    startMin = s.mins;
    endMin = e.mins;
    durMins = endMin - startMin;
  }

  return {
    // Synthesize a stable id from the GCal event id when none recovered.
    id: 'rec_' + (event.id || '').slice(0, 16),
    createdAt: event.created ? new Date(event.created).getTime() : Date.now(),
    status: 'confirmed',
    date, startMin, endMin,
    durLabel, durMins,
    store, zone, zoneName,
    contact, contactPhone,
    packages,
    packageDetail: {}, // unrecoverable from description text
    scriptLink,
    notes: notesMatch ? notesMatch[1].trim() : '',
    strategistName, strategistEmail,
    _recoveredFromDescription: true, // breadcrumb so callers can show a hint
  };
}

/* True for any event we should treat as a portal booking. */
function isOurEvent(event) {
  if (event.extendedProperties?.private?.source === SOURCE_TAG) return true;
  if (event.source?.url === SOURCE_URL) return true;
  return isPortalDescription(event.description);
}

/* Best-effort booking data from an event, plus a flag indicating
   which layers were missing so callers can self-heal. */
async function hydrateBooking(event, store) {
  let bookingData = null;
  let needsExtendedProps = false;
  let needsBlob = false;

  // Layer 1 — extendedProperties.private.bookingData
  const raw = event.extendedProperties?.private?.bookingData;
  if (raw) {
    try { bookingData = JSON.parse(raw); } catch {}
  }
  if (!bookingData || typeof bookingData !== 'object' || !Object.keys(bookingData).length) {
    needsExtendedProps = true;
  }

  // Layer 2 — Netlify Blob (durable backup, survives GCal strip)
  if (!bookingData && store) {
    try {
      const fromBlob = await store.get(event.id, { type: 'json' });
      if (fromBlob && typeof fromBlob === 'object') {
        bookingData = fromBlob;
        // we recovered from blob, so the extendedProps must be restored
      }
    } catch {}
  }
  // Even if we got data from extendedProps, ensure the blob exists.
  if (store) {
    try {
      const probe = await store.get(event.id);
      if (!probe) needsBlob = true;
    } catch { needsBlob = true; }
  }

  // Layer 3 — description parsing (partial data only)
  if (!bookingData) {
    if (!isPortalDescription(event.description)) return null; // not ours
    bookingData = parseDescriptionAsBookingData(event.description, event);
  }

  return { bookingData, needsExtendedProps, needsBlob };
}

/* Write the full bookingData to the Netlify Blob. Safe to call on every save. */
async function writeBookingBlob(store, eventId, bookingData) {
  if (!store || !eventId) return;
  try { await store.setJSON(eventId, bookingData); } catch {}
}

async function deleteBookingBlob(store, eventId) {
  if (!store || !eventId) return;
  try { await store.delete(eventId); } catch {}
}

/* Re-attach the source tag + bookingData to a stripped event AND ensure the blob
   exists. Best-effort — failures don't propagate (the read path still returns data). */
async function selfHealEvent(calendar, event, bookingData, store, { restoreExtendedProps, restoreBlob }) {
  const tasks = [];
  if (restoreExtendedProps) {
    tasks.push(
      calendar.events.patch({
        calendarId: 'primary',
        eventId: event.id,
        sendUpdates: 'none',
        requestBody: {
          extendedProperties: {
            private: {
              source: SOURCE_TAG,
              bookingData: JSON.stringify(bookingData),
            },
          },
          source: { title: SOURCE_TITLE, url: SOURCE_URL },
        },
      }).catch(() => null)
    );
  }
  if (restoreBlob && store) {
    tasks.push(writeBookingBlob(store, event.id, bookingData));
  }
  await Promise.all(tasks);
}

function bookingsBlobStore() {
  try { return getStore(BLOB_STORE_NAME); } catch { return null; }
}

module.exports = {
  ZONES,
  SOURCE_TAG,
  SOURCE_URL,
  SOURCE_TITLE,
  BLOB_STORE_NAME,
  isoToET,
  zoneKeyFromName,
  isPortalDescription,
  parseDescriptionAsBookingData,
  isOurEvent,
  hydrateBooking,
  writeBookingBlob,
  deleteBookingBlob,
  selfHealEvent,
  bookingsBlobStore,
};
