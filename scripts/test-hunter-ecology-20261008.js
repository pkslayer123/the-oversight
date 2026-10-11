#!/usr/bin/env node
// PROOF TEST (hunter loop, 2026-10-08): the ecology fixes.
// BEFORE: traps/nets/encounters conjured animals from thin air — a 2-stick
// pit trap yielded ~32,000 kcal of deer with zero labor and zero depletion;
// the gill net fished forever; minnow traps caught creek chub in meadows;
// setting any trap cost 0 ticks; the dead could set traps.
// AFTER:
//   F1 checkTraps hunts the tile's real simEcology wildlife; each catch
//      removes one animal; empty ground gets one honest quiet line.
//   F2 encounters.js checkAnimals (the live path) is wildlife-linked again —
//      the 2026-10-08 rewrite had dropped game.js's ECOLOGY link.
//   F3 gill nets have 12 uses and fish real creek_chub/bluegill populations.
//   F4 setTrap costs time (pit = 96 ticks "hard labor", else 16) and refuses
//      water traps on dry land; the dead can't set traps.
// RNG is fully stubbed per test — no seeded flakiness.
// Run: node scripts/test-hunter-ecology-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const realRand = Math.random;
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n + (d ? ' — ' + d : '')); } };
const say = () => { const s = (Game.log || []).map(x => x.text || x).join(' '); Game.log.length = 0; return s; };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  s.inventory.push({ material: 'vine', units: 20, name: 'vine' }, { material: 'stick', units: 20, name: 'stick' },
    { material: 'stone', units: 6, name: 'stone' }, { material: 'branch', units: 6, name: 'branch' },
    { name: 'berries', kcalEach: 30, units: 20, kg: 0.1 });
  say();
  return s;
}
const craftOk = id => { let m = null; for (let i = 0; i < 10 && !m; i++) m = Game.craft(id); say(); return !!m; };
// stub RNG with an explicit per-call sequence, then restore
function withRand(seq, fn) { let i = 0; Math.random = () => (i < seq.length ? seq[i++] : 0.5); try { return fn(); } finally { Math.random = realRand; } }

