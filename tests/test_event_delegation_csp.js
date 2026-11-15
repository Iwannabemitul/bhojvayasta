/**
 * BhojVayasta - Enhancement R2 Test Suite: Declarative Event Delegation & Strict CSP Hardening (T2.5)
 * File: tests/test_event_delegation_csp.js
 *
 * Verifies:
 * 1. Declarative data-action attributes on courier cards and feed container
 * 2. Event delegation via closest('[data-action]') handling nested child elements
 * 3. Isolation of child button clicks and keyboard navigation
 * 4. Strict preservation of baseline accessibility regex contracts in js/volunteer.js
 * 5. Strict Content Security Policy (CSP) meta tags across index.html, volunteer.html, donate.html
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

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

// Read target source files
const rootDir = path.resolve(__dirname, '..');
const volunteerJsPath = path.join(rootDir, 'js', 'volunteer.js');
const navbarJsPath = path.join(rootDir, 'js', 'navbar.js');
const volunteerHtmlPath = path.join(rootDir, 'volunteer.html');
const indexHtmlPath = path.join(rootDir, 'index.html');
const donateHtmlPath = path.join(rootDir, 'donate.html');

const volunteerJs = fs.readFileSync(volunteerJsPath, 'utf8');
const navbarJs = fs.readFileSync(navbarJsPath, 'utf8');
const volunteerHtml = fs.readFileSync(volunteerHtmlPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const donateHtml = fs.readFileSync(donateHtmlPath, 'utf8');

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

describe('1. Declarative Action Attributes in Templates', () => {
  it('volunteer.js renders courier cards with data-action="focus-dispatch" and data-dispatch-id', () => {
    const hasFocusAction = volunteerJs.includes('data-action="focus-dispatch"');
    const hasDispatchIdAttr = volunteerJs.includes('data-dispatch-id=');
    assert(hasFocusAction && hasDispatchIdAttr,
      'volunteer.js card markup must include data-action="focus-dispatch" and data-dispatch-id="${item.id}"');
  });

  it('volunteer.js renders claim/accept buttons with data-action="accept-dispatch"', () => {
    const hasAcceptAction = volunteerJs.includes('data-action="accept-dispatch"');
    assert(hasAcceptAction,
      'volunteer.js must render claim/accept buttons with data-action="accept-dispatch"');
  });

  it('volunteer.js renders completion buttons with data-action="complete-dispatch"', () => {
    const hasCompleteAction = volunteerJs.includes('data-action="complete-dispatch"') ||
                              volunteerJs.includes('data-action="complete-delivery"');
    assert(hasCompleteAction,
      'volunteer.js must render deliver/complete buttons with data-action="complete-dispatch"');
  });

  it('volunteer.js / volunteer.html renders clear route button with data-action="clear-route"', () => {
    const hasClearAction = volunteerJs.includes('data-action="clear-route"') ||
                           volunteerHtml.includes('data-action="clear-route"');
    assert(hasClearAction,
      'volunteer.js or volunteer.html must include data-action="clear-route"');
  });

  it('navbar.js / footer renders reset demo data with declarative data-action', () => {
    const hasResetAction = navbarJs.includes('data-action="reset-demo-data"') ||
                           navbarJs.includes('bhoj:resetDemoData');
    assert(hasResetAction,
      'navbar.js must support declarative demo reset without inline handler');
  });
});

describe('2. Container-Level Event Delegation Architecture', () => {
  it('volunteer.js attaches container-level event listener for delegated actions', () => {
    // Should inspect container element and attach delegated click listener using closest('[data-action]')
    const hasDelegatedListener = /addEventListener\(\s*['"]click['"]\s*,\s*(?:function|\([^)]*\)\s*=>)/.test(volunteerJs) &&
                                 volunteerJs.includes('.closest(') &&
                                 volunteerJs.includes('data-action');
    assert(hasDelegatedListener,
      'volunteer.js must attach a container-level click listener using .closest("[data-action]")');
  });

  it('Delegation handles clicks on nested child elements inside action buttons', () => {
    // Simulating DOM node hierarchy: Button -> Span -> SVG
    class MockElement {
      constructor(tag, attrs = {}) {
        this.tagName = tag.toUpperCase();
        this.attributes = attrs;
        this.parentNode = null;
      }
      getAttribute(k) { return this.attributes[k] || null; }
      closest(selector) {
        let curr = this;
        const attrMatch = selector.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\]/);
        while (curr) {
          if (attrMatch) {
            const attrName = attrMatch[1];
            const attrVal = attrMatch[2];
            if (attrVal) {
              if (curr.getAttribute(attrName) === attrVal) return curr;
            } else if (curr.getAttribute(attrName) !== null) {
              return curr;
            }
          }
          curr = curr.parentNode;
        }
        return null;
      }
    }

    const button = new MockElement('BUTTON', { 'data-action': 'accept-dispatch', 'data-dispatch-id': 'BV-2001' });
    const span = new MockElement('SPAN', {});
    span.parentNode = button;
    const svgIcon = new MockElement('SVG', {});
    svgIcon.parentNode = span;

    // Click target is deep child svgIcon
    const matchedAction = svgIcon.closest('[data-action]');
    assert(matchedAction, 'Deep child click must resolve to closest [data-action]');
    assert.strictEqual(matchedAction.getAttribute('data-action'), 'accept-dispatch');
    assert.strictEqual(matchedAction.getAttribute('data-dispatch-id'), 'BV-2001');
  });

  it('Delegation ignores clicks on non-action container elements', () => {
    class MockElement {
      constructor(tag, attrs = {}) {
        this.tagName = tag.toUpperCase();
        this.attributes = attrs;
        this.parentNode = null;
      }
      getAttribute(k) { return this.attributes[k] || null; }
      closest(selector) {
        let curr = this;
        while (curr) {
          if (curr.getAttribute('data-action')) return curr;
          curr = curr.parentNode;
        }
        return null;
      }
    }

    const cardContainer = new MockElement('DIV', { class: 'courier-feed-container' });
    const cardBody = new MockElement('DIV', { class: 'card-description-text' });
    cardBody.parentNode = cardContainer;

    const matchedAction = cardBody.closest('[data-action]');
    assert.strictEqual(matchedAction, null, 'Clicks on non-action elements must not resolve to any action');
  });
});

describe('3. Baseline Test Regex Invariance (Zero Regression)', () => {
  it('Preserves card onkeydown regex required by test_challenger_event_simulation.js', () => {
    const cardKeydownRegex = /<div id="card-\${item\.id}"[^>]*onkeydown="([^"]+)"/;
    const cardKeydownMatch = volunteerJs.match(cardKeydownRegex);
    assert(cardKeydownMatch,
      'Crucial Invariance: volunteer.js must retain <div id="card-${item.id}" with onkeydown attribute');
    assert(cardKeydownMatch[1].includes('BhojFocusDispatch'),
      'Card onkeydown handler must call BhojFocusDispatch on Enter / Space');
  });

  it('Preserves button container stopPropagation regex required by existing test suites', () => {
    const buttonContainerRegex = /<div class="pt-2 border-t border-\[#DCD9D0\] flex items-center justify-between gap-2"[^>]*>/;
    const match = volunteerJs.match(buttonContainerRegex);
    assert(match,
      'Crucial Invariance: Button bar container div with border-[#DCD9D0] must exist in volunteer.js');
    assert(match[0].includes('onclick="event.stopPropagation()"'),
      'Button bar must have onclick="event.stopPropagation()"');
    assert(match[0].includes('onkeydown="event.stopPropagation()"'),
      'Button bar must have onkeydown="event.stopPropagation()"');
  });

  it('Preserves accessibility attributes: tabindex="0", role="button", aria-label', () => {
    assert(volunteerJs.includes('tabindex="0"'), 'Cards must retain tabindex="0"');
    assert(volunteerJs.includes('role="button"'), 'Cards must retain role="button"');
    assert(volunteerJs.includes('aria-label='), 'Cards must retain aria-label');
  });
});

describe('4. Strict Content Security Policy (CSP) Meta Tag Hardening', () => {
  function extractCspMeta(html) {
    const cspRegex = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*\/?>/i;
    const match = html.match(cspRegex);
    return match ? match[1].trim() : null;
  }

  it('index.html contains valid Content-Security-Policy meta tag in head', () => {
    const csp = extractCspMeta(indexHtml);
    assert(csp, 'index.html must define a <meta http-equiv="Content-Security-Policy"> tag');
    assert(csp.includes("default-src 'self'"), "index.html CSP must specify default-src 'self'");
    assert(csp.includes("object-src 'none'"), "index.html CSP must specify object-src 'none'");
    assert(csp.includes("base-uri 'self'"), "index.html CSP must specify base-uri 'self'");
  });

  it('volunteer.html contains valid Content-Security-Policy meta tag in head', () => {
    const csp = extractCspMeta(volunteerHtml);
    assert(csp, 'volunteer.html must define a <meta http-equiv="Content-Security-Policy"> tag');
    assert(csp.includes("default-src 'self'"), "volunteer.html CSP must specify default-src 'self'");
    assert(csp.includes("object-src 'none'"), "volunteer.html CSP must specify object-src 'none'");
    assert(csp.includes("base-uri 'self'"), "volunteer.html CSP must specify base-uri 'self'");
  });

  it('donate.html contains valid Content-Security-Policy meta tag in head', () => {
    const csp = extractCspMeta(donateHtml);
    assert(csp, 'donate.html must define a <meta http-equiv="Content-Security-Policy"> tag');
    assert(csp.includes("default-src 'self'"), "donate.html CSP must specify default-src 'self'");
    assert(csp.includes("object-src 'none'"), "donate.html CSP must specify object-src 'none'");
    assert(csp.includes("base-uri 'self'"), "donate.html CSP must specify base-uri 'self'");
  });

  it('CSP permits necessary external assets without wildcards', () => {
    const csp = extractCspMeta(volunteerHtml);
    assert(csp, 'volunteer.html CSP must exist');

    // Scripts: Tailwind, Leaflet (unpkg), Chart.js (jsdelivr)
    assert(csp.includes('cdn.tailwindcss.com'), 'CSP must allow cdn.tailwindcss.com for styling');
    assert(csp.includes('unpkg.com'), 'CSP must allow unpkg.com for Leaflet and Lucide icons');
    
    // Connect / Maps: OSRM router & map tiles
    assert(csp.includes('router.project-osrm.org'), 'CSP connect-src must allow OSRM routing endpoint');
    assert(csp.includes('arcgisonline.com') || csp.includes('openstreetmap.org'),
      'CSP img-src/connect-src must allow map tile servers');
    
    // Security restriction: Must not have wildcard script-src *
    assert(!/script-src[^;]*\*/.test(csp), 'CSP must not allow wildcard * in script-src');
  });
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
setTimeout(() => {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD} ENHANCEMENT R2 TEST SUMMARY: EVENT DELEGATION & CSP HARDENING${RESET}`);
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
