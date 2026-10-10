#!/usr/bin/env node
// sweep-r5.js — completion sweep r5 (2026-10-10), current master HEAD ecbfad1f.
// 60 seeds x 3 policies (competent, progress, mvc) x 200-day cap validating
// the four fix batches:
//   1. wave engagement-lane unlocks + feast-surge devotion lane (threshold 35)
//   2. scale on-ramp (early contact, 3-4 villages) + play-weighted integration
//      + plant-L3 lane fix
//   3. survival/depletion rewiring + counter-play duties
//   4. utilization fixes (10 dead systems revived: comms, petitions,
//      haven tiers, ratings, synergies)
// Read-only sims; no game code changed. Runner/analyzer/policy committed;
// raw JSON in scripts/sweep-r5-results.json.
// Usage: SEEDS="1-60" POLICIES="competent,progress,mvc" DAYS=200 OUT=scripts/sweep-r5-results.json node scripts/sweep-r5.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const idle = require('./policies/idle');
const { competent } = require('./policies/competent');
const { progress } = require('./policies/progress-r4');

const POLICIES = { competent, progress, mvc: idle.mvc };

// Util-relevant entry points (bal-util territory) — hit counters per run.
// Subset of util-sweep.js's list; existence recorded per run.
const UTIL_WRAPS = [
  ['callForHelp', 'comms_call'],
  ['aidSignalFire', 'comms_signal'],
  ['aidCry', 'comms_cry'],
  ['openPetition', 'petition_open'],
  ['conductPetitionMoot', 'petition_moot'],
  ['havenTierUp', 'haven_tierup'],
  ['fireRatingsSummons', 'ratings_summons'],
  ['fireSplinter', 'splinter'],
  ['hostFeast', 'feast_host'],
  ['teachSentiment', 'sentiment_teach'],
  ['channelSentiment', 'sentiment_channel'],
  ['unlockSynergy', 'synergy_unlock'],
  ['completeTrial', 'trial_complete'],
  ['offerSystemQuest', 'sq_offer'],
];

function instrument(Game, util) {
  for (const [name, label] of UTIL_WRAPS) {
    const orig = Game[name];
    if (typeof orig !== 'function') { (util.missing = util.missing || []).push(name); continue; }
    Game[name] = function (...args) {
      util.hits[label] = (util.hits[label] || 0) + 1;
      return orig.apply(this, args);
    };
  }
}

function engagedByWave(Game) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  try {
    const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
    for (const mid of Object.keys(faced)) { const w = faced[mid] | 0; if (out[w] != null) out[w]++; }
  } catch (e) {}
  return out;
}

function snapshot(Game, ctx, wrapState, util) {
  const out = { arc: 1, table: false, won: false, day: 0, stage: 0, breadth: 0,
    sentiment: false, feastArmed: false, feastUsed: false, surgeRes: 0,
    w: [0, 0, 0, 0, 0], cx: 0, cr: 0, rank: '?', gate: false, maxWave: 1,
    havenTier: 0, sq: 0, channels: 0, lessons: 0, backed: 0, bites: 0,
    deaths: 0, l3plants: 0, synergies: 0 };
  try {
    const pg = Game.progState();
    out.arc = pg.arc || 1;
    out.table = !!(pg.tableWaiting || pg.tableDone);
    out.day = (Game.state.scholar || {}).day || 0;
    out.sentiment = !!pg.sentimentTaught;
    out.sq = pg.systemQuests || 0;
    out.surgeRes = pg.surgeResonance || 0;
  } catch (e) {}
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
    }
  } catch (e) {}
  try { out.rank = Game.scaleRank ? Game.scaleRank() : '?'; } catch (e) {}
  try { out.maxWave = Game.unlockedWave ? Game.unlockedWave() : 1; } catch (e) {}
  try { out.havenTier = Game.havenTier ? Game.havenTier() : 0; } catch (e) {}
  try {
    out.l3plants = Object.values((Game.state.codex || {}).plants || {}).filter(p => (p.level || 0) >= 3).length;
  } catch (e) {}
  try { out.synergies = ((Game.state.scholar || {}).synergies || []).length; } catch (e) {}
  out.channels = (ctx && ctx.channels) || 0;
  out.lessons = (ctx && ctx.lessons) || 0;
  out.backed = (ctx && ctx.backed) || 0;
  out.bites = (ctx && ctx.studyBites) || 0;
  out.arcDay = wrapState.arcDay;
  out.waveDay = wrapState.waveDay;
  out.util = util.hits;
  out.utilMissing = util.missing || [];
  return out;
}

