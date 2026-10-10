#!/usr/bin/env node
// PACING SIM: wave-unlock timeline vs the ~100-day win target (Steve 2026-10-10).
// Models a run's kill accumulation and reads the REAL unlock-gate logic shape
// from game.js (unlockedWave): day>=8 && k1>=4 -> w2; day>=25 && k2>=8 -> w3;
// k3>=5 && regional -> w4; k4>=5 && national -> w5. Spawn ratios copied exactly
// from Game.spawnWaveTarget. Scale days are scenario parameters (regional =
// first link, national = polity built — trust takes weeks).
//
// Answers: for a steady/aggressive fighter, what day does w5 unlock? A strong
// run should win ~day 80-120, so w5 needs to unlock ~day 60-85 to leave a
// real w5 era (2+ distinct Producers faced) before the table.
//
// Usage: SEED=1 node scripts/sim-wave-pacing-20261010.js [fightRate] [nationalDay]
//   fightRate: fights/day for a strong run (default 0.5). nationalDay default 60.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
const FIGHT_RATE = parseFloat(process.argv[2] || '0.5');
const NATIONAL_DAY = parseInt(process.argv[3] || '60', 10);
const REGIONAL_DAY = 18;

// Exact copy of Game.spawnWaveTarget ratios (game.js).
function spawnWave(top, rnd) {
  const r = rnd();
  if (top <= 1) return 1;
  if (top === 2) return r < 0.6 ? 2 : 1;
  if (top === 3) return r < 0.6 ? 3 : (r < 0.85 ? 2 : 1);
  if (top === 4) return r < 0.6 ? 4 : (r < 0.8 ? 3 : (r < 0.95 ? 2 : 1));
  if (r < 0.55) return 5;
  if (r < 0.75) return 4;
  if (r < 0.87) return 3;
  return r < 0.95 ? 2 : 1;
}
// Exact copy of Game.unlockedWave gate shape.
function unlockedWave(day, kills, regional, national) {
  if ((kills[4] || 0) >= 5 && national) return 5;
  if ((kills[3] || 0) >= 5 && regional) return 4;
  if (day >= 25 && (kills[2] || 0) >= 8) return 3;
  if (day >= 8 && (kills[1] || 0) >= 4) return 2;
  return 1;
}

const W5_IDS = 8; // 8 distinct wave-5 monsters
const KILL_P = 0.75; // strong build kills most fights it takes
const results = [];
const RUNS = 200;
for (let run = 0; run < RUNS; run++) {
  const rnd = mulberry32(SEED * 100003 + run);
  const kills = {};
  const unlock = { 2: null, 3: null, 4: null, 5: null };
  const w5Faced = new Set();
  let w5done = null;
  for (let day = 1; day <= 200; day++) {
    const regional = day >= REGIONAL_DAY, national = day >= NATIONAL_DAY;
    const top = unlockedWave(day, kills, regional, national);
    for (const w of [2, 3, 4, 5]) if (!unlock[w] && top >= w) unlock[w] = day;
    if (rnd() < FIGHT_RATE) {
      const w = spawnWave(top, rnd);
      if (rnd() < KILL_P) kills[w] = (kills[w] || 0) + 1;
      // deed: distinct w5 faced (fights count — you stood on the grid)
      if (w === 5 && w5done === null) {
        w5Faced.add(Math.floor(rnd() * W5_IDS));
        if (w5Faced.size >= 2) w5done = day;
      }
    }
    if (w5done !== null && unlock[5] !== null) break;
  }
  results.push({ unlock, w5done });
}
const med = (arr) => { const s = arr.filter(x => x !== null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const hit = (arr) => arr.filter(x => x !== null).length;
console.log(`SEED ${SEED} fightRate ${FIGHT_RATE}/day nationalDay ${NATIONAL_DAY} runs ${RUNS}`);
for (const w of [2, 3, 4, 5]) {
  const days = results.map(r => r.unlock[w]);
  console.log(`  w${w} unlock: median day ${med(days)} (reached ${hit(days)}/${RUNS})`);
}
const done = results.map(r => r.w5done);
console.log(`  2+ distinct w5 faced: median day ${med(done)} (reached ${hit(done)}/${RUNS})`);
