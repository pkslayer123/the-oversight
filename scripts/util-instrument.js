#!/usr/bin/env node
// util-instrument.js — utilization instrumentation for sweeps (extracted from
// sweep-oraclev2-20261010.js, 2026-10-10). Wraps Game methods (READ-ONLY game
// code — no src edits) and counts ability uses, kills, crafts, traps, feasts,
// aid quests, and summons choices into ctx.util.
//
// UTIL_LEVEL (env): 'full' (default) = all wraps, as the round-3 oracle sweep
// ran them; 'light' = only the cheap aggregate counters, dropping the
// per-turn hot paths (useAbility, the villagerTurn phase flag,
// checkSynergyDiscovery); 'off' = no wraps at all (ctx.util stays zeros).
// Sweeps that don't analyze utilization should set UTIL_LEVEL=off — the full
// wrap set costs a few percent per seed (measured 2026-10-10, see docs/SIM-PERF.md).
'use strict';

const ZERO_UTIL = {
  abilityUses: 0, abilityPlayer: 0, abilityVillager: 0,
  synergyDiscoveries: 0, kills: 0, counterKills: 0,
  crafts: 0, craftsOk: 0, trapsSet: 0, trapCatches: 0,
  feasts: 0, feastsOk: 0, aidCries: 0,
  aidOffers: 0, aidAccepted: 0, aidHanded: 0, reliefSpent: 0,
  summonsSeen: 0, summonsStunt: 0, summonsPhone: 0, summonsRefuse: 0,
  systemQuests: 0,
};

// instrument(Game, ctx, level) -> ctx.util
function instrument(Game, ctx, level) {
  level = level || process.env.UTIL_LEVEL || 'full';
  const U = ctx.util = Object.assign({}, ZERO_UTIL);
  if (level === 'off') return U;
  const light = level === 'light';
  const wrap = (name, fn) => {
    const o = Game[name];
    if (typeof o !== 'function') return false;
    Game[name] = function () { return fn.call(this, o, Array.prototype.slice.call(arguments)); };
    return true;
  };
  if (!light) {
    // player/villager split for ability uses: flag the villager phase.
    const vt = Game.villagerTurn;
    if (typeof vt === 'function') {
      Game.villagerTurn = function () {
        Game._utilVillagerPhase = true;
        try { return vt.apply(this, arguments); }
        finally { Game._utilVillagerPhase = false; }
      };
    }
    wrap('useAbility', function (orig, a) {
      U.abilityUses++;
      if (Game._utilVillagerPhase) U.abilityVillager++; else U.abilityPlayer++;
      return orig.apply(this, a);
    });
    wrap('checkSynergyDiscovery', function (orig, a) {
      const before = (((Game.state || {}).scholar || {}).synergies || []).length;
      const r = orig.apply(this, a);
      const after = (((Game.state || {}).scholar || {}).synergies || []).length;
      if (after > before) U.synergyDiscoveries += (after - before);
      return r;
    });
  }
  wrap('recordWaveKill', function (orig, a) {
    const mid = a[0];
    let known = false;
    try { known = !!Game.monsterCounterKnown(mid); } catch (e) {}
    const r = orig.apply(this, a);
    U.kills++;
    if (known) U.counterKills++;
    return r;
  });
  wrap('craft', function (orig, a) {
    U.crafts++;
    const r = orig.apply(this, a);
    if (r) U.craftsOk++;
    return r;
  });
  wrap('setTrap', function (orig, a) { U.trapsSet++; return orig.apply(this, a); });
  if (!light) {
    wrap('foodCarcass', function (orig, a) {
      if (a[3] === 'trapped') U.trapCatches++;
      return orig.apply(this, a);
    });
  }
  wrap('hostFeast', function (orig, a) {
    U.feasts++;
    const r = orig.apply(this, a);
    if (typeof r === 'string' && r.indexOf('held') >= 0) U.feastsOk++;
    return r;
  });
  wrap('aidCry', function (orig, a) { U.aidCries++; return orig.apply(this, a); });
  wrap('offerAidQuest', function (orig, a) { U.aidOffers++; return orig.apply(this, a); });
  wrap('answerAidQuest', function (orig, a) {
    const r = orig.apply(this, a);
    if (a[0] === 'accept' && r && r !== 'refused') U.aidAccepted++;
    return r;
  });
  wrap('handInAidQuest', function (orig, a) {
    const r = orig.apply(this, a);
    if (r && r !== 'short') U.aidHanded++; // 'short' is an honest refusal, not a hand-in
    return r;
  });
  wrap('answerRelief', function (orig, a) {
    const r = orig.apply(this, a);
    if (r && ['used', 'noneed', 'short', null].indexOf(r) < 0) U.reliefSpent++;
    return r;
  });
  wrap('contestChoose', function (orig, a) {
    try {
      const ac = Game.state.activeContest;
      if (ac && ac.kind === 'summons') {
        U.summonsSeen++;
        const idx = a[0] | 0;
        if (idx === 0) U.summonsStunt++;
        else if (idx === 1) U.summonsPhone++;
        else U.summonsRefuse++;
      }
    } catch (e) {}
    return orig.apply(this, a);
  });
  return U;
}

module.exports = { instrument, ZERO_UTIL };
