#!/usr/bin/env node
// probe-linkstates-20261010.js — round-4 follow-up: WHY do subordinate links
// never vest? Re-runs selected seeds (deterministic) and dumps every
// hierarchy link's end-state: kind, trust, age, arrears, status, plus the
// primary's realm size. Usage: SEEDS="1,37" node scripts/probe-linkstates-20261010.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { winseek } = require('./policies/winseek');

async function runOne(Game, policy, days, ctx) {
  if (policy.setup) { try { await policy.setup(Game, ctx); } catch (e) {} }
  for (let day = 1; day <= days; day++) {
    for (let p = 0; p < 3; p++) {
      if (Game.over) break;
      if (policy.upkeep) { try { policy.upkeep(Game, ctx); } catch (e) {} }
      driveFights(Game, policy, ctx);
      driveContests(Game, policy, ctx);
      if (Game.over) break;
      try { Game.doAction('wait'); } catch (e) {}
      driveFights(Game, policy, ctx);
      driveContests(Game, policy, ctx);
      if (Game.over) break;
    }
    if (Game.over) break;
    if (policy.daily) { try { policy.daily(Game, ctx); } catch (e) {} }
    driveFights(Game, policy, ctx);
    driveContests(Game, policy, ctx);
    if (Game.over) break;
    try { Game.sleep(); } catch (e) {}
    driveFights(Game, policy, ctx);
    driveContests(Game, policy, ctx);
    if (Game.over) break;
    if (((Game.state.village || {}).roster || []).length === 0) break;
  }
}

function dumpLinks(Game) {
  const day = ((Game.state.scholar || {}).day) || 0;
  const links = (Game.hierarchyState ? Game.hierarchyState() : []) || [];
  const fps = (Game.foreignPolities ? Game.foreignPolities() : []) || [];
  const out = [];
  for (const l of links) {
    if (!l) continue;
    let realmSize = null;
    if (l.primary && l.primary !== 'haven') {
      const fp = fps.find(f => f.primary === l.primary);
      realmSize = 2 + (fp ? fp.subs.length : 0);
    }
    out.push({
      id: l.id, status: l.status,
      primary: l.primary === 'haven' ? 'HAVEN' : l.primary,
      sub: l.subordinate === 'haven' ? 'HAVEN' : l.subordinate,
      trust: l.trust, age: day - (l.day || 0), arrears: l.arrears || 0,
      realmSize,
      notes: ((l.history || []).slice(-4).map(n => n.kind + ':' + String(n.text || n.note || '').slice(0, 70))),
    });
  }
  return { day, links: out, nationalLive: !!Game.state.nationalLive, rank: Game.scaleRank ? Game.scaleRank() : '?' };
}

(async () => {
  const seeds = String(process.env.SEEDS || '1').split(',').map(s => +s.trim()).filter(Boolean);
  const days = parseInt(process.env.DAYS || '120', 10);
  for (const seed of seeds) {
    const { Game } = await loadGame({ seed, mode: 'probe-linkstates' });
    await setupGame(Game);
    const p = Object.assign({}, winseek);
    const ctx = { policyId: 'winseek-probe', notes: [] };
    await runOne(Game, p, days, ctx);
    const d = dumpLinks(Game);
    console.log(`\n### seed ${seed}: end d${d.day} rank=${d.rank} nationalLive=${d.nationalLive} links=${d.links.length}`);
    for (const l of d.links) {
      console.log(`  ${l.id} [${l.status}] ${l.sub}→${l.primary} trust=${l.trust} age=${l.age}d arrears=${l.arrears} realmSize=${l.realmSize}`);
      for (const n of l.notes) console.log(`      note: ${n}`);
    }
    if (!d.links.length) console.log('  (no links at all — proposals never converted)');
  }
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
