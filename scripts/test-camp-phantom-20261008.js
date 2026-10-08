#!/usr/bin/env node
// CAMP PHANTOM PROOF (break-it camps 2026-10-08).
//
// ATTACK: the Bulldozer's lane smashes grid cells via destroyCell().
// 'tent' is in beamBlockingCells(), so a bulldozer can flatten the player's
// pitched tent. destroyCell() cleared the cell but never told the CAMP system:
// state.camp kept pointing at bare dirt.
//
// CONSEQUENCES (all demonstrated below):
//   1. PHANTOM CAMP: atCamp() still true at the tile -> the sort-the-bag
//      ritual (food.js:829, gated on atCamp()) and the prep-stash counter UI
//      keep working on an empty dirt patch with no tent and no fire.
//   2. SOFTLOCK: "Set up camp" refuses ("You already have a camp"), but there
//      is NO player-facing "abandon camp" action (only packTent, which needs
//      the tent, or a random storm). The player is stuck with a ghost camp.
//   3. SIBLING: destroyCell() smashing a 'fire' cell left the state.fires
//      entry behind -> playerFireAt() still true for a cell that is now null
//      (fire state split-brain: grid cell vs state.fires list).
//
// FIX (game.js destroyCell): when the destroyed cell is the player's tent on
// the camp's tile, call breakCamp() (its tent-sweep is idempotent — the cell
// is already cleared). When it is a fire cell, purge matching state.fires
// entries so playerFireAt() agrees with the grid.
//
// This test ENCODES THE FIXED BEHAVIOR — green means the phantom is gone:
//   A. bulldozer smashes camp tent -> state.camp cleared, atCamp() false,
//      break message names the camp's end.
//   B. smashing a NON-player tent, or a player tent on another tile, does NOT
//      break the camp.
//   C. bulldozer smashes a player fire -> state.fires entry purged,
//      playerFireAt() false (grid and list agree).
//   D. after the fix, the player can pitch a new tent + fire and set up camp
//      again (no phantom refusal).
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

// ---- minimal camp-capable context: real Game methods, stubbed I/O ----
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
    state: {
      scholar: { mx: 4, my: 4, day: 1, dayTicks: 0, inventory: [], kcal: 1000 },
      camp: null, fires: [], village: null,
    },
    map: { px: 0, py: 0, tiles: { 0: { 0: tile } }, dirty: false },
    say(msg) { said.push(String(msg)); },
    tickAction() {},           // clock stubbed: camp logic, not the clock, is under test
    audioEvent() {},
    bulldozerShrapnel() {},    // AoE stubbed: the lane's cell smash is under test
  });
  return ctx;
}
// place a player tent at (cx,cy) + a live player fire at (fx,fy)
function pitchAndFire(ctx, cx, cy, fx, fy) {
  const detail = ctx.genDetail(0, 0);
  detail[cy][cx] = 'tent';
  ctx.playerTile().secrets[cx + ',' + cy] = { condition: 'good', known: true, yours: true };
  detail[fy][fx] = 'fire';
  ctx.state.fires.push({ tx: 0, ty: 0, cx: fx, cy: fy, till: 1e12 });
}

console.log('A. bulldozer flattens the camp tent -> camp must break, no phantom');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  check('camp established', !!ctx.state.camp, true);
  check('atCamp true at camp', !!ctx.atCamp(), true);
  ctx.said.length = 0;
  ctx.destroyCell(5, 4, 'bulldozer');          // the hostile act
  check('tent cell cleared', ctx.genDetail(0, 0)[4][5], null);
  check('state.camp cleared (no phantom)', !!ctx.state.camp, false);
  check('atCamp false after tent destroyed', !!ctx.atCamp(), false);
  check('break message names the camp end',
    ctx.said.some(m => /camp is gone/i.test(m)), true);
}

console.log('B. non-camp tents do not break the camp');
{
  // B1: someone else's tent smashed at the camp tile
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  const detail = ctx.genDetail(0, 0);
  detail[4][6] = 'tent';
  ctx.playerTile().secrets['6,4'] = { condition: 'good', known: true, yours: false };
  ctx.destroyCell(6, 4, 'bulldozer');
  check('camp survives stranger-tent smash', !!ctx.state.camp, true);
  check('atCamp still true', !!ctx.atCamp(), true);
}
{
  // B2: the player's tent on ANOTHER tile smashed
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  ctx.map.tiles[0][1] = { detail: blankDetail(), secrets: {} };
  ctx.map.px = 1; // walk east; bulldozer hits the far tile
  const d2 = ctx.genDetail(1, 0);
  d2[4][5] = 'tent';
  ctx.playerTile().secrets['5,4'] = { condition: 'good', known: true, yours: true };
  ctx.destroyCell(5, 4, 'bulldozer');
  check('camp survives far-tile tent smash', !!ctx.state.camp, true);
  ctx.map.px = 0;
  check('atCamp true back at camp tile', !!ctx.atCamp(), true);
}

console.log('C. bulldozer smashes the campfire -> state.fires purged (no split-brain)');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  check('playerFireAt true before', ctx.playerFireAt(3, 4), true);
  ctx.destroyCell(3, 4, 'bulldozer');
  check('fire cell cleared', ctx.genDetail(0, 0)[4][3], null);
  check('state.fires entry purged', ctx.state.fires.length, 0);
  check('playerFireAt false after (grid and list agree)', ctx.playerFireAt(3, 4), false);
  // the tent still stands: the camp lives on as a tent camp (fire can be relit)
  check('camp survives fire loss (tent leg intact)', !!ctx.state.camp, true);
}

console.log('D. after the fix, the player can re-establish camp (no phantom refusal)');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  ctx.destroyCell(5, 4, 'bulldozer');
  check('camp gone after smash', !!ctx.state.camp, false);
  // pitch a fresh tent + fire, set up again
  pitchAndFire(ctx, 5, 5, 4, 3);
  ctx.state.scholar.mx = 5; ctx.state.scholar.my = 4;
  ctx.setUpCamp();
  check('new camp established', !!ctx.state.camp, true);
  check('atCamp true at new camp', !!ctx.atCamp(), true);
  check('no "already have a camp" refusal',
    ctx.said.some(m => /already have a camp/i.test(m)), false);
}

console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL GREEN');
process.exit(fails.length ? 1 : 0);
