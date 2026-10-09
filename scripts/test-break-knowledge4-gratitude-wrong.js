// BREAK-IT knowledge 4th pass — HONESTY/FUNCTION: the villageLives gratitude
// branch (game.js, villagerInitiative) teaches the player a plant with a
// DIRECT identifyPlant() call — no wrongTeaching() beat. Every other
// player-facing teaching path (teachPlant, firesideTeaching, tradeKnowledge,
// conversation teach) runs the bad-knowledge check; this one hands the TRUE
// name for free even when the grateful teacher is wrong about the plant.
//
// BEFORE: teacher wrongAbout[pid] set -> player identifyPlant(pid) -> TRUE
// name in codex, no wrongAs, no contested. The whole wrong-knowledge system
// bypassed by gratitude.
//
// AFTER: the branch runs wrongTeaching(rid, pid, 'gratitude') first; a wrong
// teacher teaches wrong (wrongAs lands) or gets contested, like everywhere.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261008, 7, 424242];

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  const v = G.state.village;
  const rid = (v.roster || []).find(id => id !== G.villagerId);
  if (!rid) return { seed, skip: 'no npc' };
  const plants = G.data.plants;
  const pid = plants[8].id, trueName = plants[8].name;
  const wrongPid = plants[9].id, wrongName = plants[9].name;

  // grateful mood: recent gift memory
  G.remember(rid, 'gift', 'test gift');
  // teacher knows the plant, wrongly
  v.taught = v.taught || {}; v.taught[rid] = [pid];
  v.wrongAbout = v.wrongAbout || {};
  v.wrongAbout[rid] = { [pid]: { wrongPid, deliberate: false } };
  // player does NOT know the plant
  G.state.codex.plants = {};
  // NPC on the player's node, within 5
  G.npcSetNode(rid, G.map.px, G.map.py);
  v.positions = v.positions || {};
  v.positions[rid] = { mx: (G.state.scholar.mx ?? 4), my: (G.state.scholar.my ?? 4) };
  // only this NPC is eligible this part
  for (const id of (v.roster || [])) {
    if (id !== rid && id !== G.villagerId) { try { G.npcSetNode(id, 0, 0); } catch (e) {} }
  }

  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  // force the gratitude branch: stub Math.random so the "come talk" 0.16 gate
  // MISSES (call 1), the grateful 0.15 gate HITS (call 2), and the act pick
  // lands on 'teach' (call 3). Restored immediately after.
  const realRandom = Math.random;
  let calls = 0;
  const seq = [0.99, 0.01, 0.01];
  Math.random = () => { calls++; return calls <= seq.length ? seq[calls - 1] : realRandom(); };
  let err = null;
  try { G.villagerInitiative(); } catch (e) { err = String((e && e.message) || e); }
  Math.random = realRandom;
  if (err) return { seed, error: err };

  const e = (G.state.codex.plants || {})[pid] || {};
  const out = {};
  // post-fix the lesson lands through wrongTeaching's own narration
  // ("IDENTIFIED (maybe): ..."), not the gratitude hand-press line.
  out.teachFired = !!e.level;
  // 1. the wrong lesson must land as wrong (wrongAs), not as true knowledge
  out.wrongAsLands = e.wrongAs === wrongName;
  // 2. no free true-name identification from a wrong teacher
  out.noFreeTrueName = !(e.level >= 1 && !e.wrongAs && !e.contested);
  return { seed, ...out, detail: `teachFired=${!!e.level} wrongAs=${e.wrongAs || '-'} level=${e.level || 0}` };
}

async function main() {
  let fails = 0, ran = 0;
  for (const seed of SEEDS) {
    const r = await run(seed);
    if (r.skip) { console.log(`SKIP seed ${r.seed}: ${r.skip}`); continue; }
    if (r.error) { console.log(`ERROR seed ${r.seed}: ${r.error}`); fails++; continue; }
    ran++;
    for (const k of ['teachFired', 'wrongAsLands', 'noFreeTrueName']) {
      const ok = !!r[k];
      console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | ${k} | ${r.detail}`);
      if (!ok) fails++;
    }
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} seeds)` : `\nALL CHECKS PASSED (${ran} seeds)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
