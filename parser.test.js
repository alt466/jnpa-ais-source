'use strict';

const assert = require('node:assert');
const { createVesselStore } = require('../ais-parser');

// These three sample payloads are reproduced from aisstream.io's own published
// documentation (aisstream.io/documentation) so the parser is checked against
// their real message shape rather than a guessed one.

const POSITION_REPORT_SAMPLE = {
  MessageType: 'PositionReport',
  MetaData: {
    MMSI: 245473000,
    ShipName: 'TEST VESSEL',
    latitude: 51.44458833333333,
    longitude: 3.590816666666667,
    time_utc: '2022-12-29 18:22:32.318353 +0000 UTC'
  },
  Message: {
    PositionReport: {
      Cog: 0,
      CommunicationState: 59916,
      Latitude: 51.44458833333333,
      Longitude: 3.590816666666667,
      MessageID: 1,
      NavigationalStatus: 7,
      PositionAccuracy: true,
      Raim: true,
      RateOfTurn: 0,
      RepeatIndicator: 0,
      Sog: 0,
      Spare: 0,
      SpecialManoeuvreIndicator: 0,
      Timestamp: 12,
      TrueHeading: 17,
      UserID: 245473000,
      Valid: true
    }
  }
};

const SHIP_STATIC_DATA_SAMPLE = {
  MessageType: 'ShipStaticData',
  MetaData: {
    MMSI: 245473000,
    ShipName: 'TEST VESSEL',
    latitude: 51.44458833333333,
    longitude: 3.590816666666667,
    time_utc: '2022-12-29 18:25:01.000000 +0000 UTC'
  },
  Message: {
    ShipStaticData: {
      AisVersion: 2,
      CallSign: 'LBHF',
      Destination: 'JNPT@@@@@@@@@@@@@@@@',
      Dimension: { A: 20, B: 27, C: 7, D: 7 },
      Dte: false,
      Eta: { Day: 22, Hour: 9, Minute: 30, Month: 6 },
      FixType: 1,
      ImoNumber: 9353333,
      MaximumStaticDraught: 12.5,
      MessageID: 5,
      Name: 'TEST VESSEL',
      RepeatIndicator: 0,
      Spare: false,
      Type: 70,
      UserID: 245473000,
      Valid: true
    }
  }
};

function run() {
  const store = createVesselStore({ staleMs: 1000 });

  // 1. A position report alone should create a tracked vessel
  store.handleMessage(POSITION_REPORT_SAMPLE);
  let vessel = store.vessels.get(245473000);
  assert.ok(vessel, 'vessel should exist after PositionReport');
  assert.strictEqual(vessel.lat, 51.44458833333333);
  assert.strictEqual(vessel.navStatus, 'Fishing'); // code 7
  assert.strictEqual(vessel.name, 'TEST VESSEL');
  console.log('PASS: PositionReport creates and populates a vessel record');

  // 2. A later ShipStaticData message should merge in, not overwrite position
  store.handleMessage(SHIP_STATIC_DATA_SAMPLE);
  vessel = store.vessels.get(245473000);
  assert.strictEqual(vessel.imo, 9353333);
  assert.strictEqual(vessel.destination, 'JNPT'); // trailing @ padding stripped
  assert.strictEqual(vessel.eta, '06-22 09:30 UTC');
  assert.strictEqual(vessel.lat, 51.44458833333333, 'earlier position data must survive the merge');
  console.log('PASS: ShipStaticData merges identity/ETA without losing position');

  // 3. list() returns a plain array suitable for JSON serving
  const list = store.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].mmsi, 245473000);
  console.log('PASS: list() exposes one merged vessel record');

  // 4. Unrelated/garbage messages should not throw or create phantom vessels
  assert.strictEqual(store.handleMessage({}), null);
  assert.strictEqual(store.handleMessage({ MessageType: 'BaseStationReport', Message: { BaseStationReport: { UserID: 1 } } }), null);
  assert.strictEqual(store.vessels.size, 1, 'unrelated message types must not create vessel entries');
  console.log('PASS: non-vessel message types are ignored safely');

  // 5. Stale vessels get pruned
  const future = Date.now() + 5000;
  store.pruneStale(future);
  assert.strictEqual(store.vessels.size, 0, 'stale vessel should be pruned');
  console.log('PASS: stale vessels are pruned after the configured window');

  console.log('\nAll parser tests passed.');
}

run();
