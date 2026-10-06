// Real conversation playtest: start conversations with 5 villagers, capture openers.
// Usage: node scripts/play-convo-test.js
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
  // Use a debug scenario that sets up a village
  try { Game.debugScenario('mootAccused'); } catch (e) { console.log('scenario fail:', e.message); }
  if (!Game.state) {
    console.log('No state after scenario, trying manual setup...');
    return;
  }

  const v = Game.state.village;
  const roster = v.roster || [];
  console.log(`Roster: ${roster.length} villagers`);
  console.log(`RosterChars: ${Object.keys(v.rosterChars || {}).length}\n`);

  const sample = roster.slice(0, 5);
  const openers = [];
  for (const vid of sample) {
    const vp = Game.vpOf(vid) || {};
    const name = Game.displayName(vid) || vid;
    const temp = ((vp.personality || {}).temperament || '?');
    console.log(`--- ${name} (${vp.formerOccupation || '?'}, ${temp}) ---`);
    try {
      const st = Game.startConvo(vid);
      const line = st ? st.line : '(null)';
      console.log(`  opener: ${line.slice(0, 150)}`);
      openers.push(line);
      // End convo
      if (Game.state.village.convos && Game.state.village.convos[vid]) {
        Game.state.village.convos[vid].active = false;
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
    console.log('');
  }

  // Distinctness: are openers different?
  const unique = new Set(openers);
  console.log(`=== Openers unique: ${unique.size}/${openers.length} ===`);
})().catch(e => console.log('FATAL', e.message));
