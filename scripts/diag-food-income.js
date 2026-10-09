#!/usr/bin/env node
// diag-food-income.js — decompose village kcal income by source, days 1-15.
// Hooks Game.stockPantry (the single inflow choke point: every kcal arrives
// with a label) and samples daily pantry/need/burn. BEFORE-tuning baseline.
'use strict';
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');

const SEEDS = (process.env.SEEDS || '20261009,7,424242,99,11,23,456,789,1010,31337').split(',').map(Number);
const DAYS = parseInt(process.env.DAYS || '30', 10);

(async () => {
  const perSeed = [];
  for (const seed of SEEDS) {
    const { Game } = await loadGame({ seed, mode: 'competent' });
    await setupGame(Game);
    const income = []; // {day, label, kcal}
    const daily = [];  // {day, pantry, mouths, need, burn}
    const origStock = Game.stockPantry.bind(Game);
    Game.stockPantry = function (kcal, name, opts) {
      try {
        income.push({ day: Game.state.scholar.day, label: String(name || '?'), kcal: Math.round(kcal || 0) });
      } catch (e) {}
      return origStock(kcal, name, opts);
    };
    // wrap villageEats to capture burn
    const origEats = Game.villageEats.bind(Game);
    Game.villageEats = function () {
      const r = origEats();
      try {
        const v = Game.state.village;
        const mouths = (v.roster || []).filter(id => { try { const p = Game.getPerson(id); return p && !p.dead; } catch (e) { return true; } }).length;
        const pantry = (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
        const burn = (v.burnHistory || []).slice(-1)[0] || 0;
        daily.push({ day: Game.state.scholar.day, pantry: Math.round(pantry), mouths, need: mouths * 2000, burn: Math.round(burn) });
      } catch (e) {}
      return r;
    };
    const result = await runDays(Game, competent, { days: DAYS });
    const causes = {};
    try {
      const tel = result.telemetry || [];
      for (const ev of tel) {
        if (ev && (ev.ev === 'death' || ev.type === 'death')) {
          const c = (ev.cause || ev.data && ev.data.cause || 'unknown');
          causes[c] = (causes[c] || 0) + 1;
        }
      }
    } catch (e) {}
    perSeed.push({ seed, days: result.days, gameDays: result.gameDays, endReason: result.endReason, income, daily, causes });
    console.log(`seed=${seed} days=${result.days} end=${result.endReason}`);
  }

  // ---- aggregate income by label per day ----
  const byDayLabel = {};
  for (const s of perSeed) {
    for (const e of s.income) {
      if (e.day > 15) continue;
      const k = e.day + '|' + e.label;
      byDayLabel[k] = (byDayLabel[k] || 0) + e.kcal;
    }
  }
  const n = perSeed.length;
  console.log('\n=== MEAN DAILY INCOME BY SOURCE, days 1-15 (kcal/day across ' + n + ' seeds) ===');
  const labels = [...new Set(Object.values(byDayLabel).length ? perSeed.flatMap(s => s.income.map(e => e.label)) : [])];
  const header = 'day      | ' + labels.map(l => l.slice(0, 14).padEnd(14)).join(' | ') + ' | TOTAL  | need';
  console.log(header);
  for (let d = 1; d <= 15; d++) {
    let tot = 0;
    const cells = labels.map(l => {
      const v = Math.round((byDayLabel[d + '|' + l] || 0) / n);
      tot += v;
      return String(v).padEnd(14);
    });
    // mean need
    let needSum = 0, needN = 0;
    for (const s of perSeed) { const dd = s.daily.find(x => x.day === d); if (dd) { needSum += dd.need; needN++; } }
    const need = needN ? Math.round(needSum / needN) : 0;
    console.log(('day ' + String(d).padStart(2)).padEnd(9) + '| ' + cells.join(' | ') + ' | ' + String(tot).padEnd(6) + ' | ' + need);
  }

  // ---- pantry trajectory ----
  console.log('\n=== MEAN PANTRY kcal by day ===');
  for (let d = 1; d <= Math.min(30, DAYS); d++) {
    let sum = 0, cnt = 0;
    for (const s of perSeed) { const dd = s.daily.find(x => x.day === d); if (dd) { sum += dd.pantry; cnt++; } }
    if (cnt) console.log('day ' + String(d).padStart(2) + ': ' + Math.round(sum / cnt) + ' kcal (n=' + cnt + ')');
  }

  // ---- survival ----
  const ds = perSeed.map(s => s.days).sort((a, b) => a - b);
  const median = ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2;
  const p20 = perSeed.filter(s => s.days >= 20).length / n;
  console.log('\n=== SURVIVAL === median=' + median + ' P(>=20)=' + p20.toFixed(2));
  const allCauses = {};
  for (const s of perSeed) for (const [k, v] of Object.entries(s.causes)) allCauses[k] = (allCauses[k] || 0) + v;
  console.log('death causes:', JSON.stringify(allCauses));
  console.log('endReasons:', JSON.stringify(perSeed.reduce((a, s) => { a[s.endReason] = (a[s.endReason] || 0) + 1; return a; }, {})));

  fs.writeFileSync(process.env.OUT || '/tmp/food-income-baseline.json', JSON.stringify({ perSeed: perSeed.map(s => ({ seed: s.seed, days: s.days, endReason: s.endReason, causes: s.causes })), byDayLabel }, null, 1));
  console.log('\nwrote', process.env.OUT || '/tmp/food-income-baseline.json');
})();
