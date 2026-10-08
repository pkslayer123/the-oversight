// Regression: defied-exile uprising must fire when the exiled player stays at Haven.
// (Steve 2026-10-07) justice.js justiceTick hardcoded atHaven to (3,3) while the
// whole codebase puts the village node at (v.px ?? 4, v.py ?? 4) — so the mob
// NEVER came for an exile who defied the moot and stayed. Usage:
//   node scripts/test-brawler-defied-exile-uprising-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// seeded PRNG so this proof is reproducible (mulberry32, SEED env override)
let _s = (Number(process.env.SEED) || 20261007) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_s);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js', 'src/js/betrayal.js',
 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}
function note(s) { console.log(`  → ${s}`); }

// put a fresh state at the exiled-but-staying point of the ladder
async function setupExiled(mapPx, mapPy) {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const others = v.roster.filter(id => id !== Game.villagerId);
  const j = Game.justiceState();
  j.stage = 3;
  j.exiled = true;
  j.crimes.length = 0;
  j.crimes.push({ type: 'murder', victim: others[0], day: Game.state.scholar.day, witnessed: true, key: 't:1' });
  Game.map.px = mapPx; Game.map.py = mapPy;
  return others;
}

(async () => {
  // ---- case 1: exiled, still at the village node -> the village comes ----
  const others = await setupExiled(4, 4); // default village node (v.px ?? 4)
  Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4;
  note(`exiled at haven node (${Game.map.px},${Game.map.py})`);
  Game.justiceTick();
  ok('defied exile at Haven -> stage 4', Game.justiceStage() === 4);
  ok('defied exile at Haven -> uprising fight starts', !!Game.tbfight);
  if (Game.tbfight) {
    const mob = Game.tbfight.fighters.filter(f => f.uprising);
    ok('uprising is a mob (2-4 attackers), not an army', mob.length >= 2 && mob.length <= 4);
    const humanF = mob.filter(f => f.kind === 'hostile' && f.villagerId);
    ok('uprising attackers are villagers', humanF.length === mob.length);
  }
  if (Game.tbfight) { Game.tbEnd('fled'); Game.tbfight = null; Game._lastBetrayal = null; }
  // quiet everyone else's fear so the second case is clean
  Game.justiceState().stage = 3; Game.justiceState().exiled = true;
  Game.justiceState().crimes.length = 0;
  Game.tbfight = null;

  // ---- case 2: exiled, but already walked away -> no mob materializes ----
  Game.map.px = 0; Game.map.py = 0;
  note('exiled but far from Haven (0,0)');
  Game.justiceTick();
  ok('exiled away from Haven -> stays stage 3', Game.justiceStage() === 3);
  ok('exiled away from Haven -> no uprising fight', !Game.tbfight);

  // ---- case 3: custom village node still works (not hardcoded 4,4) ----
  await setupExiled(6, 6);
  Game.state.village.px = 6; Game.state.village.py = 6;
  Game.map.px = 6; Game.map.py = 6;
  note('village node moved to (6,6), exiled standing there');
  Game.justiceTick();
  ok('custom village node -> uprising fires', Game.justiceStage() === 4 && !!Game.tbfight);
  if (Game.tbfight) { Game.tbEnd('fled'); Game.tbfight = null; Game._lastBetrayal = null; }

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})();
