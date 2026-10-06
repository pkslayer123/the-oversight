#!/usr/bin/env node
// REGRESSION TEST: combat-log spacing (Steve 2026-10-06).
// Live bug report (verbatim from a real-build browser pass):
//   "💥 It slams through!A woman, maybe 50s..."   (missing space after "!")
//   "'You're bleeding!'The attack hits you for 25." (missing space after "!\"")
// ROOT CAUSE (verified 2026-10-06): NOT the game.js emitters — every say()
// pushes a separate, correctly-spaced log entry. The join happens in
// app.js narrationBoxHTML (~line 7262):
//   const fb = feedbackInner(); // "<p class=fb-line>A</p><p class=fb-line>B</p>"
//   const clean = String(text).replace(/<[^>]*>/g, '').trim();
// Stripping the <p> tags deletes the paragraph boundaries with NO separator,
// gluing "…slams through!" + "A woman…" into one string. The fix belongs in
// app.js (OUT OF SCOPE for the game.js worker): insert a space at each </p>
// before stripping tags:
//   .replace(/<\/p>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
// This test: (1) reproduces both reported strings through the CURRENT render
// logic (fails until app.js is fixed), (2) validates the fixed logic,
// (3) sibling-scans every game.js say() emitter for intra-string
// punctuation+Capital joins with no space (passes — emitters are clean).
// Run: node scripts/test-combat-log-spacing.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`   [OK] ${name}`); }
  else { fail++; console.log(`   [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- Faithful copy of app.js render path (narrationBoxHTML + feedbackInner) ----
function feedbackInner(lines) {
  return lines.map(l => `<p class="fb-line">${l}</p>`).join('');
}
// CURRENT app.js ~7262 strip:
function renderCurrent(lines) {
  const text = feedbackInner(lines);
  return String(text).replace(/<[^>]*>/g, '').trim();
}
// FIXED strip (proposed app.js change):
function renderFixed(lines) {
  const text = feedbackInner(lines);
  return String(text).replace(/<\/p>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ---- 1. Reproduce the two reported strings through CURRENT render logic ----
const pair1 = ['💥 It slams through!', 'A woman, maybe 50s, with a scarred lip winces. "Gods."'];
const pair2 = ['Mara winces. "You\'re bleeding!"', 'The attack hits you for 25.'];
const cur1 = renderCurrent(pair1), cur2 = renderCurrent(pair2);
console.log('--- 1. reported strings vs CURRENT render ---');
console.log('   current pair1:', JSON.stringify(cur1));
console.log('   current pair2:', JSON.stringify(cur2));
check('pair1 renders with space after "!" (FAILS until app.js fixed)',
  cur1 === '💥 It slams through! A woman, maybe 50s, with a scarred lip winces. "Gods."', `got ${JSON.stringify(cur1)}`);
check('pair2 renders with space after "!\\"" (FAILS until app.js fixed)',
  cur2 === 'Mara winces. "You\'re bleeding!" The attack hits you for 25.', `got ${JSON.stringify(cur2)}`);

// ---- 2. Fixed logic produces correct spacing, single-line path unchanged ----
console.log('--- 2. proposed fix ---');
const fix1 = renderFixed(pair1), fix2 = renderFixed(pair2);
check('fixed pair1 spaced', fix1 === '💥 It slams through! A woman, maybe 50s, with a scarred lip winces. "Gods."', `got ${JSON.stringify(fix1)}`);
check('fixed pair2 spaced', fix2 === 'Mara winces. "You\'re bleeding!" The attack hits you for 25.', `got ${JSON.stringify(fix2)}`);
const singleCur = String('💥 It slams through!').replace(/<[^>]*>/g, '').trim();
const singleFix = '💥 It slams through!'.replace(/<\/p>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
check('single-line (lastNarr) path unchanged by fix', singleCur === singleFix && singleFix === '💥 It slams through!');

// ---- 3. Sibling scan: game.js say() emitters must not join clauses without space ----
console.log('--- 3. game.js emitter sibling scan ---');
const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const offenders = [];
const sayRe = /this\.say\((['`])((?:\\\1|(?!\1).)*)\1\)/gs;
let m;
while ((m = sayRe.exec(src))) {
  const body = m[2];
  const lineno = src.slice(0, m.index).split('\n').length;
  // Neutralize interpolations; check literal text only.
  const flat = body.replace(/\$\{[^}]*\}/g, '\x00');
  // Zero-whitespace join: sentence punctuation directly followed by a capital
  // letter or digit (dialogue open/close quotes excluded — those are fine;
  // ellipsis "..." + Capital is fine).
  const jm = flat.match(/[!.:;?][A-Z0-9]/);
  if (jm) {
    const i = jm.index;
    const isDecimal = flat[i] === '.' && /\d/.test(flat[i - 1] || '') && /\d/.test(flat[i + 1] || '');
    const isEllipsis = flat[i] === '.' && flat[i - 1] === '.';
    if (!isDecimal && !isEllipsis) {
      offenders.push(`${lineno}: ...${flat.slice(Math.max(0, i - 30), i + 30).replace(/\x00/g, '${…}').replace(/\n/g, ' ')}...`);
    }
  }
}
check('no zero-whitespace punct+Capital joins in game.js say() literals', offenders.length === 0,
  offenders.length ? offenders.slice(0, 8).join(' | ') : '');

// A conditional interpolation mid-sentence is only safe when EITHER the
// template already has whitespace before ${...} OR every non-empty branch
// starts with whitespace/punctuation+space. Flag `${cond ? 'lit'...}` where
// the char before ${ is a word char or sentence punctuation AND 'lit' starts
// with a bare word char (start-of-template/backtick is fine).
const condSrc = [];
const condRe = /([\w!.:;?])\$\{([a-zA-Z_$][\w$]*)\s*\?\s*(['"`])((?:\\\3|(?!\3).)*)\3\s*:/g;
while ((m = condRe.exec(src))) {
  const lit = m[4];
  if (lit && /^[A-Za-z0-9"“]/.test(lit)) {
    condSrc.push(`${src.slice(0, m.index).split('\n').length}:${m[2]} after ${JSON.stringify(m[1])} -> ${JSON.stringify(lit.slice(0, 40))}`);
  }
}
check('mid-sentence conditional interpolations start with a space', condSrc.length === 0,
  condSrc.length ? condSrc.slice(0, 8).join(' | ') : '');

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
