'use strict';
/* The Oversight — move-anim attack primitives proof test.
   Plain node (NOT jest). Seeded RNG (mulberry32, default seed fixed, SEED env
   override). Exits non-zero on any failure. */
const path = require('path');
require(path.join(__dirname, '..', 'src', 'js', 'move-anim.js'));
const M = globalThis.Scattering.MoveAnim;

// --- seeded RNG ---
let seed = (Number(process.env.SEED || 20261007) >>> 0) || 1;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(seed);
const rdir = () => ({ dx: rand() < 0.5 ? -1 : 1, dy: rand() < 0.5 ? -1 : 1 });

let passed = 0, failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reset animator state between tests.
function reset(hooks) {
  M.queue = []; M.active = false; M.holdDir = null;
  M.hooks = hooks || {};
}
let recorded = [];
function trackHooks(movedFn) {
  recorded = [];
  return {
    step(s) { recorded.push({ dx: s.dx, dy: s.dy, kind: s.kind, blur: !!s.blur, paw: !!s.paw }); return { moved: movedFn ? movedFn(s) : true }; },
    gridEl: () => null, // skip FLIP in these tests; flip() tested separately
    render() {},
    sync() {},
  };
}
const TINY = 5; // ms per beat in tests — keeps the suite fast

async function main() {
  console.log('seed=' + seed);

  // 1. lungeAt: out step then return step, correct kinds/dirs, promise true
  {
    reset(trackHooks());
    const d = { dx: 1, dy: 0 };
    const r = await M.lungeAt(d, { msOut: TINY, msBack: TINY });
    ok(r === true, 'lungeAt resolves true when all steps land');
    ok(recorded.length === 2, 'lungeAt enqueues exactly 2 steps', 'got ' + recorded.length);
    ok(recorded[0].dx === 1 && recorded[0].dy === 0 && recorded[0].kind === 'lunge', 'lungeAt out step toward target');
    ok(recorded[1].dx === -1 && recorded[1].dy === 0 && recorded[1].kind === 'lunge-back', 'lungeAt return step back to origin');
    ok(M.queue.length === 0 && !M.active, 'pump drains the lunge queue fully');
  }

  // 2. lungeAt blur variant (rusher): blur flags set, still 2 steps
  {
    reset(trackHooks());
    const d = rdir();
    const r = await M.lungeAt(d, { blur: true });
    ok(r === true, 'lungeAt blur resolves true');
    ok(recorded.length === 2 && recorded.every((s) => s.blur), 'lungeAt blur marks both steps blurred');
    ok(recorded[0].kind === 'lunge' && recorded[1].kind === 'lunge-back', 'lungeAt blur keeps lunge kinds');
  }

  // 3. lungeAt with a blocked step: promise false, existing enqueue semantics intact
  {
    let n = 0;
    reset(trackHooks(() => (++n > 1 ? false : true))); // second step blocked
    const r = await M.lungeAt({ dx: 0, dy: 1 }, { msOut: TINY, msBack: TINY });
    ok(r === false, 'lungeAt resolves false when a step is blocked');
    ok(recorded.length === 2, 'blocked lunge still played both beats');
  }

  // 4. recoil: single step-back in the given direction
  {
    reset(trackHooks());
    const r = await M.recoil({ dx: -1, dy: 1 }, { ms: TINY });
    ok(r === true, 'recoil resolves true');
    ok(recorded.length === 1 && recorded[0].dx === -1 && recorded[0].dy === 1 && recorded[0].kind === 'recoil',
      'recoil enqueues one step-back in the given direction', JSON.stringify(recorded));
  }

  // 5. knockback: n fast single-tile slides, clamped to 1..4
  {
    reset(trackHooks());
    const r = await M.knockback({ dx: 1, dy: -1 }, 3, { ms: TINY });
    ok(r === true, 'knockback(3) resolves true');
    ok(recorded.length === 3 && recorded.every((s) => s.kind === 'knock' && s.dx === 1 && s.dy === -1),
      'knockback enqueues 3 knock steps along dir', JSON.stringify(recorded));
  }
  {
    reset(trackHooks());
    await M.knockback({ dx: 1, dy: 0 }, 99, { ms: TINY });
    ok(recorded.length === 4, 'knockback clamps n to 4 max', 'got ' + recorded.length);
  }
  {
    reset(trackHooks());
    await M.knockback({ dx: 0, dy: 1 }, 0, { ms: TINY });
    ok(recorded.length === 1, 'knockback clamps n to 1 min', 'got ' + recorded.length);
  }

  // 6. windupShift: anticipation step AWAY from the attack direction
  {
    reset(trackHooks());
    const r = await M.windupShift({ dx: 1, dy: 0 }, { ms: TINY });
    ok(r === true, 'windupShift resolves true');
    ok(recorded.length === 1 && recorded[0].dx === -1 && recorded[0].dy === 0 && recorded[0].kind === 'windup',
      'windupShift steps away from the strike direction', JSON.stringify(recorded));
  }
  {
    reset(trackHooks());
    await M.windupShift({ dx: 1, dy: 0 }, { ms: TINY, planted: true });
    ok(recorded.length === 1 && recorded[0].dx === 0 && recorded[0].dy === 0 && recorded[0].kind === 'windup',
      'windupShift planted:true holds position (beam-shooter brace)', JSON.stringify(recorded));
  }

  // 7. chargeStride: paw-the-ground beat then n charge strides; paw opt-out
  {
    reset(trackHooks());
    const r = await M.chargeStride({ dx: 1, dy: 0, n: 3 }, { ms: TINY, pawMs: TINY });
    ok(r === true, 'chargeStride resolves true');
    ok(recorded.length === 4, 'chargeStride(n=3) enqueues 1 paw + 3 strides', 'got ' + recorded.length);
    ok(recorded[0].kind === 'windup' && recorded[0].paw === true && recorded[0].dx === 0 && recorded[0].dy === 0,
      'chargeStride leads with a paw-the-ground windup beat', JSON.stringify(recorded[0]));
    ok(recorded.slice(1).every((s) => s.kind === 'charge' && s.dx === 1 && s.dy === 0),
      'chargeStride follows with 3 charge steps along the lane');
  }
  {
    reset(trackHooks());
    await M.chargeStride({ dx: 0, dy: -1, n: 2 }, { ms: TINY, paw: false });
    ok(recorded.length === 2 && recorded.every((s) => s.kind === 'charge'),
      'chargeStride paw:false skips the paw beat', JSON.stringify(recorded));
  }

  // 8. purgeKind still works on attack kinds (deterministic: queue while active)
  {
    reset(trackHooks());
    const droppedPromises = [];
    M.active = true; // simulate mid-animation so steps queue up
    droppedPromises.push(M.enqueue({ dx: 1, dy: 0, kind: 'lunge', ms: TINY }));
    droppedPromises.push(M.enqueue({ dx: -1, dy: 0, kind: 'lunge-back', ms: TINY }));
    droppedPromises.push(M.enqueue({ dx: 0, dy: 1, kind: 'step', ms: TINY }));
    const dropped = M.purgeKind('lunge');
    ok(dropped === 1, 'purgeKind drops only matching kind', 'dropped=' + dropped);
    M.active = false; M.stopAll(); // stop BEFORE awaiting: drops the rest
    const results = await Promise.all(droppedPromises);
    ok(results[0] === false, 'purged lunge promise resolves false');
    ok(results[1] === false && results[2] === false, 'stopAll resolves the remainder false');
    ok(M.queue.length === 0, 'stopAll clears the queue');
  }

  // 9. setHold still auto-queues while held; clearHold stops it
  {
    reset(trackHooks());
    M.setHold({ dx: 1, dy: 0 });
    const p = M.enqueue({ dx: 1, dy: 0, kind: 'step', ms: TINY });
    await p;
    await sleep(30); // let the hold-to-walk chain land a couple more steps
    ok(recorded.length >= 2, 'setHold auto-enqueues the next step when one lands', 'landed=' + recorded.length);
    M.clearHold(); M.stopAll();
    ok(M.holdDir === null && M.queue.length === 0, 'clearHold+stopAll stops hold-to-walk');
  }

  // 10. Existing enqueue behavior unchanged: maxQueue cap, blocked bump, purgeWalk
  {
    reset(trackHooks());
    M.active = true;
    const ps = [];
    for (let i = 0; i < M.maxQueue + 2; i++) ps.push(M.enqueue({ dx: 1, dy: 0, kind: 'step' }));
    M.active = false; M.stopAll();
    const results = await Promise.all(ps);
    ok(results[M.maxQueue] === false && results[M.maxQueue + 1] === false,
      'maxQueue cap still enforced (overflow resolves false)');
    ok(results.slice(0, M.maxQueue).every((r) => r === false),
      'stopped queued steps resolve false (existing stopAll semantics)');
  }
  {
    reset(trackHooks(() => false)); // every step blocked
    const r = await M.enqueue({ dx: 1, dy: 0, kind: 'step', ms: TINY });
    ok(r === false, 'blocked step still resolves false (bump beat semantics)');
    ok(recorded.length === 1 && recorded[0].kind === 'step', 'existing step kind path untouched');
  }
  {
    reset(trackHooks());
    M.active = true;
    const p1 = M.enqueue({ dx: 1, dy: 0, kind: 'step', walkId: 'w1' });
    const p2 = M.enqueue({ dx: 0, dy: 1, kind: 'step', walkId: 'w2' });
    const n = M.purgeWalk('w1');
    M.active = false; M.stopAll();
    const [r1, r2] = await Promise.all([p1, p2]);
    ok(n === 1 && r1 === false && r2 === false, 'purgeWalk still drops by walkId');
  }

  // 11. FLIP: max |delta| must stay <= one tile (no jumps)
  {
    const TILE = 48;
    const mkEl = (key, x, y) => ({
      'data-ent': key,
      getAttribute() { return key; },
      style: {},
      getBoundingClientRect() { return { left: this._x, top: this._y, width: 40, height: 40 }; },
      _x: x, _y: y,
    });
    const els = [mkEl('player', 96, 96), mkEl('deer', 144, 96), mkEl('rock', 48, 48)];
    const root = { querySelectorAll() { return els; }, offsetWidth: 100 };
    const before = M.capture(root);
    ok(before.size === 3, 'capture records all data-ent entities');
    els[0]._x = 144; // player steps one tile right
    els[1]._x = 144; els[1]._y = 96; // deer unmoved
    const moves = M.flip(before, root, 100);
    ok(moves.length === 1 && moves[0][0] === els[0], 'flip animates only the moved entity');
    const maxDelta = Math.max(...moves.map(([, dx, dy]) => Math.max(Math.abs(dx), Math.abs(dy))));
    ok(maxDelta <= TILE, 'flip max |delta| <= one tile (' + maxDelta + 'px <= ' + TILE + 'px)');
  }

  // 12. Full 3-round combat sequence — the "played pass" transcript
  {
    reset(trackHooks());
    const log = [];
    const beat = async (label, p) => { const t0 = Date.now(); const r = await p; log.push(label + ' -> ' + (r ? 'landed' : 'BLOCKED') + ' (' + (Date.now() - t0) + 'ms)'); };
    const q = (kind) => recorded.filter((s) => s.kind === kind).length;
    console.log('--- played pass: 3-round combat transcript ---');
    // R1: Highbeam Deer braces (planted windup), fires beam sweep; player recoils
    await beat('R1 deer windup (planted brace)', M.windupShift({ dx: 1, dy: 0 }, { ms: 12, planted: true }));
    await beat('R1 deer beam sweep = lunge-out strike', M.lungeAt({ dx: 1, dy: 0 }, { msOut: 12, msBack: 12 }));
    await beat('R1 player recoil from beam hit', M.recoil({ dx: -1, dy: 0 }, { ms: 12 }));
    // R2: charger paws, strides the lane, slams player back 2 tiles
    await beat('R2 charger paw+stride (lane x3)', M.chargeStride({ dx: -1, dy: 0, n: 3 }, { ms: 12, pawMs: 12 }));
    await beat('R2 player knocked back 2 tiles', M.knockback({ dx: -1, dy: 0 }, 2, { ms: 12 }));
    // R3: rusher blurs in, player windup-shifts then lunges back
    await beat('R3 rusher blur-lunge', M.lungeAt({ dx: 0, dy: 1 }, { blur: true }));
    await beat('R3 player windup-shift away', M.windupShift({ dx: 0, dy: 1 }, { ms: 12 }));
    await beat('R3 player counter-lunge', M.lungeAt({ dx: 0, dy: 1 }, { msOut: 12, msBack: 12 }));
    for (const l of log) console.log('    ' + l);
    const total = recorded.length;
    // beats: 1 windup + 2 lunge + 1 recoil + (1 paw + 3 charge) + 2 knock
    //        + 2 blur-lunge + 1 windup + 2 lunge = 15
    ok(total === 1 + 2 + 1 + 4 + 2 + 2 + 1 + 2,
      '3-round transcript played ' + total + ' beats (expected 15)', 'got ' + total);
    ok(q('windup') === 3 && q('lunge') === 3 && q('lunge-back') === 3 && q('recoil') === 1 && q('charge') === 3 && q('knock') === 2,
      'transcript has the right kind mix', 'windup=' + q('windup') + ' lunge=' + q('lunge') + ' lunge-back=' + q('lunge-back') + ' recoil=' + q('recoil') + ' charge=' + q('charge') + ' knock=' + q('knock'));
    ok(M.queue.length === 0 && !M.active && !M.walking, 'animator idle after the full sequence');
  }

  // 13. Additive-only: original public API surface still present
  {
    const api = ['enqueue', 'pump', 'purgeKind', 'setHold', 'clearHold', 'stopAll', 'capture', 'flip', 'purgeWalk', 'walking'];
    ok(api.every((k) => k in M), 'original API surface intact', 'missing: ' + api.filter((k) => !(k in M)).join(','));
    const added = ['lungeAt', 'recoil', 'knockback', 'windupShift', 'chargeStride'];
    ok(added.every((k) => typeof M[k] === 'function'), 'all five primitives are functions');
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  reset();
  process.exitCode = failed ? 1 : 0; // exitCode (not exit()) so piped stdout flushes
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
