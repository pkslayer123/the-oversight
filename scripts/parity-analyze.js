#!/usr/bin/env node
// parity-analyze.js — coverage table from parity-sweep-results.json.
// Usage: node scripts/parity-analyze.js [results.json]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const IN = process.argv[2] || path.join(ROOT, 'scripts', 'parity-sweep-results.json');
const rows = JSON.parse(fs.readFileSync(IN, 'utf8'));
const data = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', f), 'utf8'));
const abilities = data('abilities.json');
const monsters = data('monsters.json');
const contests = data('contests.json');
const synergies = data('synergies.json');
const recipes = data('recipes.json');
const seRaw = data('statusEffects.json');
const diseases = (Array.isArray(seRaw) ? seRaw : (seRaw.effects || seRaw.statusEffects || Object.values(seRaw))).filter(s => (s && (s.seIsDisease || s.pool)));

const agg = {}, argAgg = {};
for (const r of rows) {
  for (const [k, v] of Object.entries(r.util || {})) {
    (agg[k] = agg[k] || { n: 0, runs: 0 });
    agg[k].n += v.n; agg[k].runs++;
    argAgg[k] = argAgg[k] || {};
    for (const [a, c] of Object.entries(v.args || {})) argAgg[k][a] = (argAgg[k][a] || 0) + c;
  }
}
const N = rows.length;
const pct = (x) => ((100 * x / N).toFixed(1) + '%');
const verdict = (runs, minN) => runs === 0 ? 'DEAD' : (runs < N * 0.05 || agg[0] < 1) ? (runs / N < 0.15 ? 'marginal' : 'reached') : 'reached';
const vFor = (k) => {
  const a = agg[k]; if (!a || a.n === 0) return 'DEAD';
  const r = a.runs / N;
  return r >= 0.15 ? 'reached' : 'marginal';
};
console.log(`runs=${N}\n`);
console.log('### System coverage');
const ORDER = ['ability_use','ability_use_event','synergy_unlock','synergy_tease','contest_fire','contest_resolve','contest_learn','show_fire','ratings_summons','comms_call','comms_runner','comms_signal','comms_relay','comms_cry','beg_answer','raid_answer','succession_answer','succession_beat','aid_village','petition_open','petition_moot','splinter','haven_tierup','trial_check','trial_complete','craft','preserve_smoke','cook','render','pemmican','sentiment_teach','sentiment_channel','cheat_death','cheat_phoenix','cheat_phoenix_v','topic2','feast_host','feast_burn','sq_offer','sq_check','ap_roll','ap_encounter','ap_group','combat_start','wave_kill','encounter_check','cast_monster','mon_turn','field_fight','link_form','switchboard','switch_cand','raid','raid_pillage','alien_loot','alien_loot_rev','table','corrupt_tick','corrupt_beat','cannibal_norm','trap_set','fish_act','water_filter','folk_cure','bury','camp_break','comms_tick','va_daily','ap_daily','wave_unlock'];
for (const k of ORDER) {
  const a = agg[k];
  if (!a) console.log(k.padEnd(20), 'MISSING-WRAP'.padEnd(12));
  else console.log(k.padEnd(20), vFor(k).padEnd(12), String(a.n).padStart(6), 'fires', pct(a.runs), 'of runs');
}
console.log('\n### Abilities (granted / used)');
const gr = argAgg['tele:ability_granted'] || {}, us = argAgg['ability_use'] || {};
const abIds = abilities.map(a => a.id);
for (const id of abIds) {
  const g = gr[id] || 0, u = us[id] || 0;
  if (g === 0 && u === 0) console.log('DEAD', id);
}
console.log('granted-distinct:', Object.keys(gr).length, 'used-distinct:', Object.keys(us).length, 'of', abIds.length);
console.log('\n### Monsters (faced=mon_turn/combat args / killed=wave_kill args)');
const mt = argAgg['mon_turn'] || {}, cs = argAgg['combat_start'] || {}, wk = argAgg['wave_kill'] || {};
for (const m of monsters) {
  const t = mt[m.id] || cs[m.id] || 0, k = wk[m.id] || 0;
  if (t === 0 && k === 0) console.log('DEAD(wave'+m.wave+')', m.id);
}
console.log('\n### Contests fired');
const cf = argAgg['contest_fire'] || {};
for (const c of contests) if (!cf[c.id]) console.log('DEAD', c.id);
console.log('fired-distinct:', Object.keys(cf).length, 'of', contests.length);
console.log('\n### Shows fired');
const sf = argAgg['show_fire'] || {};
console.log('show ids seen:', JSON.stringify(sf));
console.log('\n### Trials (checked / completed)');
const tc = argAgg['trial_check'] || {};
console.log('trial ids checked:', JSON.stringify(tc, null, 1).slice(0, 2000));
console.log('\n### Recipes crafted');
const cr = argAgg['craft'] || {};
for (const r of recipes) if (!cr[r.id]) console.log('DEAD', r.id);
console.log('\n### Diseases seen / cured');
console.log('disease args:', JSON.stringify(argAgg['tele:disease'] || {}));
console.log('cured:', JSON.stringify(argAgg['tele:cured'] || {}), 'folk_cure n:', (agg['folk_cure']||{n:0}).n);
console.log('\n### Synergies');
console.log('unlock args:', JSON.stringify(argAgg['synergy_unlock'] || {}));
console.log('tease args:', JSON.stringify(argAgg['synergy_tease'] || {}));
console.log('\n### Alien loot');
console.log('dropped:', JSON.stringify(argAgg['tele:loot_dropped'] || {}));
console.log('taken:', JSON.stringify(argAgg['tele:loot_taken'] || {}).slice(0, 1200));
console.log('\n### tele death causes');
console.log(JSON.stringify(argAgg['tele:death'] || {}, null, 1).slice(0, 1500));
console.log('\n### end states: rank, wave, won, gate');
const ranks = {}, waves = {};
let won = 0, gate = 0;
for (const r of rows) { ranks[r.rank] = (ranks[r.rank] || 0) + 1; waves[r.maxWave] = (waves[r.maxWave] || 0) + 1; if (r.won) won++; if (r.gate) gate++; }
console.log('ranks:', JSON.stringify(ranks), 'waves:', JSON.stringify(waves), 'won:', won, 'gate:', gate);
