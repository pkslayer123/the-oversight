#!/usr/bin/env node
// PROOF TEST: tile-scenes.js (Steve 2026-10-06)
// Runs in node with a stubbed Scattering.Game — the module is pure string
// building and only touches S.Game lazily inside functions, so it loads clean.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'js', 'tile-scenes.js');
eval(fs.readFileSync(SRC, 'utf8')); // defines globalThis.Scattering.TileScenes
const TS = globalThis.Scattering.TileScenes;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

// ---- stub game ------------------------------------------------------------
const TYPES = ['forest_floor', 'grove', 'meadow', 'thicket', 'wetland',
  'creek', 'trail_edge', 'ruin', 'haven'];
function makeDetail(kind) {
  const cells = [];
  for (let cy = 0; cy < 9; cy++) {
    const row = [];
    for (let cx = 0; cx < 9; cx++) row.push(cx % 3 === 0 ? 'grass' : 'dirt');
    cells.push(row);
  }
  // sprinkle interesting cells regardless of kind (sampling is type-agnostic)
  cells[1][1] = 'tree'; cells[1][6] = 'bigtree'; cells[2][3] = 'water';
  cells[4][4] = 'plant'; cells[5][5] = 'bush'; cells[6][2] = 'lodge';
  cells[3][7] = 'fire'; cells[7][1] = 'tent'; cells[2][2] = 'rubble';
  cells[6][6] = 'wall';
  return cells;
}
const tiles = [];
for (let y = 0; y < 7; y++) {
  const row = [];
  for (let x = 0; x < 7; x++) {
    row.push({ type: TYPES[(x + y * 3) % TYPES.length], stock: 8, maxStock: 10 });
  }
  tiles.push(row);
}
const Game = {
  map: { tiles, px: 3, py: 3 },
  tileAt(x, y) { return this.map.tiles[y][x]; },
  genDetail(x, y) {
    const t = this.tileAt(x, y);
    if (!t.detail) t.detail = makeDetail(t.type);
    return t.detail;
  },
  state: {
    scholar: { mx: 4, my: 4, monster: { mx: 2, my: 3 }, animal: { mx: 6, my: 6 } },
    village: { positions: { r1: { mx: 1, my: 1 }, r2: { mx: 5, my: 5 } } },
  },
};
globalThis.Scattering.Game = Game;

// ---- 1. valid SVG for every tile type -------------------------------------
console.log('1. svgFor returns valid SVG for each tile type');
const seenByType = {};
for (const type of TYPES) {
  // find a tile of this type
  let found = null;
  for (let y = 0; y < 7 && !found; y++)
    for (let x = 0; x < 7 && !found; x++)
      if (tiles[y][x].type === type) found = [x, y];
  const svg = TS.svgFor(found[0], found[1], { seen: true });
  seenByType[type] = { x: found[0], y: found[1], svg };
  ok(typeof svg === 'string' && svg.startsWith('<svg') &&
     svg.includes('viewBox="0 0 64 64"') && svg.includes('</svg>'),
     type + ' -> valid svg (' + svg.length + ' chars)');
}

// ---- 2. cache hit returns identical string ---------------------------------
console.log('2. cache hit returns identical string');
{
  const { x, y, svg } = seenByType.grove;
  const again = TS.svgFor(x, y, { seen: true });
  ok(again === svg, 'second call identical (cache hit)');
  ok(!!tiles[y][x]._sceneCache, 'cache entry stored on tile');
}

// ---- 3. invalidate + touch force re-render ---------------------------------
console.log('3. invalidate / touch force re-render');
{
  const { x, y } = seenByType.creek;
  TS.svgFor(x, y, { seen: true });
  const keyBefore = tiles[y][x]._sceneCache.key;
  TS.invalidate(x, y);
  ok(tiles[y][x]._sceneCache === undefined, 'invalidate drops cache entry');
  TS.svgFor(x, y, { seen: true });
  ok(tiles[y][x]._sceneCache.key === keyBefore, 're-render with same state -> same key');
  TS.touch(x, y);
  ok(tiles[y][x]._sceneVer === 1, 'touch bumps _sceneVer');
  const svgAfter = TS.svgFor(x, y, { seen: true });
  ok(tiles[y][x]._sceneCache.key !== keyBefore, 'touch changes fingerprint -> re-render');
  ok(typeof svgAfter === 'string' && svgAfter.startsWith('<svg'), 're-render still valid');
  TS.invalidateAll();
  let anyCached = false;
  for (const row of tiles) for (const t of row) if (t._sceneCache) anyCached = true;
  ok(!anyCached, 'invalidateAll clears every tile');
}

// ---- 4. unseen tile returns blank ------------------------------------------
console.log('4. fog-of-war: unseen tile is blank');
{
  const { x, y } = seenByType.ruin;
  delete tiles[y][x].detail; delete tiles[y][x]._sceneCache;
  const blank = TS.svgFor(x, y, { seen: false });
  ok(blank.includes('#0d120d'), 'blank uses fog fill #0d120d');
  ok(!blank.includes('<circle'), 'blank has no texture/detail circles');
  ok(!blank.includes('#ffffff'), 'blank has no entity markers');
  ok(tiles[y][x].detail === undefined, 'fog does not trigger detail generation');
  ok(tiles[y][x]._sceneCache === undefined, 'fog does not populate cache');
}

// ---- 5. entity markers ------------------------------------------------------
console.log('5. entity markers appear on the player tile only');
{
  const svg = TS.svgFor(3, 3, { seen: true }); // player tile
  ok(svg.includes('stroke="#ffffff"'), 'player white ring present');
  ok(svg.includes('#a8d5a2'), 'villager markers present');
  ok(svg.includes('#e04040'), 'monster diamond present');
  ok(svg.includes('#a07040'), 'animal dot present');
  const other = TS.svgFor(0, 0, { seen: true }); // not the player tile
  ok(!other.includes('stroke="#ffffff"') && !other.includes('#e04040'),
     'no entity markers off the player tile');
}

// ---- 6. stock thins the undergrowth -----------------------------------------
console.log('6. stock level changes the scene');
{
  const { x, y } = seenByType.meadow;
  tiles[y][x].stock = 10;
  TS.invalidate(x, y);
  const full = TS.svgFor(x, y, { seen: true });
  tiles[y][x].stock = 0;
  TS.invalidate(x, y);
  const empty = TS.svgFor(x, y, { seen: true });
  const count = (s) => (s.match(/#55a04e|#3a7a3a/g) || []).length;
  ok(count(full) > count(empty), 'foraged-out tile shows fewer plant/bush dots (' +
     count(full) + ' -> ' + count(empty) + ')');
  tiles[y][x].stock = 8;
}

// ---- 7. out of bounds / no game --------------------------------------------
console.log('7. degenerate inputs return blank SVG');
{
  ok(TS.svgFor(99, 99, { seen: true }).includes('#0d120d'), 'OOB tile -> blank');
  const saved = globalThis.Scattering.Game;
  globalThis.Scattering.Game = null;
  ok(TS.svgFor(3, 3, { seen: true }).includes('#0d120d'), 'no Game -> blank');
  globalThis.Scattering.Game = saved;
  TS.invalidate(99, 99); TS.touch(99, 99); TS.invalidateAll(); // must not throw
  ok(true, 'invalidate/touch tolerate bad coords');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
