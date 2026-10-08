#!/usr/bin/env node
// BREAK-IT camps & structures, 2nd pass (2026-10-08, worker break-camps2).
//
// First pass (break-camps.md) killed the destroyCell phantom camp. Since then
// NEW camp code landed unattacked: tent-breach (wreckTent/pendingInTent),
// storm-break, tent rooms (interior fires). This test hunts the new surface.
//
// CATCHES (each section demonstrates a break, then encodes the fix):
//   A. wreckTent (big-monster tent breach) never told the camp system ->
//      state.camp survived on a wrecked tent: phantom camp take 2 (sort ritual
//      + prep-stash on dirt, "Set up camp" refuses, no abandon action).
//   B. breakCamp's message lies: packTent path says "The tent's wrecked" when
//      you packed it, and "the fire's cold" when the fire keeps burning.
//      Destruction paths say "the fire's cold" while camp-tile fires keep
//      burning, feedable (copy vs engine).
//   C. setUpCamp refuses ("already have a camp... let it go") but NO abandon
//      action exists — "let it go" is a phantom promise. The design comment
//      says "Setting up a new camp abandons the old one" — engine disagreed.
//   D. pendingInTent (monster IN the tent with you) blocks nothing: the tent
//      room screen keeps offering Light/Fire/Cook/Vent/Sleep/Exit, and the
//      Game functions all run. Cooking a meal while it watches is absurd;
//      exiting leaves the fiction ("INSIDE the tent") stranded.
//   E. sweepDeadFires eats the tent: an expired INTERIOR fire clears the tent
//      CELL (its cx,cy is the tent's cell) -> tent vanishes when the fire
//      burns out; validateInsideTent dumps you with "wrecked while you were
//      away". (Sibling of the fire/grid split-brain class.)
//   F. playerFireAt matches interior fires: the outside feed path can feed a
//      tent-interior fire at full burn through the grid.
//   G. Save/load drops a pending tent breach (pendingEncounter/pendingInTent
//      never persisted) -> save-scum the breach: reload and the monster never
//      existed. The designed risk ("sleeping with a fire lit is a decision")
//      is dodgeable for free.
//
// FIXES (game.js): wreckTent breaks the camp when the wrecked tent is on the
// camp tile (+purges its interior fire); breakCamp reason-aware messages +
// destruction fire sweep; setUpCamp auto-abandons a foreign-tile camp;
// _breachLock() guard on tent actions/sleep/exitTent; sweepDeadFires skips
// interior-fire cell clearing (+only clears 'fire' cells); playerFireAt
// ignores inside fires; syncRun/load persist the pending encounter triple.
// app.js: tent-room screen shows only the breach card while pendingInTent.
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
// localStorage stub: in-memory, so save()/load() round-trip for real.
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
    data: { villagers: [], monsters: [{ id: 'hushwolf', size: 1 }], synergies: [] },
    dayPart: 2,
    state: {
      version: 1, // SAVE_VERSION — S.state.load rejects version-mismatched saves
      scholar: { mx: 4, my: 4, day: 1, dayTicks: 0, inventory: [], kcal: 1000, health: 100 },
      camp: null, fires: [], village: {}, codex: { plants: {}, monsters: {} },
    },
    map: { px: 0, py: 0, tiles: { 0: { 0: tile } }, dirty: false },
    say(msg) { said.push(String(msg)); },
    tickAction() {},
    audioEvent() {},
    bulldozerShrapnel() {},
  });
  return ctx;
}
// player's pitched tent at (cx,cy) + live OUTSIDE player fire at (fx,fy)
function pitchAndFire(ctx, cx, cy, fx, fy) {
  const detail = ctx.genDetail(ctx.map.px, ctx.map.py);
  detail[cy][cx] = 'tent';
  ctx.playerTile().secrets[cx + ',' + cy] = { condition: 'good', known: true, yours: true };
  detail[fy][fx] = 'fire';
  ctx.state.fires.push({ tx: ctx.map.px, ty: ctx.map.py, cx: fx, cy: fy, till: 1e12 });
}
function lightInterior(ctx, cx, cy, till) {
  ctx.state.fires.push({ tx: ctx.map.px, ty: ctx.map.py, cx, cy, till: till == null ? 1e12 : till, inside: true });
}

