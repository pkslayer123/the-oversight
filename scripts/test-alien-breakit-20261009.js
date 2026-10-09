// Break-it alien-players run, 2026-10-09 (target: alien players / alienPlayers.js).
// Hostile-player attacks: exploits, softlocks, honesty, dead code.
//
// A: DEAD-CODE (runtime): module loaded, all 68 methods reachable, wraps installed.
// B: EXPLOIT: favor farming bounds (+-100 clamp, daily drift).
// C: EXPLOIT: dead-drop 3-day gate + care-package 4-day gate under forced RNG.
// D: SOFTLOCK: apStartEncounter outer-catch phantom alienEncounter.
// E: HONESTY: playground raid "trust sabotage" vs Trust!=rep canon.
// F: EXPLOIT: beam-resist piece double-count via shoes/feet alias.
const H = require('./break-alien-harness.js');
const assert = require('assert');
let N = 0;
function ok(c, m) { N++; assert(c, m); console.log('ok ' + N + ' - ' + m); }

const _rawFresh = H.fresh.bind(H);
function setup(day) {
  const s = _rawFresh(day);
  H.Game.state.waveKills = { 1: 10 };
  H.Game.isSafeTile = () => false;
  return s;
}
const realRandom = Math.random;
function forceRoll(v) { Math.random = () => v; }
function unforce() { Math.random = realRandom; }

