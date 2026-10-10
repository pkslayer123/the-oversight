#!/usr/bin/env node
/* Save/Load Integrity Test (Steve 2026-10-07; repaired 2026-10-10)
   Regression guards for save-integrity bugs found in the 2026-10-07 audit.
   REPAIR NOTES (2026-10-10, break-it persistence landing):
   - gamePath pointed at '/tmp/game-fix.js' (a 2026-10-07 scratch concat) —
     now reads the live repo src/js/game.js.
   - Assertion 1 (state.region write): DROPPED by design. The 2026-10-07 fix
     wrote state.region='middle_america' in newGame, but arrivalText.json has
     NO regionOverrides (landing-location knowledge is future per design),
     so nothing ever read it; the write was later removed and the reader
     (arrivalPoolFor) null-guards. Asserting the write would resurrect dead
     code. Guard now: the reader stays null-safe.
   - Assertion 4 (talkIdx): the pre-rethink state.talkIdx counter is dead —
     talkTo moved to conversation.js (dialog rethink 2026-10-08) and nothing
     increments talkIdx anymore. The live counter is village.conv[vid].count
     (startConvo). Guard now: startConvo increments c.count, and
     socialSimmer reads the live counter (regression caught 2026-10-10:
     conflict discovery was stuck at base 0.12 forever).
   - Assertions 5-6 (migration): _migrateV0toV1 was replaced by the r7
     MIGRATIONS registry (break-it persistence 2026-10-09). Guards now:
     MIGRATIONS registry + migrateSave + hasMigrationPath exist,
     SAVE_VERSION still 1.
*/
const fs = require('fs');
const path = require('path');

const gameCode = fs.readFileSync(path.join(__dirname, '..', 'src/js/game.js'), 'utf8');
const convoCode = fs.readFileSync(path.join(__dirname, '..', 'src/js/conversation.js'), 'utf8');
const stateCode = fs.readFileSync(path.join(__dirname, '..', 'src/js/engine/state.js'), 'utf8');
const arrivalData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/data/arrivalText.json'), 'utf8'));

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('\n=== Save Integrity Tests ===\n');

console.log('1. state.region: no writer by design, reader null-safe, data has no overrides');
test('arrivalText.json has no regionOverrides (nothing to gate)', () => {
  const ro = arrivalData.regionOverrides || {};
  assert(Object.keys(ro).length === 0, 'regionOverrides unexpectedly present');
});
test('arrivalPoolFor null-guards a missing region', () => {
  assert(gameCode.includes("(this.state && this.state.region) || null"),
    'region null-guard missing from arrivalPoolFor');
});

console.log('\n2. systemIntegration derived from scholar.integration:');
test('win score derives systemIntegration from scholar.integration', () => {
  assert(gameCode.includes('Math.min(3, Math.floor(((this.state.scholar || {}).integration || 0) / 27))'),
    'systemIntegration derivation not found');
});
test('old dead read is gone', () => {
  assert(!gameCode.includes('const sysLevel = this.state.systemIntegration || 0; // 0-3'),
    'old dead systemIntegration read still present');
});

console.log('\n3. party read from village.party (not state.party):');
test('threatRating reads village.party', () => {
  assert(gameCode.includes("((this.state.village || {}).party || []).length"),
    'village.party read not found in threatRating');
});
test('old wrong read is gone', () => {
  const lines = gameCode.split('\n');
  const badLines = lines.filter(l =>
    l.includes('(this.state.party || [])') && !l.trim().startsWith('//'));
  assert(badLines.length === 0,
    `old state.party read still present: ${badLines[0]}`);
});

console.log('\n4. conversation counting feeds conflict discovery (talkIdx rewire):');
test('startConvo increments the lifetime per-villager count', () => {
  assert(convoCode.includes('c.count++; c.lastDay = this.state.scholar.day;'),
    'c.count++ missing from startConvo');
});
test('socialSimmer reads the live village.conv counts', () => {
  assert(gameCode.includes('(this.state.village || {}).conv || {}'),
    'socialSimmer does not read village.conv');
});
test('socialSimmer no longer reads the dead state.talkIdx', () => {
  const lines = gameCode.split('\n');
  const dead = lines.filter(l =>
    l.includes('this.state.talkIdx') && !l.trim().startsWith('//'));
  assert(dead.length === 0,
    `dead talkIdx read still present: ${dead[0] && dead[0].trim()}`);
});

console.log('\n5. Migration registry (r7 replaced _migrateV0toV1):');
test('MIGRATIONS registry exists', () => {
  assert(stateCode.includes('const MIGRATIONS ='), 'MIGRATIONS registry not found');
});
test('migrateSave runner exists', () => {
  assert(/function migrateSave\(/.test(stateCode), 'migrateSave not found');
});
test('hasMigrationPath exists', () => {
  assert(/function hasMigrationPath\(/.test(stateCode), 'hasMigrationPath not found');
});
test('SAVE_VERSION is 1', () => {
  assert(stateCode.includes('const SAVE_VERSION = 1'), 'SAVE_VERSION is not 1');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
