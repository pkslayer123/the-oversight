// BREAK-IT: TRAVEL & MAP round 2 — HONESTY: tbBarrierExit lies when the far node is blocked (Steve 2026-10-08).
// ATTACK: pushing through the grid-edge barrier mid-combat calls travelTo(nx, ny) on the
// next node. If that node is blocked (fallen tree / rubble / fast creek), travelTo REFUSES
// and returns the blockage object — but the old tbBarrierExit ignored the return:
//   - fled branch: said "you crash through the treeline to a new area... They lose your
//     trail", ended the fight as fled — while map.px/py never moved and the monster was
//     still on the tile.
//   - fight-continues branch: said "you stumble into a new area", then scrambled the
//     fighter grid positions on the node you never left.
// FIX: attempt the crossing FIRST; on blockage say the honest blocked line (travelTo already
// named the blockage), spend the push, keep the fight going — no tbEnd, no repositioning.
// Usage: node scripts/test-travel-break2-barrierblock-20261008.js        (AFTER fix)
//        BEFORE=1 node scripts/test-travel-break2-barrierblock-20261008.js (pre-fix code from git HEAD)
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
let _seed = 7;
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
const realRandom = Math.random;

function setupBlockedEast() {
  rng.reset(7);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  Game.startCombat('hushwolf');
  const p = Game.tbFighter('p');
  p.mx = 8; p.my = 4;
  Game.state.scholar.mx = 8; Game.state.scholar.my = 4;
  const px = Game.map.px, py = Game.map.py;
  Game.tileAt(px + 1, py).blockFrom = { type: 'fallen_tree', dx: -1, dy: 0 };
  return { px, py };
}

function runExit(forceRoll) {
  // forceRoll: 0.1 => flee succeeds, 0.9 => fight continues
  Math.random = () => forceRoll;
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  const r = Game.tbBarrierExit(1, 0);
  Game.say = origSay; Math.random = realRandom;
  return { r, says };
}

// ---- fled branch, blocked far side ----
{
  const { px, py } = setupBlockedEast();
  const { r, says } = runExit(0.1);
  const moved = Game.map.px !== px || Game.map.py !== py;
  const fightOver = !Game.tbfight || !!Game.tbfight.over;
  const claimsNewArea = says.some(m => /new area/i.test(m));
  console.log(`  [info fled] moved=${moved} fightOver=${fightOver} claimsNewArea=${claimsNewArea}`);
  if (BEFORE) {
    ok('BEFORE: fled branch claims a new area without moving (lie real)', claimsNewArea && !moved);
    ok('BEFORE: fled branch ends the fight while the monster is still here', fightOver && !moved);
  } else {
    ok('AFTER: blocked flee does NOT claim a new area', !claimsNewArea, says.map(m => m.slice(0, 80)).join(' | '));
    ok('AFTER: blocked flee does NOT end the fight', !fightOver);
    ok('AFTER: blocked flee says the honest blocked line', says.some(m => /no escape that way/i.test(m)));
  }
}

// ---- fight-continues branch, blocked far side ----
{
  const { px, py } = setupBlockedEast();
  const pBefore = [Game.state.scholar.mx, Game.state.scholar.my];
  const { r, says } = runExit(0.9);
  const moved = Game.map.px !== px || Game.map.py !== py;
  const claimsNewArea = says.some(m => /new area/i.test(m));
  const pAfter = [Game.state.scholar.mx, Game.state.scholar.my];
  const scrambled = pAfter[0] !== pBefore[0] || pAfter[1] !== pBefore[1];
  console.log(`  [info cont] moved=${moved} claimsNewArea=${claimsNewArea} pos ${pBefore} -> ${pAfter}`);
  if (BEFORE) {
    ok('BEFORE: continues branch claims a new area without moving (lie real)', claimsNewArea && !moved);
    ok('BEFORE: continues branch scrambles grid positions on the unmoved node', scrambled && !moved);
  } else {
    ok('AFTER: blocked push does NOT claim a new area', !claimsNewArea);
    ok('AFTER: blocked push does NOT scramble positions', !scrambled, `${pBefore} -> ${pAfter}`);
    ok('AFTER: fight still active after blocked push', !!Game.tbfight && !Game.tbfight.over);
  }
}

// ---- regression: unblocked flee still works (AFTER only) ----
if (!BEFORE) {
  rng.reset(7);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  Game.startCombat('hushwolf');
  const p = Game.tbFighter('p');
  p.mx = 8; p.my = 4;
  Game.state.scholar.mx = 8; Game.state.scholar.my = 4;
  const px = Game.map.px;
  // ensure the east neighbor is NOT blocked
  delete Game.tileAt(px + 1, Game.map.py).blockFrom;
  Math.random = () => 0.1;
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  Game.tbBarrierExit(1, 0);
  Game.say = origSay; Math.random = realRandom;
  ok('AFTER: unblocked flee still moves + ends fight',
    Game.map.px === px + 1 && (!Game.tbfight || !!Game.tbfight.over),
    `px ${px} -> ${Game.map.px}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
