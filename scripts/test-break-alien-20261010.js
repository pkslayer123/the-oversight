// Break-it alien-players run, 2026-10-10 (target: alien players / alienPlayers.js).
// Hostile-player attacks: exploits, softlocks, honesty, dead code.
//
// CATCHES (before-fix expectations marked [PRE-FIX-FAILS]):
//  T1 KNOWLEDGE LEAK: apMaybeActivate names the persona on the System feed
//     pre-reveal, with no gate and no apRevealAlien — every other naming site
//     gates on apKnowsAlien (r7 precedent: naming IS the reveal path).
//  T2 KNOWLEDGE LEAK: apMaybeDeactivate names the persona pre-reveal, same class.
//  T3 KNOWLEDGE LEAK: apEventFeed's sadistic-rival line names the persona at
//     2 encounters with no reveal registered (r7 fixed this exact class in
//     apFeedMessage; apEventFeed was missed).
//  T4 DEAD CODE: apBeamHit builds newOpts with `_beamFinal = true`, but the
//     tbDamage wrap's `_beamFinal` branch was removed (break-it 2026-10-08) —
//     the object is never read again.
//  T5 EXPLOIT: dead-drop 3-day gate holds under forced RNG (attack).
//  T6 EXPLOIT: favor clamp +-100 holds (attack).
//  T7 SOFTLOCK: stasis field drops when Rax dies — no permanent flee lock.
//  T8 HONESTY: beam-resist readout matches engine (5 equipped pieces = FULL;
//     inventory keepsakes do NOT count, despite the stale level comment).
//  T9 EXPLOIT: persona-package 6-day gate + sadistic medkit is a real usable item.
// T10 EXPLOIT: care package gated on favor>=20 and 4-day limit.
// T11 SOFTLOCK: group-chain consume-first bookkeeping — no re-entry, no throw.
const H = require('./break-alien-harness.js');
const assert = require('assert');
const fs = require('fs');
let N = 0, FAILS = [];
function ok(c, m) { N++; if (c) { console.log('ok ' + N + ' - ' + m); } else { FAILS.push(N + ': ' + m); console.log('FAIL ' + N + ' - ' + m); } }

const realRandom = Math.random; // the seeded shared RNG installed by the harness
function forceRoll(v) { Math.random = () => v; }
function unforce() { Math.random = realRandom; }
function setup(day) {
  const s = H.fresh(day);
  H.Game.state.waveKills = { 1: 10 };
  H.Game.isSafeTile = () => false;
  return s;
}
function personaNames() {
  return H.Game.apPersonas().map(p => p.name);
}

