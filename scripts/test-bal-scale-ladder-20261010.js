#!/usr/bin/env node
// test-bal-scale-ladder-20261010.js — bal-scale proof: scale on-ramp +
// play-weighted integration cadence.
// BEFORE (HEAD): (1) maybeVillageRumor heard the nearest fire ~day 22 —
// no organic on-ramp inside a normal life; (2) genVillages 2-3 made
// national mathematically unreachable (LEAD needs 3 subs, covenant/trade 3
// peers, BELONG a foreign 4-realm); (3) system quests fired at flat 15%/day
// and shared the villager-quest slot (a 'visit' quest blocked the System
// for the whole run).
// AFTER: early-contact rumor boost, 3-4 villages, play-weighted offer
// chance (arc/link/completion recency), system quest in its own slot.
// Deterministic discriminators use mocked Math.random where the old and new
// numbers differ; the "BEFORE fails" direction was verified by stashing.
// Usage: SEEDS=7,11,99 node scripts/test-bal-scale-ladder-20261010.js
'use strict';
const { loadGame, setupGame } = require('./sim-harness');

const SEEDS = (process.env.SEEDS || process.env.SEED || '7,11,99')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  FAIL:', name, extra || ''); }
}
function withRandom(val, fn) {
  const orig = Math.random;
  Math.random = () => val;
  try { return fn(); } finally { Math.random = orig; }
}

async function sectionRumor(Game, tag) {
  const s = Game.state.scholar;
  s.day = 5;
  // a close village, unheard-of
  const v = { id: 'vtest', name: 'Testville', x: 6, y: 4, rumored: false, generated: false };
  // random 0.2: below the new 0.28 early-contact chance, above the old 0.039
  // base (0.06 - 3*0.007) — BEFORE this never fires, AFTER it fires.
  const fired = withRandom(0.2, () => Game.maybeVillageRumor(v));
  check(`${tag} early rumor fires at 0.2 (boost)`, fired === true && v.rumored === true);
  // random 0.5: above even the boosted chance — still quiet
  const v2 = { id: 'vtest2', name: 'Testville2', x: 6, y: 4, rumored: false, generated: false };
  const quiet = withRandom(0.5, () => Game.maybeVillageRumor(v2));
  check(`${tag} rumor still a roll (0.5 quiet)`, quiet === false && v2.rumored === false);
  // late game: no boost — old curve applies (0.039 at dist 3; 0.2 stays quiet)
  s.day = 30;
  const v3 = { id: 'vtest3', name: 'Testville3', x: 6, y: 4, rumored: false, generated: false };
  const late = withRandom(0.2, () => Game.maybeVillageRumor(v3));
  check(`${tag} no early boost after day 15`, late === false && v3.rumored === false);
  s.day = 5;
}

