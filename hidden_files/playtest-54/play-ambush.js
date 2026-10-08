const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('ambush');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  const plot = step('find plot', () => {
    const plots = Game.betrayalState().plots || [];
    const p = plots.find(x => x.sprung) || plots[0];
    console.log('plot:', p && p.id, 'state:', p && p.state, 'round:', p && p.round, 'talksLeft:', p && p.talksLeft);
    return p;
  });
  if (!plot) { console.log('NO PLOT'); cap.restore(); return; }
  step('TALK x1', () => Game.ambushExchange(plot, 'talk'));
  step('TALK x2', () => Game.ambushExchange(plot, 'talk'));
  step('TALK x3', () => Game.ambushExchange(plot, 'talk'));
  step('RUN', () => Game.ambushExchange(plot, 'run'));
  step('aftermath state', () => {
    console.log('plot outcome:', plot.outcome, 'state:', plot.state);
    const cases = (Game.betrayalState().cases || []).filter(c => c.plotId === plot.id);
    console.log('cases from plot:', cases.map(c => c.id + ':' + c.charge + ':' + c.status).join(', ') || 'NONE');
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
