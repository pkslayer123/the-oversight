// Conversation dialogue-driven rewrite proof (Steve 2026-10-06):
// "Every NPC beat generates its own response options — what a person would
// actually say back to THIS. Deeply consider all layers; don't cut features."
// 1. For each beat kind, responses are TO the beat (not generic topics)
// 2. All existing features remain reachable (DIALOGUE_FEATURE_MAP)
// 3. Subject change is explicit; leave always available
// Usage: node scripts/test-conversation-dialogue-20261006.js
// Seeded 2026-10-07 (coherence worker): this suite asserts exact
// beat classifications over Math.random draws — unseeded it flaked ~50%
// (33/11 vs 44/44 across runs; pre-existing on HEAD). Deterministic now:
// mulberry32, fixed default, SEED env override.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(parseInt(process.env.SEED || '20261006', 10));
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
}

(async () => {
  await Game.init();
  const roster = freshGame();
  ok('roster has NPCs', roster.length > 0);
  const vid = roster[0];

  // === 1. MODULE LOADED ===
  ok('dialogueBeatKind exists', typeof Game.dialogueBeatKind === 'function');
  ok('dialogueResponses exists', typeof Game.dialogueResponses === 'function');
  ok('DIALOGUE_FEATURE_MAP exists', !!Game.DIALOGUE_FEATURE_MAP);

  // === 2. FEATURE MAP COMPLETENESS ===
  // Every layer Steve named must be mapped.
  const required = ['gossip', 'news', 'rumors', 'teaching', 'trust', 'comfort',
    'trade', 'favors', 'promises', 'invite', 'confrontation', 'observation',
    'past', 'goals', 'village', 'plans', 'theorize',
    'want_share_news', 'want_ask_favor', 'want_seek_comfort',
    'leave', 'secrets'];
  for (const f of required) {
    ok(`feature mapped: ${f}`, !!Game.DIALOGUE_FEATURE_MAP[f], 'missing from map');
  }

  // === 3. BEAT CLASSIFICATION ===
  // Start a conversation, force different beats, check classification.
  const convo = Game.startConvo(vid);
  ok('convo started', !!convo && !convo.ended);
  const c = Game.convoGet(vid);

  // Force a share beat (topic thread).
  c.thread = 'village'; c.depth = 1;
  c.transcript.push({ who: 'them', text: '"Honestly? People are holding together."' });
  const kindShare = Game.dialogueBeatKind(vid);
  ok('village thread → share', kindShare === 'share', `got ${kindShare}`);

  // Force a feel beat (grief).
  c.thread = 'grief';
  c.transcript.push({ who: 'them', text: '"I keep thinking about them. I\'m scared."' });
  const kindFeel = Game.dialogueBeatKind(vid);
  ok('grief + scared → feel', kindFeel === 'feel', `got ${kindFeel}`);

  // Force a want beat.
  c.thread = 'small';
  c.transcript.push({ who: 'them', text: '"Could you help me with something? Please?"' });
  const kindWant = Game.dialogueBeatKind(vid);
  ok('help please → want', kindWant === 'want', `got ${kindWant}`);

  // Questions defer to existing machinery.
  c.pendingQ = { id: 'q_test', answers: [{ id: 'a1', label: '"Yes."' }] };
  const kindQ = Game.dialogueBeatKind(vid);
  ok('pendingQ → question (defer)', kindQ === 'question', `got ${kindQ}`);
  c.pendingQ = null;

  // === 4. RESPONSES ARE TO THE BEAT ===
  c.thread = 'village'; c.depth = 1;
  c.transcript.push({ who: 'them', text: '"Honestly? People are holding together."' });
  const responses = Game.dialogueResponses(vid);
  ok('responses generated', Array.isArray(responses) && responses.length >= 3, `got ${responses && responses.length}`);
  // Responses should be dialogue IDs, not topic grabs.
  const dlgIds = (responses || []).map(r => r.id);
  ok('has engage response', dlgIds.some(id => id.indexOf('dlg:') === 0));
  ok('has subject-change', dlgIds.includes('dlg:subject'));
  ok('has leave', dlgIds.includes('leave'));
  // NOT a grab-bag: no raw ask:topic IDs in the default menu.
  const topicIds = dlgIds.filter(id => id.indexOf('ask:') === 0);
  ok('no topic grab-bag in default', topicIds.length === 0, `found ${topicIds.join(',')}`);

  // Feel beat → comfort responses.
  c.thread = 'grief';
  c.transcript.push({ who: 'them', text: '"I\'m scared."' });
  const feelResp = Game.dialogueResponses(vid);
  const feelIds = (feelResp || []).map(r => r.id);
  ok('feel → comfort', feelIds.includes('dlg:comfort'));
  ok('feel → empathize', feelIds.includes('dlg:empathize'));

  // Want beat → help responses.
  c.thread = 'small';
  c.transcript.push({ who: 'them', text: '"Could you help me? Please?"' });
  const wantResp = Game.dialogueResponses(vid);
  const wantIds = (wantResp || []).map(r => r.id);
  ok('want → help', wantIds.includes('dlg:help'));
  ok('want → details', wantIds.includes('dlg:details'));

  // === 5. SUBJECT MENU PRESERVES FEATURES ===
  // dlg:subject opens the old topic menu — all features reachable.
  const subjResult = Game.convoTurn(vid, 'dlg:subject');
  ok('subject opens menu', !!subjResult && !subjResult.ended);
  const subjChoices = (subjResult.choices || []).map(ch => ch.id);
  // The topic menu should contain the feature topics.
  const hasTopics = subjChoices.some(id => id.indexOf('ask:') === 0 || id === 'theorize' || id === 'leave');
  ok('subject menu has topics', hasTopics, `got ${subjChoices.slice(0, 5).join(',')}`);

  // === 6. DIALOGUE TURNS WORK ===
  // Start fresh, test each dialogue response type.
  Game.endConvo(vid, 'test');
  Game.startConvo(vid);
  const c2 = Game.convoGet(vid);
  c2.thread = 'village'; c2.depth = 1;
  c2.transcript.push({ who: 'them', text: '"People are holding together."' });

  const moreResult = Game.convoTurn(vid, 'dlg:more');
  ok('dlg:more works', !!moreResult && !moreResult.ended);

  const reactResult = Game.convoTurn(vid, 'dlg:react');
  ok('dlg:react works', !!reactResult && !reactResult.ended);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message, e.stack.split('\n')[1]); process.exit(1); });
