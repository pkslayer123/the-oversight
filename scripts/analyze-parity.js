#!/usr/bin/env node
// analyze-parity.js — build the villager-vs-player PARITY MATRIX from a
// sweep-parity results file. Usage: node scripts/analyze-parity.js [results.json]
'use strict';
const path = require('path');
const F = process.argv[2] || path.join(__dirname, 'sweep-parity-results.json');
const rows = require(F);

const sum = (rs, f) => rs.reduce((t, r) => t + (f(r) || 0), 0);
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const nz = (rs, f) => rs.filter(r => (f(r) || 0) > 0).length;

function villagerLearnTotal(r) {
  return Object.values(r.villagerLearn || {}).reduce((t, x) => t + x, 0);
}
function villagerGrantTotal(r) {
  return Object.values(r.grants || {}).reduce((t, x) => t + x, 0);
}
function fightsTotal(r) { return (r.fieldFights || {}).total || 0; }
function dutyTotal(r) {
  const p = r.production || {};
  return ['forage', 'fish', 'garden', 'hunt', 'wood', 'water', 'stone', 'patrol', 'scout', 'teach', 'mend', 'tend', 'cook']
    .reduce((t, k) => t + (p[k] || 0), 0);
}

const MECHANICS = [
  ['Abilities granted', r => r.playerAbilityGrants, r => villagerGrantTotal(r), 'grants'],
  ['Ability uses (combat/field)', r => r.playerAbilityUse, r => 0, 'uses'],
  ['Synergies unlocked', r => r.synergy, r => 0, 'unlocks'],
  ['Knowledge learned (plants)', r => r.playerLearn, r => villagerLearnTotal(r), 'learn events'],
  ['Teaching given', r => r.playerTeaches, r => (r.villagerTeachPlayer || {}).plant + (r.villagerTeachPlayer || {}).monster, 'lessons'],
  ['System quests offered', r => r.quests.offered, r => 0, 'offers'],
  ['System quests completed', r => r.quests.completed, r => 0, 'completions'],
  ['Villager errands offered', r => 0, r => r.quests.villagerAccepted, 'offers'],
  ['Feasts hosted', r => r.feast, r => 0, 'feasts'],
  ['Aid cries sent', r => r.cry + r.signal + r.runner + r.sysrelay, r => 0, 'calls'],
  ['Petitions opened', r => r.petitions.openedByPlayer, r => r.petitions.openedByVillager, 'petitions'],
  ['Petition moots conducted', r => 0, r => r.petitions.moots, 'moots'],
  ['Contests played', r => r.contests.playerPlays, r => 0, 'plays'],
  ['Contest resolutions (villager)', r => 0, r => r.contests.villagerResolved, 'resolutions'],
  ['Ratings summons', r => r.ratingsSummons, r => 0, 'summons'],
  ['Party invites (player-led)', r => r.party.playerInvites, r => 0, 'invites'],
  ['Expeditions (villager-led)', r => 0, r => r.party.villagerExpeditions, 'expeditions'],
  ['Fights (blow-by-blow)', r => r.playerFights, r => fightsTotal(r), 'fights'],
  ['Grid actions (villagerTurn)', r => 0, r => r.npcTakeActionHits, 'npc actions'],
  ['Duty production (real depletion)', r => 0, r => dutyTotal(r), 'duty tasks'],
  ['Abstract production', r => 0, r => (r.production || {}).abstract, 'abstract rolls'],
  ['Player forage actions', r => (r.playerAction || {}).forage || 0, r => 0, 'forage acts'],
  ['Crafting', r => r.craft.player, r => r.craft.villager, 'crafts'],
  ['Traps set', r => r.traps.setByPlayer, r => 0, 'traps'],
  ['Trade', r => r.trade, r => 0, 'trades'],
  ['Objectives assigned', r => 0, r => r.objectives.assigned, 'objectives'],
  ['Corruption ticks', r => r.corruption.player, r => r.corruption.villager, 'ticks'],
  ['Disease applications', r => r.disease.player, r => r.disease.villager, 'applications'],
  ['Switchboard appointed', r => r.switchboard, r => 0, 'appointments'],
  ['Phoenix triggers', r => r.phoenix.playerTrigger, r => r.phoenix.villagerTrigger, 'triggers'],
];

const policies = [...new Set(rows.map(r => r.policy))];
console.log(`=== PARITY MATRIX (${rows.length} runs) ===\n`);
for (const pid of policies) {
  const rs = rows.filter(r => r.policy === pid);
  console.log(`--- policy: ${pid} (n=${rs.length}, med days ${med(rs.map(r => r.days))}) ---`);
  console.log('mechanic'.padEnd(34) + 'player'.padStart(10) + 'villager'.padStart(10) + '  runsP>0 runsV>0  verdict');
  for (const [label, pf, vf, unit] of MECHANICS) {
    const ps = sum(rs, pf), vs = sum(rs, vf);
    const rp = nz(rs, pf), rv = nz(rs, vf);
    let verdict = '';
    if (ps > 0 && vs > 0) verdict = 'PARITY (both sides exercise it)';
    else if (ps === 0 && vs === 0) verdict = 'idle (neither side in these runs)';
    else if (ps > 0 && vs === 0) verdict = '<<< GAP: player-only';
    else verdict = '>>> villager-only (player has no equivalent)';
    console.log(label.padEnd(34) + String(ps).padStart(10) + String(vs).padStart(10) + `  ${String(rp).padStart(3)}/${rs.length} ${String(rv).padStart(3)}/${rs.length}  ${verdict}`);
  }
  // field fight outcome detail
  const ff = { evade: 0, vKill: 0, mFlee: 0, vFlee: 0, vDie: 0, alreadyDead: 0 };
  for (const r of rs) for (const k of Object.keys(ff)) ff[k] += ((r.fieldFights || {})[k] || 0);
  console.log('  villager field-fight outcomes:', JSON.stringify(ff));
  // xp tracks
  const xp = { combat: 0, field: 0, social: 0, craft: 0 };
  for (const r of rs) for (const k of Object.keys(xp)) xp[k] += ((r.xp || {})[k] || 0);
  console.log('  villager XP accrued:', JSON.stringify(xp));
  // top granted abilities
  const g = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.grants || {})) g[k] = (g[k] || 0) + v;
  const gt = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log('  villager ability grants:', gt || '(none)');
  // pantry sources
  const pan = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.pantry || {})) pan[k] = (pan[k] || 0) + v;
  const pt = Object.entries(pan).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round(v / 1000)}k`).join(' ');
  console.log('  pantry sources (kcal):', pt || '(none)');
  // activity class distribution
  const ac = {};
  for (const r of rs) for (const [k, v] of Object.entries((r.activity || {}).byClass || {})) ac[k] = (ac[k] || 0) + v;
  console.log('  villager day-classes:', JSON.stringify(ac));
  // free streaks
  const streaks = [];
  for (const r of rs) for (const s of Object.values((r.activity || {}).streaks || {})) streaks.push(s.maxFree || 0);
  console.log('  villager max-free-streak: med', med(streaks), 'max', streaks.length ? Math.max(...streaks) : 0);
  // objectives end-state
  const oe = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.objectivesEnd || {})) oe[k] = (oe[k] || 0) + v;
  console.log('  objective end-states:', JSON.stringify(oe));
  console.log('');
}
