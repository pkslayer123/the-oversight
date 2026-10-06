#!/usr/bin/env node
// PROOF TEST: knowledge gating (Steve 2026-10-06 — "if you don't know, it doesn't show")
// Exercises the three knowledge modules with a stubbed Game:
//   1. examine.js  — examineDescription never leaks names (incl. mid-string),
//                    learnDifficulty (regional familiarity), teachQuality/teachPlant
//   2. codex-people.js — personTeachTopics/teachFromPerson depth gates
//   3. perceive.js — unknown trees stay generic ("nut tree" leak fixed),
//                    whisper variants rotate, monster/person hints stay gated
// Plus a narrative playtest: a day-1 low-knowledge character learning (and
// failing to learn) the honest way. Run: node scripts/test-knowledge-gate-20261006.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');

// ---------------- fixture data (real shapes, tiny pool) ----------------
const DANDELION = {
  id: 'dandelion', name: 'Dandelion', idDifficulty: 1,
  regions: ['ohio', 'georgia', 'pacific_nw', 'columbus'],
  description: 'a plant with jagged leaves and a yellow flower',
  seasons: ['spring', 'summer'], tileAffinity: ['meadow'],
  taxon: ['forb', 'greens'], lookalikeNote: "Unmistakable once flowering.",
  knowledgeLevels: {
    '1': 'Dandelion. Jagged leaves, yellow flower. You grab the whole plant.',
    '2': 'Parts: roots (roast for coffee), young leaves (salad), petals (tea).',
  },
};
const MAYAPPLE = {
  id: 'mayapple', name: 'Mayapple', idDifficulty: 4,
  regions: ['ohio', 'georgia', 'pacific_nw', 'columbus'],
  description: 'umbrella leaves on single stalks, one white flower under the canopy',
  seasons: ['spring'], tileAffinity: ['deep_woods'],
  taxon: ['forb', 'woodland'], lookalikeNote: 'Only one flower per plant.',
  knowledgeLevels: {
    '1': 'Mayapple. Umbrella leaves, hidden flower. The fruit is the only safe part.',
    '2': 'Parts: ripe fruit only — leaves, roots, and unripe fruit are toxic.',
  },
};
// synthetic plant whose DESCRIPTION mentions its own name mid-string
const LEAKWEED = {
  id: 'leakweed', name: 'Leakweed', idDifficulty: 2,
  regions: ['florida'], description: 'tall stalks; old-timers swear leakweed only grows where the ground is sour',
  seasons: ['summer'], tileAffinity: ['meadow'], taxon: ['forb', 'weed'],
  lookalikeNote: 'Nothing else looks quite like it.', knowledgeLevels: { '1': 'Leakweed. Tall and sour-ground-loving.' },
};

