#!/usr/bin/env node
// Choir Toad chorus-call regression test (drifter playtest loop 2026-10-05).
// Commit 1b0e97f ("Choir Toad: probabilistic chorus") shipped an unclosed
// `if (called) {` in tbAdvance — game.js didn't parse at all, killing the
// whole game on the live build. This test pins the mechanic that broke:
//   1. the delayed pack member arrives when a toad calls (round >= 2)
//   2. the call consumes _pendingPack and announces it
//   3. a full choir fight runs rounds 1-6 without throwing
// Usage: node scripts/test-choir-toad-call.js
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
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

function startFight() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game._pendingPack = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  s0.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('choir');
  const s = Game.state.scholar;
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  m.hp = m.maxHp = 500;
  return Game.tbfight;
}
function P() { return Game.tbFighter('p'); }
// advance monster turns until player turn is open
function monsterActs() {
  const f = Game.tbfight;
  if (!f || f.over) return 'over';
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
  return f.over ? 'over' : 'ok';
}

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));

  // --- 1. the delayed pack member is staged, not teleported in ---
  const f = startFight();
  ok('choir fight started', !!f);
  ok('delayed pack staged', !!Game._pendingPack && Game._pendingPack.count >= 1,
    JSON.stringify(Game._pendingPack));
  const fighters0 = f.fighters.length;
  const pack0 = Game._pendingPack.count;

  // --- 2. forced call: round 2, Math.random -> 0 guarantees the 25% roll ---
  f.round = 2;
  const realRandom = Math.random;
  Math.random = () => 0;
  let threw = null;
  try { monsterActs(); } catch (e) { threw = e; }
  ok('tbAdvance with chorus call does not throw', !threw, threw && threw.message);
  ok('pack member joined the fight', f.fighters.length === fighters0 + 1,
    `fighters ${fighters0} -> ${f.fighters.length}`);
  ok('pending pack decremented', Game._pendingPack && Game._pendingPack.count === pack0 - 1,
    JSON.stringify(Game._pendingPack && Game._pendingPack.count));
  ok('chorus announced', Game.log.some(l => /another throat joins the chorus/i.test(l)));
  // second call consumes more
  f.round = 3;
  try { monsterActs(); } catch (e) { threw = e; }
  ok('second call decrements the pack again', Game._pendingPack && Game._pendingPack.count === pack0 - 2,
    JSON.stringify(Game._pendingPack && Game._pendingPack.count));
  // pack grew to 4 (one fighting + 3 pending): keep calling until empty
  let guard = 0;
  while (Game._pendingPack && Game._pendingPack.count > 0 && guard < 6) {
    guard++;
    f.round++;
    try { monsterActs(); } catch (e) { threw = e; }
  }
  Math.random = realRandom;
  ok('all forced calls empty the pack', !Game._pendingPack,
    JSON.stringify(Game._pendingPack && Game._pendingPack.count));

  // --- 3. full fight runs rounds 1-6 without throwing (natural RNG) ---
  startFight();
  let threw2 = null, rounds = 0;
  try {
    for (let i = 0; i < 40 && !Game.tbfight.over; i++) {
      if (monsterActs() === 'over') break;
      rounds = Math.max(rounds, Game.tbfight.round);
    }
  } catch (e) { threw2 = e; }
  ok('choir fight runs without throwing', !threw2, threw2 && threw2.message);
  ok('fight reached round 3+', rounds >= 3, `rounds=${rounds}`);
  try { Game.tbEnd('fled'); } catch (e) {}

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
