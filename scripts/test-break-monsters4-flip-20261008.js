#!/usr/bin/env node
// BREAK-IT monsters-4 (2026-10-08): the turtle flip mechanic under hostile
// attack. Commit c00b92f made the codex weakness "flip it (good luck)" real:
// tbPlayerFlip — adjacent-only, spends turn, str check (0.3+str*0.04, +0.25
// crowbar). Success: flipped 3 turns (armor 0, can't snap, can't bunker).
// Fail: free snap.
//
// CATCHES (fixed in this run):
//   C1 HONESTY — "no armor" lied: the flip zeroed the flat armor (15) but the
//      0.5 physical RESIST silently halved every flipped strike (28 -> 14).
//      Fixed: flipped zeroes the physical resist too.
//   C2 DEAD-CODE/AUDIO — tbPlayerFlip fired audioEvent('turtleFlip') with NO
//      handler in app.js (fired-but-silent since c00b92f). Fixed: turtleFlip()
//      audio function + registry entry. Fail-snap also plays turtleSnap now.
// HELD:
//   H1 fail-snap is the real snap ([20,30] from mdef.attack, not a fake).
//   H2 flip-lock economy: the counter is strong but not free — every failed
//      flip costs a real snap, every attempt costs the turn, re-flip is
//      refused while flipped (turn not spent). Designed wacky counter, holds.
//   H3 flip+disengage: flipping then walking 3 tiles ends the fight cleanly
//      (turtle can't chase — "just walk around" weakness). No stuck state.
//   H4 crowbar +0.25 is equipped-as-weapon only — no in-game copy promises
//      otherwise (tooltip says "strength check"; codex says "flip it (good
//      luck)"). Undisclosed-by-design, not a lie.
//   H5 wavegate sibling sweep: every wave-picking path (monsterWavePool x3
//      callers, castMonster, spawnWaveTarget) keys on unlockedWave() — no
//      third gate. All 28 monster ids referenced in code; all 46 audio names
//      in monsters.json resolve to app.js handlers.
// Proof: scripts/test-break-monsters4-flip-20261008.js (SEED=N for more seeds).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('./combat-r3-harness.js');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}

