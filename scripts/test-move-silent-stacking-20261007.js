#!/usr/bin/env node
// test-move-silent-stacking-20261007.js
//
// MOVE_SILENT STACKING BALANCE MEASUREMENT — 2026-10-07 (flesh-out loop).
//
// MEASUREMENT ONLY (report-only). No numbers change; no assertions about
// "correct" values. This exists so Steve can make the balance call with data.
//
// WHAT: seeded A/B/C over the REAL preyReaction flee roll (src/js/food.js),
// identical mulberry32 random streams per arm per seed. Arms:
//   baseline         — no stalk held, no stalk action; aware = pin level
//   stalk-only       — stalk ACTION's aware-drop applied (aware -> 0.2) but the
//                      stalk PASSIVE zeroed (synthetic counterfactual: the
//                      pre-f659485 wiring plus the old stalk action)
//   stalk+move_silent— stalk action aware-drop + stalk held (passive +0.3):
//                      the live behavior after f659485
//
// aware sweep: 0.8 (noticed something), 0.6 (wary baseline — preyReaction's
// "struck at unawares" default), 0.95 (it saw you: fleeP base 1, subtractions
// still apply). Close range every trial (turkey at 5,5; scholar at 4,4 =>
// dist 1, -0.10 point-blank modifier). 200 trials/arm, 3 seeds [7,42,99]
// (same seeds as the 21:50 closeout A/B for comparability).
//
// METHOD (same as evidence/2026-10-07/move-silent-notes-20261007.md): pristine
// git-archive extract via REPO_ROOT; full harness module list in index.html
// order minus app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js;
// global.window = global stubbed for the eval phase only, deleted before
// playing; kcal+energy saved/restored around trials (each bolt charges the
// real 50 kcal lunge).
//
// Exit 0 always on successful measurement (this is not a pass/fail gate).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const SEEDS = process.env.SEED ? [parseInt(process.env.SEED, 10)] : [7, 42, 99];
const TRIALS = 200;
const AWARES = [0.8, 0.6, 0.95];

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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 3000; s.hydration = 80; s.energy = 100;
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  Game.state.village.day = 20; Game.state.scholar.day = 20; Game.dayPart = 1;

  const villager = (Game.data.villagers || []).find(v => v.id === Game.villagerId);
  console.log('villager:', villager ? villager.id + ' / ' + (villager.formerOccupation || '(no occupation)') : '(none)');

  function grant(id, level) {
    s.abilities = s.abilities || [];
    let e = s.abilities.find(a => a.id === id);
    if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
    else e.level = level || e.level || 1;
  }
  function strip(id) {
    s.abilities = (s.abilities || []).filter(a => a.id !== id);
  }

  // 200 seeded flee rolls at a pinned aware level; close range (dist 1).
  function boltCount(trials, aware) {
    let bolts = 0;
    for (let i = 0; i < trials; i++) {
      const a = { id: 'wild_turkey', mx: 5, my: 5, aware, stamina: 3, pstate: 'wary', edgeTurns: 0 };
      if (Game.preyReaction(a)) bolts++;
    }
    return bolts;
  }

  const results = {};
  for (const seed of SEEDS) {
    console.log(`\n=== seed ${seed} (tree: ${ROOT}) ===`);
    results[seed] = {};
    for (const pin of AWARES) {
      const kSave = s.kcal, eSave = s.energy;
      // baseline: no stalk held, no aware-drop
      strip('stalk');
      Math.random = mulberry32(seed);
      const base = boltCount(TRIALS, pin);
      // stalk-only: stalk action aware-drop (aware -> 0.2), passive zeroed
      strip('stalk');
      Math.random = mulberry32(seed);
      const stalkOnly = boltCount(TRIALS, Math.min(pin, 0.2));
      // stalk+move_silent: stalk action aware-drop + stalk held (passive +0.3)
      grant('stalk', 2);
      Math.random = mulberry32(seed);
      const stacked = boltCount(TRIALS, Math.min(pin, 0.2));
      s.kcal = kSave; s.energy = eSave;
      results[seed][pin] = { baseline: base, stalkOnly, stacked };
      console.log(`  aware=${pin}: baseline=${base}/${TRIALS}  stalk-only=${stalkOnly}/${TRIALS}  stalk+move_silent=${stacked}/${TRIALS}`);
    }
  }

  console.log('\n--- compact table (bolts/200) ---');
  console.log('seed | aware | baseline | stalk-only | stalk+move_silent');
  for (const seed of SEEDS) for (const pin of AWARES) {
    const r = results[seed][pin];
    console.log(`${seed}  | ${pin}   | ${r.baseline}       | ${r.stalkOnly}         | ${r.stacked}`);
  }
})().catch(e => { console.log('FATAL: ' + (e && e.stack || e)); process.exit(2); });
