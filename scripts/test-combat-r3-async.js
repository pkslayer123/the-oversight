#!/usr/bin/env node
// BREAK-IT round 3: async combat path divergence + regressions.
// The browser runs combat on the ASYNC path (window defined -> tbAdvanceAsync);
// node tests run the SYNC path. The async path had diverged in 4 ways:
//
//   A1. tbAdvanceAsync() no-ops when it's the player's turn (the turn that
//       just ended) -> action-driven turn end (wait/strike/ability with 0
//       moves) in the browser leaves the fight stuck: 0 moves, acted, no
//       legal moves, no end-turn button. SOFTLOCK.
//   A2. tbAdvanceOneAsync() never calls tbBeginTurn() on player arrival ->
//       moveLeft/acted never reset, stuns never consumed, status ticks
//       skipped on the player. (Sync path does all of this.)
//   A3. tbAdvanceOneAsync()'s round wrap lacks the belltoad chorus spawn and
//       the orderDirty re-sort -> reinforcements never arrive in the browser,
//       and tbEndCheck's "another croak answers" chorus clause holds the
//       fight open FOREVER (plus: skipping dead fighters recursed without
//       bound -> RangeError once the chain actually runs).
//   B.  _pendingPack is dropped by save/load -> reload mid-belltoad-fight
//       save-scums the chorus away (free 'won').
//   C.  tbPlayerGravityWell() never calls tbAfterPlayerAction() -> using the
//       well with 0 moves left softlocks the turn (every sibling verb ends
//       the turn; the well sets acted=true and strands you).
//   D.  REGRESSION of round-2 R4: bc2bf4f's wound gate rewrote field_medicine
//       and dropped the addHealth routing -> phantom mid-combat heal again.
//
// Each check FAILS pre-fix, PASSES post-fix. Run: node scripts/test-combat-r3-async.js (SEED=N for more seeds).
const assert = require('assert');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}

