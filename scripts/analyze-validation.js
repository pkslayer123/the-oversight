#!/usr/bin/env node
// analyze-validation.js — merge shards + full before/after analysis for the
// survival-economy validation sweep (2026-10-10).
// Usage: node scripts/analyze-validation.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const shardFiles = [1,2,3,4,5,6].map(i => '/tmp/valid-s' + i + '.json');
let rows = [];
for (const f of shardFiles) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(f + ': ' + r.length + ' rows');
  rows = rows.concat(r);
}
rows = rows.filter(r => r.endReason !== 'ERROR');
const n = rows.length;
const med = (a) => { const s = a.slice().sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
const rate = (f) => rows.filter(f).length + '/' + n;
const pct = (f) => (100 * rows.filter(f).length / n).toFixed(0) + '%';

const days = rows.map(r => r.days).sort((a,b)=>a-b);
console.log('\n== SURVIVAL');
console.log('median', med(days), 'min', days[0], 'max', days[n-1]);
console.log('wins', rate(r=>r.won), 'table', rate(r=>r.table));

console.log('\n== TIERS (havenTier) — days to first reach among reachers');
for (const t of [1,2,3]) {
  const r = rows.filter(x => (x.havenTier||0) >= t);
  console.log('tier'+t+':', r.length+'/'+n);
}
const t1days = rows.filter(r=>(r.havenTier||0)>=1);
console.log('(E baseline: 0/60 tier 1)');

console.log('\n== SCALE RANKS');
const ranks = {};
for (const r of rows) ranks[r.rank] = (ranks[r.rank]||0)+1;
console.log(JSON.stringify(ranks));

console.log('\n== WAVE DEED BARS (5/5/4/3/2)');
const bars = [5,5,4,3,2];
bars.forEach((b,i)=>{ console.log(`w${i+1}>=${b}:`, rate(r=>(r.w||[])[i]>=b), 'median w'+(i+1)+':', med(rows.map(r=>(r.w||[])[i]))); });
console.log('maxWave unlocked: ', JSON.stringify(rows.reduce((o,r)=>{o[r.maxWave]=(o[r.maxWave]||0)+1;return o;},{})));

console.log('\n== PER-REQUIREMENT COMPLETION (E baseline in parens)');
console.log('w1 >=5:', pct(r=>r.w[0]>=5), '(E: 70%)');
console.log('w2 >=5:', pct(r=>r.w[1]>=5), '(E: 2%)');
console.log('w3 >=4:', pct(r=>r.w[2]>=4), '(E: 0%)');
console.log('w4 >=3:', pct(r=>r.w[3]>=3), '(E: 0%)');
console.log('w5 >=2:', pct(r=>r.w[4]>=2), '(E: 0%)');
console.log('contests >=3:', pct(r=>r.cx>=3), '(E: 22%)');
console.log('crises >=3:', pct(r=>r.cr>=3), '(E: 60%)');
console.log('scale national+:', pct(r=>r.rank==='national'||r.rank==='global'), '(E: 0%)');
console.log('sentiment taught:', pct(r=>r.sentiment), '(E: 75%)');
console.log('feast surge used:', pct(r=>r.feastUsed), '(E: 35% armed-not-used; baseline said "feast surge used 21/60 (35%)")');
console.log('integration stage >=3:', pct(r=>r.stage>=3), '(E: 68%)');

console.log('\n== BINDING BLOCKERS');
const bind = {};
for (const r of rows) if (!r.won) bind[r.binding]=(bind[r.binding]||0)+1;
console.log(JSON.stringify(bind));

console.log('\n== MEDIAN UNLOCK DAYS (among runs that reached)');
for (const w of [2,3,4,5]) {
  const ds = rows.map(r=>r.waveDay && r.waveDay[w]).filter(x=>x!=null);
  console.log('wave'+w+' unlock day: n='+ds.length+(ds.length?' med='+med(ds):''));
}
const t1d = rows.filter(r=>(r.havenTier||0)>=1).map(r=>null); // tierDay not captured; skip
console.log('(tier unlock days not captured in this sweep; see A1: median day 12)');

console.log('\n== DEATH-CAUSE DISTRIBUTION (all recorded deaths, first-12 per run)');
const dc = {}, dcDay = {};
for (const r of rows) {
  for (const d of (r.deathRecs||[])) {
    const c = String(d.cause||'?').slice(0,40);
    dc[c] = (dc[c]||0)+1;
    const bin = d.day<=10?'d1-10':d.day<=20?'d11-20':d.day<=30?'d21-30':d.day<=40?'d31-40':'d41+';
    dcDay[bin] = dcDay[bin]||{};
    dcDay[bin][c] = (dcDay[bin][c]||0)+1;
  }
}
const tot = Object.values(dc).reduce((a,b)=>a+b,0);
const top = Object.entries(dc).sort((a,b)=>b[1]-a[1]).slice(0,20);
console.log('total recorded deaths:', tot);
for (const [c,k] of top) console.log('  '+k+' ('+(100*k/tot).toFixed(1)+'%) '+c);
console.log('by day-bin:');
for (const b of ['d1-10','d11-20','d21-30','d31-40','d41+']) {
  const o = dcDay[b]||{};
  const t2 = Object.entries(o).sort((a,c)=>c[1]-a[1]).slice(0,5).map(([c,k])=>c+':'+k).join(' ');
  const bt = Object.values(o).reduce((a,c)=>a+c,0);
  console.log('  '+b+': n='+bt+' '+t2);
}

console.log('\n== END REASONS');
const er = {};
for (const r of rows) er[r.endReason]=(er[r.endReason]||0)+1;
console.log(JSON.stringify(er));

// merge to final results path
const OUT = path.join(ROOT, 'scripts', 'sweep-survival-validation-results.json');
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log('\nwrote merged ' + OUT + ' (' + rows.length + ' rows)');
