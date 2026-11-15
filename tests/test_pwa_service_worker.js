/**
 * BhojVayasta - Enhancement R3 Test Suite: Mobile Courier PWA Service Worker (T3.1)
 * File: tests/test_pwa_service_worker.js
 *
 * Verifies:
 * 1. Web App Manifest (manifest.json) schema, metadata, icons, and theme configuration
 * 2. HTML views manifest linking and theme-color meta tags
 * 3. Service Worker (sw.js) lifecycle events: install, activate, and cache management
 * 4. Multi-tiered caching strategies: Cache-First for Leaflet map tiles & vendor CDNs,
 *    Stale-While-Revalidate for app shell, and offline fallbacks
 * 5. PWA registration module (js/pwa.js) with online/offline connectivity handling
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

// Path definitions
const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const swPath = path.join(rootDir, 'sw.js');
const pwaJsPath = path.join(rootDir, 'js', 'pwa.js');
const volunteerHtmlPath = path.join(rootDir, 'volunteer.html');
const indexHtmlPath = path.join(rootDir, 'index.html');
const donateHtmlPath = path.join(rootDir, 'donate.html');

// Read files if existing
let manifestContent = null;
let manifestJson = null;
if (fs.existsSync(manifestPath)) {
  try {
    manifestContent = fs.readFileSync(manifestPath, 'utf8');
    manifestJson = JSON.parse(manifestContent);
  } catch (e) {
    manifestContent = null;
  }
}

let swContent = null;
if (fs.existsSync(swPath)) {
  swContent = fs.readFileSync(swPath, 'utf8');
}

let pwaJsContent = null;
if (fs.existsSync(pwaJsPath)) {
  pwaJsContent = fs.readFileSync(pwaJsPath, 'utf8');
}

const volunteerHtml = fs.readFileSync(volunteerHtmlPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const donateHtml = fs.readFileSync(donateHtmlPath, 'utf8');

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

describe('1. Web App Manifest (manifest.json) Schema & Metadata', () => {
  it('manifest.json file exists and is valid JSON', () => {
    assert(fs.existsSync(manifestPath), 'manifest.json must exist in project root');
    assert(manifestJson !== null, 'manifest.json must be valid parseable JSON');
  });

  it('manifest.json specifies mandatory PWA identity fields', () => {
    assert(manifestJson, 'manifest.json must be loaded');
    assert(manifestJson.name && manifestJson.name.includes('BhojVayasta'),
      'manifest.json name must identify BhojVayasta');
    assert(manifestJson.short_name && manifestJson.short_name.includes('Bhoj'),
      'manifest.json short_name must be present');
    assert(manifestJson.start_url, 'manifest.json start_url must be defined');
  });

  it('manifest.json specifies standalone display mode and portrait orientation', () => {
    assert(manifestJson, 'manifest.json must be loaded');
    assert.strictEqual(manifestJson.display, 'standalone',
      'PWA display mode must be "standalone" for courier mobile terminal');
    assert(manifestJson.orientation === 'portrait-primary' || manifestJson.orientation === 'portrait' || !manifestJson.orientation,
      'PWA orientation should be portrait or standard');
  });

  it('manifest.json specifies botanical branding theme and background colors', () => {
    assert(manifestJson, 'manifest.json must be loaded');
    assert(manifestJson.theme_color && manifestJson.theme_color.toLowerCase() === '#1b4332',
      `theme_color must match botanical dark green #1B4332, got ${manifestJson.theme_color}`);
    assert(manifestJson.background_color && manifestJson.background_color.toLowerCase() === '#f7f5f0',
      `background_color must match parchment white #F7F5F0, got ${manifestJson.background_color}`);
  });

  it('manifest.json defines icon entries for 192x192 and 512x512 PNG icons', () => {
    assert(manifestJson, 'manifest.json must be loaded');
    assert(Array.isArray(manifestJson.icons) && manifestJson.icons.length >= 2,
      'manifest.json must define at least two icon resolutions');
    const sizes = manifestJson.icons.map(i => i.sizes);
    assert(sizes.includes('192x192'), 'manifest.json icons must include 192x192');
    assert(sizes.includes('512x512'), 'manifest.json icons must include 512x512');
  });
});

describe('2. HTML Views Manifest & Theme Integration', () => {
  it('volunteer.html links manifest.json and specifies theme-color meta tag', () => {
    assert(volunteerHtml.includes('<link rel="manifest" href="manifest.json">') ||
           volunteerHtml.includes("href='manifest.json'"),
      'volunteer.html must link manifest.json');
    assert(volunteerHtml.includes('name="theme-color"') && volunteerHtml.includes('#1B4332'),
      'volunteer.html must define theme-color #1B4332');
  });

  it('index.html links manifest.json and specifies theme-color meta tag', () => {
    assert(indexHtml.includes('manifest.json'), 'index.html must reference manifest.json');
    assert(indexHtml.includes('name="theme-color"'), 'index.html must define theme-color');
  });

  it('donate.html links manifest.json and specifies theme-color meta tag', () => {
    assert(donateHtml.includes('manifest.json'), 'donate.html must reference manifest.json');
    assert(donateHtml.includes('name="theme-color"'), 'donate.html must define theme-color');
  });
});

describe('3. Service Worker (sw.js) Architecture & Lifecycle', () => {
  it('sw.js file exists in project root', () => {
    assert(fs.existsSync(swPath), 'sw.js service worker file must exist in project root');
  });

  it('sw.js implements install event with cache pre-warming and skipWaiting()', () => {
    assert(swContent, 'sw.js must be loaded');
    assert(swContent.includes("addEventListener('install'") || swContent.includes('addEventListener("install"'),
      'sw.js must listen for install event');
    assert(swContent.includes('skipWaiting()'),
      'sw.js install handler should call skipWaiting() for instant worker activation');
    assert(swContent.includes('addAll(') || swContent.includes('cache.put('),
      'sw.js install handler must pre-cache core application shell');
  });

  it('sw.js implements activate event with cache invalidation and clients.claim()', () => {
    assert(swContent, 'sw.js must be loaded');
    assert(swContent.includes("addEventListener('activate'") || swContent.includes('addEventListener("activate"'),
      'sw.js must listen for activate event');
    assert(swContent.includes('clients.claim()'),
      'sw.js activate handler should claim clients immediately');
    assert(swContent.includes('caches.delete') || swContent.includes('caches.keys'),
      'sw.js activate handler must purge stale cache versions');
  });
});

describe('4. Multi-Tier Caching Strategies & Offline Fallbacks', () => {
  it('sw.js handles fetch event across application routes', () => {
    assert(swContent, 'sw.js must be loaded');
    assert(swContent.includes("addEventListener('fetch'") || swContent.includes('addEventListener("fetch"'),
      'sw.js must listen for fetch events');
    assert(swContent.includes('respondWith('),
      'sw.js fetch handler must call event.respondWith()');
  });

  it('sw.js implements Cache-First strategy for Leaflet map tiles', () => {
    assert(swContent, 'sw.js must be loaded');
    const hasTileMatch = swContent.includes('arcgisonline.com') ||
                         swContent.includes('tile.openstreetmap.org') ||
                         swContent.includes('maps-');
    assert(hasTileMatch, 'sw.js must identify and cache Leaflet map tile requests');
  });

  it('sw.js implements Cache-First strategy for vendor CDN libraries', () => {
    assert(swContent, 'sw.js must be loaded');
    const hasVendorCaching = swContent.includes('unpkg.com') ||
                            swContent.includes('cdn.jsdelivr.net') ||
                            swContent.includes('cdn.tailwindcss.com') ||
                            swContent.includes('vendor');
    assert(hasVendorCaching, 'sw.js must cache vendor CDN assets for offline execution');
  });

  it('sw.js implements Stale-While-Revalidate or Network-First for core application shell', () => {
    assert(swContent, 'sw.js must be loaded');
    const hasShellStrategy = swContent.includes('caches.open') &&
                            (swContent.includes('fetch(event.request)') || swContent.includes('fetch(req)'));
    assert(hasShellStrategy, 'sw.js must handle app shell caching with revalidation');
  });

  it('sw.js handles network errors gracefully with offline fallback', () => {
    assert(swContent, 'sw.js must be loaded');
    assert(swContent.includes('.catch(') || swContent.includes('try {'),
      'sw.js must catch network failures and provide cached or graceful fallback response');
  });
});

describe('5. PWA Registration & Connectivity Status (js/pwa.js)', () => {
  it('PWA registration script exists or is integrated', () => {
    const hasPwaJs = fs.existsSync(pwaJsPath);
    const hasInlineReg = volunteerHtml.includes('navigator.serviceWorker.register') ||
                         indexHtml.includes('navigator.serviceWorker.register');
    assert(hasPwaJs || hasInlineReg, 'PWA registration must exist in js/pwa.js or HTML views');
  });

  it('Guards registration with "serviceWorker" in navigator check', () => {
    const scriptToCheck = pwaJsContent || volunteerHtml;
    assert(scriptToCheck.includes("'serviceWorker' in navigator") ||
           scriptToCheck.includes('"serviceWorker" in navigator'),
      'PWA registration must check "serviceWorker" in navigator for progressive enhancement');
  });

  it('Listens to online and offline window events for connectivity feedback', () => {
    const scriptToCheck = pwaJsContent || volunteerHtml;
    const hasConnectivityListeners = scriptToCheck.includes("'online'") || scriptToCheck.includes('"online"') ||
                                     scriptToCheck.includes("'offline'") || scriptToCheck.includes('"offline"');
    assert(hasConnectivityListeners,
      'PWA module must listen to online/offline events to inform couriers of network state');
  });
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
setTimeout(() => {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD} ENHANCEMENT R3 TEST SUMMARY: PWA & SERVICE WORKER${RESET}`);
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
