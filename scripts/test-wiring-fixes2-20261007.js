#!/usr/bin/env node
// Proof test for wiring backlog fixes (Steve 2026-10-07 Priority 1)
// 1. Hummice aggroAudio: 'humRise' not deerAggro fallback
// 2. Burst telegraph re-center: tbRecenterBurst exists and works
// 3. AntlerThrash double-run: inline branch removed, hook owns it
// 4. Dead m.gwDive: removed
// 5. Dead D.audioFor: removed
"use strict";

const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
let pass = 0, fail = 0;

function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// 1. Hummice aggroAudio
const monsters = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monsters.json'), 'utf8'));
const mons = Array.isArray(monsters) ? monsters : monsters.monsters;
const hummice = mons.find(m => m.id === 'hummice');
check('hummice has aggroAudio', !!(hummice && hummice.aggroAudio));
check('hummice aggroAudio is humRise (not deer fallback)', hummice && hummice.aggroAudio === 'humRise');

// 2. tbRecenterBurst helper exists
const gameJs = fs.readFileSync(path.join(repo, 'src/js/game.js'), 'utf8');
check('tbRecenterBurst method exists', gameJs.includes('tbRecenterBurst(m)'));
check('tbRecenterBurst recomputes cells', gameJs.includes('tg.cells = cells'));
check('tbRecenterBurst checks burst pattern', gameJs.includes("pat.type !== 'burst'"));

// 3. AntlerThrash: inline branch removed
check('inline antlerThrash branch removed', !gameJs.includes("if (isDeer && m.beamPhase !== 'firing') {\n        this.tbAntlerThrash(m);"));
check('hook ownership comment present', gameJs.includes('monsterBehaviors.js antlerThrash hook'));
check('mbRunPreTurn still called', gameJs.includes('this.mbRunPreTurn(m)'));

// 4. Dead m.gwDive removed
check('m.gwDive write removed', !gameJs.includes('m.gwDive = null'));
check('m.gwDive not read anywhere', !gameJs.match(/m\.gwDive[^=]/));

// 5. Dead D.audioFor removed
check('D.audioFor call removed', !gameJs.includes('D.audioFor('));
check('removal comment present', gameJs.includes('D.audioFor was dead code'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
