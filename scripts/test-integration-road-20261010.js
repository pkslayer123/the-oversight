#!/usr/bin/env node
// test-integration-road-20261010.js — Gap 1 (integration-80 wall) proof.
// Only 6/60 competent sim runs reached integration 80 (stage 3); Arc IV
// requires stage 3. The audit flagged: dead system_task quest line,
// under-chased encore trials, discovery monoculture.
//
// Fixes under test (all deed-reactive, declining returns, never hard caps):
//   1. system_task revived: evSystemTask offers a real system_teach quest;
//      completable, recurring via progDaily, rewards 8,6,4,2(floor).
//   2. Monster naming grants integration (6,5,4,3,2 floor), one-shot/monster.
//   3. Ratings (viewership) milestones grant integration (6,5,4,3,2 floor).
//   4. Audience-trial task pool drops 'identify' when <3 plants remain below L3.
//
// Usage: SEED=20261010 node scripts/test-integration-road-20261010.js
//   or: SEEDS=1,2,3 node scripts/test-integration-road-20261010.js
'use strict';
const { loadGame, setupGame } = require('./sim-harness');

const SEEDS = (process.env.SEEDS || process.env.SEED || '20261010,7,424242')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  FAIL:', name, extra || ''); }
}

function plantIds(Game, n) {
  return (Game.data.plants || []).slice(0, n).map(p => p.id);
}
function integ(Game) { return Game.state.scholar.integration || 0; }
function l3count(Game) {
  return Object.values((Game.state.codex || {}).plants || {}).filter(e => (e.level || 0) >= 3).length;
}
function forceArrived(Game) {
  Game.state.systemArrived = true;
  Game.state.scholar.day = 30;
  Game.state.scholar.integration = 5;
}

