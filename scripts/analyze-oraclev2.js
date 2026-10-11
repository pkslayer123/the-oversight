#!/usr/bin/env node
// analyze-oraclev2.js — round-3 analysis (win-rate iteration 2026-10-10).
// Merges scripts/sweep-oraclev2-sN.json into scripts/sweep-oraclev2-results.json
// and prints: outcomes, utilization (incl. the v2 engagement panel), v2
// internals, death-cause shares, wave unlock days, blocker binding.
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
  const p = path.join(ROOT, 'scripts', `sweep-oraclev2-s${i}.json`);
  if (fs.existsSync(p)) shards.push(...JSON.parse(fs.readFileSync(p, 'utf8')));
}
if (!shards.length) { console.error('no shard files found'); process.exit(1); }
const rows = shards.filter(r => r.endReason !== 'ERROR');
const errs = shards.filter(r => r.endReason === 'ERROR');
console.log(`rows: ${rows.length} (+${errs.length} errors)`);
if (errs.length) for (const e of errs.slice(0, 5)) console.log('  ERR', e.seed, (e.error || '').slice(0, 100));
const OUT = path.join(ROOT, 'scripts', 'sweep-oraclev2-results.json');
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log('wrote ' + OUT);
const R = rows;
const n = R.length;

console.log('\n=== A. OUTCOMES (oraclev2, n=' + n + ') ===');
{
  const wins = R.filter(r => r.won).length;
  const med = median(R.map(r => r.days)).toFixed(0);
  const max = Math.max(...R.map(r => r.days));
  const t1 = R.filter(r => r.havenTier >= 1).length, t2 = R.filter(r => r.havenTier >= 2).length, t3 = R.filter(r => r.havenTier >= 3).length;
  const w2 = R.filter(r => r.maxWave >= 2).length, w3 = R.filter(r => r.maxWave >= 3).length,
    w4 = R.filter(r => r.maxWave >= 4).length, w5 = R.filter(r => r.maxWave >= 5).length;
  const nat = R.filter(r => r.rank === 'national' || r.rank === 'global').length;
  const cx3 = R.filter(r => r.cx >= 3).length;
  const sent = R.filter(r => r.sentiment).length;
  const table = R.filter(r => r.table).length;
  const arc = {};
  for (const r of R) arc[r.arc] = (arc[r.arc] || 0) + 1;
  console.log(`wins ${wins}/${n} | medSurv ${med}d | maxDay ${max}d | table ${table}/${n}`);
  console.log(`t1 ${t1}/${n} t2 ${t2}/${n} t3 ${t3}/${n} | w2 ${w2} w3 ${w3} w4 ${w4} w5 ${w5} | national+ ${nat}/${n} | cx>=3 ${cx3}/${n} | sent ${sent}/${n}`);
  console.log('arc distribution:', JSON.stringify(arc));
  const sd = {};
  for (const r of R) sd[r.rank] = (sd[r.rank] || 0) + 1;
  console.log('scale distribution:', JSON.stringify(sd));
}

console.log('\n=== B. WAVE/TIER REACH DAY (median day of first reach, among reachers) ===');
for (const [label, f] of [['w2', r => r.maxWave >= 2], ['w3', r => r.maxWave >= 3], ['w4', r => r.maxWave >= 4],
    ['t1', r => r.havenTier >= 1], ['t2', r => r.havenTier >= 2]]) {
  const ds = R.filter(f).map(r => {
    if (label === 'w2') return (r.waveDay || {})[2];
    if (label === 'w3') return (r.waveDay || {})[3];
    if (label === 'w4') return (r.waveDay || {})[4];
    return r.days;
  }).filter(x => x != null);
  console.log(`${label}: ${ds.length}/${n} reach, median day ${ds.length ? median(ds).toFixed(0) : '—'}`);
}

console.log('\n=== C. UTILIZATION PANEL (mean per run; counter-kill rate pooled) ===');
{
  const U = r => r.util;
  const ab = mean(R.map(r => U(r).abilityUses)).toFixed(1);
  const abp = mean(R.map(r => U(r).abilityPlayer)).toFixed(1);
  const abv = mean(R.map(r => U(r).abilityVillager)).toFixed(1);
  const syn = mean(R.map(r => U(r).synergyDiscoveries)).toFixed(2);
  const kills = mean(R.map(r => U(r).kills)).toFixed(1);
  const ck = R.reduce((t, r) => t + U(r).counterKills, 0);
  const tk = R.reduce((t, r) => t + U(r).kills, 0);
  const ctr = tk ? (100 * ck / tk).toFixed(1) + '%' : '0.0%';
  console.log(`abilityUses ${ab}/run (player ${abp} / villager ${abv}) | synergy discoveries ${syn}/run`);
  console.log(`kills ${kills}/run | counter-kill rate ${ctr} (${ck}/${tk})`);
  console.log(`crafts ok/att ${mean(R.map(r => U(r).craftsOk)).toFixed(1)}/${mean(R.map(r => U(r).crafts)).toFixed(1)} | traps catches/sets ${mean(R.map(r => U(r).trapCatches)).toFixed(1)}/${mean(R.map(r => U(r).trapsSet)).toFixed(1)}`);
  console.log(`feasts ok/att ${mean(R.map(r => U(r).feastsOk)).toFixed(1)}/${mean(R.map(r => U(r).feasts)).toFixed(1)} armed ${pct(R.filter(r => r.feastArmed).length, n)} used ${pct(R.filter(r => r.feastUsed).length, n)}`);
  console.log(`aidCries ${mean(R.map(r => U(r).aidCries)).toFixed(1)} | aidQuest acc/hnd ${mean(R.map(r => U(r).aidAccepted)).toFixed(1)}/${mean(R.map(r => U(r).aidHanded)).toFixed(1)} | relief ${mean(R.map(r => U(r).reliefSpent)).toFixed(1)}`);
  console.log(`summons seen ${mean(R.map(r => U(r).summonsSeen)).toFixed(1)} | systemQuests ${mean(R.map(r => U(r).systemQuests)).toFixed(1)}`);
}

