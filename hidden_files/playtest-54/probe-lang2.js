const H = require('./harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('language');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = roster[0];
  // manual fix: override person.languages (what npcLangs actually reads)
  Game.getPerson(vid).languages = { native: 'italian', levels: { italian: 3 } };
  console.log('commLevel now:', JSON.stringify(Game.commLevel(vid)));
  Game.startConvo(vid);
  const c = Game.convoGet(vid);
  console.log('thread:', c.thread, '| nativeLang:', c.nativeLang);
  const ch = Game.convoChoices(vid) || [];
  console.log('CHOICES:', ch.map(x=>x.id).join(', '));
  console.log('--- say output:'); console.log(cap.log.splice(0).join('\n').slice(0, 2500));
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
