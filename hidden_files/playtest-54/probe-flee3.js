const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  for (let i = 0; i < 12; i++) {
    if (!Game.tbfight || Game.tbfight.over) { console.log('round ' + i + ': fight gone'); break; }
    const alive = Game.tbfight.fighters.filter(f=>f.alive && !f.fled).map(f=>f.key).join(',');
    try { Game.tbAdvance(); } catch (e) { console.log('round ' + i + ' THROW: ' + e.message); break; }
    const out = cap.log.splice(0);
    const alive2 = Game.tbfight ? Game.tbfight.fighters.filter(f=>f.alive && !f.fled).map(f=>f.key).join(',') : 'NOFIGHT';
    console.log('round ' + i + ': alive ' + alive + ' -> ' + alive2 + ' | say lines: ' + out.length + ' | over: ' + (Game.tbfight && Game.tbfight.over) + ' result: ' + (Game.tbfight && Game.tbfight.result));
    if (out.length) console.log('   last: ' + out.slice(-2).join(' / ').slice(0,160));
    if (!Game.tbfight) break;
  }
  console.log('final: _lastBetrayal=' + !!Game._lastBetrayal, 'over=' + Game.state.over, 'exiled=' + Game.justiceState().exiled);
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
