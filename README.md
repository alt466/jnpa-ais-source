# JNPA AIS data source

A Node.js service that tracks vessels near JNPA (Nhava Sheva) and serves the
data in several shapes: JSON (for a custom dashboard widget), RSS (for
3DDashboard's native "RSS feeds" app), and CSV (for NETVIBES Metrics Reader).
It runs in one of two modes, decided automatically:

- **Simulated mode** (default, zero setup): if no real `AISSTREAM_API_KEY` is
  configured, the service runs a built-in simulator — six vessels moving
  along realistic routes through JNPA's anchorages, channel, and berths —
  fed through the exact same parsing code real AIS data would use.
- **Live mode**: once you add a real aisstream.io API key, the service
  connects to the live feed instead. No other code changes needed.

## Files

- `server.js` — the REST API and mode switch (live vs. simulated)
- `ais-parser.js` — parses AIS message shapes into an in-memory vessel store (unit tested)
- `simulator.js` — generates realistic synthetic vessel movement for demo/testing
- `geo.js` — zone classification, berth proximity, lat/lon → canvas projection
- `widget-adapter.js` — reshapes tracked vessels into the dashboard widget's field names
- `feeds.js` — builds the RSS feed and CSV exports for native 3DEXPERIENCE apps
- `weather.js` — real current weather for JNPA from Open-Meteo (free, no key)
- `generate-sample-timeseries.js` — dumps a real timestamped dataset to a JSON file
- `sample-timeseries.json` — a generated 2-hour example (40 snapshots, 3 simulated minutes apart)

## Endpoints

For the custom dashboard widget (the HTML file):
- `GET /vessels`, `/berths`, `/resources`, `/alerts`, `/weather` — the widget's exact JSON shape

For native 3DEXPERIENCE apps, no custom widget code involved:
- `GET /feed.xml` — RSS 2.0 feed: one item per open alert, or one item per vessel's status if there are no alerts
- `GET /vessels.csv` — current vessels as a flat table (id, name, zone, status, speed, course, berth, terminal, risk)
- `GET /metrics.csv` — a real time series of port-wide KPIs, one row recorded every minute (starts empty and fills in as the server runs — that's expected)

Utility endpoints:
- `GET /raw/vessels` — unprocessed AIS-normalized fields, useful later for a 3D layer
- `GET /health` — current mode, connection status, tracked vessel count

## Run it

```
npm install
npm start
```

With no `.env` file, it starts immediately in simulated mode.

To switch to live data later: sign up free at `https://aisstream.io/authenticate`,
generate a key at `https://aisstream.io/apikeys`, copy `.env.example` to `.env`,
paste the key in, and restart.

## What's genuinely real vs. placeholder

- **Real**: vessel movement logic, zone/berth geometry math, and (once you add
  a key) actual AIS positions; weather is real live data from Open-Meteo.
- **Placeholder, clearly marked in the code**: berth "next vessel"/schedule
  (needs JNPA's own berth plan), pilot/tug/mooring status (not on the AIS
  broadcast), and the risk score (a simple stand-in rule, not a real model).
- **Illustrative, not navigational**: named zones and berth coordinates in
  `geo.js` are approximate points within the real JNPA bounding box for demo
  purposes — not authoritative chart or VTS data.

## What I verified vs. what needs a real network to confirm

Locally: vessels genuinely move between calls, all endpoints (JSON, RSS, CSV)
return correctly formatted output, parser unit tests pass, and the RSS/CSV
feeds were checked against valid RSS 2.0 / CSV syntax. I could not verify the
live aisstream.io connection or the live Open-Meteo call from this sandbox —
both correctly fall back to their designed states here, and should work once
hosted somewhere with normal internet access.
