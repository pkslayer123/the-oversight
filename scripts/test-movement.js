// Movement UX test: d-pad steps, animated path walks, FLIP no-jump, hold-to-walk.
// Usage: node scripts/test-movement.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/move-anim.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const MA = globalThis.Scattering.MoveAnim;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];

function pos() { const s = Game.state.scholar; return [s.mx ?? 4, s.my ?? 4]; }
function detail() { return Game.genDetail(Game.map.px, Game.map.py); }
function blockedAt(nx, ny) {
  if (nx < 0 || nx > 8 || ny < 0 || ny > 8) return true;
  const d = detail();
  return !!Game.cellProps(d[ny] && d[ny][nx]).blocks;
}
function occupiedByCritter(nx, ny) {
  const mon = Game.state.scholar.monster, ani = Game.state.scholar.animal;
  return (mon && mon.mx === nx && mon.my === ny) || (ani && ani.mx === nx && ani.my === ny);
}
// walkable, critter-free neighbor deltas from current position
function freeSteps() {
  const [px, py] = pos();
  return DIRS.filter(([dx, dy]) => {
    const nx = px + dx, ny = py + dy;
    return !blockedAt(nx, ny) && !occupiedByCritter(nx, ny);
  });
}
function resetMA() {
  MA.queue.length = 0; MA.active = false; MA.holdDir = null; MA.hooks = {};
  MA.stepMs = 25; MA.pathMs = 20; MA.blockedMs = 15;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // ---------- game logic: single steps ----------
  {
    const s = Game.state.scholar;
    const steps = freeSteps();
    ok('has a free neighboring step to test', steps.length > 0);
    const [dx, dy] = steps[0];
    const [px0, py0] = pos();
    const t0 = s.dayTicks || 0;
    const r = Game.microMove(px0 + dx, py0 + dy);
    eq('microMove lands', r, true);
    eq('microMove moved exactly one step', pos().join(','), (px0 + dx) + ',' + (py0 + dy));
    eq('microMove costs exactly 1 tick (visible time cost)', (s.dayTicks || 0) - t0, 1);
  }
  {
    // blocked: off-grid step fails and costs nothing
    const s = Game.state.scholar;
    const t0 = s.dayTicks || 0;
    eq('microMove off-grid returns false', Game.microMove(-1, 5), false);
    eq('blocked step costs no ticks', (s.dayTicks || 0) - t0, 0);
  }

  // ---------- game logic: committed path walks ----------
  let testPath = null;
  {
    const s = Game.state.scholar;
    const [sx, sy] = pos();
    const d = detail();
    // find a target 2-6 squares away with a real path
    let target = null;
    outer:
    for (let ty = 0; ty < 9; ty++) for (let tx = 0; tx < 9; tx++) {
      if (blockedAt(tx, ty) || occupiedByCritter(tx, ty)) continue;
      const p = Game.findPath(sx, sy, tx, ty);
      if (p && p.length >= 2 && p.length <= 6) { target = [tx, ty]; testPath = p; break outer; }
    }
    ok('found a 2-6 step path target', !!target);
    const kcal0 = s.kcal, t0 = s.dayTicks || 0;
    const path = Game.beginPathWalk(target[0], target[1]);
    ok('beginPathWalk returns the path', Array.isArray(path) && path.length === testPath.length);
    eq('beginPathWalk charges 10 kcal/square up front', Math.round(kcal0 - s.kcal), path.length * 10);
    eq('beginPathWalk charges no ticks yet', (s.dayTicks || 0) - t0, 0);
    // path is single steps: consecutive deltas are Chebyshev-1 (animatable)
    let allSingle = true, px = sx, py = sy;
    for (const [x, y] of path) {
      if (Math.abs(x - px) > 1 || Math.abs(y - py) > 1 || (x === px && y === py)) allSingle = false;
      px = x; py = y;
    }
    ok('every path leg is a single step (no jumps in the path)', allSingle);
    eq('path ends at the target', px + ',' + py, target.join(','));
  }
  {
    // walk the path step by step like the animator does
    const s = Game.state.scholar;
    let monsters = 0, animals = 0;
    const oM = Game.monsterTurn.bind(Game), oA = Game.animalTurn.bind(Game);
    Game.monsterTurn = () => { monsters++; return oM(); };
    Game.animalTurn = () => { animals++; return oA(); };
    const kcal0 = s.kcal, t0 = s.dayTicks || 0;
    let stepped = 0, allOk = true;
    for (const [x, y] of testPath) {
      const r = Game.pathStep(x, y);
      allOk = allOk && r; stepped++;
      if (!r) break;
    }
    Game.monsterTurn = oM; Game.animalTurn = oA;
    ok('every pathStep landed', allOk);
    eq('pathStep count == path length', stepped, testPath.length);
    eq('pathStep: 1 tick per step', (s.dayTicks || 0) - t0, testPath.length);
    eq('pathStep: no double kcal charge (prepaid)', Math.round(kcal0 - s.kcal), 0);
    eq('monsterTurn ran once per step', monsters, testPath.length);
    eq('animalTurn ran once per step', animals, testPath.length);
    const [ex, ey] = testPath[testPath.length - 1];
    eq('walked the full path to the target', pos().join(','), ex + ',' + ey);
  }
  {
    // pathStep into a blocked tile fails (world changed mid-walk)
    const s = Game.state.scholar;
    const t0 = s.dayTicks || 0;
    // find a blocked neighbor
    const [px, py] = pos();
    const blocked = DIRS.map(([dx, dy]) => [px + dx, py + dy]).find(([nx, ny]) => blockedAt(nx, ny));
    if (blocked) {
      eq('pathStep into blocked tile returns false', Game.pathStep(blocked[0], blocked[1]), false);
      eq('failed pathStep costs no tick', (s.dayTicks || 0) - t0, 0);
    } else { ok('no blocked neighbor found (skipped)', true); }
  }
  {
    // beginPathWalk failures: no path, not enough kcal
    eq('beginPathWalk off-grid target: null', Game.beginPathWalk(-1, 0), null);
    const s = Game.state.scholar, kcalSave = s.kcal;
    s.kcal = 5;
    const [px, py] = pos();
    const far = Game.findPath(px, py, 8 - px > 4 ? 0 : 8, 8 - py > 4 ? 0 : 8);
    if (far && far.length >= 2) {
      eq('beginPathWalk broke: null', Game.beginPathWalk(8 - px > 4 ? 0 : 8, 8 - py > 4 ? 0 : 8), null);
      eq('failed walk charges no kcal', s.kcal, 5);
    }
    s.kcal = kcalSave;
  }

  // ---------- animator: step state machine ----------
  resetMA();
  {
    const calls = [];
    const stubRoot = { querySelectorAll: () => [], offsetWidth: 100 };
    MA.hooks = {
      gridEl: () => stubRoot, // stub DOM: capture finds no entities, render still runs
      step: (st) => { calls.push(['step', st.dx, st.dy]); return { moved: true }; },
      render: () => calls.push(['render']),
      sync: (st, res) => calls.push(['sync', res.moved]),
    };
    const r = await MA.enqueue({ dx: 1, dy: 0, kind: 'step' });
    eq('step promise resolves true when the step landed', r, true);
    eq('hook order: step, render, sync', JSON.stringify(calls),
      JSON.stringify([['step', 1, 0], ['render'], ['sync', true]]));
    eq('animator idle after step', MA.active, false);
    eq('queue drained', MA.queue.length, 0);
  }
  {
    // sequential, never overlapping
    resetMA();
    const order = []; let concurrent = 0, maxConc = 0;
    MA.hooks = {
      gridEl: () => null,
      step: (st) => { concurrent++; maxConc = Math.max(maxConc, concurrent); order.push(st.tag); return { moved: true }; },
      render: () => {}, sync: (st) => { concurrent--; },
    };
    const ps = [MA.enqueue({ dx: 1, dy: 0, kind: 'step', tag: 'a' }),
                MA.enqueue({ dx: 0, dy: 1, kind: 'step', tag: 'b' }),
                MA.enqueue({ dx: -1, dy: 0, kind: 'step', tag: 'c' })];
    const rs = await Promise.all(ps);
    eq('three steps execute in FIFO order', order.join(','), 'a,b,c');
    eq('steps never overlap', maxConc, 1);
    eq('all resolve true', rs.join(','), 'true,true,true');
  }
  {
    // blocked step resolves false, still takes its beat
    resetMA();
    MA.hooks = { gridEl: () => null, step: () => ({ moved: false }), render: () => {}, sync: () => {} };
    const r = await MA.enqueue({ dx: 0, dy: -1, kind: 'step' });
    eq('blocked step resolves false', r, false);
  }
  {
    // purgeWalk drops a walk's remaining steps and resolves them false
    resetMA();
    MA.active = true; // hold the pump so we can inspect the queue
    const seen = [];
    MA.hooks = { gridEl: () => null, step: () => ({ moved: true }), render: () => {}, sync: () => {} };
    const p1 = MA.enqueue({ dx: 1, dy: 0, kind: 'path', walkId: 'w1' }).then(v => seen.push(['w1a', v]));
    const p2 = MA.enqueue({ dx: 1, dy: 0, kind: 'path', walkId: 'w1' }).then(v => seen.push(['w1b', v]));
    const p3 = MA.enqueue({ dx: 0, dy: 1, kind: 'step' }).then(v => seen.push(['s', v]));
    eq('queue holds 3 before purge', MA.queue.length, 3);
    eq('purgeWalk drops 2', MA.purgeWalk('w1'), 2);
    eq('queue keeps the non-walk step', MA.queue.length, 1);
    MA.active = false; MA.pump();
    await Promise.all([p1, p2, p3]);
    eq('purged steps resolve false', JSON.stringify(seen.filter(s => s[0] !== 's')), JSON.stringify([['w1a', false], ['w1b', false]]));
    eq('surviving step still ran', seen.find(s => s[0] === 's')[1], true);
  }

  // ---------- FLIP: the eye test (no jumps) ----------
  {
    resetMA();
    const TILE = 36;
    // fake DOM element: before at x=100, after at x=136 (exactly one tile)
    function fakeEl(x, y) {
      return {
        _x: x, _y: y,
        style: {},
        getAttribute: (k) => (k === 'data-ent' ? 'me' : null),
        getBoundingClientRect: function () { return { left: this._x, top: this._y, width: TILE, height: TILE }; },
      };
    }
    const el = fakeEl(100, 50);
    const root = { querySelectorAll: () => [el], offsetWidth: 300 };
    const before = MA.capture(root);
    el._x = 100 + TILE; // re-render moved the entity one tile right
    const moves = MA.flip(before, root, 25);
    eq('flip moves exactly the entity that changed', moves.length, 1);
    const [mEl, mdx, mdy] = moves[0];
    eq('flip delta is exactly one tile left (inverse)', Math.round(mdx), -TILE);
    eq('flip delta y is zero', Math.round(mdy), 0);
    ok('flip delta never exceeds one tile', Math.abs(mdx) <= TILE + 0.5 && Math.abs(mdy) <= TILE + 0.5);
    eq('inverse transform applied synchronously (no snap)',
      mEl.style.transform, 'translate(-36.0px,0.0px)');
    await sleep(60); // rAF fallback (16ms) has fired
    eq('after rAF the transform releases to zero (glide, not jump)',
      mEl.style.transform, 'translate(0px,0px)');
    ok('transition carries the beat duration', /25ms/.test(mEl.style.transition));
    await sleep(120); // cleanup timer (dur+80)
    eq('transform cleaned up after the beat', mEl.style.transform, '');
  }
  {
    // even a 2-tile delta interpolates (animates) rather than snapping
    resetMA();
    function fakeEl(x, y) {
      return {
        _x: x, _y: y, style: {},
        getAttribute: (k) => (k === 'data-ent' ? 'mon:x' : null),
        getBoundingClientRect: function () { return { left: this._x, top: this._y, width: 36, height: 36 }; },
      };
    }
    const el = fakeEl(0, 0);
    const root = { querySelectorAll: () => [el], offsetWidth: 300 };
    const before = MA.capture(root);
    el._x = 72;
    const moves = MA.flip(before, root, 25);
    eq('two-tile delta still produces a move (interpolated)', moves.length, 1);
    ok('two-tile delta gets an inverse transform (no teleport snap)',
      moves[0][0].style.transform.indexOf('translate(-72.0px') === 0);
  }

  // ---------- hold-to-walk: continuous steps while held ----------
  {
    resetMA();
    let n = 0;
    MA.hooks = {
      gridEl: () => null,
      step: () => { n++; return { moved: true }; },
      render: () => {}, sync: () => {},
    };
    MA.setHold({ dx: 1, dy: 0 });
    MA.enqueue({ dx: 1, dy: 0, kind: 'step' });
    await sleep(130); // ~5 beats at 25ms
    ok('hold produces continuous steps (>=3 in 130ms)', n >= 3);
    const nAtRelease = n;
    MA.clearHold();
    await sleep(80);
    ok('releasing stops the walk', n <= nAtRelease + 1);
    MA.stopAll();
    eq('stopAll clears the hold', MA.holdDir, null);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
