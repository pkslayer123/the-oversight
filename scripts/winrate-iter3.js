#!/usr/bin/env node
// winrate-iter3.js — WIN-RATE ITERATION ROUND 3 driver (2026-10-10).
// Runs oracle-v2 (scripts/policies/oracle-v2.js) on seeds 1-60, 200-day cap,
// villagerTurn-corrected day loop (Game.doAction('wait') per part — NEVER
// raw tickAction(128)). Same harness shape + utilization instrumentation as
// scripts/panel-competence-20261010.js so round-3 numbers are comparable.
//
// Usage: SEEDS="1-60" OUT=scripts/winrate-iter3-results.json node scripts/winrate-iter3.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { oracleV2 } = require('./policies/oracle-v2');

// ---------- utilization instrumentation (wraps only; game code untouched) ---
function instrument(Game, ctx) {
  const U = ctx.util = {
    abilityUses: 0, abilityPlayer: 0, abilityVillager: 0,
    synergyDiscoveries: 0, kills: 0, counterKills: 0,
    crafts: 0, craftsOk: 0, trapsSet: 0, trapCatches: 0,
    feasts: 0, feastsOk: 0, aidCries: 0,
    aidOffers: 0, aidAccepted: 0, aidHanded: 0, reliefSpent: 0,
    summonsSeen: 0, summonsStunt: 0, summonsPhone: 0, summonsRefuse: 0,
    systemQuests: 0,
  };
  const wrap = (name, fn) => {
    const o = Game[name];
    if (typeof o !== 'function') return false;
    Game[name] = function () { return fn.call(this, o, Array.prototype.slice.call(arguments)); };
    return true;
  };
  const vt = Game.villagerTurn;
  if (typeof vt === 'function') {
    Game.villagerTurn = function () {
      Game._utilVillagerPhase = true;
      try { return vt.apply(this, arguments); }
      finally { Game._utilVillagerPhase = false; }
    };
  }
  wrap('useAbility', function (orig, a) {
    U.abilityUses++;
    if (Game._utilVillagerPhase) U.abilityVillager++; else U.abilityPlayer++;
    return orig.apply(this, a);
  });
  wrap('checkSynergyDiscovery', function (orig, a) {
    const before = (((Game.state || {}).scholar || {}).synergies || []).length;
    const r = orig.apply(this, a);
    const after = (((Game.state || {}).scholar || {}).synergies || []).length;
    if (after > before) U.synergyDiscoveries += (after - before);
    return r;
  });
  wrap('recordWaveKill', function (orig, a) {
    const mid = a[0];
    let known = false;
    try { known = !!Game.monsterCounterKnown(mid); } catch (e) {}
    const r = orig.apply(this, a);
    U.kills++;
    if (known) U.counterKills++;
    return r;
  });
  wrap('craft', function (orig, a) {
    U.crafts++;
    const r = orig.apply(this, a);
    if (r) U.craftsOk++;
    return r;
  });
  wrap('setTrap', function (orig, a) { U.trapsSet++; return orig.apply(this, a); });
  wrap('foodCarcass', function (orig, a) {
    if (a[3] === 'trapped') U.trapCatches++;
    return orig.apply(this, a);
  });
  wrap('hostFeast', function (orig, a) {
    U.feasts++;
    const r = orig.apply(this, a);
    if (typeof r === 'string' && r.indexOf('held') >= 0) U.feastsOk++;
    return r;
  });
  wrap('aidCry', function (orig, a) { U.aidCries++; return orig.apply(this, a); });
  wrap('offerAidQuest', function (orig, a) { U.aidOffers++; return orig.apply(this, a); });
  wrap('answerAidQuest', function (orig, a) {
    const r = orig.apply(this, a);
    if (a[0] === 'accept' && r && r !== 'refused') U.aidAccepted++;
    return r;
  });
  wrap('handInAidQuest', function (orig, a) {
    const r = orig.apply(this, a);
    if (r && r !== 'short') U.aidHanded++;
    return r;
  });
  wrap('answerRelief', function (orig, a) {
    const r = orig.apply(this, a);
    if (r && ['used', 'noneed', 'short', null].indexOf(r) < 0) U.reliefSpent++;
    return r;
  });
  wrap('contestChoose', function (orig, a) {
    try {
      const ac = Game.state.activeContest;
      if (ac && ac.kind === 'summons') {
        U.summonsSeen++;
        const idx = a[0] | 0;
        if (idx === 0) U.summonsStunt++;
        else if (idx === 1) U.summonsPhone++;
        else U.summonsRefuse++;
      }
    } catch (e) {}
    return orig.apply(this, a);
  });
  return U;
}

function engagedByWave(Game) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  try {
    const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
    for (const mid of Object.keys(faced)) { const w = faced[mid] | 0; if (out[w] != null) out[w]++; }
  } catch (e) {}
  return out;
}

