// FORAGER adversarial: food-economy attacks (2026-10-08), break-it style.
// EXPLOIT: blind-haul / carcass / in-shell / spoiled must grant ZERO kcal.
// SOFTLOCK: eat() on empty / only-inedible / spoiled-mixed inventories.
// HONESTY: spoil clocks vs the isSpoiled boundary; kcalCap clamp on all paths.
// Usage: SEED=7 node scripts/test-forager-economy-20261008.js
'use strict';
const fs = require('fs');
const path = require('path');

const SEED = parseInt(process.env.SEED || '20261008', 10);
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
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js',
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
      villagerId: 'p1', day: 5, kcal: 500, health: 100, energy: 100,
      inventory: [], mx: 4, my: 4, insideHaven: true, exiled: false,
      abilities: [], backgroundAbilities: [],
    },
    village: {
      name: 'Haven', px: 4, py: 4, day: 5,
      roster: ['p1'], trust: { p1: 15 },
      pantry: [], pantryKcal: 0, water: { clean: 0, dirty: 0 }, gossip: [],
    },
    otherVillages: [], pastVillages: [], codex: { plants: {} }, weather: 'clear',
  };
  Game.map = { px: 4, py: 4 };
  Game.dayPart = 1;
  Game.location = 'haven';
  Game.data = Game.data || {};
  Game.data.items = Game.data.items || [];
  Game.data.villagers = [{ id: 'p1', name: 'Test Scholar' }];
  for (const dn of ['abilities', 'plants', 'synergies', 'animals', 'monsters']) {
    try { Game.data[dn] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', dn + '.json'), 'utf8')); }
    catch (e) { Game.data[dn] = []; }
  }
  Game._said = [];
  Game.say = (t) => { Game._said.push(String(t)); };
  Game.tickAction = () => null;
  Game.status = () => null;
  Game.observe = () => {};
  Game.journalNote = () => {};
  Game.audioEvent = () => {};
  Game.recordTrauma = () => {};
  Game.villageLearn = () => {};
  Game.depleteRandomTile = () => {};
  Game.turfKcal = () => 0;
  Game.villagerMealDay = () => ({ ate: 0, gave: 0, drawn: 0 });
  Game.hasSynergy = () => false;
  Game.inCombat = () => false;
  Game.modTarget = (k, d) => d;
  Game.tele = () => {};
  Game.addHealth = (n) => { Game.state.scholar.health = Math.min(Game.maxHealth(), (Game.state.scholar.health || 0) + n); };
}
const saidHas = (re) => Game._said.some(t => re.test(t));
const DAY = 5;
const goodBerry = () => ({ plantId: 'test_berry', foodKind: 'plant', foodState: 'ready', edible: true, units: 3, kcalEach: 120, name: 'Test berries', spoilDay: DAY + 2 });

console.log('== A. EXPLOIT: blind haul / carcass / in-shell grant ZERO ==');
{
  freshGame();
  const s = Game.state.scholar;
  // unknown plant (hiddenKcal present, kcalEach 0, edible false)
  s.inventory.push({ plantId: 'x', foodKind: 'plant', foodState: 'unknown', edible: false, units: 8, kcalEach: 0, hiddenKcal: 140, name: 'unfamiliar shoots', spoilDay: DAY + 2 });
  s.inventory.push({ plantId: 'meat_deer', foodKind: 'meat', foodState: 'carcass', edible: false, units: 1, kcalEach: 0, hiddenKcal: 4000, name: 'Deer (carcass)', spoilDay: DAY + 2 });
  s.inventory.push({ plantId: 'acorn_x', foodKind: 'nut', foodState: 'in_shell', edible: false, units: 5, kcalEach: 0, hiddenKcal: 200, name: 'Acorns (in shell)', spoilDay: DAY + 2 });
  const before = s.kcal;
  Game.eat();
  ok(s.kcal === before, 'eat() grants nothing from unknown/carcass/in-shell', s.kcal - before);
  ok(s.inventory.length === 3, 'inedible items are NOT deleted by eat()', s.inventory.length);
  ok(saidHas(/Nothing edible/), 'honest "Nothing edible" + processing guidance', Game._said.join(' | ').slice(0, 120));
}
{
  freshGame();
  const s = Game.state.scholar;
  s.inventory.push({ plantId: 'x', foodKind: 'plant', foodState: 'unknown', edible: false, units: 8, kcalEach: 0, hiddenKcal: 140, name: 'unfamiliar shoots', spoilDay: DAY + 2 });
  const before = s.kcal;
  Game.eatOne(0);
  ok(s.kcal === before, 'eatOne() refuses unknown honestly', s.kcal - before);
  ok(saidHas(/identify it first|Nothing edible/), 'eatOne names the state honestly', Game._said.join(' | ').slice(0, 100));
}
{
  freshGame();
  const s = Game.state.scholar;
  // SPOILED cooked meat: must not be eaten for full kcal.
  s.inventory.push({ plantId: 'meat_deer', foodKind: 'meat', foodState: 'cooked', edible: true, units: 4, kcalEach: 250, name: 'Cooked venison', spoilDay: DAY - 1 });
  const before = s.kcal;
  Game.eat();
  ok(s.kcal === before, 'spoiled meat grants zero and is discarded', s.kcal - before);
  ok(s.inventory.length === 0, 'spoiled meat discarded, not kept as phantom food');
}

