// BREAK-IT (survivalist, playtest loop 2026-10-09): the 23:59 NAP exploit.
//
// ATTACK: sleep() grants the FULL night's healing + full energy restore even
// when called with only a handful of ticks left in the day budget. The sleep
// loop exits as soon as endDay rolls the day, then runs the complete dawn
// accounting unconditionally — so sleeping at dayTicks=511 is a 1-tick nap
// with a full night's benefits, and the entire unconscious-window danger
// model (monster turns between 32-tick chunks, encounter checks, tent-wreck
// wake, contest grab) never gets a chance to fire.
//
// The dawn guard ("It's barely dawn... sleep is for later") refuses sleep at
// day START but nothing guards day END. This test asserts the symmetric fix:
// with <64 ticks left (< 2 batch turns — no real night to sleep through),
// sleep() refuses honestly and points at Rest instead.
//
// Usage: node scripts/test-survivalist-sleep-nap-20261009.js
//        BEFORE=1 node scripts/test-survivalist-sleep-nap-20261009.js
//        SEED=777 node scripts/test-survivalist-sleep-nap-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/sleepnap-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/sleepnap-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub ----
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
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
  for (let y = 0; y < 9; y++) { const r = []; for (let x = 0; x < 9; x++) r.push({ type: 'haven' }); tiles.push(r); }
  return tiles;
}
function freshGame() {
  const st = S.state.newState();
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: ['v1'], rosterChars: { v1: { id: 'v1', name: 'Mara Voss' } }, trust: {},
  });
  st.scholar = S.state.newScholar('v1');
  st.scholar.day = 5;
  st.scholar.kcal = 2200; st.scholar.health = 50; st.scholar.hydration = 100;
  st.scholar.energy = 20;
  st.scholar.mx = 4; st.scholar.my = 4;
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { tiles: mkMap(), px: 4, py: 4, worldSeed: 1, worldSize: 9 };
  Game.location = 'haven';
  Game.dayPart = 3; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; said.length = 0;
  Game.tbfight = null; Game._pendingPack = null;
  Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.state.weather = 'clear';
  Game.data.villagers = Object.values(st.village.rosterChars || {});
  // bunk next to the player -> sleepQuality 'bunk' (heal 35, energy 100)
  Game.genDetail(Game.map.px, Game.map.py)[4][5] = 'bunk';
  return st;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

console.log('E1: the 23:59 nap — sleep with 12 ticks left must NOT grant a full night');
{
  const st = freshGame();
  const s = st.scholar;
  s.dayTicks = 500; Game.dayPart = 3; // 12 ticks to dawn
  const dayBefore = s.day, hpBefore = s.health, enBefore = s.energy;
  said.length = 0;
  Game.sleep();
  check('nap refused: day did not advance', s.day === dayBefore, `day ${dayBefore} -> ${s.day}`);
  check('nap refused: no healing', s.health === hpBefore, `health ${hpBefore} -> ${s.health}`);
  check('nap refused: no energy restore', s.energy === enBefore, `energy ${enBefore} -> ${s.energy}`);
  const line = said.join(' ');
  check('refusal is honest (names the short night)', /too late|hour off|dawn/i.test(line), line.slice(0, 120));
  check('refusal points at Rest', /rest/i.test(line), line.slice(0, 120));
}

console.log('E2: boundary — 64 ticks left (two batch turns) still sleeps');
{
  const st = freshGame();
  const s = st.scholar;
  s.dayTicks = 448; Game.dayPart = 3; // exactly 64 ticks to dawn
  const dayBefore = s.day;
  said.length = 0;
  Game.sleep();
  check('64-tick night: day advanced', s.day === dayBefore + 1, `day ${dayBefore} -> ${s.day}`);
  check('64-tick night: healed like a night', s.health === 85, `health -> ${s.health} (want 85)`);
  check('64-tick night: energy restored', s.energy === 100, `energy -> ${s.energy}`);
}

console.log('E3: control — full night (128 ticks) still grants full benefits');
{
  const st = freshGame();
  const s = st.scholar;
  s.dayTicks = 384; Game.dayPart = 3;
  const dayBefore = s.day;
  said.length = 0;
  Game.sleep();
  check('full night: day advanced', s.day === dayBefore + 1);
  check('full night: bunk heal 35', s.health === 85, `health -> ${s.health}`);
  check('full night: energy 100', s.energy === 100);
}

console.log('S1: softlock — after a refused nap the player can still end the day');
{
  const st = freshGame();
  const s = st.scholar;
  s.dayTicks = 500; Game.dayPart = 3;
  Game.sleep(); // refused
  const dayBefore = s.day;
  Game.doAction('wait'); // wait out the last of the night
  check('wait after refused nap ends the day', s.day === dayBefore + 1, `day ${dayBefore} -> ${s.day}`);
  check('game not over / not stuck', !Game.over);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
