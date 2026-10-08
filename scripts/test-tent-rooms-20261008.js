// TENT ROOMS v1 + LIGHTING NUANCE — proof tests (Steve 2026-10-08).
// Proves: afternoon spawn, nuanced darkness (rain dims, haven floor, firelight,
// tent interior), enterable tents, rain-immune interior fires, exposed-fire rain
// tax, smoke/vent tradeoffs, and edge-case guards.
// Usage: node scripts/test-tent-rooms-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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
let rng = mulberry32(20261008);
Math.random = function () { return rng(); };

global.window = global; // stub for modules needing `window` at load
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
Game.data = global.SCATTER_DATA;

async function settle() { await new Promise(r => setTimeout(r, 10)); }

// ---- stubs ----
const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.drama = () => {};
Game.recordLegend = () => {};
Game.recordMoment = () => {};
Game.ledgerAdd = () => {};
Game.maxHealth = () => 100;
Game.integrationStage = () => 0;
Game.discover = () => {};
Game.npcBatchTurn = () => {};
Game.monsterTurn = () => {};
Game.npcNodeTravel = () => {};
Game.resolveAssignments = () => {};
Game.regrowTiles = () => {};
Game.regrowLand = () => {};
Game.checkTraps = () => {};
Game.log = [];

// tile/detail stubs
const tiles = {};
function blankDetail() {
  const d = [];
  for (let y = 0; y < 9; y++) { d.push([]); for (let x = 0; x < 9; x++) d[y].push('grass'); }
  return d;
}
Game.tileAt = (x, y) => tiles[x + ',' + y];
Game.playerTile = () => tiles[Game.map.px + ',' + Game.map.py];
Game.genDetail = (px, py) => {
  const t = tiles[px + ',' + py] || (tiles[px + ',' + py] = { type: 'wild', secrets: {} });
  t.detail = t.detail || blankDetail();
  return t.detail;
};

function freshScholar() {
  const st = S.state.newState();
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: ['v1'], rosterChars: { v1: { id: 'v1', name: 'Mara Voss' } }, trust: {},
  });
  st.scholar = S.state.newScholar('v1');
  st.scholar.day = 5;
  st.scholar.inventory = [
    { kind: 'tent', name: 'Packed tent', units: 1 },
    { kind: 'branch', material: 'branch', name: 'Fallen branches', units: 10 },
  ];
  st.scholar.mx = 4; st.scholar.my = 4;
  st.scholar.kcal = 2000; st.scholar.health = 100; st.scholar.energy = 100; st.scholar.hydration = 100;
  return st;
}
function wire(st) {
  said.length = 0;
  for (const k of Object.keys(tiles)) delete tiles[k];
  tiles['4,4'] = { type: 'wild', secrets: {} };
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { px: 4, py: 4, tiles: {} };
  Game.dayPart = 1; Game.location = 'wild'; Game.departed = true;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; Game.tbfight = null; Game.pendingEncounter = false;
  Game.state.fires = [];
  Game.state.weather = 'clear';
}
function pitchAndEnter() {
  Game.pitchTent(5, 4);
  Game.enterTent(5, 4);
}

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}

