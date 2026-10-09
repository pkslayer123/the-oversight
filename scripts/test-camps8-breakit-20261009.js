// BREAK-IT: camps & structures — EIGHTH PASS (2026-10-09).
// Rounds 1-7 killed phantom camps x2, lying breakCamp messages, pack->re-pitch
// free repair, shredded-tent state, room eviction invariants, INFINITE BURY,
// sweepDeadFires eating tents, storm camp rules, bulldoze camp integrity, the
// bridge system, camp+fire interplay (stale-fire lie, hearth-fire camp,
// struck-message lie, shredded-camp softlock, struck sweep wrecking the other
// tent, dead setUpDay field, cookFood stale-fire gate), pitchTent cost honesty,
// tent persistence on travel, destroyCell camp kill, one-camp-at-a-time.
//
// This pass attacks what they left alone: the tent-fire cooking path, the
// multi-tent camp over-break class (wreckTent/destroyCell vs the scorchCells
// rule from round 7), and node travel with a live tent room.
//
// CATCHES (all demonstrated RED in BEFORE mode, GREEN after fix):
//   C1. COOK-IN-TENT FIRE LIE (honesty + wasted cost): cookInTent() checks
//       tentFireLit(), promises "Small fire, slow cooking", charges 24 ticks,
//       then calls the food.js-wrapped cookAll() whose gate was nearFire() —
//       grid cells ONLY. Beside a lit fire pan with no grid fire, the player
//       got "Need a fire to cook." and lost 24 ticks. The tent-room Cook
//       button renders exactly then (fireLit && rawCount) — UI-reachable.
//       FIX (food.js): the cookAll gate counts the tent fire, same pattern as
//       boilWater. Sibling of round-7's C7 (cookFood stale-fire gate).
//   C2. WRECKTENT OVER-BREAK (honesty): wreckTent broke the camp whenever the
//       wrecked tent sat on the camp tile — even with another INTACT
//       yours-tent standing. A monster tearing down one of two tents also
//       condemned the other via breakCamp's tent sweep (no item, no tent
//       back). Round 7's scorchCells fix established the rule (a surviving
//       intact tent keeps the camp); wreckTent never got it.
//       FIX: wreckTent breaks the camp only when no intact yours-tent
//       remains — via the new shared campTentStanding(tx,ty) helper.
//   C3. DESTROYCELL OVER-BREAK (honesty): same class — destroyCell smashed
//       one camp tent and breakCamp's sweep wrecked the other standing tent.
//       FIX: same helper guard.
//   C4. TRAVEL PHANTOM TENT ROOM (softlock-adjacent): travelTo never cleared
//       insideTent. The tent-room screen keys off insideTent alone, and
//       validateInsideTent keeps it (the old tent still stands, yours) — so
//       a direct travelTo while inside rendered the old tent's room on the
//       new tile, with tentFire()/sleepQuality() reading the old tile.
//       FIX: travelTo clears insideTent (you walk out to travel). Engine
//       armor — the honest UI's tent room has no travel button.
//
// Usage: node scripts/test-camps8-breakit-20261009.js
//        BEFORE=1 node scripts/test-camps8-breakit-20261009.js
//        SEED=777 node scripts/test-camps8-breakit-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js', 'src/js/food.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps8-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js + food.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps8-before-${path.basename(f)}`, 'utf8')
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

