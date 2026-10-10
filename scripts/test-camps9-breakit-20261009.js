// BREAK-IT: camps & structures — NINTH PASS (2026-10-09).
// Rounds 1-8 killed phantom camps x2, lying breakCamp messages, pack->re-pitch
// free repair, shredded-tent state, room eviction invariants, INFINITE BURY,
// sweepDeadFires eating tents, storm camp rules, bulldoze camp integrity, the
// bridge system, camp<->fire interplay (stale-fire camp lie, hearth-fire camp,
// struck-message fire lie, shredded-camp softlock, struck sweep wrecking the
// other tent, dead setUpDay field, cookFood stale-fire gate), pitchTent cost
// honesty, tent persistence on travel, destroyCell camp kill, one-camp-at-a-time,
// cook-in-tent fire lie, wreckTent/destroyCell over-break (campTentStanding rule),
// travel phantom tent room.
// This pass attacks what they left alone:
//   C1. STRUCK-BREAK EVICTION LIE: breakCamp('you packed up the tent') dumps
//       insideTent unconditionally — even when the tent you're in still stands.
//       Two tents on the camp tile, inside tent A, pack tent B (engine path):
//       BEFORE clears insideTent and says "The canvas comes down around you —
//       you crawl out into the open, coughing." The canvas did NOT come down.
//       Tent A stands, intact, yours. Eviction + lie.
//       FIX (game.js breakCamp): only evict when the tent you're in is actually
//       gone (cell/secret check) — the struck path then leaves you inside the
//       standing tent; the destroyed path still evicts honestly.
//   HELD (attacked, verified, not changed):
//   H1. EXILE + CAMP: exilePlayer leaves state.camp and pitched tents standing.
//       Physical persistence — tents are facts on the ground; "what crosses
//       the road with you: yourself, your Codex, your pack. Nothing else."
//       No duplication, no phantom camp, no orphaned insideTent.
//   H2. BURY AT CAMP + STORM: a buried cache on the camp tile survives
//       breakCamp — the hole is in the ground, not in the tent. digUpCache
//       still returns it exactly once (INFINITE BURY stays dead).
//   H3. DEAD CODE re-scan (incl. app.js callers): every camp/structure helper
//       defined AND called. No dead camp helper.
//   H4. cookInTent fire-death race: cookAll's wrapper downgrades on mid-batch
//       fuel death (forager break-it) — no pay-then-refuse.
// Usage: node scripts/test-camps9-breakit-20261009.js
//        BEFORE=1 node scripts/test-camps9-breakit-20261009.js
//        SEED=777 node scripts/test-camps9-breakit-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/camps9-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/camps9-before-${path.basename(f)}`, 'utf8')
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
function campFixture2() {
  // TWO pitched tents + one LIVE player fire. Returns nothing; camp NOT yet made.
  giveTent(2);
  setCell(3, 3, 'dirt'); Game.state.scholar.mx = 3; Game.state.scholar.my = 4;
  said.length = 0; Game.pitchTent(3, 3);
  setCell(5, 3, 'dirt'); Game.state.scholar.mx = 5; Game.state.scholar.my = 4;
  said.length = 0; Game.pitchTent(5, 3);
  const till = Game._absTick() + 100000;
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx: 5, cy: 5, till, lastTax: Game._absTick() });
  setCell(5, 5, 'fire');
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  said.length = 0;
}
function makeCampHere() {
  said.length = 0;
  Game.setUpCamp();
  if (!Game.state.camp) throw new Error('setUpCamp failed: ' + said.join(' | '));
  said.length = 0;
}
function enterTentAt(cx, cy) {
  // direct state set (enterTent also ticks); equivalent room state.
  Game.state.scholar.insideTent = { tx: Game.map.px, ty: Game.map.py, cx, cy };
  Game.state.scholar.tentSmoke = 0;
}
function tentStands(cx, cy) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  const t = Game.tileAt(Game.map.px, Game.map.py);
  const sec = t.secrets && t.secrets[cx + ',' + cy];
  return d[cy] && d[cy][cx] === 'tent' && sec && sec.yours && sec.condition !== 'shredded';
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}

// ============ C1: struck breakCamp evicts from a STANDING tent (BROKE) ============
freshGame(); campFixture2(); makeCampHere();
enterTentAt(3, 3);                       // inside tent A
said.length = 0;
Game.packTent(5, 3);                     // strike tent B (engine path; tent room hides grid in honest UI)
ok('C1a struck breakCamp does NOT clear insideTent when the tent still stands',
  !!Game.state.scholar.insideTent, 'insideTent=' + JSON.stringify(Game.state.scholar.insideTent));
ok('C1b struck breakCamp does NOT say the canvas came down (it did not)',
  !said.some(m => /canvas comes down/.test(m)), 'said: ' + said.join(' | ').slice(0, 200));
ok('C1c tent A still stands after struck break', tentStands(3, 3));
ok('C1d struck message still names the packed tent honestly',
  said.some(m => /back in your pack/.test(m)), 'said: ' + said.join(' | ').slice(0, 200));

// controls: destroyed camp DOES evict honestly
freshGame(); campFixture2(); makeCampHere();
enterTentAt(3, 3); said.length = 0;
Game.breakCamp('the storm tore through it');
ok('C1e destroyed camp clears insideTent (tent wrecked by sweep)',
  !Game.state.scholar.insideTent);
