// BREAK-IT: camps & structures — R11 (2026-10-10).
//
// Rounds 1-10 killed: phantom camps x3, lying breakCamp messages, pack->re-pitch
// free repair, shredded-tent state, room eviction invariants, infinite bury,
// fire/tent sweep races, storm/bulldoze/beam camp integrity, bridge double-build
// + dry-land lie, struck-message fire lie, stale-fire camps, hearth-fire camps,
// cold-pit lie (killCampFires), ledger death cold-pit sibling, alien douse lie,
// tent economy conservation, cross-tile abandon, save/load round-trip,
// storm-on-Haven-tile, breach one-of-two tents.
//
// THIS ROUND attacks what they left alone:
//   E1. EXPLOIT (THE CATCH): exile while inside your tent. exilePlayer never
//       cleared s.insideTent (or a pending tent breach) — death did (ledger.js
//       camps-3), exile didn't. The engine kept believing you were inside a
//       tent standing back at the old fire: shelteredFromSky() true from tiles
//       away (cold/rain tax exemptions), the tent room screen rendering with
//       live cook/feed/light actions while walking open ground, "Rain hammers
//       the canvas" with no canvas. A tent pitched on the Haven tile makes it
//       trivially reachable (exile happens at Haven). FIX: exilePlayer evicts
//       the room + clears the pending breach, honestly ("crawl out... it stays
//       pitched behind you"). The tent itself STANDS — walk back and reclaim.
//   E2. SOFTLOCK (sibling): a pending tent breach followed the exile —
//       "that thing is IN here with you" on an empty road. Cleared by the fix.
//   E3. HELD (judgment): the camp CLAIM survives exile — personal claim on a
//       wild tile, tents stay sec.yours, atCamp()/sort ritual work if you walk
//       back at your own risk. No economy break found; matches the exile copy
//       ("what crosses the road with you: yourself, your Codex, your pack" —
//       the camp doesn't cross, it stays). Flagged for Steve, not changed.
//   H1. HONESTY: wreckTent->breakCamp with zero tents left in the sweep still
//       says "The tent's wrecked" — true (wreckTent just wrecked it), no count.
//   H2. HONESTY regression: storm + dead fire stays honest (R10's fix).
//   S1. SOFTLOCK: post-exile move + validateInsideTent + sleepQuality: no crash.
//   D1. DEAD-CODE: every camp/structure function wired (live call sites), and
//       no reader touches a state.camp field that doesn't exist ({px,py,
//       condition} only).
//
// Usage: node scripts/test-break-camps-r11-20261010.js
//        BEFORE=1 node scripts/test-break-camps-r11-20261010.js  (red on E1/E2)
//        SEED=777 node scripts/test-break-camps-r11-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/betrayal.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps11-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix betrayal.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps11-before-${path.basename(f)}`, 'utf8')
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
  st.scholar.insideHaven = false; // out in the world, not in the hall
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
function killAllFires() {
  for (const f of (Game.state.fires || [])) f.till = Game._absTick() - 5;
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
function litTentFireAt(tx, ty, cx, cy) {
  const now = Game._absTick();
  (Game.state.fires = Game.state.fires || []).push({ tx, ty, cx, cy, till: now + 100000, burn0: 100000, inside: true, lastTax: now });
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

// ================= E1. EXILE + INSIDE-TENT (the catch) =================
section('E1. exile while inside the tent');

freshGame();
giveTent(1);
pitchAt(4, 4, 3, 3);
said.length = 0;
Game.enterTent(3, 3);
litTentFireAt(4, 4, 3, 3);
const s0 = Game.state.scholar;
check('E1.0 fixture: inside the tent', !!s0.insideTent);
check('E1.0b fixture: tent fire lit', Game.tentFireLit() === true);
check('E1.0c fixture: sky-sheltered', Game.shelteredFromSky() === true);
said.length = 0;
Game.exilePlayer('debug');
const exMsg = said.join(' | ');
const s = Game.state.scholar;
check('E1.0d exile ran, no crash', s.exiled === true);
// walk two tiles away from the tent
Game.map.px = 6; Game.map.py = 6;
check('E1.1 insideTent cleared on exile', !s.insideTent, 'stale room rides along');
check('E1.2 no phantom sky-shelter 2 tiles from the tent', Game.shelteredFromSky() === false, 'phantom storm/cold shelter');
check('E1.3 no remote tent fire', Game.tentFireLit() === false, 'remote fire');
Game.validateInsideTent(); // the everyStatus() choke point
check('E1.4 choke point leaves no room', !s.insideTent, 'tent still stands so validate would keep a stale room');
check('E1.5 honest tent-left-behind line', /crawl out of the tent/.test(exMsg), exMsg.slice(0, 200));
check('E1.6 tent still stands — walk back and reclaim it', yoursTentsOn(4, 4) === 1);

// ================= E2. PENDING BREACH + EXILE =================
section('E2. pending tent breach follows the exile');

freshGame();
giveTent(1);
pitchAt(4, 4, 3, 3);
Game.enterTent(3, 3);
Game.pendingEncounter = true; Game.pendingInTent = true; Game.pendingMonsterId = 'hushwolf';
said.length = 0;
Game.exilePlayer('debug');
check('E2.1 pending breach cleared on exile', Game.pendingInTent === false && Game.pendingEncounter === false && Game.pendingMonsterId === null, 'breach rides along on an empty road');

// ================= E3. CAMP CLAIM SURVIVES EXILE (held, documented) =================
section('E3. camp claim after exile (held by design judgment)');

freshGame();
campFixture();
check('E3.0 fixture: camp set', !!Game.state.camp);
said.length = 0;
Game.exilePlayer('debug');
check('E3.1 exile with a camp: no crash', Game.state.scholar.exiled === true);
check('E3.2 camp claim persists (personal claim on a wild tile; walk back at your own risk)', !!Game.state.camp);
Game.map.px = 4; Game.map.py = 4; // walk back to the old tile
check('E3.3 atCamp() true on the old tile', Game.atCamp() === true);
check('E3.4 tents still yours on the old tile', yoursTentsOn(4, 4) === 1);

// ================= H1. WRECK->BREAKCAMP MESSAGE HONESTY =================
section('H1. wreckTent->breakCamp message (zero-tent sweep)');

freshGame();
campFixture();
said.length = 0;
Game.wreckTent(4, 4, 3, 3); // last tent: wreckTent wrecks it, then breakCamp sweeps zero
const h1m = said.join(' | ');
check('H1.1 camp broke on the wreck', !Game.state.camp, h1m.slice(0, 160));
check('H1.2 message names the real cause', /tore it down/.test(h1m), h1m.slice(0, 220));
check('H1.3 no invented tent count', !/\d+ tents are wrecked/.test(h1m), h1m.slice(0, 220));
check('H1.4 singular tent line is true (the tent WAS wrecked, just before)', /The tent's wrecked/.test(h1m), h1m.slice(0, 220));

// ================= H2. STORM + DEAD FIRE (R10 regression) =================
section('H2. storm + dead fire stays honest (R10 regression)');

freshGame();
campFixture();
killAllFires();
said.length = 0;
Game.breakCamp('the storm tore through it');
const h2m = said.join(' | ');
check('H2.1 no scattered-cold lie about a dead fire', !/scattered cold/.test(h2m), h2m.slice(0, 200));
check('H2.2 honest cold-pit copy', /already cold/.test(h2m), h2m.slice(0, 200));

// ================= S1. POST-EXILE MOVEMENT: no crash, no stale room =================
section('S1. post-exile move + status choke: no crash, no stale room');

freshGame();
giveTent(1);
pitchAt(4, 4, 3, 3);
Game.enterTent(3, 3);
Game.exilePlayer('debug');
Game.map.px = 6; Game.map.py = 6;
let crashed = null;
try {
  Game.validateInsideTent();
  Game.shelteredFromSky();
  Game.sleepQuality();
  Game.tentFireLit();
} catch (e) { crashed = e.message; }
check('S1.1 no crash on the post-exile status path', crashed === null, crashed);
check('S1.2 no stale room after exile', !Game.state.scholar.insideTent);

// ================= D1. DEAD-CODE: wiring =================
section('D1. camp/structure functions wired');

const wired = ['campTentStanding', 'killCampFires', 'atPlayerCamp', 'tentSecretAt',
  'tentVentOpenAt', 'validateInsideTent', 'hasTentNearby', 'hasCampfireNearby',
  'canSetUpCamp', 'exilePlayer', 'breakCamp', 'setUpCamp', 'wreckTent',
  'enterTent', 'exitTent', 'packTent', 'pitchTent', 'makeFire', 'feedFire',
  'sweepDeadFires', 'buryCache', 'digUpCache', 'lightTentFire', 'feedTentFire',
  'cookInTent', 'setTentVent', 'shelteredFromSky'];
for (const fn of wired) check('D1.fn ' + fn, typeof Game[fn] === 'function');
// call-site presence: definition + at least one caller in the loaded sources
const srcAll = FILES.map(f => { try { return srcOf(f); } catch (e) { return ''; } }).join('\n');
for (const fn of ['campTentStanding', 'killCampFires', 'atPlayerCamp', 'tentSecretAt',
  'tentVentOpenAt', 'validateInsideTent', 'hasCampfireNearby', 'canSetUpCamp',
  'exilePlayer', 'shelteredFromSky']) {
  const n = (srcAll.match(new RegExp('\\b' + fn + '\\b', 'g')) || []).length;
  check('D1.calls ' + fn + ' (occurrences=' + n + ')', n >= 3, 'def + caller expected');
}
// state.camp shape: only {px, py, condition} are ever read
const campReads = {};
for (const m of srcAll.matchAll(/\.camp\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g)) {
  campReads[m[1]] = (campReads[m[1]] || 0) + 1;
}
const allowed = ['px', 'py', 'condition'];
const bad = Object.keys(campReads).filter(k => !allowed.includes(k));
check('D1.campFields only px/py/condition read', bad.length === 0, 'bad=' + bad.join(',') + ' reads=' + JSON.stringify(campReads));
// index.html loads every camp-touching module
const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of ['betrayal.js', 'ledger.js', 'game.js', 'storage.js', 'app.js']) {
  check('D1.index loads ' + m, idxHtml.includes(m));
}

console.log('\nPASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
