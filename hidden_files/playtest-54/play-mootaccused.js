const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('mootAccused');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  const cs = step('find my case', () => {
    const cases = (Game.betrayalState().cases || []);
    const mine = cases.find(c => (c.accused || []).includes(Game.villagerId) && (c.status === 'open' || c.status === 'dormant'));
    console.log('cases:', cases.length, 'mine:', mine && mine.id, 'status:', mine && mine.status, 'role:', mine && mine.playerRole, 'charge:', mine && mine.charge);
    return mine;
  });
  if (!cs) { console.log('NO CASE - cannot play'); cap.restore(); return; }
  step('dossier actions', () => {
    const acts = Game.caseDossierActions(cs.id) || [];
    console.log('ACTIONS:', acts.map(a => a.id + ': ' + a.label).join(' | '));
  });
  step('speak in defense', () => Game.caseDossierDo(cs.id, 'speak'));
  step('call character witnesses', () => Game.caseDossierDo(cs.id, 'alibi'));
  step('force the moot NOW', () => Game.caseDossierDo(cs.id, 'demandmoot'));
  step('after demand: trial state', () => {
    const c = Game.getCase(cs.id);
    console.log('status:', c.status, 'trial:', !!c.trial, 'awaitingPlayerVote:', c.trial && c.trial.awaitingPlayerVote, 'convicted:', c.trial && c.trial.convicted);
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
