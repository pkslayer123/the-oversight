#!/usr/bin/env node
// BREAK-IT round 4 — monster counter honesty + telegraph lies (Steve 2026-10-08).
// Steve's law: "Reward players for learning and thinking outside the box."
// monsters.json `weaknesses` arrays are PROMISES. For each claim below this
// test PROVES the engine honors it — or documents the lie (HONESTY CATCH),
// the exploit hole, the softlock, or the dead code.
//
// Claims: (1) belltoad shout vs the chorus, (2) memory_projector beam sidestep
// + curious-phase exit, (3) hushwolf fire, (4) landlord rent + eviction,
// (5) union_rep picket-line dissolve, (6) nevermore post-strafe window,
// (7) telegraphs: hushwolf silence-before-rush, bulldozer charge, bright_idea.
// Harness: scripts/combat-r3-harness.js. Run with SEED=N for more seeds.
//
// BEFORE/AFTER CONTRACT (coordinator note, 2026-10-08): this file is the
// BEFORE proof — it asserts the pre-fix lies (marked "LIE DOCUMENTED") and
// goes 52/52 on pre-fix code. Once the fixes land, exactly 4 assertions flip
// red BY DESIGN — that is the fix working, not a regression:
//   B1.6 (shout now breaks the chorus — fix: chorusBrokenUntil),
//   B5.1, B5.4, B5.7 (write-only urDmgBonus/urBuffed purged; rep death now
//   dissolves the line). The AFTER proof is
//   scripts/test-break-monsters4-counters-fix-20261008.js (14/14 x3 seeds).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('./combat-r3-harness.js');
const ROOT = H.ROOT;
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  FAIL -', name, '::', e.message.split('\n')[0]); }
}
const realRandom = Math.random;
function playerTurn(Game) {
  const p = Game.tbFighter('p');
  Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
  p.moveLeft = 6; p.acted = false;
}
const cellsKey = (cells) => (cells || []).map(c => c.cx + ',' + c.cy).sort().join('|');
const mdefOf = (Game, id) => Game.data.monsters.find(m => m.id === id);
function withRandom(v, fn) { Math.random = () => v; try { return fn(); } finally { Math.random = realRandom; } }

