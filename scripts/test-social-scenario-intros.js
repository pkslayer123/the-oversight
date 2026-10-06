// SCAN (bug class: debug coaching in scenario intros): the debug-scenario
// setup text coaches mechanics ("Bad liars slip: the story changes",
// "Tap a tile on the minimap...", "Running is the intended move") — the same
// class Steve flagged 2026-10-05 ("debug scenarios no longer coach tactics
// in setup text"). Setup may set the scene; it must not teach the systems.
// This scan lists every 🐞 SCENARIO intro and fails on coaching verbs.
// Usage: node scripts/test-social-scenario-intros.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'src/js/debug-scenarios.js'), 'utf8');
const COACH_RE = /tap a|you should|the intended move|press them|flip the weakest|examine the site|name witnesses|call witnesses|watch what happens|bad liars slip|then ask again|follow the food/i;
let fail = 0;
const lines = src.split('\n');
const introBlocks = [];
let cur = null;
for (const l of lines) {
  const m = l.match(/Game\.say\('🐞 SCENARIO: (.*?)'\)/);
  if (m) { cur = { title: m[1], body: [] }; introBlocks.push(cur); continue; }
  const m2 = cur && l.match(/Game\.say\('(.*?)'\)/);
  if (cur && m2 && !/🐞/.test(m2[1])) cur.body.push(m2[1]);
  if (cur && /^\s*\},?\s*$/.test(l) && cur.body.length > 6) cur = null;
}
for (const b of introBlocks) {
  const text = b.title + ' ' + b.body.join(' ');
  const hits = [];
  let mm;
  const re = new RegExp(COACH_RE.source, 'gi');
  while ((mm = re.exec(text))) hits.push(mm[0]);
  if (hits.length) {
    fail++;
    console.log(`FAIL "${b.title.slice(0, 60)}..." coaches: ${[...new Set(hits)].join(' | ')}`);
  }
}
console.log(fail ? `\n${fail} coaching intros` : '\nALL PASS: no coaching in scenario intros');
process.exit(fail ? 1 : 0);
