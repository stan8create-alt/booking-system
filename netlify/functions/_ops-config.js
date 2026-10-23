/* Dealership / brand data for the Ops Hub, ported from project-setup/engine.py
   (MONDAY_ITEM_IDS, BRAND_TO_DEALERSHIPS, resolve_dealership). Keep in sync
   with engine.py until the old app is retired. */

const MONDAY_ITEM_IDS = {
  'MB Maple': 7105030571,
  'MB Mississauga': 7105030590,
  'MBTQ': 7105030602,
  'MB Durham': 7105082589,
  'MB Newmarket': 9538482726,
  'Maple Mazda': 7105030622,
  'Prima Mazda': 7105030611,
  'Maple Acura': 7118667159,
  'Erin Mills Acura': 18389260844,
  'Maple Toyota': 7118669307,
  'Woodbridge Toyota': 7118670101,
  'LOV': 7118671285,
  'LOO': 7118671682,
  'Genesis Maple': 7266644360,
  'Maple Nissan': 7118672946,
  'Woodbridge Nissan': 7118673357,
  'Richmond Hill Nissan': 7118674348,
  'Stouffville Nissan': 7118674981,
  'Maple Hyundai': 7118675760,
  'Stouffville Hyundai': 7118676328,
  'Martin Grove VW': 7118677790,
  'Maple VW': 8253797492,
  'Stouffville VW': 18155216963,
  'Mississauga VW': 18388701103,
  'Alta Infiniti': 7118678685,
  'Honda 7': 7118679722,
  'Maple Honda': 7118679949,
  'JLR Brampton': 7118681722,
  'Stouffville Chrysler': 12023720389,
  'Zanchin': 7198133710,
};

const BRAND_TO_DEALERSHIPS = {
  'Acura': ['Erin Mills Acura', 'Maple Acura'],
  'Chrysler': ['Stouffville Chrysler'],
  'Genesis': ['Genesis Maple'],
  'Honda': ['Honda 7', 'Maple Honda'],
  'Hyundai': ['Maple Hyundai', 'Stouffville Hyundai'],
  'Infiniti': ['Alta Infiniti'],
  'JLR': ['JLR Brampton'],
  'Lexus': ['LOV', 'LOO'],
  'Mazda': ['Maple Mazda', 'Prima Mazda'],
  'Mercedes-Benz': ['MB Maple', 'MB Durham', 'MBTQ', 'MB Newmarket', 'MB Mississauga'],
  'Nissan': ['Maple Nissan', 'Richmond Hill Nissan', 'Stouffville Nissan', 'Woodbridge Nissan'],
  'Toyota': ['Maple Toyota', 'Woodbridge Toyota'],
  'VW': ['Maple VW', 'Martin Grove VW', 'Mississauga VW', 'Stouffville VW'],
  'Zanchin': ['Zanchin'],
};

const DEALERSHIP_LOOKUP = {};
for (const [brand, list] of Object.entries(BRAND_TO_DEALERSHIPS)) {
  for (const d of list) DEALERSHIP_LOOKUP[d.toLowerCase()] = { brand, dealership: d };
}

/* Port of Python difflib.SequenceMatcher.ratio(): 2 * matching chars / total chars,
   where matches are found by repeatedly taking the longest common block. */
function matchRatio(a, b) {
  function rec(alo, ahi, blo, bhi) {
    let bi = alo, bj = blo, bk = 0;
    for (let i = alo; i < ahi; i++) {
      for (let j = blo; j < bhi; j++) {
        let k = 0;
        while (i + k < ahi && j + k < bhi && a[i + k] === b[j + k]) k++;
        if (k > bk) { bi = i; bj = j; bk = k; }
      }
    }
    if (!bk) return 0;
    return bk + rec(alo, bi, blo, bj) + rec(bi + bk, ahi, bj + bk, bhi);
  }
  return a.length + b.length === 0 ? 1 : (2 * rec(0, a.length, 0, b.length)) / (a.length + b.length);
}

/* Same behaviour as the desktop app's resolve_dealership: exact (case-insensitive)
   match, else the closest name at cutoff 0.78 with a "Matched 'x' to 'y'" note.
   Returns { brand, dealership, note } or null. */
function resolveDealership(input) {
  const typed = String(input || '').trim().toLowerCase();
  if (DEALERSHIP_LOOKUP[typed]) return { ...DEALERSHIP_LOOKUP[typed], note: null };
  let best = null, bestScore = 0;
  for (const key of Object.keys(DEALERSHIP_LOOKUP)) {
    const score = matchRatio(key, typed);
    if (score >= 0.78 && score > bestScore) { best = key; bestScore = score; }
  }
  if (!best) return null;
  const m = DEALERSHIP_LOOKUP[best];
  return { ...m, note: `Matched '${String(input).trim()}' to '${m.dealership}'` };
}

function allDealerships() {
  return Object.entries(BRAND_TO_DEALERSHIPS).map(([brand, dealerships]) => ({ brand, dealerships }));
}

// Flat A–Z list for the autocomplete (same as the app's ALL_DEALERSHIPS).
function allDealershipNames() {
  return Object.values(BRAND_TO_DEALERSHIPS).flat().sort();
}

module.exports = { MONDAY_ITEM_IDS, BRAND_TO_DEALERSHIPS, resolveDealership, allDealerships, allDealershipNames };
