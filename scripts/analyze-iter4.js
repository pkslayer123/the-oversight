#!/usr/bin/env node
// analyze-iter4.js — WIN-RATE ITERATION ROUND 4 analysis (2026-10-10).
// Reads scripts/winrate-iter4-winseek.json + scripts/winrate-iter4-oraclev2.json
// and reports: wins, win rate, median/max survival, tier reach, wave unlocks,
// scale distribution, feast rate, death causes, binding blockers, vest events
// (exploit check), utilization. Prints a markdown table row for the
// iteration log.
// Usage: node scripts/analyze-iter4.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function load(f) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8')); }
  catch (e) { console.log('MISSING ' + f); return null; }
}
const q = (arr, p) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const med = a => q(a, 0.5);

function analyze(rows, policy) {
  const ok = rows.filter(r => r.endReason !== 'ERROR');
  const n = ok.length, errs = rows.length - n;
  const wins = ok.filter(r => r.won);
  const days = ok.map(r => r.days);
  const rankD = {};
  const tierD = {};
  const waveD = {};
  const wd = { 2: [], 3: [], 4: [], 5: [] };
  const endD = {};
  const deaths = {};
  const bindD = {};
  const vests = [];
  let feastHeld = 0, feastRuns = 0, feastUsedN = 0, feastArmedN = 0;
  const util = { abilityUses: 0, synergy: 0, kills: 0, counterKills: 0, craftsOk: 0, trapsSet: 0, trapCatches: 0, aidHanded: 0, sq: 0 };
  for (const r of ok) {
    rankD[r.rank] = (rankD[r.rank] || 0) + 1;
    tierD[r.havenTier] = (tierD[r.havenTier] || 0) + 1;
    waveD[r.maxWave] = (waveD[r.maxWave] || 0) + 1;
    for (const w of [2, 3, 4, 5]) if (r.waveDay && r.waveDay[w]) wd[w].push(r.waveDay[w]);
    endD[r.endReason] = (endD[r.endReason] || 0) + 1;
    for (const d of (r.deaths || [])) deaths[d] = (deaths[d] || 0) + 1;
    bindD[r.binding] = (bindD[r.binding] || 0) + 1;
    if (r.util) {
      const u = r.util;
      feastRuns += (u.feasts || 0);
      feastHeld += (u.feastsOk || 0);
      feastUsedN += r.feastUsed ? 1 : 0;
      feastArmedN += r.feastArmed ? 1 : 0;
      util.abilityUses += u.abilityUses || 0;
      util.synergy += u.synergyDiscoveries || 0;
      util.kills += u.kills || 0;
      util.counterKills += u.counterKills || 0;
      util.craftsOk += u.craftsOk || 0;
      util.trapsSet += u.trapsSet || 0;
      util.trapCatches += u.trapCatches || 0;
      util.aidHanded += u.aidHanded || 0;
      util.sq += r.sq || 0;
    }
    for (const v of (r.vests || [])) vests.push(Object.assign({ seed: r.seed, won: r.won }, v));
  }
  const natRuns = ok.filter(r => r.rank === 'national' || r.rank === 'global');
  console.log(`\n## ${policy} — ${n} runs (${errs} errors)`);
  console.log(`wins: ${wins.length}/${n} (${(100 * wins.length / n).toFixed(1)}%)` +
    (wins.length ? ' winDays: ' + wins.map(r => r.winDay).join(',') : ''));
  console.log(`survival: median ${med(days)}d, max ${Math.max(...days)}d, min ${Math.min(...days)}d`);
  console.log(`endReason: ${JSON.stringify(endD)}`);
  console.log(`scale: ${JSON.stringify(rankD)}   national+: ${natRuns.length}/${n}`);
  console.log(`havenTier: ${JSON.stringify(tierD)}`);
  console.log(`maxWave: ${JSON.stringify(waveD)}`);
  console.log(`waveDay medians: w2=${wd[2].length ? med(wd[2]) : '-'}(${wd[2].length}) w3=${wd[3].length ? med(wd[3]) : '-'}(${wd[3].length}) w4=${wd[4].length ? med(wd[4]) : '-'}(${wd[4].length}) w5=${wd[5].length ? med(wd[5]) : '-'}(${wd[5].length})`);
  console.log(`feast: held ${feastHeld}/${feastRuns} attempts, armed ${feastArmedN}/${n} runs, used ${feastUsedN}/${n} runs`);
  const topDeaths = Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`death causes (top): ${topDeaths.map(([k, v]) => `${k}:${v}`).join(' ')}`);
  const topBind = Object.entries(bindD).sort((a, b) => b[1] - a[1]);
  console.log(`binding blockers: ${topBind.map(([k, v]) => `${k}:${v}`).join(' ')}`);
  console.log(`util/run: ab ${(util.abilityUses / n).toFixed(1)} syn ${(util.synergy / n).toFixed(2)} kills ${(util.kills / n).toFixed(1)}(${util.counterKills} counter) crafts ${util.craftsOk} traps ${util.trapCatches}/${util.trapsSet} aidHanded ${util.aidHanded} sq ${(util.sq / n).toFixed(1)}`);
  // vest exploit check
  const shapeD = {};
  for (const v of vests) shapeD[v.shape] = (shapeD[v.shape] || 0) + 1;
  console.log(`vests: ${vests.length} total across ${new Set(vests.map(v => v.seed)).size} runs; shapes ${JSON.stringify(shapeD)}`);
  const belong = vests.filter(v => v.shape === 'belong');
  if (belong.length) {
    const minDay = Math.min(...belong.map(v => v.day));
    const minTrust = Math.min(...belong.map(v => v.trust == null ? 999 : v.trust));
    const minAge = Math.min(...belong.map(v => v.linkAgeDays == null ? 999 : v.linkAgeDays));
    console.log(`BELONG vest bar check: min day ${minDay} (>=14 required), min trust ${minTrust} (>=50), min linkAge ${minAge}d (>=14) — ` +
      (minDay >= 14 && minTrust >= 50 && minAge >= 14 ? 'NO UNDER-BAR VESTS (exploit check green)' : 'UNDER-BAR VEST FOUND (EXPLOIT!)'));
    console.log(`belong vest days: ${belong.map(v => `s${v.seed}@d${v.day}(t${v.trust},a${v.linkAgeDays})`).join(' ')}`);
  } else {
    console.log('BELONG vest bar check: no belong vests observed — bar unreachable even lowered, or policy never courts');
  }
  // deed-gate decomposition for the furthest runs
  const far = ok.slice().sort((a, b) => (b.days - a.days)).slice(0, 5);
  console.log('furthest runs: ' + far.map(r => `s${r.seed}:d${r.days} ${r.rank} uw${r.maxWave} w[${r.w.join('/')}] cx${r.cx} cr${r.cr} sent${r.sentiment ? 1 : 0} feastU${r.feastUsed ? 1 : 0} st${r.stage} bind:${r.binding}`).join(' | '));
  return { n, wins: wins.length, medDays: med(days), maxDays: Math.max(...days), rankD, waveD, natN: natRuns.length, feastUsedN, bindD, vestN: vests.length, belongN: belong.length };
}

const ws = load('winrate-iter4-winseek.json');
const o2 = load('winrate-iter4-oraclev2.json');
let a = null, b = null;
if (ws) a = analyze(ws, 'winseek (PRIMARY)');
if (o2) b = analyze(o2, 'oracle-v2');
if (a && b) {
  const tot = a.n + b.n, tw = a.wins + b.wins;
  console.log(`\n## COMBINED — ${tot} runs`);
  console.log(`wins: ${tw}/${tot} (${(100 * tw / tot).toFixed(1)}%) — target >=15%`);
  console.log(`national+: ${a.natN + b.natN}/${tot}`);
}
