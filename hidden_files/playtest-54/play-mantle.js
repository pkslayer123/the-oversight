const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('mantle');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message + '\n' + (e.stack||'').split('\n').slice(1,3).join('\n')); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  step('who am I now', () => {
    const s = Game.state.scholar;
    console.log('villagerId:', Game.villagerId, 'over:', Game.state.over);
    console.log('scholar name:', s.name);
  });
  // talk to David (the one who said "You're not her")
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const david = roster.find(id => /david/i.test(Game.displayName(id))) || roster[0];
  step('talk to ' + Game.displayName(david), () => {
    Game.startConvo(david);
    const ch = Game.convoChoices(david) || [];
    console.log('CHOICES:', ch.slice(0,8).map(c=>c.id).join(','));
    return ch.length;
  });
  step('take an action (wait)', () => Game.doAction('wait'));
  step('codex continuity', () => {
    const notes = (Game.state.codex && Game.state.codex.notes) || [];
    console.log('codex notes:', notes.length);
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
