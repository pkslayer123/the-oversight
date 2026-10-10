#!/usr/bin/env node
// run-instrumented.js — instrumented survival sim for the depletion-starvation wall.
// Wraps stockPantry/donateToPantry/stockSurplus for per-day inflow per source,
// pantryDraw/drawSpoiled/villageMeal for outflow, scans grounds vigor/pressure
// state, duty assignments, and health/starvation timeline.
// Usage: SEEDS="1-8" POLICIES="progress,competent" DAYS=60 OUT=scratch-bal/inst.json node scratch-bal/run-instrumented.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/worktrees/bal-survival';
const { loadGame, setupGame, runDays } = require(ROOT + '/scripts/sim-harness');
const idle = require(ROOT + '/scripts/policies/idle');
const { competent } = require(ROOT + '/scripts/policies/competent');
const { progress } = require('./progress-policy');

const POLICIES = { competent, progress, mvc: idle.mvc, leader: idle.leader,
  competent_orig: require('./competent-orig').competent,
  progress_orig: require('./progress-orig').progress };

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-60').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

function groundsState(Game) {
  const gs = { avgVigor: 0, avgPressure: 0, n: 0, lush: 0, thinning: 0, picked: 0, barren: 0, dead: 0 };
  try {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const t = Game.tileAt(x, y);
      if (!t || !t.maxStock || t.maxStock <= 0) continue;
      gs.n++;
      const v = (t.vigor == null) ? 100 : t.vigor;
      gs.avgVigor += v; gs.avgPressure += (t.foragePressure || 0);
      if (v <= 0) gs.dead++;
      let lvl = 'lush';
      try { lvl = Game.depletionLevel(t); } catch (e) {}
      gs[lvl] = (gs[lvl] || 0) + 1;
    }
    if (gs.n) { gs.avgVigor = +(gs.avgVigor / gs.n).toFixed(1); gs.avgPressure = +(gs.avgPressure / gs.n).toFixed(2); }
  } catch (e) {}
  return gs;
}

function installInstr(Game, rec) {
  const oStock = Game.stockPantry.bind(Game);
  Game.stockPantry = function (kcal, label, opts) {
    try {
      if (kcal > 0) {
        const d = (Game.state.scholar || {}).day || 0;
        rec.inflow[d] = rec.inflow[d] || {};
        rec.inflow[d][label || '?'] = (rec.inflow[d][label || '?'] || 0) + kcal;
      }
    } catch (e) {}
    return oStock(kcal, label, opts);
  };
  const oDonate = Game.donateToPantry.bind(Game);
  Game.donateToPantry = function (idx) {
    let kcal = 0;
    try {
      const it = (Game.state.scholar.inventory || [])[idx];
      kcal = (it && it.kcalEach > 0) ? it.kcalEach * (it.units || 1) : 0;
    } catch (e) {}
    const r = oDonate(idx);
    try {
      if (kcal > 0) {
        const d = (Game.state.scholar || {}).day || 0;
        rec.inflow[d] = rec.inflow[d] || {};
        rec.inflow[d]['Player donation'] = (rec.inflow[d]['Player donation'] || 0) + kcal;
      }
    } catch (e) {}
    return r;
  };
  const oSurplus = Game.stockSurplus.bind(Game);
  Game.stockSurplus = function (v, give) {
    try {
      if (give > 0) {
        const d = (Game.state.scholar || {}).day || 0;
        rec.inflow[d] = rec.inflow[d] || {};
        rec.inflow[d]['Villager surplus'] = (rec.inflow[d]['Villager surplus'] || 0) + give;
      }
    } catch (e) {}
    return oSurplus(v, give);
  };
  const oDraw = Game.pantryDraw.bind(Game);
  Game.pantryDraw = function (v, want, opts) {
    const r = oDraw(v, want, opts);
    try {
      const d = (Game.state.scholar || {}).day || 0;
      rec.outflow[d] = (rec.outflow[d] || 0) + ((r && r.taken) || 0);
    } catch (e) {}
    return r;
  };
  const oMeal = Game.villageMeal.bind(Game);
  Game.villageMeal = function () {
    const r = oMeal.apply(Game, arguments);
    try {
      const d = (Game.state.scholar || {}).day || 0;
      rec.outflow[d] = (rec.outflow[d] || 0) + ((Game.state.village || {}).lastPlayerMeal || 0);
    } catch (e) {}
    return r;
  };
  const oReg = Game.registerDeath ? Game.registerDeath.bind(Game) : null;
  if (oReg) Game.registerDeath = function (info) {
    try {
      const entry = { day: (Game.state.scholar || {}).day || 0, kind: (info && info.kind) || '?', cause: (info && info.cause) || '?' };
      // combat audit: which fight, how many allies, monster count
      if (info && info.kind === 'person' && info.cause === 'combat' && Game.tbfight) {
        const f = Game.tbfight.fighters || [];
        entry.allies = f.filter(x => x.kind === 'villager').length;
        entry.monsters = f.filter(x => x.kind === 'monster' && x.alive !== false).length;
        entry.round = Game.tbfight.round || 0;
      }
      rec.deaths.push(entry);
    } catch (e) {}
    return oReg(info);
  };
}

