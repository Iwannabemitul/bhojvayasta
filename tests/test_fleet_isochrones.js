/**
 * BhojVayasta - Test Suite: Multi-Courier Fleet Dispatch Simulation & Reachability Isochrones (R1 & R2)
 * File: tests/test_fleet_isochrones.js
 *
 * Verifies:
 * 1. Multi-Courier Fleet Orchestration & Isolated Instance State Machine (R1)
 * 2. Pre-Configured Multi-Corridor Fleet (Delhi/NCR & Punjab) Concurrent Waypoint Progression (R1)
 * 3. Dynamic Reachability Isochrone Geometry & Forward Geodesic Projection (R2)
 * 4. Ray-Casting Point-in-Polygon Engine & Recipient Shelter Reachability Classification (R2)
 * 5. Latitudinal Geofencing at 30.0°N & Demonstration Speed Multipliers (R1/R2)
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function describe(suiteName, fn) {
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN} SUITE: ${suiteName}${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}`);
  fn();
}

function it(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ${GREEN}[PASS]${RESET} ${testName}`);
  } catch (err) {
    failedTests++;
    console.log(`  ${RED}[FAIL]${RESET} ${testName}`);
    console.log(`         ${RED}Error: ${err.message}${RESET}`);
    failures.push({ test: testName, error: err.message, stack: err.stack });
  }
}

// Sandbox loader for js/transitSimulator.js
function loadTransitSimulatorModule() {
  const filePath = path.resolve(__dirname, '../js/transitSimulator.js');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Module file not found: ${filePath}`);
  }
  const code = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    console,
    Date,
    Math,
    String,
    Number,
    parseInt,
    parseFloat,
    JSON,
    Array,
    Object,
    Boolean,
    RegExp,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    module: { exports: {} },
    exports: {}
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.BhojTransitSimulator || sandbox.module.exports || sandbox.window.BhojTransitSimulator;
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

describe('1. Multi-Courier Fleet Orchestration & Instance Isolation (R1)', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Exposes CourierSimulator class, BhojIsochrone engine, and fleet controller', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    assert(typeof sim.CourierSimulator === 'function', 'CourierSimulator class must be exposed');
    assert(sim.BhojIsochrone && typeof sim.BhojIsochrone.computeIsochronePolygon === 'function', 'BhojIsochrone must be exposed');
    assert(sim.fleet && typeof sim.fleet.registerCourier === 'function', 'sim.fleet controller must be exposed');
  });

  it('Instantiates isolated courier instances without state cross-contamination', () => {
    const Courier = sim.CourierSimulator;
    const c1 = new Courier({
      id: 'CR-TEST-01',
      name: 'Test Courier 1',
      corridor: 'Delhi/NCR',
      speedKmH: 30,
      waypoints: [
        [28.6315, 77.2195],
        [28.6129, 77.2295]
      ]
    });

    const c2 = new Courier({
      id: 'CR-TEST-02',
      name: 'Test Courier 2',
      corridor: 'Punjab / Jalandhar / Phagwara',
      speedKmH: 45,
      waypoints: [
        [31.2554, 75.7050],
        [31.2580, 75.7020]
      ]
    });

    assert.notStrictEqual(c1.id, c2.id);
    assert.notStrictEqual(c1.totalDistanceKm, c2.totalDistanceKm);
    assert.strictEqual(c1.corridor, 'Delhi/NCR');
    assert.strictEqual(c2.corridor, 'Punjab / Jalandhar / Phagwara');

    // Step c1 only; c2 must remain at 0 km traveled
    c1.isRunning = true;
    c1.step(200);
    assert(c1.distanceTraveledKm > 0, 'c1 should have advanced distance');
    assert.strictEqual(c2.distanceTraveledKm, 0, 'c2 distance traveled must remain 0 when c1 steps');
  });

  it('Registers couriers into fleet and retrieves them by ID', () => {
    const fleet = sim.fleet;
    fleet.clearFleet();
    assert.strictEqual(fleet.getAllCouriers().length, 0);

    const c = fleet.registerCourier({
      id: 'CR-REG-01',
      name: 'Registered Courier',
      speedKmH: 40
    });

    assert.strictEqual(fleet.getAllCouriers().length, 1);
    const retrieved = fleet.getCourier('CR-REG-01');
    assert.strictEqual(retrieved.id, 'CR-REG-01');
    assert.strictEqual(retrieved.name, 'Registered Courier');
    assert.strictEqual(fleet.getCourier('NON_EXISTENT'), null);
  });
});

describe('2. Preset Multi-Corridor Fleet & Concurrent Route Dispatch (R1)', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Pre-configures at least 4 concurrent couriers across Delhi/NCR and Punjab corridors', () => {
    const fleet = sim.fleet;
    const couriers = fleet.loadPresetFleet();
    assert(Array.isArray(couriers), 'loadPresetFleet must return an array');
    assert(couriers.length >= 4, `Preset fleet must contain at least 4 couriers, got ${couriers.length}`);

    const delhiCouriers = couriers.filter(c => c.corridor === 'Delhi/NCR');
    const punjabCouriers = couriers.filter(c => c.corridor.includes('Punjab'));
    assert(delhiCouriers.length >= 2, `Must have >= 2 Delhi couriers, found ${delhiCouriers.length}`);
    assert(punjabCouriers.length >= 2, `Must have >= 2 Punjab couriers, found ${punjabCouriers.length}`);

    // Verify expected courier IDs and names
    const ids = couriers.map(c => c.id);
    assert(ids.includes('CR-DEL-01'), 'CR-DEL-01 must be registered');
    assert(ids.includes('CR-DEL-02'), 'CR-DEL-02 must be registered');
    assert(ids.includes('CR-PUN-01'), 'CR-PUN-01 must be registered');
    assert(ids.includes('CR-PUN-02'), 'CR-PUN-02 must be registered');
  });

  it('Starts and pauses all couriers simultaneously with speed multipliers', () => {
    const fleet = sim.fleet;
    fleet.loadPresetFleet();

    fleet.startAll(5);
    assert.strictEqual(fleet.isFleetRunning, true);
    assert.strictEqual(fleet.isFleetPaused, false);
    assert.strictEqual(fleet.speedMultiplier, 5);

    fleet.getAllCouriers().forEach(c => {
      assert.strictEqual(c.isRunning, true, `Courier ${c.id} should be running`);
      assert.strictEqual(c.isPaused, false, `Courier ${c.id} should not be paused`);
      assert.strictEqual(c.speedMultiplier, 5);
    });

    fleet.pauseAll();
    assert.strictEqual(fleet.isFleetPaused, true);
    fleet.getAllCouriers().forEach(c => {
      assert.strictEqual(c.isPaused, true, `Courier ${c.id} should be paused`);
    });

    fleet.resumeAll();
    assert.strictEqual(fleet.isFleetPaused, false);

    fleet.stopAll();
    assert.strictEqual(fleet.isFleetRunning, false);
    assert.strictEqual(fleet.isFleetPaused, false);
    fleet.getAllCouriers().forEach(c => {
      assert.strictEqual(c.isRunning, false);
    });
  });

  it('Simulates concurrent fleet step execution with monotonic distance advance', () => {
    const fleet = sim.fleet;
    fleet.loadPresetFleet();
    fleet.startAll(10);

    const initialTelemetry = fleet.getFleetTelemetry();
    assert.strictEqual(initialTelemetry.length, 4);

    // Perform simulated ticks
    for (let i = 0; i < 5; i++) {
      fleet.stepFleet(100);
    }

    const advancedTelemetry = fleet.getFleetTelemetry();
    for (let i = 0; i < advancedTelemetry.length; i++) {
      const prev = initialTelemetry[i];
      const curr = advancedTelemetry[i];
      assert(curr.progressPercent >= prev.progressPercent, `Courier ${curr.id} progress must increase`);
      assert(curr.distanceRemainingKm <= prev.distanceRemainingKm, `Courier ${curr.id} remaining dist must decrease`);
      assert.strictEqual(typeof curr.heading, 'number');
      assert(!isNaN(curr.heading), `Heading must be numeric`);
    }

    fleet.stopAll();
  });
});

describe('3. Dynamic Reachability Isochrone Geometry Math (R2)', () => {
  let isochrone;
  try {
    const sim = loadTransitSimulatorModule();
    isochrone = sim.BhojIsochrone;
  } catch (e) {}

  it('Generates exact 24-point closed coordinate polygons for given center and horizon', () => {
    assert(isochrone, 'BhojIsochrone must be loaded');
    const center = [28.6315, 77.2195]; // Connaught Place
    const poly15 = isochrone.computeIsochronePolygon(center, 15, 35, 90);

    assert(Array.isArray(poly15), 'Isochrone must return an array of coordinates');
    assert.strictEqual(poly15.length, 24, `Isochrone polygon must have exactly 24 vertices, got ${poly15.length}`);

    poly15.forEach((vertex, idx) => {
      assert(Array.isArray(vertex) && vertex.length === 2, `Vertex ${idx} must be a [lat, lng] pair`);
      assert(!isNaN(vertex[0]) && !isNaN(vertex[1]), `Vertex ${idx} coordinates must not be NaN`);
      // Coordinates should remain within reasonable regional bounds (Delhi/NCR)
      assert(vertex[0] > 28.0 && vertex[0] < 29.5, `Vertex ${idx} lat ${vertex[0]} out of expected range`);
      assert(vertex[1] > 76.5 && vertex[1] < 78.0, `Vertex ${idx} lng ${vertex[1]} out of expected range`);
    });
  });

  it('Scales polygon radius proportionally with time budget (30-min > 15-min)', () => {
    const center = [28.6315, 77.2195];
    const dual = isochrone.computeDualIsochrones(center, 40, 0);

    assert(dual.polygon15 && dual.polygon30, 'computeDualIsochrones must return both polygon15 and polygon30');
    assert.strictEqual(dual.polygon15.length, 24);
    assert.strictEqual(dual.polygon30.length, 24);

    // Compute approximate radial spans
    const sim = loadTransitSimulatorModule();
    const dist15 = sim.calculateDistance(center, dual.polygon15[0]);
    const dist30 = sim.calculateDistance(center, dual.polygon30[0]);

    assert(dist30 > dist15, `30-minute reach (${dist30} km) must be strictly greater than 15-minute reach (${dist15} km)`);
    // Nominal ratio should be ~2.0
    const ratio = dist30 / dist15;
    assert(Math.abs(ratio - 2.0) < 0.2, `30-min to 15-min ratio should be ~2.0, got ${ratio.toFixed(2)}`);
  });

  it('Applies forward directional velocity elongation along vehicle heading vector', () => {
    const sim = loadTransitSimulatorModule();
    const center = [31.2554, 75.7050]; // LPU GT Road
    const headingEast = 90; // Vehicle moving East
    const poly = isochrone.computeIsochronePolygon(center, 15, 45, headingEast);

    // East vertex corresponds to i = 6 in a 24-point circle (6/24 * 360 = 90 deg)
    // West vertex corresponds to i = 18 (18/24 * 360 = 270 deg)
    const vertexEast = poly[6];
    const vertexWest = poly[18];

    const distForward = sim.calculateDistance(center, vertexEast);
    const distBackward = sim.calculateDistance(center, vertexWest);

    assert(distForward > distBackward,
      `Forward reach along heading (${distForward.toFixed(2)} km) must exceed backward reach (${distBackward.toFixed(2)} km)`);
  });
});

describe('4. Ray-Casting Point-in-Polygon Engine & Shelter Reachability (R2)', () => {
  let isochrone;
  let sim;
  try {
    sim = loadTransitSimulatorModule();
    isochrone = sim.BhojIsochrone;
  } catch (e) {}

  it('Classifies center coordinate and nearby points as INSIDE isochrone polygon', () => {
    const center = [28.6315, 77.2195];
    const poly15 = isochrone.computeIsochronePolygon(center, 15, 35, 0);

    // The center itself must be inside
    const isCenterInside = isochrone.isPointInPolygon(center, poly15);
    assert.strictEqual(isCenterInside, true, 'Center coordinate must be inside its own isochrone polygon');

    // A point 1 km away must be inside a 15-min (approx 5-7 km) polygon
    const nearbyPoint = [28.6350, 77.2220];
    const isNearbyInside = isochrone.isPointInPolygon(nearbyPoint, poly15);
    assert.strictEqual(isNearbyInside, true, 'Nearby point (1 km away) must be inside 15-min polygon');
  });

  it('Classifies distant points (outside safe transit window) as OUTSIDE isochrone polygon', () => {
    const center = [28.6315, 77.2195]; // Delhi
    const poly15 = isochrone.computeIsochronePolygon(center, 15, 35, 0);

    // Mumbai coordinate: thousands of km away
    const distantPoint = [19.0760, 72.8777];
    const isDistantInside = isochrone.isPointInPolygon(distantPoint, poly15);
    assert.strictEqual(isDistantInside, false, 'Distant point (Mumbai) must be strictly outside Delhi isochrone');

    // Point 25 km away in Delhi outskirts should be outside 15-min polygon
    const farPoint = [28.8500, 77.2195];
    const isFarInside = isochrone.isPointInPolygon(farPoint, poly15);
    assert.strictEqual(isFarInside, false, 'Point 25 km away should be outside 15-minute reachability');
  });

  it('Evaluates real recipient shelter reachability against 15-min and 30-min thresholds', () => {
    // Delhi courier at Connaught Place [28.6280, 77.2190]
    const courierPos = [28.6280, 77.2190];
    const dual = isochrone.computeDualIsochrones(courierPos, 35, 45);

    // Asha Shelter SH-01 (Daryaganj: [28.6420, 77.2405] is ~2.8 km away)
    const ashaShelter = [28.6420, 77.2405];
    const in15Min = isochrone.isPointInPolygon(ashaShelter, dual.polygon15);
    const in30Min = isochrone.isPointInPolygon(ashaShelter, dual.polygon30);
    assert.strictEqual(in15Min, true, 'Asha Shelter (2.8 km away) must be within 15-min safe thermal window');
    assert.strictEqual(in30Min, true, 'Asha Shelter must also be within 30-min window');

    // Samarpan Elders Home SH-04 (Rohini: [28.7150, 77.1210] is ~14 km away)
    const samarpanShelter = [28.7150, 77.1210];
    const samarpan15 = isochrone.isPointInPolygon(samarpanShelter, dual.polygon15);
    const samarpan30 = isochrone.isPointInPolygon(samarpanShelter, dual.polygon30);
    assert.strictEqual(samarpan15, false, 'Samarpan Shelter (14 km away) must be outside 15-min urgent window');
    assert.strictEqual(typeof samarpan30, 'boolean', '30-min query must return valid boolean');
  });
});

describe('5. Dual-Corridor Geofencing & Fleet Boundary Resilience (R1/R2)', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Strictly isolates Delhi/NCR (<30.0°N) and Punjab (>=30.0°N) corridor waypoint coordinates', () => {
    const fleet = sim.fleet;
    const couriers = fleet.loadPresetFleet();

    couriers.forEach(courier => {
      courier.waypoints.forEach((wp, idx) => {
        const lat = wp[0];
        if (courier.corridor === 'Delhi/NCR') {
          assert(lat < 30.0,
            `Delhi courier ${courier.id} waypoint ${idx} lat (${lat}) must be < 30.0°N`);
        } else {
          assert(lat >= 30.0,
            `Punjab courier ${courier.id} waypoint ${idx} lat (${lat}) must be >= 30.0°N`);
        }
      });
    });
  });

  it('Includes live isochrones inside fleet telemetry output', () => {
    const fleet = sim.fleet;
    fleet.loadPresetFleet();
    const telemetry = fleet.getFleetTelemetry();

    assert(Array.isArray(telemetry) && telemetry.length === 4);
    telemetry.forEach(t => {
      assert(t.isochrones, `Courier ${t.id} telemetry must contain isochrones`);
      assert(Array.isArray(t.isochrones.polygon15), `Courier ${t.id} must have polygon15`);
      assert.strictEqual(t.isochrones.polygon15.length, 24);
      assert(Array.isArray(t.isochrones.polygon30), `Courier ${t.id} must have polygon30`);
      assert.strictEqual(t.isochrones.polygon30.length, 24);
    });
  });
});

describe('6. Speed Multipliers, Boundary Robustness & Fleet Arrival Callbacks', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Clamps negative, zero, or non-numeric fleet speed multipliers to minimum 1x', () => {
    const fleet = sim.fleet;
    fleet.loadPresetFleet();

    fleet.startAll(-10);
    assert.strictEqual(fleet.speedMultiplier, 1, 'Negative fleet speed must clamp to 1x');
    fleet.stopAll();

    fleet.startAll(0);
    assert.strictEqual(fleet.speedMultiplier, 1, 'Zero fleet speed must clamp to 1x');
    fleet.stopAll();

    fleet.startAll('maximum-speed');
    assert.strictEqual(fleet.speedMultiplier, 1, 'Non-numeric fleet speed must clamp to 1x');
    fleet.stopAll();
  });

  it('Gracefully handles empty or degenerate coordinate arrays in BhojIsochrone', () => {
    const isochrone = sim.BhojIsochrone;
    const res1 = isochrone.computeIsochronePolygon(null, 15, 30, 0);
    assert(Array.isArray(res1) && res1.length === 0, 'null center must return empty array');

    const res2 = isochrone.computeIsochronePolygon([], 15, 30, 0);
    assert(Array.isArray(res2) && res2.length === 0, 'empty center must return empty array');

    const res3 = isochrone.computeIsochronePolygon([NaN, 77.2], 15, 30, 0);
    assert(Array.isArray(res3) && res3.length === 0, 'NaN coord must return empty array');

    assert.strictEqual(isochrone.isPointInPolygon(null, []), false);
    assert.strictEqual(isochrone.isPointInPolygon([28.6, 77.2], null), false);
    assert.strictEqual(isochrone.isPointInPolygon([28.6, 77.2], [[28.6, 77.2]]), false);
  });

  it('Fires fleet-wide arrival callbacks when individual couriers reach their destinations', () => {
    const fleet = sim.fleet;
    fleet.loadPresetFleet();

    const arrivedCouriers = [];
    fleet.onFleetArrival((courier, finalState) => {
      arrivedCouriers.push({ id: courier.id, state: finalState });
    });

    const harpreet = fleet.getCourier('CR-PUN-02');
    assert(harpreet, 'CR-PUN-02 must exist');
    harpreet.completeRoute();

    assert.strictEqual(arrivedCouriers.length, 1);
    assert.strictEqual(arrivedCouriers[0].id, 'CR-PUN-02');
    assert.strictEqual(arrivedCouriers[0].state.progressPercent, 100);
    assert.strictEqual(arrivedCouriers[0].state.isRunning, false);
  });

  it('Preserves 100% backward compatibility on BhojTransitSimulator singleton during fleet operations', () => {
    assert(typeof sim.loadRoute === 'function');
    assert(typeof sim.start === 'function');
    assert(typeof sim.pause === 'function');
    assert(typeof sim.stop === 'function');
    assert(typeof sim.getState === 'function');

    const state = sim.getState();
    assert.strictEqual(typeof state.isRunning, 'boolean');
    assert.strictEqual(typeof state.progressPercent, 'number');
  });
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
setTimeout(() => {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD} ENHANCEMENT R1 & R2 TEST SUMMARY: FLEET SIMULATION & ISOCHRONES${RESET}`);
  console.log(`${BOLD}================================================================${RESET}`);
  console.log(`Total Assertions Run : ${totalTests}`);
  console.log(`Passed Assertions    : ${GREEN}${passedTests}${RESET}`);
  console.log(`Failed Assertions    : ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);

  if (failures.length > 0) {
    console.log(`\n${BOLD}${YELLOW}FAILURES LOG:${RESET}`);
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [FAIL] ${f.test}: ${f.error}`);
    });
  }

  const exitCode = failedTests === 0 ? 0 : 1;
  console.log(`\n${BOLD}SUITE EXIT CODE: ${exitCode === 0 ? GREEN + '0 (PASS)' : RED + '1 (FAIL)'}${RESET}\n`);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
  if (require.main === module) {
    process.exit(exitCode);
  }
}, 100);
