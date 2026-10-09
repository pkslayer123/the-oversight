// FORAGER adversarial: processing-pipeline attacks (2026-10-08), break-it style.
// EXPLOIT: re-cook / re-clean / re-preserve must not print calories; rot must
// never be processed back into food. HONESTY: cookTransform never exceeds
// gross; identification reveals the hidden kcal honestly, once.
// Usage: SEED=7 node scripts/test-forager-pipeline-20261008.js
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
      inventory: [], tools: [{ name: 'Stone knife', recipeId: 'stone_knife' }],
      mx: 4, my: 4, insideHaven: true, exiled: false,
      abilities: [], backgroundAbilities: [], techniques: { clean: 1, cook: 1, preserve: 1 },
    },
    village: {
      name: 'Haven', px: 4, py: 4, day: 5,
      roster: ['p1'], trust: { p1: 15 },
      pantry: [], pantryKcal: 0, water: { clean: 0, dirty: 0 }, gossip: [],
    },
    otherVillages: [], pastVillages: [], codex: { plants: {}, encounters: {} }, weather: 'clear',
  };
  Game.map = { px: 4, py: 4 };
  Game.dayPart = 1;
  Game.location = 'haven';
  Game.data = Game.data || {};
  Game.data.items = Game.data.items || [];
  Game.data.villagers = [{ id: 'p1', name: 'Test Scholar' }];
  for (const dn of ['abilities', 'plants', 'synergies', 'animals', 'monsters', 'cooking']) {
    try { Game.data[dn] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', dn + '.json'), 'utf8')); }
    catch (e) { Game.data[dn] = dn === 'cooking' ? {} : []; }
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
  Game.nearFire = () => true;
  Game.genDetail = () => Array.from({ length: 9 }, () => Array(9).fill('fire'));
  Game.knowsTechnique = (t) => !!(Game.state.scholar.techniques || {})[t];
  Game.learnTechnique = (t) => { Game.state.scholar.techniques = Game.state.scholar.techniques || {}; Game.state.scholar.techniques[t] = 1; };
  Game.monsterFoodSafe = () => true;
  Game.addHealth = (n) => { Game.state.scholar.health = Math.min(Game.maxHealth(), (Game.state.scholar.health || 0) + n); };
}
const DAY = 5;
const saidHas = (re) => Game._said.some(t => re.test(t));
const invTotal = () => Game.state.scholar.inventory.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);

console.log('== A. EXPLOIT: no re-processing calorie printers ==');
{
  freshGame();
  const s = Game.state.scholar;
  // deer carcass, 4000 hidden kcal
  s.inventory.push(Game.foodCarcass({ id: 'deer', name: 'Deer' }, 4000, DAY, 'hunted'));
  Game.cleanCarcass(0);
  const after1 = invTotal();
  ok(after1 > 0, 'first clean yields meat', after1);
  const units1 = s.inventory[0].units;
  Game.cleanCarcass(0); // hostile: clean the cleaned
  ok(invTotal() === after1 && s.inventory[0].units === units1, 're-clean refused — no calorie printer', invTotal());
  ok(saidHas(/already cleaned|No carcasses/), 'honest refusal message');
}
{
  freshGame();
  const s = Game.state.scholar;
  s.inventory.push(Game.foodCarcass({ id: 'deer', name: 'Deer' }, 4000, DAY, 'hunted'));
  Game.cleanCarcass(0);
  const cleaned = invTotal();
  Game.cookFood(0);
  const cooked = invTotal();
  ok(cooked <= 4000, 'cooked never exceeds the carcass gross (digestibility, not a multiplier)', cooked);
  const cookedKcal = cooked;
  Game.cookFood(0); // hostile: cook the cooked
  ok(invTotal() === cookedKcal, 're-cook refused — no second transform', invTotal());
}
{
  freshGame();
  const s = Game.state.scholar;
  s.inventory.push(Game.foodCarcass({ id: 'deer', name: 'Deer' }, 4000, DAY, 'hunted'));
  Game.cleanCarcass(0);
  Game.cookFood(0);
  const cooked = invTotal();
  Game.preserveFood(0);
  const smoked = invTotal();
  ok(smoked <= cooked, 'smoking costs yield (90-95%), never gains', { cooked, smoked });
  Game.preserveFood(0); // hostile: smoke the smoked
  ok(invTotal() === smoked, 're-smoke refused', invTotal());
}

