// Regression tests for partner-reported bugs (2026-10-05):
// 1. Movement must cost kcal (2/step) and time (1 tick)
// 2. cellActions must return 'Go inside' for lodge cells
// 3. Actions must be available after movement (no stale state)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  console.log('\n=== Movement costs ===');
  s.kcal = 2000; s.mx = 4; s.my = 4; s.insideHaven = false;
  Game.map.px = 3; Game.map.py = 3;
  const k1 = s.kcal, t1 = s.dayTicks || 0;
  Game.microMove(4, 5);
  ok('microMove costs 2 kcal', Math.round(k1 - s.kcal) === 2);
  ok('microMove costs 1 tick', (s.dayTicks || 0) - t1 === 1);

  const k2 = s.kcal, t2 = s.dayTicks || 0;
  Game.pathStep(4, 6);
  ok('pathStep costs 2 kcal', Math.round(k2 - s.kcal) === 2);
  ok('pathStep costs 1 tick', (s.dayTicks || 0) - t2 === 1);

  console.log('\n=== Haven re-entry ===');
  // Simulate haven grounds
  s.mx = 4; s.my = 2; s.insideHaven = false;
  const actions = Game.cellActions(4, 1); // lodge cell
  ok('Go inside action available at lodge', actions.includes('Go inside'));
  
  // Enter and verify state
  const entered = Game.enterBuilding();
  ok('enterBuilding succeeds on haven node', entered === true);
  ok('insideHaven is true after entering', s.insideHaven === true);

  // Exit and verify
  Game.exitBuilding();
  ok('insideHaven is false after exiting', s.insideHaven === false);
  ok('player at grounds doorstep (4,2)', s.mx === 4 && s.my === 2);

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
