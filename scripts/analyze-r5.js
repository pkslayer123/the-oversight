#!/usr/bin/env node
// analyze-r5.js — aggregate sweep-r5 results and compare apples-to-apples vs r4.
// Usage: R5=scripts/sweep-r5-results.json R4=/home/hatch/workspace/sweep-r4-scratch/results-r4.json node scripts/analyze-r5.js
'use strict';
const path = require('path');
const R5 = process.env.R5 || path.join(__dirname, 'sweep-r5-results.json');
const R4 = process.env.R4 || '/home/hatch/workspace/sweep-r4-scratch/results-r4.json';
const rows5 = require(R5);
const rows4 = require(R4);

const policies = ['competent', 'progress', 'mvc'];
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mx = a => a.length ? Math.max(...a) : 0;
const mean = a => a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0;

function headline(rows, pid) {
  const rs = rows.filter(r => r.policy === pid), n = rs.length;
  const ds = rs.map(r => r.days);
  return {
    n,
    arc2: rs.filter(r => r.arc >= 2).length,
    arc3: rs.filter(r => r.arc >= 3).length,
    arc4: rs.filter(r => r.arc >= 4).length,
    table: rs.filter(r => r.table).length,
    wins: rs.filter(r => r.won).length,
    medDays: med(ds), maxDays: mx(ds),
    w3: rs.filter(r => r.maxWave >= 3).length,
    w4: rs.filter(r => r.maxWave >= 4).length,
    w5: rs.filter(r => r.maxWave >= 5).length,
    sentiment: rs.filter(r => r.sentiment).length,
    feast: rs.filter(r => r.feast || r.feastUsed).length,
    feastArmed: rs.filter(r => r.feastArmed || r.feastUsed).length,
    stage3: rs.filter(r => r.stage >= 3).length,
    sqMean: mean(rs.map(r => r.sq || 0)).toFixed(2),
    bitesMean: mean(rs.map(r => r.bites || 0)).toFixed(2),
    l3Mean: mean(rs.map(r => r.l3plants || 0)).toFixed(2),
    medBreadth: med(rs.map(r => r.breadth)),
  };
}

function deathCauses(rows, pid) {
  const dc = {};
  rows.filter(r => r.policy === pid).forEach(r => (r.deaths || []).forEach(c => { dc[c] = (dc[c] || 0) + 1; }));
  return dc;
}

function topCauses(dc, k) {
  return Object.entries(dc).sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([c, v]) => `${c}:${v}`).join(' ');
}

console.log('=== HEADLINE: r4 -> r5 (n=60/policy) ===');
for (const pid of policies) {
  const a = headline(rows4, pid), b = headline(rows5, pid);
  console.log(`\n### ${pid}`);
  const row = (label, fa, fb) => console.log(`  ${label}: r4 ${fa} -> r5 ${fb}`);
  row('Arc II      ', a.arc2 + '/' + a.n, b.arc2 + '/' + b.n);
  row('Arc III     ', a.arc3 + '/' + a.n, b.arc3 + '/' + b.n);
  row('Arc IV      ', a.arc4 + '/' + a.n, b.arc4 + '/' + b.n);
  row('table       ', a.table + '/' + a.n, b.table + '/' + b.n);
  row('wins        ', a.wins + '/' + a.n, b.wins + '/' + b.n);
  row('med/max days', a.medDays + '/' + a.maxDays, b.medDays + '/' + b.maxDays);
  row('wave3 unlock', a.w3 + '/' + a.n, b.w3 + '/' + b.n);
  row('wave4 unlock', a.w4 + '/' + a.n, b.w4 + '/' + b.n);
  row('wave5 unlock', a.w5 + '/' + a.n, b.w5 + '/' + b.n);
  row('sentiment   ', a.sentiment + '/' + a.n, b.sentiment + '/' + b.n);
  row('feast used  ', a.feast + '/' + a.n, b.feast + '/' + b.n);
  row('feast armed ', '(n/a)', b.feastArmed + '/' + b.n);
  row('stage 3+    ', a.stage3 + '/' + a.n, b.stage3 + '/' + b.n);
  row('sysQ mean   ', a.sqMean, b.sqMean);
  row('bites mean  ', a.bitesMean, b.bitesMean);
  row('L3pl mean   ', a.l3Mean, b.l3Mean);
  row('med breadth ', a.medBreadth, b.medBreadth);
}

