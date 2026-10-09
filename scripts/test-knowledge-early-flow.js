#!/usr/bin/env node
// test-knowledge-early-flow.js — proof for knowledge acquisition repair (Steve 2026-10-09).
// Asserts the four early-knowledge flows on a fixed seed:
//   A. a curious forager examines unknowns within 2 days (fieldNotes grow)
//   B. 3 examinations + testCautiously (taste) -> L1, source 'fieldwork', no teaching event
//   C. days 1-5: every fireside teaches when something is learnable
//   D. one plant rumor spreads village-wide within 4 days (16 day-parts)
// Run: node scripts/test-knowledge-early-flow.js [seed]
// Before/after: git stash (tracked) in the worktree, run, git stash pop.
'use strict';
const { loadGame, setupGame } = require('./sim-harness');

const SEED = parseInt(process.env.SEED || process.argv[2] || '20261009', 10);
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const { Game } = await loadGame({ seed: SEED, mode: 'knowledge-proof' });
  await setupGame(Game, 'Columbus, Ohio');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  console.log(`seed=${SEED} roster=${roster.length} day=${Game.state.scholar.day}`);

  // ---------- A. curious forager examines ----------
  console.log('A. curious forager field notes');
  const forager = roster[0];
  try {
    const person = Game.getPerson(forager);
    person.personality = person.personality || {};
    person.personality.curiosity = 'curious';
  } catch (e) {}
  v.fieldNotes = {};
  // 6 forage resolutions ~= 2 days of assigned foraging
  for (let i = 0; i < 6; i++) {
    try { Game.resolveOneAssignment(forager, { task: 'forage' }); } catch (e) {}
  }
  const fn = (v.fieldNotes || {})[forager] || {};
  const totalLooks = Object.values(fn).reduce((a, b) => a + b, 0);
  ok('fieldNotes non-empty after 6 forage resolutions', totalLooks > 0, `${totalLooks} looks`);
  // 3rd-look transition: pre-seed 2 looks, one more resolution completes
  const pidA = (Game.data.plants || []).map(p => p.id).find(id =>
    !((v.taught[forager] || []).includes(id)) && !((v.sharedKnowledge || {})[id]) && !((Game.state.codex.plants || {})[id]));
  v.fieldNotes[forager] = { [pidA]: 2 };
  const sharedBefore = Object.keys(v.sharedKnowledge || {}).length;
  try { Game.resolveOneAssignment(forager, { task: 'forage' }); } catch (e) {}
  // force the pre-seeded plant to be the pick: run until it completes or 40 tries
  let completed = !!((v.sharedKnowledge || {})[pidA]);
  for (let i = 0; i < 40 && !completed; i++) {
    try { Game.resolveOneAssignment(forager, { task: 'forage' }); } catch (e) {}
    completed = !!((v.sharedKnowledge || {})[pidA]);
  }
  ok('3rd look identifies (sharedKnowledge grows)', completed, pidA);

  // ---------- B. fieldwork self-ID: 3 examines + taste -> L1 ----------
  console.log('B. fieldwork self-identification');
  const Ex = (globalThis.Scattering && globalThis.Scattering.Examine) || null;
  const pidB = (Game.data.plants || []).map(p => p.id).find(id => !((Game.state.codex.plants || {})[id]));
  // wipe any prior observations of pidB for a clean test
  if (Game.state.codex.observations) delete Game.state.codex.observations[pidB];
  for (let i = 0; i < 3; i++) Ex.observePlant(pidB, 'examine');
  const obsB = Ex.observationOf(pidB);
  ok('3 examinations recorded', obsB && obsB.count >= 3, `count=${obsB && obsB.count}`);
  // build a testable lump of pidB
  const s = Game.state.scholar;
  s.inventory.push({ lump: { [pidB]: { units: 5 } }, name: 'test lump', unit: 'handful' });
  const idx = s.inventory.length - 1;
  const codexBefore = Object.keys(Game.state.codex.plants || {}).length;
  let threw = null;
  try { Game.testCautiously(idx); } catch (e) { threw = e.message; }
  const entryB = (Game.state.codex.plants || {})[pidB];
  ok('no throw', !threw, threw || '');
  ok('L1 identified without teaching', !!(entryB && entryB.level >= 1), `by=${entryB && entryB.by}`);
  ok('source is fieldwork (not tested)', entryB && entryB.by === 'fieldwork', `by=${entryB && entryB.by}`);
  ok('exactly one new codex plant', Object.keys(Game.state.codex.plants || {}).length === codexBefore + 1, '');

  // ---------- C. early fireside reliability (days 1-5) ----------
  console.log('C. early fireside teaches every time');
  Game.state.scholar.day = 2;
  v.sharedKnowledge = {}; // isolate: no leftover entries competing in the pick
  let taughtCount = 0;
  const TRIALS = 12;
  for (let t = 0; t < TRIALS; t++) {
    const pidC = (Game.data.plants || []).map(p => p.id).find(id => !((v.sharedKnowledge || {})[id]));
    if (!pidC) break;
    v.sharedKnowledge[pidC] = { discoveredBy: roster[1] || forager, day: 2, level: 1, taughtAround: false };
    try { Game.firesideTeaching(true); } catch (e) {}
    if (v.sharedKnowledge[pidC].taughtAround) taughtCount++;
  }
  ok(`all ${TRIALS} firesides taught on day 2`, taughtCount === TRIALS, `${taughtCount}/${TRIALS}`);

  // ---------- D. village-wide spread within 4 days ----------
  console.log('D. rumor spreads village-wide in <=4 days');
  const pidD = (Game.data.plants || []).map(p => p.id).find(id => !((v.taught[roster[0]] || []).includes(id)));
  v.plantRumors = { [pidD]: { day: Game.state.scholar.day } };
  // one knower, everyone else must learn
  const knower = roster[0];
  v.taught[knower] = v.taught[knower] || [];
  if (!v.taught[knower].includes(pidD)) v.taught[knower].push(pidD);
  for (const rid of roster) {
    if (rid === knower) continue;
    v.taught[rid] = (v.taught[rid] || []).filter(id => id !== pidD);
  }
  const learners0 = roster.filter(rid => !(v.taught[rid] || []).includes(pidD)).length;
  for (let part = 0; part < 16; part++) { // 4 days x 4 parts
    try { Game.spreadPlantKnowledge(); } catch (e) {}
  }
  const learners1 = roster.filter(rid => !(v.taught[rid] || []).includes(pidD)).length;
  ok('full village knows within 16 parts', learners1 === 0, `${learners0} -> ${learners1} learners left`);

  console.log(`\nRESULT seed=${SEED}: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
