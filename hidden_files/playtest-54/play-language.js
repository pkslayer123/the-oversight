const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('language');
  const setup = cap.log.splice(0);
  console.log('SETUP (last 2):'); console.log(setup.slice(-2).join('\n'));
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  step('startConvo with stranger', () => Game.startConvo(vid));
  const ch = step('list choices (expect nonverbal)', () => {
    const c = Game.convoChoices(vid) || [];
    console.log('CHOICES:', c.slice(0,12).map(x=>x.id).join(', '));
    return c;
  });
  const gesture = ch.find(c => /gesture|nonverbal|draw|listen/i.test(c.id)) || ch[0];
  step('use gesture (' + gesture.id + ')', () => Game.convoTurn(vid, gesture.id));
  // check: does their reply contain English words / their name (should be descriptors)?
  step('check name knowledge', () => {
    console.log('nameKnown:', Game.nameKnown(vid), 'displayName:', Game.displayName(vid));
    const c2 = Game.convoGet(vid);
    const last = (c2.transcript || []).slice(-3).map(t => t.who + ': ' + String(t.text).slice(0,150)).join('\n');
    console.log('TRANSCRIPT tail:\n' + last);
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
