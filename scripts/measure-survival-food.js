#!/usr/bin/env node
// measure-survival-food.js — Part A1 measurement (survival-food worktree).
// VillagerTurn-corrected day loop: time advances via doAction('wait')
// (live path: villagerTurn runs needs-driven NPC actions), NEVER raw
// tickAction(128) (which only runs npcBatchTurn and skips agency).
//
// Records per run: daily pantry kcal trajectory, wood/stone/preserved
// stocks, haven tier reach days, starvation deaths, labeled pantry inflow
// ledger (stockPantry wraps), policy activity counters.
//
// Usage: SEEDS="1-40" DAYS=200 OUT=scripts/measure-food-results.json node scripts/measure-survival-food.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { competent } = require('./policies/competent');

function econSnapshot(Game) {
  const v = Game.state.village || {};
  let pantry = 0;
  for (const it of (v.pantry || [])) pantry += (it.kcalEach || 0) * (it.units || 1);
  let wood = v.wood || 0, stone = 0, preserved = 0;
  try {
    const st = Game.stashState ? Game.stashState() : null;
    const mats = st && st.materials ? st.materials : null;
    if (mats) { wood += (mats.wood || 0); stone += (mats.stone || 0); }
  } catch (e) {}
  try {
    for (const it of (v.pantry || [])) {
      if (it && it.foodState === 'preserved') preserved += (it.kcalEach || 0) * (it.units || 1);
    }
  } catch (e) {}
  let tier = 0;
  try { tier = Game.havenTier ? Game.havenTier() : 0; } catch (e) {}
  const pop = ((Game.state.village || {}).roster || []).length;
  return { pantry: Math.round(pantry), wood: Math.round(wood), stone: Math.round(stone),
    preserved: Math.round(preserved), tier, pop };
}

async function runOne(seed, days) {
  const { Game, loadFails } = await loadGame({ seed, mode: 'food-measure' });
  await setupGame(Game);
  const ctx = { policyId: 'competent', notes: [] };
  const day0 = econSnapshot(Game);
  // Inflow ledger: wrap stockPantry (every labeled pantry deposit).
  const inflows = {}; // name -> total kcal
  const inflowDays = {}; // day -> {name: kcal}
  const origStock = Game.stockPantry;
  Game.stockPantry = function (kcal, name, o) {
    try {
      const d = (Game.state.scholar || {}).day || 0;
      const n = name || '?';
      inflows[n] = (inflows[n] || 0) + (kcal || 0);
      inflowDays[d] = inflowDays[d] || {};
      inflowDays[d][n] = (inflowDays[d][n] || 0) + (kcal || 0);
    } catch (e) {}
    return origStock.call(this, kcal, name, o);
  };
  // Donation ledger: wrap donateToPantry.
  let donated = 0;
  const origDonate = Game.donateToPantry;
  if (typeof origDonate === 'function') {
    Game.donateToPantry = function (i) {
      try {
        const inv = (Game.state.scholar || {}).inventory || [];
        const it = inv[i];
        donated += (it ? (it.kcalEach || 0) * (it.units || 1) : 0);
      } catch (e) {}
      return origDonate.call(this, i);
    };
  }
  const policy = competent;
  if (policy.setup) { try { await policy.setup(Game, ctx); } catch (e) {} }
  const daily = [];
  const tierDay = { 1: null, 2: null, 3: null };
  let lastDay = 0;
  const t0 = Date.now();
  for (let day = 1; day <= days; day++) {
    lastDay = day;
    for (let p = 0; p < 3; p++) {
      if (Game.over) break;
      if (policy.upkeep) { try { policy.upkeep(Game, ctx); } catch (e) {} }
      driveFights(Game, policy, ctx);
      driveContests(Game, policy, ctx);
      if (Game.over) break;
      // LIVE PATH: wait runs villagerTurn() (needs-driven NPC agency) then
      // ticks to the part boundary. Never raw tickAction(128).
      try { Game.doAction('wait'); } catch (e) {}
      driveFights(Game, policy, ctx);
      driveContests(Game, policy, ctx);
      if (Game.over) break;
    }
    if (Game.over) break;
    if (policy.daily) { try { policy.daily(Game, ctx); } catch (e) {} }
    driveFights(Game, policy, ctx);
    driveContests(Game, policy, ctx);
    if (Game.over) break;
    const snap = econSnapshot(Game);
    snap.day = (Game.state.scholar || {}).day || day;
    daily.push(snap);
    for (const t of [1, 2, 3]) {
      if (snap.tier >= t && tierDay[t] == null) tierDay[t] = snap.day;
    }
    try { Game.sleep(); } catch (e) {}
    driveFights(Game, policy, ctx);
    driveContests(Game, policy, ctx);
    if (Game.over) break;
  }
  const deaths = [];
  try {
    for (const ev of (Game.state.telemetry || [])) {
      if (ev.type === 'death') deaths.push({ day: ev.day, kind: ev.kind, who: ev.who, cause: ev.cause });
    }
  } catch (e) {}
  const endReason = Game.over ? (Game.villageLost ? 'village-lost' : 'over-other') : 'survived';
  return {
    seed, ms: Date.now() - t0, endReason, days: lastDay,
    day0, daily, tierDay, inflows, inflowDays, donated: Math.round(donated),
    deaths,
    policyCtx: {
      forageTrips: ctx.forageTrips || 0, donatedN: ctx.donated || 0,
      cooked: ctx.cooked || 0, sorted: ctx.sorted || 0, sown: ctx.sown || 0,
      trapsSet: ctx.trapsSet || 0, struck: ctx.struck || 0, fled: ctx.fled || 0,
      gardenStaffed: ctx.gardenStaffed || 0, fishStaffed: ctx.fishStaffed || 0,
      knownPlants: ctx.knownPlants || 0,
    },
    notes: ctx.notes,
  };
}

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-40').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-40');
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'measure-food-results.json');
  const rows = [];
  const t0 = Date.now();
  for (const seed of seeds) {
    const r = await runOne(seed, days);
    rows.push(r);
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    const last = r.daily[r.daily.length - 1] || {};
    console.log(`[${rows.length}/${seeds.length} ${el}s] seed ${seed}: ${r.endReason} d${r.days} pop${last.pop || '?'} pantry${last.pantry || 0} wood${last.wood || 0} tier${last.tier || 0} t1=${r.tierDay[1] || '-'} in=(${Object.keys(r.inflows).slice(0, 4).map(k => k + ':' + Math.round(r.inflows[k])).join(' ')})`);
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  // summary
  const n = rows.length;
  const ds = rows.map(r => r.days).sort((a, b) => a - b);
  const med = ds[Math.floor(ds.length / 2)];
  const t1 = rows.filter(r => r.tierDay[1] != null).length;
  const t2 = rows.filter(r => r.tierDay[2] != null).length;
  const t3 = rows.filter(r => r.tierDay[3] != null).length;
  const starve = rows.reduce((a, r) => a + r.deaths.filter(d => /starv|famine|hunger/i.test(d.cause || '')).length, 0);
  const d0pantry = rows.map(r => r.day0.pantry).sort((a, b) => a - b);
  console.log(`== medDays ${med} t1 ${t1}/${n} t2 ${t2}/${n} t3 ${t3}/${n} starvationDeaths ${starve} day0pantry med ${d0pantry[Math.floor(d0pantry.length / 2)]}`);
  console.log('wrote ' + OUT);
})();