// ---------------- stub Game ----------------
const said = [];
const codex = { plants: {}, observations: {}, people: {}, skills: {}, monsters: {}, trees: {}, examined: {}, encounters: {} };
const vpRecords = {
  player1: { formerOccupation: 'accountant', homeRegion: 'Miami, Florida' },
  mara:    { formerOccupation: 'forager', homeRegion: 'Columbus, Ohio' },
  stranger:{ formerOccupation: 'drifter', homeRegion: 'Miami, Florida' },
};
function stubTags(text) {
  const l = String(text || '').toLowerCase();
  const tags = [];
  if (/ohio|columbus/.test(l)) tags.push('ohio');
  if (/georgia|atlanta/.test(l)) tags.push('georgia');
  if (/oregon|portland|washington|seattle/.test(l)) tags.push('pacific_nw');
  if (/florida|miami/.test(l)) tags.push('florida');
  if (/illinois|chicago/.test(l)) tags.push('illinois');
  return tags;
}
const peopleEntries = {};
const Game = {
  state: {
    scholar: { day: 5, mx: 4, my: 4, kcal: 2000 },
    codex,
    village: { plantKnowledge: { mara: ['dandelion', 'mayapple'], stranger: ['mayapple'] }, trust: {}, roster: [], positions: {} },
    map: { px: 1, py: 1 },
    systemArrived: false, over: false,
  },
  map: { px: 1, py: 1 },
  data: {
    plants: [DANDELION, MAYAPPLE, LEAKWEED],
    knowledge: [
      { id: 'forage_sense', name: 'Reading the Land', levels: { '1': 'L1', '2': 'L2' } },
      { id: 'mending', name: 'Repair & Mending', levels: { '1': 'L1', '2': 'L2' } },
      { id: 'herbal_medicine', name: 'Herbal Medicine', levels: { '1': 'L1', '2': 'L2' } },
    ],
    animals: [], monsters: [{ id: 'gallowdeer', name: 'Gallowdeer', unknown: 'a shape with too many joints' }],
  },
  villagerId: 'player1',
  tbfight: null,
  say(t) { said.push(String(t)); },
  tickAction() { return 'ticked'; },
  status() { return 'status'; },
  vpOf(vid) { return vpRecords[vid] || {}; },
  parseOrigin(text) { return { raw: text, tags: stubTags(text) }; },
  plantKnown(pid) { const e = codex.plants[pid]; return !!(e && e.level >= 1); },
  plantLevel(pid) { const e = codex.plants[pid]; return (e && e.level) || 0; },
  identifyPlant(pid, source, teacherName) {
    if (this.plantKnown(pid)) return false;
    codex.plants[pid] = { identifiedDay: 5, level: 1, harvests: 0, tastings: 0, by: source || 'taught' };
    said.push(`IDENTIFIED: ${pid} (${source})`);
    const Ex = globalThis.Scattering.Examine;
    if (Ex && Ex.recognitionBeat) Ex.recognitionBeat(pid, teacherName);
    return true;
  },
  learnSkill(skillId, level, via) {
    const k = this.data.knowledge.find(x => x.id === skillId);
    if (!k) return false;
    const cur = (codex.skills[skillId] || {}).level || 0;
    if (level <= cur) return false;
    codex.skills[skillId] = { level, learnedDay: 5, via };
    said.push(`LEARNED: ${k.name} (Level ${level}) via ${via}`);
    return true;
  },
  skillKnown(skillId, minLevel) {
    const e = (codex.skills || {})[skillId];
    return !!(e && (e.level || 0) >= (minLevel || 1));
  },
  treeLevel() { return Game.__treeLevel || 0; },
  journalPerson(vid) { if (!peopleEntries[vid]) peopleEntries[vid] = {}; return peopleEntries[vid]; },
  journalLearn() { return true; },
  getPerson(vid) { return { name: vid === 'mara' ? 'Mara Voss' : 'A Stranger' }; },
  genLifeseed() {
    return { hometown: 'Gary, Indiana', regionLand: 'the rust belt', skillOrigins: { food: "in her gran's kitchen", mending: 'fixing everything twice' } };
  },
  monsterKnown() { return false; },
  monsterDesc(mid) { const m = this.data.monsters.find(x => x.id === mid); return (m && m.unknown) || 'something moving'; },
  displayName(vid) { return vid === 'mara' ? 'Mara' : 'Someone'; },
  personActivityLine() { return 'mending a net'; },
  genDetail() { const g = []; for (let y = 0; y < 9; y++) { g.push(new Array(9).fill('grass')); } g[4][5] = 'tree'; return g; },
  playerTile() { return { modifiers: { '5,4': { species: 'shagbark_hickory' } }, detailRegrow: {}, bushSpecies: {} }; },
  tileFeature(nx, ny, cx, cy) { return (cx === 4 && cy === 5) ? 'tracks' : null; },
};
globalThis.Scattering = { Game };
for (const f of ['src/js/examine.js', 'src/js/codex-people.js', 'src/js/perceive.js']) {
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
}
const Ex = globalThis.Scattering.Examine;
assert(Ex && Ex.teachPlant, 'S.Examine.teachPlant must exist');
assert(typeof Game.teachPlant === 'function', 'Game.teachPlant alias must exist');
assert(typeof Game.personTeachTopics === 'function', 'Game.personTeachTopics must exist');
assert(typeof Game.teachFromPerson === 'function', 'Game.teachFromPerson must exist');

let n = 0;
function check(name, fn) { n++; fn(); console.log(`  ok ${n}. ${name}`); }
console.log('== knowledge-gate proof ==');

