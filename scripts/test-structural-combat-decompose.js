#!/usr/bin/env node
// test-structural-combat-decompose.js — DECOMPOSITION harness (Worker B, 2026-10-10).
//
// Instrument, don't guess. Runs oracle-v2 over the standard 60-seed × 120d
// day loop and classifies every death:
//
//   Player deaths (tactical combat):
//     - hopeless-fight:   died in a fight whose measured DPR trajectory was
//                         hopeless (rtd < rtk*0.6 at the last pre-death point)
//                         — retreat was the legible answer, policy/fight didn't.
//     - too-fast:         died in rounds 1-2, before the fight's trajectory
//                         was legible (no retreat decision possible).
//     - fair-fight-lost:  fought an even-or-favored fight and lost it.
//     - no-retreat:       relentless pursuer present (fleeing just relocates
//                         the fight — only Haven ends it) or sealed/noFlee.
//     - tent-ambush:      killed inside the tent (breach → fight).
//     - the night:        cause 'the night' (overnight spiral).
//   Villager deaths (field fights):
//     - hopeless:         rec.everHopeless && vDie (retreat triggered too late
//                         or never — the fix target).
//     - fair-fight-lost:  vDie without everHopeless (won or even trajectory,
//                         lost anyway).
//     - awareness-fail:   evade check failed (they walked into it).
//     - wounds-after:     cause 'a wound that wouldn't close' (upstream of
//                         death — wound-stabilization lever).
//     - starvation/thirst/other: non-combat.
//   Monster/wave attribution: which monsters kill, which waves, night vs day.
//
// Usage: SEEDS="1-60" DAYS=120 OUT=scripts/combat-decompose.json node scripts/test-structural-combat-decompose.js
// 'before' run on current master; 'after' run after the fix lands.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests, manifest } = require('./sim-harness');
const { oracleV2 } = require('./policies/oracle-v2');

const SEEDS = (process.env.SEEDS || '1-60').split(',').flatMap(r => {
  const m = r.trim().match(/^(\d+)-(\d+)$/);
  if (m) { const a = []; for (let i = +m[1]; i <= +m[2]; i++) a.push(i); return a; }
  return [+r.trim()];
});
const DAYS = +(process.env.DAYS || 120);
const OUT = process.env.OUT || null;

// monster id -> {id, wave} lookup, built per run from Game.data
function mdefOf(Game, id) {
  try { return (Game.data.monsters || []).find(m => m.id === id) || {}; } catch (e) { return {}; }
}

