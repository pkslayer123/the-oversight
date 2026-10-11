// BREAK-IT: alien economy bounds + sporting rules + trackedBy (Steve 2026-10-08).
// ATTACKS:
//   1. EXPLOIT: apDailyTick hands out free kcal (dead drops, care packages,
//      persona packages). Simulate 90 days at max favor with forced wins —
//      total free kcal must be BOUNDED (cooldowns hold), never infinite.
//   2. SPORTING RULES (held from the 2026-10-08 fix): the weighted pool must
//      not re-pick a persona fought within 2 days. Re-verify.
//   3. trackedBy (sadistic persona package: "they're watching"): the flag was
//      set but NEVER READ — dead. FIX: the tracking persona gets triple
//      weight in apRollEncounter (they find you). Assert the boost is real.
// These assertions encode the FIXED behavior — the trackedBy ones FAIL before.
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

function eligibleGame(seed, day) {
  RNG.reset(seed);
  const s = H.fresh(day || 45);
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  Game.isSafeTile = () => false;
  Game.state.waveKills = { 1: 10 };
  // WAVE LEDGER (break-it 2026-10-10 r13): unlockedWave() reads the
  // wave-ledger kill ledger now (Steve 2026-10-10), not waveKills.
  try { Game.ledgerState()[1].points = 5; } catch (e) {}
  Game.state.party = [{ id: 'a' }, { id: 'b' }];
  s.day = day || 45;
  // BELLY EMPTY (break-it 2026-10-10 r13): scholar kcal clamps at kcalCap
  // (2400) on every grant — starting at 3000 made `total > 0` impossible
  // even when every system fires (the first grant clamps 3000->2400).
  // Empty belly: grants accumulate, the bound still guards cooldowns.
  s.kcal = 0;
  return s;
}

