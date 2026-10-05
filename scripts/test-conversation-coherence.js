// Conversation coherence tests. Usage: node scripts/test-conversation-coherence.js
// Steve's report: "Did you see that, just now? By the tree line." ->
// "Let me show you something." -> canned BURDOCK lesson (non sequitur) ->
// hard pivot to "What are you hoping for?" with no bridge.
// Rules under test:
//  1. Direct NPC questions get contextual answers (not just subject-changes).
//  2. Teach/theorize pivots are suppressed while a direct question hangs.
//  3. Unanswered questions linger: one follow-up, then a lapse line — never
//     silently dropped for a random new topic.
//  4. Genuinely new NPC questions mid-thread carry a narrative bridge.
//  5. Every choice outcome reads as a RESPONSE to the last beat.
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
// Force the tree-line opener by stubbing convoOpening, then restore.
function startWithOpener(vid, line, thread) {
  const real = Game.convoOpening;
  Game.convoOpening = () => ({ line, thread: thread || 'small' });
  const st = Game.startConvo(vid);
  Game.convoOpening = real;
  return st;
}
function seedTeachable(vid) {
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.plants = { burdock: { level: 2 } };
  Game.state.village.taught = Game.state.village.taught || {};
  Game.state.village.taught[vid] = [];
}

(async () => {
  await Game.init();

  // === 1. REGISTRY AUDIT: every match string exists in the shipped dialogue ===
  {
    const raw = fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8');
    const defs = ['rq_treeline', 'rq_heard', 'rq_wants', 'rq_shifting', 'rq_personal',
      'rq_holding', 'rq_alright', 'rq_busy', 'rq_others', 'rq_monsters'];
    for (const id of defs) {
      const m = Game.convoMatchReactive('x') // null probe; real check below via source scan
      void m;
    }
    // pull match strings out of the source and verify each appears in data.
    // convoMatchReactive matches case-insensitively on a normalized line
    // (bespoke defs are short fragments on purpose), so audit the same way.
    const src = fs.readFileSync(path.join(ROOT, 'src/js/conversation.js'), 'utf8');
    const matches = [...src.matchAll(/^\s*match: '((?:[^'\\]|\\.)*)',/gm)].map(x => x[1].replace(/\\'/g, "'"));
    const rawLower = raw.toLowerCase();
    ok('registry has entries', matches.length >= 8);
    for (const mt of matches) {
      ok(`match shipped in dialogue: ${mt.slice(0, 40)}`, rawLower.indexOf(mt.toLowerCase()) !== -1);
    }
    // every def has answers, followUp, lapse, and reactive reacts
    for (const mt of matches) {
      const def = Game.convoMatchReactive('zz' + mt + 'zz');
      ok(`def resolves: ${mt.slice(0, 30)}`, !!def);
      ok(`def has 2+ answers: ${mt.slice(0, 30)}`, def.answers.length >= 2);
      ok(`def has followUp: ${mt.slice(0, 30)}`, !!def.followUp);
      ok(`def has lapse: ${mt.slice(0, 30)}`, !!def.lapse);
      ok(`def has reacts: ${mt.slice(0, 30)}`, !!(def.reacts && def.reacts.agree && def.reacts.joke && def.reacts.silence));
    }
  }

  // === 2. THE SCREENSHOT SCENARIO: tree-line opener -> contextual answers, no burdock ===
  {
    const roster = freshGame();
    const A = roster[0];
    seedTeachable(A);
    startWithOpener(A, '"Did you see that, just now? By the tree line."', 'small');
    const c = Game.convoGet(A);
    ok('tree-line opener sets reactiveQ', c.reactiveQ && c.reactiveQ.id === 'rq_treeline');
    ok('tree-line opener sets spooked thread', c.thread === 'spooked');
    const choices = Game.convoChoices(A);
    const ids = idsOf(choices);
    ok('reactive answers come first', ids[0] === 'react:rq_treeline:saw');
    ok('all four reactive answers offered',
      ['react:rq_treeline:saw', 'react:rq_treeline:no', 'react:rq_treeline:look', 'react:rq_treeline:what']
        .every(id => ids.indexOf(id) !== -1));
    ok('teach suppressed while direct question hangs', ids.indexOf('teach') === -1);
    ok('theorize suppressed while direct question hangs', ids.indexOf('theorize') === -1);
    ok('leave still available', ids.indexOf('leave') !== -1);
    Game.endConvo(A, 'natural');
  }

  // === 3. ANSWERING: outcome responds to the question ===
  {
    const roster = freshGame();
    const A = roster[0];
    startWithOpener(A, '"Did you see that, just now? By the tree line."', 'small');
    const r = Game.convoTurn(A, 'react:rq_treeline:saw');
    ok('answer engages the question (not burdock)',
      /imagining|fire tonight/i.test(r.line) && !/Burdock|burdock/i.test(r.line));
    ok('reactiveQ cleared after answering', !Game.convoGet(A).reactiveQ);
    ok('thread stays on the scare', Game.convoGet(A).thread === 'spooked');
    ok('no random new question same turn (room to breathe)', !Game.convoGet(A).pendingQ);
    Game.endConvo(A, 'natural');
  }

  // === 4. "LOOK TOGETHER": the contextual show, not a plant lesson ===
  {
    const roster = freshGame();
    const A = roster[0];
    startWithOpener(A, '"Did you see that, just now? By the tree line."', 'small');
    const before = (Game.state.village.trust || {})[A] || 10;
    const r = Game.convoTurn(A, 'react:rq_treeline:look');
    ok('look-together goes to the tree line', /tree line/i.test(r.line));
    ok('look-together is not a plant lesson', !/Burdock|burdock|grows/i.test(r.line));
    ok('shared scare builds trust', ((Game.state.village.trust || {})[A] || 0) > before);
    Game.endConvo(A, 'natural');
  }

  // === 5. DODGED QUESTIONS LINGER: follow-up, then lapse — never a silent drop ===
  {
    const roster = freshGame();
    const A = roster[0];
    startWithOpener(A, '"Did you see that, just now? By the tree line."', 'small');
    // dodge: ask about the village instead of answering
    const r1 = Game.convoTurn(A, 'ask:village');
    const c1 = Game.convoGet(A);
    ok('dodged question persists', !!(c1.reactiveQ && c1.reactiveQ.id === 'rq_treeline'));
    ok('NPC follows up instead of changing topic',
      c1.transcript.some(t => t.who === 'them' && /tree line\. Did you see it/i.test(t.text)));
    ok('no random formal question while reactive hangs', !c1.pendingQ);
    ok('follow-up flagged', c1.reactiveQ.followedUp === true);
    // dodge AGAIN -> lapse with a line, then it's over
    Game.convoTurn(A, 'ask:plans');
    const c2 = Game.convoGet(A);
    ok('second dodge lapses the question', !c2.reactiveQ);
    ok('lapse gets a closing line, not silence',
      c2.transcript.some(t => t.who === 'them' && /Never mind\. Probably nothing/i.test(t.text)));
    Game.endConvo(A, 'natural');
  }

  // === 6. GENERIC REACTS BECOME ANSWERS when a direct question hangs ===
  {
    const roster = freshGame();
    const A = roster[0];
    startWithOpener(A, '"Did you see that, just now? By the tree line."', 'small');
    const r = Game.convoTurn(A, 'silence');
    ok('silence reads as a response to the scare', /paler|face/i.test(r.line));
    ok('reactiveQ consumed by the reaction', !Game.convoGet(A).reactiveQ);
    Game.endConvo(A, 'natural');
  }

  // === 7. BRIDGE: new NPC question mid-thread doesn't hard-pivot ===
  {
    const roster = freshGame();
    const A = roster[0];
    startWithOpener(A, '"Tell me about your goal."', 'goal');
    const c = Game.convoGet(A);
    c.depth = 2;
    const realRandom = Math.random;
    Math.random = () => 0.05; // force the 40% question roll
    try {
      Game.convoTurn(A, 'agree');
    } finally { Math.random = realRandom; }
    const c2 = Game.convoGet(A);
    const themLines = c2.transcript.filter(t => t.who === 'them').map(t => t.text).join(' || ');
    const bridged = /shaking something off|thread drop|something else entirely|Different subject/i.test(themLines);
    ok('topic pivot carries a bridge', bridged || !c2.pendingQ);
    Game.endConvo(A, 'natural');
  }

  // === 8. TEACH STAYS for neutral contexts (no over-suppression) ===
  {
    const roster = freshGame();
    const A = roster[0];
    seedTeachable(A);
    startWithOpener(A, '"Hey."', 'small');
    const ids = idsOf(Game.convoChoices(A));
    ok('teach offered in neutral small talk', ids.indexOf('teach') !== -1);
    Game.endConvo(A, 'natural');
    // ...but not on a grief opener
    const B = roster[1];
    seedTeachable(B);
    startWithOpener(B, '"Have you — sorry. I keep thinking about them."', 'grief');
    const idsB = idsOf(Game.convoChoices(B));
    ok('teach suppressed on grief opener', idsB.indexOf('teach') === -1);
    Game.endConvo(B, 'natural');
  }

  // === 9. rq_personal chains into a REAL question ===
  {
    const roster = freshGame();
    const A = roster[0];
    startWithOpener(A, '"Can I ask you something — person to person, not village business?"', 'small');
    Game.convoTurn(A, 'react:rq_personal:yes');
    const c = Game.convoGet(A);
    ok('personal yes -> formal pendingQ', !!(c.pendingQ && c.pendingQ.q));
    ok('formal question has answers', (c.pendingQ.answers || []).length >= 2);
    const ch = idsOf(Game.convoChoices(A));
    ok('choices are the formal answers now', ch.some(id => id.indexOf('ans:') === 0));
    Game.endConvo(A, 'natural');
  }

  // === 10. reactiveQ never leaks across conversations ===
  {
    const roster = freshGame();
    const A = roster[0];
    startWithOpener(A, '"Did you see that, just now? By the tree line."', 'small');
    ok('reactiveQ set', !!Game.convoGet(A).reactiveQ);
    Game.endConvo(A, 'left');
    ok('reactiveQ cleared on endConvo', !Game.convoGet(A).reactiveQ);
    startWithOpener(A, '"Hey."', 'small');
    ok('reactiveQ cleared on startConvo (neutral opener)', !Game.convoGet(A).reactiveQ);
    Game.endConvo(A, 'natural');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
