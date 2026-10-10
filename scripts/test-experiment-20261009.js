#!/usr/bin/env node
// EXPERIMENT (Steve 2026-10-09): foraged stuff is experimentable — a nibble
// teaches CALORIE knowledge (how filling) and SICKNESS knowledge (does the
// body object) WITHOUT naming the plant. The nibble bridges into the full
// cautious test (risk x0.85^n, shorter waits).
//
// Asserts:
//   E1. Nibble on a safe unknown plant grants calSense + riskSense, real kcal,
//       consumes 1 unit, never identifies (level stays 0, name never spoken).
//   E2. Fifth nibble refused — nibbling teaches all it can.
//   E3. Avoid-plant nibble can teach 'dangerous' (bad roll) without naming.
//   E4. Bridge: testCautiously after experiments says the bridge line
//       (shorter waits, steadier stomach).
//   E5. K0 honesty: the L0 entry never surfaces in codexEntries with a name.
//
// Usage: node scripts/test-experiment-20261009.js
//        SEED=7 node scripts/test-experiment-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  return Game.state.scholar;
}
function plantDef(id) { return Game.data.plants.find(p => p.id === id); }
// Pick a plant of the given edibility that this run's character does NOT
// already know (backgrounds grant common plants on some seeds — the game
// then honestly refuses to experiment, which is correct behavior).
function unknownPlant(ed) {
  const c = Game.data.plants.find(p => (p.edibility || 'safe') === ed && !Game.plantKnown(p.id));
  if (!c) throw new Error('no unknown ' + ed + ' plant');
  return c;
}
function addLump(pid, units) {
  const s = Game.state.scholar;
  Game.addUnknownToLump(plantDef(pid), units, s.day, s.inventory);
  return s.inventory.findIndex(i => i && i.lump);
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

  // ============ E1. safe nibble teaches without naming ============
  console.log('\n-- E1. nibble grants calorie + sickness knowledge, no ID --');
  {
    const s = freshGame();
    s.kcal = 0;
    const sp = unknownPlant('safe');
    const idx = addLump(sp.id, 5);
    const kcal0 = s.kcal;
    const expectKcal = Math.max(1, Math.round((sp.caloriesPerUnit || 0) * 0.25));
    says.length = 0;
    Game.experimentWith(idx, s.inventory);
    const entry = Game.state.codex.plants[sp.id] || {};
    ok('calSense recorded', !!entry.calSense, `calSense=${entry.calSense}`);
    ok('riskSense recorded', entry.riskSense === 'seems-safe', `riskSense=${entry.riskSense}`);
    ok('level stays 0 (not identified)', (entry.level || 0) === 0 && !Game.plantKnown(sp.id), `level=${entry.level}`);
    ok('real kcal granted (quarter unit)', s.kcal === kcal0 + expectKcal, `kcal=${s.kcal} expect=${expectKcal}`);
    ok('one unit consumed', Game.state.scholar.inventory[idx].units === 4, `units=${Game.state.scholar.inventory[idx] && Game.state.scholar.inventory[idx].units}`);
    ok('name never spoken', !says.some(t => new RegExp(sp.name, 'i').test(t)), says.join(' | ').slice(0, 200));
    ok('experiment counted', entry.experiments === 1, `experiments=${entry.experiments}`);
  }

  // ============ E2. nibbling caps at 4 ============
  console.log('\n-- E2. fifth nibble refused --');
  {
    const s = freshGame();
    const sp = unknownPlant('safe');
    const idx = addLump(sp.id, 10);
    for (let i = 0; i < 4; i++) Game.experimentWith(Game.state.scholar.inventory.findIndex(x => x && x.lump), s.inventory);
    const entry = Game.state.codex.plants[sp.id] || {};
    says.length = 0;
    Game.experimentWith(Game.state.scholar.inventory.findIndex(x => x && x.lump), s.inventory);
    ok('experiments capped at 4', entry.experiments === 4, `experiments=${entry.experiments}`);
    ok('refusal said out loud', says.some(t => /everything nibbling can/i.test(t)), says.join(' | ').slice(0, 160));
    ok('still not identified', !Game.plantKnown(sp.id));
  }

  // ============ E3. avoid plant can teach danger ============
  console.log('\n-- E3. dangerous nibble teaches danger, no name --');
  {
    // Find a seed where the 40% bad roll fires within 4 nibbles: retry seeds.
    let sawDanger = false, tried = 0;
    for (let sd = 1; sd <= 40 && !sawDanger; sd++) {
      Math.random = mulberry32(9000 + sd);
      const s = freshGame();
      const yp = unknownPlant('avoid');
      const idx = addLump(yp.id, 6); // edibility 'avoid'
      for (let i = 0; i < 4; i++) {
        const li = Game.state.scholar.inventory.findIndex(x => x && x.lump);
        if (li < 0) break;
        Game.experimentWith(li, s.inventory);
      }
      const entry = Game.state.codex.plants[yp.id] || {};
      tried = sd;
      if (entry.riskSense === 'dangerous') sawDanger = true;
    }
    Math.random = mulberry32(SEED);
    ok('a bad roll teaches DANGEROUS within 4 nibbles (some seed)', sawDanger, `tried ${tried} seeds`);
    // And on the main seed, whatever happened, yarrow is never named:
    const s = freshGame();
    says.length = 0;
    const yp2 = unknownPlant('avoid');
    const idx = addLump(yp2.id, 6);
    for (let i = 0; i < 4; i++) {
      const li = Game.state.scholar.inventory.findIndex(x => x && x.lump);
      if (li < 0) break;
      Game.experimentWith(li, s.inventory);
    }
    ok('avoid plant never named by nibbling', !Game.plantKnown(yp2.id) && !says.some(t => new RegExp(yp2.name, 'i').test(t)));
  }

  // ============ E4. bridge into testCautiously ============
  console.log('\n-- E4. experiments bridge the full test --');
  {
    const s = freshGame();
    const sp = unknownPlant('safe');
    const idx = addLump(sp.id, 10);
    for (let i = 0; i < 3; i++) Game.experimentWith(Game.state.scholar.inventory.findIndex(x => x && x.lump), s.inventory);
    says.length = 0;
    const li = Game.state.scholar.inventory.findIndex(x => x && x.lump);
    Game.testCautiously(li, {}, s.inventory);
    ok('bridge line spoken', says.some(t => /nibbled this 3 times/i.test(t)), says.slice(0, 3).join(' | ').slice(0, 160));
  }

  // ============ E5. K0 honesty ============
  console.log('\n-- E5. L0 entry never listed as knowledge --');
  {
    const s = freshGame();
    const sp = unknownPlant('safe');
    const idx = addLump(sp.id, 5);
    Game.experimentWith(idx, s.inventory);
    const entries = Game.codexEntries();
    ok('codexEntries hides the L0 entry', !entries.some(e => e.pid === sp.id), `entries=${entries.length}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
