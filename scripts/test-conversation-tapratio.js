// Conversation tap-ratio measurement.
// Simulates the renderer's pagination: after each choice, every new transcript
// entry beyond the first shown requires one ▼ tap. Reports reading-taps per
// playing-tap (choice), before/after the one-beat-turns restructure.
// Usage: node scripts/test-conversation-tapratio.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  for (const vid of Game.npcIds()) {
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[vid] = 50;
  }

  const roster = Game.npcIds().slice(0, 6);
  let totalChoices = 0, totalReadingTaps = 0, totalThemBeats = 0;
  let maxBeats = 0, multiBeatTurns = 0;
  let goonOffered = 0, goonPicked = 0;
  const sampleFlows = [];

  for (const vid of roster) {
    const st = Game.startConvo(vid);
    if (!st) continue;
    const name = (() => { try { return Game.displayName(vid); } catch (e) { return vid; } })();
    // Opening: new entries paginated the same way
    const openNew = (st.transcript || []).length;
    totalChoices += 1; // the "talk" that opened it counts as a playing action
    totalReadingTaps += Math.max(0, openNew - 1);
    totalThemBeats += (st.transcript || []).filter(e => e.who === 'them').length;

    const flow = [`OPEN ${name}: ${(st.transcript || []).map(e => (e.who === 'you' ? 'YOU' : 'THEM') + ':' + String(e.text).slice(0, 60)).join(' | ')}`];
    let choices = st.choices || [];
    let turns = 0, ended = false;
    while (!ended && turns < 10) {
      if (!choices || !choices.length) break;
      const goon = choices.find(c => c.id === 'goon');
      if (goon) goonOffered++;
      const nonLeave = choices.filter(c => c.id !== 'leave' && c.id !== 'bye');
      const pool = nonLeave.length ? nonLeave : choices;
      // Prefer the continuer when offered (exercise it), else rotate
      const pick = goon && turns % 3 !== 2 ? goon : pool[turns % pool.length];
      if (pick.id === 'goon') goonPicked++;
      const before = Game.convoGet(vid).transcript.slice();
      let res;
      try { res = Game.convoTurn(vid, pick.id); } catch (e) { console.log('  ERROR: ' + e.message); break; }
      if (!res) break;
      if (res.ended) { ended = true; break; }
      const after = Game.convoGet(vid).transcript;
      // New entries = entries after the last pre-turn entry (identity-anchored, like app.js)
      const lastBefore = before.length ? before[before.length - 1] : null;
      let idx = 0;
      if (lastBefore) { const li = after.lastIndexOf(lastBefore); idx = li >= 0 ? li + 1 : 0; }
      const fresh = after.slice(idx);
      const themFresh = fresh.filter(e => e.who === 'them').length;
      // Current renderer: first new entry shown free, each further entry = 1 ▼ tap
      const taps = Math.max(0, fresh.length - 1);
      totalChoices++; totalReadingTaps += taps; totalThemBeats += themFresh;
      if (themFresh > 1) multiBeatTurns++;
      if (themFresh > maxBeats) maxBeats = themFresh;
      if (sampleFlows.length < 2 && turns < 4) {
        flow.push(`  YOU [${pick.label}] -> ${fresh.map(e => (e.who === 'you' ? 'YOU' : 'THEM') + ':' + String(e.text).slice(0, 70)).join(' | ')}`);
      }
      choices = res.choices || [];
      turns++;
    }
    if (sampleFlows.length < 2) sampleFlows.push(flow.join('\n'));
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }

  const ratio = totalChoices ? (totalReadingTaps / totalChoices) : 0;
  const avgBeats = totalChoices ? (totalThemBeats / totalChoices) : 0;
  console.log('=== TAP RATIO ===');
  console.log(`choices (playing taps): ${totalChoices}`);
  console.log(`reading taps (▼): ${totalReadingTaps}`);
  console.log(`reading-taps per playing-tap: ${ratio.toFixed(2)}`);
  console.log(`avg new THEM beats per choice: ${avgBeats.toFixed(2)}`);
  console.log(`max THEM beats in one turn: ${maxBeats}`);
  console.log(`multi-beat turns: ${multiBeatTurns}`);
  console.log(`continuer offered: ${goonOffered}, picked: ${goonPicked}`);
  console.log('\n=== SAMPLE FLOWS ===');
  for (const f of sampleFlows) console.log(f + '\n');

  // Invariants for the restructured conversation:
  // - exactly one new THEM beat per choice (avg 1.00, max 1)
  // - the continuer appears whenever beats were held
  ok('one-beat-per-turn: max THEM beats per choice <= 1', maxBeats <= 1, `max=${maxBeats}`);
  ok('one-beat-per-turn: avg THEM beats per choice == 1.00', Math.abs(avgBeats - 1) < 0.01, `avg=${avgBeats.toFixed(2)}`);
  ok('no multi-beat turns', multiBeatTurns === 0, `${multiBeatTurns} multi-beat turns`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
