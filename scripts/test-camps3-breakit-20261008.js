#!/usr/bin/env node
// BREAK-IT camps & structures, 3rd pass (2026-10-08, worker break-camps3).
//
// Passes 1-2 killed the destroyCell/wreckTent phantom camps, the lying
// breakCamp messages, the phantom "let it go" promise, the breach menu hole,
// sweepDeadFires eating tents, grid-fed tent fires, and save-scummed
// breaches. This pass attacks what those left: DEATH and PACK paths.
//
// CATCHES (each section demonstrates a break, then encodes the fix):
//   A. PACK -> RE-PITCH FREE FIRE (exploit + honesty): packTent clears the
//      tent cell BEFORE breakCamp runs, so breakCamp's tent sweep finds no
//      'tent' cell and the struck path skips the fire sweep. The interior
//      fire entry lingers in state.fires. Re-pitch on the same cell ->
//      tentFireLit() is TRUE with no fuel, no 16 ticks, no 30 kcal: a free
//      lit fire every cycle (pitch->light->pack->pitch = pay the ignite cost
//      ONCE, then free forever). The struck message also claims "The fire
//      keeps burning" for a fire whose tent is in your pack - a phantom.
//   B. THE MANTLE KEEPS THE OLD BEARER'S ROOM (softlock + honesty): ledger.js
//      playerDeath never clears s.insideTent / s.tentSmoke / state.camp /
//      the pending-encounter triple. The new bearer wakes at Haven with:
//        - insideTent pointing at the dead bearer's tent, nodes away ->
//          tentRoomScreen() renders "Your tent - inside" at Haven; Light
//          fire / Cook / Feed / Sleep all operate through the dead tent's
//          coords; shelteredFromSky() lies (rain-immune in the hall);
//        - triggerEncounter() with stale insideTent -> wandererTentBreach:
//          "IN here with you" while standing at Haven;
//        - state.camp inherited: a camp the new bearer never pitched;
//        - pendingInTent/pendingEncounter possibly still set -> the breach
//          card renders for someone who was never in a tent;
//        - insideHaven undefined -> havenStoresAccess() 'none': the new
//          bearer can't touch the pantry until they find the door (newGame
//          wakes you INSIDE the hall - the mantle should too).
//
// FIXES:
//   game.js packTent: purge the packed cell's interior-fire entries (same
//     purge shape as wreckTent) BEFORE breakCamp. The struck message's
//     "fire keeps burning" clause now only fires for real remaining fires.
//   ledger.js playerDeath: the camp claim lapses with its keeper (fires die
//     with it, honest message; the pitched tent itself STANDS - the
//     expedition's canvas, walk back and reclaim it), insideTent/tentSmoke
//     cleared, the pending-encounter triple cleared, and the new bearer
//     wakes insideHaven (like newGame).
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
    data: {
      villagers: [
        { id: 'v1', name: 'Old Bearer', occupation: 'hunter' },
        { id: 'v2', name: 'New Face', occupation: 'forager' },
      ],
      monsters: [{ id: 'hushwolf', size: 1 }],
      synergies: [],
    },
    dayPart: 2,
    villagerId: 'v1',
    state: {
      version: 1,
      scholar: { mx: 4, my: 4, day: 1, dayTicks: 0, inventory: [], kcal: 1000, health: 100 },
      camp: null, fires: [],
      village: { name: 'Haven', px: 4, py: 4, roster: ['v1', 'v2'], trust: { v1: 80, v2: 70 } },
      codex: { plants: {}, monsters: {} },
    },
    map: { px: 0, py: 0, tiles: { 0: { 0: tile }, 4: { 4: { detail: blankDetail(), secrets: {} } } }, dirty: false },
    say(msg) { said.push(String(msg)); },
    tickAction() {},
    audioEvent() {},
    bulldozerShrapnel() {},
  });
  return ctx;
}
function giveTent(ctx) {
  ctx.state.scholar.inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent' });
}
function insideFires(ctx) {
  return (ctx.state.fires || []).filter(f => f.inside && f.tx === ctx.map.px && f.ty === ctx.map.py);
}

console.log('A. packTent must not leave a phantom lit fire behind (free-fire exploit)');
{
  const ctx = makeCtx();
  giveTent(ctx);
  ctx.addMaterial('branch', 4);
  ctx.pitchTent(5, 4);              // real pitch: -1 tent, -50 kcal, 48 ticks
  const d = ctx.genDetail(0, 0);
  d[4][3] = 'fire';                 // grid campfire (for an honest camp)
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 3, cy: 4, till: 1e12 });
  ctx.setUpCamp();                  // real camp
  check('camp established', !!ctx.state.camp, true);
  ctx.enterTent(5, 4);              // real enter
  ctx.lightTentFire();              // real light: -fuel, -30 kcal, 16 ticks
  check('tent fire lit (real ignite)', ctx.tentFireLit(), true);
  check('interior fire entry exists', insideFires(ctx).length, 1);
  ctx.exitTent();
  ctx.packTent(5, 4);               // real pack: tent back in inventory
  check('tent cell cleared', ctx.genDetail(0, 0)[4][5], 'dirt');
  check('packed tent returned to inventory',
    (ctx.state.scholar.inventory.find(i => i.kind === 'tent') || {}).units >= 1, true);
  // THE BREAK: the interior fire entry survives the pack...
  check('interior fire entry purged on pack', insideFires(ctx).length, 0);
  // ...so re-pitching the same cell resurrects a lit fire for free.
  giveTent(ctx);
  ctx.state.scholar.mx = 4; ctx.state.scholar.my = 4; // step off the packed cell
  ctx.pitchTent(5, 4);
  ctx.enterTent(5, 4);
  check('re-pitched tent does NOT inherit a lit fire', ctx.tentFireLit(), false);
  // the honest grid fire survives the strike - and the message may name it.
  check('grid fire survives the strike (honest)', d[4][3], 'fire');
  check('struck message names the real burning fire', /keeps burning/i.test(ctx.said.join(' ')), true);
}
{
  // A2 (honesty): camp + tent + ONLY an interior fire. Striking the tent must
  // douse the tent fire - the struck message must not claim it keeps burning.
  const ctx = makeCtx();
  giveTent(ctx);
  ctx.addMaterial('branch', 4);
  ctx.pitchTent(5, 4);
  ctx.state.camp = { px: 0, py: 0, condition: 'shitty', setUpDay: 1 };
  ctx.enterTent(5, 4);
  ctx.lightTentFire();
  check('tent fire lit (A2)', ctx.tentFireLit(), true);
  ctx.exitTent();
  ctx.said.length = 0;
  ctx.packTent(5, 4);
  check('interior fire entry purged on pack (A2)', insideFires(ctx).length, 0);
  check('no phantom "fire keeps burning" claim', /keeps burning/i.test(ctx.said.join(' ')), false);
}

