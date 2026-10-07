// @ontology
// system: combat-engine
// description: Turn-based grid combat pure helpers. 9x9 detail grid, speed order, square-targeted telegraphed attacks.
// provides:
//   - roll(range)
//   - cheb(ax, ay, bx, by)
//   - inGrid(x, y)
//   - isInterior(x, y)
//   - turnOrder(fighters)
//   - patternCells(pattern, ax, ay, tx, ty)
//   - cellsAtPhase(pattern, ax, ay, tx, ty, phase)
//   - dodgeable(dangerCells, fx, fy, speed, blocked)
//   - isFoe(a, b)
//   - nearestEnemy(fighters, f)
//   - stepToward(fx, fy, tx, ty, blocked, avoidCells)
//   - stepAway(fx, fy, tx, ty, blocked, avoidCells)
//   - villagerDecide(f, fighters, blocked, dangerCells)
//   - hpFrac(f)
//   - desperate(f)
//   - traumaOf(f)
//   - flinching(f)
//   - monsterDesperate(f)
//   - villagerShield(f, fighters, blocked, dangerCells)
//   - monsterTacticPlan(f, fighters, blocked, dangerCells)
//   - patternInfo(type)
//   - telegraphText(pattern, phase, known)
//   - phaseTiming(pattern, variant)
//   - applyVariant(pattern, variant)
//   - patternFollowUp(pattern)
//   - zoneArmed(pattern, px, py)
// rules:
//   - grid edges (x=0/8, y=0/8) are the flee-by-barrier: no movement helper routes onto an edge tile (code: combat.js isInterior/stepToward/stepAway)
//   - telegraphed attacks stay dodgeable-by-movement: windup shows the same cells as the action (code: combat.js cellsAtPhase/dodgeable)
//   - direct lock-on telegraphs honestly: windup marks the target's square NOW, game.js re-locks at fire time, so each call keeps windup-cells == action-cells (code: combat.js patternCells 'lockon'/telegraphText)
//   - ambush zones are seeded ground: the zone is centered on pattern.center, arms when stepped in, and runs a visible arming beat before firing (code: combat.js patternCells 'ambush-zone'/zoneArmed)
//   - every pattern carries anatomy metadata so the visual justifies the attack — no disconnect between what you see and what it does (code: combat.js PATTERN_INFO)
//   - knowledge gates telegraph text: unknown players get honest warning, never the cue or the counterplay (code: combat.js telegraphText)
//   - variant escalation is pure data keyed off a variant flag, never monster data edits: veteran=longer, scarred=wider, elder=second phase, pack-leader=faster windup (code: combat.js applyVariant/patternFollowUp/phaseTiming)
//   - violence is desperate, never casual: under 35% HP fighters fight desperate; under 25% monsters abandon pattern discipline (code: combat.js desperate/monsterDesperate)
//   - monsters were sent to fight: every tactic plan engages; purposeless disengagement never appears in a plan (code: combat.js monsterTacticPlan)
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

  // isInterior: grid edges (x=0/8, y=0/8) are the flee-by-barrier BY DESIGN.
  // Playable ground is tiles 1..7. Movement helpers must never route a
  // fighter onto an edge tile.
  function isInterior(x, y) { return x >= 1 && x <= 7 && y >= 1 && y <= 7; }

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
    } else if (type === 'lockon') {
      // Direct lock-on: fires at the target's square. Windup marks the
      // target's square NOW; game.js re-locks at fire time (re-calling with
      // the target's current position), so each individual call keeps the
      // windup-cells == action-cells invariant. Dodge = don't be standing
      // there when it fires.
      if (inGrid(tx, ty)) cells.push({ cx: tx, cy: ty });
    } else if (type === 'ambush-zone') {
      // Seeded ground: the zone is centered on pattern.center (a fixed patch
      // of ground), NOT on the attacker. Falls back to the attacker square.
      const cz = pattern.center || { x: ax, y: ay };
      const r = pattern.radius || 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (cheb(0, 0, dx, dy) > r) continue;
        const cx = cz.x + dx, cy = cz.y + dy;
        if (inGrid(cx, cy)) cells.push({ cx, cy });
      }
    }
    // dedupe
    const seen = new Set(), out = [];
    for (const c of cells) { const k = key(c.cx, c.cy); if (!seen.has(k)) { seen.add(k); out.push(c); } }
    return out;
  }

  // cellsAtPhase: telegraph phase system, pure. windup -> action -> recovery.
  // Returns the pattern's cell set tagged for the UI:
  //   windup:   the SAME cells the attack will hit, danger:false — the readable
  //            preview the player dodges out of. Cells carry `idx`, the sweep
  //            order from the attacker, so the UI can light them progressively.
  //   action:   the striking cells, danger:true.
  //   recovery: [] — the attack is spent; the UI clears its highlights.
  // Because windup and action cover the same cells, telegraphs stay
  // dodgeable-by-movement: leave the highlighted cells before the action.
  function cellsAtPhase(pattern, ax, ay, tx, ty, phase) {
    if (phase === 'recovery') return [];
    const base = patternCells(pattern, ax, ay, tx, ty);
    const ordered = base.map(c => ({ cx: c.cx, cy: c.cy, d: cheb(ax, ay, c.cx, c.cy) }));
    ordered.sort((a, b) => a.d - b.d);
    ordered.forEach((c, i) => { c.idx = i; delete c.d; });
    const danger = phase === 'action';
    return ordered.map(c => ({ cx: c.cx, cy: c.cy, idx: c.idx, danger }));
  }

  // dodgeable: can a fighter at (fx,fy) with `speed` moves reach a tile that
  // is NOT in dangerCells? BFS over interior tiles only; blocked(x,y) optional.
  // This is the machine-checkable side of "dodge by moving".
  function dodgeable(dangerCells, fx, fy, speed, blocked) {
    const bad = new Set(dangerCells.map(c => key(c.cx, c.cy)));
    const seen = new Set([key(fx, fy)]);
    let frontier = [[fx, fy]];
    for (let s = 0; s <= speed; s++) {
      for (const [x, y] of frontier) if (!bad.has(key(x, y))) return true;
      const next = [];
      for (const [x, y] of frontier) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (!isInterior(nx, ny)) continue;
          if (blocked && blocked(nx, ny)) continue;
          const k = key(nx, ny);
          if (seen.has(k)) continue;
          seen.add(k); next.push([nx, ny]);
        }
      }
      frontier = next;
      if (!frontier.length) return false;
    }
    return false;
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
  // INTERIOR INVARIANT: never routes onto an edge tile (x=0/8, y=0/8) — those
  // are the flee-by-barrier by design. A fighter already on an edge is walked
  // inward onto interior ground.
  function stepToward(fx, fy, tx, ty, blocked, avoidCells) {
    let best = null, bestD = cheb(fx, fy, tx, ty);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = fx + dx, ny = fy + dy;
      if (!isInterior(nx, ny) || blocked(nx, ny)) continue;
      const d = cheb(nx, ny, tx, ty);
      const danger = avoidCells && avoidCells.has(key(nx, ny));
      if (d < bestD && !danger) { bestD = d; best = { x: nx, y: ny }; }
    }
    // if every improving step is dangerous, take the least-bad improving step anyway
    if (!best) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = fx + dx, ny = fy + dy;
        if (!isInterior(nx, ny) || blocked(nx, ny)) continue;
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
      if (!isInterior(nx, ny) || blocked(nx, ny)) continue;
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

  // --- Desperate / traumatic violence (Steve: violence is desperate and
  // traumatic, never casual). All pure, all with clear guessable triggers
  // that game.js reads off fighter fields it already tracks.
  function hpFrac(f) { return f.maxHp > 0 ? f.hp / f.maxHp : 0; }
  // desperate: under 35% HP a fighter stops fighting clean and starts fighting
  // to survive. Guessable trigger: hp/maxHp < 0.35.
  function desperate(f) { return !!f.alive && hpFrac(f) < 0.35; }
  // traumaOf: how many allies this fighter has watched fall this fight
  // (game.js increments f.trauma on witnessed deaths).
  function traumaOf(f) { return f.trauma || 0; }
  // flinching: took a single hit worth >=30% of max HP. Guessable trigger:
  // f.lastHitFrac >= 0.3 (game.js stamps this on every hit).
  function flinching(f) { return !!f.alive && (f.lastHitFrac || 0) >= 0.3 && !desperate(f); }
  // monsterDesperate: under 25% HP a monster abandons pattern discipline and
  // goes reckless — monsters were sent to fight, and a dying one fights ugly.
  function monsterDesperate(f) {
    return !!f.alive && (f.kind === 'monster' || f.kind === 'hostile') && hpFrac(f) < 0.25;
  }

  // villagerShield: sometimes shielding others beats optimal damage. Returns a
  // {moves, action} plan in the same shape as villagerDecide so game.js can
  // call it directly: walk to the body-blocking tile next to the most-hurt
  // ally (interior, unblocked), then {type:'shield', target}. Suggested
  // trigger for game.js: a villager with ai 'helpful'/'brave' when their
  // nearest ally is desperate(f), or when they themselves are flinching.
  function villagerShield(f, fighters, blocked, dangerCells) {
    const moves = [];
    let fx = f.mx, fy = f.my;
    const noBlocked = blocked || (() => false);
    const allies = fighters.filter(o => o.alive && !o.fled && o.key !== f.key &&
      (o.kind === 'player' || o.kind === 'villager'));
    if (!allies.length) return { moves, action: { type: 'wait' }, intent: 'shield' };
    allies.sort((a, b) => hpFrac(a) - hpFrac(b));
    const ward = allies[0];
    let best = null, bestScore = -1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = ward.mx + dx, ny = ward.my + dy;
      if (!isInterior(nx, ny) || noBlocked(nx, ny)) continue;
      // reach is good; standing between the ward and a foe is better;
      // standing in a telegraph is bad (a shield that eats the beam anyway
      // is a choice, not an accident).
      let score = -cheb(fx, fy, nx, ny) * 2;
      for (const o of fighters) {
        if (!o.alive || o.fled || !isFoe(f, o)) continue;
        score += Math.max(0, 3 - cheb(nx, ny, o.mx, o.my));
      }
      if (dangerCells && dangerCells.has(key(nx, ny))) score -= 4;
      if (score > bestScore) { bestScore = score; best = { x: nx, y: ny }; }
    }
    if (best) {
      for (let i = 0; i < f.speed; i++) {
        const s = stepToward(fx, fy, best.x, best.y, noBlocked, dangerCells);
        if (!s) break;
        fx = s.x; fy = s.y; moves.push([fx, fy]);
        if (fx === best.x && fy === best.y) break;
      }
    }
    const adjacent = cheb(fx, fy, ward.mx, ward.my) <= 1;
    return {
      moves,
      action: adjacent ? { type: 'shield', target: ward.key } : { type: 'wait' },
      intent: 'shield',
      ward: ward.key,
    };
  }

  // monsterTacticPlan: distinct monster tactics as pure plans. game.js can call
  // this with f.tactic in {'charge','burst','circle','skirmish'}. Every branch
  // ENGAGES — monsters were sent to fight; purposeless disengagement is not
  // an allowed plan. Returns {moves, action, intent} where action is one of
  // {type:'strike',target} | {type:'telegraph',pattern,target} | {type:'wait'}.
  // 'telegraph' hands game.js the pattern + target square so it can run the
  // windup -> action -> recovery phases via cellsAtPhase.
  function monsterTacticPlan(f, fighters, blocked, dangerCells) {
    const moves = [];
    let fx = f.mx, fy = f.my;
    const noBlocked = blocked || (() => false);
    const foe = nearestEnemy(fighters, f);
    const walk = (tx, ty, toward, n, avoid) => {
      for (let i = 0; i < n; i++) {
        const s = toward ? stepToward(fx, fy, tx, ty, noBlocked, avoid)
                         : stepAway(fx, fy, tx, ty, noBlocked, avoid);
        if (!s) break;
        fx = s.x; fy = s.y; moves.push([fx, fy]);
      }
    };
    const chargePattern = f.pattern || { type: 'charge', length: f.chargeRange || 5 };
    if (!foe) return { moves, action: { type: 'wait' }, intent: 'idle' };
    const tactic = f.tactic || 'skirmish';

    // Desperate overrides tactics: no pattern discipline, reckless rush at the
    // nearest enemy, straight through telegraphs. Dying monsters fight ugly.
    if (monsterDesperate(f)) {
      walk(foe.f.mx, foe.f.my, true, f.speed, null);
      const d = cheb(fx, fy, foe.f.mx, foe.f.my);
      return {
        moves,
        action: d <= 1 ? { type: 'strike', target: foe.f.key } : { type: 'wait' },
        intent: 'desperate-rush',
      };
    }

    if (tactic === 'charge') {
      // charge-lane commitment: once in lane range, lock the lane at the foe's
      // square and telegraph it (game.js animates windup -> action). The
      // monster COMMITS — it does not re-aim mid-lane; that is what makes a
      // committed charge dodgeable and readable.
      const range = f.chargeRange || 5;
      const aim = () => ({ type: 'telegraph', pattern: chargePattern, target: { x: foe.f.mx, y: foe.f.my } });
      if (cheb(fx, fy, foe.f.mx, foe.f.my) <= range) {
        return { moves, action: aim(), intent: 'charge-commit' };
      }
      walk(foe.f.mx, foe.f.my, true, f.speed, dangerCells);
      if (cheb(fx, fy, foe.f.mx, foe.f.my) <= range) {
        return { moves, action: aim(), intent: 'charge-commit' };
      }
      return { moves, action: { type: 'wait' }, intent: 'charge-approach' };
    }

    if (tactic === 'burst') {
      // burst spacing: keep the burst's radius on the foe while keeping own
      // allies OUT of it. One step to the best neighboring tile.
      const r = (f.pattern && f.pattern.radius) || 2;
      const allies = fighters.filter(o => o.alive && !o.fled && o.key !== f.key && !isFoe(f, o));
      let best = null, bestScore = -1e9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = fx + dx, ny = fy + dy;
        if (!isInterior(nx, ny) || noBlocked(nx, ny)) continue;
        if (cheb(nx, ny, foe.f.mx, foe.f.my) > r + 1) continue; // keep foe in burst range
        let minAlly = 9;
        for (const a of allies) minAlly = Math.min(minAlly, cheb(nx, ny, a.mx, a.my));
        let score = Math.min(minAlly, r + 2) * 2;
        if (dangerCells && dangerCells.has(key(nx, ny))) score -= 5;
        if (score > bestScore) { bestScore = score; best = { x: nx, y: ny }; }
      }
      if (best) { moves.push([best.x, best.y]); fx = best.x; fy = best.y; }
      return {
        moves,
        action: { type: 'telegraph', pattern: f.pattern || { type: 'burst', radius: r }, target: { x: fx, y: fy } },
        intent: 'burst-space',
      };
    }

    if (tactic === 'circle') {
      // circling caution: flank perpendicular instead of charging straight in.
      // Still closes; just refuses the head-on lane. Never circles AWAY —
      // caution circles, it does not flee.
      const dx = foe.f.mx - fx, dy = foe.f.my - fy;
      let nx = Math.abs(dx) >= Math.abs(dy) ? fx : fx + Math.sign(dx || 1);
      let ny = Math.abs(dx) >= Math.abs(dy) ? fy + Math.sign(dy || 1) : fy;
      if (!isInterior(nx, ny) || noBlocked(nx, ny)) {
        const s = stepToward(fx, fy, foe.f.mx, foe.f.my, noBlocked, dangerCells);
        if (s) { nx = s.x; ny = s.y; } else { nx = fx; ny = fy; }
      }
      if ((nx !== fx || ny !== fy) && isInterior(nx, ny)) { moves.push([nx, ny]); fx = nx; fy = ny; }
      const d = cheb(fx, fy, foe.f.mx, foe.f.my);
      return {
        moves,
        action: d <= 1 ? { type: 'strike', target: foe.f.key } : { type: 'wait' },
        intent: 'circle-flank',
      };
    }

    // skirmish: purposeful engagement — close in, strike when adjacent.
    walk(foe.f.mx, foe.f.my, true, f.speed, dangerCells);
    const d = cheb(fx, fy, foe.f.mx, foe.f.my);
    return {
      moves,
      action: d <= 1 ? { type: 'strike', target: foe.f.key } : { type: 'wait' },
      intent: 'skirmish',
    };
  }

  // --- Telegraph depth (Steve 2026-10-05): Highbeam-Deer-level patterns.
  // Pure data + pure functions the renderer and coaching layer consume.
  // Nothing here changes existing signatures; everything is additive.

  // PATTERN_INFO: per attack-pattern metadata.
  //   phases: relative timing weights {windup, action, recovery} the renderer
  //           uses for distinct phase cues (longer windup = slower pulse, etc.)
  //   anatomy: {deliveredBy, mechanism, visibleCue} — visual-mechanical
  //           coherence metadata (Steve's rule): what body part/mechanism
  //           delivers the attack, so the visual justifies what the player
  //           sees. No disconnect between visual and attack.
  //   text: per-phase telegraph text shown while the phase is live.
  //   knownCue: coaching text emitted once the pattern is LEARNED (codex).
  //   unknown: honest text for an ignorant player — warns without coaching.
  //            "If you don't know, it doesn't show" — the unknown text never
  //            names the cue or the counterplay the known text teaches.
  const PATTERN_INFO = {
    charge: {
      label: 'charging lane',
      phases: { windup: 2, action: 1, recovery: 3 },
      anatomy: { deliveredBy: 'lowered head and shoulder plates', mechanism: 'committed linear impact', visibleCue: 'head drops, hooves paw the dirt' },
      text: {
        windup: 'It lowers its head and digs in — the lane glows. It will NOT re-aim. Get OFF the glowing line.',
        action: 'It comes straight down the lane, shoulder-first and screaming.',
        recovery: 'It skids past, spent, flanks heaving — now.',
      },
      knownCue: 'Charge commit: once the lane glows it never re-aims. Step two squares sideways and watch it miss — then hit it in recovery, when it cannot turn.',
      unknown: 'It is doing something with its head. The glowing lane is where it will go — move out of the way.',
    },
    beam: {
      label: 'beam sweep',
      phases: { windup: 2, action: 1, recovery: 2 },
      anatomy: { deliveredBy: 'its eyes', mechanism: 'projected searing light', visibleCue: 'light gathers behind its eyes, brightening' },
      text: {
        windup: 'Light pools behind its eyes, brightening — the lane ignites. Leave the lit squares.',
        action: 'The beam rips out along the lit lane.',
        recovery: 'Its eyes dim to embers; it blinks away the glare.',
      },
      knownCue: 'Beam: eyes first, lane second, fire third. The lane is the truth — step off it and the beam is just light. It cannot sweep mid-fire.',
      unknown: 'Its eyes are doing something bright. The lit lane is the danger — move.',
    },
    line: {
      label: 'spit lane',
      phases: { windup: 2, action: 1, recovery: 2 },
      anatomy: { deliveredBy: 'its mouth and throat sacs', mechanism: 'launched quills and burning spit down a lane', visibleCue: 'it rears back, throat bulging and working' },
      text: {
        windup: 'It rears back, throat bulging — the lane is marked. One square sideways is enough.',
        action: 'A fan of spit and quills whips down the lane.',
        recovery: 'It huffs, spent, drooling strings of fire.',
      },
      knownCue: 'Spit lane: it telegraphs from the throat, always one lane wide. Sidestep once; the volley cannot bend.',
      unknown: 'It is choking on something hot. The marked lane is about to be very unpleasant — move.',
    },
    burst: {
      label: 'burst ring',
      phases: { windup: 2, action: 1, recovery: 3 },
      anatomy: { deliveredBy: 'swollen sacs along its flanks', mechanism: 'radial shockwave', visibleCue: 'its body swells, skin going taut and glossy' },
      text: {
        windup: 'Its flanks swell, skin going taut — the circle glows. Back OUT of the circle.',
        action: 'It detonates outward in a ring of force.',
        recovery: 'Deflated and wheezing, its sacs hanging loose — now.',
      },
      knownCue: 'Burst: the circle is exactly where it hurts, no further. The edge is one step away — do not be inside it when it pops.',
      unknown: 'It is swelling like it is going to pop. Everything glowing around it is the blast — back off.',
    },
    ambush: {
      label: 'lurking burst',
      phases: { windup: 2, action: 1, recovery: 3 },
      anatomy: { deliveredBy: 'buried spines under a coiled body', mechanism: 'sudden radial snap from stillness', visibleCue: 'it goes perfectly still, quills lying flat' },
      text: {
        windup: 'It goes utterly still, quills lying flat — the circle around it glows.',
        action: 'It ERUPTS outward from stillness.',
        recovery: 'Mottled and gasping, it needs a moment — now.',
      },
      knownCue: 'Ambush burst: stillness is the tell. When the quills lie flat the circle is armed — it only fires if you are inside it.',
      unknown: 'It went very still. That cannot be good — the glowing circle is the danger.',
    },
    lockon: {
      label: 'direct lock-on',
      phases: { windup: 2, action: 1, recovery: 2 },
      anatomy: { deliveredBy: 'a single gleaming eye', mechanism: 'target-locked strike at your square', visibleCue: 'its gaze pins you and does not waver' },
      text: {
        windup: 'Its gaze PINS you — your square glows. It fires at where you stand NOW. MOVE before it lets go.',
        action: 'The strike lands exactly where you were standing.',
        recovery: 'It loses the lock, eye watering, re-acquiring.',
      },
      knownCue: 'Lock-on: it fires at your square at the last instant, not the square it marked. The mark is a lie about TIMING, not about aim — do not be there when it fires.',
      unknown: 'It is staring at YOU and only you. The glow on your square means run.',
    },
    'ambush-zone': {
      label: 'seeded zone',
      phases: { windup: 1, action: 1, recovery: 3, arming: 1 },
      anatomy: { deliveredBy: 'seeded spines and trap-silk buried in the ground', mechanism: 'primed ground that fires when stepped on', visibleCue: 'the ground there bulges faintly, wrong' },
      text: {
        windup: 'The ground in that patch bulges faintly — it seeded something there. Do not step in the marked circle.',
        arming: 'The ground STIRS under your feet — it is arming! One beat — MOVE.',
        action: 'The seeded spines rip upward through the circle.',
        recovery: 'The patch lies spent and torn — safe now.',
      },
      knownCue: 'Seeded zone: the bulge is the tell. A stepped-in zone arms with one visible beat before it fires — that beat is your exit.',
      unknown: 'The ground looks wrong there. The marked circle is a bad place to stand — and if it stirs under you, RUN.',
    },
  };
  const DEFAULT_PATTERN_INFO = {
    label: 'attack',
    phases: { windup: 2, action: 1, recovery: 2 },
    anatomy: { deliveredBy: 'its body', mechanism: 'direct strike', visibleCue: 'it tenses' },
    text: {
      windup: 'It tenses — the marked squares are where it will hit. Move.',
      action: 'It strikes the marked squares.',
      recovery: 'It is spent — now.',
    },
    knownCue: 'Watch the marked squares; they are always exactly where it hits.',
    unknown: 'Something is about to happen on the marked squares — move.',
  };

  // patternInfo: metadata for a pattern type. Unknown types get the default —
  // never undefined, never a crash in the renderer.
  function patternInfo(type) {
    return PATTERN_INFO[type] || DEFAULT_PATTERN_INFO;
  }

  // telegraphText(pattern, phase, known): the text the player reads for a
  // phase. phase in {'windup','action','recovery','arming'} ('arming' only
  // for ambush-zone). known=false gives the honest unknown text: it warns
  // about the marked squares without naming the cue or the counterplay —
  // "if you don't know, it doesn't show."
  function telegraphText(pattern, phase, known) {
    const info = patternInfo(pattern && pattern.type);
    if (known) return info.text[phase] || info.text.windup;
    return info.unknown;
  }

  // phaseTiming(pattern, variant): effective phase timing weights after
  // variant escalation. Pure. variant in {'veteran','scarred','elder',
  // 'pack-leader', null}.
  function phaseTiming(pattern, variant) {
    const base = patternInfo(pattern && pattern.type).phases;
    const out = { windup: base.windup, action: base.action, recovery: base.recovery };
    if (variant === 'pack-leader') out.windup = Math.max(1, out.windup - 1);
    return out;
  }

  // applyVariant(pattern, variant): variant escalation as pure data.
  // Never mutates the input. Flags (carried on the copy):
  //   veteran    -> longer reach (length+1 on lanes, radius+1 on radials)
  //   scarred    -> wider lane (width+1 on lanes, radius+1 on radials)
  //   elder      -> added second phase: pattern.secondPhase = true; the
  //                 follow-up is read via patternFollowUp.
  //   pack-leader-> faster windup (read via phaseTiming).
  // No monster data edits — monsters.json is owned elsewhere; this is keyed
  // off a variant flag game.js stamps on the pattern.
  function applyVariant(pattern, variant) {
    const p = Object.assign({}, pattern);
    if (!variant) return p;
    p.variant = variant;
    const radial = p.type === 'burst' || p.type === 'ambush' || p.type === 'ambush-zone';
    if (variant === 'veteran') {
      if (radial) p.radius = (p.radius || 1) + 1;
      else p.length = (p.length || 5) + 1;
    } else if (variant === 'scarred') {
      if (radial) p.radius = (p.radius || 1) + 1;
      else p.width = (p.width || 1) + 1;
    } else if (variant === 'elder') {
      p.secondPhase = true;
    }
    return p;
  }

  // patternFollowUp(pattern): the added second phase for elder variants.
  // Returns a follow-up pattern (a radial slam centered on the attacker's
  // square) or null. Pure; game.js chains it after the primary resolves.
  function patternFollowUp(pattern) {
    if (!pattern || !pattern.secondPhase) return null;
    return { type: 'burst', radius: 1, followUpOf: pattern.type };
  }

  // zoneArmed(pattern, px, py): ambush-zone trigger check. True when the
  // fighter at (px,py) has stepped into the seeded zone. game.js uses this to
  // run the visible arming beat (telegraphText(p,'arming',known)) before the
  // zone fires — the beat is the dodge window.
  function zoneArmed(pattern, px, py) {
    if (!pattern || pattern.type !== 'ambush-zone') return false;
    const cz = pattern.center || { x: 0, y: 0 };
    return cheb(px, py, cz.x, cz.y) <= (pattern.radius || 1);
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.combat = {
    roll, cheb, key, inGrid, isInterior, turnOrder, patternCells,
    cellsAtPhase, dodgeable,
    isFoe, nearestEnemy, stepToward, stepAway, villagerDecide,
    hpFrac, desperate, traumaOf, flinching, monsterDesperate,
    villagerShield, monsterTacticPlan,
    patternInfo, telegraphText, phaseTiming, applyVariant, patternFollowUp, zoneArmed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