(async () => {
  await H.boot();
  const G = H.Game;
  const seeds = [20261010, 31337, 9001];

  for (const seed of seeds) {
    H.RNG.reset(seed);

    // ================= T1: activation announcement must not name pre-reveal =================
    {
      setup(40);
      const origRC = G.apReadinessCheck;
      G.apReadinessCheck = () => ({ ready: true, score: 999, reasons: [] }); // isolate the gate
      H.clearLog();
      forceRoll(0.0); // pass the 0.3 gate; weighted pick -> first combat candidate
      let pid = null;
      try { pid = G.apMaybeActivate(); } finally { unforce(); }
      G.apReadinessCheck = origRC;
      ok(pid, `seed ${seed}: apMaybeActivate activates someone (got ${pid})`);
      const per = G.apPersona(pid);
      const known = G.apKnowsAlien(pid);
      const txt = H.sysText() + '\n' + H.sayText();
      const leaked = !known && txt.indexOf(per.name) >= 0;
      ok(!leaked, `seed ${seed}: [PRE-FIX-FAILS] activation feed does not leak "${per.name}" pre-reveal`);
      // cleanup so later tests start clean
      try { delete G.apActive()[pid]; } catch (e) {}
      G.apState().lastActivateDay = -999;
      // ================= T12: codex entry name gating + section header contract =================
    {
      setup(40);
      G.state.codex = G.state.codex || {}; G.state.codex.aliens = {};
      try { delete G.apState().known.vex_marlowe; } catch (e) {}
      G.apState().met.vex_marlowe = { encounters: 1, bond: 0 };
      const e1 = G.apCodexEntry('vex_marlowe');
      ok(e1.name === 'someone', `seed ${seed}: [PRE-FIX-FAILS] codex entry hides the true name pre-reveal`);
      ok(e1.title === 'stranger' && e1.species === 'unknown' && e1.disposition === 'unknown', `seed ${seed}: codex entry gates title/species/disposition pre-reveal`);
      const anyTruth = Object.values(G.state.codex.aliens).some(a => a.species && a.species !== 'unknown');
      ok(anyTruth === false, `seed ${seed}: no alien truth in codex pre-reveal (section reads STRANGERS)`);
      G.apRevealAlien('vex_marlowe', 'test');
      const e2 = G.state.codex.aliens.vex_marlowe;
      ok(e2.name === 'Vex Marlowe', `seed ${seed}: codex entry names them once revealed`);
      const anyTruth2 = Object.values(G.state.codex.aliens).some(a => a.species && a.species !== 'unknown');
      ok(anyTruth2 === true, `seed ${seed}: alien truth present post-reveal (section reads ALIENS)`);
      delete G.state.codex.aliens.vex_marlowe; delete G.apState().met.vex_marlowe;
      try { delete G.apState().known.vex_marlowe; } catch (e) {}
    }
  }

    // ================= T2: deactivation announcement must not name pre-reveal =================
    {
      setup(40);
      const s = G.state.scholar;
      const pid = 'vex_marlowe';
      G.apActive()[pid] = { enteredDay: s.day - 20, lastActionDay: s.day - 20 };
      H.clearLog();
      forceRoll(0.0); // sysSay gate 0.5
      try { G.apMaybeDeactivate(pid); } finally { unforce(); }
      const per = G.apPersona(pid);
      ok(!G.apActive()[pid], `seed ${seed}: apMaybeDeactivate removes a 20-day-stale ${pid}`);
      const txt = H.sysText() + '\n' + H.sayText();
      const leaked = !G.apKnowsAlien(pid) && txt.indexOf(per.name) >= 0;
      ok(!leaked, `seed ${seed}: [PRE-FIX-FAILS] deactivation feed does not leak "${per.name}" pre-reveal`);
    }

    // ================= T3: event-feed rival naming is knowledge-gated =================
    {
      setup(40);
      G.state.combatWins = 0; G.state.combatLosses = 0;
      G.apState().met.vex_marlowe = { encounters: 2, bond: 0 };
      try { delete G.apState().known.vex_marlowe; } catch (e) {}
      G.apState().lastFeedDay = -999;
      H.clearLog();
      forceRoll(0.0); // gate passes; pick = first message = the sadistic rival line
      let fired = false;
      try { fired = G.apEventFeed(); } finally { unforce(); }
      ok(fired, `seed ${seed}: apEventFeed emits with a 2-encounter sadistic rival`);
      const namedPre = H.sysText().indexOf('Vex Marlowe') >= 0;
      ok(!namedPre, `seed ${seed}: [PRE-FIX-FAILS] feed does not name the rival pre-reveal`);
      ok(!G.apKnowsAlien('vex_marlowe'), `seed ${seed}: no phantom reveal registered for an unnamed line`);
      // Once known, the line names them — the gate opens, not the message.
      G.apRevealAlien('vex_marlowe', 'test reveal');
      G.apState().lastFeedDay = -999;
      H.clearLog();
      forceRoll(0.0);
      try { fired = G.apEventFeed(); } finally { unforce(); }
      ok(fired && H.sysText().indexOf('Vex Marlowe') >= 0, `seed ${seed}: feed names the rival once revealed`);
      delete G.apState().met.vex_marlowe;
      try { delete G.apState().known.vex_marlowe; } catch (e) {}
    }

    // ================= T5: dead-drop 3-day gate under forced RNG =================
    {
      setup(40);
      const ap = G.apState();
      ap.lastDropDay = -999; ap.wrenDrops = 0;
      try { delete ap.known.wren; } catch (e) {}
      const s = G.state.scholar;
      s.kcal = 1000;
      const k0 = s.kcal || 0;
      forceRoll(0.0); // the "they're careful" 0.5 gate passes
      let r1 = false, r2 = false;
      try {
        r1 = G.apDeadDrop();
        r2 = G.apDeadDrop(); // same day: must refuse
      } finally { unforce(); }
      ok(r1 === true, `seed ${seed}: dead drop fires once with favorable RNG`);
      ok(r2 === false, `seed ${seed}: dead drop refuses a second drop the same day`);
      ok((s.kcal || 0) > k0, `seed ${seed}: the drop actually adds kcal (${k0} -> ${s.kcal})`);
      ok(ap.lastDropDay === (s.day || 1), `seed ${seed}: cooldown recorded on success only`);
    }

    // ================= T6: favor clamp =================
    {
      setup(40);
      G.apAdjustFavor(500, 'farming test', 'fight');
      ok(G.apFanLane('fight') === 100, `seed ${seed}: favor clamps at +100 (got ${G.apFanLane('fight')})`);
      G.apAdjustFavor(-900, 'farming test', 'fight');
      ok(G.apFanLane('fight') === -100, `seed ${seed}: favor clamps at -100 (got ${G.apFanLane('fight')})`);
    }

    // ================= T7: stasis drops when Rax dies (no permanent lock) =================
    {
      setup(40);
      G.tbIsPlayerTurn = () => true;
      G.tbfight = { fighters: [{ key: 'ap_rax_dentist', kind: 'hostile', alienPid: 'rax_dentist', alive: true, fled: false, alienTech: [{ id: 'stasis_field' }] }], over: false };
      let consumed = null;
      try { consumed = G.tbBarrierExit(1, 0); } catch (e) {}
      ok(consumed === true, `seed ${seed}: stasis consumes the barrier exit while Rax fields it`);
      // Rax dies -> field drops -> exit no longer consumed by the wrap
      G.tbfight.fighters[0].alive = false;
      ok(G.apStasisFieldLive() === false, `seed ${seed}: stasis drops when Rax is down`);
      G.tbfight = null; delete G.tbIsPlayerTurn;
    }

    // ================= T8: beam-resist readout honesty =================
    {
      setup(40);
      const s = G.state.scholar;
      s.equipped = {
        head: { itemId: 'alien_helm' }, torso: { itemId: 'alien_carapace' },
        legs: { itemId: 'alien_greaves' }, hands: { itemId: 'alien_gauntlets' },
        shoes: { itemId: 'alien_boots' },
      };
      const pieces = G.apBeamResistPieces();
      ok(pieces.length === 5, `seed ${seed}: 5 equipped alien pieces -> 5 resist pieces (got ${pieces.length})`);
      ok(G.apBeamResistLevel() === 'full', `seed ${seed}: 5 pieces reads FULL`);
      ok(G.apBeamResistText().indexOf('(5)') >= 0, `seed ${seed}: FULL text shows the real count`);
      // Inventory keepsakes do NOT count (stale comment claimed they push beyond 5)
      const before = pieces.length;
      s.inventory = s.inventory || [];
      s.inventory.push({ itemId: 'alien_helm', id: 'alien_helm_test', name: 'Alien helm', units: 1, bond: 99 });
      ok(G.apBeamResistPieces().length === before, `seed ${seed}: inventory keepsakes do not inflate the count`);
      s.equipped = {}; s.inventory = [];
    }

    // ================= T9: persona-package 6-day gate + real medkit =================
    {
      setup(40);
      const ap = G.apState();
      ap.lastPersonaPackageDay = -999;
      ap.met = { vex_marlowe: { encounters: 1, bond: 0 } };
      const s = G.state.scholar;
      s.inventory = [];
      s.flags = s.flags || {};
      forceRoll(0.0); // RNG gate passes; picks first candidate (vex, sadistic)
      let r1 = false, r2 = false;
      try {
        r1 = G.apPersonaPackage();
        r2 = G.apPersonaPackage();
      } finally { unforce(); }
      ok(r1 === true, `seed ${seed}: persona package fires with favorable RNG`);
      ok(r2 === false, `seed ${seed}: persona package refuses a second package the same day (6-day gate)`);
      const med = (s.inventory || []).filter(e => e.itemId === 'medfoam_canister')[0];
      ok(!!med && med.name === 'Medfoam canister' && med.units === 1, `seed ${seed}: sadistic package grants a REAL usable medkit (not a brick)`);
      ok((s.flags || {}).trackedBy === 'vex_marlowe', `seed ${seed}: the tracker cost is recorded`);
      ap.met = {};
    }

    // ================= T10: care-package favor + 4-day gates =================
    {
      setup(40);
      const ap = G.apState();
      ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 };
      ap.lastPackageDay = -999;
      const s = G.state.scholar; s.kcal = 1000; const k0 = s.kcal || 0;
      forceRoll(0.0);
      let refused = null;
      try { refused = G.apCarePackage(); } finally { unforce(); }
      ok(refused === false, `seed ${seed}: care package refused at favor 0 (< 20 gate)`);
      ok((s.kcal || 0) === k0, `seed ${seed}: refused package grants nothing`);
      ap.fanClubs.fight = 80; ap.lastPackageDay = -999;
      s.inventory = [];
      forceRoll(0.0);
      let granted = null;
      try { granted = G.apCarePackage(); } finally { unforce(); }
      ok(granted === true, `seed ${seed}: care package fires at favor 80`);
      const gift = (s.inventory || [])[0];
      ok(!!gift && !!gift.name && gift.units === 1, `seed ${seed}: care package gift is a real item (${gift && gift.itemId})`);
      ok((s.kcal || 0) > k0 && (s.kcal || 0) <= k0 + 70, `seed ${seed}: snack kcal is a taste, not dinner (${k0} -> ${s.kcal})`);
      ok(ap.lastPackageDay === (s.day || 1), `seed ${seed}: 4-day cooldown recorded`);
      forceRoll(0.0);
      let again = null;
      try { again = G.apCarePackage(); } finally { unforce(); }
      ok(again === false, `seed ${seed}: care package refuses within the 4-day window`);
    }

    // ================= T11: group-chain bookkeeping =================
    {
      setup(40);
      const origStart = G.startAlienCombat;
      G.startAlienCombat = () => true; // isolate chain bookkeeping from combat boot
      G.state.alienGroup = { pids: ['vex_marlowe', 'countess_sable'], current: 0 };
      G.state.alienEncounter = { pid: 'vex_marlowe' };
      G.tbfight = { fighters: [{ key: 'ap_vex_marlowe', kind: 'hostile', alienPid: 'vex_marlowe', alive: false, fled: false }], over: true };
      let threw = null;
      try { G.tbEnd('won'); } catch (e) { threw = e; }
      G.startAlienCombat = origStart;
      ok(!threw, `seed ${seed}: group chain completes without throwing`);
      const grp = G.state.alienGroup;
      ok(grp && grp.current === 1, `seed ${seed}: chained persona re-armed (current=1)`);
      ok((G.apState().lastHuntDay.countess_sable || 0) === (G.state.scholar.day || 1), `seed ${seed}: chained hunt records lastHuntDay`);
      const ae = G.state.alienEncounter;
      ok(!ae || ae.pid === 'countess_sable', `seed ${seed}: no STALE alienEncounter (got ${ae && ae.pid})`);
      G.tbfight = null;
      try { delete G.state.alienGroup; } catch (e) {}
    }
  }

  // ================= T4: dead code — _beamFinal (static, seed-independent) =================
  {
    const src = fs.readFileSync(H.ROOT + '/src/js/alienPlayers.js', 'utf8');
    const beamHitBody = src.slice(src.indexOf('apBeamHit: function'), src.indexOf('apArmorName: function'));
    ok(beamHitBody.indexOf('_beamFinal') < 0, `[PRE-FIX-FAILS] dead newOpts._beamFinal removed from apBeamHit`);
    ok(src.indexOf('opts._beamFinal') < 0, `[PRE-FIX-FAILS] no _beamFinal reader remains anywhere`);
  }

  console.log(`\n${N - FAILS.length}/${N} ASSERTIONS PASSED${FAILS.length ? ' — FAILURES:' : ''}`);
  if (FAILS.length) { for (const f of FAILS) console.log('  x ' + f); process.exit(1); }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
