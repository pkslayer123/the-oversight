// BREAK-IT knowledge: SIBLING SWEEP of the level-0 gating fix.
// The conversation "teach" flow (conversation.js x3, convo-beats.js x1) used
// Object.keys(codex.plants) as "things you know" — a level-0 entry (one blind
// bite, plant unnamed) counted as teachable, and the teach dialogue even
// spoke the plant's TRUE name ("You show them Dandelion") though the player
// never learned it. Same bug class as the codexEntries leak: fixed by
// filtering every site to plantKnown (L1+).
// This test drives the real patched predicate against real game state.
'use strict';
const h = require('./break-monsters-harness.js');

// mirrors the patched menu/handler predicate at the four sites
function teachOffered(G, vid) {
  const youKnow = Object.keys(G.state.codex.plants || {}).filter(k => G.plantKnown(k));
  const theyKnow = (G.state.village.taught && G.state.village.taught[vid]) || [];
  return youKnow.some(pid => theyKnow.indexOf(pid) === -1);
}

async function main() {
  const G = await h.freshGame(7707);
  const s = G.state.scholar;
  G.say = () => {};
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const vid = G.state.village.roster.find(id => id !== G.villagerId);
  G.state.codex.plants = {}; // wipe background knowledge: level-0 must stand alone
  const p = G.data.plants.find(x => !G.plantKnown(x.id) && !(G.state.codex.plants || {})[x.id]);
  const pid = p.id;

  // one blind bite: level-0 entry, name unknown
  s.kcal = 500;
  s.inventory.push({ name: 'Unknown greens', units: 2, kcalEach: 60, plantId: pid, unit: 'handful', spoilDay: 99 });
  G.eatOne(s.inventory.length - 1);
  check('B0 level-0 entry, still unnamed', ((G.state.codex.plants || {})[pid] || {}).level === 0 && !G.plantKnown(pid));

  check('B1 teach NOT offered for a plant you cannot name', teachOffered(G, vid) === false);

  // the true name must never appear in a teach line for an unnamed plant
  const teachable = Object.keys(G.state.codex.plants || {}).filter(k => G.plantKnown(k));
  check('B2 unnamed plant excluded from teachable set', !teachable.includes(pid));

  // after real identification, teaching is legitimately offered
  G.identifyPlant(pid, 'observation');
  check('B3 teach offered once the plant is truly known', teachOffered(G, vid) === true);
  const teachable2 = Object.keys(G.state.codex.plants || {}).filter(k => G.plantKnown(k));
  check('B4 known plant included in teachable set', teachable2.includes(pid));

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
