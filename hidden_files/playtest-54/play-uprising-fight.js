const H = require('./harness-load.js');
const Game = H.Game;
// PATH: FIGHT to the end
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines, tail)');
    const t = out.slice(-12);
    console.log(t.join('\n').slice(0, 3000));
    return r;
  };
  step('fight loop (player strikes nearest hostile each turn)', () => {
    let n = 0;
    while (Game.tbfight && !Game.tbfight.over && n < 60) {
      n++;
      const tf = Game.tbfight;
      const me = tf.fighters.find(f => f.key === 'p');
      if (!me || !me.alive) break;
      // find current turn
      const cur = tf.order[tf.turnIdx % tf.order.length];
      if (cur === 'p' && !me.acted) {
        const foe = tf.fighters.find(f => f.kind === 'hostile' && f.alive && !f.fled);
        if (!foe) break;
        // move adjacent-ish then strike (strike may need range; just try)
        try { Game.tbPlayerStrike(foe.key); } catch (e) { cap.log.push('strike throw: ' + e.message); break; }
      } else {
        try { Game.tbAdvance(); } catch (e) { cap.log.push('tbAdvance throw: ' + e.message); break; }
      }
    }
    console.log('turns:', n, 'over:', Game.tbfight && Game.tbfight.over, 'result:', Game.tbfight && Game.tbfight.result);
    console.log('player hp:', Game.state.scholar.health, 'over:', Game.state.over);
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
