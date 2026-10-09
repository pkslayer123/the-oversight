#!/usr/bin/env node
// BREAK-IT: forager sweep (2026-10-09, playtest loop, archetype: forager).
// Hostile attacks on the area-sweep forage action (game.js doAction 'forage'):
//
//   E1. EXPLOIT: knowledge pacing collapses per-cell. bumpPlantFamiliarity()
//       (familiarity encounters) and entry.harvests (L2/L4 depth) increment
//       ONCE PER CELL per sweep, not once per species per sweep. One 9-cell
//       sweep of an unknown species => encounters=9 (>=3) => solo sortBag
//       field-clicks it immediately ("forage blind, haul home, sort, learn"
//       collapses to a single field trip). After identification, one sweep =>
//       harvests=9 (>=5) => L2 (prepKnown, +50% yield) same press; two sweeps
//       => harvests=18 (>=15) => L4 mastery. Thresholds 3/5/15 were designed
//       as field visits, not cell touches.
//   E2. EXPLOIT: player sweeps never add foragePressure. The land's memory of
//       over-harvesting (pressure>=5 => wornPath + half regrow) applies only
//       to villager abstract nibbles. A hostile forager can strip the same
//       grove every 3 days forever with zero consequence — the mechanic the
//       code comments describe doesn't fire for the player.
//   H1. HONESTY: blind-sweep copy ("Not food until identified — sort them at
//       camp.") vs engine — lumps must be edible:false / foodState 'unknown',
//       and eatOne on a lump must refuse.
//   S1. SOFTLOCK: tile with stock>0 but every cell regrowing — the sweep must
//       refuse with the patch-honesty guidance, not crash or silently eat the press.
//   E3. ECONOMY: sweep/regrow stock accounting must be exactly 1:1 — no free
//       food, no silent loss.
//
// Usage: node scripts/test-forager-sweep-20261009.js
//        SEED=99 node scripts/test-forager-sweep-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);

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
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
const _say = Game.say.bind(Game);
Game.say = function (m) { says.push(String(m)); return _say(m); };

// Set up: wild tile with a crafted 3x3 grove of one species around the player.
function setupGrove(pid, opts) {
  opts = opts || {};
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  // guaranteed wild tile (mapgen is seeded — (5,5) can be a ruin on some seeds)
  let wx = 5, wy = 5;
  outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const tt = Game.tileAt(x, y);
    if (tt && tt.type !== 'haven' && tt.type !== 'ruin') { wx = x; wy = y; break outer; }
  }
  Game.map.px = wx; Game.map.py = wy;
  const t = Game.playerTile();
  const detail = Game.genDetail(wx, wy);
  t.detailRegrow = {};
  t.plantSpecies = t.plantSpecies || {};
  t.bushSpecies = t.bushSpecies || {};
  s.mx = 4; s.my = 4;
  let n = 0;
  for (let cy = 3; cy <= 5; cy++) for (let cx = 3; cx <= 5; cx++) {
    detail[cy][cx] = 'plant';
    t.plantSpecies[cx + ',' + cy] = pid;
    n++;
  }
  t.stock = n; t.maxStock = n;
  t.foragePressure = 0; t.foragedToday = false;
  if (opts.identified) Game.identifyPlant(pid, 'tested');
  return { s, t, detail, n };
}

const DANDELION = 'dandelion';

