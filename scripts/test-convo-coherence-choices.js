// Thread-coherent conversation choices. Usage: node scripts/test-convo-coherence-choices.js
// Steve's report (2026-10-06): "we choose an option and instead of having a
// few sensical things to say, we have a bunch of options including nonsequitors."
// Rules under test:
//  1. After ask:<topic>, the next menu LEADS with on-thread follow-ups
//     (follow:<topic>:*), not the full topic dump.
//  2. Other ask:* topics are demoted mid-thread (behind the subject pivot).
//  3. 'subject' opens a subject menu the player picks from — no random jump.
//  4. Exits (leave) always present; pendingQ answers still first.
//  5. follow: choices produce on-thread lines and don't repeat.
//  6. speak_back still offered when eligible; lastBeat tracked.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const idsOf = (choices) => choices.map(c => c.id);

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
}
function startWithOpener(vid, line, thread) {
  const real = Game.convoOpening;
  Game.convoOpening = () => ({ line, thread: thread || 'small' });
  const st = Game.startConvo(vid);
  Game.convoOpening = real;
  return st;
}
// settle: clear NPC-initiated question state after a scripted turn, so the
// assertions test the on-thread menu — not the (correct) answers-first
// narrowing when the NPC asks something back.
function settle(vid) {
  const c = Game.convoGet(vid);
  c.pendingQ = null; c.heldBeats = []; c.heldAsk = false;
  c.reactiveQ = null; c.genericQ = null;
  c.winddownQueued = false; c.windingDown = false;
}

