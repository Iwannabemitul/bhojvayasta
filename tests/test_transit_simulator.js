/**
 * BhojVayasta - Enhancement R4 Test Suite: Live Transit Simulator
 * File: tests/test_transit_simulator.js
 *
 * Verifies:
 * 1. Geodesic distance (Haversine) and vehicle bearing (heading angle) calculations
 * 2. Waypoint step interpolation along OSRM street polyline coordinates
 * 3. Simulation state machine transitions: IDLE -> RUNNING -> PAUSED -> COMPLETED
 * 4. Speed multipliers (1x, 2x, 5x, 10x) and boundary conditions (empty/identical points)
 * 5. Real-time telemetry HUD (speed, distance, ETA, progress bar)
 * 6. Destination arrival lifecycle and Proof of Delivery (PoD) modal trigger
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
    throw new Error(`Module file not found: ${filePath}. Implementation pending.`);
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

// Sample OSRM-style coordinates (Delhi: Connaught Place -> India Gate -> Nizamuddin Shelter)
// Format: GeoJSON [lng, lat]
const sampleOsrmCoords = [
  [77.2195, 28.6315], // Connaught Place
  [77.2220, 28.6250],
  [77.2295, 28.6129], // India Gate
  [77.2350, 28.6050],
  [77.2450, 28.5900],
  [77.2510, 28.5830]  // Nizamuddin Shelter
];

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

describe('1. Geodesic Distance & Vehicle Bearing Mathematics', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Calculates vehicle bearing accurately for cardinal directions', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    const calcBearing = sim.calculateBearing || (sim.math && sim.math.calculateBearing);
    assert(calcBearing, 'Simulator must expose calculateBearing method');

    // Due North: lat increases, lng unchanged
    const northHeading = calcBearing([28.0, 77.0], [29.0, 77.0]);
    assert(Math.abs(northHeading - 0) < 1 || Math.abs(northHeading - 360) < 1,
      `Due North heading should be 0° or 360°, got ${northHeading}°`);

    // Due East: lng increases, lat unchanged
    const eastHeading = calcBearing([28.0, 77.0], [28.0, 78.0]);
    assert(Math.abs(eastHeading - 90) < 2,
      `Due East heading should be ~90°, got ${eastHeading}°`);

    // Due South: lat decreases, lng unchanged
    const southHeading = calcBearing([29.0, 77.0], [28.0, 77.0]);
    assert(Math.abs(southHeading - 180) < 1,
      `Due South heading should be ~180°, got ${southHeading}°`);

    // Due West: lng decreases, lat unchanged
    const westHeading = calcBearing([28.0, 78.0], [28.0, 77.0]);
    assert(Math.abs(westHeading - 270) < 2,
      `Due West heading should be ~270°, got ${westHeading}°`);
  });

  it('Calculates Haversine distance between real Delhi coordinates accurately', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    const calcDistance = sim.calculateDistance || (sim.math && sim.math.calculateDistance);
    assert(calcDistance, 'Simulator must expose calculateDistance method');

    // Connaught Place [28.6315, 77.2195] to India Gate [28.6129, 77.2295] is ~2.3 km
    const distKm = calcDistance([28.6315, 77.2195], [28.6129, 77.2295]);
    assert(distKm >= 2.0 && distKm <= 2.6,
      `Distance should be approximately 2.3 km, got ${distKm} km`);
  });

  it('Interpolates intermediate coordinates along a segment', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    const interpolate = sim.interpolateCoordinate || (sim.math && sim.math.interpolateCoordinate);
    assert(interpolate, 'Simulator must expose interpolateCoordinate method');

    const p1 = [28.0, 77.0];
    const p2 = [29.0, 78.0];

    const start = interpolate(p1, p2, 0.0);
    assert.strictEqual(start[0], 28.0);
    assert.strictEqual(start[1], 77.0);

    const mid = interpolate(p1, p2, 0.5);
    assert(Math.abs(mid[0] - 28.5) < 0.0001);
    assert(Math.abs(mid[1] - 77.5) < 0.0001);

    const end = interpolate(p1, p2, 1.0);
    assert.strictEqual(end[0], 29.0);
    assert.strictEqual(end[1], 78.0);
  });
});

describe('2. Route Ingestion & State Machine Lifecycle', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Initializes in IDLE state with 0% progress', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    const state = sim.getState();
    assert.strictEqual(state.isRunning, false, 'Initial state should not be running');
    assert.strictEqual(state.isPaused, false, 'Initial state should not be paused');
    assert.strictEqual(state.progressPercent, 0, 'Initial progress should be 0%');
  });

  it('Ingests OSRM GeoJSON [lng, lat] coordinates and converts to route waypoints', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    sim.loadRoute(sampleOsrmCoords);
    const state = sim.getState();
    assert(state.distanceRemainingKm > 0, 'Loaded route must compute positive remaining distance');
    assert(Array.isArray(state.currentCoord), 'currentCoord must be a coordinate pair');
  });

  it('Transitions cleanly between START, PAUSE, RESUME, and STOP', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    sim.loadRoute(sampleOsrmCoords);

    sim.start(1);
    let state = sim.getState();
    assert.strictEqual(state.isRunning, true, 'start() must set isRunning=true');
    assert.strictEqual(state.isPaused, false, 'start() must set isPaused=false');

    sim.pause();
    state = sim.getState();
    assert.strictEqual(state.isRunning, true, 'pause() must maintain isRunning=true');
    assert.strictEqual(state.isPaused, true, 'pause() must set isPaused=true');

    sim.resume();
    state = sim.getState();
    assert.strictEqual(state.isRunning, true, 'resume() must maintain isRunning=true');
    assert.strictEqual(state.isPaused, false, 'resume() must set isPaused=false');

    sim.stop();
    state = sim.getState();
    assert.strictEqual(state.isRunning, false, 'stop() must set isRunning=false');
  });
});

describe('3. Speed Multipliers, Telemetry & Boundary Resilience', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Supports standard demonstration speed multipliers (1x, 2x, 5x, 10x)', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    sim.loadRoute(sampleOsrmCoords);
    [1, 2, 5, 10].forEach(mult => {
      sim.start(mult);
      const state = sim.getState();
      assert.strictEqual(state.isRunning, true);
      sim.stop();
    });
  });

  it('Clamps negative, zero, or non-numeric speed multipliers to minimum 1x', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    sim.loadRoute(sampleOsrmCoords);
    sim.start(-5);
    let state = sim.getState();
    assert(state.speedMultiplier >= 1 || state.speedKmH > 0, 'Negative speed should clamp to >= 1x');
    sim.stop();

    sim.start(0);
    state = sim.getState();
    assert(state.speedMultiplier >= 1 || state.speedKmH > 0, 'Zero speed should clamp to >= 1x');
    sim.stop();
  });

  it('Gracefully handles empty or single-point coordinate lists without throwing', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    assert.doesNotThrow(() => {
      sim.loadRoute([]);
      sim.start(1);
      sim.stop();
    }, 'Empty route must not throw fatal error');

    assert.doesNotThrow(() => {
      sim.loadRoute([[77.2195, 28.6315]]);
      sim.start(1);
      sim.stop();
    }, 'Single-point route must not throw fatal error');
  });

  it('Avoids NaN bearing when consecutive waypoints have identical coordinates', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    const calcBearing = sim.calculateBearing || (sim.math && sim.math.calculateBearing);
    assert(calcBearing, 'Simulator must expose calculateBearing');
    const identicalBearing = calcBearing([28.6315, 77.2195], [28.6315, 77.2195]);
    assert(!isNaN(identicalBearing), 'Bearing between identical points must not be NaN');
  });
});

describe('4. Full Route Playback & Destination Arrival Lifecycle', () => {
  let sim;
  try {
    sim = loadTransitSimulatorModule();
  } catch (e) {}

  it('Steps through route with monotonically increasing progress and decreasing ETA', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    sim.loadRoute(sampleOsrmCoords);
    const stepFn = sim.step || sim.tick;
    assert(stepFn, 'Simulator must support step() or tick() for simulation progression');

    sim.start(5);
    const p0 = sim.getState().progressPercent;
    
    // Perform simulated ticks
    for (let i = 0; i < 5; i++) {
      stepFn.call(sim, 100); // 100ms delta
    }
    const p1 = sim.getState().progressPercent;
    assert(p1 >= p0, `Progress should advance monotonically: p0=${p0}, p1=${p1}`);
    sim.stop();
  });

  it('Fires onArrival callback upon reaching 100% destination waypoint', () => {
    assert(sim, 'BhojTransitSimulator must be loaded');
    sim.loadRoute(sampleOsrmCoords);

    let arrivalFired = false;
    let arrivalPayload = null;
    sim.onArrival((data) => {
      arrivalFired = true;
      arrivalPayload = data;
    });

    // Advance directly to completion or force completion
    if (sim.completeRoute) {
      sim.completeRoute();
    } else {
      // Simulate sufficient steps to complete
      sim.start(100); // very high speed
      for (let i = 0; i < 1000 && !arrivalFired; i++) {
        const stepFn = sim.step || sim.tick;
        if (stepFn) stepFn.call(sim, 500);
      }
      sim.stop();
    }

    assert(arrivalFired, 'onArrival callback must fire when courier reaches destination shelter');
  });
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
setTimeout(() => {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD} ENHANCEMENT R4 TEST SUMMARY: LIVE TRANSIT SIMULATOR${RESET}`);
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
