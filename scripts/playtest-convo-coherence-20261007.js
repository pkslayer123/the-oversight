#!/usr/bin/env node
// Conversation coherence playtest (Steve 2026-10-06):
// "roughly half the line/response pairs make sense and half look like luck"
// Play conversations as a PLAYER. For each NPC line, examine if the response
// options make sense as replies to THAT specific line.
// Loads FULL production script list in index.html order (including convo-beats.js).
// Usage: node scripts/playtest-convo-coherence-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// fetch stub for data loading
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

// FULL script list in index.html order, minus DOM-only modules
// (per AGENTS.md: minus app.js/sprites.js/tile-scenes.js/move-anim.js)
// Stub window for eval phase only.
global.window = global;
const files = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of files) {
  try {
    eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  } catch (e) {
    console.error(`Failed to load ${f}: ${e.message}`);
    process.exit(1);
  }
}
// Delete window stub so combat/state uses sync headless path (per AGENTS.md)
delete global.window;

const Game = globalThis.Scattering.Game;

async function main() {
  await Game.init();

  // Fresh game
  Game.genRoster('Columbus, Ohio');
  const roster = Game.generatedRoster;
  if (!roster || !roster.length) { console.log('NO ROSTER'); process.exit(1); }
  const playerId = roster[0].id;
  Game.newGame('Columbus, Ohio', null, playerId);
  Game.depart();

  const npcs = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  console.log(`=== Conversation Coherence Playtest ===`);
  console.log(`Player: ${playerId}, NPCs available: ${npcs.length}`);

  // Verify integration
  console.log(`\n--- Integration Check ---`);
  console.log(`Game.dialogueResponses is function: ${typeof Game.dialogueResponses === 'function'}`);
  console.log(`Game.beatOf is function: ${typeof Game.beatOf === 'function'}`);
  console.log(`Game.threadBeatTag is function: ${typeof Game.threadBeatTag === 'function'}`);
  console.log(`Game.DIALOGUE_FEATURE_MAP exists: ${!!Game.DIALOGUE_FEATURE_MAP}`);
  console.log(`Feature count: ${Game.DIALOGUE_FEATURE_MAP ? Object.keys(Game.DIALOGUE_FEATURE_MAP).length : 0}`);

  // Check if dialogueResponses is the convo-beats version (beat+topic matrix)
  // vs the convo-dialogue version (regex classification).
  // The convo-beats version references REPLY_POOLS / beatOf internally.
  const drSrc = Game.dialogueResponses.toString();
  const isBeatsVersion = drSrc.includes('beatOf') || drSrc.includes('REPLY_POOLS') || drSrc.includes('topicPool');
  console.log(`dialogueResponses is convo-beats version: ${isBeatsVersion}`);

  // Playtest conversations with several NPCs
  const results = [];
  const maxNpcs = Math.min(5, npcs.length);

  for (let ni = 0; ni < maxNpcs; ni++) {
    const vid = npcs[ni];
    console.log(`\n--- NPC ${ni + 1}: ${vid} ---`);

    try {
      const opening = Game.startConvo(vid);
      if (!opening || !opening.line) {
        console.log('  Could not start conversation');
        continue;
      }

      // Examine the opening line + choices
      const beat = Game.beatOf ? Game.beatOf(vid) : { tag: '?', topic: '?' };
      console.log(`  BEAT: ${beat.tag}/${beat.topic}`);
      console.log(`  THEM: ${String(opening.line).slice(0, 120)}`);
      const choices = opening.choices || [];
      console.log(`  Choices (${choices.length}):`);
      for (const ch of choices) {
        console.log(`    [${ch.id}] ${ch.label}`);
      }
      results.push({ vid, beat: `${beat.tag}/${beat.topic}`, line: String(opening.line).slice(0, 100), choices: choices.map(c => `[${c.id}] ${c.label}`) });

      // Take a few turns to see follow-up coherence
      let current = opening;
      for (let turn = 0; turn < 3; turn++) {
        if (!current || current.ended) break;
        const chs = current.choices || [];
        // Prefer a dialogue response (not leave, not subject)
        const pick = chs.find(c => c.id.indexOf('dlg:') === 0 && c.id !== 'dlg:subject') || chs[0];
        if (!pick || pick.id === 'leave') break;

        console.log(`\n  YOU: ${pick.label}`);
        try {
          current = Game.convoTurn(vid, pick.id);
        } catch (e) {
          console.log(`  TURN ERROR: ${e.message}`);
          break;
        }
        if (!current || !current.line) break;
        const beat2 = Game.beatOf ? Game.beatOf(vid) : { tag: '?', topic: '?' };
        console.log(`  BEAT: ${beat2.tag}/${beat2.topic}`);
        console.log(`  THEM: ${String(current.line).slice(0, 120)}`);
        const chs2 = current.choices || [];
        console.log(`  Choices (${chs2.length}):`);
        for (const ch of chs2) {
          console.log(`    [${ch.id}] ${ch.label}`);
        }
        results.push({ vid, turn: turn + 1, beat: `${beat2.tag}/${beat2.topic}`, line: String(current.line).slice(0, 100), choices: chs2.map(c => `[${c.id}] ${c.label}`) });

        // End the conversation
        try { Game.endConvo(vid); } catch (e) {}
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }

    try { Game.endConvo(vid); } catch (e) {}
  }

  // Save results for coherence audit
  const outPath = path.join(ROOT, 'hidden_files', 'convo-playtest-raw-20261007.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Raw results saved to hidden_files/convo-playtest-raw-20261007.json ===`);
  console.log(`Total line/choice pairs captured: ${results.length}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
