// test-books-newplants-20261007.js
// Proof for the books.json new-plants pass (Worker B, 2026-10-07):
//   1. every plants.json id except rare_herb is covered by >=1 book's unlocks.plants
//   2. every unlocked plant id exists in plants.json
//   3. every book has the required keys (id, name, description, unlocks, flavor)
//   4. knowledge honesty: the 5 NEW books' find-visible fields (description, flavor,
//      name) contain no edibility-leak wording (extended wordlist, case-insensitive)
//   5. the pre-existing 28 entries are byte-identical (deep-equal) vs
//      `git show HEAD:src/data/books.json`; total is exactly 33
// Plain node, deterministic — no jest.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

const books = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/books.json'), 'utf8'));
check('books.json parses as array', Array.isArray(books));
check('33 entries (28 old + 5 new)', books.length === 33, `got ${books.length}`);

const plantsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/plants.json'), 'utf8'));
const plantIds = new Set(plantsData.map(p => p.id));
check('plants.json has 38 ids', plantIds.size === 38, `got ${plantIds.size}`);

// ---- schema: every book ----
const ALLOWED_UNLOCK_KEYS = new Set(['plants', 'level', 'recipes', 'animals', 'skills', 'skillLevel']);
const seenIds = new Set(), seenNames = new Set();
books.forEach((b, i) => {
  const tag = `book[${i}] id=${b.id || '?'}`;
  ['id', 'name', 'description', 'unlocks', 'flavor'].forEach(f =>
    check(`${tag} has key '${f}'`, b[f] !== undefined && b[f] !== null && b[f] !== ''));
  check(`${tag} id unique`, !seenIds.has(b.id), 'dup ' + b.id);
  check(`${tag} name unique`, !seenNames.has(b.name), 'dup ' + b.name);
  seenIds.add(b.id); seenNames.add(b.name);
  const u = b.unlocks || {};
  Object.keys(u).forEach(k => check(`${tag} unlock key '${k}' allowed`, ALLOWED_UNLOCK_KEYS.has(k)));
  (u.plants || []).forEach(p => check(`${tag} plant '${p}' exists in plants.json`, plantIds.has(p)));
  if (u.level !== undefined)
    check(`${tag} level 1-3`, Number.isInteger(u.level) && u.level >= 1 && u.level <= 3);
});

// ---- coverage: all plants except rare_herb ----
const covered = new Set();
books.forEach(b => (b.unlocks.plants || []).forEach(p => covered.add(p)));
const NEW_PLANTS = ['spicebush', 'american_hazelnut', 'sunchoke', 'stinging_nettle',
  'greenbrier', 'pokeweed', 'maypop', 'wild_cherry', 'serviceberry', 'groundnut',
  'american_ginseng', 'wild_ginger'];
NEW_PLANTS.forEach(p => check(`new plant '${p}' covered by >=1 book`, covered.has(p)));
plantIds.forEach(pid => {
  if (pid === 'rare_herb') return; // intentionally uncovered: mystery discovery pool
  check(`plant '${pid}' covered`, covered.has(pid));
});
check('rare_herb stays uncovered (mystery pool)', !covered.has('rare_herb'));

// ---- knowledge honesty on the 5 new books ----
// extended leak wordlist: edibility claims, taste/palatability, calorie hints,
// preparation/cooking/medicine instructions, poison/danger callouts, eat-directives.
const LEAK_RE = new RegExp(
  '\\b(' +
  [
    'edible', 'inedible',
    'delicious', 'tasty', 'yummy', 'delectable', 'scrumptious', 'savou?ry',
    'nutritious', 'nutrition', 'nourishing', 'wholesome',
    'calories?', 'kcal',
    'flavorful',
    'tastes?', 'tasting',
    'cook(?:ed|ing)?', 'eat(?:able)?', 'recipe', 'prepare', 'preparation',
    'boil', 'roast', 'smoke', 'dry', 'cure', 'skin', 'gut', 'butcher',
    'poison(?:ous|ing)?', 'antidote', 'dosage', 'medicinal',
    'cure(?:s)?', 'heal(?:s|ing)?',
    'trap(?:ping|s)?', 'snare', 'deadfall',
    'weakness', 'vulnerable', 'aggressive', 'attacks?', 'bites?', 'venom(?:ous)?',
  ].join('|') +
  '|steer clear|avoid the|don\'t eat|do not eat|good to eat|safe to eat|fine to eat|ok(?:ay)? to eat' +
  ')\\b', 'i');

const NEW_IDS = new Set(['peddlers_sample_tin', 'nanas_tuber_cards', 'crayon_herbarium',
  'june_notebook', 'wardens_notebook']);
const newBooks = books.filter(b => NEW_IDS.has(b.id));
check('all 5 new books present', newBooks.length === 5, `got ${newBooks.length}`);
newBooks.forEach(b => {
  ['name', 'description', 'flavor'].forEach(f => {
    const v = b[f] || '';
    const m = v.match(LEAK_RE);
    check(`honesty ${b.id}.${f}`, !m, m ? `leak word '${m[0]}' in: "${v.slice(0, 90)}"` : '');
  });
  check(`${b.id} unlocks only plants+level`,
    Object.keys(b.unlocks).every(k => k === 'plants' || k === 'level'));
});

// ---- the old 28 entries are untouched vs HEAD ----
const headRaw = execSync('git show HEAD:src/data/books.json', { cwd: ROOT }).toString();
const headBooks = JSON.parse(headRaw);
check('HEAD has 28 books', headBooks.length === 28, `got ${headBooks.length}`);
const curFirst28 = books.slice(0, 28);
let identical = headBooks.length === curFirst28.length;
if (identical) {
  for (let i = 0; i < 28; i++) {
    if (JSON.stringify(headBooks[i]) !== JSON.stringify(curFirst28[i])) { identical = false; break; }
  }
}
check('first 28 entries deep-equal to HEAD (append-only)', identical);
// byte-level: the new file must be the old file with ',\n' + 5 blocks + '\n]\n'
// spliced in after the old final entry's closing '  }'
const curRaw = fs.readFileSync(path.join(ROOT, 'src/data/books.json'), 'utf8');
const headPrefix = headRaw.slice(0, -2); // old file minus trailing ']\n', ends with '  }\n'
check('new file is old file + append (byte prefix)',
  curRaw.startsWith(headPrefix.slice(0, -1) + ',\n'), 'prefix mismatch');
// file stays pure ASCII like the original (escaped \uXXXX style)
check('file is pure ASCII', !/[^\x00-\x7F]/.test(curRaw));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
