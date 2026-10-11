#!/usr/bin/env node
// sweep-survival-validation.js — validation sweep for the survival-economy
// rebalance (validation worker, 2026-10-10).
//
// Same SHAPE as Worker E's sweep-winseek.js (winseek policy, 60+ seeds,
// 200-day cap, 6 parallel shards via SEEDS="a-b" OUT=...), but with the
// villagerTurn-corrected day loop: time advances via the LIVE path
// Game.doAction('wait') (villagerTurn = needs-driven NPC agency), NEVER raw
// tickAction(128) (which only runs npcBatchTurn and under-measures villager
// agency — parity audit Worker A finding). Snapshot/blocker machinery is
// verbatim from sweep-winseek.js so the comparison to Worker E's baseline
// (0/60 wins, median 24 days, 0/60 tier 1, 0/60 scale) is honest — the only
// harness difference is the corrected day loop, noted in the evidence.
//
// Usage: SEEDS="1-10" OUT=scripts/sweep-survival-validation-s1.json node scripts/sweep-survival-validation.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { winseek } = require('./policies/winseek');

function engagedByWave(Game) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  try {
    const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
    for (const mid of Object.keys(faced)) { const w = faced[mid] | 0; if (out[w] != null) out[w]++; }
  } catch (e) {}
  return out;
}

function snapshot(Game, ctx) {
  const out = {
    arc: 1, table: false, won: false, winDay: null, day: 0, stage: 0,
    integ: 0, breadth: 0, sentiment: false, feastArmed: false, feastUsed: false,
    surgeRes: 0, w: [0, 0, 0, 0, 0], cx: 0, cr: 0, crisesKinds: [],
    rank: '?', gate: false, maxWave: 1, havenTier: 0, sq: 0,
    waveDay: {}, links: 0, subLinks: 0, peerLinks: 0,
  };
  try {
    const pg = Game.progState();
    out.arc = pg.arc || 1;
    out.table = !!(pg.tableWaiting || pg.tableDone);
    out.day = (Game.state.scholar || {}).day || 0;
    out.sentiment = !!pg.sentimentTaught;
    out.sq = pg.systemQuests || 0;
    out.surgeRes = pg.surgeResonance || 0;
    out.crisesKinds = Object.keys(pg.crises || {});
  } catch (e) {}
  try { out.integ = (Game.state.scholar || {}).integration || 0; } catch (e) {}
  try {
    const s = Game.state.scholar || {};
    out.feastArmed = !!((s.prog || {}).feastSurge);
    out.feastUsed = !!((s.prog || {}).feastSurgeUsed);
  } catch (e) {}
  try { out.stage = Game.integrationStage(); } catch (e) {}
  try { out.breadth = Game.codexBreadth(); } catch (e) {}
  try { out.won = !!Game.won; } catch (e) {}
  try {
    const g = Game.deedGateReady ? Game.deedGateReady() : null;
    if (g) {
      out.w = [g.w1, g.w2, g.w3, g.w4, g.w5];
      out.cx = g.contestsN; out.cr = g.crisesN; out.gate = !!g.ok;
      out.rank = g.rank;
    }
  } catch (e) {}
  try { if (!out.rank || out.rank === '?') out.rank = Game.scaleRank ? Game.scaleRank() : '?'; } catch (e) {}
  try { out.maxWave = Game.unlockedWave ? Game.unlockedWave() : 1; } catch (e) {}
  try { out.havenTier = Game.havenTier ? Game.havenTier() : 0; } catch (e) {}
  try {
    const links = Game.hierarchyState ? Game.hierarchyState() : [];
    out.links = links.filter(l => l.status === 'active').length;
    out.subLinks = links.filter(l => l.status === 'active' && l.primary === 'haven').length;
    out.peerLinks = links.filter(l => l.status === 'active' && l.kind).length;
  } catch (e) {}
  if (ctx) {
    out.patrols = ctx.patrols || 0;
    out.struck = ctx.struck || 0;
    out.fled = ctx.fled || 0;
    out.proposed = ctx.proposed || 0;
    out.proposedPeer = ctx.proposedPeer || 0;
    out.counterAccepted = ctx.counterAccepted || 0;
    out.nationalAnswered = ctx.nationalAnswered || 0;
    out.channels = ctx.channels || 0;
    out.feasts = ctx.feasts || 0;
    out.climb = ctx.climb || 0;
    out.named = ctx.named || 0;
    out.taught = ctx.taught || 0;
  }
  return out;
}

function blocker(Game, end) {
  const bars = [5, 5, 4, 3, 2];
  const waveShort = [];
  for (let i = 0; i < 5; i++) {
    if (end.w[i] < bars[i]) waveShort.push(`w${i + 1}:${end.w[i]}/${bars[i]}`);
  }
  const unmet = [];
  if (waveShort.length) unmet.push('waves[' + waveShort.join(' ') + ']');
  if (end.cx < 3) unmet.push(`contests:${end.cx}/3`);
  if (!(end.rank === 'national' || end.rank === 'global')) unmet.push(`scale:${end.rank}`);
  if (end.cr < 3) unmet.push(`crises:${end.cr}/3`);
  if (!end.sentiment) unmet.push('sentiment:unmet');
  if (!end.feastUsed) unmet.push('feastSurge:unmet');
  if (end.stage < 3) unmet.push(`stage:${end.stage}/3(integ ${end.integ})`);
  let binding = 'none?!';
  if (!(end.rank === 'national' || end.rank === 'global')) binding = 'scale';
  else if (waveShort.length) binding = 'waves:' + waveShort[0].split(':')[0];
  else if (end.cx < 3) binding = 'contests';
  else if (end.cr < 3) binding = 'crises';
  else if (!end.sentiment || !end.feastUsed) binding = !end.sentiment ? 'sentiment' : 'feastSurge';
  else if (end.stage < 3) binding = 'integration';
  return { unmet, binding };
}

