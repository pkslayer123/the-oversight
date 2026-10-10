#!/usr/bin/env node
// sweep-bloodair.js — Gap 4 natural-run acceptance: same methodology as the
// crisis-wire 0/120 sweep (sim-harness, real policies, 200 days).
// Counts blood-on-air firings + villager contest deaths per run.
const H = require('./sim-harness');
const { competent } = require('./policies/competent');
const { zero, mvc, leader } = require('./policies/idle');
const POLICIES = { competent, mvc, leader, zero };

const SEEDS = (process.env.SEEDS || '20261009,7,424242,99,1234,5678').split(',').map(Number);
const POLICY_IDS = (process.env.POLICIES || 'competent,mvc,leader,zero').split(',');
const DAYS = parseInt(process.env.DAYS || '200', 10);

(async () => {
  const rows = [];
  for (const pid of POLICY_IDS) {
    const base = POLICIES[pid];
    for (const seed of SEEDS) {
      const { Game } = await H.loadGame({ seed, mode: pid, fullTelemetry: false });
      await H.setupGame(Game);
      const policy = Object.assign({}, base);
      let blood = 0, contestDeaths = 0, contestsFired = 0;
      const origFC = Game.fireCrisis;
      Game.fireCrisis = function (kind, ctx) {
        if (kind === 'blood-on-air') blood++;
        return origFC.call(this, kind, ctx);
      };
      const origKC = Game._cxKillContestant;
      Game._cxKillContestant = function (p) {
        if (p && p !== 'player') contestDeaths++;
        return origKC.call(this, p);
      };
      const origFire = Game.fireContest;
      Game.fireContest = function (c) { contestsFired++; return origFire.call(this, c); };
      const result = await H.runDays(Game, policy, { days: DAYS, manifest: H.manifest(seed, pid) });
      rows.push({ policy: pid, seed, days: result.days, end: result.endReason, contestsFired, contestDeaths, blood });
      console.log(`${pid} seed=${seed} days=${result.days} end=${result.endReason} contests=${contestsFired} contestDeaths=${contestDeaths} bloodOnAir=${blood}`);
    }
  }
  const tot = rows.reduce((a, r) => ({ contests: a.contests + r.contestsFired, deaths: a.deaths + r.contestDeaths, blood: a.blood + r.blood }), { contests: 0, deaths: 0, blood: 0 });
  const withBlood = rows.filter(r => r.blood > 0).length;
  console.log(`\nTOTAL runs=${rows.length} contests=${tot.contests} villagerContestDeaths=${tot.deaths} bloodOnAir=${tot.blood} runsWithBloodOnAir=${withBlood}`);
})();
