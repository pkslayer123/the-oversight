// BREAK-IT knowledge 5th pass — BREAK 23 (EXPLOIT) + BREAK 24 (DEAD/HONESTY).
//
// BREAK 23: contested -> callOutTeaching was an infinite trust farm.
// wrongTeaching() mints a FRESH contested marker on every call (overwriting
// resolved ones) and the teacher's wrongAbout was never cleared, so the same
// lie could be re-taught and re-corrected forever: +2 trust per quiet
// callout (progressive but uncapped below 100), witness bumps per public
// callout, calloutsDone climbing. The quiet-liar copy even promised "they
// don't lie to you again" — but they did, every teach.
// AFTER: resolution clears wrongAbout[vid][pid] — a corrected teacher stops
// teaching the lie. One correction per wrongness; the farm is dead.
//
// BREAK 24: public callout set village.distrusted[vid] ("the village now
// discounts their word") but nothing ever read it — dead state, dishonest
// copy. AFTER: spreadPlantKnowledge skips distrusted villagers as rumor
// teachers — their word carries no weight.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261009, 7, 424242];

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  const v = G.state.village;
  const vid = (v.roster || []).find(id => id !== G.villagerId);
  const learner = (v.roster || []).find(id => id !== G.villagerId && id !== vid);
  const plants = G.data.plants;
  const pid = plants[0].id, wrongPid = plants[1].id, pid2 = plants[2].id;
  const out = {};

  // --- BREAK 23: the farm ---
  // player knows better (L2); villager is wrong about this plant (persistent)
  G.state.codex.plants = { [pid]: { identifiedDay: 1, level: 2, harvests: 0, tastings: 0, by: 'observation' } };
  v.wrongAbout = { [vid]: { [pid]: { wrongPid, deliberate: false } } };
  v.trust = v.trust || {}; v.trust[vid] = 35;

  const w1 = G.wrongTeaching(vid, pid, 'taught');
  out.firstContested = w1 === 'contested';
  out.contestedListed = (G.hasContestedWith(vid) || []).includes(pid);
  const trustBefore = v.trust[vid];
  const c1 = G.callOutTeaching(vid, pid);
  const e1 = G.state.codex.plants[pid];
  out.calledOut = c1 === true && e1.contested.resolved === true;
  out.trustRose = v.trust[vid] > trustBefore;
  // THE FIX: the teacher's wrongness is gone after correction
  out.wrongnessCleared = !((v.wrongAbout[vid] || {})[pid]);
  out.noLongerListed = !(G.hasContestedWith(vid) || []).includes(pid);
  // second teach: pre-fix mints a fresh contested marker (farm continues);
  // post-fix the teacher is corrected -> null
  const w2 = G.wrongTeaching(vid, pid, 'taught');
  out.farmDead = w2 === null || w2 === undefined || w2 === false;
  out.detail23 = `w1=${w1} w2=${w2} trust=${trustBefore}->${v.trust[vid]}`;

  // deliberate liar: quiet callout promises "they don't lie to you again"
  const pidL = plants[3].id;
  G.state.codex.plants[pidL] = { identifiedDay: 1, level: 2, by: 'observation' };
  v.wrongAbout[vid] = v.wrongAbout[vid] || {};
  v.wrongAbout[vid][pidL] = { wrongPid, deliberate: true };
  v.trust[vid] = 40;
  G.wrongTeaching(vid, pidL, 'taught');
  G.callOutTeaching(vid, pidL);
  out.liarStopsLying = !((v.wrongAbout[vid] || {})[pidL]);

  // --- BREAK 24: distrusted wiring ---
  // public callout marks the liar distrusted
  const pidP = plants[4].id;
  G.state.codex.plants[pidP] = { identifiedDay: 1, level: 2, by: 'observation' };
  v.wrongAbout[vid] = v.wrongAbout[vid] || {};
  v.wrongAbout[vid][pidP] = { wrongPid, deliberate: true };
  v.trust[vid] = 10;
  G.wrongTeaching(vid, pidP, 'taught');
  G.callOutTeaching(vid, pidP, { public: true });
  out.markedDistrusted = !!((v.distrusted || {})[vid]);

  // spreadPlantKnowledge: the ONLY knower is distrusted -> rumor stalls
  v.taught = { [vid]: [pid2] };
  v.plantRumors = { [pid2]: { day: 1 } };
  const savedRandom = Math.random;
  Math.random = () => 0.1; // force the 0.35 teaching gate open
  try {
    G.spreadPlantKnowledge();
    const learnerKnows = ((v.taught[learner] || []).includes(pid2));
    out.distrustedStallsRumor = !learnerKnows;
    // control: clear distrusted -> the rumor moves
    delete v.distrusted[vid];
    v.plantRumors = { [pid2]: { day: 1 } };
    G.spreadPlantKnowledge();
    out.controlRumorMoves = ((v.taught[learner] || []).includes(pid2));
  } finally {
    Math.random = savedRandom;
  }

  return { seed, ...out };
}

async function main() {
  const keys = ['firstContested', 'contestedListed', 'calledOut', 'trustRose',
    'wrongnessCleared', 'noLongerListed', 'farmDead', 'liarStopsLying',
    'markedDistrusted', 'distrustedStallsRumor', 'controlRumorMoves'];
  let fails = 0, ran = 0;
  for (const seed of SEEDS) {
    let r;
    try { r = await run(seed); } catch (e) { console.log(`FATAL seed ${seed}: ${e.stack.split('\n').slice(0,3).join(' | ')}`); fails++; continue; }
    ran++;
    for (const k of keys) {
      const ok = !!r[k];
      console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | ${k}${k === 'farmDead' ? ' | ' + r.detail23 : ''}`);
      if (!ok) fails++;
    }
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} seeds ran)` : `\nALL CHECKS PASSED (${ran} seeds)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