console.log('\n=== DEED ASSEMBLY: max distinct fought per wave (bars 5/5/4/3/2) ===');
for (const pid of policies) {
  for (const [tag, rows] of [['r4', rows4], ['r5', rows5]]) {
    const rs = rows.filter(r => r.policy === pid), n = rs.length;
    const wb = [0, 1, 2, 3, 4].map(i => mx(rs.map(r => (r.w || [])[i] || 0)));
    const wm = [0, 1, 2, 3, 4].map(i => mean(rs.map(r => (r.w || [])[i] || 0)).toFixed(2));
    const bars = [5, 5, 4, 3, 2].map((bar, i) => `w${i + 1}>=${bar}:${rs.filter(r => ((r.w || [])[i] || 0) >= bar).length}`);
    console.log(`${tag} ${pid}: max ${wb.join('/')} mean ${wm.join('/')} | ${bars.join(' ')}`);
  }
}

console.log('\n=== WAVE UNLOCK DAYS (r5; first-day-seen, pre-sleep granularity) ===');
for (const pid of policies) {
  const rs = rows5.filter(r => r.policy === pid);
  for (const w of [2, 3, 4, 5]) {
    const dd = rs.filter(r => r.waveDay && r.waveDay[w] != null).map(r => r.waveDay[w]);
    console.log(`${pid} wave${w}: ${dd.length}/60 unlocked, day med ${med(dd)} min ${dd.length ? Math.min(...dd) : '-'} max ${dd.length ? Math.max(...dd) : '-'}`);
  }
}

console.log('\n=== SCALE RANK DISTRIBUTION (r5; r4 was 180/180 village) ===');
for (const pid of policies) {
  const ranks = {};
  rows5.filter(r => r.policy === pid).forEach(r => { ranks[r.rank] = (ranks[r.rank] || 0) + 1; });
  console.log(`${pid}: ${JSON.stringify(ranks)}`);
}

console.log('\n=== FEAST SURGE (r5) ===');
for (const pid of policies) {
  const rs = rows5.filter(r => r.policy === pid), n = rs.length;
  const armed = rs.filter(r => r.feastArmed || r.feastUsed).length;
  const used = rs.filter(r => r.feastUsed).length;
  const resMed = med(rs.map(r => r.surgeRes || 0));
  console.log(`${pid}: armed ${armed}/${n} used ${used}/${n} surgeRes med ${resMed}`);
}

console.log('\n=== UTIL HITS (r5; runs with >=1 hit /60; r4 not instrumented) ===');
for (const pid of policies) {
  const rs = rows5.filter(r => r.policy === pid);
  const labels = {};
  rs.forEach(r => { for (const [k, v] of Object.entries(r.util || {})) if (v > 0) labels[k] = (labels[k] || 0) + 1; });
  const ht = {};
  rs.forEach(r => { ht[r.havenTier] = (ht[r.havenTier] || 0) + 1; });
  console.log(`${pid}: ${JSON.stringify(labels)} | havenTier end-state: ${JSON.stringify(ht)}`);
}

console.log('\n=== DEATH CAUSES (all villagers; r4 -> r5, per 60 runs) ===');
for (const pid of policies) {
  console.log(`r4 ${pid}: ${topCauses(deathCauses(rows4, pid), 8)}`);
  console.log(`r5 ${pid}: ${topCauses(deathCauses(rows5, pid), 8)}`);
}

console.log('\n=== END REASONS (r5) ===');
for (const pid of policies) {
  const er = {};
  rows5.filter(r => r.policy === pid).forEach(r => { er[r.endReason] = (er[r.endReason] || 0) + 1; });
  console.log(`${pid}: ${JSON.stringify(er)}`);
}

console.log('\n=== ARC-DAY MEDIANS (r5) ===');
for (const pid of policies) {
  const rs = rows5.filter(r => r.policy === pid);
  const parts = [];
  for (const a of [2, 3, 4]) {
    const dd = rs.filter(r => r.arcDay && r.arcDay[a] != null).map(r => r.arcDay[a]);
    if (dd.length) parts.push(`arc${a} ${dd.length}/60 med ${med(dd)}`);
  }
  console.log(`${pid}: ${parts.join(' | ') || 'none'}`);
}

console.log('\n=== CLOSEST-TO-GATE RUNS (r5, by waves-faced sum) ===');
for (const pid of ['competent', 'progress']) {
  console.log(`-- ${pid} --`);
  rows5.filter(r => r.policy === pid)
    .map(r => ({ seed: r.seed, days: r.days, w: r.w, sum: (r.w || []).reduce((a, b) => a + b, 0), cx: r.cx, cr: r.cr, rank: r.rank, uw: r.maxWave, er: r.endReason, sent: r.sentiment, fA: r.feastArmed, fU: r.feastUsed, st: r.stage, br: r.breadth }))
    .sort((a, b) => b.sum - a.sum).slice(0, 6)
    .forEach(r => console.log(JSON.stringify(r)));
}
