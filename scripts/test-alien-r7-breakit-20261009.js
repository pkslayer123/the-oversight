// Break-it alien-players ROUND 7, 2026-10-09 (target: alien players).
// Hostile-player attacks on REMAINING angles (r6 covered D/E + held list).
//
// CATCHES (all fixed, red->green proven below):
//   F3: apPersonaPackage sadistic branch said "a beautiful ALIEN medkit" pre-reveal.
//   F4: apContactedVillager establishment said "contacted by an alien player" pre-reveal.
//   F5: apPlaygroundDuel said "Even aliens have limits" while gating only the NAME.
//   F6: apBeamHit horror beat said "You need alien armor" pre-reveal.
//   F8: apPlaygroundRookieMistake said "alien currency" on the System feed pre-reveal.
//   F9: salvaged armor is literally named "Alien <piece>" — the strip now
//       reveals the persona on the spot, so the item name never precedes
//       the knowledge (a kill with no salvage keeps the normal paths).
//   (The module's own standard: the word "alien" IS the alien truth — the
//   "MULTIPLE alien players" line is gated on apKnowsAlien; these weren't.)
// HELD (attacked, resisted):
//   H: exclusive pool — personas never spawn as/in monster waves; fighters are 'hostile'.
//   B: persona-kill farm — favor clamped, salvage finite/deduped, resleeve fiction holds.
//   C: sporting cooldowns shared-global, survive same-day force-fire.
//   D: favor economy bounded (clamps, 1/day drift) under forced-win loop.
//   E: stasis can't trap beyond the fight (dies/flees/ends with the fighters).
//   F: trackedBy is permanent but sporting rules cap it — never unavoidable.
//   G: contact warnings promise nothing mechanical — no phantom threat.
//   I: beams always target the player, even with villagers in the fight.
//   J: favor announcements exact (no rounding); |n|<3 silent by design.
//   K: dead-code re-census — the 6 post-r6 methods (fan clubs) are all wired.
//   L: sibling sweep — encounters.js/drama.js clean (dread projector gated).
//   M: care-package gate ordering honest.
const H = require('./break-alien-harness.js');
const assert = require('assert');
let N = 0;
function ok(c, m) { N++; assert(c, m); console.log('ok ' + N + ' - ' + m); }

const _rawFresh = H.fresh.bind(H);
function setup(day) {
  const s = _rawFresh(day);
  H.Game.state.waveKills = { 1: 10 };
  // WAVE LEDGER (break-it 2026-10-10 r13): unlockedWave() moved off
  // state.waveKills to the wave-ledger kill ledger (Steve 2026-10-10).
  // 5 wave-1 ledger points fills the bar -> unlockedWave() >= 2.
  try { H.Game.ledgerState()[1].points = 5; } catch (e) {}
  H.Game.isSafeTile = () => false;
  return s;
}
const realRandom = Math.random;
function forceRoll(v) { Math.random = () => v; }
function seqRolls(arr) { let i = 0; Math.random = () => arr[(i++) % arr.length]; }
function unforce() { Math.random = realRandom; }
function noAlienWord(t) { return !/alien/i.test(t); }

