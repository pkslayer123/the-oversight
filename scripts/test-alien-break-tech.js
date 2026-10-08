// BREAK-IT: alien tech honesty (Steve 2026-10-08).
// ATTACK: apCombatIntro warns "Alien tech detected: <names>. They're
//   cheating. Play accordingly." The names + descs promise mechanics:
//   - Rax "Stasis Field": "Prevents fleeing. You leave when Rax says you leave."
//     REALITY: tbBarrierExit has no stasis check — fleeing works fine. LIE.
//   - Sable "Dread Projector": "Projects your worst memory. Fear effects are doubled."
//     REALITY: nothing applies fear to the player; nothing doubles. LIE.
//   - Sable "Crystal Lattice": "Stores your fear as damage. The more scared
//     you are, the harder she hits." REALITY: no fear synergy. LIE.
//   - Sarge "Veteran Plate": "Reduces all damage by 2." REALITY: no reduction
//     anywhere in the damage path. LIE.
//   - Pip "Tourist Cam": "Pip gets stronger the longer the fight goes."
//     REALITY: flat damage forever. LIE.
// FIX:
//   - apStasisFieldLive() helper; alienPlayers wraps G.tbBarrierExit — while
//     a live hostile with stasis tech is in the fight, the barrier exit is
//     consumed with a stasis message (no 50% break, no travel, fight continues).
//   - Sable's melee applies the fear status (dread projector); her melee
//     deals +6 when the target is afraid (crystal lattice).
//   - The tbDamage wrap reduces damage by 2 when the target fighter fields
//     veteran_plate tech (Sarge).
//   - Pip's melee gains +1 per 2 alien turns, capped +6 (tourist cam).
//   - Descs for tech with no mechanic (phase_net, trophy_scope, nerve_mapper,
//     specimen_scanner) reworded to flavor that promises nothing.
// These assertions encode the FIXED behavior — they FAIL before the fix.
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEED = parseInt(process.env.SEED || '20261008', 10);

function combatReady(seed, pid) {
  RNG.reset(seed);
  const s = H.fresh(45);
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.isSafeTile = () => false;
  s.day = 45; s.hp = 100; s.maxHp = 100; s.health = 100;
  Game.state.waveKills = { 1: 10 };
  Game.apState().known[pid] = 'test';
  return s;
}

// End any live fight cleanly (tbEnd runs the alien wrap: records the
// encounter outcome, clears state.alienEncounter).
function endFight() {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  try { delete Game.state.alienEncounter; } catch (e) {}
  try { delete Game.state.alienGroup; } catch (e) {}
}

// Start a real alien fight via the module path (not a hand-rolled tbfight).
function startFight(pid) {
  endFight();
  H.clearLog();
  const ok = Game.apStartEncounter(pid);
  return ok && Game.tbfight && !Game.tbfight.over ? Game.tbfight : null;
}
function alienFighter(f) {
  return f.fighters.find(x => x.kind === 'hostile' && x.alienPid);
}
function playerFighter(f) {
  return f.fighters.find(x => x.key === 'p');
}
// Teleport villager allies to the far corner so the alien duels the player
// 1v1 — damage measurements aren't polluted by ally-targeting.
function isolateDuel(f) {
  f.fighters.forEach(x => { if (x.kind === 'villager') { x.mx = 8; x.my = 8; } });
}

// Put the player on the west edge and make it the player's turn.
function forcePlayerTurnAtEdge(f) {
  const p = playerFighter(f);
  p.mx = 0; p.my = 4; p.moveLeft = 4; p.acted = false;
  const idx = f.order.indexOf('p');
  f.turnIdx = idx;
  try { Game.tbBeginTurn(); } catch (e) {}
  return p;
}