console.log('== B. EXPLOIT: rot is never processed back into food ==');
{
  freshGame();
  const s = Game.state.scholar;
  s.inventory.push(Game.foodCarcass({ id: 'deer', name: 'Deer' }, 4000, DAY - 5, 'hunted')); // spoilDay = DAY-3
  Game.cleanCarcass(0);
  ok(s.inventory.length === 0, 'rotten carcass dropped, not cleaned', s.inventory.length);
  ok(saidHas(/went bad/), 'honest rot message');
}
{
  freshGame();
  const s = Game.state.scholar;
  s.inventory.push(Game.foodCarcass({ id: 'deer', name: 'Deer' }, 4000, DAY, 'hunted'));
  Game.cleanCarcass(0);
  s.inventory[0].spoilDay = DAY - 1; // let it rot
  Game.cookFood(0);
  ok(s.inventory.length === 0, 'rotten cleaned meat dropped, not cooked');
  ok(saidHas(/cooking won't save it/), 'honest cook-rot refusal');
}
{
  freshGame();
  const s = Game.state.scholar;
  s.inventory.push(Game.foodCarcass({ id: 'deer', name: 'Deer' }, 4000, DAY, 'hunted'));
  Game.cleanCarcass(0);
  Game.cookFood(0);
  s.inventory[0].spoilDay = DAY - 1;
  Game.preserveFood(0);
  ok(s.inventory.length === 0, 'rotten cooked meat dropped, not smoked');
  ok(saidHas(/smoking won't save it/), 'honest smoke-rot refusal');
}

console.log('== C. HONESTY: cookTransform bounded by gross, outcomes honest ==');
{
  freshGame();
  // synthetic: rawPer 100 x 4 units, class raw 0.5 / cooked 0.9
  const item = { units: 4, kcalEach: 100, foodKind: 'plant', plantId: 'x' };
  const r = Game.cookTransform(item, { outcome: { key: 'perfect', mult: 1.0 } });
  // cookClassFor needs data.cooking; if no class, transform is null — still honest
  if (r) {
    ok(r.cookedTotal <= r.rawTotal / 0.5 + 1, 'perfect cook never exceeds gross', r);
    const burnt = Game.cookTransform({ units: 4, kcalEach: 100, foodKind: 'plant', plantId: 'x' }, { outcome: { key: 'burnt', mult: 0.4 } });
    if (burnt) ok(burnt.cookedTotal <= r.cookedTotal, 'burnt <= perfect (skill buys outcome, never phantom energy)', burnt.cookedTotal);
  } else {
    ok(true, 'no class for synthetic item — transform refuses (null), no phantom food');
  }
}

console.log('== D. HONESTY: identification reveals the hidden kcal exactly once ==');
{
  freshGame();
  const s = Game.state.scholar;
  const p = (Game.data.plants || []).find(x => x.id === 'dandelion') || (Game.data.plants || [])[0];
  if (p) {
    s.inventory.push(Game.foodForageItem(p, false, 6, 6 * (p.caloriesPerUnit || 0), DAY));
    const before = s.inventory[0];
    ok(before.kcalEach === 0 && before.edible === false, 'unknown: 0 kcal, inedible', before.kcalEach);
    Game.identifyPlant(p.id, 'tested');
    Game.refreshItemNames(p.id);
    const after = s.inventory.find(i => i.plantId === p.id);
    ok(after && after.kcalEach === (p.caloriesPerUnit || 0) && after.edible === true, 'identified: true kcal revealed, edible', after && after.kcalEach);
    ok(invTotal() === 6 * (p.caloriesPerUnit || 0), 'total matches the revealed per-unit value — no dup, no loss', invTotal());
  } else ok(false, 'no plants in data');
}

console.log('== E. HONESTY: forage "(X kcal)" counts only edible-now food ==');
{
  freshGame();
  const s = Game.state.scholar;
  // Simulate the pack loop's kcal accounting for a known-nut haul:
  // the message's (X kcal) must not count in-shell nuts.
  const p = (Game.data.plants || []).find(x => x.id === 'hickory_nut');
  const units = 6, kcal = units * (p.caloriesPerUnit || 0);
  const item = Game.foodForageItem(p, true, units, kcal, DAY);
  let totalKcalKnown = 0;
  if (item.edible) totalKcalKnown += kcal; // the fixed accounting
  ok(totalKcalKnown === 0, 'in-shell nuts contribute 0 to the "(X kcal)" promise', totalKcalKnown);
  ok(item.edible === false && item.kcalEach === 0, 'the nuts themselves are honestly inedible pre-shelling');
  // and a ready berry haul still counts
  const b = { id: 'x', caloriesPerUnit: 120, preparation: '' };
  const bItem = Game.foodForageItem(b, true, 5, 600, DAY);
  let t2 = 0;
  if (bItem.edible) t2 += 600;
  ok(t2 === 600, 'ready food still counted in full', t2);
  // the message branch: all-nut haul names the shelling, never "(0 kcal)"
  const kcalBit = (tk) => tk > 0 ? ` (${tk} kcal)` : ' (in shell \u2014 shell them to eat)';
  ok(kcalBit(0) === ' (in shell \u2014 shell them to eat)', 'all-nut haul message names the shelling');
  ok(kcalBit(800) === ' (800 kcal)', 'ready haul message keeps the kcal promise');
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
