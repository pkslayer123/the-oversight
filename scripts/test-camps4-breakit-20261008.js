#!/usr/bin/env node
// BREAK-IT camps & structures, round 3 continued (2026-10-08, steering pass).
// Round 3 (break-camps-3.md) killed the packTent/destroyCell free-fire exploit
// and the mantle's phantom room. This file attacks the steering note's
// remaining surfaces: hidden caches, destroyCell secret hygiene, found tents.
//
// CATCHES:
//   D. INFINITE BURY (exploit, miser class): buryCache('food') with a
//      unit-less item: `qty = Math.min(qty, it.units || 1)` buries 1, then
//      `it.units -= qty` -> NaN, and `NaN <= 0` is false so the item stays.
//      Every later bury reads `NaN || 1` -> 1 again: bury 1 unit per action,
//      FOREVER, from one phantom item. (The miser run proved corrupt
//      unit-less entries reach player inventories; takeFromCache got the
//      coercion, buryCache didn't.)
//   E. STALE TENT SECRET (phantom object): destroyCell clears the cell to
//      null but never deletes t.secrets[cx,cy]. The stale {yours, condition}
//      secret outlives the tent on the tile object - and a later detail
//      regen pairing it with a fresh 'tent' cell would resurrect your
//      ownership of a tent you never pitched.
//   F. (held) cache save/load round-trip: bury -> save -> load -> dig keeps
//      the cache intact, no duplication, no loss. Documented as held.
//
// Harness: mulberry32, SEED env override (default 20261008), full src/js
// module list in index.html order minus DOM-only files and drama.js, window
// stubbed for eval then deleted, Math.random seeded BEFORE eval.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const _ls = {};
global.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
};
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) fails.push(name);
}
function blankDetail() {
  const d = [];
  for (let y = 0; y < 9; y++) { const r = []; for (let x = 0; x < 9; x++) r.push('dirt'); d.push(r); }
  return d;
}
function makeCtx() {
  const said = [];
  const tile = { detail: blankDetail(), secrets: {} };
  const ctx = Object.create(Game);
  Object.assign(ctx, {
    said,
    log: [],
    data: { villagers: [], monsters: [{ id: 'hushwolf', size: 1 }], synergies: [], items: [] },
    dayPart: 2,
    villagerId: 'v1',
    state: {
      version: 1,
      scholar: { villagerId: 'v1', mx: 4, my: 4, day: 1, dayTicks: 0, inventory: [], kcal: 1000, health: 100 },
      camp: null, fires: [],
      village: { name: 'Haven', px: 4, py: 4, roster: ['v1'], trust: { v1: 80 } },
      codex: { plants: {}, monsters: {}, places: [] },
    },
    map: { px: 0, py: 0, tiles: { 0: { 0: tile }, 4: { 4: { detail: blankDetail(), secrets: {} } } }, dirty: false },
    say(msg) { said.push(String(msg)); },
    tickAction() {},
    audioEvent() {},
    bulldozerShrapnel() {},
  });
  return ctx;
}

// storage.js's module-closure helpers (day(), id gen) read the REAL Game,
// not the ctx. Lend it state for cache calls, then take it back.
function withGameState(ctx, fn) {
  const G = globalThis.Scattering.Game;
  const ps = G.state, pm = G.map;
  G.state = ctx.state; G.map = ctx.map;
  try { return fn(); } finally { G.state = ps; G.map = pm; }
}

