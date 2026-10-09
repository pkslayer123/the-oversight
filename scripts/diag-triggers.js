#!/usr/bin/env node
// diag-triggers.js — gap triage diagnostics: WHY don't triggers fire?
// Monkey-patches counters around the reactive schedulers, runs N seeds,
// reports per-run trigger state. Answers: sim artifact vs game bug.
'use strict';
const { loadGame, setupGame, runDays } = require('./sim-harness');
const { competent } = require('./policies/competent');

const SEEDS = (process.env.SEEDS || '1,2,3,4,5').split(',').map(Number);
const DAYS = parseInt(process.env.DAYS || '40', 10);

async function one(seed) {
  const { Game } = await loadGame({ seed, mode: 'diag', fullTelemetry: true });
  await setupGame(Game);

  const c = {
    contestTickCalls: 0, contestTickFires: 0, contestTickNullDay: 0,
    contestTickNullBudget: 0, contestTickNullChance: 0, contestTickNullEligible: 0,
    fireShowCalls: 0, showTypes: {},
    pickContestCalls: 0, contestsPicked: {},
    unlockedWaveMax: 1, waveKills: {},
    lootGrants: 0, lootTiers: {},
    diseaseVectors: {},
  };

  // contestTick: count calls and null reasons
  const origTick = Game.contestTick.bind(Game);
  Game.contestTick = function () {
    c.contestTickCalls++;
    const day = (this.state.scholar || {}).day || 1;
    if (day < 14) { c.contestTickNullDay++; return null; }
    const r = origTick();
    if (!r) {
      const b = this.state.showBudget || {};
      if (b.used >= 2) c.contestTickNullBudget++;
      else c.contestTickNullChance++; // chance roll or no-eligible (can't distinguish cheaply)
    } else c.contestTickFires++;
    return r;
  };
  // fireShow: what actually aired
  const origFireShow = Game.fireShow ? Game.fireShow.bind(Game) : null;
  if (origFireShow) {
    Game.fireShow = function (show) {
      c.fireShowCalls++;
      const id = (show && show.id) || '?';
      c.showTypes[id] = (c.showTypes[id] || 0) + 1;
      return origFireShow(show);
    };
  }
  // pickContest: which contests get picked
  const origPick = Game.pickContest ? Game.pickContest.bind(Game) : null;
  if (origPick) {
    Game.pickContest = function () {
      c.pickContestCalls++;
      const r = origPick();
      const id = (r && r.id) || 'null';
      c.contestsPicked[id] = (c.contestsPicked[id] || 0) + 1;
      return r;
    };
  }
  // loot grants
  const origLoot = Game.alienLootGrant ? Game.alienLootGrant.bind(Game) : null;
  if (origLoot) {
    Game.alienLootGrant = function (itemId, toCorpse) {
      c.lootGrants++;
      return origLoot(itemId, toCorpse);
    };
  }

  const res = await runDays(Game, competent, { days: DAYS });
  // wave state at end
  try { c.unlockedWaveMax = Game.unlockedWave(); } catch (e) {}
  try { c.waveKills = Object.assign({}, Game.state.waveKills || {}); } catch (e) {}
  // disease vector check: did giant mosquito / alien tick ever spawn?
  try {
    const tele = res.telemetry || [];
    for (const ev of tele) {
      if (ev.type === 'combat_start' && /mosquito|tick/i.test(ev.vs || '')) {
        c.diseaseVectors[ev.vs] = (c.diseaseVectors[ev.vs] || 0) + 1;
      }
    }
  } catch (e) {}
  return { seed, days: res.gameDays, end: res.endReason, ...c };
}

(async () => {
  for (const s of SEEDS) {
    try {
      const r = await one(s);
      console.log(JSON.stringify(r));
    } catch (e) { console.log(JSON.stringify({ seed: s, error: e.message })); }
  }
})();
