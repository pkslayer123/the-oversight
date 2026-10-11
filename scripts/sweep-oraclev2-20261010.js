#!/usr/bin/env node
// sweep-oraclev2-20261010.js — ROUND-3 SWEEP: oracleV2, the systems-engaged
// policy (win-rate iteration 2026-10-10).
//
// Round-2 verdict: oracle won 0/60 — BUT no policy ever used the deep systems
// (abilities ~0 uses/run, counter-kill rate 0.0%, crafts/traps 0/240 runs).
// oracleV2 engages them: blow-by-blow ability use (all held kits incl.
// background), counter probing, traps+crafting, feast-then-fight rhythm,
// aid + system quests to completion. The question: does engagement unlock wins?
//
// 60 seeds (1-60, same seed set as rounds 0-2), 200-day cap,
// villagerTurn-corrected day loop (Game.doAction('wait') per part — NEVER raw
// tickAction(128)), mulberry32 seeded BEFORE eval. Instrumentation wraps Game
// methods (READ-ONLY game code — no src edits).
//
// Usage: SEEDS="1-10" OUT=scripts/sweep-oraclev2-s1.json node scripts/sweep-oraclev2-20261010.js
//   (6 shards x 10 seeds = 60 runs; merge with scripts/merge-oraclev2.js)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { oracleV2 } = require('./policies/oracleV2');

const POLICIES = { oraclev2: oracleV2 };
const POLICY_ORDER = ['oraclev2'];

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
  // player/villager split for ability uses: flag the villager phase.
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
    if (r && r !== 'short') U.aidHanded++; // 'short' is an honest refusal, not a hand-in
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
  if (ctx) {
    for (const k of ['patrols', 'struck', 'fled', 'proposed', 'proposedPeer',
      'counterAccepted', 'nationalAnswered', 'channels', 'feasts', 'climb',
      'named', 'taught', 'armedUp', 'openers', 'assessments', 'engagedFavored',
      'fledOutmatched', 'fled_neardeath', 'fled_nodeed', 'fled_outmatched',
      'aidAccepted', 'aidHanded', 'aidShort', 'reliefSpent', 'barrierExits',
      'watchdogFired', 'timeFreezeCleared',
      'v2AbilFired', 'v2AbilRefused', 'v2CounterSeen', 'v2FightsAssessed',
      'v2SurgeFights', 'v2Crafts', 'v2TrapsSet', 'v2Treats', 'v2AidCry',
      'v2SysDone', 'v2QuestDone', 'v2SelfTreats', 'v2ChoseAbility', 'v2BooksRead', '_v2abilities', '_v2abilitiesL3',
      '_v2syn', '_v2surgeRes', '_v2sq']) {
      if (ctx[k] != null) out[k] = ctx[k];
    }
  }
  return out;
}