console.log('A. wreckTent (monster breach) must break the camp on its tile');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  ctx.state.scholar.insideTent = { tx: 0, ty: 0, cx: 5, cy: 4 };
  // what wandererTentBreach's big-monster branch does:
  ctx.wreckTent(0, 0, 5, 4);
  check('tent cell cleared', ctx.genDetail(0, 0)[4][5], 'dirt');
  check('state.camp cleared (no phantom)', !!ctx.state.camp, false);
  check('atCamp false after wreck', !!ctx.atCamp(), false);
  check('break message names the camp end', ctx.said.some(m => /camp is gone/i.test(m)), true);
  // and the player can set up again (no phantom refusal)
  pitchAndFire(ctx, 5, 5, 4, 3);
  ctx.state.scholar.mx = 5; ctx.state.scholar.my = 4;
  ctx.said.length = 0;
  ctx.setUpCamp();
  check('new camp established after wreck', !!ctx.state.camp, true);
  check('no "already have a camp" refusal', ctx.said.some(m => /already have a camp/i.test(m)), false);
}
{
  // A2: wrecking a tent on a NON-camp tile must not break the camp
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  ctx.map.tiles[0][1] = { detail: blankDetail(), secrets: {} };
  const d2 = ctx.genDetail(1, 0);
  d2[4][5] = 'tent';
  ctx.map.tiles[0][1].secrets['5,4'] = { condition: 'good', known: true, yours: true };
  ctx.wreckTent(1, 0, 5, 4);
  check('camp survives far-tile wreck', !!ctx.state.camp, true);
  check('far tent cell cleared', ctx.genDetail(1, 0)[4][5], 'dirt');
}

console.log('B. breakCamp messages must match the engine (fire honesty)');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  lightInterior(ctx, 5, 4);
  ctx.setUpCamp();
  ctx.said.length = 0;
  ctx.breakCamp('the storm tore through it');
  check('camp gone', !!ctx.state.camp, false);
  check('grid fire extinguished', ctx.genDetail(0, 0)[4][3], 'dirt');
  check('fires list empty (grid + interior)', ctx.state.fires.length, 0);
  check('playerFireAt false after', ctx.playerFireAt(3, 4), false);
  check('message says the fire is out', ctx.said.some(m => /fire's (scattered cold|cold)/i.test(m)), true);
}
{
  // B2: packTent path — the tent is PACKED, not wrecked; the fire keeps burning
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  ctx.said.length = 0;
  ctx.packTent(5, 4);
  const tentItem = (ctx.state.scholar.inventory || []).find(i => i.kind === 'tent');
  check('tent back in pack', !!(tentItem && tentItem.units > 0), true);
  check('camp gone after pack', !!ctx.state.camp, false);
  check('message does NOT claim the tent wrecked', ctx.said.some(m => /tent's wrecked/i.test(m)), false);
  check('message does NOT claim the fire is cold', ctx.said.some(m => /fire's (scattered cold|cold)/i.test(m)), false);
  check('fire honestly keeps burning', ctx.playerFireAt(3, 4), true);
}

console.log('C. setUpCamp abandons the old camp (no phantom "let it go")');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  check('camp on tile 0', ctx.state.camp && ctx.state.camp.px, 0);
  // move to tile 1, pitch a fresh tent + fire there
  ctx.map.tiles[0][1] = { detail: blankDetail(), secrets: {} };
  ctx.map.px = 1;
  ctx.state.scholar.mx = 4; ctx.state.scholar.my = 4;
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.said.length = 0;
  ctx.setUpCamp();
  check('camp moved to tile 1', ctx.state.camp && ctx.state.camp.px, 1);
  check('no refusal', ctx.said.some(m => /already have a camp/i.test(m)), false);
  check('old camp announced gone', ctx.said.some(m => /camp is gone/i.test(m)), true);
  check('old tent wrecked', ctx.genDetail(0, 0)[4][5], 'dirt');
  check('old fires dead', ctx.state.fires.some(f => f.tx === 0), false);
}
{
  // C2: same tile re-setup is honest, not destructive
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  ctx.said.length = 0;
  ctx.setUpCamp();
  check('tent NOT wrecked by same-tile re-setup', ctx.genDetail(0, 0)[4][5], 'tent');
  check('camp still there', !!ctx.state.camp, true);
  check('honest "already your camp" line', ctx.said.some(m => /already your camp/i.test(m)), true);
}

console.log('D. pendingInTent locks every tent action except facing it');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.state.scholar.insideTent = { tx: 0, ty: 0, cx: 5, cy: 4 };
  ctx.pendingEncounter = true; ctx.pendingInTent = true; ctx.pendingMonsterId = 'hushwolf';
  const kcalBefore = ctx.state.scholar.kcal, ticksBefore = ctx.state.scholar.dayTicks;
  ctx.said.length = 0;
  ctx.lightTentFire();
  check('lightTentFire refused', ctx.said.some(m => /Face it/i.test(m)), true);
  check('no kcal spent lighting', ctx.state.scholar.kcal, kcalBefore);
  ctx.said.length = 0;
  ctx.setTentVent(false);
  check('setTentVent refused', ctx.said.some(m => /Face it/i.test(m)), true);
  ctx.said.length = 0;
  ctx.exitTent();
  check('exitTent refused', ctx.said.some(m => /Face it/i.test(m)), true);
  check('still inside the tent', !!ctx.state.scholar.insideTent, true);
  ctx.said.length = 0;
  ctx.sleep();
  check('sleep refused', ctx.said.some(m => /Face it/i.test(m)), true);
  check('no ticks passed sleeping', ctx.state.scholar.dayTicks, ticksBefore);
  // forced exit (faceTentIntruder's own path) still works
  ctx.exitTent(true);
  check('forced exit works', !!ctx.state.scholar.insideTent, false);
}
{
  // D2: faceTentIntruder still resolves to arm's-length combat
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.state.scholar.insideTent = { tx: 0, ty: 0, cx: 5, cy: 4 };
  ctx.pendingEncounter = true; ctx.pendingInTent = true; ctx.pendingMonsterId = 'hushwolf';
  ctx.startCombat = function (mid) { this._combatMid = mid; };
  ctx.faceTentIntruder();
  check('pendingInTent cleared', !!ctx.pendingInTent, false);
  check('dumped outside the tent', !!ctx.state.scholar.insideTent, false);
  check('breach spawn override set', !!ctx._tentBreachSpawn, true);
  check('combat started on the intruder', ctx._combatMid, 'hushwolf');
}

console.log('E. sweepDeadFires must not eat the tent when the interior fire dies');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.state.scholar.insideTent = { tx: 0, ty: 0, cx: 5, cy: 4 };
  lightInterior(ctx, 5, 4, 0); // expired interior fire
  ctx.sweepDeadFires();
  check('expired interior fire purged', ctx.state.fires.length, 1); // the grid fire (till 1e12) remains
  check('tent cell survives', ctx.genDetail(0, 0)[4][5], 'tent');
  check('tent secret survives', !!ctx.playerTile().secrets['5,4'], true);
  check('still inside the tent', !!ctx.state.scholar.insideTent, true);
}
{
  // E2: grid fires still clear their own cell on expiry
  const ctx = makeCtx();
  const detail = ctx.genDetail(0, 0);
  detail[4][3] = 'fire';
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 3, cy: 4, till: 0 });
  ctx.sweepDeadFires();
  check('expired grid fire purged', ctx.state.fires.length, 0);
  check('grid fire cell back to dirt', ctx.genDetail(0, 0)[4][3], 'dirt');
}