async function main() {
  await settle();

  // ============ 1. AFTERNOON SPAWN ============
  {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    check('1a. spawn sets dayPart=1 (midday), not dawn',
      /AFTERNOON SPAWN[\s\S]{0,400}?this\.dayPart = 1;/.test(src));
    check('1b. spawn sets dayTicks=192 (mid-afternoon)',
      /AFTERNOON SPAWN[\s\S]{0,400}?dayTicks = 192/.test(src));
    const st = freshScholar(); wire(st);
    st.scholar.dayTicks = 192; Game.dayPart = 1;
    check('1c. spawn light values give full light', Game.lightLevel() === 1, 'light=' + Game.lightLevel());
  }

  // ============ 2. DARKNESS NUANCE ============
  {
    const st = freshScholar(); wire(st);
    // night on wild tile, clear
    st.scholar.dayTicks = 400; Game.dayPart = 3;
    check('2a. night wild clear = moonlight 0.15', Game.lightLevel() === 0.15, 'light=' + Game.lightLevel());
    // rain dims the night further
    Game.state.weather = 'rain';
    check('2b. rain dims night (0.12 floor)', Game.lightLevel() === 0.12, 'light=' + Game.lightLevel());
    // rainy midday is gloom, not noon
    st.scholar.dayTicks = 192; Game.dayPart = 1;
    check('2c. rainy midday = 0.7 (dimmed from 1)', Game.lightLevel() === 0.7, 'light=' + Game.lightLevel());
    Game.state.weather = 'clear';
    check('2d. clear midday still full', Game.lightLevel() === 1);
    // haven holds comfortable light at night
    st.scholar.dayTicks = 400; Game.dayPart = 3;
    tiles['4,4'].type = 'haven';
    check('2e. haven at night = 0.65 floor', Game.lightLevel() === 0.65, 'light=' + Game.lightLevel());
    tiles['4,4'].type = 'wild';
    // firelight pools at night
    Game.genDetail(4, 4)[3][3] = 'fire';
    check('2f. near fire at night lifts to 0.45', Game.lightLevel() === 0.45, 'light=' + Game.lightLevel());
    Game.genDetail(4, 4)[3][3] = 'grass';
  }

  // ============ 3. TENT ENTER / EXIT / SHELTER ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    const s = st.scholar;
    check('3a. enterTent sets insideTent', !!s.insideTent && s.insideTent.cx === 5 && s.insideTent.cy === 4);
    check('3b. shelteredFromSky inside tent', Game.shelteredFromSky() === true);
    check('3c. cellActions hides Enter tent while inside',
      !Game.cellActions(5, 4).includes('Enter tent'));
    Game.exitTent();
    check('3d. exitTent clears', !st.scholar.insideTent);
    check('3e. cellActions offers Enter tent on own tent',
      Game.cellActions(5, 4).includes('Enter tent'));
    // cold-day shiver tax: the real advancePart path
    st.scholar.dayTicks = 100; Game.dayPart = 1;
    Game.state.weather = 'cold';
    st.scholar.kcal = 1000;
    Game.enterTent(5, 4);
    Game.advancePart();
    check('3f. NO shiver tax while inside tent (real advancePart)', st.scholar.kcal === 1000, 'kcal=' + st.scholar.kcal);
    Game.exitTent();
    st.scholar.dayTicks = 100; Game.dayPart = 1; st.scholar.kcal = 1000;
    Game.advancePart();
    check('3g. shiver tax bites when exposed outside', st.scholar.kcal === 980, 'kcal=' + st.scholar.kcal);
  }

  // ============ 4. INTERIOR FIRE: rain-immune; EXPOSED FIRE: rain tax ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    Game.lightTentFire();
    const f = Game.tentFire();
    check('4a. interior fire lit', !!f && f.inside === true);
    check('4b. interior fire is small (0.6x branch burn)', f.burn0 === Math.round(128 * 0.6), 'burn0=' + f.burn0);
    const tillBefore = f.till;
    Game.state.weather = 'rain';
    Game.taxFires();
    const f2 = Game.tentFire();
    check('4c. rain onset does NOT halve interior fire', f2.till === tillBefore, `till ${tillBefore} -> ${f2.till}`);
    check('4d. interior fire never gets rainHit', f2.rainHit !== true);
    // vent closed: zero drain in rain
    Game.setTentVent(false);
    st.scholar.dayTicks += 20;
    Game.taxFires();
    check('4e. vent closed: interior fire immune in rain (no drain)', Game.tentFire().till === tillBefore, 'till=' + Game.tentFire().till);
    // vent open: 1.25x draft drain, still no gutter
    Game.setTentVent(true);
    st.scholar.dayTicks += 20;
    Game.taxFires();
    const afterDraft = Game.tentFire().till;
    check('4f. vent open: draft costs 1.25x (5 ticks)', afterDraft === tillBefore - 5, `till=${afterDraft} expected=${tillBefore - 5}`);
    // exposed fire: rain onset halves, then 2x burn
    const now = Game._absTick();
    Game.state.fires.push({ tx: 4, ty: 4, cx: 3, cy: 3, till: now + 200, lastTax: now });
    said.length = 0;
    Game.taxFires();
    const ef = Game.state.fires.find(x => !x.inside);
    check('4g. rain onset halves exposed fire', ef.till === now + 100, 'till=' + ef.till);
    check('4h. rain onset is named honestly', said.some(m => /rain hisses on your fire/.test(m)));
    st.scholar.dayTicks += 10;
    Game.taxFires();
    check('4i. exposed fire burns 2x in rain', ef.till === 2772 - 10, 'till=' + ef.till);
    Game.state.weather = 'clear';
    Game.taxFires();
    check('4j. rainHit resets when rain ends', ef.rainHit === false);
  }

  // ============ 5. SMOKE / VENT ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    Game.lightTentFire();
    Game.setTentVent(false);
    st.scholar.energy = 100;
    st.scholar.dayTicks = 10;
    said.length = 0;
    Game.tickAction(100);
    check('5a. sealed flap + fire: coughing fit costs energy', st.scholar.energy === 97, 'energy=' + st.scholar.energy);
    check('5b. smoke warning names the fix', said.some(m => /Open the vent flap/.test(m)));
    // vented: no smoke buildup
    Game.setTentVent(true);
    st.scholar.energy = 100;
    Game.tickAction(100);
    check('5c. vented: no smoke, no energy loss', st.scholar.energy === 100, 'energy=' + st.scholar.energy);
  }

  // ============ 6. SLEEP SMOKE INHALATION ============
  // NOTE: sleep() ticks through to dawn, which fires endDay()'s full
  // world-sim (needs a real map). endDay is stubbed for this section — the
  // inhalation block runs in sleep()'s body accounting, after the tick loop,
  // and doesn't depend on endDay's effects.
  {
    const realEndDay = Game.endDay;
    Game.endDay = () => {};
    try {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    st.scholar.dayTicks = 400; Game.dayPart = 3;
    Game.state.weather = 'clear';
    Game.lightTentFire();
    Game.setTentVent(false);
    st.scholar.health = 100; st.scholar.energy = 100;
    said.length = 0;
    Game.sleep();
    check('6a. sealed sleep: health -10', st.scholar.health === 90, 'health=' + st.scholar.health);
    check('6b. sealed sleep: energy capped at 50', st.scholar.energy <= 50, 'energy=' + st.scholar.energy);
    check('6c. sealed sleep names the lesson', said.some(m => /Vent the tent/.test(m)));
    // Vented control: same setup, flap open — no inhalation.
    {
      const st2 = freshScholar(); wire(st2);
      pitchAndEnter();
      st2.scholar.dayTicks = 400; Game.dayPart = 3;
      Game.state.weather = 'clear';
      Game.lightTentFire();
      Game.setTentVent(true);
      st2.scholar.health = 100; st2.scholar.energy = 100;
      said.length = 0;
      Game.sleep();
      check('6d. vented sleep: no inhalation', st2.scholar.health === 100 && st2.scholar.energy === 100, 'health=' + st2.scholar.health + ' energy=' + st2.scholar.energy);
    }
    } finally { Game.endDay = realEndDay; }
  }

  // ============ 7. EDGE GUARDS ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    said.length = 0;
    Game.packTent(5, 4);
    check('7a. cannot pack the tent you are inside',
      said.some(m => /inside it/.test(m)) && Game.genDetail(4, 4)[4][5] === 'tent');
    // encounter while inside: NO yank anymore (Steve 2026-10-08) — the causal
    // breach system owns this now. A pending encounter inside the tent is
    // legitimate (it's IN there with you); status() leaves it alone.
    Game.pendingEncounter = true;
    Game.pendingInTent = true;
    Game.pendingMonsterId = 'hushwolf';
    said.length = 0;
    Game.status();
    check('7b. status() does NOT yank you out (breach system owns it)',
      !!st.scholar.insideTent && Game.pendingEncounter === true);
    Game.pendingEncounter = false; Game.pendingInTent = false;
    // phantom room validation
    Game.enterTent(5, 4);
    Game.genDetail(4, 4)[4][5] = 'dirt';
    delete tiles['4,4'].secrets['5,4'];
    said.length = 0;
    Game.validateInsideTent();
    check('7d. wrecked tent clears insideTent (no phantom room)', !st.scholar.insideTent);
    // feed cap: small fire can't hold a bonfire
    const st2 = freshScholar(); wire(st2);
    pitchAndEnter();
    Game.lightTentFire();
    Game.feedTentFire(); Game.feedTentFire(); Game.feedTentFire();
    const f = Game.tentFire();
    const now = Game._absTick();
    check('7e. interior feed capped at 2x burn0', f.till <= now + f.burn0 * 2, `till-now=${f.till - now}, cap=${f.burn0 * 2}`);
    // breakCamp dumps you out
    Game.state.camp = { px: 4, py: 4, condition: 'shitty', setUpDay: 5 };
    Game.breakCamp('a test storm');
    check('7f. breakCamp dumps you outside', !st2.scholar.insideTent);
  }

  console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
