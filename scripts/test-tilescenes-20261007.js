// Proof test for tile-scenes.js polish (Steve 2026-10-05).
// Invariants: app.js validity contract, cache keying, glimpse honesty,
// interface preservation, day-part additivity.
// Usage: node scripts/test-tilescenes-20261007.js
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'src/js/tile-scenes.js'), 'utf8');
const sandbox = {};
(new Function('globalThis', src))(sandbox.globalThis = sandbox);
const TS = sandbox.Scattering.TileScenes;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

const TYPES = ['forest_floor','forest','grove','meadow','field','thicket','wetland','swamp',
  'creek','water','river','trail_edge','trail','path','ruin','haven'];
const grid = [];
for (let y = 0; y < 9; y++) { grid.push([]); for (let x = 0; x < 9; x++) grid[y].push((x + y) % 3 === 0 ? 'tree' : (x % 4 === 0 ? 'plant' : '')); }
const havenGrid = [];
for (let y = 0; y < 9; y++) { havenGrid.push([]); for (let x = 0; x < 9; x++) havenGrid[y].push(''); }
havenGrid[2][2] = 'fire'; havenGrid[4][4] = 'tent'; havenGrid[6][6] = 'lodge';

// 1. interface contract preserved
ok(JSON.stringify(Object.keys(TS).sort()) === JSON.stringify(['FOG_FILL','invalidate','invalidateAll','svgFor','touch'].sort()),
  'interface keys unchanged');
ok(TS.FOG_FILL === '#0d120d', 'FOG_FILL value');

// 2. app.js validity contract: every seen render is long and has no fog color
for (const t of TYPES) {
  const tile = { type: t, detail: grid, stock: 80, maxStock: 100 };
  for (let dp = 0; dp < 4; dp++) {
    const svg = TS.svgFor(1, 2, { seen: true, tile: { type: t, detail: grid, stock: 80, maxStock: 100 }, dayPart: dp });
    ok(svg.length > 100 && svg.indexOf('#0d120d') === -1, 'valid render ' + t + ' dp' + dp);
  }
}

// 3. fog behavior unchanged
ok(TS.svgFor(0, 0, { seen: false }).indexOf('#0d120d') !== -1, 'unseen -> fog blank');
ok(TS.svgFor(0, 0, {}).indexOf('#0d120d') !== -1, 'no opts -> fog blank');
ok(TS.svgFor(0, 0, { seen: true, tile: null }).indexOf('#0d120d') !== -1, 'seen but no tile -> fog blank');

// 4. cache keying: dayPart changes the render; same call returns cached identical string
{
  const t1 = { type: 'forest', detail: grid, stock: 80, maxStock: 100 };
  const a = TS.svgFor(1, 1, { seen: true, tile: t1, dayPart: 1 });
  const b = TS.svgFor(1, 1, { seen: true, tile: t1, dayPart: 1 });
  ok(a === b, 'cache hit returns identical string');
  const t2 = { type: 'forest', detail: grid, stock: 80, maxStock: 100 };
  const c = TS.svgFor(1, 1, { seen: true, tile: t2, dayPart: 3 });
  ok(c !== a, 'night render differs from midday');
  ok(t1._sceneCache && t1._sceneCache.key.indexOf('|1|') !== -1, 'fingerprint carries dayPart');
  const t3 = { type: 'forest', detail: grid, stock: 80, maxStock: 100 };
  const d = TS.svgFor(1, 1, { seen: true, tile: t3 }); // default dayPart
  ok(d === a, 'default dayPart == midday (additive, old callers unaffected)');
}

// 5. glimpse honesty: terrain only, no detail markers, no entities; fog still fog
{
  const ht = { type: 'haven', detail: havenGrid, stock: 80, maxStock: 100 };
  const full = TS.svgFor(2, 2, { seen: true, tile: ht });
  ok(full.indexOf('#e07b2a') !== -1, 'full render has fire marker');
  const ht2 = { type: 'haven', detail: havenGrid, stock: 80, maxStock: 100 };
  const gl = TS.svgFor(2, 2, { seen: true, tile: ht2, glimpse: true });
  ok(gl.indexOf('#e07b2a') === -1 && gl.length > 100 && gl.indexOf('#0d120d') === -1,
    'glimpse: no detail markers, still a valid (non-fog) tile');
  ok(gl.indexOf('#7cbd6b') !== -1, 'glimpse keeps terrain identity');
  const fogGl = TS.svgFor(2, 2, { seen: false, tile: ht2, glimpse: true });
  ok(fogGl.indexOf('#0d120d') !== -1, 'glimpse + unseen still fog');
}

// 6. robustness: unknown type, missing detail, missing stock
{
  const u = TS.svgFor(0, 0, { seen: true, tile: { type: 'mystery' } });
  ok(u.length > 100 && u.indexOf('#0d120d') === -1, 'unknown type -> bright fallback');
  const nd = TS.svgFor(0, 0, { seen: true, tile: { type: 'meadow' }, dayPart: 9 });
  ok(nd.length > 100, 'out-of-range dayPart clamps, does not throw');
}

// 7. invalidate/touch don't throw without Game
ok((() => { try { TS.invalidate(1, 1); TS.invalidateAll(); TS.touch(1, 1); return true; } catch (e) { return false; } })(),
  'invalidate/invalidateAll/touch safe without Game');

console.log('tile-scenes proof: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
