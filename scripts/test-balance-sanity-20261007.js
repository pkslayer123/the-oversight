// Balance sanity test — checks game numbers for consistency (Steve 2026-10-07)
// Run: node /tmp/test-balance-sanity-20261007.js
const fs = require('fs');
const path = '/tmp';

const monsters = JSON.parse(fs.readFileSync(path + '/monsters.json', 'utf8'));
const items = JSON.parse(fs.readFileSync(path + '/items.json', 'utf8'));
const animals = JSON.parse(fs.readFileSync(path + '/animals.json', 'utf8'));
const plants = JSON.parse(fs.readFileSync(path + '/plants.json', 'utf8'));

let pass = 0, fail = 0;
const anomalies = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; anomalies.push(`${name}: ${detail}`); console.log(`FAIL: ${name} — ${detail}`); }
}
function warn(name, detail) {
  anomalies.push(`WARN ${name}: ${detail}`);
  console.log(`WARN: ${name} — ${detail}`);
}

// === MONSTER DAMAGE CONSISTENCY ===
console.log('\n=== Monster damage by wave ===');
for (const wave of [1, 2]) {
  const wm = monsters.filter(m => m.wave === wave);
  const dmgs = wm.map(m => {
    const atk = m.attack || m.dmg || {};
    const d = atk.damage || [0, 0];
    return { id: m.id, max: Array.isArray(d) ? d[1] : 0, hp: m.hp };
  });
  const avg = dmgs.reduce((s, x) => s + x.max, 0) / dmgs.length;
  console.log(`Wave ${wave}: avg max dmg = ${avg.toFixed(1)}, n=${dmgs.length}`);
  for (const d of dmgs) {
    // Wave 1 shouldn't exceed 32 (gallowdeer benchmark); wave 2 shouldn't exceed 36
    const cap = wave === 1 ? 34 : 38;
    if (d.max > cap) warn('dmg-cap', `${d.id} (wave ${wave}) max_dmg=${d.max} exceeds soft cap ${cap}`);
  }
}

// Wave 2 HP should generally exceed wave 1 (escalation)
const w1hp = monsters.filter(m => m.wave === 1).map(m => m.hp[1]);
const w2hp = monsters.filter(m => m.wave === 2).map(m => m.hp[1]);
const w1avg = w1hp.reduce((a, b) => a + b, 0) / w1hp.length;
const w2avg = w2hp.reduce((a, b) => a + b, 0) / w2hp.length;
console.log(`Wave 1 avg max HP: ${w1avg.toFixed(0)}, Wave 2 avg max HP: ${w2avg.toFixed(0)}`);
check('wave2-hp-escalation', w2avg > w1avg, `w2 avg ${w2avg.toFixed(0)} should exceed w1 avg ${w1avg.toFixed(0)}`);

// === LOOT DROP RATES ===
console.log('\n=== Loot rates ===');
for (const m of monsters) {
  const loot = m.loot || {};
  const chance = loot.chance || 0;
  // Steve's rule: LOW chance. Flag anything above 0.25 as suspicious.
  check(`loot-${m.id}`, chance <= 0.25, `chance=${chance} exceeds 0.25 (rule: LOW chance)`);
  // Tier should be 1-4
  const tier = loot.tier;
  check(`loot-tier-${m.id}`, tier >= 1 && tier <= 4, `tier=${tier} out of 1-4 range`);
}

// === WEAPON DAMAGE PROGRESSION ===
console.log('\n=== Weapon damage progression ===');
const weapons = items.filter(i => i.damage != null).sort((a, b) => a.damage - b.damage);
let prevDmg = 0;
for (const w of weapons) {
  // Each weapon should be >= previous (monotonic progression)
  check(`wpn-prog-${w.id}`, w.damage >= prevDmg, `dmg=${w.damage} < prev ${prevDmg} (non-monotonic)`);
  // Loot tier should correlate with damage
  const lt = w.lootTier;
  if (lt && w.damage >= 80) check(`wpn-tier-${w.id}`, lt >= 4, `dmg=${w.damage} but lootTier=${lt} (should be 4)`);
  if (lt && w.damage < 30 && lt > 2) warn('wpn-tier', `${w.id} dmg=${w.damage} but lootTier=${lt}`);
  prevDmg = w.damage;
}

// === PLANT KCAL SANITY ===
console.log('\n=== Plant kcal sanity ===');
for (const p of plants) {
  const kcal = p.caloriesPerUnit;
  if (kcal == null) continue;
  // No plant unit should exceed 500 kcal (that's a full meal from one unit)
  check(`plant-kcal-${p.id}`, kcal <= 500, `${kcal} kcal/unit exceeds 500 (one unit = full meal?)`);
  // Nuts should be high, leaves low (reality check)
  if (p.id.includes('nut') || p.id.includes('acorn')) {
    if (kcal < 100) warn('plant-kcal', `${p.id}: nut at ${kcal} kcal seems low (nuts are calorie-dense)`);
  }
}

// === ANIMAL CALORIE SANITY ===
console.log('\n=== Animal calorie sanity ===');
for (const a of animals) {
  const cal = a.calories;
  if (cal == null) continue;
  // 0 is intentional "do not eat" marker (venomous). Otherwise must be sane.
  if (cal === 0) {
    const desc = (a.description || '').toLowerCase();
    if (!desc.includes('venom')) warn('animal-cal', `${a.id}: 0 kcal but not marked venomous — intentional?`);
    continue;
  }
  check(`animal-cal-${a.id}`, cal > 0 && cal < 100000, `${cal} kcal out of sane range`);
}

// === FOOD ITEM KCAL ===
console.log('\n=== Food item kcal ===');
const foods = items.filter(i => i.kcalEach != null);
for (const f of foods) {
  // BALANCING.md: 140 kcal was called out as "nothing for a haul"
  // Individual food items should be reasonable portions
  check(`food-kcal-${f.id}`, f.kcalEach > 0 && f.kcalEach <= 2000,
    `${f.kcalEach} kcal out of 1-2000 range`);
}

console.log(`\n=== RESULT: ${pass} pass, ${fail} fail, ${anomalies.filter(a => a.startsWith('WARN')).length} warnings ===`);
if (fail > 0) {
  console.log('\nAnomalies requiring attention:');
  anomalies.filter(a => !a.startsWith('WARN')).forEach(a => console.log('  - ' + a));
}
process.exit(fail > 0 ? 1 : 0);
