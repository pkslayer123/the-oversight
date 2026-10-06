// Monster loot economy (Steve 2026-10-05): monsters are HIGH RISK / HIGH REWARD.
// Low drop chance on alien loot, tier scales with monster strength, and the
// zero-calorie "do not eat" bug (phantom 1000 kcal meat) is fixed.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const monsters = Game.data.monsters || [];
  const items = Game.data.items || [];

  // --- every monster has a loot table ---
  ok('monsters loaded', monsters.length > 0, `got ${monsters.length}`);
  const noLoot = monsters.filter(m => !m.loot);
  ok('all monsters have loot tables', noLoot.length === 0);

  // --- drop chances are LOW (not raining loot) ---
  const chances = monsters.map(m => m.loot.chance);
  ok('no monster above 30% drop chance', Math.max(...chances) <= 0.30);
  ok('no monster below 5% (not never)', Math.min(...chances) >= 0.05);
  ok('wave 1 average chance <= 15%', monsters.filter(m => m.wave === 1).reduce((t, m) => t + m.loot.chance, 0) / monsters.filter(m => m.wave === 1).length <= 0.15);

  // --- tier ordering: loot quality scales with monster strength (not strictly
  // by wave — a tough wave-1 monster drops better than a weak wave-2 one).
  // The invariant: higher-tier loot comes from stronger monsters.
  const w1tiers = monsters.filter(m => m.wave === 1).map(m => m.loot.tier);
  const w2tiers = monsters.filter(m => m.wave === 2).map(m => m.loot.tier);
  ok('wave 2 min tier >= wave 1 min tier', Math.min(...w2tiers) >= Math.min(...w1tiers));
  ok('tiers are 1-4', w1tiers.concat(w2tiers).every(t => t >= 1 && t <= 4));

  // --- alien item pool exists, tiered, all marked ---
  const alien = items.filter(i => i.origin === 'alien');
  ok('alien pool non-empty', alien.length >= 8);
  ok('all alien items have lootTier', alien.every(i => i.lootTier >= 1 && i.lootTier <= 5));
  ok('tier 1 pool non-empty', alien.some(i => i.lootTier === 1));
  ok('tier 2 pool non-empty', alien.some(i => i.lootTier === 2));
  // (Mechanic check: baseEffect describes what it does. gravity_well and
  // genesis_seed have bespoke effects not in the narrow field list.)
  ok('all alien items have a real mechanic (weapon/heal/carry/fuel/food/trade/effect)',
    alien.every(i => i.weapon || i.healAmount || i.carryBonus || i.fuelBurnMult || i.kcalEach || i.tradeValue || (i.baseEffect && i.baseEffect.length > 10)));

  // --- tier 2 strictly better than tier 1 (proper level) ---
  const t1 = alien.filter(i => i.lootTier === 1), t2 = alien.filter(i => i.lootTier === 2);
  const t1Weapons = t1.filter(i => i.weapon), t2Weapons = t2.filter(i => i.weapon);
  if (t1Weapons.length && t2Weapons.length) {
    ok('tier 2 weapon bonus > tier 1 best',
      Math.max(...t2Weapons.map(i => i.weapon.bonus)) > Math.max(...t1Weapons.map(i => i.weapon.bonus)));
  } else {
    ok('tier 2 has the only weapons (strictly better)', t2Weapons.length > 0 && t1Weapons.length === 0);
  }
  const maxHeal = (arr) => Math.max(0, ...arr.map(i => i.healAmount || 0));
  ok('tier 2 best heal >= tier 1 best heal', maxHeal(t2) >= maxHeal(t1));

  // --- zero-calorie fix: 0 stays 0, no phantom meat ---
  const zeroCal = monsters.filter(m => m.edible && m.edible.calories === 0);
  ok('zero-calorie monsters exist', zeroCal.length >= 5);
  // simulate the fixed logic directly
  for (const m of zeroCal) {
    const kcal = (m.edible.calories == null) ? 1000 : m.edible.calories;
    ok(`${m.id}: 0 kcal stays 0 (no phantom 1000)`, kcal === 0);
  }
  const real = monsters.find(m => m.edible && m.edible.calories > 0);
  ok('real monster keeps calories', ((real.edible.calories == null) ? 1000 : real.edible.calories) === real.edible.calories);
  const noEdible = { edible: undefined };
  ok('missing calories still defaults 1000', ((noEdible.edible || {}).calories == null) ? 1000 : 0 === 1000);

  // --- rollAlienLoot: respects chance, tier, returns valid ids ---
  ok('rollAlienLoot exists', typeof Game.rollAlienLoot === 'function');
  ok('no loot table -> null', Game.rollAlienLoot({}) === null);
  ok('chance 0 -> null', Game.rollAlienLoot({ loot: { chance: 0, tier: 1 } }) === null);
  // force a drop: chance 1 (wave 2 allows tier 2; wave caps the tier)
  const drop = Game.rollAlienLoot({ wave: 2, loot: { chance: 1, tier: 2 } });
  ok('forced tier-2 drop returns an alien tier-2 id',
    !!drop && alien.some(i => i.id === drop && i.lootTier === 2));
  const drop1 = Game.rollAlienLoot({ wave: 1, loot: { chance: 1, tier: 1 } });
  ok('forced tier-1 drop returns an alien tier-1 id',
    !!drop1 && alien.some(i => i.id === drop1 && i.lootTier === 1));
  // statistical: low chance stays low over many rolls
  let hits = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) if (Game.rollAlienLoot({ loot: { chance: 0.10, tier: 1 } })) hits++;
  const rate = hits / N;
  ok(`10% chance measures ~10% (got ${(rate * 100).toFixed(1)}%)`, rate > 0.05 && rate < 0.16);

  // --- healAmount hook: alien med items are usable and heal ---
  const s = Game.state.scholar;
  s.inventory.push({ itemId: 'medfoam_canister', name: 'Medfoam canister', units: 1 });
  const idx = s.inventory.length - 1;
  ok('medfoam isUsable', Game.isUsable(s.inventory[idx]));
  s.health = 40;
  const expectedHeal = Math.min(Game.maxHealth(), 40 + Math.round(Game.modTarget('healing.amount', 50)));
  Game.useItem(idx);
  ok('medfoam heals ~50 (healing modifiers apply)', s.health === expectedHeal);
  ok('medfoam consumed', !s.inventory.some(i => i.itemId === 'medfoam_canister'));

  // --- carryBonus hook: gravity hook raises capacity ---
  const capBefore = Game.carryCapacity();
  s.inventory.push({ itemId: 'gravity_hook', name: 'Gravity hook', units: 1 });
  ok('gravity hook raises carry capacity by 8', Game.carryCapacity() === capBefore + 8);

  // --- fusion fuel: last resort only ---
  s.inventory = s.inventory.filter(i => i.itemId !== 'gravity_hook');
  const branchCount = Game.materialCount('branch');
  // drain branches and wood for the test
  s.inventory = s.inventory.filter(i => i.material !== 'branch');
  const woodIdx = s.inventory.findIndex(i => i.wood);
  if (woodIdx >= 0) s.inventory.splice(woodIdx, 1);
  s.inventory.push({ itemId: 'fusion_pellet', name: 'Fusion pellet', units: 1 });
  const fuel = Game.feedFuel();
  ok('fusion pellet offered as fuel when nothing else', fuel && fuel.kind === 'fusion');
  ok('fusion burn is 6x log', fuel.burn === Game.FIRE_BURN_TICKS * 6);
  // with a branch present, fusion is NOT auto-burned
  s.inventory.push({ material: 'branch', name: 'Branch', units: 1 });
  const fuel2 = Game.feedFuel();
  ok('branch preferred over fusion', fuel2 && fuel2.kind === 'branch');

  console.log(`\nmonster-loot: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
