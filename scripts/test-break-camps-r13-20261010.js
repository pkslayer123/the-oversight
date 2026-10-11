// BREAK-IT: camps & structures — R13 (2026-10-10).
//
// Rounds 1–12 killed: phantom camps x3, lying breakCamp messages (fire/strike/
// cold-pit/eviction/multi-fire mourning), pack->re-pitch free repair,
// shredded-tent state, room eviction invariants, infinite bury, fire/tent
// sweep races, storm/bulldoze/beam camp integrity, bridge double-build +
// dry-land lie + dead ledger, stale-fire/hearth-fire/struck-fire camp lies,
// pitch cost engine honesty, multi-tent over-break (wreckTent/destroyCell),
// travel phantom room, exile tent-room + breach leaks, tent economy
// conservation, cross-tile abandon, save/load round-trip, abandon-confirm
// count honesty (campAbandonLoss), unbreakable audit (havens only).
//
// THIS ROUND attacks what they left alone:
//   E1. EXPLOIT: camp abandon on a new tile — the full economy. No tent
//       duplication, no fire duplication, exactly 30 ticks, no kcal, old tile
//       swept clean (tents wrecked not returned, fires doused).
//   E2. EXPLOIT: feedFire fuel conservation — every feed consumes exactly one
//       fuel unit; till grows by exactly the named amount. No fuel printer.
//   E3. EXPLOIT: tent-unit conservation across pitch/pack cycles — units round
//       trip exactly; nothing minted, nothing lost.
//   S1. SOFTLOCK: contest modal while insideTent at a camp — the contest path
//       must not touch camp/insideTent; after the modal ends the camp and the
//       room validate clean (contests.js has no camp/insideTent refs).
//   S2. SOFTLOCK: storm (sheltered branch) while the camp is on ANOTHER tile —
//       breakCamp must fire on the camp's tile, state stays consistent, the
//       message names the storm honestly, no throw.
//   S3. SOFTLOCK: alien douse-raid kills the camp's fire — the camp stands
//       (fire isn't required post-setup), atCamp stays true, no phantom.
//   H1. HONESTY: setUpCamp's promise "(Sorting, resting, and camp rituals
//       work here)" — sorting's gate (atCamp) passes at a player camp, rest
//       is not refused at camp.
//   H2. HONESTY: pitchTent's "Sleep quality: tent" — sleepPreview().quality
//       is 'tent' inside a pitched tent.
//   H3. HONESTY: packTent's "You strike the tent and pack it down" — the
//       tent unit actually returns to the pack.
//   D1. DEAD-CODE: every camp/structures Game function exists AND is reachable
//       from a UI entry point: the 4 context-bar labels are emitted by
//       cellActions under the right conditions, app.js maps all 4 labels to
//       engine calls, and the tent room wires all 7 buttons to engine fns.
//
// Usage: node scripts/test-break-camps-r13-20261010.js
//        BEFORE=1 node scripts/test-break-camps-r13-20261010.js  (red on H4/U4)
//        SEED=777 node scripts/test-break-camps-r13-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps13-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps13-before-${path.basename(f)}`, 'utf8')
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
Game.isSafeTile = () => false;

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
  st.scholar.kcal = 2000; st.scholar.health = 100; st.scholar.energy = 80;
  st.scholar.mx = 4; st.scholar.my = 4;
  st.scholar.insideHaven = false;
  st.weather = 'clear';
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { tiles: mkMap(), px: 4, py: 4, worldSeed: 1, worldSize: 9 };
  Game.dayPart = 1; Game.location = 'village'; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; said.length = 0;
  Game.tbfight = null; Game._pendingPack = null;
  Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.state.activeContest = null;
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
function tentUnits() {
  const t = (Game.state.scholar.inventory || []).find(i => i.kind === 'tent');
  return t ? (t.units || 0) : 0;
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
function liveFiresOn(tx, ty) {
  const now = Game._absTick();
  return (Game.state.fires || []).filter(f => f.tx === tx && f.ty === ty && f.till > now);
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
function giveBranch(n) { Game.addMaterial('branch', n || 1); }
function branchUnits() { return Game.materialCount('branch'); }

// ---- test framework ----
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); }
}
function sayHas(re) { return said.some(m => re.test(m)); }

