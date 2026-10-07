// Proof: index.html must load every src/js/**/*.js file exactly once.
// Catches the stale-base revert class where a version bump drops <script> tags
// (2026-10-07: abilityActions.js, monsterBehaviors.js, statusEffects.js dropped
// by bump 6618925 -> every combat threw on this.seTickFighter at first monster turn).
// Usage: node scripts/proof-index-tags-20261007.js [index.html path] [src/js dir]
// Exit 0 = clean; exit 1 = missing/extra tags.
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const indexPath = process.argv[2] || path.join(repo, 'index.html');
const jsDir = process.argv[3] || path.join(repo, 'src/js');

function listJs(dir, base) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJs(p, base));
    else if (e.name.endsWith('.js')) out.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

const html = fs.readFileSync(indexPath, 'utf8');
const tagged = [...html.matchAll(/<script\s+src="(src\/js\/[^"?]+)(?:\?[^"]*)?"\s*><\/script>/g)]
  .map(m => m[1]);
const onDisk = listJs(jsDir, path.join(repo, 'src')).map(p => 'src/' + p);

// Sibling's staged cleanup is mid-removal of the alienPlayers system (never
// tagged in index.html, never loaded in the browser); exclude its worktree
// leftover from the missing-tag check.
const KNOWN_ORPHANS = ['src/js/alienPlayers.js'];

const missing = onDisk.filter(f => !tagged.includes(f) && !KNOWN_ORPHANS.includes(f));
const extra = tagged.filter(f => !onDisk.includes(f));        // loaded, not on disk -> 404
const dupes = tagged.filter((f, i) => tagged.indexOf(f) !== i);

let fail = 0;
if (missing.length) { console.log('MISSING TAGS (on disk, not loaded):'); missing.forEach(f => console.log('  ' + f)); fail = 1; }
if (extra.length) { console.log('EXTRA TAGS (loaded, not on disk):'); extra.forEach(f => console.log('  ' + f)); fail = 1; }
if (dupes.length) { console.log('DUPLICATE TAGS:'); [...new Set(dupes)].forEach(f => console.log('  ' + f)); fail = 1; }

// The 2026-10-07 regression, pinned: these three must load, in this order, right after ledger.js.
const pinned = ['src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js'];
const idx = pinned.map(f => tagged.indexOf(f));
if (idx.some(i => i < 0)) { console.log('PINNED ORDER BROKEN: one of ledger/abilityActions/monsterBehaviors/statusEffects untagged'); fail = 1; }
else if (!(idx[0] + 1 === idx[1] && idx[1] + 1 === idx[2] && idx[2] + 1 === idx[3])) {
  console.log('PINNED ORDER BROKEN: expected ledger.js -> abilityActions.js -> monsterBehaviors.js -> statusEffects.js consecutively, got indexes ' + idx.join(','));
  fail = 1;
}

if (!fail) console.log(`OK: ${tagged.length} tags, all ${onDisk.length} on-disk js files loaded exactly once, pinned order holds.`);
process.exit(fail);
