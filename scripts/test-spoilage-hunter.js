// Spoilage is real (hunter loop, Steve 2026-10-05): a neglected kill rots, and
// rot can never be scrubbed back into food. Covers:
//  1. cleanCarcass refuses a spoiled carcass (discards it, honest message).
//  2. cleanCarcass still cleans a fresh carcass.
//  3. cleanCarcass batch: fresh cleaned, rotten discarded.
//  4. eat() skips spoiled food — never feeds the player rot.
//  5. eatStashOne refuses spoiled.
//  6. preserveFood refuses spoiled meat.
//  7. endDay dawn sweep: announces + discards spoiled, keeps fresh + bonded.
//  8. isSpoiled boundary matches the UI marker (spoilDay <= day).
// Usage: node scripts/test-spoilage-hunter.js
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
  else { fail++; console.log('FAIL  ' + name); }
}
function lastSay() { return Game.log.slice(-2).join(' | '); }
function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife' });
  s.day = 8;
  return s;
}
const carcass = (name, spoilDay) => ({
  plantId: 'meat_x', foodKind: 'meat', foodState: 'carcass', edible: false, units: 1,
  kcalEach: 0, hiddenKcal: 1500, spoilDay, unit: 'carcass', name, kg: 1.5,
});

(async () => {
  await Game.init();

  // ---- 1. spoiled carcass: refused + discarded ----
  let s = fresh();
  s.inventory.push(carcass('Gray Fox (carcass)', 3)); // day 8: rotten
  const idx = s.inventory.findIndex(i => i.foodState === 'carcass');
  Game.log.length = 0;
  Game.cleanCarcass(idx);
  const said = lastSay();
  ok('rotten carcass: refused with honest message', /went bad|beyond cleaning|flies/i.test(said));
  ok('rotten carcass: discarded, not cleanable into food',
    !s.inventory.some(i => /Gray Fox/.test(i.name || '') && i.edible));
  ok('rotten carcass: no cleaned meat produced', !s.inventory.some(i => i.foodState === 'cleaned'));

  // ---- 2. fresh carcass: still cleans fine ----
  s = fresh();
  s.inventory.push(carcass('Cottontail Rabbit (carcass)', 10)); // fresh
  const fi = s.inventory.findIndex(i => i.foodState === 'carcass');
  Game.log.length = 0;
  Game.cleanCarcass(fi);
  ok('fresh carcass: cleans to edible meat',
    s.inventory.some(i => i.foodState === 'cleaned' && i.edible === true));

  // ---- 3. batch: mixed fresh + rotten ----
  s = fresh();
  s.inventory.push(carcass('Old Deer (carcass)', 2));   // rotten
  s.inventory.push(carcass('Fresh Deer (carcass)', 10)); // fresh
  Game.log.length = 0;
  Game.cleanCarcass(); // batch
  ok('batch: rotten discarded', !s.inventory.some(i => /Old Deer/.test(i.name || '')));
  ok('batch: fresh cleaned', s.inventory.some(i => /Fresh Deer/.test(i.name || '') && i.foodState === 'cleaned'));

  // ---- 4. eat() skips spoiled food (never consumed for kcal) ----
  s = fresh();
  s.inventory = []; // clean slate
  s.kcal = 0;
  s.inventory.push({ name: 'Rotten Stew', kcalEach: 500, units: 1, spoilDay: 3 }); // rotten
  s.inventory.push({ name: 'Fresh Bread', kcalEach: 300, units: 1, spoilDay: 30, safe: true }); // fresh
  Game.log.length = 0;
  Game.eat();
  const eatLog = Game.log.join(' ');
  ok('eat: fresh bread eaten, rot not consumed', s.kcal === 300);
  ok('eat: rotten stew discarded and named as waste', /Spoiled and discarded: Rotten Stew/.test(eatLog));

  // ---- 4b. eatOne (the live per-item path) refuses spoiled ----
  s = fresh();
  s.inventory = [];
  s.kcal = 0;
  s.inventory.push({ name: 'Rotten Pie', kcalEach: 400, units: 1, spoilDay: 3 });
  Game.log.length = 0;
  Game.eatOne(0);
  ok('eatOne: refuses spoiled with honest message', /went bad|beyond eating/i.test(lastSay()));
  ok('eatOne: no kcal from rot', s.kcal === 0);
  ok('eatOne: rotten pie not consumed (dawn sweep clears it)', s.inventory.some(i => i.name === 'Rotten Pie'));

  // ---- 5. eatStashOne refuses spoiled ----
  s = fresh();
  const stash = Game.prepStash();
  stash.push({ name: 'Rotten Portion', kcalEach: 200, units: 1, spoilDay: 2 });
  Game.log.length = 0;
  Game.eatStashOne(stash.length - 1);
  ok('eatStashOne: refuses spoiled', /Nothing edible/i.test(lastSay()));

  // ---- 6. preserveFood refuses spoiled meat ----
  s = fresh();
  s.inventory.push({ name: 'Old Meat (cleaned)', foodKind: 'meat', foodState: 'cleaned', edible: true, units: 2, kcalEach: 100, spoilDay: 5 });
  const pi = s.inventory.findIndex(i => /Old Meat/.test(i.name));
  Game.log.length = 0;
  Game.preserveFood(pi);
  ok('preserve: spoiled meat refused, discarded',
    !s.inventory.some(i => /Old Meat/.test(i.name || '') && i.foodState === 'preserved'));

  // ---- 7. dawn sweep ----
  s = fresh(); // day 8
  s.inventory.push(carcass('Doomed Boar (carcass)', 8)); // spoilDay == day: spoiled by UI boundary
  s.inventory.push(carcass('Fine Boar (carcass)', 10));  // fresh
  s.inventory.push({ name: 'Lucky Rock', kcalEach: 0, bonded: true, spoilDay: 1 }); // bonded: never rots
  s.inventory.push({ name: 'Good Jerky', kcalEach: 400, units: 3, spoilDay: 40, safe: true });
  Game.log.length = 0;
  const lost = Game.sweepSpoiled();
  ok('sweep: removed 1 spoiled item', lost === 1);
  ok('sweep: announced the loss', /went bad|flies/i.test(lastSay()));
  ok('sweep: fresh carcass kept', s.inventory.some(i => /Fine Boar/.test(i.name || '')));
  ok('sweep: bonded relic kept', s.inventory.some(i => i.name === 'Lucky Rock'));
  ok('sweep: fresh food kept', s.inventory.some(i => i.name === 'Good Jerky'));
  ok('sweep: nothing left to sweep twice', Game.sweepSpoiled() === 0);

  // ---- 8. isSpoiled boundary ----
  s = fresh(); // day 8
  ok('isSpoiled: spoilDay == day is spoiled (UI boundary)', Game.isSpoiled({ spoilDay: 8 }));
  ok('isSpoiled: spoilDay == day+1 is fresh', !Game.isSpoiled({ spoilDay: 9 }));
  ok('isSpoiled: no spoilDay never spoils', !Game.isSpoiled({ name: 'Rock' }));
  ok('foodMarker: rotten carcass honest', /beyond cleaning/i.test(Game.foodMarker(carcass('X (carcass)', 3))));

  // ---- 9. full loop: kill, neglect 3 dawns, sweep clears it ----
  s = fresh();
  s.day = 1;
  s.inventory.push(Object.assign(carcass('Week Rabbit (carcass)', 3)));
  for (let d = 0; d < 3; d++) { Game.endDay(); s.kcal = 2400; s.hydration = 100; s.health = 100; if (Game.over) break; }
  ok('3 dawns of neglect: rotten carcass swept from pack',
    !s.inventory.some(i => /Week Rabbit/.test(i.name || '')));
  ok('3 dawns of neglect: player was told', /went bad/i.test(Game.log.join(' ')));

  console.log(`\nspoilage-hunter: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
