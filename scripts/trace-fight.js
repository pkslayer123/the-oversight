#!/usr/bin/env node
// trace-fight.js — one controlled fight, round-by-round damage log.
'use strict';
const { loadGame, setupGame } = require('./sim-harness');
const { competent } = require('./policies/competent');

(async () => {
  const seed = parseInt(process.argv[2] || '7', 10);
  const mid = process.argv[3] || 'hushwolf';
  const { Game } = await loadGame({ seed, mode: 'trace' });
  Game.say = (m) => {};
  await setupGame(Game);
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2000; s.hydration = 100;
  Game.startCombat(mid);
  const origDmg = Game.tbDamage.bind(Game);
  Game.tbDamage = function (tk, dmg, src, sk, opts) {
    if (dmg >= 25) console.log('  !! BIG HIT:', dmg, 'on', tk, 'from', src);
    return origDmg(tk, dmg, src, sk, opts);
  };
  const f = Game.tbfight;
  console.log('fighters:', f.fighters.map(x => `${x.key}(${x.kind}) hp=${Math.round(x.hp)}/${x.maxHp}`).join(' | '));
  let rounds = 0;
  const ctx = {};
  while (Game.tbfight && !Game.tbfight.over && rounds < 40) {
    rounds++;
    const p = Game.tbFighter('p');
    const php = Math.round(p.hp);
    if (Game.tbIsPlayerTurn()) {
      competent.fight(Game, ctx);
    } else {
      // monster/ally turn: advance
      try {
        const q = Game.tbFighter('p');
        if (q) { q.moveLeft = 0; q.acted = true; }
        Game.tbAfterPlayerAction();
      } catch (e) { break; }
    }
    const p2 = Game.tbFighter('p');
    const mons = (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive);
    console.log(`r${rounds}: player ${php}->${Math.round(p2 ? p2.hp : 0)} | monsters: ${mons.map(m => Math.round(m.hp)).join(',') || 'all down'}`);
    if (!Game.tbfight || Game.tbfight.over) break;
  }
  const p = Game.tbFighter ? Game.tbFighter('p') : null;
  console.log('over. player hp:', p ? Math.round(p.hp) : '?', 'alive:', p ? p.alive : '?', 'playerDied:', !p || !p.alive);
})();
