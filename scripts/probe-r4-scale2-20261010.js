#!/usr/bin/env node
// R4 DIAGNOSTIC PROBE 2: why do foreign polities never reach 4 fires?
// Tracks per-run: max foreign-polity subs, known-village count over time,
// candidate-pool size for _foreignPolitySim, Haven's max subordinates
// (LEAD-road proximity), and how many of Haven's links are subordinate-side.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { oracleV2 } = require('./policies/oracleV2');

(async () => {
  const seeds = (process.env.SEEDS || '1,2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number);
  for (const seed of seeds) {
    const { Game } = await loadGame({ seed, mode: 'competence-panel' });
    await setupGame(Game);
    const ctx = { policyId: 'oraclev2', notes: [] };
    const p = Object.assign({}, oracleV2);
    if (p.setup) { try { await p.setup(Game, ctx); } catch (e) {} }
    const d = { maxFpSubs: 0, maxKnown: 0, maxHavenSubs: 0, candsSeen: 0, candsZeroWeeks: 0, weeks: 0, fpForms: 0 };
    let wdFight = null, wdHps = null, wdStale = 0;
    let lastSday = null, frozenIters = 0;
    for (let day = 1; day <= 120 && !Game.over; day++) {
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
        d.weeks = Game._week ? Game._week() : 0;
        const oV = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
        const known = oV.filter(v => Game.knowsVillage(v)).length;
        if (known > d.maxKnown) d.maxKnown = known;
        const fps = Game.foreignPolities ? Game.foreignPolities() : [];
        for (const f of fps) if (f.subs.length > d.maxFpSubs) d.maxFpSubs = f.subs.length;
        const links = Game.hierarchyState ? Game.hierarchyState().filter(l => l.status === 'active') : [];
        const subs = links.filter(l => l.primary === 'haven').length;
        if (subs > d.maxHavenSubs) d.maxHavenSubs = subs;
        // candidate pool as _foreignPolitySim would see it
        let cands = 0;
        for (const v of oV) {
          if (!Game.knowsVillage(v)) continue;
          if (Game.linkWith(v.id)) continue;
          let inFp = false;
          for (const f of fps) if (f.primary === v.id || f.subs.indexOf(v.id) >= 0) { inFp = true; break; }
          if (!inFp) cands++;
        }
        if (cands > d.candsSeen) d.candsSeen = cands;
      } catch (e) {}
      if (((Game.state.village || {}).roster || []).length === 0) break;
    }
    console.log(`seed ${seed}: day=${(Game.state.scholar||{}).day||0} maxFpSubs=${d.maxFpSubs} maxKnown=${d.maxKnown} maxCands=${d.candsSeen} maxHavenSubs=${d.maxHavenSubs}`);
  }
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
