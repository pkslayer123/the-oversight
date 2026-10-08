const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('day7');
  const setup = cap.log.splice(0);
  console.log('SETUP (last 8):'); console.log(setup.slice(-8).join('\n'));
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 30).join('\n').slice(0, 3500));
    return r;
  };
  step('take action -> System arrival', () => Game.doAction('wait'));
  console.log('systemArrived =', Game.state.systemArrived);
  step('talk to a villager post-arrival', () => {
    const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    const vid = roster[0];
    Game.startConvo(vid);
    const ch = Game.convoChoices(vid) || [];
    console.log('CHOICES:', ch.slice(0,8).map(c=>c.id+': '+String(c.label).slice(0,60)).join(' | '));
    return Game.convoTurn(vid, ch[0] && ch[0].id);
  });
  step('check abilities unlocked', () => {
    const ab = Game.state.scholar.abilities || Game.state.scholar.kit || [];
    console.log('abilities/kit:', JSON.stringify(ab).slice(0,300));
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