// oracle-v2 ctx keys to carry into the result row (beyond the panel's set).
const V2_KEYS = ['abilityTurns', 'practiceFired', 'trapsCrafted', 'traplineSets',
  'feastBanks', 'feastBankDays', 'bankPatrols', 'counterPrefTargets',
  'patrols', 'struck', 'fled', 'proposed', 'proposedPeer',
  'counterAccepted', 'nationalAnswered', 'channels', 'feasts', 'climb',
  'named', 'taught', 'armedUp', 'openers', 'assessments', 'engagedFavored',
  'fledOutmatched', 'fled_neardeath', 'fled_nodeed', 'fled_outmatched',
  'aidAccepted', 'aidHanded', 'reliefSpent', 'barrierExits',
  'watchdogFired', 'timeFreezeCleared', 'choseAbility', 'looted'];
const AB_PREFIX = 'ab_';

function snapshot(Game, ctx) {
  const out = {
    arc: 1, table: false, won: false, day: 0, stage: 0,
    integ: 0, breadth: 0, sentiment: false, feastArmed: false, feastUsed: false,
    w: [0, 0, 0, 0, 0], cx: 0, cr: 0,
    rank: '?', gate: false, maxWave: 1, havenTier: 0, sq: 0,
    waveDay: {}, links: 0,
  };
  try {
    const pg = Game.progState();
    out.arc = pg.arc || 1;
    out.table = !!(pg.tableWaiting || pg.tableDone);
    out.day = (Game.state.scholar || {}).day || 0;
    out.sentiment = !!pg.sentimentTaught;
    out.sq = pg.systemQuests || 0;
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
  } catch (e) {}
  try { out.abilitiesHeld = ((Game.state.scholar || {}).abilities || []).length; } catch (e) {}
  try { out.synergiesHeld = ((Game.state.scholar || {}).synergies || []).length; } catch (e) {}
  if (ctx) {
    for (const k of V2_KEYS) if (ctx[k] != null) out[k] = ctx[k];
    out.abBreakdown = {};
    for (const k of Object.keys(ctx)) {
      if (k.indexOf(AB_PREFIX) === 0 && ctx[k] > 0) out.abBreakdown[k.slice(AB_PREFIX.length)] = ctx[k];
    }
  }
  return out;
}