function wrap(policy) {
  const p = Object.assign({}, policy);
  const arcDay = {}, waveDay = {};
  let capCtx = null;
  const origDaily = policy.daily;
  p.daily = (G, ctx) => {
    capCtx = ctx;
    if (origDaily) { try { origDaily(G, ctx); } catch (e) {} }
    try {
      const day = (G.state.scholar || {}).day || 0;
      const a = G.progState().arc || 1;
      if (!(a in arcDay)) arcDay[a] = day;
      const uw = G.unlockedWave ? G.unlockedWave() : 1;
      for (let w = 2; w <= 5; w++) if (uw >= w && !(w in waveDay)) waveDay[w] = day;
    } catch (e) {}
  };
  return { p, arcDay, waveDay, ctx: () => capCtx };
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
  const policyIds = (process.env.POLICIES || 'competent,progress,mvc').split(',').map(s => s.trim());
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'sweep-r5-results.json');
  const rows = [];
  const t0 = Date.now();
  let runN = 0, totalRuns = seeds.length * policyIds.length;
  for (const pid of policyIds) {
    const base = POLICIES[pid];
    if (!base) { console.log('unknown policy ' + pid); continue; }
    for (const seed of seeds) {
      const { Game } = await loadGame({ seed, mode: pid });
      await setupGame(Game);
      const util = { hits: {} };
      instrument(Game, util);
      const { p, arcDay, waveDay, ctx } = wrap(base);
      const result = await runDays(Game, p, { days });
      const end = snapshot(Game, ctx(), { arcDay, waveDay }, util);
      const deaths = ((result.samples && result.samples.deaths) || []).map(d => d.cause || d.kind || '?');
      rows.push({
        seed, policy: pid, endReason: result.endReason, ms: result.ms,
        arc: end.arc, arcDay: end.arcDay, waveDay: end.waveDay,
        table: end.table, won: end.won,
        days: end.day, stage: end.stage, breadth: end.breadth,
        sentiment: end.sentiment,
        feastArmed: end.feastArmed, feastUsed: end.feastUsed, surgeRes: end.surgeRes,
        w: end.w, cx: end.cx, cr: end.cr, rank: end.rank, gate: end.gate,
        havenTier: end.havenTier, maxWave: end.maxWave, sq: end.sq,
        l3plants: end.l3plants, synergies: end.synergies,
        deaths,
        channels: end.channels, lessons: end.lessons, backed: end.backed, bites: end.bites,
        waveKills: result.waveKills,
        util: end.util, utilMissing: end.utilMissing,
      });
      runN++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${runN}/${totalRuns} ${el}s] seed ${seed} ${pid}: ${result.endReason} d${end.day} arc${end.arc} table=${end.table} won=${end.won} deeds[w:${end.w.join('/')} cx:${end.cx} cr:${end.cr} ${end.rank}] uw:${end.maxWave} wd:${JSON.stringify(end.waveDay)} stage:${end.stage} br:${end.breadth} sent:${end.sentiment} surge:${end.feastArmed ? 'A' : ''}${end.feastUsed ? 'U' : ''}(res${end.surgeRes}) sq:${end.sq} ht:${end.havenTier}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  for (const pid of policyIds) {
    const rs = rows.filter(r => r.policy === pid);
    const n = rs.length;
    const a3 = rs.filter(r => r.arc >= 3).length, a4 = rs.filter(r => r.arc >= 4).length;
    const tb = rs.filter(r => r.table).length, w = rs.filter(r => r.won).length;
    const wd = rs.filter(r => r.won).map(r => r.days).sort((x, y) => x - y);
    const medW = wd.length ? wd[Math.floor(wd.length / 2)] : null;
    const ds = rs.map(r => r.days).sort((x, y) => x - y);
    const med = ds.length ? ds[Math.floor(ds.length / 2)] : null;
    const w3 = rs.filter(r => r.maxWave >= 3).length;
    console.log(`== ${pid}: arc3 ${a3}/${n} arc4 ${a4}/${n} table ${tb}/${n} wins ${w}/${n} medWinDay ${medW} medDays ${med} maxDays ${ds.length ? ds[ds.length - 1] : 0} w3 ${w3}/${n}`);
  }
  console.log('wrote ' + OUT);
})();
