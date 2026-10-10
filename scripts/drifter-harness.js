// Drifter adversarial harness: shared boot. Seeds Math.random BEFORE eval
// (modules capture it at load). Full index.html load order minus DOM-only
// drama.js/move-anim.js/sprites.js/tile-scenes.js/app.js. window stubbed for
// eval (equipment.js needs it), deleted before play (sync combat path).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/worktrees/playtest-drifter';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load; removed before play
global.document = {
  createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} } }),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, style: {} }, addEventListener() {},
};
global.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
try { global.navigator = global.navigator || { userAgent: 'node' }; } catch (e) {}
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

const ORDER = [
  'engine/state.js','engine/modifiers.js','engine/calories.js','engine/day.js',
  'engine/forage.js','engine/combat.js',
  'game.js','encounters.js','conversation.js','convo-mood.js','convoTopics.js',
  'convo-wants.js','convo-dialogue.js','convo-beats.js','convo-scene.js',
  'examine.js','equipment.js','journal.js','party.js','party-formal.js','truth.js',
  'contests.js','broadcast.js','contestEngine.js','alienPlayers.js','storage.js',
  'perceive.js','carexplore.js','justice.js','food.js','betrayal.js','corpses.js',
  'corruption.js','lifeseed.js','progression.js','ledger.js','abilityActions.js',
  'monsterBehaviors.js','statusEffects.js','villager-agency.js','fieldFights.js',
  'villager-objectives.js','codex-people.js','membership.js','hierarchy.js',
  'debug-scenarios.js','build.js',
];
for (const f of ORDER) {
  // direct eval, exactly like proof-drifter-20261010.js (proven boot pattern)
  eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'));
}
delete global.window; // sync combat path, no async flip
const Game = (globalThis.Scattering || {}).Game;
if (!Game) { console.error('NO Scattering.Game'); process.exit(1); }
module.exports = { Game, SEED, ROOT };
