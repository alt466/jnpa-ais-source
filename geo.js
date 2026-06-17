'use strict';

// Illustrative reference points within the JNPA bounding box, used for both the
// simulator and for classifying real AIS positions into a human-readable zone.
// These are approximate, demo-purpose coordinates — NOT authoritative chart or
// VTS waypoints. Good enough to make a dashboard read sensibly; not for navigation.
const ZONES = {
  'Outer Anchorage': [18.978, 72.820],
  'Approach Channel': [18.958, 72.895],
  'Pilot Boarding Area': [18.953, 72.915],
  'Turning Basin': [18.949, 72.946],
  'Anchorage A': [18.928, 72.852],
  'Anchorage B': [18.992, 72.858]
};

const BERTHS = {
  'BMCT-01': [18.953, 72.952],
  'NSICT-01': [18.949, 72.953],
  'GTI-01': [18.946, 72.953],
  'NSIGT-01': [18.952, 72.957],
  'LB-01': [18.944, 72.948],
  'SWB-01': [18.940, 72.945],
  'CB-01': [18.937, 72.940]
};

// Bounding box this whole project uses (must match ais-parser.js JNPA_BBOX).
const BBOX = [[18.82, 72.78], [19.05, 73.05]];

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Linear projection of a lat/lon inside BBOX onto the widget's 1000x620 SVG canvas. */
function toCanvas(lat, lon) {
  const [[swLat, swLon], [neLat, neLon]] = BBOX;
  const xFrac = (lon - swLon) / (neLon - swLon);
  const yFrac = 1 - (lat - swLat) / (neLat - swLat); // lat increases upward, svg y increases downward
  const x = 40 + xFrac * (960 - 40);
  const y = 40 + yFrac * (580 - 40);
  return { x: Math.round(x), y: Math.round(y) };
}

/** Nearest named zone to a position, or 'At Sea' if nothing is reasonably close. */
function nearestZone(lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const [name, coord] of Object.entries(ZONES)) {
    const d = haversineKm([lat, lon], coord);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return bestDist <= 6 ? best : 'At Sea';
}

/** Nearest berth if within ~600m, else null (not close enough to call it "at a berth"). */
function nearestBerth(lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const [id, coord] of Object.entries(BERTHS)) {
    const d = haversineKm([lat, lon], coord);
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return bestDist <= 0.6 ? best : null;
}

module.exports = { ZONES, BERTHS, BBOX, haversineKm, toCanvas, nearestZone, nearestBerth };