(async () => {
  console.log('seed', H.SEED);

  // ================= B1: BELLTOAD — shout vs the chorus =================
  // Promise: "deafened by its own chorus (loud noises scatter the pack)".
  {
    const Game = await H.newCombatReadyGame();
    const toadMdef = mdefOf(Game, 'belltoad');
    const mk = H.synthFight(Game, 'belltoad', { mhp: 40, php: 200 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    // give it a chorus windup in progress
    t.telegraph = { kind: 'squares', cells: [], dmg: [10, 16], turnsLeft: 2 };
    playerTurn(Game);
    Game.tbPlayerShout();
    check('B1.1 shout clears the chorus windup telegraph', () => assert.strictEqual(t.telegraph, null));
    check('B1.2 shout startles the toad (startled, cooldown)', () => assert.ok(t.startled === true && (t.encCooldown || 0) >= 1));
    check('B1.3 shout pushed it one tile (scatter)', () => {
      const d = Math.max(Math.abs(t.mx - p.mx), Math.abs(t.my - p.my));
      assert.ok(d >= 2, `toad still at distance ${d}`);
    });
    // EXPLOIT: shout-lock? cap is 2/fight.
    playerTurn(Game); Game.tbPlayerShout();
    playerTurn(Game);
    const r3 = Game.tbPlayerShout();
    check('B1.4 shout cap holds: 3rd shout refused (no shout-lock exploit)', () =>
      assert.ok(r3 === false, 'third shout was not refused'));
  }
  // HONESTY CATCH B1: the code comment at tbRoundWrap says "SHOUT breaks the
  // chorus for a round" — but tbRoundWrap reads NO shout state. Prove the
  // reinforcement chorus proceeds on its own schedule even the round a shout
  // was used.
  {
    const Game = await H.newCombatReadyGame();
    const toadMdef = mdefOf(Game, 'belltoad');
    const mk = H.synthFight(Game, 'belltoad', { mhp: 40, php: 200 });
    const f = Game.tbfight;
    const n0 = f.fighters.length;
    Game._pendingPack = { id: 'belltoad', count: 2, mdef: toadMdef };
    playerTurn(Game);
    Game.tbPlayerShout(); // the counter, used this very round
    check('B1.5 shout does not touch _pendingPack', () =>
      assert.ok(Game._pendingPack && Game._pendingPack.count === 2, 'shout altered the pending pack'));
    f.round = 2;
    withRandom(0.0, () => Game.tbRoundWrap(f)); // force the 40%/toad arrival roll to succeed
    check('B1.6 LIE DOCUMENTED: chorus reinforcements arrive despite the shout ("SHOUT breaks the chorus for a round" is not implemented)',
      () => assert.ok(f.fighters.length > n0, 'no reinforcement arrived — chorus honored shout??'));
    Game._pendingPack = null;
  }

  // ================= B2: MEMORY PROJECTOR — beam + curious phase =================
  // Promises: "the beam is a straight line — sidestep", "it fears movement —
  // keep moving, break the spell", "it watches first — leave during the curious phase".
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'memory_projector', { mhp: 80, php: 200 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    // --- curious phase: 2 watch beats before anything is declared
    Game.tbMonsterTurn(t);
    check('B2.1 curious phase exists: watch, 2 beats, no telegraph, no damage', () =>
      assert.ok(t.beamPhase === 'watch' && t.mpWatch === 1 && !t.telegraph && p.hp === 200,
        `phase=${t.beamPhase} mpWatch=${t.mpWatch} telegraph=${!!t.telegraph} php=${p.hp}`));
    check('B2.2 the window is real: no lock-in during watch (fight continues, player alive, nothing spent)', () =>
      assert.ok(!Game.tbfight.over && p.alive && !p.fled, 'fight ended or player gone during watch'));
    Game.tbMonsterTurn(t); // mpWatch 1 -> 0: the spell declares
    check('B2.3 beam declares exactly after the 2 watch beats', () =>
      assert.ok(t.beamPhase === 'spell' && !!t.telegraph, `phase=${t.beamPhase}`));
    const tg = t.telegraph;
    const expectCells = S.combat.patternCells({ type: 'beam', length: 5, width: 1 }, 6, 4, 4, 4);
    check('B2.4 the beam IS a straight lane (cells == patternCells beam from monster toward player)', () =>
      assert.strictEqual(cellsKey(tg.cells), cellsKey(expectCells)));
    check('B2.5 threatenedPlayer true at declare (it was aimed at you)', () =>
      assert.ok(tg.threatenedPlayer === true));
    // --- sidestep: 1 tile perpendicular — off the lane, but KEEP MOVING:
    // a still target is dragged back onto the lane (the spell-pull).
    p.mx = 4; p.my = 5;
    assert.ok(!tg.cells.some(c => c.cx === 4 && c.cy === 5), 'test setup broken: (4,5) is on the lane');
    const hp0 = p.hp;
    Game.tbMonsterTurn(t); // windup 2 -> 1 (spell-pull: moved 1, no break)
    check('B2.6 moving 1 tile does not break the spell (only 2+ does)', () =>
      assert.ok(t.telegraph !== null, 'spell broke on a 1-tile sidestep — over-eager'));
    p.mx = 4; p.my = 6; // keep moving — one more tile off the lane
    Game.tbMonsterTurn(t); // windup 1 -> 0: resolve
    check('B2.7 sidestep + keep moving dodges the beam: off-lane player takes no damage', () =>
      assert.strictEqual(p.hp, hp0, `player took ${hp0 - p.hp} — beam hit off-lane?!`));
  }
  // The spell-pull: sidestep, then STAND STILL — the light drags you back.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'memory_projector', { mhp: 80, php: 200 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); Game.tbMonsterTurn(t); // watch x2 -> spell declared
    p.mx = 4; p.my = 5; // sidestep off the lane...
    Game.tbMonsterTurn(t); // windup 2 -> 1 (moved 1, no break)
    const hp0 = p.hp;
    Game.tbMonsterTurn(t); // windup 1 -> 0: moved 0 -> PULL then resolve
    check('B2.7b the spell pulls a still target: dragged toward the monster, back onto the lane, and hit', () =>
      assert.ok((p.mx !== 4 || p.my !== 5) && p.hp < hp0,
        `player at (${p.mx},${p.my}) php ${hp0}->${p.hp} — no pull?`));
  }
  // "it fears movement — keep moving, break the spell": 2+ tiles in a turn breaks it.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'memory_projector', { mhp: 80, php: 200 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); Game.tbMonsterTurn(t); // watch x2 -> spell declared
    assert.ok(t.telegraph, 'setup: beam not declared');
    p.mx = 2; p.my = 5; // 2+ tiles from the declare baseline (4,4)
    Game.tbMonsterTurn(t);
    check('B2.8 moving 2+ tiles breaks the spell outright (telegraph canceled, back to watch)', () =>
      assert.ok(t.telegraph === null && t.beamPhase === 'watch', `telegraph=${!!t.telegraph} phase=${t.beamPhase}`));
  }

  // ================= B3: HUSHWOLF — fire =================
  // Promise: "fire (they remember being dogs)". Data: fear='numbers'.
  {
    const Game = await H.newCombatReadyGame();
    const wolfMdef = mdefOf(Game, 'hushwolf');
    check("B3.1 data mismatch documented: hushwolf fear is 'numbers', NOT 'fire' (weakness copy says fire)", () =>
      assert.strictEqual((wolfMdef.fear || '').toLowerCase(), 'numbers'));
    // The world path IS honest: carry flame to the quiet woods and the pack gives ground.
    Game.evQuietWoods({});
    const s = Game.state.scholar;
    const pack = (Game.worldMonsters ? Game.worldMonsters() : []).filter(m => m.id === 'hushwolf');
    check('B3.2 Quiet Woods: the silence event spawns a real pack BEFORE any contact', () =>
      assert.ok(s.quietWoods && s.quietWoods.pack > 0 && pack.length > 0,
        `quietWoods=${JSON.stringify(s.quietWoods)} pack=${pack.length}`));
    let encounterCalled = null;
    const origTE = Game.triggerEncounter;
    Game.triggerEncounter = (id) => { encounterCalled = id; return true; };
    const origNF = Game.nearFire;
    try {
      Game.nearFire = () => true;
      encounterCalled = null;
      Game.investigateQuietWoods();
      check('B3.3 with fire: the pack gives ground — no encounter (fire works in the world event)', () =>
        assert.strictEqual(encounterCalled, null));
      Game.evQuietWoods({});
      Game.nearFire = () => false;
      encounterCalled = null;
      Game.investigateQuietWoods();
      check('B3.4 without fire: the silence is followed by the rush (ordering honest)', () =>
        assert.strictEqual(encounterCalled, 'hushwolf'));
    } finally { Game.triggerEncounter = origTE; Game.nearFire = origNF; }
    // Combat: the rush gives NO warning — "No telegraph you can hear" is honest in the fight.
    const mk = H.synthFight(Game, 'hushwolf', { mhp: 30, php: 200 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    const hp0 = p.hp;
    Game.tbMonsterTurn(t);
    check('B3.5 rush hits with NO telegraph state (no warning, just teeth — Steve killed the indicator, engine agrees)', () =>
      assert.ok(p.hp < hp0 && t.telegraph == null, `php ${hp0}->${p.hp}, telegraph=${!!t.telegraph}`));
    // HONESTY CATCH: no combat code connects fire to wolves. Static proof —
    // the rush block never mentions fire, and scholarNearCell('fire') is only
    // reachable via mdef.fear==='fire', which hushwolf does not have.
    const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    const rushIdx = src.indexOf("pat.type === 'rush'");
    const rushBlock = src.slice(rushIdx, rushIdx + 1600);
    check('B3.6 LIE DOCUMENTED: wolf combat behavior has no fire hook (rush block is fire-free; fear-stimulus needs fear==="fire")', () =>
      assert.ok(!/fire/i.test(rushBlock), 'rush block references fire'));
  }

  // ================= B4: LANDLORD — rent + eviction =================
  // Promise: "rent comes due every round you end on leased ground — never
  // stand still on claimed tiles". Eviction claims your tile if stationary.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'landlord', { mhp: 120, php: 300 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbTerraform(4, 4, 'claimed');
    const hp0 = p.hp;
    Game.tbMonsterTurn(t);
    check('B4.1 rent: ending on claimed ground costs exactly 1+addenda at its turn', () =>
      assert.strictEqual(p.hp, hp0 - 1, `rent was ${hp0 - p.hp}, expected exactly 1`));
    t.llAddenda = 2;
    const hp1 = p.hp;
    Game.tbMonsterTurn(t);
    check('B4.2 rent scales with Addenda (1+2 = 3)', () =>
      assert.strictEqual(p.hp, hp1 - 3, `rent was ${hp1 - p.hp}, expected exactly 3`));
  }
  // Eviction: stationary across two landlord turns -> your tile gets claimed.
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'landlord', { mhp: 120, php: 300 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); // turn 1: records position, no eviction yet
    check('B4.3 no eviction on first turn (it serves notice only when you repeat the tile)', () =>
      assert.ok(Game.tbTerrainAt(4, 4) !== 'claimed', 'player tile claimed without standing still'));
    const claimed0 = t.llClaimed || 0;
    Game.tbMonsterTurn(t); // turn 2: stationary -> NOTICE SERVED
    check('B4.4 EXPLOIT CLOSED: turtling gets evicted — your tile is claimed', () =>
      assert.ok(Game.tbTerrainAt(4, 4) === 'claimed' && (t.llClaimed || 0) > claimed0,
        `terrain=${Game.tbTerrainAt(4, 4)} llClaimed ${claimed0}->${t.llClaimed}`));
    // The escalation clock runs: waves of Addenda keep coming (anti-stall).
    Game.tbMonsterTurn(t); Game.tbMonsterTurn(t); Game.tbMonsterTurn(t);
    check('B4.5 jurisdiction spread fires (Addenda rise over the fight)', () =>
      assert.ok((t.llAddenda || 0) >= 1, `llAddenda=${t.llAddenda} — the lease never grew`));
  }

  // ================= B5: UNION REP — the picket line =================
  // Promises: "kill it first — without the rep the picket line dissolves",
  // "it barely attacks itself; the danger is what it makes others do".
  {
    const Game = await H.newCombatReadyGame();
    const repMdef = mdefOf(Game, 'union_rep');
    const toadMdef = mdefOf(Game, 'belltoad');
    const mk = H.synthFight(Game, 'union_rep', { mhp: 100, php: 300 });
    const f = Game.tbfight;
    const rep = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; rep.mx = 6; rep.my = 4;
    // add an ally monster to organize
    const ally = { key: 'm_ally', kind: 'monster', monsterId: 'belltoad', mdef: toadMdef,
      name: 'Ally Toad', emoji: '🐸', hp: 30, maxHp: 30, speed: 3, mx: 5, my: 5,
      alive: true, fled: false, telegraph: null, hesitate: 0, blind: 0, stunned: 0, threatQueue: [] };
    f.fighters.push(ally); f.order.push('m_ally');
    Game.tbMonsterTurn(rep);
    check('B5.1 it organizes first: ally buffed +3 on its turn', () =>
      assert.strictEqual(ally.urDmgBonus, 3, `urDmgBonus=${ally.urDmgBonus}`));
    check('B5.1b "barely attacks itself": its own offense is a modest windup-2 direct, never the heavy', () =>
      assert.ok(rep.telegraph && rep.telegraph.kind === 'direct' && rep.telegraph.turnsLeft === 2 &&
        JSON.stringify(rep.telegraph.dmg) === JSON.stringify([14, 20]),
        `telegraph=${JSON.stringify(rep.telegraph && { kind: rep.telegraph.kind, turnsLeft: rep.telegraph.turnsLeft, dmg: rep.telegraph.dmg })}`));
    // The live channel is the tbDamage solidarity aura (+3 while rep organizes).
    withRandom(0.99, () => {
      const hp0 = p.hp;
      Game.tbDamage('p', 10, 'ally test', 'm_ally');
      check('B5.2 solidarity aura: +3 damage while the rep lives and organizes', () =>
        assert.strictEqual(p.hp, hp0 - 13, `took ${hp0 - p.hp}, expected 13`));
      // Kill the rep mid-fight.
      Game.tbDamage(mk, 999, 'test', 'p');
      assert.ok(!rep.alive, 'setup: rep survived 999 damage');
      const hp1 = p.hp;
      Game.tbDamage('p', 10, 'ally test', 'm_ally');
      check('B5.3 killing the rep drops the aura (the line weakens — half of "dissolves" is honest)', () =>
        assert.strictEqual(p.hp, hp1 - 10, `took ${hp1 - p.hp}, expected 10`));
    });
    check('B5.4 LIE DOCUMENTED: ally urDmgBonus persists after rep death (never cleared — the line does not fully dissolve)', () =>
      assert.strictEqual(ally.urDmgBonus, 3));
    // DEAD CODE: urDmgBonus is write-only — nothing ever reads it.
    const src5 = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    const uses = [...src5.matchAll(/urDmgBonus/g)].map(m => {
      const line = src5.slice(Math.max(0, m.index - 90), m.index + 20);
      return /tbDamage|final\s*\+|dmg\s*\+|\+=.*urDmgBonus/.test(line);
    });
    check('B5.5 DEAD CODE: urDmgBonus is never consumed by any damage path (write-only)', () =>
      assert.ok(uses.length > 0 && uses.every(u => !u), `${uses.filter(Boolean).length} read-sites found`));
    // No new summons after the rep dies.
    const n0 = f.fighters.length;
    Game.tbMonsterTurn(ally); Game.tbMonsterTurn(ally);
    check('B5.6 no new summons once the rep is dead', () =>
      assert.strictEqual(f.fighters.length, n0));
  }
  // Walkout: at half HP the rep goes untargetable while coordinating.
  {
    const Game = await H.newCombatReadyGame();
    const toadMdef = mdefOf(Game, 'belltoad');
    const mk = H.synthFight(Game, 'union_rep', { mhp: 100, php: 300 });
    const f = Game.tbfight;
    const rep = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; rep.mx = 6; rep.my = 4;
    const ally = { key: 'm_ally2', kind: 'monster', monsterId: 'belltoad', mdef: toadMdef,
      name: 'Ally Toad', emoji: '🐸', hp: 30, maxHp: 30, speed: 3, mx: 5, my: 5,
      alive: true, fled: false, telegraph: null, hesitate: 0, blind: 0, stunned: 0, threatQueue: [] };
    f.fighters.push(ally); f.order.push('m_ally2');
    Game.tbMonsterTurn(rep); // organizing: ally +3, modest direct declared (windup 2)
    rep.hp = 40; // below half -> WALKOUT (fires once its own windup clears)
    for (let i = 0; i < 5 && !rep.urWalkout; i++) Game.tbMonsterTurn(rep);
    check('B5.7 walkout at half HP: allies +8 total, rep untargetable while coordinating', () => {
      assert.ok(rep.urWalkout === true, 'never entered walkout');
      assert.strictEqual(ally.urDmgBonus, 8, `ally bonus ${ally.urDmgBonus}, expected 8`);
    });
    playerTurn(Game);
    const r = Game.tbPlayerStrike(mk);
    check('B5.8 strike on a walkout rep is refused (untargetable — break the line first)', () =>
      assert.ok(r === false && rep.hp === 40, `strike returned ${r}, rep hp ${rep.hp}`));
  }

  // ================= B6: NEVERMORE — the landed window =================
  // Promise: "it always lands after a strafing run — that's the window".
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'nevermore', { mhp: 60, php: 300 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); // d=2 <= 3: declares the strafe
    check('B6.1 strafe declares a straight 3-lane (commitCells — locked at declare)', () => {
      assert.ok(t.beamPhase === 'strafe' && !!t.telegraph, `phase=${t.beamPhase}`);
      const expect = S.combat.patternCells({ type: 'line', length: 3, width: 1 }, 6, 4, 4, 4);
      assert.strictEqual(cellsKey(t.telegraph.cells), cellsKey(expect), 'lane is not the straight declared line');
      assert.ok(t.telegraph.commitCells === true, 'lane not committed — could re-aim mid-run');
    });
    // Sidestep OFF the lane (not along it).
    p.mx = 4; p.my = 5;
    assert.ok(!t.telegraph.cells.some(c => c.cx === 4 && c.cy === 5), 'setup: (4,5) on the lane');
    const hp0 = p.hp;
    const laneEnd = t.telegraph.cells[t.telegraph.cells.length - 1];
    Game.tbMonsterTurn(t); // windup 1 -> 0: resolve, MISS
    check('B6.2 the window opens: a missed strafe ends grounded, 2 turns, at the lane end', () =>
      assert.ok(t.beamPhase === 'grounded' && t.nmGrounded === 2 && t.altitude === 'low' &&
        t.mx === laneEnd.cx && t.my === laneEnd.cy && p.hp === hp0,
        `phase=${t.beamPhase} nmGrounded=${t.nmGrounded} alt=${t.altitude} at=(${t.mx},${t.my}) php ${hp0}->${p.hp}`));
    // +50% damage while grounded (the punish).
    withRandom(0.99, () => {
      t.hp = 60;
      t.altitude = 'high';
      Game.tbDamage(mk, 20, 'test', 'p');
      const dHigh = 60 - t.hp;
      t.hp = 60;
      t.altitude = 'low';
      Game.tbDamage(mk, 20, 'test', 'p');
      const dLow = 60 - t.hp;
      check('B6.3 grounded takes +50% (the window is a real punish)', () =>
        assert.ok(dHigh === 20 && dLow === 30, `high=${dHigh} low=${dLow}`));
    });
    // The window closes — it climbs back.
    t.altitude = 'low'; t.nmGrounded = 2; t.hp = 60;
    Game.tbMonsterTurn(t); Game.tbMonsterTurn(t);
    check('B6.4 the window is temporary: after 2 grounded turns it climbs back to perch', () =>
      assert.ok(t.beamPhase === 'perch' && t.altitude === 'high', `phase=${t.beamPhase} alt=${t.altitude}`));
  }
  // A CONNECTED strafe also lands (1-turn window).
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'nevermore', { mhp: 60, php: 300 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); // declare
    withRandom(0.0, () => Game.tbMonsterTurn(t)); // resolve: player ON the lane -> HIT
    check('B6.5 a connected strafe still lands (1-turn grounded window)', () =>
      assert.ok(t.beamPhase === 'grounded' && t.nmGrounded === 1 && p.hp < 300,
        `phase=${t.beamPhase} nmGrounded=${t.nmGrounded} php=${p.hp}`));
  }

  // ================= B7: TELEGRAPHS =================
  // 7a. Hushwolf: "No telegraph you can hear. Watch the birds — when they go
  // quiet, the pack is already moving." Silence BEFORE contact; rush itself silent.
  // (Covered by B3.2/B3.4/B3.5 — the ordering + no-warning proofs. Recap asserts:)
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'hushwolf', { mhp: 30, php: 300 });
    const t = Game.tbFighter(mk);
    check('B7a recap: rush telegraph state stays null through the whole rush turn', () => {
      Game.tbMonsterTurn(t);
      assert.strictEqual(t.telegraph, null);
    });
  }
  // 7b. Bulldozer charge: telegraph "Lowers its head, paws the earth... It is
  // not going around" vs resolve. Weakness: "soft flanks (HARRY then STRIKE)".
  {
    const Game = await H.newCombatReadyGame();
    const mk = H.synthFight(Game, 'bulldozer', { mhp: 55, php: 300 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); // d=2 <= want: declares China-Shop Charge
    check('B7b.1 charge telegraph is a straight lane (it never goes around — at declare)', () => {
      assert.ok(t.telegraph && t.telegraph.pattern.type === 'charge', `pattern=${t.telegraph && t.telegraph.pattern.type}`);
      const ys = new Set(t.telegraph.cells.map(c => c.cy));
      assert.ok(ys.size === 1, 'lane bends — the telegraph lied');
    });
    const laneEnd = t.telegraph.cells[t.telegraph.cells.length - 1];
    p.mx = 4; p.my = 6; // off the lane
    const hp0 = p.hp;
    Game.tbMonsterTurn(t); // resolve: MISS
    check('B7b.2 sidestep the lane: unharmed, and it ends winded at the lane end (flanks soft)', () =>
      assert.ok(p.hp === hp0 && t.boarWinded === 2 && t.mx === laneEnd.cx && t.my === laneEnd.cy,
        `php ${hp0}->${p.hp} winded=${t.boarWinded} at=(${t.mx},${t.my}) want=(${laneEnd.cx},${laneEnd.cy})`));
    withRandom(0.99, () => {
      t.hp = 55;
      Game.tbDamage(mk, 20, 'test', 'p');
      check('B7b.3 winded flanks take +50% (HARRY-then-STRIKE window is real)', () =>
        assert.strictEqual(55 - t.hp, 30, `took ${55 - t.hp}, expected 30`));
    });
  }
  // 7c. Bright idea: "burst radius 2 — back off when it brightens", "it glows —
  // you can see it coming", "never moves once set", "daylight disperses it".
  {
    const Game = await H.newCombatReadyGame();
    Game.dayPart = 3; // night — it only sets after dark
    const mk = H.synthFight(Game, 'bright_idea', { mhp: 70, php: 300 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); // d=2 <= 4: SETS and starts brightening
    check('B7c.1 it sets and brightens with a 2-beat windup (you can see it coming)', () =>
      assert.ok(t.beamPhase === 'brighten' && !!t.telegraph && t.telegraph.turnsLeft === 2,
        `phase=${t.beamPhase} turnsLeft=${t.telegraph && t.telegraph.turnsLeft}`));
    check('B7c.2 burst is EXACTLY radius 2 (the full 5x5 disc, nothing more)', () => {
      const cells = t.telegraph.cells;
      assert.strictEqual(cells.length, 25, `burst has ${cells.length} cells, not 25`);
      assert.ok(cells.every(c => Math.max(Math.abs(c.cx - 6), Math.abs(c.cy - 4)) <= 2), 'cell outside radius 2');
    });
    const setX = t.mx, setY = t.my;
    p.mx = 1; p.my = 1; // well outside the burst — and beyond its reach
    const hp0 = p.hp;
    Game.tbMonsterTurn(t); // beat 2 (turnsLeft 2 -> 1)
    check('B7c.3 never moves once set', () =>
      assert.ok(t.mx === setX && t.my === setY, `moved to (${t.mx},${t.my})`));
    Game.tbMonsterTurn(t); // beat 3 -> DETONATION (bloom)
    check('B7c.4 backed off: the detonation lands only in its radius-2 disc', () =>
      assert.ok(t.beamPhase === 'bloom' && p.hp === hp0,
        `phase=${t.beamPhase} php ${hp0}->${p.hp}`));
    // It cannot chase (follows:false): backing off beyond its reach disengages
    // the fight — "just don't approach" is mechanically real.
    check('B7c.5 backing off ends the fight (it cannot chase — disengage is honest)', () =>
      assert.ok(p.fled === true, 'fight did not disengage after backing off'));
  }
  // The ember window: stay in reach through the bloom and it gutters to ember.
  {
    const Game = await H.newCombatReadyGame();
    Game.dayPart = 3;
    const mk = H.synthFight(Game, 'bright_idea', { mhp: 70, php: 300 });
    const t = Game.tbFighter(mk);
    const p = Game.tbFighter('p');
    p.mx = 4; p.my = 4; t.mx = 6; t.my = 4;
    Game.tbMonsterTurn(t); // SET + brighten
    p.mx = 4; p.my = 6; // d=2: inside its reach (fight holds), on the burst edge
    const hp0 = p.hp;
    Game.tbMonsterTurn(t); // beat 2
    Game.tbMonsterTurn(t); // beat 3 -> DETONATION
    check('B7c.6 the burst edge is honest: at exactly radius 2 you take the hit', () =>
      assert.ok(p.hp < hp0, `php ${hp0}->${p.hp} — burst did not reach its own radius?!`));
    Game.tbMonsterTurn(t); // the bloom beat passes -> ember
    const hp1 = p.hp;
    Game.tbMonsterTurn(t); // ember tick: harmless
    check('B7c.7 post-detonation it is a harmless ember (the safe window is real)', () =>
      assert.ok(t.beamPhase === 'ember' && p.hp === hp1,
        `phase=${t.beamPhase} php ${hp1}->${p.hp}`));
  }
  // Daylight disperses it.
  {
    const Game = await H.newCombatReadyGame();
    Game.dayPart = 1; // midday
    const mk = H.synthFight(Game, 'bright_idea', { mhp: 70, php: 300 });
    const t = Game.tbFighter(mk);
    Game.tbMonsterTurn(t);
    check('B7c.8 daylight disperses it (fears daylight — honest)', () =>
      assert.ok(t.fled === true, 'bright_idea did not flee at midday'));
  }

  console.log(`\n${pass} passed, ${fail} failed (seed ${H.SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
