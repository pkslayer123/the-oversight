#!/usr/bin/env node
// Hushwolf pack AI pacing regression tests (Steve 2026-10-06).
// The freeze: a player who only pressed WAIT watched a hushwolf pack stand
// frozen for 20+ idle rounds — no approach, no rush. Three compounding causes:
//   1. tickAction (the action clock behind wait/rest) never called monsterTurn
//      — the overworld stance machine only ran on steps/interacts.
//   2. The 'cautious' stance was a one-way trap: circle forever, no exit,
//      no startCombat (hit hushwolf/hype_horn/delegate_beast/review_drone
//      whenever 2+ villagers were near — fear:'numbers').
//   3. stepToward tried one axis and gave up — a single tree between monster
//      and player froze the stalk (no diagonal fallback).
// Usage: node scripts/test-hushwolf-pacing.js
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

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); } }
function P() { return Game.tbFighter('p'); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}

(async () => {
  // --- 1. overworld: waiting engages the hushwolf pack ---
  for (let iter = 1; iter <= 3; iter++) {
    await Game.init();
    Game.debugScenario('hushpuppy');
    const s = Game.state.scholar;
    Game.canSee = () => true;
    let waits = 0;
    while (!Game.tbfight && waits < 10) { waits++; Game.doAction('wait'); }
    ok(`hushwolf overworld wait -> combat (iter ${iter})`, !!Game.tbfight, `no combat after ${waits} waits`);
  }

  // --- 2. cautious stance commits instead of circling forever ---
  await Game.init();
  Game.debugScenario('hushpuppy');
  Game.canSee = () => true;
  {
    const s = Game.state.scholar;
    s.monster.stance = 'cautious'; s.monster.mx = 6; s.monster.my = 4;
    let committed = false;
    for (let i = 0; i < 6 && !Game.tbfight; i++) {
      Game.monsterTurn();
      if (!s.monster) break;
      if (s.monster.stance === 'hungry') { committed = true; break; }
    }
    ok('cautious pack commits to hungry within 6 turns', committed || !!Game.tbfight,
      `stance=${s.monster && s.monster.stance}`);
  }

  // --- 3. combat: passive player takes damage, no idle streaks ---
  await Game.init();
  Game.debugScenario('hushpuppy');
  Game.canSee = () => true;
  Game.startCombat('hushwolf');
  {
    const p = P(); p.hp = p.maxHp = 9000;
    let maxIdle = 0, streak = 0, dmg = 0;
    const wolves = () => Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled);
    for (let r = 0; r < 15 && !Game.tbfight.over; r++) {
      const before = new Map(wolves().map(w => [w.key, w.mx + ',' + w.my]));
      const hp0 = P().hp;
      endTurn();
      if (Game.tbfight.over) break;
      const moved = wolves().some(w => before.get(w.key) !== w.mx + ',' + w.my);
      const dealt = Math.max(0, hp0 - P().hp); dmg += dealt;
      if (!moved && dealt === 0) streak++; else streak = 0;
      maxIdle = Math.max(maxIdle, streak);
    }
    ok('passive player takes damage in wolf combat', dmg > 0, `dmg=${dmg}`);
    ok('no more than 3 consecutive idle combat rounds', maxIdle <= 3, `maxIdle=${maxIdle}`);
  }

  // --- 4. sibling: service_mimic (rush/no-telegraph) also engages on wait ---
  for (let iter = 1; iter <= 3; iter++) {
    await Game.init();
    Game.debugScenario('customerservice');
    const s = Game.state.scholar;
    Game.canSee = () => true;
    let waits = 0;
    while (!Game.tbfight && waits < 12) { waits++; Game.doAction('wait'); }
    ok(`service_mimic overworld wait -> combat (iter ${iter})`, !!Game.tbfight, `no combat after ${waits} waits`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
