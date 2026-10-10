// BREAK-IT: camps & structures — R10 (2026-10-10).
//
// Rounds 1-9 (camps-2..camps-9, phantom, storm-break, infinite-bury) killed:
// phantom camps x3, lying breakCamp messages, pack->re-pitch free repair,
// shredded-tent state, room eviction invariants, infinite bury, fire/tent
// sweep races, storm/bulldoze/beam camp integrity, bridge double-build +
// dry-land lie, struck-message fire lie, stale-fire camps, hearth-fire camps.
//
// THIS ROUND attacks what they left alone:
//   H1. COLD-PIT LIE (honesty — THE CATCH): a camp can OUTLIVE its fire —
//       the flame burns down while the tents stand. breakCamp's destroyed
//       path then promised "the fire's scattered cold" about a cold pit.
//       Same copy-vs-engine class as camps-7's struck-path fix (which only
//       fixed the struck branch). FIX: killCampFires() sweeps dead entries
//       first and returns the LIVE count; the destroyed message names the
//       fire only when one actually died ("the fire was already cold" else).
//   H1-SIBLING (honesty): ledger.js playerDeath's "the fire's gone cold"
//       had the identical unconditional claim — the mantle passes with a
//       dead fire and the copy still mourns a flame. Same fix, same helper.
//   E1. EXPLOIT: tent-unit conservation across pitch/pack cycles (no dup,
//       no silent loss).
//   E2. EXPLOIT: cross-tile abandon — old camp's tents/fires destroyed,
//       no tent duplication, buried cache on the old tile untouched.
//   S1. SOFTLOCK: JSON save/load round-trip with camp+fire+insideTent —
//       no phantom camp, no phantom room, camp integrity holds.
//   S2. SOFTLOCK: storm while sheltered at Haven WITH a camp on the Haven
//       tile — camp breaks, haven hearth survives, no crash.
//   S5. HELD: monster breach wrecks ONE of two tents — camp survives
//       (camps-8 regression).
//   H2. HELD: struck path with a dead fire names no fire (camps-7 regression).
//   H3. HELD: setUpCamp charges exactly 30 ticks (copy honesty).
//   D1. DEAD-CODE: every camp/structure function has a live call site.
//
// Usage: node scripts/test-break-camps-20261010.js
//        BEFORE=1 node scripts/test-break-camps-20261010.js   (red on H1/H1s)
//        SEED=777 node scripts/test-break-camps-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js', 'src/js/ledger.js', 'src/js/alienPlayers.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps10-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js + ledger.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps10-before-${path.basename(f)}`, 'utf8')
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
function tentUnits() {
  return (Game.state.scholar.inventory || []).filter(i => i.kind === 'tent').reduce((a, i) => a + (i.units || 0), 0);
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
function deadFireAt(tx, ty, cx, cy) {
  // burned-out entry + lingering 'fire' cell — the flame died on its own.
  (Game.state.fires = Game.state.fires || []).push({ tx, ty, cx, cy, till: Game._absTick() - 10, burn0: 100 });
  setCell(tx, ty, cx, cy, 'fire');
}
function killAllFires() {
  for (const f of (Game.state.fires || [])) f.till = Game._absTick() - 5;
}
function campFixture(tx, ty) {
  // one pitched tent + one LIVE player fire, adjacent to the player; camp set.
  tx = tx == null ? Game.map.px : tx; ty = ty == null ? Game.map.py : ty;
  giveTent(1);
  pitchAt(tx, ty, 3, 3);
  liveFireAt(tx, ty, 5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  return Game.state.camp;
}
function yoursTentsOn(tx, ty) {
  const t = Game.tileAt(tx, ty), d = Game.genDetail(tx, ty);
  let n = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (d[y] && d[y][x] === 'tent') {
      const sec = t.secrets && t.secrets[x + ',' + y];
      if (sec && sec.yours && sec.condition !== 'shredded') n++;
    }
  }
  return n;
}
function liveFiresOn(tx, ty) {
  const now = Game._absTick();
  return (Game.state.fires || []).filter(f => f.tx === tx && f.ty === ty && f.till > now).length;
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ================= H1. COLD-PIT LIE =================
section('H1. cold-pit lie: destroyed camp with an already-dead fire');

freshGame();
campFixture();
check('H1.0 fixture: camp set', !!Game.state.camp);
killAllFires();                       // the flame burns down; the tents stand
said.length = 0;
Game.wreckTent(Game.map.px, Game.map.py, 3, 3);   // monster tears the tent down
const h1msg = said.join(' | ');
check('H1.1 camp broke on the wreck', !Game.state.camp, h1msg.slice(0, 160));
check('H1.2 no "scattered cold" about a dead fire', !/scattered cold/.test(h1msg), h1msg.slice(0, 200));
check('H1.3 honest cold-pit copy', /already cold/.test(h1msg), h1msg.slice(0, 200));

// control: a LIVE fire really does get scattered cold
freshGame();
campFixture();
said.length = 0;
Game.wreckTent(Game.map.px, Game.map.py, 3, 3);
const h1c = said.join(' | ');
check('H1.4 live fire still named honestly', /scattered cold/.test(h1c), h1c.slice(0, 200));

// storm path with a dead fire (global, player elsewhere)
freshGame();
campFixture();
killAllFires();
said.length = 0;
Game.breakCamp('the storm tore through it');
const h1s = said.join(' | ');
check('H1.5 storm + dead fire: no scattered-cold lie', !/scattered cold/.test(h1s), h1s.slice(0, 200));
check('H1.6 storm + dead fire: honest cold copy', /already cold/.test(h1s), h1s.slice(0, 200));

// ================= H1-SIBLING. ledger death =================
section('H1-sibling. ledger playerDeath with a dead fire');

freshGame();
campFixture();
killAllFires();
said.length = 0;
try {
  Game.playerDeath('the test took them');
} catch (e) { check('H1s.0 playerDeath runs in harness', false, 'threw: ' + e.message); }
const h1d = said.join(' | ');
check('H1s.1 death message exists', /no keeper now/.test(h1d), h1d.slice(0, 200));
check('H1s.2 no "gone cold" about a dead fire', !/fire's gone cold/.test(h1d), h1d.slice(0, 240));
check('H1s.3 honest cold copy on death', /already cold/.test(h1d), h1d.slice(0, 240));

// control: death with a LIVE fire
freshGame();
campFixture();
said.length = 0;
try { Game.playerDeath('the test took them'); } catch (e) {}
const h1dc = said.join(' | ');
check('H1s.4 death with live fire still says gone cold', /fire's gone cold/.test(h1dc), h1dc.slice(0, 240));

// ================= E1. tent-unit conservation =================
section('E1. tent economy: pitch/pack conserves units exactly');

freshGame();
giveTent(2);
const px0 = Game.map.px, py0 = Game.map.py;
pitchAt(px0, py0, 3, 3);
pitchAt(px0, py0, 5, 5);
check('E1.1 two tents pitched, none left packed', tentUnits() === 0 && yoursTentsOn(px0, py0) === 2,
  'units=' + tentUnits() + ' standing=' + yoursTentsOn(px0, py0));
said.length = 0;
Game.packTent(3, 3);
Game.packTent(5, 5);
check('E1.2 packing both returns exactly 2', tentUnits() === 2, 'units=' + tentUnits());
check('E1.3 no phantom tent cells', yoursTentsOn(px0, py0) === 0);
// last-unit pitch removes the item row (no 0-unit ghost that re-pitches free)
freshGame();
giveTent(1);
pitchAt(Game.map.px, Game.map.py, 3, 3);
const ghost = (Game.state.scholar.inventory || []).find(i => i.kind === 'tent');
check('E1.4 last unit pitched: no zero-unit item left', !ghost || (ghost.units || 0) > 0,
  ghost ? 'units=' + ghost.units : 'no tent item');

// ================= E2. cross-tile abandon =================
section('E2. cross-tile abandon: old camp destroyed, nothing duplicated');

freshGame();
const ax = 4, ay = 4;
campFixture(ax, ay);
Game.addMaterial('branch', 4);
Game.buryCache('material', 'branch', 2);
const cachesBefore = Game.playerCaches().length;
check('E2.0 cache buried at old camp tile', cachesBefore === 1);
// move to a fresh tile and found a second camp
Game.map.px = 5; Game.map.py = 4;
campFixture(5, 4);
check('E2.1 old camp abandoned (one camp at a time)', !Game.state.camp || (Game.state.camp.px === 5 && Game.state.camp.py === 4),
  JSON.stringify(Game.state.camp));
check('E2.2 old tile: no yours-tents standing', yoursTentsOn(ax, ay) === 0);
check('E2.3 old tile: no live fires', liveFiresOn(ax, ay) === 0);
check('E2.4 new tile: camp + tent + fire', !!Game.state.camp && yoursTentsOn(5, 4) === 1 && liveFiresOn(5, 4) === 1);
check('E2.5 tent units conserved (2 pitched, none duplicated)', tentUnits() === 0, 'units=' + tentUnits());
check('E2.6 buried cache survives the abandon', Game.playerCaches().length === 1,
  'caches=' + Game.playerCaches().length);
said.length = 0;
Game.map.px = 4; Game.map.py = 4;   // walk back — digUpCache is location-gated
const dug = Game.digUpCache(Game.playerCaches()[0].id);
check('E2.7 cache still diggable after abandon', !!dug, 'dug=' + JSON.stringify(dug).slice(0, 80));

// ================= S1. save/load round-trip =================
section('S1. persistence round-trip: camp + fire + tent room survive');

freshGame();
campFixture();
Game.state.scholar.insideTent = { tx: Game.map.px, ty: Game.map.py, cx: 3, cy: 3 };
Game.syncRun();
const snap = JSON.stringify({ state: Game.state, run: Game.state.run });
const back = JSON.parse(snap);
Game.state = back.state;
Game.state.run = back.run;
let s1ok = true, s1err = '';
try {
  Game.validateInsideTent();
  check('S1.1 insideTent validated (room still real)', !!Game.state.scholar.insideTent, s1err);
  check('S1.2 camp survived', !!Game.state.camp && Game.atPlayerCamp());
  check('S1.3 tent secret survived', yoursTentsOn(Game.map.px, Game.map.py) === 1);
  check('S1.4 fire entry survived live', liveFiresOn(Game.map.px, Game.map.py) === 1);
} catch (e) { s1ok = false; check('S1.0 round-trip runs', false, 'threw: ' + e.message); }

// ================= S2. storm at haven tile =================
section('S2. storm sheltered at Haven with a camp on the Haven tile');

freshGame();
Game.map.tiles[4][4] = { type: 'haven' };
Game.state.scholar.insideHaven = false;
const grounds = Game.genDetail(4, 4);
const hearthCell = grounds[4] && grounds[4][2];
check('S2.0 haven grounds have a hearth', hearthCell === 'fire', 'cell=' + hearthCell);
// pitch on clear ground, light a tracked fire, set up camp
let clearSpot = null;
outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
  if (['dirt', 'grass'].indexOf(grounds[y][x]) !== -1 && !(x === 4 && y === 2)) { clearSpot = [x, y]; break outer; }
}
check('S2.1 clear ground on the Haven tile', !!clearSpot);
if (clearSpot) {
  giveTent(1);
  pitchAt(4, 4, clearSpot[0], clearSpot[1]);
  const fspot = [Math.min(8, clearSpot[0] + 1), clearSpot[1]];
  if (['dirt', 'grass'].indexOf(Game.genDetail(4, 4)[fspot[1]][fspot[0]]) !== -1) {
    liveFireAt(4, 4, fspot[0], fspot[1]);
  }
  // stay adjacent to the pitched tent AND the fire (hasTentNearby /
  // hasCampfireNearby scan within 1 of the player)
  Game.state.scholar.mx = clearSpot[0]; Game.state.scholar.my = clearSpot[1] + 1;
  said.length = 0;
  Game.setUpCamp();
  check('S2.2 camp founded on the Haven tile', !!Game.state.camp, said.join(' | ').slice(0, 120));
  Game.playerAtHaven = () => true;
  Game.state.scholar.stormFront = { day: 5 };
  said.length = 0;
  let stormThrew = null;
  try { Game.resolveStormFront(); } catch (e) { stormThrew = e.message; }
  check('S2.3 storm resolves without throwing', !stormThrew, stormThrew);
  check('S2.4 camp broken by the storm', !Game.state.camp);
  check('S2.5 haven hearth still burns', Game.genDetail(4, 4)[4][2] === 'fire',
    'cell=' + Game.genDetail(4, 4)[4][2]);
}

// ================= S5. breach with two tents (camps-8 regression) =================
section('S5. one tent wrecked of two: camp survives');

freshGame();
campFixture();
giveTent(1);
pitchAt(Game.map.px, Game.map.py, 6, 6);
said.length = 0;
Game.wreckTent(Game.map.px, Game.map.py, 3, 3);
check('S5.1 camp survives the loss of one tent', !!Game.state.camp && Game.atPlayerCamp(), said.join(' | ').slice(0, 160));
check('S5.2 no camp-gone message', !/camp is gone/.test(said.join(' | ')));

// ================= H2/H3. struck + cost honesty (regressions) =================
section('H2/H3. struck-path + cost honesty regressions');

freshGame();
campFixture();
killAllFires();
said.length = 0;
Game.packTent(3, 3);   // struck path, dead fire
const h2 = said.join(' | ');
check('H2.1 struck + dead fire: no "keeps burning" lie', !/keeps burning/.test(h2), h2.slice(0, 200));
check('H2.2 camp struck, not destroyed', !Game.state.camp && /struck/.test(h2), h2.slice(0, 160));

freshGame();
const dt0 = Game.state.scholar.dayTicks || 0;
giveTent(1); pitchAt(Game.map.px, Game.map.py, 3, 3);
liveFireAt(Game.map.px, Game.map.py, 5, 5);
Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
said.length = 0;
Game.setUpCamp();
const spent = (Game.state.scholar.dayTicks || 0) - dt0;
check('H3.1 setUpCamp charges its 30 ticks', spent >= 30, 'spent=' + spent);

// ================= S6. sibling sweep: alien fire sabotage honesty =================
section('S6. sibling: apDousePlayerFire only douses YOUR live fire');

freshGame();
// A: map fire only (hearth-style — never yours, never tracked)
setCell(Game.map.px, Game.map.py, 5, 5, 'fire');
const s6a = Game.apDousePlayerFire();
check('S6.1 map fire refused (not yours)', s6a === false, 'returned=' + s6a);
check('S6.2 map fire cell untouched', Game.genDetail(Game.map.px, Game.map.py)[5][5] === 'fire');

freshGame();
// B: burned-out player fire, cell never swept — the cold pit
deadFireAt(Game.map.px, Game.map.py, 5, 5);
const s6b = Game.apDousePlayerFire();
check('S6.3 dead fire refused (already burned down)', s6b === false, 'returned=' + s6b);

freshGame();
// C: control — a live player fire IS doused
liveFireAt(Game.map.px, Game.map.py, 5, 5);
const s6c = Game.apDousePlayerFire();
check('S6.4 live player fire doused', s6c === true, 'returned=' + s6c);
check('S6.5 cell + entry cleared', Game.genDetail(Game.map.px, Game.map.py)[5][5] !== 'fire' && liveFiresOn(Game.map.px, Game.map.py) === 0);

// ================= D1. dead-code scan =================
section('D1. camp/structure functions are reachable');

const gameSrc = srcOf('src/js/game.js');
const ledgerSrc = srcOf('src/js/ledger.js');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const foodSrc = fs.readFileSync(path.join(ROOT, 'src/js/food.js'), 'utf8');
const allSrc = gameSrc + '\n' + ledgerSrc + '\n' + appSrc + '\n' + foodSrc;
const campFns = ['pitchTent', 'packTent', 'enterTent', 'exitTent', 'setUpCamp', 'canSetUpCamp',
  'hasTentNearby', 'hasCampfireNearby', 'breakCamp', 'atPlayerCamp', 'lightTentFire',
  'feedTentFire', 'tentFire', 'cookInTent', 'setTentVent', 'validateInsideTent',
  'campTentStanding', 'wreckTent', 'buildBridge', 'smashBridge', 'stormSmashBridges',
  'makeFire', 'feedFire', 'sweepDeadFires', 'taxFires', 'buryCache', 'digUpCache'];
// killCampFires is the R10 fix's own helper — absent by design in BEFORE mode.
if (!BEFORE) campFns.push('killCampFires');
for (const fn of campFns) {
  const calls = (allSrc.match(new RegExp('[.]' + fn + '\\s*\\(', 'g')) || []).length;
  const defs = (allSrc.match(new RegExp('(^|[^.a-zA-Z])' + fn + '\\s*\\(', 'gm')) || []).length;
  const liveCalls = calls; // ".fn(" = method calls; defs use "fn(" at line start
  check('D1.' + fn + ' reachable', liveCalls >= 1, 'calls=' + liveCalls);
}

console.log('\n----');
console.log('PASS ' + pass + ' / FAIL ' + fail + (BEFORE ? ' (BEFORE mode)' : ' (AFTER mode)'));
if (failures.length) console.log('failures:\n  ' + failures.join('\n  '));
process.exit(fail ? 1 : 0);
