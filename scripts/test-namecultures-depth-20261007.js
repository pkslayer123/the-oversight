// Proof test: nameCultures/originPicker depth expansion (Steve 2026-10-07).
// Seeded node script. Asserts:
//  1. every culture has first.length >= 150 AND last.length >= 150
//  2. no duplicate names within any culture pool
//  3. every originToCulture value is a valid cultures key
//  4. every distinct origin string in background_survivors.json has an
//     originToCulture mapping, or is on the DOCUMENTED_UNMAPPED list
//     (consumer: Game.cultureForOrigin returns null -> genNameForOrigin falls
//     back to characterGen.json legacy firstNames/lastNames flat lists)
//  5. every originPicker region has >= 3 origins; every origin has flag+label
//  6. every originPicker label has an originToCulture mapping or is documented
//  7. seeded spot-check: 20 random NEW names per expanded culture —
//     non-ASCII appropriateness (ASCII-strict pools stay ASCII; diacritic
//     pools carry diacritics in the new batch)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const nc = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/nameCultures.json'), 'utf8'));
const op = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/originPicker.json'), 'utf8'));
const survivors = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/background_survivors.json'), 'utf8'));

// mulberry32, fixed seed -> deterministic spot-check samples
let _s = 0x20261007;
function rnd() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
  else console.log('ok: ' + msg);
}
const nonascii = s => /[^\x00-\x7F]/.test(s);

// 1+2: pool depth and uniqueness
const cultures = nc.cultures;
for (const [cid, c] of Object.entries(cultures)) {
  check(Array.isArray(c.first) && c.first.length >= 150, `${cid}.first >= 150 (got ${c.first.length})`);
  check(Array.isArray(c.last) && c.last.length >= 150, `${cid}.last >= 150 (got ${c.last.length})`);
  for (const pool of ['first', 'last']) {
    const seen = new Set(); let dup = null;
    for (const n of c[pool]) { if (seen.has(n)) { dup = n; break; } seen.add(n); }
    check(!dup, `${cid}.${pool} no duplicates${dup ? ' (dup: ' + dup + ')' : ''}`);
  }
}

// 3: originToCulture values valid
const o2c = nc.originToCulture;
for (const [label, cid] of Object.entries(o2c)) {
  check(!!cultures[cid], `originToCulture[${label}] -> valid culture '${cid}'`);
}

// 4: survivor origin coverage.
// Consumer: Game.cultureForOrigin(origin) -> exact originToCulture hit, else
// country-substring fallback, else null. Null -> genNameForOrigin uses the
// legacy characterGen.json flat firstNames/lastNames. The origins below have
// no plausible existing culture pool (no chinese/french/hungarian/southafrican/
// finnish/greek/mongolian/georgian culture key exists), so they are
// deliberately left to the legacy-list fallback rather than a wrong culture.
const DOCUMENTED_UNMAPPED = new Set([
  'Shanghai, China', 'Beijing, China', 'Chengdu, China',
  'Lyon, France', 'Marseille, France',
  'Budapest, Hungary', 'Cape Town, South Africa', 'Helsinki, Finland',
  'Athens, Greece', 'Ulaanbaatar, Mongolia', 'Tbilisi, Georgia',
]);
const survivorOrigins = [...new Set(survivors.map(p => p.origin))];
for (const o of survivorOrigins) {
  check(!!o2c[o] || DOCUMENTED_UNMAPPED.has(o),
    `survivor origin '${o}' mapped${o2c[o] ? ' -> ' + o2c[o] : ' (documented legacy-list fallback)'}`);
}

// 5+6: originPicker shape and mapping coverage
for (const r of op.regions) {
  check(Array.isArray(r.origins) && r.origins.length >= 3,
    `picker region '${r.name}' has >= 3 origins (got ${r.origins.length})`);
  for (const o of r.origins) {
    check(typeof o.flag === 'string' && o.flag.length > 0 && typeof o.label === 'string' && o.label.length > 0,
      `picker origin has flag+label: ${JSON.stringify(o)}`);
    check(!!o2c[o.label] || DOCUMENTED_UNMAPPED.has(o.label),
      `picker label '${o.label}' mapped${o2c[o.label] ? ' -> ' + o2c[o.label] : ' (documented legacy-list fallback)'}`);
  }
}

// 7: seeded spot-check of the NEW names appended this run.
// APPENDED[cid] = number of names appended to the TAIL of each array.
const APPENDED = {
  italian: { first: 50, last: 98 }, venezuelan: { first: 45, last: 52 },
  ukrainian: { first: 30, last: 53 }, newzealander: { first: 26, last: 50 },
  peruvian: { first: 30, last: 44 }, norwegian: { first: 0, last: 51 },
  argentine: { first: 0, last: 53 }, polish: { first: 0, last: 49 },
  colombian: { first: 0, last: 35 }, ghanaian: { first: 36, last: 0 },
  bangladeshi: { first: 0, last: 25 }, ethiopian: { first: 16, last: 38 },
  irish: { first: 6, last: 0 }, moroccan: { first: 0, last: 26 },
};
const ASCII_STRICT = new Set(['italian', 'ukrainian', 'ghanaian']); // existing pools are 100% ASCII
for (const [cid, counts] of Object.entries(APPENDED)) {
  const c = cultures[cid];
  const existingAll = c.first.slice(0, c.first.length - counts.first)
    .concat(c.last.slice(0, c.last.length - counts.last));
  const existingDiaFrac = existingAll.filter(nonascii).length / existingAll.length;
  for (const pool of ['first', 'last']) {
    const n = counts[pool];
    if (!n) continue;
    const fresh = c[pool].slice(c[pool].length - n);
    check(fresh.length === n, `${cid}.${pool} tail has exactly ${n} new names`);
    const samp = sample(fresh, Math.min(20, fresh.length));
    console.log(`  sample ${cid}.${pool}: ${samp.join(', ')}`);
    for (const name of samp) {
      check(name.trim().length >= 2 && !/[\d_]/.test(name), `name sane: '${name}' (${cid})`);
      if (ASCII_STRICT.has(cid)) check(!nonascii(name), `ASCII-strict pool stays ASCII: '${name}' (${cid})`);
    }
    if (!ASCII_STRICT.has(cid) && existingDiaFrac > 0.05) {
      check(fresh.some(nonascii), `${cid}.${pool} new batch carries diacritics (existing pool is ${(existingDiaFrac * 100).toFixed(1)}% non-ASCII)`);
    }
  }
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL GREEN');
process.exit(failures ? 1 : 0);
