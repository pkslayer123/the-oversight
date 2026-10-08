// Proof test: characterGen.json appearance clothing expansion (Worker A, 2026-10-07).
// Pure data, no seeding needed. Exits non-zero on any failure.
const { execSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');

const PATH = __dirname + '/../src/data/characterGen.json';
const now = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const old = JSON.parse(execSync('git show HEAD:src/data/characterGen.json', { cwd: __dirname + '/..' }).toString());

let pass = 0;
function ok(name, cond) {
  if (!cond) { console.error('FAIL:', name); process.exit(1); }
  pass++; console.log('ok:', name);
}

// 1. every appearancePool has clothing.length >= 5
for (const [k, v] of Object.entries(now.appearancePools)) {
  ok(`pool ${k} clothing>=5`, Array.isArray(v.clothing) && v.clothing.length >= 5);
  ok(`pool ${k} strings`, v.clothing.every(c => typeof c === 'string' && c.length > 0));
  ok(`pool ${k} no dupes`, new Set(v.clothing).size === v.clothing.length);
}

// 2. append-only vs HEAD: old entries byte-identical, same order, at the front
for (const [k, v] of Object.entries(old.appearancePools)) {
  const n = now.appearancePools[k];
  ok(`pool ${k} still exists`, !!n);
  assert.deepStrictEqual(n.clothing.slice(0, v.clothing.length), v.clothing, `pool ${k} old entries changed`);
  pass++; console.log(`ok: pool ${k} old entries preserved (${v.clothing.length})`);
  assert.deepStrictEqual(n.skinTones, v.skinTones, `pool ${k} skinTones changed`);
  pass++;
}
ok('no pools removed', Object.keys(now.appearancePools).length === Object.keys(old.appearancePools).length);
ok('no pools added', new Set(Object.keys(old.appearancePools)).size === Object.keys(now.appearancePools).length
  && Object.keys(now.appearancePools).every(k => old.appearancePools[k]));

// 3. every originKeyword value is a non-empty string array
for (const [k, v] of Object.entries(now.originKeywords)) {
  ok(`kw ${k} string[]`, Array.isArray(v) && v.length > 0 && v.every(t => typeof t === 'string' && t.length > 0));
}
ok('columbus key carries columbus tag', now.originKeywords['columbus'].includes('columbus'));
for (const [k, v] of Object.entries(old.originKeywords)) {
  const n = now.originKeywords[k];
  ok(`kw ${k} kept old tags`, !!n && v.every(t => n.includes(t)));
}

// 4. parseOrigin spot-checks (reimplemented 6-line matcher from game.js ~L221)
function parseOrigin(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  const kw = now.originKeywords;
  const tags = new Set();
  const keys = Object.keys(kw).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (lower.includes(k)) kw[k].forEach(t => tags.add(String(t).toLowerCase()));
  }
  return { raw: raw || 'somewhere unremembered', tags: [...tags] };
}
function hasAll(actual, expected) { return expected.every(t => actual.includes(t)); }
let r = parseOrigin('Ohio');
ok('parseOrigin Ohio', hasAll(r.tags, ['ohio', 'midwest', 'temperate', 'woodlands']));
r = parseOrigin('columbus, ohio');
ok('parseOrigin columbus, ohio -> columbus tag', hasAll(r.tags, ['ohio', 'midwest', 'city', 'columbus']));
r = parseOrigin('lagos');
ok('parseOrigin lagos', hasAll(r.tags, ['nigeria', 'tropical', 'urban', 'africa', 'coast']));
r = parseOrigin('rural vermont');
ok('parseOrigin rural vermont', hasAll(r.tags, ['vermont', 'northeast', 'temperate', 'woodlands', 'mountains', 'rural']));
r = parseOrigin('Tokyo');
ok('parseOrigin Tokyo', hasAll(r.tags, ['japan', 'temperate', 'urban', 'asia']));

console.log(`\nALL GREEN (${pass} checks)`);
