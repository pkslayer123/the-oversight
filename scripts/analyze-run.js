#!/usr/bin/env node
// analyze-run.js — telemetry stream → world-run report (Steve 2026-10-09).
// Usage: node scripts/analyze-run.js <run.json>
//   run.json: { telemetry: [...], samples: {pop,pantry,knowledge,trust}, meta: {...} }
// Also required by sweep.js (analyzeTelemetry + formatReport) so the sweep's
// per-run summaries and this CLI share one implementation.
'use strict';
const fs = require('fs');

function byType(tele, type) {
  return tele.filter(e => e.type === type);
}

function countBy(list, key) {
  const c = {};
  for (const e of list) { const k = (e[key] == null ? '?' : String(e[key])); c[k] = (c[k] || 0) + 1; }
  return c;
}

// analyzeTelemetry(telemetry) -> summary of event-derived metrics.
function analyzeTelemetry(tele) {
  tele = tele || [];
  const deaths = byType(tele, 'death');
  const kcalIn = { forage: 0, scavenge: 0, other: 0 };
  for (const e of byType(tele, 'forage')) kcalIn.forage += Math.round(e.kcal || 0);
  for (const e of byType(tele, 'scavenge')) kcalIn.scavenge += Math.round(e.kcal || 0);
  let kcalEaten = 0;
  for (const e of byType(tele, 'eat')) kcalEaten += Math.round(e.ateKcal || 0);
  const combats = byType(tele, 'combat_start');
  const combatEnds = countBy(byType(tele, 'combat_end'), 'result');
  const contestsFired = byType(tele, 'contest_fired').length;
  const contestEnds = countBy(byType(tele, 'contest_end'), 'outcome');
  const shows = byType(tele, 'show_aired');
  const diseases = byType(tele, 'disease');
  const cures = byType(tele, 'cured');
  const trustEvents = byType(tele, 'trust');
  return {
    events: tele.length,
    deaths: deaths.length,
    deathCauses: countBy(deaths, 'cause'),
    deathKinds: countBy(deaths, 'kind'),
    monsterWaves: countBy(deaths.filter(d => d.kind === 'monster'), 'wave'),
    kcalIn, kcalEaten,
    combats: combats.length,
    combatEnds,
    contestsFired, contestEnds,
    showsAired: shows.length,
    showWhys: countBy(shows, 'why'),
    diseases: diseases.length,
    diseasePools: countBy(diseases, 'pool'),
    cures: cures.length,
    trustEvents: trustEvents.length,
    trustDeltaSum: trustEvents.reduce((t, e) => t + (e.delta || 0), 0),
  };
}

function compactCurve(pts, n) {
  if (!pts || !pts.length) return [];
  n = n || 8;
  const out = [];
  const step = Math.max(1, Math.floor(pts.length / n));
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// formatReport(analysis, run) -> human-readable multi-line string.
// run: { meta, samples } — samples optional.
function formatReport(a, run) {
  run = run || {};
  const meta = run.meta || {};
  const s = run.samples || {};
  const L = [];
  L.push(`run: policy=${meta.policy || '?'} seed=${meta.seed != null ? meta.seed : '?'} days=${meta.days != null ? meta.days : '?'} end=${meta.endReason || '?'} (${a.events} telemetry events)`);
  L.push(`deaths: ${a.deaths} ${JSON.stringify(a.deathCauses)}`);
  if (a.deaths) L.push(`  kinds: ${JSON.stringify(a.deathKinds)}${Object.keys(a.monsterWaves).length ? ` waves: ${JSON.stringify(a.monsterWaves)}` : ''}`);
  L.push(`calories: in forage=${a.kcalIn.forage} scavenge=${a.kcalIn.scavenge} | eaten=${a.kcalEaten}`);
  L.push(`combat: ${a.combats} starts → ${JSON.stringify(a.combatEnds)}`);
  L.push(`contests: fired=${a.contestsFired} ends=${JSON.stringify(a.contestEnds)} | shows aired=${a.showsAired} ${JSON.stringify(a.showWhys)}`);
  L.push(`disease: ${a.diseases} contracted ${JSON.stringify(a.diseasePools)}, ${a.cures} cured | trust events=${a.trustEvents} net=${a.trustDeltaSum}`);
  if (s.pop && s.pop.length) L.push(`pop: ${compactCurve(s.pop).map(p => `${p[0]}:${p[1]}`).join(' ')}`);
  if (s.pantry && s.pantry.length) L.push(`pantry: ${compactCurve(s.pantry).map(p => `${p[0]}:${Math.round(p[1] / 100) / 10}k`).join(' ')}`);
  if (s.knowledge && s.knowledge.length) {
    const k = s.knowledge;
    L.push(`knowledge: ${k[0][1]} → ${k[k.length - 1][1]} plants (${compactCurve(k, 6).map(p => `${p[0]}:${p[1]}`).join(' ')})`);
  }
  if (s.trust && s.trust.length) {
    const t = s.trust.filter(p => p[1] != null);
    if (t.length) L.push(`trust mean: ${t[0][1]} → ${t[t.length - 1][1]}`);
  }
  return L.join('\n');
}

if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('usage: node scripts/analyze-run.js <run.json>'); process.exit(1); }
  const run = JSON.parse(fs.readFileSync(f, 'utf8'));
  const tele = run.telemetry || run;
  const a = analyzeTelemetry(Array.isArray(tele) ? tele : []);
  console.log(formatReport(a, run.meta ? run : { meta: run.meta || {}, samples: run.samples }));
}

module.exports = { analyzeTelemetry, formatReport, byType, countBy };
