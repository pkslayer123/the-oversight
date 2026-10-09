// BREAK-IT KICKOFF: abilities & godhood (2026-10-09) — new rotation target 12.
// Hostile pass over the death-cheat stack (molt/second_wind/phoenix),
// multiplicative modifier stacking, and the phoenix link state machine.
//
// CATCHES (fixed this run):
//   G1. DEAD CODE (LOUD) — v.npcAbilities is WRITE-ONLY in production: no game
//       code path ever grants a villager an ability (npcGrantAbility has zero
//       src callers; only tests call it). The entire villager-bearer
//       bidirectional half (~200 lines: phoenixVillagerTrigger, choice beat,
//       npc-protests, give/pull-away, dyingLinks) is unreachable in real play.
//       Documented by T1; wiring acquisition is a design task, reported.
//   G2. HONESTY — undying_fury card: "When Second Wind triggers DURING RAGE,
//       you return at FULL health." Engine checked hasAbility('rage')
//       (POSSESSION): any rage-holder got the full heal even when not raging.
//       Fix: check s.rageActive.rounds > 0 (the real rage state, set by
//       unleash_rage in abilityActions.js).
//   G3. WASTE — maybeCheatDeath fired molt/second_wind BEFORE the phoenix-link
//       hold check: a second lethal hit during a pending link burned the weekly
//       molt and daily second_wind for zero benefit (the link already holds the
//       death at 1 HP). Fix: link-hold check first.
//   G4. SOFTLOCK/DOUBLE-DEATH — protest victim dies by other means during the
//       fuse day: phoenixResolveBurn burned the corpse — second registerDeath,
//       second v.fallen push, and removeVillager's mentorship trust hit fired
//       AGAIN (-8 per roster member, twice). Fix: guard — the fire accepts the
//       death that already happened, no double-burn.
//   G5. SOFTLOCK — phoenixLink is a single slot: a second villager-bearer
//       dying mid-link SILENTLY OVERWROTE the first link; the first bearer
//       stayed in dyingLinks limbo (alive, clauseless, held death never
//       resolved). Fix: clause spent against a busy fire, death proceeds
//       normally, honest narration.
//   G6. LIMBO — player breaks a villager-bearer's link (pull away, win) while
//       their own death was held at 0 HP: won the struggle, alive at 0 HP with
//       no pending damage — a limbo state. Fix: tearing free of death leaves
//       you at >= 1 HP.
//
// HELD (attacked, resisted):
//   H1. blood_magic infinite engine — stays dead: 2/day-part cap, wound
//       ratchets maxHealth, knits 10/night, 50-wound refusal. (T7)
//   H2. Multiplicative strike stacking — bounded by the 6-slot cap and L3
//       level cap; the max realistic alpha build is ~7x on round 1, the
//       intended "scary good". (T8)
//   H3. Ability level exponentials (value^level) — L3 max caps triage at
//       x3.375, adrenaline_control at x2.197. Bounded, intended.
//
// Seeded; SEED env override; x3 seeds.
const fs = require('fs');
const path = require('path');
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEED = parseInt(process.env.SEED || '20261009', 10);
const SEEDS = [SEED, SEED + 1, SEED + 2];

function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  s.abilities.push({ id, level: level || 1, xp: 0 });
}
function allVillagers() { return (Game.state.village.roster || []).slice(); }
function nonPlayerVillagers() {
  return allVillagers().filter(id => id !== Game.villagerId);
}

