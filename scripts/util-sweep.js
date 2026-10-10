#!/usr/bin/env node
// util-sweep.js — utilization audit for The Oversight (bal-util, 2026-10-10).
// Wraps Game entry points across the auditor's territory (abilities,
// synergies, knowledge lanes, contests/shows, quests, gossip topics, items,
// combat counter-verbs, haven tiers, comms, village-agency beats, godhood
// death-cheats, diseases, fan clubs, broadcast summons, alien players) and
// runs organic competent + progress policies over 200-day games.
// Output: JSON rows with per-run hit counters + end-state snapshot.
// Usage: SEEDS="1-60" POLICIES="competent,progress" DAYS=200 OUT=... node scripts/util-sweep.js
'use strict';
const fs = require('fs');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const idle = require('./policies/idle');
const { competent } = require('./policies/competent');
const { progress } = require('./progress-policy');
const { withRoads } = require('./util-roads');

const POLICIES = { competent, progress, mvc: idle.mvc, 'competent+roads': withRoads(competent) };

// [method, label, argIndexOrFn]
const WRAPS = [
  ['useAbility', 'ability_use', 0],
  ['noteAbilityUse', 'ability_use_event', 0],
  ['unlockSynergy', 'synergy_unlock', 0],
  ['synergyTease', 'synergy_tease', 0],
  ['fireContest', 'contest_fire', (a) => (a && a.id) || '?'],
  ['fireShow', 'show_fire', (a) => (a && (a.id || a.name)) || '?'],
  ['fireRatingsSummons', 'ratings_summons', null],
  ['resolveContest', 'contest_resolve', null],
  ['contestLearn', 'contest_learn', 0],
  ['callForHelp', 'comms_call', 0],
  ['aidSendRunner', 'comms_runner', null],
  ['aidSignalFire', 'comms_signal', null],
  ['aidSystemRelay', 'comms_relay', null],
  ['aidCry', 'comms_cry', 0],
  ['openPetition', 'petition_open', null],
  ['conductPetitionMoot', 'petition_moot', null],
  ['fireSplinter', 'splinter', null],
  ['answerBeg', 'beg_answer', 0],
  ['answerRaidDefense', 'raid_answer', 0],
  ['answerSuccession', 'succession_answer', 0],
  ['stageSuccessionBeat', 'succession_beat', null],
  ['aidVillage', 'aid_village', 0],
  ['havenTierUp', 'haven_tierup', null],
  ['apRollEncounter', 'ap_roll', null],
  ['apStartEncounter', 'ap_encounter', 0],
  ['apStartGroupEncounter', 'ap_group', null],
  ['checkTrial', 'trial_check', 0],
  ['completeTrial', 'trial_complete', null],
  ['craft', 'craft', 0],
  ['teachSentiment', 'sentiment_teach', null],
  ['channelSentiment', 'sentiment_channel', null],
  ['maybeCheatDeath', 'cheat_death', null],
  ['topic2Ask', 'topic2', 1],
  ['tbPlayerStudy', 'ctr_study', null],
  ['tbPlayerScream', 'ctr_scream', null],
  ['tbPlayerFlip', 'ctr_flip', null],
  ['tbPlayerShout', 'ctr_shout', null],
  ['tbPlayerOfferFood', 'ctr_offerfood', null],
  ['tbPlayerGravityWell', 'ctr_gravwell', null],
  ['hostFeast', 'feast_host', null],
  ['offerSystemQuest', 'sq_offer', null],
  ['checkSystemQuest', 'sq_check', null],
  ['askAbout', 'ask_about', 1],
  ['backMonsterName', 'name_back', 1],
  ['npcGossipAbout', 'gossip_npc', 0],
  ['apDailyTick', 'ap_daily', null],
  ['commsTick', 'comms_tick', null],
  ['villageAgencyDaily', 'va_daily', null],
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
    if (typeof orig !== 'function') { util.missing = util.missing || []; util.missing.push(name); continue; }
    Game[name] = function (...args) {
      const u = util.labels[label] || (util.labels[label] = { n: 0, args: {} });
      u.n++;
      const a = argOf(spec, args);
      if (a != null) u.args[a] = (u.args[a] || 0) + 1;
      return orig.apply(this, args);
    };
  }
  // tele() event stream: count by type (disease, cured, contest_fired, show_aired, ...)
  const origTele = Game.tele;
  if (typeof origTele === 'function') {
    Game.tele = function (type, data) {
      const u = util.labels['tele:' + type] || (util.labels['tele:' + type] = { n: 0, args: {} });
      u.n++;
      try {
        if (type === 'disease' && data && data.id) u.args[data.id] = (u.args[data.id] || 0) + 1;
        if (type === 'contest_fired' && data && data.id) u.args[data.id] = (u.args[data.id] || 0) + 1;
        if (type === 'show_aired' && data && (data.id || data.name)) u.args[data.id || data.name] = (u.args[data.id || data.name] || 0) + 1;
        if (type === 'ability_granted' && data && data.id) u.args[data.id] = (u.args[data.id] || 0) + 1;
      } catch (e) {}
      return origTele.apply(this, arguments);
    };
  }
}

