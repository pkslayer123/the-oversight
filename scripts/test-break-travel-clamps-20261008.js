// BREAK-IT: TRAVEL & MAP — stale 7x7 world clamps (Steve 2026-10-08).
// ATTACK: the world grew to 9x9 on 2026-10-07, but three travel paths still
// clamp to the old 7x7 (0..6):
//   (a) npcSetNode() clamped node coords to 0..6 -> NPCs could NEVER occupy
//       rim nodes 7-8 (a third of the map is NPC-free; away-drift silently
//       swallowed at the clamp).
//   (b) npcNodeTravel()'s adjacent-step duplicated the 0..6 clamp.
//   (c) toWildNode() (debug-scenarios.js) scanned only the 0..6 corner AND
//       measured ">=2 from Haven" from (3,3) instead of Haven (4,4) -> tiles
//       like (4,5) passed the filter while ADJACENT to Haven (spawn-rule
//       violation: "out in the wild, not the haven grounds"), and rim
//       rows/cols 7-8 were never considered.
// FIX: clamp to 0..8; toWildNode scans 0..8 measured from the real Haven
// tile (v.px ?? 4, v.py ?? 4), and marks the arrival seen.
// Usage: node scripts/test-break-travel-clamps-20261008.js
//        BEFORE=1 node scripts/test-break-travel-clamps-20261008.js (pre-fix files from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt-game-before.js', { cwd: ROOT });
  execSync('git show HEAD:src/js/debug-scenarios.js > /tmp/bt-debug-before.js', { cwd: ROOT });
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
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

let _seed = 31337;
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = s; };
Math.random = rng;

global.window = global;
const gameFile = BEFORE ? '/tmp/bt-game-before.js' : path.join(ROOT, 'src/js/game.js');
const dbgFile = BEFORE ? '/tmp/bt-debug-before.js' : path.join(ROOT, 'src/js/debug-scenarios.js');
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'GAMEFILE', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js',
  'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'DBGFILE', 'build.js'];
for (const f of LIST) {
  // BEFORE/AFTER variants take sentinel slots to preserve index.html order:
  // game.js loads between combat.js and encounters.js; debug-scenarios.js last.
  if (f === 'DBGFILE') continue;
  const p = f === 'GAMEFILE' ? gameFile : path.join(ROOT, 'src/js', f);
  try { eval(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + p + ': ' + e.message); process.exit(2); }
}
// AFTER only: the objective system (villager-objectives.js) owns away-movement
// now — npcNodeTravel calls this.objAwayStep. BEFORE mode must keep testing
// genuine old code, so it stays unloaded there.
if (!BEFORE) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', 'villager-objectives.js'), 'utf8')); }
  catch (e) { console.error('EVAL FAIL villager-objectives.js: ' + e.message); process.exit(2); }
}
try { eval(fs.readFileSync(dbgFile, 'utf8')); } catch (e) { console.error('EVAL FAIL dbg: ' + e.message); process.exit(2); }
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// toWildNode is closure-private in debug-scenarios.js. AFTER mode has the
// Game.debugToWildNode test hook; BEFORE mode extracts the real old function
// text from the HEAD file so the "before" run tests genuine old code.
function oldToWildNode() {
  const src = fs.readFileSync('/tmp/bt-debug-before.js', 'utf8');
  const m = src.match(/function toWildNode\(\) \{[\s\S]*?\n  \}/);
  if (!m) throw new Error('could not extract old toWildNode');
  return eval('(' + m[0] + ')');
}
const toWildNode = BEFORE ? oldToWildNode() : Game.debugToWildNode;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function fresh() {
  rng.reset(parseInt(process.env.SEED || "31337", 10));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.over = false;
  Game.dayPart = 1; // midday, not night
  return (Game.state.village.roster || []).find(id => id !== Game.villagerId);
}

// ---- ATTACK A: npcSetNode must reach the rim ----
{
  const rid = fresh();
  Game.npcSetNode(rid, 8, 8);
  const n = Game.npcNode(rid);
  console.log(`  [info] A: npcSetNode(8,8) -> (${n.nx},${n.ny})`);
  if (BEFORE) ok('BEFORE: rim node clamped away (NPCs locked out of 7-8)', n.nx === 6 && n.ny === 6, `got (${n.nx},${n.ny})`);
  else ok('AFTER: npcSetNode reaches (8,8)', n.nx === 8 && n.ny === 8, `got (${n.nx},${n.ny})`);
}