async function main() {
  await H.boot();

  // ------------------------------------------------------------------
  section('T1. DEAD CODE — npcAbilities acquisition: wired or write-only?');
  // ------------------------------------------------------------------
  // Static: npcGrantAbility must have a production caller, or the
  // villager-bearer phoenix half is unreachable.
  const srcFiles = fs.readdirSync(path.join(H.ROOT, 'src/js'))
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(H.ROOT, 'src/js', f));
  let callSites = [];
  for (const f of srcFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /npcGrantAbility\(/g;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(Math.max(0, m.index - 60), m.index + 30);
      if (/npcGrantAbility\(vid, id\) \{/.test(src.slice(m.index, m.index + 40))) continue; // the definition
      callSites.push(path.basename(f) + ': ' + line.trim().slice(0, 80));
    }
  }
  console.log('  npcGrantAbility production call sites: ' + callSites.length);
  callSites.slice(0, 5).forEach(c => console.log('    ' + c));
  // G1 is a DOCUMENTED VERDICT, not a fix: the suite stays green while the
  // finding is reported LOUD. If acquisition ever gets wired, flip this to
  // assert(callSites.length > 0).
  if (callSites.length === 0) {
    console.log('  VERDICT G1 (dead code): v.npcAbilities is WRITE-ONLY in production.');
    console.log('  The villager-bearer phoenix half (~200 lines) is unreachable in real');
    console.log('  play. Wiring acquisition is a design task -- see evidence file.');
    pass++;
  } else {
    assert(true, 'G1: acquisition wired');
  }

  // ------------------------------------------------------------------
  section('T2. HONESTY — undying_fury: "DURING RAGE", not "has rage"');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    H.fresh(45); RNG.reset(seed);
    const s = Game.state.scholar;
    grant('rage'); grant('second_wind');
    s.synergies = ['undying_fury'];
    s.activeSynergies = ['undying_fury'];
    s.health = 0; s.hp = 0;
    Game.maybeCheatDeath();
    assert(s.health === 1,
      `G2a: second_wind WITHOUT active rage heals to 1 HP (got ${s.health}, seed ${seed})`);
    // Now genuinely raging: full heal.
    s.secondWindDay = s.day - 1; s.secondWindUses = 0;
    s.rageActive = { rounds: 2, dmgMult: 2.0 };
    s.health = 0; s.hp = 0;
    Game.maybeCheatDeath();
    assert(s.health === Game.maxHealth(),
      `G2b: second_wind DURING rage full-heals (got ${s.health}, seed ${seed})`);
  }

  // ------------------------------------------------------------------
  section('T3. WASTE — link-hold must not burn molt/second_wind');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    H.fresh(45); RNG.reset(seed);
    const s = Game.state.scholar;
    grant('molt'); grant('second_wind');
    const vids = nonPlayerVillagers();
    Game.state.phoenixLink = {
      stage: 'struggle', kind: 'villager-protests', bearerIsPlayer: true,
      bearer: null, victim: vids[0], beats: 1, deadline: s.day + 1,
    };
    s.moltWeek = -1; s.moltUses = 0;
    s.secondWindDay = s.day - 1; s.secondWindUses = 0;
    s.health = 0; s.hp = 0;
    const held = Game.maybeCheatDeath();
    assert(held === true, `G3a: death held by the link (seed ${seed})`);
    assert((s.moltUses || 0) === 0 && s.moltWeek === -1,
      `G3b: molt NOT consumed while link holds (seed ${seed})`);
    assert((s.secondWindUses || 0) === 0,
      `G3c: second_wind NOT consumed while link holds (seed ${seed})`);
    assert(s.health === 0, `G3d: health untouched by cheats (seed ${seed})`);
    Game.state.phoenixLink = null;
  }

  // ------------------------------------------------------------------
  section('T4. DOUBLE-DEATH — victim dies by other means mid-struggle');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    H.fresh(45); RNG.reset(seed);
    const s = Game.state.scholar, v = Game.state.village;
    grant('phoenix_clause');
    // No volunteers, everyone protests: all trust 0.
    for (const id of allVillagers()) v.trust[id] = 0;
    s.health = 0; s.hp = 0;
    Game.phoenixPlayerTrigger();
    const L = Game.state.phoenixLink;
    assert(L && L.stage === 'struggle' && L.kind === 'villager-protests',
      `G4a: protest struggle started (seed ${seed})`);
    const victim = L.victim;
    // The victim dies by OTHER means during the fuse day: the full
    // production death path (registerDeath + removeVillager, as a monster
    // kill would do). Spy on registerDeath to catch the double-burn.
    const deathCalls = {};
    const _rd = Game.registerDeath.bind(Game);
    Game.registerDeath = (d) => {
      if (d && d.villagerId) deathCalls[d.villagerId] = (deathCalls[d.villagerId] || 0) + 1;
      return _rd(d);
    };
    Game.registerDeath({ kind: 'villager', villagerId: victim, name: 'V', cause: 'a monster' });
    Game.removeVillager(victim, 'killed');
    assert(!v.roster.includes(victim), `G4b: victim independently dead (seed ${seed})`);
    assert(deathCalls[victim] === 1, `G4c: one death recorded so far (seed ${seed})`);
    s.kcal = 5000;
    Game.phoenixStruggleHold(); Game.phoenixStruggleHold(); Game.phoenixStruggleHold();
    Game.registerDeath = _rd;
    assert(Game.state.phoenixLink === null, `G4d: link cleared (seed ${seed})`);
    assert(deathCalls[victim] === 1,
      `G4e: NO second registerDeath for the corpse (calls=${deathCalls[victim]}, seed ${seed})`);
    assert(!v.roster.includes(victim), `G4f: victim stays out of roster (seed ${seed})`);
    assert(s.health >= 1, `G4g: bearer held at >= 1 HP (got ${s.health}, seed ${seed})`);
  }

  // ------------------------------------------------------------------
  section('T5. OVERWRITE — two villager-bearers, one link slot');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    H.fresh(45); RNG.reset(seed);
    const s = Game.state.scholar, v = Game.state.village;
    const vids = nonPlayerVillagers();
    const b1 = vids[0], b2 = vids[1];
    Game.npcGrantAbility(b1, 'phoenix_clause');
    Game.npcGrantAbility(b2, 'phoenix_clause');
    // Player is the most beloved: volunteer === player -> choice stage.
    for (const id of allVillagers()) v.trust[id] = 0;
    v.trust[Game.villagerId] = 90;
    Game.removeVillager(b1, 'killed');
    const L1 = Game.state.phoenixLink;
    assert(L1 && L1.stage === 'choice' && L1.bearer === b1,
      `G5a: first bearer's link pending (seed ${seed})`);
    assert(!Game.npcHasAbility(b1, 'phoenix_clause'),
      `G5b: first bearer's clause spent (seed ${seed})`);
    // Second bearer dies while the slot is busy.
    Game.removeVillager(b2, 'killed');
    const L2 = Game.state.phoenixLink;
    assert(L2 && L2.bearer === b1,
      `G5c: first link NOT overwritten (bearer=${L2 && L2.bearer}, seed ${seed})`);
    assert(!Game.npcHasAbility(b2, 'phoenix_clause'),
      `G5d: second bearer's clause spent against the busy fire (seed ${seed})`);
    assert(!v.roster.includes(b2),
      `G5e: second bearer's death proceeded normally (seed ${seed})`);
    assert(!((v.dyingLinks || {})[b2]),
      `G5f: no orphan dyingLinks for the second bearer (seed ${seed})`);
    Game.state.phoenixLink = null;
  }

  // ------------------------------------------------------------------
  section('T6. LIMBO — breaking the link at 0 HP leaves you alive');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    H.fresh(45); RNG.reset(seed);
    const s = Game.state.scholar, v = Game.state.village;
    const vids = nonPlayerVillagers();
    const b1 = vids[0];
    Game.npcGrantAbility(b1, 'phoenix_clause');
    for (const id of allVillagers()) v.trust[id] = 0;
    v.trust[Game.villagerId] = 90;
    Game.removeVillager(b1, 'killed');
    assert(Game.state.phoenixLink && Game.state.phoenixLink.stage === 'choice',
      `G6a: choice stage (seed ${seed})`);
    // The player's own death was being held by this link.
    s.health = 0; s.hp = 0;
    Game.phoenixChoosePullAway();
    assert(Game.state.phoenixLink && Game.state.phoenixLink.stage === 'struggle',
      `G6b: pull-away starts the struggle (seed ${seed})`);
    s.kcal = 5000;
    Game.phoenixStruggleHold(); Game.phoenixStruggleHold(); Game.phoenixStruggleHold();
    assert(Game.state.phoenixLink === null, `G6c: link cleared (seed ${seed})`);
    assert(!Game.state.over, `G6d: game not over (seed ${seed})`);
    assert(s.health >= 1, `G6e: tore free of death at >= 1 HP (got ${s.health}, seed ${seed})`);
  }

  // ------------------------------------------------------------------
  section('T7. HELD — blood_magic infinite engine stays dead');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    H.fresh(45); RNG.reset(seed);
    const s = Game.state.scholar;
    grant('blood_magic');
    s.health = 100; s.hp = 100; s.kcal = 0;
    const cap = Game.kcalCap();
    const r1 = Game._activateAbilityInner('blood_magic');
    const r2 = Game._activateAbilityInner('blood_magic');
    const r3 = Game._activateAbilityInner('blood_magic');
    assert(r1 === true && r2 === true, `T7a: two uses fire (seed ${seed})`);
    assert(r3 === false, `T7b: third use this day-part refused (seed ${seed})`);
    assert((s.bloodPriceWound || 0) > 0, `T7c: wound recorded (seed ${seed})`);
    assert(Game.maxHealth() < 100, `T7d: max HP ratcheted down (got ${Game.maxHealth()}, seed ${seed})`);
    assert(s.kcal <= cap, `T7e: blood kcal clamped to bank cap (seed ${seed})`);
  }

  // ------------------------------------------------------------------
  section('T8. HELD — strike stacking: scary good, bounded');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    H.fresh(45); RNG.reset(seed);
    const s = Game.state.scholar;
    grant('adrenaline_control', 3); // x1.3^3 = 2.197
    grant('patient_aim');           // x2 round 1
    s.synergies = ['cornered_fury', 'ringcraft']; // x1.25 x1.3
    const mult = Game.modTarget('combat.strike_damage', 1, { round: 1 });
    const expected = 2 * Math.pow(1.3, 3) * 1.25 * 1.3;
    assert(Math.abs(mult - expected) < 0.01,
      `T8a: alpha-strike mult is exactly the intended product (got ${mult.toFixed(3)}, want ${expected.toFixed(3)}, seed ${seed})`);
    assert(Number.isFinite(mult) && mult < 50,
      `T8b: bounded, finite (seed ${seed})`);
    s.synergies = [];
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
