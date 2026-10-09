// Harness for adversarial brawler playtest (2026-10-08).
// Seeds Math.random BEFORE eval (modules capture it at load), evals the full
// src/js list in index.html order minus DOM-only files, stubs window for the
// eval phase, then deletes it so combat takes the sync path.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '7', 10);
const rng = mulberry32(SEED);
Math.random = rng;
global.resetRng = function (s) { const r = mulberry32(s === undefined ? SEED : s); Math.random = r; return r; };

const SKIP = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js', 'drama.js']);
const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
// minimal DOM stubs for module load
global.window = global;
global.document = {
  createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } }),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, body: { appendChild() {}, style: {} },
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch (e) {}
for (const rel of ORDER) {
  const base = path.basename(rel);
  if (SKIP.has(base)) continue;
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try { eval.call(global, code + '\n//# sourceURL=' + rel); }
  catch (e) { console.error('EVAL FAIL', rel, e.message); process.exit(1); }
}
// load data files
for (const f of ['monsters', 'abilities', 'animals', 'items']) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f + '.json'), 'utf8'));
    global.Scattering.Game.data[f] = j;
  } catch (e) { console.error('DATA FAIL', f, e.message); }
}
delete global.window; // sync combat path
delete global.document;

const Game = global.Scattering.Game;
module.exports = { Game, SEED, resetRng: global.resetRng, ROOT };
if (require.main === module) console.log('harness ok, seed', SEED);
