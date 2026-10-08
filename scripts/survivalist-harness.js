// Shared node harness for survivalist adversarial playtests (2026-10-08).
// - Installs ONE seeded, resettable RNG as Math.random BEFORE eval'ing modules
//   (betrayal/corpses/justice/lifeseed capture Math.random at load — seeding
//   after eval leaves them on the unseeded builtin).
// - Evals the FULL src/js list in index.html order, MINUS the DOM-only
//   app.js / sprites.js / tile-scenes.js / move-anim.js / drama.js.
// - Stubs global.window = global for the eval phase (equipment.js needs it at
//   load), then DELETES it before play — otherwise combat/events take the
//   async path and headless runs stall forever.
// Usage: const { boot } = require('./survivalist-harness'); const { Game, rng } = boot(1234);
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(seed) {
  let a = (seed == null ? 0xC0FFEE : seed) >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (s) => { a = ((s === undefined ? seed : s) >>> 0); };
  f.seed = (seed == null ? 0xC0FFEE : seed) >>> 0;
  return f;
}

// Full list in index.html script-tag order, minus DOM-only modules.
const MODULES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
  'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];

function boot(seed) {
  const rng = mulberry32(seed);
  global.Math.random = rng; // BEFORE eval: load-time captures stay deterministic
  global.window = global;   // load-time window checks only
  global.fetch = (f) => Promise.resolve({
    json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
  });
  for (const m of MODULES) eval(fs.readFileSync(path.join(ROOT, m), 'utf8'));
  delete global.window;     // sync path for combat/events from here on
  const Game = globalThis.Scattering.Game;
  return { Game, rng, reseed: (s) => rng.reset(s === undefined ? rng.seed : s) };
}

// Start a fresh expedition in the wild, hostile-player-ready.
async function newWildGame(Game, seed) {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.scholar;
}

module.exports = { boot, newWildGame, mulberry32 };
