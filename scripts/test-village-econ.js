// Village economy tests. Usage: node scripts/test-village-econ.js
// Covers: generated villagers produce food (providesPerDay set — it was
// undefined, so they ate full need and the village burned ~12k/day);
// villageEats shortfall lands near the doc target (~92% self-provision),
// not at the old extremes (starving or self-sufficient).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const itemsKcal = () => Game.state.village.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);

(async () => {
  await Game.init();

  // 1. every roster member resolves to a person who PRODUCES food.
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const v = Game.state.village;
  let allProduce = true, totalProduced = 0, totalNeeded = 0;
  for (const id of (v.roster || [])) {
    const person = (Game.data.villagers || []).find(p => p.id === id) || (Game.data.background_survivors || []).find(p => p.id === id);
    if (!person || !(person.providesPerDay > 0)) { allProduce = false; break; }
    const known = (v.taught && v.taught[id]) ? v.taught[id].length : 0;
    totalProduced += person.providesPerDay * (1 + known * 0.15);
    totalNeeded += (person.kcalPerDay || 2000);
  }
  ok('every roster member produces food (providesPerDay > 0)', allProduce);
  const provision = totalProduced / totalNeeded;
  ok(`total provision near 92% (got ${(provision * 100).toFixed(0)}%)`, provision > 0.8 && provision < 1.05);

  // 2. the daily shortfall is a gap the player can cover — not a death spiral,
  //    not a surplus that makes the forager pointless.
  const k0 = itemsKcal();
  Game.villageEats();
  const burn = k0 - itemsKcal();
  ok(`daily pantry burn sane (got ${burn}, want 0..6000)`, burn > -500 && burn < 6000);
  ok('pantryKcal honest after villageEats', Game.state.village.pantryKcal === itemsKcal());

  // 3. five idle days don't starve or explode the village.
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const start = itemsKcal();
  for (let d = 0; d < 5 && !Game.over; d++) Game.tickAction(520);
  const delta = itemsKcal() - start;
  ok(`5 idle days: pantry delta sane (got ${delta})`, delta > -40000 && delta < 30000 && !Game.over);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); console.error(e.stack.split('\n').slice(0, 6).join('\n')); process.exit(2); });
