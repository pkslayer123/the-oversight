// Trap-pool coverage test + playtest (worker A, 2026-10-06).
// Bug class: animals.json "trap" method promised a trap that no recipe could catch.
// This asserts every "trap"-method animal is catchable by >=1 recipe, that the
// probabilities are sane (no free deer), and playtests the loop as a player.
// The engine picks UNIFORMLY from recipe.catches (game.js checkTraps), so
// repeated entries in a catches list are DELIBERATE weighting (a weighted
// lottery by entry multiplicity). See recipes.json.
//
// Usage: node scripts/test-trap-poolA.js   (NOT jest — never run jest concurrently)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- PART A: pure data assertions ----------
const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/recipes.json'), 'utf8'));
const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/animals.json'), 'utf8'));
const animalById = {};
for (const a of animals) animalById[a.id] = a;
const trapRecipes = recipes.filter(r => r.catches && r.catches.length);

// 1. Every animal with "trap" in method has >=1 recipe that can catch it.
for (const a of animals) {
  if ((a.method || []).includes('trap')) {
    const covering = trapRecipes.filter(r => r.catches.includes(a.id));
    ok(`trap-method animal covered: ${a.id}`, covering.length >= 1,
      `method=${JSON.stringify(a.method)} covered by: ${covering.map(r => r.id).join(', ') || 'NONE'}`);
  }
}

// 2. Every catches id names a real animal.
for (const r of trapRecipes) {
  for (const id of r.catches) ok(`catches id exists: ${r.id} → ${id}`, !!animalById[id]);
}

// 3. Trap recipe schema sanity.
// Synced to MAT_DEFS in src/js/storage.js (+ 'bait', special-cased in craft,
// + cloth/charcoal/container used by the legacy water_filter recipe).
const KNOWN_MATS = new Set(['wood', 'branch', 'stone', 'fiber', 'vine', 'stick', 'bait', 'cloth', 'charcoal', 'container']);
for (const r of trapRecipes) {
  ok(`schema ${r.id}: name/desc`, typeof r.name === 'string' && typeof r.description === 'string');
  ok(`schema ${r.id}: materials`, r.materials && typeof r.materials === 'object' && Object.keys(r.materials).length > 0);
  for (const m of Object.keys(r.materials || {})) ok(`schema ${r.id}: known material ${m}`, KNOWN_MATS.has(m));
  ok(`schema ${r.id}: uses>0`, Number.isInteger(r.uses) && r.uses > 0);
  for (const lvl of ['1', '2', '3']) ok(`schema ${r.id}: knowledge L${lvl}`, !!(r.knowledgeLevels && r.knowledgeLevels[lvl]));
}

// 4. Balance: no free deer. Deer must be a rare share of a shared list.
const deadfall = recipes.find(r => r.id === 'deadfall');
const count = (arr, id) => arr.filter(x => x === id).length;
const deerShare = count(deadfall.catches, 'white_tailed_deer') / deadfall.catches.length;
ok('deadfall: deer is a rare share (<=1/6 of catch events)', deerShare <= 1 / 6 + 1e-9, `share=${deerShare.toFixed(3)}`);
ok('deadfall: deer shares the list with >=5 other entries', deadfall.catches.length - 1 >= 5);
// Expected deer per trap lifetime: uses(5) * 40%/day catch * deerShare. Must be < 1.
const expDeerPerLife = deadfall.uses * 0.4 * deerShare;
ok('deadfall: expected deer per trap lifetime < 1', expDeerPerLife < 1, `expected=${expDeerPerLife.toFixed(2)}`);
// Weighting intent: rabbit 2, squirrel 2, turkey 2, deer 1.
ok('deadfall weighting 2/2/2/1',
  count(deadfall.catches, 'cottontail_rabbit') === 2 &&
  count(deadfall.catches, 'gray_squirrel') === 2 &&
  count(deadfall.catches, 'wild_turkey') === 2 &&
  count(deadfall.catches, 'white_tailed_deer') === 1);

const boxTrap = recipes.find(r => r.id === 'box_trap');
const foxShare = count(boxTrap.catches, 'gray_fox') / boxTrap.catches.length;
ok('box_trap: fox is trap-shy (share <= 1/4)', foxShare <= 1 / 4 + 1e-9, `share=${foxShare.toFixed(3)}`);
ok('box_trap: raccoon (trap-only method) covered', boxTrap.catches.includes('raccoon'));

const weir = recipes.find(r => r.id === 'fish_weir');
const turtleShare = count(weir.catches, 'snapping_turtle') / weir.catches.length;
ok('fish_weir: turtle share <= 1/2', turtleShare <= 1 / 2 + 1e-9, `share=${turtleShare.toFixed(3)}`);
ok('fish_weir: crayfish + turtle covered', weir.catches.includes('crayfish') && weir.catches.includes('snapping_turtle'));

