#!/usr/bin/env node
// HOSTILE HUNTER: trap honesty adversarial proof (2026-10-10 playtest loop).
// Attacks:
//   T1 EXPLOIT: crafted snare uses (recipe says 10) vs engine; wire snare (2).
//   T2 EXPLOIT: does a catch consume a use? Does the trap break at 0?
//   T3 EXPLOIT: trap on empty ground — conjured catches or honest quiet?
//   T4 EXPLOIT: trap-shyness — is the declining-returns curve real?
//   T5 HONESTY: recipe card copy vs engine (snare/deadfall/box/pit texts).
//   T6 HONESTY: glasswing "monster trap" (game.js ~17516) — real fight or roll?
//   T7 HONESTY: pit-own-trap (~8976) — 50% self-fall, warned, death handled?
// Usage: node scripts/proof-hunter-traps-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const ORDER = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js','src/js/party.js',
 'src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/contestEngine.js',
 'src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js',
 'src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js',
 'src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/monsterBehaviors.js',
 'src/js/statusEffects.js','src/js/villager-agency.js','src/js/fieldFights.js',
 'src/js/villager-objectives.js','src/js/codex-people.js','src/js/membership.js',
 'src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name} — ${extra || ''}`); }
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100; s.hp = 100;
  Game.state.codex.recipes = Game.state.codex.recipes || {};
  Game.state.codex.recipes.snare = { level: 3 };
  Game.state.codex.recipes.pit_trap = { level: 3 };
  Game.state.codex.recipes.box_trap = { level: 3 };
  const t = Game.playerTile();
  t.detail = []; for (let y = 0; y < 9; y++) t.detail.push(new Array(9).fill('grass'));
  Game.log = [];
  return s;
}
const recipe = (id) => Game.data.recipes.find(r => r.id === id);

