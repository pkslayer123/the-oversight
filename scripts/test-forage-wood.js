// Forage wood fix tests (Steve):
// 1. pine trees (no food species) are no longer a dead end in the area sweep —
//    they yield deadfall (sticks/bark fiber), deplete like everything else,
//    and the message is honest (never "Nothing within reach" while at a tree).
// 2. stick/vine are real materials (MAT_DEFS) — donate/take/addMaterial work,
//    so the forage-drop materials can actually reach the village stash.
// Usage: node scripts/test-forage-wood.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
function sayCapture(fn) {
  const msgs = [];
  const orig = Game.say;
  Game.say = (m) => { msgs.push(String(m)); try { orig.call(Game, m); } catch (e) {} };
  let r;
  try { r = fn(); } finally { Game.say = orig; }
  return { r, msgs };
}
function wildTile() {
  Game.debugScenario('day1');
  // deterministic forage ground: the distant-village catch-up sim is real
  // competition, but its RNG stripping would make these wood assertions flaky.
  for (const ov of (Game.state.otherVillages || [])) ov.generated = true;
  // pick a wild target that actually has trees (creeks may have none)
  const cands = Game.travelTargets().filter(t => !Game.travelBlockage(t.x, t.y) && Game.tileAt(t.x, t.y).type !== 'haven' && Game.tileAt(t.x, t.y).type !== 'ruin');
  let tg = cands[0];
  for (const c of cands) {
    const d = Game.genDetail(c.x, c.y);
    if (d.some(row => row.some(cell => cell === 'tree' || cell === 'bigtree'))) { tg = c; break; }
  }
  Game.travelTo(tg.x, tg.y);
  return Game.playerTile();
}
function stickCount() {
  return (Game.state.scholar.inventory || []).filter(i => i.material === 'stick').reduce((t, i) => t + (i.units || 0), 0);
}

(async () => {
  await Game.init();

  // --- 1. pure pine stand: deadfall, not a dead end ---
  {
    const t = wildTile();
    const s = Game.state.scholar;
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    let pineCell = null;
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      const c = detail[cy][cx];
      if (c === 'plant' || c === 'bush') detail[cy][cx] = 'grass'; // clear food cells
      if ((c === 'tree' || c === 'bigtree')) {
        t.modifiers[cx + ',' + cy] = { species: 'pine', health: 'healthy', ivy: false, known: false };
        if (!pineCell) pineCell = [cx, cy];
      }
    }
    ok('test setup: found a pine cell', !!pineCell);
    t.stock = 20;
    s.mx = pineCell[0]; s.my = pineCell[1];
    const before = stickCount();
    const cap = sayCapture(() => Game.doAction('forage'));
    ok('pine forage returns (not null)', cap.r !== null);
    ok('pine yields sticks', stickCount() > before, `sticks ${before} -> ${stickCount()}`);
    const allMsg = cap.msgs.join(' ');
    ok('message honest about deadfall', /deadfall/i.test(allMsg), allMsg.slice(0, 120));
    ok('no "nothing within reach" at a tree', !/Nothing within reach/.test(allMsg));
    ok('pine cell depleted (regrowing)', !!(t.detailRegrow && t.detailRegrow[pineCell[0] + ',' + pineCell[1]]));
  }

  // --- 2. mixed: food + deadfall in one sweep ---
  {
    const t = wildTile();
    const s = Game.state.scholar;
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    let treeCell = null, plantCell = null;
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      const c = detail[cy][cx];
      if ((c === 'tree' || c === 'bigtree') && !treeCell) {
        t.modifiers[cx + ',' + cy] = { species: 'pine', health: 'healthy', ivy: false, known: false };
        treeCell = [cx, cy];
      }
      if (c === 'plant' || c === 'bush') detail[cy][cx] = 'grass';
    }
    ok('test setup: pine cell for mixed test', !!treeCell);
    // plant one known food cell adjacent to the pine
    const px = Math.min(8, treeCell[0] + 1), py = treeCell[1];
    detail[py][px] = 'plant';
    t.plantSpecies = t.plantSpecies || {};
    t.plantSpecies[px + ',' + py] = 'dandelion';
    Game.identifyPlant('dandelion', 'taught');
    t.stock = 20;
    s.mx = treeCell[0]; s.my = treeCell[1];
    const cap = sayCapture(() => Game.doAction('forage'));
    const allMsg = cap.msgs.join(' ');
    ok('mixed sweep runs', cap.r !== null);
    ok('mixed message names the food', /dandelion/i.test(allMsg), allMsg.slice(0, 140));
    ok('mixed message reports deadfall too', /deadfall/i.test(allMsg), allMsg.slice(0, 140));
  }

  // --- 3. stick/vine are real stash materials ---
  // (the stash is physical: takeMaterial only works inside the hall —
  // the Haven stores gate. donate first, then take, both at haven.)
  {
    Game.debugScenario('day1');
    const hv = Game.state.village;
    Game.map.px = hv.px ?? 3; Game.map.py = hv.py ?? 3;
    const s = Game.state.scholar;
    s.insideHaven = true;
    s.inventory = (s.inventory || []).filter(i => i.material !== 'stick' && i.material !== 'vine');
    const added = Game.addMaterial('stick', 3);
    ok('addMaterial stick works', added === 3 && Game.materialCount('stick') === 3, `added=${added}`);
    const addedV = Game.addMaterial('vine', 2);
    ok('addMaterial vine works', addedV === 2 && Game.materialCount('vine') === 2, `addedV=${addedV}`);
    const stashBefore = (Game.stashState().materials || {}).stick || 0;
    Game.donateMaterial('stick', 3);
    const stashAfter = (Game.stashState().materials || {}).stick || 0;
    ok('donateMaterial stick reaches stash', stashAfter === stashBefore + 3 && Game.materialCount('stick') === 0, `${stashBefore} -> ${stashAfter}`);
    Game.takeMaterial('stick', 1);
    ok('takeMaterial stick retrieves', Game.materialCount('stick') === 1, `carry=${Game.materialCount('stick')}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
