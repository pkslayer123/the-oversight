// Render harness for tile-scenes.js world-map tiles (Steve 2026-10-05).
// Node-only, no browser: evals tile-scenes.js, builds synthetic tiles per
// biome with plausible 9x9 detail grids, renders a contact-sheet SVG across
// biomes x day parts (+ fog / glimpse), for PNG conversion via cairosvg.
// Usage: node scripts/render-tilescenes-20261007.js [--baseline]
//   writes evidence/2026-10-07/tg-tilescene-spread-<mode>.svg
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'evidence', '2026-10-07');
const MODE = process.argv.includes('--baseline') ? 'baseline' : 'polished';

// --- load tile-scenes.js in a fresh namespace (no window needed: uses globalThis) ---
const src = fs.readFileSync(path.join(REPO, 'src/js/tile-scenes.js'), 'utf8');
const sandbox = {};
// eslint-disable-next-line no-eval
(new Function('globalThis', src))(sandbox.globalThis = sandbox);
const TS = sandbox.Scattering.TileScenes;
if (!TS || !TS.svgFor) { console.error('FAIL: TileScenes not loaded'); process.exit(1); }

function seedRand(n) {
  let s = (n >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const BIOMES = ['forest_floor','forest','grove','meadow','field','thicket',
  'wetland','swamp','creek','water','river','trail_edge','trail','path','ruin','haven'];

// Plausible detail-cell vocab per biome (matches game.js cell strings).
const GRID_MIX = {
  forest:      [['bigtree',8],['tree',10],['bush',8],['plant',6],['dirt',10]],
  forest_floor:[['tree',4],['bush',6],['plant',8],['dirt',16]],
  grove:       [['tree',12],['plant',4],['grass',8]],
  meadow:      [['plant',10],['bush',4],['grass',12]],
  field:       [['plant',14],['dirt',8]],
  thicket:     [['bush',16],['tree',6],['plant',4]],
  wetland:     [['water',10],['bush',6],['plant',4],['grass',6]],
  swamp:       [['water',8],['bush',8],['tree',3],['plant',3]],
  creek:       [['water',6],['bush',4],['plant',4],['dirt',6]],
  water:       [['water',30],['bush',1]],
  river:       [['water',14],['bush',2],['plant',2]],
  trail_edge:  [['dirt',14],['plant',2],['bush',2]],
  trail:       [['dirt',16],['plant',2]],
  path:        [['dirt',16],['plant',2]],
  ruin:        [['rubble',6],['wall',4],['plant',3],['dirt',6]],
  haven:       [['lodge',1],['tent',3],['fire',2],['wall',2],['plant',2],['dirt',6]],
};

function makeDetail(biome, seed) {
  const rnd = seedRand(seed);
  const grid = [];
  for (let y = 0; y < 9; y++) { grid.push([]); for (let x = 0; x < 9; x++) grid[y].push(''); }
  const mix = GRID_MIX[biome] || GRID_MIX.meadow;
  const bag = [];
  for (const [cell, n] of mix) for (let i = 0; i < n; i++) bag.push(cell);
  // shuffle
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  const cells = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) cells.push([x, y]);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  for (let i = 0; i < Math.min(bag.length, cells.length); i++) {
    const [x, y] = cells[i];
    grid[y][x] = bag[i];
  }
  return grid;
}

function makeTile(biome, idx) {
  return { type: biome, detail: makeDetail(biome, 1000 + idx * 77), stock: 80, maxStock: 100 };
}

function innerOf(svg) {
  // strip outer <svg ...> wrapper, keep inner content
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

const DAYPARTS = ['dawn', 'midday', 'dusk', 'night'];
const TSZ = 64, GAP = 6, LABEL_H = 16;
const cols = BIOMES.length, rows = DAYPARTS.length + 1; // +1: fog/glimpse/misc row
const W = cols * (TSZ + GAP) + GAP;
const H = rows * (TSZ + LABEL_H + GAP) + GAP;

let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">';
out += '<rect width="' + W + '" height="' + H + '" fill="#111"/>';
out += '<style>text{font-family:sans-serif;font-size:11px;fill:#ccc}</style>';

let tileIdx = 0;
for (let r = 0; r < DAYPARTS.length; r++) {
  const y0 = GAP + r * (TSZ + LABEL_H + GAP);
  out += '<text x="' + GAP + '" y="' + (y0 + 12) + '">' + DAYPARTS[r] + '</text>';
  for (let c = 0; c < BIOMES.length; c++) {
    const x0 = GAP + c * (TSZ + GAP);
    const y1 = y0 + LABEL_H;
    const tile = makeTile(BIOMES[c], tileIdx++);
    const svg = TS.svgFor(3, 3, { seen: true, tile, dayPart: r });
    out += '<g transform="translate(' + x0 + ',' + y1 + ')">' + innerOf(svg) + '</g>';
    out += '<text x="' + (x0 + 2) + '" y="' + (y1 + TSZ - 3) + '" font-size="8">' + BIOMES[c].slice(0, 8) + '</text>';
  }
}
// misc row: fog + glimpse + player-tile + entity markers
{
  const r = DAYPARTS.length;
  const y0 = GAP + r * (TSZ + LABEL_H + GAP);
  out += '<text x="' + GAP + '" y="' + (y0 + 12) + '">misc</text>';
  const y1 = y0 + LABEL_H;
  const cells = [];
  cells.push(['fog', TS.svgFor(0, 0, { seen: false })]);
  cells.push(['glimpse', TS.svgFor(0, 0, { seen: true, tile: makeTile('forest', 9001), glimpse: true })]);
  cells.push(['fog-gl', TS.svgFor(0, 0, { seen: false, tile: makeTile('forest', 9002), glimpse: true })]);
  // entity markers: player tile w/ villagers + animal — needs G() fake via Scattering.Game
  const g2 = { map: { px: 3, py: 3 }, state: { scholar: { mx: 4, my: 5, animal: { mx: 6, my: 2 } }, village: { positions: { v1: { mx: 2, my: 3 }, v2: { mx: 5, my: 6 } } } } };
  sandbox.Scattering.Game = g2;
  const pt = makeTile('meadow', 9003);
  cells.push(['player', TS.svgFor(3, 3, { seen: true, tile: pt })]);
  const nt = makeTile('meadow', 9004);
  cells.push(['night-p', TS.svgFor(3, 3, { seen: true, tile: nt, dayPart: 3 })]);
  delete sandbox.Scattering.Game;
  for (let c = 0; c < cells.length; c++) {
    const x0 = GAP + c * (TSZ + GAP);
    out += '<g transform="translate(' + x0 + ',' + y1 + ')">' + innerOf(cells[c][1]) + '</g>';
    out += '<text x="' + (x0 + 2) + '" y="' + (y1 + TSZ - 3) + '" font-size="8">' + cells[c][0] + '</text>';
  }
}
out += '</svg>';

fs.mkdirSync(OUT, { recursive: true });
const fp = path.join(OUT, 'tg-tilescene-spread-' + MODE + '.svg');
fs.writeFileSync(fp, out);
console.log('wrote', fp, '(' + out.length + ' bytes)');
