const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  const hostileKey = Game.tbfight.fighters.find(f => f.kind === 'hostile').key;
  try { Game.tbPlayerTalk(hostileKey, 'beg'); } catch(e){}
  for (let i = 0; i < 8 && Game.tbfight && !Game.tbfight.over; i++) {
    try { Game.tbAdvance(); } catch (e) { break; }
  }
  cap.log.splice(0);
  console.log('before flee: tbfight?', !!Game.tbfight, 'over?', Game.tbfight && Game.tbfight.over,
    '_lastBetrayal?', !!Game._lastBetrayal, 'playerAlive?', Game.tbFighter('p') && Game.tbFighter('p').alive,
    'playerHp:', Game.tbFighter('p') && Game.tbFighter('p').hp, 'state.over:', Game.state.over);
  try { Game.tbEnd('fled'); } catch (e) { console.log('THROW:', e.message); }
  const out = cap.log.splice(0);
  console.log('after flee: lines=' + out.length, 'exiled=' + Game.justiceState().exiled, '_lastBetrayal=' + !!Game._lastBetrayal);
  console.log(out.join('\n').slice(0, 800));
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