// Live-path day loop: 3 parts/day, each part = upkeep → fights → contests →
// doAction('wait') (villagerTurn + tick-to-part-boundary). Then daily, sleep.
async function runOne(Game, policy, days, waveDay, ctx) {
  if (policy.setup) { try { await policy.setup(Game, ctx); } catch (e) {} }
  let day = 0;
  for (day = 1; day <= days; day++) {
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
  const deaths = [];
  try {
    for (const ev of (Game.state.telemetry || [])) {
      if (ev.type === 'death') deaths.push({ day: ev.day, kind: ev.kind, who: ev.who, cause: ev.cause });
    }
  } catch (e) {}
  const endReason = Game.over ? (Game.villageLost ? 'village-lost' : 'over-other') : (day >= days ? 'survived' : 'pop-zero');
  return { endReason, days: Math.min(day, days), deaths };
}

function wrap(policy) {
  const p = Object.assign({}, policy);
  const waveDay = {};
  const origDaily = policy.daily;
  p.daily = (G, ctx) => {
    if (origDaily) { try { origDaily(G, ctx); } catch (e) {} }
    try {
      const day = (G.state.scholar || {}).day || 0;
      const uw = G.unlockedWave ? G.unlockedWave() : 1;
      for (let w = 2; w <= 5; w++) if (uw >= w && !(w in waveDay)) waveDay[w] = day;
    } catch (e) {}
  };
  return { p, waveDay };
}

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-60').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-60');
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'sweep-survival-validation-results.json');
  const rows = [];
  const t0 = Date.now();
  let runN = 0;
  const totalRuns = seeds.length;
  for (const seed of seeds) {
    try {
      const { Game, loadFails } = await loadGame({ seed, mode: 'survival-validation' });
      if (loadFails && loadFails.length) console.log(`seed ${seed}: LOAD FAILS: ${loadFails.join('; ')}`);
      await setupGame(Game);
      const { p, waveDay } = wrap(winseek);
      const ctx = { policyId: 'winseek', notes: [] };
      const result = await runOne(Game, p, days, waveDay, ctx);
      const end = snapshot(Game, ctx);
      end.waveDay = waveDay;
      end.engaged = engagedByWave(Game);
      const deaths = result.deaths.map(d => d.cause || d.kind || '?');
      const deathRecs = result.deaths;
      const bl = end.won ? null : blocker(Game, end);
      rows.push({
        seed, endReason: result.endReason, ms: 0,
        arc: end.arc, table: end.table, won: end.won,
        days: end.day, winDay: end.won ? end.day : null,
        stage: end.stage, integ: end.integ, breadth: end.breadth,
        sentiment: end.sentiment, feastArmed: end.feastArmed,
        feastUsed: end.feastUsed, surgeRes: end.surgeRes,
        w: end.w, cx: end.cx, cr: end.cr, crisesKinds: end.crisesKinds,
        rank: end.rank, gate: end.gate, maxWave: end.maxWave,
        havenTier: end.havenTier, sq: end.sq, waveDay: end.waveDay,
        engaged: end.engaged,
        links: end.links, subLinks: end.subLinks, peerLinks: end.peerLinks,
        deaths: deaths.slice(0, 12),
        deathRecs: deathRecs.map(d => ({ day: d.day, who: d.who, cause: d.cause })),
        patrols: end.patrols, struck: end.struck, fled: end.fled,
        proposed: end.proposed, proposedPeer: end.proposedPeer,
        counterAccepted: end.counterAccepted, nationalAnswered: end.nationalAnswered,
        channels: end.channels, feasts: end.feasts, climb: end.climb,
        named: end.named, taught: end.taught,
        unmet: bl ? bl.unmet : [], binding: bl ? bl.binding : 'won',
      });
      runN++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const bstr = bl ? `binding=${bl.binding}` : 'WON';
      console.log(`[${runN}/${totalRuns} ${el}s] seed ${seed}: ${result.endReason} d${end.day} arc${end.arc} table=${end.table} won=${end.won} deeds[w:${end.w.join('/')} cx:${end.cx} cr:${end.cr} ${end.rank}] uw:${end.maxWave} tier:${end.havenTier} stage:${end.stage} sent:${end.sentiment} surge:${end.feastArmed ? 'A' : ''}${end.feastUsed ? 'U' : ''} links:${end.links} ${bstr}`);
    } catch (e) {
      rows.push({ seed, endReason: 'ERROR', error: String(e && e.message || e).slice(0, 300) });
      runN++;
      console.log(`[${runN}/${totalRuns}] seed ${seed}: ERROR ${String(e && e.message || e).slice(0, 120)}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const n = rows.length;
  const tb = rows.filter(r => r.table).length, w = rows.filter(r => r.won).length;
  console.log(`== validation: table ${tb}/${n} wins ${w}/${n}`);
  const bindCounts = {};
  for (const r of rows) if (!r.won) bindCounts[r.binding] = (bindCounts[r.binding] || 0) + 1;
  console.log('binders: ' + JSON.stringify(bindCounts));
  console.log('wrote ' + OUT);
})();
