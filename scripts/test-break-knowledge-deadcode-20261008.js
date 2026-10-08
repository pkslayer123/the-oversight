// BREAK-IT knowledge: DEAD CODE — the journal's read path was never wired.
// BEFORE (Alien-Players class): journal.js builds a whole read layer —
// plantJournalEntry (per-life entries + dead lives' marginalia + marks +
// gaps), codexPlantLine, knowledgeGaps, forageCue, journalOpening,
// lifeMarks, marginaliaFor, homeFamiliarityLine — and app.js calls NONE of
// them; the Codex screen renders from game.js codexEntries() only. The
// journal is write-only: entries/marginalia/marks accumulate forever, no
// surface reads them. occupationKnown() has zero callers (its logic is
// duplicated in occupationLabel). combineKnowledge() credits traders phantom
// L2 for plants not in their pool, contradicting its own comment ("traders
// know everything they teach at L3").
// AFTER: codexEntries() carries the journal payload (journal.js wrap),
// occupationLabel delegates to occupationKnown, traders credit L3 only for
// plants in their pool.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(5505);
  G.say = () => {};
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const pid = G.data.plants[2].id;
  G.identifyPlant(pid, 'observation');
  G.writePlantEntry(pid, 'sighting', 'test sighting note');
  G.recordLifeMark('hunger', 'test hunger mark');
  G.recordPlantMark(pid, 'poisoned', 'test poison mark');

  const e = (G.codexEntries() || []).find(x => x && x.pid === pid);
  check('D0 codex entry exists', !!e);
  check('D1 journal progress line wired', !!(e && e.journalLine && e.journalLine.includes('L1')),
    `journalLine=${e && e.journalLine}`);
  check('D2 journal entries surface (this life)', !!(e && e.journalEntries && e.journalEntries.length >= 1),
    `entries=${e && e.journalEntries && e.journalEntries.length}`);
  check('D3 plant marks surface', !!(e && e.journalMarks && e.journalMarks.length === 1),
    `marks=${e && e.journalMarks && e.journalMarks.length}`);
  check('D4 knowledge gaps surface (honest unknowns)', !!(e && Array.isArray(e.knowledgeGaps) && e.knowledgeGaps.length > 0),
    `gaps=${e && e.knowledgeGaps && e.knowledgeGaps.length}`);
  check('D4b life marks recorded', (G.lifeMarks() || []).length >= 1);

  // occupationKnown is actually used by occupationLabel
  const vid = G.state.village.roster.find(id => id !== G.villagerId);
  let called = false;
  const orig = G.occupationKnown;
  G.occupationKnown = function (...a) { called = true; return orig.apply(this, a); };
  const label = G.occupationLabel(vid);
  G.occupationKnown = orig;
  check('D5 occupationLabel delegates to occupationKnown', called === true);
  check('D5b unknown occupation stays hidden', label === null, `label=${label}`);

  // combineKnowledge: trader credit is pool-gated at L3
  const v = G.state.village;
  const cpid = G.data.plants[8].id;
  G.state.codex.plants[cpid] = { identifiedDay: 1, level: 1, harvests: 3, tastings: 0 };
  const tvid = v.roster.find(id => id !== G.villagerId);
  G.data.villagers.find(x => x.id === tvid).formerOccupation = 'botanist';
  // force pid into their pool for the positive case
  const realTK = G.traderKnowledge;
  G.traderKnowledge = function (id, unf) {
    const r = realTK.call(this, id, unf);
    if (id === tvid && !r.includes(cpid)) r.push(cpid);
    return r;
  };
  G.say = () => {};
  G.combineKnowledge(cpid);
  const lvl = (G.state.codex.plants[cpid] || {}).level;
  check('D6 trader in pool combines to L3 (not phantom L2)', lvl === 3, `level=${lvl}`);

  // phantom credit: trader whose pool does NOT include the plant
  const cpid2 = G.data.plants[9].id;
  G.state.codex.plants[cpid2] = { identifiedDay: 1, level: 1, harvests: 3, tastings: 0 };
  G.traderKnowledge = function (id) { return id === tvid ? [] : realTK.call(this, id); };
  G.combineKnowledge(cpid2);
  const lvl2 = (G.state.codex.plants[cpid2] || {}).level;
  G.traderKnowledge = realTK;
  check('D7 no phantom credit for plants outside the pool', lvl2 === 1, `level=${lvl2}`);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
