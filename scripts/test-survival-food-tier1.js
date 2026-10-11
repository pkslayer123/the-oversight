#!/usr/bin/env node
// test-survival-food-tier1.js — Part A1 proof test (survival-food 2026-10-10).
//
// Claim: competent play reaches Haven tier 1 (The Longhouse) reliably.
// Before (tier-1 wood bar 200): 1/40 seeds reached tier 1 in 200 days —
//   the bar assumed a "2 wood-duty" village the competent policy never
//   fields (it staffs wood duty for hearth maintenance only, pile < 8).
// After (wood bar 12, wood duty R(5,9)): 34/40 reach tier 1, median day 12.
//
// Runs the competent policy with the villagerTurn-corrected day loop
// (doAction('wait') = live path; never raw tickAction(128)) on 3 seeds,
// 50-day cap. Tier 1's median fire day is 12, so 50 days is ample.
// SEED env override for the x3-seed requirement.
//
// Run: node scripts/test-survival-food-tier1.js   (SEEDS="7,17,35")
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { competent } = require('./policies/competent');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

async function runOne(seed, days) {
  const { Game } = await loadGame({ seed, mode: 'tier1-proof' });
  await setupGame(Game);
  const ctx = { policyId: 'competent' };
  if (competent.setup) await competent.setup(Game, ctx);
  let tierDay = null;
  for (let day = 1; day <= days; day++) {
    for (let p = 0; p < 3; p++) {
      if (Game.over) break;
      if (competent.upkeep) { try { competent.upkeep(Game, ctx); } catch (e) {} }
      driveFights(Game, competent, ctx);
      driveContests(Game, competent, ctx);
      if (Game.over) break;
      try { Game.doAction('wait'); } catch (e) {}
      driveFights(Game, competent, ctx);
      driveContests(Game, competent, ctx);
      if (Game.over) break;
    }
    if (Game.over) break;
    if (competent.daily) { try { competent.daily(Game, ctx); } catch (e) {} }
    driveFights(Game, competent, ctx);
    driveContests(Game, competent, ctx);
    if (Game.over) break;
    try {
      if (Game.havenTier() >= 1 && tierDay == null) tierDay = (Game.state.scholar || {}).day || day;
    } catch (e) {}
    try { Game.sleep(); } catch (e) {}
    driveFights(Game, competent, ctx);
    driveContests(Game, competent, ctx);
    if (Game.over) break;
  }
  return { seed, tierDay, days: (Game.state.scholar || {}).day || 0, over: !!Game.over };
}

(async () => {
  const seeds = (process.env.SEEDS || '7,17,35').split(',').map(s => parseInt(s.trim(), 10));
  const days = parseInt(process.env.DAYS || '50', 10);
  const results = [];
  for (const seed of seeds) {
    const r = await runOne(seed, days);
    results.push(r);
    console.log(`seed ${seed}: tier1 day ${r.tierDay == null ? 'NEVER' : r.tierDay} (survived to day ${r.days}${r.over ? ', over' : ''})`);
  }
  const reached = results.filter(r => r.tierDay != null).length;
  ok(reached === seeds.length, `tier 1 reached on all ${seeds.length} seeds`, `${reached}/${seeds.length}`);
  // the tier must MEAN something: hearth stretch + pantry cap apply live
  const { Game } = await loadGame({ seed: seeds[0], mode: 'tier1-proof-fx' });
  await setupGame(Game);
  const stretch0 = Game.hearthStretch();
  Game.state.village.havenTier = 1;
  const stretch1 = Game.hearthStretch();
  ok(stretch0 === 1 && stretch1 === 0.9, 'longhouse hearth stretches meals 10% (1.0 -> 0.9)');
  const cap0 = Game.pantryCapKcal();
  // pantryCapKcal wraps with +25% at tier>=1; compare against a tier-0 read
  Game.state.village.havenTier = 0;
  const capBase = Game.pantryCapKcal();
  Game.state.village.havenTier = 1;
  const capLong = Game.pantryCapKcal();
  ok(capLong === Math.round(capBase * 1.25), 'longhouse pantry capacity +25%', `${capBase} -> ${capLong}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
