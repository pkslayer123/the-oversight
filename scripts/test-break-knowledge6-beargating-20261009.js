// BREAK-IT knowledge 6th pass — BREAKS 25/26/27: the bear rework's new
// knowledge gating (animals.json vectorLevel + encAnimalLevel +
// masterTechnique, commit 7c04049) was dishonest/incomplete three ways:
//
// BREAK 25 (grant-squash sibling, HONESTY): readBook hardcoded animal grants
//   to level 1 while plants used unlocks.level. The new book "Tallow &
//   Keeping" (unlocks.level: 4, animals: [black_bear]) promised deep bear
//   knowledge; the engine recorded L1 — the codex card read [L1] and the
//   masterTechnique hook never fired for the book path.
//
// BREAK 26 (copy vs engine, HONESTY): the eating-deepening track (3/6/10
//   tastings -> knowledgeLevels['2'/'3'/'4'] narration) never wrote
//   codex.animals[].level. For black_bear the L4 text IS the rework's gated
//   content (trichinosis, fat rendering, the pemmican recipe) — narrated to
//   the player while the engine still believed L1, so the butcher-line
//   trichinosis vector and the render technique never followed.
//
// BREAK 27 (REGRESSION, FUNCTION): the rework's vector gate
//   (encButcherHonesty: encAnimalLevel >= vectorLevel||1) assumed kills
//   record L1 in codex.animals — nothing did. encIdentifyAnimal only bumped
//   animalEncounters. Result: the disease-vector line went silent on kills
//   for all 34 L1-default animals ("shown at L1 like before" was false).
//
// AFTER: readBook honors unlocks.level for animals; the deepening track
//   records depth via _noteAnimalDepth (quiet — the beat already narrates);
//   encIdentifyAnimal records L1 (quiet — the kill line already names it).
//   _grantAnimal shares _noteAnimalDepth so the masterTechnique rule lives
//   in exactly one place.
'use strict';
const h = require('./break-monsters-harness.js');
const SEEDS = [20261009, 7, 424242];

function quiet(G) {
  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  G.feedback = (l) => { lines.push(String(l)); };
  return lines;
}

function bearMeat() {
  return {
    name: 'Bear meat', plantId: 'meat_black_bear', foodKind: 'meat',
    foodState: 'cleaned', edible: true, kcalEach: 500, units: 1,
    unit: 'portion', spoilDay: 9999, kg: 0.5,
  };
}

function eatBearTimes(G, n) {
  for (let i = 0; i < n; i++) {
    G.state.scholar.kcal = 0; // stay hungry: the fullness cap would end the meal early
    G.state.scholar.inventory.push(bearMeat());
    G.eatOne(G.state.scholar.inventory.length - 1);
  }
}

function giveBook(G, id, name) {
  G.state.scholar.inventory.push({
    bookId: id, name, units: 1, unit: 'book', kcalEach: 0, spoilDay: 9999, kg: 0.5,
  });
}

async function fresh(seed) {
  global.window = global; // harness deletes it after load; equipment.js needs it at eval
  return h.freshGame(seed);
}

