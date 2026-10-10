#!/usr/bin/env node
// parity-instr.js — villager-vs-player parity counters for The Oversight.
// Wraps Game methods (chain-safe, counting only) and tags each event with
// actor: 'villager' (vid arg) vs 'player' (scholar state).
// Usage:
//   const { instrumentParity, counterSummary } = require('./parity-instr');
//   const P = instrumentParity(Game);   // after loadGame, before runDays
//   ... run ...
//   P.snapshot();                        // returns the counters
'use strict';

function mk() { return {}; }
function bump(o, k, n) { o[k] = (o[k] || 0) + (n == null ? 1 : n); }

function instrumentParity(Game) {
  const C = {
    xp: { combat: 0, field: 0, social: 0, craft: 0 },       // villagerGainXP (villager)
    grants: {},                                            // npcGrantAbility per ability id
    playerAbilityGrants: 0,                                // chooseAbility
    playerAbilityUse: 0,                                   // noteAbilityUse (player only)
    fieldFights: { evade: 0, vKill: 0, mFlee: 0, vFlee: 0, vDie: 0, alreadyDead: 0, total: 0 },
    playerFights: 0,                                       // startCombat
    synergy: 0,                                            // unlockSynergy
    villagerLearn: {},                                     // villagerLearnsPlant by 'how'
    playerLearn: 0,                                        // identifyPlant/grantKnowledge(player)
    villagerTeachPlayer: { plant: 0, monster: 0 },         // agencyTeachPlant/Monster
    playerTeaches: 0,                                      // player teach action -> villager
    feast: 0,                                              // hostFeast
    cry: 0, signal: 0, runner: 0, sysrelay: 0,             // callForHelp tiers
    quests: { offered: 0, villagerAccepted: 0, completed: 0 },
    petitions: { openedByPlayer: 0, openedByVillager: 0, moots: 0 },
    ratingsSummons: 0,                                     // player-only summons
    contests: { playerPlays: 0, villagerResolved: 0 },
    party: { playerInvites: 0, villagerExpeditions: 0 },
    production: {                                          // duty tasks (villager)
      forage: 0, fish: 0, garden: 0, hunt: 0, wood: 0, water: 0, stone: 0,
      patrol: 0, scout: 0, teach: 0, mend: 0, tend: 0, cook: 0,
      abstract: 0,                                         // villagerDayProduction
    },
    playerAction: {},                                      // doAction counts by action id
    pantry: {},                                            // stockPantry kcal by src
    craft: { player: 0, villager: 0 },
    traps: { setByPlayer: 0, catches: 0 },
    trade: 0,
    objectives: { assigned: 0, completed: 0 },
    corruption: { player: 0, villager: 0 },
    disease: { player: 0, villager: 0 },
    switchboard: 0,                                       // appointSwitchboard
    phoenix: { playerTrigger: 0, villagerTrigger: 0 },
    npcAct: {},                                           // npcTakeAction branch hits (sampled)
    villagersAliveEnd: 0, villagersTotal: 0,
    deaths: [],
  };

  function wrap(name, fn) {
    const orig = Game[name];
    if (typeof orig !== 'function') { (C.missing = C.missing || []).push(name); return; }
    Game[name] = function (...args) {
      try { fn.apply(C, [this, args]); } catch (e) {}
      return orig.apply(this, args);
    };
  }

  wrap('villagerGainXP', function (G, a) {
    const track = a[1];
    if (C.xp[track] != null) C.xp[track] += (a[2] || 0);
  });
  wrap('npcGrantAbility', function (G, a) { bump(C.grants, String(a[1])); });
  wrap('chooseAbility', function () { C.playerAbilityGrants++; });
  wrap('noteAbilityUse', function () { C.playerAbilityUse++; });
  wrap('fieldFight', function (G, a) {
    const rec = a[3] || {};
    // NOTE: fieldFight returns rec; count at exit instead via second wrap.
  });
  // fieldFight outcome counting: wrap and inspect return value
  (function () {
    const orig = Game.fieldFight;
    if (typeof orig !== 'function') return;
    Game.fieldFight = function (...args) {
      const rec = orig.apply(this, args);
      try {
        C.fieldFights.total++;
        bump(C.fieldFights, rec.outcome || 'unknown');
      } catch (e) {}
      return rec;
    };
  })();
  wrap('startCombat', function () { C.playerFights++; });
  wrap('villagerLearnsPlant', function (G, a) { bump(C.villagerLearn, String(a[2] || 'unknown')); });
  wrap('grantKnowledge', function (G, a) {
    // grantKnowledge(kind, pid, level, opts) — player-side unless opts.villager
    try {
      const opts = a[3] || {};
      if (opts.villager || opts.vid) { /* villager path, counted in villagerLearn via villagerLearnsPlant usually */ }
      else C.playerLearn++;
    } catch (e) {}
  });
  wrap('identifyPlant', function () { C.playerLearn++; });
  wrap('agencyTeachPlant', function () { C.villagerTeachPlayer.plant++; });
  wrap('agencyTeachMonster', function () { C.villagerTeachPlayer.monster++; });
  // player teach action: teachPlant? find: line 2617 villagerLearnsPlant(vid,plantId,'taught')
  wrap('hostFeast', function () { C.feast++; });
  wrap('callForHelp', function (G, a) {
    const t = a[0];
    if (t === 'cry') C.cry++;
    else if (t === 'signal') C.signal++;
    else if (t === 'runner') C.runner++;
    else if (t === 'system') C.sysrelay++;
  });
  wrap('offerSystemQuest', function () { C.quests.offered++; });
  wrap('checkSystemQuest', function () {});
  wrap('unlockSynergy', function () { C.synergy++; });
  wrap('openPetition', function (G, a) {
    // openPetition(pet) — pet.opener? check
    try {
      const pet = a[0] || {};
      if (pet.opener && pet.opener !== G.villagerId) C.petitions.openedByVillager++;
      else C.petitions.openedByPlayer++;
    } catch (e) { C.petitions.openedByPlayer++; }
  });
  wrap('conductPetitionMoot', function () { C.petitions.moots++; });
  wrap('fireRatingsSummons', function () { C.ratingsSummons++; });
  wrap('contestChoose', function () { C.contests.playerPlays++; });
  wrap('contestResolveGroup', function () { C.contests.villagerResolved++; });
  wrap('inviteToParty', function () { C.party.playerInvites++; });
  wrap('startExpedition', function () { C.party.villagerExpeditions++; });
  wrap('villagerDayProduction', function () { C.production.abstract++; });
  wrap('doAction', function (G, a) { bump(C.playerAction, String(a[0] || 'unknown')); });
  wrap('stockPantry', function (G, a) {
    const kcal = a[0] || 0, src = String(a[1] || 'unknown');
    C.pantry[src] = (C.pantry[src] || 0) + kcal;
  });
  wrap('craft', function () { C.craft.player++; });
  wrap('setTrap', function () { C.traps.setByPlayer++; });
  wrap('checkTraps', function () {});
  wrap('appointSwitchboard', function () { C.switchboard++; });
  wrap('phoenixPlayerTrigger', function () { C.phoenix.playerTrigger++; });
  wrap('phoenixVillagerTrigger', function () { C.phoenix.villagerTrigger++; });
  // duty tasks: resolveOneAssignment handles a.task — wrap to count tasks
  wrap('resolveOneAssignment', function (G, a) {
    try {
      const vv = G.state.village || {};
      const asg = (vv.assignments || {})[a[0]];
      if (asg && asg.task) bump(C.production, asg.task);
    } catch (e) {}
  });
  // quest completion: checkSystemQuest completion + quest turn-ins.
  // checkQuest is called per action; detect completion by wrapping the
  // slot-clear: count when activeSystemQuest disappears during the call.
  (function () {
    const orig = Game.checkSystemQuest;
    if (typeof orig !== 'function') return;
    Game.checkSystemQuest = function (...args) {
      const had = !!(this.state.scholar || {}).activeSystemQuest;
      const r = orig.apply(this, args);
      try { if (had && !(this.state.scholar || {}).activeSystemQuest) C.quests.completed++; } catch (e) {}
      return r;
    };
  })();
  wrap('maybeOfferQuest', function () { C.quests.villagerAccepted++; }); // villager errands offered
  // villager objectives: assignment; completions sampled from objState at end
  wrap('objPick', function () { C.objectives.assigned++; });
  // corruption: npc cannibalism vs player cannibalism (eatCannibal)
  wrap('npcCannibalTick', function () { C.corruption.villager++; });
  wrap('eatCannibal', function () { C.corruption.player++; });
  // disease: applyStatus is the single application path — tag by target.
  // contractDisease is the player-only wrapper.
  wrap('applyStatus', function (G, a) {
    try {
      const target = a[0];
      if (target === 'scholar' || target === G.villagerId) C.disease.player++;
      else if (typeof target === 'string' && target) C.disease.villager++;
    } catch (e) {}
  });
  // trade: river trader + link trade ticks
  wrap('tradeRiverTrader', function () { C.trade++; });
  wrap('tradeTick', function () { C.trade++; });

  function snapshot() {
    try {
      const v = Game.state.village || {};
      C.villagersTotal = (v.roster || []).length;
      C.villagersAliveEnd = (v.roster || []).filter(id => {
        try { const p = Game.getPerson(id); return p && !p.dead; } catch (e) { return true; }
      }).length;
      // npc ability holdings at end
      C.npcAbilitiesEnd = {};
      for (const [vid, abs] of Object.entries(v.npcAbilities || {})) {
        if ((abs || []).length) C.npcAbilitiesEnd[vid.slice(0, 8)] = abs.slice();
      }
      // npc XP at end
      C.npcXpEnd = {};
      for (const [vid, x] of Object.entries(v.npcXp || {})) {
        const tot = (x.combat || 0) + (x.field || 0) + (x.social || 0) + (x.craft || 0);
        if (tot > 0) C.npcXpEnd[vid.slice(0, 8)] = { c: x.combat, f: x.field, s: x.social, r: x.craft };
      }
      C.days = (Game.state.scholar || {}).day || 0;
      C.over = !!Game.over;
      // objective state distribution at end
      try {
        const ost = Game.objState ? Game.objState() : {};
        const dist = {};
        for (const [vid, o] of Object.entries(ost)) {
          const st = (o && o.state) || '?';
          dist[st] = (dist[st] || 0) + 1;
        }
        C.objectivesEnd = dist;
      } catch (e) {}
    } catch (e) {}
    return C;
  }

  return { counters: C, snapshot };
}

module.exports = { instrumentParity };
