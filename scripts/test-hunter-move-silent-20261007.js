#!/usr/bin/env node
// test-hunter-move-silent-20261007.js
//
// STEALTH.MOVE_SILENT WIRING PROOF — 2026-10-07 (flesh-out loop, move_silent job).
//
// WHAT THIS PROVES
//   The stalk passive `stealth.move_silent` (abilities.json, stalk modifiers,
//   add +0.3) is CONSUMED by the prey flee roll: preyReaction (src/js/food.js)
//   subtracts it from fleeP via this.modTarget('stealth.move_silent', 0, {}).
//   Before the wiring, abilityActions.js:699 claimed it "feeds the flee roll" —
//   that was aspirational (zero modTarget readers at HEAD). After the wiring,
//   holding stalk makes prey bolt significantly less often, over and above the
//   stalk action's aware-drop (that drop is deliberately NOT applied here —
//   aware is pinned at 0.8 in BOTH arms so the A/B isolates the passive).
//
// METHOD
//   Seeded A/B over the REAL preyReaction flee roll with IDENTICAL random
//   streams per arm (Math.random = mulberry32(seed) reset before each arm).
//   200 trials/arm: unarmed = no stalk held + aware 0.8; armed = stalk held
//   + aware 0.8. Each simulated bolt charges the real 50 kcal lunge cost, so
//   scholar kcal+energy are saved/restored around the A/B (harness trap from
//   verify-closeout-notes-20261007.md §3).
//
//   Runs 3 seeds by default ([7, 42, 99]); SEED env forces a single seed.
//   Point at a pristine tree with REPO_ROOT (defaults to the repo root that
//   contains this script). NEVER run against a dirty worktree copy.
//
// EXPECTED STATE (this test passes iff reality matches):
//   - stealth.move_silent is defined (stalk modifiers, value 0.3, flat no scaling)
//   - modTarget('stealth.move_silent', 0, {}) === 0.3 when stalk held, 0 without
//   - armed arm bolts significantly less than unarmed (margin 15/200)
//   - s.stalkActive === undefined (honest removal from cf3049d, still true)
//
// WHEN THIS TEST FLIPS RED (exit 1), READ THIS:
//   1. The A/B margin flipped -> the flee roll changed: read the failure line,
//      check git log on src/js/food.js preyReaction, re-run with SEED=7 to
//      reproduce. Do NOT relax the margin without a design sign-off.
//   2. "not defined in abilities.json" -> a sibling reverted the stalk entry;
//      investigate before touching EXPECT.
//   3. "not consumed by any modTarget call" -> a sibling reverted the wiring;
//      same investigation. The static consumer scan is the same sweep as
//      test-hunter-dead-modifiers-20261007.js (keep both in sync).
//
// Exit 0: all seeds green. Exit 1: any seed failed (see messages).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const SEEDS = process.env.SEED ? [parseInt(process.env.SEED, 10)] : [7, 42, 99];
const TRIALS = 200;
const MARGIN = 15; // armed must bolt at least this many fewer than unarmed (200 trials)

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// data fetch: the engine loads JSON via fetch()
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});

// Full harness module list: every src/js/*.js in index.html order, MINUS the
// DOM-only modules. Stub window ONLY for the eval phase, then delete it before
// playing — a window stub flips combat to the async path and stalls fights.
const order = [...new Set(
  [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .matchAll(/src\/js\/[A-Za-z0-9\/._-]+\.js/g)].map(m => m[0])
)].filter(s => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // eval phase only
order.forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log('LOAD FAIL ' + f + ': ' + e.message); process.exit(2); }
});
delete global.window;

const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function note(t) { console.log(t); }
function check(seed, name, cond, detail) {
  const tag = cond ? '  ok   ' : '  FAIL ';
  note(`${tag}[seed ${seed}] ${name}${detail ? ' -- ' + detail : ''}`);
  if (cond) pass++; else fail++;
}