console.log('== B. EXPLOIT: kcalCap clamp on every grant path ==');
{
  freshGame();
  const s = Game.state.scholar;
  const cap = Game.kcalCap();
  s.kcal = cap - 100;
  s.inventory.push(goodBerry());
  Game.eat();
  ok(s.kcal <= cap, 'eat() never exceeds kcalCap', s.kcal);
  ok(s.kcal === cap, 'eat() fills exactly to cap', s.kcal);
}
{
  freshGame();
  const s = Game.state.scholar;
  const cap = Game.kcalCap();
  ok(Number.isFinite(cap) && cap > 0, 'kcalCap is finite and positive', cap);
  ok(Game.banked() === Math.max(0, (s.kcal || 0) - Game.fullLine()), 'banked() is kcal minus the fed line, never negative');
  // feastBurn can't eat the body pool
  s.kcal = Game.fullLine() + 300;
  const mult = Game.feastBurn();
  ok(mult > 0, 'feastBurn fires at >=300 banked');
  ok(s.kcal >= 0 && s.kcal === Game.fullLine(), 'feastBurn deducts exactly the burn, floor at fed line', s.kcal);
  s.kcal = Game.fullLine() + 100;
  ok(Game.feastBurn() === 0, 'feastBurn refuses below 300 banked — no partial burn');
}

console.log('== C. SOFTLOCK: empty / inedible / NaN inventories ==');
{
  freshGame();
  const s = Game.state.scholar;
  Game.eat();
  ok(saidHas(/Nothing to eat/), 'empty pack: honest message, no crash');
}
{
  freshGame();
  const s = Game.state.scholar;
  s.kcal = 0;
  s.inventory.push({ name: 'Weird rock', units: 1, kcalEach: 0, spoilDay: 9999 });
  Game.eat();
  ok(s.kcal === 0 && s.inventory.length === 1, 'zero-kcal gear never enters the eat loop, never deleted');
}
{
  // hostile units: Infinity must not spin the eat loop forever
  freshGame();
  const s = Game.state.scholar;
  s.inventory.push({ name: 'Glitch loaf', foodKind: 'plant', foodState: 'ready', edible: true, units: Infinity, kcalEach: 50, spoilDay: DAY + 2 });
  const t0 = Date.now();
  Game.eat();
  ok(Date.now() - t0 < 5000, 'eat() terminates even with Infinity units (kcal clamp exits the loop)');
  ok(s.kcal === Game.kcalCap(), 'clamped to cap');
}

console.log('== D. HONESTY: spoil clocks agree with the isSpoiled boundary ==');
{
  freshGame();
  const s = Game.state.scholar;
  const mk = (sd) => ({ name: 'x', spoilDay: sd });
  // left=2: fresh, countdown honest
  ok(Game.spoilClockShort(mk(DAY + 2)) === 'spoils in 2d', '2 days left: "spoils in 2d"');
  ok(!Game.isSpoiled(mk(DAY + 2)), '2 days left: not spoiled');
  // left=1
  ok(Game.spoilClockShort(mk(DAY + 1)) === '\u26A0 spoils tomorrow', '1 day left: "spoils tomorrow"');
  ok(!Game.isSpoiled(mk(DAY + 1)), '1 day left: not spoiled');
  // left=0: THE BUG — isSpoiled true (row shows ⚠ spoiled) but the clock said "SPOILING TODAY"
  const m0 = Game.spoilClockShort(mk(DAY));
  const sc0 = Game.stashClock(mk(DAY));
  ok(Game.isSpoiled(mk(DAY)), 'left=0: engine calls it spoiled (spoilDay <= day)');
  ok(m0 === '' || m0 === undefined, 'left=0: spoilClockShort says NOTHING (the row\'s own ⚠ spoiled speaks)', m0);
  ok(sc0 === 'spoiled', 'left=0: stashClock agrees — "spoiled", not "SPOILING TODAY"', sc0);
}

console.log('== E. HONESTY: processing math matches its promises ==');
{
  freshGame();
  const s = Game.state.scholar;
  // shellNuts: net = 75% of gross
  s.inventory.push({ plantId: 'hazel', foodKind: 'nut', foodState: 'in_shell', edible: false, units: 4, kcalEach: 0, hiddenKcal: 200, name: 'Hazelnuts (in shell)', spoilDay: DAY + 30 });
  Game.shellNuts(0);
  const nut = s.inventory[0];
  ok(nut.kcalEach === 150 && nut.edible === true, 'shelled nuts: 75% net (200→150), now edible', nut.kcalEach);
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