// ---------- per-run instrumentation ----------
function instrument(Game, D) {
  const wrap = (name, fn) => {
    const o = Game[name];
    if (typeof o !== 'function') { D.wrapFails.push(name); return false; }
    Game[name] = function () { return fn.call(this, o, Array.prototype.slice.call(arguments)); };
    return true;
  };

  // --- field fights (villager vs monster, off-screen) ---
  wrap('fieldFight', function (orig, a) {
    const vid = a[0], mdef = a[1] || {}, opts = a[3] || {};
    const rec = orig.apply(this, a);
    try {
      const night = Game.isNight ? Game.isNight() : false;
      const day = ((Game.state || {}).scholar || {}).day || 0;
      const r = {
        vid: vid, outcome: rec.outcome, rounds: rec.rounds,
        everHopeless: !!rec.everHopeless, everWinning: !!rec.everWinning,
        fleeHopeless: rec.fleeHopeless, fleeHpFrac: rec.fleeHpFrac,
        minHpFrac: rec.minHpFrac, vTaken: rec.vTaken, mDealt: rec.mDealt,
        calledHelp: !!rec.calledHelp, monsterId: mdef.id || '?', wave: mdef.wave || 1,
        night: night, day: day, noFlee: !!opts.noFlee,
        awareness: !!opts.awareness,
      };
      (D.ffLog = D.ffLog || []).push(r);
      (D.ffByVid = D.ffByVid || {})[vid] = r;
      if (rec.outcome === 'vDie') D.ffDeaths = (D.ffDeaths || 0) + 1;
    } catch (e) {}
    return rec;
  });

  // --- tactical fight open/close (player combat) ---
  wrap('startCombat', function (orig, a) {
    const r = orig.apply(this, a);
    try {
      const f = Game.tbfight;
      const s = (Game.state || {}).scholar || {};
      const mons = f ? f.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive !== false) : [];
      D.curFight = {
        startDay: s.day || 0, dayPart: Game.dayPart, night: Game.isNight ? Game.isNight() : false,
        inTent: !!s.insideTent, monsterIds: mons.map(m => (m.mdef || {}).id || m.monsterId || '?'),
        waves: mons.map(m => ((m.mdef || {}).wave) || 1),
        relentless: mons.some(m => (m.mdef || {}).relentless),
        noFlee: !!(f && f.noFlee),
        startHp: {}, round: 1, barrierAttempted: false,
      };
      for (const x of (f ? f.fighters : [])) { if (x && x.key) D.curFight.startHp[x.key] = x.hp; }
    } catch (e) {}
    return r;
  });
  wrap('tbEnd', function (orig, a) {
    let f = null, res = a[0];
    try { f = Game.tbfight; } catch (e) {}
    const r = orig.apply(this, a);
    try {
      if (D.curFight) {
        D.curFight.result = res || '?';
        if (f) D.curFight.endRound = f.round || 1;
        (D.fights = D.fights || []).push(D.curFight);
      }
      D.curFight = null;
    } catch (e) { D.curFight = null; }
    return r;
  });
  wrap('tbBarrierExit', function (orig, a) {
    try { if (D.curFight) D.curFight.barrierAttempted = true; } catch (e) {}
    return orig.apply(this, a);
  });

  // --- the death hook itself ---
  const origRD = Game.registerDeath;
  Game.registerDeath = function (opts) {
    opts = opts || {};
    try {
      const s = (Game.state || {}).scholar || {};
      const vid = opts.villagerId || null;
      const isPlayer = !!(vid && vid === Game.villagerId);
      const night = Game.isNight ? Game.isNight() : false;
      const rec = {
        day: s.day || 0, dayPart: Game.dayPart, night: night,
        who: vid || opts.name || '?', isPlayer: isPlayer,
        kind: opts.kind || '?', cause: opts.cause || '?', wave: null,
        monsterId: null, inTent: !!s.insideTent,
      };
      if (isPlayer) {
        // player combat context from the live fight
        const f = D.curFight || null;
        if (f) {
          rec.monsterId = (f.monsterIds || [])[0] || null;
          rec.wave = (f.waves || [])[0] || null;
          rec.fightNight = f.night; rec.fightInTent = f.inTent;
          rec.relentless = !!f.relentless; rec.noFlee = !!f.noFlee;
          rec.barrierAttempted = !!f.barrierAttempted;
          rec.startRound = f.round || 1;
          // hopeless/fair measured from HP deltas over the fight so far
          try {
            const tf = Game.tbfight;
            if (tf) {
              const rounds = Math.max(1, (tf.round || 1) - 1);
              let mLost = 0, mLeft = 0, pLost = 0, pLeft = 0;
              for (const x of tf.fighters) {
                if (!x || x.key == null) continue;
                const start = (f.startHp || {})[x.key];
                if (start == null) continue;
                const lost = Math.max(0, start - (x.hp || 0));
                if (x.kind === 'monster' || x.kind === 'hostile') { mLost += lost; mLeft += Math.max(0, x.hp || 0); }
                else if (x.key === 'p') { pLost += lost; pLeft = Math.max(0, x.hp || 0); }
              }
              const vDpr = mLost / rounds, mDpr = pLost / rounds;
              rec.pDpr = +mDpr.toFixed(1); rec.vDpr = +vDpr.toFixed(1);
              const rtk = mLeft / Math.max(1, vDpr), rtd = pLeft / Math.max(1, mDpr);
              rec.hopelessNow = rtd < rtk * 0.6;
              rec.winningNow = rtk <= rtd * 1.1;
              rec.rounds = rounds;
            }
          } catch (e) {}
        }
        if (!rec.monsterId && typeof Game._tbLastMonster === 'string') rec.monsterId = Game._tbLastMonster;
      } else if ((opts.cause || '') === 'combat' && D.curFight && D.curFight.startDay === (s.day || 0)) {
        // tactical villager death (died beside the player): check FIRST — a
        // stale field-fight record from days ago must not claim this death.
        // The field-fight correlation doesn't apply — take monster context
        // from the live fight.
        const f = D.curFight;
        rec.monsterId = (f.monsterIds || [])[0] || null;
        rec.wave = (f.waves || [])[0] || null;
        rec.tactical = true; rec.fightNight = f.night;
        rec.relentless = !!f.relentless; rec.noFlee = !!f.noFlee;
      } else {
        // villager death: correlate with their last field fight
        const ff = (D.ffByVid || {})[vid];
        if (ff) {
          rec.monsterId = ff.monsterId; rec.wave = ff.wave;
          rec.ffOutcome = ff.outcome; rec.ffEverHopeless = ff.everHopeless;
          rec.ffEverWinning = ff.everWinning; rec.ffRounds = ff.rounds;
          rec.ffNight = ff.night; rec.ffFleeHpFrac = ff.fleeHpFrac;
          rec.ffFleeHopeless = ff.fleeHopeless;
        }
      }
      (D.deaths = D.deaths || []).push(rec);
    } catch (e) { /* instrumentation must never break the sim */ }
    return origRD.call(this, opts);
  };
}

