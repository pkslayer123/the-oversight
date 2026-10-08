// Proof test: lifeseeds.json kin + regions expansion (Steve 2026-10-07).
// Node only (no jest). Compares against HEAD (git show, read-only) to prove
// append-only expansion + 4 surgical dupe-fate fixes, zero cosmetic churn.
// Prints ALL GREEN or exits non-zero with the first failure.
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'src/data/lifeseeds.json');
let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  PASS', name); }
  else { failures++; console.log('  FAIL', name, detail === undefined ? '' : ':: ' + detail); }
}

const raw = fs.readFileSync(FILE, 'utf8');
const cur = JSON.parse(raw);
const headRaw = execSync('git show HEAD:src/data/lifeseeds.json', { cwd: path.join(__dirname, '..'), maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const head = JSON.parse(headRaw);

const TOK = /\{([a-z]+)\}/g;
const tokensOf = (s) => { const t = new Set(); let m; while ((m = TOK.exec(s))) t.add(m[1]); TOK.lastIndex = 0; return t; };

console.log('== kin counts ==');
check('HEAD kin = 18', head.kin.length === 18, 'got ' + head.kin.length);
check('current kin = 28', cur.kin.length === 28, 'got ' + cur.kin.length);
check('every relation has exactly 3 fates', cur.kin.every(k => Array.isArray(k.fates) && k.fates.length === 3),
  JSON.stringify(cur.kin.filter(k => !k.fates || k.fates.length !== 3).map(k => k.relation)));
check('relation names unique', new Set(cur.kin.map(k => k.relation)).size === cur.kin.length);

const EXPECTED_NEW = ['older brother','younger sister','cousin','niece','nephew','ex','rival','coworker','teacher','coach'];
check('10 new relations appended in order',
  JSON.stringify(cur.kin.slice(18).map(k => k.relation)) === JSON.stringify(EXPECTED_NEW),
  JSON.stringify(cur.kin.slice(18).map(k => k.relation)));

console.log('== kin append-only + surgical dupe fixes ==');
const headByRel = Object.fromEntries(head.kin.map(k => [k.relation, k.fates]));
const EXPECTED_REPHRASE = {
  father: ["his chair's been empty since the sky changed"],
  sister: ["had just moved to the city when the sky changed"],
  brother: ["left one voicemail, half static", "was headed west when the sky changed, last anyone knew"],
};
for (const k of head.kin) {
  const c = cur.kin.find(x => x.relation === k.relation);
  check('relation still present: ' + k.relation, !!c);
  if (!c) continue;
  if (EXPECTED_REPHRASE[k.relation]) {
    const diffs = c.fates.filter((f, i) => f !== k.fates[i]);
    check(k.relation + ' changed exactly the intended fate(s)',
      diffs.length === EXPECTED_REPHRASE[k.relation].length &&
      EXPECTED_REPHRASE[k.relation].every(s => diffs.includes(s)) &&
      c.fates.length === 3,
      'diffs=' + JSON.stringify(diffs));
    // every other fate byte-identical
    const kept = k.fates.filter((f, i) => c.fates[i] === f);
    check(k.relation + ' kept remaining fates identical', kept.length === 3 - diffs.length);
  } else {
    check(k.relation + ' fates byte-identical to HEAD', JSON.stringify(c.fates) === JSON.stringify(k.fates));
  }
}

console.log('== kin fate uniqueness ==');
const allFates = cur.kin.flatMap(k => k.fates);
const seen = new Set(); const dupes = [];
for (const f of allFates) { if (seen.has(f)) dupes.push(f); seen.add(f); }
check('zero exact-duplicate fate strings across kin pool (' + allFates.length + ' strings)', dupes.length === 0, JSON.stringify(dupes));

console.log('== kin placeholder whitelist ==');
// Engine fills kin fates via fillBasic in lifeseed.js: {first} {town} {workplace} {place}.
// {street} and {kin} are NEVER filled for kin fates.
const KIN_WHITELIST = new Set(['first', 'town', 'workplace', 'place']);
const badTok = [];
for (const k of cur.kin) for (const f of k.fates) for (const t of tokensOf(f)) if (!KIN_WHITELIST.has(t)) badTok.push(k.relation + ': ' + t);
check('all kin fates use only engine-filled placeholders {first}{town}{workplace}{place}', badTok.length === 0, JSON.stringify(badTok));
const headToks = new Set(head.kin.flatMap(k => k.fates).flatMap(f => [...tokensOf(f)]));
const curToks = new Set(allFates.flatMap(f => [...tokensOf(f)]));
const novelToks = [...curToks].filter(t => !headToks.has(t));
check('no placeholder introduced that HEAD kin pool never used', novelToks.length === 0, JSON.stringify(novelToks));

console.log('== regions ==');
const NEW_IDS = ['great_lakes', 'gulf_coast', 'texas_hill_country', 'great_basin'];
check('HEAD regions = 14', head.regions.length === 14, 'got ' + head.regions.length);
check('current regions = 18', cur.regions.length === 18, 'got ' + cur.regions.length);
check('14 original regions byte-identical to HEAD (order preserved)',
  JSON.stringify(cur.regions.slice(0, 14)) === JSON.stringify(head.regions));
check('4 new region ids appended in order',
  JSON.stringify(cur.regions.slice(14).map(r => r.id)) === JSON.stringify(NEW_IDS),
  JSON.stringify(cur.regions.slice(14).map(r => r.id)));
check('region ids unique', new Set(cur.regions.map(r => r.id)).size === cur.regions.length);
for (const r of cur.regions) {
  const tags = r.matchTags || [];
  check('matchTags no internal dupes: ' + r.id, new Set(tags.map(String)).size === tags.length);
}
for (const r of cur.regions.slice(14)) {
  check(r.id + ' has id/label/land strings',
    typeof r.id === 'string' && typeof r.label === 'string' && r.label.length > 0 &&
    typeof r.land === 'string' && r.land.length > 0);
  check(r.id + ' matchTags >= 3', (r.matchTags || []).length >= 3, 'got ' + (r.matchTags || []).length);
  check(r.id + ' towns = 6', (r.towns || []).length === 6, 'got ' + (r.towns || []).length);
  check(r.id + ' workplaces = 4', (r.workplaces || []).length === 4, 'got ' + (r.workplaces || []).length);
}
// far_away is the engine's intentional fallback region (pre-existing exception, unchanged).
const fw = cur.regions.find(r => r.id === 'far_away');
check('far_away unchanged from HEAD (pre-existing fallback exception)',
  JSON.stringify(fw) === JSON.stringify(head.regions.find(r => r.id === 'far_away')));
console.log('  NOTE far_away intentionally has 0 matchTags / 4 towns (engine fallback) — inherited, not introduced.');

console.log('== new-region territory / tag separation ==');
const headTowns = new Set(head.regions.flatMap(r => r.towns || []));
const headWps = new Set(head.regions.flatMap(r => r.workplaces || []));
const headTags = new Set(head.regions.flatMap(r => r.matchTags || []).map(String));
const townOverlap = cur.regions.slice(14).flatMap(r => (r.towns || []).filter(t => headTowns.has(t)));
const wpOverlap = cur.regions.slice(14).flatMap(r => (r.workplaces || []).filter(w => headWps.has(w)));
const tagOverlap = cur.regions.slice(14).flatMap(r => (r.matchTags || []).filter(t => headTags.has(String(t))));
check('new towns share zero territory with existing regions', townOverlap.length === 0, JSON.stringify(townOverlap));
check('new workplaces share zero strings with existing regions', wpOverlap.length === 0, JSON.stringify(wpOverlap));
check('new matchTags duplicate no existing matchTag exactly', tagOverlap.length === 0, JSON.stringify(tagOverlap));

console.log('== JSON style (no cosmetic churn) ==');
check('no \\u escapes (matches original ASCII style)', !/\\u[0-9a-fA-F]{4}/.test(raw));
check('file ends with single newline', raw.endsWith('}\n') && !raw.endsWith('\n\n'));

console.log(failures === 0 ? '\nALL GREEN' : '\n' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
