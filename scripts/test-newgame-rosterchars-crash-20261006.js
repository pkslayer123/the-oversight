// test-newgame-rosterchars-crash-20261006.js — proof test for the newGame crash
// introduced by aa9cb19 (Unify person system, Steve 2026-10-06).
//
// BUG: newGame's hydration loop writes
//   this.state.village.rosterChars[hydrated.id] = hydrated
// BEFORE rosterChars is initialized (the `= {}` comes 4 lines later), so
// every new game throws `TypeError: Cannot set properties of undefined`.
// The sibling's test-people-coverage audit never calls newGame, so it passed.
//
// THE FIX (one line): initialize rosterChars BEFORE the hydration loop —
// move `this.state.village.rosterChars = {};` above `for (const id of bg) {`
// and drop the now-duplicate init below.
//
// Run: node scripts/test-newgame-rosterchars-crash-20261006.js        (before: FAILS)
//      FIX=1 node scripts/test-newgame-rosterchars-crash-20261006.js  (after: PASSES)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

const APPLY_FIX = process.env.FIX === '1';
const files = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'];
for (const f of files) {
  let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (APPLY_FIX && f === 'src/js/game.js') {
    const loopAnchor = '      for (const id of bg) {';
    const dupInit = '\n      this.state.village.rosterChars = {};\n      for (const c of this.generatedRoster)';
    if (!src.includes(loopAnchor) || !src.includes(dupInit)) {
      console.log('FAIL: fix anchors not found — source changed, re-verify the fix by hand');
      process.exit(1);
    }
    // hoist init above the hydration loop, drop the duplicate below
    src = src.replace(loopAnchor, '      this.state.village.rosterChars = {};\n' + loopAnchor);
    src = src.replace(dupInit, '\n      for (const c of this.generatedRoster)');
  }
  eval(src);
}
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  let threw = null;
  try {
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  } catch (e) { threw = e; }
  ok(!threw, `newGame does not throw (threw: ${threw && threw.message})`);
  if (!threw) {
    const v = Game.state.village;
    ok(v.rosterChars && typeof v.rosterChars === 'object', 'rosterChars initialized');
    const bgIds = (v.roster || []).filter(id => !Game.generatedRoster.find(c => c.id === id));
    ok(bgIds.length > 0, `bg members drawn (${bgIds.length})`);
    const missing = bgIds.filter(id => !(v.rosterChars || {})[id]);
    ok(missing.length === 0, `all hydrated bg members persisted in rosterChars (missing: ${missing.join(',') || 'none'})`);
    const genMissing = Game.generatedRoster.filter(c => !(v.rosterChars || {})[c.id]);
    ok(genMissing.length === 0, `generated cast persisted in rosterChars (missing: ${genMissing.length})`);
    Game.depart();
    ok(true, 'depart() runs after newGame');
  }
  console.log(`\n${pass} passed, ${fail} failed ${APPLY_FIX ? '(WITH FIX)' : '(current tree)'}`);
  process.exit(fail ? 1 : 0);
})();