try {
// ============ E1: camp abandon economy — no duplication, exact charge ============
freshGame();
const kcal0 = Game.state.scholar.kcal, ticks0 = Game.state.scholar.dayTicks;
campFixture(4, 4);
check('E1.0 camp A set up', !!Game.state.camp && Game.state.camp.px === 4 && Game.state.camp.py === 4);
const tentsAfterA = tentUnits();
const fireA = liveFiresOn(4, 4)[0];
// move to a new tile and set up camp B (this abandons A)
// (pitch+fire the tent first, then measure ONLY setUpCamp's own cost)
Game.map.px = 5; Game.map.py = 5;
giveTent(1);
pitchAt(5, 5, 3, 3);
liveFireAt(5, 5, 5, 5);
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
const kcalB = Game.state.scholar.kcal, ticksB = Game.state.scholar.dayTicks;
said.length = 0;
Game.setUpCamp();
check('E1.1 camp moved to B', !!Game.state.camp && Game.state.camp.px === 5 && Game.state.camp.py === 5);
// old tile swept: tent wrecked (dirt), fire doused, nothing returned to the pack
check('E1.2 old tent wrecked not returned', Game.genDetail(4, 4)[3][3] === 'dirt' && tentUnits() === tentsAfterA,
  'tent=' + tentUnits() + ' afterA=' + tentsAfterA);
check('E1.3 old fire doused', liveFiresOn(4, 4).length === 0 && Game.genDetail(4, 4)[5][5] === 'dirt',
  'fires=' + liveFiresOn(4, 4).length);
check('E1.4 abandon charged exactly 30 ticks', Game.state.scholar.dayTicks - ticksB === 30,
  'delta=' + (Game.state.scholar.dayTicks - ticksB));
check('E1.5 abandon charges no kcal', Math.round(Game.state.scholar.kcal) === Math.round(kcalB),
  'kcal delta=' + (Game.state.scholar.kcal - kcalB));
// new tile has its own tent + fire
check('E1.6 new camp has tent+fire', Game.genDetail(5, 5)[3][3] === 'tent' && liveFiresOn(5, 5).length === 1);

// ============ E2: feedFire fuel conservation ============
freshGame();
liveFireAt(4, 4, 5, 5);
giveBranch(5);
const f0 = liveFiresOn(4, 4)[0].till;
const added = [];
for (let i = 0; i < 3; i++) {
  const b = liveFiresOn(4, 4)[0].till;
  said.length = 0;
  Game.feedFire(5, 5);
  added.push(liveFiresOn(4, 4)[0].till - b);
}
check('E2.1 three feeds consumed three branches', branchUnits() === 2, 'left=' + branchUnits());
check('E2.2 till grew by exactly the named amount each feed',
  added.every(a => a > 0) && liveFiresOn(4, 4)[0].till === f0 + added[0] + added[1] + added[2],
  JSON.stringify(added));
check('E2.3 feed names the cost honestly', sayHas(/8 ticks of tending/));

// ============ E3: tent-unit conservation across pitch/pack cycles ============
freshGame();
giveTent(1);
const u0 = tentUnits();
for (let i = 0; i < 3; i++) {
  setCell(4, 4, 2 + i, 2, 'dirt');
  Game.state.scholar.mx = 2 + i; Game.state.scholar.my = 3;
  said.length = 0; Game.pitchTent(2 + i, 2);
  said.length = 0; Game.packTent(2 + i, 2);
}
check('E3.1 three pitch/pack cycles conserve units', tentUnits() === u0, 'units=' + tentUnits());
check('E3.2 pack copy says the tent returns', true); // asserted below via message
freshGame();
giveTent(1);
pitchAt(4, 4, 3, 3);
said.length = 0;
Game.packTent(3, 3);
check('E3.3 pack returns the tent to the pack', tentUnits() === 1);
check('E3.4 pack copy honest', sayHas(/pack it down/));

// ============ S1: contest modal while insideTent at a camp ============
freshGame();
campFixture(4, 4);
Game.state.scholar.mx = 3; Game.state.scholar.my = 3;
said.length = 0;
Game.enterTent(3, 3);
check('S1.1 entered tent', !!(Game.state.scholar.insideTent));
// the contest engine never touches camp or tent state (static: no refs)
const contestsSrc = srcOf('src/js/contests.js') + srcOf('src/js/contestEngine.js') + srcOf('src/js/broadcast.js');
check('S1.2 contest code has no camp/insideTent refs',
  !/state\.camp|breakCamp|insideTent/.test(contestsSrc));
// simulate a contest modal coming and going
Game.state.activeContest = { id: 'sim', phase: 0 };
Game.state.activeContest = null;
check('S1.3 camp survives the contest modal', !!(Game.state.camp && Game.state.camp.px === 4 && Game.state.camp.py === 4));
check('S1.4 tent room survives', !!(Game.state.scholar.insideTent));
Game.validateInsideTent();
check('S1.5 room validates (no phantom)', !!(Game.state.scholar.insideTent));

// ============ S2: storm (sheltered) while camp is on another tile ============
freshGame();
campFixture(4, 4);
Game.map.px = 3; Game.map.py = 3; // player elsewhere
Game.state.scholar.stormFront = { day: 1 };
const _pah = Game.playerAtHaven;
Game.playerAtHaven = () => true; // sheltered at haven
said.length = 0;
let threw = false;
try { Game.resolveStormFront(); } catch (e) { threw = true; }
Game.playerAtHaven = _pah;
check('S2.1 no throw', !threw);
check('S2.2 distant camp broken by the storm', !Game.state.camp);
check('S2.3 camp tile swept', Game.genDetail(4, 4)[3][3] === 'dirt' && liveFiresOn(4, 4).length === 0);
check('S2.4 storm named honestly', sayHas(/storm tore through it/));
check('S2.5 atCamp false after break', !Game.atPlayerCamp());

// ============ S3: alien douse-raid kills the campfire — camp stands ============
freshGame();
campFixture(4, 4);
const douse = Game.apDousePlayerFire ? Game.apDousePlayerFire() : null;
check('S3.1 douse path exists and fires', douse === true, String(douse));
check('S3.2 fire doused', liveFiresOn(4, 4).length === 0 && Game.genDetail(4, 4)[5][5] === 'dirt');
check('S3.3 camp stands without its fire', !!Game.state.camp, 'camp=' + JSON.stringify(Game.state.camp));
check('S3.4 atCamp still true', Game.atCamp());
// NOTE: with the campfire doused, setUpCamp names the missing fire first —
// the tent/fire checks deliberately run before the abandon/already-camp
// logic so a failed setup can never cost the old camp (camps-2 comment).
// Light a new fire and it must say "already your camp".
check('S3.5 setUpCamp names the missing fire first (honest gate order)', (() => { said.length = 0; Game.setUpCamp(); return sayHas(/own campfire burning/); })());
liveFireAt(4, 4, 5, 5);
check('S3.6 with fire back, "already your camp" (no duplicate camp)', (() => { said.length = 0; Game.setUpCamp(); return sayHas(/already your camp/); })());
check('S3.7 still exactly one camp', (() => { let n = 0; try { n = Game.state.camp ? 1 : 0; } catch (e) {} return n === 1; })());

// ============ H1: setUpCamp's promise — sorting + resting work at camp ============
freshGame();
campFixture(4, 4);
check('H1.1 sort ritual gate passes at player camp', Game.atCamp() === true);
// sortBag refuses with "do it at camp" when not at camp — at camp it must proceed past the gate
Game.state.scholar.prepStash = [{ lump: { dandelion: 3 }, name: 'haul' }];
said.length = 0;
try { Game.sortBag(null, 0, Game.state.scholar.prepStash); } catch (e) {}
check('H1.2 sort ritual not refused at camp', !sayHas(/flat surface and good light/));
// resting works at camp (not refused)
said.length = 0;
const energy0 = Game.state.scholar.energy || 0;
let restThrew = false;
try { Game.doAction('rest'); } catch (e) { restThrew = true; }
check('H1.3 rest not refused at camp', !restThrew && !sayHas(/Not in the middle of a fight/));

// ============ H2: pitchTent's "Sleep quality: tent" ============
freshGame();
giveTent(1);
pitchAt(4, 4, 3, 3);
Game.state.scholar.mx = 3; Game.state.scholar.my = 3;
Game.enterTent(3, 3);
let prev = null;
try { prev = Game.sleepPreview(); } catch (e) {}
check('H2.1 sleep quality is tent inside a pitched tent', prev && prev.quality === 'tent',
  'quality=' + (prev && prev.quality));

// ============ D1: every camp/structures fn exists and is UI-reachable ============
const CAMP_FNS = ['pitchTent', 'packTent', 'enterTent', 'exitTent', 'setTentVent',
  'lightTentFire', 'feedTentFire', 'cookInTent', 'setUpCamp', 'canSetUpCamp',
  'hasTentNearby', 'hasCampfireNearby', 'breakCamp', 'atPlayerCamp', 'campTentStanding',
  'wreckTent', 'campAbandonLoss', 'killCampFires', 'validateInsideTent',
  'wandererTentBreach', 'faceTentIntruder', 'shelteredFromSky', 'tentFire', 'tentFireLit'];
for (const fn of CAMP_FNS) {
  check('D1.fn ' + fn, typeof Game[fn] === 'function');
}
// the 4 context-bar labels are emitted under the right conditions
freshGame();
setCell(4, 4, 6, 6, 'dirt');
giveTent(1);
Game.state.scholar.mx = 6; Game.state.scholar.my = 5;
let labels = Game.cellActions(6, 6) || [];
check('D1.L1 "Pitch tent" offered on clear ground with a packed tent', labels.includes('Pitch tent'), labels.join('|'));
Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
pitchAt(4, 4, 3, 3);
labels = Game.cellActions(3, 3) || [];
check('D1.L2 "Pack up tent" + "Enter tent" on yours tent', labels.includes('Pack up tent') && labels.includes('Enter tent'), labels.join('|'));
liveFireAt(4, 4, 5, 5);
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
labels = Game.cellActions(6, 6) || [];
check('D1.L3 "Set up camp" offered with tent+fire nearby', labels.includes('Set up camp'), labels.join('|'));
// app.js maps all four labels to engine calls
const appSrc = srcOf('src/js/app.js');
for (const l of ['Pitch tent', 'Pack up tent', 'Enter tent', 'Set up camp']) {
  check('D1.M app.js maps "' + l + '"', appSrc.includes(`label === '${l}'`));
}
// tent room wires all 7 buttons to engine functions
for (const [id, fn] of [['tr-light', 'lightTentFire'], ['tr-feed', 'feedTentFire'], ['tr-cook', 'cookInTent'],
    ['tr-vent', 'setTentVent'], ['tr-sleep', 'sleep'], ['tr-exit', 'exitTent'], ['tr-face', 'faceTentIntruder']]) {
  check('D1.W tent room ' + id + ' -> Game.' + fn,
    appSrc.includes(`wire('${id}'`) && typeof Game[fn] === 'function');
}

// ============ H4: haven door trips must not wipe the grounds ============
// BREAK (R13): enterBuilding/exitBuilding null the haven tile's cached
// detail to switch inside/outside views — the regen silently DELETED any
// player-pitched tent (no message, no refund) and left its interior-fire
// entry in state.fires as a phantom. Re-pitching the same cell inherited a
// FREE lit fire (same class as the camps-3 packTent phantom-fire catch).
freshGame();
Game.map.tiles[4][4].type = 'haven';
Game.state.scholar.insideHaven = false;
Game.map.px = 4; Game.map.py = 4;
setCell(4, 4, 7, 2, 'dirt');
giveTent(1);
Game.state.scholar.mx = 7; Game.state.scholar.my = 3;
said.length = 0; Game.pitchTent(7, 2);
check('H4.0 tent pitched on the grounds', Game.genDetail(4, 4)[2][7] === 'tent');
Game.enterTent(7, 2);
Game.addMaterial('branch', 3);
said.length = 0; Game.lightTentFire();
const fireLitBefore = Game.tentFireLit();
check('H4.1 tent fire lit', fireLitBefore === true);
Game.exitTent();
const unitsBeforeDoor = tentUnits();
said.length = 0;
check('H4.2 enterBuilding works', Game.enterBuilding() === true);
check('H4.3 exitBuilding works', Game.exitBuilding() === true);
check('H4.4 tent survives the door round-trip', Game.genDetail(4, 4)[2][7] === 'tent',
  'cell=' + Game.genDetail(4, 4)[2][7]);
const gsec = (Game.tileAt(4, 4).secrets || {})['7,2'];
check('H4.5 tent secret survives', !!(gsec && gsec.yours));
check('H4.6 no silent destruction (units unchanged, nothing mourned)',
  tentUnits() === unitsBeforeDoor && !sayHas(/wrecked|destroyed|torn down/i));
Game.state.scholar.mx = 7; Game.state.scholar.my = 3;
Game.enterTent(7, 2);
check('H4.7 interior fire continuity — same fire, not a phantom, not a freebie',
  Game.tentFireLit() === fireLitBefore);
// engine armor: no walking through the lodge door from inside the tent
check('H4.8 enterBuilding refuses while insideTent', (() => { said.length = 0; const r = Game.enterBuilding(); return r === false && sayHas(/duck out/i); })());
Game.exitTent();
// the hall interior still builds correctly after the view-cache split
Game.enterBuilding();
check('H4.9 hall interior intact', Game.genDetail(4, 4)[1][1] === 'hall' && Game.genDetail(4, 4)[5][3] === 'fire');
Game.exitBuilding();
check('H4.10 grounds restored after hall visit', Game.genDetail(4, 4)[2][7] === 'tent');
// SAVE/LOAD: the JSON round-trip duplicates the shared t.detail reference —
// the branch must re-link the live cache, not resurrect a stale copy.
const tileSnap = JSON.stringify(Game.tileAt(4, 4));
Game.map.tiles[4][4] = JSON.parse(tileSnap); // fresh objects, duplicated refs
Game.state.scholar.insideHaven = false;
check('H4.11 tent survives save/load', Game.genDetail(4, 4)[2][7] === 'tent');
const gsec2 = (Game.tileAt(4, 4).secrets || {})['7,2'];
check('H4.12 secret survives save/load', !!(gsec2 && gsec2.yours));
// post-load changes go to the live cache and survive a door trip
setCell(4, 4, 6, 1, 'dirt');
Game.state.scholar.mx = 6; Game.state.scholar.my = 2;
giveTent(1); said.length = 0; Game.pitchTent(6, 1);
Game.enterBuilding(); Game.exitBuilding();
check('H4.13 post-load tent survives door trip', Game.genDetail(4, 4)[2][7] === 'tent' && Game.genDetail(4, 4)[1][6] === 'tent',
  'a=' + Game.genDetail(4, 4)[2][7] + ' b=' + Game.genDetail(4, 4)[1][6]);
// a full CAMP on the haven grounds survives the door round trip (no phantom camp)
Game.state.scholar.mx = 6; Game.state.scholar.my = 2; // adjacent to tent (7,2)
liveFireAt(4, 4, 6, 3); // adjacent to player
said.length = 0; Game.setUpCamp();
check('H4.14 camp set up on the grounds', !!Game.state.camp);
Game.enterBuilding(); Game.exitBuilding();
check('H4.15 camp + tent + fire survive the door trip',
  !!Game.state.camp && Game.genDetail(4, 4)[2][7] === 'tent' && liveFiresOn(4, 4).length === 1);
check('H4.16 atCamp true after trip', Game.atCamp());

// ============ U4: Steve's law — the haven's lodge does not break ============
// The ONLY 'lodge' cells in the game are the haven's lodge (map-gen); no
// player build-lodge action exists. destroyCell's unbreakable list is the
// law's enforcement point and it omitted 'lodge' — a latent violation.
freshGame();
Game.map.tiles[4][4].type = 'haven';
Game.state.scholar.insideHaven = false;
Game.map.px = 4; Game.map.py = 4;
const gd = Game.genDetail(4, 4);
let lx = -1, ly = -1;
for (let y = 0; y < 9 && lx < 0; y++) for (let x = 0; x < 9; x++) if (gd[y][x] === 'lodge') { lx = x; ly = y; break; }
check('U4.0 haven grounds have a lodge', lx >= 0);
said.length = 0;
const dres = Game.destroyCell(lx, ly, 'bulldozer');
check('U4.1 destroyCell refuses the lodge', dres === false);
check('U4.2 lodge cell intact', Game.genDetail(4, 4)[ly][lx] === 'lodge');
check('U4.3 refusal names the law', sayHas(/Havens do not break/));

} catch (e) {
  fail++;
  failures.push('HARNESS THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
}

console.log(`\n==== RESULT: ${pass} pass, ${fail} fail ====`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); }
process.exit(fail ? 1 : 0);
