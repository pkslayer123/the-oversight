// EXPLORER BREAK-IT 2026-10-10 — S1 ENTRY-CELL STRAND (softlock)
// ATTACK: travelTo places the player via findWalkableEntry — nearest walkable
// cell to the desired edge entry. If that cell is a pocket (walkable, but all
// 8 neighbors block — a dirt cell ringed by water/trees/walls), the player
// spawns with ZERO grid moves: no step, no path, no examine-adjacent, no
// forage-adjacent. Node exits may still exist, but on the grid itself the
// player is stranded in a 1-cell pocket they never chose. The honest entry
// is the nearest walkable cell WITH a way out.
//
// FIX: findWalkableEntry prefers the nearest walkable cell that has at least
// one walkable neighbor; it falls back to the nearest walkable only when the
// whole tile is pockets (the old "unreachable in practice" case). The
// monster follow-through entry uses the same helper, so it benefits too.
// Usage: node scripts/test-explorer-entry-strand-20261010.js
//        BEFORE=1 node scripts/test-explorer-entry-strand-20261010.js
//        SEED=999 node scripts/test-explorer-entry-strand-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
let gameSrc;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/exs-game-before.js', { cwd: ROOT });
  gameSrc = fs.readFileSync('/tmp/exs-game-before.js', 'utf8');
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
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
const SEED = parseInt(process.env.SEED || '20261010', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rngReset(s) { _rng = mulberry32(s === undefined ? SEED : s); }
Math.random = () => _rng();
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', '__GAME__', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = f === '__GAME__' ? gameSrc : fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
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
function setup() {
  rngReset();
  Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  return s;
}
// Build a controlled detail grid: a pocket (walkable cell with no walkable
// neighbors) near the west edge, plus open walkable ground elsewhere.
function pocketDetail() {
  const g = [];
  for (let y = 0; y < 9; y++) { g.push([]); for (let x = 0; x < 9; x++) g[y].push('grass'); }
  // ring of water around (1,4): the pocket cell
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    g[4 + dy][1 + dx] = 'water';
  }
  g[4][1] = 'dirt'; // the pocket: walkable, zero walkable neighbors
  // open walkable ground on the east half (an honest entry exists farther in)
  for (let y = 2; y <= 6; y++) for (let x = 5; x <= 7; x++) g[y][x] = 'grass';
  return g;
}
function hasWalkableNeighbor(detail, cx, cy) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const ax = cx + dx, ay = cy + dy;
    if (ax < 0 || ax > 8 || ay < 0 || ay > 8) continue;
    const c = detail[ay] && detail[ay][ax];
    if (c && !Game.cellProps(c).blocks) return true;
  }
  return false;
}

// ---- S1: entry never strands the player in a pocket ----
{
  setup();
  const realGenDetail = Game.genDetail.bind(Game);
  const pd = pocketDetail();
  Game.genDetail = (x, y) => pd; // controlled tile
  // sanity: (1,4) really is a pocket in this grid
  ok('S1 setup: (1,4) is walkable', !!pd[4][1] && !Game.cellProps(pd[4][1]).blocks);
  ok('S1 setup: (1,4) has no walkable neighbors', !hasWalkableNeighbor(pd, 1, 4));
  // travel eastward: desired entry is the west edge near (0,4) — nearest
  // walkable is the pocket at (1,4).
  const entry = Game.findWalkableEntry(3, 3, 0, 4);
  const stranded = !hasWalkableNeighbor(pd, entry.x, entry.y);
  if (BEFORE) {
    ok('BEFORE: entry is the pocket cell (1,4) — zero grid moves on arrival',
      entry.x === 1 && entry.y === 4, `entry=(${entry.x},${entry.y})`);
    ok('BEFORE: the pocket strands the player (the softlock)',
      stranded === true, 'no walkable neighbor');
  } else {
    ok('AFTER: entry is NOT the pocket cell',
      !(entry.x === 1 && entry.y === 4), `entry=(${entry.x},${entry.y})`);
    ok('AFTER: the entry cell has a walkable neighbor (a way out)',
      stranded === false, `entry=(${entry.x},${entry.y})`);
  }
  Game.genDetail = realGenDetail;
}

// ---- S2: normal case unchanged — nearest walkable with an exit wins ----
{
  setup();
  const realGenDetail = Game.genDetail.bind(Game);
  const pd = pocketDetail();
  Game.genDetail = (x, y) => pd;
  // desired entry (8,4): nearest walkable is open ground, has neighbors.
  const entry = Game.findWalkableEntry(3, 3, 8, 4);
  if (BEFORE) {
    ok('BEFORE: open-ground entry is the nearest walkable (8,4)',
      entry.x === 8 && entry.y === 4, `entry=(${entry.x},${entry.y})`);
  } else {
    ok('AFTER: open-ground entry still the nearest walkable (8,4)',
      entry.x === 8 && entry.y === 4, `entry=(${entry.x},${entry.y})`);
  }
  Game.genDetail = realGenDetail;
}

// ---- S3: all-pockets fallback — nearest walkable, no crash ----
{
  setup();
  const realGenDetail = Game.genDetail.bind(Game);
  // every cell blocking except one pocket at (4,4)
  const g = [];
  for (let y = 0; y < 9; y++) { g.push([]); for (let x = 0; x < 9; x++) g[y].push('water'); }
  g[4][4] = 'dirt';
  Game.genDetail = (x, y) => g;
  const entry = Game.findWalkableEntry(3, 3, 0, 0);
  ok('S3: all-pocket tile falls back to the lone walkable cell, no crash',
    entry.x === 4 && entry.y === 4, `entry=(${entry.x},${entry.y})`);
  Game.genDetail = realGenDetail;
}

console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail (seed ${SEED}) ===`);
process.exit(fail > 0 ? 1 : 0);