console.log('\n=== D. V2 INTERNALS (mean per run) ===');
{
  const g = (k) => mean(R.map(r => r[k] || 0));
  console.log(`ability fired/refused (policy count): ${g('v2AbilFired').toFixed(1)}/${g('v2AbilRefused').toFixed(1)}`);
  console.log(`held abilities: ${g('heldAbilities').toFixed(1)}/run (L3: ${g('heldAbilitiesL3').toFixed(1)}) | synergies held: ${g('synergies').toFixed(2)} | surgeResonance: ${g('surgeRes').toFixed(1)}`);
  console.log(`counter-known monsters seen: ${g('v2CounterSeen').toFixed(2)} (fights assessed: ${g('v2FightsAssessed').toFixed(1)})`);
  console.log(`surge fights taken: ${g('v2SurgeFights').toFixed(2)} | crafts: ${g('v2Crafts').toFixed(2)} | traps set: ${g('v2TrapsSet').toFixed(2)}`);
  console.log(`aid treats: ${g('v2Treats').toFixed(2)} | self-treats: ${g('v2SelfTreats').toFixed(2)} | aidCrys: ${g('v2AidCry').toFixed(2)}`);
  console.log(`aid quests completed (policy): ${g('v2QuestDone').toFixed(2)} | sysQuests completed (policy): ${g('v2SysDone').toFixed(2)} | books read: ${g('v2BooksRead').toFixed(2)} | abilities chosen: ${g('v2ChoseAbility').toFixed(2)}`);
  console.log(`engagedFavored: ${g('engagedFavored').toFixed(1)} | fled: ${g('fled').toFixed(1)} | struck: ${g('struck').toFixed(1)} | barrierExits: ${g('barrierExits').toFixed(1)} | watchdogFired: ${g('watchdogFired').toFixed(2)} | timeFreezeCleared: ${g('timeFreezeCleared').toFixed(2)}`);
}

console.log('\n=== E. DEATH-CAUSE SHARE ===');
{
  const causes = {};
  let nd = 0;
  for (const r of R) for (const c of (r.deaths || [])) { causes[c] = (causes[c] || 0) + 1; nd++; }
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([c, x]) => `${c}:${(100 * x / nd).toFixed(0)}%`).join(' ');
  console.log(nd + ' deaths:', top);
  const er = {};
  for (const r of R) er[r.endReason] = (er[r.endReason] || 0) + 1;
  console.log('endReason:', JSON.stringify(er));
}

console.log('\n=== F. DEED-GATE BLOCKER (binding constraint among non-wins) ===');
{
  const bars = [5, 5, 4, 3, 2];
  const bind = {};
  for (const r of R) {
    if (r.won) { bind.won = (bind.won || 0) + 1; continue; }
    const w = r.w || [0, 0, 0, 0, 0];
    const waveShort = [];
    for (let i = 0; i < 5; i++) if (w[i] < bars[i]) waveShort.push('w' + (i + 1));
    let b = 'none?!';
    if (!(r.rank === 'national' || r.rank === 'global')) b = 'scale';
    else if (waveShort.length) b = 'waves:' + waveShort[0];
    else if ((r.cx || 0) < 3) b = 'contests';
    else if ((r.cr || 0) < 3) b = 'crises';
    else if (!r.sentiment) b = 'sentiment';
    else if (!r.feastUsed) b = 'feastSurge';
    else if ((r.stage || 0) < 3) b = 'integration';
    bind[b] = (bind[b] || 0) + 1;
  }
  console.log(JSON.stringify(bind));
  // where do runs die on the ladder? w-bars filled among non-wins
  const wfill = [0, 0, 0, 0, 0];
  for (const r of R) { if (!r.won) for (let i = 0; i < 5; i++) if ((r.w || [0,0,0,0,0])[i] >= bars[i]) wfill[i]++; }
  console.log('wave bars filled (non-wins):', wfill.map((x, i) => `w${i + 1}:${x}/${n}`).join(' '));
}

console.log('\n=== G. ROUND-2 COMPARISON ===');
console.log('(round-2 oracle: 0/60 wins, median 41d, max 109d, t1 42/60, w2 33/60, w3 0/60, regional 60/60, nation+ 0/60)');
{
  const wins = R.filter(r => r.won).length;
  const med = median(R.map(r => r.days)).toFixed(0);
  const max = Math.max(...R.map(r => r.days));
  const t1 = R.filter(r => r.havenTier >= 1).length;
  const w2 = R.filter(r => r.maxWave >= 2).length, w3 = R.filter(r => r.maxWave >= 3).length;
  const nat = R.filter(r => r.rank === 'national' || r.rank === 'global').length;
  console.log(`(oraclev2:      ${wins}/${n} wins, median ${med}d, max ${max}d, t1 ${t1}/${n}, w2 ${w2}/${n}, w3 ${w3}/${n}, nation+ ${nat}/${n})`);
}
