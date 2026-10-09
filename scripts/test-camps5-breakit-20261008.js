#!/usr/bin/env node
// BREAK-IT camps & structures, round 5 (2026-10-08).
// Rounds 1-4 killed: phantom camps x2, lying breakCamp messages, phantom
// "let it go", breach menu hole, sweepDeadFires eating tents, grid-fed tent
// fires, save-scummed breaches, pack->re-pitch free fire, destroyCell fire
// purge, death/mantle stale room, INFINITE BURY, stale tent secrets.
// This file attacks what they left alone (steering: pitch validity,
// shredded tents, eviction invariants, travel, occupants).
//
// CATCHES:
//   G. SHREDDED REPAIR LOOP (exploit + honesty): a beam-shredded YOUR tent
//      can be packed (packTent never checked condition) and re-pitched,
//      and pitchTent always writes condition:'good' -- a free full repair
//      contradicting every label ("Shredded. Useless.", "Not usable. You
//      leave it.", "No shelter in that."). Found shredded tents can't even
//      be taken -- yours was repairable. Fix: packTent refuses shredded
//      tents; the tile menu stops offering 'Pack up tent' on shredded ones.
//   H. SHREDDED EVICTION HOLE (honesty): validateInsideTent enforced
//      "cell is a tent + secret yours" but not "tent intact". scorchCells
//      (the beam) shreds tents without evicting the room -- you could live,
//      sleep (quality 'tent'), and cook inside a shredded tent while every
//      label says it's useless. Fix: shredded counts as gone in
//      validateInsideTent (the every-status() choke point), same class as
//      the destroyCell/wreckTent/breakCamp evictions.
//
// HELD (attacked, resisted / documented):
//   I. pitch on occupied cell: no occupant check -- the tent lands on the
//      villager/monster's cell without crashing; positions stay separate.
//      Cosmetic overlap, no mechanical break. Documented as held.
//   J. pitch then travel away: the tent cell + secret persist on the tile;
//      walking back, it's still yours and enterable. Held.
//   K. unbreakable rule re-verified: destroyCell list unchanged
//      (hall/bunk/door/haven/sanct/base); storm only breaks the player camp;
//      no fire-spread mechanic exists (nothing to lie about).
//   L. contest rewards: prize/trauma/notability only -- no camp/tent state
//      touched. Held.
//   M. dead-code re-audit: caller check over camp/tent functions -- all wired.
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
    over: false,
    state: {
      version: 1,
      scholar: { villagerId: 'v1', mx: 4, my: 4, day: 1, dayTicks: 0, inventory: [], kcal: 1000, health: 100 },
      camp: null, fires: [],
      village: { name: 'Haven', px: 4, py: 4, roster: ['v1'], trust: { v1: 80 }, positions: {} },
      codex: { plants: {}, monsters: {}, places: [] },
    },
    map: { px: 0, py: 0, tiles: { 0: { 0: tile } }, dirty: false },
    say(msg) { said.push(String(msg)); },
    tickAction() {},
    audioEvent() {},
    bulldozerShrapnel() {},
  });
  return ctx;
}
function pitchGoodTent(ctx, cx, cy) {
  ctx.state.scholar.inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent' });
  ctx.pitchTent(cx, cy);
}
function lastSaid(ctx) { return ctx.said[ctx.said.length - 1] || ''; }

console.log('G. shredded tents must not be repairable via pack+re-pitch');
{
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  check('pitched tent is good', ctx.playerTile().secrets['5,4'].condition, 'good');
  // the beam shreds it (live path: Highbeam Deer beam -> scorchCells)
  ctx.scorchCells([{ cx: 5, cy: 4 }]);
  check('beam shreds the tent', ctx.playerTile().secrets['5,4'].condition, 'shredded');
  check('cell still a tent', ctx.genDetail(0, 0)[4][5], 'tent');
  // the labels all say it's done: enterTent refuses
  ctx.enterTent(5, 4);
  check('enterTent refuses shredded', /No shelter in that/.test(lastSaid(ctx)), true);
  // THE BREAK: packTent used to pack it anyway, and re-pitching wrote
  // condition:'good' -- a free full repair contradicting the labels.
  const tentsBefore = ctx.state.scholar.inventory.filter(i => i.kind === 'tent').reduce((t, i) => t + (i.units || 0), 0);
  ctx.packTent(5, 4);
  const tentsAfter = ctx.state.scholar.inventory.filter(i => i.kind === 'tent').reduce((t, i) => t + (i.units || 0), 0);
  check('shredded tent refuses packing (no tent item gained)', tentsAfter, tentsBefore);
  check('shredded tent cell left alone', ctx.genDetail(0, 0)[4][5], 'tent');
  check('refusal says shredded', /shredded/i.test(lastSaid(ctx)), true);
}
{
  // G2: the tile menu must not offer 'Pack up tent' on a shredded tent
  // (honest buttons: impossible actions hide, per the tool-gating rule).
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  ctx.scorchCells([{ cx: 5, cy: 4 }]);
  let acts = [];
  try { acts = ctx.cellActions(5, 4) || []; } catch (e) { acts = ['ERR:' + e.message]; }
  check('no Pack up tent offered on shredded', acts.includes('Pack up tent'), false);
}
{
  // G3 (control): a GOOD tent still packs fine -- no regression.
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  ctx.packTent(5, 4);
  const tents = ctx.state.scholar.inventory.filter(i => i.kind === 'tent').reduce((t, i) => t + (i.units || 0), 0);
  check('good tent packs normally', tents, 1);
  check('good tent cell cleared', ctx.genDetail(0, 0)[4][5], 'dirt');
}

