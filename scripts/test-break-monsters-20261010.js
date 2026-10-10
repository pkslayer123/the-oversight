#!/usr/bin/env node
// BREAK-IT monsters r6 (2026-10-10): fresh adversarial pass — exploits,
// softlocks, honesty, dead code on the monsters system.
//
// CATCH 1 (EXPLOIT, wave-gate manipulation): tbEnd('won') recorded wave kills
//   per dead FIGHTER, but snake segments are one creature — the reward loop
//   right below de-dupes them by snakeId for carcasses/loot/codex 'slain'.
//   Killing the duck's 14 segments minted 14 "kills": a single snake cleared
//   the 4-kill wave-2 minimum alone. FIX: one body = one kill (same body key
//   as the reward de-dup). Pack monsters are separate creatures and still
//   count individually.
// CATCH 2 (DEAD CODE + double-fire): the hook migration (monsterBehaviors.js,
//   Steve 2026-10-07) moved antlerThrash/turtleBunker/humSwarmCheck/
//   droneCrowdOverload into data-driven preTurnHooks, but only the highbeam's
//   inline branch was removed. The hummice inline branch was still live and
//   DOUBLE-FIRED tbHumSwarmCheck every turn (the hook returns false, so it
//   doesn't consume the turn — then the inline ran it again). The turtle and
//   drone inlines were unreachable (their hooks consume first under identical
//   conditions). FIX: remove all three inline branches per the migration
//   pattern ("remove the inline branch" — the highbeam precedent).
// §C (HONESTY, held): windup honesty — every monster's declared windup in
//   monsters.json must match what the engine actually waits before the hit
//   lands. Verified: declare sets turnsLeft = pat.windup for direct/beam,
//   bespoke declares (bright_idea "Two beats", mirror_stag 2, moderator
//   shadowban "falls next round" = 2) match their cues, and the generic
//   countdown resolves after exactly windup monster turns with no early
//   damage.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', String(e.message).split('\n')[0]); }
};

function baseFighter(key, kind, extra) {
  return Object.assign({
    key, kind, name: key, emoji: '👹', hp: 30, maxHp: 30, speed: 3,
    mx: 6, my: 4, alive: true, fled: false, telegraph: null,
    hesitate: 0, blind: 0, stunned: 0, threatQueue: [],
  }, extra || {});
}
function playerFighter() {
  return { key: 'p', kind: 'player', name: 'You', emoji: '🧑', hp: 100, maxHp: 100,
    speed: 6, mx: 4, my: 4, alive: true, fled: false, moveLeft: 3, acted: false };
}

