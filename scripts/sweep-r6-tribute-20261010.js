#!/usr/bin/env node
// sweep-r6-tribute-20261010.js -- WIN-RATE ITERATION ROUND 6 driver.
// Round-6 probe: is vesting reachable at all by a policy that actually
// prioritizes it? Runs oracleV3 (scripts/policies/oracle-v3.js — oracleV2 +
// tribute-priority layer: tribute vanguard, demand honoring, succession
// watch) on seeds 1-60 x 120-day cap (DAY-CAP PROTOCOL).
// villagerTurn-corrected day loop: Game.doAction('wait') per part -- NEVER
// raw tickAction(128). mulberry32 seeded before eval (in sim-harness
// loadGame).
//
// Usage (6x10 shards):
//   SEEDS="1-10"  OUT=scripts/sweep-r6-tribute-s1.json DAYS=120 node scripts/sweep-r6-tribute-20261010.js
//   ... s2: SEEDS="11-20", s3: "21-30", s4: "31-40", s5: "41-50", s6: "51-60"
//   then: node scripts/analyze-r6-tribute-20261010.js
//
// Day loop + utilization instrumentation are verbatim from
// scripts/winrate-iter4.js so oracleV2 numbers stay comparable; the blocker
// decomposition is from scripts/sweep-winseek.js. ADDITIONS vs r5 driver:
// (1) oracleV3 policy, (2) v3 lever counters in the row, (3) trust-at-death
// tracker: trust when links break + per-run max subordinate-link trust +
// end-of-run active subordinate trusts + arrears counts.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { oracleV3, V3_KEYS } = require('./policies/oracle-v3');

const POLICIES = { oracleV3 };

// ---------- utilization instrumentation (verbatim from winrate-iter3.js) ---
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

// ---------- link-lifecycle tracker (round-5 key metric) --------------------
// Counts per run: links formed; theirLeaderDied beats; successionCrisis
// beats (Haven-side); outcomes shaken vs broken; breaks by cause
// (succession vs other). Wraps the three chokepoints; the breakLink wrapper
// only counts non-succession breaks because succession breaks are already
// counted via the theirLeaderDied/successionCrisis wrappers (they call
// breakLink internally).
function trackLinks(Game, ctx) {
  const L = ctx.linkLife = {
    formed: 0, theirDied: 0, successionCrisis: 0,
    shaken: 0, broken: 0, brokenSuccession: 0, brokenOther: 0,
  };
  const of = Game._formLink;
  if (typeof of === 'function') Game._formLink = function () { L.formed++; return of.apply(this, arguments); };
  const td = Game.theirLeaderDied;
  if (typeof td === 'function') Game.theirLeaderDied = function () {
    L.theirDied++;
    const r = td.apply(this, arguments);
    if (r === 'broken') { L.broken++; L.brokenSuccession++; } else if (r) L.shaken++;
    return r;
  };
  const sc = Game.successionCrisis;
  if (typeof sc === 'function') Game.successionCrisis = function () {
    L.successionCrisis++;
    const r = sc.apply(this, arguments);
    if (r === 'broken') { L.broken++; L.brokenSuccession++; } else if (r) L.shaken++;
    return r;
  };
  const bl = Game.breakLink;
  if (typeof bl === 'function') Game.breakLink = function (id, how) {
    const r = bl.apply(this, arguments);
    if (r && how !== 'succession') { L.broken++; L.brokenOther++; }
    return r;
  };
}


// ---------- trust-at-death tracker (round-6 key metric) ---------------------
// For every link break: the trust it died with + how + day. Plus per-day
// max subordinate-link trust (sampled in the daily hook below), end-of-run
// active subordinate trusts, and arrears counts.
function trackTrust(Game, ctx) {
  ctx.trustDeaths = [];
  ctx._maxSubTrust = 0;
  const bl = Game.breakLink;
  if (typeof bl === 'function') Game.breakLink = function (id, how) {
    try {
      const links = (Game.hierarchyState ? Game.hierarchyState() : []) || [];
      const l = links.find(x => x && x.id === id);
      const day = ((Game.state || {}).scholar || {}).day || 0;
      if (l) ctx.trustDeaths.push({ day, trust: l.trust || 0, how: how || '?', sub: l.subordinate === 'haven' });
    } catch (e) {}
    return bl.apply(this, arguments);
  };
}