console.log('F. playerFireAt ignores interior fires (no grid feeding of tent fires)');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  // remove the grid fire: interior-only now
  ctx.state.fires = ctx.state.fires.filter(f => f.inside);
  lightInterior(ctx, 5, 4);
  check('playerFireAt false for interior fire', ctx.playerFireAt(5, 4), false);
  ctx.said.length = 0;
  ctx.feedFire(5, 4);
  check('outside feed refuses interior fire', ctx.said.some(m => /Nothing to feed/i.test(m)), true);
}

console.log('G. pending tent breach survives save/load (no save-scum dodge)');
{
  for (const k of Object.keys(_ls)) delete _ls[k];
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  ctx.setUpCamp();
  ctx.state.scholar.insideTent = { tx: 0, ty: 0, cx: 5, cy: 4 };
  ctx.pendingEncounter = true; ctx.pendingInTent = true; ctx.pendingMonsterId = 'hushwolf';
  ctx.save();
  const keys = Object.keys(_ls).filter(k => k.startsWith('scattering-save-v1-'));
  check('save written', keys.length > 0, true);
  const ctx2 = makeCtx();
  const ok = ctx2.load(keys[0]);
  check('load succeeded', ok, true);
  check('pendingEncounter restored', !!ctx2.pendingEncounter, true);
  check('pendingMonsterId restored', ctx2.pendingMonsterId, 'hushwolf');
  check('pendingInTent restored', !!ctx2.pendingInTent, true);
  check('camp restored', !!ctx2.state.camp, true);
  check('still inside the tent', !!ctx2.state.scholar.insideTent, true);
}
{
  // G2: tent gone at save -> downgrade to a regular encounter, not a phantom "in tent"
  for (const k of Object.keys(_ls)) delete _ls[k];
  const ctx = makeCtx();
  ctx.pendingEncounter = true; ctx.pendingInTent = true; ctx.pendingMonsterId = 'hushwolf';
  ctx.state.scholar.insideTent = null;
  ctx.save();
  const keys = Object.keys(_ls).filter(k => k.startsWith('scattering-save-v1-'));
  const ctx2 = makeCtx();
  ctx2.load(keys[0]);
  check('pendingEncounter restored (downgrade)', !!ctx2.pendingEncounter, true);
  check('pendingInTent downgraded', !!ctx2.pendingInTent, false);
}

console.log('H. canSetUpCamp gate matches the auto-abandon engine');
{
  const ctx = makeCtx();
  pitchAndFire(ctx, 5, 4, 3, 4);
  check('gate open with tent+fire, no camp', ctx.canSetUpCamp(), true);
  ctx.setUpCamp();
  check('gate closed on the camp tile', ctx.canSetUpCamp(), false);
  // new site on another tile: the button must SHOW (it abandons the old camp)
  ctx.map.tiles[0][1] = { detail: blankDetail(), secrets: {} };
  ctx.map.px = 1;
  ctx.state.scholar.mx = 4; ctx.state.scholar.my = 4;
  pitchAndFire(ctx, 5, 4, 3, 4);
  check('gate open on a new tile (abandon path reachable)', ctx.canSetUpCamp(), true);
  ctx.map.px = 0;
}

console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL GREEN');
process.exit(fails.length ? 1 : 0);