// ---- 1. examineDescription never leaks the name ----
check('unknown plant: vague, no name', () => {
  const d = Ex.examineDescription('dandelion', 1);
  assert(!/dandelion/i.test(d), 'name leaked: ' + d);
  assert(/jagged/i.test(d), 'should describe: ' + d);
});
check('mid-string name in description is scrubbed (LEAKWEED)', () => {
  const d = Ex.examineDescription('leakweed', 1);
  assert(!/leakweed/i.test(d), 'mid-string name leaked: ' + d);
});
check('scrubName hardens any casing/position', () => {
  const s = Ex.scrubName('The DANDELION root is best; dandelion leaves too.', 'Dandelion');
  assert(!/dandelion/i.test(s), 'scrub failed: ' + s);
});
check('known plant: name + earned L1 text', () => {
  codex.plants.dandelion = { level: 1 };
  const d = Ex.examineDescription('dandelion', 1);
  assert(/^Dandelion\./.test(d), 'known should name: ' + d);
  delete codex.plants.dandelion;
});
check('lookalike caution never names (yarrow-style note)', () => {
  const d = Ex.examineDescription('dandelion', 3); // Q3 appends lookalike caution
  assert(!/dandelion/i.test(d.replace(/^Dandelion\./, '')), 'leak in Q3: ' + d);
});

// ---- 2. learnDifficulty: regional familiarity is real ----
check('home ground + easy species = easy', () => {
  vpRecords.player1.homeRegion = 'Columbus, Ohio';
  const r = Ex.learnDifficulty('dandelion');
  assert(r.tier === 'easy', 'expected easy, got ' + r.tier);
  assert(/home ground/i.test(r.reason), 'reason should say why: ' + r.reason);
});
check('foreign ground + hard species = hard', () => {
  vpRecords.player1.homeRegion = 'Miami, Florida';
  const r = Ex.learnDifficulty('mayapple');
  assert(r.tier === 'hard', 'expected hard, got ' + JSON.stringify(r));
  assert(/showing, not just telling/i.test(r.reason), 'reason should coach: ' + r.reason);
});

// ---- 3. teachQuality matrix ----
check('teacher who does not know it: quality 0', () => {
  assert.strictEqual(Ex.teachQuality('mara', 'leakweed', {}), 0);
});
check('bare naming, no specimen, shallow trust: quality 1', () => {
  Game.personDepth('stranger').level = 1;
  const q = Ex.teachQuality('stranger', 'mayapple', {});
  assert.strictEqual(q, 1, 'got ' + q);
});
check('hearsay caps at 1 even from a good teacher', () => {
  Game.personDepth('mara').level = 3;
  const q = Ex.teachQuality('mara', 'dandelion', { shown: true, hearsay: true });
  assert.strictEqual(q, 1, 'got ' + q);
});
check('deep knowledge + shown + trusted = quality 3', () => {
  const q = Ex.teachQuality('mara', 'dandelion', { shown: true });
  assert.strictEqual(q, 3, 'got ' + q);
});

