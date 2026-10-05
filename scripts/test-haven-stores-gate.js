// Haven stores gate (Steve 2026-10-04): the pantry and village stash are
// PHYSICAL — inside the hall, or via the System at Full Integration. Outside
// the building they disappear. Tests Game.havenStoresAccess() + the take guards.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;

  // find haven + a wild tile
  let haven = null, wild = null;
  for (let y = 0; y < 7 && (!haven || !wild); y++) for (let x = 0; x < 7; x++) {
    const t = Game.map.tiles[y][x];
    if (t.type === 'haven' && !haven) haven = { x, y };
    if (t.type !== 'haven' && t.type !== 'ruin' && !wild) wild = { x, y };
  }
  ok('haven tile exists', !!haven);
  ok('wild tile exists', !!wild);

  // --- inside the hall: full access ---
  Game.map.px = haven.x; Game.map.py = haven.y;
  s.insideHaven = true;
  ok('inside hall -> inside', Game.havenStoresAccess() === 'inside');

  // --- on the haven grounds, outside the building: nothing ---
  s.insideHaven = false;
  ok('haven grounds, outside hall -> none', Game.havenStoresAccess() === 'none');

  // --- out in the wild, no System: nothing ---
  Game.map.px = wild.x; Game.map.py = wild.y;
  ok('wild, no system -> none', Game.havenStoresAccess() === 'none');

  // --- Full Integration: the System manifests the pantry anywhere ---
  Game.state.systemArrived = true;
  s.integration = 85;
  ok('integration stage 3', Game.integrationStage() === 3);
  ok('wild, full integration -> remote', Game.havenStoresAccess() === 'remote');
  Game.map.px = haven.x; Game.map.py = haven.y;
  s.insideHaven = false;
  ok('haven grounds, full integration -> remote', Game.havenStoresAccess() === 'remote');
  s.insideHaven = true;
  ok('inside hall beats remote', Game.havenStoresAccess() === 'inside');

  // --- below full integration: still physical only ---
  s.integration = 50; // Neural Creep
  s.insideHaven = false;
  ok('neural creep, outside hall -> none', Game.havenStoresAccess() === 'none');
  s.integration = 5; s.insideHaven = true;
  ok('inside hall, low integration -> inside', Game.havenStoresAccess() === 'inside');

  // --- take guards: no access, no take ---
  s.insideHaven = false;
  Game.state.systemArrived = false; s.integration = 5;
  Game.map.px = wild.x; Game.map.py = wild.y;
  ok('access none out wild', Game.havenStoresAccess() === 'none');
  Game.state.village.pantry = [{ name: 'Test food', kcalEach: 100, units: 5, spoilDay: 99, safe: true, kg: 0.2 }];
  const r1 = Game.takeFromPantry(0);
  ok('takeFromPantry blocked without access', r1 === null && Game.state.village.pantry[0].units === 5);
  ok('blocked take says why', Game.log.some(l => /pantry is in the hall/i.test(l)));
  const r2 = Game.takeFromPantryBulk({ 0: 2 });
  ok('takeFromPantryBulk blocked without access', r2 === null && Game.state.village.pantry[0].units === 5);
  const r3 = Game.takeMaterial('wood', 5);
  ok('takeMaterial blocked without access', r3 === null);

  // --- with access, takes work ---
  s.insideHaven = true; Game.map.px = haven.x; Game.map.py = haven.y;
  ok('access inside', Game.havenStoresAccess() === 'inside');
  const unitsBefore = Game.state.village.pantry[0].units;
  Game.takeFromPantry(0);
  ok('takeFromPantry works with access', Game.state.village.pantry[0].units === unitsBefore - 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