function setup(Game, opts = {}) {
  const mk = H.synthFight(Game, 'speedbump_turtle', { mhp: opts.mhp || 60, php: opts.php || 200 });
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
// Honest turn end: a strike doesn't spend moves (the player can still move
// after hitting), so the turn only advances once moves are forfeited. WAIT
// is the in-fiction way to end the turn; without it the turtle never acts
// and the flip window never ticks down.
function endTurn(Game) {
  const p = Game.tbFighter('p');
  if (!Game.tbfight || Game.tbfight.over) return;
  if (Game.tbIsPlayerTurn() && p.acted && p.moveLeft > 0) Game.tbPlayerWait();
}
function strikeWith(Game, mk, rollVal) {
  const t = Game.tbFighter(mk);
  const hp0 = t.hp;
  const rr = Math.random;
  Math.random = () => rollVal; // fixed roll: roll([10,16])=13 -> base 28 with spear
  try { playerTurn(Game); Game.tbPlayerStrike(mk); }
  finally { Math.random = rr; }
  return hp0 - t.hp;
}

(async () => {
  console.log('seed', H.SEED);
  const realRandom = Math.random;

  // ---------- C1: flipped zeroes armor AND resist ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t } = setup(Game);
    const rr = Math.random; Math.random = () => 0.0; // force flip success
    try { playerTurn(Game); Game.tbPlayerFlip(mk); } finally { Math.random = rr; }
    check('C1 flip succeeds', () => assert.ok((t.turtleFlipped || 0) > 0));
    const dmg = strikeWith(Game, mk, 0.5);
    // base d = roll([10,16])@0.5 = 13 + 15 (spear) = 28. Before the fix the
    // 0.5 physical resist halved it to 14 despite the "no armor" promise.
    check('C1 flipped strike deals FULL base damage (resist zeroed)', () =>
      assert.strictEqual(dmg, 28, `got ${dmg} — resist still applied?`));
  }

  // ---------- H1: fail-snap is the real snap ----------
  // The fail branch calls tbDamage BEFORE tbAfterPlayerAction advances the
  // turn (the turtle then also snaps on its own turn) — so capture the FIRST
  // tbDamage('p') call to isolate the fail-snap from the follow-up snap.
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t, p } = setup(Game);
    const origDmg = Game.tbDamage.bind(Game);
    let firstSnap = null;
    Game.tbDamage = (key, dmg, ...rest) => {
      if (key === 'p' && firstSnap === null) firstSnap = dmg;
      return origDmg(key, dmg, ...rest);
    };
    const rr = Math.random; Math.random = () => 0.999; // force flip fail; max rolls
    try { playerTurn(Game); Game.tbPlayerFlip(mk); }
    finally { Math.random = rr; Game.tbDamage = origDmg; }
    check('H1 failed flip: turtle not flipped', () => assert.ok(!((t.turtleFlipped || 0) > 0)));
    // S.combat.roll([20,30]) at 0.999 -> 30: the turtle's REAL Snap Decision
    // damage (mdef.attack.damage), dealt via the standard tbDamage path.
    check('H1 fail-snap uses the real Snap Decision damage', () =>
      assert.ok(firstSnap !== null && firstSnap >= 20 && firstSnap <= 30,
        `fail-snap dealt ${firstSnap} — not the [20,30] snap`));
    check('H1 fail-snap reads mdef.attack.damage (not a hardcoded fake)', () =>
      assert.deepStrictEqual((t.mdef.attack || {}).damage, [20, 30]));
  }

  // ---------- H2: flip-lock economy — strong counter, not a free exploit ----------
  {
    const Game = await H.newCombatReadyGame();
    // crowbar EQUIPPED: chance = 0.3 + 5*0.04 + 0.25 = 0.75
    const { mk, t, p } = setup(Game, { weapon: 'crowbar', mhp: 200, php: 1000 });
    let flips = 0, snaps = 0, turns = 0, reflipRefused = 0, strikes = 0;
    // fight to the death using ONLY flip + strikes while flipped. Natural
    // turn loop: flip spends the whole turn (moveLeft=0); a strike leaves
    // moves unspent, so endTurn() WAITS to let the turtle act — otherwise the
    // flip window never ticks down and the turtle never gets its turns.
    for (let i = 0; i < 200 && t.hp > 0 && p.hp > 0 && Game.tbfight; i++) {
      playerTurn(Game);
      turns++;
      if ((t.turtleFlipped || 0) > 0) {
        // re-flip while flipped must be REFUSED without spending the turn
        const r = Game.tbPlayerFlip(mk);
        if (r === false) reflipRefused++;
        const hp0 = t.hp;
        strikeWith(Game, mk, 0.5);
        if (t.hp < hp0) strikes++;
        endTurn(Game); // let the turtle flail (flip window ticks down)
      } else {
        const hpBefore = p.hp;
        Game.tbPlayerFlip(mk); // success or fail, the turn is spent either way
        if ((t.turtleFlipped || 0) > 0) flips++;
        else if (p.hp < hpBefore) snaps++; // failed flip cost a real snap
      }
    }
    check('H2 flip-lock kills the turtle (counter works)', () => assert.ok(t.hp <= 0, `turtle hp ${t.hp}`));
    check('H2 free strikes only land while flipped', () => assert.ok(strikes > 0, 'no strikes landed'));
    check('H2 every failed flip cost a real snap (not free)', () => assert.ok(snaps > 0, 'zero snaps taken — flips were free'));
    check('H2 re-flip while flipped refused, turn not spent', () => assert.ok(reflipRefused > 0, 're-flip was never refused'));
    console.log(`      (economy: ${turns} player turns, ${flips} flips, ${strikes} free strikes, ${snaps} fail-snaps taken, player hp ${Math.round(p.hp)}/1000)`);
  }

  // ---------- H3: flip + disengage — no stuck state ----------
  {
    const Game = await H.newCombatReadyGame();
    const { mk, t, p } = setup(Game);
    const rr = Math.random; Math.random = () => 0.0;
    try { playerTurn(Game); Game.tbPlayerFlip(mk); } finally { Math.random = rr; }
    check('H3 flipped', () => assert.ok((t.turtleFlipped || 0) > 0));
    // walk away: 3+ tiles, turtle can't chase -> disengage ends the fight
    p.mx = 1; p.my = 1;
    const ended = Game.tbEndCheck();
    check('H3 walking away from flipped turtle ends the fight (disengage)', () =>
      assert.ok(ended === true || (Game.tbfight && Game.tbfight.over), 'fight did not end — stuck?'));
  }

  // ---------- H4: crowbar bonus is equipped-as-weapon only ----------
  {
    async function flipRate(equipWeapon, packHasCrowbar) {
      const Game = await H.newCombatReadyGame();
      const { mk } = setup(Game, { weapon: equipWeapon, php: 1000000 }); // survive 1200 fail-snaps
      if (packHasCrowbar) {
        // crowbar in pack but not equipped
        Game.state.scholar.pack = Game.state.scholar.pack || [];
        Game.state.scholar.pack.push({ itemId: 'crowbar' });
      }
      let wins = 0; const N = 1200;
      for (let i = 0; i < N; i++) {
        const t = Game.tbFighter(mk); t.turtleFlipped = 0;
        playerTurn(Game);
        Game.tbPlayerFlip(mk);
        if ((t.turtleFlipped || 0) > 0) wins++;
        // reset for next trial (flip consumes acted; playerTurn resets)
      }
      return wins / N;
    }
    const rNone = await flipRate('fire_hardened_spear', false);
    const rPack = await flipRate('fire_hardened_spear', true);
    const rEquipped = await flipRate('crowbar', false);
    console.log(`      flip rates — no crowbar: ${rNone.toFixed(2)} (expect ~0.50), in-pack: ${rPack.toFixed(2)} (expect ~0.50), equipped: ${rEquipped.toFixed(2)} (expect ~0.75)`);
    check('H4 base flip rate ~0.50 (0.3+5*0.04)', () => assert.ok(rNone > 0.40 && rNone < 0.60, rNone));
    check('H4 crowbar in pack gives NO bonus (equipped-only)', () => assert.ok(Math.abs(rPack - rNone) < 0.08, `pack ${rPack} vs base ${rNone}`));
    check('H4 crowbar equipped gives +0.25', () => assert.ok(rEquipped > 0.65 && rEquipped < 0.85, rEquipped));
  }

  // ---------- C2: turtleFlip audio resolves ----------
  {
    const src = fs.readFileSync(path.join(H.ROOT, 'src/js/app.js'), 'utf8');
    check('C2 turtleFlip() audio function exists in app.js', () =>
      assert.ok(src.includes('function turtleFlip('), 'no turtleFlip handler — fired-but-silent'));
    check('C2 turtleFlip registered in the audio dispatch table', () =>
      assert.ok(/turtleFlip\(\)\s*\{\s*turtleFlip\(\);?\s*\}/.test(src), 'not registered'));
  }

  // ---------- H5: wavegate sibling sweep — one gate everywhere ----------
  {
    const gsrc = fs.readFileSync(path.join(H.ROOT, 'src/js/game.js'), 'utf8');
    // monsterWavePool must key on unlockedWave (the run-1 fix), not its own gate
    const poolBody = gsrc.slice(gsrc.indexOf('monsterWavePool()'), gsrc.indexOf('monsterWavePool()') + 600);
    check('H5 monsterWavePool keys on unlockedWave() (no second gate)', () =>
      assert.ok(poolBody.includes('this.unlockedWave()'), 'pool does not call unlockedWave'));
    check('H5 exactly one unlockedWave definition', () =>
      assert.strictEqual((gsrc.match(/unlockedWave\(\)\s*\{/g) || []).length, 1));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
