#!/usr/bin/env node
// test-spawn-rates-20261006.js — PROOF for the spawn-rate audit (Steve 2026-10-06).
//
// BEFORE (HEAD~1): Poisson spawns (whole quiet days then ambush clusters),
//   night legs identical to day legs, wanderer one-shot per run, tile-entry
//   spawns ignore castMonster's 60/40 wave ratios (measured 55/45 at day 10).
// AFTER (worktree): pity anti-clustering, night x1.5, wanderer recurrence
//   (new wanderer 4 days after a contact), tile-entry spawns use
//   spawnWaveTarget — the same 60/40 ratios as castMonster.
//
// Every change cites playtest evidence in the header comment of game.js.
// Usage: node scripts/test-spawn-rates-20261006.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// --- seeded PRNG: deterministic runs ---
let _s = 20261006;
function reseed(s) { _s = s >>> 0; }
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const realRandom = Math.random;

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const ENGINE = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js'];
const REST = ['src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
  'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'];

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// boot a Game from a game.js source string (HEAD~1 = before, worktree = after)
function boot(gameSrc) {
  delete globalThis.Scattering;
  for (const f of ENGINE) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  eval(gameSrc);
  for (const f of REST) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return globalThis.Scattering.Game;
}
async function newRun(Game, opts = {}) {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.say = () => {};
  const s = Game.state.scholar;
  Game.map.px = 3; Game.map.py = 3;
  Game.map.tiles[3][3].type = opts.tile || 'forest_floor';
  s.day = opts.day || 2;
  Game.dayPart = opts.part == null ? 1 : opts.part;
  Game.state.systemArrived = !!opts.arrived;
  // park a fake wanderer far away so the wanderer system doesn't pollute rate measurements
  Game.wanderer = { x: -999, y: -999, dir: 1, monsterId: 'hummice', veteran: false };
  Game.encounterDone = true;
  return s;
}
// n tile entries on the current tile; returns {rate, spawns, byWave, byAct, maxGap}
function measure(Game, s, n) {
  const mdefById = {};
  for (const m of Game.data.monsters) mdefById[m.id] = m;
  let spawns = 0, gap = 0, maxGap = 0;
  const byWave = {}, byAct = {}, byId = {};
  for (let i = 0; i < n; i++) {
    s.monster = null; s.noisyUntil = 0; s.skunkScent = 0;
    Game.checkEncounter();
    if (s.monster) {
      spawns++; gap = 0;
      const md = mdefById[s.monster.id] || {};
      byWave[md.wave || 1] = (byWave[md.wave || 1] || 0) + 1;
      byAct[md.activity || '?'] = (byAct[md.activity || '?'] || 0) + 1;
      byId[s.monster.id] = (byId[s.monster.id] || 0) + 1;
    } else { gap++; if (gap > maxGap) maxGap = gap; }
    s.monster = null;
  }
  return { rate: spawns / n, spawns, byWave, byAct, byId, maxGap };
}

