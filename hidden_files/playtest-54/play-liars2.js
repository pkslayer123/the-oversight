const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('liars');
  cap.log.splice(0);
  const step = (label, fn) => {
    let r = null;
    try { r = fn(); } catch (e) { cap.log.push('THROW ' + label + ': ' + e.message); }
    const out = cap.log.splice(0);
    console.log('\n### ' + label + ' (' + out.length + ' lines)');
    console.log(out.slice(0, 20).join('\n').slice(0, 2800));
    return r;
  };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 5);
  const vid = roster[0];
  step('startConvo', () => Game.startConvo(vid));
  // dlg:subject -> topics -> personal
  step('subject', () => Game.convoTurn(vid, 'dlg:subject'));
  let ch = Game.convoChoices(vid) || [];
  console.log('CHOICES:', ch.slice(0,14).map(x=>x.id).join(', '));
  const askP = ch.find(c => /personal/.test(c.id));
  if (askP) step('ask personal', () => Game.convoTurn(vid, askP.id));
  // now observe via choice
  ch = Game.convoChoices(vid) || [];
  const obs = ch.find(c => /observ/.test(c.id + ' ' + c.label));
  console.log('observe choice:', obs && obs.id);
  for (let i = 0; i < 6 && !Game.getDoubts(vid).length; i++) {
    step('observe #' + (i+1), () => Game.observePerson(vid));
    if (Game.getDoubts(vid).length) break;
  }
  console.log('doubts:', JSON.stringify(Game.getDoubts(vid).map(d => d.kind + ': ' + String(d.text).slice(0,80))));
  ch = Game.convoChoices(vid) || [];
  const cf = ch.find(c => c.id.indexOf('confront:') === 0);
  console.log('confront choice:', cf && (cf.id + ' :: ' + String(cf.label).slice(0,80)));
  if (cf) step('confront', () => Game.convoTurn(vid, cf.id));
  // check confession state
  step('lies after confront', () => {
    const lies = Game.npcLies(vid);
    console.log('confessed:', lies.occupation && lies.occupation.confessed, 'truth now told:', JSON.stringify(lies.occupation && lies.occupation.truth));
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
