#!/usr/bin/env node
// SPAWN-RATE AUDIT SIM (Steve 2026-10-06): measure the encounter system as it
// actually behaves. 500+ tile entries across tile types x day ranges x day parts.
// Seeded PRNG so numbers are reproducible. Run: node scripts/sim-spawn-rates-20261006.js [seed]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// --- seeded PRNG (mulberry32) ---
let _s = parseInt(process.argv[2] || '42', 10) >>> 0;
console.log(`seed=${_s}`);
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
Game.say = () => {}; // quiet

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // Freeze wanderer (part B measures it separately); park a fake far away.
  Game.wanderer = { x: -999, y: -999, dir: 1, monsterId: 'hummice', veteran: false };
  Game.encounterDone = true; // prevent wanderer respawn attempts

  const mdefById = {};
  for (const m of Game.data.monsters) mdefById[m.id] = m;
  const wavePool = (day) => Game.state.scholar.day = day; // helper below

  const TILE_TYPES = ['thicket', 'meadow', 'ruin', 'wetland', 'creek', 'forest_floor', 'grove', 'trail_edge'];
  const DAY_CASES = [ { label: 'days1-3', day: 2 }, { label: 'days4-7', day: 5 }, { label: 'days8+', day: 10 } ];
  const PARTS = [0, 1, 2, 3];
  const PART_NAME = ['dawn', 'midday', 'dusk', 'night'];
  const ITERS = 60; // 8 x 3 x 4 x 60 = 5760 tile entries

  const cells = {};
  for (const t of TILE_TYPES) for (const d of DAY_CASES) for (const p of PARTS) {
    const key = `${t}|${d.label}|p${p}`;
    cells[key] = { spawns: 0, dodges: 0, byId: {}, byWave: {}, byAct: {} };
  }

  const s = Game.state.scholar;
  for (const t of TILE_TYPES) {
    Game.map.tiles[Game.map.py][Game.map.px].type = t;
    for (const d of DAY_CASES) {
      s.day = d.day;
      if (d.day >= 7) Game.state.systemArrived = true; else Game.state.systemArrived = false;
      for (const p of PARTS) {
        Game.dayPart = p;
        const key = `${t}|${d.label}|p${p}`;
        const c = cells[key];
        for (let i = 0; i < ITERS; i++) {
          s.monster = null; s.animal = null;
          s.noisyUntil = 0; s.skunkScent = 0;
          Game.checkEncounter();
          if (s.monster) {
            c.spawns++;
            const md = mdefById[s.monster.id] || {};
            c.byId[s.monster.id] = (c.byId[s.monster.id] || 0) + 1;
            c.byWave[md.wave || 1] = (c.byWave[md.wave || 1] || 0) + 1;
            c.byAct[md.activity || '?'] = (c.byAct[md.activity || '?'] || 0) + 1;
          }
          s.monster = null;
        }
      }
    }
  }

  // --- encounter rate table: tile x day range (aggregated over parts) ---
  console.log('\n=== ENCOUNTER RATE per tile entry (60 iters x 4 parts = 240 per cell) ===');
  for (const t of TILE_TYPES) {
    const row = DAY_CASES.map(d => {
      let sp = 0, n = 0;
      for (const p of PARTS) { const c = cells[`${t}|${d.label}|p${p}`]; sp += c.spawns; n += ITERS; }
      return `${(sp / n * 100).toFixed(1)}%`;
    });
    console.log(`  ${t.padEnd(12)} days1-3: ${row[0].padStart(6)}  days4-7: ${row[1].padStart(6)}  days8+: ${row[2].padStart(6)}`);
  }

  // --- activity appropriateness: midday vs night mix ---
  console.log('\n=== ACTIVITY MIX (days 1-7, wave-1 pool) ===');
  for (const p of [1, 3]) {
    const agg = {};
    for (const t of TILE_TYPES) {
      for (const d of DAY_CASES.slice(0, 2)) {
        const c = cells[`${t}|days${d.label === 'days1-3' ? '1-3' : '4-7'}|p${p}`];
        for (const [a, n] of Object.entries(c.byAct)) agg[a] = (agg[a] || 0) + n;
      }
    }
    const tot = Object.values(agg).reduce((a, b) => a + b, 0);
    const mix = Object.entries(agg).map(([a, n]) => `${a}=${(n / tot * 100).toFixed(0)}%`).join(' ');
    console.log(`  ${PART_NAME[p].padEnd(8)}: ${mix}  (n=${tot})`);
  }

  // --- wave mix after System arrival (day 10) ---
  console.log('\n=== WAVE MIX after System arrival (day 10, all parts+tiles) ===');
  const wmix = {}, wid = {};
  for (const t of TILE_TYPES) for (const p of PARTS) {
    const c = cells[`${t}|days8+|p${p}`];
    for (const [w, n] of Object.entries(c.byWave)) wmix[w] = (wmix[w] || 0) + n;
    for (const [id, n] of Object.entries(c.byId)) wid[id] = (wid[id] || 0) + n;
  }
  const wtot = Object.values(wmix).reduce((a, b) => a + b, 0);
  console.log('  wave mix:', Object.entries(wmix).map(([w, n]) => `w${w}=${(n / wtot * 100).toFixed(0)}%`).join(' '), `(n=${wtot})`);
  const sorted = Object.entries(wid).sort((a, b) => b[1] - a[1]);
  console.log('  top 8 spawned:', sorted.slice(0, 8).map(([id, n]) => `${id}:${(n / wtot * 100).toFixed(0)}%`).join(' '));
  console.log('  bottom 6 spawned:', sorted.slice(-6).map(([id, n]) => `${id}:${(n / wtot * 100).toFixed(1)}%`).join(' '));

  // --- wave-1 only variety (days 1-3): do the same few dominate? ---
  console.log('\n=== WAVE-1 variety days 1-3 (all parts+tiles, n across 13 monsters) ===');
  const v1 = {};
  for (const t of TILE_TYPES) for (const p of PARTS) {
    const c = cells[`${t}|days1-3|p${p}`];
    for (const [id, n] of Object.entries(c.byId)) v1[id] = (v1[id] || 0) + n;
  }
  const v1tot = Object.values(v1).reduce((a, b) => a + b, 0);
  console.log('  ' + Object.entries(v1).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}:${(n / v1tot * 100).toFixed(0)}%`).join(' '));

  // --- animal rate for contrast ---
  console.log('\n=== ANIMAL encounter rate per tile entry (for contrast, day 2) ===');
  Game.wanderer = { x: -999, y: -999, dir: 1, monsterId: 'hummice' };
  s.day = 2; Game.dayPart = 1; Game.state.systemArrived = false;
  let asp = 0; const AN = 500;
  for (const t of TILE_TYPES) {
    Game.map.tiles[Game.map.py][Game.map.px].type = t;
    let c = 0;
    for (let i = 0; i < AN; i++) { s.animal = null; Game.checkAnimals(); if (s.animal) c++; s.animal = null; }
    console.log(`  ${t.padEnd(12)} ${(c / AN * 100).toFixed(1)}%`);
    asp += c;
  }
  console.log(`  animal avg across tiles: ${(asp / (AN * TILE_TYPES.length) * 100).toFixed(1)}%`);
})();
