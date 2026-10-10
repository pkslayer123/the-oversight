#!/usr/bin/env node
// run-parity-chunk.js — one parity chunk: runs seeds sequentially in ONE
// process (never parallel in-process), with parity instrumentation.
// Env: SEEDS="1-10" POLICIES="competent,socialite" DAYS=200 OUT=<json>
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { instrumentParity } = require('./parity-instr');
const { competent } = require('./policies/competent');
const { socialite } = require('./policies/socialite');
const idle = require('./policies/idle');

const POLICIES = { competent, socialite, mvc: idle.mvc };

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-10').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

// Per-day villager activity classification. Answers: are villagers doing
// things as individuals, or sitting idle in long stretches?
function classifyVillagers(Game, act) {
  try {
    const v = Game.state.village || {};
    const roster = v.roster || [];
    for (const vid of roster) {
      if (vid === Game.villagerId) continue;
      let person = null;
      try { person = Game.getPerson(vid); } catch (e) {}
      if (person && person.dead) { bump(act.dead, 1); continue; }
      let cls = 'free';
      try {
        if ((v.away || {})[vid]) cls = 'away';
        else if (Game.isEngaged && Game.isEngaged(vid)) cls = 'engaged';
        else if ((v.assignments || {})[vid]) cls = 'assigned';
        else {
          let exped = false;
          try { exped = !!((Game.agencyState() || {}).exped || {})[vid]; } catch (e) {}
          if (exped) cls = 'expedition';
          else {
            let obj = null;
            try { obj = Game.objOf ? Game.objOf(vid) : null; } catch (e) {}
            if (obj && obj.state && obj.state !== 'done' && obj.state !== 'idle') cls = 'objective:' + obj.state;
            else cls = 'free';
          }
        }
      } catch (e) {}
      act.byClass[cls] = (act.byClass[cls] || 0) + 1;
      // free-streak tracking per villager
      const key = String(vid).slice(0, 12);
      act.streak = act.streak || {};
      const st = act.streak[key] = act.streak[key] || { free: 0, maxFree: 0, cls: {} };
      if (cls === 'free') {
        st.free++;
        if (st.free > st.maxFree) st.maxFree = st.free;
      } else { st.free = 0; }
      st.cls[cls] = (st.cls[cls] || 0) + 1;
    }
  } catch (e) {}
  function bump(o, n) {}
}

(async () => {
  const seeds = parseSeeds(process.env.SEEDS || '1-10');
  const policyIds = (process.env.POLICIES || 'competent,socialite').split(',').map(s => s.trim());
  const days = parseInt(process.env.DAYS || '200', 10);
  const OUT = process.env.OUT || path.join(ROOT, 'scripts', 'parity-chunk.json');
  const rows = [];
  let n = 0;
  const t0 = Date.now();
  const total = seeds.length * policyIds.length;
  for (const pid of policyIds) {
    const base = POLICIES[pid];
    if (!base) { console.log('unknown policy ' + pid); continue; }
    for (const seed of seeds) {
      const { Game } = await loadGame({ seed, mode: pid });
      await setupGame(Game);
      const P = instrumentParity(Game);
      // HARNESS CORRECTION: the shared runDays drives time through raw
      // tickAction(128), which fires npcBatchTurn (ambient movement) but
      // NOT villagerTurn (the needs-driven individual-action driver —
      // hunger foraging, fear, rest, social). In live play every player
      // action routes through doAction -> villagerTurn. Without this the
      // parity sweep would measure villagers standing still. Drive one
      // villagerTurn per 128-tick batch here (chunk-runner-local; the shared
      // sim-harness is untouched so other loops' pacing numbers don't move).
      (function () {
        const origTick = Game.tickAction;
        if (typeof origTick === 'function') {
          Game.tickAction = function (n, opts) {
            const r = origTick.apply(this, arguments);
            try {
              // grid positions are assigned when the Haven detail generates
              // in live play (ensureVillagerPositions) — the headless harness
              // never renders a grid, so without this villagerTurn finds an
              // empty positions map and no villager ever acts.
              if (Game.ensureVillagerPositions) Game.ensureVillagerPositions();
              if (!this.over && !this.tbfight) this.villagerTurn();
            } catch (e) {}
            return r;
          };
        }
      })();
      const act = { byClass: {}, streak: {}, dead: 0 };
      // wrap npcTakeAction for grid-action rate
      (function () {
        const orig = Game.npcTakeAction;
        if (typeof orig === 'function') {
          let hits = 0;
          Game.npcTakeAction = function (...args) { hits++; return orig.apply(this, args); };
          P.counters._npcTakeActionHits = () => hits;
        }
      })();
      const policy = Object.assign({}, base);
      const origDaily = base.daily;
      policy.daily = (G, ctx) => {
        if (origDaily) { try { origDaily(G, ctx); } catch (e) {} }
        classifyVillagers(G, act);
      };
      const result = await runDays(Game, policy, { days });
      const snap = P.snapshot();
      snap.npcTakeActionHits = typeof P.counters._npcTakeActionHits === 'function' ? P.counters._npcTakeActionHits() : null;
      snap.activity = {
        byClass: act.byClass,
        dead: act.dead,
        streaks: Object.fromEntries(Object.entries(act.streak).map(([k, s]) => [k, { maxFree: s.maxFree, cls: s.cls }])),
      };
      snap.endReason = result.endReason;
      snap.policy = pid; snap.seed = seed;
      snap.ms = result.ms;
      rows.push(snap);
      n++;
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[${n}/${total} ${el}s] seed ${seed} ${pid}: ${result.endReason} d${snap.days} npcActs:${snap.npcTakeActionHits} fights:${JSON.stringify(snap.fieldFights)} grants:${Object.keys(snap.grants).length}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log('wrote ' + OUT);
})();
