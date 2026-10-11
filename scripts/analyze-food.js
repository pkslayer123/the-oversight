#!/usr/bin/env node
// analyze-food.js — merges measure-survival-food shards and reports
// the Part A1 baseline (or post-tune) numbers.
'use strict';
const fs = require('fs');

const files = process.argv.slice(2);
let rows = [];
for (const f of files) rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8')));
const n = rows.length;

function quantile(arr, q) {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null;
}

// daily pantry trajectory: median pantry/wood by day
const byDay = {};
for (const r of rows) {
  for (const d of r.daily) {
    const day = d.day;
    byDay[day] = byDay[day] || { pantry: [], wood: [], pop: [], preserved: [] };
    byDay[day].pantry.push(d.pantry);
    byDay[day].wood.push(d.wood);
    byDay[day].pop.push(d.pop);
    byDay[day].preserved.push(d.preserved);
  }
}
console.log('== daily trajectory (median across runs)');
console.log('day  pantry   wood  pop');
const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
for (const d of days) {
  if (d % 5 !== 0) continue;
  const b = byDay[d];
  console.log(String(d).padStart(3), String(Math.round(quantile(b.pantry, 0.5))).padStart(7),
    String(Math.round(quantile(b.wood, 0.5))).padStart(5),
    String(Math.round(quantile(b.pop, 0.5))).padStart(4));
}

// tier reach
const t1 = rows.filter(r => r.tierDay[1] != null);
const t2 = rows.filter(r => r.tierDay[2] != null);
const t3 = rows.filter(r => r.tierDay[3] != null);
console.log(`\n== tier reach: t1 ${t1.length}/${n} t2 ${t2.length}/${n} t3 ${t3.length}/${n}`);
if (t1.length) console.log('   t1 days:', t1.map(r => r.tierDay[1]).sort((a, b) => a - b).join(','));

// tier-1 blocker analysis: on each run's best day, how close to each bar?
// bar: food 8000, wood 200. Find per-run max of food and wood.
let blockWood = 0, blockFood = 0;
for (const r of rows) {
  const maxFood = Math.max(...r.daily.map(d => d.pantry));
  const maxWood = Math.max(...r.daily.map(d => d.wood));
  if (maxFood >= 8000 && maxWood < 200) blockWood++;
  else if (maxWood >= 200 && maxFood < 8000) blockFood++;
  else if (maxFood < 8000 && maxWood < 200) { blockWood++; blockFood++; }
}
console.log(`   runs blocked by wood bar (never 200 wood): ${blockWood}/${n}, blocked by food bar (never 8000 kcal): ${blockFood}/${n}`);
const maxWoods = rows.map(r => Math.max(...r.daily.map(d => d.wood)));
const maxFoods = rows.map(r => Math.max(...r.daily.map(d => d.pantry)));
console.log(`   peak wood med ${Math.round(quantile(maxWoods, 0.5))} p90 ${Math.round(quantile(maxWoods, 0.9))} max ${Math.max(...maxWoods)}`);
console.log(`   peak food med ${Math.round(quantile(maxFoods, 0.5))} p90 ${Math.round(quantile(maxFoods, 0.9))} max ${Math.max(...maxFoods)}`);

// deaths
const causes = {};
let starve = 0, thirst = 0;
for (const r of rows) for (const d of r.deaths) {
  causes[d.cause] = (causes[d.cause] || 0) + 1;
  if (/starv|famine/i.test(d.cause || '')) starve++;
  if (/thirst/i.test(d.cause || '')) thirst++;
}
console.log('\n== deaths by cause:', JSON.stringify(causes), `starvation ${starve} thirst ${thirst}`);
const ds = rows.map(r => r.days).sort((a, b) => a - b);
console.log(`   survival: med ${ds[Math.floor(ds.length / 2)]} p25 ${quantile(ds, 0.25)} p75 ${quantile(ds, 0.75)} max ${ds[ds.length - 1]}`);
console.log('   endReasons:', JSON.stringify(rows.reduce((a, r) => { a[r.endReason] = (a[r.endReason] || 0) + 1; return a; }, {})));

// inflow composition
const tot = {};
for (const r of rows) for (const k of Object.keys(r.inflows)) tot[k] = (tot[k] || 0) + r.inflows[k];
console.log('\n== total pantry inflows by label:', Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round(v)}`).join(' '));
const perRunDay = Object.values(tot).reduce((a, b) => a + b, 0) / rows.reduce((a, r) => a + r.days, 0);
console.log('   per village-day:', Math.round(perRunDay), 'kcal/day');
const don = rows.reduce((a, r) => a + r.donated, 0) / rows.reduce((a, r) => a + r.days, 0);
console.log('   player donations per village-day:', Math.round(don), 'kcal/day');

// policy activity
const pc = rows.map(r => r.policyCtx);
const mean = (f) => Math.round(pc.reduce((a, c) => a + (c[f] || 0), 0) / pc.length);
console.log('\n== policy activity per run (mean): trips', mean('forageTrips'), 'donated', mean('donatedN'), 'cooked', mean('cooked'), 'sorted', mean('sorted'), 'sown', mean('sown'), 'traps', mean('trapsSet'), 'gardenStaffed', mean('gardenStaffed'), 'fishStaffed', mean('fishStaffed'));
