// REPRO: uprising scenario intro leaks dev markers and contradicts the TALK verb (Steve 2026-10-06).
// (a) "Reason: debug scenario: theft + assault + defiance. You did this." —
//     the scenario passes a dev-marker reason string to justice.js:381, which
//     renders it verbatim in a player-facing dramatic screen.
// (b) The scenario says "There's no talking your way out of this." but the
//     prompt offers FIGHT, FLEE, or TALK — and tbHostileTalk tactics
//     (beg/intimidate/reason/lie/bribe/taunt) DO work in uprising combat.
// Usage: node scripts/test-social-uprising-intro.js  (exit 1 = bug present)
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
  Game.debugScenario('uprising');
  const all = sayLog.join('\n');
  let fail = 0;
  if (/debug scenario:/i.test(all)) { fail++; console.log('FAIL dev marker in player-facing text: "Reason: debug scenario: ..."'); }
  if (/no talking your way out/i.test(all) && /FIGHT, FLEE, or TALK/.test(all)) {
    fail++; console.log('FAIL contradiction: "no talking your way out" vs prompt offering TALK');
  }
  console.log(fail ? `\n${fail} uprising-intro bug(s) present` : '\nALL PASS: uprising intro is fiction-clean and coherent');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