async function main() {
  await H.boot();

  section('EXPLOIT: 90 days of free alien kcal stays bounded');
  for (const seed of [SEED, SEED + 1]) {
    eligibleGame(seed, 40);
    const s = Game.state.scholar;
    const ap = Game.apState();
    // Hostile-max setup: bonded benevolent (dead drops), high favor (care
    // packages), met rivals (persona packages).
    ap.met['old_tam'] = { encounters: 2, bond: 3, lastOutcome: 'won' };
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0, lastOutcome: 'lost' };
    ap.known['wren'] = 'test';
    let startKcal = s.kcal;
    for (let d = 40; d < 130; d++) {
      s.day = d;
      Game.apAdjustFavor(90, 'test pin', 'fight'); // re-max every day (the hostile player keeps winning; per-lane audit-shows 2026-10-09)
      try { Game.apDailyTick(); } catch (e) {}
    }
    const total = s.kcal - startKcal;
    // Bounds: dead drop <= 1/3d (~30 * ~500 max), care pkg <= 1/4d (~23 *
    // ~1500 max at favor 90: 300+400+450), persona pkg <= 1/6d (~15 * ~700).
    // Generous ceiling: 30*500 + 23*1500 + 15*700 = 60000. Anything above =
    // a cooldown is broken.
    console.log('  seed ' + seed + ': 90d free kcal = ' + total);
    assert(total < 60000, 'seed ' + seed + ': 90-day free kcal bounded (' + total + ' < 60000)');
    assert(total > 0, 'seed ' + seed + ': the systems do fire (not silently dead)');
  }

  section('cooldown gates are exact (no double-dipping within windows)');
  {
    eligibleGame(SEED + 5, 60);
    const s = Game.state.scholar;
    const ap = Game.apState();
    ap.fanClubs = { fight: 90, survival: 0, social: 0, showbiz: 0 }; Game.apSyncFavor(); ap.lastPackageDay = -999; ap.lastDropDay = -999; // per-lane (audit-shows 2026-10-09)
    ap.lastPersonaPackageDay = -999;
    ap.met['old_tam'] = { encounters: 2, bond: 3 };
    ap.met['vex_marlowe'] = { encounters: 3, bond: 0 };
    s.day = 60;
    let care = 0, drop = 0, ppkg = 0;
    for (let d = 60; d < 90; d++) {
      s.day = d;
      const d0 = ap.lastDropDay, c0 = ap.lastPackageDay, p0 = ap.lastPersonaPackageDay;
      try { Game.apDeadDrop(); } catch (e) {}
      try { Game.apCarePackage(); } catch (e) {}
      try { Game.apPersonaPackage(); } catch (e) {}
      if (ap.lastDropDay !== d0) drop++;
      if (ap.lastPackageDay !== c0) care++;
      if (ap.lastPersonaPackageDay !== p0) ppkg++;
    }
    console.log('  30d: drops=' + drop + ' care=' + care + ' persona=' + ppkg);
    assert(drop <= 10, 'dead drops <= 10 in 30d (3-day gate), got ' + drop);
    assert(care <= 8, 'care packages <= 8 in 30d (4-day gate), got ' + care);
    assert(ppkg <= 5, 'persona packages <= 5 in 30d (6-day gate), got ' + ppkg);
  }

  section('SPORTING RULES hold: no re-pick within 2 days (weighted path)');
  {
    eligibleGame(SEED + 7, 60);
    const ap = Game.apState();
    const s = Game.state.scholar;
    const picks = []; // {pid, day}
    // Force every roll to succeed; advance the day so the 2-day gate rotates.
    for (let i = 0; i < 30; i++) {
      s.day = 60 + i;
      let pid = null;
      const real = Math.random;
      // roll succeeds (0.0 < chance), weighted pick takes first available
      Math.random = () => 0.0;
      try { pid = Game.apRollEncounter(); } catch (e) {}
      Math.random = real;
      // Production always pairs roll -> apStartEncounter (encounters.js,
      // debug-scenarios.js); the start records lastHuntDay on success
      // (break-it 2026-10-08: single source of truth, covers group chains).
      // Model the paired start here so the sporting filter sees the hunt.
      if (pid) { try { Game.apState().lastHuntDay[pid] = 60 + i; } catch (e2) {} picks.push({ pid: pid, day: 60 + i }); }
    }
    console.log('  picks: ' + picks.map(p => p.pid + '@' + p.day).join(','));
    let violation = null;
    const lastDay = {};
    for (const p of picks) {
      if (lastDay[p.pid] !== undefined && p.day - lastDay[p.pid] < 2) { violation = p.pid + ' (day ' + lastDay[p.pid] + ' -> ' + p.day + ')'; break; }
      lastDay[p.pid] = p.day;
    }
    assert(violation === null, 'no persona re-picked within 2 days (' + (violation || 'clean') + ')');
    assert(picks.length >= 10, 'pool still yields encounters under the gate (' + picks.length + ' picks)');
  }

  section('trackedBy: the tracker finds you (dead flag -> live weight)');
  {
    // Baseline: no tracker. (Reset ONCE per loop — per-iteration resets of
    // consecutive seeds correlate the LCG's first draw and starve the 8%.)
    eligibleGame(SEED + 9, 60);
    const counts = {};
    let tot = 0;
    RNG.reset(SEED + 1000);
    for (let i = 0; i < 1200; i++) {
      Game.state.scholar.day = 60 + i; // let the 2-day gate rotate
      const pid = Game.apRollEncounter();
      if (pid) { counts[pid] = (counts[pid] || 0) + 1; tot++; }
    }
    const baseVex = (counts['vex_marlowe'] || 0);
    // Tracked: s.flags.trackedBy = vex. Same seed -> comparable streams.
    eligibleGame(SEED + 9, 60);
    Game.state.scholar.flags = { trackedBy: 'vex_marlowe' };
    const counts2 = {};
    let tot2 = 0;
    RNG.reset(SEED + 1000);
    for (let i = 0; i < 1200; i++) {
      Game.state.scholar.day = 60 + i;
      const pid = Game.apRollEncounter();
      if (pid) { counts2[pid] = (counts2[pid] || 0) + 1; tot2++; }
    }
    const trackedVex = (counts2['vex_marlowe'] || 0);
    console.log('  vex share: baseline ' + baseVex + '/' + tot + ' -> tracked ' + trackedVex + '/' + tot2);
    assert(trackedVex > baseVex, 'tracked persona picked strictly more often (' + trackedVex + ' > ' + baseVex + ')');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
