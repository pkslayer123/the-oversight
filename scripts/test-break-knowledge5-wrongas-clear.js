// BREAK-IT knowledge 5th pass — BREAK 22 (HONESTY/SOFTLOCK): wrongAs never
// cleared when the truth arrived via grant paths.
//
// BEFORE: `wrongAs` (the false name a villager taught you) was cleared ONLY
// by the harvest-familiarity L1->L2 path. Every other truth-learning path —
// grantKnowledge (village codex study, books), tradeKnowledge's direct level
// write, combineKnowledge, tasting L2->L3 — raised the level while the false
// label stayed stuck. Worse: learning the truth at L3 meant the harvest path
// (which requires level===1) could never fire, so the flag was stuck FOREVER:
// the codex card kept leading with the false name + "You haven't verified it
// yourself", the plant stayed excluded from trade currency (break-16 filter),
// and conversation/betrayal teach flows kept speaking the lie.
//
// AFTER: resolveWrongName(pid, how) clears the false label on every genuine
// learning level-up, marking the disagreement contested (unresolved) so the
// player still gets the callout beat. The deliberate-liar flag is looked up
// instead of hardcoded false.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261009, 7, 424242];

function setup(G) {
  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  const v = G.state.village;
  const vid = (v.roster || []).find(id => id !== G.villagerId);
  const plants = G.data.plants;
  const pid = plants[0].id, wrongPid = plants[1].id;
  return { lines, v, vid, pid, wrongPid, wrongName: plants[1].name, trueName: plants[0].name };
}

function wrongEntry(G, s, level, extra) {
  G.state.codex.plants = {};
  G.state.codex.plants[s.pid] = Object.assign({
    identifiedDay: 1, level, harvests: 0, tastings: 0, by: 'taught',
    wrongAs: s.wrongName, wrongPid: s.wrongPid, taughtBy: s.vid, taughtByName: 'Villager',
  }, extra || {});
}

// the break-16 trade-currency filter, verbatim
function tradeCurrency(G) {
  const cxp = G.state.codex.plants || {};
  return Object.keys(cxp).filter(k => G.plantKnown(k) && !(cxp[k] || {}).wrongAs);
}

async function run(seed) {
  global.window = global;
  const G = await h.freshGame(seed);
  const s = setup(G);
  const out = {};

  // A. grantKnowledge (village codex study / book path): L1 wrong -> L3 truth
  wrongEntry(G, s, 1);
  s.lines.length = 0;
  const granted = G.grantKnowledge('plant', s.pid, 3, { type: 'taught', by: 'Riverton' });
  const eA = G.state.codex.plants[s.pid];
  out.grantOk = granted === true && eA.level === 3;
  out.grantClearsWrongAs = !eA.wrongAs && !eA.wrongPid;
  out.grantMarksContested = !!(eA.contested && !eA.contested.resolved && eA.contested.by === s.vid);
  out.grantNarratesCorrection = s.lines.some(l => /never .* — it's|record corrects/i.test(l));
  out.grantSpendable = tradeCurrency(G).includes(s.pid);

  // B. combineKnowledge path: L1 wrong + village knows deeper + harvests
  wrongEntry(G, s, 1, { harvests: 3 });
  s.v.sharedKnowledge = { [s.pid]: { level: 3 } };
  const combined = G.combineKnowledge(s.pid);
  const eB = G.state.codex.plants[s.pid];
  out.combineOk = combined === true && eB.level === 3;
  out.combineClearsWrongAs = !eB.wrongAs;

  // C. tasting path (eatOne): L2 wrong, 2 tastings -> 3rd bite clicks
  wrongEntry(G, s, 2, { tastings: 2 });
  G.state.scholar.kcal = 0;
  G.state.scholar.inventory = [{ name: 'snack', plantId: s.pid, kcalEach: 100, units: 1, spoilDay: 9999 }];
  try { G.eatOne(0); } catch (e) { out.eatOneThrew = String(e.message); }
  const eC = G.state.codex.plants[s.pid];
  out.tasteOk = eC.level === 3;
  out.tasteClearsWrongAs = !eC.wrongAs;

  // D. bulk eat() path: same shape through the retired-bulk port
  wrongEntry(G, s, 2, { tastings: 2 });
  G.state.scholar.kcal = 0;
  G.state.scholar.inventory = [{ name: 'snack', plantId: s.pid, kcalEach: 100, units: 1, spoilDay: 9999 }];
  try { G.eat(); } catch (e) { out.eatThrew = String(e.message); }
  const eD = G.state.codex.plants[s.pid];
  out.bulkOk = eD.level === 3;
  out.bulkClearsWrongAs = !eD.wrongAs;

  // E. deliberate liars are marked deliberate (was hardcoded false)
  wrongEntry(G, s, 1);
  s.v.wrongAbout = { [s.vid]: { [s.pid]: { wrongPid: s.wrongPid, deliberate: true } } };
  G.grantKnowledge('plant', s.pid, 2, { type: 'read', by: 'Field Guide' });
  const eE = G.state.codex.plants[s.pid];
  out.deliberateMarked = !!(eE.contested && eE.contested.deliberate === true);

  // F. control: no wrongAs -> no contested marker, no crash
  G.state.codex.plants = {};
  G.state.codex.plants[s.pid] = { identifiedDay: 1, level: 1, harvests: 0, tastings: 0, by: 'observation' };
  G.grantKnowledge('plant', s.pid, 2, { type: 'read', by: 'Field Guide' });
  const eF = G.state.codex.plants[s.pid];
  out.controlClean = eF.level === 2 && !eF.contested && !eF.wrongAs;

  return { seed, ...out };
}

async function main() {
  const keys = ['grantOk', 'grantClearsWrongAs', 'grantMarksContested', 'grantNarratesCorrection',
    'grantSpendable', 'combineOk', 'combineClearsWrongAs', 'tasteOk', 'tasteClearsWrongAs',
    'bulkOk', 'bulkClearsWrongAs', 'deliberateMarked', 'controlClean'];
  let fails = 0, ran = 0;
  for (const seed of SEEDS) {
    let r;
    try { r = await run(seed); } catch (e) { console.log(`FATAL seed ${seed}: ${e.message}`); fails++; continue; }
    ran++;
    for (const k of keys) {
      const ok = !!r[k];
      console.log(`${ok ? 'PASS' : 'FAIL'} | seed ${r.seed} | ${k}`);
      if (!ok) fails++;
    }
    if (r.eatOneThrew) { console.log(`FAIL | seed ${r.seed} | eatOneThrew: ${r.eatOneThrew}`); fails++; }
    if (r.eatThrew) { console.log(`FAIL | seed ${r.seed} | eatThrew: ${r.eatThrew}`); fails++; }
  }
  console.log(fails ? `\n${fails} CHECK(S) FAILED (${ran} seeds ran)` : `\nALL CHECKS PASSED (${ran} seeds)`);
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
