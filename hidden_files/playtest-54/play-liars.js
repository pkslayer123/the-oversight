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
    console.log(out.slice(0, 25).join('\n').slice(0, 3200));
    return r;
  };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 5);
  const vid = roster[0];
  step('liar lies check', () => {
    const lies = Game.npcLies(vid);
    console.log('lies:', JSON.stringify(lies && {occ: lies.occupation && lies.occupation.told, org: lies.origin && lies.origin.told}));
    console.log('truth:', Game.vpOf(vid).formerOccupation);
  });
  step('startConvo', () => Game.startConvo(vid));
  const ch = step('choices', () => {
    const c = Game.convoChoices(vid) || [];
    console.log('CHOICES:', c.slice(0,14).map(x=>x.id).join(', '));
    return c;
  });
  const personal = ch.find(c => c.id === 'ask:personal') || ch.find(c => c.id.indexOf('personal') >= 0);
  if (personal) step('ask personal (' + personal.id + ')', () => {
    const r = Game.convoTurn(vid, personal.id);
    return r;
  });
  // look for lie-confrontation choice
  const ch2 = Game.convoChoices(vid) || [];
  console.log('CHOICES2:', ch2.slice(0,16).map(x=>x.id).join(', '));
  const callout = ch2.find(c => /lie|doubt|call|truth|confront/i.test(c.id + ' ' + c.label));
  if (callout) step('confront (' + callout.id + ')', () => Game.convoTurn(vid, callout.id));
  else console.log('NO lie-confrontation choice offered');
  // check journal: did the lie get recorded as fact?
  step('journal check', () => {
    try {
      const j = Game.journalFor ? Game.journalFor(vid) : null;
      console.log('journal entries:', JSON.stringify(j).slice(0, 500));
    } catch (e) { console.log('no journalFor:', e.message); }
  });
  cap.restore();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
