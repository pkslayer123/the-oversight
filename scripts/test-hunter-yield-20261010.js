#!/usr/bin/env node
// Hunter adversarial 2026-10-10: MEAT-YIELD ENERGY PRINTING + tackle honesty.
// BREAK 1 (exploit): hunt.meat_yield / fishing.yield multiply the carcass
//   GROSS at the kill/catch. Field Dressing L3 (1.3^3=2.197) x Clean Kill
//   (x1.5) = 3.3x an animal's chemical energy — a 20,000-kcal deer becomes
//   a 65,910-kcal carcass, cleaning to 26,364 kcal. The cards promise "less
//   waste" and "full yield" — both capped at the gross. Same class as the
//   pemmican printer (fixed 2026-10-09): energy is never created.
//   Fishing: tidecaller (x1.5) x fishing L3 skill (x1.45) = 2.18x a bluegill's
//   150-kcal chemical energy; the hand line adds x1.3 tackle inflation.
// BREAK 2 (honesty): setNet pushes uses:12 while the DEPLETION comment (and
//   the 2026-10-10 backfill) promise 16 catches.
// BREAK 3 (softlock): setTrap('snare') via snare_wire crashes with TypeError
//   when scholar.tools is undefined (fresh game, wire found not crafted) —
//   the wire is consumed, the trap lands, but the filter line throws before
//   the time cost, so the action dies mid-verb.
// BREAK 4 (honesty): the Butcher's Friend relic card promises "Carcass
//   utilization +15%" but the enhancement is missing from RELIC_MOD_MAP —
//   dead at runtime, the card lies.
// FIX: species-honest gross at the kill/catch; skill becomes waste reduction
//   at the cleaning (butcherYieldFrac, capped 0.95); net uses 16; tools
//   guard; butchers_friend wired to hunt.meat_yield.
// Run: node scripts/test-hunter-yield-20261010.js [SEED]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || process.argv[2] || '0xB0A910', 16);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('EVAL FAIL', f, e.message); process.exit(2); } }
delete global.window;
const Game = globalThis.Scattering.Game;
const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.sysSay = () => {};
Game.drama = () => {}; Game.audioEvent = () => {};

function withForcedRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const S = () => Game.state.scholar;
  const deer = Game.data.animals.find(a => a.id === 'white_tailed_deer');
  const bluegill = Game.data.animals.find(a => a.id === 'bluegill');

  // max-hunter build: Field Dressing L3, Clean Kill synergy, Butcher's Friend relic
  S().abilities = [{ id: 'field_dressing', level: 3 }];
  S().synergies = ['clean_kill']; S().activeSynergies = ['clean_kill'];
  S().inventory.push({ name: 'Test Cleaver', bonded: true, enhancements: ['butchers_friend'] });

  console.log('\n[exploit] trap-catch carcass keeps the species gross');
  {
    // plant a pit trap directly (bypass time), force the catch roll
    const t = Game.playerTile();
    t.traps = [{ recipeId: 'pit_trap', mx: 4, my: 4, setDay: S().day, uses: 4 }];
    t.wildlife = { white_tailed_deer: 3 };
    t.trapShy = {};
    const before = S().inventory.length;
    withForcedRandom(0, () => Game.checkTraps());
    const carcass = S().inventory.slice(before).find(i => i.foodState === 'carcass');
    ok(!!carcass, 'forced trap catch yields a carcass');
    ok(carcass && carcass.hiddenKcal === deer.calories,
      'carcass gross is the species gross (' + deer.calories + '), not skill-inflated',
      carcass ? 'hiddenKcal=' + carcass.hiddenKcal : 'no carcass');
    // end-to-end: clean it, total food can never exceed the gross
    S().inventory.push({ itemId: 'stone_knife', name: 'Stone knife' });
    try { Game.learnTechnique('clean', 'trial'); Game.learnTechnique('clean', 'trial'); } catch (e) {}
    const idx = S().inventory.indexOf(carcass);
    Game.cleanCarcass(idx);
    const meat = S().inventory.filter(i => i.foodKind === 'meat' && i.foodState === 'cleaned');
    const total = meat.reduce((n, i) => n + (i.kcalEach || 0) * (i.units || 1), 0);
    ok(total <= deer.calories, 'cleaned total never exceeds the animal\'s chemical energy', 'total=' + total);
    const yfrac = typeof Game.butcherYieldFrac === 'function' ? Game.butcherYieldFrac('trapped') : 0.40;
    ok(typeof Game.butcherYieldFrac === 'function', 'butcherYieldFrac exists (skill as waste reduction, capped)');
    ok(yfrac <= 0.95 + 1e-9, 'butcher yield capped at 0.95 (full yield, not phantom)', 'yfrac=' + yfrac);
    ok(yfrac > 0.40, 'master skill still earns: yield above the 0.40 baseline', 'yfrac=' + yfrac);
    ok(total === Math.round(deer.calories * yfrac) || Math.abs(total - deer.calories * yfrac) < 600,
      'cleaned total matches the honest yield fraction', 'total=' + total + ' yfrac=' + yfrac);
  }

  console.log('\n[exploit] fishing keeps species gross too');
  {
    S().activeSynergies = (S().activeSynergies || []).concat(['tidecaller']);
    Game.state.codex.skills = Object.assign({}, Game.state.codex.skills, { fishing: { level: 3 } });
    const t = Game.playerTile();
    t.type = 'creek';
    t.wildlife = { bluegill: 5, creek_chub: 5 };
    S().inventory.push({ itemId: 'fishing_line', name: 'Fishing line' });
    const before = S().inventory.length;
    withForcedRandom(0, () => Game.fish());
    const catches = S().inventory.slice(before).filter(i => i.foodState === 'carcass');
    ok(catches.length >= 1, 'forced line catch yields a carcass');
    const bad = catches.filter(c => (c.hiddenKcal || 0) > 200);
    ok(bad.length === 0, 'no catch exceeds its species gross (no tackle/skill inflation)',
      bad.length ? 'hiddenKcal=' + bad.map(c => c.hiddenKcal).join(',') : '');
  }

  console.log('\n[honesty] net durability matches the promised 16 catches');
  {
    const t = Game.playerTile();
    t.type = 'creek';
    t.nets = [];
    S().inventory.push({ itemId: 'gill_net', name: 'Gill net' });
    Game.setNet();
    ok(t.nets.length === 1 && t.nets[0].uses === 16, 'fresh gill net has 16 uses',
      t.nets.length ? 'uses=' + t.nets[0].uses : 'no net set');
  }

  console.log('\n[softlock] snare-wire trap set with no tools array');
  {
    delete S().tools; // fresh game: wire found, never crafted
    S().inventory.push({ itemId: 'snare_wire', name: 'Snare wire', units: 1 });
    const t = Game.playerTile();
    const nTraps = (t.traps || []).length;
    let threw = null;
    try { Game.setTrap('snare'); } catch (e) { threw = e; }
    ok(!threw, 'setTrap via wire does not throw when scholar.tools is undefined', threw ? threw.message : '');
    ok((t.traps || []).length === nTraps + 1, 'the improvised snare lands on the tile');
  }

  console.log('\n[honesty] Butcher\'s Friend relic is live');
  {
    // isolate the relic: strip abilities/synergies, the +15% must come from the card alone
    const keepAb = S().abilities, keepSy = S().activeSynergies;
    S().abilities = []; S().activeSynergies = [];
    const y = Game.modTarget('hunt.meat_yield', 1);
    S().abilities = keepAb; S().activeSynergies = keepSy;
    ok(Math.abs(y - 1.15) < 1e-9, 'butchers_friend +15% reaches the yield pipeline (card is not dead)', 'yield=' + y);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
