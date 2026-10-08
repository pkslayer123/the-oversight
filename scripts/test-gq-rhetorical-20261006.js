// PROOF: generic-question classifier must not hang rhetorical "?" lines as
// questions the player owes an answer to. Before the fix, these two real
// playtest lines produced a bogus hanging genericQ and the follow-up
// '"Sorry — I asked you something there." <line>' pester:
//   1. '"Keep it between us, yeah? Forget it."'  (tag question, not a question)
//   2. '"You know what I miss? Minneapolis, USA rain."' (self-answered opener)
// Also: '"Say that again?"' should classify as yn (a request), not open
// (whose answers are opinion-takes like "My take? ...").
// Usage: node scripts/test-gq-rhetorical-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  await Game.init();
  try { Game.debugScenario('day1'); } catch (e) { console.log('scenario fail:', e.message); process.exit(2); }
  const v = Game.state.village;
  const roster = (v.roster || []).slice(0, 4);

  // Rhetorical lines: NO genericQ may hang.
  const rhetorical = [
    '"Keep it between us, yeah? Forget it."',
    '"You know what I miss? Minneapolis, USA rain. Specific rain. I\'m allowed to be specific."',
    '"Guess what? I found the good mushrooms again."',
    '"That was close, right? Too close."',
    '"Seriously, huh? What a day."',
  ];
  for (const vid of roster) {
    const st = Game.startConvo(vid);
    if (!st) continue;
    for (const line of rhetorical) {
      Game.convoGet(vid).genericQ = null; // reset between probes
      Game.convoGenericQ(vid, line);
      const gq = Game.convoGet(vid).genericQ;
      check(`no hang: ${line.slice(0, 46)}`, !gq, gq ? `hung as kind=${gq.kind} q="${gq.q}"` : '');
    }
    Game.endConvo(vid, 'left');
  }

  // Genuine questions: MUST still hang (no over-correction).
  const genuine = [
    ['"Are you eating enough? You look thin."', 'yn'],
    ['"Got a read on anyone here yet? Who should I be watching?"', 'open'],
    ['"What do you think is actually going on here?"', 'open'],
    ['"Say that again? I was somewhere better."', 'yn'],
    ['"Walk with me?"', 'yn'],
  ];
  const vid = roster[0];
  Game.startConvo(vid);
  for (const [line, wantKind] of genuine) {
    Game.convoGet(vid).genericQ = null;
    Game.convoGenericQ(vid, line);
    const gq = Game.convoGet(vid).genericQ;
    check(`hangs (${wantKind}): ${line.slice(0, 44)}`, !!gq && gq.kind === wantKind,
      !gq ? 'no genericQ hung' : `kind=${gq.kind}`);
  }
  Game.endConvo(vid, 'left');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
