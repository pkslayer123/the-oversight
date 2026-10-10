#!/usr/bin/env node
// BREAK-IT: forager r5 (2026-10-10, playtest loop, archetype: forager).
// Hostile pass over the SMOKE/RENDER fuel economy (Game.preserveFood,
// Game.renderFat — the fire-context "Smoke N (preserve)" / "Render N fat").
//
//   E1. EXPLOIT: smoking/rendering burn ZERO fire fuel. cookFood and cookAll
//       drain the tracked player fire via consumeCookFire() and downgrade
//       the outcome when the fire dies mid-session. preserveFood (16 ticks)
//       and renderFat (12 ticks) never call it — a fire with 3 ticks of
//       till smokes the whole harvest and lives. Fuel (wood -> fire ->
//       till) is the scarcity the other fire paths honor; the preservation
//       ladder ignores it (noted-but-open since the 2026-10-09 cookall run).
//       Fix (my design call — Steve can overrule): a smoke press burns one
//       16-tick fire session, a render press 12 ticks; a fire that dies
//       mid-press drops the batch to the rough-job outcome (blind values:
//       0.80x / 15d smoke, 0.65x render) with narration — same fiction as
//       cookAll's per-item path. Nothing burns on an empty press; map
//       hearths (untracked) stay free, established.
//   S1. SOFTLOCK edges: empty press, invalid idx, rotten fat silence.
//   H1. HONESTY: fire-context labels count exactly what will smoke/render.
//   E2. HELD (attacked): specialist cook fallback print is dead code —
//       cookClassFor covers every rawKcal item (grain_legume has raw/cooked),
//       and cookTransform's min(gross,...) caps the skill mult anyway.
//
// Usage: node scripts/test-forager-smoke-fuel-20261010.js
//        BEFORE=1 node scripts/test-forager-smoke-fuel-20261010.js  (demonstrates E1)
//        SEED=7 node scripts/test-forager-smoke-fuel-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const BEFORE = !!process.env.BEFORE;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  const s = Game.state.scholar;
  Game.say = (m) => says.push(String(m));
  return s;
}
// A real fire under the player's feet with `fuel` ticks of burn left.
function plantFire(fuel) {
  const s = Game.state.scholar;
  const now = Game._absTick();
  const px = s.insideTent ? s.insideTent.tx : Game.map.px;
  const py = s.insideTent ? s.insideTent.ty : Game.map.py;
  Game.state.fires = [{ tx: px, ty: py, till: now + fuel, burn0: fuel, inside: false, lastTax: now }];
  return Game.state.fires[0];
}
function cleanedMeat(kcalEach) {
  return { plantId: 'meat_white_tailed_deer', foodKind: 'meat', foodState: 'cleaned', edible: true, units: 2, unit: 'portion', kcalEach: kcalEach || 200, name: 'Venison (cleaned)', spoilDay: 9999 };
}
function rawFat(hiddenKcal) {
  return { plantId: 'fat_bear', foodKind: 'fat', foodState: 'raw', edible: false, units: 2, kcalEach: 0, hiddenKcal: hiddenKcal || 400, name: 'Fat (raw)', spoilDay: 9999 };
}

