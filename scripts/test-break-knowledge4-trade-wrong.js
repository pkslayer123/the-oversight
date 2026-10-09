// BREAK-IT knowledge 4th pass — EXPLOIT/HONESTY: tradeKnowledge knowledge-price
// payment accepts a plant the player knows ONLY WRONG (wrongAs).
//
// BEFORE: `yourPlants` filtered only on plantKnown (L1+). A wrongAs entry is
// L1, so it counted as currency. The trade line then printed the plant's TRUE
// name ("Trade: you teach X about <TRUE NAME>") — a name the player never
// learned — and villagerLearnsPlant recorded the TRUE pid for the trader,
// laundering the player's false knowledge into correct knowledge while the
// player got real L3 knowledge in return. Counterfeit currency.
//
// AFTER: wrongAs entries are excluded from payment currency. If the player's
// only known plants are wrongly-known, the refusal says so honestly instead
// of printing the true name.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261008, 7, 424242, 987654321];

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  const v = G.state.village;
  const cand = (v.roster || []).find(id => id !== G.villagerId);
  if (!cand) return { seed, skip: 'no npc' };
  // make them a trader; keep their pool/taught clean
  const origTrader = G.isKnowledgeTrader;
  G.isKnowledgeTrader = (id) => id === cand ? true : (origTrader ? origTrader.call(G, id) : false);
  v.taught = v.taught || {}; v.taught[cand] = [];

  const plants = G.data.plants;
  const wrongPid = plants[0].id, otherPid = plants[1].id;
  const trueName = plants[0].name, wrongName = plants[1].name;
  const pool = G.traderKnowledge(cand, true);
  // pick a wrong-known plant outside the trader's pool
  const wk = plants.find(p => !pool.includes(p.id));
  const wp = wk, wName = wk.name;
  const buyPid = pool[0];
  if (!buyPid || buyPid === wk.id) return { seed, skip: 'pool clash' };

  // player knows ONE plant, and only WRONGLY (taught wrong by a villager)
  G.state.codex.plants = {};
  G.state.codex.plants[wk.id] = {
    identifiedDay: 1, level: 1, by: 'taught',
    wrongAs: plants[2].name, wrongPid: plants[2].id, taughtBy: cand,
  };
  v.trust[cand] = 10; // price = 'knowledge'

  lines.length = 0;
  const res = G.tradeKnowledge(cand, buyPid);
  const out = {};
  // 1. a wrong-known plant must not buy real knowledge
  out.refused = res === 'nothing';
  // 2. the trade narration must never print the true name of a wrong-known plant
  out.noTrueName = !lines.some(l => l.includes(wName));
  // 3. the trader must not learn the plant CORRECTLY from a wrong lesson
  out.noLaunder = !(v.taught[cand] || []).includes(wk.id);
  // 4. honesty: when refused, the line should name the real reason (wrong knowledge)
  out.honestRefusal = lines.some(l => /wrong/i.test(l)) || lines.some(l => /nothing they don't already know/i.test(l));
  return { seed, ...out, detail: `res=${res} trueName="${wName}"` };
}

async function main() {
  let fails = 0, ran = 0, skipped = 0;
  for (const seed of SEEDS) {
    const r = await run(seed);
    if (r.skip) { console.log(`SKIP seed ${r.seed}: ${r.skip}`); skipped++; continue; }
    ran++;
    for (const k of ['refused', 'noTrueName', 'noLaunder', 'honestRefusal']) {
      const ok = !!r[k];
      console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | ${k} | ${r.detail}`);
      if (!ok) fails++;
    }
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} seeds ran, ${skipped} skipped)` : `\nALL CHECKS PASSED (${ran} seeds)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