console.log('B. playerDeath (mantle) must not bequeath the old bearer\'s room');
{
  const ctx = makeCtx();
  // the old bearer: camp on tile (0,0), inside their tent, fire lit in it,
  // grid fire on the camp tile, and a breach pending (monster IN the tent).
  const d = ctx.genDetail(0, 0);
  d[4][5] = 'tent';
  ctx.playerTile().secrets['5,4'] = { condition: 'good', known: true, yours: true };
  d[4][3] = 'fire';
  ctx.state.camp = { px: 0, py: 0, condition: 'shitty', setUpDay: 1 };
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 5, cy: 4, till: 1e12, inside: true });
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 3, cy: 4, till: 1e12 });
  const s = ctx.state.scholar;
  s.insideTent = { tx: 0, ty: 0, cx: 5, cy: 4 };
  s.tentSmoke = 40;
  ctx.pendingEncounter = true; ctx.pendingMonsterId = 'hushwolf'; ctx.pendingInTent = true;
  let threw = null;
  try { ctx.playerDeath('the wild'); } catch (e) { threw = e && e.message; }
  check('playerDeath completes', threw, null);
  check('mantle passed to the successor', ctx.villagerId, 'v2');
  check('insideTent cleared (no phantom room)', (ctx.state.scholar || {}).insideTent || null, null);
  check('tentSmoke cleared', (ctx.state.scholar || {}).tentSmoke || 0, 0);
  check('camp claim lapses with its keeper', ctx.state.camp || null, null);
  check('pendingEncounter cleared', !!ctx.pendingEncounter, false);
  check('pendingMonsterId cleared', ctx.pendingMonsterId || null, null);
  check('pendingInTent cleared', !!ctx.pendingInTent, false);
  check('pitched tent STANDS (expedition canvas, reclaimable)', ctx.genDetail(0, 0)[4][5], 'tent');
  check('tent still marked yours (the office, not the face)',
    !!((ctx.map.tiles[0][0].secrets || {})['5,4'] || {}).yours, true);
  check('camp fires die with the camp', d[4][3], 'dirt');
  check('new bearer wakes inside the hall', ctx.state.scholar.insideHaven, true);
  check('shelteredFromSky honest at haven', ctx.shelteredFromSky(), true);
  check('death says the camp ended', ctx.said.some(m => /no keeper|keeper/i.test(m)), true);
}
{
  // B2: death with NO camp/tent/pending is a clean no-op for the fix.
  const ctx = makeCtx();
  let threw = null;
  try { ctx.playerDeath('the wild'); } catch (e) { threw = e && e.message; }
  check('clean death completes', threw, null);
  check('mantle passed', ctx.villagerId, 'v2');
  check('no camp either way', ctx.state.camp || null, null);
  check('insideHaven set on clean death too', ctx.state.scholar.insideHaven, true);
}

console.log('C. SIBLING: destroyCell smashing a tent must kill its interior fire too');
{
  const ctx = makeCtx();
  giveTent(ctx);
  ctx.addMaterial('branch', 4);
  ctx.pitchTent(5, 4);
  const d = ctx.genDetail(0, 0);
  d[4][3] = 'fire';
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 3, cy: 4, till: 1e12 });
  ctx.setUpCamp();
  ctx.enterTent(5, 4);
  ctx.lightTentFire();
  check('tent fire lit (C)', ctx.tentFireLit(), true);
  ctx.exitTent();
  ctx.said.length = 0;
  ctx.destroyCell(5, 4, 'bulldozer'); // the smash
  check('tent cell smashed', ctx.genDetail(0, 0)[4][5], null);
  check('camp broken by the smash', ctx.state.camp || null, null);
  check('interior fire entry purged on smash', insideFires(ctx).length, 0);
  check('smash says the camp ended', ctx.said.some(m => /camp is gone/i.test(m)), true);
  giveTent(ctx);
  ctx.state.scholar.mx = 4; ctx.state.scholar.my = 4;
  ctx.pitchTent(5, 4);
  ctx.enterTent(5, 4);
  check('re-pitched smashed cell does NOT inherit a lit fire', ctx.tentFireLit(), false);
}

console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL GREEN');
process.exit(fails.length ? 1 : 0);