// Static consumer scan: modTarget('<target>' | "<target>" | `<target>` in
// src/js, excluding the engine resolver itself and line-commented mentions.
// (Same sweep method as test-hunter-dead-modifiers-20261007.js.)
function findConsumers(target) {
  const hits = [];
  const esc = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('modTarget\\(\\s*["\'`]' + esc + '["\'`]');
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js') || /engine[\\/]modifiers\.js$/.test(p)) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((ln, i) => {
        const m = re.exec(ln);
        if (m && !ln.slice(0, m.index).includes('//'))
          hits.push(path.relative(ROOT, p) + ':' + (i + 1));
      });
    }
  };
  walk(path.join(ROOT, 'src', 'js'));
  return hits;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 3000; s.hydration = 80; s.energy = 100;
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  // daytime (dayPart 1): no night-hide bonus, so both arms face the same roll
  Game.state.village.day = 20; Game.state.scholar.day = 20; Game.dayPart = 1;

  function grant(id, level) {
    s.abilities = s.abilities || [];
    let e = s.abilities.find(a => a.id === id);
    if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
    else e.level = level || e.level || 1;
    return e;
  }
  function strip(id) {
    const had = (s.abilities || []).find(a => a.id === id);
    s.abilities = (s.abilities || []).filter(a => a.id !== id);
    return had;
  }
  function restore(had) {
    if (had && !(s.abilities || []).find(a => a.id === had.id))
      s.abilities = (s.abilities || []).concat([had]);
  }

  // 200 seeded flee rolls; aware pinned 0.8 in BOTH arms (isolates the passive,
  // not the stalk action's aware-drop). Returns bolt count.
  function boltCount(trials) {
    let bolts = 0;
    for (let i = 0; i < trials; i++) {
      const a = { id: 'wild_turkey', mx: 5, my: 5, aware: 0.8, stamina: 3, pstate: 'wary', edgeTurns: 0 };
      if (Game.preyReaction(a)) bolts++;
    }
    return bolts;
  }

  for (const seed of SEEDS) {
    note(`\n=== seed ${seed} (tree: ${ROOT}) ===`);

    // --- static pins (same every seed) ---
    check(seed, 'stalkActive flag is GONE (honest removal, cf3049d)', s.stalkActive === undefined);
    const abilities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'abilities.json'), 'utf8'));
    const stalk = abilities.find(a => a.id === 'stalk');
    const ms = (stalk && stalk.modifiers || []).find(m => m.target === 'stealth.move_silent');
    check(seed, 'stealth.move_silent DEFINED in abilities.json under stalk',
      !!(ms && ms.op === 'add'), ms ? JSON.stringify(ms) : 'stalk entry/missing');
    check(seed, 'pipeline value pinned at 0.3 (flat, no level scaling)',
      ms && Math.abs(ms.value - 0.3) < 1e-9 && !ms.scale, ms ? `value=${ms.value} scale=${ms.scale || '(none)'}` : 'n/a');

    // --- live pipeline pins ---
    strip('stalk');
    const vNoStalk = Game.modTarget('stealth.move_silent', 0, {});
    check(seed, "modTarget('stealth.move_silent', 0, {}) === 0 with no stalk held",
      vNoStalk === 0, `got ${vNoStalk}`);
    grant('stalk', 2);
    const vStalk = Game.modTarget('stealth.move_silent', 0, {});
    check(seed, 'modTarget === 0.3 when stalk held (L2: flat, no scaling)',
      Math.abs(vStalk - 0.3) < 1e-9, `got ${vStalk}`);
    const consumers = findConsumers('stealth.move_silent');
    check(seed, 'stealth.move_silent CONSUMED by a modTarget call (not aspirational)',
      consumers.length > 0, consumers.join(', ') || '(none)');

    // --- stalk A/B: identical random streams, only the passive differs ---
    const kSave = s.kcal, eSave = s.energy; // bolts charge the real 50 kcal lunge
    strip('stalk');
    Math.random = mulberry32(seed);
    const unarmed = boltCount(TRIALS);
    grant('stalk', 2);
    Math.random = mulberry32(seed); // identical stream: only move_silent differs
    const armed = boltCount(TRIALS);
    s.kcal = kSave; s.energy = eSave; // restore: the kcal cost is real
    note(`   bolts unarmed: ${unarmed}/${TRIALS}, stalk-held: ${armed}/${TRIALS}`);
    check(seed, 'preyReaction roll is live (unarmed wary animal still bolts)',
      unarmed > 20, `${unarmed}/${TRIALS}`);
    check(seed, `move_silent shaves the bolt chance (armed <= unarmed - ${MARGIN})`,
      armed <= unarmed - MARGIN, `armed=${armed} unarmed=${unarmed}`);
  }

  note(`\n${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL: ' + (e && e.stack || e)); process.exit(2); });