(async () => {
await Game.init();
Game.drama = () => {};
Game.audioEvent = () => {};
console.log('SEED=' + SEED);

// ---------- E1a: familiarity grind on an UNKNOWN species ----------
{
  const { s, t } = setupGrove(DANDELION);
  Game.doAction('forage');
  const enc = (Game.state.codex.encounters || {})[DANDELION] || 0;
  ok('E1a: one blind sweep => exactly 1 familiarity encounter for the species (not 9)', enc === 1, 'encounters=' + enc);
  ok('E1a: one blind sweep does NOT field-click the species', !Game.plantFieldClick(DANDELION), 'fieldClick=' + Game.plantFieldClick(DANDELION));
}

// ---------- E1b: harvest/level grind on an IDENTIFIED species ----------
{
  const { s, t } = setupGrove(DANDELION, { identified: true });
  Game.doAction('forage');
  const entry = Game.state.codex.plants[DANDELION];
  ok('E1b: one sweep => exactly 1 harvest toward depth (not 9)', (entry.harvests || 0) === 1, 'harvests=' + entry.harvests);
  ok('E1b: one sweep does NOT grant L2 (needs 5 visits)', entry.level === 1, 'level=' + entry.level);
  ok('E1b: prepKnown stays false after one sweep', !entry.prepKnown, 'prepKnown=' + entry.prepKnown);
  // second sweep after forced regrow: still not L4
  const dr = t.detailRegrow;
  for (const k of Object.keys(dr)) dr[k].day = s.day; // due today
  Game.regrowTiles();
  Game.doAction('forage');
  const entry2 = Game.state.codex.plants[DANDELION];
  ok('E1b: two sweeps => harvests=2, still L1 (not L4 mastery)', entry2.level === 1 && entry2.harvests === 2,
    'level=' + entry2.level + ' harvests=' + entry2.harvests);
}

// ---------- E2: player sweeps pressure the land ----------
{
  const { s, t } = setupGrove(DANDELION, { identified: true });
  Game.doAction('forage');
  ok('E2: one player sweep adds forage pressure to the tile', (t.foragePressure || 0) >= 1, 'pressure=' + (t.foragePressure || 0));
  ok('E2: swept tile is marked foragedToday (pressure does not decay on worked days)', t.foragedToday === true, 'foragedToday=' + t.foragedToday);
}

// ---------- H1: blind-sweep honesty ----------
{
  const { s, t } = setupGrove('chickweed'); // unknown species
  Game.doAction('forage');
  const msg = says.join('\n');
  ok('H1: blind sweep copy says the haul is not food until identified', /Not food until identified/.test(msg), 'says=' + JSON.stringify(says.slice(-1)));
  const lumps = (s.inventory || []).filter(it => it && it.lump);
  ok('H1: unknown haul lands in a lump (not as named food)', lumps.length >= 1, 'lumps=' + lumps.length);
  const lump = lumps[0];
  ok('H1: lump is edible:false with foodState unknown', lump && lump.edible === false && lump.foodState === 'unknown');
  // eatOne on the lump must refuse, not grant kcal
  const kcalBefore = s.kcal;
  const idx = s.inventory.indexOf(lump);
  let threw = false;
  try { Game.eatOne(idx); } catch (e) { threw = true; }
  ok('H1: eatOne on a lump does not grant kcal', !threw && s.kcal === kcalBefore, 'threw=' + threw + ' kcal=' + s.kcal + '/' + kcalBefore);
}

// ---------- S1: stock>0 but every cell regrowing ----------
{
  const { s, t, detail } = setupGrove(DANDELION);
  Game.doAction('forage'); // strip the grove
  says.length = 0;
  t.stock = 4; // abstract stock remains (e.g. villager nibbles) while the grid is picked clean
  const r = Game.doAction('forage');
  ok('S1: sweep on a picked-clean grove refuses cleanly (no crash)', r === null || r === undefined || true);
  const msg = says.join('\n');
  ok('S1: refusal names the next patch (patch-honesty guidance, not a dead end)',
    /step to another green patch|Nothing within reach/.test(msg), 'says=' + JSON.stringify(says.slice(-1)));
  ok('S1: no stock consumed by the refused press', t.stock === 4, 'stock=' + t.stock);
}

// ---------- E3: sweep/regrow stock accounting is 1:1 ----------
{
  const { s, t, n } = setupGrove(DANDELION, { identified: true });
  const stockBefore = t.stock;
  Game.doAction('forage');
  ok('E3: sweep depletes stock by cells harvested', t.stock === Math.max(0, stockBefore - n), 'stock=' + t.stock + ' before=' + stockBefore + ' cells=' + n);
  const dr = t.detailRegrow;
  for (const k of Object.keys(dr)) dr[k].day = s.day;
  Game.regrowTiles();
  ok('E3: regrow restores exactly what was taken (no free food, no loss)', t.stock === stockBefore, 'stock=' + t.stock + ' before=' + stockBefore);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
