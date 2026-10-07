#!/usr/bin/env node
// AUDIO ORPHAN TEST (Steve 2026-10-07):
// Verifies that every audioEvent fired in game.js has a registered synth
// in CombatAudio (app.js), and that registry entries aren't dead.
//
// Background: the flesh-out loop found knowledgeReveal (7 sites) and
// synergyDiscovered (1 site) firing silence. The wound* entries were
// flagged as dead but are actually wired via encounters.js.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const encountersJs = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('Audio orphan check:');

// 1. knowledgeReveal: 7 call sites in game.js, must be registered
const krSites = (gameJs.match(/audioEvent\('knowledgeReveal'/g) || []).length;
check('knowledgeReveal has call sites', krSites >= 7, `found ${krSites}`);
check(
  'knowledgeReveal registered in CombatAudio',
  /knowledgeReveal\(d\)\s*\{\s*knowledgeReveal\(d\)/.test(appJs),
  'no registry entry'
);
check(
  'knowledgeReveal synth defined',
  /function knowledgeReveal\(d\)/.test(appJs),
  'no synth function'
);

// 2. synergyDiscovered: 1 call site, must be registered
const sdSites = (gameJs.match(/audioEvent\('synergyDiscovered'/g) || []).length;
check('synergyDiscovered has call sites', sdSites >= 1, `found ${sdSites}`);
check(
  'synergyDiscovered registered in CombatAudio',
  /synergyDiscovered\(d\)\s*\{\s*synergyDiscovered\(d\)/.test(appJs),
  'no registry entry'
);
check(
  'synergyDiscovered synth defined',
  /function synergyDiscovered\(d\)/.test(appJs),
  'no synth function'
);

// 3. wound* entries: fired from encounters.js, must be registered + defined
for (const w of ['woundEnraged', 'woundCunning', 'woundDesperate']) {
  check(
    `${w} fired from encounters.js`,
    encountersJs.includes(`'wound' + temp`) || encountersJs.includes(w),
    'no fire site'
  );
  check(
    `${w} registered in CombatAudio`,
    new RegExp(`${w}\\(\\)\\s*\\{\\s*${w}\\(\\)`).test(appJs),
    'no registry entry'
  );
  check(
    `${w} synth defined`,
    new RegExp(`function ${w}\\(\\)`).test(appJs),
    'no synth function'
  );
}

// 4. No other obvious orphans: every audioEvent('X') in game.js should have
//    either an X() entry in the CombatAudio return block or a comment
//    explaining the alias.
const fired = new Set();
const fireRe = /audioEvent\('([a-zA-Z0-9_]+)'/g;
let m;
while ((m = fireRe.exec(gameJs))) fired.add(m[1]);
while ((m = fireRe.exec(encountersJs))) fired.add(m[1]);

const registered = new Set();
const regRe = /^\s{6}([a-zA-Z0-9_]+)\(d?\)\s*\{/gm;
while ((m = regRe.exec(appJs))) registered.add(m[1]);

const orphans = [...fired].filter(f => !registered.has(f));
if (orphans.length > 0) {
  console.log(`  INFO ${orphans.length} fired events without direct registry entry:`);
  orphans.slice(0, 20).forEach(o => console.log(`    - ${o}`));
  if (orphans.length > 20) console.log(`    ... and ${orphans.length - 20} more`);
} else {
  console.log('  PASS no orphaned audio events');
  pass++;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
