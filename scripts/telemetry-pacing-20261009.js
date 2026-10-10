#!/usr/bin/env node
// telemetry-pacing-20261009.js — holistic pacing/strategy measurement
// (Steve 2026-10-09: pacing audit, relationships, build diversity, strategy).
//
// Records per run (4 policies x N seeds x 200 days):
//   pacing: arc transition days, stage transition days, crisis day+kind,
//           contest days (fired/ended), integration/breadth curves, end path
//   social: trust distribution (mean/min/strong ties), gossip count, eat events
//   builds: ability_granted stream (id/who/day), player slots, villager abilities
//   food: kcal by source (forage/fish/scavenge/eat), pantry curve
//   survival: endReason, endDay
//
// Usage: SEEDS="1,2,..." POLICIES="zero,mvc,leader,competent" DAYS=200 \
//   OUT=<path> node scripts/telemetry-pacing-20261009.js
'use strict';
const fs = require('fs');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const idle = require('./policies/idle');
const { competent } = require('./policies/competent');

const POLICIES = { zero: idle.zero, mvc: idle.mvc, leader: idle.leader, competent };
const parseList = (e, d) => (process.env[e] || d).split(',').map(s => s.trim()).filter(Boolean);

function snap(Game) {
  const o = { arc: 1, stage: 0, integ: 5, breadth: 0, pop: 0, trust: null, pantry: 0, crises: [], slots: 0, syns: 0 };
  try { o.arc = Game.progState().arc || 1; } catch (e) {}
  try { o.crises = Object.keys(Game.progState().crises || {}); } catch (e) {}
  try { o.stage = Game.integrationStage(); } catch (e) {}
  try { o.integ = Math.round(Game.state.scholar.integration || 5); } catch (e) {}
  try { o.breadth = Game.codexBreadth(); } catch (e) {}
  try { o.pop = (Game.state.village.roster || []).length; } catch (e) {}
  try {
    const tr = Object.values((Game.state.village || {}).trust || {});
    if (tr.length) o.trust = { mean: +(tr.reduce((a, b) => a + b, 0) / tr.length).toFixed(1), min: Math.min.apply(null, tr), strong: tr.filter(t => t >= 60).length, n: tr.length };
  } catch (e) {}
  try { o.pantry = Math.round(((Game.state.village || {}).pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0)); } catch (e) {}
  try { o.slots = Game.abilitySlots(); } catch (e) {}
  try { o.syns = (Game.activeSynergies ? Game.activeSynergies().length : 0); } catch (e) {}
  return o;
}

