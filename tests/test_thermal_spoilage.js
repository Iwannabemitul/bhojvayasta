/**
 * BhojVayasta - Enhancement R1 Test Suite: FSSAI Thermal Spoilage Decay Model (T2.4)
 * File: tests/test_thermal_spoilage.js
 *
 * Verifies:
 * 1. FSSAI Temperature Danger Zone categorization (5°C to 60°C)
 * 2. Arrhenius / biological thermal decay kinetic rate multipliers
 * 3. Dynamic non-linear remaining shelf life & Freshness Index calculations
 * 4. Boundary temperatures, string parsing, and NaN/null resilience
 * 5. Delhi summer wedding banquet & cold chain transit failure scenarios
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

// Sandbox loader for js/foodSafety.js & js/store.js
function loadFoodSafetyModule() {
  const filePath = path.resolve(__dirname, '../js/foodSafety.js');
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
    module: { exports: {} },
    exports: {}
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.BhojSafety || sandbox.module.exports || sandbox.window.BhojSafety;
}

function loadStoreWithSafety() {
  const safety = loadFoodSafetyModule();
  const storeFilePath = path.resolve(__dirname, '../js/store.js');
  const storeCode = fs.readFileSync(storeFilePath, 'utf8');
  const mockStorage = {};
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Date,
    Math,
    String,
    Number,
    parseInt,
    parseFloat,
    JSON,
    Set,
    Array,
    Object,
    Boolean,
    RegExp,
    BhojSafety: safety,
    localStorage: {
      getItem: (k) => mockStorage[k] || null,
      setItem: (k, v) => { mockStorage[k] = String(v); },
      removeItem: (k) => { delete mockStorage[k]; },
      clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
    },
    module: { exports: {} },
    exports: {}
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(storeCode, sandbox);
  return sandbox.BhojStore || sandbox.window.BhojStore;
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

describe('1. FSSAI Danger Zone Classification (5°C to 60°C)', () => {
  let safety;
  try {
    safety = loadFoodSafetyModule();
  } catch (e) {
    // Will fail all tests in suite cleanly with descriptive error
  }

  it('Classifies chilled temperatures (<= 5°C) as Safe Cold', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(0), 'Safe Cold');
    assert.strictEqual(safety.getDangerZoneCategory(2), 'Safe Cold');
    assert.strictEqual(safety.getDangerZoneCategory(4), 'Safe Cold');
    assert.strictEqual(safety.getDangerZoneCategory(5), 'Safe Cold');
  });

  it('Classifies low danger temperatures (5°C < T < 20°C) as Danger Zone Low', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(6), 'Danger Zone Low');
    assert.strictEqual(safety.getDangerZoneCategory(12), 'Danger Zone Low');
    assert.strictEqual(safety.getDangerZoneCategory(19.9), 'Danger Zone Low');
  });

  it('Classifies critical danger temperatures (20°C <= T <= 50°C) as Danger Zone Peak', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(20), 'Danger Zone Peak');
    assert.strictEqual(safety.getDangerZoneCategory(37), 'Danger Zone Peak');
    assert.strictEqual(safety.getDangerZoneCategory(45), 'Danger Zone Peak');
    assert.strictEqual(safety.getDangerZoneCategory(50), 'Danger Zone Peak');
  });

  it('Classifies temperatures approaching hot safe (50°C < T < 60°C) as Approaching Hot Safe', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(52), 'Approaching Hot Safe');
    assert.strictEqual(safety.getDangerZoneCategory(58), 'Approaching Hot Safe');
    assert.strictEqual(safety.getDangerZoneCategory(59.9), 'Approaching Hot Safe');
  });

  it('Classifies safe hot holding temperatures (>= 60°C) as Safe Hot', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(60), 'Safe Hot');
    assert.strictEqual(safety.getDangerZoneCategory(65), 'Safe Hot');
    assert.strictEqual(safety.getDangerZoneCategory(80), 'Safe Hot');
  });
});

describe('2. Arrhenius Reaction Multiplier & Thermal Decay Kinetics', () => {
  let safety;
  try {
    safety = loadFoodSafetyModule();
  } catch (e) {}

  it('Returns baseline 1.0x multiplier for safe cold (<= 5°C) and safe hot (>= 60°C)', () => {
    assert(safety, 'BhojSafety module must be loaded');
    const getMultiplier = safety.calculateArrheniusMultiplier || safety.calculateThermalDecay;
    assert.strictEqual(getMultiplier(4), 1.0);
    assert.strictEqual(getMultiplier(5), 1.0);
    assert.strictEqual(getMultiplier(60), 1.0);
    assert.strictEqual(getMultiplier(70), 1.0);
  });

  it('Returns accelerated multiplier (> 2.5x and <= 4.5x) near human body / summer peak (35°C - 42°C)', () => {
    assert(safety, 'BhojSafety module must be loaded');
    const getMultiplier = safety.calculateArrheniusMultiplier || safety.calculateThermalDecay;
    const mult38 = getMultiplier(38);
    assert(mult38 >= 3.0 && mult38 <= 4.5, `Multiplier at 38°C should be ~4.2x, got ${mult38}`);
    const mult25 = getMultiplier(25);
    assert(mult25 >= 1.5 && mult25 < mult38, `Multiplier at 25°C (${mult25}) should be less than at 38°C (${mult38})`);
  });

  it('Simulates decay curve with monotonic freshness decline and pathogen growth', () => {
    assert(safety, 'BhojSafety module must be loaded');
    const dispatch = {
      foodType: 'Cooked Meals',
      servings: 100,
      createdAt: new Date().toISOString(),
      shelfLifeHours: 4
    };
    const profile = [
      { tempC: 38, durationMinutes: 30 },
      { tempC: 40, durationMinutes: 30 },
      { tempC: 35, durationMinutes: 30 }
    ];
    const curve = safety.simulateDecayCurve(dispatch, profile);
    assert(Array.isArray(curve), 'Decay curve must return an array of time points');
    assert(curve.length >= 3, 'Decay curve must contain step points');
    
    // Check monotonic decrease of freshness index
    for (let i = 1; i < curve.length; i++) {
      assert(curve[i].freshnessIndex <= curve[i - 1].freshnessIndex, 
        `Freshness index must decrease monotonically: point ${i} (${curve[i].freshnessIndex}) > point ${i-1} (${curve[i-1].freshnessIndex})`);
      assert(curve[i].pathogenDensity >= curve[i - 1].pathogenDensity,
        `Pathogen density must increase monotonically: point ${i} < point ${i-1}`);
    }
  });
});

describe('3. Dynamic Shelf-Life & Freshness Index Formulation', () => {
  let safety;
  try {
    safety = loadFoodSafetyModule();
  } catch (e) {}

  it('Calculates non-linear shelf life reduction under high ambient temperatures', () => {
    assert(safety, 'BhojSafety module must be loaded');
    const now = Date.now();
    const dispatch = {
      foodType: 'Cooked Meals',
      createdAt: new Date(now - 60 * 60 * 1000).toISOString(), // 1 hour ago
      expiryTime: new Date(now + 3 * 60 * 60 * 1000).toISOString(), // 3 hours left nominal
      shelfLifeHours: 4
    };
    // In safe cold holding (4°C, multiplier 1.0): ~180 min left
    const coldResult = safety.calculateDynamicShelfLife(dispatch, 4, now);
    // In peak danger zone (38°C, multiplier ~4.2): shelf life drops severely
    const hotResult = safety.calculateDynamicShelfLife(dispatch, 38, now);

    assert(hotResult.remainingMinutes < coldResult.remainingMinutes,
      `Hot ambient temp must yield fewer remaining minutes (${hotResult.remainingMinutes}) than cold (${coldResult.remainingMinutes})`);
    assert(hotResult.freshnessIndex < coldResult.freshnessIndex,
      `Freshness index at 38°C (${hotResult.freshnessIndex}%) must be lower than at 4°C (${coldResult.freshnessIndex}%)`);
  });

  it('Freshness Index scales between 0% and 100%', () => {
    assert(safety, 'BhojSafety module must be loaded');
    const now = Date.now();
    const freshDispatch = {
      foodType: 'Cooked Meals',
      createdAt: new Date(now).toISOString(),
      expiryTime: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
      shelfLifeHours: 4
    };
    const freshResult = safety.calculateDynamicShelfLife(freshDispatch, 4, now);
    assert(freshResult.freshnessIndex >= 95 && freshResult.freshnessIndex <= 100,
      `Brand new dispatch should have ~100% freshness, got ${freshResult.freshnessIndex}%`);
  });

  it('Sets isUrgent = true when adjusted remaining shelf life <= 120 minutes', () => {
    assert(safety, 'BhojSafety module must be loaded');
    const now = Date.now();
    const urgentDispatch = {
      foodType: 'Cooked Meals',
      createdAt: new Date(now - 150 * 60 * 1000).toISOString(),
      expiryTime: new Date(now + 90 * 60 * 1000).toISOString(), // nominal 90 min
      shelfLifeHours: 4
    };
    const result = safety.calculateDynamicShelfLife(urgentDispatch, 30, now);
    assert.strictEqual(result.isUrgent, true, 'Dispatch with <= 120 min safe remaining must have isUrgent=true');
  });

  it('Sets isExpired = true and clamps remaining minutes to 0 when past viability', () => {
    assert(safety, 'BhojSafety module must be loaded');
    const now = Date.now();
    const expiredDispatch = {
      foodType: 'Cooked Meals',
      createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      expiryTime: new Date(now - 1 * 60 * 60 * 1000).toISOString(), // expired 1 hour ago
      shelfLifeHours: 4
    };
    const result = safety.calculateDynamicShelfLife(expiredDispatch, 35, now);
    assert.strictEqual(result.isExpired, true);
    assert.strictEqual(result.remainingMinutes, 0);
    assert.strictEqual(result.freshnessIndex, 0);
    assert(result.formattedText.toLowerCase().includes('expired'));
  });
});

describe('4. Boundary Values, Temperature Parsing & Dirty Input Resilience', () => {
  let safety;
  try {
    safety = loadFoodSafetyModule();
  } catch (e) {}

  it('Evaluates boundary at exactly 5.0°C (Safe Cold) vs 5.1°C (Danger Zone Low)', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(5.0), 'Safe Cold');
    assert.strictEqual(safety.getDangerZoneCategory(5.1), 'Danger Zone Low');
  });

  it('Evaluates boundary at exactly 60.0°C (Safe Hot) vs 59.9°C (Approaching Hot Safe)', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(60.0), 'Safe Hot');
    assert.strictEqual(safety.getDangerZoneCategory(59.9), 'Approaching Hot Safe');
  });

  it('Strips units and parses messy string temperature inputs like "68°C" or " 4 °C "', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory("68°C"), 'Safe Hot');
    assert.strictEqual(safety.getDangerZoneCategory(" 4 °C "), 'Safe Cold');
    assert.strictEqual(safety.getDangerZoneCategory("37 C"), 'Danger Zone Peak');
  });

  it('Gracefully handles NaN, null, undefined, or empty string by defaulting to room ambient (25°C)', () => {
    assert(safety, 'BhojSafety module must be loaded');
    // None should throw exception; should fallback to ambient 25°C (Danger Zone Peak)
    assert.strictEqual(safety.getDangerZoneCategory(null), 'Danger Zone Peak');
    assert.strictEqual(safety.getDangerZoneCategory(undefined), 'Danger Zone Peak');
    assert.strictEqual(safety.getDangerZoneCategory(''), 'Danger Zone Peak');
    assert.strictEqual(safety.getDangerZoneCategory('NotATemp'), 'Danger Zone Peak');
  });

  it('Clamps extreme negative and boiling temperatures without numerical overflow', () => {
    assert(safety, 'BhojSafety module must be loaded');
    assert.strictEqual(safety.getDangerZoneCategory(-20), 'Safe Cold');
    assert.strictEqual(safety.getDangerZoneCategory(150), 'Safe Hot');
    const getMultiplier = safety.calculateArrheniusMultiplier || safety.calculateThermalDecay;
    assert.strictEqual(getMultiplier(-10), 1.0);
    assert.strictEqual(getMultiplier(120), 1.0);
  });
});

describe('5. Real-World Civic Logistics Scenarios', () => {
  let safety;
  try {
    safety = loadFoodSafetyModule();
  } catch (e) {}

  it('Scenario 1: Delhi Summer Wedding Banquet (42°C Ambient Exposure)', () => {
    assert(safety, 'BhojSafety module must be loaded');
    // 200 servings of hot cooked biryani prepared at 14:00.
    // Transported in uninsulated auto-rickshaw at 42°C ambient Delhi heat.
    const startTime = new Date('2026-06-15T14:00:00Z').getTime();
    const currentTime = startTime + 75 * 60 * 1000; // 75 minutes in transit
    const dispatch = {
      id: 'BV-7701',
      foodType: 'Cooked Meals',
      servings: 200,
      createdAt: new Date(startTime).toISOString(),
      expiryTime: new Date(startTime + 4 * 60 * 60 * 1000).toISOString(), // nominal 4 hours
      shelfLifeHours: 4
    };

    const status = safety.calculateDynamicShelfLife(dispatch, 42, currentTime);
    // At 42°C, microbial doubling accelerates by ~3.8x.
    // 75 min elapsed * 3.8 = 285 effective minutes consumed out of 240 min nominal.
    // The food should already be expired or in critical urgency.
    assert(status.isUrgent || status.isExpired, 'Delhi summer high-temp consignment must trigger urgency or expiration');
    assert(status.freshnessIndex < 35, `Freshness index should be severely depleted (<35%), got ${status.freshnessIndex}%`);
  });

  it('Scenario 2: Cold Chain Dairy Transit Failure (5°C -> 34°C Breakdown)', () => {
    assert(safety, 'BhojSafety module must be loaded');
    // 50L pasteurized milk dispatched at 4°C safe cold. Refrigerated van breaks down, temp rises to 34°C.
    const startTime = new Date('2026-06-15T08:00:00Z').getTime();
    const dispatch = {
      id: 'BV-7702',
      foodType: 'Produce / Raw',
      servings: 100,
      createdAt: new Date(startTime).toISOString(),
      expiryTime: new Date(startTime + 24 * 60 * 60 * 1000).toISOString(),
      shelfLifeHours: 24
    };

    const tempProfile = [
      { tempC: 4, durationMinutes: 60 },   // 1 hr safe
      { tempC: 22, durationMinutes: 60 },  // 1 hr rising
      { tempC: 34, durationMinutes: 120 }  // 2 hrs deep danger zone
    ];

    const curve = safety.simulateDecayCurve(dispatch, tempProfile);
    assert(curve.length === tempProfile.length, 'Should generate curve point for each phase');
    const finalPoint = curve[curve.length - 1];
    assert(finalPoint.freshnessIndex < 60, `Freshness should drop significantly after 2 hrs at 34°C, got ${finalPoint.freshnessIndex}%`);
  });
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
setTimeout(() => {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD} ENHANCEMENT R1 TEST SUMMARY: FSSAI THERMAL SPOILAGE${RESET}`);
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
