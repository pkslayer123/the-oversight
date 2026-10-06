// Water filter chain (2026-10-06):
//  The water_filter recipe was a lie — cloth/charcoal/container had no
//  obtainable source. Fix: weave cloth from plant fiber, rake charcoal from
//  campfire ashes, burn-hollow a wooden cup; filterWater() purifies risky
//  water (including chemical, which boiling can't fix) with no fire needed.
//  This plays the FULL chain end-to-end as a player would.
// Usage: node scripts/test-water-filter-chain.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function say() { const l = Game.log.join(' | '); Game.log.length = 0; return l; }
function newScholar() {
  Game.genRoster('Columbus, Ohio');
  const c = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, c.id);
  Game.depart();
  return Game.state.scholar;
}
// light a fire on the detail grid under the player
function lightFire() {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  detail[4][5] = 'fire';
  return detail;
}

(async () => {
  await Game.init();
  const s = newScholar();
  const openingLog = Game.log.join(' ');
  say();

  // ---- 1. recipes known from game start ----
  const R = Game.state.codex.recipes || {};
  ok('cloth recipe known at L3', (R.cloth || {}).level === 3);
  ok('wooden_cup recipe known at L3', (R.wooden_cup || {}).level === 3);
  ok('water_filter recipe known at L3', (R.water_filter || {}).level === 3);
  ok('opening narration mentions the filter chain', /water filter/i.test(openingLog));

  // ---- 2. weave cloth from plant fiber ----
  s.inventory.push({ material: 'fiber', units: 3, name: 'Plant fiber', kcalEach: 0, spoilDay: 9999, kg: 0.1 });
  let made = null;
  for (let i = 0; i < 8 && !made; i++) made = Game.craft('cloth');
  ok('cloth crafts from 3 fiber', !!made);
  const cloth = s.inventory.find(i => i.material === 'cloth');
  ok('cloth item carries material key', !!cloth && cloth.units >= 1);
  say();

  // ---- 3. burn-hollow a wooden cup ----
  s.inventory.push({ material: 'branch', units: 4, name: 'Branch', kcalEach: 0, spoilDay: 9999, kg: 0.5 });
  made = null;
  for (let i = 0; i < 8 && !made; i++) made = Game.craft('wooden_cup');
  ok('wooden cup crafts from 2 branches', !!made);
  const cup = s.inventory.find(i => i.material === 'container');
  ok('cup item carries container material key', !!cup);
  say();

  // ---- 4. rake charcoal from a campfire ----
  lightFire();
  ok('nearFire true with lit fire', Game.nearFire());
  const before = Game.materialCount('charcoal');
  Game.gatherCharcoal();
  const after = Game.materialCount('charcoal');
  ok('charcoal raked from fire ashes', after > before);
  const log1 = say();
  ok('charcoal raking narrated', /charcoal/i.test(log1));
  // daily limit: second raking refused honestly
  Game.gatherCharcoal();
  const log2 = say();
  ok('second raking refused (daily limit)', /already raked/i.test(log2));
  ok('no extra charcoal on refused raking', Game.materialCount('charcoal') === after);

  // ---- 5. craft the water filter ----
  ok('have all three materials', Game.materialCount('cloth') >= 1 && Game.materialCount('charcoal') >= 1 && Game.materialCount('container') >= 1);
  made = null;
  for (let i = 0; i < 8 && !made; i++) made = Game.craft('water_filter');
  ok('water filter crafts', !!made);
  const filter = (s.tools || []).find(t => t.recipeId === 'water_filter');
  ok('filter lands in tools with 20 uses', !!filter && filter.uses === 20);
  const log3 = say();
  ok('filter craft narrated', /water filter/i.test(log3));

  // ---- 6. filter risky water (the payoff) ----
  s.water = [
    { liters: 1, quality: 'risky', source: 'Creek' },
    { liters: 1, quality: 'risky', source: 'Creek', chemical: true },
    { liters: 1, quality: 'clean', source: 'Haven well' },
  ];
  const usesBefore = filter.uses;
  Game.filterWater();
  const log4 = say();
  ok('risky water now clean', s.water.filter(b => b.quality === 'risky').length === 0);
  ok('clean water untouched', s.water.filter(b => b.quality === 'clean').length === 3);
  ok('chemical contamination stripped', !s.water.some(b => b.chemical));
  ok('filter narration mentions chemical strip', /boiling could never/i.test(log4));
  ok('uses decremented per liter (2L = 2 uses)', filter.uses === usesBefore - 2);

  // ---- 7. filter breaks at 0 uses ----
  filter.uses = 1;
  s.water.push({ liters: 1, quality: 'risky', source: 'Creek' }, { liters: 1, quality: 'risky', source: 'Creek' });
  Game.filterWater();
  say();
  ok('last use filters 1L then filter removed', !(s.tools || []).some(t => t.recipeId === 'water_filter'));
  ok('second liter left risky (no filter left)', s.water.filter(b => b.quality === 'risky').length === 1);

  // ---- 8. honest failures ----
  Game.filterWater();
  ok('no filter -> honest message', /no working water filter/i.test(say()));
  // craft without materials
  s.inventory = s.inventory.filter(i => !i.material);
  const failCraft = Game.craft('water_filter');
  ok('craft without materials fails honestly', !failCraft && /need \d+ (cloth|charcoal|container)/i.test(say()));

  // ---- 9. charcoal needs a burning fire ----
  const detail2 = Game.genDetail(Game.map.px, Game.map.py);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (detail2[y] && detail2[y][x] === 'fire') detail2[y][x] = 'dirt';
  }
  Game.sweepDeadFires();
  Game.gatherCharcoal();
  ok('no fire -> honest refusal', /need a burning fire/i.test(say()));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
