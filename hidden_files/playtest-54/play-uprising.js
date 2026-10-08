const H = require('./harness-load.js');
const Game = H.Game;
// PATH: TALK then FLEE
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 30).join('\n').slice(0, 3500));
    return r;
  };
  step('fight state', () => {
    const tf = Game.tbfight;
    console.log('tbfight:', !!tf, 'fighters:', tf && tf.fighters.map(f=>f.key+':'+f.name+'('+f.kind+')').join(' | '));
    console.log('turn order:', tf && tf.order.join(','));
  });
  const hostileKey = Game.tbfight.fighters.find(f => f.kind === 'hostile').key;
  step('TALK: beg', () => Game.tbPlayerTalk(hostileKey, 'beg'));
  step('advance turns', () => {
    for (let i = 0; i < 8 && Game.tbfight && !Game.tbfight.over; i++) {
      try { Game.tbAdvance(); } catch (e) { cap.log.push('tbAdvance throw: ' + e.message); break; }
    }
    console.log('over:', Game.tbfight && Game.tbfight.over);
  });
  step('FLEE', () => Game.tbEnd('fled'));
  step('after flee: state', () => {
    const j = Game.justiceState();
    console.log('justice stage:', j.stage, 'exiled:', j.exiled, 'over:', Game.state.over);
    console.log('scholar pos:', Game.state.scholar.mx, Game.state.scholar.my);
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
