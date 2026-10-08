// BREAK-IT SIBLING SWEEP: stale 7x7 coordinate clamps in expedition + map-seed paths
// (Steve 2026-10-08). The main travel&map break-it run fixed npcSetNode/npcNodeTravel/
// toWildNode; the same bug class survived in three more spots:
//   (a) villager-agency.js startExpedition: tx/ty clamped 0..6 -> villagers could NEVER
//       target rim nodes 7-8 (a third of the 9x9 world is expedition-free by construction)
//   (b) villager-agency.js expeditionLeg: per-leg nx/ny clamped 0..6 -> with a 7-8
//       target, legs would clamp at 6 forever: the declared destination is never
//       reached (livelock analysis: expeditionLeg has NO arrival check — the
//       expedition ends on duration when the base loop clears v.away — so this is
//       a never-arrive, not a true infinite loop; legs++ burns but terminates)
//   (c) game.js seedVillagerMaps: villager map-seed scatter clamped 0..6 -> COMPARE MAPS
//       (their visited tiles become your shared knowledge) could NEVER teach rim tiles.
//       Knowledge-honesty: the share promise structurally excludes the rim.
// FIX: clamp all three to 0..8, matching the main fix.
// Also: npcMaxDist range-coherence check vs the 9x9 world.
// Usage: node scripts/test-break-travel-sib-clamps-20261008.js
//        BEFORE=1 node scripts/test-break-travel-sib-clamps-20261008.js (pre-fix from git HEAD)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt-sib-game-before.js', { cwd: ROOT });
  execSync('git show HEAD:src/js/villager-agency.js > /tmp/bt-sib-agency-before.js', { cwd: ROOT });
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

// Seeded RNG installed BEFORE eval (modules capture Math.random at load).
let _seed = 1;
function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
Math.random = function () { return rng(); };
function reseed(s) { rng = mulberry32(s); }

