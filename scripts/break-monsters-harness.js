// Shared harness for the break-monsters break-it run.
// Seeds ONE resettable RNG as Math.random BEFORE eval (modules capture it at load),
// then evals the FULL src/js/*.js list in index.html order (minus DOM-only
// app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js and generated build.js).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];

// Resettable shared RNG (mulberry32). Install BEFORE eval.
let _s = 1;
function rng() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seedRng(seed) { _s = seed >>> 0 || 1; }
Math.random = rng; // installed before any module captures it

// fetch() stub: load JSON from the worktree (data files are fetched at runtime).
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});

// window stub for the eval phase only (equipment.js needs it at load).
global.window = global;

function loadGame() {
  for (const f of ORDER) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try { eval(src); }
    catch (e) {
      throw new Error(`eval failed for ${f}: ${e.message}`);
    }
  }
  delete global.window; // runtime checks then take the sync path
  return globalThis.Scattering.Game;
}

async function freshGame(seed) {
  seedRng(seed);
  const Game = loadGame();
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game;
}

module.exports = { ROOT, ORDER, seedRng, rng, loadGame, freshGame };
