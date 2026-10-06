// Interface feel analysis: count taps, trace the interaction flow.
// Usage: node scripts/test-conversation-interface.js
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
  Game.debugScenario('liars');
  for (const vid of Game.npcIds()) {
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[vid] = 50;
  }

  const vid = Game.npcIds()[0];
  const name = Game.displayName(vid);
  console.log(`=== TAP-FLOW TRACE with ${name} ===\n`);

  // Simulate the UI flow: track transcript length after each action
  let taps = 0;      // ▼ taps to advance through beats
  let choices = 0;   // choice button taps
  let beats = 0;     // total NPC beats shown

  const st = Game.startConvo(vid);
  if (!st) { console.log('no convo'); process.exit(1); }

  let c = Game.convoGet(vid);
  let tLen = c.transcript.length;
  console.log(`OPEN: transcript has ${tLen} entries (opener${tLen > 1 ? ' + extras' : ''})`);
  beats += tLen;

  // Simulate: tap through all beats, then choose, repeat 5 turns
  for (let turn = 0; turn < 5; turn++) {
    c = Game.convoGet(vid);
    if (!c.active) { console.log('  (conversation ended)'); break; }

    // Tap through beats: from current position to end
    const cur = c.transcript.length;
    // In the UI, msgIndex starts at first new message; each ▼ advances 1
    // For simulation: count how many NEW entries since last turn
    const newBeats = cur - tLen;
    if (newBeats > 0) {
      console.log(`  Turn ${turn + 1}: ${newBeats} new beat(s) → ${newBeats} ▼ taps to reach choices`);
      taps += newBeats;
      beats += newBeats;
    }
    tLen = cur;

    const ch = Game.convoChoices(vid);
    if (!ch || !ch.length) { console.log('  (no choices)'); break; }
    const nonLeave = ch.filter(x => x.id !== 'leave' && x.id !== 'bye');
    if (!nonLeave.length) { console.log('  (only leave left)'); break; }

    const pick = nonLeave[turn % nonLeave.length];
    console.log(`  Choice: "${pick.label.slice(0, 50)}"`);
    choices++;

    const before = Game.convoGet(vid).transcript.length;
    const res = Game.convoTurn(vid, pick.id);
    if (!res || res.ended) { console.log('  (ended after choice)'); break; }
    const after = Game.convoGet(vid).transcript.length;
    console.log(`  → NPC replied with ${after - before} new beat(s)`);
    tLen = before; // next turn counts from here
  }

  console.log(`\n=== TAP TAX ===`);
  console.log(`  ▼ taps (pure reading): ${taps}`);
  console.log(`  Choice taps (playing): ${choices}`);
  console.log(`  Total taps: ${taps + choices}`);
  console.log(`  Ratio: ${(taps / Math.max(1, choices)).toFixed(1)} reading-taps per playing-tap`);
  console.log(`\nFeel verdict:`);
  if (taps > choices * 2) {
    console.log(`  CHORE: you tap ${taps} times to read for every ${choices} meaningful choices.`);
    console.log(`  The interface is pagination, not conversation.`);
  } else {
    console.log(`  OK: reading taps roughly match choice taps. Rhythm feels conversational.`);
  }
})();
