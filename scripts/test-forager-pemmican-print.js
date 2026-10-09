// BREAK-IT: FORAGER (2026-10-09) — pemmican calorie printer.
// Hostile premise: the pemmican ladder promises ~97% kcal retention (canon,
// docs/PRESERVATION.md; hunter break-it 2026-10-09 made bars proportional to
// input). The implementation computes bars = max(1, round(inKcal*0.97/600))
// with a FIXED 600 kcalEach per bar. For small inputs the Math.max(1, ...)
// floor and the rounding boundary PRINT calories: 250 kcal in -> 600 out.
// ATTACKS:
//   E1 EXPLOIT: minimum-size set (2 small preserved meat + 1 small rendered fat
//      + 2 berries, ~250 kcal) must not pay out more than ~97% retention.
//   E2 EXPLOIT: boundary input (1058 kcal, the hunter break-it's own example)
//      must not pay 1200 (113%).
//   E3 EXPLOIT: three small sets in a row — cumulative print must be ~0.
//   S1 SOFTLOCK: spoiled meat mixed in must be excluded honestly, no throw,
//      no phantom set.
//   H1 HONESTY: pemmicanPreview().bars == bars actually produced.
//   H2 HONESTY (control): full-size set (~1856 kcal) -> 3 bars, retention ~97%.
// Usage: node scripts/test-forager-pemmican-print.js
//        SEED=999 node scripts/test-forager-pemmican-print.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
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
// SEED BEFORE EVAL: modules capture Math.random at load (AGENTS.md).
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  if (Game.tbfight) Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  Game.learnTechnique('render', 'test');
  Game.learnTechnique('preserve', 'test');
}
function captureSay(fn) {
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  let r, err = null; try { r = fn(); } catch (e) { err = e; } finally { Game.say = origSay; }
  return { r, says, err };
}
// Build one pemmican set's worth of ingredients with controlled per-unit kcal.
function stockSet(meatKcal, fatKcal, berryKcal) {
  const day = Game.state.scholar.day;
  const inv = Game.state.scholar.inventory;
  inv.push({ itemId: 'smoked_fish', plantId: 'meat_testfish', foodKind: 'meat', foodState: 'preserved',
    edible: true, units: 2, unit: 'portion', kcalEach: meatKcal, spoilDay: day + 30,
    name: 'Smoked test fish', kg: 0.2 });
  inv.push({ itemId: 'tallow', plantId: null, foodKind: 'fat', foodState: 'rendered',
    edible: true, units: 1, unit: 'lump', kcalEach: fatKcal, spoilDay: day + 90,
    name: 'Rendered test fat', kg: 0.1 });
  inv.push({ itemId: 'test_berries', plantId: 'blackberry', foodKind: 'plant', foodState: 'raw',
    edible: true, units: 2, unit: 'handful', kcalEach: berryKcal, spoilDay: day + 2,
    name: 'Test berries', kg: 0.1 });
}
function invKcal() {
  return Game.state.scholar.inventory.reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 1), 0);
}
function runMake() {
  const before = invKcal();
  const preview = Game.pemmicanPreview();
  const cap = captureSay(() => Game.makePemmican());
  const after = invKcal();
  const bars = Game.state.scholar.inventory.filter(i => i.itemId === 'pemmican');
  return { before, after, preview, bars, err: cap.err, says: cap.says };
}

console.log('== E1: minimum-size set must not print calories ==');
setup();
{
  // 2x60 preserved + 1x90 fat + 2x20 berries = 250 kcal in.
  stockSet(60, 90, 20);
  const t = runMake();
  const out = t.bars.reduce((a, b) => a + (b.kcalEach || 0) * (b.units || 1), 0);
  const retention = out / 250;
  console.log(`  in=250 out=${out} retention=${(retention * 100).toFixed(1)}% bars=${t.bars.length ? t.bars.map(b => b.units + 'x' + b.kcalEach).join(',') : 'none'}`);
  ok('E1 no throw', t.err === null, t.err && t.err.message);
  ok('E1 retention <= 100% (no printing)', retention <= 1.001, `retention ${(retention * 100).toFixed(1)}%`);
  ok('E1 retention >= 90% (no nonsense loss)', retention >= 0.90, `retention ${(retention * 100).toFixed(1)}%`);
}