async function sectionSystemQuests(Game, tag) {
  forceArrived(Game);
  const s = Game.state.scholar;
  check(`${tag} offerSystemQuest exists`, typeof Game.offerSystemQuest === 'function');
  check(`${tag} checkSystemQuest exists`, typeof Game.checkSystemQuest === 'function');
  check(`${tag} systemQuestReward exists`, typeof Game.systemQuestReward === 'function');
  if (typeof Game.offerSystemQuest !== 'function') return;

  // Teachable plants: identify a few (L1), leave below L3
  const pids = plantIds(Game, 6);
  for (const pid of pids) Game.identifyPlant(pid, 'test');
  check(`${tag} plants identified`, pids.every(pid => Game.plantKnown(pid)));

  // A. evSystemTask offers a REAL quest (not the dead {id:'system_task'} shape)
  // (bal-scale 2026-10-10: the system line lives in activeSystemQuest, its
  // own slot — a villager quest in activeQuest no longer blocks it.)
  Game.evSystemTask({});
  let q = s.activeSystemQuest;
  check(`${tag} evSystemTask sets quest`, !!q);
  check(`${tag} quest has completable type`, q && q.type === 'system_teach', JSON.stringify(q && { id: q.id, type: q.type }));
  check(`${tag} quest not the dead shape`, !q || q.id !== 'system_task');
  check(`${tag} quest text names L3`, q && /L3/.test(q.text || ''));
  check(`${tag} first reward is 8`, q && q.reward === 8, 'reward=' + (q && q.reward));
  const startN = q ? q.startN : -1;
  check(`${tag} startN snapshots L3 count`, q && startN === l3count(Game));

  // B. Ghost-quest guard must NOT lapse system quests (own slot now)
  Game.checkQuest('forage');
  check(`${tag} ghost guard spares system quest`, s.activeSystemQuest && s.activeSystemQuest.type === 'system_teach');

  // C. Completing: push a plant to L3, check completes with +8
  const before = integ(Game);
  Game.state.codex.plants[pids[0]].level = 3;
  const done = Game.checkSystemQuest();
  check(`${tag} checkSystemQuest completes`, done === true);
  check(`${tag} quest cleared`, !s.activeSystemQuest);
  check(`${tag} integration +8`, integ(Game) === before + 8, `${before} -> ${integ(Game)}`);
  check(`${tag} systemQuests counter 1`, Game.systemQuestsDone() === 1);

  // D. Declining schedule: 6, 4, 2, 2 (floor)
  const expected = [6, 4, 2, 2];
  for (let i = 0; i < expected.length; i++) {
    Game.offerSystemQuest('test');
    const qq = s.activeSystemQuest;
    check(`${tag} quest ${i + 2} reward ${expected[i]}`, qq && qq.reward === expected[i], 'got ' + (qq && qq.reward));
    const b2 = integ(Game);
    const pid = pids[i + 1] || pids[0];
    Game.state.codex.plants[pid].level = 3;
    Game.checkSystemQuest();
    check(`${tag} quest ${i + 2} grants +${expected[i]}`, integ(Game) === b2 + expected[i], `${b2} -> ${integ(Game)}`);
  }
  check(`${tag} five quests done`, Game.systemQuestsDone() === 5);

  // E. Offer refusals — and the slot separation (bal-scale 2026-10-10):
  // a village quest NO LONGER blocks the System's line; each keeps its slot.
  s.activeQuest = { type: 'bring', plant: 'x', qty: 1 }; // a village quest
  check(`${tag} offer fires despite village quest`, Game.offerSystemQuest('test') === true);
  check(`${tag} system quest in its own slot`, !!(s.activeSystemQuest && s.activeSystemQuest.type === 'system_teach'));
  check(`${tag} active village quest preserved`, s.activeQuest.type === 'bring');
  s.activeQuest = null;
  s.activeSystemQuest = null;
  for (const pid of Object.keys(Game.state.codex.plants)) Game.state.codex.plants[pid].level = 3;
  check(`${tag} offer refused when nothing teachable`, Game.offerSystemQuest('test') === false);
  Game.state.systemArrived = false;
  Game.state.codex.plants[pids[0]].level = 1;
  check(`${tag} offer refused pre-arrival`, Game.offerSystemQuest('test') === false);
  Game.state.systemArrived = true;

  // E2. Legacy migration: dead {id:'system_task'} shape converts into the
  // system slot (bal-scale 2026-10-10), and a legacy system_teach in
  // activeQuest routes there too — the villager slot is left clean.
  s.activeQuest = { id: 'system_task', desc: 'Bring a fully-identified plant (L3) to the System' };
  Game.checkSystemQuest();
  const mq = s.activeSystemQuest;
  check(`${tag} legacy system_task migrates`, !!mq && mq.type === 'system_teach', JSON.stringify(mq && { id: mq.id, type: mq.type }));
  check(`${tag} legacy migration clears villager slot`, !s.activeQuest);
  s.activeSystemQuest = null;
  const l3now = l3count(Game);
  s.activeQuest = { type: 'system_teach', giver: 'system', startN: l3now, reward: 8 };
  Game.checkSystemQuest();
  check(`${tag} legacy activeQuest system_teach routes to system slot`, !!(s.activeSystemQuest && s.activeSystemQuest.type === 'system_teach') && !s.activeQuest);
  s.activeSystemQuest = null;

  // F. doAction-path dispatch: system quest completes via checkQuest(kind)
  // (also with NO villager quest active — the system slot is independent)
  Game.state.codex.plants[pids[5]].level = 1; // re-teachable BEFORE offering
  Game.offerSystemQuest('test');
  check(`${tag} re-offer works when teachable again`, !!(s.activeSystemQuest && s.activeSystemQuest.type === 'system_teach'));
  const b3 = integ(Game);
  const n3 = l3count(Game);
  Game.state.codex.plants[pids[5]].level = 3;
  Game.checkQuest('rest');
  check(`${tag} checkQuest(kind) completes system quest`, !s.activeSystemQuest && l3count(Game) === n3 + 1 && integ(Game) > b3);
}

