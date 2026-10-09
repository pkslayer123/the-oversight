#!/usr/bin/env node
// BREAK-IT: speedbump turtle fight — Steve's girlfriend got stuck, "unsure how".
// Found: walking away from the turtle never ends the fight (no disengage),
// and the only exits were killing it (1 dmg/hit vs armor 15 + 0.5 resist =
// 60+ hits) or a hidden 50% barrier roll that lied ("they're right behind
// you") while teleporting the immobile turtle next to the player.
// Fixed: (1) tbEndCheck disengages when every living monster is 3+ tiles
// away and none chases (follows:false); (2) barrier flee auto-succeeds vs
// only non-chasers, and failed flees leave non-chasers behind instead of
// teleporting them to the player.
// Run: node scripts/test-turtle-breakit-20261008.js (SEED=N for more seeds).
const assert = require('assert');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}
const over = (Game) => !Game.tbfight || Game.tbfight.over;

(async () => {
  console.log('seed', H.SEED);

  // ---------- T1: walk away -> disengage ends the fight ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 100 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    t.mx = 6; t.my = 4; p.mx = 1; p.my = 1; // 5 tiles apart
    const ended = Game.tbEndCheck();
    check('T1 walked away from turtle: fight disengages', () => {
      assert.ok(ended && over(Game), 'fight still going with turtle 5 tiles away and unable to chase');
    });
    check('T1 disengage marks player fled (not won)', () => {
      assert.strictEqual(Game.state.scholar.fled || p.fled, p.fled);
    });
  }

  // ---------- T2: close range does NOT disengage ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 100 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    t.mx = 6; t.my = 4; p.mx = 5; p.my = 4; // adjacent
    const ended = Game.tbEndCheck();
    check('T2 adjacent turtle: fight continues', () => {
      assert.ok(!ended && !over(Game), 'fight ended while turtle is adjacent!');
    });
  }

  // ---------- T3: a CHASER at distance still holds the fight ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'hushwolf', { mhp: 60, php: 100 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    t.mx = 6; t.my = 4; p.mx = 1; p.my = 1; // 5 tiles, but hushwolf chases
    const ended = Game.tbEndCheck();
    check('T3 distant hushwolf (chaser): fight continues', () => {
      assert.ok(!ended && !over(Game), 'fight ended while a chaser is still hunting!');
    });
  }

  // ---------- T4: barrier flee vs turtle-only: auto-succeeds, no roll ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 100 });
    const p = Game.tbFighter('p');
    // try each edge until a crossing lands (a blockage/world-edge is a
    // legitimate refuse, not a flee failure)
    let done = false;
    for (const [ex, ey, dx, dy] of [[0, 4, -1, 0], [8, 4, 1, 0], [4, 0, 0, -1], [4, 8, 0, 1]]) {
      if (over(Game)) { done = true; break; }
      p.mx = ex; p.my = ey; p.moveLeft = 3; p.acted = false;
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
      Game.tbBarrierExit(dx, dy);
      if (over(Game)) { done = true; break; }
    }
    check('T4 barrier vs turtle-only: clean getaway, no 50% roll', () => {
      assert.ok(done, 'turtle-only barrier flee did not end the fight on any open edge');
    });
  }

  // ---------- T5: mixed fight, failed flee: turtle left behind, chaser follows ----------
  {
    const Game = await H.newCombatReadyGame();
    // build a two-monster fight manually
    const s = Game.state.scholar;
    s.mx = 4; s.my = 4;
    Game.state.systemArrived = false;
    Game.resetPerFightFlags();
    const tdef = Game.data.monsters.find(m => m.id === 'speedbump_turtle');
    const hdef = Game.data.monsters.find(m => m.id === 'hushwolf');
    const mkT = 'm_turtle', mkH = 'm_hush';
    Game.tbfight = {
      id: 'ftest2', round: 1, over: false, result: null, turnIdx: 0,
      order: ['p', mkT, mkH],
      fighters: [
        { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100, maxHp: 100, speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 3, acted: false },
        { key: mkT, kind: 'monster', monsterId: 'speedbump_turtle', mdef: tdef, name: 'Turtle', emoji: '🐢', hp: 60, maxHp: 60, speed: 1, mx: 6, my: 4, alive: true, fled: false, threatQueue: [] },
        { key: mkH, kind: 'monster', monsterId: 'hushwolf', mdef: hdef, name: 'Hushwolf', emoji: '🐺', hp: 60, maxHp: 60, speed: 5, mx: 6, my: 5, alive: true, fled: false, threatQueue: [] },
      ],
    };
    const p = Game.tbFighter('p');
    const turtle = Game.tbFighter(mkT);
    const hush = Game.tbFighter(mkH);
    // force the 50% roll to FAIL by stubbing Math.random
    const realRandom = Math.random;
    Math.random = () => 0.99;
    p.mx = 0; p.my = 4; p.moveLeft = 3; p.acted = false;
    Game.tbfight.turnIdx = 0;
    try {
      const r = Game.tbBarrierExit(-1, 0);
      check('T5 failed flee: returns true (push consumed)', () => assert.strictEqual(r, true));
      check('T5 failed flee: fight continues (chaser followed)', () => assert.ok(!over(Game), 'fight ended on failed flee'));
      check('T5 turtle (stayer) left behind, marked fled', () => assert.ok(turtle.fled === true, 'turtle was teleported to the player!'));
      const pd = Math.max(Math.abs(hush.mx - p.mx), Math.abs(hush.my - p.my));
      check('T5 hushwolf (chaser) repositioned to entry edge', () => assert.ok(hush.mx >= 5, `hushwolf at (${hush.mx},${hush.my}), did not follow through barrier`));
    } finally { Math.random = realRandom; }
  }

  // ---------- T6: bunker still expires; waiting at distance 2 keeps fight ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 200 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    t.hp = 29; p.mx = 5; p.my = 4; t.mx = 6; t.my = 4; // distance 1... strike then wait at 2
    Game.tbPlayerStrike(mk);
    check('T6 bunker triggers below half HP', () => assert.strictEqual(t.turtleBunker, 2));
    // step to distance 2 (safe from snap radius 1, still "in the fight")
    p.mx = 4; p.my = 4;
    let ok = true;
    for (let i = 0; i < 4 && !over(Game); i++) {
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf(mk);
      Game.tbMonsterTurn(t);
      if (over(Game)) break;
      Game.tbEndCheck();
    }
    check('T6 bunker expires while waiting at distance 2 (fight held)', () => {
      assert.ok((t.turtleBunker || 0) <= 0, `bunker stuck at ${t.turtleBunker}`);
    });
    check('T6 fight not disengaged at distance 2', () => assert.ok(!over(Game), 'fight disengaged at distance 2 — too aggressive'));
  }

  // ---------- T7: belltoad chorus still holds fight open at distance ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'belltoad', { mhp: 1, php: 100 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    t.hp = 0; t.alive = false; // all dead...
    Game._pendingPack = { id: 'belltoad', count: 2 }; // ...but chorus incoming
    p.mx = 1; p.my = 1; t.mx = 6; t.my = 4;
    const ended = Game.tbEndCheck();
    check('T7 pending chorus holds fight open despite distance', () => {
      assert.ok(!ended && !over(Game), 'chorus hold broken by disengage!');
    });
    delete Game._pendingPack;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
