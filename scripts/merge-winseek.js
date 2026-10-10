#!/usr/bin/env node
// merge-winseek.js — merge winseek shard results and print the summary.
// Usage: node scripts/merge-winseek.js scripts/winseek-shards/shard-*.json
'use strict';
const fs = require('fs');
const files = process.argv.slice(2);
let rows = [];
for (const f of files) {
  try {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    rows = rows.concat(r);
  } catch (e) { console.log('skip ' + f + ': ' + e.message); }
}
rows.sort((a, b) => a.seed - b.seed);
const OUT = 'scripts/sweep-winseek-results.json';
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));

const n = rows.length;
const tb = rows.filter(r => r.table).length, w = rows.filter(r => r.won).length;
const wd = rows.filter(r => r.won).map(r => r.days).sort((x, y) => x - y);
const medW = wd.length ? wd[Math.floor(wd.length / 2)] : null;
const ds = rows.map(r => r.days).sort((x, y) => x - y);
const med = ds.length ? ds[Math.floor(ds.length / 2)] : null;
console.log(`== winseek merged: n=${n} table ${tb}/${n} wins ${w}/${n} medWinDay ${medW} medDays ${med}`);
const bindCounts = {};
for (const r of rows) if (!r.won) bindCounts[r.binding] = (bindCounts[r.binding] || 0) + 1;
console.log('binders: ' + JSON.stringify(bindCounts, null, 1));
// Per-requirement completion table
const req = {
  'w1>=5': r => r.w[0] >= 5, 'w2>=5': r => r.w[1] >= 5, 'w3>=4': r => r.w[2] >= 4,
  'w4>=3': r => r.w[3] >= 3, 'w5>=2': r => r.w[4] >= 2,
  'contests>=3': r => r.cx >= 3, 'crises>=3': r => r.cr >= 3,
  'scale national+': r => r.rank === 'national' || r.rank === 'global',
  'sentiment': r => r.sentiment, 'feastSurge': r => r.feastUsed, 'stage>=3': r => r.stage >= 3,
};
console.log('\nPer-requirement completion:');
for (const [k, fn] of Object.entries(req)) {
  const c = rows.filter(fn).length;
  console.log(`  ${k}: ${c}/${n} (${Math.round(100*c/n)}%)`);
}
console.log('\nwrote ' + OUT);
