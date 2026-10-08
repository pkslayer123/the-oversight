// test-books-depth-20261007.js
// Validates src/data/books.json: schema, allowed unlock keys, reference integrity,
// uniqueness, and knowledge-honesty (no instructional leaks in find-visible fields).
// Plain node, deterministic (mulberry32 seed) — no jest.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// deterministic PRNG (mulberry32) for sampled checks
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.SEED || 20261007);
const rand = mulberry32(SEED);

let books;
try {
  books = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/books.json'), 'utf8'));
  check('books.json parses', true);
} catch (e) { check('books.json parses', false, e.message); process.exit(1); }
check('books is a non-empty array', Array.isArray(books) && books.length > 0);

const plantsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/plants.json'), 'utf8'));
const animalsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/animals.json'), 'utf8'));
const plantIds = new Set(Array.isArray(plantsData) ? plantsData.map(e => e.id) : Object.keys(plantsData));
const animalIds = new Set(Array.isArray(animalsData) ? animalsData.map(e => e.id) : Object.keys(animalsData));
check('plants.json has ids', plantIds.size > 0);
check('animals.json has ids', animalIds.size > 0);

const ALLOWED_UNLOCK_KEYS = new Set(['plants', 'level', 'recipes', 'animals', 'skills', 'skillLevel']);
const REQUIRED_FIELDS = ['id', 'name', 'description', 'unlocks'];
const seenIds = new Set(), seenNames = new Set();

// leak-wordlist: instructional verbs/nouns that must NOT appear in find-visible fields
const LEAK_RE = /\b(edible|cook(?:ed|ing)?|eat(?:able)?|recipe|prepare|preparation|boil|roast|smoke|dry|cure|skin|gut|butcher|poison(?:ous|ing)?|antidote|dosage|medicinal|cure(?:s)?|heal(?:s|ing)?|trap(?:ping|s)?|snare|deadfall|weakness|vulnerable|aggressive|attacks?|bites?|venom(?:ous)?|steer clear|avoid the|don't eat)\b/i;

books.forEach((b, i) => {
  const tag = `book[${i}] id=${b.id || '?'}`;
  REQUIRED_FIELDS.forEach(f => check(`${tag} has field ${f}`, b[f] !== undefined && b[f] !== null && b[f] !== ''));
  check(`${tag} id unique`, !seenIds.has(b.id), `duplicate id ${b.id}`);
  check(`${tag} name unique`, !seenNames.has(b.name), `duplicate name ${b.name}`);
  seenIds.add(b.id); seenNames.add(b.name);

  const u = b.unlocks || {};
  Object.keys(u).forEach(k => check(`${tag} unlock key '${k}' allowed`, ALLOWED_UNLOCK_KEYS.has(k)));
  if (u.plants) u.plants.forEach(p => check(`${tag} plant '${p}' resolves`, plantIds.has(p)));
  if (u.animals) u.animals.forEach(a => check(`${tag} animal '${a}' resolves`, animalIds.has(a)));
  if (u.level !== undefined) check(`${tag} level 1-3`, Number.isInteger(u.level) && u.level >= 1 && u.level <= 3);
  if (u.skillLevel !== undefined) check(`${tag} skillLevel 1-2`, Number.isInteger(u.skillLevel) && u.skillLevel >= 1 && u.skillLevel <= 2);
  if (u.skills) check(`${tag} skills non-empty array`, Array.isArray(u.skills) && u.skills.length > 0);
  if (u.recipes) check(`${tag} recipes non-empty array`, Array.isArray(u.recipes) && u.recipes.length > 0);
});

// knowledge honesty: sampled find-visible fields of the NEW books must be
// evocative, never instructional (pre-existing entries grandfathered in).
const NEW_IDS = new Set(['nut_gatherers_handbook','thicket_field_guide','roots_and_reasons',
  'late_summer_herbarium','small_game_almanac','fur_takers_journal',
  'system_manual_predator_sign','pond_watchers_notes','night_shift_notebook',
  'big_game_small_margin']);
const idx = books.map((b, i) => NEW_IDS.has(b.id) ? i : -1).filter(i => i >= 0);
check('all 10 new books present', idx.length === 10);
for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
idx.slice(0, Math.min(10, books.length)).forEach(i => {
  const b = books[i];
  ['description', 'flavor'].forEach(f => {
    const v = b[f] || '';
    check(`honesty sample ${b.id}.${f}`, !LEAK_RE.test(v), `leak-ish wording: "${v.slice(0, 80)}"`);
  });
});

// coverage: every animal/plant unlock id across the pool must resolve (pool-wide sweep)
const cov = { plants: new Set(), animals: new Set(), skills: new Set(), recipes: new Set() };
books.forEach(b => { const u = b.unlocks || {};
  (u.plants || []).forEach(p => cov.plants.add(p));
  (u.animals || []).forEach(a => cov.animals.add(a));
  (u.skills || []).forEach(s => cov.skills.add(s));
  (u.recipes || []).forEach(r => cov.recipes.add(r));
});
console.log(`coverage: plants=${cov.plants.size} animals=${cov.animals.size} skills=${[...cov.skills]} recipes=${[...cov.recipes]}`);
check('pool covers >= 20 plants', cov.plants.size >= 20);
check('pool covers >= 25 animals', cov.animals.size >= 25);

console.log(`\nRESULT: ${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
