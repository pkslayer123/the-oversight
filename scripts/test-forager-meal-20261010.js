#!/usr/bin/env node
// PLAYTEST forager 2026-10-10 — hostile attacks on the COMMUNAL MEAL path
// (villageMeal, game.js). The villagers' pantry draw uses {cook:true} +
// exposure -> villagerFoodPoisoning/villagerMonsterWeirdness. The PLAYER's
// communal meal draws pantryDraw(v, want, {}) — no cook transform, no
// exposure ledger, no consequence rolls at all.
//
// M1. EXPLOIT — communal-meal monster-weirdness immunity. Cooked hushwolf
//     meat in the pantry (foodState 'cooked', no parasiteRisk — the worms
//     are dead, honestly). Eat it yourself: maybeMonsterWeirdness rolls
//     20% (cooked) — cooking does NOT cure howlbelly (DISEASES.md: alien
//     diseases are permanent warping, never touched by mundane means).
//     Eat it via the communal meal: ZERO rolls — the player launders weird
//     meat through the pantry for free calories while villagers roll 20%.
// M2. HONESTY — rawKcal staples shortchanged. Rice {rawKcal:200,
//     cookedKcal:350}: the villager draw applies the perfect cook transform
//     (350/unit); the player's communal draw takes rawKcal value (200).
//     Same pantry, same village cook, different math — the player loses
//     ~43% of the staple's value by omission.
// M3. NO-LAUNDER — the village "cooking" the drawn units must not wash the
//     pantry stack: wormy cleaned meat left in the pantry keeps its
//     parasiteRisk after a communal meal (T1 class, 2026-10-10).
// M4. HONESTY — village-cooked needsCooking items count as cooked-safe.
//     The player's own fire sets safe=true on cooked rawKcal items
//     ("cooking kills the risk (mostly)"); the village abstraction must
//     match — otherwise cooked rice rolls bad-belly forever, for villagers
//     (trackMealExposure) and for the player (new consequence path).
// M5. SOFTLOCK — preserveFood/renderFat with a garbage index: null, no
//     throw, no phantom tick burn.
//
// Usage: node scripts/test-forager-meal-20261010.js
//        BEFORE=1 node scripts/test-forager-meal-20261010.js
//        SEED=99 node scripts/test-forager-meal-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

const PRE = ['src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/fm10-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/fm10-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seededRandom = mulberry32(SEED);
Math.random = seededRandom; // seeded BEFORE eval: modules capture Math.random at load

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

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const sc = Game.state.scholar;
  const v = Game.state.village;
  // haven tile for pantryInReach; full trust share (2200); empty bank
  const tile = Game.playerTile();
  if (tile) tile.type = 'haven';
  v.trust = v.trust || {}; v.trust[Game.villagerId] = 70;
  sc.kcal = 0; sc.health = 100;
  v.pantry = [];
  return { sc, v };
}
// force every chance roll to trigger (or never), then restore the seed
function withRng(val, fn) {
  const keep = Math.random;
  Math.random = () => val;
  try { return fn(); } finally { Math.random = keep; }
}
const hasPlayerStatus = (id) => !!(Game.hasStatus && Game.hasStatus('scholar', id));

