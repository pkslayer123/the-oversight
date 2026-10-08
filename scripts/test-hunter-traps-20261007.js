#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07, hunter loop): two promised-but-missing hunter
// consequences, now implemented per the fix-verification chain.
//   FIX 1: box-trap skunk catch delivers the regret the recipe L3 promises
//          ("a skunk, which you will regret"). L3 readers open from upwind
//          (+3 scent); the careless get +5. Non-skunk catches are untouched.
//   FIX 2: pit traps take the player too, per the recipe warning ("mark it
//          well: your own pit will take you too"). Entering a tile with a
//          previous-day pit: 50% fall (15-25 dmg, trap sprung), else an
//          honest skirt line. Same-day pits never trigger.
// RNG is fully stubbed per test — no seeded flakiness.
// Run: node scripts/test-hunter-traps-20261007.js
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
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };
const say = () => { const s = (Game.log || []).map(x => x.text || x).join(' '); Game.log.length = 0; return s; };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  s.inventory.push({ material: 'vine', units: 8, name: 'vine' }, { material: 'stick', units: 12, name: 'stick' },
    { material: 'stone', units: 4, name: 'stone' }, { name: 'berries', kcalEach: 30, units: 6, kg: 0.1 });
  say();
  return s;
}
const craftOk = id => { let m = null; for (let i = 0; i < 8 && !m; i++) m = Game.craft(id); say(); return !!m; };
// stub RNG with an explicit per-call sequence, then restore
function withRand(seq, fn) { let i = 0; Math.random = () => (i < seq.length ? seq[i++] : 0.5); try { return fn(); } finally { Math.random = realRand; } }