console.log('D. buryCache must not mint infinite caches from a unit-less item');
{
  const ctx = makeCtx();
  // a corrupt unit-less food item (the miser run proved these reach inventories)
  ctx.state.scholar.inventory.push({ name: 'Mystery meat', kcalEach: 200, kg: 0.5, spoilDay: 9999 });
  const before = ctx.playerCaches().length;
  withGameState(ctx, () => {
    ctx.buryCache('food', 0, 1);
    ctx.buryCache('food', 0, 1);
    ctx.buryCache('food', 0, 1);
  });
  const made = ctx.playerCaches().length - before;
  const buriedUnits = ctx.playerCaches().slice(before)
    .reduce((t, c) => t + c.items.reduce((t2, it) => t2 + (it.units || 0), 0), 0);
  const leftover = ctx.state.scholar.inventory.find(i => i.name === 'Mystery meat');
  // THE BREAK: pre-fix, 3 buries -> 3 caches of 1 unit each, item still there (NaN units).
  check('buried units are finite (one honest unit)', buriedUnits <= 1, true);
  check('corrupt item consumed, not left as NaN fountain', !leftover || Number.isFinite(leftover.units), true);
  check('caches created <= 1', made <= 1, true);
}
{
  // D2: normal items still bury exactly what they have.
  const ctx = makeCtx();
  ctx.state.scholar.inventory.push({ name: 'Dried meat', kcalEach: 400, units: 5, kg: 0.3, spoilDay: 9999 });
  withGameState(ctx, () => { ctx.buryCache('food', 0, 3); });
  const c = ctx.playerCaches()[ctx.playerCaches().length - 1];
  check('cache holds the buried units', c.items[0].units, 3);
  check('inventory keeps the remainder', ctx.state.scholar.inventory[0].units, 2);
}

console.log('E. destroyCell must not leave a stale tent secret behind');
{
  const ctx = makeCtx();
  ctx.state.scholar.inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5 });
  ctx.pitchTent(5, 4); // real pitch -> secret {yours:true}
  check('secret set by pitch', !!(ctx.playerTile().secrets['5,4'] || {}).yours, true);
  ctx.destroyCell(5, 4, 'bulldozer'); // smash, no camp -> breakCamp not called
  check('cell smashed', ctx.genDetail(0, 0)[4][5], null);
  check('stale secret purged', ctx.playerTile().secrets['5,4'] || null, null);
}
{
  // E2 (sibling): taking a found tent deletes its secret too.
  const ctx = makeCtx();
  const d = ctx.genDetail(0, 0);
  d[4][5] = 'tent';
  ctx.playerTile().secrets['5,4'] = { condition: 'packable', known: false };
  ctx._cellInteract(5, 4); // examine -> packable -> take
  check('found tent taken', d[4][5], 'dirt');
  check('packed tent in inventory',
    (ctx.state.scholar.inventory.find(i => i.kind === 'tent') || {}).units >= 1, true);
  check('found-tent secret purged', ctx.playerTile().secrets['5,4'] || null, null);
}
{
  // D3 (sibling): compost_king bury consumes a unit-less item (miser class).
  const ctx = makeCtx();
  ctx.state.scholar.inventory.push({ name: 'Mystery meat', kcalEach: 200, kg: 0.5 });
  const fired = ctx._activateAbilityInner('compost_king');
  check('compost activation fired', fired, true);
  check('unit-less item consumed, not NaN-fountained',
    !ctx.state.scholar.inventory.find(i => i.name === 'Mystery meat'), true);
  check('compost flag set', !!ctx.playerTile().compost, true);
}

console.log('F. (held) caches survive save/load: no dup, no loss');
{
  const ctx = makeCtx();
  ctx.state.scholar.inventory.push({ name: 'Dried meat', kcalEach: 400, units: 4, kg: 0.3, spoilDay: 9999 });
  withGameState(ctx, () => { ctx.buryCache('food', 0, 2); });
  const n1 = ctx.playerCaches().length;
  const u1 = ctx.playerCaches()[0].items[0].units;
  let ok = true, key = null;
  try { ctx.save(); key = globalThis.Scattering.state.saveKey(ctx.state); } catch (e) { ok = false; }
  check('save completes', ok, true);
  // simulate a fresh load into a new context over the same storage
  const ctx2 = makeCtx();
  let loaded = false;
  try { loaded = ctx2.load(key); } catch (e) { loaded = false; }
  check('load completes', loaded, true);
  const n2 = (ctx2.playerCaches ? ctx2.playerCaches() : ctx2.state.scholar.caches || []).length;
  check('cache count identical after load', n2, n1);
  const c2 = (ctx2.state.scholar.caches || [])[0];
  check('cache units identical after load', c2 && c2.items[0].units, u1);
  check('cache node identical after load', c2 && c2.node && c2.node.x, 0);
}

console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL GREEN');
process.exit(fails.length ? 1 : 0);
