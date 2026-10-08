// @ontology
// system: combat-engine
// description: Turn-based grid combat pure helpers. 9x9 detail grid, speed order, square-targeted telegraphed attacks.
// provides:
//   - roll(range)
//   - cheb(ax, ay, bx, by)
//   - inGrid(x, y)
//   - turnOrder(fighters)
//   - patternCells(pattern, ax, ay, tx, ty)
//   - isFoe(a, b)
//   - nearestEnemy(fighters, f)
//   - stepToward(fx, fy, tx, ty, blocked, avoidCells)
//   - stepAway(fx, fy, tx, ty, blocked, avoidCells)
//   - villagerDecide(f, fighters, blocked, dangerCells)
// rules:
//   - zero-range: beam/line/charge with attacker and target on the same tile covers the shared tile — zero range never whiffs. (code: patternCells)
// consumes:
//   - (none documented)
/* Turn-based grid combat engine — pure helpers.
   Combat happens on the 9x9 detail grid. Everyone acts in speed order.
   Attacks typically target SQUARES (telegraphed — dodge by moving).
   Some attacks target fighters directly (unavoidable by movement).
   Stateful turn logic lives in Game (game.js); geometry + AI live here. */
(function (global) {
  'use strict';

  function roll(range) { return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1)); }
  function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
  function key(x, y) { return x + ',' + y; }
  function inGrid(x, y) { return x >= 0 && x <= 8 && y >= 0 && y <= 8; }

  // turnOrder: speed desc. Ties: player first, then villagers, then monsters.
  function turnOrder(fighters) {
    const rank = { player: 0, villager: 1, monster: 2 };
    return fighters
      .filter(f => f.alive && !f.fled)
      .slice()
      .sort((a, b) => (b.speed - a.speed) || (rank[a.kind] - rank[b.kind]) || (Math.random() - 0.5))
      .map(f => f.key);
  }

  // patternCells: squares an attack will hit, given attacker pos + target pos.
  // pattern: {type, length, width, radius, range}
  function patternCells(pattern, ax, ay, tx, ty) {
    const cells = [];
    const type = pattern.type;
    if (type === 'beam' || type === 'line' || type === 'charge') {
      // DDA rasterization along the TRUE bearing (Steve 2026-10-06). The old
      // sign()-snap drew the lane along the nearest 8-way ray, so a
      // committed charge could miss a stationary target at off-axis angles
      // (aim was the player, the lane went diagonal, threatened=false).
      // Walking the real bearing guarantees the lane passes through the aim
      // point; at 8-way angles the output is identical to the old snap.
      const ex = tx - ax, ey = ty - ay;
      const n = Math.max(Math.abs(ex), Math.abs(ey));
      // ZERO-RANGE (break-it 2026-10-08): attacker and target share a tile.
      // The lane is the tile itself — a beam/line/charge at zero range hits
      // what's on top of you. (Was: empty cell list — the attack whiffed
      // forever, and beams lied "cover works" while standing on your square.
      // Same-tile spawns are real: bump-in-the-dark, door-flee re-engage.)
      if (n === 0) cells.push({ cx: ax, cy: ay });
      const len = pattern.length || 5, w = pattern.width || 1;
      const dx = Math.sign(ex), dy = Math.sign(ey);
      for (let i = 1; n > 0 && i <= len; i++) {
        const cx = Math.round(ax + ex * i / n), cy = Math.round(ay + ey * i / n);
        if (!inGrid(cx, cy)) break;
        cells.push({ cx, cy });
        // width: perpendicular spread (unchanged semantics)
        if (w > 1 && dx !== 0 && dy !== 0) {
          // diagonal beam: widen orthogonally
          if (inGrid(cx + 1, cy)) cells.push({ cx: cx + 1, cy });
          if (inGrid(cx, cy + 1)) cells.push({ cx, cy: cy + 1 });
        } else if (w > 1) {
          const px = dy !== 0 ? 1 : 0, py = dx !== 0 ? 1 : 0;
          if (inGrid(cx + px, cy + py)) cells.push({ cx: cx + px, cy: cy + py });
          if (inGrid(cx - px, cy - py)) cells.push({ cx: cx - px, cy: cy - py });
        }
      }
    } else if (type === 'burst' || type === 'ambush') {
      const r = pattern.radius || 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (cheb(0, 0, dx, dy) > r) continue;
        const cx = ax + dx, cy = ay + dy;
        if (inGrid(cx, cy)) cells.push({ cx, cy });
      }
    }
    // dedupe
    const seen = new Set(), out = [];
    for (const c of cells) { const k = key(c.cx, c.cy); if (!seen.has(k)) { seen.add(k); out.push(c); } }
    return out;
  }

  // nearestEnemy: closest living fighter of an opposing side.
  // sides: player+villager vs monster. (hostile survivors count as monsters.)
  function isFoe(a, b) {
    if (a.kind === 'monster' || a.kind === 'hostile') return b.kind !== 'monster' && b.kind !== 'hostile';
    return b.kind === 'monster' || b.kind === 'hostile';
  }
  function nearestEnemy(fighters, f) {
    let best = null, bestD = 99;
    for (const o of fighters) {
      if (!o.alive || o.fled || o.key === f.key) continue;
      if (!isFoe(f, o)) continue;
      const d = cheb(f.mx, f.my, o.mx, o.my);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best ? { f: best, d: bestD } : null;
  }

  // stepToward: one step (8-dir) reducing Chebyshev distance, avoiding blocked cells.
  // blocked(x,y): callback. avoidCells: Set of "x,y" to avoid (telegraphs).
  function stepToward(fx, fy, tx, ty, blocked, avoidCells) {
    let best = null, bestD = cheb(fx, fy, tx, ty);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = fx + dx, ny = fy + dy;
      if (!inGrid(nx, ny) || blocked(nx, ny)) continue;
      const d = cheb(nx, ny, tx, ty);
      const danger = avoidCells && avoidCells.has(key(nx, ny));
      if (d < bestD && !danger) { bestD = d; best = { x: nx, y: ny }; }
    }
    // if every improving step is dangerous, take the least-bad improving step anyway
    if (!best) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = fx + dx, ny = fy + dy;
        if (!inGrid(nx, ny) || blocked(nx, ny)) continue;
        if (cheb(nx, ny, tx, ty) < cheb(fx, fy, tx, ty)) { best = { x: nx, y: ny }; break; }
      }
    }
    return best;
  }

  function stepAway(fx, fy, tx, ty, blocked, avoidCells) {
    let best = null, bestD = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = fx + dx, ny = fy + dy;
      if (!inGrid(nx, ny) || blocked(nx, ny)) continue;
      const d = cheb(nx, ny, tx, ty);
      const danger = avoidCells && avoidCells.has(key(nx, ny)) ? -100 : 0;
      if (d + danger > bestD) { bestD = d + danger; best = { x: nx, y: ny }; }
    }
    return best;
  }

  // villager AI: personality -> behavior. Returns {moves:[[x,y]..], action}.
  // action: {type:'strike', target} | {type:'harry', target} | {type:'help', target} | {type:'flee'} | {type:'wait'}
  function villagerDecide(f, fighters, blocked, dangerCells) {
    const moves = [];
    let fx = f.mx, fy = f.my;
    const foe = nearestEnemy(fighters, f);
    const moveTo = (tx, ty, toward) => {
      for (let i = 0; i < f.speed; i++) {
        const s = toward ? stepToward(fx, fy, tx, ty, blocked, dangerCells)
                         : stepAway(fx, fy, tx, ty, blocked, dangerCells);
        if (!s) break;
        fx = s.x; fy = s.y; moves.push([fx, fy]);
      }
    };
    const ally = (kind) => fighters.find(o => o.alive && !o.fled && o.kind === kind && o.key !== f.key);
    const player = ally('player');

    if (f.ai === 'brave') {
      if (!foe) return { moves, action: { type: 'wait' } };
      if (cheb(fx, fy, foe.f.mx, foe.f.my) <= 1) {
        return { moves, action: { type: 'strike', target: foe.f.key } };
      }
      moveTo(foe.f.mx, foe.f.my, true);
      const d2 = cheb(fx, fy, foe.f.mx, foe.f.my);
      if (d2 <= 1) return { moves, action: { type: 'strike', target: foe.f.key } };
      if (d2 <= 3) return { moves, action: { type: 'harry', target: foe.f.key } }; // thrown rock
      return { moves, action: { type: 'wait' } };
    }
    if (f.ai === 'cautious') {
      // flee if hurt or if a monster is close
      if ((f.hp / f.maxHp) < 0.5 || (foe && foe.d <= 2)) {
        if (foe) moveTo(foe.f.mx, foe.f.my, false);
        return { moves, action: { type: 'flee' } };
      }
      // otherwise keep distance from the fight
      if (foe && foe.d <= 4) moveTo(foe.f.mx, foe.f.my, false);
      return { moves, action: { type: 'wait' } };
    }
    // helpful: stick near the player, patch them up, harry monsters
    if (player && (player.hp / player.maxHp) < 0.7 && !f.helped) {
      if (cheb(fx, fy, player.mx, player.my) <= 1) {
        return { moves, action: { type: 'help', target: player.key } };
      }
      moveTo(player.mx, player.my, true);
      if (cheb(fx, fy, player.mx, player.my) <= 1) return { moves, action: { type: 'help', target: player.key } };
      return { moves, action: { type: 'wait' } };
    }
    if (foe && cheb(fx, fy, foe.f.mx, foe.f.my) <= 1) {
      return { moves, action: { type: 'harry', target: foe.f.key } };
    }
    if (foe && foe.d <= 3) {
      // close in to harry, but don't stand in telegraphs
      moveTo(foe.f.mx, foe.f.my, true);
      if (cheb(fx, fy, foe.f.mx, foe.f.my) <= 1) return { moves, action: { type: 'harry', target: foe.f.key } };
    } else if (player) {
      moveTo(player.mx, player.my, true);
    }
    return { moves, action: { type: 'wait' } };
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.combat = {
    roll, cheb, key, inGrid, turnOrder, patternCells,
    isFoe, nearestEnemy, stepToward, stepAway, villagerDecide,
  };
})(typeof window !== 'undefined' ? window : globalThis);