// ---------- PART B: engine playtest ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  const logLines = () => Game.log.slice();
  const newLines = (before) => Game.log.slice(before);

  // --- knowledge gate: L0 can't craft ---
  let before = logLines().length;
  const blindCraft = Game.craft('box_trap');
  ok('knowledge gate: box_trap L0 refuses craft', blindCraft === null);
  ok('knowledge gate: says you don\'t know how', newLines(before).join(' ').includes("don't know how"));

  // --- learn, stock materials, craft, set ---
  for (const id of ['snare', 'deadfall', 'box_trap', 'fish_weir']) Game.learnRecipe(id, 3);
  s.inventory.push(
    { material: 'vine', units: 40, name: 'Vine', kg: 0.1 },
    { material: 'stick', units: 40, name: 'Stick', kg: 0.2 },
    { material: 'stone', units: 20, name: 'Stone', kg: 0.3 },
    { name: 'Berries', kcalEach: 50, units: 30, kg: 0.05 }
  );
  for (const id of ['snare', 'deadfall', 'box_trap', 'fish_weir']) {
    let made = false;
    for (let i = 0; i < 10 && !made; i++) made = !!Game.craft(id);
    ok(`craft ${id} (L3)`, made);
    ok(`set ${id}`, !!Game.setTrap(id));
  }

  // --- seeded distribution check: drive checkTraps directly ---
  const realRandom = Math.random;
  Math.random = mulberry32(20261006);
  const shares = {};
  for (const id of ['snare', 'deadfall', 'box_trap', 'fish_weir']) {
    const t = Game.tileAt(Game.map.px, Game.map.py);
    t.traps = [{ recipeId: id, mx: Game.map.px, my: Game.map.py, setDay: s.day, uses: 99999 }];
    const invBefore = s.inventory.length;
    const counts = {};
    for (let i = 0; i < 2000; i++) {
      const n0 = s.inventory.length;
      Game.checkTraps();
      for (let k = n0; k < s.inventory.length; k++) {
        const nm = s.inventory[k].name || '';
        const a = animals.find(x => nm.includes(x.name));
        if (a) counts[a.id] = (counts[a.id] || 0) + 1;
      }
    }
    t.traps = [];
    // remove all the test carcasses so they don't rot/confuse later
    s.inventory.length = invBefore;
    shares[id] = counts;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`  dist ${id}: ${total} catches — ` +
      Object.entries(counts).map(([k, v]) => `${k} ${(100 * v / total).toFixed(1)}%`).join(', '));
  }
  Math.random = realRandom;

  const shareOf = (counts, id) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return total ? (counts[id] || 0) / total : 0;
  };
  ok('sim: snare catches opossum', (shares.snare.opossum || 0) > 0);
  const dDeer = shareOf(shares.deadfall, 'white_tailed_deer');
  ok('sim: deadfall deer rare (8–20%)', dDeer > 0.08 && dDeer < 0.20, `got ${(100 * dDeer).toFixed(1)}%`);
  ok('sim: deadfall still mostly small game', shareOf(shares.deadfall, 'cottontail_rabbit') > 0.2);
  const dFox = shareOf(shares.box_trap, 'gray_fox');
  ok('sim: box_trap fox rarest (10–30%)', dFox > 0.10 && dFox < 0.30, `got ${(100 * dFox).toFixed(1)}%`);
  ok('sim: box_trap catches raccoon', (shares.box_trap.raccoon || 0) > 0);
  const dTurtle = shareOf(shares.fish_weir, 'snapping_turtle');
  ok('sim: fish_weir turtle ~1/3 (25–42%)', dTurtle > 0.25 && dTurtle < 0.42, `got ${(100 * dTurtle).toFixed(1)}%`);
  ok('sim: fish_weir catches crayfish', (shares.fish_weir.crayfish || 0) > 0);

  // --- feel: play 12 real dawns as a player, read the story ---
  // (Game.log caps at 40 entries — clear it and per-iteration so index
  // slicing never goes stale.)
  Game.log.length = 0;
  before = 0;
  const story = [];
  for (let d = 0; d < 12 && !Game.over; d++) {
    s.kcal = 2400; s.hydration = 100; s.health = 100;
    Game.endDay();
    for (const line of newLines(before)) {
      if (/caught a|set a|broke|bait|trap/i.test(line)) story.push(`day ${s.day}: ${line}`);
    }
    Game.log.length = 0; before = 0;
    // re-set any broken traps so the trapline keeps working
    for (const id of ['snare', 'deadfall', 'box_trap', 'fish_weir']) {
      const has = (s.tools || []).some(t => t.recipeId === id) ||
        Game.tileAt(Game.map.px, Game.map.py).traps.some(t => t.recipeId === id);
      if (!has) {
        for (let i = 0; i < 6 && !Game.craft(id); i++) {}
        Game.setTrap(id);
      }
    }
  }
  console.log('\n--- trapline story (12 dawns, unseeded) ---');
  for (const line of story.slice(0, 25)) console.log('  ' + line);
  ok('feel: trapline produced catch/set/break narrative', story.length > 0, `${story.length} lines`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
