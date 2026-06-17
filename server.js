'use strict';

require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const { createVesselStore, JNPA_BBOX } = require('./ais-parser');
const { tickFleet } = require('./simulator');
const { fetchJnpaWeather } = require('./weather');
const { toWidgetVessel, toWidgetBerths, toWidgetResources, toWidgetAlerts } = require('./widget-adapter');
const { buildAlertsRss, buildVesselsCsv, buildMetricsCsv, summarize } = require('./feeds');

const PORT = Number(process.env.PORT) || 4000;
const API_KEY = process.env.AISSTREAM_API_KEY;
const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const RECONNECT_DELAY_MS = 5000;
const HAS_REAL_KEY = Boolean(API_KEY && API_KEY !== 'paste_your_key_here');
const METRICS_HISTORY_LIMIT = 500;

const store = createVesselStore({ staleMs: 30 * 60 * 1000 });
const metricsHistory = [];
let lastConnectError = null;
let connectedAt = null;
let mode = HAS_REAL_KEY ? 'connecting-live' : 'simulated';

// --- Live AIS connection (used only when a real API key is configured) ----

function connectLive() {
  const socket = new WebSocket(AISSTREAM_URL);

  socket.on('open', () => {
    connectedAt = new Date().toISOString();
    lastConnectError = null;
    mode = 'live';
    console.log(`[live] Connected to aisstream.io — subscribing to JNPA bounding box ${JSON.stringify(JNPA_BBOX)}`);
    socket.send(JSON.stringify({ APIKey: API_KEY, BoundingBoxes: [JNPA_BBOX] }));
  });

  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (err) { return; }
    if (msg && msg.error) {
      lastConnectError = msg.error;
      console.error('[live] aisstream.io error message:', msg.error);
      return;
    }
    store.handleMessage(msg);
  });

  socket.on('close', () => {
    connectedAt = null;
    mode = 'connecting-live';
    console.warn(`[live] connection closed, retrying in ${RECONNECT_DELAY_MS / 1000}s`);
    setTimeout(connectLive, RECONNECT_DELAY_MS);
  });

  socket.on('error', (err) => {
    lastConnectError = err.message;
    console.error('[live] socket error:', err.message);
  });
}

// --- Simulation mode (used automatically whenever no real API key is set) -

let tickCount = 0;
function startSimulation() {
  console.log('[sim] No AISSTREAM_API_KEY configured — running the built-in simulator instead.');
  console.log('[sim] Add a real key to .env at any point and restart to switch to live data with no other changes.');
  const TICK_INTERVAL_MS = 8000; // real seconds between ticks
  const MINUTES_PER_TICK = 3; // simulated minutes advanced per tick
  setInterval(() => {
    tickFleet(store, MINUTES_PER_TICK, tickCount++);
  }, TICK_INTERVAL_MS);
  tickFleet(store, MINUTES_PER_TICK, tickCount++); // run once immediately so data exists right away
}

setInterval(() => store.pruneStale(), 60 * 1000);

setInterval(() => {
  const widgetVessels = store.list().map(toWidgetVessel).filter(Boolean);
  const alerts = toWidgetAlerts(widgetVessels);
  metricsHistory.push(summarize(widgetVessels, alerts));
  if (metricsHistory.length > METRICS_HISTORY_LIMIT) metricsHistory.shift();
}, 60 * 1000);

// --- REST API ----------------------------------------------------------

const app = express();
app.use(cors()); // required so the widget (hosted on a different origin) can call this API

app.get('/raw/vessels', (req, res) => {
  res.json(store.list());
});

app.get('/vessels', (req, res) => {
  const widgetVessels = store.list().map(toWidgetVessel).filter(Boolean);
  res.json(widgetVessels);
});

app.get('/berths', (req, res) => {
  const widgetVessels = store.list().map(toWidgetVessel).filter(Boolean);
  res.json(toWidgetBerths(widgetVessels));
});

app.get('/resources', (req, res) => {
  res.json(toWidgetResources());
});

app.get('/alerts', (req, res) => {
  const widgetVessels = store.list().map(toWidgetVessel).filter(Boolean);
  res.json(toWidgetAlerts(widgetVessels));
});

app.get('/weather', async (req, res) => {
  res.json(await fetchJnpaWeather());
});

// --- Endpoints aimed at 3DEXPERIENCE's native apps (no custom widget code) -

app.get('/feed.xml', (req, res) => {
  const widgetVessels = store.list().map(toWidgetVessel).filter(Boolean);
  const alerts = toWidgetAlerts(widgetVessels);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.set('Content-Type', 'application/rss+xml');
  res.send(buildAlertsRss(alerts, widgetVessels, baseUrl));
});

app.get('/vessels.csv', (req, res) => {
  const widgetVessels = store.list().map(toWidgetVessel).filter(Boolean);
  res.set('Content-Type', 'text/csv');
  res.send(buildVesselsCsv(widgetVessels));
});

app.get('/metrics.csv', (req, res) => {
  res.set('Content-Type', 'text/csv');
  res.send(buildMetricsCsv(metricsHistory));
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    mode,
    sourceConnected: Boolean(connectedAt),
    connectedAt,
    lastConnectError,
    trackedVessels: store.vessels.size,
    boundingBox: JNPA_BBOX
  });
});

app.listen(PORT, () => {
  console.log(`JNPA AIS source listening on http://localhost:${PORT}`);
  if (HAS_REAL_KEY) {
    connectLive();
  } else {
    startSimulation();
  }
});

module.exports = app;
