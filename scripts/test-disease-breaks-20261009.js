// BREAK-IT (diseases, 2026-10-09): four breaks, four fixes.
//
// B1 EXPLOIT — bulk eat() ate human meat silently: no trauma, no corruption,
//    no 15% trembles roll. eatOne() routed meat_human -> eatCannibal, but the
//    bulk Eat path (eat()) had no such routing. FIX: eat() routes meat_human
//    through eatCannibal.
// B2 HONESTY — undercooked bear/boar meat skipped the trichinosis roll: the
//    cook paths set foodState 'cooked' even on undercooked outcomes, and the
//    eat-path gated parasiteRisk on foodState !== 'cooked' — while the prep
//    text said "still risky". FIX: undercooked flags the item (eat-path rolls
//    on it); cooked-through deletes parasiteRisk (so smoking can't resurrect
//    the worms either).
// B3 HONESTY/EXPLOIT — trembles (prion, "no cure at any tier; slow and
//    CERTAIN") just expired after 40 day-parts like a cold, and the expireText
//    ("it never lets go") lied about the engine. FIX: expiry kills the bearer
//    (mantle passes); a ~2-day warning lands first.
// B4 HONESTY — the giant-mosquito bite branch refused a second virus once one
//    was held, blocking the min-max "seek both" build the per-bite 50/50
//    framing promised. FIX: mosquitoBiteVirus() excludes only the held virus.
//
// Usage: node scripts/test-disease-breaks-20261009.js
//        BEFORE=1 node scripts/test-disease-breaks-20261009.js   (pre-fix HEAD)
//        SEED=777 node scripts/test-disease-breaks-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js', 'src/js/food.js', 'src/js/statusEffects.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/disbreak-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/disbreak-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};

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
  ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}

function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
const realRandom = Math.random;
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
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
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
  st.scholar.kcal = 1200; st.scholar.health = 90; st.scholar.hydration = 100;
  st.scholar.energy = 60;
  st.scholar.mx = 4; st.scholar.my = 4;
  st.scholar.inventory = [];
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { tiles: mkMap(), px: 4, py: 4, worldSeed: 1, worldSize: 9 };
  Game.location = 'haven';
  Game.dayPart = 1; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; said.length = 0;
  Game.tbfight = null; Game._pendingPack = null;
  Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.state.weather = 'clear';
  Game.data.villagers = Object.values(st.village.rosterChars || {});
  return st;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

// ============ B1: bulk eat() must route human meat through eatCannibal ============
console.log('B1: human meat via the bulk Eat path');
{
  const st = freshGame();
  const s = st.scholar;
  s.inventory = [{ plantId: 'meat_human', foodKind: 'meat', foodState: 'raw', edible: true,
    units: 2, kcalEach: 550, hiddenKcal: 550, spoilDay: 999, name: 'human meat' }];
  const kcalBefore = s.kcal;
  let cannibalCalls = 0;
  const realEC = Game.eatCannibal;
  Game.eatCannibal = function (idx) {
    cannibalCalls++;
    const it = this.state.scholar.inventory[idx];
    it.units -= 1;
    if (it.units <= 0) this.state.scholar.inventory.splice(idx, 1);
    return true;
  };
  try { Game.eat(); } catch (e) { console.log('  (eat threw: ' + e.message + ')'); }
  Game.eatCannibal = realEC;
  if (BEFORE) {
    check('BEFORE: meat eaten SILENTLY (the break)', cannibalCalls === 0 && s.kcal > kcalBefore,
      `cannibalCalls=${cannibalCalls} kcal ${kcalBefore}->${s.kcal}`);
  } else {
    check('eat() routes meat_human through eatCannibal', cannibalCalls >= 1, `cannibalCalls=${cannibalCalls}`);
    check('meat consumed by the act, not the bulk path', s.inventory.length === 0 || s.inventory.every(i => i.plantId !== 'meat_human' || i.units === 1),
      JSON.stringify(s.inventory.map(i => i.units)));
  }
}

