// BREAK-IT: camps & structures — SEVENTH PASS (2026-10-09).
// Rounds 1-6 killed phantom camps x2, lying breakCamp messages, pack->re-pitch
// free repair, shredded-tent state, room eviction invariants, INFINITE BURY,
// sweepDeadFires eating tents, storm camp rules, bulldoze camp integrity, and
// the whole bridge system (double-build, dry-land lie, dead ledger, storm
// smash). This pass attacks what they left alone: camp+fire interplay,
// pitchTent cost honesty (copy fixed in 42a140a — engine now attacked), the
// struck path's other tents, scorchCells vs state.camp, stale fire cells.
//
// CATCHES (all demonstrated RED in BEFORE mode, GREEN after fix):
//   C1. STALE-FIRE CAMP LIE (honesty): setUpCamp/hasCampfireNearby never swept
//       dead fires. A burned-out fire's 'fire' cell (no fire-touching path run
//       since) founded a camp with "fire going" copy — on a cold pit.
//       FIX: hasCampfireNearby sweeps first, then requires a YOUR live tracked
//       grid fire within 1 of the player.
//   C2. HEARTH-FIRE CAMP (honesty): map-gen 'fire' cells (haven hearth, edge-
//       blended wild fires) counted as "your campfire". A camp founded on a
//       fire you never built; breakCamp then said "the fire's scattered cold"
//       about a hearth that keeps burning, and the camp's fire sweep can't
//       kill what it never tracked. FIX: same as C1 — the camp's fire is yours.
//   C3. STRUCK-MESSAGE FIRE LIE (honesty): breakCamp('you packed up the tent')
//       checked the ledger raw — a burned-out entry still earned "The fire
//       keeps burning; it'll die on its own." FIX: sweep + live-fire check.
//   C4. SHREDDED-CAMP SOFTLOCK (softlock): scorchCells shredded the camp's
//       tent but never touched state.camp — the camp stood on ribbons.
//       packTent/enterTent refuse shredded, no abandon action exists, "Set up
//       camp" says "already your camp": stuck, with the sort ritual still
//       working on wreckage (phantom-camp class). FIX: scorchCells breaks the
//       camp when no intact yours-tent remains on the camp's tile.
//   C5. STRUCK SWEEP WRECKED THE OTHER TENT (honesty): packing ONE tent of
//       two silently wrecked the other (no item, no message) — "Struck, not
//       destroyed" except it was. FIX: the tent sweep runs only when the camp
//       is destroyed; a struck camp's other tents stand.
//   C6. DEAD setUpDay FIELD (dead code): written on every setUpCamp, read
//       nowhere. Removed.
//   C7. SIBLING — cookFood's stale-fire gate (honesty): same stale-cell class
//       as C1. The cell scan passed a dead fire; consumeCookFire then found no
//       live tracked fire and returned 'ok' — cooking for free over a cold
//       pit. FIX: sweepDeadFires() before the gate. (Hearth cooking untouched:
//       map fires are established and never swept.)
//
// HELD (attacked, resisted — documented, not failures):
//   - pitchTent cost honesty (42a140a fixed the copy): the engine charges
//     exactly 50 kcal + 48 ticks — the copy now names both, and the numbers
//     match (E1/E2/H1).
//   - Travel away and back: t.detail is cached by genDetail — the pitched
//     tent and the camp persist. No decay by design (S7).
//   - packTent has no canCarry check (unlike found-tent pickup): deliberate —
//     your own shelter must always be packable; encumbrance is the player's
//     problem, and refusing would softlock a heavy player out of their tent.
//   - Death keeps the pitched tent standing (ledger.js: "The tent still
//     stands, if anyone walks back for it") — village-continuity design; the
//     successor inherits via the still-yours secret. Documented, not changed.
//   - feedFire's uncapped till: each feed costs 8 ticks + real fuel — finite
//     fuel, no infinite loop.
//
// Usage: node scripts/test-camps7-breakit-20261009.js
//        BEFORE=1 node scripts/test-camps7-breakit-20261009.js
//        SEED=777 node scripts/test-camps7-breakit-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps7-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps7-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub ----
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  _clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  _keys: () => Object.keys(_store),
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
reseed(parseInt(process.env.SEED || '20261009', 10) || 20261009);

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
// NOTE (camps-7): round-6 stubbed playerTile as {type:'haven'} (no secrets).
// Tent tests need the REAL tile object (secrets live on it).
Game.playerTile = function () { return Game.tileAt(Game.map.px, Game.map.py); };
Game.endingFrame = () => 'indispensable';
Game.log = [];

