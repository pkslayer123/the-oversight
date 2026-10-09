#!/usr/bin/env node
// BREAK-IT round 3: combat-bar honesty.
// Every combat verb must spend what it claims. Checks:
//   H1. study/shout/wait/strike/scream spend the act on success.
//   H2. Strike range honesty: the button's promised range matches the engine;
//       an out-of-range strike is refused WITHOUT spending the act.
//   H3. doAction('rest') mid-fight is refused (fiction + phantom-heal guard).
//   H4. No combat data-action is FREE: every combat-context ability action
//       either spends the turn, fails fast unwired (nothing spent), or
//       refuses for a stated reason — never fires without costing the act.
const assert = require('assert');
const H = require('./combat-r3-harness.js');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}
function lastSay(Game, n) {
  const log = Game.log || [];
  return log.slice(-(n || 3)).join(' | ');
}

(async () => {
  console.log('seed', H.SEED);

  // ---------- H1: verbs spend the act ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    Game.tbFighter(mk).mx = 5; Game.tbFighter(mk).my = 4;
    check('H1 study spends the act', () => {
      assert.strictEqual(Game.tbPlayerStudy(), true);
      assert.strictEqual(Game.tbFighter('p').acted, true);
    });
  }
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    check('H1 shout spends the act', () => {
      assert.strictEqual(Game.tbPlayerShout(), true);
      assert.strictEqual(Game.tbFighter('p').acted, true);
    });
    check('H1 shout 2/fight enforced', () => {
      const p = Game.tbFighter('p'); p.acted = false;
      Game.tbPlayerShout();
      p.acted = false;
      const r = Game.tbPlayerShout();
      assert.strictEqual(r, false);
      assert.ok(/raw/.test(lastSay(Game, 2)), 'expected "throat is raw", got: ' + lastSay(Game, 2));
    });
  }
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    Game.tbFighter(mk).mx = 5; Game.tbFighter(mk).my = 4;
    check('H1 strike spends the act', () => {
      assert.strictEqual(Game.tbPlayerStrike(mk), true);
      assert.strictEqual(Game.tbFighter('p').acted, true);
    });
  }
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'bulldozer', { moves: 0, mhp: 500 });
    const r0 = Game.tbfight.round;
    check('H1 wait ends the turn', () => {
      assert.strictEqual(Game.tbPlayerWait(), true);
      // 0 moves + acted -> the turn must advance (round wraps, AI acts).
      assert.ok(Game.tbfight.round > r0, `round stuck at ${r0}: the wait stranded the turn`);
      const p = Game.tbFighter('p');
      assert.ok(p.moveLeft > 0 && !p.acted, 'new turn did not reset');
    });
  }
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    Game.state.scholar.abilities = ['scream_cheese'];
    check('H1 scream spends the act', () => {
      assert.strictEqual(Game.tbPlayerScream(), true);
      assert.strictEqual(Game.tbFighter('p').acted, true);
    });
  }

  // ---------- H2: strike range honesty ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    const m = Game.tbFighter(mk);
    const w = Game.equippedWeapon();
    m.mx = 4; m.my = 4 + w.range + 1; // just out of the button's promised range
    const p = Game.tbFighter('p');
    const r = Game.tbPlayerStrike(mk);
    check('H2 out-of-range strike refused', () => assert.strictEqual(r, false));
    check('H2 refused strike spends NOTHING (no silent act-eat)', () => {
      assert.strictEqual(p.acted, false);
      assert.ok(/reach/.test(lastSay(Game, 2)), 'expected a "reach" message, got: ' + lastSay(Game, 2));
    });
  }

  // ---------- H3: rest refused mid-fight ----------
  {
    const Game = await H.newCombatReadyGame();
    H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    const p = Game.tbFighter('p');
    p.hp = 40; Game.state.scholar.health = 40;
    Game.state.scholar.kcal = 5000;
    const r = Game.doAction('rest');
    check('H3 rest refused mid-fight', () => assert.strictEqual(r, false));
    check('H3 no phantom heal from refused rest', () => {
      assert.strictEqual(Game.state.scholar.health, 40);
      assert.strictEqual(Game.tbFighter('p').hp, 40);
      assert.ok(/middle of a fight/.test(lastSay(Game, 2)), 'got: ' + lastSay(Game, 2));
    });
  }

  // ---------- H4: no FREE combat ability actions ----------
  {
    const data = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/abilities.json'), 'utf8'));
    const combatActs = [];
    for (const a of data) for (const ac of (a.actions || [])) {
      if ((ac.context || 'explore') === 'combat') combatActs.push([a.id, ac.id]);
    }
    console.log('  (combat data actions:', combatActs.length + ')');
    let free = [];
    for (const [abId, actId] of combatActs) {
      const Game = await H.newCombatReadyGame();
      const mk = H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
      Game.tbFighter(mk).mx = 5; Game.tbFighter(mk).my = 4;
      Game.state.scholar.abilities = [abId];
      Game.state.scholar.kcal = 9000;
      Game.state.scholar.health = 100; Game.tbFighter('p').hp = 100;
      const p = Game.tbFighter('p');
      const round0 = Game.tbfight ? Game.tbfight.round : 0;
      let ret;
      try { ret = Game.useAbility(abId, actId); } catch (e) { ret = 'threw:' + e.message.split('\n')[0]; }
      const said = lastSay(Game, 4);
      // SPENT = acted, or the action ended the whole turn (round advanced —
      // e.g. dead_aim plants the feet: moveLeft 0 + acted auto-advances per
      // the no-end-turn-ceremony design. Break-it combat r6 2026-10-09.)
      const spent = p.acted || (Game.tbfight && Game.tbfight.round > round0);
      if (ret === true && !spent) free.push(abId + '.' + actId);
      // Fail-fast unwired must not spend either (round-1 invariant).
      if (ret === false && /isn't wired up yet/.test(said) && p.acted) free.push(abId + '.' + actId + ' (failfast spent!)');
    }
    check('H4 no combat ability action fires free (all spend, fail fast, or refuse stated)', () => {
      assert.deepStrictEqual(free, [], 'FREE actions: ' + free.join(', '));
    });
  }

  // ---------- H5: precheck refusals never spend (r1-E4 class) ----------
  async function freshFightWith(abId) {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    Game.tbFighter(mk).mx = 5; Game.tbFighter(mk).my = 4;
    Game.state.scholar.abilities = [abId];
    Game.state.scholar.kcal = 9000;
    Game.state.scholar.health = 100; Game.tbFighter('p').hp = 100;
    return { Game, mk };
  }
  {
    // shake_off: first use spends (turn + 50 kcal), second refuses pre-payment.
    const { Game } = await freshFightWith('unbreakable');
    const kcal0 = Game.state.scholar.kcal;
    check('H5 shake_off first use spends turn + kcal', () => {
      assert.strictEqual(Game.useAbility('unbreakable', 'shake_off'), true);
      assert.strictEqual(Game.tbFighter('p').acted, true);
      assert.strictEqual(Game.state.scholar.kcal, kcal0 - 50);
    });
    // New turn, same fight: the button must refuse, spending nothing.
    Game.tbBeginTurn();
    const p = Game.tbFighter('p');
    const kcal1 = Game.state.scholar.kcal;
    const r = Game.useAbility('unbreakable', 'shake_off');
    check('H5 shake_off second use refused pre-payment', () => {
      assert.strictEqual(r, false);
      assert.strictEqual(p.acted, false, 'refused tap ate the turn');
      assert.strictEqual(Game.state.scholar.kcal, kcal1, 'refused tap ate kcal');
      assert.ok(/Already shaken off/.test(lastSay(Game, 2)), 'got: ' + lastSay(Game, 2));
    });
    check('H5 shake_off refused in availability gate (button disabled)', () => {
      const avail = Game._actionAvailable('unbreakable', { id: 'shake_off', cost: { turn: true, kcal: 50 } });
      assert.strictEqual(avail.ok, false);
    });
  }
  {
    // read_stance: second read same fight refuses pre-payment.
    const { Game } = await freshFightWith('game_sense');
    Game.tbfight.id = 'f_test123';
    check('H5 read_stance first use spends', () => {
      assert.strictEqual(Game.useAbility('game_sense', 'read_stance'), true);
      assert.strictEqual(Game.tbFighter('p').acted, true);
    });
    Game.tbBeginTurn();
    const p = Game.tbFighter('p');
    const r = Game.useAbility('game_sense', 'read_stance');
    check('H5 read_stance second use refused pre-payment', () => {
      assert.strictEqual(r, false);
      assert.strictEqual(p.acted, false, 'refused tap ate the turn');
    });
  }
  {
    // settle_debt with no damage taken: refuses pre-payment (was: paid, then refused).
    const { Game } = await freshFightWith('trade_of_blows');
    const p = Game.tbFighter('p');
    const kcal0 = Game.state.scholar.kcal;
    const r = Game.useAbility('trade_of_blows', 'settle_debt');
    check('H5 settle_debt with no damage refuses pre-payment', () => {
      assert.strictEqual(r, false);
      assert.strictEqual(p.acted, false, 'refused tap ate the turn');
      assert.strictEqual(Game.state.scholar.kcal, kcal0, 'refused tap ate kcal');
    });
  }
  {
    // calm_beast with no target: refuses pre-payment (was: paid turn, then "Nothing here to calm").
    const { Game } = await freshFightWith('animal_ken');
    const p = Game.tbFighter('p');
    const r = Game.useAbility('animal_ken', 'calm_beast');
    check('H5 calm_beast targetless refuses pre-payment', () => {
      assert.strictEqual(r, false);
      assert.strictEqual(p.acted, false, 'refused tap ate the turn');
      assert.ok(/Nothing here to calm/.test(lastSay(Game, 2)), 'got: ' + lastSay(Game, 2));
    });
  }

  console.log(`\n${pass} passed, ${fail} failed (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