(async () => {
  console.log('seed', H.SEED);
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'game.js'), 'utf8');

  // ============ §A — SNAKE WAVE-KILL INFLATION ============
  console.log('§A snake wave-kill inflation');
  {
    const Game = await H.newCombatReadyGame();
    const mdef = Game.data.monsters.find(m => m.id === 'ducks_in_a_row');
    assert.ok(mdef && mdef.snake, 'ducks_in_a_row must be a snake');
    const fighters = [playerFighter()];
    const NSEG = mdef.snake.segments || 6;
    for (let i = 0; i < NSEG; i++) {
      fighters.push(baseFighter('m_duck_' + i, 'monster', {
        monsterId: 'ducks_in_a_row', mdef, name: 'duck (' + (i + 1) + ')',
        hp: 0, alive: false, snakeId: 'snake_test', segmentIndex: i, isHead: i === 0,
        mx: 0, my: i % 9,
      }));
    }
    Game.tbfight = { id: 'fsnake', fighters, over: false, result: null,
      round: 3, order: fighters.map(f => f.key), turnIdx: 0, style: 0 };
    Game.state.waveKills = {};
    Game.tbEnd('won');
    const got = Game.state.waveKills[1] || 0;
    check(`one ${NSEG}-segment snake = 1 wave kill (got ${got})`, () => {
      assert.strictEqual(got, 1, `wave-gate inflation: ${NSEG} segments minted ${got} kills`);
    });
    check('wave 2 NOT unlocked by a single snake at day 8', () => {
      Game.state.scholar.day = 8;
      assert.strictEqual(Game.unlockedWave(), 1, 'single snake must not clear the 4-kill gate');
    });
  }

  // ============ §B — HOOK MIGRATION DEAD CODE ============
  console.log('§B hook-migration dead code');
  {
    const Game = await H.newCombatReadyGame();
    const mdef = Game.data.monsters.find(m => m.id === 'hummice');
    const m1 = baseFighter('m_hum1', 'monster', { monsterId: 'hummice', mdef, name: 'hum a', mx: 5, my: 4 });
    const m2 = baseFighter('m_hum2', 'monster', { monsterId: 'hummice', mdef, name: 'hum b', mx: 6, my: 5 });
    Game.tbfight = { id: 'fhum', fighters: [playerFighter(), m1, m2],
      over: false, round: 1, order: ['p', 'm_hum1', 'm_hum2'], turnIdx: 1 };
    let calls = 0;
    const orig = Game.tbHumSwarmCheck.bind(Game);
    Game.tbHumSwarmCheck = function (m) { calls++; return orig(m); };
    Game.tbMonsterTurn(m1);
    check(`tbHumSwarmCheck runs exactly once per hummice turn (ran ${calls}x)`, () => {
      assert.strictEqual(calls, 1, 'double-fire: hook + leftover inline branch both ran');
    });
    Game.tbHumSwarmCheck = orig;
  }
  {
    // all four migrated hooks registered + dispatched; no inline branches left
    const hooks = globalThis.MonsterBehaviorHooks;
    check('all 4 migrated hooks registered in monsterBehaviors.js', () => {
      for (const h of ['antlerThrash', 'turtleBunker', 'humSwarmCheck', 'droneCrowdOverload'])
        assert.strictEqual(typeof hooks[h], 'function', 'missing hook ' + h);
    });
    const beh = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'src', 'data', 'monsterBehaviors.json'), 'utf8')).behaviors;
    check('JSON wires hooks to gallowdeer/hummice/review_drone/speedbump_turtle', () => {
      assert.deepStrictEqual(beh.gallowdeer.preTurnHooks, ['antlerThrash']);
      assert.deepStrictEqual(beh.hummice.preTurnHooks, ['humSwarmCheck']);
      assert.deepStrictEqual(beh.review_drone.preTurnHooks, ['droneCrowdOverload']);
      assert.deepStrictEqual(beh.speedbump_turtle.preTurnHooks, ['turtleBunker']);
    });
    check('no inline bunker/humice/crowd-overload branches left in tbMonsterTurn', () => {
      const body = SRC.slice(SRC.indexOf('tbMonsterTurn(m) {'), SRC.indexOf('tbMonsterTurn(m) {') + 120000);
      assert.ok(!/if \(this\.turtleIs\(m\) && \(m\.turtleBunker/.test(body), 'turtle inline branch still present');
      assert.ok(!/if \(this\.humiceIs\(m\)\) this\.tbHumSwarmCheck/.test(body), 'hummice inline branch still present');
      assert.ok(!/if \(useFifo && this\.droneIs\(m\)\)/.test(body), 'drone inline branch still present');
    });
  }
  {
    // behavioral parity: turtle bunker still counts down + unseals via the hook
    const Game = await H.newCombatReadyGame();
    const mdef = Game.data.monsters.find(m => m.id === 'speedbump_turtle');
    const t = baseFighter('m_turtle', 'monster', { monsterId: 'speedbump_turtle', mdef,
      name: 'boulder', hp: 20, maxHp: 50, turtleBunker: 2, mx: 5, my: 4 });
    Game.tbfight = { id: 'fturtle', fighters: [playerFighter(), t],
      over: false, round: 1, order: ['p', 'm_turtle'], turnIdx: 1 };
    const said = [];
    const origSay = Game.say.bind(Game);
    Game.say = (x) => { said.push(String(x)); };
    Game.tbMonsterTurn(t);
    check('hook consumes bunker turn 1 (bunker 2→1, no attack declared)', () => {
      assert.strictEqual(t.turtleBunker, 1, 'bunker did not count down via hook');
      assert.strictEqual(t.telegraph, null, 'hook should consume the turn, not attack');
    });
    Game.tbMonsterTurn(t);
    check('hook unseals on turn 2 with the honest narration', () => {
      assert.strictEqual(t.turtleBunker, 0, 'bunker did not expire');
      assert.ok(said.some(x => /unseals with a soft pop/.test(x)), 'unseal narration missing: ' + said.join(' | ').slice(0, 200));
    });
    Game.say = origSay;
  }
  {
    // behavioral parity: drone crowd overload still recalc-consumes via the hook
    const Game = await H.newCombatReadyGame();
    const mdef = Game.data.monsters.find(m => m.id === 'review_drone');
    const p = playerFighter();
    const v1 = baseFighter('v1', 'villager', { name: 'Mara', hp: 40, maxHp: 40, mx: 3, my: 3 });
    const v2 = baseFighter('v2', 'villager', { name: 'Joren', hp: 40, maxHp: 40, mx: 5, my: 5 });
    const d = baseFighter('m_drone', 'monster', { monsterId: 'review_drone', mdef,
      name: 'drone', mx: 6, my: 4, threatQueue: ['p', 'v1', 'v2'] });
    Game.tbfight = { id: 'fdrone', fighters: [p, v1, v2, d],
      over: false, round: 1, order: ['p', 'v1', 'v2', 'm_drone'], turnIdx: 3 };
    Game.tbMonsterTurn(d);
    check('drone crowd overload recalcs via hook (turn consumed, phase recalc)', () => {
      assert.strictEqual(d.drRecalcs, 1, 'drone did not recalc');
      assert.strictEqual(d.beamPhase, 'recalc', 'drone phase not recalc, got ' + d.beamPhase);
      assert.strictEqual(d.telegraph, null, 'recalc should clear telegraph, not declare');
    });
  }

  // ============ §C — WINDUP HONESTY ============
  console.log('§C windup honesty');
  {
    const Game = await H.newCombatReadyGame();
    const cases = [
      // [monsterId, declareFn, expectedTurnsLeft]
      ['review_drone', 'encDeclareBeam', 3],
      ['memory_projector', 'encDeclareBeam', 2],
      ['gallowdeer', 'encDeclareBeam', 1],
      ['landlord', 'encDeclareDirect', 2],
      ['heckler', 'encDeclareDirect', 2],
      ['understudy', 'encDeclareDirect', 2],
      ['union_rep', 'encDeclareDirect', 2],
      ['lockpick_raccoon', 'encDeclareDirect', 1], // no windup in JSON → honest default 1
    ];
    for (const [mid, fn, windup] of cases) {
      const mdef = Game.data.monsters.find(m => m.id === mid);
      const jsonWindup = ((mdef.attack || {}).pattern || {}).windup || 1;
      check(`${mid}: JSON windup ${jsonWindup} → declare sets turnsLeft ${windup}`, () => {
        assert.strictEqual(jsonWindup, windup, 'test expectation wrong vs JSON');
        const m = baseFighter('m_' + mid, 'monster', { monsterId: mid, mdef, mx: 6, my: 4 });
        const p = playerFighter();
        Game.tbfight = { id: 'fwind', fighters: [p, m], over: false, round: 1, order: ['p', 'm_' + mid], turnIdx: 1 };
        if (fn === 'encDeclareBeam') Game.encDeclareBeam(m, { f: p }, 'test');
        else Game.encDeclareDirect(m, p, 'test');
        assert.ok(m.telegraph, 'declare did not set a telegraph');
        assert.strictEqual(m.telegraph.turnsLeft, windup,
          `declare set turnsLeft=${m.telegraph.turnsLeft}, JSON windup=${windup}`);
      });
    }
  }
  {
    // countdown fidelity: the hit lands after exactly `windup` monster turns, never early
    const Game = await H.newCombatReadyGame();
    const mdef = Game.data.monsters.find(m => m.id === 'heckler');
    const windup = (mdef.attack.pattern || {}).windup || 1;
    const p = playerFighter();
    const m = baseFighter('m_heck', 'monster', { monsterId: 'heckler', mdef, mx: 6, my: 4 });
    Game.tbfight = { id: 'fcd', fighters: [p, m], over: false, round: 1, order: ['p', 'm_heck'], turnIdx: 1 };
    Game.encDeclareDirect(m, p, 'test');
    const hpBefore = p.hp;
    let hitTurn = -1;
    for (let turn = 1; turn <= windup + 2; turn++) {
      Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
      Game.tbMonsterTurn(m);
      if (p.hp < hpBefore && hitTurn < 0) hitTurn = turn;
    }
    check(`heckler (windup ${windup}): no damage during windup, hit lands on turn ${windup} (hit on ${hitTurn})`, () => {
      assert.strictEqual(hitTurn, windup, `damage landed on monster turn ${hitTurn}, expected ${windup}`);
    });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