(async () => {
  const seeds = parseList('SEEDS', '1').map(Number);
  const policyIds = parseList('POLICIES', 'zero,mvc,leader,competent');
  const days = parseInt(process.env.DAYS || '200', 10);
  const outFile = process.env.OUT || null;
  const runs = [];

  for (const pid of policyIds) {
    const base = POLICIES[pid];
    if (!base) { console.error('unknown policy: ' + pid); process.exit(1); }
    for (const seed of seeds) {
      const { Game } = await loadGame({ seed, mode: pid, fullTelemetry: false });
      // Wrap tele(): count by type, keep key payloads. Never let a hostile read kill the run.
      const teleCount = {}, teleKeep = { integrate: {}, ability: [], contest: [], death: [], eat: { n: 0, kcal: 0 }, forage: { n: 0, kcal: 0 }, fish: { n: 0, kcal: 0 }, scavenge: { n: 0, kcal: 0 }, combat: 0, trust: 0, gossip: 0 };
      let gameDay = 0;
      try {
        const origTele = Game.tele.bind(Game);
        Game.tele = function (type, payload) {
          try {
            teleCount[type] = (teleCount[type] || 0) + 1;
            const p = payload || {};
            if (type === 'integrate') { const r = p.reason || 'unknown'; teleKeep.integrate[r] = (teleKeep.integrate[r] || 0) + (p.amount || 0); }
            else if (type === 'ability_granted') teleKeep.ability.push({ id: p.id, who: p.who, day: gameDay });
            else if (type === 'contest_fired') teleKeep.contest.push({ day: gameDay, phase: 'fired' });
            else if (type === 'contest_end') teleKeep.contest.push({ day: gameDay, phase: 'end' });
            else if (type === 'death') teleKeep.death.push({ day: gameDay, kind: p.kind, who: p.who, cause: p.cause });
            else if (type === 'eat') { teleKeep.eat.n++; teleKeep.eat.kcal += (p.ateKcal || 0); }
            else if (type === 'forage') { teleKeep.forage.n++; teleKeep.forage.kcal += (p.kcal || 0); }
            else if (type === 'fish') { teleKeep.fish.n++; teleKeep.fish.kcal += (p.kcal || 0); }
            else if (type === 'scavenge') { teleKeep.scavenge.n++; teleKeep.scavenge.kcal += (p.kcal || 0); }
            else if (type === 'combat_start') teleKeep.combat++;
            else if (type === 'trust') teleKeep.trust++;
          } catch (e) {}
          try { return origTele(type, payload); } catch (e) {}
        };
      } catch (e) {}
      await setupGame(Game);

      const policy = Object.assign({}, base);
      const arcDay = {}, stageDay = {}, crisisDay = {}, seenCrisis = new Set();
      const curve = [];
      let lastArc = 1, lastStage = 0, lastDay = 0;
      const origDaily = base.daily;
      policy.daily = (G, ctx) => {
        let s = null;
        try { s = snap(G); } catch (e) {}
        if (s) {
          try { gameDay = G.state.scholar.day || 0; } catch (e) {}
          lastDay = gameDay;
          if (!(s.arc in arcDay)) arcDay[s.arc] = gameDay;
          if (!(s.stage in stageDay)) stageDay[s.stage] = gameDay;
          if (s.arc > lastArc) lastArc = s.arc;
          if (s.stage > lastStage) lastStage = s.stage;
          for (const k of s.crises) if (!seenCrisis.has(k)) { seenCrisis.add(k); crisisDay[k] = gameDay; }
          if (gameDay % 5 === 0) curve.push([gameDay, s.arc, s.stage, s.integ, s.breadth, s.pop, s.trust ? s.trust.mean : null, s.pantry]);
        }
        if (origDaily) { try { return origDaily(G, ctx); } catch (e) {} }
      };
      const result = await runDays(Game, policy, { days, sampleEvery: 30 });

      // end-state details
      let sentiment = false, feast = false, table = false, won = false, integ = 5, stage = 0;
      let playerAbs = [], slots = 0, syns = 0, gossipN = 0, trustEnd = null;
      try { sentiment = !!Game.progState().sentimentTaught; } catch (e) {}
      try { feast = !!(Game.state.scholar.prog || {}).feastSurgeUsed; } catch (e) {}
      try { table = !!Game.progState().tableWaiting; } catch (e) {}
      try { won = !!Game.won; } catch (e) {}
      try { integ = Math.round(Game.state.scholar.integration || 5); } catch (e) {}
      try { stage = Game.integrationStage(); } catch (e) {}
      try { playerAbs = (Game.state.scholar.abilities || []).map(a => ({ id: a.id, level: a.level || 1 })); } catch (e) {}
      try { slots = Game.abilitySlots(); } catch (e) {}
      try { syns = (Game.activeSynergies ? Game.activeSynergies().length : 0); } catch (e) {}
      try { gossipN = (Game.state.village.gossip || []).length; } catch (e) {}
      try {
        const tr = Object.values((Game.state.village || {}).trust || {});
        if (tr.length) trustEnd = { mean: +(tr.reduce((a, b) => a + b, 0) / tr.length).toFixed(1), min: Math.min.apply(null, tr), max: Math.max.apply(null, tr), strong: tr.filter(t => t >= 60).length, n: tr.length };
      } catch (e) {}
      // villager ability diversity: final villager snapshot from harness samples
      let vAbils = {};
      try {
        const vs = (result.samples.villagers || []);
        if (vs.length) {
          const last = vs[vs.length - 1][1] || [];
          for (const v of last) vAbils[v.vid] = { occ: v.occ, abilities: v.abilities, xp: v.xp, kills: v.kills, exped: v.exped };
        }
      } catch (e) {}

      runs.push({
        policy: pid, seed, days: result.days, endReason: result.endReason,
        maxArc: Math.max(lastArc, (arcDay[4] != null ? 4 : arcDay[3] != null ? 3 : arcDay[2] != null ? 2 : 1)),
        arcDay, stageDay, crisisDay, contest: teleKeep.contest, deaths: teleKeep.death,
        integrate: teleKeep.integrate, abilities: teleKeep.ability,
        eat: teleKeep.eat, forage: teleKeep.forage, fish: teleKeep.fish, scavenge: teleKeep.scavenge,
        combats: teleKeep.combat, trustEvents: teleKeep.trust, teleCount,
        sentiment, feastSurge: feast, tableWaiting: table, won,
        integEnd: integ, stageEnd: stage, playerAbs, slots, syns,
        gossipN, trustEnd, vAbils, curve, ms: result.ms,
      });
      console.log(`done: ${pid} seed=${seed} days=${result.days} end=${result.endReason} maxArc=${Math.max(lastArc, 1)} crises=${seenCrisis.size} contests=${teleKeep.contest.length} integ=${integ} (${result.ms}ms)`);
    }
  }

  if (outFile) { fs.writeFileSync(outFile, JSON.stringify({ meta: { days, date: new Date().toISOString().slice(0, 10) }, runs })); console.log('wrote ' + outFile); }
})();
