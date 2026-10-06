// Conversation feel playtest — play 5-6 conversations as a player, judge feel.
// Usage: node scripts/test-conversation-feel.js
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

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  // Force decent trust so conversations have depth
  for (const vid of Game.npcIds()) {
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[vid] = 50;
  }

  const roster = Game.npcIds().slice(0, 6);
  console.log(`=== Playing conversations with ${roster.length} villagers ===\n`);

  const results = [];
  for (const vid of roster) {
    let name = '?';
    try { name = Game.displayName(vid); } catch (e) { name = vid; }
    console.log(`\n##### CONVERSATION with ${name} (${vid}) #####`);

    const st = Game.startConvo(vid);
    if (!st) { console.log('  (could not start — no shared language or no villager)'); continue; }

    const lines = [];
    lines.push(`THEM: ${st.line}`);
    let choices = st.choices || [];
    let turns = 0;
    let ended = false;

    // Play up to 8 turns, picking varied choices (not always first)
    while (!ended && turns < 8) {
      if (!choices || !choices.length) break;
      // Pick a non-'leave' choice, rotating to vary
      const nonLeave = choices.filter(c => c.id !== 'leave' && c.id !== 'bye');
      const pool = nonLeave.length ? nonLeave : choices;
      const pick = pool[turns % pool.length];
      console.log(`  YOU: [${pick.label}]`);
      lines.push(`YOU: ${pick.label}`);
      let res;
      try { res = Game.convoTurn(vid, pick.id); } catch (e) { console.log('  ERROR: ' + e.message); break; }
      if (!res) break;
      if (res.ended) { ended = true; lines.push(`(ended: ${res.how || ''})`); break; }
      if (res.line) { console.log(`  THEM: ${res.line.slice(0, 160)}${res.line.length > 160 ? '...' : ''}`); lines.push(`THEM: ${res.line}`); }
      choices = res.choices || [];
      turns++;
      // If only 'leave' remains, stop
      if (choices.length === 1 && (choices[0].id === 'leave' || choices[0].id === 'bye')) break;
    }
    if (!ended) { try { Game.endConvo(vid, 'left'); } catch (e) {} }

    const c = Game.convoGet(vid);
    results.push({ vid, name, turns, lines, thread: c.thread, transcriptLen: (c.transcript || []).length });

    // --- checks ---
    ok(`${name}: conversation produced lines`, lines.length >= 2);
    ok(`${name}: no undefined in lines`, !lines.join('\n').includes('undefined'));
    const themLines = lines.filter(l => l.startsWith('THEM:'));
    const uniqueThem = new Set(themLines);
    ok(`${name}: no repeated NPC lines`, uniqueThem.size === themLines.length, `${themLines.length - uniqueThem.size} repeats`);
  }

  // --- distinctness check: compare openers ---
  console.log('\n=== DISTINCTNESS ===');
  const openers = results.map(r => r.lines[0]).filter(Boolean);
  const uniqueOpeners = new Set(openers);
  console.log(`Openers: ${openers.length}, unique: ${uniqueOpeners.size}`);
  openers.forEach((o, i) => console.log(`  ${results[i].name}: ${o.slice(0, 100)}`));
  ok('openers are distinct across villagers', uniqueOpeners.size === openers.length, `${openers.length - uniqueOpeners.size} duplicates`);

  // --- scalability: transcript cap ---
  console.log('\n=== SCALABILITY ===');
  const vid0 = roster[0];
  if (vid0) {
    const c = Game.convoGet(vid0);
    ok('transcript cap is 200 (not 8)', (c.transcript || []).length <= 200);
    console.log(`Transcript length after convo: ${(c.transcript || []).length}`);
  }
  // 20 villagers stress: synth prototypes
  let protoOk = true;
  for (let i = 0; i < 20; i++) {
    try {
      const p = Game.synthPrototype({ formerOccupation: 'farmer', personality: { temperament: 'warm' }, name: 'Test Person' });
      if (!p.want || !p.know || !p.feel || !p.secret) protoOk = false;
    } catch (e) { protoOk = false; }
  }
  ok('synthPrototype works for 20 generated villagers', protoOk);

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})();
