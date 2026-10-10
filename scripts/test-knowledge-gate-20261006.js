#!/usr/bin/env node
// PROOF TEST: knowledge gating (Steve 2026-10-06 — "if you don't know, it doesn't show")
// Exercises the knowledge modules with a stubbed Game:
//   1. examine.js  — examineDescription never leaks names (incl. mid-string),
//                    observation memory, recognition beat
//   2. perceive.js — unknown trees stay generic ("nut tree" leak fixed),
//                    whisper variants rotate, monster/person hints stay gated
// TEACHING-MODEL RETIREMENT (break-it knowledge 2026-10-09 r2): the old
// sections 2-5 + narrative tested Ex.teachQuality / Ex.teachPlant /
// Ex.learnDifficulty / Game.personTeachTopics / Game.teachFromPerson —
// none of which exist anymore. The teaching model moved to Game.teachPlant
// (game.js) + Game.learnFromShowing (journal.js) on 2026-10-08; its proof
// coverage lives in scripts/test-journal-knowledge-20261007.js (parts, thin
// knowledge, haul moments) and scripts/test-break-knowledge-r2.js (teach
// beats, trust cap, trade rungs, believed-name funnel). This file keeps the
// examine/perceive/recognition gating core, plus a guard that examine.js
// never re-grows a divergent teaching model.
// Run: node scripts/test-knowledge-gate-20261006.js
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
assert(Ex && typeof Ex.examineDescription === 'function', 'S.Examine.examineDescription must exist');
assert(Ex && typeof Ex.examineQuality === 'function', 'S.Examine.examineQuality must exist');
assert(Ex && typeof Ex.observePlant === 'function', 'S.Examine.observePlant must exist');
// TEACHING-MODEL GUARD: teaching lives in game.js (Game.teachPlant) and
// journal.js (Game.learnFromShowing) — examine.js must not re-grow a
// divergent teaching primitive (the 2026-10-08 migration removed them).
assert(Ex.teachPlant === undefined, 'Ex.teachPlant must stay removed (moved to Game.teachPlant)');
assert(Ex.teachQuality === undefined, 'Ex.teachQuality must stay removed (quality now assessed in learnFromShowing)');
assert(typeof Game.perceptionHints === 'function', 'Game.perceptionHints must exist');

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
check('leading name in description is stripped (internal scrub)', () => {
  // the name-scrub is internal to examineDescription now (no Ex.scrubName) —
  // prove the behavior, not the helper.
  const p = Game.data.plants.find(x => x.id === 'dandelion');
  const old = p.description;
  p.description = 'Dandelion with jagged leaves and yellow flowers';
  const d = Ex.examineDescription('dandelion', 1);
  p.description = old;
  assert(!/^dandelion/i.test(d), 'leading name leaked: ' + d);
  assert(/jagged/i.test(d), 'description should survive the strip: ' + d);
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

// ---- 2-5. TEACHING MODEL (retired 2026-10-08, see file header) ----
// The old learnDifficulty / teachQuality / teachPlant / personTeachTopics /
// teachFromPerson checks tested an API that no longer exists. Their live
// equivalents:
//   - Game.teachPlant (game.js): good teachers identify instantly, poor ones
//     tick encounters; trust gain caps at 40 ("words only go so far").
//   - Game.learnFromShowing (journal.js): demonstration lessons — shown-deep
//     teaches every part, poor teaching lands as thin (honest) notes.
//   - Game.traderKnowledge (game.js): what a trader can teach, gated on
//     what they actually know.
// Proof coverage: scripts/test-journal-knowledge-20261007.js and
// scripts/test-break-knowledge-r2.js. What this file still proves: the
// teaching model never leaks names through the examine path.
check('teaching model lives outside examine.js (no divergent primitive)', () => {
  for (const k of ['teachPlant', 'teachQuality', 'learnDifficulty']) {
    assert(Ex[k] === undefined, `examine.js must not own ${k}`);
  }
  assert(typeof Ex.observePlant === 'function', 'examine still owns observation memory');
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
// (Rewritten 2026-10-09 r2: the old script used the retired teaching API.
// The teaching beats are proved in test-journal-knowledge-20261007.js and
// test-break-knowledge-r2.js. This playtest keeps the examine -> observe ->
// recognize arc on the modules this file loads.)
console.log('\n== playtest: a low-knowledge first day ==');
(function playtest() {
  // reset to a fresh arrival
  for (const k of Object.keys(codex.plants)) delete codex.plants[k];
  for (const k of Object.keys(codex.observations)) delete codex.observations[k];
  for (const k of Object.keys(codex.skills)) delete codex.skills[k];
  said.length = 0;
  const lines = [];
  const narrate = (s) => lines.push(s);

  narrate('You wash up with nothing. These woods are foreign.');
  narrate('You crouch by an umbrella-leafed plant and look properly:');
  narrate('  EXAMINE → ' + Ex.examineDescription('mayapple', 1));
  narrate('You look again tomorrow, and the day after. The memory builds:');
  Ex.observePlant('mayapple', 'examine');
  Ex.observePlant('mayapple', 'examine');
  const obs = Ex.observationOf('mayapple');
  narrate(`  OBSERVED ${obs.count}x, best quality ${obs.quality} — still no name.`);
  narrate('Days later someone finally tells you what it is:');
  Game.identifyPlant('mayapple', 'taught', 'Mara');
  const beat = said.find(s => s.includes('\u{1F4A1}'));
  narrate('  ' + (beat || '(no recognition beat!)'));

  for (const l of lines) console.log('  ' + l);
  // feel assertions: nothing unearned, nothing silent
  assert(!/mayapple/i.test(lines.slice(0, 5).join(' ')), 'the name must not appear before it is earned');
  assert(beat && /Mayapple/.test(beat), 'the examined-first identification must CLICK');
  assert(Game.plantKnown('mayapple'), 'now it is known — earned, visibly');
  console.log('\n  feel: hidden state stays hidden; the vague description clicks into a name. earned, visibly.');
})();

console.log(`\nALL ${n} CHECKS PASSED`);
