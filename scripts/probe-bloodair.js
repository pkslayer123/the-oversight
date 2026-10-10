#!/usr/bin/env node
// probe-bloodair.js — Gap 4 investigation: why does blood-on-air never fire
// in natural runs? Measures contest flow end-to-end:
//  1. contests fired (per category, per id) in natural sims
//  2. how many have villager 'others' alongside the player
//  3. contestResolveVillager outcome distribution (won/lost/died/null)
//  4. fireCrisis('blood-on-air') count
// Usage: node scripts/probe-bloodair.js [seeds...] [days]
const H = require('./sim-harness');

const SEEDS = [20261010, 777, 42, 4242, 1001, 1002, 1003, 1004];
const DAYS = process.argv[3] ? +process.argv[3] : 200;

// Policy from the shared library: drive everything, pick choice 0, fight normally.
const policy = Object.assign({}, require('./policies/competent').competent);

async function one(seed) {
  const { Game } = await H.loadGame({ seed, mode: 'competent' });
  await H.setupGame(Game);

  const tally = {
    contestsFired: 0, byCat: {}, byId: {},
    othersTotal: 0, multiTake: 0,
    villRes: { won: 0, lost: 0, died: 0, null: 0, byCatDied: {} },
    bloodOnAir: 0, villDeaths: 0,
  };

  const origResolve = Game.contestResolveVillager;
  Game.contestResolveVillager = function (pid, contest, opts) {
    let r = null;
    try { r = origResolve.call(this, pid, contest, opts); } catch (e) { r = null; }
    const cat = (contest && contest.cat) || '?';
    if (!r) tally.villRes.null++;
    else {
      tally.villRes[r.outcome === 'died' ? 'died' : r.outcome === 'won' ? 'won' : 'lost']++;
      if (r.outcome === 'died') tally.villRes.byCatDied[cat] = (tally.villRes.byCatDied[cat] || 0) + 1;
    }
    return r;
  };

  const origFire = Game.fireContest;
  Game.fireContest = function (contest) {
    tally.contestsFired++;
    const cat = (contest && contest.cat) || '?';
    tally.byCat[cat] = (tally.byCat[cat] || 0) + 1;
    const id = (contest && contest.id) || '?';
    tally.byId[id] = (tally.byId[id] || 0) + 1;
    return origFire.call(this, contest);
  };

  const origInterruption = Game.contestInterruption;
  Game.contestInterruption = function (contest, ids) {
    const others = (Array.isArray(ids) ? ids : [ids]).filter(i => i !== 'player');
    tally.othersTotal += others.length;
    if (others.length) tally.multiTake++;
    return origInterruption.call(this, contest, ids);
  };

  const origNote = Game.noteCrisis;
  Game.noteCrisis = function (kind) {
    if (kind === 'blood-on-air') tally.bloodOnAir++;
    return origNote.call(this, kind);
  };
  const origFireCrisis = Game.fireCrisis;
  Game.fireCrisis = function (kind, ctx) {
    if (kind === 'blood-on-air') tally.bloodOnAir += 0.5; // counted via noteCrisis too; 0.5 avoids double
    return origFireCrisis.call(this, kind, ctx);
  };

  const origRD = Game.registerDeath;
  Game.registerDeath = function (p) {
    if (p && p !== 'player' && Game.isMember && !Game.isMember(p)) tally.villDeaths++;
    return origRD.call(this, p);
  };

  const res = await H.runDays(Game, policy, { days: DAYS, manifest: H.manifest(seed, 'competent') });
  tally.endReason = res.endReason;
  tally.days = res.days;
  return tally;
}

(async () => {
  for (const s of SEEDS) {
    const t = await one(+s);
    console.log(`seed ${s}: days=${t.days} end=${t.endReason}`);
    console.log(`  contestsFired=${t.contestsFired} byCat=${JSON.stringify(t.byCat)}`);
    console.log(`  multiTake=${t.multiTake} othersTotal=${t.othersTotal}`);
    console.log(`  villRes=${JSON.stringify(t.villRes)}`);
    console.log(`  bloodOnAir(notes)=${t.bloodOnAir} villDeaths~${t.villDeaths}`);
  }
})();
