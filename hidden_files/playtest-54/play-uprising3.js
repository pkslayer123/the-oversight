const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  // weaken hostiles so victory is reachable in the test window
  for (const f of Game.tbfight.fighters) if (f.kind === 'hostile') { f.hp = 4; }
  const p = Game.tbFighter('p'); p.hp = 200; p.maxHp = 200; Game.state.scholar.health = 200;
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < 60) {
    const tf = Game.tbfight;
    const cur = tf.order[tf.turnIdx % tf.order.length];
    const me = tf.fighters.find(f => f.key === 'p');
    if (!me || !me.alive) break;
    if (cur === 'p' && !me.acted) {
      const foe = tf.fighters.find(f => f.kind === 'hostile' && f.alive && !f.fled);
      if (!foe) { try { Game.tbAdvance(); } catch(e){ break; } continue; }
      try { Game.tbPlayerStrike(foe.key); } catch(e){ break; }
    } else { try { Game.tbAdvance(); } catch(e){ break; } }
  }
  const out = cap.log.splice(0);
  console.log('rounds:', n, 'fight:', !!Game.tbfight, 'result:', Game.tbfight && Game.tbfight.result);
  console.log('--- AFTERMATH (last 25 lines):');
  console.log(out.slice(-25).join('\n').slice(0, 3500));
  console.log('justice:', Game.justiceState().stage, Game.justiceState().exiled, 'over:', Game.state.over);
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