console.log('== E2: boundary input (1058 kcal) must not pay 1200 ==');
setup();
{
  // 2x400 + 1x178 + 2x40 = 1058 — the hunter break-it's own example.
  stockSet(400, 178, 40);
  const t = runMake();
  const out = t.bars.reduce((a, b) => a + (b.kcalEach || 0) * (b.units || 1), 0);
  const retention = out / 1058;
  console.log(`  in=1058 out=${out} retention=${(retention * 100).toFixed(1)}%`);
  ok('E2 no throw', t.err === null, t.err && t.err.message);
  ok('E2 retention <= 100%', retention <= 1.001, `retention ${(retention * 100).toFixed(1)}%`);
  ok('E2 retention >= 90%', retention >= 0.90, `retention ${(retention * 100).toFixed(1)}%`);
}

console.log('== E3: three small sets — cumulative print must be ~0 ==');
setup();
{
  stockSet(60, 90, 20); stockSet(60, 90, 20); stockSet(60, 90, 20);
  const before = invKcal(); // 750
  const t = runMake();
  const bars = Game.state.scholar.inventory.filter(i => i.itemId === 'pemmican');
  const out = bars.reduce((a, b) => a + (b.kcalEach || 0) * (b.units || 1), 0);
  console.log(`  in=750 out=${out} printed=${out - before + (before - out >= 0 ? 0 : 0)} net=${(out - 750).toFixed(0)}`);
  ok('E3 no throw', t.err === null, t.err && t.err.message);
  ok('E3 no cumulative print', out <= 751, `printed ${(out - 750).toFixed(0)} kcal`);
}

console.log('== S1: spoiled meat excluded, no throw, no phantom set ==');
setup();
{
  stockSet(60, 90, 20);
  // spoil the meat: spoilDay yesterday
  const meat = Game.state.scholar.inventory.find(i => i.foodState === 'preserved');
  meat.spoilDay = Game.state.scholar.day - 1;
  const t = runMake();
  ok('S1 no throw', t.err === null, t.err && t.err.message);
  const bars = Game.state.scholar.inventory.filter(i => i.itemId === 'pemmican');
  ok('S1 no pemmican from spoiled meat', bars.length === 0, `bars=${bars.length}`);
  ok('S1 honest refusal said', t.says.some(m => /needs three things|Nothing|spoil/i),
     t.says.join(' | ').slice(0, 120));
}

console.log('== H1: preview bars == actual bars ==');
setup();
{
  stockSet(400, 178, 40);
  const t = runMake();
  const actual = t.bars.reduce((a, b) => a + (b.units || 1), 0);
  console.log(`  preview=${t.preview.bars} actual=${actual}`);
  ok('H1 preview == actual', t.preview.bars === actual, `preview ${t.preview.bars} vs actual ${actual}`);
}

console.log('== H2 (control): full-size set -> 3 bars at ~97% ==');
setup();
{
  // 2x500 + 1x700 + 2x78 = 1856 in. Canon full set -> 3 x 600 bars.
  stockSet(500, 700, 78);
  const t = runMake();
  const bars = Game.state.scholar.inventory.filter(i => i.itemId === 'pemmican');
  const out = bars.reduce((a, b) => a + (b.kcalEach || 0) * (b.units || 1), 0);
  const n = bars.reduce((a, b) => a + (b.units || 1), 0);
  const retention = out / 1856;
  console.log(`  in=1856 out=${out} bars=${n} retention=${(retention * 100).toFixed(1)}%`);
  ok('H2 no throw', t.err === null, t.err && t.err.message);
  ok('H2 full set still pays 3 bars', n === 3, `bars=${n}`);
  ok('H2 retention ~97% (90-100%)', retention >= 0.90 && retention <= 1.001,
     `retention ${(retention * 100).toFixed(1)}%`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