// ---------- vest-event tracker (round-4 exploit check) ----------------------
// Wraps Game.polityOf: records the FIRST time each national road's polity
// vests in a run — {day, shape, size, trust, linkAgeDays}. Under-bar vests
// (belong with age<14 or trust<50) are structurally impossible by the gate;
// this is the empirical half of the exploit check.
function trackVests(Game, ctx) {
  ctx.vests = [];
  const seen = {};
  const orig = Game.polityOf;
  if (typeof orig !== 'function') return;
  Game.polityOf = function (villageId) {
    let r = null;
    try { r = orig.apply(this, arguments); } catch (e) { return null; }
    try {
      if (r && r.shape && !seen[r.shape]) {
        seen[r.shape] = true;
        const day = ((this.state || {}).scholar || {}).day || 0;
        const ev = { day, shape: r.shape, size: r.size || 0, trust: null, linkAgeDays: null, primary: r.primary || null };
        if (r.shape === 'belong' && r.primary) {
          const links = (this.hierarchyState ? this.hierarchyState() : []) || [];
          for (const l of links) {
            if (l && l.status === 'active' && l.primary === r.primary && l.subordinate === 'haven') {
              ev.trust = l.trust;
              ev.linkAgeDays = day - (l.day || 0);
              break;
            }
          }
        }
        ctx.vests.push(ev);
      }
    } catch (e) {}
    return r;
  };
}

function engagedByWave(Game) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  try {
    const faced = (Game.deedState ? Game.deedState().wavesFaced : {}) || {};
    for (const mid of Object.keys(faced)) { const w = faced[mid] | 0; if (out[w] != null) out[w]++; }
  } catch (e) {}
  return out;
}

// oracle-v2 ctx keys (from winrate-iter3.js) + winseek road counters.
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
  out.winDay = ctx._winDay || null;
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
  try { out.nationalLive = !!Game.state.nationalLive; } catch (e) {}
  try {
    const links = Game.hierarchyState ? Game.hierarchyState() : [];
    out.links = links.filter(l => l.status === 'active').length;
    out.subLinks = links.filter(l => l.status === 'active' && l.primary === 'haven').length;
    out.peerLinks = links.filter(l => l.status === 'active' && l.kind).length;
  } catch (e) {}
  try { out.abilitiesHeld = ((Game.state.scholar || {}).abilities || []).length; } catch (e) {}
  try { out.synergiesHeld = ((Game.state.scholar || {}).synergies || []).length; } catch (e) {}
  if (ctx) {
    for (const k of V2_KEYS) if (ctx[k] != null) out[k] = ctx[k];
    out.abBreakdown = {};
    for (const k of Object.keys(ctx)) {
      if (k.indexOf(AB_PREFIX) === 0 && ctx[k] > 0) out.abBreakdown[k.slice(AB_PREFIX.length)] = ctx[k];
    }
    out.vests = ctx.vests || [];
    out.linkLife = ctx.linkLife || null;
    out.maxTier = ctx._maxTier || 0;
    try {
      for (const k of (V3_KEYS || [])) if (ctx[k] != null) out[k] = ctx[k];
      out.maxSubTrust = ctx._maxSubTrust || 0;
      out.trustDeaths = ctx.trustDeaths || [];
      const links = (Game.hierarchyState ? Game.hierarchyState() : []) || [];
      out.endSubTrusts = links.filter(l => l && l.status === 'active' && l.subordinate === 'haven').map(l => l.trust || 0);
      out.endArrears = links.filter(l => l && l.status === 'active' && l.subordinate === 'haven' && (l.arrears || 0) > 0).length;
    } catch (e) {}
  }
  return out;
}

