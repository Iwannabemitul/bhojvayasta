/**
 * Empirical Challenger Verification Harness
 * File: tests/test_challenger_event_simulation.js
 * 
 * Verifies that onkeydown="event.stopPropagation()" on the courier card action button bar
 * correctly resolves the keyboard activation cancellation bug and isolates child button clicks.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== EMPIRICAL CHALLENGER: KEYBOARD EVENT SIMULATION & PROPAGATION HARNESS ===\n');

// 1. Inspect volunteer.js source directly
const volunteerJsPath = path.join(__dirname, '..', 'js', 'volunteer.js');
const volunteerJs = fs.readFileSync(volunteerJsPath, 'utf8');

// Verify exact code presence in volunteer.js
const cardKeydownRegex = /<div id="card-\${item\.id}"[^>]*onkeydown="([^"]+)"/;
const cardKeydownMatch = volunteerJs.match(cardKeydownRegex);
assert(cardKeydownMatch, 'Courier card must define onkeydown handler');
console.log('[CONFIRMED] Card onkeydown handler in volunteer.js:\n  ', cardKeydownMatch[1]);

const buttonContainerRegex = /<div class="pt-2 border-t border-\[#DCD9D0\] flex items-center justify-between gap-2"[^>]*>/;
const buttonContainerMatch = volunteerJs.match(buttonContainerRegex);
assert(buttonContainerMatch, 'Button container must exist in volunteer.js');
console.log('[CONFIRMED] Button container HTML:\n  ', buttonContainerMatch[0]);

assert(buttonContainerMatch[0].includes('onclick="event.stopPropagation()"'), 'Container must have onclick stopPropagation');
assert(buttonContainerMatch[0].includes('onkeydown="event.stopPropagation()"'), 'Container must have onkeydown stopPropagation');

// 2. Build full DOM event dispatching simulation
class MockNode {
  constructor(tag, id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = {};
    this.onclick = null;
    this.onkeydown = null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  // Full DOM Event dispatching with bubbling and stopPropagation
  dispatchEvent(event) {
    event.target = this;

    // Collect propagation path (from target up to root)
    const path = [];
    let curr = this;
    while (curr) {
      path.push(curr);
      curr = curr.parentNode;
    }

    // Bubbling phase
    for (const node of path) {
      event.currentTarget = node;
      
      if (event.type === 'keydown' && typeof node.onkeydown === 'function') {
        node.onkeydown(event);
      } else if (event.type === 'click' && typeof node.onclick === 'function') {
        node.onclick(event);
      }

      if (event._propagationStopped) {
        break;
      }
    }

    return !event.defaultPrevented;
  }
}

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.key = init.key || '';
    this.defaultPrevented = false;
    this._propagationStopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this._propagationStopped = true;
  }
}

// Global actions tracker
let focusedDispatchId = null;
let acceptedDispatchId = null;
let completedDispatchId = null;

function resetActionTrackers() {
  focusedDispatchId = null;
  acceptedDispatchId = null;
  completedDispatchId = null;
}

const windowMock = {
  BhojFocusDispatch: (id) => { focusedDispatchId = id; },
  BhojVolunteerTriggerAccept: (id) => { acceptedDispatchId = id; },
  BhojVolunteerTriggerComplete: (id) => { completedDispatchId = id; }
};

// Build Courier Card DOM tree
function buildCourierCardTree(itemId, withKeydownStopPropagation = true) {
  const card = new MockNode('div', `card-${itemId}`);
  card.onclick = (event) => {
    windowMock.BhojFocusDispatch(itemId);
  };
  card.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      windowMock.BhojFocusDispatch(itemId);
    }
  };

  const buttonContainer = new MockNode('div', `btn-container-${itemId}`);
  buttonContainer.onclick = (event) => {
    event.stopPropagation();
  };
  if (withKeydownStopPropagation) {
    buttonContainer.onkeydown = (event) => {
      event.stopPropagation();
    };
  }

  const viewBtn = new MockNode('button', `view-btn-${itemId}`);
  viewBtn.onclick = (event) => {
    windowMock.BhojFocusDispatch(itemId);
  };

  const acceptBtn = new MockNode('button', `accept-btn-${itemId}`);
  acceptBtn.onclick = (event) => {
    windowMock.BhojVolunteerTriggerAccept(itemId);
  };

  const completeBtn = new MockNode('button', `complete-btn-${itemId}`);
  completeBtn.onclick = (event) => {
    windowMock.BhojVolunteerTriggerComplete(itemId);
  };

  buttonContainer.appendChild(viewBtn);
  buttonContainer.appendChild(acceptBtn);
  buttonContainer.appendChild(completeBtn);
  card.appendChild(buttonContainer);

  return { card, buttonContainer, viewBtn, acceptBtn, completeBtn };
}

// -------------------------------------------------------------
// Test 1: Negative Control (Confirming the bug existed before fix)
// -------------------------------------------------------------
console.log('\n--- Negative Control: Simulating behavior WITHOUT onkeydown="event.stopPropagation()" ---');
{
  resetActionTrackers();
  const treeWithoutFix = buildCourierCardTree('BV-9999', false);
  const keyEvent = new MockEvent('keydown', { key: 'Enter' });
  
  const allowed = treeWithoutFix.acceptBtn.dispatchEvent(keyEvent);
  
  // Without fix:
  // 1. keydown bubbled to card
  // 2. card called event.preventDefault() -> allowed is false
  // 3. card called BhojFocusDispatch
  console.log(`  Default prevented: ${keyEvent.defaultPrevented} (allowed = ${allowed})`);
  console.log(`  focusedDispatchId: ${focusedDispatchId}`);
  console.log(`  acceptedDispatchId: ${acceptedDispatchId}`);
  
  assert.strictEqual(keyEvent.defaultPrevented, true, 'Without fix, card preventDefault cancels button activation');
  assert.strictEqual(focusedDispatchId, 'BV-9999', 'Without fix, card steals keypress and focuses dispatch instead');
  console.log('  [CONFIRMED] Pre-remediation bug successfully reproduced: card prevented native activation!');
}

// -------------------------------------------------------------
// Test 2: Positive Verification (Confirming the fix in place)
// -------------------------------------------------------------
console.log('\n--- Positive Verification: Simulating behavior WITH onkeydown="event.stopPropagation()" ---');

// Scenario 2A: Enter key on "I\'ll Pick This Up" button
{
  resetActionTrackers();
  const tree = buildCourierCardTree('BV-1082', true);
  const keyEvent = new MockEvent('keydown', { key: 'Enter' });
  
  const allowed = tree.acceptBtn.dispatchEvent(keyEvent);
  
  assert.strictEqual(keyEvent.defaultPrevented, false, 'Enter keydown must NOT be prevented on child button');
  assert.strictEqual(keyEvent._propagationStopped, true, 'Propagation must be stopped at button container');
  assert.strictEqual(focusedDispatchId, null, 'Card onkeydown must NOT be triggered');

  // In standard browser, when keydown is not prevented, browser fires click event
  if (allowed) {
    const clickEvent = new MockEvent('click');
    tree.acceptBtn.dispatchEvent(clickEvent);
  }

  assert.strictEqual(acceptedDispatchId, 'BV-1082', 'Button click must execute BhojVolunteerTriggerAccept');
  assert.strictEqual(focusedDispatchId, null, 'Card onclick must NOT be executed');
  console.log('  [PASS] Scenario 2A: Enter key on "I\'ll Pick This Up" cleanly triggers accept action without card interference.');
}

// Scenario 2B: Space key on "I\'ll Pick This Up" button
{
  resetActionTrackers();
  const tree = buildCourierCardTree('BV-1082', true);
  const keyEvent = new MockEvent('keydown', { key: ' ' });
  
  const allowed = tree.acceptBtn.dispatchEvent(keyEvent);
  
  assert.strictEqual(keyEvent.defaultPrevented, false, 'Space keydown must NOT be prevented by parent card');
  assert.strictEqual(keyEvent._propagationStopped, true, 'Propagation must be stopped at button container');
  assert.strictEqual(focusedDispatchId, null, 'Card onkeydown must NOT be triggered');

  if (allowed) {
    const clickEvent = new MockEvent('click');
    tree.acceptBtn.dispatchEvent(clickEvent);
  }

  assert.strictEqual(acceptedDispatchId, 'BV-1082', 'Space key must successfully trigger BhojVolunteerTriggerAccept');
  assert.strictEqual(focusedDispatchId, null, 'Card onclick must NOT be executed');
  console.log('  [PASS] Scenario 2B: Space key on "I\'ll Pick This Up" cleanly triggers accept action without card interference.');
}

// Scenario 2C: Enter key directly on Card container
{
  resetActionTrackers();
  const tree = buildCourierCardTree('BV-1082', true);
  const keyEvent = new MockEvent('keydown', { key: 'Enter' });
  
  tree.card.dispatchEvent(keyEvent);
  
  assert.strictEqual(keyEvent.defaultPrevented, true, 'Card Enter keydown must call preventDefault');
  assert.strictEqual(focusedDispatchId, 'BV-1082', 'Card Enter keydown must invoke BhojFocusDispatch');
  assert.strictEqual(acceptedDispatchId, null, 'Card Enter must NOT trigger child button action');
  console.log('  [PASS] Scenario 2C: Enter key on Card container correctly focuses dispatch on map.');
}

// Scenario 2D: Space key directly on Card container
{
  resetActionTrackers();
  const tree = buildCourierCardTree('BV-1082', true);
  const keyEvent = new MockEvent('keydown', { key: ' ' });
  
  tree.card.dispatchEvent(keyEvent);
  
  assert.strictEqual(keyEvent.defaultPrevented, true, 'Card Space keydown must call preventDefault (prevent page scroll)');
  assert.strictEqual(focusedDispatchId, 'BV-1082', 'Card Space keydown must invoke BhojFocusDispatch');
  assert.strictEqual(acceptedDispatchId, null, 'Card Space must NOT trigger child button action');
  console.log('  [PASS] Scenario 2D: Space key on Card container correctly focuses dispatch on map.');
}

// Scenario 2E: Enter key on "Mark as Delivered" button
{
  resetActionTrackers();
  const tree = buildCourierCardTree('BV-2050', true);
  const keyEvent = new MockEvent('keydown', { key: 'Enter' });
  
  const allowed = tree.completeBtn.dispatchEvent(keyEvent);
  assert.strictEqual(keyEvent.defaultPrevented, false);
  
  if (allowed) {
    const clickEvent = new MockEvent('click');
    tree.completeBtn.dispatchEvent(clickEvent);
  }

  assert.strictEqual(completedDispatchId, 'BV-2050', 'Mark as Delivered button must trigger BhojVolunteerTriggerComplete');
  assert.strictEqual(focusedDispatchId, null, 'Card onclick must NOT be executed');
  console.log('  [PASS] Scenario 2E: Enter key on "Mark as Delivered" cleanly triggers complete action.');
}

// Scenario 2F: Enter key on "View on Map" button
{
  resetActionTrackers();
  const tree = buildCourierCardTree('BV-3040', true);
  const keyEvent = new MockEvent('keydown', { key: 'Enter' });
  
  const allowed = tree.viewBtn.dispatchEvent(keyEvent);
  assert.strictEqual(keyEvent.defaultPrevented, false);
  
  if (allowed) {
    const clickEvent = new MockEvent('click');
    tree.viewBtn.dispatchEvent(clickEvent);
  }

  assert.strictEqual(focusedDispatchId, 'BV-3040', 'View on Map button invokes BhojFocusDispatch directly');
  console.log('  [PASS] Scenario 2F: Enter key on "View on Map" triggers BhojFocusDispatch without event collision.');
}

// Scenario 2G: Non-activation keys (Tab, Escape, ArrowDown) on card container
{
  resetActionTrackers();
  const tree = buildCourierCardTree('BV-1082', true);

  for (const nonActKey of ['Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Shift']) {
    const keyEvent = new MockEvent('keydown', { key: nonActKey });
    tree.card.dispatchEvent(keyEvent);
    assert.strictEqual(keyEvent.defaultPrevented, false, `${nonActKey} must not be prevented on card`);
    assert.strictEqual(focusedDispatchId, null, `${nonActKey} must not trigger dispatch focus`);
  }
  console.log('  [PASS] Scenario 2G: Standard navigation keys (Tab, Arrows, Escape) are completely unhindered.');
}

console.log('\n=== ALL 7 CHALLENGER SCENARIOS EMPIRICALLY VERIFIED AND PASSED! ===');