// ============ B2: undercooked keeps trichinosis; cooked-through kills it ============
function bearMeat() {
  return { plantId: 'meat_black_bear', foodKind: 'meat', foodState: 'cleaned', edible: true,
    units: 1, kcalEach: 400, hiddenKcal: 400, spoilDay: 999, name: 'bear meat (cleaned)',
    parasiteRisk: { id: 'trichinosis', p: 1 } };
}
console.log('B2a: undercooked bear meat still carries trichinosis');
{
  const st = freshGame();
  const s = st.scholar;
  s.inventory = [bearMeat()];
  Game.knowsTechnique = () => false;
  Game.nearFire = () => true;
  Game.consumeCookFire = () => 'ok';
  Game.cookOutcome = () => ({ key: 'undercooked', mult: 0.7, riskStays: true });
  Game.cookFood(0);
  const it = s.inventory[0];
  check('undercooked: foodState cooked', it.foodState === 'cooked', it.foodState);
  if (BEFORE) {
    check('BEFORE: no undercooked flag (the break)', !it.undercooked, 'undercooked=' + it.undercooked);
  } else {
    check('undercooked flagged', it.undercooked === true, 'undercooked=' + it.undercooked);
    check('parasiteRisk survives the bad fire', !!it.parasiteRisk, JSON.stringify(it.parasiteRisk));
  }
  // eat it with the roll forced: the worm roll must fire on undercooked meat
  Math.random = () => 0;
  try { Game.eatOne(0); } catch (e) { console.log('  (eatOne threw: ' + e.message + ')'); }
  Math.random = function () { return rng(); };
  const got = Game.hasStatus('scholar', 'trichinosis');
  if (BEFORE) {
    check('BEFORE: undercooked meat skipped the worm roll (the break)', !got, 'trichinosis=' + got);
  } else {
    check('undercooked meat rolls trichinosis', got === true, 'trichinosis=' + got);
  }
}
console.log('B2b: cooked-through bear meat is worm-free, and smoking cannot resurrect them');
{
  const st = freshGame();
  const s = st.scholar;
  s.inventory = [bearMeat()];
  Game.knowsTechnique = () => true;
  Game.nearFire = () => true;
  Game.consumeCookFire = () => 'ok';
  Game.cookOutcome = () => ({ key: 'perfect', mult: 1.0 });
  Game.cookFood(0);
  const it = s.inventory[0];
  if (BEFORE) {
    check('BEFORE: cooked meat kept a stale parasiteRisk (the break)', !!it.parasiteRisk, 'parasiteRisk=' + JSON.stringify(it.parasiteRisk));
  } else {
    check('cooked-through deletes parasiteRisk', !it.parasiteRisk, 'parasiteRisk=' + JSON.stringify(it.parasiteRisk));
    check('not flagged undercooked', !it.undercooked, 'undercooked=' + it.undercooked);
  }
  // smoke it: the worms must stay dead
  Game.knowsTechnique = () => true;
  try { Game.preserveFood ? Game.preserveFood() : Game.preserveMeat(); } catch (e) { console.log('  (preserve threw: ' + e.message + ')'); }
  const sm = s.inventory[0];
  check('smoked: foodState preserved', sm.foodState === 'preserved', sm.foodState);
  if (!BEFORE) check('smoked-after-cooked stays worm-free', !sm.parasiteRisk, 'parasiteRisk=' + JSON.stringify(sm.parasiteRisk));
}
console.log('B2c: smoking RAW bear meat does NOT clear trichinosis (canon holds)');
{
  const st = freshGame();
  const s = st.scholar;
  s.inventory = [bearMeat()];
  Game.knowsTechnique = () => true;
  try { Game.preserveFood ? Game.preserveFood() : Game.preserveMeat(); } catch (e) { console.log('  (preserve threw: ' + e.message + ')'); }
  const sm = s.inventory[0];
  check('smoked raw: foodState preserved', sm.foodState === 'preserved', sm.foodState);
  check('smoked raw: worms survive the smoke', !!sm.parasiteRisk, 'parasiteRisk=' + JSON.stringify(sm.parasiteRisk));
}

