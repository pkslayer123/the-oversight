// RED TEST (2026-10-07): in the mootJuror scenario, pressing an accused about
// a planted inconsistency ends with the outcome box "Done — their story has a
// crack in it now." voiced AS the accused's dialogue (betrayal.js ~2997 routes
// through finish() -> sayLine(), which always renders "Name: ..."). That's
// investigation narration, not something the suspect would say about their own
// cover story — a voice-attribution break on the scenario's core "find the
// seam" beat. Expected after fix: the outcome line is narrated (no NPC voice
// prefix), and the transcript records it as narration, not 'them'.
const H = require('../harness-load.js');
const Game = H.Game;
(async () => {
  const cap = H.captureSay();
  await Game.init();
  Game.debugScenario('mootJuror');
  cap.log.splice(0);
  const cs = (Game.betrayalState().cases || []).find(x => x.knownToPlayer && x.playerRole === 'juror');
  if (!cs) { console.log('SETUP FAIL: no juror case'); process.exit(2); }
  // the leader always carries a planted, unfound inconsistency (betrayal.js:846)
  const acc = cs.accused[0];
  Game.startConvo(acc);
  const ch = Game.convoChoices(acc) || [];
  const press = ch.find(c => c.id.indexOf('betrayal:press:') === 0 && c.id.endsWith(acc));
  if (!press) { console.log('SETUP FAIL: no press choice for leader'); process.exit(2); }
  Game.convoTurn(acc, press.id);
  const out = cap.log.splice(0);
  const c = Game.convoGet(acc);
  cap.restore();
  const voiced = out.filter(l => /:\s*"Done — their story has a crack in it now\./.test(l));
  const narrAsThem = (c.transcript || []).filter(t => t.who === 'them' && /their story has a crack/.test(t.text || ''));
  let failures = 0;
  if (voiced.length) {
    console.log('FAIL: press outcome voiced as NPC dialogue:');
    voiced.forEach(l => console.log('  ' + l.slice(0, 110)));
    failures++;
  }
  if (narrAsThem.length) {
    console.log('FAIL: press outcome filed in transcript as them=' + narrAsThem.length);
    failures++;
  }
  if (!failures && !out.some(l => /their story has a crack/.test(l))) {
    console.log('WARN: outcome line missing entirely (press may not have broken)');
  }
  console.log(failures ? 'RED: ' + failures + ' failure(s)' : 'GREEN: press outcome narrated, not voiced');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