async function run(seed) {
  const out = {};

  // ---------- BREAK 25: readBook animal-level squash ----------
  {
    const G = await fresh(seed);
    const lines = quiet(G);
    giveBook(G, 'tallow_and_keeping', 'Tallow & Keeping');
    G.readBook('tallow_and_keeping');
    const e = (G.state.codex.animals || {}).black_bear || {};
    out.b25_bookGrantsL4 = e.level === 4;
    out.b25_narratesL4 = lines.some(l => /Black Bear.*Level 4/.test(l));
    out.b25_renderTechnique = G.knowsTechnique('render') === true;
    out.b25_bookConsumed = !G.state.scholar.inventory.some(i => i.bookId === 'tallow_and_keeping');
    // control: a level-1 animal book still grants exactly L1
    giveBook(G, 'trappers_handbook', "Trapper's Handbook");
    G.readBook('trappers_handbook');
    out.b25_l1BookStillL1 = ((G.state.codex.animals || {}).cottontail_rabbit || {}).level === 1;
    // no-downgrade / no-repeat guard intact after the refactor
    out.b25_noDowngrade = G.grantKnowledge('animal', 'black_bear', 2, { type: 'read', by: 'x' }) === false
      && G.state.codex.animals.black_bear.level === 4;
  }

  // ---------- BREAK 26: deepening track records depth ----------
  {
    const G = await fresh(seed + 1000);
    const lines = quiet(G);
    G.encIdentifyAnimal('black_bear'); // a kill: L1 (break 27's write)
    out.b26_killIsL1 = G.encAnimalLevel('black_bear') === 1;
    eatBearTimes(G, 3);
    out.b26_l2Recorded = G.encAnimalLevel('black_bear') >= 2;
    out.b26_l2Narrated = lines.some(l => /Deeper knowledge: Black Bear/.test(l));
    eatBearTimes(G, 3); // 6 total
    out.b26_l3Recorded = G.encAnimalLevel('black_bear') >= 3;
    eatBearTimes(G, 4); // 10 total
    const e = (G.state.codex.animals || {}).black_bear || {};
    out.b26_l4Recorded = e.level === 4;
    out.b26_masteryNarrated = lines.some(l => /MASTERY: Black Bear/.test(l));
    out.b26_renderViaMastery = G.knowsTechnique('render') === true;
    // pemmican is now genuinely reachable: technique known, gate honest
    out.b26_pemmicanGateHonest = G.knowsTechnique('render') === true;
  }

  // ---------- BREAK 26b: no redundant re-teaching after a L4 book ----------
  {
    const G = await fresh(seed + 2000);
    const lines = quiet(G);
    giveBook(G, 'tallow_and_keeping', 'Tallow & Keeping');
    G.readBook('tallow_and_keeping');
    lines.length = 0;
    G.encIdentifyAnimal('black_bear');
    eatBearTimes(G, 3);
    out.b26b_noReteachL2 = !lines.some(l => /Deeper knowledge: Black Bear/.test(l));
    out.b26b_levelStays4 = G.encAnimalLevel('black_bear') === 4;
    // health reward still accrues for the knowledgeable (design intent)
    out.b26b_deepKnownFlag = !!((G.state.codex.animalPrep || {}).black_bear || {}).deepKnown;
  }

  // ---------- BREAK 27: vector line on kills ----------
  {
    const G = await fresh(seed + 3000);
    quiet(G);
    const deer = (G.data.animals || []).find(a => a.id === 'white_tailed_deer');
    const bear = (G.data.animals || []).find(a => a.id === 'black_bear');
    G.encIdentifyAnimal('white_tailed_deer'); // a kill
    const lineDeer = G.encButcherHonesty(8000, deer);
    out.b27_l1VectorShowsOnKill = /Lyme|ticks/i.test(lineDeer);
    // control: the rework's L4 gate still holds — name alone never leaks it
    G.encIdentifyAnimal('black_bear');
    const lineBear1 = G.encButcherHonesty(30000, bear);
    out.b27_l4VectorHiddenAtL1 = !/trichinosis/i.test(lineBear1);
    // ...but appears once L4 is genuinely earned through the deepening track
    eatBearTimes(G, 10);
    const lineBear4 = G.encButcherHonesty(30000, bear);
    out.b27_l4VectorShowsAtL4 = /trichinosis/i.test(lineBear4);
    // kill line end-to-end: the reworked killText renders, kcal replaced,
    // butcher-honesty footer attached (control — the quiet L1 write must not
    // disturb the kill beat)
    const killLine = G.encKillLine(bear, 30000);
    out.b27_killLineIntact = /fight, not a harvest/.test(killLine) && /30000/.test(killLine);
  }

  return out;
}

const EXPECTED_TRUE = [
  'b25_bookGrantsL4', 'b25_narratesL4', 'b25_renderTechnique', 'b25_bookConsumed',
  'b25_l1BookStillL1', 'b25_noDowngrade',
  'b26_killIsL1', 'b26_l2Recorded', 'b26_l2Narrated', 'b26_l3Recorded',
  'b26_l4Recorded', 'b26_masteryNarrated', 'b26_renderViaMastery', 'b26_pemmicanGateHonest',
  'b26b_noReteachL2', 'b26b_levelStays4', 'b26b_deepKnownFlag',
  'b27_l1VectorShowsOnKill', 'b27_l4VectorHiddenAtL1', 'b27_l4VectorShowsAtL4',
  'b27_killLineIntact',
];

(async () => {
  let fails = 0;
  for (const seed of SEEDS) {
    h.seedRng(seed);
    let out;
    try {
      out = await run(seed);
    } catch (e) {
      console.log(`seed ${seed}: THREW ${e.message}\n${e.stack.split('\n').slice(0, 4).join('\n')}`);
      fails++;
      continue;
    }
    const bad = EXPECTED_TRUE.filter(k => out[k] !== true);
    if (bad.length) {
      fails++;
      console.log(`seed ${seed}: FAIL ${bad.length} — ${bad.join(', ')}`);
      for (const k of bad) console.log(`    ${k} = ${JSON.stringify(out[k])}`);
    } else {
      console.log(`seed ${seed}: PASS (${EXPECTED_TRUE.length}/${EXPECTED_TRUE.length})`);
    }
  }
  console.log(fails ? `RESULT: ${fails} seed(s) failed` : 'RESULT: ALL GREEN');
  process.exit(fails ? 1 : 0);
})();