async function sectionNaming(Game, tag) {
  forceArrived(Game);
  const roster = (Game.state.village.roster || []).slice();
  check(`${tag} roster exists`, roster.length >= 3, 'roster=' + roster.length);
  const mids = ['hushwolf', 'gallowdeer', 'bulldozer', 'mirrormoth', 'belltoad', 'hummice', 'nightlight_catfish'];
  const expected = [6, 5, 4, 3, 2, 2, 2];
  for (let i = 0; i < mids.length; i++) {
    const mid = mids[i];
    const e = Game.ensureMonsterEntry(mid);
    e.reported = true; e.namingKicked = true; e.villageName = null; e.proposals = {};
    Game.backMonsterName(mid, 'Testname' + i); // player backing (double weight)
    for (const vid of roster) e.proposals[vid] = 'Testname' + i; // unanimous
    const before = integ(Game);
    Game.monsterNamingCheck(mid);
    check(`${tag} ${mid} named`, e.villageName === 'Testname' + i, 'villageName=' + e.villageName);
    check(`${tag} ${mid} grants +${expected[i]}`, integ(Game) === before + expected[i], `${before} -> ${integ(Game)}`);
  }
  // one-shot: re-check grants nothing
  const b = integ(Game);
  Game.monsterNamingCheck('hushwolf');
  check(`${tag} naming one-shot per monster`, integ(Game) === b);
  const pg = Game.progState();
  check(`${tag} namedMonsterGrants tracked`, Object.keys(pg.namedMonsterGrants || {}).length === mids.length);
}

async function sectionRatings(Game, tag) {
  forceArrived(Game);
  const v = Game.state.village;
  v.viewership = 10; v._peakViewership = 0;
  const expected = [6, 5, 4, 3, 2, 2];
  for (let i = 0; i < expected.length; i++) {
    v.viewership = 10 + i * 5;
    const before = integ(Game);
    Game.showCastPull();
    check(`${tag} milestone ${i + 1} grants +${expected[i]}`, integ(Game) === before + expected[i], `${before} -> ${integ(Game)}`);
  }
  const pg = Game.progState();
  check(`${tag} ratingMilestones counter`, (pg.ratingMilestones || 0) === expected.length);
  // ratchet: same viewership again grants nothing
  const b = integ(Game);
  Game.showCastPull();
  check(`${tag} milestone ratchets (no double)`, integ(Game) === b);
}

async function sectionTrialPool(Game, tag) {
  forceArrived(Game);
  const pg = Game.progState();
  // only 2 plants below L3 -> 'identify' must never be offered
  const pids = plantIds(Game, 8);
  for (const pid of pids) Game.identifyPlant(pid, 'test');
  for (const pid of pids.slice(0, 6)) Game.state.codex.plants[pid].level = 3;
  let sawIdentify = false;
  for (let i = 0; i < 30; i++) {
    pg.trial = null; pg.trialCd = 0;
    Game.offerAudienceTrial('audience');
    if (pg.trial && pg.trial.kind === 'identify') sawIdentify = true;
    pg.trial = null;
  }
  check(`${tag} identify excluded when <3 plants below L3`, !sawIdentify);
  // with plenty below L3, identify appears
  for (const pid of pids.slice(0, 6)) Game.state.codex.plants[pid].level = 1;
  let sawIdentify2 = false;
  for (let i = 0; i < 30; i++) {
    pg.trial = null; pg.trialCd = 0;
    Game.offerAudienceTrial('audience');
    if (pg.trial && pg.trial.kind === 'identify') sawIdentify2 = true;
    pg.trial = null;
  }
  check(`${tag} identify offered when teachable pool healthy`, sawIdentify2);
  // a completable audience trial still pays +15
  pg.trial = null; pg.trialCd = 0;
  const s = Game.state.scholar;
  Game.offerAudienceTrial('audience');
  pg.trial.kind = 'pantry'; pg.trial.id = 'haul_small'; pg.trial.need = 1000;
  pg.trial.start = Game.pantryKcal(); pg.trial.expires = (s.day || 0) + 3;
  Game.stockPantry(1500, 'test');
  const before = integ(Game);
  Game.checkTrial('daily');
  check(`${tag} audience trial completes for +15`, !pg.trial && integ(Game) === before + 15, `${before} -> ${integ(Game)}`);
}

