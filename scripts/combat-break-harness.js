#!/usr/bin/env node
// Harness helper for combat break-it proofs (2026-10-08).
// Loads the FULL src/js/*.js list in index.html order minus DOM-only
// (app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js).
// Seeds Math.random BEFORE eval (modules capture it at load time).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);

global.window = global; // eval-time stub for equipment.js
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
  'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window; // runtime takes the sync combat path

async function newCombatReadyGame() {
  const Game = globalThis.Scattering.Game;
  await Game.init();
  Game.genRoster('Breaker');
  Game.newGame('Breaker', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game;
}

// Spawn a minimal synthetic fight: player + one monster at known coords.
// Returns the monster fighter key.
function synthFight(Game, monId, opts = {}) {
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  Game.state.systemArrived = false;
  Game.resetPerFightFlags();
  const mdef = Game.data.monsters.find(m => m.id === monId);
  if (!mdef) throw new Error('unknown monster ' + monId);
  const mk = 'm_test';
  Game.tbfight = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: opts.php || 100, maxHp: 100,
        speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 0, acted: false, aimed: false },
      { key: mk, kind: 'monster', monsterId: monId, mdef, name: 'TestMonster', emoji: '👹',
        hp: opts.mhp || 30, maxHp: opts.mhp || 30, speed: 3, mx: 6, my: 4,
        alive: true, fled: false, telegraph: null, hesitate: 0, blind: 0, stunned: 0 },
    ],
    over: false, round: 1, order: ['p', mk], turnIdx: 0,
  };
  Game.tbfight.fightersByKey = {};
  for (const f of Game.tbfight.fighters) Game.tbfight.fightersByKey[f.key] = f;
  return mk;
}

module.exports = { ROOT, SEED, newCombatReadyGame, synthFight, mulberry32 };
