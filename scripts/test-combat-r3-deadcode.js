#!/usr/bin/env node
// BREAK-IT round 3: dead-code sweep for the combat system.
//   D1. The old combat-break harness evaluated an INCOMPLETE module list —
//       index.html loads convo-scene.js, contestEngine.js, fieldFights.js and
//       villager-objectives.js, all absent from scripts/combat-break-harness.js.
//       Every proof since round 1 ran without them. This asserts the r3
//       harness FILES match index.html's script order exactly (minus DOM-only).
//   D2. Combat namespaces actually exist after eval (no dead module).
//   D3. The async turn path is wired: tbAfterPlayerAction references
//       tbAdvanceAsync (it was effectively dead code — a no-op entry).
//   D4. Legacy combat-flagged abilities (combat:true) are reachable in a
//       fight via activatableAbilities().
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}

(async () => {
  console.log('seed', H.SEED);
  const html = fs.readFileSync(path.join(H.ROOT, 'index.html'), 'utf8');
  const inHtml = [...html.matchAll(/src\/js\/[^"]*\.js/g)].map(m => m[0]);
  const DOM_ONLY = new Set([
    'src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js',
    'src/js/move-anim.js', 'src/js/drama.js',
  ]);
  const expected = inHtml.filter(f => !DOM_ONLY.has(f));

  check('D1 harness FILES == index.html order (minus DOM-only)', () => {
    assert.deepStrictEqual(H.FILES, expected,
      'mismatch: html=[' + expected.filter(f => !H.FILES.includes(f)).join(',') +
      '] harness-extra=[' + H.FILES.filter(f => !expected.includes(f)).join(',') + ']');
  });
  check('D1 no script in index.html is skipped by the harness', () => {
    const missing = expected.filter(f => !H.FILES.includes(f));
    assert.deepStrictEqual(missing, []);
  });

  const Game = await H.newCombatReadyGame();
  const SC = globalThis.Scattering;
  check('D2 Scattering.combat engine loaded', () => {
    assert.ok(SC.combat && typeof SC.combat.turnOrder === 'function' && typeof SC.combat.roll === 'function');
  });
  check('D2 abilityActions loaded (useAbility)', () => {
    assert.strictEqual(typeof Game.useAbility, 'function');
  });
  check('D2 monsterBehaviors loaded', () => {
    assert.strictEqual(typeof Game.mbRunPreTurn, 'function');
  });
  check('D2 statusEffects loaded', () => {
    assert.strictEqual(typeof Game.applyStatus, 'function');
  });
  check('D2 fieldFights loaded (villager-vs-monster real fights)', () => {
    assert.strictEqual(typeof Game.fieldFight, 'function');
  });
  check('D2 all 13 tbPlayer* verbs exist', () => {
    const verbs = ['tbPlayerStrike', 'tbPlayerWait', 'tbPlayerActed', 'tbPlayerEndTurn',
      'tbPlayerStudy', 'tbPlayerScream', 'tbPlayerShout', 'tbPlayerGravityWell',
      'tbPlayerOfferFood', 'tbPlayerTalk', 'tbBeginTurn', 'tbAdvance', 'tbAdvanceAsync'];
    for (const v of verbs) assert.strictEqual(typeof Game[v], 'function', v);
  });

  check('D3 tbAfterPlayerAction routes to tbAdvanceAsync (wired, not dead)', () => {
    // NOTE: alienPlayers.js wraps G.tbAfterPlayerAction twice (chatter, beam),
    // so fn.toString() shows the wrapper — check the game.js source instead.
    const gsrc = fs.readFileSync(path.join(H.ROOT, 'src/js/game.js'), 'utf8');
    const m = gsrc.match(/tbAfterPlayerAction\(\) \{[\s\S]*?\n    \},/);
    assert.ok(m && m[0].includes('tbAdvanceAsync'), 'no tbAdvanceAsync call site in tbAfterPlayerAction');
  });
  check('D3 tbAdvanceAsync actually advances (no isPlayerTurn no-op)', () => {
    const src = Game.tbAdvanceAsync.toString();
    assert.ok(!src.includes('tbIsPlayerTurn'), 'still no-ops on player turn');
    assert.ok(src.includes('tbAdvanceOneAsync'), 'never starts the chain');
  });
  check('D3 tbAdvanceOneAsync runs tbBeginTurn + tbRoundWrap', () => {
    const src = Game.tbAdvanceOneAsync.toString();
    assert.ok(src.includes('tbBeginTurn'), 'player arrival never resets the turn');
    assert.ok(src.includes('tbRoundWrap'), 'round wrap (chorus/order) missing in async');
  });

  // D4: legacy combat:true abilities visible mid-fight.
  {
    H.synthFight(Game, 'bulldozer', { moves: 3, mhp: 500 });
    Game.state.scholar.abilities = ['field_medicine', 'echo_location', 'blood_magic'];
    const acts = Game.activatableAbilities().filter(a => a.combat);
    const ids = acts.map(a => a.id);
    check('D4 field_medicine + echo_location listed mid-fight', () => {
      assert.ok(ids.includes('field_medicine'), ids.join(','));
      assert.ok(ids.includes('echo_location'), ids.join(','));
    });
    check('D4 blood_magic NOT listed mid-fight (no combat flag)', () => {
      assert.ok(!ids.includes('blood_magic'), ids.join(','));
    });
  }

  console.log(`\n${pass} passed, ${fail} failed (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
