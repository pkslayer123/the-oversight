#!/usr/bin/env node
// BREAK-IT: food economy, round 3 (2026-10-10). Hostile attacks on vectors the
// 2026-10-09 layers and today's r1/r2 did NOT cover:
//
// U1. EXPLOIT — fractional-unit phantom kcal (the big one). Four engines
//     fractionated food units:
//       - Game._removePantryKcal (hierarchy.js) — tribute / aid-debt /
//         system-favor / bribe payments
//       - Game._evTakePantryKcal (game.js) — river-trader feed/trade takes
//       - Game._evTakePlayerFoodKcal (game.js) — river-trader + system-demo
//         takes from the player's pack
//       - Game._evTakeRawPlantKcal (game.js) — system cooking-demo takes
//     A 0.5-unit crumb of 500-kcal food is 250 kcal of real value — but
//     eatOne grants a full 500 per bite (units 0.5 -> -0.5, spliced), and
//     takeFromPantry's miser coercion inflated sub-1 crumbs back to whole
//     units (0.4u x 500 -> 1u x 500). Measured: 500 in -> 750 out (+50%).
//     Steve's standing law is "no fractionating" (pantryDraw ceils; the
//     player's draw ceils, proved behavior). The _ev comment justifying
//     fractions ("a 5000-kcal sack to feed one trader") is stale:
//     stockPantry granulates to <=500-kcal pieces since 2026-10-08.
//     FIX: all four take whole units only (ceil), over-removing honestly;
//     the three miser coercions (takeFromPantry, takeFromCache, buryCache)
//     collapse legacy fractional stacks value-preservingly (1 unit carrying
//     the fractional value) instead of inflating (sub-1 -> 1 @ full kcalEach)
//     or sinking (floor).
// U2. HONESTY — justice fine food vanished. justiceRespond('pay') consumed
//     real pack food and called this.addPantryKcal(...) — a function that was
//     NEVER defined anywhere. The guard made it a silent no-op: the fiction
//     says "X takes it. Counts it." but the village got nothing. FIX: the
//     paid kcal enters the pantry as real items (stockPantry 'Restitution').
//     Not recorded in the gives ledger: seizure isn't a gift (avoids the
//     take-back penalty misfiring on fine food).
// U3. HONESTY — feast button label overstated the cost. app.js computed
//     cost = max(1500, 400 * rosterN) on the FULL roster; the engine charges
//     max(1500, 400 * (present+1)) where present excludes away villagers.
//     With 2 villagers away the label read 800 kcal high. FIX: the label
//     mirrors the engine formula exactly (roster minus v.away).
// D3. DEAD-CODE — addPantryKcal was referenced but never defined (static).
//
// Usage: node scripts/test-break-food-20261010d.js
//        BEFORE=1 node scripts/test-break-food-20261010d.js
//        SEED=99 node scripts/test-break-food-20261010d.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