async function main() {
  await H.boot();

  section('STASIS FIELD: Rax prevents fleeing (honest)');
  {
    const hasHelper = typeof Game.apStasisFieldLive === 'function';
    assert(hasHelper, 'apStasisFieldLive exists (the stasis mechanic is implemented)');
    if (!hasHelper) {
      // BEFORE: no stasis mechanic at all. Demonstrate the lie with a seed
      // sweep — if ANY seed lets the player flee Rax through the barrier,
      // "Prevents fleeing. You leave when Rax says you leave." is false.
      // (game.js captures Math.random at load, so we sweep RNG seeds instead
      // of forcing Math.random — the harness reseeds the capture.)
      let fledRax = -1;
      for (let s = 0; s < 12 && fledRax < 0; s++) {
        combatReady(SEED + s, 'rax_dentist');
        const f = startFight('rax_dentist');
        if (!f) continue;
        forcePlayerTurnAtEdge(f);
        try { Game.tbBarrierExit(-1, 0); } catch (e) {}
        if (f.over) fledRax = SEED + s;
      }
      assert(fledRax >= 0, 'BEFORE — fled Rax through the barrier on seed ' + fledRax + ' despite "Stasis Field: prevents fleeing" (the lie)');
    }
  }
  if (typeof Game.apStasisFieldLive === 'function') {
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    combatReady(seed, 'rax_dentist');
    const f = startFight('rax_dentist');
    assert(!!f, 'seed ' + seed + ': rax fight starts');
    if (!f) continue;
    assert(Game.apStasisFieldLive() === 'rax_dentist', 'seed ' + seed + ': apStasisFieldLive returns the fielding pid (got ' + Game.apStasisFieldLive() + ')');
    forcePlayerTurnAtEdge(f);
    // Sweep several RNG states: under stasis NONE may let the player flee.
    let fled = false;
    for (let s = 0; s < 6 && !fled; s++) {
      RNG.reset(seed * 7 + s);
      H.clearLog();
      try { Game.tbBarrierExit(-1, 0); } catch (e) {}
      if (f.over) fled = true;
    }
    assert(fled === false, 'seed ' + seed + ': barrier flee NEVER breaks under stasis (6 RNG states)');
    const said = H.sayText();
    assert(/tasis/.test(said), 'seed ' + seed + ': stasis message shown, not a flee message');
    assert(!/BARRIER CROSSED/.test(said), 'seed ' + seed + ': no barrier-crossed flee text');
    // KNOWLEDGE GATE: pre-reveal the block message must not name Rax.
    delete Game.apState().known['rax_dentist'];
    H.clearLog();
    RNG.reset(seed * 7 + 100);
    forcePlayerTurnAtEdge(f);
    try { Game.tbBarrierExit(-1, 0); } catch (e) {}
    var saidPre = H.sayText();
    assert(!/Rax/.test(saidPre), 'seed ' + seed + ': pre-reveal stasis message does not name Rax');
    // Known: naming is fine.
    Game.apState().known['rax_dentist'] = 'test';
    H.clearLog();
    RNG.reset(seed * 7 + 101);
    forcePlayerTurnAtEdge(f);
    try { Game.tbBarrierExit(-1, 0); } catch (e) {}
    var saidKnown = H.sayText();
    assert(/Rax/.test(saidKnown), 'seed ' + seed + ': known-Rax stasis message names Rax');
    // Rax goes down -> stasis drops -> flee works again.
    const m = alienFighter(f);
    m.alive = false;
    assert(Game.apStasisFieldLive() === false, 'seed ' + seed + ': stasis drops when Rax is down');
  }
  {
    // Control: no stasis tech in the fight -> barrier flee CAN break contact.
    combatReady(SEED + 20, 'pip_quindle');
    const f = startFight('pip_quindle');
    assert(!!f, 'control: pip fight starts');
    if (f) {
      assert(Game.apStasisFieldLive() === false, 'control: no stasis with Pip');
      // One continuous RNG stream (reset once): per-attempt resets of an
      // LCG correlate draws and can starve a 50% roll for a whole sweep.
      RNG.reset(SEED + 31);
      let fled = false;
      for (let s = 0; s < 24 && !fled; s++) {
        // Re-force turn+edge: a failed break travels the fight and passes
        // the turn, so each attempt needs a fresh player turn at the edge.
        // Flee toward the map center: walking into the world edge blocks
        // exits ("The known world ends here") and would starve the sweep.
        var _dx = Game.map.px <= 4 ? 1 : -1;
        var _p = playerFighter(f);
        _p.mx = _dx > 0 ? 8 : 0; _p.my = 4; _p.moveLeft = 4; _p.acted = false;
        f.turnIdx = f.order.indexOf('p');
        try { Game.tbBeginTurn(); } catch (e) {}
        try { Game.tbBarrierExit(_dx, 0); } catch (e2) {}
        if (f.over) fled = true;
      }
      assert(fled === true, 'control: flee-by-barrier still works without stasis (24-attempt stream)');
    }
  }
  }
  section('DREAD PROJECTOR + CRYSTAL LATTICE: Sable inflicts fear, hits the afraid harder');
  for (const seed of [SEED, SEED + 1]) {
    combatReady(seed + 100, 'countess_sable');
    const f = startFight('countess_sable');
    assert(!!f, 'seed ' + seed + ': sable fight starts');
    if (!f) continue;
    const m = alienFighter(f), p = playerFighter(f);
    isolateDuel(f);
    // Park Sable adjacent to the player, fresh turn counter.
    m.mx = p.mx + 1; m.my = p.my; m.apTurns = 1; m.apSpent = 0; m.telegraph = null;
    const hpBefore = p.hp;
    const real = Math.random;
    Math.random = RNG.next.bind(RNG); // keep seeded stream
    try { Game.tbAlienTurn(m); } catch (e) { console.log('  threw: ' + e.message); }
    Math.random = real;
    const dealt = hpBefore - p.hp;
    assert(dealt > 0, 'seed ' + seed + ': sable melee lands (dealt ' + dealt + ')');
    let feared = false;
    try { feared = Game.hasStatus(p, 'fear') === true; } catch (e) {}
    assert(feared === true, 'seed ' + seed + ': dread projector inflicts fear on the player');
    // Crystal lattice: afraid target takes MORE. Compare min-with-fear vs max-without.
    let minAfraid = Infinity, maxCalm = -Infinity;
    for (let i = 0; i < 40; i++) {
      RNG.reset(seed + 500 + i);
      combatReady(seed + 500 + i, 'countess_sable');
      const f2 = startFight('countess_sable');
      const m2 = alienFighter(f2), p2 = playerFighter(f2);
      isolateDuel(f2);
      m2.mx = p2.mx + 1; m2.my = p2.my; m2.apTurns = 1; m2.apSpent = 0; m2.telegraph = null;
      // afraid case: pre-apply fear directly
      try { Game.applyStatus(p2, 'fear', { silent: true, source: 'test' }); } catch (e) {}
      const hb = p2.hp;
      try { Game.tbAlienTurn(m2); } catch (e) { if (i < 3) console.log('  dbg afraid iter', i, 'threw', e.message); }
      minAfraid = Math.min(minAfraid, hb - p2.hp);
    }
    for (let i = 0; i < 40; i++) {
      RNG.reset(seed + 900 + i);
      combatReady(seed + 900 + i, 'countess_sable');
      const f2 = startFight('countess_sable');
      const m2 = alienFighter(f2), p2 = playerFighter(f2);
      isolateDuel(f2);
      m2.mx = p2.mx + 1; m2.my = p2.my; m2.apTurns = 1; m2.apSpent = 0; m2.telegraph = null;
      // calm case: no fear; but her strike applies fear AFTER damage — measure raw
      const hb = p2.hp;
      // neutralize the projector's own fear so we measure the calm baseline:
      // strike applies fear after tbDamage, so first-strike damage is the calm number.
      try { Game.tbAlienTurn(m2); } catch (e) {}
      maxCalm = Math.max(maxCalm, hb - p2.hp);
    }
    console.log('  seed ' + seed + ': min dmg afraid=' + minAfraid + ' max dmg calm=' + maxCalm);
    assert(minAfraid > maxCalm, 'seed ' + seed + ': crystal lattice — afraid target always takes more (' + minAfraid + ' > ' + maxCalm + ')');
  }

  section('VETERAN PLATE: Sarge reduces incoming damage by 2');
  for (const seed of [SEED, SEED + 1]) {
    combatReady(seed + 200, 'sarge');
    const f = startFight('sarge');
    assert(!!f, 'seed ' + seed + ': sarge fight starts');
    if (!f) continue;
    const m = alienFighter(f);
    const hpBefore = m.hp;
    try { Game.tbDamage(m.key, 10, 'test strike'); } catch (e) { console.log('  threw: ' + e.message); }
    const taken = hpBefore - m.hp;
    assert(taken === 8, 'seed ' + seed + ': sarge takes 10-2=8 (took ' + taken + ')');
  }
  {
    // Control: a non-plate fighter takes the full 10.
    combatReady(SEED + 220, 'pip_quindle');
    const f = startFight('pip_quindle');
    if (f) {
      const m = alienFighter(f);
      const hpBefore = m.hp;
      try { Game.tbDamage(m.key, 10, 'test strike'); } catch (e) {}
      assert(hpBefore - m.hp === 10, 'control: pip (no plate) takes the full 10');
    }
  }

  section('TOURIST CAM: Pip gets stronger the longer the fight goes');
  {
    let minLate = Infinity, maxEarly = -Infinity;
    for (let i = 0; i < 40; i++) {
      RNG.reset(SEED + 300 + i);
      combatReady(SEED + 300 + i, 'pip_quindle');
      const f = startFight('pip_quindle');
      const m = alienFighter(f), p = playerFighter(f);
      isolateDuel(f);
      m.mx = p.mx + 1; m.my = p.my; m.apTurns = 12; m.apSpent = 0; m.telegraph = null;
      const hb = p.hp;
      try { Game.tbAlienTurn(m); } catch (e) {}
      const dealt = hb - p.hp;
      if (dealt > 0) minLate = Math.min(minLate, dealt);
    }
    for (let i = 0; i < 40; i++) {
      RNG.reset(SEED + 400 + i);
      combatReady(SEED + 400 + i, 'pip_quindle');
      const f = startFight('pip_quindle');
      const m = alienFighter(f), p = playerFighter(f);
      isolateDuel(f);
      m.mx = p.mx + 1; m.my = p.my; m.apTurns = 0; m.apSpent = 0; m.telegraph = null;
      const hb = p.hp;
      try { Game.tbAlienTurn(m); } catch (e) {}
      const dealt = hb - p.hp;
      if (dealt > 0) maxEarly = Math.max(maxEarly, dealt);
    }
    console.log('  min dmg at turn 12: ' + minLate + ' | max dmg at turn 0: ' + maxEarly);
    assert(minLate >= maxEarly, 'tourist cam: late-fight Pip hits at least as hard as early best (' + minLate + ' >= ' + maxEarly + ')');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
