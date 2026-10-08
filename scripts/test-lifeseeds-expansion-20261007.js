// Proof test: lifeseeds.json pool expansion (Steve 2026-10-07).
// Asserts target counts, placeholder whitelist, no duplicates, and that new
// skillOrigins keys do not shadow any abilities.json id. Append-only safe.
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'src', 'data');
const ls = JSON.parse(fs.readFileSync(path.join(DATA, 'lifeseeds.json'), 'utf8'));
const abilities = JSON.parse(fs.readFileSync(path.join(DATA, 'abilities.json'), 'utf8'));

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!ok) failures++;
};

const WHITELIST = new Set(['kin', 'first', 'town', 'place', 'workplace', 'street']);
const placeholderRx = /\{([a-zA-Z_]+)\}/g;

const allStrings = []; // {text, pool}
const collect = (strings, pool) => {
  for (const s of strings) {
    if (typeof s !== 'string') { check(pool + ': non-string entry', false, JSON.stringify(s)); continue; }
    allStrings.push({ text: s, pool });
    const found = [];
    let m;
    while ((m = placeholderRx.exec(s)) !== null) found.push(m[1]);
    placeholderRx.lastIndex = 0;
    const bad = found.filter(p => !WHITELIST.has(p));
    if (bad.length) check(pool + ': whitelist', false, 'bad placeholders ' + bad.join(',') + ' in: ' + s);
  }
};

// ---- gather template strings from every pool ----
collect(ls.events || [], 'events');
collect(ls.wants || [], 'wants');
collect(ls.wounds || [], 'wounds');
for (const k of (ls.kin || [])) collect(k.fates || [], 'kin.' + k.relation);
for (const p of (ls.places || [])) collect(p.names || [], 'places.' + p.kind);
for (const k of Object.keys(ls.skillOrigins || {})) collect(ls.skillOrigins[k] || [], 'skillOrigins.' + k);

// ---- count targets ----
check('events >= 27', (ls.events || []).length >= 27, 'count=' + (ls.events || []).length);
check('wants >= 25', (ls.wants || []).length >= 25, 'count=' + (ls.wants || []).length);
check('wounds >= 25', (ls.wounds || []).length >= 25, 'count=' + (ls.wounds || []).length);
check('places kinds >= 14', (ls.places || []).length >= 14, 'count=' + (ls.places || []).length);
for (const p of (ls.places || [])) {
  check('places.' + p.kind + ' names >= 3', (p.names || []).length >= 3, 'count=' + (p.names || []).length);
}
const soKeys = Object.keys(ls.skillOrigins || {});
check('skillOrigins keys >= 13', soKeys.length >= 13, 'count=' + soKeys.length + ' (' + soKeys.join(',') + ')');
for (const k of soKeys) {
  check('skillOrigins.' + k + ' origins >= 5', (ls.skillOrigins[k] || []).length >= 5,
    'count=' + (ls.skillOrigins[k] || []).length);
}

// ---- duplicate strings (exact) within each pool ----
// kin pool is untouched by this expansion; its pre-existing cross-relation
// dupes are reported as WARN, not FAIL (out of scope).
const MY_POOLS = new Set(['events', 'wants', 'wounds', 'places', 'skillOrigins']);
const seen = new Map(); // normalized text -> pool list
for (const { text, pool } of allStrings) {
  const key = text.trim().toLowerCase();
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(pool);
}
let dupes = 0, warns = 0;
for (const [key, pools] of seen) {
  if (pools.length > 1) {
    const root = pools.map(p => p.split('.')[0]);
    const mine = root.some(r => MY_POOLS.has(r));
    if (mine) { dupes++; check('duplicate string', false, '"' + key + '" in ' + pools.join(' / ')); }
    else { warns++; console.log('WARN  pre-existing duplicate (kin pool, out of scope): "' + key + '" in ' + pools.join(' / ')); }
  }
}
check('no duplicate strings in expanded pools (' + allStrings.length + ' strings scanned)', dupes === 0);

// ---- placeholder whitelist summary (silent pass per pool already reported) ----
let badPH = 0;
for (const { text } of allStrings) {
  let m;
  while ((m = placeholderRx.exec(text)) !== null) if (!WHITELIST.has(m[1])) badPH++;
  placeholderRx.lastIndex = 0;
}
check('all placeholders whitelisted ({kin},{first},{town},{place},{workplace},{street})', badPH === 0);

// ---- new skillOrigins keys must not shadow abilities.json ids ----
const abilityIds = new Set();
if (Array.isArray(abilities)) {
  for (const a of abilities) { if (a && a.id) abilityIds.add(String(a.id)); }
} else {
  for (const k of Object.keys(abilities)) abilityIds.add(k);
}
const clashing = soKeys.filter(k => abilityIds.has(k));
check('skillOrigins keys do not shadow abilities.json ids', clashing.length === 0,
  'ability ids=' + abilityIds.size + (clashing.length ? ' clash: ' + clashing.join(',') : ''));

// ---- JSON round-trip sanity: valid, parseable, no undefined ----
check('lifeseeds.json parses as object with all pools', !!(ls.events && ls.kin && ls.places && ls.regions && ls.skillOrigins && ls.wants && ls.wounds));

console.log(failures === 0 ? '\nALL GREEN' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