// Live-path day loop: 3 parts/day, each part = upkeep → fights → contests →
// doAction('wait') (villagerTurn + tick-to-part-boundary). Then daily, sleep.
async function runOne(Game, policy, days, waveDay, ctx) {
  if (policy.setup) { try { await policy.setup(Game, ctx); } catch (e) {} }
  // STALE-FIGHT WATCHDOG (competence panel 2026-10-10): no policy calls
  // tbBarrierExit — they walk to the grid edge and pace it, which never ends
  // a fight against chasers (observed: oracle seed 3, 14 ducks_in_a_row
  // segments, byte-identical fight state across 6+ days, turn order cycling
  // forever). A human pushes through the barrier; the watchdog does the
  // same when a fight is PROVEN stale: same fight object, identical HPs, at
  // 3 consecutive day starts. Firings are counted in ctx.watchdogFired and
  // reported — they mark policy/harness gaps, not game bugs.
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
  // TIME-FREEZE WATCHDOG (competence panel 2026-10-10): Game.sleep() refuses
  // while Game.tbfight is set ("Not in the middle of a fight"). A stale
  // tbfight (e.g. left behind by a mid-chase scholar death after a barrier
  // exit) freezes scholar.day forever while the loop spins its 200
  // iterations doing nothing. If the game day hasn't advanced in 8
  // consecutive iterations with a fight still flagged, route the abandoned
  // fight via the game's own tbEnd('routed') ("no meat, no trophy").
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

function wrapPolicy(policy) {
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
  const onlyPolicy = (process.env.POLICY || '').trim();
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'sweep-oraclev2-results.json');
  const policies = POLICY_ORDER.filter(k => !onlyPolicy || k === onlyPolicy);
  if (!policies.length) { console.error('no policies match POLICY=' + onlyPolicy); process.exit(1); }
  console.log('policies: ' + policies.join(',') + ' seeds: ' + seeds.length + ' days: ' + days);
  const rows = [];
  const t0 = Date.now();
  let runN = 0;
  const totalRuns = seeds.length * policies.length;
  for (const seed of seeds) {
    for (const pid of policies) {
      try {
        // Common random numbers: same seed => identical RNG stream per policy.
        const { Game, loadFails } = await loadGame({ seed, mode: 'competence-panel' });
        if (loadFails && loadFails.length) console.log(`seed ${seed} ${pid}: LOAD FAILS: ${loadFails.join('; ')}`);
        await setupGame(Game);
        const { p, waveDay } = wrapPolicy(POLICIES[pid]);
        const ctx = { policyId: pid, notes: [] };
        instrument(Game, ctx);
        const result = await runOne(Game, p, days, waveDay, ctx);
        const end = snapshot(Game, ctx);
        end.waveDay = waveDay;
        end.engaged = engagedByWave(Game);
        end.util = ctx.util;
        ctx.util.systemQuests = end.sq;
        const deaths = result.deaths.map(d => d.cause || d.kind || '?');
        rows.push({
          seed, policy: pid, endReason: result.endReason,
          arc: end.arc, table: end.table, won: end.won,
          days: end.day, stage: end.stage, integ: end.integ, breadth: end.breadth,
          sentiment: end.sentiment, feastArmed: end.feastArmed,
          feastUsed: end.feastUsed, w: end.w, cx: end.cx, cr: end.cr,
          rank: end.rank, gate: end.gate, maxWave: end.maxWave,
          havenTier: end.havenTier, sq: end.sq, waveDay: end.waveDay,
          engaged: end.engaged, links: end.links,
          deaths: deaths.slice(0, 12),
          patrols: end.patrols || 0, struck: end.struck || 0, fled: end.fled || 0,
          proposed: end.proposed || 0, proposedPeer: end.proposedPeer || 0,
          climb: end.climb || 0, taught: end.taught || 0, named: end.named || 0,
          openers: end.openers || 0, armedUp: end.armedUp || 0,
          engagedFavored: end.engagedFavored || 0,
          v2AbilFired: end.v2AbilFired || 0, v2AbilRefused: end.v2AbilRefused || 0,
          v2CounterSeen: end.v2CounterSeen || 0, v2FightsAssessed: end.v2FightsAssessed || 0,
          v2SurgeFights: end.v2SurgeFights || 0, v2Crafts: end.v2Crafts || 0,
          v2TrapsSet: end.v2TrapsSet || 0, v2Treats: end.v2Treats || 0,
          v2AidCry: end.v2AidCry || 0, v2SysDone: end.v2SysDone || 0,
          v2QuestDone: end.v2QuestDone || 0,
          heldAbilities: end._v2abilities || 0, heldAbilitiesL3: end._v2abilitiesL3 || 0,
          synergies: end._v2syn || 0, surgeRes: end._v2surgeRes || 0,
          aidShort: end.aidShort || 0,
          barrierExits: end.barrierExits || 0,
          watchdogFired: end.watchdogFired || 0,
          timeFreezeCleared: end.timeFreezeCleared || 0,
          iters: result.iters,
          util: end.util,
        });
        runN++;
        const el = ((Date.now() - t0) / 1000).toFixed(0);
        const u = end.util;
        console.log(`[${runN}/${totalRuns} ${el}s] s${seed} ${pid}: ${result.endReason} d${end.day} won=${end.won} w[${end.w.join('/')}]+cx${end.cx} ${end.rank} uw${end.maxWave} t${end.havenTier} | v2ab:${end.v2AbilFired}/${end.v2AbilRefused} held:${end.heldAbilities}(L3:${end.heldAbilitiesL3}) syn:${end.synergies} kill:${u.kills}/${u.counterKills} craft:${u.craftsOk}/${u.crafts} trap:${u.trapCatches}/${u.trapsSet} feast:${u.feastsOk}/${u.feasts}${end.feastArmed ? 'A' : ''}${end.feastUsed ? 'U' : ''} aq:${u.aidAccepted}/${u.aidHanded}${end.aidShort ? ' short:' + end.aidShort : ''} sum:${u.summonsSeen} sq:${u.systemQuests}`);
      } catch (e) {
        rows.push({ seed, policy: pid, endReason: 'ERROR', error: String(e && e.message || e).slice(0, 300) });
        runN++;
        console.log(`[${runN}/${totalRuns}] s${seed} ${pid}: ERROR ${String(e && e.message || e).slice(0, 120)}`);
      }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log('wrote ' + OUT + ' (' + rows.length + ' rows)');
})();