async function sectionRoad(Game, tag) {
  // END-TO-END: a competent village doing deeds reaches 80 WITHOUT
  // exhaustive plant ID (the old road needed ~25 plants).
  forceArrived(Game);
  const s = Game.state.scholar;
  // skip the starting endowment — identifyPlant no-ops on known plants
  const pids = plantIds(Game, 40).filter(pid => !Game.plantKnown(pid)).slice(0, 10);
  check(`${tag} 10 unknown plants available`, pids.length === 10);
  for (const pid of pids) Game.identifyPlant(pid, 'test'); // +30 -> 35
  check(`${tag} 10 discoveries -> 35`, integ(Game) === 35, 'integ=' + integ(Game));
  // 4 system quests: 8+6+4+2 -> 55
  for (let i = 0; i < 4; i++) {
    Game.offerSystemQuest('test');
    Game.state.codex.plants[pids[i]].level = 3;
    Game.checkSystemQuest();
  }
  check(`${tag} 4 system quests -> 55`, integ(Game) === 55, 'integ=' + integ(Game));
  // 3 namings: 6+5+4 -> 70
  const roster = (Game.state.village.roster || []).slice();
  const mids = ['hushwolf', 'gallowdeer', 'bulldozer'];
  mids.forEach((mid, i) => {
    const e = Game.ensureMonsterEntry(mid);
    e.reported = true; e.namingKicked = true; e.proposals = {};
    Game.backMonsterName(mid, 'Road' + i);
    for (const vid of roster) e.proposals[vid] = 'Road' + i;
    Game.monsterNamingCheck(mid);
  });
  check(`${tag} 3 namings -> 70`, integ(Game) === 70, 'integ=' + integ(Game));
  // 2 ratings milestones: 6+5 -> 81 >= 80
  const v = Game.state.village;
  v.viewership = 10; v._peakViewership = 0; Game.showCastPull();
  v.viewership = 15; Game.showCastPull();
  check(`${tag} 2 milestones -> 81`, integ(Game) === 81, 'integ=' + integ(Game));
  check(`${tag} integration 80 reached`, integ(Game) >= 80);
  check(`${tag} stage 3 (full integration)`, Game.integrationStage() === 3, 'stage=' + Game.integrationStage());
  check(`${tag} 6 ability slots at 80`, Game.abilitySlots() === 6, 'slots=' + Game.abilitySlots());
  const pg = Game.progState();
  check(`${tag} slot moment 80 fired`, !!(pg.slotMoments && pg.slotMoments[80]));
  // starting endowment pre-identifies a few; the point is we never needed
  // the ~25-plant exhaustive monoculture the old road demanded.
  const totalPlants = Object.keys(Game.state.codex.plants || {}).length;
  check(`${tag} no discovery monoculture (<20 plants)`, totalPlants < 20, 'plants=' + totalPlants);
}

(async () => {
  for (const seed of SEEDS) {
    const tag = `seed=${seed}`;
    console.log(`--- ${tag} ---`);
    try {
      let L = await loadGame({ seed, mode: 'integration-road' });
      if (L.loadFails && L.loadFails.length) console.log('  loadFails:', L.loadFails.slice(0, 3).join(' | '));
      await setupGame(L.Game);
      await sectionSystemQuests(L.Game, tag + ' sysquest');
      await sectionNaming(L.Game, tag + ' naming');
      await sectionRatings(L.Game, tag + ' ratings');
      await sectionTrialPool(L.Game, tag + ' trialpool');
      // fresh instance for the end-to-end road (clean prog state)
      L = await loadGame({ seed: seed + 1000000, mode: 'integration-road' });
      await setupGame(L.Game);
      await sectionRoad(L.Game, tag + ' road');
    } catch (e) {
      fail++;
      fails.push(`${tag} EXCEPTION: ${e.message}`);
      console.log('  EXCEPTION:', e.stack.split('\n').slice(0, 4).join('\n'));
    }
  }
  console.log(`\n==== integration-road: ${pass} pass, ${fail} fail (${SEEDS.length} seeds) ====`);
  if (fails.length) { console.log('failures:'); for (const f of fails.slice(0, 20)) console.log(' -', f); }
  process.exit(fail ? 1 : 0);
})();
