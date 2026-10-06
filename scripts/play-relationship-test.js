// Relationship effects playtest: does trust change what villagers say/do?
// Usage: node scripts/play-relationship-test.js
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
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = v.roster || [];
  const vid = roster[0];
  const name = Game.displayName(vid);

  console.log(`=== Testing with ${name} ===\n`);

  // Low trust conversation
  v.trust = v.trust || {};
  v.trust[vid] = 10;
  console.log('--- LOW TRUST (10) ---');
  try {
    const st1 = Game.startConvo(vid);
    console.log(`opener: ${(st1 ? st1.line : '(null)').slice(0, 120)}`);
    // Check what questions are available
    const c1 = Game.convoGet(vid);
    console.log(`exchanges: ${c1.exchanges}, budget: ${c1.budget}`);
    if (v.convos && v.convos[vid]) v.convos[vid].active = false;
  } catch (e) { console.log('ERROR:', e.message); }

  // High trust conversation
  v.trust[vid] = 80;
  // Reset convo state for fresh opener
  if (v.conv && v.conv[vid]) delete v.conv[vid];
  console.log('\n--- HIGH TRUST (80) ---');
  try {
    const st2 = Game.startConvo(vid);
    console.log(`opener: ${(st2 ? st2.line : '(null)').slice(0, 120)}`);
    const c2 = Game.convoGet(vid);
    console.log(`exchanges: ${c2.exchanges}, budget: ${c2.budget}`);
  } catch (e) { console.log('ERROR:', e.message); }

  // Check trust-gated questions
  console.log('\n=== TRUST-GATED CONTENT ===');
  const cg = Game.data.characterGen || {};
  const questions = (cg.questions || []).filter(q => q.minTrust > 0);
  console.log(`${questions.length} questions have minTrust requirements`);
  for (const q of questions.slice(0, 5)) {
    console.log(`  - ${q.id}: minTrust ${q.minTrust}`);
  }
})().catch(e => console.log('FATAL', e.message));
