#!/usr/bin/env node
// TEST (Steve 2026-10-07): Socialite round 3 minor notes §6.2 and §6.3.
//
// §6.2 (design note): "Pooling explanation never fires on unprocessed-only
// first hauls." The "We pool food here" line was gated on `give.length`
// inside the `if (brought > 0)` pantry block. A first-time forager bringing
// only raw/unprocessed plants never heard it.
// FIX: the prep-stash block (which runs on `brought > 0 || hasUnprocessed`)
// now fires the pooling explanation on a first return with staged unprocessed
// hauls, guarded by the same `pooledFoodExplained` flag (no double-fire).
//
// §6.3 (trivial wart): "You keep a day's food (310 kcal) and unload 0 kcal
// into Haven's pantry." — awkward when the whole day's food is kept.
// FIX: when givenKcal is 0, say "nothing extra for the pantry this time."
//
// NOTE: unlike test-socialite-round3-20261007.js (which extracts HEAD via
// git archive), this test loads the WORKTREE engine so it can verify
// uncommitted fixes. Run after committing to verify the committed state.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const SEED = parseInt(process.env.SEED || '20261007', 10);
let _a = SEED >>> 0;
Math.random = function () {
  _a |= 0; _a = (_a + 0x6D2B79F5) | 0;
  let t = Math.imul(_a ^ (_a >>> 15), 1 | _a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  [OK] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('== §6.3: unload-0 phrasing ==');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('rephrase branch exists for givenKcal == 0',
    src.includes('nothing extra for the pantry this time'),
    'expected honest zero-give line in game.js');
  ok('unload line is conditional on givenKcal > 0',
    src.includes('if (givenKcal > 0) {') && src.includes('and unload ${givenKcal} kcal'),
    'the unload-X line should only fire when something was actually given');
}

console.log('== §6.2: pooling explanation on unprocessed-only first return ==');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('prep-stash block fires pooling explanation',
    src.includes('nods at the counter') && src.includes('We pool food here'),
    'expected prep-stash pooling line in game.js');
  ok('guarded by pooledFoodExplained (no double-fire)',
    (src.match(/pooledFoodExplained/g) || []).length >= 4,
    'flag should gate both the pantry and prep-stash sites');
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
