#!/usr/bin/env node
// BREAK-IT combat-2: hostile re-attack of the turtle fix (c73695b).
// The disengage rule ("walk 3+ tiles from non-chasers -> fight ends") uses a
// FLAT 3-tile radius and ignores each monster's actual attack reach — and it
// deletes wound-up telegraphs. Plus two honesty lies ("still out there").
// These tests assert CORRECT behavior: they FAIL on the shipped code (Red)
// and must PASS after the fix (Green).
// Run: node scripts/test-combat2-breakit-20261008.js (SEED=N for more seeds).
const assert = require('assert');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}
const over = (Game) => !Game.tbfight || Game.tbfight.over;
const cheb = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));

(async () => {
  console.log('seed', H.SEED);

  // ---------- T1: REACH — gallowdeer beam (length 9, follows:false) ----------
  // At distance 5 the old rule disengages ("beyond striking distance") — but
  // the deer's Ocular Discharge beam is 9 tiles long. You have NOT walked
  // clear. The fight must hold.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'gallowdeer', { mhp: 160, php: 200 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 7; m.my = 4; p.mx = 2; p.my = 4; // distance 5
    assert.strictEqual(cheb(m.mx, m.my, p.mx, p.my), 5);
    const ended = Game.tbEndCheck();
    check('T1 gallowdeer at distance 5 (beam length 9): fight HOLDS', () => {
      assert.ok(!ended && !over(Game), 'fight disengaged while a 9-tile beam can still hit you — free escape from the wave-1 apex');
    });
  }

  // ---------- T2: REACH — moderator direct (range 4, follows:false) ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'moderator', { mhp: 160, php: 200 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 6; m.my = 4; p.mx = 3; p.my = 4; // distance 3
    const ended = Game.tbEndCheck();
    check('T2 moderator at distance 3 (direct range 4): fight HOLDS', () => {
      assert.ok(!ended && !over(Game), 'fight disengaged inside the monster\'s own attack range');
    });
  }

  // ---------- T3: TELEGRAPH — a wound-up attack holds the fight ----------
  // Moderator declares Removal Notice (direct, windup 2). Player steps to
  // distance 3. The old code ends the fight and the committed attack never
  // resolves — a guaranteed dodge that contradicts "no dodging it" fiction.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'moderator', { mhp: 160, php: 200 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 6; m.my = 4; p.mx = 3; p.my = 4; // distance 3, inside range 4
    m.telegraph = { kind: 'direct', targetKey: 'p', dmg: [12, 18], attackName: 'Removal Notice',
      pattern: { type: 'direct', range: 4, windup: 2 }, turnsLeft: 2 };
    const ended = Game.tbEndCheck();
    check('T3 wound-up telegraph holds the fight (no deleting committed attacks)', () => {
      assert.ok(!ended && !over(Game), 'fight ended mid-windup — the attack was deleted by walking away');
    });
  }

  // ---------- T4: the turtle fix still works ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 100 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 7; m.my = 4; p.mx = 2; p.my = 4; // distance 5, snap radius 1
    const ended = Game.tbEndCheck();
    check('T4 turtle at distance 5, no telegraph: disengages (the fix survives)', () => {
      assert.ok(ended && over(Game), 'turtle disengage regressed!');
    });
  }

  // ---------- T5: distance-2 floor preserved ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 100 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 6; m.my = 4; p.mx = 4; p.my = 4; // distance 2
    const ended = Game.tbEndCheck();
    check('T5 turtle at distance 2: fight holds (engagement floor)', () => {
      assert.ok(!ended && !over(Game), 'fight disengaged at distance 2');
    });
  }

  // ---------- T6: HONESTY — disengage must not promise the monster persists --
  // Wild-encounter monsters are removed from the world at fight start
  // (removeWorldMonster) and never restored — "they're still out there, if
  // you want them" is a lie.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 100 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 7; m.my = 4; p.mx = 2; p.my = 4;
    const n0 = Game.log.length;
    Game.tbEndCheck();
    const said = Game.log.slice(n0).join(' ');
    check('T6 disengage message makes no false "still out there" promise', () => {
      assert.ok(!/still out there|if you want them/i.test(said), 'message promises the monster persists: ' + said.slice(0, 120));
    });
  }

  // ---------- T7: HONESTY — barrier clean-getaway message ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 100 });
    const p = Game.tbFighter('p');
    let done = false, said = '';
    for (const [ex, ey, dx, dy] of [[0, 4, -1, 0], [8, 4, 1, 0], [4, 0, 0, -1], [4, 8, 0, 1]]) {
      if (over(Game)) { done = true; break; }
      const n0 = Game.log.length;
      p.mx = ex; p.my = ey; p.moveLeft = 3; p.acted = false;
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
      Game.tbBarrierExit(dx, dy);
      if (over(Game)) { said = Game.log.slice(n0).join(' '); done = true; break; }
    }
    check('T7 barrier clean getaway: fight ends', () => assert.ok(done, 'barrier flee did not end the fight'));
    check('T7 barrier message makes no false "still back there" promise', () => {
      assert.ok(!/still back there|if you want it/i.test(said), 'message promises the monster persists: ' + said.slice(0, 140));
    });
  }

  // ---------- T8: moderator disengages past its own reach ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'moderator', { mhp: 160, php: 200 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 8; m.my = 4; p.mx = 2; p.my = 4; // distance 6 > max(2, reach 4)
    const ended = Game.tbEndCheck();
    check('T8 moderator at distance 6 (past reach 4): disengages', () => {
      assert.ok(ended && over(Game), 'fight held past the monster\'s own reach');
    });
  }

  // ---------- T9: telegraph-hold is not a softlock ----------
  // Turtle declares snap (ambush r1); player walks to distance 3 -> hold;
  // turtle's turn resolves the snap (miss); THEN disengage fires.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: 60, php: 200 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 5; m.my = 4; p.mx = 4; p.my = 4; // adjacent: turtle declares
    m.telegraph = { kind: 'squares', cells: [{ cx: 5, cy: 4 }], dmg: [20, 30], attackName: 'Snap Decision',
      pattern: { type: 'ambush', radius: 1 }, turnsLeft: 1 };
    p.mx = 1; p.my = 4; // player walks to distance 4
    let ended = Game.tbEndCheck();
    check('T9a pending snap holds the fight at distance 4', () => {
      assert.ok(!ended && !over(Game), 'fight ended with a live telegraph');
    });
    // turtle's turn: resolve the snap (miss), then endCheck
    if (!over(Game)) {
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf(mk);
      Game.tbMonsterTurn(m);
    }
    check('T9b after the snap resolves, disengage fires (no softlock)', () => {
      assert.ok(over(Game), 'fight stuck after telegraph resolved — telegraph-hold softlocks!');
    });
  }

  // ---------- T10: gallowdeer can never be walked away from; barrier still frees you --
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'gallowdeer', { mhp: 160, php: 200 });
    const m = Game.tbFighter(mk), p = Game.tbFighter('p');
    m.mx = 8; m.my = 8; p.mx = 0; p.my = 0; // distance 8 (max on grid), beam 9
    const ended = Game.tbEndCheck();
    check('T10 gallowdeer at max grid distance 8: fight holds (beam still reaches)', () => {
      assert.ok(!ended && !over(Game), 'fight disengaged inside beam range');
    });
    // ...but the barrier clean-getaway (auto vs non-chasers) still exits
    let freed = false;
    for (const [ex, ey, dx, dy] of [[0, 4, -1, 0], [8, 4, 1, 0], [4, 0, 0, -1], [4, 8, 0, 1]]) {
      if (over(Game)) { freed = true; break; }
      p.mx = ex; p.my = ey; p.moveLeft = 3; p.acted = false;
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
      Game.tbBarrierExit(dx, dy);
      if (over(Game)) { freed = true; break; }
    }
    check('T10b barrier still frees you from a non-chaser apex (no softlock)', () => {
      assert.ok(freed, 'no exit from an un-walkable fight — softlock!');
    });
  }

  // ---------- T11: wiring — reach helper exists, data honest ----------
  {
    const Game = await H.newCombatReadyGame();
    check('T11 tbMonsterReach helper is wired', () => {
      assert.strictEqual(typeof Game.tbMonsterReach, 'function', 'tbMonsterReach missing');
    });
    check('T11b reach matches engine gates (gallowdeer 9, moderator 4, turtle 1, moth 2)', () => {
      const g = (id) => ({ mdef: Game.data.monsters.find(m => m.id === id) });
      assert.strictEqual(Game.tbMonsterReach(g('gallowdeer')), 9);
      assert.strictEqual(Game.tbMonsterReach(g('moderator')), 4);
      assert.strictEqual(Game.tbMonsterReach(g('speedbump_turtle')), 1, 'raw reach; the 2-floor lives in tbEndCheck');
      assert.strictEqual(Game.tbMonsterReach(g('mirrormoth')), 2);
      assert.strictEqual(Game.tbMonsterReach({}), 3, 'missing mdef defaults conservative (single range 3)');
    });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