console.log('B2d (sibling): undercooked meat can go back on the fire');
{
  const st = freshGame();
  const s = st.scholar;
  s.inventory = [bearMeat()];
  Game.knowsTechnique = () => false;
  Game.nearFire = () => true;
  Game.consumeCookFire = () => 'ok';
  Game.cookOutcome = () => ({ key: 'undercooked', mult: 0.7, riskStays: true });
  Game.cookFood(0);
  const it = s.inventory[0];
  if (BEFORE) {
    check('BEFORE: no undercooked flag to re-cook from (the break)', !it.undercooked, 'undercooked=' + it.undercooked);
  } else {
    check('undercooked in hand', it.undercooked === true && !!it.parasiteRisk, 'undercooked=' + it.undercooked);
  }
  // back on the fire, this time cooked through
  Game.cookOutcome = () => ({ key: 'perfect', mult: 1.0 });
  const recooked = Game.cookFood(0);
  const it2 = s.inventory[0];
  if (BEFORE) {
    check('BEFORE: re-cook refused — dead-end item (the break)', recooked === null || recooked === undefined, 'returned=' + recooked);
  } else {
    check('re-cook accepted', it2.undercooked === false, 'undercooked=' + it2.undercooked);
    check('re-cook kills the worms', !it2.parasiteRisk, 'parasiteRisk=' + JSON.stringify(it2.parasiteRisk));
    check('name not doubled', !/\(cooked\) \(cooked\)/.test(it2.name), it2.name);
  }
}

// ============ B3: trembles is certain — expiry kills ============
console.log('B3: trembles at the end of its 40 day-parts');
{
  const st = freshGame();
  Game.applyStatus('scholar', 'trembles', { source: 'human meat' });
  let died = null;
  const realPD = Game.playerDeath, realMCD = Game.maybeCheatDeath;
  Game.maybeCheatDeath = () => false;
  Game.playerDeath = function (cause) { died = cause; };
  const entry = (Game.seList('scholar') || []).find(e => e.id === 'trembles');
  check('trembles applied', !!entry, 'no entry');
  if (entry) {
    // late warning at ~2 days left
    entry.dayPartsLeft = 9; said.length = 0;
    Game.tickStatuses('scholar', 'dayPart');
    if (BEFORE) {
      check('BEFORE: no late warning (the break)', !said.join(' ').includes('moving inward'), said.join(' ').slice(0, 80));
    } else {
      check('late warning narrates (~2 days left)', said.join(' ').includes('moving inward'), said.join(' ').slice(0, 80));
    }
    // the end of the clock
    entry.dayPartsLeft = 1; said.length = 0; died = null;
    Game.tickStatuses('scholar', 'dayPart');
    const gone = !Game.hasStatus('scholar', 'trembles');
    if (BEFORE) {
      check('BEFORE: trembles expired harmlessly (the break)', gone && died === null, `gone=${gone} died=${died}`);
    } else {
      check('trembles removed at expiry', gone, 'still present');
      check('the bearer dies of the trembles', died === 'the trembles', 'died=' + died);
    }
  }
  Game.playerDeath = realPD; Game.maybeCheatDeath = realMCD;
}

// ============ B4: mosquito can deliver both viruses ============
console.log('B4: giant-mosquito 50/50, second virus reachable');
{
  const st = freshGame();
  if (typeof Game.mosquitoBiteVirus !== 'function') {
    check('BEFORE: no mosquitoBiteVirus helper (inline guard blocked the 2nd virus)', false, 'helper missing');
  } else {
    // first bite: one of the two
    const v1 = Game.mosquitoBiteVirus();
    check('first bite gives a virus', v1 === 'eurika' || v1 === 'east_nile', 'v1=' + v1);
    check('first virus applied', Game.hasStatus('scholar', v1), 'missing ' + v1);
    // second bite while holding one: must give the OTHER
    const v2 = Game.mosquitoBiteVirus();
    const want = v1 === 'eurika' ? 'east_nile' : 'eurika';
    check('second bite gives the other virus', v2 === want, `v1=${v1} v2=${v2}`);
    check('both viruses held', Game.hasStatus('scholar', 'eurika') && Game.hasStatus('scholar', 'east_nile'));
    // third bite with both held: null, no crash
    check('third bite: nothing left to give', Game.mosquitoBiteVirus() === null);
    // distribution sanity over many fresh runs
    let e = 0, n = 0;
    for (let i = 0; i < 60; i++) {
      freshGame();
      const v = Game.mosquitoBiteVirus();
      if (v === 'eurika') e++; else if (v === 'east_nile') n++;
    }
    check('roughly 50/50 across 60 bites', e > 15 && n > 15, `eurika=${e} east_nile=${n}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed (${BEFORE ? 'BEFORE' : 'AFTER'} mode)`);
process.exit(fail ? 1 : 0);