function dailySnapshot(Game, rec) {
  try {
    const d = (Game.state.scholar || {}).day || 0;
    const v = Game.state.village || {};
    const pantryKcal = ((v.pantry || [])).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    const duties = {};
    for (const a of Object.values(v.assignments || {})) {
      if (a && a.task) duties[a.task] = (duties[a.task] || 0) + 1;
    }
    let hungry = 0, healthSum = 0, healthN = 0;
    for (const rid of (v.roster || [])) {
      const h = (v.health && v.health[rid] !== undefined) ? v.health[rid] : 100;
      healthSum += h; healthN++;
      try { if (Game.npcNeeds && Game.npcNeeds(rid).hunger >= 60) hungry++; } catch (e) {}
    }
    rec.daily.push({
      day: d, pop: (v.roster || []).length, pantry: Math.round(pantryKcal),
      duties, lastEat: Math.round(v.lastEat || 0), lastGive: Math.round(v.lastGive || 0),
      avgHealth: healthN ? +(healthSum / healthN).toFixed(1) : 100, hungry,
      hungryDays: v.hungryDays || 0, tier: (Game.havenTier ? Game.havenTier() : 0),
      plots: (Game.gardenPlots ? Game.gardenPlots().length : 0),
      sown: (Game.gardenPlots ? Game.gardenPlots().filter(p => p.pid && !p.dead).length : 0),
      gs: groundsState(Game),
    });
  } catch (e) {}
}

function wrap(policy, Game, rec) {
  const p = Object.assign({}, policy);
  const origDaily = policy.daily;
  const seenFights = new Set();
  p.daily = (G, ctx) => {
    if (origDaily) { try { origDaily(G, ctx); } catch (e) {} }
    // fight census: Game.tbfight is set inline (no start function to wrap)
    try {
      const f = Game.tbfight;
      if (f && !seenFights.has(f)) {
        seenFights.add(f);
        const fl = f.fighters || [];
        (rec.fights = rec.fights || []).push({
          day: (Game.state.scholar || {}).day || 0,
          allies: fl.filter(x => x.kind === 'villager').length,
          allyHp: fl.filter(x => x.kind === 'villager').map(x => x.hp),
          monsters: fl.filter(x => x.kind === 'monster').length,
        });
      }
    } catch (e) {}
    dailySnapshot(Game, rec);
  };
  return p;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-8');
  const policyIds = (process.env.POLICIES || 'progress,competent').split(',').map(s => s.trim());
  const days = parseInt(process.env.DAYS || '60', 10);
  const OUT = process.env.OUT || 'scratch-bal/inst.json';
  const rows = [];
  const t0 = Date.now();
  let runN = 0, totalRuns = seeds.length * policyIds.length;
  for (const pid of policyIds) {
    for (const seed of seeds) {
      const { Game } = await loadGame({ seed, mode: pid });
      await setupGame(Game);
      const rec = { seed, policy: pid, inflow: {}, outflow: {}, daily: [], deaths: [] };
      installInstr(Game, rec);
      const p = wrap(POLICIES[pid], Game, rec);
      const result = await runDays(Game, p, { days });
      rec.endReason = result.endReason;
      rec.endDay = result.gameDays;
      rows.push(rec);
      runN++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${runN}/${totalRuns} ${el}s] seed ${seed} ${pid}: ${result.endReason} d${result.gameDays}`);
    }
  }
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(rows));
  console.log('wrote ' + OUT);
})();
