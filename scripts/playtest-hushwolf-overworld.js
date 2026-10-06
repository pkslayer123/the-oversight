#!/usr/bin/env node
// OVERWORLD REPRO (Steve 2026-10-06): hushwolf pack stalk vs a player who only
// presses WAIT. Does the pack close in, or stand frozen?
// Run: node scripts/playtest-hushwolf-overworld.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
function note(t) { console.log(t); }
function dist(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }

(async () => {
  await Game.init();
  Game.debugScenario('hushpuppy');
  const s = Game.state.scholar;
  Game.canSee = () => true;
  const m0 = s.monster;
  note(`spawn: player@(${s.mx},${s.my}) monster@(${m0.mx},${m0.my}) d=${dist(s, m0)}`);
  for (let i = 1; i <= 20; i++) {
    const m = s.monster;
    const before = m ? { x: m.mx, y: m.my, stance: m.stance || '(none)' } : null;
    Game.doAction('wait');
    const after = s.monster ? { x: s.monster.mx, y: s.monster.my, stance: s.monster.stance || '(none)' } : null;
    const moved = before && after ? (before.x !== after.x || before.y !== after.y ? 'MOVED' : 'FROZEN') : (after ? 'APPEARED' : 'GONE');
    const d = s.monster ? dist(s, s.monster) : -1;
    const fight = Game.tbfight ? ' ⚔COMBAT' : '';
    note(`wait ${String(i).padStart(2)}: ${before ? `(${before.x},${before.y}) stance=${before.stance}` : 'no monster'} -> ${after ? `(${after.x},${after.y}) stance=${after.stance}` : 'no monster'} d=${d} ${moved}${fight}`);
    if (Game.tbfight) break;
  }
})();