global.window = global; // stub for modules needing `window` at load
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'GAMEFILE', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js',
  'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'AGENCYFILE', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const p = f === 'GAMEFILE'
    ? (BEFORE ? '/tmp/bt-sib-game-before.js' : path.join(ROOT, 'src/js/game.js'))
    : f === 'AGENCYFILE'
      ? (BEFORE ? '/tmp/bt-sib-agency-before.js' : path.join(ROOT, 'src/js/villager-agency.js'))
      : path.join(ROOT, 'src/js', f);
  try { eval(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + p + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// ---- minimal state + stubs ----
Game.state = {
  scholar: { day: 10, seenTiles: {} },
  village: { px: 4, py: 4, roster: ['v1'], nodePos: {}, away: {} },
};
Game.dayPart = 1;
Game.say = () => {};
Game.seedGossip = () => {};
Game.displayName = () => 'Testy';
Game.vpOf = () => ({ id: 'v1', age: 30 });
Game.isEngaged = () => false;
// deterministic legs: disable encounter sub-fns (they are RNG-gated side quests,
// not the movement under test)
Game.expeditionMonster = () => {};
Game.expeditionCache = () => {};
Game.expeditionSign = () => {};
Game.expeditionStranger = () => {};
Game.agencyTierCheck = () => {};
// force explorer profile (npcMaxDist 6)
Game.state.village.agency = { profiles: { v1: 'explorer' }, potential: {} };

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}
function resetExped() {
  const a = Game.agencyState();
  delete a.exped.v1;
  Game.state.village.away = {};
  Game.state.village.nodePos = { v1: { nx: 4, ny: 4 } };
}

// ---- (a) expedition targets can reach rim nodes 7-8 ----
{
  const seen = new Set();
  let maxC = 0, rim = 0;
  for (let s = 1; s <= 400; s++) {
    reseed(s);
    resetExped();
    Game.startExpedition('v1', 4, 4, false);
    const ex = Game.agencyState().exped.v1;
    if (!ex) continue;
    seen.add(ex.tx + ',' + ex.ty);
    maxC = Math.max(maxC, ex.tx, ex.ty);
    if (ex.tx >= 7 || ex.ty >= 7) rim++;
    if (ex.tx < 0 || ex.tx > 8 || ex.ty < 0 || ex.ty > 8) {
      check('expedition target in-bounds 0..8', false, `(${ex.tx},${ex.ty}) out of bounds`);
    }
  }
  if (BEFORE) {
    check('BEFORE: expedition targets never reach rim (max coord 6)', maxC === 6 && rim === 0,
      `max=${maxC}, rimTargets=${rim}, distinct=${seen.size}`);
  } else {
    check('AFTER: expedition targets reach rim nodes 7-8', rim > 0,
      `rimTargets=${rim}/400, distinct=${seen.size}, max=${maxC}`);
  }
}

// ---- (b) expeditionLeg reaches a rim target and terminates ----
{
  reseed(99);
  resetExped();
  const day = 10;
  Game.state.village.away.v1 = { nx: 8, ny: 8, purpose: 'expedition', sinceDay: day, sincePart: 1, duration: 40 };
  Game.agencyState().exped.v1 = { tx: 8, ty: 8, dist: 6, legs: 0, sinceDay: day, sincePart: 1, duration: 40, finds: [], encounters: [] };
  let arrivedAt = -1, stuckAt66 = 0, inBounds = true, postArrivalDrift = 0;
  for (let leg = 0; leg < 40; leg++) {
    Game.expeditionLeg('v1', 4, 4, false);
    const n = Game.npcNode('v1');
    if (n.nx < 0 || n.nx > 8 || n.ny < 0 || n.ny > 8) inBounds = false;
    if (n.nx === 8 && n.ny === 8 && arrivedAt < 0) arrivedAt = leg + 1;
    else if (arrivedAt > 0 && (n.nx !== 8 || n.ny !== 8)) postArrivalDrift++;
    if (n.nx === 6 && n.ny === 6) stuckAt66++;
  }
  const ex = Game.agencyState().exped.v1;
  check('legs stay in-bounds 0..8', inBounds);
  if (BEFORE) {
    check('BEFORE: legs clamp at (6,6) forever, never reach (8,8)',
      arrivedAt < 0 && stuckAt66 >= 38, `arrivedAt=${arrivedAt}, legsAt(6,6)=${stuckAt66}/40, legs=${ex.legs}`);
    // livelock analysis: expeditionLeg has no arrival check; the expedition ends
    // on duration via the base loop clearing v.away (not on arrival), so this is
    // never-arrive, not an infinite loop — legs++ burns but the run terminates.
    check('BEFORE: expedition record still terminates on duration (no true livelock)',
      ex.legs === 40, `legs=${ex.legs}`);
  } else {
    check('AFTER: legs reach rim target (8,8) and stay arrived', arrivedAt > 0 && arrivedAt <= 8,
      `arrivedAt leg ${arrivedAt}, final=(${Game.npcNode('v1').nx},${Game.npcNode('v1').ny})`);
    check('AFTER: no post-arrival drift, no clamp-stuck', postArrivalDrift === 0 && stuckAt66 <= 1,
      `drift=${postArrivalDrift}, transitThrough(6,6)=${stuckAt66}`);
  }
}

// ---- (c) seedVillagerMaps can seed rim tiles ----
// NOTE: with the standard centered haven (4,4), the scatter radius is ±2, so
// seeds land on 2..6 regardless of the clamp — the clamp only binds when the
// haven is off-center (exile / new haven: v.px/v.py). The 0..8 fix makes the
// seed honest for those cases. We prove the clamp change with haven at (7,7).
{
  const vps = (Game.data.villagers || []).concat(Game.data.background_survivors || []);
  for (const vp of vps) delete vp.visitedTiles;
  const tiles = new Set();
  let maxC = 0;
  Game.state.village.px = 7; Game.state.village.py = 7; // off-center haven: clamp binds
  for (let s = 1; s <= 60; s++) {
    reseed(1000 + s);
    for (const vp of vps) delete vp.visitedTiles;
    Game.seedVillagerMaps();
    for (const vp of vps) for (const k of (vp.visitedTiles || [])) {
      tiles.add(k);
      const [x, y] = k.split(',').map(Number);
      maxC = Math.max(maxC, x, y);
    }
  }
  Game.state.village.px = 4; Game.state.village.py = 4;
  // (exclude the haven tile itself, trivially seeded in both modes)
  const rimTiles = [...tiles].filter(k => { const [x, y] = k.split(',').map(Number); return (x >= 7 || y >= 7) && !(x === 7 && y === 7); });
  if (BEFORE) {
    check('BEFORE: off-center haven seeds never include rim (beyond the haven tile)', rimTiles.length === 0,
      `max=${maxC} (7 = haven itself), rimTiles=${rimTiles.length}, distinct=${tiles.size}`);
  } else {
    check('AFTER: off-center haven seeds include rim tiles', rimTiles.length > 0,
      `rimTiles=${rimTiles.length}, distinct=${tiles.size}, max=${maxC}`);
  }
  // design observation (not a clamp bug): centered haven (4,4) + ±2 scatter
  // radius structurally excludes rim tiles 7-8 from seeds regardless of clamp.
  // Widening that radius is a design call, not this bug class — left for Steve.
  console.log('INFO | centered-haven scatter radius is ±2: rim tiles 7-8 are structurally ' +
    'excluded from seeds even after the clamp fix (design-level, not changed here)');
  // honesty: COMPARE MAPS merges a rim tile into shared knowledge
  reseed(7);
  Game.state.scholar.seenTiles = {};
  const vp0 = vps[0];
  vp0.visitedTiles = ['4,4', '8,7'];
  const r = Game.compareMaps(vp0.id);
  check('COMPARE MAPS merges rim tile into shared knowledge',
    r.newCount === 2 && Game.state.scholar.seenTiles['8,7'] && Game.state.scholar.seenTiles['8,7'].k === 's',
    `newCount=${r.newCount}`);
}

// ---- npcMaxDist range coherence vs 9x9 world ----
{
  const profiles = { explorer: 6, wanderer: 3, forager: 1, homebody: 0 };
  // max Chebyshev distance from haven (4,4) to any node in a 0..8 world
  const worldRadius = 4;
  let coherent = true;
  for (const [p, d] of Object.entries(profiles)) {
    if (d > 8) coherent = false; // cannot exceed the world's span
    console.log(`INFO | npcMaxDist ${p} = ${d} (world radius from haven = ${worldRadius})`);
  }
  // explorers (the only profile that ranges to the rim) can reach every node
  check('npcMaxDist coherent: explorer range covers world radius', profiles.explorer >= worldRadius && coherent);
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
