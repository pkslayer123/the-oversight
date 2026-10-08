const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('night');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 30).join('\n').slice(0, 3500));
    return r;
  };
  step('start combat with fox', () => {
    // find the fox monster in state
    const s = Game.state.scholar;
    console.log('player pos:', s.mx, s.my, 'insideHaven:', s.insideHaven);
    const m = (Game.state.monsters || []).find(x => x.id === 'gray_fox' || /fox/.test(x.id || ''));
    console.log('fox:', JSON.stringify(m && {id: m.id, mx: m.mx, my: m.my, x: m.x, y: m.y}));
    return Game.startCombat('gray_fox');
  });
  if (Game.tbfight) {
    step('fight state', () => {
      console.log('fighters:', Game.tbfight.fighters.map(f => f.key + ':' + f.name + '@' + f.mx + ',' + f.my + ' hp' + f.hp).join(' | '));
    });
    const foe = Game.tbfight.fighters.find(f => f.kind !== 'player');
    step('player strikes', () => foe && Game.tbPlayerStrike(foe.key));
    step('advance a few turns', () => {
      for (let i = 0; i < 6 && Game.tbfight && !Game.tbfight.over; i++) {
        try { Game.tbAdvance(); } catch (e) { cap.log.push('tbAdvance throw: ' + e.message); break; }
      }
      console.log('over:', Game.tbfight && Game.tbfight.over, 'result:', Game.tbfight && Game.tbfight.result);
    });
  } else console.log('NO tbfight started');
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
