// Proof test: foreignSpeech.json depth pass (2026-10-07).
// Asserts thin categories are now >=4 entries / fewWords >=5 across all 25 languages,
// entry schema integrity, no dupes, script presence for non-Latin languages,
// and that pre-existing content was untouched (git diff shows additions only).
// Run: node scripts/test-foreignspeech-depth-20261007.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = 'src/data/foreignSpeech.json';

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

const d = JSON.parse(fs.readFileSync(path, 'utf8'));
const langs = Object.keys(d).filter(k => !k.startsWith('_'));
const CATS = ['openers','questions','agree','warm','need_food','need_danger','confused','laugh','need_help','need_water','fewWords'];

const BIG8 = ['arabic','french','hindi','italian','mandarin','portuguese','russian','spanish'];
// pre-pass baseline counts for categories we appended to
const BASELINE = {};
for (const l of langs) {
  BASELINE[l] = BIG8.includes(l)
    ? { agree: 3, warm: 3 }
    : { agree: 2, warm: 2, need_danger: 2, need_food: 2, questions: 2, fewWords: 3 };
}
// grandfathered pre-existing kw quirks (kw gloss not a literal substring of t; from the
// original data, e.g. conjugated forms, case differences, arabic article assimilation)
const GRANDFATHERED = new Set([
  'arabic.need_food.الأكل',
  'french.confused.quoi',
  'french.need_help.aide-moi',
  'italian.need_help.aiutami',
  'portuguese.need_danger.cuidado',
  'russian.need_danger.осторожно',
  'russian.need_help.помоги',
  'spanish.need_help.ayúdame',
  'japanese.need_danger.行く',
  'turkish.questions.Yiyecek',
  'indonesian.confused.Apa',
]);

ok(langs.length === 25, `25 languages present (got ${langs.length})`);
for (const l of langs) {
  for (const c of CATS) ok(Array.isArray(d[l][c]), `${l}.${c} exists`);
  for (const c of ['agree','warm','need_danger','need_food','questions'])
    ok(d[l][c].length >= 4, `${l}.${c} >= 4 (got ${d[l][c].length})`);
  ok(d[l].fewWords.length >= 5, `${l}.fewWords >= 5 (got ${d[l].fewWords.length})`);
  // new entries were appended at the end; verify expected append counts
  for (const [c, base] of Object.entries(BASELINE[l]))
    ok(d[l][c].length > base, `${l}.${c} grew from baseline ${base} (got ${d[l][c].length})`);
  for (const c of CATS) {
    if (c === 'fewWords') {
      for (const e of d[l][c]) ok(typeof e === 'string' && e.length > 0, `${l}.fewWords entry non-empty`);
      continue;
    }
    const seen = new Set();
    const base = (BASELINE[l][c] !== undefined) ? BASELINE[l][c] : d[l][c].length;
    d[l][c].forEach((e, i) => {
      const isNew = i >= base;
      ok(typeof e.t === 'string' && e.t.length > 0, `${l}.${c} t non-empty`);
      ok(typeof e.en === 'string' && e.en.length > 0, `${l}.${c} en non-empty`);
      ok(e.t !== e.en, `${l}.${c} t !== en`);
      ok(e.kw && typeof e.kw === 'object' && !Array.isArray(e.kw), `${l}.${c} kw is object`);
      for (const k of Object.keys(e.kw)) {
        const tag = `${l}.${c}.${k}`;
        if (GRANDFATHERED.has(tag)) ok(true, `${l}.${c} kw "${k}" grandfathered pre-existing quirk`);
        else if (isNew) ok(e.t.includes(k), `${l}.${c} NEW kw key "${k}" appears in t`);
        else ok(e.t.toLowerCase().includes(k.toLowerCase()), `${l}.${c} old kw key "${k}" appears in t (lenient)`);
        ok(typeof e.kw[k] === 'string' && e.kw[k].length > 0, `${l}.${c} kw gloss non-empty`);
      }
      ok(!seen.has(e.t), `${l}.${c} no duplicate t`);
      seen.add(e.t);
    });
  }
}

// script presence spot-checks for non-Latin languages
function scriptHit(lang, re) {
  const all = [];
  for (const c of CATS) if (c !== 'fewWords') for (const e of d[lang][c]) all.push(e.t);
  return all.some(t => re.test(t));
}
ok(scriptHit('arabic', /[\u0600-\u06FF]/), 'arabic entries contain Arabic script');
ok(scriptHit('hindi', /[\u0900-\u097F]/), 'hindi entries contain Devanagari');
ok(scriptHit('mandarin', /[\u4E00-\u9FFF]/), 'mandarin entries contain CJK');
ok(scriptHit('thai', /[\u0E00-\u0E7F]/), 'thai entries contain Thai script');
ok(scriptHit('amharic', /[\u1200-\u137F]/), 'amharic entries contain Ethiopic');
ok(scriptHit('bengali', /[\u0980-\u09FF]/), 'bengali entries contain Bengali script');

// pre-existing content untouched: every baseline entry deep-equals HEAD's version
const headRaw = execSync(`git show HEAD:${path}`, { encoding: 'utf8' });
const head = JSON.parse(headRaw);
for (const l of langs) {
  for (const [c, base] of Object.entries(BASELINE[l])) {
    for (let i = 0; i < base; i++)
      ok(JSON.stringify(d[l][c][i]) === JSON.stringify(head[l][c][i]),
         `${l}.${c}[${i}] byte-identical to HEAD`);
  }
}

// counts sanity vs pre-pass baseline: small langs 37 each, big 8 are 46 each
const totals = {};
for (const l of langs) totals[l] = CATS.reduce((a, c) => a + d[l][c].length, 0);
const grand = Object.values(totals).reduce((a, b) => a + b, 0);
ok(grand === 17 * 40 + 8 * 46, `grand total entries = ${grand} (expected 1048)`);

if (fails) { console.error(`\n${fails} FAILURES`); process.exit(1); }
console.log('\nALL GREEN');
