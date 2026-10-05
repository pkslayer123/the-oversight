// Forager loop: patch honesty + real competition. Usage: node scripts/test-forage-competition.js
// Steve's rules under test:
//  - no silent/lying actions: the sweep reports the PATCH, not the tile.
//    "Picked clean" must mean the patch; an empty sweep on a tile that still
//    has green must point at the next patch, not send the player away.
//  - competition is real: when villagers take food, the world loses it —
//    grid cells, not just the abstract stock number. A "depleted" tile the
//    player visits for the first time shows the stripping in its grid.
//  - regrow accounting doesn't double-count: grid-level depletion recovers
//    through the 3-day cell cycle; the +1/day abstract top-up is only for
//    abstract (unvisited-tile) nibbles.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/food.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
let said = [];
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 100; s.hydration = 100;
  Game.state.codex.plants = {};
  said = [];
  Game.say = (t) => { said.push(String(t)); };
  const v = Game.state.village;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }
  // deterministic forage ground: the distant-village catch-up sim (real
  // competition, but RNG-heavy) is out of scope for these assertions.
  for (const ov of (Game.state.otherVillages || [])) ov.generated = true;
  return { s, v, hx: v.px ?? 3, hy: v.py ?? 3 };
}
const sayText = () => said.join(' | ');
const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
function firstNaturalTile(hx, hy, maxD) {
  for (let d = 1; d <= maxD; d++) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (Math.abs(x - hx) + Math.abs(y - hy) !== d) continue;
    const t = Game.tileAt(x, y);
    if (t && t.type !== 'haven' && t.type !== 'ruin') return { x, y, t };
  }
  return null;
}

