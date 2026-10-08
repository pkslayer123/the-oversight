const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  for (const f of Game.tbfight.fighters) if (f.kind === 'hostile') { f.hp = 6; }
  const p = Game.tbFighter('p'); p.hp = 200; p.maxHp = 200; Game.state.scholar.health = 200;
  let n = 0, strikes = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < 80) {
    const tf = Game.tbfight;
    const cur = tf.order[tf.turnIdx % tf.order.length];
    const me = tf.fighters.find(f => f.key === 'p');
    if (!me || !me.alive) break;
    if (cur === 'p' && !me.acted) {
      const foe = tf.fighters.find(f => f.kind === 'hostile' && f.alive && !f.fled);
      if (!foe) { try { Game.tbAdvance(); } catch(e){ break; } continue; }
      const d = Math.max(Math.abs(foe.mx - me.mx), Math.abs(foe.my - me.my));
      if (d <= 1) { try { Game.tbPlayerStrike(foe.key); strikes++; } catch(e){ break; } }
      else {
        // step toward (interior tiles)
        const nx = Math.max(1, Math.min(7, me.mx + Math.sign(foe.mx - me.mx)));
        const ny = Math.max(1, Math.min(7, me.my + Math.sign(foe.my - me.my)));
        try { Game.tbPlayerMove(nx, ny); } catch(e){ try { Game.tbPlayerEndTurn(); } catch(e2){} }
      }
    } else { try { Game.tbAdvance(); } catch(e){ break; } }
  }
  const out = cap.log.splice(0);
  console.log('rounds:', n, 'strikes:', strikes, 'fight:', !!Game.tbfight, 'result:', Game.tbfight && Game.tbfight.result);
  console.log('--- AFTERMATH (last 30):');
  console.log(out.slice(-30).join('\n').slice(0, 3800));
  console.log('justice:', Game.justiceState().stage, 'exiled:', Game.justiceState().exiled, 'over:', Game.state.over);
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