async function sectionVillageCount(Game, tag) {
  // 20 generations: every count must be 3-4 (BEFORE: 2-3, so 2s appeared)
  let min = 99, max = 0;
  for (let i = 0; i < 20; i++) {
    Game.genVillages();
    const n = (Game.state.otherVillages || []).length;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  check(`${tag} village count 3-4 (min)`, min >= 3, 'min=' + min);
  check(`${tag} village count 3-4 (max)`, max <= 4, 'max=' + max);
}

async function sectionCadence(Game, tag) {
  Game.state.systemArrived = true;
  const s = Game.state.scholar;
  s.day = 30;
  const pids = (Game.data.plants || []).slice(0, 4).map(p => p.id);
  for (const pid of pids) Game.identifyPlant(pid, 'test');
  let pg = Game.progState();
  const teachable = () => Object.keys((Game.state.codex || {}).plants || {})
    .filter(pid => ((Game.state.codex.plants[pid] || {}).level || 1) < 3).length > 0;
  check(`${tag} teachable plants exist`, teachable());

  // A. recency weights the offer: lastArcDay = today → chance 45%;
  //    random 0.3 fires AFTER (0.3 < 0.45), not BEFORE (0.3 >= 0.15).
  pg.lastArcDay = 30; pg.lastSystemQuestDay = -999; Game.state.lastLinkDay = -999;
  s.activeSystemQuest = null;
  const firedArc = withRandom(0.3, () => Game.offerSystemQuest('daily'));
  check(`${tag} arc recency weights offer (0.3 fires)`, firedArc === true);
  check(`${tag} quest landed in system slot`, !!(s.activeSystemQuest && s.activeSystemQuest.type === 'system_teach'));
  s.activeSystemQuest = null;

  // B. link recency: lastLinkDay = today → chance 45%
  pg.lastArcDay = -999; Game.state.lastLinkDay = 30;
  const firedLink = withRandom(0.3, () => Game.offerSystemQuest('daily'));
  check(`${tag} link recency weights offer (0.3 fires)`, firedLink === true);
  s.activeSystemQuest = null;

  // C. completion chains: lastSystemQuestDay = today → chance 65%
  pg.lastSystemQuestDay = 30; Game.state.lastLinkDay = -999;
  const firedChain = withRandom(0.5, () => Game.offerSystemQuest('daily'));
  check(`${tag} completion chains next offer (0.5 fires)`, firedChain === true);
  s.activeSystemQuest = null;

  // D. no recency → base 15% only: 0.3 stays quiet (no regression vs flat)
  pg.lastArcDay = -999; pg.lastSystemQuestDay = -999; Game.state.lastLinkDay = -999;
  const quiet = withRandom(0.3, () => Game.offerSystemQuest('daily'));
  check(`${tag} base rate unchanged when nothing recent`, quiet === false && !s.activeSystemQuest);

  // E. event offers bypass the roll (explicit event = the System leaning in)
  const firedEvent = withRandom(0.99, () => Game.offerSystemQuest('event'));
  check(`${tag} event offer bypasses chance roll`, firedEvent === true);
  s.activeSystemQuest = null;

  // F. completion records the chain day
  Game.offerSystemQuest('event');
  const q = s.activeSystemQuest;
  check(`${tag} event offer sets quest`, !!q);
  Game.state.codex.plants[pids[0]].level = 3;
  const n0 = (Game.progState().systemQuests || 0);
  Game.checkSystemQuest();
  check(`${tag} completion stamps lastSystemQuestDay`, Game.progState().lastSystemQuestDay === 30);
  check(`${tag} completion counts`, (Game.progState().systemQuests || 0) === n0 + 1);
}

async function sectionLinkDay(Game, tag) {
  // forming a link stamps state.lastLinkDay (weights the System's cadence)
  Game.state.systemArrived = true;
  const s = Game.state.scholar;
  s.day = 20;
  Game.state.lastLinkDay = -999;
  Game.genVillages();
  const v = (Game.state.otherVillages || [])[0];
  v.rumored = true; v.generated = true;
  if (!v.roster) { try { Game.genVillageRoster(v); } catch (e) {} }
  if (!v.knowledgeProfile) { try { v.knowledgeProfile = Game.genVillageKnowledgeProfile(v); } catch (e) {} }
  let link = null;
  try { link = Game._formLink(v.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null); } catch (e) {}
  check(`${tag} link forms`, !!link);
  check(`${tag} link stamps lastLinkDay`, Game.state.lastLinkDay === 20, 'got ' + Game.state.lastLinkDay);
  check(`${tag} first link stages Regional Dawn`, !!Game.state.pendingAccord || !!Game.state.networkLive);
}

(async () => {
  for (const seed of SEEDS) {
    console.log(`--- seed=${seed} ---`);
    const tag = `seed=${seed}`;
    const { Game } = await loadGame({ seed, mode: 'bal-scale-ladder' });
    await setupGame(Game);
    await sectionRumor(Game, tag + ' rumor');
    await sectionVillageCount(Game, tag + ' count');
    await sectionCadence(Game, tag + ' cadence');
    await sectionLinkDay(Game, tag + ' linkday');
  }
  console.log(`\n==== bal-scale-ladder: ${pass} pass, ${fail} fail (${SEEDS.length} seeds) ====`);
  if (fails.length) { console.log('failures:'); for (const f of fails) console.log(' -', f); }
  process.exit(fail ? 1 : 0);
})();