// Live-path day loop: 3 parts/day, each part = upkeep → fights → contests →
// doAction('wait') (villagerTurn + tick-to-part-boundary). Then daily, sleep.
// Includes the panel's stale-fight + time-freeze watchdogs.
async function runOne(Game, policy, days, waveDay, ctx) {
  if (policy.setup) { try { await policy.setup(Game, ctx); } catch (e) {} }
  let wdFight = null, wdHps = null, wdStale = 0;
  const wdSig = () => {
    try {
      const f = Game.tbfight;
      if (!f || f.over) return null;
      return { f, hps: f.fighters.map(x => Math.round(x.hp || 0)).join(',') };
    } catch (e) { return null; }
  };
  const wdPush = () => {
    try {
      if (!Game.tbBarrierExit || !Game.tbIsPlayerTurn()) return false;
      const q = Game.tbFighter('p');
      if (!q) return false;
      const dirs = [];
      if (q.mx === 0) dirs.push([-1, 0]);
      if (q.mx === 8) dirs.push([1, 0]);
      if (q.my === 0) dirs.push([0, -1]);
      if (q.my === 8) dirs.push([0, 1]);
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
      for (const [dx, dy] of dirs) {
        try {
          if (Game.tbIsPlayerTurn() && Game.tbfight && !Game.tbfight.over && Game.tbBarrierExit(dx, dy)) {
            ctx.watchdogFired = (ctx.watchdogFired || 0) + 1;
            return true;
          }
        } catch (e) {}
        if (!Game.tbfight || Game.tbfight.over) { ctx.watchdogFired = (ctx.watchdogFired || 0) + 1; return true; }
      }
    } catch (e) {}
    return false;
  };
  let day = 0;
  let lastSday = null, frozenIters = 0;
  for (day = 1; day <= days; day++) {
    const ws = wdSig();
    if (ws && wdFight === ws.f && wdHps === ws.hps) {
      if (++wdStale >= 3) { wdPush(); wdStale = 0; wdFight = null; }
    } else { wdStale = 0; wdFight = ws ? ws.f : null; wdHps = ws ? ws.hps : null; }
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
    try {
      const sday = (Game.state.scholar || {}).day || 0;
      if (lastSday !== null && sday === lastSday) {
        if (++frozenIters >= 8 && Game.tbfight && !Game.tbfight.over) {
          try { Game.tbEnd('routed'); ctx.timeFreezeCleared = (ctx.timeFreezeCleared || 0) + 1; } catch (e) {}
          frozenIters = 0;
        }
      } else { frozenIters = 0; lastSday = sday; }
    } catch (e) {}
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
  return { endReason, days: Math.min(day, days), iters: Math.min(day, days), deaths };
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
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'winrate-iter3-results.json');
  console.log('policy: oracle-v2 seeds: ' + seeds.length + ' days: ' + days);
  const rows = [];
  const t0 = Date.now();
  let runN = 0;
  for (const seed of seeds) {
    try {
      const { Game, loadFails } = await loadGame({ seed, mode: 'winrate-iter3' });
      if (loadFails && loadFails.length) console.log(`seed ${seed}: LOAD FAILS: ${loadFails.join('; ')}`);
      await setupGame(Game);
      const waveDay = {};
      const p = Object.assign({}, oracleV2);
      const origDaily = oracleV2.daily;
      p.daily = (G, ctx) => {
        if (origDaily) { try { origDaily(G, ctx); } catch (e) {} }
        try {
          const day = (G.state.scholar || {}).day || 0;
          const uw = G.unlockedWave ? G.unlockedWave() : 1;
          for (let w = 2; w <= 5; w++) if (uw >= w && !(w in waveDay)) waveDay[w] = day;
        } catch (e) {}
      };
      const ctx = { policyId: 'oracle-v2', notes: [] };
      instrument(Game, ctx);
      const result = await runOne(Game, p, days, waveDay, ctx);
      const end = snapshot(Game, ctx);
      end.waveDay = waveDay;
      end.engaged = engagedByWave(Game);
      end.util = ctx.util;
      ctx.util.systemQuests = end.sq;
      const deaths = result.deaths.map(d => d.cause || d.kind || '?');
      rows.push({
        seed, policy: 'oracle-v2', endReason: result.endReason,
        arc: end.arc, table: end.table, won: end.won,
        days: end.day, stage: end.stage, integ: end.integ, breadth: end.breadth,
        sentiment: end.sentiment, feastArmed: end.feastArmed,
        feastUsed: end.feastUsed, w: end.w, cx: end.cx, cr: end.cr,
        rank: end.rank, gate: end.gate, maxWave: end.maxWave,
        havenTier: end.havenTier, sq: end.sq, waveDay: end.waveDay,
        engaged: end.engaged, links: end.links,
        deaths: deaths.slice(0, 12),
        abilitiesHeld: end.abilitiesHeld || 0, synergiesHeld: end.synergiesHeld || 0,
        abilityTurns: end.abilityTurns || 0, practiceFired: end.practiceFired || 0,
        trapsCrafted: end.trapsCrafted || 0, traplineSets: end.traplineSets || 0,
        feastBanks: end.feastBanks || 0, feastBankDays: end.feastBankDays || 0,
        bankPatrols: end.bankPatrols || 0, counterPrefTargets: end.counterPrefTargets || 0,
        patrols: end.patrols || 0, struck: end.struck || 0, fled: end.fled || 0,
        openers: end.openers || 0, engagedFavored: end.engagedFavored || 0,
        barrierExits: end.barrierExits || 0, watchdogFired: end.watchdogFired || 0,
        timeFreezeCleared: end.timeFreezeCleared || 0, choseAbility: end.choseAbility || 0,
        abBreakdown: end.abBreakdown || {},
        iters: result.iters,
        util: end.util,
      });
      runN++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const u = end.util;
      console.log(`[${runN}/${seeds.length} ${el}s] s${seed}: ${result.endReason} d${end.day} won=${end.won} w[${end.w.join('/')}]+cx${end.cx} ${end.rank} uw${end.maxWave} t${end.havenTier} | ab:${u.abilityUses}(p${u.abilityPlayer}/v${u.abilityVillager}) abT:${end.abilityTurns || 0} prac:${end.practiceFired || 0} syn:${u.synergyDiscoveries} kill:${u.kills}/${u.counterKills} craft:${u.craftsOk}/${u.crafts} trap:${u.trapCatches}/${u.trapsSet} feast:${u.feastsOk}/${u.feasts}${end.feastArmed ? 'A' : ''}${end.feastUsed ? 'U' : ''} bank:${end.feastBankDays || 0}d/${end.feastBanks || 0} ctrT:${end.counterPrefTargets || 0} sum:${u.summonsSeen} sq:${u.systemQuests}`);
    } catch (e) {
      rows.push({ seed, policy: 'oracle-v2', endReason: 'ERROR', error: String(e && e.message || e).slice(0, 300) });
      runN++;
      console.log(`[${runN}/${seeds.length}] s${seed}: ERROR ${String(e && e.message || e).slice(0, 120)}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log('wrote ' + OUT + ' (' + rows.length + ' rows)');
})();