console.log('H. validateInsideTent must evict you from a shredded tent');
{
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  ctx.enterTent(5, 4);
  check('inside the tent', !!(ctx.state.scholar.insideTent), true);
  // the beam shreds the tent AROUND you -- scorchCells never evicted
  ctx.scorchCells([{ cx: 5, cy: 4 }]);
  check('tent shredded around you', ctx.playerTile().secrets['5,4'].condition, 'shredded');
  // THE BREAK: validateInsideTent (every status() call) used to let the
  // room survive -- sleep quality 'tent', rain immunity, full room UI --
  // inside a tent every label calls useless.
  ctx.validateInsideTent();
  check('insideTent evicted after shred', ctx.state.scholar.insideTent || null, null);
  check('eviction says why', /shred/i.test(ctx.said.join(' ')), true);
  check('no longer sheltered', ctx.shelteredFromSky(), false);
}
{
  // H2: an intact tent keeps the room -- no regression.
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  ctx.enterTent(5, 4);
  ctx.validateInsideTent();
  check('intact tent keeps the room', !!(ctx.state.scholar.insideTent), true);
}

console.log('I. pitch on an occupied cell (probe -- held if no mechanical break)');
{
  const ctx = makeCtx();
  // a villager standing on the adjacent cell
  ctx.state.village.positions = { v2: { mx: 5, my: 4 } };
  pitchGoodTent(ctx, 5, 4);
  check('tent lands without crashing', ctx.genDetail(0, 0)[4][5], 'tent');
  check('villager position untouched', ctx.state.village.positions.v2.mx, 5);
  const sec = ctx.playerTile().secrets['5,4'] || {};
  check('tent is yours', sec.yours, true);
}
{
  // I2: pitching on a monster's exploration cell -- same class
  const ctx = makeCtx();
  ctx.state.scholar.monster = { id: 'hushwolf', hp: 40, mx: 5, my: 4 };
  let threw = false;
  try { pitchGoodTent(ctx, 5, 4); } catch (e) { threw = true; }
  check('no crash pitching onto a monster cell', threw, false);
  check('tent lands', ctx.genDetail(0, 0)[4][5], 'tent');
}

console.log('J. pitch then travel away -- the tent waits for you (held)');
{
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  // walk two tiles over: a fresh tile object, like real travel
  ctx.map.tiles[0][1] = { detail: blankDetail(), secrets: {} };
  ctx.map.px = 1;
  check('tent not on the new tile', ctx.genDetail(1, 0)[4][5], 'dirt');
  // walk back
  ctx.map.px = 0;
  check('tent cell persisted', ctx.genDetail(0, 0)[4][5], 'tent');
  check('tent still yours', (ctx.playerTile().secrets['5,4'] || {}).yours, true);
  ctx.enterTent(5, 4);
  check('reclaimable after travel', !!(ctx.state.scholar.insideTent), true);
}

console.log('SIBLING SWEEP: wreckage must not count as a tent anywhere else');
{
  // S1: a shredded tent must not offer "Set up camp" (hasTentNearby).
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  ctx.scorchCells([{ cx: 5, cy: 4 }]);
  // campfire nearby so the tent is the only missing leg
  const d = ctx.genDetail(0, 0);
  d[4][3] = 'fire';
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 3, cy: 4, till: 99999 });
  check('shredded tent not camp-eligible', ctx.hasTentNearby(), false);
  check('no Set up camp on wreckage', ctx.canSetUpCamp(), false);
}
{
  // S2: sleeping next to a shredded tent is not tent-quality sleep.
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  ctx.scorchCells([{ cx: 5, cy: 4 }]);
  ctx.state.scholar.mx = 4; ctx.state.scholar.my = 4; // adjacent, not inside
  check('sleep quality beside wreckage is not tent', ctx.sleepQuality() === 'tent', false);
  const prev = ctx.sleepPreview();
  check('preview does not promise tent healing', prev.heal === 25 && prev.quality === 'tent', false);
}
{
  // S3 (control): an intact tent still counts for camp + sleep.
  const ctx = makeCtx();
  pitchGoodTent(ctx, 5, 4);
  const d = ctx.genDetail(0, 0);
  d[4][3] = 'fire';
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 3, cy: 4, till: 99999 });
  check('intact tent camp-eligible', ctx.hasTentNearby(), true);
  check('Set up camp offered', ctx.canSetUpCamp(), true);
  check('sleep quality beside intact tent', ctx.sleepQuality(), 'tent');
}

console.log('K. unbreakable rule still holds (destroyCell list + storm scope)');
{
  const ctx = makeCtx();
  // haven buildings refuse the bulldozer
  const d = ctx.genDetail(0, 0);
  d[4][5] = 'hall';
  const r = ctx.destroyCell(5, 4, 'bulldozer');
  check('hall refuses destroyCell', r, false);
  check('hall cell intact', ctx.genDetail(0, 0)[4][5], 'hall');
  check('refusal names havens', /Havens do not break/.test(ctx.said.join(' ')), true);
}
{
  // K2: a player campfire is still breakable (round-1 carve-out intact)
  const ctx = makeCtx();
  const d = ctx.genDetail(0, 0);
  d[4][5] = 'fire';
  ctx.state.fires.push({ tx: 0, ty: 0, cx: 5, cy: 4, till: 99999 });
  const r = ctx.destroyCell(5, 4, 'bulldozer');
  check('player campfire breaks', r, true);
  check('fire entry purged', ctx.state.fires.length, 0);
}

console.log('');
if (fails.length) { console.log(`RESULT: ${fails.length} FAILURES`); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
console.log('RESULT: ALL GREEN');