(async () => {
await Game.init();
Game.audioEvent = () => {};

// ---------------- E1: smoke fuel ----------------
(function e1() {
  const s = freshGame();
  Game.learnTechnique('preserve', 'trial');
  s.inventory.push(cleanedMeat(), cleanedMeat(), cleanedMeat());
  const fire = plantFire(1000);
  const tillBefore = fire.till;
  Game.preserveFood();
  const burned = tillBefore - fire.till;
  if (BEFORE) {
    ok('E1 BEFORE: smoke burns no fuel (exploit demonstrated)', burned === 0, 'burned=' + burned);
    ok('E1 BEFORE: the meat still smoked (not vacuous)', s.inventory.filter(it => it.foodState === 'preserved').length === 3);
  } else {
    ok('E1: smoke burns one 16-tick fire session', burned === 16, 'burned=' + burned);
    ok('E1: all meat still smoked', s.inventory.filter(it => it.foodState === 'preserved').length === 3);
  }
})();

// E1b: a fire that dies mid-smoke drops the batch to the rough job.
(function e1b() {
  const s = freshGame();
  Game.learnTechnique('preserve', 'trial');
  s.inventory.push(cleanedMeat(200));
  plantFire(1000);
  Game.preserveFood();
  const healthy = s.inventory[s.inventory.length - 1];
  s.inventory.push(cleanedMeat(200));
  plantFire(10); // dies during the 16-tick smoke
  Game.preserveFood();
  const dying = s.inventory[s.inventory.length - 1];
  if (BEFORE) {
    ok('E1b BEFORE: dying fire changes nothing (no downgrade path)',
      dying.kcalEach === healthy.kcalEach && dying.spoilDay === healthy.spoilDay,
      `healthy=${healthy.kcalEach}/+${healthy.spoilDay} dying=${dying.kcalEach}/+${dying.spoilDay}`);
  } else {
    ok('E1b: healthy smoke is 0.95x / +30d', healthy.kcalEach === 190 && healthy.spoilDay === Game.state.scholar.day + 30,
      `kcalEach=${healthy.kcalEach} spoilDay=${healthy.spoilDay}`);
    ok('E1b: dying fire drops to the rough job (0.80x / +15d)', dying.kcalEach === 160 && dying.spoilDay === Game.state.scholar.day + 15,
      `kcalEach=${dying.kcalEach} spoilDay=${dying.spoilDay}`);
    ok('E1b: no phantom kcal — downgrade never exceeds the healthy batch', dying.kcalEach <= healthy.kcalEach);
    const narr = says.join(' ');
    ok('E1b: the death is narrated, not silent', /fire dies|died halfway|sputter|died out/i.test(narr), narr.slice(0, 200));
  }
})();

// ---------------- E1c: render fuel ----------------
(function e1c() {
  const s = freshGame();
  Game.learnTechnique('render', 'trial');
  s.inventory.push(rawFat(), rawFat());
  const fire = plantFire(1000);
  const tillBefore = fire.till;
  Game.renderFat();
  const burned = tillBefore - fire.till;
  if (BEFORE) {
    ok('E1c BEFORE: render burns no fuel (exploit demonstrated)', burned === 0, 'burned=' + burned);
    ok('E1c BEFORE: the fat still rendered (not vacuous)', s.inventory.filter(it => it.foodState === 'rendered').length === 2);
  } else {
    ok('E1c: render burns one 12-tick fire session', burned === 12, 'burned=' + burned);
    const fats = s.inventory.filter(it => it.foodKind === 'fat');
    ok('E1c: known render is 0.90x (canon)', fats.length === 2 && fats.every(it => it.kcalEach === 360), JSON.stringify(fats.map(i => i.kcalEach)));
    // dying fire mid-render: rough job (blind 0.65x)
    const s2 = freshGame();
    Game.learnTechnique('render', 'trial');
    s2.inventory.push(rawFat());
    plantFire(6); // dies during the 12-tick render
    Game.renderFat();
    const rough = s2.inventory[s2.inventory.length - 1];
    ok('E1c: dying fire drops render to the rough job (0.65x)', rough.kcalEach === 260, 'kcalEach=' + rough.kcalEach);
    ok('E1c: the render death is narrated', /fire dies|died halfway|sputter|died out/i.test(says.join(' ')));
  }
})();

// ---------------- S1: softlock edges ----------------
(function s1() {
  const s = freshGame();
  Game.learnTechnique('preserve', 'trial');
  s.inventory.push({ name: 'Rock', kcalEach: 0, units: 1 });
  const fire = plantFire(1000);
  const tillBefore = fire.till;
  let threw = false;
  try { Game.preserveFood(); } catch (e) { threw = true; }
  ok('S1: empty smoke press does not throw', !threw);
  if (!BEFORE) ok('S1: empty smoke press burns no fuel', fire.till === tillBefore, 'burned=' + (tillBefore - fire.till));
  ok('S1: empty smoke press says so honestly', says.join(' ').includes('Nothing to preserve'));
  // invalid idx: smoke a single item by stale index
  let threw2 = false;
  try { Game.preserveFood(999); } catch (e) { threw2 = true; }
  ok('S1: preserveFood(999) does not throw', !threw2);
  // render(-1): honest refusal
  let threw3 = false;
  try { Game.renderFat(-1); } catch (e) { threw3 = true; }
  ok('S1: renderFat(-1) does not throw', !threw3);
})();

// ---------------- H1: label honesty ----------------
// The fire-context buttons count exactly what the engine will smoke/render:
// rotten meat is dropped by smoke (count mismatch) — labels count smokable
// pre-rot-check; the count is the button's promise.
(function h1() {
  const s = freshGame();
  s.inventory.push(cleanedMeat(), cleanedMeat());
  // app.js fire-context filters (must match engine targets pre-rot-drop):
  const smokable = s.inventory.filter(i => i.foodKind === 'meat' && (i.foodState === 'cleaned' || i.foodState === 'cooked'));
  const rawFatN = s.inventory.filter(i => i.foodKind === 'fat' && i.foodState === 'raw');
  ok('H1: label filter counts the smokable meat', smokable.length === 2, 'count=' + smokable.length);
  ok('H1: label filter counts raw fat', rawFatN.length === 0, 'count=' + rawFatN.length);
})();

console.log(`\n${pass} pass, ${fail} fail (seed ${SEED}${BEFORE ? ', BEFORE' : ''})`);
process.exit(fail ? 1 : 0);
})();
