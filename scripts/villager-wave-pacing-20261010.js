#!/usr/bin/env node
// PACING PLAYTEST: does counting villager blow-by-blow fights toward wave
// unlocks make the engagement lane arrive trivially early? Compares the same
// seeds/policies on two code states:
//   - player-only: pre-fix tree (fieldFight never fed the deed — the attach
//     bug), i.e. unlocks come only from the player's startCombat + kills
//   - villager-inclusive: fixed tree (vKill/mFlee/vFlee feed; vDie/evade/
//     alreadyDead don't)
// Run twice: once on the stashed (pre-fix) tree, once on the fixed tree:
//   SEEDS="1-12" DAYS=60 OUT=/tmp/pacing-pre.json node scripts/villager-wave-pacing-20261010.js
// Measures: day unlockedWave() first >= 3, waveEngaged(2) at cap, deed
// sources (player TB / villager fieldFight / kill lane) via stack sniffing.
// Usage: SEEDS="1-12" DAYS=60 OUT=/tmp/x.json node scripts/villager-wave-pacing-20261010.js
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
    // source attribution: sniff the stack at each deed record
    const src = { playerTB: 0, villagerFF: 0, killLane: 0 };
    const origRDD = Game.recordDeedFight;
    Game.recordDeedFight = function (mid) {
      try {
        const st = new Error().stack || '';
        if (/fieldFight/.test(st)) src.villagerFF++;
        else if (/startCombat/.test(st)) src.playerTB++;
        else src.killLane++;
      } catch (e) {}
      return origRDD.call(this, mid);
    };
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
    let eng2 = 0;
    try { eng2 = Game.waveEngaged(2); } catch (e) {}
    out.push({ seed, days: res.days, endReason: res.endReason, unlockDay3, eng2, src });
    console.log(`seed ${seed}: unlock3=${unlockDay3} eng2=${eng2} src=${JSON.stringify(src)} end=${res.endReason}`);
  }
  const path2 = process.env.OUT || '/tmp/villager-wave-pacing.json';
  fs.writeFileSync(path2, JSON.stringify({ seeds, days, out }, null, 1));
  console.log('wrote', path2);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