function mkMap() {
  const tiles = [];
  for (let y = 0; y < 9; y++) { const r = []; for (let x = 0; x < 9; x++) r.push({ type: 'meadow' }); tiles.push(r); }
  return tiles;
}
function freshGame() {
  const st = S.state.newState();
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: ['v1'], rosterChars: { v1: { id: 'v1', name: 'Mara Voss' } }, trust: {},
  });
  st.scholar = S.state.newScholar('v1');
  st.scholar.day = 5;
  st.scholar.actionClock = 0; st.scholar.dayTicks = 0;
  st.scholar.kcal = 2000; st.scholar.health = 100;
  st.scholar.mx = 4; st.scholar.my = 4;
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

// ---- camp test helpers ----
function giveTent(n) {
  const inv = Game.state.scholar.inventory;
  let t = inv.find(i => i.kind === 'tent');
  if (!t) { t = { kind: 'tent', name: 'Packed tent', units: 0, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it.' }; inv.push(t); }
  t.units += (n || 1);
}
function tentUnits() {
  return (Game.state.scholar.inventory || []).filter(i => i.kind === 'tent').reduce((a, i) => a + (i.units || 0), 0);
}
function setCell(cx, cy, v) { Game.genDetail(Game.map.px, Game.map.py)[cy][cx] = v; }
function pitchAt(cx, cy) {
  setCell(cx, cy, 'dirt');
  Game.state.scholar.mx = cx; Game.state.scholar.my = cy + 1; // adjacent
  said.length = 0;
  Game.pitchTent(cx, cy);
}
function liveFireAt(cx, cy, burn) {
  const till = Game._absTick() + (burn || 100000);
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx, cy, till });
  setCell(cx, cy, 'fire');
}
function deadFireAt(cx, cy) {
  // burned-out entry + lingering 'fire' cell: the stale-cell attack shape.
  // No fire-touching path has run since expiry, so the cell was never swept.
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx, cy, till: Game._absTick() - 10 });
  setCell(cx, cy, 'fire');
}
function hearthAt(cx, cy) {
  // map-gen fire (haven hearth / edge blend): cell, no tracked entry.
  setCell(cx, cy, 'fire');
}
function campFixture() {
  // one pitched tent + one LIVE player fire, adjacent to the player.
  giveTent(1);
  pitchAt(3, 3);
  liveFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  return Game.state.camp;
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ================= E. EXPLOIT =================
section('E. exploit: costs, stale fire, hearth fire, struck sweep, round-trips');

freshGame();
{
  giveTent(1);
  const k0 = Game.state.scholar.kcal, t0 = Game.state.scholar.dayTicks || 0;
  pitchAt(3, 3);
  const dk = k0 - Game.state.scholar.kcal, dt = (Game.state.scholar.dayTicks || 0) - t0;
  check('E1 pitchTent charges exactly 50 kcal', dk === 50, `delta=${dk}`);
  check('E2 pitchTent advances exactly 48 ticks', dt === 48, `delta=${dt}`);
  check('H1 pitch copy names both costs honestly', /48 ticks/.test(said.join(' ')) && /-50 kcal/.test(said.join(' ')), said.join(' ').slice(0, 160));
}

freshGame();
{
  // C1: stale fire cell + dead tracked entry -> camp on a cold pit
  giveTent(1);
  pitchAt(3, 3);
  deadFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  check('E3 stale-fire camp refused (no camp on a cold pit)', !Game.state.camp, `camp=${JSON.stringify(Game.state.camp)}`);
  check('H5 refusal copy is honest (your own fire, burning)', /your own campfire/i.test(said.join(' ')), said.join(' ').slice(0, 140));
}

freshGame();
{
  // C2: hearth-style map fire (cell, no tracked entry) -> camp on a fire you never built
  giveTent(1);
  pitchAt(3, 3);
  hearthAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  check('E4 hearth-fire camp refused (camp needs YOUR fire)', !Game.state.camp, `camp=${JSON.stringify(Game.state.camp)}`);
}

freshGame();
{
  // C5: struck camp must not wreck the OTHER pitched tent
  giveTent(2);
  pitchAt(3, 3);
  pitchAt(5, 3);
  liveFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  check('E5-pre camp set with two tents', !!Game.state.camp, said.join(' ').slice(0, 120));
  said.length = 0;
  Game.packTent(3, 3);
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const other = Game.tileAt(Game.map.px, Game.map.py).secrets['5,3'];
  check('E5 struck camp spares the other pitched tent', detail[3][5] === 'tent' && other && other.yours,
    `cell=${detail[3][5]} secret=${JSON.stringify(other)}`);
  check('E5b camp is gone after packing', !Game.state.camp);
  check('E5c packed tent returned exactly once', tentUnits() === 1, `units=${tentUnits()}`);
}

freshGame();
{
  // E6: two tents + storm -> both wrecked, no items, plural copy
  giveTent(2);
  pitchAt(3, 3);
  pitchAt(5, 3);
  liveFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  const unitsBefore = tentUnits();
  Game.state.scholar.stormFront = { day: 5 };
  Game.playerAtHaven = () => true;
  said.length = 0;
  Game.resolveStormFront();
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  check('E6 storm wrecks both tents', detail[3][3] === 'dirt' && detail[3][5] === 'dirt',
    `cells=${detail[3][3]},${detail[3][5]}`);
  check('E6b storm grants no tent items', tentUnits() === unitsBefore, `units=${tentUnits()} before=${unitsBefore}`);
  check('H4 destroy copy pluralizes (2 tents)', /2 tents are wrecked/i.test(said.join(' ')), said.join(' ').slice(-220));
  check('D2 storm breaks camp at runtime (dead path wired)', !Game.state.camp);
}

freshGame();
{
  // E7: pitch -> pack -> pitch round trip: no duplication, no loss
  giveTent(1);
  pitchAt(3, 3);
  check('E7a pitch consumes the item', tentUnits() === 0, `units=${tentUnits()}`);
  Game.packTent(3, 3);
  check('E7b pack returns the item', tentUnits() === 1, `units=${tentUnits()}`);
  pitchAt(5, 3);
  check('E7c re-pitch consumes again (no dupe)', tentUnits() === 0, `units=${tentUnits()}`);
  Game.packTent(5, 3);
  check('E7d round trip conserves exactly', tentUnits() === 1, `units=${tentUnits()}`);
}

// ================= S. SOFTLOCK =================
section('S. softlock: shredded camp, eviction, travel, bulldoze');

freshGame();
{
  // C4: beam shreds the camp's tent -> camp must die, not stick on ribbons
  const camp = campFixture();
  check('S1-pre camp set', !!camp);
  said.length = 0;
  Game.scorchCells([{ cx: 3, cy: 3 }]);
  const sec = Game.tileAt(Game.map.px, Game.map.py).secrets || {};
  check('S1 beam-shredded camp breaks (no stuck camp)', !Game.state.camp, `camp=${JSON.stringify(Game.state.camp)}`);
  check('S1b break names the beam honestly', /beam tore it to ribbons/i.test(said.join(' ')), said.join(' ').slice(-200));
  check('S1c shredded tent swept (no ribbons left)', !Object.keys(sec).some(k => /3,3/.test(k)));
  check('D5 camp secrets purged with the cell', !sec['3,3'], `secrets=${JSON.stringify(Object.keys(sec))}`);
}

freshGame();
{
  // one of two tents shredded -> the camp stands on the survivor
  giveTent(2);
  pitchAt(3, 3);
  pitchAt(5, 3);
  liveFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.setUpCamp();
  check('S2-pre camp set', !!Game.state.camp);
  Game.scorchCells([{ cx: 3, cy: 3 }]);
  check('S2 camp survives on the intact tent', !!Game.state.camp, `camp=${JSON.stringify(Game.state.camp)}`);
  check('S2b shredded tent stays ribbons (not swept)', Game.tileAt(Game.map.px, Game.map.py).secrets['3,3'].condition === 'shredded');
}

freshGame();
{
  // after the beam break, the player can camp again: no stuck state
  campFixture();
  Game.scorchCells([{ cx: 3, cy: 3 }]);
  check('S3-pre camp broken by beam', !Game.state.camp);
  giveTent(1);
  pitchAt(6, 6);
  liveFireAt(6, 4);
  Game.state.scholar.mx = 5; Game.state.scholar.my = 5;
  said.length = 0;
  Game.setUpCamp();
  check('S3 camp can be re-founded after the break', !!Game.state.camp, said.join(' ').slice(0, 120));
}

freshGame();
{
  // shredded tent evicts the room (regression, round 5)
  giveTent(1);
  pitchAt(3, 3);
  said.length = 0;
  Game.enterTent(3, 3);
  check('S4-pre inside tent', !!Game.state.scholar.insideTent);
  Game.scorchCells([{ cx: 3, cy: 3 }]);
  Game.status();
  check('S4 shredded tent evicts the sleeper', !Game.state.scholar.insideTent);
}

freshGame();
{
  // storm while inside the tent at camp -> dumped outside, no phantom room
  campFixture();
  Game.enterTent(3, 3);
  check('S5-pre inside tent at camp', !!Game.state.scholar.insideTent);
  Game.state.scholar.stormFront = { day: 5 };
  Game.playerAtHaven = () => false;
  said.length = 0;
  Game.resolveStormFront();
  check('S5 storm dumps you out of the wrecked tent', !Game.state.scholar.insideTent);
  check('S5b storm broke the camp', !Game.state.camp);
}

freshGame();
{
  // bulldoze camp integrity still holds (round 6 asked to re-verify)
  campFixture();
  check('S6-pre camp set', !!Game.state.camp);
  said.length = 0;
  Game.destroyCell(3, 3, 'bulldozer');
  check('S6 bulldozed camp tent kills the camp', !Game.state.camp, `camp=${JSON.stringify(Game.state.camp)}`);
  check('S6b bulldoze copy names the cause', /bulldozer flattened it/i.test(said.join(' ')), said.join(' ').slice(-200));
}

freshGame();
{
  // travel away and back: the tent and camp persist (detail cached by design)
  campFixture();
  check('S7-pre camp set', !!Game.state.camp);
  const d1 = Game.genDetail(Game.map.px, Game.map.py);
  Game.map.px = 5; Game.map.py = 5; // travel away
  Game.map.px = 4; Game.map.py = 4; // travel back
  const d2 = Game.genDetail(Game.map.px, Game.map.py);
  check('S7 tent survives the round trip (detail cached)', d2[3][3] === 'tent' && d1 === d2);
  check('S7b camp survives the round trip (no decay by design)', !!Game.state.camp);
}

freshGame();
{
  // packing the tent you're inside is refused (regression)
  giveTent(1);
  pitchAt(3, 3);
  Game.enterTent(3, 3);
  said.length = 0;
  Game.packTent(3, 3);
  check('S8 pack-while-inside refused', /inside it/i.test(said.join(' ')) && Game.genDetail(Game.map.px, Game.map.py)[3][3] === 'tent',
    said.join(' ').slice(0, 120));
}

// ================= H. HONESTY =================
section('H. honesty: copy vs engine');

freshGame();
{
  // C3: struck message must not promise a burning fire that's already dead
  const camp = campFixture();
  check('H3-pre camp set', !!camp);
  // kill the fire without touching it (no sweep since expiry)
  for (const f of (Game.state.fires || [])) f.till = Game._absTick() - 5;
  said.length = 0;
  Game.packTent(3, 3);
  check('H3 no "keeps burning" for a dead fire', !/keeps burning/i.test(said.join(' ')), said.join(' ').slice(0, 200));
  check('H3b struck message still names the pack', /back in your pack/i.test(said.join(' ')));
}

freshGame();
{
  // control: a LIVE fire keeps the honest "keeps burning"
  const camp = campFixture();
  check('H3c-pre camp set', !!camp);
  said.length = 0;
  Game.packTent(3, 3);
  check('H3c live fire honestly "keeps burning"', /keeps burning/i.test(said.join(' ')), said.join(' ').slice(0, 200));
}

freshGame();
{
  // setUpCamp names its 30 ticks now
  giveTent(1);
  pitchAt(3, 3);
  liveFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  check('H2 camp copy names the 30-tick cost', /30 ticks/.test(said.join(' ')), said.join(' ').slice(0, 200));
}

freshGame();
{
  // one camp at a time: founding on a new tile abandons the old, named
  campFixture();
  check('H7-pre camp set', !!Game.state.camp);
  Game.map.px = 6; Game.map.py = 6;
  giveTent(1);
  const d = Game.genDetail(6, 6);
  d[3][3] = 'dirt';
  Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
  Game.pitchTent(3, 3);
  liveFireAt(4, 4);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  check('H7 new camp founded on the new tile', Game.state.camp && Game.state.camp.px === 6 && Game.state.camp.py === 6);
  check('H7b abandon named honestly', /you left it behind/i.test(said.join(' ')), said.join(' ').slice(-240));
  check('H7c old camp tent wrecked', Game.genDetail(4, 4)[3][3] === 'dirt');
}

freshGame();
{
  // C7 sibling: cookFood on a dead fire no longer cooks for free
  Game.state.scholar.inventory.push({ name: 'Test berries', units: 1, rawKcal: 50, kcalEach: 10 });
  deadFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  try { Game.cookFood(0); } catch (e) { check('H6 cookFood (threw: ' + e.message + ')', false); }
  check('H6 cookFood refuses the cold pit', /Need a fire to cook/i.test(said.join(' ')), said.join(' ').slice(0, 140));
}

freshGame();
{
  // regression: hearth cooking still works (map fires are established)
  Game.state.scholar.inventory.push({ name: 'Test berries', units: 1, rawKcal: 50, kcalEach: 10 });
  hearthAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  try { Game.cookFood(0); } catch (e) { check('H6b hearth cooking (threw: ' + e.message + ')', false); }
  check('H6b hearth cooking untouched by the sweep', !/Need a fire to cook/i.test(said.join(' ')), said.join(' ').slice(0, 140));
}

// ================= D. DEAD CODE =================
section('D. dead code: reachability');

{
  const src = srcOf('src/js/game.js');
  // callers live across the eval set AND app.js (UI buttons; not eval'd here)
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const all = src + '\n' + appSrc + '\n' + srcOf('src/js/food.js') + '\n' + srcOf('src/js/storage.js') + '\n' + srcOf('src/js/ledger.js');
  const helpers = ['packTent', 'wreckTent', 'breakCamp', 'destroyCell', 'scorchCells',
    'stormSmashBridges', 'validateInsideTent', 'setUpCamp', 'hasCampfireNearby',
    'atPlayerCamp', 'pitchTent', 'enterTent', 'lightTentFire'];
  for (const h of helpers) {
    const def = new RegExp('    ' + h + '\\(').test(src);
    const callRe = new RegExp('(this\\.|Game\\.)' + h + '\\(', 'g');
    const calls = (all.match(callRe) || []).length;
    check(`D1 ${h} defined and called`, def && calls > 0, `def=${def} calls=${calls}`);
  }
  check('D3 wreckTent wired to the tent-breach path', /\.wreckTent\(ins\.tx/.test(src));
  check('D4 dead setUpDay field removed', !/setUpDay/.test(src));
  check('D6 atPlayerCamp wired into food.js atCamp', /this\.atPlayerCamp \? this\.atPlayerCamp\(\)/.test(srcOf('src/js/food.js')));
}

freshGame();
{
  // D7: breakCamp's fire sweep kills tracked fires on destroy (runtime)
  campFixture();
  check('D7-pre camp set with live fire', !!Game.state.camp && (Game.state.fires || []).length === 1);
  said.length = 0;
  Game.breakCamp('test break');
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  check('D7 destroyed camp purges its fire tracking', (Game.state.fires || []).length === 0);
  check('D7b fire cell dirtied', detail[5][5] === 'dirt', `cell=${detail[5][5]}`);
}

console.log(`\n---- RESULT: ${pass} passed, ${fail} failed ----`);
if (failures.length) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); }
process.exit(fail ? 1 : 0);
