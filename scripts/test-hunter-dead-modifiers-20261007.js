#!/usr/bin/env node
// test-hunter-dead-modifiers-20261007.js
//
// HUNTER DEAD-MODIFIER AUDIT — state snapshot, 2026-10-07 (flesh-out loop 2108 backlog).
//
// WHAT THIS DOCUMENTS
//   The 6 hunter modifier targets flagged dead in the 2108 run are NOT all in the
//   same state. Sibling commit cf3049d ("Hunter wiring", Steve 2026-10-05) HONESTLY
//   REMOVED 5 of them from the data files (no wounded-animal system and no
//   animal-intimidation pipeline exist anywhere, so the modifiers were aspirational
//   text). Only ONE remains defined-but-never-consumed:
//     - stealth.move_silent : DEFINED (stalk passive, src/data/abilities.json ~:1766,
//                             add +0.3) but ZERO modTarget() consumers in src/js.
//                             preyReaction (src/js/food.js:1198) computes the flee
//                             roll from tracker ability level, never from this target.
//                             (abilityActions.js:699 comment claims it feeds the flee
//                             roll — aspirational, not true at HEAD.)
//     - hunt.track_wounded, animal.behavior_read, hunt.wounded_find,
//       hunt.wounded_time, hunt.intimidate : ABSENT from data (removed cf3049d),
//       zero consumers. Not "dead" — gone.
//
// EXPECTED STATE (this test passes iff reality matches this table):
//   stealth.move_silent -> defined=true,  consumed=false   (status: dead)
//   the other five        -> defined=false, consumed=false   (status: removed)
//
// WHEN THIS TEST FLIPS RED (exit 1), READ THIS:
//   1. A wiring worker added a real modTarget('<target>', ...) consumer in src/js.
//      -> Update EXPECT below: set consumed:true for that target, note the file.
//      -> That is the test doing its job: the dead-set changed, the snapshot must too.
//   2. One of the five removed targets reappeared in src/data (defined=true).
//      -> Either it was re-added with a real consumer (update EXPECT to consumed),
//         or someone re-added a dead modifier (remove it again, or wire it).
//   3. A positive control stopped being consumed.
//      -> The sweep may be blind (grep pattern broke) OR a sibling reverted the
//         wiring. Investigate before touching EXPECT.
//
// POSITIVE CONTROLS (prove the sweep is not blind):
//   hunt.first_shot_damage MUST be consumed (src/js/game.js:19183, clean_shot path,
//   wired by cf3049d — the canonical example of what "consumed" looks like).
//   hunt.meat_yield MUST be consumed (abilityActions.js, encounters.js, game.js).
//
// METHOD: static text sweep over pristine HEAD bytes. Deterministic by construction —
// no RNG, no game state, no Math.random. Accepts SEED env (ignored) so loop runners
// can invoke it as `SEED=1 node ...`, `SEED=2 node ...` identically.
// Point it at a pristine tree with HUNTERMOD_ROOT (defaults to the repo root that
// contains this script). NEVER run the sweep against a dirty worktree copy —
// uncommitted sibling edits will skew the definition/consumption lists.
//
// Exit 0: state matches EXPECT. Exit 1: state drifted (see messages).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.HUNTERMOD_ROOT || path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DATA_DIR = path.join(SRC, 'data');
const JS_DIR = path.join(SRC, 'js');

// The six 2108-backlog targets + their expected 2026-10-07 state.
const EXPECT = {
  'stealth.move_silent': { defined: true,  consumed: false, status: 'dead',
    note: 'stalk passive add +0.3 (abilities.json:1766); no consumer' },
  'hunt.track_wounded':  { defined: false, consumed: false, status: 'removed',
    note: 'honestly removed cf3049d (was blood_trail add +0.5)' },
  'animal.behavior_read': { defined: false, consumed: false, status: 'removed',
    note: 'honestly removed cf3049d (was animal_ken add +0.4)' },
  'hunt.wounded_find':   { defined: false, consumed: false, status: 'removed',
    note: 'honestly removed cf3049d (was blood_tracker synergy add +0.8)' },
  'hunt.wounded_time':   { defined: false, consumed: false, status: 'removed',
    note: 'honestly removed cf3049d (was blood_tracker synergy multiply x0.5)' },
  'hunt.intimidate':     { defined: false, consumed: false, status: 'removed',
    note: 'honestly removed cf3049d (was apex_predator synergy add +0.5)' },
};

// Positive controls: must be consumed, or the sweep itself is broken.
const CONTROLS = ['hunt.first_shot_damage', 'hunt.meat_yield'];

function walk(dir, ext, skipDirs) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs && skipDirs.test(p)) continue;
      out.push(...walk(p, ext, skipDirs));
    } else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const rel = p => path.relative(ROOT, p);

// Definition: a "target": "<t>" entry in a src/data JSON file.
function findDefinitions(target) {
  const hits = [];
  const re = new RegExp('"target"\\s*:\\s*"' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
  for (const f of walk(DATA_DIR, '.json', /_archive/)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, i) => { if (re.test(ln)) hits.push(`${rel(f)}:${i + 1}`); });
  }
  return hits;
}

// Consumption: a modTarget('<t>' | "<t>" | `<t>` call in src/js, excluding the
// engine resolver itself (engine/modifiers.js only resolves; it consumes nothing)
// and line comments (a comment mentioning the call form is not a consumer).
function findConsumers(target) {
  const hits = [];
  const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('modTarget\\(\\s*["\'`]' + esc + '["\'`]');
  for (const f of walk(JS_DIR, '.js', null)) {
    if (/engine[\\/]modifiers\.js$/.test(f)) continue; // resolver, not consumer
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const m = re.exec(ln);
      if (!m) return;
      const before = ln.slice(0, m.index);
      if (before.includes('//')) return; // line-commented, not a consumer
      hits.push(`${rel(f)}:${i + 1}`);
    });
  }
  return hits;
}

let failures = 0;
const say = s => console.log(s);

say('=== hunter dead-modifier audit (expectation snapshot 2026-10-07) ===');
say(`tree: ${ROOT}`);
for (const [target, exp] of Object.entries(EXPECT)) {
  const defs = findDefinitions(target);
  const cons = findConsumers(target);
  const actualDefined = defs.length > 0;
  const actualConsumed = cons.length > 0;
  const ok = actualDefined === exp.defined && actualConsumed === exp.consumed;
  if (!ok) failures++;
  say(`${ok ? 'PASS' : 'FAIL'} ${target}`);
  say(`     expected: defined=${exp.defined} consumed=${exp.consumed} [${exp.status}] — ${exp.note}`);
  say(`     actual:   defined=${actualDefined}${defs.length ? ' <- ' + defs.join(', ') : ''}`);
  say(`               consumed=${actualConsumed}${cons.length ? ' <- ' + cons.join(', ') : ''}`);
}

say('--- positive controls (sweep sanity) ---');
for (const t of CONTROLS) {
  const cons = findConsumers(t);
  const ok = cons.length > 0;
  if (!ok) failures++;
  say(`${ok ? 'PASS' : 'FAIL'} control ${t} consumed <- ${cons.join(', ') || '(NONE — SWEEP BLIND OR WIRING REVERTED)'}`);
}

say(failures === 0
  ? '\nRESULT: PASS — dead-set matches the 2026-10-07 snapshot (1 dead, 5 removed).'
  : `\nRESULT: FAIL — ${failures} expectation(s) drifted. Read the file header before updating EXPECT.`);
process.exit(failures === 0 ? 0 : 1);
