#!/usr/bin/env node
// sweep.js — N seeds × M policies world-run sweeps (Steve 2026-10-09).
// Usage:
//   SEEDS="20261009,7,424242,99" POLICIES="zero,mvc,competent" DAYS=60 \
//     OUT=/tmp/sweep.json node scripts/sweep.js
// OUT_TELEMETRY=1: keep the full per-run tele() stream in the JSON
//   (required input for scripts/coverage.js). Without it, runs carry
//   only the analysis summary.
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
  // OUT_TELEMETRY=1: keep the full per-run tele() stream in the JSON.
  // Without it, runs carry only the analysis summary (streams are large).
  const keepTelemetry = process.env.OUT_TELEMETRY === '1';

  const runs = [];
  for (const pid of policyIds) {
    const policy = POLICIES[pid];
    if (!policy) { console.error(`unknown policy: ${pid}`); process.exit(1); }
    for (const seed of seeds) {
      const { Game, manifest } = await loadGame({ seed, mode: pid, fullTelemetry: true });
      await setupGame(Game);
      const result = await runDays(Game, policy, { days, manifest });
      const analysis = analyzeTelemetry(result.telemetry);
      runs.push({ policy: pid, seed, days: result.days, gameDays: result.gameDays,
        endReason: result.endReason,
        ms: result.ms, manifest, analysis,
        report: formatReport(analysis, { meta: { policy: pid, seed, days: result.days, endReason: result.endReason }, samples: result.samples }),
        samples: result.samples,
        learnedPlants: result.learnedPlants, learnedSkills: result.learnedSkills,
        telemetry: keepTelemetry ? result.telemetry : undefined });
      console.log(`done: ${pid} seed=${seed} days=${result.days} end=${result.endReason} (${result.ms}ms)`);
    }
  }

  // ---- aggregate per policy ----
  const CURVE_T = [30, 60, 90, 180, 365];
  const agg = {};
  const survival = {};
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
    // SURVIVAL CURVE (first-class artifact, Steve 2026-10-09): P(survive>=t)
    // on GAME days (the sim loop counter lies when the clock stalls).
    // t beyond the sweep's day cap is null (unmeasurable, not zero).
    const gd = pr.map(r => r.gameDays || 0);
    const P = {};
    for (const t of CURVE_T) {
      P[t] = t <= days ? +(gd.filter(g => g >= t).length / pr.length).toFixed(3) : null;
    }
    const gsorted = gd.slice().sort((a, b) => a - b);
    const gmed = gsorted.length % 2 ? gsorted[(gsorted.length - 1) / 2]
      : (gsorted[gsorted.length / 2 - 1] + gsorted[gsorted.length / 2]) / 2;
    survival[pid] = {
      seeds: pr.length, commit: (runs[0] && runs[0].manifest && runs[0].manifest.commit) || '?',
      days, P, medianGameDays: gmed, ends,
    };
  }

  const summary = { manifest: runs.length ? runs[0].manifest : null, days, aggregate: agg, survival };
  console.log('\n=== SWEEP SUMMARY ===');
  for (const pid of policyIds) {
    const a = agg[pid];
    console.log(`${pid}: median=${a.medianDays}d range=[${a.minDays},${a.maxDays}] ends=${JSON.stringify(a.endReasons)}`);
    console.log(`  deaths: ${JSON.stringify(a.deathCauses)}`);
    console.log(`  avg/run: diseases=${a.avgDiseases} contests=${a.avgContests} combats=${a.avgCombats} kcalForaged=${a.avgKcalForaged}`);
    const s = survival[pid];
    const curve = Object.entries(s.P).map(([t, p]) => `d${t}=${p == null ? 'n/a' : p}`).join(' ');
    console.log(`  survival curve (game days): ${curve} | median game-days=${s.medianGameDays}`);
  }
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify({ summary, runs }, null, 1));
    console.log(`\nwrote ${outFile}`);
  }
})();
