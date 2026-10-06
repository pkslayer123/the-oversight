// Sunbasker sun-guarantee (Steve 2026-10-06): the sunbasker flattens in
// shade by design ("no sun, no fight") — the debug scenario must spawn it
// on a sun tile or the fight is a non-event.
// Usage: node scripts/test-scenario-intros2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  // Run the scenario several times (toWildNode picks a deterministic-ish
  // wild node; the guarantee must hold regardless of grid shading).
  for (let run = 0; run < 3; run++) {
    Game.debugScenario('sunbasker');
    const m = Game.state.scholar.monster;
    ok(`run ${run}: monster spawned`, !!m && m.id === 'sunbasker');
    ok(`run ${run}: monster NOT in shade (sun-guarantee)`,
      m && Game.tbInShade(m.mx, m.my) === false);
    const s = Game.state.scholar;
    ok(`run ${run}: player on-grid`, s.mx >= 0 && s.mx <= 8 && s.my >= 0 && s.my <= 8);
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    const pc = detail[s.my] && detail[s.my][s.mx];
    ok(`run ${run}: player tile walkable`, !!pc && !Game.cellProps(pc).blocks);
    ok(`run ${run}: player three tiles west of monster (intro holds)`,
      s.my === m.my && s.mx === m.mx - 3);
  }
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
