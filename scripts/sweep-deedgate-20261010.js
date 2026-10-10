#!/usr/bin/env node
// MINI COMPLETION SWEEP: deed gate vs the r3 baseline (2026-10-10).
// r3 baseline: 1/60 organic wins at day 47 by a weak scholar (regional,
// maxWave 2, thin contests) — the old devotion/knowledge gates let a
// shallow run reach the table. With the deed gate, wins should require
// genuinely deep runs: expect ~0 wins in short-horizon sweeps, and any
// Arc IV to come with a full deed breakdown.
//
// Usage: SEEDS="1,2,..." DAYS=150 node scripts/sweep-deedgate-20261010.js
'use strict';
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');

const seeds = (process.env.SEEDS || '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16').split(',').map(Number);
const days = parseInt(process.env.DAYS || '150', 10);

function snapshot(Game) {
  const out = { arc: 1, table: false, won: false, day: 0, w3: 0, w4: 0, contests: 0, crises: 0, rank: '?', maxWave: 1, held: 0 };
  try {
    const pg = Game.progState();
    out.arc = pg.arc || 1;
    out.table = !!(pg.tableWaiting || pg.tableDone);
    out.day = (Game.state.scholar || {}).day || 0;
    const g = Game.deedGateReady ? Game.deedGateReady() : null;
    if (g) { out.w3 = g.w3; out.w4 = g.w4; out.contests = g.contestsN; out.crises = g.crisesN; out.rank = g.rank; }
    out.maxWave = Game.unlockedWave ? Game.unlockedWave() : 1;
    out.held = Game.state.contestsHeld || 0;
  } catch (e) {}
  try { out.won = !!Game.won; } catch (e) {}
  return out;
}

(async () => {
  const rows = [];
  for (const seed of seeds) {
    const { Game } = await loadGame({ seed, mode: 'competent' });
    await setupGame(Game);
    const arcDay = {};
    const policy = Object.assign({}, competent);
    const origDaily = competent.daily;
    policy.daily = (G, ctx) => {
      try {
        const a = G.progState().arc || 1;
        if (!(a in arcDay)) arcDay[a] = (G.state.scholar || {}).day || 0;
      } catch (e) {}
      if (origDaily) { try { return origDaily(G, ctx); } catch (e) {} }
    };
    const result = await runDays(Game, policy, { days });
    const end = snapshot(Game);
    rows.push({ seed, endReason: result.endReason, days: end.day, arc: end.arc, arcDay, table: end.table, won: end.won, w3: end.w3, w4: end.w4, contests: end.contests, crises: end.crises, rank: end.rank, maxWave: end.maxWave, held: end.held });
    console.log(`seed ${seed}: ${result.endReason} d${end.day} arc${end.arc} table=${end.table} won=${end.won} deeds[w3:${end.w3} w4:${end.w4} cx:${end.contests} cr:${end.crises} rank:${end.rank}] maxWave:${end.maxWave} held:${end.held}`);
  }
  const n = rows.length;
  const arc4 = rows.filter(r => r.arc >= 4).length;
  const tables = rows.filter(r => r.table).length;
  const wins = rows.filter(r => r.won).length;
  const deep = rows.filter(r => r.maxWave >= 3).length;
  console.log(`\n== ${n} runs, ${days} days, competent ==`);
  console.log(`arc4: ${arc4}/${n}  table: ${tables}/${n}  won: ${wins}/${n}  maxWave>=3: ${deep}/${n}`);
  console.log('r3 baseline (old gate): 1/60 wins at day 47 by a weak scholar — expected direction: wins now require deep runs.');
})();
