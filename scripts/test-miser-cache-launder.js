// MISER run 2026-10-09 — cache burial field-laundering + sign/honesty/softlock sweep.
// Usage: SEED=7 node scripts/test-miser-cache-launder.js
// Loads full engine (index.html order, minus DOM-only modules), seeded RNG first.
'use strict';
const fs = require('fs');
const path = require('path');

const SEED = parseInt(process.env.SEED || '20261009', 10);
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
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
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
      rosterChars: { v2: { name: 'Joren' }, v3: { name: 'Mara' } },
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
  Game.carryCapacity = () => 200;
  Game.waterWeight = () => 0;
  Game.nodeEpithet = () => 'the ridge';
  Game.journalName = () => 'journal';
  Game.fmtKcal = (k) => k + ' kcal';
  Game.isSpoiled = (it) => !it.material && (it.spoilDay || 9999) <= Game.state.scholar.day;
  return Game;
}
// raw risky meat: the thing the food reality system says is dangerous
function rawMeat() {
  return {
    name: 'Raw venison', kcalEach: 400, units: 4, spoilDay: 9, kg: 0.5,
    foodKind: 'meat', foodState: 'cleaned', needsCooking: true, safe: false,
    diseaseRisk: { p: 0.35, dmg: 20, note: 'raw meat' },
    poisonRisk: { p: 0.5, dmg: 30, note: 'tainted' },
    hiddenKcal: 900, rawKcal: 400, burnt: false, prep: 'butchered',
  };
}

// ---------- E1: bury/dig launders diseaseRisk + poisonRisk ----------
console.log('E1: bury -> dig up — risk/processing state survives the hole');
{
  freshGame();
  Game.state.scholar.inventory = [rawMeat()];
  Game.buryCache('food', 0, 4);
  const cache = Game.playerCaches()[0];
  ok(!!cache, 'cache buried', {});
  const bit = cache && cache.items[0];
  const drKept = bit && bit.diseaseRisk && bit.diseaseRisk.p === 0.35 && bit.diseaseRisk.dmg === 20;
  const prKept = bit && bit.poisonRisk && bit.poisonRisk.p === 0.5;
  console.log('  buried item diseaseRisk:', JSON.stringify(bit && bit.diseaseRisk), 'poisonRisk:', JSON.stringify(bit && bit.poisonRisk));
  ok(drKept, 'diseaseRisk survives burial', { got: bit && bit.diseaseRisk });
  ok(prKept, 'poisonRisk survives burial', { got: bit && bit.poisonRisk });
  const procKept = bit && bit.needsCooking === true && bit.foodState === 'cleaned' && bit.foodKind === 'meat'
    && bit.hiddenKcal === 900 && bit.rawKcal === 400 && bit.prep === 'butchered' && bit.safe === false;
  ok(procKept, 'processing state survives burial (needsCooking/foodState/kcal/prep/safe)', {});
  // dig it back up — the pack copy must carry the risk too
  Game.digUpCache(cache.id);
  const back = Game.state.scholar.inventory.find(i => i.name === 'Raw venison');
  const backDr = back && back.diseaseRisk && back.diseaseRisk.p === 0.35;
  const backPr = back && back.poisonRisk && back.poisonRisk.p === 0.5;
  ok(backDr, 'diseaseRisk survives dig-up (no free disease bypass)', { got: back && back.diseaseRisk });
  ok(backPr, 'poisonRisk survives dig-up (no toxin laundering)', { got: back && back.poisonRisk });
  ok(Game.playerCaches().length === 0, 'cache removed after full dig', {});
}

// ---------- E1b: ration-drawer take also launders ----------
console.log('E1b: takeFromCache portion — risk survives the drawer');
{
  freshGame();
  Game.state.scholar.inventory = [rawMeat()];
  Game.buryCache('food', 0, 4);
  const cache = Game.playerCaches()[0];
  Game.takeFromCache(cache.id, 0, 2);
  const portion = Game.state.scholar.inventory.find(i => i.name === 'Raw venison');
  const kept = portion && portion.diseaseRisk && portion.diseaseRisk.p === 0.35
    && portion.poisonRisk && portion.poisonRisk.p === 0.5 && portion.needsCooking === true;
  console.log('  drawn portion diseaseRisk:', JSON.stringify(portion && portion.diseaseRisk));
  ok(kept, 'drawn portion keeps risk + cooking state', {});
  const left = Game.playerCaches()[0].items[0].units;
  ok(left === 2, 'rest stays buried (2 units)', { left });
}