(async () => {
  await Game.init();

  // 1. Successful sweep names the PATCH, never the tile.
  {
    const { s, hx, hy } = freshGame();
    const nt = firstNaturalTile(hx, hy, 3);
    Game.travelTo(nt.x, nt.y, true);
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    // stand on a real green cell so the sweep finds something
    let stood = false;
    for (let y = 0; y < 9 && !stood; y++) for (let x = 0; x < 9; x++) {
      if (FORAGEABLE[detail[y][x]]) { s.mx = x; s.my = y; stood = true; break; }
    }
    ok('test setup: green cell to stand on', stood);
    said = [];
    Game.doAction('forage');
    const text = sayText();
    ok('sweep message says "This patch is picked clean"', text.includes('This patch is picked clean'), text.slice(0, 160));
    ok('sweep message never bare "Picked clean"', !text.includes('. Picked clean') && !text.includes(': Picked clean'), text.slice(0, 160));
  }

  // 2. Empty sweep, green elsewhere on the tile -> point at the next patch.
  {
    const { s, hx, hy } = freshGame();
    const nt = firstNaturalTile(hx, hy, 3);
    Game.travelTo(nt.x, nt.y, true);
    const t = Game.playerTile();
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    s.mx = 4; s.my = 4;
    // work out the 3x3 around the player, leave the rest of the tile alone
    t.detailRegrow = t.detailRegrow || {};
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = 4 + dx, cy = 4 + dy;
      if (FORAGEABLE[detail[cy][cx]]) t.detailRegrow[cx + ',' + cy] = { day: s.day + 3, was: detail[cy][cx] };
    }
    // sanity: some green remains elsewhere on the tile
    let greenElsewhere = false;
    for (let y = 0; y < 9 && !greenElsewhere; y++) for (let x = 0; x < 9; x++) {
      if (Math.abs(x - 4) <= 1 && Math.abs(y - 4) <= 1) continue;
      if (FORAGEABLE[detail[y][x]] && !(t.detailRegrow[x + ',' + y])) { greenElsewhere = true; break; }
    }
    said = [];
    Game.doAction('forage');
    const text = sayText();
    if (greenElsewhere) {
      ok('empty sweep with green elsewhere points at next patch', text.includes('another green patch'), text.slice(0, 160));
      ok('empty sweep does not send player off the tile', !text.includes('Walk to the green first'), text.slice(0, 160));
    } else {
      ok('empty sweep on stripped tile is honest', text.includes('Nothing within reach'), text.slice(0, 160));
    }
  }

  // 3. Empty sweep, nothing green anywhere on the tile -> honest nothing.
  {
    const { s, hx, hy } = freshGame();
    const nt = firstNaturalTile(hx, hy, 3);
    Game.travelTo(nt.x, nt.y, true);
    const t = Game.playerTile();
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    t.detailRegrow = t.detailRegrow || {};
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (FORAGEABLE[detail[y][x]]) t.detailRegrow[x + ',' + y] = { day: s.day + 3, was: detail[y][x] };
    }
    said = [];
    Game.doAction('forage');
    ok('fully stripped tile says nothing within reach', sayText().includes('Nothing within reach'), sayText().slice(0, 160));
  }

  // 4. depleteRandomTile strips real grid cells on visited tiles.
  {
    const { s, hx, hy } = freshGame();
    const nt = firstNaturalTile(hx, hy, 2);
    Game.travelTo(nt.x, nt.y, true);
    const t = Game.playerTile();
    Game.genDetail(Game.map.px, Game.map.py); // grid exists now
    // isolate: only this tile has stock, so all 3 units land here
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const o = Game.tileAt(x, y);
      if (o !== t) o.stock = 0;
    }
    const stockBefore = t.stock;
    const regrowBefore = Object.keys(t.detailRegrow || {}).length;
    let availBefore = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (FORAGEABLE[t.detail[y][x]] && !(t.detailRegrow || {})[x + ',' + y]) availBefore++;
    }
    ok('test setup: tile has stock and green cells', stockBefore >= 3 && availBefore >= 3, `stock=${stockBefore} avail=${availBefore}`);
    Game.depleteRandomTile(3, hx, hy);
    const regrowAfter = Object.keys(t.detailRegrow || {}).length;
    ok('depleteRandomTile lowers stock', t.stock === stockBefore - 3, `stock ${stockBefore} -> ${t.stock}`);
    ok('depleteRandomTile marks grid cells regrowing', regrowAfter === regrowBefore + 3, `regrow ${regrowBefore} -> ${regrowAfter}`);
    // the sweep must now find fewer cells: competition the player can feel
    let availAfter = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (FORAGEABLE[t.detail[y][x]] && !(t.detailRegrow || {})[x + ',' + y]) availAfter++;
    }
    ok('stripped cells are gone from the sweep', availAfter === availBefore - 3, `${availBefore} -> ${availAfter}`);
  }

  // 5. First visit to an abstractly-depleted tile: the grid shows the stripping.
  {
    const { s, hx, hy } = freshGame();
    // find a natural tile with a rich enough grid (seeded layout: measure,
    // reset, then deplete — regeneration gives the same grid)
    let nt = null, probeCount = 0;
    for (let d = 1; d <= 3 && !nt; d++) for (let y = 0; y < 7 && !nt; y++) for (let x = 0; x < 7 && !nt; x++) {
      if (Math.abs(x - hx) + Math.abs(y - hy) !== d) continue;
      const t = Game.tileAt(x, y);
      if (!t || t.type === 'haven' || t.type === 'ruin' || t.detail) continue;
      const probe = Game.genDetail(x, y);
      let c = 0;
      for (let py = 0; py < 9; py++) for (let px = 0; px < 9; px++) if (FORAGEABLE[probe[py][px]]) c++;
      if (c >= 9) { nt = { x, y, t }; probeCount = c; }
    }
    ok('test setup: rich tile found', !!nt, `probeCount=${probeCount}`);
    const t = nt.t;
    delete t.detail; delete t.detailRegrow;
    t.maxStock = 3; t.stock = 1; // villagers nibbled 2/3 before the player ever came
    const detail = Game.genDetail(nt.x, nt.y);
    // reconstruct the gen-time grid count: plants stripped -> dirt are gone
    // from the grid, but detailRegrow remembers what they were
    let strippedPlants = 0;
    for (const k of Object.keys(t.detailRegrow || {})) {
      if (t.detailRegrow[k].was === 'plant') strippedPlants++;
    }
    let countAfter = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (FORAGEABLE[detail[y][x]]) countAfter++;
    const genCount = countAfter + strippedPlants;
    const stripped = Object.keys(t.detailRegrow || {}).length;
    const expectedKeep = Math.round(genCount / 3);
    ok('first-visit grid strips the nibbled share', stripped === genCount - expectedKeep, `genCount=${genCount} stripped=${stripped} expected=${genCount - expectedKeep}`);
    ok('first-visit stock matches the grid', t.stock === expectedKeep && t.maxStock === genCount, `stock=${t.stock}/${t.maxStock} expected=${expectedKeep}/${genCount}`);
    // and the player is not locked out after one press on a "depleted" tile
    Game.travelTo(nt.x, nt.y, true);
    said = [];
    Game.doAction('forage');
    ok('stripped tile still forageable where green remains', !sayText().includes('Nothing left to take here today'), sayText().slice(0, 160));
  }

  // 6. regrowTiles: no double recovery.
  {
    const { s, hx, hy } = freshGame();
    const nt = firstNaturalTile(hx, hy, 2);
    Game.travelTo(nt.x, nt.y, true);
    const t = Game.playerTile();
    Game.genDetail(Game.map.px, Game.map.py);
    // case A: grid-level depletion outstanding -> no abstract top-up
    t.detailRegrow = { '0,0': { day: s.day + 3, was: 'plant' } };
    t.stock = 5; t.maxStock = 19; t.foragePressure = 0; t.foragedToday = false;
    const dayBefore = s.day;
    Game.regrowTiles();
    ok('grid-depleted tile gets no abstract top-up', t.stock === 5, `stock=${t.stock}`);
    // case B: abstract-only nibble (no grid depletion) -> top-up applies
    t.detailRegrow = {};
    t.stock = 5;
    Game.regrowTiles();
    ok('abstract nibble still tops up +1/day', t.stock === 6, `stock=${t.stock}`);
    void dayBefore;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
