// Movement + density test (Steve 2026-10-04): d-pad auto node-exit, Haven
// grounds tent density, biome obstacle density. Usage: node scripts/test-move-and-density.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function blockFrac(cells) {
  let b = 0, n = 0;
  for (const row of cells) for (const c of row) { n++; if (Game.cellProps(c).blocks) b++; }
  return b / n;
}
function findTileOf(type) {
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (Game.tileAt(x, y).type === type) return { x, y };
  }
  return null;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  // === 1. AUTO NODE EXIT ===
  // stand at east rim of the haven node (outside), step east
  s.insideHaven = false;
  const hx = Game.map.px, hy = Game.map.py;
  ok('on haven node', Game.playerTile().type === 'haven');
  const r1 = Game.tryNodeExit(1, 0);
  ok('east exit moves', !!(r1 && r1.moved), JSON.stringify(r1));
  ok('map moved east', Game.map.px === hx + 1 && Game.map.py === hy);
  // step back west
  const r2 = Game.tryNodeExit(-1, 0);
  ok('west exit moves back', !!(r2 && r2.moved), JSON.stringify(r2));
  ok('map back at haven', Game.map.px === hx && Game.map.py === hy);
  // inside haven: no exit
  s.insideHaven = true;
  const r3 = Game.tryNodeExit(1, 0);
  ok('inside haven: no exit', r3 === null);
  s.insideHaven = false;
  // diagonal off a corner: dx takes priority, still exits
  const r4 = Game.tryNodeExit(1, 1);
  ok('diagonal exit moves (dx priority)', !!(r4 && r4.moved), JSON.stringify(r4));
  Game.tryNodeExit(-1, -1); // back
  // blocked exit: force a fallen-tree blockage on the east neighbor, then try
  {
    const east = Game.tileAt(Game.map.px + 1, Game.map.py);
    const savedBf = east.blockFrom;
    east.blockFrom = { dx: -1, dy: 0, type: 'fallen_tree' };
    const r5 = Game.tryNodeExit(1, 0);
    ok('blocked exit reports blocked', !!(r5 && r5.blocked), JSON.stringify(r5));
    ok('map did not move on blocked exit', Game.map.px === hx && Game.map.py === hy);
    east.blockFrom = savedBf;
  }

  // === 2. HAVEN GROUNDS TENT DENSITY ===
  // find the haven tile (should be current), gen outside detail
  const havenTile = findTileOf('haven');
  ok('haven tile exists', !!havenTile);
  const grounds = Game.genDetail(havenTile.x, havenTile.y);
  let tents = 0, fires = 0;
  for (const row of grounds) for (const c of row) { if (c === 'tent') tents++; if (c === 'fire') fires++; }
  ok('haven grounds: <= 5 tents', tents <= 5, `tents=${tents}`);
  ok('haven grounds: doorstep (4,2) walkable', !Game.cellProps(grounds[2][4]).blocks, grounds[2][4]);
  // BFS from doorstep: all four rim edges reachable (not trapped)
  const walk = (x, y) => x >= 0 && y >= 0 && x < 9 && y < 9 && !Game.cellProps(grounds[y][x]).blocks;
  const seen = new Set(['4,2']), q = [[4, 2]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !walk(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  const rimReach = [0, 8].some(x => [0, 1, 2, 3, 4, 5, 6, 7, 8].some(y => seen.has(x + ',' + y))) &&
    [0, 8].some(y => [0, 1, 2, 3, 4, 5, 6, 7, 8].some(x => seen.has(x + ',' + y)));
  ok('haven grounds: rim reachable from door (not a trap)', seen.size > 40 && rimReach, `reachable=${seen.size}`);

  // === 3. BIOME DENSITY (blocking fraction, averaged over found tiles) ===
  const dens = {};
  for (const type of ['grove', 'forest_floor', 'wetland', 'meadow', 'ruin']) {
    const fr = [];
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      if (Game.tileAt(x, y).type === type) fr.push(blockFrac(Game.genDetail(x, y)));
    }
    if (fr.length) dens[type] = fr.reduce((a, b) => a + b, 0) / fr.length;
  }
  console.log('blocking fractions:', JSON.stringify(dens, null, 1).replace(/\n/g, ' '));
  if (dens.grove !== undefined) ok('grove: <= 32% blocking', dens.grove <= 0.32, dens.grove.toFixed(2));
  if (dens.forest_floor !== undefined) ok('forest_floor: <= 22% blocking', dens.forest_floor <= 0.22, dens.forest_floor.toFixed(2));
  if (dens.wetland !== undefined) ok('wetland: <= 24% blocking', dens.wetland <= 0.24, dens.wetland.toFixed(2));
  if (dens.meadow !== undefined) ok('meadow: <= 8% blocking', dens.meadow <= 0.08, dens.meadow.toFixed(2));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