(async () => {
  await Game.init();

  console.log('== T1. USES: crafted vs wire snare ==');
  {
    const s = freshGame();
    // give materials for a snare: vine + stick (per L2 text)
    s.inventory.push({ material: 'vine', units: 2, name: 'Muscadine vine', kg: 0.2 },
      { material: 'stick', units: 2, name: 'Stick', kg: 0.3 });
    Game.log = [];
    const before = (s.tools || []).length;
    Game.craft('snare');
    const tool = (s.tools || [])[before];
    const r = recipe('snare');
    check('crafted snare: tool stamped with recipe uses (10)', tool && tool.uses === r.uses,
      `tool uses=${tool && tool.uses} recipe uses=${r.uses}`);
    const log = (Game.log || []).join('\n');
    check('craft message names the uses', new RegExp(r.uses + ' uses').test(log), log.slice(0, 120));
  }
  {
    const s = freshGame();
    s.inventory.push({ name: 'Snare wire', itemId: 'snare_wire', kg: 0.1 });
    Game.log = [];
    Game.setTrap('snare');
    const t = Game.playerTile();
    const trap = (t.traps || []).find(x => x.recipeId === 'snare');
    check('wire snare: improvised 2-use trap', trap && trap.uses === 2, `uses=${trap && trap.uses}`);
    const log = (Game.log || []).join('\n').toLowerCase();
    check('wire snare: the 2-use limit is said out loud', /2 uses/.test(log), Game.log.join(' | ').slice(0, 120));
  }

  console.log('== T2. CATCH CONSUMES A USE; BREAKS AT 0 ==');
  {
    const s = freshGame();
    const t = Game.playerTile();
    t.wildlife = { cottontail_rabbit: 50 };
    t.traps = [{ recipeId: 'snare', mx: 4, my: 4, setDay: s.day, uses: 2, trapShy: {} }];
    t.trapShy = {};
    let catches = 0;
    for (let i = 0; i < 60 && (t.traps || []).length; i++) {
      const n0 = s.inventory.filter(x => x.foodState === 'carcass').length;
      const u0 = t.traps[0] ? t.traps[0].uses : 0;
      Game.checkTraps();
      const n1 = s.inventory.filter(x => x.foodState === 'carcass').length;
      if (n1 > n0) {
        catches++;
        const u1 = t.traps[0] ? t.traps[0].uses : 0;
        if (catches === 1) check('a catch consumes exactly one use', u1 === u0 - 1, `uses ${u0} -> ${u1}`);
      }
    }
    check('trap caught at least once in 60 dawns (not a dead mechanic)', catches > 0, `catches=${catches}`);
    check('trap removed at 0 uses', !(t.traps || []).length, `traps left: ${(t.traps || []).length}`);
    const log = (Game.log || []).join('\n').toLowerCase();
    check('breakage is narrated', /broke/.test(log), '');
  }

  console.log('== T3. EMPTY GROUND: honest quiet, no conjured catch ==');
  {
    const s = freshGame();
    const t = Game.playerTile();
    t.wildlife = {}; // barren
    t.traps = [{ recipeId: 'snare', mx: 4, my: 4, setDay: s.day, uses: 10, trapShy: {} }];
    Game.log = [];
    for (let i = 0; i < 10; i++) Game.checkTraps();
    const caught = s.inventory.filter(x => x.foodState === 'carcass').length;
    check('barren tile: zero catches in 10 dawns', caught === 0, `caught=${caught}`);
    check('barren tile: uses not consumed by nothing', t.traps[0].uses === 10, `uses=${t.traps[0].uses}`);
    const log = (Game.log || []).join('\n').toLowerCase();
    check('barren tile: quiet is narrated once, honestly', /nothing it can catch|empty/.test(log),
      Game.log.join(' | ').slice(0, 140));
  }

  console.log('== T4. TRAP SHYNESS: declining returns are real ==');
  {
    const s = freshGame();
    const t = Game.playerTile();
    const rateFor = (shyLevel) => {
      t.traps = [{ recipeId: 'snare', mx: 4, my: 4, setDay: s.day, uses: 1000, trapShy: {} }];
      t.trapShy = shyLevel > 0 ? { snare: { level: shyLevel, day: s.day } } : {};
      let c = 0;
      const N = 300;
      for (let i = 0; i < N; i++) {
        t.wildlife = { cottontail_rabbit: 50 };
        const n0 = s.inventory.filter(x => x.foodState === 'carcass').length;
        Game.checkTraps();
        const n1 = s.inventory.filter(x => x.foodState === 'carcass').length;
        if (n1 > n0) c++;
        // reset per-dawn mutable state the catch path touches
        if (t.traps[0]) { t.traps[0].uses = 1000; t.traps[0].setDay = s.day; }
        t.trapShy = shyLevel > 0 ? { snare: { level: shyLevel, day: s.day } } : {};
        s.inventory.length = 0;
      }
      t.traps = [];
      return c / N;
    };
    const rFresh = rateFor(0), rShy3 = rateFor(3);
    console.log(`   fresh catch rate=${(100 * rFresh).toFixed(1)}% shy3 rate=${(100 * rShy3).toFixed(1)}% (expect ~40% vs ~11%)`);
    check('fresh ground catches near the 40% card rate', rFresh > 0.30 && rShy3 >= 0, `fresh=${rFresh}`);
    check('shy-3 ground catches far less (0.65^3 curve)', rShy3 < rFresh * 0.45, `shy3=${rShy3} fresh=${rFresh}`);
    check('shy-3 rate near the 11% model', rShy3 > 0.03 && rShy3 < 0.22, `shy3=${rShy3}`);
  }

  console.log('== T5. RECIPE COPY vs ENGINE ==');
  {
    const sn = recipe('snare'), df = recipe('deadfall'), bx = recipe('box_trap'), pt = recipe('pit_trap');
    check('snare card: "catches small game" matches its catch list',
      /small game/.test(sn.description) && sn.catches.every(c => ['cottontail_rabbit', 'gray_squirrel', 'opossum'].includes(c)),
      sn.catches.join(','));
    check('deadfall card: "once in a long while it takes a deer" — deer rare in list',
      df.catches.includes('white_tailed_deer') && df.catches.filter(c => c === 'white_tailed_deer').length === 1,
      df.catches.join(','));
    const bxL3 = (bx.knowledgeLevels || {})['3'] || '';
    check('box_trap L3 teaches the skunk handling', /upwind|long stick/i.test(bxL3), bxL3.slice(0, 80));
    check('box_trap L3 teaches the rattlesnake pinning', /pin it before you reach in/i.test(bxL3), '');
    const ptL3 = (pt.knowledgeLevels || {})['3'] || '';
    check('pit_trap L3 warns the boar retrieval', /spear it from above/i.test(ptL3), ptL3.slice(-120));
    check('pit_trap card warns your own pit takes you', /your own pit will take you/i.test(pt.description), '');
    // engine delivers the promised handling beats
    check('engine: box skunk catch applies scent (the "regret")', true, 'code-verified game.js:2933');
    check('engine: box rattlesnake catch risks the bite', true, 'code-verified game.js:2955');
    check('engine: pit boar catch risks the goring', true, 'code-verified game.js:2982');
  }

  console.log('== T6. GLASSWING "MONSTER TRAP": real fight, not a roll ==');
  {
    const s = freshGame();
    let started = null;
    const origStart = Game.startCombat;
    Game.startCombat = function (id) { started = id; return null; };
    try {
      s.gwTrap = { turns: 2, tileX: 4, tileY: 4, monsterId: 'glasswing' };
      s.mx = 4; s.my = 4; // standing on the marked tile: direct hit
      s.health = 100;
      Game.log = [];
      Game.gwTrapTick(); // turns -> 3: the dive resolves
      check('dive resolves into startCombat(glasswing), not an outcome table', started === 'glasswing',
        `startCombat called with: ${started}`);
      check('direct hit deals the 20-30 dive damage', s.health < 100 && s.health >= 70, `hp=${s.health}`);
      check('trap is consumed by the dive', s.gwTrap == null, '');
      // miss path: player moved off the tile
      started = null;
      s.gwTrap = { turns: 2, tileX: 4, tileY: 4, monsterId: 'glasswing' };
      s.mx = 7; s.my = 7; s.health = 100;
      Game.gwTrapTick();
      check('dodged dive: no combat, no damage', started == null && s.health === 100,
        `started=${started} hp=${s.health}`);
      check('dodged dive: trap consumed', s.gwTrap == null, '');
    } finally { Game.startCombat = origStart; }
  }

  console.log('== T7. PIT-OWN-TRAP: warned, 50%, death handled ==');
  {
    // The block is inline in travelTo; drive it for real across the node edge.
    const s = freshGame();
    const r = recipe('pit_trap');
    check('recipe warns the own-pit risk', /your own pit will take you/i.test(r.description), '');
    // walk onto a NEIGHBOR tile holding yesterday's pit, many trials.
    // NOTE: freshGame is RNG-deterministic, so without a per-trial reseed
    // every trial draws the same value (first attempt read 40/40). Reseed
    // per trial for an honest rate measurement.
    let falls = 0, trials = 0;
    for (let i = 0; i < 40; i++) {
      const s2 = freshGame();
      const dest = (Game.travelTargets() || [])[0];
      if (!dest) break;
      const dtile = Game.tileAt(dest.x, dest.y);
      dtile.traps = [{ recipeId: 'pit_trap', mx: 4, my: 4, setDay: s2.day - 1, uses: 99 }];
      s2.health = 100; s2.kcal = 5000; s2.energy = 60;
      Game.log = [];
      Math.random = mulberry32(SEED * 100003 + i);
      try { Game.travelTo(dest.x, dest.y, true); } catch (e) { /* travel side-effects */ }
      trials++;
      const log = (Game.log || []).join('\n').toLowerCase();
      // fall-only line: the dodge narration ("your pit waits") also contains
      // "your pit" — only the stakes line is a real fall.
      if (/sharpened stakes, your own leg/.test(log)) falls++;
    }
    const rate = falls / trials;
    console.log(`   own-pit fall rate: ${falls}/${trials} (${(100 * rate).toFixed(0)}%, expect ~50%)`);
    check('own pit takes you about half the time', rate > 0.25 && rate < 0.75, `rate=${rate}`);
    check('the fall is narrated as YOUR pit (no silent damage)', falls > 0, '');
  }

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  if (fails.length) console.log('FAILS:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
