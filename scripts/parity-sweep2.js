#!/usr/bin/env node
// parity-sweep2.js — targeted per-monster faced/kill matrix (2026-10-10).
// Fixes the arg captures the big sweep botched (mon_turn had no args;
// tele combat_start uses {vs}, not {id}).
// Usage: SEEDS="1-24" POLICIES="competent,roads" DAYS=200 OUT=... node scripts/parity-sweep2.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');
const { withRoads } = require('./util-roads');
const POLICIES = { competent, roads: withRoads(competent) };

function instrument(Game, util) {
  const hit = (label, id) => {
    const u = util.labels[label] || (util.labels[label] = { n: 0, args: {} });
    u.n++;
    if (id != null) u.args[String(id)] = (u.args[String(id)] || 0) + 1;
  };
  // tbMonsterTurn(m): m.mdef.id is the monster species
  const o1 = Game.tbMonsterTurn;
  if (typeof o1 === 'function') Game.tbMonsterTurn = function (m) {
    try { hit('tb_act', (m && m.mdef && m.mdef.id) || (m && m.id)); } catch (e) {}
    return o1.apply(this, arguments);
  };
  // fieldFight: capture monster id from args (scan objects for mdef)
  const o2 = Game.fieldFight;
  if (typeof o2 === 'function') Game.fieldFight = function () {
    let id = null;
    try {
      for (const a of arguments) {
        if (a && a.mdef && a.mdef.id) { id = a.mdef.id; break; }
        if (a && typeof a === 'object' && typeof a.id === 'string' && /^[a-z_]+$/.test(a.id)) id = id || a.id;
      }
    } catch (e) {}
    hit('field_fight', id);
    return o2.apply(this, arguments);
  };
  // tele combat_start carries {vs: mid}
  const o3 = Game.tele;
  if (typeof o3 === 'function') Game.tele = function (type, data) {
    if (type === 'combat_start') { try { hit('faced', data && data.vs); } catch (e) {} }
    return o3.apply(this, arguments);
  };
  // recordWaveKill(mid)
  const o4 = Game.recordWaveKill;
  if (typeof o4 === 'function') Game.recordWaveKill = function (mid) {
    hit('killed', mid);
    return o4.apply(this, arguments);
  };
  // startCombat: capture monster id from args
  const o5 = Game.startCombat;
  if (typeof o5 === 'function') Game.startCombat = function () {
    let id = null;
    try {
      for (const a of arguments) {
        if (a && a.mdef && a.mdef.id) { id = a.mdef.id; break; }
        if (a && typeof a === 'string' && /^[a-z_]+$/.test(a)) id = id || a;
      }
    } catch (e) {}
    hit('pcombat', id);
    return o5.apply(this, arguments);
  };
}

function parseSeeds(s) {
  const out = [];
  for (const p of String(s || '1-24').split(',')) {
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.push(i); else if (p.trim()) out.push(+p.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-24');
  const pids = (process.env.POLICIES || 'competent,roads').split(',').map(s => s.trim());
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'parity-sweep2-results.json');
  const rows = [];
  const t0 = Date.now();
  let n = 0, total = seeds.length * pids.length;
  for (const pid of pids) {
    const base = POLICIES[pid]; if (!base) continue;
    for (const seed of seeds) {
      const { Game } = await loadGame({ seed, mode: pid });
      await setupGame(Game);
      const util = { labels: {} };
      instrument(Game, util);
      const result = await runDays(Game, base, { days });
      const faced = {};
      try {
        const wf = (Game.deedState && Game.deedState().wavesFaced) || {};
        for (const mid of Object.keys(wf)) faced[mid] = wf[mid];
      } catch (e) {}
      rows.push({ seed, policy: pid, days: (Game.state.scholar || {}).day || 0,
        endReason: result.endReason, faced, util: util.labels });
      n++;
      console.log(`[${n}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s] seed ${seed} ${pid}: ${result.endReason}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log('wrote ' + OUT);
})();
