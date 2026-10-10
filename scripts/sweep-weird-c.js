#!/usr/bin/env node
// sweep-weird-c.js — Worker C weirdness-hunt long sims (2026-10-10).
// Runs ONE policy (env POLICY) over env SEEDS for DAYS days each, dumping
// per-run world histories to OUTDIR as JSON. Four processes (one per policy)
// run in parallel; seeds inside one process run sequentially (harness rule).
//
// Usage:
//   POLICY=progress SEEDS="11,12,13,14" DAYS=200 OUTDIR=/tmp/weird-c \
//     node scripts/sweep-weird-c.js
'use strict';
const fs = require('fs');
const path = require('path');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const policies = require('./policies/weird-c');

const POLICY = process.env.POLICY || 'mvc';
const SEEDS = (process.env.SEEDS || '1').split(',').map(s => parseInt(s.trim(), 10));
const DAYS = parseInt(process.env.DAYS || '200', 10);
const OUTDIR = process.env.OUTDIR || '/tmp/weird-c';

if (!policies[POLICY]) { console.error('unknown policy: ' + POLICY); process.exit(1); }
fs.mkdirSync(OUTDIR, { recursive: true });

function finalDigest(Game) {
  const d = {};
  try {
    const v = Game.state.village || {};
    d.pantryKcal = Math.round((v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0));
    d.pop = (v.roster || []).length;
    d.trust = v.trust || {};
    d.rep = v.rep || {};
    d.takes = v.takes || {};
    d.gives = v.gives || {};
    d.tribute = v.tribute || v.tributes || null;
    d.gossipCount = (v.gossip || []).length;
    d.gossip = (v.gossip || []).slice(0, 400); // provenance scan
    d.assignments = v.assignments || {};
    d.npcAbilities = v.npcAbilities || {};
  } catch (e) {}
  try {
    d.people = ((Game.state.village || {}).roster || []).map(id => {
      let p = null;
      try { p = Game.getPerson(id); } catch (e) {}
      return {
        id: String(id).slice(0, 24),
        name: (p && (p.name || p.displayName)) || '?',
        dead: !!(p && p.dead),
        occ: (p && (p.occupationId || p.formerOccupation)) || '?',
      };
    });
  } catch (e) { d.people = []; }
  try {
    d.wave = Game.unlockedWave ? Game.unlockedWave() : null;
    d.waveKills = Game.state.waveKills || {};
    d.systemArrived = !!Game.state.systemArrived;
  } catch (e) {}
  try {
    const s = Game.state.scholar || {};
    d.playerDay = s.day || 0;
    d.playerKcal = Math.round(s.kcal || 0);
    d.playerDead = !!s.dead || Game.over && !Game.villageLost ? 'check' : !!s.dead;
    d.packKcal = Math.round(((s.inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0)));
  } catch (e) {}
  // World villages (for the phantom-village check).
  try {
    const w = Game.state.world || {};
    d.worldVillages = ((w.villages || [])).map(v => ({
      id: v.id || v.name, name: v.name, pop: v.pop || (v.roster || []).length,
      lastDay: v.lastDay || v.day || null,
    }));
  } catch (e) { d.worldVillages = null; }
  return d;
}

(async () => {
  const policy = policies[POLICY];
  for (const seed of SEEDS) {
    const t0 = Date.now();
    const { Game, manifest } = await loadGame({ seed, mode: POLICY, fullTelemetry: true });
    await setupGame(Game);
    // Record the System's voice (silenced in sims by default): persona check.
    const sysLines = [];
    try {
      const _sys = Game.sysSay.bind(Game);
      Game.sysSay = (msg, opts) => {
        try { sysLines.push({ day: (Game.state.scholar || {}).day || 0, msg: String(msg).slice(0, 300) }); } catch (e) {}
        return _sys(msg, opts);
      };
    } catch (e) {}
    const result = await runDays(Game, policy, { days: DAYS, manifest, sampleEvery: 5 });
    const digest = finalDigest(Game);
    const rec = {
      meta: manifest,
      policy: POLICY, seed,
      days: result.days, gameDays: result.gameDays, endReason: result.endReason,
      samples: result.samples,
      telemetry: result.telemetry || [],
      sysLines,
      digest,
      ctx: result.notes || [],
      learnedPlants: result.learnedPlants, learnedSkills: result.learnedSkills,
      ms: Date.now() - t0,
    };
    const f = path.join(OUTDIR, `weird-c-${POLICY}-seed${seed}.json`);
    fs.writeFileSync(f, JSON.stringify(rec));
    console.log(`done ${POLICY} seed=${seed} days=${result.days} end=${result.endReason} tele=${(result.telemetry || []).length} sys=${sysLines.length} (${Date.now() - t0}ms) -> ${f}`);
  }
})();
