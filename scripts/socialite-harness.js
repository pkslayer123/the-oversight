// Socialite hostile-player attack harness.
// Loads the FULL src/js list in index.html order (minus DOM-only app.js,
// sprites.js, tile-scenes.js, move-anim.js, drama.js), seeds Math.random BEFORE
// eval (modules capture it at load), stubs window for the eval phase, then
// deletes it so combat takes the sync path. Boots a small fresh village and
// exposes helpers.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/worktrees/playtest-socialite';
const SRC = path.join(ROOT, 'src/js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '42', 10);
const rng = mulberry32(SEED);
Math.random = rng;

// minimal DOM/document stub so load-time document access doesn't crash
const noop = () => {};
global.document = {
  addEventListener: noop, getElementById: () => null, querySelector: () => null,
  querySelectorAll: () => [], createElement: () => ({ style: {}, appendChild: noop, setAttribute: noop }),
};
global.window = global; // equipment.js needs window at load; delete after eval
if (!global.navigator) global.navigator = {};
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };

const order = ['engine/state.js','engine/modifiers.js','engine/calories.js','engine/day.js','engine/forage.js','engine/combat.js','game.js','encounters.js','conversation.js','convo-mood.js','convoTopics.js','convo-wants.js','convo-dialogue.js','convo-beats.js','convo-scene.js','examine.js','equipment.js','journal.js','party.js','party-formal.js','truth.js','contests.js','contestEngine.js','alienPlayers.js','storage.js','perceive.js','carexplore.js','justice.js','food.js','betrayal.js','corpses.js','lifeseed.js','progression.js','ledger.js','abilityActions.js','monsterBehaviors.js','statusEffects.js','villager-agency.js','fieldFights.js','villager-objectives.js','codex-people.js','membership.js','hierarchy.js','debug-scenarios.js','build.js'];
for (const f of order) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  try {
    eval(code);
  } catch (e) {
    console.error('EVAL FAIL', f, e.message);
    process.exit(1);
  }
}
delete global.window;
delete global.document;

const Game = (global.Scattering && global.Scattering.Game) || global.Game || globalThis.Game;
if (!Game) { console.error('no Game'); process.exit(1); }

function newWorld(nV) {
  // synthetic world — bypass newGame (needs full data + RNG worldgen); we
  // build only what the social verbs touch.
  Game.state = {}; // full reset — never reuse across phases
  const S = Game.state;
  S.scholar = S.scholar || {};
  S.scholar.day = 1; S.scholar.kcal = 2500; S.scholar.inventory = [];
  S.codex = S.codex || {};
  S.village = S.village || {};
  S.village.roster = [];
  S.village.trust = {};
  S.village.rep = {};
  S.village.groups = [];
  Game.villagerId = 'player1';
  Game.state.scholar.villagerId = 'player1';
  for (let i = 0; i < nV; i++) {
    const id = 'v' + (i + 1);
    S.village.roster.push(id);
    S.village.trust[id] = 10;
    S.village.rep[id] = { generous: 0, brave: 0, honest: 0, competent: 0 };
  }
  // data villagers: conversation/gossip code reads Game.data.villagers
  Game.data = Game.data || {};
  Game.data.villagers = S.village.roster.map(id => ({ id, name: 'Villager-' + id }));
  // real characterGen data for convo content (goals, questions, voice)
  try {
    if (!Game.data.characterGen) {
      const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));
      Game.data.characterGen = cg.characterGen || cg;
    }
  } catch (e) { /* convo fuzz degrades gracefully */ }
  // needs + mood hooks
  if (!Game._origNpcNeeds) Game._origNpcNeeds = Game.npcNeeds;
  Game.npcNeeds = function (vid) {
    this._needs = this._needs || {};
    return this._needs[vid] || (this._needs[vid] = { hunger: 30, fear: 60, social: 60 });
  };
  if (!Game._origNpcMood) Game._origNpcMood = Game.npcMood;
  Game.npcMood = function () { return Game._moodOverride || 'hungry'; };
  // witness positions: everyone adjacent
  S.village.positions = {};
  S.scholar.mx = 4; S.scholar.my = 4;
  for (const id of S.village.roster) S.village.positions[id] = { mx: 4, my: 5 };
  // temper/goal lenses
  Game._temper = {};
  if (!Game._origNpcTemper) Game._origNpcTemper = Game.npcTemper;
  Game.npcTemper = function (vid) { return Game._temper[vid] || 'calm'; };
  // quiet the fiction
  if (!Game._origSay) Game._origSay = Game.say;
  Game.say = function () {};
  // socialTick/tickAction/save no-ops for speed where safe
  if (!Game._origTickAction) Game._origTickAction = Game.tickAction;
  Game.tickAction = function () {};
  if (!Game._origSave) Game._origSave = Game.save;
  Game.save = function () {};
  return S;
}
function addFood(units, kcalEach, name) {
  Game.state.scholar.inventory.push({ name: name || 'dried meat', units, kcalEach: kcalEach || 100, edible: true });
}
function trustOf(vid) { return (Game.state.village.trust || {})[vid]; }
function repOf(vid) { return Game.repOf(vid); }

module.exports = { Game, newWorld, addFood, trustOf, repOf, mulberry32, SEED };
if (require.main === module) {
  newWorld(4);
  addFood(200, 100);
  console.log('harness ok, Game loaded, roster:', Game.state.village.roster.join(','));
}