(async () => {
  console.log('seed', H.SEED);

  // ---------- A1: browser-path turn stall ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'bulldozer', { moves: 0, mhp: 500 });
    const bp = H.browserPath();
    try {
      const idx0 = Game.tbfight.turnIdx;
      const waited = Game.tbPlayerWait();
      check('A1 wait returns true (0 moves, unacted)', () => assert.strictEqual(waited, true));
      const p = Game.tbFighter('p');
      check('A1 turn advances in browser path (chain scheduled)', () => {
        assert.ok(bp.queue.length > 0, `nothing scheduled: turnIdx=${Game.tbfight.turnIdx} (was ${idx0}), still player turn=${Game.tbIsPlayerTurn()}, moves=${p.moveLeft}, acted=${p.acted} -> STUCK`);
      });
      // Drain the chain: AI turns must run and the player's turn must reset.
      bp.pump(50);
      const p2 = Game.tbFighter('p');
      check('A1 AI turns ran and player turn reset (tbBeginTurn)', () => {
        assert.ok(bp.drained > 0, 'no AI turns ran');
        assert.ok(p2.moveLeft > 0 && p2.acted === false, `turn not reset: moves=${p2.moveLeft} acted=${p2.acted}`);
      });
    } finally { bp.restore(); }
  }

  // ---------- A2: async player arrival runs tbBeginTurn ----------
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'bulldozer', { moves: 0, mhp: 500 });
    const f = Game.tbfight;
    f.order = ['m_test', 'p']; f.turnIdx = 0;
    const p = Game.tbFighter('p');
    p.moveLeft = 0; p.acted = true; p.stunned = 0;
    const bp = H.browserPath();
    try {
      Game.tbAdvanceOneAsync(); // turnIdx 0->1: player arrival
      check('A2 async arrival resets moves/acted (tbBeginTurn)', () => {
        assert.strictEqual(p.moveLeft, 6, `moveLeft=${p.moveLeft}, expected 6 (speed)`);
        assert.strictEqual(p.acted, false, `acted=${p.acted}, expected false`);
      });
    } finally { bp.restore(); }
  }
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'bulldozer', { moves: 0, mhp: 500 });
    const f = Game.tbfight;
    f.order = ['m_test', 'p']; f.turnIdx = 0;
    const p = Game.tbFighter('p');
    p.moveLeft = 0; p.acted = true; p.stunned = 1; // plain stun (not stunFull)
    const bp = H.browserPath();
    try {
      Game.tbAdvanceOneAsync();
      check('A2 async arrival consumes stun', () => {
        assert.strictEqual(p.stunned, 0, `stunned=${p.stunned}, expected 0`);
        assert.strictEqual(p.acted, false, 'plain stun should leave the act available');
      });
    } finally { bp.restore(); }
  }

  // ---------- A3: chorus arrives in async; no infinite hold; no stack overflow ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'belltoad', { moves: 0, mhp: 30 });
    const mdef = Game.data.monsters.find(m => m.id === 'belltoad');
    Game._pendingPack = { id: 'belltoad', count: 3, mdef };
    Game.tbDamage(mk, 99999, 'test');
    check('A3 toad dead', () => assert.strictEqual(Game.tbFighter(mk).alive, false));
    const bp = H.browserPath();
    try {
      const held = Game.tbEndCheck();
      check('A3 chorus holds the fight open (design)', () => assert.strictEqual(held, false));
      check('A3 fight not over yet', () => assert.strictEqual(Game.tbfight.over, false));
      Game.tbPlayerWait(); // ends turn -> async chain (pre-fix: stuck; post-fix: runs)
      let threw = null;
      // The chain pauses at every player turn (by design) — keep waiting to
      // advance rounds, up to 40 player turns.
      let waits = 0;
      const arrived = () => Game.tbfight.fighters.some(x => x.key.indexOf('m_spawn_') === 0)
        || Game._pendingPack === null;
      try {
        while (!arrived() && waits < 40) {
          const w = Game.tbPlayerWait();
          if (!w) break;
          waits++;
          bp.pump(60);
        }
      } catch (e) { threw = e; }
      check('A3 async chain does not stack-overflow on all-dead order', () => {
        assert.strictEqual(threw, null, threw && threw.message);
      });
      check('A3 chorus reinforcements arrive in async rounds', () => {
        assert.ok(arrived(),
          `no arrivals after ${waits} player turns; pending=${JSON.stringify(Game._pendingPack && Game._pendingPack.count)}`);
      });
      // Exhaust the chorus, kill everything, the hold must release -> 'won'.
      Game._pendingPack = null;
      for (const m of Game.tbfight.fighters) {
        if ((m.kind === 'monster') && m.alive) Game.tbDamage(m.key, 99999, 'test');
      }
      const fEnd = Game.tbfight;
      const ended = Game.tbEndCheck();
      check('A3 fight resolves won once chorus spent and field clear', () => {
        assert.strictEqual(ended, true);
        assert.strictEqual(fEnd.result, 'won'); // tbEnd nulls tbfight; read from the captured ref
      });
    } finally { bp.restore(); }
  }

  // ---------- B: _pendingPack survives save/load ----------
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'belltoad', { moves: 3, mhp: 30 });
    const mdef = Game.data.monsters.find(m => m.id === 'belltoad');
    Game._pendingPack = { id: 'belltoad', count: 2, mdef };
    const mem = {};
    global.localStorage = {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; },
    };
    try {
      Game.save();
      const key = globalThis.Scattering.state.saveKey(Game.state);
      const raw = JSON.parse(mem[key]);
      check('B save persists _pendingPack', () => {
        const pp = raw.run.tbfight && raw.run.tbfight.pendingPack;
        assert.ok(pp, 'tbfight.pendingPack missing from save');
        assert.strictEqual(pp.id, 'belltoad');
        assert.strictEqual(pp.count, 2);
      });
      Game._pendingPack = null;
      Game.load(key);
      check('B load restores _pendingPack (mdef reattached)', () => {
        assert.ok(Game._pendingPack, '_pendingPack lost on load -> chorus save-scummed away');
        assert.strictEqual(Game._pendingPack.count, 2);
        assert.strictEqual(Game._pendingPack.mdef && Game._pendingPack.mdef.id, 'belltoad');
      });
      // The restored fight must still hold for the chorus.
      const mk2 = Game.tbfight.fighters.find(x => x.kind === 'monster').key;
      Game.tbDamage(mk2, 99999, 'test');
      const held = Game.tbEndCheck();
      check('B restored fight still honors the chorus hold', () => {
        assert.strictEqual(held, false);
        assert.strictEqual(Game.tbfight.over, false);
      });
    } finally { delete global.localStorage; }
  }

  // ---------- C: gravity well ends the turn ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'bulldozer', { moves: 0, mhp: 500 });
    const m = Game.tbFighter(mk); m.mx = 6; m.my = 4; // distance 2 <= 3
    Game.state.scholar.inventory.push({ itemId: 'gravity_well', name: 'Gravity Well', units: 1 });
    check('C has gravity well', () => assert.ok(Game.hasItem('gravity_well')));
    const r1 = Game.tbfight.round;
    const ok = Game.tbPlayerGravityWell();
    check('C well fires', () => assert.strictEqual(ok, true));
    check('C well holds the monster (ticks down as turns pass)', () => {
      const gh = Game.tbFighter(mk).gravityHeld;
      assert.ok(gh >= 1, `gravityHeld=${gh}, expected >= 1 (well applied, then a turn ticked it down)`);
    });
    check('C well advances the turn (no 0-move strand)', () => {
      assert.ok(Game.tbfight.round > r1, `round still ${Game.tbfight.round}: acted=${Game.tbFighter('p').acted}, moves=${Game.tbFighter('p').moveLeft} -> STRANDED`);
    });
  }

  // ---------- D: field_medicine phantom heal regression (r2 R4) ----------
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    Game.state.scholar.abilities = Game.state.scholar.abilities || [];
    Game.state.scholar.abilities.push('field_medicine');
    const p = Game.tbFighter('p');
    p.hp = 50; Game.state.scholar.health = 50;
    Game.state.scholar.kcal = 1000;
    Game.state.scholar.fieldMedDayPart = null;
    const before = Game.state.scholar.health;
    const kcalBefore = Game.state.scholar.kcal;
    Game.activateAbility('field_medicine'); // wrapper returns null by design; the effect is the proof
    check('D field medicine fires (kcal cost paid)', () => assert.strictEqual(Game.state.scholar.kcal, kcalBefore - 100));
    check('D mid-fight heal lands on the FIGHTER (not phantom)', () => {
      assert.strictEqual(Game.tbFighter('p').hp, before + 20, `p.hp=${Game.tbFighter('p').hp}, scholar.health=${Game.state.scholar.health} -> heal went to the wrong pool`);
    });
    check('D scholar pool synced from fighter', () => {
      assert.strictEqual(Game.state.scholar.health, Game.tbFighter('p').hp);
    });
  }

  console.log(`\n${pass} passed, ${fail} failed (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
