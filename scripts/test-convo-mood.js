// Conversation mood playtest. Usage: node scripts/test-convo-mood.js
// Tests: derived init, in-conversation shifts, band beats, silence by band,
// guard/grace from lived memory, tense closing doors, warm opening them,
// mood lingering after goodbye.
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

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}
// A clean conversation with no hanging questions, ready for a plain turn.
function cleanConvo(vid) {
  Game.startConvo(vid);
  const c = Game.convoGet(vid);
  c.reactiveQ = null; c.genericQ = null; c.pendingQ = null;
  return c;
}

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = v.roster || [];
  ok('roster non-empty', roster.length > 0);
  const vid = roster[0], vid2 = roster[1] || roster[0], vid3 = roster[2] || roster[0];

  // 1. INIT: derived from trust + current state, never stored.
  v.trust = v.trust || {};
  v.trust[vid] = 80;
  let c = cleanConvo(vid);
  ok('high trust starts warm (mood 2)', c.mood === 2);
  ok('band warm', Game.convoMoodBand(vid) === 'warm');
  Game.endConvo(vid, 'left');

  v.trust[vid2] = 10;
  c = cleanConvo(vid2);
  ok('default trust starts neutral (mood 0)', c.mood === 0);
  Game.endConvo(vid2, 'left');

  v.grief = 3; // village in mourning
  v.trust[vid3] = 50;
  c = cleanConvo(vid3);
  ok('grief drags start down (mood 0, not 1)', c.mood === 0);
  v.grief = 0;
  Game.endConvo(vid3, 'left');

  // 2. SHIFTS: agree warms, deflect cools, joke reads the room.
  v.trust[vid] = 30;
  c = cleanConvo(vid);
  const m0 = c.mood;
  Game.convoTurn(vid, 'agree');
  ok('agree warms (+1)', Game.convoGet(vid).mood === m0 + 1);
  Game.endConvo(vid, 'left');

  c = cleanConvo(vid2);
  c.pendingQ = { id: 'q_test', q: 'Test?' };
  const m1 = c.mood;
  Game.convoTurn(vid2, 'deflect_q');
  ok('deflect cools (-1)', Game.convoGet(vid2).mood === m1 - 1);
  Game.endConvo(vid2, 'left');

  // joke while grieving lands badly
  v.grief = 3;
  c = cleanConvo(vid3);
  const m2 = c.mood;
  Game.convoTurn(vid3, 'joke');
  ok('joke while grieving cools (-1)', Game.convoGet(vid3).mood === m2 - 1);
  v.grief = 0;
  Game.endConvo(vid3, 'left');

  // 3. BAND BEAT: crossing into warm queues a stage direction (one-beat
  // turns: it surfaces via the continuer, never mid-turn).
  v.trust[vid] = 30;
  c = cleanConvo(vid);
  c.mood = 1; // friendly
  Game.convoTurn(vid, 'agree'); // -> 2, warm
  const cAfter = Game.convoGet(vid);
  ok('crossed into warm', cAfter.mood === 2);
  const beatQueued = (cAfter.heldBeats || []).some(h => /shoulders|warmth|lean in/i.test(h.text));
  ok('band-crossing beat queued', beatQueued);
  Game.convoTurn(vid, 'goon'); // continuer reveals it
  const beatShown = Game.convoGet(vid).transcript.some(t => /shoulders|warmth|lean in/i.test(t.text));
  ok('band-crossing beat shown via continuer', beatShown);
  Game.endConvo(vid, 'left');

  // 4. SILENCE: means different things at different temperatures.
  c = cleanConvo(vid2);
  c.mood = 2;
  const sWarm = Game.convoMoodSilence(vid2);
  ok('warm silence is comfortable', /comfortable|and it's fine/i.test(sWarm.line));
  ok('warm silence warms further', sWarm.shift === 1);
  Game.endConvo(vid2, 'left');

  c = cleanConvo(vid2);
  c.mood = -3;
  const sTense = Game.convoMoodSilence(vid2);
  ok('tense silence is flat/awful', /flat|look away|wrong/i.test(sTense.line));
  Game.endConvo(vid2, 'left');

  c = cleanConvo(vid2);
  c.mood = 0;
  const sNeut = Game.convoMoodSilence(vid2);
  ok('neutral silence gets filled', /fill the quiet|good listener|doesn.t seem to bother/i.test(sNeut.line));
  Game.endConvo(vid2, 'left');

  // 5. GUARD: recent hurt absorbs the first warming move.
  v.trust[vid3] = 30;
  Game.remember(vid3, 'promise_broken', 'test');
  Game.remember(vid3, 'confronted', 'test');
  ok('receptivity negative after hurt', Game.convoMoodReceptivity(vid3) < 0);
  c = cleanConvo(vid3);
  const mg = c.mood;
  Game.convoTurn(vid3, 'agree'); // absorbed
  ok('guarded: first warm move absorbed', Game.convoGet(vid3).mood === mg);
  const guardQueued = (Game.convoGet(vid3).heldBeats || []).some(h => /not ready|not yet/i.test(h.text));
  ok('guard beat queued', guardQueued);
  Game.convoTurn(vid3, 'goon');
  const guardBeat = Game.convoGet(vid3).transcript.some(t => /not ready|not yet/i.test(t.text));
  ok('guard beat shown', guardBeat);
  Game.convoTurn(vid3, 'agree'); // second one lands
  ok('guarded: second warm move lands', Game.convoGet(vid3).mood === mg + 1);
  Game.endConvo(vid3, 'left');

  // 6. GRACE: recent kindness absorbs the first cooling move.
  Game.remember(vid, 'gift', 'test');
  Game.remember(vid, 'comforted', 'test');
  ok('receptivity positive after kindness', Game.convoMoodReceptivity(vid) > 0);
  v.trust[vid] = 30;
  c = cleanConvo(vid);
  c.pendingQ = { id: 'q_test', q: 'Test?' };
  const mg2 = c.mood;
  Game.convoTurn(vid, 'deflect_q'); // absorbed
  ok('grace: first cool move absorbed', Game.convoGet(vid).mood === mg2);
  Game.endConvo(vid, 'left');

  // 7. TENSE closes doors: fewer topic asks than neutral.
  function topicCount(vidX, moodVal) {
    const cc = cleanConvo(vidX);
    cc.mood = moodVal;
    cc.reactiveQ = null; cc.genericQ = null; cc.pendingQ = null;
    cc.thread = 'small'; cc.askedTopics = [];
    const choices = Game.convoChoices(vidX);
    Game.endConvo(vidX, 'left');
    return choices.filter(ch => ch.id.indexOf('ask:') === 0).length;
  }
  v.trust[vid2] = 30;
  const tenseTopics = topicCount(vid2, -3);
  const neutTopics = topicCount(vid2, 0);
  ok(`tense offers fewer doors (${tenseTopics} < ${neutTopics})`, tenseTopics < neutTopics);

  // 8. WARM opens gates: effTrust = trust + mood*5.
  ok('convoMoodMod scales with mood', (() => {
    const cc = cleanConvo(vid);
    cc.mood = 2;
    const mod = Game.convoMoodMod(vid);
    Game.endConvo(vid, 'left');
    return mod === 10;
  })());

  // 9. ENDING: mood lingers on trust, goodbye carries the temperature.
  v.trust[vid] = 30;
  c = cleanConvo(vid);
  c.mood = 2;
  Game.endConvo(vid, 'natural');
  ok('warm ending lingers (+2 trust beyond the +3 talk bump)', (v.trust[vid] || 0) === 35);
  const gbWarm = Game.convoGet(vid).transcript.some(t => /Come back anytime|This was good/i.test(t.text));
  ok('warm goodbye beat', gbWarm);

  v.trust[vid2] = 30;
  c = cleanConvo(vid2);
  c.mood = -3;
  Game.endConvo(vid2, 'natural');
  ok('tense ending costs trust (30+3-3=30)', (v.trust[vid2] || 0) === 30);
  const gbCold = Game.convoGet(vid2).transcript.some(t => /turning away|whole goodbye/i.test(t.text));
  ok('cold goodbye beat', gbCold);

  // 10. Nothing stored per villager: fresh convo re-derives.
  v.trust[vid] = 80;
  c = cleanConvo(vid);
  ok('re-derived fresh each conversation (no stale mood)', c.mood === 2 && Game.convoMoodBand(vid) === 'warm');
  Game.endConvo(vid, 'left');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