ok('C1f destroyed camp says the canvas came down honestly',
  said.some(m => /canvas comes down/.test(m)));
ok('C1g destroyed camp: tent A wrecked', !tentStands(3, 3));

// control: wreckTent of the tent you're inside evicts via the choke point
freshGame(); campFixture2(); makeCampHere();
enterTentAt(3, 3); said.length = 0;
Game.wreckTent(Game.map.px, Game.map.py, 3, 3);
Game.validateInsideTent(); // the every-status() choke point (camps-5)
ok('C1h wreckTent of occupied tent evicts at validateInsideTent', !Game.state.scholar.insideTent);

// regression: struck path keeps the OTHER tent's interior fire burning (camps-3/7)
freshGame(); campFixture2(); makeCampHere();
(function () {
  const now = Game._absTick(), burn = 100000;
  (Game.state.fires = Game.state.fires || []).push({ tx: Game.map.px, ty: Game.map.py, cx: 3, cy: 3, till: now + burn, burn0: burn, inside: true, lastTax: now });
})();
said.length = 0;
Game.packTent(5, 3);
ok('C1i struck: other tent interior fire survives',
  (Game.state.fires || []).some(f => f.inside && f.cx === 3 && f.cy === 3));
ok('C1j struck: packed tent interior fire purged (camps-3)',
  !(Game.state.fires || []).some(f => f.inside && f.cx === 5 && f.cy === 3));

// ============ H1: exile + camp (HELD) ============
freshGame(); campFixture2(); makeCampHere();
const tentsBefore = (Game.state.scholar.inventory.find(i => i.kind === 'tent') || { units: 0 }).units;
said.length = 0;
Game.exilePlayer('moot');
ok('H1a exile keeps the camp reference (physical persistence)', !!Game.state.camp && Game.state.camp.px === 4 && Game.state.camp.py === 4);
ok('H1b exile keeps pitched tents standing', tentStands(3, 3) && tentStands(5, 3));
ok('H1c exile creates no tent items out of thin air',
  ((Game.state.scholar.inventory.find(i => i.kind === 'tent') || { units: 0 }).units || 0) === (tentsBefore || 0));
ok('H1d exile: no phantom camp without a tent', Game.campTentStanding(4, 4));

// ============ H2: bury at camp + storm break (HELD) + INFINITE BURY dead ============
freshGame(); campFixture2(); makeCampHere();
Game.addMaterial('branch', 4);
said.length = 0;
Game.buryCache('material', 'branch', 4);
const cacheId = (Game.playerCaches()[Game.playerCaches().length - 1] || {}).id;
ok('H2a buryCache removes from material stock',
  Game.materialCount('branch') === 0, 'materialCount=' + Game.materialCount('branch'));
said.length = 0;
Game.breakCamp('the storm tore through it');
ok('H2b storm breakCamp does not delete the buried cache entry',
  Game.playerCaches().some(c => c.id === cacheId && (c.items || []).length > 0),
  'cacheId=' + cacheId);

// INFINITE BURY regression: dig returns exactly once
freshGame();
Game.addMaterial('branch', 2);
said.length = 0;
Game.buryCache('material', 'branch', 2);
(function () {
  const list = Game.playerCaches();
  const c = list[list.length - 1];
  const id = c && c.id;
  const w0 = Game.packWeight();
  if (id != null) Game.digUpCache(id);
  const w1 = Game.packWeight();
  if (id != null) Game.digUpCache(id); // second dig must not duplicate
  const w2 = Game.packWeight();
  ok('H2c digUpCache returns the goods once', w1 > w0, `w0=${w0} w1=${w1}`);
  ok('H2d digUpCache second dig does NOT duplicate', Math.abs(w2 - w1) < 1e-9, `w0=${w0} w1=${w1} w2=${w2}`);
})();

// ============ H3: dead-code scan (define vs call, incl. app.js) ============
(function () {
  const files = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
  const all = files.map(f => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n');
  const helpers = ['pitchTent', 'packTent', 'setUpCamp', 'breakCamp', 'hasCampfireNearby',
    'hasTentNearby', 'canSetUpCamp', 'atCamp', 'enterTent', 'exitTent', 'validateInsideTent',
    'tentFire', 'tentFireLit', 'lightTentFire', 'feedTentFire', 'cookInTent', 'setTentVent',
    'campTentStanding', 'wreckTent', 'destroyCell', 'scorchCells', 'sweepDeadFires',
    'buildBridge', 'smashBridge', 'stormSmashBridges', 'buryCache', 'digUpCache',
    'dailyCacheCheck', 'havenStoresAccess', 'tentSecretAt', 'sleepQuality'];
  for (const h of helpers) {
    const defRe = new RegExp('(^|\\n)\\s{4}' + h + '\\s*\\(');
    const callRe = new RegExp('\\.' + h + '\\s*\\(|[^\\w$]' + h + '\\s*\\(', 'g');
    const defined = defRe.test(all);
    const calls = (all.match(callRe) || []).length;
    // subtract the definition's own match
    const realCalls = defined ? calls - 1 : calls;
    ok('H3 dead-code: ' + h + ' defined+called', defined && realCalls >= 1,
      `defined=${defined} callSites~${realCalls}`);
  }
})();

console.log(`\n${pass} passed, ${fail} failed (${BEFORE ? 'BEFORE' : 'AFTER'})`);
process.exit(fail ? 1 : 0);