function snapshot(Game, util, result) {
  const s = { days: 0, abilities: [], synergies: [], havenTier: 0, fanClubs: null,
    lanes: { plants: 0, plantsL2: 0, plantsL3: 0, animals: 0, monsters: 0, techs: 0, skills: 0 },
    items: 0, itemIds: [], endReason: result.endReason };
  try {
    const sch = Game.state.scholar || {};
    s.days = sch.day || 0;
    s.abilities = (sch.abilities || []).map(a => (a && a.id) || a).filter(Boolean);
    s.synergies = sch.synergies || [];
    const cx = Game.state.codex || {};
    const plants = cx.plants || {};
    s.lanes.plants = Object.keys(plants).length;
    for (const e of Object.values(plants)) {
      if ((e.level || 0) >= 3) s.lanes.plantsL3++;
      else if ((e.level || 0) >= 2) s.lanes.plantsL2++;
    }
    s.lanes.animals = Object.keys(cx.animals || {}).length;
    s.lanes.monsters = Object.keys(cx.monsters || {}).length;
    s.lanes.techs = Object.keys((sch.codex || {}).techniques || {}).length;
    s.lanes.skills = Object.keys((Game.state.codex || {}).skills || {}).length;
    const inv = sch.inventory || [];
    s.items = inv.length;
    s.itemIds = [...new Set(inv.map(i => (i && (i.itemId || i.id || i.name)) || '?'))].slice(0, 200);
  } catch (e) {}
  try { s.havenTier = Game.havenTier(); } catch (e) {}
  try {
    const ap = (Game.apState && Game.apState()) || {};
    if (ap.fanClubs) s.fanClubs = ap.fanClubs;
  } catch (e) {}
  return s;
}

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-60').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-60');
  const policyIds = (process.env.POLICIES || 'competent,progress').split(',').map(x => x.trim());
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || '/tmp/util-sweep.json';
  const rows = [];
  const t0 = Date.now();
  let runN = 0; const total = seeds.length * policyIds.length;
  for (const pid of policyIds) {
    const base = POLICIES[pid];
    if (!base) { console.log('unknown policy ' + pid); continue; }
    for (const seed of seeds) {
      const util = { labels: {}, missing: [] };
      const { Game } = await loadGame({ seed, mode: pid });
      instrument(Game, util);
      await setupGame(Game);
      const result = await runDays(Game, base, { days });
      const end = snapshot(Game, util, result);
      rows.push({ seed, policy: pid, util: util.labels, missing: util.missing, end, ms: result.ms });
      runN++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${runN}/${total} ${el}s] seed ${seed} ${pid}: ${result.endReason} d${end.days} ab:${end.abilities.length} syn:${end.synergies.length} tier:${end.havenTier}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows));
  console.log('wrote ' + OUT);
})();