// ---------- E2: sign exploits across every storage verb ----------
console.log('E2: negative/zero quantities refuse everywhere');
{
  freshGame();
  Game.addMaterial('branch', 10);
  const st = Game.stashState(); st.materials.branch = 10;
  const b0 = Game.materialCount('branch');
  Game._said = [];
  Game.donateMaterial('branch', -5);
  Game.takeMaterial('branch', -5);
  Game.buryCache('material', 'branch', -5);
  Game.buryCache('material', 'branch', 0);
  Game.spendMaterial('branch', -5);
  const b1 = Game.materialCount('branch');
  const st1 = Game.stashState().materials.branch;
  const caches = Game.playerCaches().length;
  console.log(`  pack ${b0} -> ${b1}, stash ${st1}, caches ${caches}`);
  ok(b1 === b0 && st1 === 10 && caches === 0, 'no negative-qty state change anywhere', { b0, b1, st1, caches });
  // negative takeFromCache qty
  Game.state.scholar.inventory = [rawMeat()];
  Game.buryCache('food', 0, 4);
  const c = Game.playerCaches()[0];
  const u0 = c.items[0].units;
  Game.takeFromCache(c.id, 0, -3);
  ok(c.items[0].units === u0, 'negative ration draw refused', { u0, u1: c.items[0].units });
  // float qty floors honestly
  Game.addMaterial('branch', 10);
  Game.buryCache('material', 'branch', 3.7);
  const c2 = Game.playerCaches().find(x => x.id !== c.id);
  ok(c2 && c2.items[0].units === 3, 'float bury qty floors to 3', { got: c2 && c2.items[0].units });
}

// ---------- H1: material bury/dig round-trip is identity ----------
console.log('H1: material bury -> dig round-trip honesty');
{
  freshGame();
  Game.addMaterial('stone', 7);
  Game.buryCache('material', 'stone', 7);
  ok(Game.materialCount('stone') === 0, 'buried stone leaves the pack', {});
  const c = Game.playerCaches()[0];
  Game._said = [];
  Game.digUpCache(c.id);
  ok(Game.materialCount('stone') === 7, 'dug stone returns in full', { got: Game.materialCount('stone') });
  const said = Game._said.join(' ');
  ok(/Dug up: 7× Stone/.test(said), 'dig message names the haul honestly', { said: Game._said.slice(-1) });
}

// ---------- H2: overweight dig refuses, cache survives, drawer escapes ----------
console.log('H2: too-heavy dig refuses without destroying the cache');
{
  freshGame();
  Game.carryCapacity = () => 1; // nearly full hands
  Game.state.scholar.inventory = [{ name: 'Anvil of sentiment', kg: 0.9, units: 1, bonded: true }];
  Game.addMaterial('wood', 0); // pack-side wood zero
  // bury bypasses nothing: simulate a heavy cache already in the ground
  Game.playerCaches().push({
    id: 'c5_heavy', node: { x: 4, y: 4 }, desc: 'heavy test', label: 'wood',
    items: [{ material: 'wood', units: 6, name: 'Wood log', kcalEach: 0, spoilDay: 9999, kg: 2.0 }],
    found: false, day: 5,
  });
  Game._said = [];
  const res = Game.digUpCache('c5_heavy');
  const kept = Game.playerCaches().some(c => c.id === 'c5_heavy');
  const refused = Game._said.some(s => /Too heavy/.test(s));
  console.log('  res:', res, 'refused:', refused, 'cache kept:', kept);
  ok(res === null && refused && kept, 'overweight dig refuses, cache intact', {});
  // ration drawer: portion must still be drawable when the whole is too heavy —
  // but 1 log (2kg) still exceeds capacity 1... make room for exactly one
  Game.carryCapacity = () => 3;
  Game.takeFromCache('c5_heavy', 0, 1);
  const got = Game.materialCount('wood');
  ok(got === 1, 'drawer escapes the brick: one log drawable', { got });
}

// ---------- S1: wrong-node dig/take refuses, nothing lost ----------
console.log('S1: location gate — no digging from the hall couch');
{
  freshGame();
  Game.state.scholar.inventory = [rawMeat()];
  Game.buryCache('food', 0, 4);
  const c = Game.playerCaches()[0];
  Game.map = { px: 9, py: 9 }; // walked away
  Game._said = [];
  const r1 = Game.digUpCache(c.id);
  const r2 = Game.takeFromCache(c.id, 0, 1);
  const intact = Game.playerCaches().length === 1 && Game.playerCaches()[0].items[0].units === 4;
  const guided = Game._said.some(s => /Not here/.test(s));
  ok(r1 === null && r2 === null && intact && guided, 'remote dig/draw refused, cache untouched, journal cited', {});
}

// ---------- H3: spoiled cache food rots honestly ----------
console.log('H3: all-spoiled cache — worms get it, cache removed, message honest');
{
  freshGame();
  Game.state.scholar.inventory = [{ name: 'Berries', kcalEach: 100, units: 4, spoilDay: 4, kg: 0.2 }];
  Game.buryCache('food', 0, 4); // buried day 5, spoilDay 4 -> already bad
  const c = Game.playerCaches()[0];
  Game._said = [];
  Game.digUpCache(c.id);
  const gone = Game.playerCaches().length === 0;
  const packHas = Game.state.scholar.inventory.some(i => i.name === 'Berries');
  const msg = Game._said.some(s => /gone bad underground|worms/.test(s));
  console.log('  cache gone:', gone, 'pack has berries:', packHas, 'message:', msg);
  ok(gone && !packHas && msg, 'spoiled cache resolves honestly', {});
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
