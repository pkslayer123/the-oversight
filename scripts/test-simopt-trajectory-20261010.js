#!/usr/bin/env node
// test-simopt-trajectory-20261010.js — HONESTY PROOF for sim-opt phase 2
// (2026-10-10). For fixed seeds, run D days with optimizations ON (SIMOPT=1,
// default) vs OFF (SIMOPT=0), hashing a canonical per-day snapshot. Hashes
// must be IDENTICAL every day — any divergence rejects the optimization, no
// exceptions. Also asserts validateInsideTent still fires in slim-status
// mode (shredded-tent scenario converges in both modes).
//
// Two modes:
//   PROOF_MODE=hash SEED=n — inner generator: runs the sim, prints ONE JSON
//     line {seed, simopt, dayHashes, days, endReason, tent} to stdout.
//   (default) — orchestrator: spawns the generator twice per seed
//     (SIMOPT=1 and SIMOPT=0), compares, prints PASS/FAIL.
//
// Usage: node scripts/test-simopt-trajectory-20261010.js
//   env: PROOF_SEEDS="3,8,11,21,31" PROOF_DAYS=120
'use strict';
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const SEEDS = (process.env.PROOF_SEEDS || '3,8,11,21,31').split(',').map(Number);
const DAYS = parseInt(process.env.PROOF_DAYS || '120', 10);

// Canonical per-day snapshot — fixed key order, rounded numbers.
function canonSnapshot(Game) {
  const s = Game.state.scholar || {};
  const v = Game.state.village || {};
  const trust = Object.values(v.trust || {});
  const tmean = trust.length
    ? trust.reduce((a, b) => a + b, 0) / trust.length : 0;
  const pantryKcal = (v.pantry || [])
    .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
  let monsters = 0;
  try {
    if (Game.tbfight && !Game.tbfight.over)
      monsters = Game.tbfight.fighters
        .filter(f => f.kind === 'monster' && (f.hp || 0) > 0).length;
    if (Game.pendingMonsterId) monsters += 1;
  } catch (e) {}
  let wave = 1;
  try { wave = Game.unlockedWave ? Game.unlockedWave() : 1; } catch (e) {}
  const ac = Game.state.activeContest;
  return {
    day: s.day || 0,
    hp: Math.round(s.health || 0),
    kcal: Math.round(s.kcal || 0),
    health: Math.round(s.health || 0),
    energy: Math.round(s.energy || 0),
    dayTicks: s.dayTicks || 0,
    roster: (v.roster || []).length,
    pantryKcal: Math.round(pantryKcal),
    wave,
    monsters,
    trustMean: Math.round(tmean * 1e6) / 1e6,
    contest: ac ? (ac.id || ac.kind || '?') : null,
  };
}

function hashDay(Game) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonSnapshot(Game))).digest('hex').slice(0, 16);
}

