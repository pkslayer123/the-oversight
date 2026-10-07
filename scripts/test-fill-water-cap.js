// Fill-water carry-capacity tests. Usage: node scripts/test-fill-water-cap.js
// Covers the 2026-10-05 survivalist fix: fillWater() and fillWaterFromVillage()
// used to ignore the pack weight limit — wild runs filled 15-20L (15-20kg)
// past the 20kg carry cap with no refusal. Now both paths gate on canCarry(1):
// at/over capacity the fill is refused, the cistern is not drained, and no
// kcal or time is spent. (The pantry pack UI already gated water on capacity —
// the bottle-fills were the outliers.)
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
const s = () => Game.state.scholar;
const waterL = () => (s().water || []).reduce((t, b) => t + (b.liters || 1), 0);
const wellClean = () => Math.round((Game.state.village.water && Game.state.village.water.clean) || 0);

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().inventory = []; s().water = [];
  Game.state.village.water = { clean: 20, dirty: 0 };
}
function goHaven() {
  Game.travelTo(Game.state.village.px ?? 4, Game.state.village.py ?? 4);
  return Game.playerTile().type === 'haven';
}
function heavyPack() {
  // 19.5kg of rocks: exactly 0.5kg of headroom left.
  s().inventory = [{ name: 'Rocks', units: 195, kg: 0.1, kcalEach: 0 }];
}
function drainLog() { Game.log.length = 0; }

(async () => {
  await Game.init();

  // 1. Wild fill below capacity works and costs a tick.
  freshGame(); goHaven(); drainLog();
  s().mx = 4; s().my = 4;
  const ticks0 = s().dayTicks || 0;
  Game.fillWater();
  ok('fill below capacity adds 1L', waterL() === 1);
  ok('fill below capacity costs a tick', (s().dayTicks || 0) > ticks0);

  // 2. Wild fill at capacity is refused: no water, no kcal, no ticks.
  //    (19.5kg pack + 1L = 20.5kg > 20kg cap, so even the first fill refuses.)
  freshGame(); drainLog();
  heavyPack(); // 19.5kg
  const wBefore = waterL();
  const kcalBefore = s().kcal;
  const ticksBefore = s().dayTicks || 0;
  Game.fillWater();
  ok('fill at capacity refused (no water added)', waterL() === wBefore);
  ok('refused fill costs no kcal', s().kcal === kcalBefore);
  ok('refused fill costs no ticks', (s().dayTicks || 0) === ticksBefore);
  ok('refusal says something', Game.log.some(l => /pack is full|too heavy/i.test(l)));

  // 3. Village fill at capacity is refused and does NOT drain the cistern.
  freshGame(); goHaven(); drainLog();
  heavyPack();
  const cistBefore = wellClean();
  Game.fillWaterFromVillage();
  ok('village fill at capacity refused (no water added)', waterL() === 0);
  ok('village fill refusal does not drain cistern', wellClean() === cistBefore);

  // 4. Village fill below capacity still works and drains the cistern.
  freshGame(); goHaven(); drainLog();
  const c0 = wellClean();
  Game.fillWaterFromVillage();
  ok('village fill below capacity adds 1L', waterL() === 1);
  ok('village fill below capacity drains cistern', wellClean() === c0 - 1);

  // 5. Edge: exactly at capacity — fill is refused (canCarry uses <=).
  freshGame(); drainLog();
  s().inventory = [{ name: 'Rocks', units: 200, kg: 0.1, kcalEach: 0 }]; // exactly 20kg
  Game.fillWater();
  ok('fill refused when exactly at capacity', waterL() === 0);

  // 6. doAction('treat') is gone — the dead branch that conjured +2L from
  //    nothing is removed. It should now fall into the unknown-kind safety.
  freshGame(); drainLog();
  const w0 = waterL();
  Game.doAction('treat');
  ok('doAction(treat) no longer conjures water', waterL() === w0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