(async () => {
await Game.init();
Game.drama = () => {};
Game.audioEvent = () => {};

console.log('== M1. communal-meal monster-weirdness immunity ==');
{
  const { sc, v } = freshGame();
  ok('M1a cooking data loaded', !!(Game.data.cooking && Game.data.cooking.monsterDiseases && Game.data.cooking.monsterDiseases.length));
  // cooked hushwolf meat: worms dead (no parasiteRisk), weirdness survives the fire
  v.pantry = [{
    name: 'Hushwolf meat (cooked)', foodKind: 'meat', foodState: 'cooked',
    plantId: 'meat_hushwolf', kcalEach: 400, units: 6, spoilDay: sc.day + 5,
    safe: true, kg: 0.5, unit: 'portion',
  }];
  withRng(0, () => Game.villageMeal());
  ok('M1b communal meal of cooked weird meat applies howlbelly (cooked 20%)',
    hasPlayerStatus('howlbelly'), 'player immune by omission — free weird-meat calories');
  ok('M1c codex records the meat disease',
    !!((Game.state.codex.monsters || {}).hushwolf || {}).meatDisease,
    'codex should warn the next cook');
}

console.log('== M2. rawKcal staple shortchange ==');
{
  const { sc, v } = freshGame();
  v.pantry = [{
    name: 'Rice', rawKcal: 200, cookedKcal: 350, kcalEach: 200, units: 65,
    spoilDay: sc.day + 365, safe: false, needsCooking: true, kg: 0.5, unit: 'scoop',
  }];
  withRng(0.999, () => Game.villageMeal()); // rng high: no consequence rolls fire
  // want = min(2200 share, room) ; village-cooked rice = 350/unit, ceil(2200/350)=7u
  const expectUnits = Math.ceil(2200 / 350);
  ok('M2a communal meal values village-cooked rice at 350/unit',
    v.lastPlayerMeal === expectUnits * 350, `taken=${v.lastPlayerMeal} (raw-value bug: 2200)`);
  ok('M2b pantry drew 7 units, stack keeps its rawKcal (village cooked the draw, not the stack)',
    v.pantry.length === 1 && v.pantry[0].units === 65 - expectUnits && v.pantry[0].rawKcal === 200,
    `units=${v.pantry[0] && v.pantry[0].units} rawKcal=${v.pantry[0] && v.pantry[0].rawKcal}`);
}

console.log('== M3. no laundering of the pantry stack ==');
{
  const { sc, v } = freshGame();
  v.pantry = [{
    name: 'Bear meat (cleaned)', foodKind: 'meat', foodState: 'cleaned',
    plantId: 'meat_black_bear', kcalEach: 400, units: 10, spoilDay: sc.day + 2,
    safe: true, kg: 0.5, unit: 'portion', hiddenKcal: 2400,
    parasiteRisk: { id: 'trichinosis', p: 0.25 },
  }];
  withRng(0.999, () => Game.villageMeal());
  const left = v.pantry[0];
  ok('M3a leftover wormy stack keeps parasiteRisk after the communal meal',
    !!(left && left.parasiteRisk && left.parasiteRisk.id === 'trichinosis'),
    'village cooking the draw must not wash the stack');
  ok('M3b the communal meal itself does not give the player trichinosis (village cooked the draw)',
    !hasPlayerStatus('trichinosis') && !(sc.diseases || []).some(d => /trichinosis/i.test(d.id || d)),
    'fiction: the village fire killed the drawn worms');
}

console.log('== M4. village-cooked needsCooking counts as safe ==');
{
  const { sc, v } = freshGame();
  v.pantry = [{
    name: 'Dried beans', rawKcal: 150, cookedKcal: 300, kcalEach: 150, units: 40,
    spoilDay: sc.day + 365, safe: false, needsCooking: true, kg: 0.5, unit: 'scoop',
  }];
  const hpBefore = sc.health;
  withRng(0, () => Game.villageMeal()); // rng 0: any counted unsafe roll WOULD fire
  ok('M4a village-cooked beans do not roll bad-belly on the player',
    sc.health === hpBefore, `health ${hpBefore} -> ${sc.health}`);
  // villager side: trackMealExposure with village cooking must not flag unsafe either
  const exp = Game.freshExposure();
  const bean = { name: 'Dried beans', safe: false, needsCooking: true, rawKcal: 150 };
  Game.trackMealExposure(exp, bean, true);
  ok('M4b trackMealExposure: village-cooked needsCooking is not unsafe',
    exp.unsafe === 0, `unsafe=${exp.unsafe}`);
  const exp2 = Game.freshExposure();
  Game.trackMealExposure(exp2, { name: 'Suspect mash', safe: false }, true);
  ok('M4c genuinely unsafe food still flags (no overcorrection)',
    exp2.unsafe === 1, `unsafe=${exp2.unsafe}`);
}

console.log('== M5. smoke/render garbage index ==');
{
  freshGame();
  let threw = false, t0 = 0, t1 = 0;
  try {
    t0 = Game.state.scholar.ticksLeft || Game.state.scholar.ticks || 0;
    const r1 = Game.preserveFood(999); const r2 = Game.renderFat(-1);
    t1 = Game.state.scholar.ticksLeft || Game.state.scholar.ticks || 0;
    ok('M5a preserveFood(999) returns null', r1 === null || r1 === undefined, String(r1));
    ok('M5b renderFat(-1) returns null', r2 === null || r2 === undefined, String(r2));
  } catch (e) { threw = true; console.log('    threw: ' + e.message); }
  ok('M5c no throw on garbage index', !threw);
  ok('M5d no ticks burned on garbage index', t0 === t1, `${t0} -> ${t1}`);
}

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED}, ${BEFORE ? 'BEFORE' : 'AFTER'})`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
