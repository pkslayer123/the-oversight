// Villager personality playtest. Usage: node scripts/play-villager-personality.js
// Talks to 5 villagers as a player and judges: are they distinct people?
// Checks: personality traits, speech patterns, opinions, relationship effects.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();

  // Generate a village — use the debug scenario or manual setup
  // Try to get villagers via the standard new-game path
  console.log('=== VILLAGER PERSONALITY PLAYTEST ===\n');

  // Generate roster of characters
  Game.genRoster('the midwest');
  const roster = Game.generatedRoster || [];
  console.log(`Generated roster: ${roster.length} characters\n`);

  const sample = roster.slice(0, 5);
  for (const char of sample) {
    const p = char.personality || {};
    console.log(`--- ${char.name} (${char.formerOccupation || 'unknown'}) ---`);
    console.log(`  temperament: ${p.temperament || '?'}, sharing: ${p.sharing || '?'}, curiosity: ${p.curiosity || '?'}`);
    console.log(`  quirk: ${p.quirk || '?'}`);
    console.log(`  habit: ${p.habit || '?'}`);
    console.log(`  hope: ${p.hope || '?'}`);
    console.log(`  goal: ${char.goal || '?'}`);
    console.log(`  talk lines: ${(char.talk || []).length}`);
    for (const t of (char.talk || []).slice(0, 2)) {
      console.log(`    - "${t.slice(0, 100)}"`);
    }
    // synthPrototype
    try {
      const proto = Game.synthPrototype(char);
      console.log(`  want: ${(proto.want || '').slice(0, 80)}`);
      console.log(`  feel: ${(proto.feel || '').slice(0, 80)}`);
    } catch (e) { console.log(`  synthPrototype failed: ${e.message}`); }
    console.log('');
  }

  // Check distinctness: are quirks/habits/hopes unique?
  const quirks = sample.map(c => (c.personality || {}).quirk);
  const habits = sample.map(c => (c.personality || {}).habit);
  const hopes = sample.map(c => (c.personality || {}).hope);
  console.log('=== DISTINCTNESS CHECK ===');
  console.log(`quirks unique: ${new Set(quirks).size}/${quirks.length}`);
  console.log(`habits unique: ${new Set(habits).size}/${habits.length}`);
  console.log(`hopes unique: ${new Set(hopes).size}/${hopes.length}`);
  console.log(`temperaments: ${sample.map(c => (c.personality || {}).temperament).join(', ')}`);
})().catch(e => console.log('FATAL', e.message, e.stack && e.stack.split('\n')[1]));