async function runHashMode() {
  const H = require('./sim-harness');
  const { loadGame, setupGame, driveFights, driveContests } = H;
  // quietLog exists on the simopt harness; fall back to a pass-through on
  // older checkouts (log silencing never affects trajectory).
  const quietLog = H.quietLog || (fn => fn());
  const { winseek } = require('./policies/winseek');
  const seed = parseInt(process.env.SEED || '3', 10);
  const simopt = process.env.SIMOPT === '0' ? 'OFF' : 'ON';

  const { Game } = await loadGame({ seed, mode: 'simopt-proof' });
  await setupGame(Game);
  const ctx = { policyId: 'winseek', notes: [] };
  if (winseek.setup) { try { await winseek.setup(Game, ctx); } catch (e) {} }
  const dayHashes = [];
  let day = 0, endReason = '?';
  await quietLog(async () => {
    for (day = 1; day <= DAYS; day++) {
      for (let p = 0; p < 3; p++) {
        if (winseek.upkeep) { try { winseek.upkeep(Game, ctx); } catch (e) {} }
        driveFights(Game, winseek, ctx);
        driveContests(Game, winseek, ctx);
        if (Game.over) break;
        try { Game.tickAction(128); } catch (e) {}
        if (Game.over) break;
      }
      if (Game.over) break;
      if (winseek.daily) { try { winseek.daily(Game, ctx); } catch (e) {} }
      try { Game.sleep(); } catch (e) {}
      driveContests(Game, winseek, ctx);
      if (Game.over) break;
      dayHashes.push(hashDay(Game));
      if (((Game.state.village || {}).roster || []).length === 0) break;
    }
  });
  endReason = Game.over
    ? (Game.villageLost ? 'village-lost' : 'over-other')
    : (day > DAYS ? 'survived' : 'pop-zero');

  // TENT-SHRED SCENARIO: the slim status() must still run validateInsideTent.
  // Plant the scholar "inside" their own shredded tent, call status(), and
  // assert they are evicted — in BOTH modes.
  let tent = null;
  try {
    const g2 = (await loadGame({ seed: seed + 100000, mode: 'simopt-proof-tent' })).Game;
    await setupGame(g2);
    const s = g2.state.scholar;
    const tx = g2.map.px, ty = g2.map.py;
    s.insideTent = { tx, ty, cx: 4, cy: 4 };
    const t = g2.playerTile();
    t.secrets = t.secrets || {};
    t.secrets['4,4'] = { condition: 'shredded', known: true, yours: true };
    const detail = g2.genDetail(tx, ty);
    if (detail[4] && detail[4][4] !== undefined) detail[4][4] = 'tent';
    const before = s.insideTent !== null;
    g2.status();
    tent = { evicted: before && s.insideTent === null };
  } catch (e) {
    tent = { evicted: false, error: String(e && e.message || e).slice(0, 120) };
  }

  console.log(JSON.stringify({
    seed, simopt, days: dayHashes.length, endReason,
    dayHashes, tent,
  }));
}

function runOrchestrator() {
  const self = path.join(__dirname, 'test-simopt-trajectory-20261010.js');
  let allOk = true;
  for (const seed of SEEDS) {
    const outs = {};
    for (const mode of ['ON', 'OFF']) {
      const env = Object.assign({}, process.env, {
        PROOF_MODE: 'hash', SEED: String(seed),
        SIMOPT: mode === 'ON' ? '1' : '0',
      });
      const raw = execFileSync(process.execPath, [self], {
        env, timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
      }).toString();
      const line = raw.trim().split('\n').pop();
      outs[mode] = JSON.parse(line);
    }
    const a = outs.ON, b = outs.OFF;
    const errs = [];
    if (a.dayHashes.length !== b.dayHashes.length)
      errs.push(`day count ${a.dayHashes.length} vs ${b.dayHashes.length}`);
    const n = Math.min(a.dayHashes.length, b.dayHashes.length);
    let firstDiv = -1;
    for (let i = 0; i < n; i++) {
      if (a.dayHashes[i] !== b.dayHashes[i]) { firstDiv = i + 1; break; }
    }
    if (firstDiv > 0) errs.push(`first divergence at day ${firstDiv}`);
    if (a.endReason !== b.endReason) errs.push(`endReason ${a.endReason} vs ${b.endReason}`);
    if (!a.tent || !a.tent.evicted) errs.push('tent-shred NOT evicted with SIMOPT=ON');
    if (!b.tent || !b.tent.evicted) errs.push('tent-shred NOT evicted with SIMOPT=OFF');
    const ok = errs.length === 0;
    if (!ok) allOk = false;
    console.log(`seed ${seed}: ${ok ? 'PASS' : 'FAIL'} ` +
      `(days=${a.dayHashes.length} end=${a.endReason} tent=${a.tent && a.tent.evicted ? 'evicted' : 'BROKEN'})` +
      (errs.length ? ' — ' + errs.join('; ') : ''));
  }
  console.log(allOk ? 'TRAJECTORY PROOF: ALL PASS' : 'TRAJECTORY PROOF: FAILED');
  process.exit(allOk ? 0 : 1);
}

if (process.env.PROOF_MODE === 'hash') {
  runHashMode().catch(e => { console.error('HASH MODE ERROR: ' + (e && e.stack || e)); process.exit(2); });
} else {
  runOrchestrator();
}