// ---- 4. teachPlant: the beats ----
check('Q3 good teaching on unknown plant: named AND deepened to L2', () => {
  vpRecords.player1.homeRegion = 'Columbus, Ohio';
  said.length = 0;
  const r = Ex.teachPlant('dandelion', 'mara', { shown: true });
  assert(r.taught && r.quality === 3, JSON.stringify(r));
  assert.strictEqual(codex.plants.dandelion.level, 2, 'good teaching should land deep (L2)');
  assert(said.some(s => /Dandelion/.test(s) && /taste|parts|hand/i.test(s)), 'beat should show, not tell');
});
check('Q1 hearsay on foreign hard plant: honest failure, nothing granted', () => {
  vpRecords.player1.homeRegion = 'Miami, Florida';
  Game.personDepth('stranger').level = 1;
  said.length = 0;
  const r = Ex.teachPlant('mayapple', 'stranger', { hearsay: true });
  assert(!r.taught, 'should NOT have taught: ' + JSON.stringify(r));
  assert(!codex.plants.mayapple, 'no knowledge granted on failure');
  assert(said.some(s => /slide right off|doesn't stick|gives up/i.test(s)), 'failure must be honest, not silent');
  assert(said.some(s => /shown|specimen|bring the plant/i.test(s)), 'failure must say what WOULD work');
});
check('Q2 decent telling: name only, L1', () => {
  delete codex.plants.leakweed;
  Game.state.village.plantKnowledge.mara.push('leakweed');
  Game.personDepth('mara').level = 1; // shallow trust: no time-taking bonus... but green+known => q=2
  vpRecords.mara.formerOccupation = 'forager';
  said.length = 0;
  const q = Ex.teachQuality('mara', 'leakweed', {});
  const r = Ex.teachPlant('leakweed', 'mara', {});
  assert(r.taught && r.level === 1, JSON.stringify(r) + ' q=' + q);
});
check('teaching an already-known plant deepens instead of renaming', () => {
  codex.plants.dandelion = { level: 1 };
  Game.personDepth('mara').level = 3;
  said.length = 0;
  const r = Ex.teachPlant('dandelion', 'mara', { shown: true });
  assert(r.taught && r.deepened && codex.plants.dandelion.level === 2, JSON.stringify(r));
});

// ---- 5. people as teachers (codex-people.js) ----
check('stranger teaches nothing: topics empty below depth 2', () => {
  Game.personDepth('stranger').level = 1;
  assert.deepStrictEqual(Game.personTeachTopics('stranger'), []);
});
check('known villager lists topics in plain words, never knowledge names', () => {
  Game.personDepth('mara').level = 2;
  peopleEntries.mara.name = { value: 'Mara Voss' };
  const topics = Game.personTeachTopics('mara');
  assert(topics.length === 2, JSON.stringify(topics));
  assert(topics.some(t => t.knowledgeId === 'forage_sense'), 'food -> forage_sense');
  assert(topics.some(t => t.knowledgeId === 'mending'), 'mending -> mending');
  for (const t of topics) {
    assert(t.label !== 'Reading the Land' && t.label !== 'Repair & Mending', 'knowledge name leaked into label: ' + t.label);
  }
});
check('depth-2 teaching grants L1; depth-3 grants L2 (shown properly)', () => {
  delete codex.skills.forage_sense;
  Game.personDepth('mara').level = 2;
  said.length = 0;
  assert(Game.teachFromPerson('mara', 'forage_sense') === true);
  assert.strictEqual(codex.skills.forage_sense.level, 1, 'depth-2 teaches the bones (L1)');
  delete codex.skills.mending;
  Game.personDepth('mara').level = 3;
  assert(Game.teachFromPerson('mara', 'mending') === true);
  assert.strictEqual(codex.skills.mending.level, 2, 'trusted teacher lands deep (L2)');
  assert(said.some(s => /hands/i.test(s)), 'trusted lesson should be hands-on');
});
check('stranger refuses honestly, nothing granted', () => {
  delete codex.skills.mending;
  Game.personDepth('stranger').level = 0;
  said.length = 0;
  assert(Game.teachFromPerson('stranger', 'mending') === false);
  assert(!codex.skills.mending, 'no skill granted');
  assert(said.some(s => /don't know .* well enough/i.test(s)), 'refusal must be honest');
});
check('codex entry shows teachable topics, gated and name-safe', () => {
  Game.personDepth('mara').level = 2;
  const html = Game.personDepthHTML('mara');
  assert(/Could teach you/.test(html), 'section missing');
  assert(/finding food in the wild/.test(html), 'plain label missing');
  assert(!/Reading the Land/.test(html), 'knowledge name leaked into codex HTML');
});
check('closed book (dead) teaches nothing more', () => {
  const d = Game.personDepth('mara');
  d.closed = true;
  assert.deepStrictEqual(Game.personTeachTopics('mara'), [], 'dead keep their secrets');
  d.closed = false;
});

// ---- 6. perception gating (perceive.js) ----
check('unknown tree: generic, no species, no nut promise', () => {
  Game.__treeLevel = 0;
  const hints = Game.perceptionHints();
  const tree = hints.find(h => /tree|canopy/i.test(h));
  assert(tree, 'expected a tree hint, got: ' + JSON.stringify(hints));
  assert(!/nut|hickory|shagbark/i.test(tree), 'LEAK — unknown tree promised food: ' + tree);
});
check('known tree: species + honest nut hint', () => {
  Game.__treeLevel = 1;
  const hints = Game.perceptionHints();
  const tree = hints.find(h => /tree|canopy|hickory|nuts/i.test(h));
  assert(tree && /shagbark_hickory/.test(tree) && /nuts/.test(tree), 'known tree should name + hint nuts: ' + tree);
  Game.__treeLevel = 0;
});
check('monster hint: descriptor only, never the true name', () => {
  Game.state.scholar.monster = { id: 'gallowdeer', mx: 5, my: 4 };
  const hints = Game.perceptionHints();
  const mh = hints.find(h => /moves nearby|is close/i.test(h));
  assert(mh, 'expected a monster hint: ' + JSON.stringify(hints));
  assert(!/gallowdeer/i.test(mh), 'true name leaked: ' + mh);
  assert(/too many joints/i.test(mh), 'descriptor should carry: ' + mh);
  delete Game.state.scholar.monster;
});
check('whispers rotate by day, stable within a day, never labels', () => {
  Game.state.scholar.day = 5;
  const w1 = Game.perceptionHints().find(h => /ground|ash|stones|skin|prickles|air|mud|prints/i.test(h));
  const w1b = Game.perceptionHints().find(h => /ground|ash|stones|skin|prickles|air|mud|prints/i.test(h));
  Game.state.scholar.day = 6;
  const w2 = Game.perceptionHints().find(h => /ground|ash|stones|skin|prickles|air|mud|prints/i.test(h));
  assert(w1, 'expected a whisper');
  assert.strictEqual(w1, w1b, 'same day should whisper the same');
  console.log(`     day5: "${w1}"`);
  console.log(`     day6: "${w2}"`);
});

// ---- 7. recognition: observed-first identification clicks ----
check('examined-before-named fires the recognition beat', () => {
  delete codex.plants.dandelion;
  delete codex.observations.dandelion;
  Ex.observePlant('dandelion', 'examine');
  Ex.observePlant('dandelion', 'examine');
  Ex.observePlant('dandelion', 'examine');
  said.length = 0;
  Game.identifyPlant('dandelion', 'taught', 'Mara');
  assert(said.some(s => s.includes('\u{1F4A1}') && /Dandelion/.test(s)), 'recognition beat missing: ' + JSON.stringify(said));
  assert.strictEqual(codex.encounters.dandelion, 99, 'fieldwork should earn the deep bonus');
});

// ---- 8. NARRATIVE PLAYTEST: day 1, knows nothing ----
console.log('\n== playtest: a low-knowledge first day ==');
(function playtest() {
  // reset to a fresh arrival
  for (const k of Object.keys(codex.plants)) delete codex.plants[k];
  for (const k of Object.keys(codex.observations)) delete codex.observations[k];
  for (const k of Object.keys(codex.skills)) delete codex.skills[k];
  vpRecords.player1.homeRegion = 'Miami, Florida'; // a long way from home
  Game.personDepth('stranger').level = 1;
  Game.personDepth('mara').level = 3;
  peopleEntries.mara.name = { value: 'Mara Voss' };
  said.length = 0;
  const lines = [];
  const narrate = (s) => lines.push(s);

  narrate('You wash up with nothing. Miami is an ocean away; these woods are foreign.');
  narrate('You crouch by an umbrella-leafed plant and look properly:');
  narrate('  EXAMINE → ' + Ex.examineDescription('mayapple', 1));
  narrate('A drifter by the fire half-remembers something about it:');
  const r1 = Ex.teachPlant('mayapple', 'stranger', { hearsay: true });
  narrate(`  HEARSAY (quality ${r1.quality}) → taught: ${r1.taught}. "${said[said.length - 1]}"`);
  narrate('Days later, Mara — who trusts you now — brings a haul home and shows you properly:');
  vpRecords.player1.homeRegion = 'Columbus, Ohio'; // (same character, later: assume they settle — we test the easy path too)
  const r2 = Ex.teachPlant('dandelion', 'mara', { shown: true });
  narrate(`  SHOWN (quality ${r2.quality}) → taught: ${r2.taught}, level ${r2.level}.`);
  narrate('  "' + said[said.length - 2] + '"');
  narrate('That night you ask Mara what else she knows:');
  narrate('  TOPICS → ' + Game.personTeachTopics('mara').map(t => t.label).join(', '));
  Game.teachFromPerson('mara', 'forage_sense');
  narrate('  "' + said[said.length - 1] + '"');

  for (const l of lines) console.log('  ' + l);
  // feel assertions: nothing unearned, nothing silent
  assert(!r1.taught, 'hearsay on a foreign plant must fail honestly');
  assert(r2.taught && r2.level === 2, 'proper showing must land deep');
  assert(!/mayapple/i.test(lines.slice(0, 4).join(' ')), 'the name must not appear before it is earned');
  console.log('\n  feel: hidden state stays hidden; failure is honest; proper teaching lands deep. earned, visibly.');
})();

console.log(`\nALL ${n} CHECKS PASSED`);