// ---------- classification ----------
function classifyPlayerCombat(d) {
  if (d.relentless) return 'no-retreat (relentless)';
  if (d.noFlee) return 'no-retreat (sealed)';
  if (d.rounds != null && d.rounds < 2) return 'too-fast (rounds<2)';
  if (d.hopelessNow) return d.barrierAttempted ? 'hopeless (fled but died)' : 'hopeless (no retreat attempted)';
  if (d.winningNow) return 'fair-fight-lost';
  return 'fair-fight-lost (even)';
}
function classifyVillagerCombat(d) {
  if (d.tactical) {
    // died in the player's tactical fight (kind 'person', cause 'combat')
    if (d.relentless) return 'tactical (relentless)';
    return 'tactical (stood in)';
  }
  if (d.ffOutcome === 'vDie') {
    if (d.ffEverHopeless) return 'hopeless (retreat too late)';
    if (d.ffEverWinning) return 'fair-fight-lost (was winning)';
    return 'fair-fight-lost';
  }
  return 'other/unknown';
}

// ---------- main ----------
(async () => {
  const rows = [];
  let t0 = Date.now();
  for (let i = 0; i < SEEDS.length; i++) {
    const seed = SEEDS[i];
    const { Game } = await loadGame({ seed, mode: 'combat-decompose', fullTelemetry: false });
    const D = { seed, deaths: [], fights: [], ffLog: [], ffByVid: {}, wrapFails: [] };
    instrument(Game, D);
    setupGame(Game);
    const ctx = { policyId: 'oracle-v2' };
    // day loop (verbatim villagerTurn-corrected loop from winrate-iter4)
    let day = 0;
    const wdPush = () => {};
    for (day = 1; day <= DAYS; day++) {
      for (let p = 0; p < 3; p++) {
        if (Game.over) break;
        try { if (oracleV2.upkeep) oracleV2.upkeep(Game, ctx); } catch (e) {}
        driveFights(Game, oracleV2, ctx);
        driveContests(Game, oracleV2, ctx);
        if (Game.over) break;
        try { Game.doAction('wait'); } catch (e) {}
        driveFights(Game, oracleV2, ctx);
        driveContests(Game, oracleV2, ctx);
        if (Game.over) break;
      }
      if (Game.over) break;
      try { if (oracleV2.daily) oracleV2.daily(Game, ctx); } catch (e) {}
      driveFights(Game, oracleV2, ctx);
      driveContests(Game, oracleV2, ctx);
      if (Game.over) break;
      try { Game.sleep(); } catch (e) {}
      driveFights(Game, oracleV2, ctx);
      driveContests(Game, oracleV2, ctx);
      if (Game.over) break;
      if ((((Game.state.village || {}).roster || []).length) === 0) break;
    }
    const endReason = Game.over ? (Game.villageLost ? 'village-lost' : 'over-other') : (day >= DAYS ? 'survived' : 'pop-zero');
    rows.push({ seed, endReason, day: Math.min(day, DAYS), deaths: D.deaths, ffLog: D.ffLog, fights: D.fights.map(f => ({ monsterIds: f.monsterIds, waves: f.waves, result: f.result, night: f.night, inTent: f.inTent, relentless: f.relentless, barrierAttempted: f.barrierAttempted })), wrapFails: D.wrapFails });
    const el = Math.round((Date.now() - t0) / 1000);
    console.log(`[${i + 1}/${SEEDS.length} ${el}s] seed ${seed}: ${endReason} d${Math.min(day, DAYS)} deaths=${D.deaths.length}`);
  }

  // ---- analysis ----
  const allDeaths = rows.flatMap(r => r.deaths.map(d => ({ ...d, seed: r.seed })));
  const playerDeaths = allDeaths.filter(d => d.isPlayer);
  const villagerDeaths = allDeaths.filter(d => !d.isPlayer && (d.kind === 'villager' || d.kind === 'person'));
  const monsterDeaths = allDeaths.filter(d => d.kind === 'monster');
  const COMBAT_CAUSES = new Set(['combat']);
  const isPlayerCombat = d => d.isPlayer && (d.cause === 'combat' || (d.cause || '').indexOf('split-fight:') === 0 || d.monsterId);
  const isVillagerCombat = d => !d.isPlayer && (d.cause === 'combat' || d.ffOutcome === 'vDie' || (d.ffOutcome === undefined && /monster|deer|wolf|boar|toad|moth|hummice|speedbump|nightlight|ducks|glasswing|sunbasker|nevermore|nightcourt|statickite|mosquito|tick|static|grief|performance|inspiration|nostalgia|warranty|understudy|landlord|heckler|paparazzo|union|moderator|redactor|gavel|focus|spool|chorus|terms|callback|buffering|ad_break|congregation|strike|influencer|audit|reunion|suburb|eulogy|algorithm|eater|cancellation|editor|rerun|spoiler|timeslot|nielsen|finale|network/i.test(d.cause || '')));
  const isNightDeath = d => d.cause === 'the night';
  const isWoundDeath = d => (d.cause || '').indexOf("wound that wouldn") >= 0;

  const pCombat = playerDeaths.filter(isPlayerCombat);
  const vCombat = villagerDeaths.filter(isVillagerCombat);
  const nightD = allDeaths.filter(isNightDeath);
  const woundD = villagerDeaths.filter(isWoundDeath);

  const out = {
    manifest: manifest('combat-decompose', 'oracle-v2'),
    seeds: SEEDS, days: DAYS,
    totals: {
      deaths: allDeaths.length,
      playerDeaths: playerDeaths.length,
      villagerDeaths: villagerDeaths.length,
      monsterDeaths: monsterDeaths.length,
      playerCombat: pCombat.length,
      villagerCombat: vCombat.length,
      night: nightD.length,
      woundUpstream: woundD.length,
      combatShare: +( (pCombat.length + vCombat.length) / Math.max(1, allDeaths.length) ).toFixed(3),
    },
    playerCombatBreakdown: {},
    villagerCombatBreakdown: {},
    monsterKills: {},      // monsterId -> player combat deaths
    villagerKillerWave: {}, // wave -> villager combat deaths
    playerKillerWave: {},
    nightBreakdown: {},
    fieldFightOutcomes: {},
    samplePlayerDeaths: pCombat.slice(0, 25),
    sampleVillagerDeaths: vCombat.slice(0, 25),
  };
  for (const d of pCombat) {
    const c = classifyPlayerCombat(d) + (d.fightInTent ? ' +tent' : '');
    out.playerCombatBreakdown[c] = (out.playerCombatBreakdown[c] || 0) + 1;
    if (d.monsterId) out.monsterKills[d.monsterId] = (out.monsterKills[d.monsterId] || 0) + 1;
    if (d.wave) out.playerKillerWave['w' + d.wave] = (out.playerKillerWave['w' + d.wave] || 0) + 1;
  }
  for (const d of vCombat) {
    const c = classifyVillagerCombat(d);
    out.villagerCombatBreakdown[c] = (out.villagerCombatBreakdown[c] || 0) + 1;
    if (d.monsterId) out.villagerKillerMonster = out.villagerKillerMonster || {}, out.villagerKillerMonster[d.monsterId] = (out.villagerKillerMonster[d.monsterId] || 0) + 1;
    if (d.wave) out.villagerKillerWave['w' + d.wave] = (out.villagerKillerWave['w' + d.wave] || 0) + 1;
  }
  for (const d of nightD) {
    const c = d.isPlayer ? 'player' : 'villager';
    out.nightBreakdown[c] = (out.nightBreakdown[c] || 0) + 1;
  }
  // field fight outcome census (all villager fights, not just deaths)
  const ffAll = rows.flatMap(r => r.ffLog);
  for (const f of ffAll) {
    out.fieldFightOutcomes[f.outcome || '?'] = (out.fieldFightOutcomes[f.outcome || '?'] || 0) + 1;
  }
  out.fieldFightTotal = ffAll.length;
  out.fieldFightHopelessFlee = ffAll.filter(f => f.outcome === 'vFlee' && f.fleeHopeless).length;
  out.fieldFightEverHopeless = ffAll.filter(f => f.everHopeless).length;
  out.tacticalFights = rows.flatMap(r => r.fights).length;
  out.fightsFled = rows.flatMap(r => r.fights).filter(f => f.result === 'fled').length;

  console.log('\n===== COMBAT DEATH DECOMPOSITION =====');
  console.log(JSON.stringify(out.totals, null, 2));
  console.log('--- player combat deaths by class ---');
  console.log(JSON.stringify(out.playerCombatBreakdown, null, 2));
  console.log('--- villager combat deaths by class ---');
  console.log(JSON.stringify(out.villagerCombatBreakdown, null, 2));
  console.log('--- monster killers (player) ---');
  console.log(JSON.stringify(out.monsterKills, null, 2));
  console.log('--- killer waves: player / villager ---');
  console.log(JSON.stringify(out.playerKillerWave), JSON.stringify(out.villagerKillerWave));
  console.log('--- field fight outcomes (all) ---');
  console.log(JSON.stringify(out.fieldFightOutcomes), 'total', out.fieldFightTotal, 'everHopeless', out.fieldFightEverHopeless, 'hopelessFlee', out.fieldFightHopelessFlee);
  console.log('--- night deaths ---', JSON.stringify(out.nightBreakdown), '--- wound-upstream deaths ---', woundD.length);

  if (OUT) { fs.writeFileSync(OUT, JSON.stringify({ summary: out, rows }, null, 2)); console.log('wrote', OUT); }
})();
