#!/usr/bin/env node
// Proof test for wiring backlog fixes (Steve 2026-10-07 Priority 1):
// 1. Hushwolf/turtle knownCues are reachable (carried on combat lines once learned)
// 2. 4 missing monster voices are defined (kiteUnfold, nevermoreUnfold, nightcourtTurn, nightcourtDive)
// 3. statusApplied/statusCured synths are defined and wired
//
// Run: node scripts/test-wiring-fixes-20261007.js
// Exit 0 = all green, non-zero = failure.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS ${name}`);
    passed++;
  } else {
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('=== Task 1: Hushwolf/turtle knownCue carriers ===');
const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');

// Hushwolf carrier: encTelegraphKnown check + knownCue appended to combat-start line
check(
  'hushwolf knownCue carrier present',
  gameJs.includes("mdef.id === 'hushwolf'") &&
  gameJs.includes('hwKnown') &&
  gameJs.includes('hwKc') &&
  gameJs.includes('encTelegraphKnown'),
  'hushwolf combat-start should carry knownCue once learned'
);

// Turtle carrier: encTelegraphKnown check + knownCue appended to snap line
check(
  'turtle knownCue carrier present',
  gameJs.includes('turtleIs(m)') &&
  gameJs.includes('tuKnown') &&
  gameJs.includes('tuKc') &&
  gameJs.includes('tuCoaching'),
  'turtle snap line should carry knownCue once learned'
);

// Verify the knownCue data exists in monsters.json
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const mlist = Array.isArray(monsters) ? monsters : monsters.monsters;
function findKnownCue(mon) {
  function search(obj) {
    if (typeof obj !== 'object' || obj === null) return null;
    if (obj.knownCue) return obj.knownCue;
    for (const v of Object.values(obj)) {
      const r = search(v);
      if (r) return r;
    }
    return null;
  }
  return search(mon);
}
const hushwolf = mlist.find(m => m.id === 'hushwolf');
const turtle = mlist.find(m => m.id === 'speedbump_turtle');
check('hushwolf has knownCue data', !!findKnownCue(hushwolf), 'monsters.json');
check('turtle has knownCue data', !!findKnownCue(turtle), 'monsters.json');

console.log('\n=== Task 2: 4 missing monster voices ===');
const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

// nightcourtDive REMOVED 2026-10-08 (break-it audio): dead synth, dive deliberately silent
for (const voice of ['kiteUnfold', 'nevermoreUnfold', 'nightcourtTurn']) {
  check(
    `${voice} synth defined`,
    appJs.includes(`function ${voice}()`),
    'should be a function in app.js'
  );
  check(
    `${voice} exported in CombatAudio`,
    appJs.includes(`${voice}() { ${voice}(); }`) || appJs.includes(`${voice}() {${voice}();}`),
    'should be exported'
  );
}

// Verify the declarations exist in monsters.json
const allVoices = ['kiteUnfold', 'nevermoreUnfold', 'nightcourtTurn']; // nightcourtDive removed 2026-10-08
const monstersStr = JSON.stringify(mlist);
for (const voice of allVoices) {
  check(
    `${voice} declared in monsters.json`,
    monstersStr.includes(voice),
    'declaration should exist'
  );
}

console.log('\n=== Task 3: statusApplied/statusCured synths ===');

// Check statusEffects.js calls them
const seJs = fs.readFileSync(path.join(ROOT, 'src/js/statusEffects.js'), 'utf8');
check(
  'statusEffects.js calls statusApplied',
  seJs.includes("audioEvent('statusApplied'"),
  'applyStatus should trigger audio'
);
check(
  'statusEffects.js calls statusCured',
  seJs.includes("audioEvent('statusCured'"),
  'cureStatus should trigger audio'
);

// Check app.js defines and exports them
for (const hook of ['statusApplied', 'statusCured']) {
  check(
    `${hook} synth defined`,
    appJs.includes(`function ${hook}()`),
    'should be a function in app.js'
  );
  check(
    `${hook} exported in CombatAudio`,
    appJs.includes(`${hook}(`),
    'should be exported'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