(async () => {
  await H.boot();
  const G = H.Game;
  const seeds = [20261009, 777, 4242];

  for (const seed of seeds) {
    // ================= A: DEAD CODE (runtime) =================
    H.RNG.reset(seed);
    setup(30);
    ok(typeof G.apRollEncounter === 'function', `seed ${seed}: apRollEncounter installed on Game`);
    ok(typeof G.apDailyTick === 'function', `seed ${seed}: apDailyTick installed on Game`);
    ok(typeof G.apPlaygroundTick === 'function', `seed ${seed}: apPlaygroundTick installed on Game`);
    ok(typeof G.apStasisFieldLive === 'function', `seed ${seed}: apStasisFieldLive installed on Game`);
    ok(typeof G.startAlienCombat === 'function', `seed ${seed}: startAlienCombat wired (encounters.js)`);
    // Wraps installed — BEHAVIORAL (string checks fail: tbEnd/endDay are
    // wrapped by several modules; the outer wrap's source can't show the
    // inner call). Spy on the dynamic this.apX lookup each wrap performs.
    // tbEnd -> apOnCombatEnd
    let onEndArgs = null;
    const origOnEnd = G.apOnCombatEnd;
    G.apOnCombatEnd = function (pid, outcome) { onEndArgs = [pid, outcome]; return origOnEnd.apply(this, arguments); };
    G.state.alienEncounter = { pid: 'vex_marlowe' };
    G.tbfight = { fighters: [{ key: 'ap_vex_marlowe', kind: 'hostile', alienPid: 'vex_marlowe', alive: false }], over: true };
    try { G.tbEnd('won'); } catch (e) {}
    G.apOnCombatEnd = origOnEnd;
    ok(onEndArgs && onEndArgs[0] === 'vex_marlowe' && onEndArgs[1] === 'won',
      `seed ${seed}: tbEnd wrap routes alien fights to apOnCombatEnd (got ${JSON.stringify(onEndArgs)})`);
    ok(!G.state.alienEncounter, `seed ${seed}: tbEnd wrap clears alienEncounter after recording`);
    G.tbfight = null;
    // endDay -> apDailyTick
    let dailyFired = false;
    const origDaily = G.apDailyTick;
    G.apDailyTick = function () { dailyFired = true; return origDaily.apply(this, arguments); };
    try { G.endDay(); } catch (e) {}
    G.apDailyTick = origDaily;
    ok(dailyFired, `seed ${seed}: endDay wrap runs apDailyTick`);
    // tbDamage -> apBeamHit for alien_beam
    let beamArgs = null;
    const origBeamHit = G.apBeamHit;
    G.apBeamHit = function (tk, dmg, lbl, opts) { beamArgs = [tk, lbl]; return origBeamHit.apply(this, arguments); };
    G.tbfight = { fighters: [{ key: 'p', kind: 'player', name: 'You', hp: 100, maxHp: 100, alive: true }], over: false };
    G.tbFighter = G.tbFighter || function (k) { return (G.tbfight.fighters || []).filter(f => f.key === k)[0] || null; };
    try { G.tbDamage('p', 50, 'test beam', 'x', { damageType: 'alien_beam' }); } catch (e) {}
    G.apBeamHit = origBeamHit;
    ok(beamArgs && beamArgs[0] === 'p', `seed ${seed}: tbDamage wrap routes alien_beam to apBeamHit`);
    G.tbfight = null;
    // tbBarrierExit -> stasis consume
    G.tbIsPlayerTurn = () => true;
    G.tbfight = { fighters: [{ key: 'ap_rax_dentist', kind: 'hostile', alienPid: 'rax_dentist', alive: true, fled: false, alienTech: [{ id: 'stasis_field' }] }], over: false };
    let exitRes = null;
    try { exitRes = G.tbBarrierExit(1, 0); } catch (e) {}
    ok(exitRes === true, `seed ${seed}: tbBarrierExit wrap consumes flee while Rax's stasis field is live`);
    G.tbfight = null; delete G.tbIsPlayerTurn;
    // Static: every method in the ontology "provides" list is defined.
    const provides = ['apState','apPersonas','apPersona','apEligible','apEncounterEligible','apRollEncounter','apBuildFighter','apAbilityKit','apAlienTech','apStartEncounter','apCombatIntro','apCombatLine','apSayCombat','apCombatChatter','apPilotTaunt','apWealthOf','apIsCombat','apWealthStance','apApplyWealthStance','apProgressRate','apProgressLevel','apProgressiveKit','apProgressiveTech','apGroupEligible','apRollGroupEncounter','apGroupBanter','apStartGroupEncounter','apOnCombatEnd','apDailyTick','apActive','apPlaygroundTick','apMaybeActivate','apMaybeDeactivate','apPlaygroundAction','apPlaygroundKill','apPlaygroundBurn','apPlaygroundRaid','apPlaygroundRookieMistake','apPlaygroundDuel','apFactionAligned','apVillagerFear','apBeamResistPieces','apBeamResistLevel','apBeamResistText','apReadinessCheck','apHasBeam','apStasisFieldLive','apBeamHit','apArmorName','apMaybeBeamAttack','apIsArsonist','apExperience','apFavor','apAdjustFavor','apDeadDrop','apFeedMessage','apContestInterference','apPersonaPackage','apEventFeed','apCodexEntry','apVillageGossip','apContactedVillager','apContactWarning','apKnowsAlien','apRevealAlien','apCarePackage','apGrantItem','apDousePlayerFire'];
    const missing = provides.filter(m => typeof G[m] !== 'function');
    ok(missing.length === 0, `seed ${seed}: all ${provides.length} ontology-provided methods exist (missing: ${missing.join(',') || 'none'})`);

    // ================= B: EXPLOIT — favor bounds =================
    H.RNG.reset(seed); setup(30);
    G.apAdjustFavor(1000, null);
    ok(G.apFavor() === 100, `seed ${seed}: favor clamps at +100 (got ${G.apFavor()})`);
    G.apAdjustFavor(-2000, null);
    ok(G.apFavor() === -100, `seed ${seed}: favor clamps at -100 (got ${G.apFavor()})`);
    // Daily drift toward 0 (crowd forgets) — not farmable to a permanent max.
    G.apState().favor = 50;
    forceRoll(0.999); // suppress daily-tick random events; drift is unconditional
    try { G.apDailyTick(); } finally { unforce(); }
    ok(G.apFavor() === 49, `seed ${seed}: favor drifts toward 0 daily (50 -> ${G.apFavor()})`);

    // ================= C: EXPLOIT — drop/package gates =================
    H.RNG.reset(seed); setup(30);
    const apc = G.apState();
    forceRoll(0); // always pass the "careful" / 25% rolls
    let first, second;
    try {
      first = G.apDeadDrop();
      second = G.apDeadDrop(); // same day: must be gated
    } finally { unforce(); }
    ok(first === true || first === false, `seed ${seed}: dead drop returns bool`);
    if (first === true) {
      ok(second === false, `seed ${seed}: dead drop 3-day gate blocks same-day repeat`);
    } else {
      console.log('ok ' + (++N) + ` - seed ${seed}: dead drop helper-absent path (no benevolent met) — gate untested this seed`);
    }
    // Care package: favor>=20 unlocks, then 4-day gate under forced RNG.
    H.RNG.reset(seed); setup(30);
    G.apState().favor = 80; G.apState().lastPackageDay = -999;
    forceRoll(0);
    let p1, p2;
    try { p1 = G.apCarePackage(); p2 = G.apCarePackage(); } finally { unforce(); }
    ok(p1 === true, `seed ${seed}: care package fires at favor 80`);
    ok(p2 === false, `seed ${seed}: care package 4-day gate blocks same-day repeat`);

    // ================= D: SOFTLOCK — start-encounter outer catch =================
    H.RNG.reset(seed); setup(30);
    const pid = 'vex_marlowe';
    // Make startAlienCombat throw AFTER alienEncounter is set (the hostile case:
    // any throw between the state write and the guarded paths).
    const origSAC = G.startAlienCombat;
    G.startAlienCombat = function () { throw new Error('boom: combat backend died'); };
    let res;
    try { res = G.apStartEncounter(pid); } catch (e) { res = 'THREW-OUT'; }
    G.startAlienCombat = origSAC;
    ok(res === false, `seed ${seed}: start failure returns false, never throws out (got ${res})`);
    ok(!G.state.alienEncounter, `seed ${seed}: no phantom alienEncounter left after failed start (D-FAIL if set)`);

    // ================= E: HONESTY — raid trust sabotage =================
    H.RNG.reset(seed); setup(30);
    const ape = G.apState(); ape.lastRaidDay = -999;
    const v = G.state.village;
    const target = (v.roster || []).filter(id => id !== G.villagerId)[0];
    ok(!!target, `seed ${seed}: raid test has a villager target`);
    v.trust = v.trust || {}; v.trust[target] = 40;
    const trustBefore = v.trust[target];
    const gossipBefore = (v.gossip || []).length;
    forceRoll(0.75); // raid branch roll>=0.60 -> trust sabotage
    let did;
    try { did = G.apPlaygroundRaid('vex_marlowe'); } finally { unforce(); }
    ok(did === true, `seed ${seed}: raid reports it did something`);
    ok(v.trust[target] === trustBefore, `seed ${seed}: E-FAIL: raid moved TRUST ${trustBefore} -> ${v.trust[target]} (canon: gossip moves REP only)`);
    ok((v.gossip || []).length > gossipBefore, `seed ${seed}: raid seeds a rep rumor instead`);

    // ================= F: beam-resist piece count =================
    H.RNG.reset(seed); setup(30);
    const s6 = G.state.scholar;
    // Equip a bonded sentimental vest (bond>=25) in torso AND a legacy 'feet'
    // alias item: they must not double-count one body into full-set level.
    s6.equipped = {
      torso: { itemId: 'vest_test', id: 'vest_test_1', bond: 30 },
      feet: { itemId: 'boot_test', id: 'boot_test_1', bond: 30 },
    };
    G.data.items = (G.data.items || []).concat([
      { id: 'vest_test', name: 'Test Vest', class: 'sentimental', armor: { beamResist: false } },
      { id: 'boot_test', name: 'Test Boot', class: 'sentimental', armor: { beamResist: false } },
    ]);
    const pieces = G.apBeamResistPieces();
    ok(pieces.length <= 2, `seed ${seed}: F-CHECK: ${pieces.length} pieces counted for torso+feet (alias must not inflate)`);
  }

  console.log('\nALL ' + N + ' CHECKS DONE');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
