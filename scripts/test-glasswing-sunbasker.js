#!/usr/bin/env node
// Glasswing Darter + Sunbasker mechanics tests (Steve 2026-10-05):
//  - glasswing (TRAP design): within 5 tiles it vanishes and sets a 3-turn
//    shadow trap. Stand still → dive hits (direct/splash) → grounded → combat.
//    Move away → hits empty dirt, climbs back into the sun. No turn-based on
//    approach — the trick is preserved.
//  - sunbasker: bask builds charge (+dmg), hits reset it, bite spends it,
//    shade/dusk flattens it (passive)
//  - codex: tbPatternDesc('single') no longer claims "hits an area around it"
//
// Turn driver: monsterActs() runs monster turns until it's the player turn.
// The player then acts directly (strike/move) with no intervening monster
// turn — the only honest way to test declare→respond→resolve beats.
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
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}
function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
function startFight(scen) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  s0.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  Game.debugScenario(scen);
  const s = Game.state.scholar; // freshGame() replaces state — re-capture
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const m = M();
  m.hp = m.maxHp = 200; // survive observation; mechanics, not lethality
  return Game.tbfight;
}
// Glasswing uses the trap design (Steve 2026-10-05) — no turn-based on
// approach. Separate setup: place the scenario, don't force combat.
function startGlasswing() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  Game.debugScenario('glasswing');
  return Game.state.scholar;
}
function M() { return Game.tbfight.fighters.find(x => x.kind === 'monster'); }
function P() { return Game.tbFighter('p'); }
// run monster turns until it's the player turn (ends there, turn open)
function monsterActs() {
  const f = Game.tbfight;
  if (!f || f.over) return 'over';
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
  return f.over ? 'over' : 'ok';
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();

  // --- 0. codex no longer lies about 'single' ---
  ok("tbPatternDesc('single') is not the area lie",
    !/area around it/i.test(Game.tbPatternDesc({ type: 'single' })));

  // ================= GLASSWING (trap design, Steve 2026-10-05) =================
  // No turn-based combat on approach — within 5 tiles it VANISHES and sets a
  // 3-turn shadow trap. Stand still → dive hits → grounded → combat starts.
  // Move away → it hits empty dirt and climbs back into the sun.
  {
    const s = startGlasswing();
    s.mx = s.monster.mx + 1; s.my = s.monster.my; // dist 1, within 5
    Game.monsterTurn();
    ok('glasswing vanishes within 5', !s.monster);
    ok('trap set', !!s.gwTrap);
    ok('trap dread line', Game.log.some(l => /The air feels wrong/i.test(l)));
  }
  {
    // shadow warnings escalate, then the dive
    const s = startGlasswing();
    s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.monsterTurn(); // trap set
    Game.gwTrapTick(); // turn 1
    ok('shadow faint', Game.log.some(l => /shadow on the ground — faint/i.test(l)));
    Game.gwTrapTick(); // turn 2
    ok('shadow darker', Game.log.some(l => /shadow on the ground — darker/i.test(l)));
    // player stands still on the trap tile → direct hit
    const hpBefore = s.health;
    Game.gwTrapTick(); // turn 3 → dive
    ok('standing still: dive hits', s.health < hpBefore);
    ok('direct hit hurts (20-29)', hpBefore - s.health >= 20 && hpBefore - s.health <= 29);
    // s.monster is cleared on startCombat ("it's in the fight now") — the
    // grounded phase lives on the fighter.
    const gm = Game.tbfight.fighters.find(x => x.kind === 'monster');
    ok('hit → grounded', gm && gm.beamPhase === 'grounded');
    ok('grounded crash line', Game.log.some(l => /GROUNDED/i.test(l)));
    ok('combat starts on grounded hit', !!Game.tbfight);
    try { Game.tbEnd('fled'); } catch (e) {}
  }
  {
    // moving away dodges the dive
    const s = startGlasswing();
    const tx = s.monster.mx, ty = s.monster.my;
    s.mx = tx + 1; s.my = ty;
    Game.monsterTurn(); // trap set on the player's tile
    Game.gwTrapTick(); Game.gwTrapTick(); // turns 1-2
    s.mx = 0; s.my = 0; // far from the trap tile
    const hpBefore = s.health;
    Game.gwTrapTick(); // turn 3 → miss
    ok('moved away: no damage', s.health === hpBefore);
    ok('miss: no combat, trap cleared', !Game.tbfight && !s.gwTrap);
    ok('miss line', Game.log.some(l => /hits empty dirt/i.test(l)));
  }

  // ================= SUNBASKER =================
  startFight('sunbasker');
  m = M();
  ok('sunbasker opens basking', m.beamPhase === 'bask');
  ok('sunbasker opening dread line', Game.log.some(l => /Gold in the grass/i.test(l)));
  ok('slow monster: no opening-pass turn (charge 0)', m.sbCharge === 0);
  monsterActs(); // bask 1
  m = M();
  ok('charge builds to 1', m.sbCharge === 1 && m.beamPhase === 'bask');
  monsterActs(); // bask 2 → bite declared
  m = M();
  ok('charge builds to 2', m.sbCharge === 2);
  ok('bite declared at charge 2', !!m.telegraph && m.telegraph.kind === 'direct');
  ok('bite phase charged', m.beamPhase === 'charged');

  // --- hitting it mid-windup kills the charge; bite lands weak ---
  Game.tbPlayerStrike(m.key); // player turn is open
  m = M();
  ok('hit resets charge', m.sbCharge === 0);
  ok('charge-break line', Game.log.some(l => /knocks the charge out/i.test(l)));
  const hp3 = P().hp;
  monsterActs(); // bite resolves with no charge bonus
  const biteDmg = hp3 - P().hp;
  ok('weakened bite lands (base 8-14, no charge bonus)', biteDmg >= 8 && biteDmg <= 14);
  m = M();
  ok('bite spends charge, back to bask', m.sbCharge === 0 && m.beamPhase === 'bask');

  // --- full-charge bite hurts (leave it alone) ---
  monsterActs(); // charge 1
  monsterActs(); // charge 2 + declare
  const hp4 = P().hp;
  monsterActs(); // resolve at charge 2 → 16-22
  const fullDmg = hp4 - P().hp;
  ok('full-charge bite hits harder (16-22)', fullDmg >= 16 && fullDmg <= 22);

  // --- night flattens it (passive) ---
  startFight('sunbasker');
  Game.dayPart = 3;
  monsterActs();
  m = M();
  ok('night: flattened', !!m.sbFlat);
  ok('night: no charge, no telegraph', m.sbCharge === 0 && !m.telegraph);
  ok('flatten line', Game.log.some(l => /dull brown/i.test(l)));
  Game.dayPart = 1;

  // --- shade flattens too ---
  Game.genDetail = () => { const g = flatGrid(); g[4][3] = 'tree'; return g; };
  startFight('sunbasker');
  m = M();
  m.mx = 4; m.my = 4; // tree at (3,4) = orthogonal → shade
  monsterActs();
  ok('shade: flattened', !!M().sbFlat);
  Game.genDetail = () => flatGrid();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
