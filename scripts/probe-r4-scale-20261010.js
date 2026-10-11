#!/usr/bin/env node
// R4 DIAGNOSTIC PROBE: for the oracleV2 policy, how close do subordinate links
// come to the retuned BELONG bar (trust>=50, arrears=0, age>=14d, realm>=4)?
// Tracks per-run: best trust on a subordinate link, its max age, arrears
// flag, whether a realm>=4 foreign polity existed, and whether _belongPolity
// ever vested.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { oracleV2 } = require('./policies/oracleV2');

(async () => {
  const seeds = (process.env.SEEDS || '1,2,3,4,5,6').split(',').map(Number);
  const rows = [];
  for (const seed of seeds) {
    const { Game } = await loadGame({ seed, mode: 'competence-panel' });
    await setupGame(Game);
    const ctx = { policyId: 'oraclev2', notes: [] };
    const p = Object.assign({}, oracleV2);
    if (p.setup) { try { await p.setup(Game, ctx); } catch (e) {} }
    const best = { trust: 0, age: 0, arrearsAtBest: 0, realm4: false, vestedDays: 0, vestedDay: null };
    let wdFight = null, wdHps = null, wdStale = 0;
    let lastSday = null, frozenIters = 0;
    const wdSig = () => { try { const f = Game.tbfight; if (!f || f.over) return null; return { f, hps: f.fighters.map(x => Math.round(x.hp || 0)).join(',') }; } catch (e) { return null; } };
    const wdPush = () => {
      try {
        if (!Game.tbBarrierExit || !Game.tbIsPlayerTurn()) return false;
        const q = Game.tbFighter('p'); if (!q) return false;
        const dirs = [];
        if (q.mx === 0) dirs.push([-1, 0]); if (q.mx === 8) dirs.push([1, 0]);
        if (q.my === 0) dirs.push([0, -1]); if (q.my === 8) dirs.push([0, 1]);
        dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        for (const [dx, dy] of dirs) {
          try { if (Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over && Game.tbBarrierExit(dx, dy)) return true; } catch (e) {}
          if (!Game.tbfight || Game.tbfight.over) return true;
        }
      } catch (e) {}
      return false;
    };
    for (let day = 1; day <= 120 && !Game.over; day++) {
      const ws = wdSig();
      if (ws && wdFight === ws.f && wdHps === ws.hps) { if (++wdStale >= 3) { wdPush(); wdStale = 0; wdFight = null; } }
      else { wdStale = 0; wdFight = ws ? ws.f : null; wdHps = ws ? ws.hps : null; }
      for (let q = 0; q < 3; q++) {
        if (Game.over) break;
        if (p.upkeep) { try { p.upkeep(Game, ctx); } catch (e) {} }
        driveFights(Game, p, ctx); driveContests(Game, p, ctx);
        if (Game.over) break;
        try { Game.doAction('wait'); } catch (e) {}
        driveFights(Game, p, ctx); driveContests(Game, p, ctx);
        if (Game.over) break;
      }
      if (Game.over) break;
      try { if (p.daily) p.daily(Game, ctx); } catch (e) {}
      driveFights(Game, p, ctx); driveContests(Game, p, ctx);
      if (Game.over) break;
      try { Game.sleep(); } catch (e) {}
      try {
        const sday = (Game.state.scholar || {}).day || 0;
        if (lastSday !== null && sday === lastSday) {
          if (++frozenIters >= 8 && Game.tbfight && !Game.tbfight.over) { try { Game.tbEnd('routed'); } catch (e) {} frozenIters = 0; }
        } else { frozenIters = 0; lastSday = sday; }
      } catch (e) {}
      try {
        const sday = (Game.state.scholar || {}).day || 0;
        const links = Game.hierarchyState().filter(l => l.status === 'active' && l.subordinate === 'haven');
        for (const l of links) {
          const age = sday - (l.day || 0);
          if (l.trust >= best.trust) { best.trust = l.trust; best.age = age; best.arrearsAtBest = l.arrears || 0; }
          if (age >= 14 && l.trust >= 50 && (l.arrears || 0) === 0) {
            let fp = null;
            for (const f of (Game.foreignPolities ? Game.foreignPolities() : [])) if (f.primary === l.primary) fp = f;
            if (2 + (fp ? fp.subs.length : 0) >= 4) best.realm4 = true;
          }
        }
        try { if (Game._belongPolity()) { best.vestedDays++; if (!best.vestedDay) best.vestedDay = sday; } } catch (e) {}
      } catch (e) {}
      if (((Game.state.village || {}).roster || []).length === 0) break;
    }
    rows.push({ seed, days: (Game.state.scholar || {}).day || 0, over: !!Game.over, best });
    console.log(`seed ${seed}: day=${rows[rows.length-1].days} over=${rows[rows.length-1].over} bestTrust=${best.trust} ageAtBest=${best.age} arrears=${best.arrearsAtBest} realm4=${best.realm4} vestedDays=${best.vestedDays} vestedDay=${best.vestedDay}`);
  }
  fs.writeFileSync('/tmp/r4-probe.json', JSON.stringify(rows, null, 1));
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
