#!/usr/bin/env node
// parity-sweep.js — Worker B reachability sweep (2026-10-10).
// Instruments a wide net of Game entry points + end-state coverage over
// long organic runs (200-day cap), competent + progress + competent+roads.
// Verdict: every system/beat/item/ability/monster mechanic that NEVER fires
// is a reachability defect ("Everything built must be reachable").
// Usage: SEEDS="1-24" POLICIES="competent,roads,progress" DAYS=200 OUT=... node scripts/parity-sweep.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');
const { progress } = require('./policies/progress-r4');
const { withRoads } = require('./util-roads');

const POLICIES = { competent, roads: withRoads(competent), progress };

// [method, label, argFn-or-index]
const WRAPS = [
  ['useAbility', 'ability_use', 0],
  ['noteAbilityUse', 'ability_use_event', 0],
  ['unlockSynergy', 'synergy_unlock', 0],
  ['synergyTease', 'synergy_tease', 0],
  ['fireContest', 'contest_fire', a => (a && a.id) || '?'],
  ['resolveContest', 'contest_resolve', null],
  ['contestLearn', 'contest_learn', 0],
  ['fireShow', 'show_fire', a => (a && (a.id || a.name)) || '?'],
  ['fireRatingsSummons', 'ratings_summons', null],
  ['callForHelp', 'comms_call', 0],
  ['aidSendRunner', 'comms_runner', null],
  ['aidSignalFire', 'comms_signal', null],
  ['aidSystemRelay', 'comms_relay', null],
  ['aidCry', 'comms_cry', 0],
  ['answerBeg', 'beg_answer', 0],
  ['answerRaidDefense', 'raid_answer', 0],
  ['answerSuccession', 'succession_answer', 0],
  ['stageSuccessionBeat', 'succession_beat', null],
  ['aidVillage', 'aid_village', 0],
  ['openPetition', 'petition_open', null],
  ['conductPetitionMoot', 'petition_moot', null],
  ['fireSplinter', 'splinter', null],
  ['havenTierUp', 'haven_tierup', null],
  ['checkTrial', 'trial_check', 0],
  ['completeTrial', 'trial_complete', null],
  ['craft', 'craft', 0],
  ['preserveFood', 'preserve_smoke', null],
  ['cookFood', 'cook', null],
  ['renderFat', 'render', null],
  ['makePemmican', 'pemmican', null],
  ['teachSentiment', 'sentiment_teach', null],
  ['channelSentiment', 'sentiment_channel', null],
  ['maybeCheatDeath', 'cheat_death', null],
  ['phoenixPlayerTrigger', 'cheat_phoenix', null],
  ['phoenixVillagerTrigger', 'cheat_phoenix_v', null],
  ['topic2Ask', 'topic2', 1],
  ['hostFeast', 'feast_host', null],
  ['feastBurn', 'feast_burn', null],
  ['offerSystemQuest', 'sq_offer', 0],
  ['checkSystemQuest', 'sq_check', null],
  ['apRollEncounter', 'ap_roll', null],
  ['apStartEncounter', 'ap_encounter', 0],
  ['apStartGroupEncounter', 'ap_group', null],
  ['startCombat', 'combat_start', a => (a && (a.id || a.name)) || '?'],
  ['recordWaveKill', 'wave_kill', 0],
  ['checkEncounter', 'encounter_check', null],
  ['castMonster', 'cast_monster', a => (a && (a.id || a.name)) || '?'],
  ['monsterTurn', 'mon_turn', a => (a && (a.id || a.name)) || '?'],
  ['fieldFight', 'field_fight', null],
  ['linkWith', 'link_form', null],
  ['switchboard', 'switchboard', null],
  ['switchboardCandidates', 'switch_cand', null],
  ['raidVillage', 'raid', null],
  ['raidPillage', 'raid_pillage', null],
  ['alienLootGrant', 'alien_loot', (a, args) => (a && a.tier) || '?'],
  ['alienLootReveal', 'alien_loot_rev', null],
  ['tableScene', 'table', null],
  ['corruptionTick', 'corrupt_tick', null],
  ['corruptionThresholdBeat', 'corrupt_beat', 0],
  ['cannibalNorm', 'cannibal_norm', null],
  ['setTrap', 'trap_set', null],
  ['fish', 'fish_act', null],
  ['filterWater', 'water_filter', null],
  ['folkRemedy', 'folk_cure', null],
  ['buryCorpse', 'bury', null],
  ['breakCamp', 'camp_break', null],
  ['commsTick', 'comms_tick', null],
  ['villageAgencyDaily', 'va_daily', null],
  ['apDailyTick', 'ap_daily', null],
  ['waveUnlockBeat', 'wave_unlock', 0],
];

