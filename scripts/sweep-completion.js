#!/usr/bin/env node
// sweep-completion.js — completion-path measurement (Steve 2026-10-09).
// "A ton of cheap long-horizon sims from multiple angles — where do runs
// land when shooting for game completion?"
//
// Measurement only: no game balance changes. Wraps sim-harness (shared
// infra untouched) and records, per run:
//   - endReason, days survived
//   - max arc reached + first day per arc (1..4)
//   - final codex breadth, integration stage, sentimentTaught, feastSurgeUsed
//   - tableWaiting / won bools
//   - contests seen (telemetry), max wave unlocked
//
// Usage:
//   SEEDS="1,2,3,..." POLICIES="competent,mvc,leader" DAYS=200 \
//     OUT=/tmp/completion.json node scripts/sweep-completion.js
'use strict';
const fs = require('fs');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const idle = require('./policies/idle');
const { competent } = require('./policies/competent');

const POLICIES = { zero: idle.zero, mvc: idle.mvc, leader: idle.leader, competent };

function parseList(env, def) {
  return (process.env[env] || def).split(',').map(s => s.trim()).filter(Boolean);
}

function arcSnapshot(Game) {
  // Everything behind try/catch: a hostile read must never kill a run.
  const out = { arc: 1, breadth: 0, stage: 0, sentiment: false, feast: false, table: false, won: false, day: 0 };
  try {
    const pg = Game.progState();
    out.arc = pg.arc || 1;
    out.sentiment = !!pg.sentimentTaught;
    out.table = !!pg.tableWaiting;
    const s = Game.state.scholar || {};
    out.feast = !!(s.prog && s.prog.feastSurgeUsed);
    out.day = s.day || 0;
  } catch (e) {}
  try { out.breadth = Game.codexBreadth(); } catch (e) {}
  try { out.stage = Game.integrationStage(); } catch (e) {}
  try { out.won = !!Game.won; } catch (e) {}
  return out;
}

(async () => {
  const seeds = parseList('SEEDS', '20261009,7,424242,99').map(Number);
  const policyIds = parseList('POLICIES', 'competent,mvc,leader');
  const days = parseInt(process.env.DAYS || '200', 10);
  const outFile = process.env.OUT || null;

  const runs = [];
  for (const pid of policyIds) {
    const base = POLICIES[pid];
    if (!base) { console.error(`unknown policy: ${pid}`); process.exit(1); }
    for (const seed of seeds) {
      const { Game, manifest } = await loadGame({ seed, mode: pid, fullTelemetry: false });
      await setupGame(Game);
      // Wrap the policy's daily hook to record arc progression per day.
      // Shallow copy: never mutate the shared policy object.
      const policy = Object.assign({}, base);
      const arcDay = {};   // arc -> first game-day reached
      const arcCurve = []; // [day, arc] every 10 days
      let lastArc = 1;
      const origDaily = base.daily;
      policy.daily = (G, ctx) => {
        try {
          const snap = arcSnapshot(G);
          if (!(snap.arc in arcDay)) arcDay[snap.arc] = snap.day;
          if (snap.arc > lastArc) lastArc = snap.arc;
          if (snap.day % 10 === 0) arcCurve.push([snap.day, snap.arc]);
        } catch (e) {}
        if (origDaily) { try { return origDaily(G, ctx); } catch (e) {} }
      };
      const result = await runDays(Game, policy, { days, manifest, sampleEvery: 10 });
      const end = arcSnapshot(Game);
      // Contests seen: count contest-ish telemetry events.
      let contests = 0;
      try {
        for (const ev of (result.telemetry || [])) {
          const t = String(ev.type || '');
          if (/contest|show|challenge/i.test(t)) contests++;
        }
      } catch (e) {}
      const rec = {
        policy: pid, seed,
        days: result.days, endReason: result.endReason,
        maxArc: Math.max(lastArc, end.arc),
        arcDay, arcCurve,
        breadth: end.breadth, stage: end.stage,
        sentiment: end.sentiment, feastSurge: end.feast,
        tableWaiting: end.table, won: end.won,
        contests, maxWave: result.maxWaveUnlocked,
        ms: result.ms,
      };
      runs.push(rec);
      console.log(`done: ${pid} seed=${seed} days=${result.days} end=${result.endReason} maxArc=${rec.maxArc} breadth=${end.breadth} stage=${end.stage} sentiment=${end.sentiment} feast=${end.feast} won=${end.won} (${result.ms}ms)`);
    }
  }

  // ---- aggregate ----
  const agg = {};
  for (const pid of policyIds) {
    const pr = runs.filter(r => r.policy === pid);
    if (!pr.length) continue;
    const maxArcs = {};
    let deaths = 0, survived = 0, table = 0, won = 0;
    const gateMiss = { breadth: 0, stage: 0, sentiment: 0, feast: 0 }; // which Arc-IV gate unmet at death/end (among runs reaching arc 3)
    let arc3runs = 0;
    for (const r of pr) {
      maxArcs[r.maxArc] = (maxArcs[r.maxArc] || 0) + 1;
      if (r.endReason === 'survived') survived++; else deaths++;
      if (r.tableWaiting) table++;
      if (r.won) won++;
      if (r.maxArc >= 3 && !r.won) {
        arc3runs++;
        if (r.breadth < 25) gateMiss.breadth++;
        if (r.stage < 3) gateMiss.stage++;
        if (!r.sentiment) gateMiss.sentiment++;
        if (!r.feastSurge) gateMiss.feast++;
      }
    }
    const ds = pr.map(r => r.days).sort((a, b) => a - b);
    agg[pid] = {
      n: pr.length,
      medianDays: ds[Math.floor(ds.length / 2)],
      maxDays: ds[ds.length - 1],
      survived, deaths, tableWaiting: table, won,
      maxArcDist: maxArcs,
      arc3runs, gateMiss,
      meanBreadth: +(pr.reduce((a, r) => a + r.breadth, 0) / pr.length).toFixed(1),
      maxBreadth: Math.max.apply(null, pr.map(r => r.breadth)),
      meanContests: +(pr.reduce((a, r) => a + r.contests, 0) / pr.length).toFixed(1),
    };
  }
  console.log('\n=== AGGREGATE ===');
  console.log(JSON.stringify(agg, null, 2));
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify({ meta: { days, date: new Date().toISOString().slice(0, 10) }, agg, runs }, null, 1));
    console.log('wrote ' + outFile);
  }
})();
