#!/usr/bin/env node
// analyze-competence.js — analyze the policy-competence panel.
// Merges shard files (scripts/panel-competence-sN.json) into
// scripts/panel-competence-results.json and prints the panel tables:
// outcomes, utilization, cross-policy comparison, the oracle bound.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function pct(n, d) { return d ? (100 * n / d).toFixed(0) + '%' : '—'; }

const shards = [];
for (let i = 1; i <= 6; i++) {
  const p = path.join(ROOT, 'scripts', `panel-competence-s${i}.json`);
  if (fs.existsSync(p)) shards.push(...JSON.parse(fs.readFileSync(p, 'utf8')));
}
if (!shards.length) { console.error('no shard files found'); process.exit(1); }
const rows = shards.filter(r => r.endReason !== 'ERROR');
const errs = shards.filter(r => r.endReason === 'ERROR');
console.log(`rows: ${rows.length} (+${errs.length} errors)`);
if (errs.length) for (const e of errs.slice(0, 5)) console.log('  ERR', e.seed, e.policy, (e.error || '').slice(0, 100));

const OUT = path.join(ROOT, 'scripts', 'panel-competence-results.json');
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log('wrote ' + OUT);

const byPol = {};
for (const r of rows) { (byPol[r.policy] = byPol[r.policy] || []).push(r); }
const order = ['competent', 'progress', 'winseek', 'oracle'].filter(k => byPol[k]);

console.log('\n=== A. OUTCOMES (per policy, n=60) ===');
console.log('policy     wins  medSurv  t1   t2  w2unlk w3unlk  nation+  maxDay  cx>=3  sent');
for (const k of order) {
  const R = byPol[k];
  const wins = R.filter(r => r.won).length;
  const med = median(R.map(r => r.days)).toFixed(0);
  const max = Math.max(...R.map(r => r.days));
  const t1 = R.filter(r => r.havenTier >= 1).length, t2 = R.filter(r => r.havenTier >= 2).length;
  const w2 = R.filter(r => r.maxWave >= 2).length, w3 = R.filter(r => r.maxWave >= 3).length;
  const nat = R.filter(r => r.rank === 'national' || r.rank === 'global').length;
  const cx3 = R.filter(r => r.cx >= 3).length;
  const sent = R.filter(r => r.sentiment).length;
  console.log(`${k.padEnd(10)} ${String(wins).padStart(4)}/60 ${String(med).padStart(7)}  ${String(t1).padStart(2)}  ${String(t2).padStart(2)}  ${String(w2).padStart(4)}  ${String(w3).padStart(4)}  ${String(nat).padStart(6)}  ${String(max).padStart(5)}  ${String(cx3).padStart(4)}  ${String(sent).padStart(3)}`);
}

console.log('\n=== B. SCALE DISTRIBUTION (per policy) ===');
for (const k of order) {
  const R = byPol[k];
  const d = {};
  for (const r of R) d[r.rank] = (d[r.rank] || 0) + 1;
  console.log(k.padEnd(10), JSON.stringify(d));
}