// ---- ATTACK B: away-movement across the old clamp line ----
// (2026-10-08 objectives update: away movement is no longer pure drift —
// villagers pursue objective targets with a little meander. The property this
// attack pins is the CLAMP: movement must be able to cross x=6. The AFTER
// branch pins it through the new pursue path, deterministically.)
{
  const rid = fresh();
  const v = Game.state.village, s = Game.state.scholar;
  Game.npcSetNode(rid, 6, 4);
  v.away = v.away || {};
  v.away[rid] = { nx: 6, ny: 4, purpose: 'explore', sinceDay: s.day, sincePart: Game.dayPart, duration: 9999 };
  if (BEFORE) {
    const realRoster = v.roster;
    v.roster = [Game.villagerId, rid]; // only our NPC moves: scripted randoms stay aligned
    // script: drift fires (0.1<0.3), dx=+1 (0.9), dy=0 (0.5); then fall back to seeded rng
    const script = [0.1, 0.9, 0.5];
    const realRandom = Math.random;
    Math.random = () => script.length ? script.shift() : realRandom();
    try { Game.npcNodeTravel(); } finally { Math.random = realRandom; }
    v.roster = realRoster;
    const n = Game.npcNode(rid);
    console.log(`  [info] B: drift from (6,4) east -> (${n.nx},${n.ny})`);
    ok('BEFORE: drift swallowed at the 6-clamp', n.nx === 6 && n.ny === 4, `got (${n.nx},${n.ny})`);
  } else {
    // new model: objective with a rim target, tightened (no meander — the
    // pursue step is deterministic). Must step (6,4) -> (7,4).
    const hx = v.px ?? 4, hy = v.py ?? 4;
    const o = Game.objOf(rid);
    o.kind = 'EXPLORE'; o.purpose = 'explore'; o.state = 'out'; o.indoor = false;
    o.tx = 8; o.ty = 4; o.tightness = 6; o.tightened = true; o.partsLeft = 4;
    Game.objAwayStep(rid, Game.npcNode(rid), v.away[rid], hx, hy);
    const n = Game.npcNode(rid);
    console.log(`  [info] B: pursue (6,4)->(8,4) -> (${n.nx},${n.ny})`);
    ok('AFTER: pursue crosses into (7,4)', n.nx === 7 && n.ny === 4, `got (${n.nx},${n.ny})`);
  }
  delete v.away[rid];
}

// ---- ATTACK C: toWildNode spawn-rule honesty ----
function setWorld(wildTiles) {
  // wildTiles: [[x,y],...] meadow; everything else ruin; (4,4) haven
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.map.tiles[y][x];
    t.type = 'ruin'; t.visited = false; t.revealed = false;
  }
  Game.map.tiles[4][4].type = 'haven';
  for (const [x, y] of wildTiles) Game.map.tiles[y][x].type = 'meadow';
  Game.map.px = 4; Game.map.py = 4;
}
{
  fresh();
  // C1: the ONLY wild tile is (4,5) — adjacent to Haven. Old code measured
  // from (3,3): d=3 >= 2, so it "qualified" and dropped you on the doorstep.
  setWorld([[4, 5]]);
  const r = toWildNode();
  const d = Math.abs(Game.map.px - 4) + Math.abs(Game.map.py - 4);
  console.log(`  [info] C1: wild=(4,5) only -> toWildNode=${r}, player=(${Game.map.px},${Game.map.py}) d=${d}`);
  if (BEFORE) {
    ok('BEFORE: drops you adjacent to Haven (spawn rule violated)', r === true && d === 1, `d=${d}`);
  } else {
    ok('AFTER: refuses — no tile >=2 from Haven', r === false, `r=${r} d=${d}`);
  }
}
{
  fresh();
  // C2: the ONLY wild tile is (8,8) — old code never scanned rows/cols 7-8.
  setWorld([[8, 8]]);
  const r = toWildNode();
  console.log(`  [info] C2: wild=(8,8) only -> toWildNode=${r}, player=(${Game.map.px},${Game.map.py})`);
  if (BEFORE) {
    ok('BEFORE: rim tile invisible to the scanner', r === false, `r=${r}`);
  } else {
    ok('AFTER: rim tile found', r === true && Game.map.px === 8 && Game.map.py === 8, `r=${r} at (${Game.map.px},${Game.map.py})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
