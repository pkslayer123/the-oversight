#!/usr/bin/env node
// sweep-attrition.js — death-cause distribution by day (survival-attrition, 2026-10-10).
// 40+ seeds x competent policy x 200-day cap. Wraps registerDeath (authoritative
// death log; telemetry ring cap truncates), records {day, kind, who, cause, wave,
// scholar} per death. Shard-friendly: SEEDS="1-10" OUT=<path>.
//
// Usage: SEEDS="1-10" DAYS=200 OUT=scripts/sweep-attrition-s1.json node scripts/sweep-attrition.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-40').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

function wrapDeaths(Game) {
  const deaths = [];
  try {
    const orig = Game.registerDeath.bind(Game);
    Game.registerDeath = function (opts) {
      opts = opts || {};
      let day = 0; try { day = (Game.state.scholar || {}).day || 0; } catch (e) {}
      deaths.push({
        day,
        kind: opts.kind || '?',
        who: opts.villagerId || opts.monsterId || opts.name || '?',
        cause: opts.cause || '?',
        wave: (() => { try {
          const md = (Game.data.monsters || []).find(d => d.id === opts.monsterId);
          return md ? md.wave : null; } catch (e) { return null; } })(),
        scholar: opts.villagerId === Game.villagerId,
      });
      return orig(opts);
    };
  } catch (e) {}
  return deaths;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-40');
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'sweep-attrition-s1.json');
  const rows = [];
  const t0 = Date.now();
  let runN = 0;
  for (const seed of seeds) {
    const { Game, loadFails } = await loadGame({ seed, mode: 'competent' });
    if (loadFails && loadFails.length) console.log(`seed ${seed}: LOAD FAILS: ${loadFails.join('; ')}`);
    await setupGame(Game);
    const deaths = wrapDeaths(Game);
    const result = await runDays(Game, Object.assign({}, competent), { days });
    const pop = ((Game.state.village || {}).roster || []).length;
    rows.push({
      seed, endReason: result.endReason, days: result.days, ms: result.ms,
      pop, notes: result.notes, deaths,
    });
    runN++;
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[${runN}/${seeds.length} ${el}s] seed ${seed}: ${result.endReason} d${result.days} pop=${pop} deaths=${deaths.length}`);
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const ds = rows.map(r => r.days).sort((a, b) => a - b);
  const med = ds[Math.floor(ds.length / 2)];
  console.log(`== attrition sweep: ${rows.length} runs, median days ${med}, wrote ${OUT}`);
})();
