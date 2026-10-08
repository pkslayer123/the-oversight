const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('uprising');
  cap.log.splice(0);
  console.log('_lastBetrayal set:', !!Game._lastBetrayal, 'uprising:', Game._lastBetrayal && Game._lastBetrayal.uprising);
  console.log('tbEnd is wrapped (party/justice)?', Game.tbEnd.toString().slice(0,120).replace(/\n/g,' '));
  Game.tbEnd('fled');
  const out = cap.log.splice(0);
  console.log('--- say after tbEnd fled (' + out.length + ' lines):');
  console.log(out.join('\n').slice(0, 2000));
  console.log('_lastBetrayal after:', JSON.stringify(Game._lastBetrayal));
  const j = Game.justiceState();
  console.log('justice stage:', j.stage, 'exiled:', j.exiled);
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
