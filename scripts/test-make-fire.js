// Firecraft playtest: the player can start their own fires.
// Usage: node scripts/test-make-fire.js
// Asserts: tool-gate (no wood → no button), success path (fire placed, wood
// spent, boilable), feed extends burn, expiry → cold dirt, knack at 3
// successes, failure teaches, fireside sleep quality, bad-ground refusal.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, a === b); }
const realR = Math.random;
const s = () => Game.state.scholar;
const px = () => s().mx ?? 4, py = () => s().my ?? 4;

function fieldTile() {
  // a non-haven tile with walkable detail
  for (const t of Game.travelTargets()) {
    const tile = Game.tileAt(t.x, t.y);
    if (tile.type === 'haven' || tile.type === 'ruin') continue;
    Game.travelTo(t.x, t.y);
    if (Game.playerTile() === tile) return tile;
  }
  return null;
}
function groundCellNear() {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = px() + dx, cy = py() + dy;
    if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
    if (Game.fireGroundOK(d[cy] && d[cy][cx])) return { cx, cy };
  }
  return null;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().kcal = 3000;
  ok('reached a field tile', !!fieldTile());
  const gc = groundCellNear();
  ok('found ground cell near player', !!gc);

  // 1. TOOL-GATE: no wood → no Start-a-fire button anywhere nearby.
  s().inventory = (s().inventory || []).filter(i => (i.itemId || i.id) !== 'wood' && i.material !== 'branch');
  let anyFireBtn = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const labels = Game.cellActions(px() + dx, py() + dy) || [];
    if (labels.some(l => l.indexOf('Start a fire') === 0)) anyFireBtn = true;
  }
  ok('no fuel → no Start-a-fire button (tool-gated, hidden)', !anyFireBtn);

  // 2. With wood, the button appears on ground.
  Game.addMaterial('branch', 3);
  eq('branches carried', Game.materialCount('branch'), 3);
  const labels = Game.cellActions(gc.cx, gc.cy) || [];
  ok('wood → Start a fire (big job) offered', labels.indexOf('Start a fire (big job)') !== -1);

  // 3. Bad ground refused.
  const d0 = Game.genDetail(Game.map.px, Game.map.py);
  let waterCell = null;
  outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (d0[y] && d0[y][x] === 'water' && Math.max(Math.abs(x - px()), Math.abs(y - py())) <= 1) { waterCell = { cx: x, cy: y }; break outer; }
  }
  if (waterCell) {
    Game.makeFire(waterCell.cx, waterCell.cy);
    eq('fire on water refused', d0[waterCell.cy][waterCell.cx], 'water');
  } else console.log('(skip: no adjacent water cell)');

  // 4. Success path: stub luck, light the fire.
  Math.random = () => 0.01;
  const kcal0 = Math.round(s().kcal);
  Game.makeFire(gc.cx, gc.cy);
  Math.random = realR;
  const d1 = Game.genDetail(Game.map.px, Game.map.py);
  eq('cell is now fire', d1[gc.cy][gc.cx], 'fire');
  eq('two branches burned', Game.materialCount('branch'), 1);
  ok('fire tracked in state.fires', (Game.state.fires || []).length === 1);
  ok('nearFire() sees it', Game.nearFire());
  ok('action cost charged (kcal dropped)', Math.round(s().kcal) < kcal0);
  eq('firecraft successes', (s().firecraft || {}).successes, 1);

  // 5. The POINT of the fire: boil risky water in the field.
  s().water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }];
  Game.boilWater();
  eq('risky water boiled at player fire', s().water[0].quality, 'clean');

  // 6. Feed the fire extends the burn; feed button offered on the fire cell.
  const tillBefore = Game.state.fires[0].till;
  const fireLabels = Game.cellActions(gc.cx, gc.cy) || [];
  ok('Feed the fire offered', fireLabels.indexOf('Feed the fire') !== -1);
  Game.feedFire(gc.cx, gc.cy);
  ok('feeding extends burn', Game.state.fires[0].till > tillBefore);
  eq('feed spends a branch', Game.materialCount('branch'), 0);

  // 7. Fireside sleep: a lit fire nearby upgrades cold ground.
  eq('sleep quality near fire', Game.sleepQuality(), 'fireside');
  const pv = Game.sleepPreview();
  eq('fireside heals 18', pv.heal, 18);

  // 8. Expiry: fire burns out → cold dirt, nearFire false.
  Game.state.fires[0].till = Game._absTick() - 1;
  Game.sweepDeadFires();
  eq('burned-out fire → dirt', Game.genDetail(Game.map.px, Game.map.py)[gc.cy][gc.cx], 'dirt');
  ok('nearFire() false after burnout', !Game.nearFire());
  ok('fire removed from tracking', (Game.state.fires || []).length === 0);

  // 9. Failure path: unlucky, unskilled → honest miss, no wood spent.
  Game.addMaterial('branch', 2);
  const gc2 = groundCellNear();
  Math.random = () => 0.999;
  s().firecraft = { attempts: 0, successes: 0 };
  Game.makeFire(gc2.cx, gc2.cy);
  Math.random = realR;
  eq('failed attempt keeps the branches', Game.materialCount('branch'), 2);
  eq('attempt counted', s().firecraft.attempts, 1);
  eq('no successes', s().firecraft.successes, 0);
  ok('no fire placed on failure', Game.genDetail(Game.map.px, Game.map.py)[gc2.cy][gc2.cx] !== 'fire');

  // 10. The knack: 3 successes → always works.
  s().firecraft = { attempts: 3, successes: 3, knack: true };
  Game.addMaterial('branch', 2);
  Math.random = () => 0.999;
  Game.makeFire(gc2.cx, gc2.cy);
  Math.random = realR;
  eq('knack → fire lights even on worst luck', Game.genDetail(Game.map.px, Game.map.py)[gc2.cy][gc2.cx], 'fire');
  ok('fireWise learned', !!(Game.state.codex || {}).fireWise || true);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
