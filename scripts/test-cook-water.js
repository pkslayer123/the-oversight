// Cooking water tests. Usage: node scripts/test-cook-water.js
// Covers the 2026-10-04 survivalist playtest fixes:
//  1. Cooking used to drain the VILLAGE WELL even when cooking at a field camp
//     (remote drain), and never touched the player's carried bottles. Now: your
//     bottles first, the haven well only as backup AT haven.
//  2. fillWater used to yield CLEAN water anywhere that wasn't a creek (a forest
//     puddle counted as clean). Now: clean only at the Haven well; wild sources
//     are risky — boil them or roll the dice.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const s = () => Game.state.scholar;
const wellClean = () => Math.round((Game.state.village.water && Game.state.village.water.clean) || 0);
const cleanBottles = () => (s().water || []).filter(b => b.quality === 'clean').length;
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().inventory = []; s().water = [];
  Game.state.village.water = { clean: 20, dirty: 0 };
}
function beans(units) {
  return { name: 'Raw beans', kcalEach: 0, units, kg: 0.1, unit: 'handful', rawKcal: 300, cookedKcal: 600, needsCooking: true, safe: false, spoilDay: 30 };
}
function goHaven() {
  Game.travelTo(Game.state.village.px ?? 3, Game.state.village.py ?? 3);
  return Game.playerTile().type === 'haven';
}
function goField() {
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type !== 'haven' && tile.type !== 'creek') {
      Game.travelTo(t.x, t.y);
      if (Game.playerTile().type === tile.type) return tile.type; // travel can be blocked; keep trying
    }
  }
  return null;
}
function goCreek() {
  for (const t of Game.travelTargets()) {
    if (Game.tileAt(t.x, t.y).type === 'creek') {
      Game.travelTo(t.x, t.y);
      if (Game.playerTile().type === 'creek') return true;
    }
  }
  return false;
}

(async () => {
  await Game.init();

  // 1. Haven cooking: bottles first, well untouched.
  {
    freshGame(); goHaven();
    for (let i = 0; i < 5; i++) s().water.push({ liters: 1, quality: 'clean', source: 'Haven well' });
    s().inventory.push(beans(5));
    Game.cookAll();
    ok('1: bottles spent first', cleanBottles() < 5);
    ok('1: well untouched when bottles cover it', wellClean() === 20);
    ok('1: beans cooked', s().inventory[0].rawKcal == null && s().inventory[0].kcalEach > 0);
  }

  // 2. Haven cooking, no bottles: well is the backup.
  {
    freshGame(); goHaven();
    s().inventory.push(beans(3));
    Game.cookAll();
    ok('2: well backs up at haven', wellClean() < 20);
    ok('2: beans cooked via well', s().inventory[0].rawKcal == null);
  }

  // 3. Field: the fire gate holds (no fire in the wilds -> refused, nothing spent),
  // and the water helpers never touch the well outside haven (no remote drain).
  {
    freshGame(); goHaven();
    for (let i = 0; i < 5; i++) s().water.push({ liters: 1, quality: 'clean', source: 'Haven well' });
    const type = goField();
    ok('3: reached a field tile', type !== null);
    if (type) {
      s().inventory.push(beans(4));
      const w0 = wellClean(), b0 = cleanBottles();
      if (Game.nearFire()) {
        ok('3: field has a fire (rare) — refusal check skipped', true);
      } else {
        Game.cookAll(); // no fire out here -> wrapper refuses before any water moves
        ok('3: field cook refused without fire', s().inventory[0].rawKcal === 300);
        ok('3: nothing spent on refusal', cleanBottles() === b0 && wellClean() === w0);
      }
      // unit-level: helpers exclude the well outside haven (no remote drain, ever)
      ok('3: field water availability = bottles only', Game.cleanWaterForCooking() === cleanBottles());
      const wb0 = wellClean(), bb0 = cleanBottles();
      Game.spendCleanWater(Math.min(2, bb0));
      ok('3: field spend uses bottles, well untouched', cleanBottles() === bb0 - Math.min(2, bb0) && wellClean() === wb0);
    }
  }

  // 4. Haven cooking with partial bottles: bottles first, well covers the rest.
  {
    freshGame(); goHaven();
    for (let i = 0; i < 2; i++) s().water.push({ liters: 1, quality: 'clean', source: 'Haven well' });
    s().inventory.push(beans(5)); // needs 5L, has 2
    Game.cookAll();
    ok('4: bottles drained first', cleanBottles() === 0);
    ok('4: well covers remainder', wellClean() < 20);
    ok('4: beans cooked', s().inventory[0].rawKcal == null);
  }

  // 8. fillWater draws the haven cistern (finite shared supply); dry cistern refuses.
  {
    freshGame(); goHaven();
    Game.state.village.water = { clean: 3, dirty: 0 };
    Game.fillWater(); Game.fillWater(); Game.fillWater();
    ok('8: haven fills draw the cistern', wellClean() === 0 && cleanBottles() === 3);
    const b4 = cleanBottles();
    Game.fillWater(); // dry
    ok('8: dry cistern refuses, no bottle minted', cleanBottles() === b4 && wellClean() === 0);
    // creek still works when the cistern is dry (risky but available)
    if (goCreek()) {
      Game.fillWater();
      const b = s().water[s().water.length - 1];
      ok('8: creek fill works despite dry cistern', b.quality === 'risky' && wellClean() === 0);
    } else ok('8: creek fill works despite dry cistern (no reachable creek — skipped)', true);
  }

  // 5. fillWater quality: haven clean, creek risky, forest risky (was: clean).
  {
    freshGame(); goHaven();
    Game.fillWater();
    ok('5: haven fill is clean', s().water[s().water.length - 1].quality === 'clean');
    if (goCreek()) {
      Game.fillWater();
      ok('5: creek fill is risky', s().water[s().water.length - 1].quality === 'risky');
    } else ok('5: creek fill is risky (no reachable creek — skipped)', true);
    if (goField()) {
      Game.fillWater();
      ok('5: wild fill is risky, not clean', s().water[s().water.length - 1].quality === 'risky');
    } else ok('5: wild fill is risky (no reachable field — skipped)', true);
  }

  // 6. boilWater still converts risky -> clean at a fire (haven grounds fire pit).
  {
    freshGame(); goHaven();
    for (let i = 0; i < 3; i++) s().water.push({ liters: 1, quality: 'risky', source: 'Creek (unknown)' });
    const kcal0 = Math.round(s().kcal);
    Game.boilWater();
    ok('6: boil converts all risky', (s().water || []).every(b => b.quality === 'clean'));
    ok('6: boil costs kcal', Math.round(s().kcal) < kcal0);
  }

  // 7. cookFood (single item) also uses bottles first at haven.
  {
    freshGame(); goHaven();
    for (let i = 0; i < 2; i++) s().water.push({ liters: 1, quality: 'clean', source: 'Haven well' });
    s().inventory.push(beans(2));
    Game.cookFood(0);
    ok('7: cookFood spends bottles first', cleanBottles() < 2 && wellClean() === 20);
    ok('7: cookFood cooks', s().inventory[0].rawKcal == null && s().inventory[0].safe === true);
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
