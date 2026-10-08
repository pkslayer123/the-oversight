// Proof: break-it monsters run — wave-escalation gate honesty (Steve 2026-10-08).
// CATCH: two spawn paths disagreed on the wave-2 gate. monsterWavePool()
// (tile-entry spawns + background maintainWorldMonsters) keyed wave 2 on
// System arrival (day 7) with NO kill requirement, while unlockedWave() —
// used by castMonster, the loot tiers, and the "Wave 2 talent has been
// released" announcement — requires day 8 + 4 wave-1 kills. Measured on HEAD:
// day 7, System arrived, zero kills -> pool was 13/28 wave-2 and
// spawnWaveTarget dealt ~58% wave-2, while unlockedWave() said 1.
// FIX: monsterWavePool() follows unlockedWave() — one gate everywhere.
// (Figure-it-out-yourself call 2026-10-08: the kill gate is the deliberate
// design — "prove you can handle it" — so the pool follows it, not the
// day-7 arrival.)
'use strict';
const H = require('./break-monsters-harness.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};

(async () => {
  const Game = await H.freshGame(99);

  const setDay = (day, arrived, kills) => {
    Game.state.scholar.day = day;
    Game.state.systemArrived = arrived;
    Game.state.waveKills = kills || {};
  };

  // 1. Day 7, arrived, ZERO kills: no wave-2 in the spawn pool.
  setDay(7, true, {});
  let pool = Game.monsterWavePool();
  let w2 = pool.filter(m => (m.wave || 1) === 2);
  ok('day 7 / 0 kills: pool is wave-1 only', w2.length === 0 && pool.length === 15,
     `pool=${pool.length}, wave2=${w2.length}`);
  ok('day 7 / 0 kills: unlockedWave()=1 agrees', Game.unlockedWave() === 1);

  // 2. Day 8, arrived, 4 wave-1 kills: wave 2 unlocks on BOTH paths.
  setDay(8, true, { 1: 4 });
  pool = Game.monsterWavePool();
  w2 = pool.filter(m => (m.wave || 1) === 2);
  ok('day 8 / 4 kills: wave-2 enters the pool', w2.length === 13, `wave2=${w2.length}`);
  ok('day 8 / 4 kills: unlockedWave()=2 agrees', Game.unlockedWave() === 2);

  // 3. Day 8, arrived, only 3 kills: still wave-1.
  setDay(8, true, { 1: 3 });
  pool = Game.monsterWavePool();
  ok('day 8 / 3 kills: pool stays wave-1', pool.every(m => (m.wave || 1) === 1));

  // 4. Day 7 with 99 kills: day gate still holds (no wave 2 before day 8).
  setDay(7, true, { 1: 99 });
  pool = Game.monsterWavePool();
  ok('day 7 / 99 kills: day gate holds, pool wave-1 only',
     pool.every(m => (m.wave || 1) === 1));

  // 5. spawnWaveTarget over the gated pool can never deal wave 2 pre-unlock.
  setDay(7, true, {});
  pool = Game.monsterWavePool();
  H.seedRng(4242);
  let dealt2 = 0;
  for (let i = 0; i < 2000; i++) if (Game.spawnWaveTarget(pool) === 2) dealt2++;
  ok('day 7: spawnWaveTarget never deals wave 2 (2000 draws)', dealt2 === 0, `dealt2=${dealt2}`);

  // 6. Post-unlock the 60/40 newest-wave ratio still holds (Steve 2026-10-06).
  setDay(8, true, { 1: 4 });
  pool = Game.monsterWavePool();
  H.seedRng(777);
  const tw = { 1: 0, 2: 0 };
  for (let i = 0; i < 5000; i++) tw[Game.spawnWaveTarget(pool)]++;
  const r2 = tw[2] / 5000;
  ok('post-unlock: ~60% newest-wave ratio preserved', r2 > 0.55 && r2 < 0.65,
     `wave2 share=${r2.toFixed(3)}`);

  // 7. castMonster agrees with the pool gate (both use unlockedWave now).
  setDay(7, true, {});
  H.seedRng(31337);
  let cast2 = 0;
  for (let i = 0; i < 500; i++) {
    const cast = Game.castMonster();
    const id = (cast && cast.id) || cast;
    const m = Game.data.monsters.find(x => x.id === id);
    if ((m.wave || 1) === 2) cast2++;
  }
  ok('day 7: castMonster never casts wave 2 (500 casts)', cast2 === 0, `cast2=${cast2}`);

  console.log(`\nwave-gate proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
