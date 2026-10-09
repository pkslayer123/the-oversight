#!/usr/bin/env node
// probe-knowledge-ramp.js — measure taught[vid].length, production, need per day.
'use strict';
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');
const SEEDS = (process.env.SEEDS || '20261009,7,424242,99,11').split(',').map(Number);

(async () => {
  for (const seed of SEEDS) {
    const { Game } = await loadGame({ seed, mode: 'competent' });
    await setupGame(Game);
    const rows = [];
    const origEats = Game.villageEats.bind(Game);
    Game.villageEats = function () {
      const r = origEats();
      try {
        const v = Game.state.village;
        let prodSum = 0, needSum = 0, knownSum = 0, n = 0;
        for (const vid of (v.roster || [])) {
          if (vid === Game.villagerId) continue;
          let person = null;
          try { person = Game.getPerson(vid); } catch (e) {}
          if (!person || person.dead) continue;
          try { prodSum += Game.villagerDayProduction(person, vid, v); } catch (e) {}
          try { needSum += (person.kcalPerDay || 2000); } catch (e) {}
          knownSum += ((v.taught && v.taught[vid]) || []).length;
          n++;
        }
        const vw = v.water || { clean: 0, dirty: 0 };
        rows.push({ day: Game.state.scholar.day, n, prod: Math.round(prodSum), need: needSum,
          known: n ? (knownSum / n).toFixed(1) : 0,
          clean: Math.round(vw.clean || 0), dirty: Math.round(vw.dirty || 0),
          pantry: Math.round((v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0)) });
      } catch (e) {}
      return r;
    };
    const result = await runDays(Game, competent, { days: 20 });
    console.log(`seed=${seed} days=${result.days} end=${result.endReason}`);
    for (const row of rows) {
      if (row.day <= 15) console.log(`  d${row.day}: n=${row.n} prod=${row.prod} need=${row.need} known/villager=${row.known} water=${row.clean}C/${row.dirty}D pantry=${row.pantry}`);
    }
  }
})();
