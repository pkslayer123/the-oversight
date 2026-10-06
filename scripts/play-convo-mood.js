// Mood feel playtest: 3 conversations (warm, tense, shifting). Prints transcripts.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;
function show(vid, title) {
  console.log(`\n===== ${title} (mood band: ${Game.convoMoodBand(vid)}) =====`);
  for (const t of Game.convoGet(vid).transcript) {
    const who = t.who === 'you' ? 'YOU ' : t.who === 'them' ? 'THEM' : '    ';
    console.log(`${who} ${t.text}`);
  }
}
function turn(vid, id) {
  const c = Game.convoGet(vid);
  c.reactiveQ = null; c.genericQ = null; c.pendingQ = null;
  const r = Game.convoTurn(vid, id);
  // Like a real player who keeps listening: follow the continuer while
  // beats are queued, so mood reactions surface.
  let guard = 0;
  while (guard++ < 4) {
    const cc = Game.convoGet(vid);
    if (!cc.active || !(cc.heldBeats || []).length) break;
    const ch = Game.convoChoices(vid);
    if (!ch.some(x => x.id === 'goon')) break;
    Game.convoTurn(vid, 'goon');
  }
  return r;
}
(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const [a, b, d] = v.roster;
  v.trust = v.trust || {};

  // CONVO 1: WARM — old friend. Agree, agree, ask personal.
  v.trust[a] = 80;
  Game.startConvo(a);
  turn(a, 'agree'); turn(a, 'agree');
  show(a, 'WARM (old friend, agreed twice)');
  Game.endConvo(a, 'natural');
  show(a, 'WARM after goodbye');

  // CONVO 2: TENSE — stranger you just dodged. Deflect, joke, silence.
  v.trust[b] = 8;
  Game.startConvo(b);
  { const c = Game.convoGet(b); c.reactiveQ = null; c.genericQ = null; c.pendingQ = { id: 'q_x', q: 'Why should I trust you?' }; }
  Game.convoTurn(b, 'deflect_q');
  turn(b, 'joke');
  turn(b, 'silence');
  show(b, 'TENSE (stranger, dodged + joked + silence)');
  Game.endConvo(b, 'natural');
  show(b, 'TENSE after goodbye');

  // CONVO 3: SHIFTING — hurt villager you win over. Guard absorbs first warmth.
  v.trust[d] = 30;
  Game.remember(d, 'promise_broken', 'you forgot');
  Game.startConvo(d);
  turn(d, 'agree');   // absorbed by guard
  turn(d, 'agree');   // lands
  turn(d, 'agree');   // warmer still
  show(d, 'SHIFTING (hurt villager, won over)');
  Game.endConvo(d, 'natural');
  show(d, 'SHIFTING after goodbye');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