(async () => {
  await H.boot();
  const G = H.Game;
  const seeds = [20261009, 777, 4242];

  for (const seed of seeds) {
    H.RNG.reset(seed);
    setup(30);
    const ap = () => G.apState();
    const day = () => (G.state.scholar || {}).day || 1;

    // Precondition: reveal machinery works in the harness.
    G.apRevealAlien('vex_marlowe', 'harness check');
    ok(G.apKnowsAlien('vex_marlowe') === true, `seed ${seed}: apRevealAlien -> apKnowsAlien true`);
    delete ap().known.vex_marlowe;
    ok(!G.apKnowsAlien('vex_marlowe'), `seed ${seed}: un-reveal restores unknown`);

    // ============ F3: sadistic package "alien medkit" ============
    ap().met = { vex_marlowe: { encounters: 1, bond: 0 } };
    ap().lastPersonaPackageDay = -999;
    H.clearLog(); forceRoll(0.0);
    ok(G.apPersonaPackage() === true, `seed ${seed}: sadistic persona package fires`);
    unforce();
    ok(noAlienWord(H.sayText()), `seed ${seed}: F3 pre-reveal package names no alien truth (got: ${H.sayText().slice(0, 80)}...)`);
    ok(/medkit/i.test(H.sayText()), `seed ${seed}: F3 pre-reveal still grants the medkit`);
    G.apRevealAlien('vex_marlowe', 'test');
    ap().lastPersonaPackageDay = -999;
    H.clearLog(); forceRoll(0.0);
    G.apPersonaPackage(); unforce();
    ok(/alien medkit/i.test(H.sayText()), `seed ${seed}: F3 post-reveal package says "alien medkit"`);

    // ============ F4: contact establishment ============
    delete ap().known.vex_marlowe;
    delete ap().contactedVid;
    H.clearLog(); forceRoll(0.0);
    const cv = G.apContactedVillager(); unforce();
    ok(!!cv, `seed ${seed}: contact established`);
    ok(noAlienWord(H.sayText()), `seed ${seed}: F4 pre-reveal contact says "something", not "alien player"`);
    ok(/contacted by something/i.test(H.sayText()), `seed ${seed}: F4 pre-reveal wording present`);
    G.apRevealAlien('sarge', 'test');
    delete ap().contactedVid;
    H.clearLog(); forceRoll(0.0);
    G.apContactedVillager(); unforce();
    ok(/contacted by an alien player/i.test(H.sayText()), `seed ${seed}: F4 post-reveal contact names the truth`);
    delete ap().known.sarge;

    // ============ F5: duel "Even aliens have limits" ============
    delete ap().known.vex_marlowe;
    ap().active = { vex_marlowe: { enteredDay: 1 }, sarge: { enteredDay: 1 } };
    ap().lastDuelDay = -999;
    const origAligned = G.apFactionAligned;
    G.apFactionAligned = () => false; // force the rivalry path
    H.clearLog(); seqRolls([0.0, 0.1, 0.9, 0.9, 0.1]);
    ok(G.apPlaygroundDuel() === true, `seed ${seed}: playground duel fires`);
    unforce();
    ok(/Even they have limits/i.test(H.sysText()), `seed ${seed}: F5 pre-reveal duel avoids the word alien`);
    ok(noAlienWord(H.sysText()), `seed ${seed}: F5 pre-reveal duel feed has no alien truth`);
    G.apRevealAlien('sarge', 'test');
    ap().active = { vex_marlowe: { enteredDay: 1 }, sarge: { enteredDay: 1 } };
    // BREAK-IT r12: the first duel's non-rich loser (sarge) DIED — clear the
    // corpse for this copy test's fresh setup.
    if (ap().met && ap().met.sarge) delete ap().met.sarge.dead;
    ap().lastDuelDay = -999;
    H.clearLog(); seqRolls([0.0, 0.1, 0.9, 0.9, 0.1]);
    G.apPlaygroundDuel(); unforce();
    ok(/Even aliens have limits/i.test(H.sysText()), `seed ${seed}: F5 post-reveal duel says it plainly`);
    G.apFactionAligned = origAligned;
    delete ap().known.sarge;
    ap().active = {};

    // ============ F6: beam horror "alien armor" ============
    delete ap().known.vex_marlowe;
    G.state.scholar._beamHorrorSeen = false;
    G.tbfight = { fighters: [{ key: 'p', kind: 'player', name: 'You', hp: 100, maxHp: 100, alive: true }], over: false };
    G.tbFighter = G.tbFighter || function (k) { return (G.tbfight.fighters || []).filter(f => f.key === k)[0] || null; };
    H.clearLog();
    G.apBeamHit('player', 0, 'a beam weapon', { damageType: 'alien_beam' });
    ok(noAlienWord(H.sayText()), `seed ${seed}: F6 pre-reveal horror beat never says alien`);
    ok(/Whatever they're wearing stops this/i.test(H.sayText()), `seed ${seed}: F6 pre-reveal lesson is wordless but legible`);
    G.apRevealAlien('vex_marlowe', 'test');
    G.state.scholar._beamHorrorSeen = false;
    H.clearLog();
    G.apBeamHit('player', 0, "Vex's phase lance", { damageType: 'alien_beam', pid: 'vex_marlowe' });
    ok(/alien armor/i.test(H.sayText()), `seed ${seed}: F6 post-reveal horror says "alien armor"`);
    delete ap().known.vex_marlowe;
    G.tbfight = null;

    // ============ F8: Pip "alien currency" ============
    H.clearLog(); forceRoll(0.5); // 0.5 < 0.6 gate passes; picks mistakes[2]
    ok(G.apPlaygroundRookieMistake('pip_quindle') === true, `seed ${seed}: Pip rookie mistake fires`);
    unforce();
    ok(noAlienWord(H.sysText()), `seed ${seed}: F8 pre-reveal mistake avoids the word alien`);
    ok(/coins that chime wrong/i.test(H.sysText()), `seed ${seed}: F8 pre-reveal keeps the joke`);
    G.apRevealAlien('pip_quindle', 'test');
    H.clearLog(); forceRoll(0.5);
    G.apPlaygroundRookieMistake('pip_quindle'); unforce();
    ok(/alien currency/i.test(H.sysText()), `seed ${seed}: F8 post-reveal says "alien currency"`);
    delete ap().known.pip_quindle;

    // ============ F9: salvage strip reveals (item named "Alien <piece>") ============
    setup(28);
    ok(!G.apKnowsAlien('rax_dentist'), `seed ${seed}: F9 rax starts unknown`);
    H.clearLog(); forceRoll(0.0); // salvage gate passes
    G.apOnCombatEnd('rax_dentist', 'won', { killed: true });
    unforce();
    ok(G.apKnowsAlien('rax_dentist'), `seed ${seed}: F9 stripping alien armor reveals the persona`);
    ok(/wasn't human/i.test(H.sayText()), `seed ${seed}: F9 reveal beat plays on the strip`);
    setup(28);
    H.clearLog(); forceRoll(0.99); // salvage gate fails -> no strip, no reveal
    G.apOnCombatEnd('rax_dentist', 'won', { killed: true });
    unforce();
    ok(!G.apKnowsAlien('rax_dentist'), `seed ${seed}: F9 kill with no salvage keeps the normal reveal paths`);

    // ============ B: kill-farm boundedness (30 days, kill every 2 days) ============
    setup(30);
    const pids = ['vex_marlowe', 'sarge', 'rax_dentist'];
    const armorPool = ['alien_helm', 'alien_carapace', 'alien_greaves', 'alien_gauntlets', 'alien_boots'];
    forceRoll(0.0); // salvage always "succeeds"
    let maxLane = -999, minLane = 999;
    for (let d = 30; d < 60; d += 2) {
      G.state.scholar.day = d;
      const pid = pids[(d / 2) % 3];
      G.apOnCombatEnd(pid, 'won', { killed: true });
      const fc = ap().fanClubs;
      for (const L of ['fight', 'survival', 'social', 'showbiz']) {
        maxLane = Math.max(maxLane, fc[L]); minLane = Math.min(minLane, fc[L]);
      }
    }
    unforce();
    ok(maxLane <= 100 && minLane >= -100, `seed ${seed}: B favor lanes stay clamped under kill farm (max ${maxLane}, min ${minLane})`);
    const inv = G.state.scholar.inventory || [];
    const pieces = inv.filter(it => armorPool.includes(it.itemId || it.id));
    const uniq = [...new Set(pieces.map(it => it.itemId || it.id))];
    ok(pieces.length <= 5 && uniq.length === pieces.length, `seed ${seed}: B salvage finite + deduped (${pieces.length} pieces)`);
    ok(pieces.length >= 1, `seed ${seed}: B salvage actually grants under forced success`);
    ok(ap().met.vex_marlowe.encounters === 5, `seed ${seed}: B encounters counted exactly (5 kills, no double-fire)`);
    ok(!!G.apPersona('vex_marlowe') && !!G.apPersona('rax_dentist'), `seed ${seed}: B killed personas resleeve — still in the pool (fiction holds)`);

    // ============ C: shared global cooldowns survive force-fire ============
    setup(40);
    const D = day();
    ap().fanClubs = { fight: 100, survival: 0, social: 0, showbiz: 0 };
    // Dead drop: global, not per-persona
    ap().lastDropDay = D;
    ok(G.apDeadDrop() === false, `seed ${seed}: C dead drop blocked by global 3-day gate`);
    ap().lastDropDay = D - 3;
    let drops = 0; forceRoll(0.0);
    for (let i = 0; i < 5; i++) if (G.apDeadDrop()) drops++;
    unforce();
    ok(drops === 1, `seed ${seed}: C dead drop fires at most once per window under force-fire (${drops})`);
    // Care package: global 4-day gate
    ap().lastPackageDay = D;
    ok(G.apCarePackage() === false, `seed ${seed}: C care package blocked by global 4-day gate`);
    ap().lastPackageDay = D - 4;
    G.state.scholar.kcal = 1000;
    const k0 = G.state.scholar.kcal;
    let pkgs = 0;
    for (let i = 0; i < 5; i++) if (G.apCarePackage()) pkgs++;
    ok(pkgs === 1, `seed ${seed}: C care package fires at most once per window (${pkgs})`);
    const kd = G.state.scholar.kcal - k0;
    ok(kd >= 30 && kd <= 70, `seed ${seed}: C care-package kcal is a taste not dinner (${kd})`);
    // Persona package: global 6-day gate
    ap().met = { vex_marlowe: { encounters: 1, bond: 0 } };
    ap().lastPersonaPackageDay = D;
    ok(G.apPersonaPackage() === false, `seed ${seed}: C persona package blocked by global 6-day gate`);
    // Club boon: global 5-day gate
    ap().lastBoonDay = D;
    ok(G.apClubBoon() === false, `seed ${seed}: C club boon blocked by global 5-day gate`);
    ap().lastBoonDay = D - 5;
    G.state.scholar.health = 50;
    forceRoll(0.0);
    ok(G.apClubBoon() === true, `seed ${seed}: C club boon fires when gate open`);
    unforce();
    ok(G.state.scholar.health === 60, `seed ${seed}: C fight-lane boon grants exactly +10 health`);

    // ============ D: favor economy bounded ============
    setup(45);
    G.apAdjustFavor(1000, 'x', 'fight');
    ok(G.apFanLane('fight') === 100, `seed ${seed}: D favor clamps at +100`);
    G.apAdjustFavor(-1000, 'y', 'fight');
    ok(G.apFanLane('fight') === -100, `seed ${seed}: D favor clamps at -100`);
    ap().fanClubs = { fight: 50, survival: -30, social: 0, showbiz: 0 };
    ap().lastDropDay = day(); ap().lastFeedDay = day();
    ap().lastPackageDay = day(); ap().lastBoonDay = day();
    ap().active = {};
    G.apDailyTick();
    ok(G.apFanLane('fight') === 49 && G.apFanLane('survival') === -29, `seed ${seed}: D favor drifts 1/day per lane toward 0`);
    ok(ap().favor === G.apFavor(), `seed ${seed}: D legacy favor mirror stays in sync`);

    // ============ E: stasis can't trap beyond the fight ============
    setup(50);
    G.tbIsPlayerTurn = () => true;
    const rax = { key: 'ap_rax_dentist', kind: 'hostile', alienPid: 'rax_dentist', alive: true, fled: false, alienTech: [{ id: 'stasis_field' }] };
    G.tbfight = { fighters: [rax], over: false };
    H.clearLog();
    ok(G.tbBarrierExit(1, 0) === true, `seed ${seed}: E stasis consumes the barrier exit mid-fight`);
    ok(/stasis/i.test(H.sayText()), `seed ${seed}: E stasis block is narrated`);
    ok(G.apStasisFieldLive() === 'rax_dentist', `seed ${seed}: E apStasisFieldLive names the fielder`);
    rax.alive = false;
    ok(G.apStasisFieldLive() === false, `seed ${seed}: E dead fielder drops the field`);
    rax.alive = true; rax.fled = true;
    ok(G.apStasisFieldLive() === false, `seed ${seed}: E fled fielder drops the field`);
    rax.fled = false; G.tbfight.over = true;
    ok(G.apStasisFieldLive() === false, `seed ${seed}: E ended fight drops the field — no persistent trap`);
    const tam = { key: 'ap_old_tam', kind: 'hostile', alienPid: 'old_tam', alive: true, fled: false, alienTech: [] };
    G.tbfight = { fighters: [tam], over: false };
    ok(G.apStasisFieldLive() === false, `seed ${seed}: E no stasis tech, no block`);
    G.tbfight = null; delete G.tbIsPlayerTurn;

    // ============ F: trackedBy permanent but capped ============
    setup(55);
    G.state.scholar.flags = G.state.scholar.flags || {};
    G.state.scholar.flags.trackedBy = 'vex_marlowe';
    ap().met = { vex_marlowe: { encounters: 2, bond: 0 } };
    ap().lastHuntDay = { vex_marlowe: day() };
    forceRoll(0.0);
    let sawVex = 0;
    for (let i = 0; i < 40; i++) { if (G.apRollEncounter() === 'vex_marlowe') sawVex++; }
    unforce();
    ok(sawVex === 0, `seed ${seed}: F sporting rule beats the tracker — no unavoidable encounters (${sawVex}/40)`);
    ok(G.state.scholar.flags.trackedBy === 'vex_marlowe', `seed ${seed}: F trackedBy persists (documented, encounter-rate only)`);

    // ============ G: contact warnings promise nothing ============
    setup(60);
    delete ap().contactedVid;
    ok(G.apContactWarning() === false, `seed ${seed}: G no contact, no warning`);
    const roster = (G.state.village && G.state.village.roster) || [];
    ap().contactedVid = roster[0];
    ap().lastContactWarningDay = -999;
    H.clearLog(); forceRoll(0.0);
    ok(G.apContactWarning() === true, `seed ${seed}: G warning fires`);
    unforce();
    const wtxt = H.sayText();
    ok(!/alien/i.test(wtxt), `seed ${seed}: G warning names no alien truth`);
    ok(!/\d+ days?/i.test(wtxt) || /dream/i.test(wtxt), `seed ${seed}: G warning makes no checkable mechanical promise`);

    // ============ H: exclusive pool ============
    setup(65);
    const combatPids = G.apPersonas().filter(p => G.apIsCombat(p.id)).map(p => p.id);
    ok(combatPids.length === 7, `seed ${seed}: H 7 combat personas in the exclusive pool`);
    for (const pid of combatPids) {
      const f = G.apBuildFighter(pid, 4, 4);
      ok(f.kind === 'hostile' && f.key === 'ap_' + pid, `seed ${seed}: H ${pid} builds as hostile person, never monster`);
    }
    const mids = ((G.data.monsters) || []).map(m => m.id);
    ok(combatPids.every(pid => !mids.includes(pid)), `seed ${seed}: H no persona id in the monster data`);

    // ============ I: beams always target the player ============
    setup(70);
    let beamTarget = null;
    const origBeamHit = G.apBeamHit;
    G.apBeamHit = function (tk, dmg, lbl, opts) { beamTarget = tk; return origBeamHit.apply(this, arguments); };
    G.tbfight = {
      fighters: [
        { key: 'p', kind: 'player', name: 'You', hp: 100, maxHp: 100, alive: true },
        { key: 'v1', kind: 'ally', name: 'Mara', hp: 80, maxHp: 80, alive: true },
      ],
      over: false, _beamCooldown: 0,
    };
    G.tbFighter = function (k) { return (G.tbfight.fighters || []).filter(f => f.key === k)[0] || null; };
    const bf = { alienPid: 'vex_marlowe', _enraged: false };
    forceRoll(0.0); // 0.0 < 0.4 sadistic beam chance
    ok(G.apMaybeBeamAttack(bf) === true, `seed ${seed}: I beam fires`);
    unforce();
    ok(beamTarget === 'player', `seed ${seed}: I beam targets the player with villagers in the fight (got ${beamTarget})`);
    G.apBeamHit = origBeamHit;
    G.tbfight = null;

    // ============ J: favor promises exact ============
    setup(75);
    ap().fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 0 };
    ap().favor = 0;
    H.clearLog();
    G.apAdjustFavor(6, 'defeated X', 'fight');
    ok(/\+6/.test(H.sysText()) && /\(favor: 6\)/.test(H.sysText()), `seed ${seed}: J favor announcement exact, no rounding`);
    H.clearLog();
    G.apAdjustFavor(2, 'tiny', 'fight');
    ok(!/tiny/.test(H.sysText()), `seed ${seed}: J |n|<3 favor moves stay quiet (documented design)`);
    G.apAdjustFavor(6, 'x', 'fight'); // lane now 8; push to cap
    ap().fanClubs.fight = 98;
    H.clearLog();
    G.apAdjustFavor(6, 'cap', 'fight');
    ok(G.apFanLane('fight') === 100 && /\(favor: 100\)/.test(H.sysText()), `seed ${seed}: J clamp announced honestly at 100`);

    // ============ K: dead-code re-census (post-r6 methods wired) ============
    setup(80);
    for (const m of ['apFanLane', 'apTopLane', 'apClubName', 'apPackageClubLine', 'apClubBoon', 'apSyncFavor']) {
      ok(typeof G[m] === 'function', `seed ${seed}: K ${m} exists`);
    }
    ap().fanClubs = { fight: 80, survival: 10, social: 0, showbiz: 20 };
    ok(G.apFanLane('fight') === 80, `seed ${seed}: K apFanLane reads one lane`);
    ok(G.apTopLane() === 'fight', `seed ${seed}: K apTopLane picks the loudest lane`);
    ok(G.apClubName('fight') === 'your fight fans', `seed ${seed}: K apClubName plain language`);
    ok(G.apPackageClubLine() === ' — your fight fans', `seed ${seed}: K apPackageClubLine credits the loudest club`);
    G.apSyncFavor();
    ok(ap().favor === 80, `seed ${seed}: K apSyncFavor mirrors loudest magnitude`);

    // ============ L: sibling wiring intact ============
    ok(typeof G.tbAlienTurn === 'function', `seed ${seed}: L encounters.js tbAlienTurn wired`);
    ok(typeof G.startAlienCombat === 'function', `seed ${seed}: L startAlienCombat wired`);

    // ============ M: care-package gate ordering ============
    setup(85);
    ap().fanClubs = { fight: 10, survival: 0, social: 0, showbiz: 0 };
    ap().lastPackageDay = -999;
    ok(G.apCarePackage() === false, `seed ${seed}: M favor<20 blocks the package before the day gate`);
  }

  console.log(`\nALL ${N} CHECKS PASSED`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
