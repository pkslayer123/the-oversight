const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('mootJuror');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  const cs = step('find case', () => {
    const cases = (Game.betrayalState().cases || []);
    const c = cases.find(x => x.knownToPlayer && x.playerRole === 'juror');
    console.log('case:', c && c.id, 'accused:', (c.accused||[]).map(a=>Game.displayName(a)).join(', '), 'target:', c && Game.displayName(c.target), 'weakest:', c && c.weakest && Game.displayName(c.weakest));
    return c;
  });
  if (!cs) { console.log('NO CASE'); cap.restore(); return; }
  // press the accused separately via conversation
  const acc0 = cs.accused[0];
  step('startConvo with accused[0]', () => Game.startConvo(acc0));
  const ch = step('choices', () => {
    const c = Game.convoChoices(acc0) || [];
    console.log('CHOICES:', c.slice(0,14).map(x=>x.id).join(', '));
    return c;
  });
  const press = ch.find(c => c.id.indexOf('betrayal:press:') === 0);
  if (press) step('press ' + press.id, () => Game.convoTurn(acc0, press.id));
  else console.log('NO press choice');
  // flip the weakest
  if (cs.weakest && cs.weakest !== acc0) {
    step('startConvo with weakest', () => Game.startConvo(cs.weakest));
    const ch2 = Game.convoChoices(cs.weakest) || [];
    const appr = ch2.find(c => c.id.indexOf('betrayal:approach:') === 0);
    console.log('approach choice:', appr && appr.id);
    if (appr) step('approach weakest', () => Game.convoTurn(cs.weakest, appr.id));
  }
  // force the trial
  step('conduct trial', () => {
    const r = Game.conductTrial(cs);
    console.log('trial result keys:', r && Object.keys(r).join(','));
    return r;
  });
  const c2 = Game.getCase(cs.id);
  if (c2.trial && c2.trial.awaitingPlayerVote) {
    step('cast vote: GUILTY', () => Game.castPlayerVote(cs.id, true));
  } else {
    step('trial state (no player vote)', () => {
      console.log('convicted:', c2.trial && c2.trial.convicted, 'playerVoter:', c2.trial && c2.trial.playerVoter);
    });
  }
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
