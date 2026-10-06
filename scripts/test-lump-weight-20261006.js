#!/usr/bin/env node
// PROOF TEST (forager loop 2026-10-06): the unknown-lump weight bug.
// BEFORE: addUnknownToLump stored the TOTAL weight (units*0.1) in the
// per-unit kg field, so packWeight (which sums units*kg) counted the lump
// at 0.1*N^2 kg — a 12-unit lump weighed 14.4kg and the forager's pack
// filled in two sweeps.
// AFTER: lump kg is per-unit (0.1), like every other food item.
// Run: node scripts/test-lump-weight-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let fails = 0;
const check = (name, cond) => { console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}`); if (!cond) fails++; };

(async () => {
  await Game.init();
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.inventory.length = 0; // empty pack: isolate the lump
  const waterKg0 = Game.packWeight(); // baseline: starting water containers
  console.log(`   pack baseline (water): ${waterKg0.toFixed(2)} kg`);
  const plant = Game.data.plants.find(p => p.id === 'blackberry') || Game.data.plants[0];
  Game.addUnknownToLump(plant, 12, s.day);
  const lump = s.inventory.find(i => i.lumpForm);
  check('lump holds 12 units', lump && lump.units === 12);
  check('lump kg is per-unit (0.1), not the total', lump && Math.abs(lump.kg - 0.1) < 1e-9);
  const w = Game.packWeight() - waterKg0;
  console.log(`   12-unit lump weighs ${w.toFixed(2)} kg (buggy build: 14.40 kg)`);
  check('12-unit lump weighs 1.2kg, not 14.4kg', Math.abs(w - 1.2) < 0.01);
  // more units stay linear, not quadratic
  Game.addUnknownToLump(plant, 12, s.day);
  const w2 = Game.packWeight() - waterKg0;
  console.log(`   24-unit lump weighs ${w2.toFixed(2)} kg (buggy build: 57.60 kg)`);
  check('24-unit lump weighs 2.4kg (linear)', Math.abs(w2 - 2.4) < 0.01);
  // a forager morning: 30 raw units still leaves pack room
  check('30 lumped units fit a 20kg pack with room to spare', Game.canCarry(5));
  // SIBLING 1: splitLumpOut must not reintroduce the quadratic weight
  Game.state.codex.plants[plant.id] = { level: 2, identifiedDay: s.day };
  const before = Game.packWeight();
  Game.splitLumpOut(lump, plant.id);
  const afterSplit = s.inventory.find(i => i.lumpForm);
  check('split remainder keeps per-unit kg', !afterSplit || Math.abs(afterSplit.kg - 0.1) < 1e-9);
  // SIBLING 2: stageForPrep (homecoming) merges pack lumps into the stash
  // lump — the merge must not reintroduce the quadratic weight.
  s.inventory.length = 0;
  const stash2 = Game.prepStash();
  stash2.length = 0;
  Game.addUnknownToLump(plant, 10, s.day, stash2); // existing stash lump
  Game.addUnknownToLump(plant, 10, s.day);          // pack lump (unprocessed)
  Game.stageForPrep();
  const merged = stash2.find(i => i.lumpForm);
  const packLeft = s.inventory.find(i => i.lumpForm);
  console.log(`   merged lump: ${merged ? merged.units : '?'} units @kg=${merged && merged.kg}; pack lump remaining: ${packLeft ? 'yes' : 'no'}`);
  check('stageForPrep merges the pack lump into the stash', !packLeft && merged && merged.units === 20);
  check('merged 20-unit lump weighs 2.0kg (per-unit kg)', merged && Math.abs(merged.units * merged.kg - 2.0) < 0.01);
  if (fails) { console.log(`\n${fails} FAIL`); process.exitCode = 1; }
  else console.log('\nall pass');
})();
