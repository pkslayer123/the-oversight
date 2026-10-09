// Break-it alien-players r4 (N): lifeline re-verification after the
// contest-engine pass (7ef1946 touched contests.js + alienPlayers.js copy).
// Re-greens the pass-3 lifeline proofs: verdict silence, arena save with
// 10% HP restore, forPlayer gate, 7-day cooldown.
const H = require('./break-alien-harness.js');
const assert = require('assert');
let N = 0;
function ok(c, m) { N++; assert(c, m); console.log('ok ' + N + ' - ' + m); }
// Wave-2 eligibility (pass-3 setup): alien systems gate on systemArrived +
// unlockedWave() >= 2. fresh() alone leaves wave 1 -> silent early-returns.
const _rawFresh = H.fresh.bind(H);
function setup(day) {
  const s = _rawFresh(day);
  H.Game.state.waveKills = { 1: 10 };
  H.Game.isSafeTile = () => false;
  H.Game.apReadinessCheck = () => ({ ready: true, score: 999, reasons: ['test'] });
  return s;
}
const realRandom = Math.random;
function forceRoll(v) { Math.random = () => v; }
function unforce() { Math.random = realRandom; }

(async () => {
  await H.boot();
  const seeds = [20261009, 777, 4242];

  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game; const ap = G.apState();

    // Setup: bonded benevolent ally (beat Old Tam twice).
    ap.met = { old_tam: { encounters: 3, bond: 2, lastOutcome: 'won', lastDay: 28 } };
    ap.lastLifelineDay = -999;

    // ---- N1: verdict-path call never fires the lifeline ----
    let fires = 0, burns = 0;
    for (let t = 0; t < 200; t++) {
      ap.lastLifelineDay = -999;
      const r = G.apContestInterference({ participants: ['v1'] }); // NO forPlayer
      if (r && r.deathSave) fires++;
      if (ap.lastLifelineDay === s.day) burns++;
      s.day++;
    }
    ok(fires === 0, `seed ${seed}: verdict call never returns deathSave (${fires}/200)`);
    ok(burns === 0, `seed ${seed}: verdict call never burns the 7-day cooldown (${burns}/200)`);

    // ---- N2: forPlayer call CAN fire (40%), consumes cooldown, saves ----
    H.RNG.reset(seed); const s2 = setup(30); const ap2 = H.Game.apState();
    ap2.met = { old_tam: { encounters: 3, bond: 2, lastOutcome: 'won', lastDay: 28 } };
    ap2.lastLifelineDay = -999;
    let saved = 0, trials = 0;
    for (let t = 0; t < 200; t++) {
      ap2.lastLifelineDay = -999;
      const r = H.Game.apContestInterference({ participants: ['player'] }, { forPlayer: true });
      trials++;
      if (r && r.deathSave) saved++;
    }
    ok(saved > 0 && saved < trials, `seed ${seed}: forPlayer lifeline fires sometimes (${saved}/${trials}, design 40%)`);
    // Cooldown enforced: fire once, then it must go quiet.
    ap2.lastLifelineDay = s2.day;
    forceRoll(0.01);
    let r2;
    try { r2 = H.Game.apContestInterference({ participants: ['player'] }, { forPlayer: true }); } finally { unforce(); }
    ok(!r2.deathSave, `seed ${seed}: 7-day cooldown blocks a second lifeline`);

    // ---- N3: bond gate — unbonded benevolent can't save ----
    H.RNG.reset(seed); const s3 = setup(30); const ap3 = H.Game.apState();
    ap3.met = { old_tam: { encounters: 1, bond: 0, lastOutcome: 'won', lastDay: 28 } };
    ap3.lastLifelineDay = -999;
    forceRoll(0.01);
    let r3;
    try { r3 = H.Game.apContestInterference({ participants: ['player'] }, { forPlayer: true }); } finally { unforce(); }
    ok(!r3.deathSave, `seed ${seed}: bond < 2 blocks the lifeline even on a lucky roll`);

    // ---- N4: arena path — the save restores 10% HP and clears arena routing ----
    // (pass-3 fix: tbEnd 'lost' branch checks the lifeline when state.arenaContest
    // is active, restores 10% maxHealth, clears arena routing, ends 'lost'.)
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'js', 'game.js'), 'utf8');
    ok(src.includes('apContestInterference(_arenaAc, { forPlayer: true })'),
      `seed ${seed}: tbEnd lost-branch still consults the lifeline forPlayer on arena deaths`);
    ok(src.includes('_sS.health = Math.max(1, Math.round(_mh * 0.1))'),
      `seed ${seed}: arena save restores 10% maxHealth (min 1) — no 0-HP death-by-morning`);
    ok(src.indexOf('_arenaSaved = !!') < src.indexOf('this.state.arenaContest = null') &&
       src.indexOf('this.state.arenaContest = null') < src.indexOf("this._contestEnd(_arenaAc, 'lost', false)"),
      `seed ${seed}: arena save clears arena routing before _contestEnd`);
    ok(src.includes("this._contestEnd(_arenaAc, 'lost', false)"),
      `seed ${seed}: arena save ends the contest 'lost' (death -> lost, no XP farm)`);
  }

  console.log(`\nPASS: ${N} asserts (lifeline re-verification)`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
