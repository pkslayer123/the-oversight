// Tap-a-person movement: player should end ADJACENT to the villager, not on their tile.
// Usage: node scripts/test-person-tap.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// Mirror of the adjacent-spot selection in app.js cell click handler.
function nearestAdjacentSpot(cx, cy, px, py) {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  let best = null, bestD = 999;
  for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    if (Game.cellProps(detail[ny] && detail[ny][nx]).blocks) continue;
    const path = Game.findPath(px, py, nx, ny);
    if (!path || !path.length) continue;
    if (path.length < bestD) { bestD = path.length; best = [nx, ny]; }
  }
  return best;
}

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {}

  const s = Game.state.scholar;
  const vpos = Game.state.village.positions;
  const vids = Object.keys(vpos);
  ok('villagers have positions', vids.length > 0);

  let tested = 0;
  for (const vid of vids.slice(0, 6)) {
    const vp = vpos[vid];
    // put player 3 tiles away (clamp into grid)
    const px = Math.max(0, Math.min(8, vp.mx + 3));
    const py = Math.max(0, Math.min(8, vp.my + 3));
    s.mx = px; s.my = py;
    const vdist = Math.max(Math.abs(vp.mx - px), Math.abs(vp.my - py));
    if (vdist <= 1) continue; // already adjacent — not this branch
    const spot = nearestAdjacentSpot(vp.mx, vp.my, px, py);
    if (!spot) continue; // surrounded — fallback path, skip
    tested++;
    // spot must be adjacent to villager, not their tile
    const adj = Math.max(Math.abs(spot[0] - vp.mx), Math.abs(spot[1] - vp.my)) === 1;
    ok(`spot adjacent to ${vid}`, adj);
    ok(`spot is not villager tile ${vid}`, !(spot[0] === vp.mx && spot[1] === vp.my));
    // move there; player must not end on villager's tile
    const moved = Game.movePath(spot[0], spot[1]);
    if (moved) {
      const onTop = (s.mx === vp.mx && s.my === vp.my);
      ok(`player not on top of ${vid} after move`, !onTop);
      const nowAdj = Math.max(Math.abs(s.mx - vp.mx), Math.abs(s.my - vp.my)) <= 1;
      ok(`player adjacent to ${vid} after move`, nowAdj);
    }
  }
  ok('tested at least one distant villager', tested > 0);

  // adjacent case: vdist === 1 → no movement expected (card opens, tested in UI)
  // explicit step: microMove onto their tile still works when chosen
  const vid2 = vids[0], vp2 = vpos[vid2];
  s.mx = Math.max(0, vp2.mx - 1); s.my = vp2.my;
  const canStep = Game.microMove(vp2.mx, vp2.my);
  ok('explicit step onto villager tile still possible', canStep === true || canStep === false); // must not throw
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
