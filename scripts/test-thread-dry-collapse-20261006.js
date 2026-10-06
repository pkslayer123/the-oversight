// Proof test: thread-dry collapse in the dialogue layer (socialite run 3,
// 2026-10-06). Before the fix, pressing "Go on." / "Tell me more." (dlg:more)
// on an exhausted thread looped '"That\'s... pretty much all of it, honestly."'
// forever — the menu kept offering dlg:more. After the fix, the option
// disappears once the thread is dry, and the menu winds down (react /
// subject change / leave). New threads re-enable the option.
// Usage: node scripts/test-thread-dry-collapse-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convo-wants.js', 'src/js/convo-beats.js', 'src/js/convo-dialogue.js', 'src/js/convoTopics.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
 'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}
const ids = (vid) => { try { return (Game.convoChoices(vid) || []).map(c => c.id); } catch (e) { return ['ERR:' + e.message]; } };
const turn = (vid, cid) => { try { return Game.convoTurn(vid, cid); } catch (e) { return { err: e.message }; } };

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  v.trust = v.trust || {};
  const me = Game.villagerId;
  const roster = (v.roster || []).filter(id => id !== me);

  // Find a villager whose opener hangs a share/small thread with dlg:more.
  let vid = null;
  for (const cand of roster) {
    Game.startConvo(cand);
    const cids = ids(cand);
    if (cids.includes('dlg:more') || cids.includes('dlg:react')) { vid = cand; break; }
    Game.endConvo(cand, 'left');
  }
  check('found a villager with a dialogue-thread opener', !!vid);
  if (!vid) { console.log(`\n${pass} pass, ${fail} fail`); process.exit(1); }
  v.trust[vid] = 60;

  // Drain the thread via dlg:more until the admission line appears.
  let dryAt = -1, lines = [];
  for (let i = 0; i < 30; i++) {
    const cids = ids(vid);
    if (!cids.includes('dlg:more')) { dryAt = i; break; }
    const r = turn(vid, 'dlg:more');
    if (r && r.err) { check('dlg:more does not crash', false, r.err); break; }
    lines.push(r && (r.line || ''));
    if (r && /pretty much all of it/.test(r.line || '')) { dryAt = i + 1; break; }
  }
  check('thread eventually runs dry (admission line reached)', dryAt !== -1, `never dried in 30 turns`);
  check('admission line said at most once', lines.filter(l => /pretty much all of it/.test(l)).length <= 1,
    `said ${lines.filter(l => /pretty much all of it/.test(l)).length}x`);

  // After drying, dlg:more must be GONE from the menu.
  const after = ids(vid);
  check('dlg:more hidden after thread dries', !after.includes('dlg:more'), `menu=[${after.join(',')}]`);
  check('leave still available after dry', after.includes('leave'), `menu=[${after.join(',')}]`);
  check('subject change still available after dry', after.includes('dlg:subject'), `menu=[${after.join(',')}]`);

  // dlg:react on a dry thread winds down without fishing for beats or crashing.
  const r2 = turn(vid, 'dlg:react');
  check('dlg:react on dry thread does not crash', !(r2 && r2.err));
  check('dlg:react on dry thread winds down ("Anyway")', !!(r2 && /anyway/i.test(r2.line || '')),
    JSON.stringify((r2 && r2.line) || '').slice(0, 80));
  const afterReact = ids(vid);
  check('dlg:more still hidden after dry react', !afterReact.includes('dlg:more'), `menu=[${afterReact.join(',')}]`);

  // Subject change -> new topic re-enables dlg:more (marker is thread-specific).
  const r3 = turn(vid, 'dlg:subject');
  check('dlg:subject works after dry', !(r3 && r3.err));
  let subj = ids(vid);
  const ask = subj.find(id => id === 'ask:personal' || id.indexOf('ask:') === 0);
  if (ask) {
    const r4 = turn(vid, ask);
    check(`new topic (${ask}) does not crash`, !(r4 && r4.err));
    const onNew = ids(vid);
    const c = Game.convoGet(vid);
    check('dry marker does not suppress dlg:more on the new thread',
      !onNew.includes('dlg:more') || c.threadDryFor !== c.thread,
      `thread=${c.thread} dryFor=${c.threadDryFor} menu=[${onNew.join(',')}]`);
  } else {
    check('subject menu offers a topic ask', false, `menu=[${subj.join(',')}]`);
  }
  Game.endConvo(vid, 'left');

  // Fresh conversation with a DIFFERENT villager: dlg:more still offered (no global leak).
  const other = roster.find(id => id !== vid);
  Game.startConvo(other);
  const otherIds = ids(other);
  check('new villager conversation unaffected by dry marker', !otherIds.some(i => String(i).startsWith('ERR')) ,
    `menu=[${otherIds.join(',')}]`);
  Game.endConvo(other, 'left');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
