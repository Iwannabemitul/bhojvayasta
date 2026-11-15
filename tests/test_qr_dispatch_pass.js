/**
 * BhojVayasta - Enhancement R5 Test Suite: Digital FSSAI Dispatch Pass & QR Verification
 * File: tests/test_qr_dispatch_pass.js
 *
 * Verifies:
 * 1. Digital FSSAI Dispatch Pass schema generation and mandatory regulatory fields
 * 2. Zero-dependency vector SVG QR code matrix rendering (finder patterns, modules)
 * 3. Verification engine: valid pass decoding, tamper detection, and checksum integrity
 * 4. FSSAI hygiene failure and temporal expiration rejection
 * 5. End-to-end donor generation to courier PoD scan & mutual PIN verification
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

// Sandbox loader for js/qrPass.js
function loadQrPassModule() {
  const filePath = path.resolve(__dirname, '../js/qrPass.js');
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
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    module: { exports: {} },
    exports: {}
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.BhojQRPass || sandbox.module.exports || sandbox.window.BhojQRPass;
}

// Sample realistic dispatch payload
const sampleDispatch = {
  id: 'BV-1088',
  foodType: 'Cooked Meals',
  description: 'Wedding Dal Makhani & Jeera Rice (Fresh)',
  servings: 150,
  weightKg: 45.0,
  donorName: 'Grand Hyatt Convention Center',
  contactPerson: 'Vikram Malhotra',
  phone: '+91 98101 23456',
  address: 'NH-44 Corridor, Mahipalpur, New Delhi',
  corridor: 'Delhi/NCR',
  lat: 28.5355,
  lng: 77.1215,
  storageTemp: 'Hot (> 65°C)',
  temperatureRecorded: '68°C',
  holdingTempC: 68.0,
  packagingType: 'Stainless steel sealed thermal containers',
  targetShelter: 'Sarai Kale Khan Relief Shelter',
  handoverPin: '4892',
  safetyChecklist: {
    tempCheck: true,
    cleanPackaging: true,
    noSpoiledItems: true,
    hygieneCertified: true
  },
  createdAt: new Date().toISOString(),
  expiryTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
};

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

describe('1. FSSAI Dispatch Pass Generation & Master Schema', () => {
  let qrPass;
  try {
    qrPass = loadQrPassModule();
  } catch (e) {}

  it('generatePass() produces a structured pass with all mandatory schema fields', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    assert(pass, 'Pass object must be generated');
    assert(pass.passId, 'Pass must contain passId');
    assert.strictEqual(pass.dispatchId, 'BV-1088');
    assert(pass.fssaiLicense, 'Pass must contain fssaiLicense');
    assert(pass.issueTimestamp, 'Pass must contain issueTimestamp');
    assert(pass.expiryTimestamp, 'Pass must contain expiryTimestamp');
    assert(pass.donor, 'Pass must contain donor metadata');
    assert(pass.consignment, 'Pass must contain consignment details');
    assert(pass.safetyCertification, 'Pass must contain safetyCertification');
    assert(pass.handoverSecurity, 'Pass must contain handoverSecurity');
    assert(pass.checksum, 'Pass must contain cryptographic checksum');
    assert(pass.qrPayload, 'Pass must contain qrPayload string');
  });

  it('passId follows regulatory pattern ^PASS-BV-[0-9]{4}-[A-Z0-9]{4}$', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    const passIdPattern = /^PASS-BV-[0-9]{4}-[A-Z0-9]{4}$/;
    assert(passIdPattern.test(pass.passId),
      `passId (${pass.passId}) must conform to pattern ^PASS-BV-[0-9]{4}-[A-Z0-9]{4}$`);
  });

  it('safetyCertification encapsulates the 3-point digital safety gate', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    assert.strictEqual(pass.safetyCertification.temperatureCompliant, true);
    assert.strictEqual(pass.safetyCertification.foodGradePackaging, true);
    assert.strictEqual(pass.safetyCertification.sensoryFreshness, true);
    assert.strictEqual(pass.safetyCertification.certifiedByDonor, true);
  });

  it('handoverSecurity preserves the 4-digit mutual handover PIN', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    assert.strictEqual(pass.handoverSecurity.handoverPin, '4892');
    assert.strictEqual(pass.handoverSecurity.targetShelter, 'Sarai Kale Khan Relief Shelter');
  });

  it('Generates compact QR payload URI or encoded JSON format', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    assert(typeof pass.qrPayload === 'string' && pass.qrPayload.length > 0,
      'qrPayload must be a non-empty string');
    assert(pass.qrPayload.includes('BV-1088') || pass.qrPayload.includes('PASS-BV'),
      'qrPayload must embed dispatch reference');
  });
});

describe('2. Client-Side SVG QR Code Matrix Generation', () => {
  let qrPass;
  try {
    qrPass = loadQrPassModule();
  } catch (e) {}

  it('renderSvgQr() returns valid vector SVG markup string or element', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    const svgOutput = qrPass.renderSvgQr(pass.qrPayload, null, { size: 240 });
    const svgStr = typeof svgOutput === 'string' ? svgOutput : svgOutput.outerHTML;

    assert(svgStr, 'renderSvgQr must return SVG markup');
    assert(svgStr.includes('<svg'), 'Output must contain <svg root tag');
    assert(svgStr.includes('viewBox='), 'SVG must include viewBox attribute for scalability');
    assert(svgStr.includes('</svg>'), 'Output must be well-formed closed XML');
  });

  it('SVG contains matrix module rects or paths encoding 2D data', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    const svgOutput = qrPass.renderSvgQr(pass.qrPayload, null, { size: 240 });
    const svgStr = typeof svgOutput === 'string' ? svgOutput : svgOutput.outerHTML;

    const hasRects = svgStr.includes('<rect');
    const hasPath = svgStr.includes('<path');
    assert(hasRects || hasPath, 'SVG QR code must render 2D data matrix modules via <rect> or <path>');
  });

  it('Handles complex payloads with URI encoding and special characters without XML errors', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const complexPayload = 'bhoj://fssai-pass?id=BV-9999&donor=Punjab+Dhaba%26Sweets&chk=abc123xyz';
    const svgOutput = qrPass.renderSvgQr(complexPayload, null, { size: 200 });
    const svgStr = typeof svgOutput === 'string' ? svgOutput : svgOutput.outerHTML;
    assert(svgStr && svgStr.includes('<svg'), 'Must render complex payload cleanly');
  });
});

describe('3. QR Pass Verification Engine (verifyPass)', () => {
  let qrPass;
  try {
    qrPass = loadQrPassModule();
  } catch (e) {}

  it('Successfully verifies a valid, untampered FSSAI dispatch pass', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    const result = qrPass.verifyPass(pass.qrPayload || pass);

    assert.strictEqual(result.isValid, true, 'Valid pass must yield isValid: true');
    assert.strictEqual(result.code, 'PASS_VERIFIED', 'Verification code should be PASS_VERIFIED');
    assert(result.pass, 'Result must include decoded pass object');
    assert.strictEqual(result.pass.dispatchId, 'BV-1088');
  });

  it('Detects tampering: modifying consignment weight invalidates checksum', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const pass = qrPass.generatePass(sampleDispatch);
    
    // Maliciously tamper with consignment weight from 45.0 kg to 450.0 kg
    const tamperedPass = JSON.parse(JSON.stringify(pass));
    tamperedPass.consignment.weightKg = 450.0;
    
    // Check verification using object or re-encoded payload
    const tamperedPayload = tamperedPass.qrPayload && tamperedPass.qrPayload.startsWith('{')
      ? JSON.stringify(tamperedPass)
      : tamperedPass;
    const result = qrPass.verifyPass(tamperedPayload);

    assert.strictEqual(result.isValid, false, 'Tampered pass must be rejected');
    assert.strictEqual(result.code, 'TAMPERED', 'Verification code must be TAMPERED');
  });

  it('Rejects expired dispatch pass past regulatory shelf life', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const expiredDispatch = Object.assign({}, sampleDispatch, {
      expiryTime: new Date(Date.now() - 30 * 60 * 1000).toISOString() // expired 30 min ago
    });
    const pass = qrPass.generatePass(expiredDispatch);
    const result = qrPass.verifyPass(pass.qrPayload || pass);

    assert.strictEqual(result.isValid, false, 'Expired pass must be rejected');
    assert.strictEqual(result.code, 'PASS_EXPIRED', 'Verification code must be PASS_EXPIRED');
  });

  it('Rejects consignment that failed FSSAI temperature or packaging hygiene', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const unsafeDispatch = Object.assign({}, sampleDispatch, {
      safetyChecklist: {
        tempCheck: false, // failed temp gate!
        cleanPackaging: true,
        noSpoiledItems: true,
        hygieneCertified: false
      }
    });
    const pass = qrPass.generatePass(unsafeDispatch);
    const result = qrPass.verifyPass(pass.qrPayload || pass);

    assert.strictEqual(result.isValid, false, 'Consignment failing hygiene gate must be rejected');
    assert.strictEqual(result.code, 'HYGIENE_VIOLATION', 'Verification code must be HYGIENE_VIOLATION');
  });

  it('Handles corrupted payload, invalid JSON, or empty string gracefully', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    const malformedResult = qrPass.verifyPass('CORRUPTED_GARBAGE_PAYLOAD');
    assert.strictEqual(malformedResult.isValid, false);
    assert(malformedResult.code === 'INVALID_PAYLOAD' || malformedResult.code === 'TAMPERED');

    const emptyResult = qrPass.verifyPass('');
    assert.strictEqual(emptyResult.isValid, false);
  });
});

describe('4. End-to-End Donor-to-Courier QR Handover Workflow', () => {
  let qrPass;
  try {
    qrPass = loadQrPassModule();
  } catch (e) {}

  it('End-to-End Handover: Donor presents QR, Courier verifies pass & matches PIN', () => {
    assert(qrPass, 'BhojQRPass must be loaded');
    // Step 1: Donor creates consignment and obtains pass
    const pass = qrPass.generatePass(sampleDispatch);
    assert(pass.qrPayload, 'Donor modal receives QR payload');

    // Step 2: Courier scans QR payload at shelter handover gate
    const scanResult = qrPass.verifyPass(pass.qrPayload || pass);
    assert.strictEqual(scanResult.isValid, true);
    assert.strictEqual(scanResult.code, 'PASS_VERIFIED');

    // Step 3: Courier matches 4-digit mutual handover PIN
    const verifiedPin = scanResult.pass.handoverSecurity.handoverPin;
    assert.strictEqual(verifiedPin, sampleDispatch.handoverPin,
      'Extracted QR pass PIN must match donor consignment PIN');
  });
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
setTimeout(() => {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD} ENHANCEMENT R5 TEST SUMMARY: DIGITAL FSSAI PASS & QR${RESET}`);
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
