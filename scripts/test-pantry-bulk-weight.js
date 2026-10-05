// takeFromPantryBulk weight regression tests. Usage: node scripts/test-pantry-bulk-weight.js
// Covers the 2026-10-04 survival-feel playtest BUG: takeFromPantryBulk double-counted
// food weight for selections after the first in one pack (inventory is mutated mid-loop
// while totalKg accumulates in parallel), so packing food + water in one call silently
// blocked the water, and multiple food items got short-changed.
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
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.inventory = []; s.water = [];
  return s;
}

(async () => {
  await Game.init();

  // A: food + water in ONE bulk pack. 10kg peanuts + 10L water = 20kg = capacity.
  {
    freshGame();
    Game.state.village.pantry = [{ name: 'Peanuts', kcalEach: 425, units: 40, kg: 0.25, unit: 'handful', safe: true }];
    Game.state.village.water = { clean: 10 };
    Game.takeFromPantryBulk({ 0: 40, water: 10 });
    const nuts = Game.state.scholar.inventory.find(i => i.name === 'Peanuts');
    ok('A: all 40 peanuts packed', nuts && nuts.units === 40);
    ok('A: all 10L water packed', (Game.state.scholar.water || []).length === 10);
    ok('A: well drained', Game.state.village.water.clean === 0);
  }

  // B: two food items in one pack. 8kg + 8kg = 16kg <= 20kg capacity.
  {
    freshGame();
    Game.state.village.pantry = [
      { name: 'Dried meat', kcalEach: 800, units: 16, kg: 0.5, unit: 'strip', safe: true },
      { name: 'Peanuts', kcalEach: 425, units: 16, kg: 0.5, unit: 'handful', safe: true },
    ];
    Game.takeFromPantryBulk({ 0: 16, 1: 16 });
    const meat = Game.state.scholar.inventory.find(i => i.name === 'Dried meat');
    const nuts = Game.state.scholar.inventory.find(i => i.name === 'Peanuts');
    ok('B: all dried meat packed (no double-count)', meat && meat.units === 16);
    ok('B: all peanuts packed (no double-count)', nuts && nuts.units === 16);
  }

  // C: boundary — 12kg food + 8L water = exactly 20kg, all fits.
  {
    freshGame();
    Game.state.village.pantry = [{ name: 'Dried meat', kcalEach: 800, units: 24, kg: 0.5, unit: 'strip', safe: true }];
    Game.state.village.water = { clean: 8 };
    Game.takeFromPantryBulk({ 0: 24, water: 8 });
    const meat = Game.state.scholar.inventory.find(i => i.name === 'Dried meat');
    ok('C: food at exact capacity boundary', meat && meat.units === 24);
    ok('C: water at exact capacity boundary', (Game.state.scholar.water || []).length === 8);
  }

  // D: over-capacity still blocks correctly. 10kg food then 15L water (>20kg).
  {
    freshGame();
    Game.state.village.pantry = [{ name: 'Peanuts', kcalEach: 425, units: 40, kg: 0.25, unit: 'handful', safe: true }];
    Game.state.village.water = { clean: 15 };
    Game.takeFromPantryBulk({ 0: 40, water: 15 });
    const nuts = Game.state.scholar.inventory.find(i => i.name === 'Peanuts');
    ok('D: food packed first', nuts && nuts.units === 40);
    ok('D: water capped at remaining 10kg', (Game.state.scholar.water || []).length === 10);
    ok('D: excess water left in well', Game.state.village.water.clean === 5);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
