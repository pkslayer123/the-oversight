#!/usr/bin/env node
// Choir Toad mid-combat spawn key regression test (Steve 2026-10-05).
// BUG: chorus arrivals used `key: 'm' + Date.now() + i`. Two arrivals in the
// same millisecond produced DUPLICATE fighter keys — the live duplicate
// shared a key with a corpse, so tbFighter(key) always returned the corpse:
// the live toad could never be targeted, never acted (order lookup hit the
// dead fighter), but kept monstersFighting non-empty, so tbEndCheck never
// ended the fight. The player struck corpses forever: a real soft-lock.
// FIX: per-fight monotonic spawn keys (f.spawnSeq) in both arrival branches.
// This test freezes Date.now to force the collision and asserts:
//   1. all fighter keys are unique after 3 forced arrivals
//   2. every live toad is targetable (tbFighter(key) returns the live one)
//   3. killing all toads ends the fight (no ghost lock) — both branches
// Usage: node scripts/test-choir-toad-spawnkeys.js
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
  for (let i = 0; i < 8 && !Game.tbfight; i++) Game.monsterTurn();
  return Game.tbfight;
}
function P() { return Game.tbFighter('p'); }
function advance() {
  const f = Game.tbfight;
  if (!f || f.over) return 'over';
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
  return f.over ? 'over' : 'ok';
}
function killAllToads() {
  const f = Game.tbfight;
  for (const t of f.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled)) {
    t.hp = 0; t.alive = false;
    Game.say(`The ${t.name} falls.`);
  }
  Game.tbEndCheck();
}
function liveToads() {
  return Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled &&
    x.mdef && x.mdef.id === 'belltoad');
}

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));

  // Freeze the clock: this is what made Date.now() keys collide.
  const realNow = Date.now;
  Date.now = () => 1791261357986;

  // --- anchored branch: 3 forced arrivals, same millisecond ---
  let f = startFight();
  ok('choir fight started', !!f);
  const realRandom = Math.random;
  Math.random = () => 0; // arrival always triggers
  f.round = 2; advance();
  f.round = 3; advance();
  f.round = 4; advance();
  Math.random = realRandom;
  const keys = f.fighters.map(x => x.key);
  const uniq = new Set(keys);
  ok('spawned fighter keys unique (anchored branch)', uniq.size === keys.length,
    `keys=[${keys.join(',')}]`);
  const targetable = liveToads().every(t => { const g = Game.tbFighter(t.key); return g && g.alive && g === t; });
  ok('every live toad targetable by key', targetable);
  ok('spawnSeq advanced', (f.spawnSeq || 0) >= 3, `spawnSeq=${f.spawnSeq}`);

  // --- killing everything ends the fight (no ghost lock) ---
  killAllToads();
  ok('fight ends after all toads die', !Game.tbfight || Game.tbfight.over,
    `tbfight=${!!Game.tbfight} over=${Game.tbfight && Game.tbfight.over}`);
  ok('fight result is won', !Game.tbfight || Game.tbfight.result === 'won',
    `result=${Game.tbfight && Game.tbfight.result}`);

  // --- solo branch (no living toad to anchor to): frozen clock again ---
  f = startFight();
  killAllToads(); // wipe the initial toad; pending pack still staged
  const hadPending = !!Game._pendingPack && Game._pendingPack.count > 0;
  ok('pending pack staged after wipe', hadPending, JSON.stringify(Game._pendingPack));
  Math.random = () => 0;
  let guard = 0;
  while (Game._pendingPack && Game._pendingPack.count > 0 && guard++ < 10) { f.round = 5 + guard; advance(); }
  Math.random = realRandom;
  ok('pending pack fully drained', !Game._pendingPack, JSON.stringify(Game._pendingPack));
  const keys2 = f.fighters.map(x => x.key);
  ok('spawned fighter keys unique (solo branch)', new Set(keys2).size === keys2.length,
    `keys=[${keys2.join(',')}]`);
  const soloToad = liveToads()[0];
  ok('solo arrival is a live targetable toad', !!soloToad && Game.tbFighter(soloToad.key) === soloToad);
  killAllToads();
  ok('fight ends after solo toad dies', !Game.tbfight || Game.tbfight.over);

  Date.now = realNow;
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
