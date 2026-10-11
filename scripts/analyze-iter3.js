#!/usr/bin/env node
// analyze-iter3.js — summarize winrate-iter3-results.json (round 3, oracle-v2).
// Usage: node scripts/analyze-iter3.js [results.json]
'use strict';
const fs = require('fs');
const F = process.argv[2] || 'scripts/winrate-iter3-results.json';
const rows = JSON.parse(fs.readFileSync(F, 'utf8')).filter(r => r.policy === 'oracle-v2');
const n = rows.length;
const ok = rows.filter(r => r.endReason !== 'ERROR');
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = a => a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0;
const sum = k => ok.reduce((t, r) => t + (r[k] || 0), 0);
const usum = k => ok.reduce((t, r) => t + (((r.util || {})[k]) || 0), 0);

console.log(`# oracle-v2 round-3 summary (n=${n}, errors=${n - ok.length})`);
console.log('');
console.log('## Outcomes');
console.log(`wins: ${ok.filter(r => r.won).length}/${ok.length}`);
console.log(`median survival: ${med(ok.map(r => r.days))}d, max: ${Math.max(...ok.map(r => r.days))}d`);
console.log(`endReason: ${JSON.stringify(ok.reduce((m, r) => { m[r.endReason] = (m[r.endReason] || 0) + 1; return m; }, {}))}`);
console.log(`havenTier>=1: ${ok.filter(r => r.havenTier >= 1).length}, havenTier>=2: ${ok.filter(r => r.havenTier >= 2).length}`);
console.log(`scale: ${JSON.stringify(ok.reduce((m, r) => { m[r.rank] = (m[r.rank] || 0) + 1; return m; }, {}))}`);
console.log(`maxWave>=2: ${ok.filter(r => r.maxWave >= 2).length}, >=3: ${ok.filter(r => r.maxWave >= 3).length}`);
console.log(`waveDay w2 set: ${ok.filter(r => r.waveDay && r.waveDay[2] != null).length}, w3: ${ok.filter(r => r.waveDay && r.waveDay[3] != null).length}`);
console.log(`deed bars w: [${[0, 1, 2, 3, 4].map(i => med(ok.map(r => (r.w || [])[i] || 0))).join('/')}] (medians)`);
console.log(`contests cx>=3: ${ok.filter(r => r.cx >= 3).length}, crises kinds>=3: ${ok.filter(r => (r.crisesKinds || []).length >= 3).length}`);
console.log(`table: ${ok.filter(r => r.table).length}, gate: ${ok.filter(r => r.gate).length}`);
console.log(`sentiment: ${ok.filter(r => r.sentiment).length}, feastArmed: ${ok.filter(r => r.feastArmed).length}, feastUsed: ${ok.filter(r => r.feastUsed).length}`);
console.log(`integ median: ${med(ok.map(r => r.integ))}, stage median: ${med(ok.map(r => r.stage))}, breadth median: ${med(ok.map(r => r.breadth))}`);
console.log(`sq median: ${med(ok.map(r => r.sq))}, links>0: ${ok.filter(r => r.links > 0).length}`);
console.log('');
console.log('## Utilization (totals / means per run)');
const u = r => r.util || {};
console.log(`abilityUses: ${usum('abilityUses')} (mean ${(usum('abilityUses') / ok.length).toFixed(1)}/run; player ${usum('abilityPlayer')}, villager ${usum('abilityVillager')})`);
console.log(`synergyDiscoveries: ${usum('synergyDiscoveries')} (mean ${(usum('synergyDiscoveries') / ok.length).toFixed(2)}/run)`);
console.log(`kills: ${usum('kills')}, counterKills: ${usum('counterKills')} (${(100 * usum('counterKills') / Math.max(1, usum('kills'))).toFixed(1)}%)`);
console.log(`crafts: ${usum('craftsOk')}/${usum('crafts')}, trapsSet: ${usum('trapsSet')}, trapCatches: ${usum('trapCatches')}`);
console.log(`feasts ok/att: ${usum('feastsOk')}/${usum('feasts')}`);
console.log(`aid: cries ${usum('aidCries')}, accepted ${usum('aidAccepted')}, handed ${usum('aidHanded')}, relief ${usum('reliefSpent')}`);
console.log(`summons seen: ${usum('summonsSeen')}, systemQuests: ${usum('systemQuests')}`);
console.log('');
console.log('## oracle-v2 systems counters (means per run)');
for (const k of ['abilityTurns', 'practiceFired', 'trapsCrafted', 'traplineSets', 'feastBanks', 'feastBankDays', 'bankPatrols', 'counterPrefTargets', 'choseAbility', 'abilitiesHeld', 'synergiesHeld']) {
  console.log(`${k}: total ${sum(k)}, mean ${(sum(k) / ok.length).toFixed(2)}/run, runs>0: ${ok.filter(r => (r[k] || 0) > 0).length}`);
}
console.log('');
console.log('## abilityTurns breakdown (per-ability in-fight uses)');
const ab = {};
for (const r of ok) for (const [k, v] of Object.entries(r.abBreakdown || {})) ab[k] = (ab[k] || 0) + v;
for (const [k, v] of Object.entries(ab).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log('');
console.log('## fight behavior');
console.log(`struck mean: ${(sum('struck') / ok.length).toFixed(1)}, fled mean: ${(sum('fled') / ok.length).toFixed(1)}, engagedFavored mean: ${(sum('engagedFavored') / ok.length).toFixed(1)}`);
console.log(`openers mean: ${(sum('openers') / ok.length).toFixed(1)}, barrierExits: ${sum('barrierExits')}, watchdogFired: ${sum('watchdogFired')}, timeFreezeCleared: ${sum('timeFreezeCleared')}`);
console.log('');
console.log('## death causes (top)');
const dc = {};
for (const r of ok) for (const d of (r.deaths || [])) dc[d] = (dc[d] || 0) + 1;
const dtot = Object.values(dc).reduce((t, x) => t + x, 0);
for (const [k, v] of Object.entries(dc).sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`  ${k}: ${v} (${(100 * v / Math.max(1, dtot)).toFixed(0)}%)`);
