// BREAK-IT: TRAVEL & MAP — animal continuity (Steve 2026-10-08).
// ATTACK: scholar.animal is the live animal on your current node's grid.
// travelTo() is supposed to PARK it on the tile you LEAVE ("animals don't
// follow you, but they don't vanish either — they stay where you left them")
// and PICK UP any animal parked on the arrival tile. The old code computed
// the "old tile" via tileAt(this.map.px, this.map.py) AFTER the position
// update — i.e. the ARRIVAL tile. Two breaks in one block:
//   (a) the animal you were stalking teleported to the new node WITH you
//       (continuity lie), and
//   (b) the arrival-pickup was instantly undone (parked right back, live
//       encounter never happened — a dead feature).
// FIX: park on tileAt(fromX, fromY) BEFORE the position update; drop the
// post-update block entirely.
// Usage: node scripts/test-break-travel-animal-20261008.js
//        BEFORE=1 node scripts/test-break-travel-animal-20261008.js (pre-fix game.js from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt-game-before.js', { cwd: ROOT });
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

let _seed = 777;
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = s; };
Math.random = rng;

global.window = global;
const gameFile = BEFORE ? '/tmp/bt-game-before.js' : path.join(ROOT, 'src/js/game.js');
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

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// Isolate the continuity mechanics from the encounter spawners.
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

function freshAt(ax, ay) {
  rng.reset(parseInt(process.env.SEED || "777", 10));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.over = false;
  Game.map.px = ax; Game.map.py = ay;
  Game.state.scholar.animal = null;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
}
function adjTarget() {
  const ax = Game.map.px, ay = Game.map.py;
  return Game.travelTargets().find(t => Math.abs(t.x - ax) + Math.abs(t.y - ay) === 1 && !Game.travelBlockage(t.x, t.y));
}

// ---- ATTACK A: the stalked animal must stay on the tile you LEFT ----
freshAt(4, 4);
const tgtA = adjTarget();
Game.state.scholar.animal = { id: 'cottontail_rabbit', mx: 4, my: 4 };
Game.travelTo(tgtA.x, tgtA.y);
const leftTile = Game.tileAt(4, 4).animal;
const arrivTileA = Game.tileAt(tgtA.x, tgtA.y).animal;
console.log(`  [info] A: left tile animal=${leftTile && leftTile.id}, arrival tile animal=${arrivTileA && arrivTileA.id}, live=${Game.state.scholar.animal && Game.state.scholar.animal.id}`);
if (BEFORE) {
  ok('BEFORE: animal teleports to arrival tile (continuity broken)', !!(arrivTileA && arrivTileA.id === 'cottontail_rabbit'), `arrival=${arrivTileA && arrivTileA.id}`);
  ok('BEFORE: left tile keeps nothing', !leftTile, `left=${leftTile && leftTile.id}`);
} else {
  ok('AFTER: animal stays on the tile you left', !!(leftTile && leftTile.id === 'cottontail_rabbit'), `left=${leftTile && leftTile.id}`);
  ok('AFTER: arrival tile does not gain your animal', !arrivTileA, `arrival=${arrivTileA && arrivTileA.id}`);
  ok('AFTER: no longer live after parking', Game.state.scholar.animal === null, `live=${Game.state.scholar.animal && Game.state.scholar.animal.id}`);
}

// ---- ATTACK B: a parked animal on the arrival tile must become a live encounter ----
freshAt(4, 4);
const tgtB = adjTarget();
Game.tileAt(tgtB.x, tgtB.y).animal = { id: 'white_tailed_deer', mx: 3, my: 3 };
Game.travelTo(tgtB.x, tgtB.y);
const live = Game.state.scholar.animal;
const parkedAfter = Game.tileAt(tgtB.x, tgtB.y).animal;
console.log(`  [info] B: live=${live && live.id}, still parked=${parkedAfter && parkedAfter.id}`);
if (BEFORE) {
  ok('BEFORE: arrival pickup instantly undone (dead feature)', live === null && !!(parkedAfter && parkedAfter.id === 'white_tailed_deer'), `live=${live && live.id}`);
} else {
  ok('AFTER: parked animal becomes a live encounter', !!(live && live.id === 'white_tailed_deer'), `live=${live && live.id}`);
  ok('AFTER: tile no longer holds it parked', !parkedAfter, `parked=${parkedAfter && parkedAfter.id}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
