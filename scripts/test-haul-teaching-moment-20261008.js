#!/usr/bin/env node
// PROOF TEST (2026-10-08), FORAGER archetype — "The Camp Kitchen" fixes.
// Three regressions from one played run:
//  A. returnToVillage must teach FROM THE HAUL (Steve 2026-10-05): the old
//     inline block taught a random known plant; now it calls
//     journal.haulTeachingMoment with the staged items.
//  B. haulTeachingMoment must read species out of LUMP compositions: the
//     day-1 blind haul arrives as unlabeled lumps (plantId null); without
//     this the key teaching moment is silent exactly when most needed.
//  C. recognitionBeat grammar: "The a tree…" (same bug class as the
//     2026-10-07 "This a tree" fix).
//  D. MUST_COOK_RE covers "never eat raw" (groundnut): the codex says never
//     eat raw, so the game must gate it — needsCooking + diseaseRisk.
// Seeded RNG (mulberry32, SEED env). Run:
//   SEED=20261008 node scripts/test-haul-teaching-moment-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = process.env.HARNESS_ROOT || path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
  'src/js/build.js',
];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;

const says = [];
const results = [];
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
const plant = (id) => (Game.data.plants || []).find(p => p.id === id);

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);

  // ---------- A. wiring: returnToVillage calls haulTeachingMoment ----------
  const rtvSrc = Game.returnToVillage.toString();
  check('A1 returnToVillage calls haulTeachingMoment', rtvSrc.includes('haulTeachingMoment'),
    rtvSrc.includes('haulTeachingMoment') ? '' : 'wiring missing — random-teach regression');

  // ---------- B. lump compositions teach ----------
  // A trusted villager who knows hickory_nut (the blind-haul species).
  const v = Game.state.village;
  const rid = (v.roster || []).find(id => id !== Game.villagerId);
  v.trust = v.trust || {}; v.trust[rid] = 100;
  v.taught = v.taught || {}; v.taught[rid] = ['hickory_nut', 'blackberry'];
  const lump = {
    name: 'unknown nuts', foodKind: 'plant', foodState: 'unknown', edible: false,
    units: 5, unit: 'handful', kg: 0.1, spoilDay: 31,
    lump: { hickory_nut: { units: 5, day: 1 } },
  };
  says.length = 0;
  const res = Game.haulTeachingMoment([lump], { maxLessons: 2 });
  const msg = says.join(' || '); says.length = 0;
  check('B1 haul moment fires from a lump (not silent)', /lay out the haul/i.test(msg), msg.slice(0, 100));
  check('B2 lesson names the hauled species', (res.lessons || []).some(l => l.pid === 'hickory_nut'),
    JSON.stringify((res.lessons || []).map(l => l.pid)));
  // poor teacher (interpreter): partial reveal — encounters tick, the designed
  // "poor teaching gives only a partial reveal" path, not a silent loss.
  const l0 = (res.lessons || [])[0] || {};
  check('B3 poor teacher: thin outcome, encounters ticked',
    l0.outcome === 'thin' && ((Game.state.codex.encounters || {})['hickory_nut'] || 0) >= 1,
    JSON.stringify({ outcome: l0.outcome, enc: (Game.state.codex.encounters || {})['hickory_nut'] }));
  // good teacher (cook, trusted, comm full): instant unlock — "shown properly
  // can unlock instantly", all parts known, triumph beat fires.
  Game.getPerson(rid).formerOccupation = 'cook';
  says.length = 0;
  const res2 = Game.haulTeachingMoment([lump], { maxLessons: 2 });
  const msg3 = says.join(' || '); says.length = 0;
  const l1 = (res2.lessons || [])[0] || {};
  check('B3b good teacher: shown-deep, instant identification',
    l1.outcome === 'shown-deep' && ((Game.state.codex.plants || {})['hickory_nut'] || {}).level >= 1,
    JSON.stringify({ outcome: l1.outcome, level: ((Game.state.codex.plants || {})['hickory_nut'] || {}).level }));
  const lifeMarks = Game.lifeMarks ? Game.lifeMarks() : [];
  const jEntries = Game.journalPlantEntries ? Game.journalPlantEntries('hickory_nut') : [];
  check('B3c triumph beat recorded (life mark + journal entry)',
    lifeMarks.some(m => m.kind === 'triumph') && jEntries.some(e => e.kind === 'triumph'),
    `lifeMarks=[${lifeMarks.map(m => m.kind)}] journal=[${jEntries.map(e => e.kind)}]`);
  check('B4 capped at 2 lessons', (res2.lessons || []).length <= 2, `${(res2.lessons || []).length}`);
  // nobody knows it: honest, not silent
  v.taught[rid] = [];
  const lump2 = { name: 'unknown shoots', foodKind: 'plant', foodState: 'unknown', units: 8, lump: { groundnut: { units: 8, day: 1 } } };
  says.length = 0;
  Game.haulTeachingMoment([lump2], { maxLessons: 2 });
  const msg2 = says.join(' || '); says.length = 0;
  check('B5 no teacher: honest not silent', /your own hands/i.test(msg2), msg2.slice(0, 100));

  // ---------- C. recognitionBeat grammar ----------
  Game.state.codex.observations = Game.state.codex.observations || {};
  Game.state.codex.observations['hickory_nut'] = { count: 3, firstDay: 1, lastDay: 1, quality: 2, via: ['examine'] };
  let bad = 0, seen = 0;
  for (let i = 0; i < 12; i++) {
    says.length = 0;
    Ex.recognitionBeat('hickory_nut', 'Mara');
    const m = says.join(' || '); says.length = 0;
    if (!m) continue;
    seen++;
    if (/The (a|an|the) /i.test(m)) { bad++; console.log(`      BAD LINE: ${m.slice(0, 120)}`); }
  }
  check('C1 no "The a/an/the" in recognition lines', bad === 0 && seen > 0, `${bad} bad of ${seen} seen`);

  // ---------- D. must-cook gating ----------
  const gn = plant('groundnut');
  const gnItem = Game.foodForageItem(gn, true, 2, gn.caloriesPerUnit, 1);
  check('D1 groundnut ("never eat raw") needsCooking', !!gnItem.needsCooking, JSON.stringify({ needsCooking: gnItem.needsCooking }));
  check('D2 groundnut carries diseaseRisk raw', !!gnItem.diseaseRisk, JSON.stringify(gnItem.diseaseRisk || null));
  check('D3 groundnut prep warns', /Risky raw/i.test(gnItem.prep || ''), (gnItem.prep || '').slice(0, 80));
  const eb = plant('elderberry');
  check('D4 elderberry still gated (regression)', !!Game.foodForageItem(eb, true, 2, eb.caloriesPerUnit, 1).needsCooking);
  const ac = plant('acorn_white_oak');
  check('D5 acorn (nut) NOT needsCooking — nut rule stands', !Game.foodForageItem(ac, true, 2, ac.caloriesPerUnit, 1).needsCooking);
  // splitLumpOut path: identified groundnut out of a lump is gated too
  const cont = [];
  const lump3 = { name: 'unknown shoots', foodKind: 'plant', foodState: 'unknown', units: 4, kg: 0.1, spoilDay: 3, lump: { groundnut: { units: 4, day: 1 } } };
  cont.push(lump3);
  const split = Game.splitLumpOut(lump3, 'groundnut', cont);
  check('D6 splitLumpOut groundnut gated', !!split && !!split.needsCooking && !!split.diseaseRisk);

  const fails = results.filter(r => !r[1]);
  console.log(`\n== RESULT: ${results.length - fails.length}/${results.length} checks green (seed ${SEED}) ==`);
  if (fails.length) { console.log('FAILURES:'); for (const [n, , d] of fails) console.log(`   - ${n}${d ? ' — ' + d : ''}`); }
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(2); });
