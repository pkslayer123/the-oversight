#!/usr/bin/env node
// compare-curves.js — before/after survival-curve delta (Steve 2026-10-09).
// Every balance change gets a before/after curve.
// Usage: node scripts/compare-curves.js <before-sweep.json> <after-sweep.json>
// Reads summary.survival[policy] from each: P(survive>=t), median game-days,
// ends. Warns when commits, seed counts, or day caps differ.
'use strict';
const fs = require('fs');

function load(f) {
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!s.summary || !s.summary.survival) {
    console.error(`${f}: no summary.survival — was it run by the current sweep.js?`);
    process.exit(1);
  }
  return s.summary;
}

function main() {
  const [beforeF, afterF] = process.argv.slice(2);
  if (!beforeF || !afterF) { console.error('usage: node scripts/compare-curves.js <before.json> <after.json>'); process.exit(1); }
  const b = load(beforeF), a = load(afterF);
  const policies = [...new Set([...Object.keys(b.survival), ...Object.keys(a.survival)])];

  const L = [];
  L.push(`SURVIVAL CURVE DELTA — before: ${beforeF} → after: ${afterF}`);
  for (const pid of policies) {
    const bs = b.survival[pid], as = a.survival[pid];
    if (!bs || !as) { L.push(`\n${pid}: present in only one sweep — skipping`); continue; }
    L.push(`\n[${pid}]`);
    if (bs.commit !== as.commit) L.push(`  commits: ${bs.commit.slice(0, 8)} → ${as.commit.slice(0, 8)}`);
    else L.push(`  commit: ${String(bs.commit).slice(0, 8)} (same)`);
    if (bs.seeds !== as.seeds) L.push(`  WARNING: seed counts differ (${bs.seeds} vs ${as.seeds})`);
    if (bs.days !== as.days) L.push(`  WARNING: day caps differ (${bs.days} vs ${as.days})`);
    const ts = [...new Set([...Object.keys(bs.P), ...Object.keys(as.P)])].sort((x, y) => x - y);
    for (const t of ts) {
      const bv = bs.P[t], av = as.P[t];
      if (bv == null || av == null) { L.push(`  d${t}: n/a (beyond day cap)`); continue; }
      const d = +(av - bv).toFixed(3);
      const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '=';
      L.push(`  d${t}: ${bv} → ${av}  (${d >= 0 ? '+' : ''}${d}) ${arrow}`);
    }
    const md = +(as.medianGameDays - bs.medianGameDays).toFixed(1);
    L.push(`  median game-days: ${bs.medianGameDays} → ${as.medianGameDays} (${md >= 0 ? '+' : ''}${md})`);
    L.push(`  ends: ${JSON.stringify(bs.ends)} → ${JSON.stringify(as.ends)}`);
  }
  console.log(L.join('\n'));
}

if (require.main === module) main();
module.exports = {};
