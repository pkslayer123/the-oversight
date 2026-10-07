#!/usr/bin/env node
// STRUCTURAL REGRESSION GUARD (Steve 2026-10-07):
// "If you don't know, it doesn't show."
//
// This test guards against stale-base reverts of knowledge gating.
// It asserts the INVARIANT directly, not just behavior — if someone
// reverts the gating code, this fails loudly.
//
// The invariant: crimes with witnessed === false must NEVER appear
// in confrontation voice. They stay on the books (for detective/moot)
// but the voice only names what was witnessed.
//
// This is a STATIC test — it reads the source and asserts the gating
// logic exists. It cannot be fooled by a behavioral test that happens
// to pass on a reverted tree.

const fs = require('fs');
const path = require('path');

const justicePath = path.join(__dirname, '..', 'src/js/justice.js');
const src = fs.readFileSync(process.env.JUSTICEJS || justicePath, 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('Justice knowledge-gating structural guard:');

// 1. The witnessed filter must exist
check(
  'witnessed filter exists',
  src.includes('c.witnessed !== false'),
  'confrontation voice must filter unwitnessed crimes'
);

// 2. The filter must be applied to crimes before counting
// (not just defined — actually used for murders/attacks/thefts)
const filterIdx = src.indexOf('c.witnessed !== false');
const murdersIdx = src.indexOf("known.filter(c => c.type === 'murder')");
check(
  'filter applied before murder count',
  filterIdx !== -1 && murdersIdx !== -1 && filterIdx < murdersIdx,
  'witnessed filter must precede crime counting'
);

// 3. Raw crimes array must NOT be used directly for voice counts
// (if someone reverts to crimes.filter, this catches it)
const rawMurders = src.includes("crimes.filter(c => c.type === 'murder')");
check(
  'no raw crimes.filter for murder voice',
  !rawMurders,
  'revert detected: using unwitnessed crimes in voice'
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
