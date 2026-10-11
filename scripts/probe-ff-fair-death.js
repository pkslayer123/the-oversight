'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame } = require('./sim-harness');
(async () => {
  const { Game } = await loadGame({ seed: 4242, mode: 'ff-probe2', fullTelemetry: false });
  setupGame(Game);
  const vid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  Game.state.village.health = Game.state.village.health || {};
  const cases = [
    ['hushwolf', 100], ['bulldozer', 100], ['gallowdeer', 100],
    ['moderator', 100], ['hushwolf', 60],
  ];
  for (const [mid, hp] of cases) {
    const mdef = (Game.data.monsters || []).find(m => m.id === mid);
    let die = 0, dieHopeless = 0, dieWinning = 0, flee = 0, kill = 0, mFlee = 0;
    for (let i = 0; i < 200; i++) {
      Game.state.village.health[vid] = hp;
      const rec = Game.fieldFight(vid, mdef, null, { awareness: true });
      if (rec.outcome === 'vDie') { die++; if (rec.everHopeless) dieHopeless++; if (rec.everWinning) dieWinning++; }
      else if (rec.outcome === 'vFlee') flee++;
      else if (rec.outcome === 'vKill') kill++;
      else if (rec.outcome === 'mFlee') mFlee++;
    }
    console.log(`${mid} hp${hp}: die=${die} (hopeless=${dieHopeless} winning=${dieWinning}) flee=${flee} kill=${kill} mFlee=${mFlee}`);
  }
})();
