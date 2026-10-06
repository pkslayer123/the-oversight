// test-game-start-20261006.js — game start / onboarding overhaul proof (Steve 2026-10-06).
//
// WHAT WAS DULL:
// - Opening was a tutorial dump: two dry 📖 recipe lines BEFORE any atmosphere.
// - No wake-up beat — you were never a person waking up, just a recipe reader.
// - No character grounding — the person you picked didn't feel present.
// - No hook — nothing strange to wonder about on day 1.
// - Tutorials lectured; they didn't feel earned.
//
// WHAT CHANGED:
// - Atmosphere and character FIRST: wake-up, who you are, what you own, Haven.
// - Villager direction (treeline) kept — it was good.
// - Day-1 hook: something strange moved past the treeline.
// - Tutorials reframed as "Your hands remember" — memory, not lecture — AFTER you care.
//
// Run: node scripts/test-game-start-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const files = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/examine.js'];
for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) pass++; else { fail++; console.log('FAIL:', label); } };

(async () => {
  await Game.init();
  Game.genRoster('Chicago, USA');
  const cands = Game.generatedRoster.filter(c => c.candidate !== false);
  ok(cands.length >= 4, 'at least 4 character candidates');
  ok(new Set(cands.map(c => c.name)).size === cands.length, 'candidates have unique names');
  ok(cands.every(c => c.backstory && c.backstory.length > 50), 'candidates have real backstories');

  const me = cands[0];
  const items = (me.items || []).slice(0, 5);
  Game.newGame('Chicago, USA', null, me.id, items, 'TestExp');

  const logText = (Game.log || []).map(l => typeof l === 'string' ? l : (l.text || '')).join('\n');

  // Opening order: wake-up BEFORE tutorials
  const wakeIdx = logText.indexOf('wake up on cold ground');
  const havenIdx = logText.indexOf('Haven. Twelve people');
  const tutorialIdx = logText.indexOf('Your hands remember');
  ok(wakeIdx >= 0, 'wake-up beat present');
  ok(havenIdx > wakeIdx, 'Haven comes after wake-up');
  ok(tutorialIdx > havenIdx, 'tutorials come AFTER atmosphere (not first)');

  // Character grounding
  ok(logText.includes(me.name.split(' ')[0]), 'player name appears in opening');
  ok(logText.includes('That was yesterday. This is now.'), 'character grounding line present');

  // Items = stakes
  ok(logText.includes("That's everything you own"), 'item stakes line present');

  // Direction (treeline)
  ok(logText.includes('treeline'), 'treeline direction present');

  // Hook (day-1 mystery)
  const hasHook = logText.includes('Too big. Too quiet') || logText.includes("aren't stars") || logText.includes('tracks like that');
  ok(hasHook, 'day-1 hook present');

  // No dry tutorial-first
  ok(!logText.startsWith('📖'), 'opening does NOT start with tutorial');
  ok(logText.indexOf('📖') > logText.indexOf('Haven'), 'tutorials come after Haven');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
