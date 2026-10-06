// REPRO: exhausted mootJuror press repeats one fixed line forever (Steve 2026-10-06).
// pressAccomplice (betrayal.js) has a single fixed fallback once all
// inconsistencies are found: "Their story holds — this time. The rehearsed
// parts are smooth." The betrayal:press choice stays offered (gated only on
// case open), so pressing N times yields N identical lines — the shared-pool
// repetition class (dd69062 fixed askAboutCase/uprising barks; this sibling
// was missed).
// Usage: node scripts/test-social-press-exhausted.js  (exit 1 = bug present)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
(async () => {
  await Game.init();
  Game.debugScenario('mootJuror');
  const cs = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror');
  const accused = ((cs && (cs.accusedIds || cs.accused || [])) || []);
  let fail = 0, tested = 0;
  for (const vid of accused) {
    Game.startConvo(vid);
    const press = (Game.convoChoices(vid) || []).find(c => /^betrayal:press/.test(c.id));
    if (!press) { try { Game.endConvo(vid, 'left'); } catch (e) {} continue; }
    // force the exhausted path: every inconsistency already found
    for (const inc of (cs.inconsistencies || [])) inc.found = true;
    const got = [];
    const _say = Game.say.bind(Game);
    for (let i = 0; i < 2; i++) {
      const buf = [];
      Game.say = (t) => { buf.push(String(t)); return _say(t); };
      Game.convoTurn(vid, press.id);
      Game.say = _say;
      got.push(buf.join(' '));
    }
    tested++;
    // exhaust: all inconsistencies found -> fallback repeats verbatim?
    const fallback = got.filter(g => /their story holds/i.test(g));
    if (fallback.length >= 2 && fallback[0] === fallback[1]) {
      fail++;
      console.log(`FAIL ${vid}: exhausted press repeats verbatim x${fallback.length}:`);
      console.log(`     "${fallback[0].slice(0, 100)}"`);
    }
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }
  console.log(tested ? (fail ? `\n${fail} exhausted-press repetition bug(s)` : '\nALL PASS: exhausted press varies or gates out') : '\n(no press choices found — harness issue)');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
