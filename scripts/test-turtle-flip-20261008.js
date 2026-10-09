#!/usr/bin/env node
// FLIP MECHANIC (speedbump turtle, Steve 2026-10-08): the codex weakness
// "flip it (good luck)" is now real. tbPlayerFlip: adjacent-only, spends
// the turn, strength check (0.3 + str*0.04, +0.25 crowbar). Success: flipped
// 3 turns — armor 0, can't snap, can't bunker. Fail: free snap.
// Proof: scripts/test-turtle-flip-20261008.js (SEED=N for more seeds).
const assert = require('assert');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}
const over = (Game) => !Game.tbfight || Game.tbfight.over;

function setup(Game, opts = {}) {
  const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: opts.mhp || 60, php: opts.php || 100 });
  const t = Game.tbFighter(mk);
  const p = Game.tbFighter('p');
  const s = Game.state.scholar;
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: opts.weapon || 'fire_hardened_spear' };
  s.stats = s.stats || {}; s.stats.str = opts.str != null ? opts.str : 5;
  p.mx = 5; p.my = 4; t.mx = 6; t.my = 4; // adjacent
  return { mk, t, p };
}
function playerTurn(Game) {
  const p = Game.tbFighter('p');
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  p.moveLeft = 6; p.acted = false;
}

(async () => {
  console.log('seed', H.SEED);
  const realRandom = Math.random;

  // ---------- F1: flip success -> flipped 3, armor 0 ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t, p } = setup(Game);
    playerTurn(Game);
    Math.random = () => 0.0; // force success
    try { Game.tbPlayerFlip(mk); } finally { Math.random = realRandom; }
    // Note: tbAfterPlayerAction advances the turn, so the turtle's turn
    // immediately ticks flipped 3->2 and resets p.acted. That's correct.
    check('F1 flip succeeds: turtle flipped', () => assert.ok(t.turtleFlipped >= 2 && t.turtleFlipped <= 3, `turtleFlipped=${t.turtleFlipped}`));
    check('F1 flip spends the turn (round advanced)', () => assert.ok(Game.tbfight.round >= 2, `round=${Game.tbfight.round} — turn did not advance`));
    // strike the flipped turtle: armor bypassed
    const hp0 = t.hp;
    playerTurn(Game);
    Game.tbPlayerStrike(mk);
    const dmg = hp0 - t.hp;
    check('F1 flipped turtle takes full spear damage (armor 0)', () => assert.ok(dmg >= 10, `only ${dmg} dmg — armor still applied?`));
  }

  // ---------- F2: flipped turtle can't snap, rights itself ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t, p } = setup(Game, { php: 200 });
    t.turtleFlipped = 3;
    const hp0 = p.hp;
    for (let i = 0; i < 3; i++) {
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf(mk);
      Game.tbMonsterTurn(t);
    }
    check('F2 flipped turtle never snaps the adjacent player', () => assert.strictEqual(p.hp, hp0));
    check('F2 turtle rights itself after 3 of its turns', () => assert.ok((t.turtleFlipped || 0) <= 0));
  }

  // ---------- F3: flip fail -> free snap ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t, p } = setup(Game, { php: 200 });
    playerTurn(Game);
    Math.random = () => 0.999; // force fail
    try { Game.tbPlayerFlip(mk); } finally { Math.random = realRandom; }
    check('F3 failed flip: turtle not flipped', () => assert.ok(!(t.turtleFlipped > 0)));
    check('F3 failed flip: player takes snap damage', () => assert.ok(p.hp < 200, `player hp ${p.hp} — no snap on fail`));
    check('F3 failed flip still spends the turn', () => assert.ok(Game.tbfight.round >= 2, `round=${Game.tbfight.round} — turn did not advance`));
  }

  // ---------- F4: honest refusals ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t, p } = setup(Game);
    // too far
    p.mx = 1; p.my = 1;
    playerTurn(Game);
    const r1 = Game.tbPlayerFlip(mk);
    check('F4 flip at distance: refused, turn not spent', () => assert.ok(r1 === false && !p.acted));
    // bunkered
    p.mx = 5; p.my = 4; t.turtleBunker = 2;
    playerTurn(Game);
    const r2 = Game.tbPlayerFlip(mk);
    check('F4 flip while bunkered: refused', () => assert.ok(r2 === false && !p.acted));
    // already flipped
    t.turtleBunker = 0; t.turtleFlipped = 2;
    playerTurn(Game);
    const r3 = Game.tbPlayerFlip(mk);
    check('F4 flip while flipped: refused', () => assert.ok(r3 === false && !p.acted));
  }

  // ---------- F5: bunker suppressed while flipped ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t } = setup(Game);
    t.hp = 20; t.turtleFlipped = 3; // below half, but flipped
    playerTurn(Game);
    Game.tbPlayerStrike(mk); // damage triggers the bunker check
    check('F5 no bunker while flipped', () => assert.ok(!(t.turtleBunker > 0), 'bunkered while upside down!'));
  }

  // ---------- F6: full fight — flip then kill ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t, p } = setup(Game, { php: 200 });
    playerTurn(Game);
    Math.random = () => 0.0;
    try { Game.tbPlayerFlip(mk); } finally { Math.random = realRandom; }
    let rounds = 0;
    while (!over(Game) && rounds < 30) {
      rounds++;
      playerTurn(Game);
      try { Game.tbPlayerStrike(mk); } catch (e) { break; }
      if (over(Game)) break;
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf(mk);
      try { Game.tbMonsterTurn(t); } catch (e) { break; }
      Game.tbEndCheck();
    }
    check('F6 flip+strikes kills the turtle', () => assert.ok(over(Game) && t.hp <= 0, `turtle at ${t.hp} after ${rounds} rounds`));
    console.log('  info: F6 took', rounds, 'rounds, player hp', p.hp);
  }

  // ---------- F7: crowbar leverage ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60 });
    const t = Game.tbFighter(mk);
    const s = Game.state.scholar;
    s.equipped = { weapon: { itemId: 'crowbar' } };
    s.stats = { str: 5 };
    const p = Game.tbFighter('p');
    p.mx = 5; p.my = 4; t.mx = 6; t.my = 4;
    // chance = 0.3 + 5*0.04 + 0.25 = 0.75. Roll 0.7 -> success with crowbar, fail without.
    playerTurn(Game);
    Math.random = () => 0.7;
    try { Game.tbPlayerFlip(mk); } finally { Math.random = realRandom; }
    check('F7 crowbar leverage turns a fail into success', () => assert.ok(t.turtleFlipped >= 2, `turtleFlipped=${t.turtleFlipped}`));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
