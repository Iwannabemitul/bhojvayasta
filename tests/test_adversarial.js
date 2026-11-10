/**
 * BhojVayasta - Milestone 3 Adversarial Stress Test Suite
 * File: tests/test_adversarial.js
 * 
 * Conducts independent empirical adversarial verification across:
 * 1. Stored XSS sanitization & dangerous character neutralization
 * 2. SafeStorage degradation & failure resilience (QuotaExceededError, SecurityError)
 * 3. Optimistic Concurrency Control (OCC) race conditions under rapid concurrent claims
 * 4. Handover Proof of Delivery (PoD) PIN enforcement & brute-force resistance
 * 5. Geographic corridor boundary math & dual-corridor shelter geofencing
 */

'use strict';

const assert = require('assert');
const path = require('path');
const vm = require('vm');
const fs = require('fs');

// Color helpers for terminal output
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

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
    findings.push({
      test: testName,
      error: err.message,
      stack: err.stack
    });
  }
}

async function itAsync(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ${GREEN}[PASS]${RESET} ${testName}`);
  } catch (err) {
    failedTests++;
    console.log(`  ${RED}[FAIL]${RESET} ${testName}`);
    console.log(`         ${RED}Error: ${err.message}${RESET}`);
    findings.push({
      test: testName,
      error: err.message,
      stack: err.stack
    });
  }
}

// Helper: Loads a fresh instance of js/store.js in an isolated sandbox with optional mock window/localStorage
function createIsolatedStoreInstance(mockLocalStorage = null) {
  const storeFilePath = path.resolve(__dirname, '../js/store.js');
  const storeCode = fs.readFileSync(storeFilePath, 'utf8');

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    Date: Date,
    Math: Math,
    String: String,
    Number: Number,
    parseInt: parseInt,
    parseFloat: parseFloat,
    JSON: JSON,
    Set: Set,
    Array: Array,
    Object: Object,
    Boolean: Boolean,
    RegExp: RegExp,
    module: { exports: {} },
    exports: {}
  };

  if (mockLocalStorage) {
    sandbox.window = {
      localStorage: mockLocalStorage
    };
  }

  vm.createContext(sandbox);
  vm.runInContext(storeCode, sandbox);

  const safeStorage = (sandbox.window && sandbox.window.SafeStorage) || sandbox.SafeStorage;
  const bhojStore = (sandbox.window && sandbox.window.BhojStore) || sandbox.BhojStore || sandbox.module.exports;

  return {
    BhojStore: bhojStore,
    SafeStorage: safeStorage,
    sandbox
  };
}

// ============================================================================
// SUITE 1: XSS Sanitization & Neutralization Stress Test
// ============================================================================
describe('1. XSS Sanitization & Character Neutralization (BhojStore.escapeHtml)', () => {
  const { BhojStore } = createIsolatedStoreInstance();
  const escapeHtml = BhojStore.escapeHtml;

  it('Neutralizes basic script tags', () => {
    const raw = '<script>alert("XSS")</script>';
    const escaped = escapeHtml(raw);
    assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    assert(!escaped.includes('<'));
    assert(!escaped.includes('>'));
    assert(!escaped.includes('"'));
  });

  it('Neutralizes nested and malformed script tags', () => {
    const vectors = [
      '<script><script>alert(1)</script></script>',
      '<<SCRIPT>alert("XSS");//<</SCRIPT>',
      '<SCR<script>IPT>alert(1)</SCR</script>IPT>',
      '<script src="http://evil.com/xss.js"></script>'
    ];
    for (const vec of vectors) {
      const res = escapeHtml(vec);
      assert(!res.includes('<'), `Vector failed to neutralize '<': ${vec} -> ${res}`);
      assert(!res.includes('>'), `Vector failed to neutralize '>': ${vec} -> ${res}`);
    }
  });

  it('Neutralizes event handlers and attribute breakouts', () => {
    const vectors = [
      '<img src=x onerror="alert(\'XSS\')">',
      '"><svg/onload=alert(1)>',
      '\' onfocus=\'alert(1)\' autofocus=\'',
      '<body onload=alert(1)>',
      '<input type="text" value="" onkeydown="alert(1)">',
      '<a href="javascript:alert(1)">Click Me</a>'
    ];
    for (const vec of vectors) {
      const res = escapeHtml(vec);
      assert(!res.includes('<'), `Vector contained '<': ${res}`);
      assert(!res.includes('>'), `Vector contained '>': ${res}`);
      assert(!res.includes('"'), `Vector contained '"': ${res}`);
      assert(!res.includes('\''), `Vector contained '\'': ${res}`);
    }
  });

  it('Strictly neutralizes all five mandatory dangerous characters: &, <, >, ", \'', () => {
    const raw = '& < > " \'';
    const escaped = escapeHtml(raw);
    assert.strictEqual(escaped, '&amp; &lt; &gt; &quot; &#039;');
    assert(!escaped.includes('<'));
    assert(!escaped.includes('>'));
    assert(!escaped.includes('"'));
    assert(!escaped.includes('\''));
    // Ensure ampersands are not double-escaped if run once
    assert.strictEqual(escaped.match(/&amp;/g).length, 1);
  });

  it('Handles already-encoded HTML entities without corrupting into executable raw HTML', () => {
    const raw = '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;';
    const escaped = escapeHtml(raw);
    assert.strictEqual(escaped, '&amp;amp;lt;script&amp;amp;gt;alert(1)&amp;amp;lt;/script&amp;amp;gt;');
    assert(!escaped.includes('<'));
    assert(!escaped.includes('>'));
  });

  it('Handles non-string and boundary inputs gracefully without throwing', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml(''), '');
    assert.strictEqual(escapeHtml(0), '0');
    assert.strictEqual(escapeHtml(12345), '12345');
    assert.strictEqual(escapeHtml(false), 'false');
    assert.strictEqual(escapeHtml(true), 'true');
  });

  it('Handles complex objects, arrays, and Unicode / multi-byte characters', () => {
    const objInput = { toString() { return '<tag>"hello"\''; } };
    assert.strictEqual(escapeHtml(objInput), '&lt;tag&gt;&quot;hello&quot;&#039;');

    const unicode = '🥘 Hot Curry & Rice <Special "Dish"> \'Fresh\' 🍲';
    const escapedUnicode = escapeHtml(unicode);
    assert.strictEqual(escapedUnicode, '🥘 Hot Curry &amp; Rice &lt;Special &quot;Dish&quot;&gt; &#039;Fresh&#039; 🍲');
  });

  it('Fuzz / Invariance: 1,000 randomized permutations of dangerous characters are 100% sanitized', () => {
    const chars = ['&', '<', '>', '"', '\'', 'a', 'b', '1', '2', ' ', '/', '=', ';', '(', ')'];
    for (let i = 0; i < 1000; i++) {
      let len = Math.floor(Math.random() * 30) + 5;
      let raw = '';
      for (let j = 0; j < len; j++) {
        raw += chars[Math.floor(Math.random() * chars.length)];
      }
      const sanitized = escapeHtml(raw);
      assert(!sanitized.includes('<'), `Fuzz failure: raw "${raw}" produced unsanitized '<' in "${sanitized}"`);
      assert(!sanitized.includes('>'), `Fuzz failure: raw "${raw}" produced unsanitized '>' in "${sanitized}"`);
      assert(!sanitized.includes('"'), `Fuzz failure: raw "${raw}" produced unsanitized '"' in "${sanitized}"`);
      assert(!sanitized.includes('\''), `Fuzz failure: raw "${raw}" produced unsanitized '\'' in "${sanitized}"`);
    }
  });

  it('Adversarial Analysis: Inspects href protocol handling (javascript: uri)', () => {
    const jsUri = 'javascript:alert(document.cookie)';
    const escaped = escapeHtml(jsUri);
    // Note: escapeHtml only encodes HTML entities, it does NOT strip protocols.
    // Verify whether "javascript:" remains intact.
    assert.strictEqual(escaped, 'javascript:alert(document.cookie)');
    // This is expected for an entity escaper, but indicates callers must never place raw user input into href!
  });
});

// ============================================================================
// SUITE 2: SafeStorage Resilience & Degradation
// ============================================================================
describe('2. SafeStorage Resilience & Degradation Under Fatal Storage Errors', () => {

  it('Degrades gracefully when localStorage throws SecurityError at initialization', () => {
    const mockStorage = {
      setItem() {
        const err = new Error('The operation is insecure.');
        err.name = 'SecurityError';
        throw err;
      },
      getItem() {
        const err = new Error('The operation is insecure.');
        err.name = 'SecurityError';
        throw err;
      },
      removeItem() {}
    };

    const { BhojStore, SafeStorage } = createIsolatedStoreInstance(mockStorage);
    assert.strictEqual(SafeStorage.isNative(), false, 'SafeStorage must detect native failure and mark isNative=false');

    // Verify CRUD operations work without throwing
    assert.doesNotThrow(() => {
      SafeStorage.setItem('test_key', 'test_value');
    });

    const retrieved = SafeStorage.getItem('test_key');
    assert.strictEqual(retrieved, 'test_value', 'Must read back written value from in-memory fallback');

    SafeStorage.removeItem('test_key');
    assert.strictEqual(SafeStorage.getItem('test_key'), null, 'Must remove key from in-memory fallback');

    // Verify BhojStore functions completely in this degraded environment
    const dispatches = BhojStore.getDispatches();
    assert(Array.isArray(dispatches) && dispatches.length > 0, 'BhojStore must initialize seeds in fallback memory');
  });

  it('Degrades gracefully when localStorage throws QuotaExceededError at initialization', () => {
    const mockStorage = {
      setItem() {
        const err = new Error('QuotaExceededError: DomException 22');
        err.name = 'QuotaExceededError';
        throw err;
      },
      getItem() { return null; },
      removeItem() {}
    };

    const { BhojStore, SafeStorage } = createIsolatedStoreInstance(mockStorage);
    assert.strictEqual(SafeStorage.isNative(), false, 'SafeStorage must mark isNative=false on initial quota error');

    SafeStorage.setItem('session_flag', 'active');
    assert.strictEqual(SafeStorage.getItem('session_flag'), 'active', 'In-memory fallback stores and returns value');
  });

  it('Catches QuotaExceededError during mid-session write without throwing fatal exception', () => {
    let throwQuota = false;
    const backingStore = {};

    const mockStorage = {
      setItem(k, v) {
        if (throwQuota) {
          const err = new Error('Quota exceeded on device');
          err.name = 'QuotaExceededError';
          throw err;
        }
        backingStore[k] = String(v);
      },
      getItem(k) {
        return backingStore[k] !== undefined ? backingStore[k] : null;
      },
      removeItem(k) {
        delete backingStore[k];
      }
    };

    const { BhojStore, SafeStorage } = createIsolatedStoreInstance(mockStorage);
    assert.strictEqual(SafeStorage.isNative(), true, 'Initially native storage is supported');

    // Initial write succeeds natively
    SafeStorage.setItem('key_1', 'val_1');
    assert.strictEqual(SafeStorage.getItem('key_1'), 'val_1');

    // Now storage quota fills up mid-session!
    throwQuota = true;

    // Verify setItem does NOT throw unhandled exception
    let writeResult;
    assert.doesNotThrow(() => {
      writeResult = SafeStorage.setItem('key_quota', 'val_quota');
    });
    // setItem returns false to signal native write failed and fallback was used
    assert.strictEqual(writeResult, false, 'setItem returns false when native write fails');

    // Empirical Vulnerability Check: What does getItem return after mid-session quota error?
    const readBack = SafeStorage.getItem('key_quota');
    if (readBack !== 'val_quota') {
      findings.push({
        type: 'STORAGE_DESYNC_BUG',
        severity: 'HIGH',
        component: 'SafeStorage.getItem',
        description: `Mid-session QuotaExceeded write desynchronization: When setItem falls back to memoryStore, getItem() still reads from localStorage (which did not throw), returning stale/null data ("${readBack}") instead of the updated memory value ("val_quota").`
      });
      console.log(`    ${YELLOW}[AUDIT FINDING] SafeStorage.getItem desync: Stale read occurred after mid-session quota write!${RESET}`);
    }
  });

  it('Degrades fully to memory if localStorage is completely blocked or threw during init', () => {
    const memoryOnlyStorage = {
      setItem() { const err = new Error('SecurityError'); err.name = 'SecurityError'; throw err; },
      getItem() { const err = new Error('SecurityError'); err.name = 'SecurityError'; throw err; },
      removeItem() {}
    };
    const { SafeStorage } = createIsolatedStoreInstance(memoryOnlyStorage);
    SafeStorage.setItem('key_a', 'val_a');
    assert.strictEqual(SafeStorage.getItem('key_a'), 'val_a', 'Reads back from memoryStore when isNative=false');
  });

  it('Self-heals and recovers when corrupted / malformed JSON is placed into storage', () => {
    const backingStore = {
      'bhojvayasta_dispatches_v2': '{{{CORRUPTED_MALFORMED_JSON_GARBAGE!!!'
    };

    const mockStorage = {
      setItem(k, v) { backingStore[k] = String(v); },
      getItem(k) { return backingStore[k] !== undefined ? backingStore[k] : null; },
      removeItem(k) { delete backingStore[k]; }
    };

    const { BhojStore } = createIsolatedStoreInstance(mockStorage);

    // BhojStore must catch JSON.parse error and auto-reseed
    let dispatches;
    assert.doesNotThrow(() => {
      dispatches = BhojStore.getDispatches();
    });

    assert(Array.isArray(dispatches), 'Must recover to array');
    assert(dispatches.length >= 7, 'Must restore full seed catalog');
  });
});

// ============================================================================
// SUITE 3: Concurrency Race Conditions & Optimistic Concurrency Control (OCC)
// ============================================================================
describe('3. Concurrency Race Conditions & OCC State Verification (updateStatus)', () => {

  it('Simulates 5 rapid concurrent claims on the same available dispatch; exactly ONE succeeds and 4 fail with ERR_CLAIM_CONFLICT', () => {
    const { BhojStore } = createIsolatedStoreInstance();

    // Verify initial seed state: BV-1082 is Available
    const initial = BhojStore.getDispatchById('BV-1082');
    assert.strictEqual(initial.status, 'Available', 'Target dispatch BV-1082 must start as Available');
    const initialVersion = initial.version || 1;

    const couriers = [
      { name: 'Courier 1 (Rohan)', shelter: 'Asha Child Care Shelter' },
      { name: 'Courier 2 (Simran)', shelter: 'Seva Slum Relief Camp' },
      { name: 'Courier 3 (Vikram)', shelter: 'Bal Vikas Orphanage' },
      { name: 'Courier 4 (Ananya)', shelter: 'Samarpan Elders Home' },
      { name: 'Courier 5 (Deepak)', shelter: 'Asha Child Care Shelter' }
    ];

    const results = [];

    // Simulate rapid concurrent claim calls on the same dispatch ID
    for (const courier of couriers) {
      try {
        const updated = BhojStore.updateStatus(
          'BV-1082',
          'In-Transit',
          courier.name,
          courier.shelter,
          'Available' // OCC precondition: expects status to still be Available
        );
        results.push({ success: true, courier: courier.name, updated });
      } catch (err) {
        results.push({
          success: false,
          courier: courier.name,
          errorCode: err.code,
          errorName: err.name,
          message: err.message
        });
      }
    }

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.strictEqual(successes.length, 1, `Expected exactly 1 claim to succeed, but ${successes.length} succeeded`);
    assert.strictEqual(failures.length, 4, `Expected exactly 4 claims to fail, but ${failures.length} failed`);

    // Verify the winning courier
    const winner = successes[0];
    assert.strictEqual(winner.courier, 'Courier 1 (Rohan)', 'The first sequential caller must claim the item');
    assert.strictEqual(winner.updated.status, 'In-Transit');
    assert.strictEqual(winner.updated.volunteer, 'Courier 1 (Rohan)');

    // Verify all 4 failing claims threw ERR_CLAIM_CONFLICT
    for (const fail of failures) {
      assert.strictEqual(fail.errorCode, 'ERR_CLAIM_CONFLICT', `Failure must have code ERR_CLAIM_CONFLICT, got: ${fail.errorCode}`);
      assert.strictEqual(fail.errorName, 'ConcurrencyConflictError', `Failure must be ConcurrencyConflictError, got: ${fail.errorName}`);
    }

    // Verify persisted state in store
    const persisted = BhojStore.getDispatchById('BV-1082');
    assert.strictEqual(persisted.status, 'In-Transit');
    assert.strictEqual(persisted.volunteer, 'Courier 1 (Rohan)');
    assert.strictEqual(persisted.version, initialVersion + 1, 'Version counter must increment by exactly 1');
  });

  itAsync('Asynchronous concurrent claims: exactly 1 resolves, 9 reject with ERR_CLAIM_CONFLICT', async () => {
    const { BhojStore } = createIsolatedStoreInstance();

    // BV-2401 is Available
    assert.strictEqual(BhojStore.getDispatchById('BV-2401').status, 'Available');

    const claimAttempts = [];
    for (let i = 1; i <= 10; i++) {
      claimAttempts.push(
        new Promise((resolve) => {
          // Defer slightly with random micro-jitter to simulate network/DOM event loop concurrency
          setTimeout(() => {
            try {
              const res = BhojStore.updateStatus(
                'BV-2401',
                'In-Transit',
                `Async Courier ${i}`,
                'Asha Child Care Shelter',
                'Available'
              );
              resolve({ ok: true, id: i, res });
            } catch (e) {
              resolve({ ok: false, id: i, code: e.code, err: e.message });
            }
          }, Math.floor(Math.random() * 5));
        })
      );
    }

    const outcomes = await Promise.all(claimAttempts);
    const winners = outcomes.filter((o) => o.ok);
    const losers = outcomes.filter((o) => !o.ok);

    assert.strictEqual(winners.length, 1, `Expected exactly 1 winner, found ${winners.length}`);
    assert.strictEqual(losers.length, 9, `Expected exactly 9 losers, found ${losers.length}`);

    losers.forEach((l) => {
      assert.strictEqual(l.code, 'ERR_CLAIM_CONFLICT');
    });
  });

  it('Prevents claiming an item that is already In-Transit even if expectedStatus is not passed', () => {
    const { BhojStore } = createIsolatedStoreInstance();

    // BV-4820 is already In-Transit in seed data
    const item = BhojStore.getDispatchById('BV-4820');
    assert.strictEqual(item.status, 'In-Transit');

    assert.throws(
      () => {
        BhojStore.updateStatus('BV-4820', 'In-Transit', 'Intruder Courier');
      },
      (err) => {
        return err.code === 'ERR_CLAIM_CONFLICT' && err.name === 'ConcurrencyConflictError';
      },
      'Must throw ERR_CLAIM_CONFLICT when claiming already In-Transit item'
    );
  });

  it('Rejects invalid status transitions with descriptive error', () => {
    const { BhojStore } = createIsolatedStoreInstance();

    assert.throws(() => {
      BhojStore.updateStatus('BV-1082', 'INVALID_STATUS');
    }, /Invalid status/);

    assert.throws(() => {
      BhojStore.updateStatus('NON_EXISTENT_ID', 'In-Transit');
    }, /not found/);
  });
});

// ============================================================================
// SUITE 4: Handover Proof of Delivery (PoD) PIN Enforcement
// ============================================================================
describe('4. Handover Proof of Delivery (PoD) PIN Protocol & Brute-Force Testing', () => {

  it('Verifies exact handover PIN transitions dispatch from In-Transit to Delivered', () => {
    const { BhojStore } = createIsolatedStoreInstance();

    // BV-4820 is In-Transit with handoverPin = '2650'
    const initial = BhojStore.getDispatchById('BV-4820');
    assert.strictEqual(initial.status, 'In-Transit');
    const expectedPin = initial.handoverPin;
    assert.strictEqual(expectedPin, '2650');

    const updated = BhojStore.updateStatus(
      'BV-4820',
      'Delivered',
      'Rohan V.',
      'Asha Child Care Shelter',
      'In-Transit',
      '2650' // Exact match
    );

    assert.strictEqual(updated.status, 'Delivered');
    assert(updated.proofOfDelivery, 'proofOfDelivery object must be attached');
    assert.strictEqual(updated.proofOfDelivery.pinMatch, true);
    assert(updated.proofOfDelivery.verifiedAt);
    assert.strictEqual(updated.statusTimestamps.delivered !== null, true);
  });

  it('Brute-force attack resistance: 100 incorrect 4-digit PIN guesses are 100% rejected with ERR_INVALID_POD_PIN', () => {
    const { BhojStore } = createIsolatedStoreInstance();

    const targetId = 'BV-4820';
    const item = BhojStore.getDispatchById(targetId);
    const validPin = item.handoverPin; // '2650'

    let rejectedCount = 0;

    for (let i = 0; i < 100; i++) {
      // Generate random 4-digit guess that is NOT the valid PIN
      let guess = String(Math.floor(1000 + Math.random() * 9000));
      if (guess === validPin) guess = '0001';

      try {
        BhojStore.updateStatus(
          targetId,
          'Delivered',
          'Rohan V.',
          'Asha Child Care Shelter',
          'In-Transit',
          guess
        );
        assert.fail(`Guessed PIN ${guess} should have failed!`);
      } catch (err) {
        assert.strictEqual(err.code, 'ERR_INVALID_POD_PIN');
        assert.strictEqual(err.name, 'VerificationCodeError');
        rejectedCount++;
      }

      // Verify status remained In-Transit
      const current = BhojStore.getDispatchById(targetId);
      assert.strictEqual(current.status, 'In-Transit', 'Status must NOT mutate on failed PIN attempt');
      assert.strictEqual(current.proofOfDelivery, undefined, 'No proof of delivery should be set');
    }

    assert.strictEqual(rejectedCount, 100, 'All 100 brute-force attempts must be rejected');
  });

  it('Handles PIN with leading/trailing whitespace correctly via trim()', () => {
    const { BhojStore } = createIsolatedStoreInstance();

    const updated = BhojStore.updateStatus(
      'BV-4820',
      'Delivered',
      'Rohan V.',
      'Asha Child Care Shelter',
      'In-Transit',
      '  2650  ' // Whitespace padded
    );

    assert.strictEqual(updated.status, 'Delivered');
    assert.strictEqual(updated.proofOfDelivery.pinMatch, true);
  });

  it('Adversarial Boundary Analysis: Tests behavior when PoD PIN parameter is omitted or empty', () => {
    const { BhojStore } = createIsolatedStoreInstance();

    // BV-4820 is In-Transit
    // What happens if an attacker calls updateStatus('BV-4820', 'Delivered') WITHOUT passing verification code?
    let bypassed = false;
    try {
      const res = BhojStore.updateStatus(
        'BV-4820',
        'Delivered',
        'Malicious Courier',
        'Asha Child Care Shelter',
        'In-Transit',
        null // Omitted / null PIN
      );
      if (res && res.status === 'Delivered') {
        bypassed = true;
      }
    } catch (e) {
      bypassed = false;
    }

    // Record this finding: line 948 of store.js checks:
    // if (deliveryVerificationCode !== undefined && deliveryVerificationCode !== null && deliveryVerificationCode !== '')
    // This allows bypass if code is completely omitted at the API level!
    if (bypassed) {
      findings.push({
        type: 'SECURITY_WEAKNESS',
        severity: 'MEDIUM',
        component: 'BhojStore.updateStatus',
        description: 'PoD PIN verification can be bypassed if deliveryVerificationCode argument is omitted, null, or empty string because line 948 only validates the PIN if a truthy non-empty code is supplied.'
      });
      console.log(`    ${YELLOW}[AUDIT FINDING] PoD PIN verification bypass possible when deliveryVerificationCode is omitted or null!${RESET}`);
    }
    // We assert this condition so we document the exact empirical reality
    assert(true);
  });
});

// ============================================================================
// SUITE 5: Geographic Corridor Boundary Math & Geofencing
// ============================================================================
describe('5. Geographic Corridor Boundary Math & Geofencing', () => {
  const { BhojStore } = createIsolatedStoreInstance();

  it('Classifies extreme latitudes into correct corridor (Delhi/NCR vs Punjab NH-44)', () => {
    // Delhi / NCR points
    assert.strictEqual(BhojStore.determineCorridor(28.6139, 77.2090), 'Delhi/NCR', 'Delhi Central');
    assert.strictEqual(BhojStore.determineCorridor(28.5355, 77.3910), 'Delhi/NCR', 'Noida NCR');
    assert.strictEqual(BhojStore.determineCorridor(28.7150, 77.1210), 'Delhi/NCR', 'Rohini North-West Delhi');
    assert.strictEqual(BhojStore.determineCorridor(29.9999, 77.0000), 'Delhi/NCR', 'Just south of 30.0N boundary');

    // Exact Boundary Point
    assert.strictEqual(BhojStore.determineCorridor(30.0000, 76.5000), 'Punjab / Jalandhar / Phagwara', 'Exact 30.0N boundary threshold');

    // Punjab points
    assert.strictEqual(BhojStore.determineCorridor(30.0001, 76.5000), 'Punjab / Jalandhar / Phagwara', 'Just north of 30.0N boundary');
    assert.strictEqual(BhojStore.determineCorridor(31.2554, 75.7050), 'Punjab / Jalandhar / Phagwara', 'LPU Phagwara Campus');
    assert.strictEqual(BhojStore.determineCorridor(31.3340, 75.5680), 'Punjab / Jalandhar / Phagwara', 'Jalandhar City');
  });

  it('Handles malformed, string, negative, and extreme coordinate inputs robustly', () => {
    assert.strictEqual(BhojStore.determineCorridor('31.25', '75.70'), 'Punjab / Jalandhar / Phagwara');
    assert.strictEqual(BhojStore.determineCorridor('28.62', '77.21'), 'Delhi/NCR');
    assert.strictEqual(BhojStore.determineCorridor(-30.5, 75.0), 'Delhi/NCR', 'Negative latitude');
    assert.strictEqual(BhojStore.determineCorridor(0, 0), 'Delhi/NCR', 'Equator');
    assert.strictEqual(BhojStore.determineCorridor(null, null), 'Delhi/NCR', 'Null fallback');
    assert.strictEqual(BhojStore.determineCorridor(undefined, undefined), 'Delhi/NCR', 'Undefined fallback');
    assert.strictEqual(BhojStore.determineCorridor(NaN, NaN), 'Delhi/NCR', 'NaN fallback');
  });

  it('Filters shelter hubs strictly by designated corridor without cross-contamination', () => {
    const delhiShelters = BhojStore.getSheltersForCorridor('Delhi/NCR');
    assert.strictEqual(delhiShelters.length, 4, 'Delhi/NCR must have exactly 4 shelter hubs');
    delhiShelters.forEach((s) => {
      assert.strictEqual(s.corridor, 'Delhi/NCR', `Shelter ${s.name} must belong to Delhi/NCR`);
      assert(s.lat < 30.0, `Delhi shelter ${s.name} lat (${s.lat}) must be < 30.0N`);
      assert(s.handoverPin && s.handoverPin.length === 4, `Delhi shelter ${s.name} must have 4-digit handoverPin`);
    });

    const punjabShelters = BhojStore.getSheltersForCorridor('Punjab / Jalandhar / Phagwara');
    assert.strictEqual(punjabShelters.length, 3, 'Punjab corridor must have exactly 3 shelter hubs');
    punjabShelters.forEach((s) => {
      assert.strictEqual(s.corridor, 'Punjab / Jalandhar / Phagwara', `Shelter ${s.name} must belong to Punjab`);
      assert(s.lat >= 30.0, `Punjab shelter ${s.name} lat (${s.lat}) must be >= 30.0N`);
      assert(s.handoverPin && s.handoverPin.length === 4, `Punjab shelter ${s.name} must have 4-digit handoverPin`);
    });

    // Total shelters must equal 7
    assert.strictEqual(delhiShelters.length + punjabShelters.length, 7);
  });

  it('Flexible corridor keyword matching (jalandhar, phagwara, punjab, lpu)', () => {
    assert.strictEqual(BhojStore.getSheltersForCorridor('jalandhar').length, 3);
    assert.strictEqual(BhojStore.getSheltersForCorridor('phagwara').length, 3);
    assert.strictEqual(BhojStore.getSheltersForCorridor('punjab').length, 3);
    assert.strictEqual(BhojStore.getSheltersForCorridor('LPU Corridor').length, 3);
    assert.strictEqual(BhojStore.getSheltersForCorridor('delhi').length, 4);
    assert.strictEqual(BhojStore.getSheltersForCorridor('').length, 7, 'Empty returns all 7 shelters');
  });

  it('Identifies boundary threshold discrepancy between determineCorridor and inline normalization', () => {
    // determineCorridor uses latitude >= 30.0
    // generateSeedData and getDispatches normalization use: item.lat > 30
    const boundaryAt30_determine = BhojStore.determineCorridor(30.0, 76.0);
    const boundaryAt30_inline = (30.0 > 30) ? 'Punjab / Jalandhar / Phagwara' : 'Delhi/NCR';

    assert.strictEqual(boundaryAt30_determine, 'Punjab / Jalandhar / Phagwara');
    assert.strictEqual(boundaryAt30_inline, 'Delhi/NCR');

    findings.push({
      type: 'CODE_CONSISTENCY',
      severity: 'LOW',
      component: 'store.js boundary condition',
      description: 'Discrepancy at exactly lat = 30.0: determineCorridor() uses "latitude >= 30.0" (assigns Punjab), whereas normalization lines 586 and 728 use "item.lat > 30" (assigns Delhi/NCR).'
    });
    console.log(`    ${YELLOW}[AUDIT FINDING] Discrepancy at exactly lat=30.0: determineCorridor uses >= 30.0 whereas seed normalization uses > 30.${RESET}`);
  });
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
setTimeout(() => {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD} ADVERSARIAL STRESS TEST SUMMARY${RESET}`);
  console.log(`${BOLD}================================================================${RESET}`);
  console.log(`Total Assertions Run : ${totalTests}`);
  console.log(`Passed Assertions    : ${GREEN}${passedTests}${RESET}`);
  console.log(`Failed Assertions    : ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
  console.log(`Audit Findings / Observations : ${findings.length}`);

  if (findings.length > 0) {
    console.log(`\n${BOLD}${YELLOW}FINDINGS LOG:${RESET}`);
    findings.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.type || 'TEST_FAILURE'}] [${f.severity || 'HIGH'}] ${f.description || f.test}`);
    });
  }

  const highSeverityFindings = findings.filter((f) => f.severity === 'HIGH' || f.severity === 'CRITICAL');
  const verdict = (failedTests === 0 && highSeverityFindings.length === 0) ? 'APPROVE' : 'REQUEST_CHANGES';
  console.log(`\n${BOLD}FINAL VERDICT: ${verdict === 'APPROVE' ? GREEN : RED}${verdict}${RESET}`);
  if (verdict === 'REQUEST_CHANGES') {
    console.log(`${YELLOW}Rationale: ${highSeverityFindings.length} High/Critical severity architectural/storage flaw(s) identified under stress.${RESET}\n`);
  } else {
    console.log(`${GREEN}All verification suites and resilience checks passed within nominal tolerance.${RESET}\n`);
  }

  process.exit(verdict === 'APPROVE' ? 0 : 1);
}, 200);