function giveTent(n) {
  const inv = Game.state.scholar.inventory;
  let t = inv.find(i => i.kind === 'tent');
  if (!t) { t = { kind: 'tent', name: 'Packed tent', units: 0, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it.' }; inv.push(t); }
  t.units += (n || 1);
}
function setCell(cx, cy, v) { Game.genDetail(Game.map.px, Game.map.py)[cy][cx] = v; }
function cellAt(cx, cy) { return Game.genDetail(Game.map.px, Game.map.py)[cy][cx]; }
function pitchAt(cx, cy) {
  setCell(cx, cy, 'dirt');
  Game.state.scholar.mx = cx; Game.state.scholar.my = cy + 1; // adjacent
  said.length = 0;
  Game.pitchTent(cx, cy);
}
function liveFireAt(cx, cy, burn) {
  const till = Game._absTick() + (burn || 100000);
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx, cy, till, lastTax: Game._absTick() });
  setCell(cx, cy, 'fire');
}
function litTentFireAt(cx, cy) {
  const now = Game._absTick(), burn = 100000;
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx, cy, till: now + burn, burn0: burn, inside: true, lastTax: now });
}
function campFixture2() {
  // TWO pitched tents + one LIVE player fire, player adjacent. Returns camp.
  giveTent(2);
  pitchAt(3, 3);
  pitchAt(5, 3);
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

// ================= C1: cookInTent vs the fire gate =================
section('C1. honesty: cookInTent beside a lit fire pan (no grid fire)');

freshGame();
{
  giveTent(1);
  pitchAt(3, 3);
  Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
  Game.enterTent(3, 3);
  litTentFireAt(3, 3);
  const inv = Game.state.scholar.inventory;
  inv.push({ name: 'Test tubers', kcalEach: 100, rawKcal: 100, units: 2, kg: 0.5, spoilDay: 9 });
  const t0 = Game.state.scholar.dayTicks || 0;
  said.length = 0;
  Game.cookInTent();
  const log = said.join(' ');
  const cooked = !inv.some(i => i.rawKcal);
  const refused = /Need a fire to cook/.test(log);
  check('C1a cooking works on the lit tent fire (no "Need a fire to cook")', cooked && !refused, log.slice(0, 160));
  const dt = (Game.state.scholar.dayTicks || 0) - t0;
  check('C1b honest cost: 24 ticks charged for slow tent cooking', dt >= 24, `delta=${dt}`);
}

freshGame();
{
  // control: no fire at all — the tent-fire gate must still refuse honestly
  giveTent(1);
  pitchAt(3, 3);
  Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
  Game.enterTent(3, 3);
  const inv = Game.state.scholar.inventory;
  inv.push({ name: 'Test tubers', kcalEach: 100, rawKcal: 100, units: 2, kg: 0.5, spoilDay: 9 });
  said.length = 0;
  Game.cookInTent();
  const log = said.join(' ');
  const stillRaw = inv.some(i => i.rawKcal);
  check('C1c control: cold fire pan still refuses ("Need the tent fire lit")', stillRaw && /Need the tent fire lit/.test(log), log.slice(0, 140));
}

// ================= C2: wreckTent over-break =================
section('C2. honesty: wreckTent must not condemn the second tent');

freshGame();
{
  const c = campFixture2();
  check('C2-pre camp set with two tents', !!c, said.join(' ').slice(0, 120));
  said.length = 0;
  Game.wreckTent(Game.map.px, Game.map.py, 3, 3); // monster tears down ONE tent
  const campAlive = !!Game.state.camp;
  const otherStands = cellAt(5, 3) === 'tent';
  const saidTore = /tore it down/.test(said.join(' '));
  check('C2a camp survives when an intact tent remains', campAlive, `camp=${JSON.stringify(Game.state.camp)}`);
  check('C2b the other tent still stands (not sweep-wrecked)', otherStands, `cell(5,3)=${cellAt(5, 3)}`);
  check('C2c no "tore it down" camp-death copy', !saidTore, said.join(' ').slice(0, 140));
}

freshGame();
{
  // control: wrecking the ONLY tent still kills the camp (both modes)
  giveTent(1);
  pitchAt(3, 3);
  liveFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  check('C2d-pre camp set with one tent', !!Game.state.camp);
  said.length = 0;
  Game.wreckTent(Game.map.px, Game.map.py, 3, 3);
  check('C2d control: last tent wrecked -> camp breaks', !Game.state.camp, `camp=${JSON.stringify(Game.state.camp)}`);
  check('C2e control: honest cause copy names the tear-down', /tore it down/.test(said.join(' ')), said.join(' ').slice(0, 140));
}

// ================= C3: destroyCell over-break =================
section('C3. honesty: destroyCell must not condemn the second tent');

freshGame();
{
  const c = campFixture2();
  check('C3-pre camp set with two tents', !!c);
  said.length = 0;
  Game.destroyCell(3, 3, 'bulldozer'); // smash ONE tent
  const campAlive = !!Game.state.camp;
  const otherStands = cellAt(5, 3) === 'tent';
  check('C3a camp survives when an intact tent remains', campAlive, `camp=${JSON.stringify(Game.state.camp)}`);
  check('C3b the other tent still stands', otherStands, `cell(5,3)=${cellAt(5, 3)}`);
}

freshGame();
{
  // control: smashing the ONLY tent still kills the camp (both modes)
  giveTent(1);
  pitchAt(3, 3);
  liveFireAt(5, 5);
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
  Game.setUpCamp();
  check('C3c-pre camp set with one tent', !!Game.state.camp);
  said.length = 0;
  Game.destroyCell(3, 3, 'bulldozer');
  check('C3d control: last tent smashed -> camp breaks', !Game.state.camp, `camp=${JSON.stringify(Game.state.camp)}`);
  check('C3e control: bulldozer cause copy honest', /flattened/.test(said.join(' ')), said.join(' ').slice(0, 140));
}

// ================= C4: travelTo phantom tent room =================
section('C4. softlock-adjacent: node travel clears the tent room');

freshGame();
{
  giveTent(1);
  pitchAt(3, 3);
  Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
  Game.enterTent(3, 3);
  check('C4-pre inside the tent', !!(Game.state.scholar.insideTent));
  said.length = 0;
  const res = Game.travelTo(5, 4);
  check('C4a travel succeeded', Game.map.px === 5 && Game.map.py === 4, `at=${Game.map.px},${Game.map.py}`);
  check('C4b insideTent cleared on travel (no phantom room)', !Game.state.scholar.insideTent,
    `insideTent=${JSON.stringify(Game.state.scholar.insideTent)}`);
}

// ================= D. DEAD-CODE SWEEP =================
section('D. dead code: every camp/structure helper defined AND called');

{
  const files = {};
  // D-scan reads source as TEXT (no eval): include app.js too — the honest-UI
  // callers live there, and it's excluded from the eval list (DOM-only).
  for (const f of FILES.concat(['src/js/app.js'])) files[f] = srcOf(f);
  const all = Object.values(files).join('\n');
  const campHelpers = [
    'pitchTent', 'setUpCamp', 'breakCamp', 'packTent', 'hasCampfireNearby',
    'wreckTent', 'destroyCell', 'scorchCells', 'stormSmashBridges',
    'validateInsideTent', 'atPlayerCamp', 'enterTent', 'exitTent',
    'lightTentFire', 'feedTentFire', 'feedFire', 'cookInTent', 'setTentVent',
    'tentFire', 'tentFireLit', 'tentVentOpenAt', 'campTentStanding',
    'nearFire', 'sweepDeadFires', 'playerFireAt', 'fireLastsTillDawn',
    'sleepQuality', 'sleepPreview', 'buildBridge', 'smashBridge',
  ];
  const cacheHelpers = ['buryCache', 'digUpCache', 'takeFromCache', 'playerCaches', 'cachesHtml', 'dailyCacheCheck'];
  for (const name of campHelpers.concat(cacheHelpers)) {
    if (BEFORE && name === 'campTentStanding') continue; // new in this pass
    const defLineRe = new RegExp(`^\\s*${name}\\s*\\(|^\\s*${name}\\s*:\\s*function|\\bG\\.${name}\\s*=|\\bGame\\.${name}\\s*=\\s*function`);
    let defined = false, calls = 0;
    for (const ln of all.split('\n')) {
      if (!ln.includes(name + '(')) continue;
      const t = ln.trim();
      if (t.startsWith('//') || t.startsWith('*')) continue;
      if (defLineRe.test(ln)) { defined = true; continue; }
      calls++;
    }
    check(`D ${name} defined`, defined, '');
    check(`D ${name} called somewhere`, calls > 0, `calls=${calls}`);
  }
  // food.js atCamp (the sort ritual gate)
  {
    const defLineRe = /^\s*atCamp\s*\(/;
    let defined = false, calls = 0;
    for (const ln of all.split('\n')) {
      if (!ln.includes('atCamp(')) continue;
      const t = ln.trim();
      if (t.startsWith('//') || t.startsWith('*')) continue;
      if (defLineRe.test(ln)) { defined = true; continue; }
      calls++;
    }
    check('D atCamp defined', defined, '');
    check('D atCamp called somewhere', calls > 0, `calls=${calls}`);
  }
}

// ================= summary =================
console.log(`\n---- ${BEFORE ? 'BEFORE' : 'AFTER'} RESULT: ${pass} pass, ${fail} fail ----`);
if (failures.length) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); }
process.exit(fail ? 1 : 0);
