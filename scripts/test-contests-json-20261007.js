#!/usr/bin/env node
// VERIFICATION (Steve 2026-10-07): contests.json migration.
// Confirms the extracted JSON is byte-identical in content to the
// original inline JS pool definitions.
//
// Run: node scripts/test-contests-json-20261007.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('Contests JSON migration verification:');

// 1. Load the JSON file
const jsonPath = path.join(ROOT, 'src/data/contests.json');
const fromJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
check('contests.json is valid JSON', Array.isArray(fromJson));
check('contests.json has 44 contests', fromJson.length === 44, `got ${fromJson.length}`);

// 2. Extract the ORIGINAL pool from git HEAD's contests.js and compare
// (HEAD has the inline definitions; worktree has the data-driven version)
// NOTE: HEAD has 38 contests (sibling added 6 more in worktree). We verify
// the 38 HEAD contests are all present and identical in the JSON.
const headJs = execSync('git show HEAD:src/js/contests.js', { cwd: ROOT, encoding: 'utf8' });
const headLines = headJs.split('\n');
const headStart = headLines.findIndex(l => l.includes('G.contestPool = function()'));
// Find the closing "];" of the return array, then the "};" of the function
let depth = 0, arrEnd = -1;
for (let i = headStart; i < headLines.length; i++) {
  const line = headLines[i];
  // crude bracket matching on the return statement
  if (i === headStart) continue;
  for (const ch of line) {
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) { arrEnd = i; break; }
    }
  }
  if (arrEnd !== -1) break;
  // the return [ opens the array
  if (line.includes('return [')) depth = 1;
}
const arrSrc = headLines.slice(headStart, arrEnd + 1).join('\n')
  .replace(/^[\s\S]*?return\s*\[/, '[');
const fromHead = eval(arrSrc);

check('HEAD pool extracted', Array.isArray(fromHead), `got ${typeof fromHead}`);
// Every HEAD contest must exist in JSON with identical content
let mismatches = [];
for (const h of fromHead) {
  const j = fromJson.find(c => c.id === h.id);
  if (!j) { mismatches.push(`missing in JSON: ${h.id}`); continue; }
  if (JSON.stringify(h) !== JSON.stringify(j)) {
    mismatches.push(`content mismatch: ${h.id}`);
  }
}
check('all HEAD contests present and identical in JSON', mismatches.length === 0,
  mismatches.slice(0, 5).join('; '));
check('JSON is superset (has sibling\'s 6 new contests)',
  fromJson.length >= fromHead.length,
  `HEAD=${fromHead.length} JSON=${fromJson.length}`);

// 4. Verify arena art preserved exactly (spot-check the trickiest ones)
// Use contests present in both HEAD and JSON. tidepool is sibling's new
// contest (not in HEAD), so we check it against the worktree extraction.
const pitJson = fromJson.find(c => c.id === 'pit');
const pitHead = fromHead.find(c => c.id === 'pit');
check('pit arena art identical', pitJson.arena === pitHead.arena);

const auctionJson = fromJson.find(c => c.id === 'auction');
const auctionHead = fromHead.find(c => c.id === 'auction');
check('auction arena art identical', auctionJson.arena === auctionHead.arena);
check('auction desc identical', auctionJson.desc === auctionHead.desc);

// 5. Verify contestPool() reads from data
const worktreeJs = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
check('contestPool reads this.data.contests',
  worktreeJs.includes('return (this.data && this.data.contests) || [];'));
check('no inline contest definitions remain',
  !worktreeJs.includes("{ id: 'pit'"));

// 6. Verify game.js loads contests.json
const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
check('game.js fetches contests.json', gameJs.includes("'contests.json'"));
check('game.js destructures contests', gameJs.includes(', contests] = await Promise.all'));
check('game.js adds contests to this.data', gameJs.includes('monsterBehaviors, contests };'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
