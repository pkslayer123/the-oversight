// BREAK-IT: TRAVEL & MAP round 2 — HONESTY: committed-walk double kcal charge (Steve 2026-10-08).
// ATTACK: beginPathWalk prepays 10 kcal/square and announces "Walking N squares (C kcal)".
// pathStep ALSO charged 2 kcal/step on top — a committed walk cost 12N while the UI
// promised 10N. The header comment ("The kcal cost was prepaid by beginPathWalk"),
// the original commit message ("beginPathWalk (10 kcal/sq prepaid) + pathStep (1 tick)"),
// AND the project's own scripts/test-movement.js ("pathStep: no double kcal charge") all
// say the kcal is prepaid. The code disagreed; test-movement.js was FAILING (47/48).
// FIX: pathStep charges the 1 tick only; the prepaid 10/sq stands. The wanderer/second-skin
// travel.cost_mult ("-10% travel cost") now also applies to the prepay — before, the
// modifier's promise didn't cover the most expensive travel in the game.
// Usage: node scripts/test-travel-break2-doublecharge-20261008.js        (AFTER fix)
//        BEFORE=1 node scripts/test-travel-break2-doublecharge-20261008.js (pre-fix code from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt2-game-before.js', { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}
let _seed = 424242;
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = s; };
Math.random = rng;
global.window = global;
const gameFile = BEFORE ? '/tmp/bt2-game-before.js' : path.join(ROOT, 'src/js/game.js');
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', null, 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js',
  'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const p = f === null ? gameFile : path.join(ROOT, 'src/js', f);
  try { eval(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + p + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}

const SEED = parseInt(process.env.SEED || "424242", 10);
rng.reset(SEED);
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
const s = Game.state.scholar;
s.kcal = 9000; s.hydration = 100; s.health = 100;

// find a 2-6 step walkable path
const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
const sx = s.mx ?? 4, sy = s.my ?? 4;
const detail = Game.genDetail(Game.map.px, Game.map.py);
const blockedAt = (x, y) => { const c = detail[y] && detail[y][x]; return Game.cellProps(c).blocks; };
let target = null, testPath = null;
outer:
for (let ty = 0; ty < 9; ty++) for (let tx = 0; tx < 9; tx++) {
  if (blockedAt(tx, ty)) continue;
  const p = Game.findPath(sx, sy, tx, ty);
  if (p && p.length >= 2 && p.length <= 6) { target = [tx, ty]; testPath = p; break outer; }
}
if (!testPath) { console.error('no test path found'); process.exit(2); }

// --- the double-charge ---
const kcal0 = s.kcal;
const announced = [];
const origSay = Game.say; Game.say = (m) => announced.push(String(m));
const walk = Game.beginPathWalk(target[0], target[1]);
Game.say = origSay;
const prepaid = Math.round(kcal0 - s.kcal);
const announcedCost = (announced.join(' ').match(/Walking \d+ squares \((\d+) kcal\)/) || [])[1];
console.log(`  [info] path=${testPath.length} squares, prepaid=${prepaid}, announced=${announcedCost}`);
for (const [x, y] of testPath) { if (!Game.pathStep(x, y)) break; }
const extra = Math.round(kcal0 - s.kcal) - prepaid;
console.log(`  [info] extra kcal charged by pathStep: ${extra}`);

if (BEFORE) {
  ok('BEFORE: pathStep double-charges (bug real)', extra === testPath.length * 2, `extra=${extra}`);
  ok('BEFORE: announced cost understates the real cost', prepaid + extra !== prepaid, `${prepaid} announced vs ${prepaid + extra} charged`);
} else {
  ok('AFTER: no double charge — total == prepaid == announced', extra === 0 && prepaid === parseInt(announcedCost, 10),
    `extra=${extra} prepaid=${prepaid} announced=${announcedCost}`);
}

// --- cost_mult applies to the prepay (AFTER only; BEFORE had no mult here) ---
if (!BEFORE) {
  rng.reset(SEED);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s2 = Game.state.scholar;
  s2.kcal = 9000; s2.hydration = 100; s2.health = 100;
  grant('wanderer', 1); // -10% travel cost
  const sx2 = s2.mx ?? 4, sy2 = s2.my ?? 4;
  const detail2 = Game.genDetail(Game.map.px, Game.map.py);
  const blockedAt2 = (x, y) => { const c = detail2[y] && detail2[y][x]; return Game.cellProps(c).blocks; };
  let target2 = null, tp2 = null;
  outer2:
  for (let ty = 0; ty < 9; ty++) for (let tx = 0; tx < 9; tx++) {
    if (blockedAt2(tx, ty)) continue;
    const p = Game.findPath(sx2, sy2, tx, ty);
    if (p && p.length >= 2 && p.length <= 6) { target2 = [tx, ty]; tp2 = p; break outer2; }
  }
  if (tp2) {
    const k0 = s2.kcal;
    Game.beginPathWalk(target2[0], target2[1]);
    const charged = Math.round(k0 - s2.kcal);
    const expect = Math.round(tp2.length * 10 * 0.9);
    ok('AFTER: wanderer -10% applies to committed-walk prepay', charged === expect, `charged=${charged} expect=${expect}`);
  } else { ok('AFTER: wanderer test path found', false); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
