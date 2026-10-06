// REPRO: debug residue in player-visible state.
// The exile debug scenario calls Game.exilePlayer('debug')
// (src/js/debug-scenarios.js:813), which writes "Exiled (debug)" into the
// player's JOURNAL — a persistent, player-facing record. The journal should
// never contain "(debug)".
// Usage: node scripts/test-social-debug-journal.js
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
let sayLog = [];
Game.say = (t) => { sayLog.push(String(t)); };

(async () => {
  await Game.init();
  Game.debugScenario('exile');
  const leaked = sayLog.filter(l => /\(debug\)/i.test(l) && /📓|Journal/i.test(l));
  console.log('journal lines containing "(debug)":', leaked.length);
  leaked.slice(0, 3).forEach(l => console.log('  ' + l.slice(0, 120)));
  if (leaked.length) { console.log('FAIL: "(debug)" written into the player journal'); process.exit(1); }
  console.log('PASS: journal is clean of debug residue');
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