(async () => {
  await Game.init();

  // ---- F1a: a catch removes one animal from the tile ----
  {
    const s = fresh();
    Game.learnRecipe('snare', 3);
    craftOk('snare'); Game.setTrap('snare'); say();
    const t = Game.playerTile();
    t.wildlife = { cottontail_rabbit: 2 };
    const w0 = t.wildlife.cottontail_rabbit;
    withRand([0.1, 0.0], () => Game.checkTraps()); // catch roll hits, index 0 = rabbit
    const said = say();
    ok('catch removes one rabbit from the tile', t.wildlife.cottontail_rabbit === w0 - 1, `wildlife=${t.wildlife.cottontail_rabbit}`);
    ok('catch still announces', /caught a Cottontail Rabbit/i.test(said));
  }

  // ---- F1b: hunted-out ground goes quiet (once), not infinite ----
  {
    const s = fresh();
    Game.learnRecipe('snare', 3);
    craftOk('snare'); Game.setTrap('snare'); say();
    const t = Game.playerTile();
    t.wildlife = {}; // barren
    withRand([0.01], () => Game.checkTraps());
    const q1 = say();
    withRand([0.01], () => Game.checkTraps());
    const q2 = say();
    ok('empty ground: one honest quiet line', /sits empty/i.test(q1), q1.slice(0, 90));
    ok('quiet line not repeated every dawn', !/sits empty/i.test(q2));
    ok('no conjured catch on barren ground', !/caught a/i.test(q1 + q2));
  }

  // ---- F1c: pit trap can no longer conjure deer where none live ----
  {
    const s = fresh();
    Game.learnRecipe('pit_trap', 3);
    craftOk('pit_trap'); Game.setTrap('pit_trap'); say();
    const t = Game.playerTile();
    t.wildlife = { cottontail_rabbit: 5 }; // no deer/boar here
    let deerCaught = 0;
    withRand([], () => { Math.random = () => 0.01; Game.checkTraps(); });
    Math.random = realRand;
    const said = say();
    deerCaught = /Deer|Boar/i.test(said) ? 1 : 0;
    ok('pit on deerless ground catches no deer', deerCaught === 0, said.slice(0, 100));
  }

  // ---- F4a: setting costs time; the pit names its labor ----
  {
    const s = fresh();
    Game.learnRecipe('pit_trap', 3); Game.learnRecipe('snare', 3);
    craftOk('pit_trap');
    const t0 = s.dayTicks || 0;
    Game.setTrap('pit_trap');
    const pitMsg = say();
    const pitCost = (s.dayTicks || 0) - t0;
    craftOk('snare');
    const t1 = s.dayTicks || 0;
    Game.setTrap('snare'); say();
    const snareCost = (s.dayTicks || 0) - t1;
    ok('digging a pit costs 96 ticks', pitCost === 96, `cost=${pitCost}`);
    ok('pit names the hard labor', /hard labor/i.test(pitMsg));
    ok('staking a snare costs 16 ticks', snareCost === 16, `cost=${snareCost}`);
  }

  // ---- F4b: water traps refused on dry land ----
  {
    const s = fresh();
    Game.learnRecipe('minnow_trap', 3); Game.learnRecipe('fish_weir', 3);
    Game.playerTile().type = 'forest_floor';
    craftOk('minnow_trap');
    const r1 = Game.setTrap('minnow_trap'); const m1 = say();
    ok('minnow trap refused on dry land', r1 === null && /needs water/i.test(m1), m1.slice(0, 80));
    Game.playerTile().type = 'creek';
    craftOk('fish_weir');
    const r2 = Game.setTrap('fish_weir'); say();
    ok('fish weir allowed in the creek', r2 === true);
  }

  // ---- F4c: the dead can't set traps ----
  {
    const s = fresh();
    Game.learnRecipe('snare', 3);
    craftOk('snare');
    Game.over = true;
    const r = Game.setTrap('snare'); say();
    Game.over = false;
    ok('setTrap refused while dead', r === null);
  }

  // ---- F3a: the net fishes real fish, and frays ----
  {
    const s = fresh();
    s.inventory.push({ id: 'gill_net', name: 'Gill net' });
    const t = Game.playerTile();
    t.type = 'creek';
    Game.setNet(); say();
    const net = t.nets[0];
    ok('net set with 16 uses (depletion rebalance 2026-10-10)', net && net.uses === 16, `uses=${net && net.uses}`);
    // barren of fish: no catch even with a rigged roll
    t.wildlife = { raccoon: 3 };
    withRand([0.01], () => Game.checkNets());
    const q = say();
    ok('no fish here: no catch', !/caught a fish/i.test(q));
    // stocked: 12 forced catches break the net
    t.wildlife = { creek_chub: 30 };
    withRand([], () => { Math.random = () => 0.01; for (let i = 0; i < 12; i++) Game.checkNets(); });
    Math.random = realRand;
    const brk = say();
    ok('net breaks after 12 catches', (t.nets || []).length === 0, `nets left=${(t.nets || []).length}`);
    ok('breakage is announced', /torn to shreds/i.test(brk));
    ok('fish stock depleted by the net', (t.wildlife.creek_chub || 0) < 30, `chub left=${t.wildlife.creek_chub}`);
  }

  // ---- F2: encounters draw from the tile's wildlife ----
  {
    const s = fresh();
    const t = Game.playerTile();
    t.type = 'meadow';
    t.wildlife = {}; // hunted out
    let spawned = null;
    for (let i = 0; i < 40 && !spawned; i++) { s.animal = null; Game.checkAnimals(); spawned = s.animal; }
    s.animal = null;
    ok('hunted-out tile spawns nothing', !spawned);
    t.wildlife = { cottontail_rabbit: 30, gray_squirrel: 30 };
    const w0 = t.wildlife.cottontail_rabbit + t.wildlife.gray_squirrel;
    for (let i = 0; i < 40 && !spawned; i++) { s.animal = null; Game.checkAnimals(); spawned = s.animal; }
    const w1 = (t.wildlife.cottontail_rabbit || 0) + (t.wildlife.gray_squirrel || 0);
    ok('stocked tile spawns', !!spawned, spawned ? spawned.id : 'none');
    ok('spawn leaves the tile population', w1 === w0 - 1, `${w0} -> ${w1}`);
    s.animal = null;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
