// BREAK-IT: camps & structures — R12 (2026-10-10).
//
// Rounds 1–11 killed: phantom camps x3, lying breakCamp messages (fire/strike/
// cold-pit/eviction), pack->re-pitch free repair, shredded-tent state, room
// eviction invariants, infinite bury, fire/tent sweep races, storm/bulldoze/
// beam camp integrity, bridge double-build + dry-land lie + dead ledger,
// stale-fire/hearth-fire/struck-fire camp lies, pitch cost engine honesty,
// multi-tent over-break (wreckTent/destroyCell), travel phantom room,
// exile tent-room + breach leaks, tent economy conservation, cross-tile
// abandon, save/load round-trip.
//
// THIS ROUND attacks what they left alone:
//   H1. HONESTY (THE CATCH): breakCamp's destroyed path mourns "the fire's
//       scattered cold" (singular) no matter how many fires the camp tile
//       holds. Two live fires (a big cook) -> abandon -> the sweep douses
//       BOTH, the copy names ONE. Same class as camps-7/R10 fire lies.
//       FIX: count-aware fire bit ("the 2 fires are scattered cold").
//   H2. HONESTY (sibling): the "Set up camp" confirm promises "its tent is
//       wrecked, its fire dies" (singular) while the engine wrecks every
//       yours-tent and douses every tracked fire on the old tile.
//       FIX: new read-only Game.campAbandonLoss(px,py) preview (mirrors the
//       sweep + killCampFires exactly); the confirm names the real loss.
//   H3. HONESTY (reverted draft): first drafted as "destroyed path with zero
//       tents wrecked says 'The tent's wrecked'". R11 H1.4 showed the draft
//       was wrong — wrecked === 0 there always means the wrecker one call up
//       (wreckTent/destroyCell/breach) already wrecked it, so the singular is
//       the honest line. Kept as a regression guard on that judgment.
//   E1. EXPLOIT: bridge smash->rebuild loop must not refund (no printer).
//   E2. EXPLOIT: setUpCamp abandon charges exactly 30 ticks, once, no kcal.
//   S1. SOFTLOCK: breakCamp with camp coords off the map — no throw, cleared.
//   S2. SOFTLOCK: setUpCamp on a new tile while inside a tent THERE — the old
//       camp's breakCamp must not evict you from a standing tent.
//   S3. SOFTLOCK: storm resolve (unsheltered) while inside the camp tent —
//       breakCamp evicts, no crash, no stale room.
//   U1-U3. UNBREAKABLE: bulldozer vs 'hall' refuses; yours-tent still
//       breakable; no game-code path writes haven cell types to the grid.
//   D1/D2. DEAD-CODE: campAbandonLoss wired (app.js call site); index.html
//       loads game.js/app.js.
//
// Usage: node scripts/test-camps-r12-20261010.js
//        BEFORE=1 node scripts/test-camps-r12-20261010.js  (red on H1/H2/H3/D1)
//        SEED=777 node scripts/test-camps-r12-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js', 'src/js/app.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps12-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js + app.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps12-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub ----
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  _clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};

// ---- data ----
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

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
Math.random = function () { return rng(); };
function reseed(s) { rng = mulberry32(s); }
reseed(parseInt(process.env.SEED || '20261010', 10) || 20261010);

global.window = global;
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
Game.data = global.SCATTER_DATA;

const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.drama = () => {};
Game.audioEvent = () => {};
Game.recordLegend = () => {};
Game.recordMoment = () => {};
Game.ledgerAdd = () => {};
Game.writeEpitaph = () => {};
Game.removeVillager = () => {};
Game.lineage = () => [];
Game.leadershipEpithet = () => 'the steady';
Game.maxHealth = () => 100;
Game.integrationStage = () => 0;
Game.playerTile = function () { return Game.tileAt(Game.map.px, Game.map.py); };
Game.endingFrame = () => 'indispensable';
Game.log = [];
Game.npcIds = () => Object.keys((Game.state.village || {}).rosterChars || {});

function mkMap() {
  const tiles = [];
  for (let y = 0; y < 9; y++) { const r = []; for (let x = 0; x < 9; x++) r.push({ type: 'meadow' }); tiles.push(r); }
  return tiles;
}
function freshGame() {
  const st = S.state.newState();
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven',
    roster: ['v1', 'v2'],
    rosterChars: { v1: { id: 'v1', name: 'Mara Voss' }, v2: { id: 'v2', name: 'Tam Okafor' } },
    trust: {},
  });
  st.scholar = S.state.newScholar('v1');
  st.scholar.day = 5;
  st.scholar.actionClock = 0; st.scholar.dayTicks = 0;
  st.scholar.kcal = 2000; st.scholar.health = 100;
  st.scholar.mx = 4; st.scholar.my = 4;
  st.scholar.insideHaven = false;
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { tiles: mkMap(), px: 4, py: 4, worldSeed: 1, worldSize: 9 };
  Game.dayPart = 1; Game.location = 'village'; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; said.length = 0;
  Game.tbfight = null; Game._pendingPack = null;
  Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.data.villagers = Object.values(st.village.rosterChars || {});
  return st;
}

