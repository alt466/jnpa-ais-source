'use strict';

// Generates a real time-series dataset by running the simulator forward,
// snapshotting the whole fleet (already in the widget's JSON shape) at each
// step. Useful for offline testing, charting, or as historical playback data
// before a live or simulated feed is connected to anything.
//
// Usage: node generate-sample-timeseries.js [steps] [minutesPerStep]

const { createVesselStore } = require('./ais-parser');
const { tickFleet } = require('./simulator');
const { toWidgetVessel } = require('./widget-adapter');
const fs = require('node:fs');

const steps = Number(process.argv[2]) || 40;
const minutesPerStep = Number(process.argv[3]) || 3;

const store = createVesselStore({ staleMs: Infinity });
const series = [];

for (let i = 0; i < steps; i++) {
  tickFleet(store, minutesPerStep, i);
  const simulatedMinutesElapsed = (i + 1) * minutesPerStep;
  series.push({
    tick: i + 1,
    simulatedMinutesElapsed,
    vessels: store.list().map(toWidgetVessel).filter(Boolean)
  });
}

const outPath = 'sample-timeseries.json';
fs.writeFileSync(outPath, JSON.stringify(series, null, 2));
console.log(`Wrote ${series.length} timestamped snapshots (${steps * minutesPerStep} simulated minutes) to ${outPath}`);
console.log(`First snapshot vessel 0:`, JSON.stringify(series[0].vessels[0]));
console.log(`Last snapshot vessel 0:`, JSON.stringify(series[series.length - 1].vessels[0]));
