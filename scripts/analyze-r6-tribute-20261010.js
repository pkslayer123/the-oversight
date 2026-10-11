#!/usr/bin/env node
// analyze-r6-tribute-20261010.js — rollup for the round-6 tribute-priority probe.
// Usage: node scripts/analyze-r5-succession-20261010.js [shard.json ...]
// Defaults to scripts/sweep-r5-succession-s{1..6}.json.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let files = process.argv.slice(2);
if (!files.length) {
  files = [1, 2, 3, 4, 5, 6].map(i => path.join(ROOT, 'scripts', `sweep-r6-tribute-s${i}.json`));
}
const rows = [];
for (const f of files) {
  if (!fs.existsSync(f)) { console.log('MISSING ' + f); continue; }
  for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) rows.push(r);
}
const ok = rows.filter(r => r.endReason !== 'ERROR');
const err = rows.filter(r => r.endReason === 'ERROR');
console.log(`rows: ${rows.length} (ok ${ok.length}, errors ${err.length})`);
if (err.length) for (const r of err.slice(0, 5)) console.log('  ERROR seed', r.seed, r.error);

const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const wins = ok.filter(r => r.won);
console.log(`\nWINS: ${wins.length}/${ok.length}` + (wins.length ? ' days: ' + wins.map(r => r.winDay).join(',') : ''));
console.log(`table reaches: ${ok.filter(r => r.table).length}/${ok.length}`);
console.log(`survival: median ${med(ok.map(r => r.days))}d, max ${Math.max(...ok.map(r => r.days))}d`);
const endR = {};
for (const r of ok) endR[r.endReason] = (endR[r.endReason] || 0) + 1;
console.log('endReasons:', JSON.stringify(endR));

const tiers = {};
for (const r of ok) { const t = r.maxTier || 0; tiers[t] = (tiers[t] || 0) + 1; }
console.log('maxTier dist:', JSON.stringify(tiers));
const waves = {};
for (const r of ok) { const w = r.maxWave || 1; waves[w] = (waves[w] || 0) + 1; }
console.log('maxWave dist:', JSON.stringify(waves));
const ranks = {};
for (const r of ok) ranks[r.rank] = (ranks[r.rank] || 0) + 1;
console.log('end rank dist:', JSON.stringify(ranks));
console.log(`nationalLive ever: ${ok.filter(r => r.nationalLive).length}/${ok.length}`);

const vestByShape = {};
const vestDays = {};
for (const r of ok) for (const v of (r.vests || [])) {
  vestByShape[v.shape] = (vestByShape[v.shape] || 0) + 1;
  (vestDays[v.shape] = vestDays[v.shape] || []).push(v.day);
}
console.log('vests by road (first vest per run):', JSON.stringify(vestByShape));
for (const s of Object.keys(vestDays)) console.log(`  ${s}: n=${vestDays[s].length} median day ${med(vestDays[s])}`);

// deed-gate bars (w1..w5 medians)
const wbars = [5, 5, 4, 3, 2];
for (let i = 0; i < 5; i++) {
  const vals = ok.map(r => (r.w && r.w[i]) || 0);
  console.log(`w${i + 1} deeds: median ${med(vals)}/${wbars[i]}, met ${vals.filter(v => v >= wbars[i]).length}/${ok.length}`);
}

// link lifecycle
const L = { formed: 0, theirDied: 0, successionCrisis: 0, shaken: 0, broken: 0, brokenSuccession: 0, brokenOther: 0 };
let runsWithLinks = 0, maxActive = 0;
for (const r of ok) {
  const l = r.linkLife || {};
  for (const k of Object.keys(L)) L[k] += l[k] || 0;
  if ((l.formed || 0) > 0) runsWithLinks++;
  if ((r.links || 0) > maxActive) maxActive = r.links;
}
console.log('\nLINK LIFECYCLE (60 runs):', JSON.stringify(L));
console.log(`runs forming >=1 link: ${runsWithLinks}/${ok.length}; max active links at end: ${maxActive}`);
console.log(`succession beats/run: ${(L.theirDied / ok.length).toFixed(2)} theirDied, ${(L.successionCrisis / ok.length).toFixed(2)} successionCrisis`);
console.log(`per beat: shaken ${L.shaken}/${L.theirDied + L.successionCrisis} (${((L.shaken / Math.max(1, L.theirDied + L.successionCrisis)) * 100).toFixed(0)}%), succession-snaps ${L.brokenSuccession}`);

