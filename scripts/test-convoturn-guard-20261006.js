// Proof test: convoTurn guard against missing/garbage choice ids
// (socialite run 3, 2026-10-06). Before the fix, Game.convoTurn(vid,
// undefined) threw TypeError at party-formal.js:907
// (choiceId.indexOf on undefined) — the outermost wrapper was the only one
// without a typeof check, so one bad id killed the whole chat. After the
// fix it returns null, which the chat UI already handles (closes + refresh).
// Usage: node scripts/test-convoturn-guard-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convo-wants.js', 'src/js/convo-beats.js', 'src/js/convo-dialogue.js', 'src/js/convoTopics.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
 'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const me = Game.villagerId;
  const vid = (Game.state.village.roster || []).find(id => id !== me);
  Game.startConvo(vid);

  for (const bad of [undefined, null, '', 0, 42, {}, []]) {
    let threw = false, r;
    try { r = Game.convoTurn(vid, bad); }
    catch (e) { threw = true; r = 'THREW: ' + e.message; }
    check(`convoTurn(${JSON.stringify(bad)}) does not throw`, !threw, String(r).slice(0, 80));
    check(`convoTurn(${JSON.stringify(bad)}) returns null (UI-safe)`, r === null, JSON.stringify(r));
  }

  // sanity: a real choice still works after the bad ones
  const cids = (Game.convoChoices(vid) || []).map(c => c.id);
  check('menu still intact after bad ids', cids.length > 0 && cids.includes('leave'), cids.join(','));
  let r2, threw2 = false;
  try { r2 = Game.convoTurn(vid, 'leave'); } catch (e) { threw2 = true; }
  check('leave still works', !threw2);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
