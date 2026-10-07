// Pantry physicality tests. Usage: node scripts/test-pantry-physical.js
// The pantry lives in the hall at haven — it doesn't teleport. Covers the
// 2026-10-05 survivalist playtest finding: the dawn village meal (and the
// player's roster draw in villageEats) used to reach the player anywhere on
// the map, which made wild camping free and collapsed the fire/boil/forage
// survival loop.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/membership.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
const said = [];
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 1000; s.health = 100; s.exiled = false; s.joinedVillage = null;
  said.length = 0;
  Game.log.length = 0;
  Game.say = (t) => { said.push(String(t)); };
  return s;
}
function saidHas(sub) { return said.some(t => t.indexOf(sub) !== -1); }
function goHaven() {
  const v = Game.state.village;
  Game.travelTo(v.px ?? 4, v.py ?? 4);
  return Game.pantryInReach();
}
function goWild() {
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type === 'haven') continue;
    if (Game.travelBlockage(t.x, t.y)) continue; // player picks a clear path
    Game.travelTo(t.x, t.y);
    if (!Game.pantryInReach()) return true;
  }
  return false;
}

(async () => {
  await Game.init();

  // 1. At haven: the meal is served.
  {
    freshGame();
    ok('starts at haven (pantry in reach)', Game.pantryInReach());
    Game.state.village.pantry = [{ name: 'Test stew', kcalEach: 1000, units: 5, spoilDay: 30 }];
    const k0 = Game.state.scholar.kcal;
    Game.villageMeal();
    ok('meal served at haven (kcal up)', Game.state.scholar.kcal > k0);
    ok('meal says so', saidHas('Village meal:'));
  }

  // 2. Away: no meal, honest message.
  {
    freshGame();
    ok('reached wild tile', goWild());
    Game.state.village.pantry = [{ name: 'Test stew', kcalEach: 1000, units: 5, spoilDay: 30 }];
    const k0 = Game.state.scholar.kcal;
    const p0 = Game.state.village.pantry[0].units;
    Game.villageMeal();
    ok('no meal while wild (kcal unchanged)', Game.state.scholar.kcal === k0);
    ok('pantry untouched', Game.state.village.pantry[0].units === p0);
    ok('says why (no silent skip)', saidHas('camp wild'));
  }

  // 3. endDay away: no teleport meal; endDay at haven: meal returns.
  {
    freshGame();
    goWild();
    Game.state.village.pantry = [{ name: 'Test stew', kcalEach: 1000, units: 20, spoilDay: 30 }];
    Game.state.scholar.kcal = 1000;
    Game.endDay();
    ok('endDay away: no Village meal line', !saidHas('Village meal:'));
    ok('endDay away: camp-wild note', saidHas('camp wild'));
    said.length = 0;
    goHaven();
    Game.state.scholar.kcal = 1000;
    Game.endDay();
    ok('endDay home: meal served again', saidHas('Village meal:'));
  }

  // 4. villageEats: the away player neither draws nor provides.
  {
    freshGame();
    const v = Game.state.village;
    const savedRoster = v.roster.slice();
    v.roster = [Game.villagerId];
    goWild();
    v.pantry = [{ name: 'Test stew', kcalEach: 1000, units: 10, spoilDay: 30 }];
    Game.villageEats();
    ok('away: pantry untouched by roster accounting', v.pantry[0].units === 10);
    said.length = 0;
    goHaven();
    v.pantry = [{ name: 'Test stew', kcalEach: 1000, units: 10, spoilDay: 30 }];
    Game.villageEats();
    ok('home: pantry drawn for the player', v.pantry[0].units < 10);
    v.roster = savedRoster;
  }

  // 5. Exile still blocks first (away + exiled → exile message, not camp-wild).
  {
    freshGame();
    goWild();
    Game.state.scholar.exiled = true;
    Game.villageMeal();
    ok('exiled away: exile message wins', saidHas('not yours anymore'));
    Game.state.scholar.exiled = false;
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
