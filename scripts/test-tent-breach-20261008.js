// TENT BREACH — proof tests (Steve 2026-10-08).
// The night encounter no longer gets a free pull: the wanderer must FIND you
// through your signals (detection), then small monsters ENTER the tent while
// big ones BUST it down. Proves causality, both breach outcomes, pass-through,
// eyes_in_back, and the faceTentIntruder close spawn.
// Usage: node scripts/test-tent-breach-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}

function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const seedRnd = mulberry32(20261008);
let rndOverride = null;
Math.random = function () { return rndOverride !== null ? rndOverride : seedRnd(); };

global.window = global;
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

const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.drama = () => {};
Game.discover = () => {};
Game.maxHealth = () => 100;
Game.integrationStage = () => 0;
Game.npcBatchTurn = () => {};
Game.monsterTurn = () => {};
Game.npcNodeTravel = () => {};
Game.resolveAssignments = () => {};
Game.isSafeTile = () => false;
Game.log = [];

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
  rndOverride = null;
  Game._detectLog = [];
  for (const k of Object.keys(tiles)) delete tiles[k];
  tiles['4,4'] = { type: 'wild', secrets: {} };
  Game.state = st;
  Game.villagerId = 'v1';
  Game.map = { px: 4, py: 4, tiles: {} };
  Game.dayPart = 1; Game.location = 'wild'; Game.departed = true;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; Game.tbfight = null; Game.pendingEncounter = false;
  Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.encounterDone = false; Game.wanderer = null;
  Game.state.fires = [];
  Game.state.weather = 'clear';
  Game._tentBreachSpawn = null;
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

  // ============ 1. DETECTION IS CAUSAL ============
  {
    const st = freshScholar(); wire(st);
    // not in tent: always found
    check('1a. out in the open: always found', Game.wandererFindsYou('hushwolf') === true);
    pitchAndEnter();
    // measure odds over trials (seeded)
    function rate(monsterId, fire, vent, n) {
      Game._detectLog = [];
      if (fire) { if (!Game.tentFireLit()) Game.lightTentFire(); }
      Game.setTentVent(vent);
      let found = 0;
      for (let i = 0; i < n; i++) if (Game.wandererFindsYou(monsterId)) found++;
      return found / n;
    }
    const rFireVent = rate('gallowdeer', true, true, 2000);
    check('1b. fire lit + vent open ≈ 0.57', Math.abs(rFireVent - 0.57) < 0.05, 'rate=' + rFireVent.toFixed(3));
    const rFireSealed = rate('gallowdeer', true, false, 2000);
    check('1c. fire lit + sealed ≈ 0.42', Math.abs(rFireSealed - 0.42) < 0.05, 'rate=' + rFireSealed.toFixed(3));
    // let the fire die for no-fire trials
    Game.state.fires = [];
    const rDarkSealed = rate('gallowdeer', false, false, 2000);
    check('1d. dark + sealed ≈ 0.08', Math.abs(rDarkSealed - 0.08) < 0.04, 'rate=' + rDarkSealed.toFixed(3));
    const rScent = rate('hushwolf', true, true, 2000);
    check('1e. scent hunter (hushwolf) ×1.5 ≈ 0.855', Math.abs(rScent - 0.855) < 0.05, 'rate=' + rScent.toFixed(3));
    check('1f. detection logged with causal inputs',
      Game._detectLog.length === 2000 && 'fireLit' in Game._detectLog[0] && 'ventOpen' in Game._detectLog[0]);
  }

  // ============ 2. SMALL MONSTER ENTERS ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    Game.lightTentFire();
    rndOverride = 0; // always found
    said.length = 0;
    const ok = Game.triggerEncounter('hushwolf');
    rndOverride = null;
    check('2a. encounter triggers', ok === true && Game.pendingEncounter === true);
    check('2b. pendingInTent set — it is IN the tent', Game.pendingInTent === true);
    check('2c. you are still inside (no yank)', !!st.scholar.insideTent);
    check('2d. breach narrated as entry', said.some(m => /IN here with you/.test(m)));
    check('2e. monster id preserved', Game.pendingMonsterId === 'hushwolf');
  }

  // ============ 3. BIG MONSTER BUSTS ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    rndOverride = 0;
    said.length = 0;
    Game.triggerEncounter('bulldozer');
    rndOverride = null;
    check('3a. encounter triggers', Game.pendingEncounter === true);
    check('3b. NOT pendingInTent — it came through the wall', Game.pendingInTent !== true);
    check('3c. tent wrecked (cell=dirt)', Game.genDetail(4, 4)[4][5] === 'dirt');
    check('3d. you are thrown clear (not inside)', !st.scholar.insideTent);
    check('3e. knocked sprawling: -5 health', st.scholar.health === 95, 'health=' + st.scholar.health);
    check('3f. bust narrated', said.some(m => /EXPLODES inward/.test(m)));
  }

  // ============ 4. PASS-THROUGH ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter(); // dark, sealed: p=0.08
    Game.setTentVent(false);
    rndOverride = 0.999; // not found
    said.length = 0;
    const ok = Game.triggerEncounter('hushwolf');
    rndOverride = null;
    check('4a. no encounter when not found', ok === false && Game.pendingEncounter === false);
    check('4b. tent untouched', Game.genDetail(4, 4)[4][5] === 'tent' && !!st.scholar.insideTent);
    check('4c. pass-through narrated (the world is alive)', said.some(m => /never knew you were here/.test(m)));
  }

  // ============ 5. moveWanderer INTEGRATION ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    Game.setTentVent(false);
    Game.wanderer = { x: 3, y: 4, dir: 1, monsterId: 'hushwolf' };
    rndOverride = 0.999;
    Game.moveWanderer(); // steps to x=4 = player tile
    rndOverride = null;
    check('5a. wanderer consumed after pass-through', Game.wanderer === null);
    check('5b. no encounter on pass-through', Game.pendingEncounter === false);
    check('5c. next wanderer scheduled', Game.state.wandererNextDay === st.scholar.day + 4);
    // found case through the same path
    const st2 = freshScholar(); wire(st2);
    pitchAndEnter();
    Game.lightTentFire();
    Game.wanderer = { x: 3, y: 4, dir: 1, monsterId: 'gallowdeer' };
    rndOverride = 0;
    Game.moveWanderer();
    rndOverride = null;
    check('5d. found via moveWanderer: pendingInTent', Game.pendingEncounter === true && Game.pendingInTent === true);
  }

  // ============ 6. eyes_in_back ============
  {
    const st = freshScholar(); wire(st);
    st.scholar.abilities = [{ id: 'eyes_in_back', level: 1 }];
    pitchAndEnter();
    rndOverride = 0;
    said.length = 0;
    Game.triggerEncounter('bulldozer');
    rndOverride = null;
    check('6a. warning first (no ambush)', said.some(m => /back-eyes catch it first/.test(m)));
    check('6b. scrambled out, not buried', !st.scholar.insideTent);
    check('6c. tent NOT wrecked (it never got inside)', Game.genDetail(4, 4)[4][5] === 'tent');
    check('6d. regular encounter, no in-tent flag', Game.pendingEncounter === true && Game.pendingInTent !== true);
    check('6e. no bust damage', st.scholar.health === 100, 'health=' + st.scholar.health);
  }

  // ============ 7. faceTentIntruder CLOSE SPAWN ============
  {
    const st = freshScholar(); wire(st);
    pitchAndEnter();
    rndOverride = 0;
    Game.triggerEncounter('hushwolf');
    rndOverride = null;
    let captured = null;
    const realSC = Game.startCombat;
    Game.startCombat = function (mid) { captured = { mid, spawn: Game._tentBreachSpawn }; };
    said.length = 0;
    Game.faceTentIntruder();
    Game.startCombat = realSC;
    check('7a. pendingInTent cleared', Game.pendingInTent === false);
    check('7b. out of the tent', !st.scholar.insideTent);
    check('7c. combat started with the intruder', captured && captured.mid === 'hushwolf');
    check('7d. spawn at arm\'s length (adjacent)', captured && captured.spawn &&
      Math.abs(captured.spawn.mx - st.scholar.mx) + Math.abs(captured.spawn.my - st.scholar.my) === 1,
      captured && captured.spawn ? `spawn=(${captured.spawn.mx},${captured.spawn.my}) player=(${st.scholar.mx},${st.scholar.my})` : 'no spawn');
    check('7e. breach-out narrated', said.some(m => /right out behind you/.test(m)));
  }

  // ============ 8. OPEN-AIR UNCHANGED ============
  {
    const st = freshScholar(); wire(st);
    // not in tent: triggerEncounter behaves exactly as before
    said.length = 0;
    const ok = Game.triggerEncounter('bulldozer');
    check('8a. open air: pendingEncounter, no tent flags', ok && Game.pendingEncounter && !Game.pendingInTent);
    check('8b. open air: no tent involved', Game.pendingMonsterId === 'bulldozer');
  }

  console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
