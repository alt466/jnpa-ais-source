'use strict';

// JNPA (Nhava Sheva) bounding box: south-west corner, north-east corner, [lat, lon].
// Covers the outer anchorage, approach channel and harbor. Widen this if you find
// vessels dropping out of range at the edges once you watch real traffic for a while.
const JNPA_BBOX = [[18.82, 72.78], [19.05, 73.05]];

// AIS NavigationalStatus codes (ITU-R M.1371), used on PositionReport messages.
const NAV_STATUS = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Fishing',
  8: 'Under way sailing',
  11: 'Power-driven vessel towing astern',
  12: 'Power-driven vessel pushing ahead',
  14: 'AIS-SART/MOB/EPIRB active',
  15: 'Undefined'
};

const POSITION_MESSAGE_TYPES = new Set([
  'PositionReport',
  'StandardClassBPositionReport',
  'ExtendedClassBPositionReport'
]);

function formatEta(eta) {
  // aisstream's Eta object has Month/Day/Hour/Minute but no year (per the AIS spec,
  // ETA is a recurring within-year field). Self-reported by the crew, often stale —
  // treat as indicative, not authoritative.
  if (!eta || (Number(eta.Month) === 0 && Number(eta.Day) === 0)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(eta.Month)}-${pad(eta.Day)} ${pad(eta.Hour)}:${pad(eta.Minute)} UTC`;
}

function cleanString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/@+$/g, '').trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * Creates an isolated in-memory vessel store with no network dependencies,
 * so the parsing logic can be exercised directly in tests.
 */
function createVesselStore({ staleMs = 30 * 60 * 1000 } = {}) {
  const vessels = new Map(); // keyed by MMSI

  function upsert(mmsi, patch) {
    const existing = vessels.get(mmsi) || { mmsi };
    const merged = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && value !== null) merged[key] = value;
    }
    merged.lastUpdate = new Date().toISOString();
    vessels.set(mmsi, merged);
    return merged;
  }

  function handleMessage(msg) {
    if (!msg || !msg.MessageType || !msg.Message) return null;
    const meta = msg.MetaData || {};
    const body = msg.Message[msg.MessageType];
    if (!body) return null;

    const mmsi = meta.MMSI ?? body.UserID;
    if (!mmsi) return null;

    if (POSITION_MESSAGE_TYPES.has(msg.MessageType)) {
      return upsert(mmsi, {
        name: cleanString(meta.ShipName),
        lat: body.Latitude,
        lon: body.Longitude,
        speedKn: body.Sog,
        course: body.Cog,
        heading: body.TrueHeading,
        navStatusCode: body.NavigationalStatus,
        navStatus: NAV_STATUS[body.NavigationalStatus] || 'Unknown',
        messageType: msg.MessageType
      });
    }

    if (msg.MessageType === 'ShipStaticData') {
      return upsert(mmsi, {
        name: cleanString(meta.ShipName) || cleanString(body.Name),
        imo: body.ImoNumber || undefined,
        callSign: cleanString(body.CallSign),
        shipTypeCode: body.Type,
        destination: cleanString(body.Destination),
        maxDraughtM: body.MaximumStaticDraught,
        eta: formatEta(body.Eta)
      });
    }

    return null; // other AIS message types are ignored for this use case
  }

  function pruneStale(now = Date.now()) {
    for (const [mmsi, v] of vessels) {
      if (now - new Date(v.lastUpdate).getTime() > staleMs) vessels.delete(mmsi);
    }
  }

  return {
    vessels,
    handleMessage,
    pruneStale,
    list: () => Array.from(vessels.values())
  };
}

module.exports = { createVesselStore, JNPA_BBOX, NAV_STATUS, formatEta };
