#!/usr/bin/env node
// BREAK-IT monsters-4 follow-up (2026-10-08): proof tests for the three
// counter-honesty fixes proposed by the sibling sweep (worktree
// break-monsters4b, 52/52) and applied here.
//
// FIX 1 — belltoad "SHOUT breaks the chorus for a round": the tbRoundWrap
//   comment always promised it, but tbPlayerShout never set any state the
//   wrap read — the pending pack arrived regardless. Now a bellow in round N
//   sets f.chorusBrokenUntil = N+1 and the round-N+1 wrap skips arrivals.
// FIX 2 — union rep "without the rep the picket line dissolves": the
//   solidarity aura dropped silently on rep death and the per-ally
//   urDmgBonus/urBuffed fields were write-only dead code (never read by any
//   damage path). Now the dead fields are purged and rep death scatters the
//   summoned picketers (m_ur_* keys) with honest narration.
// FIX 3 — hushwolf "fire (they remember being dogs)": the fire counter only
//   exists in investigateQuietWoods (out of combat); in-combat fire does
//   nothing (fear:'numbers'). Copy now scopes the promise to the surface
//   where it's true.
// Proof: scripts/test-break-monsters4-counters-fix-20261008.js (SEED=N).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}
function playerTurn(Game) {
  const p = Game.tbFighter('p');
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  p.moveLeft = 6; p.acted = false;
}
function says(Game) { return (Game._sayLog || []).join('\n'); }

(async () => {
  console.log('seed', H.SEED);
  const realRandom = Math.random;

  // ---------- FIX 1: shout breaks the chorus for a round ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'belltoad', { mhp: 30, php: 500 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game._sayLog = [];
    const origSay = Game.say.bind(Game);
    Game.say = (s) => { Game._sayLog.push(String(s)); return origSay(s); };

    // CONTROL: no shout — pending pack arrives at the round-2 wrap.
    Game._pendingPack = { id: 'belltoad', count: 2, mdef: t.mdef };
    Game.tbfight.round = 2;
    const fightersBefore = Game.tbfight.fighters.length;
    Math.random = () => 0.0; // force the 40% arrival roll to hit
    try { Game.tbRoundWrap(Game.tbfight); } finally { Math.random = realRandom; }
    check('F1 control: without a shout the pending pack still arrives', () =>
      assert.ok(Game.tbfight.fighters.length > fightersBefore, 'no arrival — control broken'));

    // SHOUT: bellow in round 1, wrap at round 2 skips arrivals.
    const Game2 = await H.newCombatReadyGame();
    const mk2 = H.synthFight(Game2, 'belltoad', { mhp: 30, php: 500 });
    const t2 = Game2.tbFighter(mk2); const p2 = Game2.tbFighter('p');
    p2.mx = 4; p2.my = 4; t2.mx = 6; t2.my = 4;
    Game2._sayLog = [];
    const origSay2 = Game2.say.bind(Game2);
    Game2.say = (s) => { Game2._sayLog.push(String(s)); return origSay2(s); };
    Game2._pendingPack = { id: 'belltoad', count: 2, mdef: t2.mdef };
    Game2.tbfight.round = 1;
    playerTurn(Game2);
    p2.moveLeft = 0; // shout spends the action; no moves left -> turn advances cleanly
    Game2.tbPlayerShout();
    check('F1 shout sets chorusBrokenUntil', () =>
      assert.strictEqual(Game2.tbfight.chorusBrokenUntil, 2));
    Game2.tbfight.round = 2;
    const fb2 = Game2.tbfight.fighters.length;
    Math.random = () => 0.0; // arrival roll would hit — must be suppressed
    try { Game2.tbRoundWrap(Game2.tbfight); } finally { Math.random = realRandom; }
    check('F1 shouted round: no arrivals despite a hitting roll', () =>
      assert.strictEqual(Game2.tbfight.fighters.length, fb2, 'pack arrived through the broken chorus'));
    check('F1 pending pack survives (breaks for a round, not forever)', () =>
      assert.ok(Game2._pendingPack && Game2._pendingPack.count === 2, 'pack was consumed, not suppressed'));
    check('F1 the break is narrated, not silent', () =>
      assert.ok(says(Game2).includes('chorus is broken'), 'no narration'));
    // Round 3: the break expires, arrivals resume.
    Game2.tbfight.round = 3;
    Math.random = () => 0.0;
    try { Game2.tbRoundWrap(Game2.tbfight); } finally { Math.random = realRandom; }
    check('F1 break expires after one round — chorus resumes', () =>
      assert.ok(Game2.tbfight.fighters.length > fb2, 'chorus never resumed'));
    Game2.say = origSay2;
  }

  // ---------- FIX 2: rep death dissolves the picket line ----------
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'union_rep', { mhp: 100, php: 500 });
    const rep = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; rep.mx = 6; rep.my = 4;
    // A summoned picketer (m_ur_* key, as the summon code issues) plus a
    // pre-existing ally (not summoned — was already in the fight).
    const picket = { key: 'm_ur_4242', kind: 'monster', monsterId: 'hushwolf', name: 'Hushwolf (picket)',
      hp: 20, maxHp: 20, mx: 5, my: 5, alive: true, fled: false, telegraph: null, mdef: { id: 'hushwolf' } };
    const bystander = { key: 'm_old', kind: 'monster', monsterId: 'belltoad', name: 'Belltoad',
      hp: 20, maxHp: 20, mx: 3, my: 3, alive: true, fled: false, telegraph: null, mdef: { id: 'belltoad' } };
    Game.tbfight.fighters.push(picket, bystander);
    Game._sayLog = [];
    const origSay = Game.say.bind(Game);
    Game.say = (s) => { Game._sayLog.push(String(s)); return origSay(s); };
    playerTurn(Game);
    Game.tbDamage(mk, 99999, 'test', 'p'); // kill the rep
    check('F2 rep dies', () => assert.ok(!rep.alive));
    check('F2 summoned picketer scatters (fled)', () => assert.ok(picket.fled === true, 'picketer still fighting'));
    check('F2 pre-existing ally stays (only the line dissolves)', () => assert.ok(bystander.fled !== true));
    check('F2 the dissolve is narrated', () =>
      assert.ok(says(Game).includes('picket line dissolves'), 'silent dissolve'));
    Game.say = origSay;

    // Dead fields purged from live code (comments may still mention the purge).
    const gsrc = fs.readFileSync(path.join(H.ROOT, 'src/js/game.js'), 'utf8')
      .replace(/\/\/[^\n]*/g, ''); // strip line comments
    check('F2 urDmgBonus write-only field purged from live code', () =>
      assert.ok(!gsrc.includes('urDmgBonus'), 'urDmgBonus still referenced in code'));
    check('F2 urBuffed write-only field purged from live code', () =>
      assert.ok(!gsrc.includes('urBuffed'), 'urBuffed still referenced in code'));
  }

  // ---------- FIX 3: hushwolf fire copy scoped to the true surface ----------
  {
    const ms = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/monsters.json'), 'utf8'));
    const wolf = ms.find(m => m.id === 'hushwolf');
    check('F3 weakness no longer promises in-combat fire', () =>
      assert.ok(wolf.weaknesses[0].includes('quiet woods'),
        `weakness still unscoped: ${wolf.weaknesses[0]}`));
    check('F3 the dogs-memory flavor kept', () =>
      assert.ok(wolf.weaknesses[0].includes('remember being dogs')));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
