// BREAK-IT knowledge 4th pass — HONESTY: the conversation 'teach' handler
// (conversation.js) speaks the TRUE plant name even when the player knows the
// plant only WRONGLY (wrongAs), and doesn't propagate the wrongness to the
// learner (unlike firesideTeaching's wrong-branch, which records
// learner.wrongAbout — break 8's fix).
//
// BEFORE: "You show them <TRUE NAME>" for a plant the player believes is
// called something else — the true name spoken by a mouth that never learned
// it. The learner records the true pid with no wrongAbout.
//
// AFTER: the narration uses the player's known name (wrongAs), and the
// learner's wrongAbout records the false name (deliberate:false) so the
// wrongness travels like the fireside path.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261008, 7, 424242];

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  const v = G.state.village;
  const vid = (v.roster || []).find(id => id !== G.villagerId);
  if (!vid) return { seed, skip: 'no npc' };
  const plants = G.data.plants;
  const pid = plants[5].id, trueName = plants[5].name;
  const wrongPid = plants[6].id, wrongName = plants[6].name;

  // player knows ONE plant, only wrongly
  G.state.codex.plants = {};
  G.state.codex.plants[pid] = {
    identifiedDay: 1, level: 1, by: 'taught',
    wrongAs: wrongName, wrongPid, taughtBy: 'someone',
  };
  v.taught = v.taught || {}; v.taught[vid] = [];
  v.wrongAbout = v.wrongAbout || {};

  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  let err = null;
  try {
    G.startConvo(vid);
    G.convoTurn(vid, 'teach');
  } catch (e) { err = String((e && e.message) || e); }
  if (err) return { seed, error: err };

  const taughtLine = lines.find(l => /show them/i.test(l));
  const out = {};
  out.taught = !!taughtLine;
  // 1. the narration must not speak the true name of a wrong-known plant
  out.noTrueName = !lines.some(l => l.includes(trueName));
  // 2. it should speak the name the player actually believes
  out.wrongNameUsed = lines.some(l => l.includes(wrongName));
  // 3. the learner must learn it WRONG (wrongness travels, like fireside)
  const lw = ((v.wrongAbout || {})[vid] || {})[pid] || {};
  out.wrongnessTravels = lw.wrongPid === wrongPid && lw.deliberate === false;
  return { seed, ...out, detail: `line=${JSON.stringify((taughtLine || '').slice(0, 90))}` };
}

async function main() {
  let fails = 0, ran = 0;
  for (const seed of SEEDS) {
    const r = await run(seed);
    if (r.skip) { console.log(`SKIP seed ${r.seed}: ${r.skip}`); continue; }
    if (r.error) { console.log(`ERROR seed ${r.seed}: ${r.error}`); fails++; continue; }
    ran++;
    for (const k of ['taught', 'noTrueName', 'wrongNameUsed', 'wrongnessTravels']) {
      const ok = !!r[k];
      console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | ${k} | ${r.detail}`);
      if (!ok) fails++;
    }
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} seeds)` : `\nALL CHECKS PASSED (${ran} seeds)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