(async () => {
  const NEW_SRC = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  // BEFORE baseline: pinned to the pre-audit commit, NOT HEAD~1 — relative
  // refs shift as this branch grows and silently turn "before" into "after".
  const BEFORE_COMMIT = '02b096a';
  const OLD_SRC = execSync(`git show ${BEFORE_COMMIT}:src/js/game.js`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();

  // ============ AFTER: new behavior ============
  console.log('AFTER (worktree):');
  let Game = boot(NEW_SRC);

  // 1. tile gradient: thickets dangerous, meadows safe
  reseed(101);
  let s = await newRun(Game, { tile: 'thicket' });
  const rThicket = measure(Game, s, 1200).rate;
  reseed(102);
  s = await newRun(Game, { tile: 'meadow' });
  const rMeadow = measure(Game, s, 1200).rate;
  reseed(103);
  s = await newRun(Game, { tile: 'forest_floor' });
  const rBase = measure(Game, s, 1200).rate;
  reseed(104);
  s = await newRun(Game, { tile: 'ruin' });
  const rRuin = measure(Game, s, 1200).rate;
  console.log(`    rates: thicket=${(rThicket * 100).toFixed(1)}% base=${(rBase * 100).toFixed(1)}% meadow=${(rMeadow * 100).toFixed(1)}% ruin=${(rRuin * 100).toFixed(1)}%`);
  ok('thicket >= 2x meadow (danger gradient)', rThicket >= 2 * rMeadow, `${(rThicket * 100).toFixed(1)}% vs ${(rMeadow * 100).toFixed(1)}%`);
  ok('thicket band 15-35%', rThicket >= 0.15 && rThicket <= 0.35, (rThicket * 100).toFixed(1) + '%');
  ok('meadow band 4-20% (still safe)', rMeadow >= 0.04 && rMeadow <= 0.20, (rMeadow * 100).toFixed(1) + '%');
  ok('base band 8-26%', rBase >= 0.08 && rBase <= 0.26, (rBase * 100).toFixed(1) + '%');
  ok('ruin band 12-32%', rRuin >= 0.12 && rRuin <= 0.32, (rRuin * 100).toFixed(1) + '%');

  // 2. pity mechanics
  reseed(105);
  s = await newRun(Game, {});
  Math.random = () => 0.99; // never spawn
  for (let i = 0; i < 3; i++) { s.monster = null; Game.checkEncounter(); s.monster = null; }
  ok('pity: misses accumulate', s.spawnMisses === 3, 'spawnMisses=' + s.spawnMisses);
  Math.random = () => 0.0; // always spawn
  s.monster = null; Game.checkEncounter();
  ok('pity: spawn resets misses', s.spawnMisses === 0 && !!s.monster, 'spawnMisses=' + s.spawnMisses);
  Math.random = realRandom;
  reseed(106);
  s = await newRun(Game, {});
  const drought = measure(Game, s, 800);
  console.log(`    800 base-tile entries: max drought gap = ${drought.maxGap} entries`);
  ok('pity: no drought longer than 30 entries in 800', drought.maxGap <= 30, 'maxGap=' + drought.maxGap);

  // 3. night is tangibly riskier
  reseed(107);
  s = await newRun(Game, { part: 1 });
  const rDay = measure(Game, s, 1500).rate;
  reseed(108);
  s = await newRun(Game, { part: 3 });
  const rNight = measure(Game, s, 1500).rate;
  const ratio = rNight / rDay;
  console.log(`    day=${(rDay * 100).toFixed(1)}% night=${(rNight * 100).toFixed(1)}% ratio=${ratio.toFixed(2)}`);
  ok('night rate ~1.5x day rate', ratio >= 1.2 && ratio <= 1.9, 'ratio=' + ratio.toFixed(2));

  // 4. wave ratio post-arrival: 60/40 like castMonster
  reseed(109);
  s = await newRun(Game, { day: 10, arrived: true });
  const wm = measure(Game, s, 1500);
  const w2share = (wm.byWave[2] || 0) / wm.spawns;
  console.log(`    post-arrival wave mix: w1=${(((wm.byWave[1] || 0) / wm.spawns) * 100).toFixed(0)}% w2=${(w2share * 100).toFixed(0)}% (n=${wm.spawns})`);
  ok('post-arrival wave-2 share 50-70%', w2share >= 0.5 && w2share <= 0.7, (w2share * 100).toFixed(1) + '%');

  // 5. night ecology intact: the night belongs to nocturnal things
  reseed(110);
  s = await newRun(Game, { part: 3 });
  const nightMix = measure(Game, s, 900);
  const nocShare = (nightMix.byAct.nocturnal || 0) / nightMix.spawns;
  reseed(111);
  s = await newRun(Game, { part: 1 });
  const dayMix = measure(Game, s, 900);
  const diShare = (dayMix.byAct.diurnal || 0) / dayMix.spawns;
  console.log(`    night: nocturnal=${(nocShare * 100).toFixed(0)}% | midday: diurnal=${(diShare * 100).toFixed(0)}%`);
  ok('night spawns >= 70% nocturnal', nocShare >= 0.7, (nocShare * 100).toFixed(1) + '%');
  ok('midday spawns >= 70% diurnal', diShare >= 0.7, (diShare * 100).toFixed(1) + '%');

  // 6. wanderer recurrence: contact -> quiet 3 days -> new wanderer on day+4
  reseed(112);
  Game = boot(NEW_SRC);
  s = await newRun(Game, { day: 3 });
  Game.wanderer = null; Game.encounterDone = false; // unpark for this test
  s.monster = null; Game.checkEncounter(); s.monster = null;
  ok('wanderer spawns on day 3', !!Game.wanderer, '');
  const w1id = Game.wanderer.monsterId;
  Game.map.px = Game.wanderer.x; Game.map.py = Game.wanderer.y; // walk into it
  s.monster = null; Game.checkEncounter(); s.monster = null;
  ok('contact consumes wanderer, sets next day = day+4',
    !Game.wanderer && Game.encounterDone === true && Game.state.wandererNextDay === 7,
    `nextDay=${Game.state.wandererNextDay}`);
  let respawnedEarly = false;
  for (const d of [4, 5, 6]) {
    s.day = d; Game.map.px = 3; Game.map.py = 3;
    s.monster = null; Game.checkEncounter(); s.monster = null;
    if (Game.wanderer) respawnedEarly = true;
  }
  ok('no new wanderer on days 4-6', !respawnedEarly, '');
  s.day = 7;
  s.monster = null; Game.checkEncounter(); s.monster = null;
  ok('new wanderer spawns on day 7', !!Game.wanderer, Game.wanderer ? `id=${Game.wanderer.monsterId} (was ${w1id})` : 'none');

  // 7. castMonster refactor intact
  reseed(113);
  Game = boot(NEW_SRC);
  s = await newRun(Game, { day: 2 });
  let allW1 = true, shapeOk = true;
  for (let i = 0; i < 50; i++) {
    const c = Game.castMonster();
    const id = c.id || c;
    const md = Game.data.monsters.find(m => m.id === id);
    if ((md.wave || 1) !== 1) allW1 = false;
    if (typeof c !== 'object' || !c.id || typeof c.veteran !== 'boolean') shapeOk = false;
  }
  ok('castMonster pre-unlock: all wave-1, {id, veteran} shape', allW1 && shapeOk, '');
  s.day = 8; Game.state.waveKills = { 1: 4 }; // unlock wave 2 via kills
  let w2count = 0;
  for (let i = 0; i < 200; i++) {
    const c = Game.castMonster();
    const md = Game.data.monsters.find(m => m.id === (c.id || c));
    if ((md.wave || 1) === 2) w2count++;
  }
  const w2r = w2count / 200;
  ok('castMonster post-unlock: ~60% wave-2', w2r >= 0.45 && w2r <= 0.75, (w2r * 100).toFixed(0) + '%');

  // 8. safe tiles: haven rolls nothing, pity doesn't accumulate
  reseed(114);
  Game = boot(NEW_SRC);
  s = await newRun(Game, { tile: 'haven' });
  let havenSpawns = 0;
  for (let i = 0; i < 50; i++) { s.monster = null; Game.checkEncounter(); if (s.monster) havenSpawns++; s.monster = null; }
  ok('haven: 0 spawns in 50 entries, no pity accrual', havenSpawns === 0 && (s.spawnMisses || 0) === 0, `spawns=${havenSpawns}`);

  // ============ BEFORE: old behavior (HEAD~1) ============
  console.log('BEFORE (HEAD~1):');
  Game = boot(OLD_SRC);

  // no pity
  reseed(105);
  s = await newRun(Game, {});
  Math.random = () => 0.99;
  for (let i = 0; i < 3; i++) { s.monster = null; Game.checkEncounter(); s.monster = null; }
  Math.random = realRandom;
  ok('before: no spawnMisses tracking', s.spawnMisses === undefined, 'spawnMisses=' + s.spawnMisses);

  // night == day
  reseed(107);
  s = await newRun(Game, { part: 1 });
  const oDay = measure(Game, s, 1500).rate;
  reseed(108);
  s = await newRun(Game, { part: 3 });
  const oNight = measure(Game, s, 1500).rate;
  const oRatio = oNight / oDay;
  console.log(`    before: day=${(oDay * 100).toFixed(1)}% night=${(oNight * 100).toFixed(1)}% ratio=${oRatio.toFixed(2)}`);
  ok('before: night ratio ~1.0 (no night distinction)', oRatio >= 0.75 && oRatio <= 1.3, 'ratio=' + oRatio.toFixed(2));

  // uniform wave mix
  reseed(109);
  s = await newRun(Game, { day: 10, arrived: true });
  const owm = measure(Game, s, 1500);
  const ow2 = (owm.byWave[2] || 0) / owm.spawns;
  console.log(`    before: post-arrival w2 share=${(ow2 * 100).toFixed(0)}%`);
  ok('before: wave mix uniform-ish (w2 35-55%)', ow2 >= 0.35 && ow2 <= 0.55, (ow2 * 100).toFixed(1) + '%');

  // wanderer one-shot
  reseed(112);
  Game = boot(OLD_SRC);
  s = await newRun(Game, { day: 3 });
  Game.wanderer = null; Game.encounterDone = false;
  s.monster = null; Game.checkEncounter(); s.monster = null;
  Game.map.px = Game.wanderer.x; Game.map.py = Game.wanderer.y;
  s.monster = null; Game.checkEncounter(); s.monster = null;
  s.day = 7; Game.map.px = 3; Game.map.py = 3;
  s.monster = null; Game.checkEncounter(); s.monster = null;
  ok('before: wanderer never respawns after contact', !Game.wanderer, '');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
