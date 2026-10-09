#!/usr/bin/env node
// sweep.js — N seeds × M policies world-run sweeps (Steve 2026-10-09).
// Usage:
//   SEEDS="20261009,7,424242,99" POLICIES="zero,mvc,competent" DAYS=60 \
//     OUT=/tmp/sweep.json node scripts/sweep.js
// Per run: survival days, end reason, death causes, pantry/knowledge/trust
// trajectories, contest/disease/combat summaries (from the telemetry stream).
// Aggregate: survival curve + median days per policy, cause-of-death breakdown.
// Seeds run SEQUENTIALLY in one process (never concurrent harnesses).
'use strict';
const fs = require('fs');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const idle = require('./policies/idle');
const { competent } = require('./policies/competent');
const { analyzeTelemetry, formatReport } = require('./analyze-run');

const POLICIES = { zero: idle.zero, mvc: idle.mvc, leader: idle.leader, competent };

function parseList(env, def) {
  return (process.env[env] || def).split(',').map(s => s.trim()).filter(Boolean);
}

(async () => {
  const seeds = parseList('SEEDS', '20261009,7,424242,99').map(Number);
  const policyIds = parseList('POLICIES', 'zero,mvc,competent');
  const days = parseInt(process.env.DAYS || '365', 10);
  const outFile = process.env.OUT || null;

  const runs = [];
  for (const pid of policyIds) {
    const policy = POLICIES[pid];
    if (!policy) { console.error(`unknown policy: ${pid}`); process.exit(1); }
    for (const seed of seeds) {
      const { Game, manifest } = await loadGame({ seed, mode: pid, fullTelemetry: true });
      await setupGame(Game);
      const result = await runDays(Game, policy, { days, manifest });
      const analysis = analyzeTelemetry(result.telemetry);
      runs.push({ policy: pid, seed, days: result.days, endReason: result.endReason,
        ms: result.ms, manifest, analysis,
        report: formatReport(analysis, { meta: { policy: pid, seed, days: result.days, endReason: result.endReason }, samples: result.samples }),
        samples: result.samples });
      console.log(`done: ${pid} seed=${seed} days=${result.days} end=${result.endReason} (${result.ms}ms)`);
    }
  }

  // ---- aggregate per policy ----
  const agg = {};
  for (const pid of policyIds) {
    const pr = runs.filter(r => r.policy === pid);
    const ds = pr.map(r => r.days).sort((a, b) => a - b);
    const median = ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2;
    const causes = {};
    const ends = {};
    let diseases = 0, contests = 0, combats = 0, kcalIn = 0;
    for (const r of pr) {
      ends[r.endReason] = (ends[r.endReason] || 0) + 1;
      for (const [k, v] of Object.entries(r.analysis.deathCauses)) causes[k] = (causes[k] || 0) + v;
      diseases += r.analysis.diseases;
      contests += r.analysis.contestsFired;
      combats += r.analysis.combats;
      kcalIn += r.analysis.kcalIn.forage + r.analysis.kcalIn.scavenge;
    }
    agg[pid] = { seeds: pr.length, medianDays: median, minDays: ds[0], maxDays: ds[ds.length - 1],
      endReasons: ends, deathCauses: causes,
      avgDiseases: +(diseases / pr.length).toFixed(1), avgContests: +(contests / pr.length).toFixed(1),
      avgCombats: +(combats / pr.length).toFixed(1), avgKcalForaged: Math.round(kcalIn / pr.length) };
  }

  const summary = { manifest: runs.length ? runs[0].manifest : null, days, aggregate: agg };
  console.log('\n=== SWEEP SUMMARY ===');
  for (const pid of policyIds) {
    const a = agg[pid];
    console.log(`${pid}: median=${a.medianDays}d range=[${a.minDays},${a.maxDays}] ends=${JSON.stringify(a.endReasons)}`);
    console.log(`  deaths: ${JSON.stringify(a.deathCauses)}`);
    console.log(`  avg/run: diseases=${a.avgDiseases} contests=${a.avgContests} combats=${a.avgCombats} kcalForaged=${a.avgKcalForaged}`);
  }
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify({ summary, runs }, null, 1));
    console.log(`\nwrote ${outFile}`);
  }
})();
