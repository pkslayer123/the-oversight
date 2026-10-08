const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('day1');
  const setup = cap.log.splice(0);
  console.log('SETUP (last 3):'); console.log(setup.slice(-3).join('\n'));
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = step('pick a villager', () => { console.log('roster:', roster.length, 'first:', Game.displayName(roster[0])); return roster[0]; });
  step('startConvo', () => Game.startConvo(vid));
  step('choices', () => {
    const ch = Game.convoChoices(vid) || [];
    console.log('CHOICES:', ch.slice(0,10).map(c=>c.id).join(', '));
    return ch;
  });
  let ch = Game.convoChoices(vid) || [];
  const personal = ch.find(c => c.id === 'ask:personal') || ch[0];
  step('ask personal (' + (personal && personal.id) + ')', () => Game.convoTurn(vid, personal.id));
  step('wait a while (time passes?)', () => Game.doAction('wait'));
  console.log('dayPart after wait:', Game.dayPart, 'day:', Game.state.scholar.day);
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