// ---- helpers ----
function giveTent(n) {
  const inv = Game.state.scholar.inventory;
  let t = inv.find(i => i.kind === 'tent');
  if (!t) { t = { kind: 'tent', name: 'Packed tent', units: 0, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent' }; inv.push(t); }
  t.units += (n || 1);
}
function setCell(tx, ty, cx, cy, v) { Game.genDetail(tx, ty)[cy][cx] = v; }
function pitchAt(tx, ty, cx, cy) {
  setCell(tx, ty, cx, cy, 'dirt');
  Game.state.scholar.mx = cx; Game.state.scholar.my = cy + 1;
  said.length = 0;
  Game.pitchTent(cx, cy);
}
function liveFireAt(tx, ty, cx, cy, burn) {
  const till = Game._absTick() + (burn || 100000);
  (Game.state.fires = Game.state.fires || []).push({ tx, ty, cx, cy, till, burn0: burn || 100000 });
  setCell(tx, ty, cx, cy, 'fire');
}
function campFixture(tx, ty) {
  tx = tx == null ? Game.map.px : tx; ty = ty == null ? Game.map.py : ty;
  giveTent(1);
  pitchAt(tx, ty, 3, 3);
  liveFireAt(tx, ty, 5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  return Game.state.camp;
}
function addMaterials() {
  Game.addMaterial('wood', 20);
  Game.addMaterial('branch', 20);
}

// ---- check harness ----
let pass = 0, fail = 0;
const failures = [];
function check(id, cond, note) {
  if (cond) { pass++; }
  else { fail++; failures.push(id + ': ' + (note || 'FAILED')); console.log('  FAIL ' + id + (note ? ' — ' + note : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
const AFTER = !BEFORE;

// (E1 section continues in the appended part below — bridge needs tile coords.)

// ============ E1: bridge smash->rebuild is not a printer ============
section('E1 exploit — bridge rebuild loop (no refund printer)');
freshGame();
Game.addWood(20); // buildBridge spends inventory wood via spendWood, not storage materials
Game.map.tiles[4][5] = { type: 'creek', needsBridge: true };
const w0 = Game.woodCount();
Game.buildBridge(5, 4);
check('E1.1', Game.woodCount() === w0 - 4, 'build spends exactly 4 wood');
check('E1.2', Game.map.tiles[4][5].bridged === true, 'bridge flag set');
Game.smashBridge(5, 4, 'storm');
check('E1.3', Game.map.tiles[4][5].bridged !== true, 'smash clears the flag');
check('E1.4', Game.woodCount() === w0 - 4, 'smash refunds nothing');
Game.buildBridge(5, 4);
check('E1.5', Game.woodCount() === w0 - 8, 'rebuild costs another full 4 (no printer)');
check('E1.6', Game.map.tiles[4][5].needsBridge === true, 'creek keeps needsBridge — never stranded');

// ============ E2: setUpCamp abandon cost ============
section('E2 exploit — setUpCamp abandon charges exactly 30 ticks, once');
freshGame();
campFixture(4, 4); // camp on tile (4,4), player stands there
// move to a fresh tile and found the abandon scenario: camp on (4,4), go to (6,6)
Game.map.px = 6; Game.map.py = 6;
giveTent(1);
pitchAt(6, 6, 3, 3);
liveFireAt(6, 6, 5, 5);
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
const ticks0 = Game.state.scholar.dayTicks || 0;
const kcal0 = Game.state.scholar.kcal || 0;
said.length = 0;
Game.setUpCamp(); // abandons (4,4), founds on (6,6)
const dTicks = (Game.state.scholar.dayTicks || 0) - ticks0;
check('E2.1', dTicks === 30, 'exactly 30 ticks charged, got ' + dTicks);
check('E2.2', Math.round(Game.state.scholar.kcal || 0) === Math.round(kcal0), 'no kcal charged by setup');
check('E2.3', Game.state.camp && Game.state.camp.px === 6 && Game.state.camp.py === 6, 'new camp founded on (6,6)');
check('E2.4', Game.tileAt(4, 4) && Game.genDetail(4, 4)[3][3] !== 'tent', 'old camp tent wrecked, not duplicated');

// ============ S1: breakCamp with off-map coords ============
section('S1 softlock — breakCamp with bogus camp coords');
freshGame();
campFixture(4, 4);
Game.state.camp.px = 99; Game.state.camp.py = 99;
let threw = false;
try { Game.breakCamp('the world took it'); } catch (e) { threw = true; }
check('S1.1', !threw, 'no throw on off-map camp coords');
check('S1.2', !Game.state.camp, 'state.camp cleared regardless');

// ============ S2: setUpCamp elsewhere while inside a tent ============
section('S2 softlock — abandon camp while inside a tent on the NEW tile');
freshGame();
campFixture(4, 4); // old camp on (4,4)
Game.map.px = 6; Game.map.py = 6;
giveTent(1);
pitchAt(6, 6, 3, 3);
liveFireAt(6, 6, 5, 5);
Game.enterTent(3, 3); // inside the NEW tile's tent
check('S2.0', !!(Game.state.scholar.insideTent), 'inside tent on new tile (fixture)');
Game.state.scholar.mx = 4; Game.state.scholar.my = 4; // stand by the fire (room is separate from feet)
said.length = 0;
Game.setUpCamp(); // abandons old camp -> breakCamp('you left it behind')
check('S2.1', !Game.state.camp || (Game.state.camp.px === 6 && Game.state.camp.py === 6), 'new camp founded');
check('S2.2', !!(Game.state.scholar.insideTent), 'NOT evicted — the tent you are in still stands');
check('S2.3', !said.join(' ').match(/canvas comes down/i), 'no false eviction line');

// ============ S3: storm while inside the camp tent ============
section('S3 softlock — storm resolve while inside the camp tent');
freshGame();
campFixture(4, 4);
Game.enterTent(3, 3);
Game.state.scholar.stormFront = { day: 5 };
Game.state.scholar.mx = 3; Game.state.scholar.my = 3;
let s3threw = false;
try { Game.resolveStormFront(); } catch (e) { s3threw = true; console.log('  storm threw: ' + e.message); }
check('S3.1', !s3threw, 'storm resolve does not throw');
check('S3.2', !Game.state.camp, 'camp broken by the storm');
check('S3.3', !Game.state.scholar.insideTent, 'evicted from the wrecked tent (no stale room)');

// ============ H1: fire-count honesty in breakCamp ============
section('H1 honesty — breakCamp names the real fire count');
freshGame();
campFixture(4, 4);
liveFireAt(4, 4, 6, 6); // second live fire: the big cook
said.length = 0;
Game.breakCamp('you left it behind');
const h1msg = said.join(' ');
check('H1.1', /the 2 fires are scattered cold/.test(h1msg), 'names both doused fires, got: ' + h1msg.slice(0, 160));
check('H1.2', !/(^|[^0-9])the fire's scattered cold/.test(h1msg), 'no singular fire claim alongside');
// controls: 1 fire and 0 fires stay honest in both modes
freshGame();
campFixture(4, 4);
said.length = 0;
Game.breakCamp('you left it behind');
const h1one = said.join(' ');
check('H1.3', /the fire's scattered cold/.test(h1one), 'one fire: singular copy honest');
freshGame();
campFixture(4, 4);
for (const f of (Game.state.fires || [])) f.till = Game._absTick() - 5; // let it burn out
said.length = 0;
Game.breakCamp('you left it behind');
const h1zero = said.join(' ');
check('H1.4', /the fire was already cold/.test(h1zero), 'cold pit: honest line (R10 control)');

// ============ H2: campAbandonLoss preview + confirm honesty ============
section('H2 honesty — campAbandonLoss preview mirrors the engine');
freshGame();
campFixture(4, 4); // 1 tent (3,3) + 1 fire (5,5)
giveTent(1);
pitchAt(4, 4, 6, 2); // second yours-tent
liveFireAt(4, 4, 2, 6); // second live fire
check('H2.0', typeof Game.campAbandonLoss === 'function', 'preview helper exists');
if (typeof Game.campAbandonLoss === 'function') {
  const loss = Game.campAbandonLoss(4, 4);
  check('H2.1', loss.tents === 2, 'counts both yours-tents, got ' + JSON.stringify(loss));
  check('H2.2', loss.fires === 2, 'counts both live fires, got ' + JSON.stringify(loss));
  // engine agreement: breakCamp wrecks exactly what the preview counted
  said.length = 0;
  Game.breakCamp('you left it behind');
  const m2 = said.join(' ');
  check('H2.3', /The 2 tents are wrecked/.test(m2), 'sweep wrecked the previewed 2 tents');
  check('H2.4', /the 2 fires are scattered cold/.test(m2), 'sweep doused the previewed 2 fires');
} else {
  check('H2.1', false, 'helper missing — cannot count tents');
  check('H2.2', false, 'helper missing — cannot count fires');
  check('H2.3', false, 'helper missing — cannot verify sweep agreement');
  check('H2.4', false, 'helper missing — cannot verify fire agreement');
}
{
  const appSrc = BEFORE
    ? fs.readFileSync('/tmp/camps12-before-app.js', 'utf8')
    : fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('H2.5', appSrc.indexOf('campAbandonLoss') !== -1, 'confirm copy calls the preview helper');
  check('H2.6', appSrc.indexOf('Your OLD camp is abandoned — its tent is wrecked, its fire dies.') === -1, 'old unconditional singular confirm message gone');
}

// ============ H3: wreckTent path keeps R11's honest singular ============
// (First drafted as a "zero tents wrecked" catch; R11 H1.4 showed the draft
// was wrong — wrecked === 0 in the destroyed path always means the wrecker
// one call up (wreckTent/destroyCell/breach) already wrecked it, so "The
// tent's wrecked" is the honest line. This section guards that judgment
// against my own fire-count change.)
section('H3 honesty — wreckTent path keeps the honest singular tent line');
freshGame();
campFixture(4, 4);
said.length = 0;
Game.wreckTent(4, 4, 3, 3); // wrecks the tent, then breakCamp('a monster tore it down')
const h3msg = said.join(' ');
check('H3.1', /The tent's wrecked/.test(h3msg), 'wreckTent path still says the tent is wrecked (R11 H1.4)');
check('H3.2', !Game.state.camp, 'camp broken by the wreck');

// ============ U: unbreakable law ============
section('U unbreakable — havens hold, player structures break');
freshGame();
setCell(4, 4, 2, 2, 'hall');
said.length = 0;
const u1 = Game.destroyCell(2, 2, 'bulldozer');
check('U1.1', u1 === false, 'destroyCell refuses the hall');
check('U1.2', Game.genDetail(4, 4)[2][2] === 'hall', 'hall cell intact');
check('U1.3', said.join(' ').match(/holds\. Havens do not break/), 'honest refusal line');
freshGame();
giveTent(1);
pitchAt(4, 4, 3, 3);
said.length = 0;
const u2 = Game.destroyCell(3, 3, 'bulldozer');
check('U2.1', u2 === true, 'a yours-tent IS breakable (reverse: no unbreakable player structures)');
check('U2.2', Game.genDetail(4, 4)[3][3] !== 'tent', 'tent cell smashed');
// U3: source audit — player-reachable cell writers never emit haven types.
// Only map-gen (validateSpawnArea carving haven doors) may; every other
// detail/cells write of a haven cell type is a law violation.
const gameSrcU3 = srcOf('src/js/game.js');
const u3lines = gameSrcU3.split('\n');
const u3func = [];
u3lines.forEach((l, i) => { const m = l.match(/^    ([A-Za-z_$][\w$]*)\s*\(/); if (m) u3func.push([i, m[1]]); });
const u3bad = [];
for (let i = 0; i < u3lines.length; i++) {
  const m = u3lines[i].match(/(detail|cells)\[[^\]]*\](\[[^\]]*\])?\s*=\s*'(hall|bunk|door|haven|sanct|base)'/);
  if (!m) continue;
  let fn = '?'; for (const [fi, fn2] of u3func) { if (fi < i) fn = fn2; }
  if (fn !== 'validateSpawnArea') u3bad.push(`${i + 1}:${m[3]} in ${fn}`);
}
check('U3', u3bad.length === 0, 'no non-gen detail write of a haven cell type, found: ' + u3bad.join(','));

// ============ D: dead-code ============
section('D dead-code — wiring');
{
  const appSrc2 = BEFORE
    ? fs.readFileSync('/tmp/camps12-before-app.js', 'utf8')
    : fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('D1', appSrc2.indexOf('Game.campAbandonLoss(') !== -1, 'campAbandonLoss has a live call site');
}
const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('D2', idxHtml.indexOf('src/js/game.js') !== -1 && idxHtml.indexOf('src/js/app.js') !== -1, 'index.html loads game.js + app.js');

console.log(`\nRESULT: PASS ${pass} / FAIL ${fail}` + (fail ? '\n' + failures.join('\n') : ''));
process.exit(fail ? 1 : 0);
