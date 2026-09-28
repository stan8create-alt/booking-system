/**
 * Mirrors the `ZONES` constant in index.html (and netlify/functions/_booking-utils.js).
 * Local-dev only — the real app has no shared module for this, so this copy
 * must be kept in sync by hand if the zone list changes.
 */
const ZONES = {
  woodbridge:  { name: 'Woodbridge Auto Mall',  maxPerDay: 4, stores: ['VW Martin Grove','Alta Infiniti','Honda 7','Woodbridge Toyota','Prima Mazda','Woodbridge Nissan'] },
  maple:       { name: 'Maple Auto Mall',       maxPerDay: 3, stores: ['Mercedes-Benz Maple','Mercedes-Benz Maple (Van Centre)','Maple Honda','Maple Toyota','Lexus of Vaughan','Maple Nissan','Maple Hyundai','Genesis Maple','Maple Acura','Maple VW','Maple Mazda'] },
  stouffville: { name: 'Stouffville Auto Mall', maxPerDay: 4, stores: ['Nissan Stouffville','VW Stouffville','Hyundai Stouffville','Stouffville Chrysler'] },
  mississauga: { name: 'Mississauga Auto Mall', maxPerDay: 2, stores: ['Erin Mills Acura','VW Mississauga'] },
  oakville:    { name: 'Oakville Auto Mall',    maxPerDay: 2, exclusive: true, stores: ['Lexus of Oakville','Acura Oakville'] },
  fullday:     { name: 'Full-Day Location',     maxPerDay: 1, exclusive: true, stores: ['Richmond Hill Nissan','Mercedes-Benz Newmarket','Jaguar Land Rover Brampton','Mercedes-Benz Mississauga','Mercedes-Benz Toronto Queensway'] },
};

const STORE_ZONE = {};
Object.entries(ZONES).forEach(([key, z]) => z.stores.forEach(s => { STORE_ZONE[s] = key; }));

const WEEKLY_CAP = 6;
const DAY_START = 10 * 60;
const DAY_START_WED = 12 * 60;
const DAY_END = 16 * 60;

// Local-only allowlist — stands in for the production AUTHORIZED_EMAILS env var.
const AUTHORIZED_EMAILS = [
  'stan@8create.ca',
  'strategist1@8create.ca',
  'strategist2@8create.ca',
  'emily@zanchinauto.com',
];

module.exports = { ZONES, STORE_ZONE, WEEKLY_CAP, DAY_START, DAY_START_WED, DAY_END, AUTHORIZED_EMAILS };
