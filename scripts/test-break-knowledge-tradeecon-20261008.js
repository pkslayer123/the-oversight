// BREAK-IT knowledge: EXPLOIT — knowledge-for-knowledge trades never collect payment.
// BEFORE: tradeKnowledge()'s price='knowledge' branch narrates "you teach X
// about Y" but never records it. The SAME plant Y buys unlimited trades from
// the same trader (and the level-0 "knowledge" from one blind bite counts as
// currency — see gating test). The economy's price is fiction.
// AFTER: the payment plant is recorded in village.taught[vid] (they genuinely
// learn it), the payment search excludes the trader's full knowledge
// (unfiltered pool + taught), and only truly-known plants can be spent.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(3303);
  const sayLog = [];
  G.say = m => sayLog.push(String(m));
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const v = G.state.village;
  const vid = v.roster.find(id => id !== G.villagerId);
  // make them a knowledge trader
  const vp = G.data.villagers.find(x => x.id === vid);
  vp.formerOccupation = 'librarian';
  check('T0 is knowledge trader', G.isKnowledgeTrader(vid) === true);

  const pool = G.traderKnowledge(vid);
  check('T0b trader has a teach pool', pool.length >= 2, `pool=${pool.length}`);
  const pid = pool[0], pid2 = pool[1];

  // player payment: a plant the trader does NOT know (not in raw pool).
  // wipe background knowledge so the payment plant is the ONLY currency.
  G.state.codex.plants = {};
  const rawPool = G.traderKnowledge(vid, true);
  const payPid = G.data.plants.map(p => p.id).find(id => !rawPool.includes(id));
  G.identifyPlant(payPid, 'observation');
  v.trust[vid] = 10; // price = 'knowledge'
  const w = G.villagerWrongAbout(vid); delete w[pid]; delete w[pid2]; // no counterfeit

  const before = ((G.state.codex.plants || {})[pid] || {}).level || 0;
  G.tradeKnowledge(vid, pid);
  const after = ((G.state.codex.plants || {})[pid] || {}).level || 0;
  check('T1 first trade completes (knowledge gained)', after > before, `L${before} -> L${after}`);

  const taught = (v.taught[vid] || []);
  check('T2 payment collected: trader actually learned the payment plant',
    taught.includes(payPid), `taught=${JSON.stringify(taught).slice(0, 80)}`);

  // EXPLOIT: the same plant as payment for a SECOND trade with the same trader
  sayLog.length = 0;
  const before2 = ((G.state.codex.plants || {})[pid2] || {}).level || 0;
  const r2 = G.tradeKnowledge(vid, pid2);
  const after2 = ((G.state.codex.plants || {})[pid2] || {}).level || 0;
  check('T3 second trade REFUSED (payment plant already theirs)',
    after2 === before2, `L${before2} -> L${after2}`);
  check('T3b honest refusal line',
    sayLog.some(m => /nothing they don't already know/i.test(m)), sayLog.slice(-2).join(' | ').slice(0, 100));

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
