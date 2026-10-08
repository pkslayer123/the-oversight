// RED TEST (2026-10-07): the `language` debug scenario promises "Nobody here
// speaks English", but its setup writes to village.bgLangs — which npcLangs()
// ignores for hydrated villagers (game.js:1248: person.languages wins, and the
// generated cast carry {native:'english', levels:{english:2}}). So commLevel()
// returns 'full' and startConvo opens a fluent English thread instead of the
// nonverbal (nv:) barrier. The scenario's premise silently doesn't hold.
// Expected after fix: every roster villager has commLevel 'none' and
// startConvo opens thread 'nonverbal'.
const H = require('../hidden_files/playtest-54/harness-load.js');
const Game = H.Game;
(async () => {
  await Game.init();
  Game.debugScenario('language');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  let failures = 0;
  for (const vid of roster) {
    const cl = Game.commLevel(vid);
    if (!cl || cl.level !== 'none') {
      console.log('FAIL: commLevel(' + vid + ') = ' + JSON.stringify(cl) + ' (expected level "none")');
      failures++;
    }
  }
  const vid = roster[0];
  Game.startConvo(vid);
  const c = Game.convoGet(vid);
  if (c.thread !== 'nonverbal') {
    console.log('FAIL: convo thread = "' + c.thread + '" (expected "nonverbal")');
    failures++;
  }
  const ch = Game.convoChoices(vid) || [];
  if (!ch.some(x => String(x.id).indexOf('nv:') === 0)) {
    console.log('FAIL: no nv: choices offered; got: ' + ch.map(x => x.id).join(','));
    failures++;
  }
  console.log(failures ? 'RED: ' + failures + ' failure(s)' : 'GREEN: language barrier holds');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