// Files this run changes. BEFORE mode loads them from git HEAD.
const PRE = ['src/js/game.js', 'src/js/hierarchy.js', 'src/js/storage.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/app.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bf10d-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bf10d-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
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
  // pantry tests need haven access for takeFromPantry
  try { Game.state.scholar.insideHaven = true; } catch (e) {}
  return Game.state.scholar;
}
function smokedVenison(units, kcalEach) {
  const s = Game.state.scholar;
  return {
    name: 'Smoked venison', units, kcalEach: kcalEach || 500, kg: 0.5,
    spoilDay: (s.day || 1) + 30, safe: true, foodKind: 'meat',
    foodState: 'preserved', edible: true, unit: 'portion',
  };
}
function packKcal() {
  return (Game.state.scholar.inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
}
function pantryKcal() {
  return (Game.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
}
function noFractions(list) {
  return (list || []).every(i => { const u = i.units || 0; return Math.floor(u) === u; });
}
// Eat every edible unit in the pack via the real eatOne path; return kcal granted.
function eatAllPack() {
  const s = Game.state.scholar;
  let granted = 0;
  s.kcal = 0;
  let guard = 200;
  while (guard-- > 0) {
    const idx = (s.inventory || []).findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && i.edible !== false);
    if (idx < 0) break;
    const before = s.kcal;
    try { Game.eatOne(idx); } catch (e) { break; }
    granted += Math.max(0, s.kcal - before);
    if (s.kcal >= Game.kcalCap()) break;
  }
  return granted;
}

(async () => {
  await Game.init();
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  Game.drama = () => {};
  Game.audioEvent = () => {};
  console.log(`seed=${SEED}`);

// ---------- U1: _evTakePlayerFoodKcal fractionates the pack -> eatOne phantom ----------
(function () {
  freshGame();
  const s = Game.state.scholar;
  s.inventory.length = 0; // isolate: only the test stack is edible
  s.inventory.push(smokedVenison(1, 500)); // 500 kcal in
  const taken = Game._evTakePlayerFoodKcal(250);
  const crumb = s.inventory.find(i => i.name === 'Smoked venison');
  ok('U1a take reports actuals', taken === 250 || taken === 500, 'taken=' + taken);
  ok('U1b no fractional units left in pack', !crumb || noFractions([crumb]),
    crumb ? 'units=' + crumb.units : 'gone-whole');
  // conservation: taken + everything eatable from the pack == 500 in
  const eaten = eatAllPack();
  const total = taken + eaten;
  ok('U1c pack conservation: taken+eaten == 500 in', total === 500, 'taken=' + taken + ' eaten=' + eaten);
})();

// ---------- U2: _removePantryKcal fractionates -> takeFromPantry inflates ----------
(function () {
  freshGame();
  const s = Game.state.scholar, v = Game.state.village;
  s.inventory.length = 0; // isolate: only taken food is edible
  v.pantry = [smokedVenison(2, 500)]; // 1000 kcal in
  const paid = Game._removePantryKcal(700);
  ok('U2a paid is whole-unit honest', paid === 700 || paid === 1000, 'paid=' + paid);
  ok('U2b no fractional units left in pantry', noFractions(v.pantry),
    'units=' + (v.pantry.map(i => i.units).join(',') || 'empty'));
  // conservation: paid + pantry remainder + what the player can take&eat == 1000
  const pantryLeft = pantryKcal();
  let takenEaten = 0;
  if (v.pantry.length) {
    const idx = v.pantry.findIndex(i => (i.kcalEach || 0) > 0);
    if (idx >= 0) {
      try { Game.takeFromPantry(idx); } catch (e) {}
      takenEaten = eatAllPack();
    }
  }
  const total = paid + pantryLeft + takenEaten;
  ok('U2c pantry conservation: paid+left+eaten == 1000 in', total === 1000,
    'paid=' + paid + ' left=' + pantryLeft + ' eaten=' + takenEaten);
})();

// ---------- U3 (sibling): _evTakePantryKcal ----------
(function () {
  freshGame();
  const v = Game.state.village;
  v.pantry = [smokedVenison(2, 500)]; // 1000 in
  const taken = Game._evTakePantryKcal(700);
  ok('U3a no fractional units left in pantry', noFractions(v.pantry),
    'units=' + (v.pantry.map(i => i.units).join(',') || 'empty'));
  ok('U3b conservation: taken+remainder == 1000', taken + pantryKcal() === 1000,
    'taken=' + taken + ' remainder=' + pantryKcal());
})();

// ---------- U4 (sibling): _evTakeRawPlantKcal ----------
(function () {
  freshGame();
  const s = Game.state.scholar;
  s.inventory.length = 0; // isolate: only the test stack counts
  s.inventory.push({
    name: 'Wild tubers', plantId: 'tuber_test', units: 3, kcalEach: 100, kg: 0.3,
    spoilDay: (s.day || 1) + 2, safe: true, foodKind: 'plant', edible: true,
  }); // 300 in
  const taken = Game._evTakeRawPlantKcal(150);
  ok('U4a no fractional units left in pack', noFractions(s.inventory),
    'units=' + s.inventory.map(i => i.units).join(','));
  ok('U4b conservation: taken+pack == 300', taken + packKcal() === 300,
    'taken=' + taken + ' pack=' + packKcal());
})();

// ---------- U5: justice fine food reaches the village ----------
(function () {
  freshGame();
  const s = Game.state.scholar, v = Game.state.village;
  const other = (v.roster || []).find(id => id !== Game.villagerId) || 'v_test';
  const j = Game.justiceState();
  j.pendingConfront = true; j.confrontedBy = other; j.stage = 2; j.crimes = [];
  s.inventory.length = 0; // isolate: only venison is payable
  s.inventory.push(smokedVenison(4, 500)); // 2000 in pack
  v.pantry = [];
  const packBefore = packKcal();
  const owed = Game.justiceRestitutionOwed(); // 1500, no crimes
  Game.justiceRespond('pay');
  const packAfter = packKcal();
  const pantryAfter = pantryKcal();
  ok('U5a fine consumed real pack food', packBefore - packAfter === 1500,
    'pack delta=' + (packBefore - packAfter));
  ok('U5b fine food reaches the village pantry (not vanished)', pantryAfter === 1500,
    'pantry=' + pantryAfter + ' (BEFORE: 0 — addPantryKcal phantom)');
  ok('U5c conservation: pack+pantry unchanged overall', (packAfter + pantryAfter) === packBefore,
    'pack=' + packAfter + ' pantry=' + pantryAfter);
})();

// ---------- U6: feast label mirrors the engine ----------
(function () {
  // eval the label's cost formula from app.js source (app.js is DOM-only, not eval'd)
  const appSrc = srcOf('src/js/app.js');
  const m = appSrc.match(/const cost = (Math\.max\(1500, 400 \* [^;]+\));[\s\S]{0,400}Host a feast/);
  ok('U6a feast label computes a cost', !!m, 'label formula not found');
  if (m) {
    // run the label formula against a staged village: 12 roster, 2 away
    freshGame();
    const v = Game.state.village;
    const rosterIds = v.roster || [];
    const awayIds = rosterIds.filter(id => id !== Game.villagerId).slice(0, 2);
    v.away = v.away || {};
    for (const id of awayIds) v.away[id] = { nx: 0, ny: 0 };
    const rosterN = rosterIds.length;
    let awayN = 0;
    try {
      const awayMap = (Game.state && Game.state.village && Game.state.village.away) || {};
      awayN = Object.keys(awayMap).filter(id => id !== Game.villagerId).length;
    } catch (e) {}
    // replicate the label expression with rosterN/awayN in scope
    const labelCost = eval(`(function(){ const rosterN=${rosterN}, awayN=${awayN}; return (${m[1]}); })()`);
    // engine formula from hostFeast
    const present = rosterIds.filter(id => id !== Game.villagerId && !(v.away && v.away[id]));
    const engineCost = Math.max(1500, 400 * (present.length + 1));
    ok('U6b label cost == engine cost with villagers away', labelCost === engineCost,
      'label=' + labelCost + ' engine=' + engineCost + ' (roster=' + rosterN + ' away=' + awayN + ')');
    delete v.away;
  }
})();

// ---------- D3: dead reference scan ----------
(function () {
  const all = ['src/js/game.js', 'src/js/food.js', 'src/js/storage.js', 'src/js/justice.js',
    'src/js/hierarchy.js', 'src/js/comms.js', 'src/js/betrayal.js', 'src/js/app.js',
    'src/js/corpses.js', 'src/js/abilityActions.js', 'src/js/carexplore.js']
    .map(f => srcOf(f)).join('\n');
  const refs = (all.match(/addPantryKcal/g) || []).length;
  ok('D3 addPantryKcal phantom reference is gone', refs === 0, refs + ' reference(s) remain');
})();

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED}, ${BEFORE ? 'BEFORE' : 'AFTER'})`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
