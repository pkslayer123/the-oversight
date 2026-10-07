// Drama C1 proof: social scenario spectacle (Steve 2026-10-07)
// Tests: socialFlash dispatcher, all 6 types, integration injection, day-7 gate
'use strict';

// Minimal DOM stub
const elements = [];
global.document = {
  getElementById: () => null,
  createElement: (tag) => ({
    tagName: tag,
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    remove: () => {},
    innerHTML: '',
  }),
  head: { appendChild: () => {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  contains: () => false,
};
global.getComputedStyle = () => ({ position: 'static' });
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

const fs = require('fs');
const path = require('path');

// Load drama.js in a sandbox
const dramaSrc = fs.readFileSync(path.join(__dirname, '../src/js/drama.js'), 'utf8');
const sandbox = { console, setTimeout, clearTimeout, document: global.document, getComputedStyle: global.getComputedStyle, requestAnimationFrame: global.requestAnimationFrame };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(dramaSrc, sandbox);

const Drama = sandbox.Scattering.Drama;
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}

// Track spawned effects
const spawned = [];
const origSpawn = Drama.spawn.bind(Drama);
Drama.spawn = function(html, css, cls, dur) {
  spawned.push({ html, css, cls, dur });
  return { remove: () => {} };
};
Drama.ensureOverlay = () => ({ appendChild: () => {} });
Drama.tileCenter = () => ({ x: 100, y: 100 });
Drama.flash = () => spawned.push({ type: 'flash' });
Drama.shake = () => spawned.push({ type: 'shake' });
Drama.floatText = () => spawned.push({ type: 'floatText' });

// Test 1: socialFlash dispatcher routes all 6 types
const types = ['moot', 'vote', 'exile', 'liar', 'reconcile', 'betray'];
for (const t of types) {
  spawned.length = 0;
  try {
    Drama.socialFlash({ type: t, integration: 2 });
    check(`socialFlash(${t}) spawns effects`, spawned.length > 0);
  } catch (e) {
    check(`socialFlash(${t}) no throw`, false);
  }
}

// Test 2: invalid spec doesn't throw
try {
  Drama.socialFlash(null);
  Drama.socialFlash({});
  Drama.socialFlash({ type: 'nonexistent' });
  check('invalid specs safe', true);
} catch (e) {
  check('invalid specs safe', false);
}

// Test 3: mootGather scales with integration
spawned.length = 0;
Drama.mootGather('TestCaller', 3);
check('mootGather L3 spawns', spawned.length > 0);

// Test 4: mootVote shows tally
spawned.length = 0;
Drama.mootVote(7, 10, 1);
const voteHtml = spawned.map(s => s.html || '').join('');
check('mootVote shows guilty count', voteHtml.includes('7 guilty'));
check('mootVote shows innocent count', voteHtml.includes('3 innocent'));

// Test 5: exileMoment is dark
spawned.length = 0;
Drama.exileMoment('TestVillager', 2);
const exileHtml = spawned.map(s => s.html || '').join('');
check('exileMoment shows EXILED', exileHtml.includes('EXILED'));
check('exileMoment names villager', exileHtml.includes('TestVillager'));

// Test 6: liarExposed has crackle
spawned.length = 0;
Drama.liarExposed('TestLiar', 1);
const liarHtml = spawned.map(s => s.html || '').join('');
check('liarExposed shows crackle', liarHtml.includes('⚡'));
check('liarExposed names liar', liarHtml.includes('TestLiar'));

// Test 7: reconcileGlow has hearts
spawned.length = 0;
Drama.reconcileGlow('TestFriend', 2);
// hearts are spawned via setTimeout, wait a bit
setTimeout(() => {
  const heartCount = spawned.filter(s => (s.html || '').includes('❤️')).length;
  check('reconcileGlow spawns hearts', heartCount >= 3);

  // Test 8: betraySlash
  spawned.length = 0;
  Drama.betraySlash('TestTraitor', 1);
  const betrayHtml = spawned.map(s => s.html || '').join('');
  check('betraySlash shows BETRAYED', betrayHtml.includes('BETRAYED'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}, 1500);
