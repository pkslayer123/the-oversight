// MISER adversarial attacks, round 2 (2026-10-08) — break-it style.
// Usage: SEED=7 node scripts/test-miser-round2.js
// Loads full engine (index.html order, minus DOM-only modules), seeded RNG first.
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
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
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
      mx: 4, my: 4, insideHaven: true, exiled: false,
    },
    village: {
      name: 'Haven', px: 4, py: 4, day: 5,
      roster: ['p1', 'v2', 'v3'],
      trust: { p1: 15, v2: 15, v3: 15 },
      pantry: [], water: { clean: 0, dirty: 0 },
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
  Game.nodeEpithet = () => 'the treeline';
  Game.journalName = () => 'journal';
  return Game;
}
const trustOf = () => (Game.state.village.trust || {}).p1;
const kcalIn = (arr) => (arr || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
function addFood(units, kcalEach, name, extra) {
  Game.state.scholar.inventory.push(Object.assign({
    name: name || 'Smoked fish', kcalEach, units, spoilDay: 999, safe: true,
    kg: 0.2, unit: 'item', foodState: 'cooked', plantId: 'fish_smoked',
  }, extra || {}));
  return Game.state.scholar.inventory.length - 1;
}

// ---------- ATTACK 1 (EXPLOIT): pantry donate -> bulk-take-back trust farm ----------
// The single-take path (takeFromPantry) has the -5 take-back sting. The bulk
// path (takeFromPantryBulk — the slider UI every player actually uses) never
// had it: donate 5000 / bulk-take 5000 cycles +trust for free, food-neutral.
console.log('A1: donate -> bulk-take-back trust farm (5 cycles)');
{
  freshGame();
  const t0 = trustOf();
  for (let i = 0; i < 5; i++) {
    const idx = addFood(10, 500, 'Smoked fish'); // 5000 kcal
    Game.donateToPantry(idx);
    // pantry now holds one 10-unit stack; bulk-take it all back
    Game.takeFromPantryBulk({ 0: 10 });
    const left = Game.state.village.pantry.length;
    if (left !== 0) { console.log('  NOTE: pantry not empty after bulk take', left); break; }
  }
  const t1 = trustOf();
  const gain = t1 - t0;
  console.log(`  trust ${t0} -> ${t1} over 5 food-neutral cycles (gain ${gain})`);
  // A food-neutral loop must not mint trust: the sting should eat the grant.
  ok(gain <= 0, 'no pantry bulk trust farm (food-neutral cycles gain no trust)', { t0, t1 });
}

// ---------- ATTACK 1b (control): single-take path nets ~zero ----------
// Same loop via takeFromPantry (one unit per call): the sting fires.
console.log('A1b: donate -> single-take-back (control, sting fires)');
{
  freshGame();
  const t0 = trustOf();
  for (let i = 0; i < 5; i++) {
    const idx = addFood(10, 500, 'Smoked fish');
    Game.donateToPantry(idx);
    for (let k = 0; k < 10; k++) Game.takeFromPantry(0);
  }
  const t1 = trustOf();
  console.log(`  trust ${t0} -> ${t1} over 5 food-neutral single-take cycles`);
  ok(t1 - t0 <= 2, 'single-take take-back nets ~zero trust', { t0, t1 });
}

// ---------- ATTACK 2 (EXPLOIT): takeFromPantry on a unit-less pantry item ----------
// `item.units <= 0` is false for undefined, then `item.units--` -> NaN, and
// `NaN <= 0` is false forever: the item never depletes. Infinite food.
console.log('A2: unit-less pantry item -> infinite single-takes');
{
  freshGame();
  Game.state.village.pantry.push({ name: 'Mystery stew', kcalEach: 300, spoilDay: 999, safe: true, kg: 0.3 });
  let takes = 0;
  for (let i = 0; i < 25; i++) {
    const before = kcalIn(Game.state.scholar.inventory);
    Game.takeFromPantry(0);
    const after = kcalIn(Game.state.scholar.inventory);
    if (after > before) takes++;
    else break;
  }
  const pantryLeft = Game.state.village.pantry.length;
  console.log(`  successful takes from one corrupt item: ${takes}, pantry entries left: ${pantryLeft}`);
  ok(takes === 1 && pantryLeft === 0, 'corrupt pantry item yields exactly one honest unit, then depletes', { takes, pantryLeft });
}

// ---------- ATTACK 3 (EXPLOIT): corpseTakeItem plantId-only merge launders kcalEach ----------
// Cooked deer meat (400 kcal) in pack + raw deer meat (150 kcal) on corpse,
// same plantId. The old merge keyed on plantId alone -> raw units join the
// cooked stack at cooked value: phantom calories.
console.log('A3: corpse loot merges raw into cooked stack (phantom kcal)');
{
  freshGame();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.corpses = [{
    id: 'corp1', kind: 'monster', buried: false, looted: false,
    node: { x: 4, y: 4 }, mx: 4, my: 4,
    items: [{ name: 'Deer meat', plantId: 'meat_deer', kcalEach: 150, units: 2, spoilDay: 999, safe: false, kg: 0.5, foodState: 'raw' }],
  }];
  Game.corpses = () => Game.state.corpses;
  Game.isUsable = () => false;
  Game.itemDisplayName = (it) => it.name;
  Game.corpseStageInfo = () => ({ id: 'fresh', diseaseP: 0, diseaseDmg: 0 });
  Game.corpseStage = () => 1;
  Game.corpseTrauma = () => 0;
  Game.addTrauma = () => {};
  // pack already holds COOKED deer meat, same plantId
  Game.state.scholar.inventory.push({
    name: 'Deer meat', plantId: 'meat_deer', kcalEach: 400, units: 2,
    spoilDay: 999, safe: true, kg: 0.5, foodState: 'cooked',
  });
  const kcalBefore = kcalIn(Game.state.scholar.inventory);
  Game.corpseTakeItem('corp1', 0);
  const kcalAfter = kcalIn(Game.state.scholar.inventory);
  const gained = kcalAfter - kcalBefore;
  const stacks = Game.state.scholar.inventory.length;
  console.log(`  kcal before ${kcalBefore}, after ${kcalAfter} (gained ${gained}; honest = 300), pack stacks: ${stacks}`);
  ok(gained === 300, 'corpse loot keeps its own value (no kcalEach laundering)', { gained, stacks });
}

// ---------- ATTACK 4 (SOFTLOCK/round-trip): bury -> dig conserves exactly ----------
// The miser must never lose goods to the hole itself: full round trip,
// partial ration draws, and weight-refusal must leave the cache intact.
console.log('A4: cache round-trip conservation + weight refusal');
{
  freshGame();
  Game.carryCapacity = () => 100000;
  Game.addMaterial('branch', 20);
  Game.buryCache('material', 'branch', 20);
  const bi = addFood(8, 250, 'Dried berries', { plantId: 'berries_dried', foodState: 'dried' });
  Game.buryCache('food', bi, 8);
  const caches = Game.playerCaches();
  ok(caches.length === 2, 'two caches buried', { n: caches.length });
  const cacheId = caches[1].id;
  // partial ration draw: 3 of 8
  Game.takeFromCache(cacheId, 0, 3);
  const c = Game.playerCaches().find(x => x.id === cacheId);
  const leftInCache = (c.items[0] || {}).units;
  const inPack = Game.state.scholar.inventory.reduce((t, i) => t + ((i.name === 'Dried berries') ? (i.units || 0) : 0), 0);
  ok(leftInCache === 5 && inPack === 3, 'partial draw conserves (5 buried, 3 in pack)', { leftInCache, inPack });
  // weight refusal: pack too heavy for the rest
  Game.carryCapacity = () => 0.01;
  const nBefore = Game.playerCaches().length;
  Game._said = [];
  Game.digUpCache(cacheId);
  const refused = Game._said.some(t => /Too heavy/.test(t));
  const nAfter = Game.playerCaches().length;
  ok(refused && nAfter === nBefore, 'weight refusal explains itself and keeps the cache', { refused, nBefore, nAfter });
  // dig at the wrong node: refused, cache intact
  Game.carryCapacity = () => 100000;
  Game.map.px = 0; Game.map.py = 0;
  Game._said = [];
  Game.digUpCache(cacheId);
  const wrongNode = Game._said.some(t => /Not here/.test(t));
  const stillThere = Game.playerCaches().some(x => x.id === cacheId);
  ok(wrongNode && stillThere, 'wrong-node dig refused, cache intact', { wrongNode, stillThere });
  // final: dig everything up at the right node, verify exact conservation
  Game.map.px = 4; Game.map.py = 4;
  const matCache = Game.playerCaches().find(x => x.id !== cacheId);
  Game.digUpCache(matCache.id);
  Game.digUpCache(cacheId);
  ok(Game.playerCaches().length === 0, 'all caches dug up, none left behind');
  ok(Game.materialCount('branch') === 20, 'materials conserved exactly', { n: Game.materialCount('branch') });
  const berries = Game.state.scholar.inventory.reduce((t, i) => t + ((i.name === 'Dried berries') ? (i.units || 0) : 0), 0);
  ok(berries === 8, 'food conserved exactly', { berries });
}

// ---------- ATTACK 5 (HONESTY): copy vs engine on stash/caches ----------
// "Take 5" with 3 in stash; bury qty clamp; cache take qty clamp.
console.log('A5: honesty — button copy vs engine delivery');
{
  freshGame();
  Game.addMaterial('stone', 50);
  Game.donateMaterial('stone', 50);
  Game.state.scholar.inventory = [];
  Game._said = [];
  Game.takeMaterial('stone', 5); // stash holds 50; weight: 100000 cap, fine
  const saidTake = Game._said.join(' ');
  ok(/Took 5/.test(saidTake), '"Take 5" delivers 5 and says so', { saidTake });
  // clamp: stash has 45 left, ask for 9999 ("Give all" is the donate side)
  Game._said = [];
  Game.takeMaterial('stone', 9999);
  const saidClamp = Game._said.join(' ');
  ok(/Took 45/.test(saidClamp), 'over-ask clamps to stash and reports the real number', { saidClamp });
  // bury clamp: bury form qty 99 with 3 branches carried
  Game.addMaterial('branch', 3);
  Game._said = [];
  Game.buryCache('material', 'branch', 99);
  const saidBury = Game._said.join(' ');
  ok(/3×/.test(saidBury) && !/99×/.test(saidBury), 'bury qty clamps to carried and reports the real number', { saidBury });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