// death causes
const causes = {};
for (const r of ok) for (const c of (r.deaths || [])) causes[c] = (causes[c] || 0) + 1;
const tot = Object.values(causes).reduce((a, b) => a + b, 0);
console.log(`\nDEATH CAUSES (n=${tot}):`);
for (const [c, n] of Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`  ${c}: ${n} (${(n / tot * 100).toFixed(1)}%)`);

// binding blockers
const bb = {};
for (const r of ok) bb[r.binding] = (bb[r.binding] || 0) + 1;
console.log('\nbinding blockers:', JSON.stringify(bb));

// utilization medians
const u = k => med(ok.map(r => ((r.util || {})[k]) || 0));
console.log(`\nutil medians: abilityUses ${u('abilityUses')}, synergies ${u('synergyDiscoveries')}, kills ${u('kills')}, feastsOk ${u('feastsOk')}, aidHanded ${u('aidHanded')}, sq ${med(ok.map(r => r.sq || 0))}`);

// ---- round-6: v3 lever counters (the probe's own instrumentation) ----
const v3k = ['v3TributePays', 'v3DemandHonored', 'v3Demand_tribute', 'v3Demand_aid', 'v3Demand_counsel', 'v3DemandDeferred', 'v3AidVisits', 'v3SuccessionAnswered'];
const v3sum = {}, v3med = {};
for (const k of v3k) { v3sum[k] = ok.reduce((t, r) => t + (r[k] || 0), 0); v3med[k] = med(ok.map(r => r[k] || 0)); }
console.log('\nV3 LEVERS (60 runs):');
for (const k of v3k) console.log(`  ${k}: total ${v3sum[k]}, median/run ${v3med[k]}`);
console.log(`  v3TrustFromDemands: total ${ok.reduce((t, r) => t + (r.v3TrustFromDemands || 0), 0)}, median/run ${med(ok.map(r => r.v3TrustFromDemands || 0))}`);
console.log(`  runs honoring >=1 demand: ${ok.filter(r => (r.v3DemandHonored || 0) > 0).length}/${ok.length}`);
const tribK = ok.reduce((t, r) => t + (r.v3TributeKcal || 0), 0);
const tribP = v3sum.v3TributePays || 1;
console.log(`  tribute kcal extracted: ${Math.round(tribK).toLocaleString()} total, avg ${Math.round(tribK / tribP).toLocaleString()}/pay (full weekly = ~5,000; low avg = thin-pantry partials)`);

// ---- round-6: trust-at-death + how close the links got ----
const maxTrusts = ok.map(r => r.maxSubTrust || 0);
console.log(`\nSUBORDINATE-LINK TRUST (BELONG bar: >=50):`);
console.log(`  max trust/run: median ${med(maxTrusts)}, max ${Math.max(...maxTrusts)}`);
const bands = [0, 20, 30, 40, 45, 50, 60];
let bandStr = '  max-trust bands: ';
for (let i = 0; i < bands.length - 1; i++) {
  const n = maxTrusts.filter(t => t >= bands[i] && t < bands[i + 1]).length;
  bandStr += `[${bands[i]},${bands[i + 1]}):${n} `;
}
const n50 = maxTrusts.filter(t => t >= 50).length;
bandStr += `[50+]:${n50}`;
console.log(bandStr);
const deaths = [];
for (const r of ok) for (const d of (r.trustDeaths || [])) deaths.push(d);
const tdSub = deaths.filter(d => d.sub);
console.log(`  links broken: ${deaths.length} total (${tdSub.length} subordinate)`);
if (tdSub.length) {
  const tdTrust = tdSub.map(d => d.trust);
  console.log(`  trust-at-break (subordinate): median ${med(tdTrust)}, max ${Math.max(...tdTrust)}`);
  const how = {};
  for (const d of tdSub) how[d.how] = (how[d.how] || 0) + 1;
  console.log('  break causes (subordinate):', JSON.stringify(how));
}
const endTrusts = [];
for (const r of ok) for (const t of (r.endSubTrusts || [])) endTrusts.push(t);
if (endTrusts.length) console.log(`  active subordinate links at run end: ${endTrusts.length}, trust median ${med(endTrusts)}, max ${Math.max(...endTrusts)}`);
console.log(`  runs with any active subordinate link in arrears at end: ${ok.filter(r => (r.endArrears || 0) > 0).length}/${ok.length}`);

// ---- the cost question: survival vs oracleV2 r5 (median 38d) ----
console.log(`\nCOST: median survival ${med(ok.map(r => r.days))}d vs oracleV2-r5 38d (delta ${med(ok.map(r => r.days)) - 38}d)`);
