'use strict';

const { toCanvas, nearestZone, nearestBerth, BERTHS } = require('./geo');

const TERMINAL_BY_BERTH = {
  'BMCT-01': 'BMCT', 'NSICT-01': 'NSICT', 'GTI-01': 'GTIPL',
  'NSIGT-01': 'NSIGT', 'LB-01': 'Liquid Terminal', 'SWB-01': 'Shallow Water Berth', 'CB-01': 'Coastal Berth'
};

function statusFromVessel(v) {
  const s = (v.navStatus || '').toLowerCase();
  if (s.includes('moored')) return 'Berthing in Progress';
  if (s.includes('anchor')) return 'Waiting at Anchorage';
  if ((v.speedKn || 0) > 1) return 'Inbound';
  return 'Awaiting Berth';
}

// A placeholder risk score: this is NOT a real risk model. It is a simple,
// clearly-labelled proxy (closer to berth + currently moving = lower risk)
// standing in until JNPA's own exception rules are connected. Replace this
// function when there's a real basis for it.
function placeholderRisk(v, berthId) {
  if (berthId) return 25;
  if ((v.speedKn || 0) > 1) return 45;
  return 60;
}

function toWidgetVessel(v) {
  const lat = v.lat, lon = v.lon;
  if (lat === undefined || lon === undefined) return null;
  const { x, y } = toCanvas(lat, lon);
  const berthId = nearestBerth(lat, lon);
  return {
    id: String(v.mmsi),
    name: v.name || `MMSI ${v.mmsi}`,
    imo: v.imo ? String(v.imo) : '—',
    type: 'Vessel', // AIS ship-type codes need a lookup table to turn into text; left generic for now
    cargo: '—',
    zone: nearestZone(lat, lon),
    status: statusFromVessel(v),
    speed: v.speedKn ?? 0,
    course: v.course ?? 0,
    etaBerth: v.eta || '—',
    berth: berthId || '—',
    terminal: berthId ? (TERMINAL_BY_BERTH[berthId] || '—') : '—',
    priority: 'Medium',
    risk: placeholderRisk(v, berthId),
    x, y
  };
}

function toWidgetBerths(widgetVessels) {
  return Object.entries(BERTHS).map(([id, coord]) => {
    const { x, y } = toCanvas(coord[0], coord[1]);
    const occupant = widgetVessels.find((v) => v.berth === id);
    return {
      id,
      terminal: TERMINAL_BY_BERTH[id] || '—',
      current: occupant ? occupant.name : 'None',
      next: '—', // needs JNPA's own berth plan — not derivable from AIS
      etb: '—',
      readiness: occupant ? 'Occupied' : 'Ready',
      risk: 'Low',
      x, y
    };
  });
}

// Static placeholder — pilots/tugs/mooring teams are not on the AIS broadcast.
function toWidgetResources() {
  return [
    { id: 'P001', type: 'Pilot', name: 'Pilot A', status: 'Available', vessel: 'None', available: 'Now' },
    { id: 'P002', type: 'Pilot', name: 'Pilot B', status: 'Available', vessel: 'None', available: 'Now' },
    { id: 'T001', type: 'Tug', name: 'Tug Alpha', status: 'Available', vessel: 'None', available: 'Now' },
    { id: 'T002', type: 'Tug', name: 'Tug Bravo', status: 'Available', vessel: 'None', available: 'Now' },
    { id: 'M001', type: 'Mooring', name: 'Mooring Team 1', status: 'Available', vessel: 'None', available: 'Now' }
  ];
}

// Simple rule-based alerts generated from current vessel state — genuinely
// reactive to whatever the store currently holds, even though the rules
// themselves are basic placeholders for JNPA's real exception logic.
function toWidgetAlerts(widgetVessels) {
  const alerts = [];
  let counter = 1;
  for (const v of widgetVessels) {
    if (v.risk >= 60) {
      alerts.push({
        id: `A${String(counter++).padStart(3, '0')}`,
        time: new Date().toISOString().slice(11, 16),
        severity: v.risk >= 80 ? 'Critical' : 'High',
        category: 'Waiting Time',
        vessel: v.name,
        message: `${v.name} has been waiting in ${v.zone} without a berth assignment.`,
        action: 'Review berth plan / pilot availability.',
        status: 'Open'
      });
    }
  }
  return alerts;
}

module.exports = { toWidgetVessel, toWidgetBerths, toWidgetResources, toWidgetAlerts };
