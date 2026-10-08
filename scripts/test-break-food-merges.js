// BREAK-IT: name-only stack merging launders kcalEach (and spoilDay, safe,
// diseaseRisk) across pantry/cache boundaries.
// BEFORE fix: take low-quality pantry units into a high-quality pack stack ->
// units merge, pack's higher kcalEach wins -> calories created from nothing.
// AFTER fix: non-fungible stacks stay separate; only truly identical stacks merge.
'use strict';
const h = require('./break-monsters-harness.js');

function food(name, kcalEach, units, extra) {
  return Object.assign({ name, kcalEach, units, spoilDay: 30, safe: true, kg: 0.2,
    unit: 'portion', plantId: 'meat_deer', foodKind: 'meat', foodState: 'smoked',
    edible: true }, extra || {});
}

async function main() {
  const G = await h.freshGame(777);
  const s = G.state.scholar, v = G.state.village;
  G.say = () => {};
  // put player at haven so pantry access is 'inside'
  G.location = 'haven';

  let fails = 0;
  const check = (name, cond, detail) => {
    console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
    if (!cond) fails++;
  };

  // --- ATTACK 1: takeFromPantryBulk launders kcalEach upward ---
  s.inventory = [food('Deer (smoked)', 100, 1)];
  v.pantry = [food('Deer (smoked)', 60, 5)];
  G.takeFromPantryBulk({ 0: 5 });
  const invStacks = s.inventory.filter(i => i.name === 'Deer (smoked)');
  const totalKcal = invStacks.reduce((t, i) => t + i.kcalEach * i.units, 0);
  const totalUnits = invStacks.reduce((t, i) => t + i.units, 0);
  check('A1 take: no calorie creation', totalKcal === 400 && totalUnits === 6,
    `units=${totalUnits} kcal=${totalKcal} (laundered would be 600)`);

  // --- ATTACK 2: takeFromPantry (single) same class ---
  s.inventory = [food('Deer (smoked)', 100, 1)];
  v.pantry = [food('Deer (smoked)', 60, 2)];
  G.takeFromPantry(0);
  const inv2 = s.inventory.filter(i => i.name === 'Deer (smoked)');
  const k2 = inv2.reduce((t, i) => t + i.kcalEach * i.units, 0);
  check('A2 single-take: no laundering', k2 === 160, `kcal=${k2} (laundered would be 200)`);

  // --- ATTACK 3: donateToPantry destroys value (mirror) ---
  s.inventory = [food('Deer (smoked)', 100, 3)];
  v.pantry = [food('Deer (smoked)', 60, 2)];
  G.donateToPantry(0);
  const pan3 = v.pantry.filter(i => i.name === 'Deer (smoked)');
  const k3 = pan3.reduce((t, i) => t + i.kcalEach * i.units, 0);
  check('A3 donate: pantry keeps true value', k3 === 420, `pantryKcal=${k3} (merged-wrong would be 300)`);

  // --- ATTACK 4: identical stacks still merge (no UX regression) ---
  s.inventory = [food('Deer (smoked)', 100, 1)];
  v.pantry = [food('Deer (smoked)', 100, 5)];
  G.takeFromPantryBulk({ 0: 5 });
  const inv4 = s.inventory.filter(i => i.name === 'Deer (smoked)');
  check('A4 fungible stacks merge', inv4.length === 1 && inv4[0].units === 6,
    `stacks=${inv4.length} units=${inv4[0] && inv4[0].units}`);

  // --- ATTACK 5: spoilDay mismatch doesn't contaminate clocks ---
  s.inventory = [food('Deer (smoked)', 100, 1, { spoilDay: 50 })];
  v.pantry = [food('Deer (smoked)', 100, 2, { spoilDay: 32 })];
  G.takeFromPantryBulk({ 0: 2 });
  const inv5 = s.inventory.filter(i => i.name === 'Deer (smoked)');
  const clocks = inv5.map(i => `${i.units}@d${i.spoilDay}`).sort().join(',');
  check('A5 spoilDay mismatch stays separate', inv5.length === 2, `stacks: ${clocks}`);

  // --- ATTACK 6: diseaseRisk laundering (risky pantry -> safe pack stack) ---
  s.inventory = [food('Venison (cleaned)', 80, 1, { diseaseRisk: null, safe: true })];
  v.pantry = [food('Venison (cleaned)', 80, 2, { diseaseRisk: { p: 0.35, dmg: 12, note: 'raw meat' }, safe: false })];
  G.takeFromPantryBulk({ 0: 2 });
  const inv6 = s.inventory.filter(i => i.name === 'Venison (cleaned)');
  const anyRisky = inv6.some(i => i.diseaseRisk);
  check('A6 risk flags survive take', anyRisky && inv6.length === 2,
    `stacks=${inv6.length} risky=${anyRisky} (laundered: risk silently dropped)`);

  // --- ATTACK 7: cache dig-up merge ---
  s.inventory = [food('Deer (smoked)', 100, 1)];
  const caches = G.playerCaches();
  caches.push({ id: 'ctest1', node: { x: G.map.px, y: G.map.py }, desc: 'test',
    items: [food('Deer (smoked)', 60, 3)], found: false, day: s.day });
  G.digUpCache('ctest1');
  const inv7 = s.inventory.filter(i => i.name === 'Deer (smoked)');
  const k7 = inv7.reduce((t, i) => t + i.kcalEach * i.units, 0);
  check('A7 cache dig-up: no laundering', k7 === 280, `kcal=${k7} (laundered would be 400)`);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