console.log('\n=== C. SYSTEM UTILIZATION (mean per run; counter-kill rate pooled) ===');
console.log('policy     abil(p/v)  syn   kills  ctrRate  crafts  traps(c/s)  feast(ok/att,arm,use)  aidcry  aq(acc/hnd) rel  summons  sq');
for (const k of order) {
  const R = byPol[k].filter(r => r.util);
  const U = r => r.util;
  const ab = mean(R.map(r => U(r).abilityUses)).toFixed(1);
  const abp = mean(R.map(r => U(r).abilityPlayer)).toFixed(1);
  const abv = mean(R.map(r => U(r).abilityVillager)).toFixed(1);
  const syn = mean(R.map(r => U(r).synergyDiscoveries)).toFixed(2);
  const kills = mean(R.map(r => U(r).kills)).toFixed(1);
  const ck = R.reduce((t, r) => t + U(r).counterKills, 0);
  const tk = R.reduce((t, r) => t + U(r).kills, 0);
  const ctr = tk ? (100 * ck / tk).toFixed(1) + '%' : '0.0%';
  const cr = mean(R.map(r => U(r).craftsOk)).toFixed(1) + '/' + mean(R.map(r => U(r).crafts)).toFixed(1);
  const tc = mean(R.map(r => U(r).trapCatches)).toFixed(1) + '/' + mean(R.map(r => U(r).trapsSet)).toFixed(1);
  const fOk = mean(R.map(r => U(r).feastsOk)).toFixed(1), fA = mean(R.map(r => U(r).feasts)).toFixed(1);
  const fArm = pct(R.filter(r => r.feastArmed).length, R.length);
  const fUse = pct(R.filter(r => r.feastUsed).length, R.length);
  const ac = mean(R.map(r => U(r).aidCries)).toFixed(1);
  const aq = mean(R.map(r => U(r).aidAccepted)).toFixed(1) + '/' + mean(R.map(r => U(r).aidHanded)).toFixed(1);
  const rel = mean(R.map(r => U(r).reliefSpent)).toFixed(1);
  const su = mean(R.map(r => U(r).summonsSeen)).toFixed(1);
  const sq = mean(R.map(r => U(r).systemQuests)).toFixed(1);
  console.log(`${k.padEnd(10)} ${ab}(${abp}/${abv}) ${syn.padStart(5)} ${kills.padStart(6)} ${ctr.padStart(6)}  ${cr.padStart(9)}  ${tc.padStart(9)}  ${fOk}/${fA} ${fArm}/${fUse}     ${ac.padStart(5)}  ${aq.padStart(9)} ${rel.padStart(4)}  ${su.padStart(6)}  ${sq}`);
}

console.log('\n=== D. ORACLE INTERNALS (mean per run) ===');
{
  const R = (byPol.oracle || []).filter(r => r.util);
  if (R.length) {
    console.log('openers fired/run:', mean(R.map(r => r.openers || 0)).toFixed(2),
      '| armedUp calls/run:', mean(R.map(r => r.armedUp || 0)).toFixed(1),
      '| assessments:', mean(R.map(r => r.assessments || 0)).toFixed(1),
      '| engagedFavored:', mean(R.map(r => r.engagedFavored || 0)).toFixed(1),
      '| fledOutmatched:', mean(R.map(r => r.fledOutmatched || 0)).toFixed(1));
  }
}

console.log('\n=== E. THE ORACLE BOUND ===');
{
  const w = (byPol.winseek || []), o = (byPol.oracle || []);
  const ww = w.filter(r => r.won).length, ow = o.filter(r => r.won).length;
  const wmed = median(w.map(r => r.days)), omed = median(o.map(r => r.days));
  const wmax = Math.max(...w.map(r => r.days)), omax = Math.max(...o.map(r => r.days));
  console.log(`winseek: ${ww}/60 wins, median ${wmed.toFixed(0)}d, max ${wmax}d`);
  console.log(`oracle:  ${ow}/60 wins, median ${omed.toFixed(0)}d, max ${omax}d`);
  console.log(`delta:   ${ow - ww >= 0 ? '+' : ''}${ow - ww} wins, ${omed - wmed >= 0 ? '+' : ''}${(omed - wmed).toFixed(0)}d median`);
  if (ow <= 2 && ww <= 2) console.log('=> ORACLE ALSO ~0 WINS: the GAME is the bottleneck, not the policy.');
  else if (ow - ww >= 5) console.log('=> ORACLE WINS FAR MORE: the POLICY is the bottleneck.');
  else console.log('=> MIXED: policy gains are real but small — both policy and game share the gap.');
}

console.log('\n=== F. DEATH-CAUSE SHARE (combat vs rest, per policy) ===');
for (const k of order) {
  const causes = {};
  let n = 0;
  for (const r of byPol[k]) for (const c of (r.deaths || [])) { causes[c] = (causes[c] || 0) + 1; n++; }
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([c, x]) => `${c}:${(100 * x / n).toFixed(0)}%`).join(' ');
  console.log(k.padEnd(10), n + ' deaths:', top);
}
