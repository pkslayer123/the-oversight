// REPRO: ambush scenario repeats "Their hands are shaking." in two consecutive
// narrative lines — the ambush event line and the de-coached scenario intro
// (debug-scenarios.js ambush()) both land the same beat. (Steve 2026-10-06)
// Usage: node scripts/test-social-ambush-intro-repeat.js  (exit 1 = bug present)
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
  const sayLog = [];
  Game.say = (t) => { sayLog.push(String(t)); };
  Game.debugScenario('ambush');
  const hits = sayLog.filter(l => !l.startsWith('🐞') && /their hands are shaking/i.test(l));
  let fail = 0;
  if (hits.length > 1) {
    fail++;
    console.log(`FAIL "Their hands are shaking." appears in ${hits.length} distinct lines:`);
    hits.forEach(l => console.log('     | ' + l.slice(0, 130)));
  }
  console.log(fail ? '\n1 ambush-intro repetition bug present' : '\nALL PASS: no repeated beat in ambush intro');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
