#!/usr/bin/env node
// winrate-fight.js — player outcome vs a hushwolf at various starting HP.
// Correct: checks scholar.health + Game.over, not the cleared tbfight.
'use strict';
const { loadGame, setupGame } = require('./sim-harness');
const { competent } = require('./policies/competent');

(async () => {
  const hpLevels = [50, 67, 85, 100];
  for (const startHp of hpLevels) {
    let wins = 0, died = 0, n = 0;
    let hpLeft = [];
    for (let seed = 1; seed <= 10; seed++) {
      const { Game } = await loadGame({ seed: seed * 1000 + startHp, mode: 'wr' });
      Game.say = () => {};
      await setupGame(Game);
      const s = Game.state.scholar;
      s.health = startHp; s.kcal = 2000; s.hydration = 100;
      const origVid = Game.villagerId;
      Game.startCombat('hushwolf');
      const pf = Game.tbFighter('p');
      if (pf) { pf.hp = startHp; pf.maxHp = Math.max(pf.maxHp, startHp); }
      const ctx = {};
      let guard = 0;
      while (Game.tbfight && !Game.tbfight.over && guard++ < 60) {
        if (Game.tbIsPlayerTurn()) { try { competent.fight(Game, ctx); } catch (e) { break; } }
        else {
          try {
            const q = Game.tbFighter('p');
            if (q) { q.moveLeft = 0; q.acted = true; }
            Game.tbAfterPlayerAction();
          } catch (e) { break; }
        }
      }
      n++;
      const h = Math.round(Game.state.scholar.health || 0);
      const mantlePassed = Game.villagerId !== origVid;
      if (Game.over || mantlePassed) died++;
      else { wins++; hpLeft.push(h); }
    }
    const avg = hpLeft.length ? (hpLeft.reduce((a, b) => a + b, 0) / hpLeft.length).toFixed(0) : '-';
    console.log(`startHp ${startHp}: survived ${wins}/${n} (died ${died}), avg HP left ${avg}`);
  }
})();