// Binding-blocker decomposition (from sweep-winseek.js).
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
// Includes stale-fight + time-freeze watchdogs. (verbatim from winrate-iter3.js)
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
    // win-day capture: first day Game.won is set
    try {
      if (Game.won && !ctx._winDay) ctx._winDay = (Game.state.scholar || {}).day || 0;
    } catch (e) {}
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
  const policyId = process.env.POLICY || 'oracleV3';
  const policy = POLICIES[policyId];
  if (!policy) { console.error('unknown POLICY: ' + policyId); process.exit(1); }
  const seeds = parseSeeds(process.env.SEEDS || '1-60');
  const days = parseInt(process.env.DAYS || '120', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'sweep-r6-tribute.json');
  console.log(`policy: ${policyId} seeds: ${seeds.length} days: ${days} (round-6 tribute-priority probe: vanguard + demand honoring + succession watch)`);
  const rows = [];
  const t0 = Date.now();
  let runN = 0;
  for (const seed of seeds) {
    try {
      const { Game, loadFails } = await loadGame({ seed, mode: 'winrate-iter4' });
      if (loadFails && loadFails.length) console.log(`seed ${seed}: LOAD FAILS: ${loadFails.join('; ')}`);
      await setupGame(Game);
      const waveDay = {};
      const p = Object.assign({}, policy);
      const origDaily = policy.daily;
      p.daily = (G, ctx) => {
        if (origDaily) { try { origDaily(G, ctx); } catch (e) {} }
        try {
          const day = (G.state.scholar || {}).day || 0;
          const uw = G.unlockedWave ? G.unlockedWave() : 1;
          for (let w = 2; w <= 5; w++) if (uw >= w && !(w in waveDay)) waveDay[w] = day;
          const ht = G.havenTier ? G.havenTier() : 0;
          if (ht > (ctx._maxTier || 0)) ctx._maxTier = ht;
          try {
            const links = (G.hierarchyState ? G.hierarchyState() : []) || [];
            for (const l of links) {
              if (l && l.status === 'active' && l.subordinate === 'haven' && (l.trust || 0) > (ctx._maxSubTrust || 0)) ctx._maxSubTrust = l.trust;
            }
          } catch (e) {}
        } catch (e) {}
      };
      const ctx = { policyId, notes: [] };
      instrument(Game, ctx);
      trackVests(Game, ctx);
      trackLinks(Game, ctx);
      trackTrust(Game, ctx);
      const result = await runOne(Game, p, days, waveDay, ctx);
      const end = snapshot(Game, ctx);
      end.waveDay = waveDay;
      end.engaged = engagedByWave(Game);
      end.util = ctx.util;
      ctx.util.systemQuests = end.sq;
      const bb = blocker(Game, end);
      const deaths = result.deaths.map(d => d.cause || d.kind || '?');
      rows.push({
        seed, policy: policyId, endReason: result.endReason,
        arc: end.arc, table: end.table, won: end.won, winDay: end.winDay,
        days: end.day, stage: end.stage, integ: end.integ, breadth: end.breadth,
        sentiment: end.sentiment, feastArmed: end.feastArmed,
        feastUsed: end.feastUsed, surgeRes: end.surgeRes, w: end.w,
        cx: end.cx, cr: end.cr, crisesKinds: end.crisesKinds,
        rank: end.rank, gate: end.gate, maxWave: end.maxWave,
        havenTier: end.havenTier, maxTier: end.maxTier, nationalLive: end.nationalLive,
        sq: end.sq, waveDay: end.waveDay,
        engaged: end.engaged, links: end.links, subLinks: end.subLinks,
        peerLinks: end.peerLinks, vests: end.vests, linkLife: end.linkLife,
        binding: bb.binding, unmet: bb.unmet,
        deaths: deaths,
        abilitiesHeld: end.abilitiesHeld || 0, synergiesHeld: end.synergiesHeld || 0,
        abilityTurns: end.abilityTurns || 0, practiceFired: end.practiceFired || 0,
        trapsCrafted: end.trapsCrafted || 0, traplineSets: end.traplineSets || 0,
        feastBanks: end.feastBanks || 0, feastBankDays: end.feastBankDays || 0,
        bankPatrols: end.bankPatrols || 0, counterPrefTargets: end.counterPrefTargets || 0,
        patrols: end.patrols || 0, struck: end.struck || 0, fled: end.fled || 0,
        openers: end.openers || 0, engagedFavored: end.engagedFavored || 0,
        barrierExits: end.barrierExits || 0, watchdogFired: end.watchdogFired || 0,
        timeFreezeCleared: end.timeFreezeCleared || 0, choseAbility: end.choseAbility || 0,
        v3TributePays: end.v3TributePays || 0, v3TributeKcal: end.v3TributeKcal || 0, v3DemandHonored: end.v3DemandHonored || 0,
        v3Demand_tribute: end.v3Demand_tribute || 0, v3Demand_aid: end.v3Demand_aid || 0,
        v3Demand_counsel: end.v3Demand_counsel || 0, v3DemandDeferred: end.v3DemandDeferred || 0,
        v3AidVisits: end.v3AidVisits || 0, v3TrustFromDemands: end.v3TrustFromDemands || 0,
        v3SuccessionAnswered: end.v3SuccessionAnswered || 0,
        maxSubTrust: end.maxSubTrust || 0, trustDeaths: end.trustDeaths || [],
        endSubTrusts: end.endSubTrusts || [], endArrears: end.endArrears || 0,
        proposed: end.proposed || 0, proposedPeer: end.proposedPeer || 0,
        counterAccepted: end.counterAccepted || 0, nationalAnswered: end.nationalAnswered || 0,
        channels: end.channels || 0, feasts: end.feasts || 0, climb: end.climb || 0,
        named: end.named || 0, taught: end.taught || 0,
        abBreakdown: end.abBreakdown || {},
        iters: result.iters,
        util: end.util,
      });
      runN++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const u = end.util;
      const vestStr = (end.vests || []).map(v => `${v.shape}@d${v.day}${v.shape === 'belong' ? `(t${v.trust},a${v.linkAgeDays})` : ''}`).join(',') || '-';
      const ll = end.linkLife || {};
      const llStr = `lnk:f${ll.formed || 0}/td${ll.theirDied || 0}/sc${ll.successionCrisis || 0}/sh${ll.shaken || 0}/bx${ll.broken || 0}(s${ll.brokenSuccession || 0}/o${ll.brokenOther || 0})`;
      console.log(`[${runN}/${seeds.length} ${el}s] s${seed}: ${result.endReason} d${end.day} won=${end.won}${end.won ? '@' + end.winDay : ''} w[${end.w.join('/')}]+cx${end.cx} ${end.rank} uw${end.maxWave} t${end.havenTier} vest:${vestStr} ${llStr} | ab:${u.abilityUses}(p${u.abilityPlayer}/v${u.abilityVillager}) syn:${u.synergyDiscoveries} kill:${u.kills}/${u.counterKills} feast:${u.feastsOk}/${u.feasts}${end.feastArmed ? 'A' : ''}${end.feastUsed ? 'U' : ''} sum:${u.summonsSeen} sq:${u.systemQuests}`);
    } catch (e) {
      rows.push({ seed, policy: policyId, endReason: 'ERROR', error: String(e && e.message || e).slice(0, 300) });
      runN++;
      console.log(`[${runN}/${seeds.length}] s${seed}: ERROR ${String(e && e.message || e).slice(0, 120)}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log('wrote ' + OUT + ' (' + rows.length + ' rows)');
})();
