// Monster subject/damage-source grammar (2026-10-06).
// "something huge, rooting in the underbrush's the attack hits you for 24"
// and "The something huge, rooting in the underbrush falls." are not
// sentences. Unnamed monsters get grammatical subjects ("Something huge…",
// "The attack"); named ones keep the possessive.
// Usage: node scripts/test-monster-subject-grammar.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }
function says() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }

(async () => {
  await Game.init();
  Game.debugScenario('bulldozer');
  says();
  const s = Game.state.scholar;
  s.health = 500;
  Game.startCombat('bulldozer');
  says();
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  ok('bulldozer fighter', !!m);
  console.log('fighter name: ' + JSON.stringify(m.name));

  // --- unnamed: descriptor grammar ---
  ok('unnamed subject stands alone', Game.encSubject(m) === 'Something huge, rooting in the underbrush');
  ok('unnamed + unknown attack = The attack', Game.encDamageSource(m, 'China-Shop Charge') === 'The attack');
  // fake earned pattern knowledge
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters.bulldozer = { patterns: { 'China-Shop Charge': 'charges in a straight line' } };
  ok('unnamed + known attack = The <Attack>', Game.encDamageSource(m, 'China-Shop Charge') === 'The China-Shop Charge');

  // --- death line: grammatical ---
  Game.log.length = 0;
  Game.tbDamage(m.key, 99999, 'you');
  const death = says();
  ok('death line grammatical', /Something huge, rooting in the underbrush falls\./.test(death));
  ok('no "The something"', !/The something/i.test(death));

  // --- named monster keeps possessive ---
  Game.debugScenario('bulldozer');
  says();
  Game.startCombat('bulldozer');
  says();
  const m2 = Game.tbfight.fighters.find(x => x.kind === 'monster');
  m2.name = 'Bulldozer'; // village named it
  Game.state.codex.monsters.bulldozer = { patterns: { 'China-Shop Charge': 'charges in a straight line' }, villageName: 'Bulldozer' };
  ok('named subject takes The', Game.encSubject(m2) === 'The Bulldozer');
  ok('named + known attack keeps possessive', Game.encDamageSource(m2, 'China-Shop Charge') === "boar's China-Shop Charge");
  ok('named + unknown attack = The attack', Game.encDamageSource(m2, 'Mystery Move') === 'The attack');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
