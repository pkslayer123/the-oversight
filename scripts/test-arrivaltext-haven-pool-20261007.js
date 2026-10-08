#!/usr/bin/env node
// TEST (2026-10-07): arrivalText.json haven pool + tile contract.
// Regression: explorer-curiosity 2026-10-07 found ARRIVAL.haven had exactly
// 1 text while every other tile type had 6 — the most-repeated arrival in
// the game (homecoming) was wallpaper. Fixed: 5 more haven texts.
// Also guards the tile-shape contract: {title, texts:[]} per tile, ruin
// empty-by-design (ruinStory fills it), no template leaks / "undefined".
// Data-only — no game harness. Run: node scripts/test-arrivaltext-haven-pool-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/arrivalText.json'), 'utf8'));

let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

if (d._schema !== 'arrivalText/1') fail(`schema is ${JSON.stringify(d._schema)}, expected "arrivalText/1"`);
else ok('schema arrivalText/1');

const tiles = d.tiles || {};
for (const [type, entry] of Object.entries(tiles)) {
  if (typeof entry.title !== 'string' || !entry.title) { fail(`${type}: missing title`); continue; }
  if (!Array.isArray(entry.texts)) { fail(`${type}: texts is not an array`); continue; }
  if (type !== 'ruin' && entry.texts.length < 1) fail(`${type}: empty texts pool`);
  for (const t of entry.texts) {
    if (typeof t !== 'string' || !t.trim()) { fail(`${type}: empty/non-string text`); break; }
    if (/\{[^}]+\}/.test(t)) { fail(`${type}: template leak in "${t.slice(0, 50)}..."`); break; }
    if (/undefined|null/.test(t)) { fail(`${type}: literal undefined/null in "${t.slice(0, 50)}..."`); break; }
  }
}
ok('all tile entries have title + texts[]; non-ruin pools non-empty; no leaks');

const haven = tiles.haven;
if (!haven || haven.texts.length < 6) fail(`haven pool has ${haven ? haven.texts.length : 0} texts, want >= 6`);
else ok(`haven pool: ${haven.texts.length} texts (homecoming wallpaper fixed)`);
const uniq = new Set(haven ? haven.texts : []);
if (haven && uniq.size !== haven.texts.length) fail('haven pool has duplicate texts');
else ok('haven pool texts are unique');

// regionOverrides shape (empty today, but keep the contract honest)
const ro = d.regionOverrides || {};
if (typeof ro !== 'object') fail('regionOverrides is not an object');
else ok('regionOverrides present and object-shaped');

if (failures) { console.log(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL GREEN');
