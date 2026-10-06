// villageEats hunger sync (miser loop 2026-10-05).
// The behavioral hunger layer (npcNeeds.hunger, drives begging/mood) only ever
// rose (+11/day-part in tickNeeds) and was never touched by the communal meal,
// so every villager pinned at 100 hunger within two days no matter how full
// the pantry was. villageEats now syncs it: a fed village is content, a
// starving one gets hungrier. The miser fantasy (drain the pot -> hungry eyes
// on your pack) finally fires on real scarcity.
// Usage: node scripts/test-villageeats-hunger-sync.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

let said = [];
function freshGame() {
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
}
const V = () => Game.state.village;
const npcIds = () => (V().roster || []).filter(id => id !== Game.villagerId);
function setAllHunger(h) { for (const id of npcIds()) Game.npcNeeds(id).hunger = h; }
function maxHunger() { return Math.max(...npcIds().map(id => Game.npcNeeds(id).hunger || 0)); }
function minHunger() { return Math.min(...npcIds().map(id => Game.npcNeeds(id).hunger || 0)); }
function stockPantry(kcal) {
  V().pantry = [{ name: 'Dried meat', kcalEach: 400, units: Math.ceil(kcal / 400), spoilDay: 9999, safe: true, kg: 0.3 }];
}

(async () => {
  await Game.init();

  // 1. fed village -> behavioral hunger resets to content baseline
  freshGame();
  setAllHunger(95);
  stockPantry(60000);
  Game.villageEats();
  ok('fed: max hunger drops below begging threshold (70)', maxHunger() < 70, `max=${maxHunger()}`);
  ok('fed: hunger lands at content baseline (<=15)', maxHunger() <= 15, `max=${maxHunger()}`);
  ok('fed: pantry was actually consumed', (V().pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0) < 60000);

  // 2. starving village (empty pantry) -> hunger climbs
  freshGame();
  setAllHunger(20);
  V().pantry = [];
  V().health = {};
  Game.villageEats();
  ok('starving: hunger rises on empty pantry', minHunger() > 20, `min=${minHunger()}`);
  ok('starving: empty-pantry warning fires', said.some(t => /pantry is empty/i.test(t)));

  // 3. donation now feeds the village through the real pantry:
  //    donate bulk, run end-of-day, hunger drops via villageEats
  freshGame();
  setAllHunger(90);
  Game.state.scholar.inventory.push({ name: 'Dried meat', kcalEach: 400, units: 30, spoilDay: 9999, safe: true, kg: 0.3 });
  V().pantry = [];
  const meatIdx = Game.state.scholar.inventory.findIndex(i => i.name === 'Dried meat' && i.units === 30);
  Game.donateToPantry(meatIdx);
  ok('donation stocks the real pantry', (V().pantry || []).length > 0);
  Game.villageEats();
  ok('donation -> communal meal -> hunger resets', maxHunger() <= 15, `max=${maxHunger()}`);

  // 4. giveFood still works as the personal-generosity verb
  freshGame();
  const rid = npcIds()[0];
  Game.npcNeeds(rid).hunger = 80;
  Game.state.scholar.inventory.push({ name: 'Dried meat', kcalEach: 400, units: 5, spoilDay: 9999, safe: true, kg: 0.3 });
  const r = Game.giveFood(rid, 'meal');
  ok('giveFood answers and relieves hunger', r && r.ok && Game.npcNeeds(rid).hunger < 80, `hunger=${Game.npcNeeds(rid).hunger}`);

  // 5. dead 'donation' villageEvent branch is gone (was never called)
  ok('villageEvent donation branch removed', !/type === 'donation'/.test(fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8')));

  // 6. tickNeeds still grows hunger within a fed day (the sim stays alive),
  //    but a full day of parts can't reach begging threshold when fed nightly
  freshGame();
  setAllHunger(15);
  stockPantry(60000);
  for (let i = 0; i < 4; i++) Game.tickNeeds();
  ok('one fed day of wants-growth stays under begging threshold', maxHunger() < 70, `max=${maxHunger()}`);
  Game.villageEats();
  ok('nightly communal meal resets again', maxHunger() <= 15, `max=${maxHunger()}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
