#!/usr/bin/env node
// bal-waves-sweep-20261010.js — wave-progression reachability measurement.
// Baseline AND post-fix runs: 60 seeds x competent/progress x 100-day cap.
// Measures what reactive play actually produces:
//  - wave-2 encounter/engagement rate (fights started, fled or won)
//  - distinct wave-N monsters ENGAGED vs KILLED per run
//  - day unlockedWave first reaches 3/4/5
//  - ability mastery curve (L3 counts, total uses) + synergy discoveries
//  - feast surge armed (channelSentiment 3-mastered branch) + used
// Read-only w.r.t. game code; instruments via wraps in this script.
// Usage: SEEDS="1-60" POLICIES="competent,progress" DAYS=100 OUT=/tmp/x.json node scripts/bal-waves-sweep-20261010.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require(ROOT + '/scripts/sim-harness');
const idle = require(ROOT + '/scripts/policies/idle');
const { competent } = require(ROOT + '/scripts/policies/competent');
const { progress } = require(ROOT + '/scripts/policies/progress-bal');

const POLICIES = { competent, progress, mvc: idle.mvc };

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-60').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

// distinct engaged counts per wave from the deed feed (real blow-by-blow
// fights started — fled or won; double-tap refusals record nothing)
function engagedByWave(Game) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  try {
    const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
    for (const mid of Object.keys(faced)) {
      const w = faced[mid] | 0;
      if (out[w] != null) out[w]++;
    }
  } catch (e) {}
  return out;
}

function masteryStats(Game) {
  const s = Game.state.scholar || {};
  const allAbs = [...(s.abilities || []), ...(s.backgroundAbilities || [])];
  const l3 = allAbs.filter(a => (a.level || 1) >= 3).length;
  const totalLvl = allAbs.reduce((t, a) => t + (a.level || 1), 0);
  const syns = (s.synergies || []).length;
  const activeSyns = (s.activeSynergies || []).length;
  let res = 0;
  try { res = (Game.progState ? Game.progState().surgeResonance : 0) || 0; } catch (e) {}
  return { nAb: allAbs.length, l3, totalLvl, syns, activeSyns, res };
}

function surgeState(Game) {
  const s = Game.state.scholar || {};
  return { armed: !!((s.prog || {}).feastSurge), used: !!((s.prog || {}).feastSurgeUsed) };
}

function wrap(policy) {
  const p = Object.assign({}, policy);
  const curve = []; // per-5-day samples: {day, uw, eng, kills, m, surge}
  const fightStarts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const abilityUses = {}; // abilityId -> uses
  const unlockDay = {}; // wave -> first day seen
  let capCtx = null;
  const origDaily = policy.daily;
  p.daily = (G, ctx) => {
    capCtx = ctx;
    if (origDaily) { try { origDaily(G, ctx); } catch (e) {} }
    try {
      const day = (G.state.scholar || {}).day || 0;
      const uw = G.unlockedWave ? G.unlockedWave() : 1;
      for (let w = 2; w <= 5; w++) if (uw >= w && !(w in unlockDay)) unlockDay[w] = day;
      if (day % 5 === 0 || G.over) {
        curve.push({ day, uw, eng: engagedByWave(G), kills: Object.assign({}, G.state.waveKills || {}),
          m: masteryStats(G), surge: surgeState(G) });
      }
    } catch (e) {}
  };
  return { p, curve, fightStarts, abilityUses, unlockDay, ctx: () => capCtx };
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-60');
  const policyIds = (process.env.POLICIES || 'competent,progress').split(',').map(s => s.trim());
  const days = parseInt(process.env.DAYS || '100', 10);
  const OUT = process.env.OUT || (ROOT + '/scripts/bal-waves-sweep-results.json');
  const rows = [];
  const t0 = Date.now();
  let runN = 0;
  const totalRuns = seeds.length * policyIds.length;
  for (const pid of policyIds) {
    const base = POLICIES[pid];
    if (!base) { console.log('unknown policy ' + pid); continue; }
    for (const seed of seeds) {
      const { Game } = await loadGame({ seed, mode: pid });
      await setupGame(Game);
      const { p, curve, fightStarts, abilityUses, unlockDay, ctx } = wrap(base);
      const spawns = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      // engagement telemetry: count real fight starts per monster wave
      const _sc = Game.startCombat;
      if (typeof _sc === 'function') {
        Game.startCombat = function (id, ...rest) {
          try {
            const mdef = (this.data.monsters || []).find(m => m.id === id);
            const w = (mdef && mdef.wave) || 1;
            if (fightStarts[w] != null) fightStarts[w]++;
          } catch (e) {}
          return _sc.call(this, id, ...rest);
        };
      }
      // spawn telemetry: monsters placed on the grid per wave (the top of the funnel)
      const _swm = Game.spawnWorldMonster;
      if (typeof _swm === 'function') {
        Game.spawnWorldMonster = function (mdef, ...rest) {
          try {
            const w = (mdef && mdef.wave) || 1;
            if (spawns[w] != null) spawns[w]++;
          } catch (e) {}
          return _swm.call(this, mdef, ...rest);
        };
      }
      // ability-use telemetry: uses per ability id
      const _gxp = Game.gainAbilityXP;
      if (typeof _gxp === 'function') {
        Game.gainAbilityXP = function (aid, amt) {
          try { abilityUses[aid] = (abilityUses[aid] || 0) + (amt || 1); } catch (e) {}
          return _gxp.call(this, aid, amt);
        };
      }
      const result = await runDays(Game, p, { days });
      const end = {
        uw: (() => { try { return Game.unlockedWave(); } catch (e) { return 1; } })(),
        eng: engagedByWave(Game), kills: Object.assign({}, Game.state.waveKills || {}),
        m: masteryStats(Game), surge: surgeState(Game),
      };
      let usesTotal = 0;
      for (const k of Object.keys(abilityUses)) usesTotal += abilityUses[k];
      rows.push({
        seed, policy: pid, endReason: result.endReason, ms: result.ms,
        days: result.gameDays, unlockDay,
        fightStarts, spawns, end, curve,
        abilityUsesTotal: usesTotal,
        channels: (ctx() && ctx().channels) || 0,
      });
      runN++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${runN}/${totalRuns} ${el}s] seed ${seed} ${pid}: ${result.endReason} d${result.gameDays} uw${end.uw} spawns[w2:${spawns[2]}] fights[w2:${fightStarts[2]}] eng[w2:${end.eng[2]}] kills[w2:${end.kills[2] || 0}] L3:${end.m.l3}/${end.m.nAb} res:${end.m.res} syn:${end.m.syns} surge:${end.surge.armed ? 'A' : ''}${end.surge.used ? 'U' : ''} unlockDay:${JSON.stringify(unlockDay)}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows));
  console.log('wrote ' + OUT);
})();
