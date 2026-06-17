'use strict';

const { ZONES, BERTHS } = require('./geo');

// Six illustrative vessels with simple multi-waypoint paths through the named
// zones to a berth. MMSI numbers are clearly synthetic test identifiers (900xxxxx
// is not a real assigned country code block) — these are not real ships.
const ROUTE_POINTS = {
  outer: ZONES['Outer Anchorage'],
  approach: ZONES['Approach Channel'],
  pilot: ZONES['Pilot Boarding Area'],
  basin: ZONES['Turning Basin'],
  anchorA: ZONES['Anchorage A'],
  anchorB: ZONES['Anchorage B'],
  bmct: BERTHS['BMCT-01'],
  nsict: BERTHS['NSICT-01'],
  gti: BERTHS['GTI-01'],
  lb: BERTHS['LB-01']
};

function makeVessel(opts) {
  return {
    mmsi: opts.mmsi,
    name: opts.name,
    imo: opts.imo,
    shipTypeCode: opts.shipTypeCode,
    destination: 'INNSA JNPT',
    maxDraughtM: opts.draught,
    path: opts.path.map((key) => ROUTE_POINTS[key]),
    cruiseSpeedKn: opts.cruiseSpeedKn,
    legIndex: opts.startLeg || 0,
    legFraction: opts.startFraction || 0
  };
}

const FLEET = [
  makeVessel({ mmsi: 900000001, name: 'SIM Ocean Pioneer', imo: 9384756, shipTypeCode: 70, draught: 11.5,
    path: ['outer', 'approach', 'pilot', 'basin', 'bmct'], cruiseSpeedKn: 10 }),
  makeVessel({ mmsi: 900000002, name: 'SIM Arabian Pearl', imo: 9473621, shipTypeCode: 80, draught: 13.0,
    path: ['outer'], cruiseSpeedKn: 0 }), // sits at anchorage the whole time
  makeVessel({ mmsi: 900000003, name: 'SIM Konkan Star', imo: 9218456, shipTypeCode: 70, draught: 9.0,
    path: ['anchorA', 'basin', 'gti'], cruiseSpeedKn: 8 }),
  makeVessel({ mmsi: 900000004, name: 'SIM Blue Horizon', imo: 9365412, shipTypeCode: 70, draught: 12.0,
    path: ['outer', 'approach', 'pilot', 'basin', 'nsict'], cruiseSpeedKn: 11, startFraction: 0.1 }),
  makeVessel({ mmsi: 900000005, name: 'SIM Gateway Express', imo: 9456783, shipTypeCode: 70, draught: 12.5,
    path: ['pilot', 'basin', 'bmct'], cruiseSpeedKn: 6, startFraction: 0.5 }),
  makeVessel({ mmsi: 900000006, name: 'SIM Western Flame', imo: 9278901, shipTypeCode: 80, draught: 10.5,
    path: ['anchorB', 'basin', 'lb'], cruiseSpeedKn: 9 })
];

function bearingDeg(a, b) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const [lat1, lon1] = a.map(toRad);
  const [lat2, lon2] = b.map(toRad);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function interpolate(a, b, frac) {
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

/** Advances one vessel by `minutes` of simulated time; returns its current state. */
function advanceVessel(v, minutes) {
  if (v.path.length < 2 || v.cruiseSpeedKn === 0) {
    const pos = v.path[v.legIndex] || v.path[0];
    return { lat: pos[0], lon: pos[1], course: 0, speedKn: 0, atFinalPoint: true };
  }

  let remainingKm = v.cruiseSpeedKn * (minutes / 60);
  let leg = v.legIndex;
  let frac = v.legFraction;

  while (leg < v.path.length - 1 && remainingKm > 0) {
    const a = v.path[leg];
    const b = v.path[leg + 1];
    const legKm = haversineKm(a, b);
    const remainingOnLegKm = (1 - frac) * legKm;
    if (remainingKm < remainingOnLegKm) {
      frac += remainingKm / legKm;
      remainingKm = 0;
    } else {
      remainingKm -= remainingOnLegKm;
      leg += 1;
      frac = 0;
    }
  }

  v.legIndex = Math.min(leg, v.path.length - 1);
  v.legFraction = v.legIndex === v.path.length - 1 ? 0 : frac;

  const atFinalPoint = v.legIndex === v.path.length - 1;
  const pos = atFinalPoint
    ? v.path[v.legIndex]
    : interpolate(v.path[v.legIndex], v.path[v.legIndex + 1], v.legFraction);
  const course = atFinalPoint
    ? bearingDeg(v.path[Math.max(0, v.legIndex - 1)], v.path[v.legIndex])
    : bearingDeg(v.path[v.legIndex], v.path[v.legIndex + 1]);

  return {
    lat: pos[0],
    lon: pos[1],
    course: Math.round(course),
    speedKn: atFinalPoint ? 0 : v.cruiseSpeedKn,
    atFinalPoint
  };
}

function navStatusCodeFor(atFinalPoint, legIndex) {
  if (!atFinalPoint) return 0; // under way using engine
  return legIndex === 0 ? 1 : 5; // 1 = at anchor, 5 = moored (final leg treated as a berth)
}

function positionMessage(v, state) {
  return {
    MessageType: 'PositionReport',
    MetaData: {
      MMSI: v.mmsi,
      ShipName: v.name,
      latitude: state.lat,
      longitude: state.lon,
      time_utc: new Date().toISOString()
    },
    Message: {
      PositionReport: {
        Cog: state.course,
        Sog: state.speedKn,
        Latitude: state.lat,
        Longitude: state.lon,
        MessageID: 1,
        NavigationalStatus: navStatusCodeFor(state.atFinalPoint, v.legIndex),
        TrueHeading: state.course,
        UserID: v.mmsi,
        Valid: true
      }
    }
  };
}

function staticDataMessage(v) {
  const legsToGo = Math.max(0, v.path.length - 1 - v.legIndex - v.legFraction);
  const minutesToGo = legsToGo * 20; // rough demo-only estimate, not a navigation figure
  const eta = new Date(Date.now() + minutesToGo * 60 * 1000);
  return {
    MessageType: 'ShipStaticData',
    MetaData: { MMSI: v.mmsi, ShipName: v.name, time_utc: new Date().toISOString() },
    Message: {
      ShipStaticData: {
        ImoNumber: v.imo,
        Name: v.name,
        Type: v.shipTypeCode,
        Destination: v.destination,
        MaximumStaticDraught: v.maxDraughtM,
        Eta: { Month: eta.getUTCMonth() + 1, Day: eta.getUTCDate(), Hour: eta.getUTCHours(), Minute: eta.getUTCMinutes() }
      }
    }
  };
}

/**
 * Advances the whole fleet by `minutes` of simulated time and feeds the
 * resulting synthetic AIS messages into the given store via its normal
 * handleMessage() — the exact same code path real aisstream.io data uses.
 */
function tickFleet(store, minutes, tickCount = 0) {
  for (const v of FLEET) {
    const state = advanceVessel(v, minutes);
    store.handleMessage(positionMessage(v, state));
    if (tickCount % 5 === 0) store.handleMessage(staticDataMessage(v));
  }
}

module.exports = { FLEET, tickFleet };