function argOf(spec, args) {
  if (spec == null) return null;
  if (typeof spec === 'function') { try { return String(spec(args[0], args)); } catch (e) { return '?'; } }
  const v = args[spec];
  if (v == null) return null;
  if (typeof v === 'object') return String(v.id || v.name || '?');
  return String(v);
}

function instrument(Game, util) {
  for (const [name, label, spec] of WRAPS) {
    const orig = Game[name];
    if (typeof orig !== 'function') { (util.missing = util.missing || []).push(name); continue; }
    Game[name] = function (...args) {
      const u = util.labels[label] || (util.labels[label] = { n: 0, args: {} });
      u.n++;
      const a = argOf(spec, args);
      if (a != null) u.args[a] = (u.args[a] || 0) + 1;
      return orig.apply(this, args);
    };
  }
}


function instrumentTele(Game, util) {
  const orig = Game.tele;
  if (typeof orig !== 'function') return;
  const ARGID = ['disease','cured','contest_fired','contest_end','show_aired','ability_granted','combat_start','combat_end','death','loot_taken','loot_dropped','fish','forage','scavenge','eat','integrate','trust','villager_grant'];
  Game.tele = function (type, data) {
    const u = util.labels['tele:'+type] || (util.labels['tele:'+type] = { n: 0, args: {} });
    u.n++;
    try {
      const id = data && (data.id || data.cause || data.reason || data.who);
      if (id != null) u.args[String(id)] = (u.args[String(id)] || 0) + 1;
    } catch (e) {}
    return orig.apply(this, arguments);
  };
}
;function snapshot(Game, ctx) {
  const s = { days: 0, endReason: '', abilities: [], synergies: [], trials: [],
    lanes: {}, havenTier: 0, rank: '?', maxWave: 1, gate: false, won: false,
    items: [], diseases: [], cures: 0, codes: {} };
  try {
    const sch = Game.state.scholar || {};
    s.days = sch.day || 0;
    s.abilities = (sch.abilities || []).map(a => (a && a.id) || a).filter(Boolean);
    s.synergies = sch.synergies || [];
    s.trials = (sch.trials || []).map(t => (t && t.id) || t).filter(Boolean);
    s.codes = sch.codes || {};
  } catch (e) {}
  const cx = (Game.state || {}).codex || {};
  for (const lane of ['plants','animals','monsters','techs','skills','items','diseases']) {
    try { s.lanes[lane] = Object.keys(cx[lane] || {}).length; } catch (e) { s.lanes[lane] = 0; }
  }
  try { s.havenTier = Game.havenTier ? Game.havenTier() : 0; } catch (e) {}
  try { s.rank = Game.scaleRank ? Game.scaleRank() : '?'; } catch (e) {}
  try { s.maxWave = Game.unlockedWave ? Game.unlockedWave() : 1; } catch (e) {}
  try { const g = Game.deedGateReady ? Game.deedGateReady() : null; if (g) s.gate = !!g.ok; } catch (e) {}
  try { s.won = !!Game.won; } catch (e) {}
  try { s.items = (sch.items || []).map(i => (i && (i.id || i.name)) || i).filter(Boolean).slice(0, 40); } catch (e) {}
  try { s.diseases = Object.keys((Game.state.scholar || {}).diseases || {}); } catch (e) {}
  try { s.curedN = (Game.state.scholar || {}).curedN || 0; } catch (e) {}
  return s;
}

function parseSeeds(str) {
  const out = [];
  for (const p of String(str || '1-24').split(',')) {
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.push(i); else if (p.trim()) out.push(+p.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-24');
  const pids = (process.env.POLICIES || 'competent,roads,progress').split(',').map(s => s.trim());
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'parity-sweep-results.json');
  const rows = [];
  const t0 = Date.now();
  let runN = 0, total = seeds.length * pids.length;
  for (const pid of pids) {
    const base = POLICIES[pid];
    if (!base) { console.log('unknown policy ' + pid); continue; }
    for (const seed of seeds) {
      const { Game } = await loadGame({ seed, mode: pid });
      await setupGame(Game);
      const util = { labels: {}, missing: [] };
      instrument(Game, util); instrumentTele(Game, util);
      const result = await runDays(Game, base, { days });
      const end = snapshot(Game, null);
      end.endReason = result.endReason;
      rows.push({ seed, policy: pid, ms: result.ms, days: end.days,
        endReason: result.endReason, abilities: end.abilities, synergies: end.synergies,
        trials: end.trials, lanes: end.lanes, havenTier: end.havenTier, rank: end.rank,
        maxWave: end.maxWave, gate: end.gate, won: end.won, diseases: end.diseases,
        curedN: end.curedN, items: end.items, util: util.labels, missing: util.missing });
      runN++;
      console.log(`[${runN}/${total} ${((Date.now()-t0)/1000).toFixed(0)}s] seed ${seed} ${pid}: ${result.endReason} d${end.days} rank=${end.rank} w${end.maxWave} ab${end.abilities.length}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log('wrote ' + OUT);
})();
