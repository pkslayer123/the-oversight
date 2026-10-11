#!/usr/bin/env node
// PACING PLAYTEST: the Wave Ledger (Steve 2026-10-10, reversal of 8730921c).
// Wave unlocks are kills-only now — how often does wave 3 unlock organically
// in 60 days under the same competent policy the engagement-lane sim used?
// REPORT ONLY — no retuning (Steve: "write the system and we can turn the
// rest of the levers").
//
// Old-system numbers (evidence/2026-10-10/villager-wave-xp.md, same seeds 1-12,
// same competent policy, 60 days):
//   player-only: 4/12 unlocked wave 3 by day 60, unlock days 25-28
//   villager-inclusive: 9/12 unlocked wave 3 by day 60, unlock days 25-27
//
// Measures: day unlockedWave() first >= 3, wave-2 ledger points at cap,
// w2 kills observed, deed sources. Run: SEEDS="1-12" DAYS=60 OUT=/tmp/x.json
// node scripts/wave-ledger-pacing-20261010.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require(ROOT + '/scripts/sim-harness');
const { competent } = require(ROOT + '/scripts/policies/competent');

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-12').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS);
  const days = parseInt(process.env.DAYS || '60', 10);
  const out = [];
  for (const seed of seeds) {
    const { Game } = await loadGame({ seed });
    await setupGame(Game);
    Game.say = function () {};
    let unlockDay3 = null;
    const pol = Object.assign({}, competent);
    const daily = pol.daily;
    pol.daily = function (G, ctx) {
      if (daily) daily(G, ctx);
      try {
        if (unlockDay3 == null && G.unlockedWave() >= 3) unlockDay3 = (G.state.scholar || {}).day || 0;
      } catch (e) {}
    };
    const res = await runDays(Game, pol, { days });
    let pts2 = 0, pts1 = 0, kills2 = 0;
    try { pts2 = Game.waveLedgerPoints(2); } catch (e) {}
    try { pts1 = Game.waveLedgerPoints(1); } catch (e) {}
    try { kills2 = (Game.state.waveKills || {})[2] || 0; } catch (e) {}
    out.push({ seed, days: res.days, endReason: res.endReason, unlockDay3, pts1, pts2, kills2, maxWave: res.maxWaveUnlocked });
    console.log(`seed ${seed}: unlock3=${unlockDay3} pts1=${pts1} pts2=${pts2} kills2=${kills2} maxWave=${res.maxWaveUnlocked} end=${res.endReason}`);
  }
  const unlocked = out.filter(o => o.unlockDay3 != null);
  console.log(`\nwave-3 unlocks: ${unlocked.length}/${out.length} by day ${days}`);
  if (unlocked.length) {
    const ds = unlocked.map(o => o.unlockDay3).sort((a, b) => a - b);
    console.log('unlock days:', ds.join(', '));
  }
  const pts = out.map(o => o.pts2).sort((a, b) => a - b);
  console.log('wave-2 ledger points at cap:', pts.join(', '));
  const path2 = process.env.OUT || '/tmp/wave-ledger-pacing.json';
  fs.writeFileSync(path2, JSON.stringify({ seeds, days, out }, null, 1));
  console.log('wrote', path2);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