(async () => {
  await Game.init();

  // === 1. lastBeat tracked after a topic ask ===
  {
    const [vid] = freshGame();
    startWithOpener(vid, '"Hey."', 'small');
    Game.convoTurn(vid, 'ask:village');
    settle(vid);
    const c = Game.convoGet(vid);
    ok('lastBeat recorded', !!c.lastBeat);
    ok('lastBeat kind=ask id=village', c.lastBeat && c.lastBeat.kind === 'ask' && c.lastBeat.id === 'village');
    ok('thread set to village', c.thread === 'village');
  }

  // === 2. follow-ups lead the next menu; other topics demoted ===
  {
    const [vid] = freshGame();
    startWithOpener(vid, '"Hey."', 'small');
    Game.convoTurn(vid, 'ask:village');
    settle(vid);
    const ids = idsOf(Game.convoChoices(vid));
    const follows = ids.filter(id => id.indexOf('follow:village:') === 0);
    ok('follow-ups present after ask:village', follows.length >= 2);
    const otherAsks = ids.filter(id => id.indexOf('ask:') === 0);
    ok('no other ask:* topics mid-thread', otherAsks.length === 0);
    const firstFollow = ids.findIndex(id => id.indexOf('follow:') === 0);
    const firstOff = ids.findIndex(id => ['theorize', 'teach', 'trade', 'observe', 'offer_help'].indexOf(id) !== -1);
    ok('follow-ups lead discovery actions', firstFollow !== -1 && (firstOff === -1 || firstFollow < firstOff));
    ok('subject pivot present', ids.indexOf('subject') !== -1);
    ok('leave present', ids.indexOf('leave') !== -1);
    ok('a react present', ['agree', 'joke', 'silence'].some(r => ids.indexOf(r) !== -1));
  }

  // === 3. follow: choice stays on-thread, doesn't repeat ===
  {
    const [vid] = freshGame();
    startWithOpener(vid, '"Hey."', 'small');
    Game.convoTurn(vid, 'ask:village');
    const ids1 = idsOf(Game.convoChoices(vid));
    const f0 = ids1.find(id => id.indexOf('follow:village:') === 0);
    ok('found a follow-up to take', !!f0);
    const r = Game.convoTurn(vid, f0);
    settle(vid);
    const c = Game.convoGet(vid);
    ok('thread still village after follow-up', c.thread === 'village');
    ok('follow-up produced a line', !!(r && r.line));
    ok('lastBeat kind=follow', c.lastBeat && c.lastBeat.kind === 'follow' && c.lastBeat.id === 'village');
    const ids2 = idsOf(Game.convoChoices(vid));
    ok('used follow-up not repeated', ids2.indexOf(f0) === -1);
    ok('other follow-ups still offered', ids2.some(id => id.indexOf('follow:village:') === 0));
  }

  // === 4. subject opens a menu; player picks; no random jump ===
  {
    const [vid] = freshGame();
    startWithOpener(vid, '"Hey."', 'small');
    Game.convoTurn(vid, 'ask:village');
    Game.convoTurn(vid, 'subject');
    settle(vid);
    const c = Game.convoGet(vid);
    ok('choosingSubject set', c.choosingSubject === true);
    const ids = idsOf(Game.convoChoices(vid));
    ok('subject menu has ask:* options', ids.some(id => id.indexOf('ask:') === 0));
    ok('subject menu has no follow-ups', !ids.some(id => id.indexOf('follow:') === 0));
    ok('subject menu has leave', ids.indexOf('leave') !== -1);
    // pick one deliberately
    const pick = ids.find(id => id === 'ask:past') || ids.find(id => id.indexOf('ask:') === 0);
    Game.convoTurn(vid, pick);
    settle(vid);
    const c2 = Game.convoGet(vid);
    ok('choosingSubject cleared after pick', !c2.choosingSubject);
    ok('thread follows the pick', c2.thread === pick.slice(4));
  }

  // === 5. opener (no thread) still shows the topic menu ===
  {
    const [vid] = freshGame();
    const st = startWithOpener(vid, '"Hey."', 'small');
    const ids = idsOf(st.choices);
    ok('opener lists ask:* topics', ids.some(id => id.indexOf('ask:') === 0));
    ok('opener has no follow-ups', !ids.some(id => id.indexOf('follow:') === 0));
  }

  // === 6. pendingQ answers still first ===
  {
    const [vid] = freshGame();
    startWithOpener(vid, '"Hey."', 'small');
    Game.convoTurn(vid, 'ask:village');
    const c = Game.convoGet(vid);
    c.pendingQ = { id: 'q_test', answers: [{ id: 'a1', label: 'Yes.' }, { id: 'a2', label: 'No.' }] };
    const ids = idsOf(Game.convoChoices(vid));
    ok('pending answers first', ids[0] === 'ans:q_test:a1' && ids[1] === 'ans:q_test:a2');
    c.pendingQ = null;
  }

  // === 7. speak_back still offered when eligible (mid-thread and opener) ===
  {
    const [vid] = freshGame();
    const realNative = Game.npcNativeLang;
    Game.npcNativeLang = () => 'italian';
    Game.state.scholar.langExposure = { italian: 5 };
    try {
      const st = startWithOpener(vid, '"Hey."', 'small');
      ok('speak_back in opener when eligible', idsOf(st.choices).indexOf('speak_back') !== -1);
      Game.convoTurn(vid, 'ask:village');
      settle(vid);
      const ids = idsOf(Game.convoChoices(vid));
      ok('speak_back offered mid-thread', ids.indexOf('speak_back') !== -1);
    } finally { Game.npcNativeLang = realNative; }
  }

  // === 8. multi-turn thread stays coherent (played transcript) ===
  {
    const [vid] = freshGame();
    startWithOpener(vid, '"Hey."', 'small');
    const transcript = [];
    let turn = Game.convoTurn(vid, 'ask:past');
    transcript.push('YOU: ask:past', 'THEM: ' + String(turn.line).slice(0, 60));
    for (let i = 0; i < 3; i++) {
      const ids = idsOf(Game.convoChoices(vid));
      const f = ids.find(id => id.indexOf('follow:past:') === 0) || ids.find(id => id === 'more');
      if (!f) break;
      turn = Game.convoTurn(vid, f);
      settle(vid);
      transcript.push('YOU: ' + f, 'THEM: ' + String(turn.line).slice(0, 60));
    }
    const c = Game.convoGet(vid);
    ok('3-turn past thread stayed on past', c.thread === 'past');
    ok('transcript has 4+ entries', Game.convoGet(vid).transcript.length >= 4);
    // every follow-up label is a sensible next thing, not a topic dump
    const labels = Game.convoChoices(vid).map(x => x.label);
    ok('no ask:* labels in mid-thread menu labels', !labels.some(l => /ask about|tell me about your/i.test(l)));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
