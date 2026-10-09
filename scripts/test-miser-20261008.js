// MISER adversarial attacks, run of 2026-10-08 (miser archetype).
// Usage: SEED=7 node scripts/test-miser-20261008.js
// Loads full engine (index.html order, minus DOM-only modules), seeded RNG first.
// BEFORE the fix: A1/A3 FAIL (breaks demonstrated); A2/A4/A5/A6 held (regression guards).
// AFTER: all PASS.
'use strict';
const fs = require('fs');
const path = require('path');

const SEED = parseInt(process.env.SEED || '20261008', 10);
let _s = SEED;
const R = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
R.reset = (s) => { _s = (s == null ? SEED : s) | 0; };
global.Math.random = R;

global.window = global;
global.document = undefined;
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { eval.call(global, code + `\n//# sourceURL=${f}`); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(2); }
}
delete global.window;

const Game = global.Scattering.Game;
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
}
function freshGame() {
  R.reset();
  Game.state = {
    scholar: {
      villagerId: 'p1', day: 5, kcal: 2000, inventory: [], caches: [],
      mx: 4, my: 4, insideHaven: true, exiled: false, abilities: [],
      backgroundAbilities: [],
    },
    village: {
      name: 'Haven', px: 4, py: 4, day: 5,
      roster: ['p1', 'v2', 'v3'],
      trust: { p1: 15, v2: 15, v3: 15 },
      pantry: [],
    },
    otherVillages: [], pastVillages: [], codex: { places: [] },
  };
  Game.map = { px: 4, py: 4 };
  Game.data = Game.data || {};
  Game.data.items = Game.data.items || [];
  Game._said = [];
  Game.say = (t) => { Game._said.push(String(t)); };
  Game.tickAction = () => null;
  Game.status = () => null;
  Game.observe = () => {};
  Game.playerTile = () => ({ type: 'haven' });
  Game.carryCapacity = () => 100000;
  Game.waterWeight = () => 0;
  Game.nodeEpithet = () => 'the ridge';
  Game.journalName = () => 'journal';
  Game.fmtKcal = (k) => k + ' kcal';
  return Game;
}
const trustOf = () => (Game.state.village.trust || {}).p1;
const pantryKcal = () => (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
const saidHas = (s) => Game._said.some(x => String(x).includes(s));

// ---------- A1: REMOTE DONATE — teleporting goods into the hall ----------
console.log('A1: donate to pantry/stash from the wilds (havenStoresAccess=none)');
{
  freshGame();
  // walk far from haven: no physical access
  Game.state.scholar.insideHaven = false;
  Game.map = { px: 10, py: 10 };
  Game.playerTile = () => ({ type: 'wilds' });
  Game.state.scholar.inventory = [
    { name: 'Smoked fish', kcalEach: 400, units: 2, spoilDay: 99, safe: true, kg: 0.3, edible: true },
  ];
  Game.addMaterial('branch', 10);
  Game.data.items = [{ id: 'axe', name: 'Axe', class: 'tool', tool: { woodcut: 'fell' }, kg: 1.5 }];
  Game.state.scholar.inventory.push({ itemId: 'axe', name: 'Axe', units: 1, kg: 1.5 });

  Game._said = [];
  Game.donateToPantry(0); // food idx 0
  const pantryGot = pantryKcal();
  const foodStill = Game.state.scholar.inventory.some(i => i.name === 'Smoked fish');

  Game.donateMaterial('branch', 10);
  const stashGotBranch = (Game.stashState().materials.branch || 0);
  const branchStill = Game.materialCount('branch');

  const axeIdx = Game.state.scholar.inventory.findIndex(i => i.itemId === 'axe');
  if (axeIdx >= 0) Game.donateTool(axeIdx);
  const stashGotTool = (Game.stashState().tools || []).length;
  const axeStill = Game.state.scholar.inventory.some(i => i.itemId === 'axe');

  const refused = saidHas('Your hands are not');
  console.log(`  pantryGot=${pantryGot} foodStill=${foodStill} stashBranch=${stashGotBranch} branchStill=${branchStill} stashTools=${stashGotTool} axeStill=${axeStill} refused=${refused}`);
  ok(pantryGot === 0 && foodStill, 'remote pantry donation refused, food stays in pack', { pantryGot, foodStill });
  ok(stashGotBranch === 0 && branchStill === 10, 'remote stash donation refused, materials stay', { stashGotBranch, branchStill });
  ok(stashGotTool === 0 && axeStill, 'remote tool donation refused, tool stays', { stashGotTool, axeStill });
  ok(refused, 'refusal names the physical rule', {});
}

// ---------- A2: PANTRY CAP — donate past 120k ----------\nconsole.log('A2: donateToPantry past the pantry cap');
{
  freshGame();
  // pre-fill pantry to 119500 kcal (cap 120000)
  Game.state.village.pantry = [{ name: 'Stored grain', kcalEach: 500, units: 239, spoilDay: 99, safe: true, kg: 0.2 }];
  const cap = Game.pantryCapKcal();
  Game.state.scholar.inventory = [
    { name: 'Smoked meat', kcalEach: 2000, units: 1, spoilDay: 99, safe: true, kg: 0.8, edible: true },
  ];
  const before = pantryKcal();
  Game._said = [];
  Game.donateToPantry(0);
  const after = pantryKcal();
  const kept = Game.state.scholar.inventory.some(i => i.name === 'Smoked meat');
  const saidFull = saidHas('pantry is full');
  console.log(`  cap=${cap} before=${before} after=${after} kept=${kept} saidFull=${saidFull}`);
  ok(after === before && kept, 'over-cap donation refused, food stays in pack', { before, after, kept });
  ok(saidFull, 'refusal names the cap honestly', {});
}

// ---------- A3: GENEROUS XP FARM — donate/take-back cycles ----------
console.log('A3: donate 500 / take-back 500 x12 — generous XP must not print');
{
  freshGame();
  Game.state.scholar.abilities = [{ id: 'generous', name: 'Generous Heart', level: 1, xp: 0 }];
  const t0 = trustOf();
  for (let c = 0; c < 12; c++) {
    Game.state.scholar.inventory = [
      { name: 'Smoked meat', kcalEach: 500, units: 1, spoilDay: 99, safe: true, kg: 0.5, edible: true },
    ];
    Game._said = [];
    Game.donateToPantry(0);
    const pidx = Game.state.village.pantry.findIndex(i => i.name === 'Smoked meat');
    if (pidx >= 0) Game.takeFromPantry(pidx);
  }
  const ab = Game.state.scholar.abilities.find(a => a.id === 'generous');
  const totalXP = (ab.level - 1) * 1000 + (ab.xp || 0); // any level gain or xp = farm
  const t1 = trustOf();
  const foodBack = Game.state.scholar.inventory.some(i => i.name === 'Smoked meat');
  console.log(`  generous L${ab.level} xp=${ab.xp} | trust ${t0} -> ${t1} | food back in pack: ${foodBack}`);
  ok(ab.level === 1 && (ab.xp || 0) === 0, 'no free generous XP from take-back cycles', { level: ab.level, xp: ab.xp });
  ok(t1 <= t0, 'trust does not rise from the cycle', { t0, t1 });
  ok(foodBack, 'food round-trips (same starting conditions each cycle)', { foodBack });
}

// ---------- A4: BURY/DIG ROUND-TRIP CONSERVATION ----------
console.log('A4: bury 20 branch + 5x100kcal food, dig up — units conserved');
{
  freshGame();
  Game.addMaterial('branch', 20);
  Game.state.scholar.inventory.push({ name: 'Dried berries', kcalEach: 100, units: 5, spoilDay: 9999, safe: true, kg: 0.1, edible: true });
  Game.buryCache('material', 'branch', 20);
  const fidx = Game.state.scholar.inventory.findIndex(i => i.name === 'Dried berries');
  Game.buryCache('food', fidx, 5);
  ok(Game.playerCaches().length === 2, 'two caches buried', {});
  ok(Game.materialCount('branch') === 0, 'branches left the pack', {});
  // partial take then full dig
  const cid = Game.playerCaches().find(c => c.items.some(it => it.name === 'Dried berries')).id;
  const c0 = Game.playerCaches().find(c => c.id === cid);
  Game.takeFromCache(cid, 0, 2);
  const leftInCache = c0.items.reduce((t, it) => t + (it.units || 0), 0);
  Game.digUpCache(cid);
  const berries = Game.state.scholar.inventory.filter(i => i.name === 'Dried berries')
    .reduce((t, i) => t + (i.units || 0), 0);
  // dig the material cache too
  const bcid = Game.playerCaches()[0].id;
  Game.digUpCache(bcid);
  const branchBack = Game.materialCount('branch');
  console.log(`  leftInCache(after partial)=${leftInCache} berriesBack=${berries} branchBack=${branchBack}`);
  ok(leftInCache === 3, 'partial take leaves exactly 3', { leftInCache });
  ok(berries === 5, 'all 5 food units accounted for (2 taken + 3 dug)', { berries });
  ok(branchBack === 20, 'all 20 branches back', { branchBack });
}

// ---------- A5: DIG UP WHILE OVERWEIGHT — no silent loss ----------
console.log('A5: digUpCache overweight refuses cleanly, cache intact');
{
  freshGame();
  Game.addMaterial('stone', 10);
  Game.buryCache('material', 'stone', 10);
  const cid = Game.playerCaches()[0].id;
  // pack heavier than capacity
  Game.carryCapacity = () => 5;
  Game.state.scholar.inventory = [{ name: 'Boulder', kg: 50, units: 1, kcalEach: 0 }];
  Game._said = [];
  const r = Game.digUpCache(cid);
  const intact = Game.playerCaches().length === 1 &&
    Game.playerCaches()[0].items.reduce((t, it) => t + (it.units || 0), 0) === 10;
  const saidHeavy = saidHas('Too heavy');
  console.log(`  returned=${r} intact=${intact} saidHeavy=${saidHeavy}`);
  ok(r === null && intact, 'overweight dig-up refuses, cache untouched', { r, intact });
  ok(saidHeavy, 'refusal is honest about weight', {});
}

// ---------- A6: HONESTY — theft curve + Take-5 clamp ----------
console.log('A6: cacheTheftChance falls with distance; stash Take clamps');
{
  freshGame();
  const near = Game.cacheTheftChance(0), mid = Game.cacheTheftChance(6), far = Game.cacheTheftChance(12);
  console.log(`  theft/day d0=${near.toFixed(4)} d6=${mid.toFixed(4)} d12=${far.toFixed(4)}`);
  ok(near > mid && mid >= far && far >= 0, 'theft chance decreases with distance', { near, mid, far });
  const st = Game.stashState(); st.materials.wood = 3;
  Game._said = [];
  Game.takeMaterial('wood', 5);
  const took = Game.materialCount('wood');
  const saidTook = Game._said.find(s => s.includes('Took'));
  console.log(`  took=${took} msg=${saidTook}`);
  ok(took === 3 && st.materials.wood === 0, 'take clamps to what is there, stash not negative', { took });
  ok(!!saidTook && saidTook.includes('3'), 'confirmation names the real amount', { saidTook });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
