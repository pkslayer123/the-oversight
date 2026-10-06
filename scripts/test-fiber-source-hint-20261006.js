#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-06): fiber-source discoverability fix.
// The water-filter chain's first link (plant fiber) had no discoverable
// source: gatherFallen yields zero fiber, forage sweeps yield it only from
// non-food trees at 25%, and nothing told the player that cleared brush is
// the honest path. Fix: the opening memory and the cloth recipe's L2 text
// now name the fiber source.
// Asserts:
//   1. newGame's opening "hands remember" line names cleared brush as the fiber source.
//   2. recipes.json cloth knowledgeLevels[2] names the fiber source.
// Run: node scripts/test-fiber-source-hint-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}
(async () => {
  await Game.init();
  // 1. opening memory names the fiber source
  const said = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); return osay(t); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.say = osay;
  const memory = said.find(t => t.includes('weave cloth'));
  check('opening memory mentions weaving cloth', !!memory);
  check('opening memory names cleared brush as the fiber source',
    !!memory && /plant fiber[^.]*brush/i.test(memory), memory ? memory.slice(0, 160) : '(no memory line)');
  // 2. cloth recipe L2 names the fiber source
  const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/recipes.json'), 'utf8'));
  const recs = Array.isArray(recipes) ? recipes : recipes.recipes;
  const cloth = recs.find(r => r.id === 'cloth');
  check('cloth recipe exists', !!cloth);
  const l2 = cloth && cloth.knowledgeLevels && cloth.knowledgeLevels['2'];
  check('cloth L2 names cleared brush as the fiber source',
    !!l2 && /brush/i.test(l2), l2 ? l2.slice(0, 140) : '(no L2)');
  // 3. the chain still completes (no regression from the text change)
  check('recipes.json still parses with cloth+water_filter recipes',
    !!recs.find(r => r.id === 'water_filter'));
  if (failures) { console.error(`${failures} FAILURE(S)`); process.exit(1); }
  console.log('ALL GREEN');
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
