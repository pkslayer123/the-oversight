#!/usr/bin/env node
/* Proof test: animals 26->32 expansion (Steve 2026-10-05).
   - loads animals.json the way the game does (require from src/data)
   - asserts every NEW animal has all required fields + sane kcal
   - asserts every data field used is actually read by the engine
   - asserts validate-data.js error set has zero NEW failures (only the
     pre-existing stale-schema 'unknown field' class may repeat)
   Prints PASS/FAIL counts. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const DATA = path.join(__dirname, '..', 'src', 'data');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL: ' + msg); } };
const failMsg = msg => { fail++; console.error('  FAIL: ' + msg); };

const NEW_IDS = ['eastern_chipmunk', 'american_mink', 'great_horned_owl',
  'green_heron', 'big_brown_bat', 'eastern_coyote'];

// Load exactly like the game does (require of the JSON data file).
const animals = require(path.join(DATA, 'animals.json'));
console.log('animals loaded:', animals.length);
ok(animals.length === 32, `animals === 32 (got ${animals.length})`);
const ids = new Set(animals.map(a => a.id));
ok(ids.size === animals.length, 'animal ids unique');
NEW_IDS.forEach(id => ok(ids.has(id), `new animal present: ${id}`));

const ACTIVITY = ['nocturnal', 'diurnal', 'crepuscular', 'both'];
const DIFF = ['trivial', 'easy', 'medium', 'hard', 'very_hard', 'dangerous'];
const METHODS = ['snare', 'chase', 'trap', 'bow', 'hands', 'line', 'stick'];
// kcal reality anchors: a bat is not a deer. Bounds per new animal.
const KCAL_RANGE = {
  eastern_chipmunk: [100, 350], american_mink: [400, 1200],
  great_horned_owl: [500, 1400], green_heron: [400, 1200],
  big_brown_bat: [50, 250], eastern_coyote: [3000, 10000]
};

NEW_IDS.forEach(id => {
  const a = animals.find(x => x.id === id);
  if (!a) return;
  ok(typeof a.name === 'string' && a.name.length > 3, `${id}: name present`);
  ok(ACTIVITY.includes(a.activity), `${id}: activity '${a.activity}' in enum`);
  ok(Array.isArray(a.biomes) && a.biomes.length > 0, `${id}: biomes non-empty`);
  ok(typeof a.description === 'string' && a.description.length > 20, `${id}: description present`);
  ok(typeof a.calories === 'number' && a.calories > 0, `${id}: calories positive`);
  const r = KCAL_RANGE[id];
  ok(a.calories >= r[0] && a.calories <= r[1],
    `${id}: calories ${a.calories} reality-anchored [${r[0]}-${r[1]}]`);
  ok(DIFF.includes(a.difficulty), `${id}: difficulty '${a.difficulty}' in enum`);
  ok(DIFF.includes(a.fleeDifficulty), `${id}: fleeDifficulty '${a.fleeDifficulty}' in enum`);
  ok(Array.isArray(a.method) && a.method.length > 0 &&
     a.method.every(m => METHODS.includes(m)),
    `${id}: method [${(a.method || []).join(',')}] all engine-known`);
  ['1', '2', '3', '4'].forEach(k =>
    ok(typeof (a.knowledgeLevels || {})[k] === 'string' && a.knowledgeLevels[k].length > 20,
      `${id}: knowledgeLevels[${k}] present`));
  // "if you don't know, it doesn't show": unknown must not leak the name.
  ok(typeof a.unknown === 'string' && a.unknown.length > 10, `${id}: unknown descriptor present`);
  ok(!a.unknown.toLowerCase().includes(a.name.split(' ')[1].toLowerCase()),
    `${id}: unknown descriptor does not leak the true name`);
  ok(typeof a.huntText === 'string' && a.huntText.length > 40, `${id}: huntText present`);
  ok(typeof a.killText === 'string' && a.killText.includes('{kcal}'),
    `${id}: killText carries {kcal} placeholder`);
  ok(typeof a.tell === 'string' && a.tell.length > 10, `${id}: tell (windup telegraph) present`);
  ok(typeof a.behavior === 'string' && a.behavior.length > 0, `${id}: behavior present`);
  ok(typeof a.behaviorDesc === 'string' && a.behaviorDesc.length > 40,
    `${id}: behaviorDesc present`);
  ok(a.butcher && typeof a.butcher === 'object', `${id}: butcher object present`);
  ok(typeof a.diseaseVector === 'string' && a.diseaseVector.length > 20,
    `${id}: diseaseVector present`);
  ok(a.common === true, `${id}: common flag true`);
  ok(Array.isArray(a.regions) && a.regions.includes('north_america'), `${id}: regions has north_america`);
  ok(typeof a.emoji === 'string' && a.emoji.length > 0, `${id}: emoji present`);
});

// --- every field the data relies on must be read by the engine (clean sources) ---
const SRC = path.join(__dirname, '..', 'src', 'js');
const jsFiles = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, f.name);
  if (f.isDirectory()) walk(p);
  else if (f.name.endsWith('.js')) jsFiles.push(p);
} })(SRC);
const allSrc = jsFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const FIELD_USED = { // data field -> must appear used in engine source
  calories: 1, method: 1, diseaseVector: 1, unknown: 1, killText: 1,
  behavior: 1, knowledgeLevels: 1, butcher: 1, common: 1, regions: 1,
  huntText: 1, tell: 1, emoji: 1, description: 1, difficulty: 1,
  activity: 1, biomes: 1, scientific: 1
};
Object.keys(FIELD_USED).forEach(field => {
  ok(new RegExp('\\.' + field + '\\b').test(allSrc),
    `engine reads data field '${field}' somewhere in src/js`);
});

// --- validate-data.js: zero NEW failures ---
let after;
try {
  execFileSync('node', [path.join(__dirname, 'validate-data.js')], { stdio: 'pipe' });
  after = [];
} catch (e) {
  // The validator prints its error lines to STDERR, not stdout.
  after = ((e.stderr || e.stdout) || '').toString().split('\n').filter(l => l.includes('✗'));
}
const beforeRaw = fs.readFileSync('/tmp/animals-before.txt', 'utf8')
  .split('\n').filter(l => l.includes('✗'));
const norm = l => l.replace(/animals\.json#(\d+)/, (_, n) => 'animals.json#' + (+n >= 26 ? 'NEW' : n));
const beforeSet = new Set(beforeRaw.map(norm));
let newFailures = 0;
after.forEach(l => {
  const n = norm(l);
  if (/animals\.json#NEW/.test(n)) {
    // New entries may only repeat the pre-existing stale-schema class
    // ('unknown field diseaseVector/common/regions') — flagged in schema,
    // read by the engine, affecting all 26 old animals identically.
    if (/unknown field '(diseaseVector|common|regions)'/.test(n)) {
      console.log('  note (pre-existing class, documented): ' + n.trim());
    } else { newFailures++; failMsg('NEW failure class on new animal: ' + n.trim()); }
  } else if (!beforeSet.has(n)) {
    newFailures++; failMsg('NEW failure (was absent before): ' + n.trim());
  }
});
ok(newFailures === 0, `zero new validate-data failure classes (got ${newFailures})`);
console.log(`\nvalidate-data: before=${beforeRaw.length} lines, after=${after.length} lines, new-class failures=${newFailures}`);

console.log(`\nRESULT: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
