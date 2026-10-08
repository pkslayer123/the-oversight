const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('day7');
  cap.log.splice(0);
  Game.doAction('wait');
  cap.log.splice(0);
  const choices = Game.state.scholar.abilityChoices || [];
  console.log('offered:', choices.map(c => c.id + ':' + c.name).join(' | ') || 'NONE');
  if (choices.length) {
    Game.chooseAbility(choices[0].id);
    const out = cap.log.splice(0);
    console.log(out.join('\n').slice(0, 1200));
    console.log('abilities now:', (Game.state.scholar.abilities||[]).map(a=>a.id+':L'+a.level).join(','));
  }
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