(async () => {
  await Game.init();

  // ---- FIX 1a: skunk catch, careful (box_trap L3) -> +3 scent, upwind line ----
  let s = fresh();
  Game.learnRecipe('box_trap', 3);
  ok('box trap crafts', craftOk('box_trap'));
  ok('box trap sets', !!Game.setTrap('box_trap')); say();
  // ECOLOGY FIXTURE (2026-10-08): traps hunt real wildlife — stock the tile
  // with every box-trap species so the forced catch can land on the skunk.
  Game.playerTile().wildlife = { raccoon: 4, opossum: 4, muskrat: 4, gray_fox: 2, striped_skunk: 3, timber_rattlesnake: 2, groundhog: 2, north_american_beaver: 2, bobcat: 2, nine_banded_armadillo: 4 };
  // seq: trapChance 0.1 (<0.4 catch), catch index 0.53 -> floor(0.53*14)=7 striped_skunk (14-entry list)
  withRand([0.1, 0.53], () => { Game.log.length = 0; Game.checkTraps(); });
  const t1 = say();
  ok('skunk catch named', /Striped Skunk/i.test(t1));
  ok('careful line: upwind + long stick', /upwind/i.test(t1) && /long stick/i.test(t1));
  ok('careful scent +3', s.skunkScent === 3);

  // ---- FIX 1b: skunk catch, careless (box_trap L2: can build, never read the
  // skunk warning) -> +5 scent, fumble line ----
  s = fresh();
  Game.learnRecipe('box_trap', 2);
  ok('box trap crafts (careless)', craftOk('box_trap'));
  ok('box trap sets (careless)', !!Game.setTrap('box_trap')); say();
  Game.playerTile().wildlife = { raccoon: 4, opossum: 4, muskrat: 4, gray_fox: 2, striped_skunk: 3, timber_rattlesnake: 2, groundhog: 2, north_american_beaver: 2, bobcat: 2, nine_banded_armadillo: 4 };
  withRand([0.1, 0.53], () => { Game.log.length = 0; Game.checkTraps(); });
  const t1b = say();
  ok('careless scent +5', s.skunkScent === 5);
  ok('careless line: fumble', /fumble/i.test(t1b));

  // ---- FIX 1c: non-skunk catch leaves scent alone ----
  s = fresh();
  Game.learnRecipe('snare', 3);
  ok('snare crafts', craftOk('snare'));
  ok('snare sets', !!Game.setTrap('snare')); say();
  Game.playerTile().wildlife = { cottontail_rabbit: 4, gray_squirrel: 4, opossum: 4 };
  // snare catches: [rabbit, squirrel, opossum]; 0.4 -> index 1 = gray_squirrel
  withRand([0.1, 0.4], () => { Game.log.length = 0; Game.checkTraps(); });
  const t1c = say();
  ok('squirrel catch named', /Gray Squirrel/i.test(t1c));
  ok('no scent from squirrel', !s.skunkScent);

  // ---- FIX 2a: pit fall branch ----
  s = fresh();
  Game.learnRecipe('pit_trap', 3);
  ok('pit trap crafts', craftOk('pit_trap'));
  ok('pit trap sets', !!Game.setTrap('pit_trap')); say();
  const hx = Game.map.px, hy = Game.map.py;
  const pit = Game.playerTile().traps.find(t => t.recipeId === 'pit_trap');
  pit.setDay = s.day - 1; pit.uses = 4;
  const hop = () => { const t = Game.travelTargets().find(t => t.x === Game.map.px + 1 && t.y === Game.map.py) || Game.travelTargets()[0]; Game.travelTo(t.x, t.y, true); say(); };
  hop(); hop();
  const hp0 = s.health;
  // all rolls 0.1: pit roll <0.5 -> fall; damage 15+floor(0.1*11)=16
  withRand([], () => { Math.random = () => 0.1; Game.log.length = 0; Game.travelTo(hx, hy, true); });
  Math.random = realRand;
  const t2a = say();
  ok('fall line names YOUR pit', /YOUR pit/i.test(t2a));
  ok('fall deals 15-25 damage', s.health === hp0 - 16);
  ok('fall springs the trap (uses 4->3)', Game.tileAt(hx, hy).traps.find(t => t.recipeId === 'pit_trap').uses === 3);

  // ---- FIX 2b: pit miss branch ----
  s = fresh();
  Game.learnRecipe('pit_trap', 3);
  craftOk('pit_trap'); Game.setTrap('pit_trap'); say();
  const hx2 = Game.map.px, hy2 = Game.map.py;
  const pit2 = Game.playerTile().traps.find(t => t.recipeId === 'pit_trap');
  pit2.setDay = s.day - 1;
  hop(); hop();
  const hp0b = s.health;
  withRand([], () => { Math.random = () => 0.9; Game.log.length = 0; Game.travelTo(hx2, hy2, true); });
  Math.random = realRand;
  const t2b = say();
  ok('miss line: skirt the hollow', /skirt the brushed-over hollow/i.test(t2b));
  ok('miss: no damage', s.health === hp0b);
  ok('miss: trap intact', Game.tileAt(hx2, hy2).traps.find(t => t.recipeId === 'pit_trap').uses === 4);

  // ---- FIX 2c: same-day pit never triggers ----
  s = fresh();
  Game.learnRecipe('pit_trap', 3);
  craftOk('pit_trap'); Game.setTrap('pit_trap'); say();
  const hx3 = Game.map.px, hy3 = Game.map.py;
  hop(); hop();
  const hp0c = s.health;
  withRand([], () => { Math.random = () => 0.1; Game.log.length = 0; Game.travelTo(hx3, hy3, true); });
  Math.random = realRand;
  const t2c = say();
  ok('same-day pit: no pit line', !/pit/i.test(t2c));
  ok('same-day pit: no damage', s.health === hp0c);

  // ---- neighbor: deadfall bait honesty ----
  s = fresh();
  s.inventory = s.inventory.filter(i => !((i.kcalEach || 0) > 0 && (i.units || 0) > 0));
  s.inventory.push({ material: 'stick', units: 4, name: 'stick' }, { material: 'stone', units: 2, name: 'stone' });
  Game.learnRecipe('deadfall', 2);
  Game.log.length = 0;
  const noBait = Game.craft('deadfall');
  const t3 = say();
  ok('deadfall refuses without bait', noBait === null && /Need 1 bait/i.test(t3));
  s.inventory.push({ name: 'berries', kcalEach: 30, units: 4, kg: 0.1 });
  let madeD = null;
  for (let i = 0; i < 8 && !madeD; i++) madeD = Game.craft('deadfall');
  say();
  ok('deadfall crafts with food bait', !!madeD);

  // ---- neighbor: long-range direction phrase ----
  s = fresh();
  Game.learnRecipe('snare', 3);
  craftOk('snare'); Game.setTrap('snare'); say();
  const homeX = Game.map.px, homeY = Game.map.py;
  hop(); hop(); // camp 2 tiles east
  withRand([0.1, 0.5], () => { Game.log.length = 0; Game.checkTraps(); });
  const t4 = say();
  ok('dawn names direction (2 tiles west)', /2 tiles west/i.test(t4));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
