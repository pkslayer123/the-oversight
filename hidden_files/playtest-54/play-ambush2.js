const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('ambush');
  cap.log.splice(0);
  const plot = (Game.betrayalState().plots || []).find(x => x.sprung);
  for (let i = 0; i < 6; i++) {
    if (plot.outcome) { console.log('resolved: ' + plot.outcome); break; }
    try { Game.ambushExchange(plot, 'fight'); } catch (e) { console.log('THROW: ' + e.message); break; }
  }
  const out = cap.log.splice(0);
  console.log(out.slice(-14).join('\n').slice(0, 2500));
  const cases = (Game.betrayalState().cases || []).filter(c => c.plotId === plot.id);
  console.log('cases:', cases.map(c => c.id + ':' + c.status).join(','));
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
