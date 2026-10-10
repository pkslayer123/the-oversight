#!/usr/bin/env node
// sweep-deathcauses.js — supplementary: what kills villages, and how far
// integration gets. Same harness, small seed count.
'use strict';
const { loadGame, setupGame, runDays } = require('./sim-harness');
const idle = require('./policies/idle');
const { competent } = require('./policies/competent');
const POLICIES = { zero: idle.zero, mvc: idle.mvc, leader: idle.leader, competent };
function parseList(env, def) { return (process.env[env] || def).split(',').map(s => s.trim()).filter(Boolean); }
(async () => {
  const seeds = parseList('SEEDS', '1,2,3,4,5').map(Number);
  const policyIds = parseList('POLICIES', 'competent');
  const days = parseInt(process.env.DAYS || '200', 10);
  for (const pid of policyIds) {
    const base = POLICIES[pid];
    for (const seed of seeds) {
      const { Game, manifest } = await loadGame({ seed, mode: pid, fullTelemetry: false });
      await setupGame(Game);
      const policy = Object.assign({}, base);
      const result = await runDays(Game, policy, { days, manifest, sampleEvery: 200 });
      let integ = 0;
      try { integ = Game.state.scholar.integration || 0; } catch (e) {}
      const deaths = (result.samples.deaths || []).map(d => `${d.day}:${d.cause || d.kind || '?'}`).join(' | ');
      const pop = ((Game.state.village || {}).roster || []).length;
      console.log(`${pid} seed=${seed} days=${result.days} end=${result.endReason} pop=${pop} integ=${Math.round(integ)}`);
      console.log(`  deaths: ${deaths || '(none recorded)'}`);
    }
  }
})();
