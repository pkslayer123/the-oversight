// BREAK-IT knowledge (3rd pass): EXPLOIT — tradeKnowledge repeat farm.
// The trader teaches pid to L3. Pre-fix, nothing stopped trading for the SAME
// plant again: the price was charged again, the "TRADED KNOWLEDGE" line
// re-printed, and bumpTrust(+3) fired per repeat — 300 kcal -> +3 trust,
// infinitely repeatable with zero knowledge exchanged.
// Post-fix: a trader with nothing to teach refuses honestly — no charge,
// no phantom lesson, no trust farm.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [6606, 7, 424242, 987654321, 20261008];

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  const v = G.state.village;
  // force a trader: isKnowledgeTrader reads occupation templates, which are
  // sparse in fresh rosters — pin one villager as a trader for the test.
  const cand = (v.roster || []).find(id => id !== G.villagerId);
  if (!cand) return { seed, skip: 'no villagers' };
  const origIsTrader = G.isKnowledgeTrader;
  G.isKnowledgeTrader = (id) => id === cand ? true : (origIsTrader ? origIsTrader.call(G, id) : false);
  const trader = cand;
  v.trust[trader] = 40; // food-price path
  G.state.scholar.kcal = 100000;
  const pool = G.traderKnowledge(trader, true);
  if (!pool.length) return { seed, skip: 'empty trader pool' };
  const pid = pool[0];
  const p = (G.data.plants || []).find(x => x.id === pid);

  G.tradeKnowledge(trader, pid); // -> L2
  G.tradeKnowledge(trader, pid); // -> L3
  const lvl = ((G.state.codex.plants || {})[pid] || {}).level || 0;
  const tBefore = v.trust[trader], kBefore = G.state.scholar.kcal;
  lines.length = 0;
  G.tradeKnowledge(trader, pid); // already L3: must refuse honestly
  const tAfter = v.trust[trader], kAfter = G.state.scholar.kcal;
  const honestLine = lines.some(l => l.includes('nothing to trade'));
  const phantomLesson = lines.some(l => l.includes('TRADED KNOWLEDGE'));
  return {
    seed, pid, pname: p && p.name, level: lvl,
    refused: honestLine && !phantomLesson,
    noCharge: kAfter === kBefore,
    noTrustFarm: tAfter === tBefore,
    detail: `trust ${tBefore}->${tAfter}, kcal ${kBefore}->${kAfter}`,
  };
}

async function main() {
  let fails = 0, ran = 0;
  for (const s of SEEDS) {
    const r = await run(s);
    console.log(JSON.stringify(r));
    if (r.skip) continue;
    ran++;
    if (!(r.refused && r.noCharge && r.noTrustFarm)) fails++;
  }
  console.log(ran === 0 ? 'NO TRADER SEED RAN (inconclusive)' :
    fails ? `\n${fails}/${ran} FAILED` : `\nALL ${ran} RAN GREEN`);
  process.exit(fails || ran === 0 ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
