// D-pad responsiveness proof (Steve 2026-10-07).
// Steve reports: "a little bit of lag in the dpad responsiveness during fast
// movement. I end up overshooting the target."
//
// This script measures, in node:
//   1. Per-step GAME LOGIC cost (Game.microMove): how much main-thread time
//      each step burns before the visual can even start.
//   2. MoveAnim queue behavior: how many phantom steps execute after the
//      player stops tapping (overshoot), and input-to-action latency.
//   3. The fix: tap coalescing (latest tap replaces queued taps) + hold
//      steps purged on release (finger up = stop after current beat).
//
// Run: node scripts/test-dpad-perf-20261007.js
// Env: TEST_MOVE_ANIM_PATH to test a patched move-anim.js.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---------- load game (full list minus DOM-only modules) ----------
const files = [
  'src/js/engine/state.js',
  'src/js/engine/modifiers.js',
  'src/js/engine/calories.js',
  'src/js/engine/day.js',
  'src/js/engine/forage.js',
  'src/js/engine/combat.js',
  'src/js/game.js',
  'src/js/encounters.js',
  'src/js/conversation.js',
  'src/js/convo-mood.js',
  'src/js/convoTopics.js',
  'src/js/convo-wants.js',
  'src/js/convo-dialogue.js',
  'src/js/convo-beats.js',
  'src/js/examine.js',
  'src/js/equipment.js',
  'src/js/journal.js',
  'src/js/party.js',
  'src/js/party-formal.js',
  'src/js/truth.js',
  'src/js/contests.js',
  'src/js/storage.js',
  'src/js/perceive.js',
  'src/js/carexplore.js',
  'src/js/justice.js',
  'src/js/food.js',
  'src/js/betrayal.js',
  'src/js/corpses.js',
  'src/js/lifeseed.js',
  'src/js/progression.js',
  'src/js/ledger.js',
  'src/js/villager-agency.js',
  'src/js/codex-people.js',
  'src/js/membership.js',
  'src/js/hierarchy.js',
  'src/js/debug-scenarios.js',
  'src/js/build.js',
  // drama.js needs document at load; not needed for step profiling.
];
// equipment.js needs `window` at load; delete it after eval so combat stays sync.
global.window = global;
for (const f of files) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`Failed to load ${f}:`, e.message); process.exit(1); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

// ---------- load move-anim with controllable timers ----------
const ANIM_PATH = process.env.TEST_MOVE_ANIM_PATH || path.join(ROOT, 'src', 'js', 'move-anim.js');
const animSrc = fs.readFileSync(ANIM_PATH, 'utf8');

// Fake-timer harness: we control time so we can measure queue drain exactly.
function makeClock() {
  let now = 0;
  const timers = [];
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = timers.length; timers.push({ fn, at: now + ms, dead: false }); return id; },
    clearTimeout(id) { if (timers[id]) timers[id].dead = true; },
    // advance time, firing due timers in order
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = -1, nextAt = Infinity;
        timers.forEach((t, i) => { if (!t.dead && t.at <= end && t.at < nextAt) { next = i; nextAt = t.at; } });
        if (next < 0) break;
        now = nextAt;
        timers[next].dead = true;
        timers[next].fn();
      }
      now = end;
    },
    pending() { return timers.filter(t => !t.dead).length; },
  };
}

function loadAnim(clock) {
  // move-anim.js is an IIFE bound to (window || globalThis); run it with a
  // fresh globalThis.Scattering and pull MoveAnim back out.
  const g = { Scattering: {} };
  const had = globalThis.Scattering;
  globalThis.Scattering = g.Scattering;
  try {
    const fn = new Function('setTimeout', 'clearTimeout', animSrc);
    fn(clock.setTimeout.bind(clock), clock.clearTimeout.bind(clock));
    return g.Scattering.MoveAnim;
  } finally {
    if (had === undefined) delete globalThis.Scattering; else globalThis.Scattering = had;
  }
}

(async () => {
  await Game.init();
  Game.newGame('test-region', null, null, [], 'dpad-perf');

  // Put the player somewhere walkable on the haven grounds.
  const s = Game.state.scholar;
  s.insideHaven = false;
  Game.map.px = 4; Game.map.py = 4;
  s.mx = 4; s.my = 6;

  // ===== 1. Per-step game logic cost =====
  const N = 60;
  const t0 = process.hrtime.bigint();
  let moved = 0;
  for (let i = 0; i < N; i++) {
    // walk a small loop on open ground
    const dx = [1, 0, -1, 0][i % 4], dy = [0, 1, 0, -1][i % 4];
    const nx = Math.max(1, Math.min(7, (s.mx ?? 4) + dx));
    const ny = Math.max(1, Math.min(7, (s.my ?? 4) + dy));
    if (Game.microMove(nx, ny)) moved++;
  }
  const t1 = process.hrtime.bigint();
  const perStepMs = Number(t1 - t0) / 1e6 / N;
  console.log(`microMove: ${N} calls, ${moved} moved, avg ${perStepMs.toFixed(2)}ms/step`);
  // Budget: a step's logic must be a small fraction of the 220ms beat,
  // otherwise the main thread can't keep up with rendering + input.
  ok('microMove avg < 25ms (leaves headroom in the 220ms beat)', perStepMs < 25, `${perStepMs.toFixed(2)}ms`);

  // ===== 2. MoveAnim queue behavior (fake timers) =====
  function simTaps({ tapIntervalMs, tapCount, holdReleaseAt }) {
    const clock = makeClock();
    const M = loadAnim(clock);
    M.now = () => clock.now(); // hold-vs-tap disambiguation follows fake time
    let executed = 0;
    M.hooks.step = () => { executed++; return { moved: true }; };
    M.hooks.render = () => {};
    M.hooks.sync = () => {};
    M.hooks.gridEl = () => null;
    const events = [];
    // simulate dpadPress on each tap (mirrors app.js dpadPress).
    // A tap = pointerdown, ~60ms finger-down, pointerup, then gap.
    const dpadPress = (dx, dy) => {
      M.purgeKind('path');
      M.setHold({ dx, dy });
      M.enqueue({ dx, dy, kind: 'step', ms: M.stepMs });
    };
    const release = () => { M.clearHold(); if (M.purgeHold) M.purgeHold(); };
    const DOWN_MS = 60;
    let t = 0;
    for (let i = 0; i < tapCount; i++) {
      dpadPress(1, 0);
      events.push({ t, type: 'tap' });
      clock.advance(DOWN_MS);
      t += DOWN_MS;
      release();
      clock.advance(Math.max(0, tapIntervalMs - DOWN_MS));
      t += Math.max(0, tapIntervalMs - DOWN_MS);
    }
    // let everything drain
    clock.advance(10000);
    return { executed, taps: tapCount };
  }

  // Fast tapping: 5 taps at 80ms apart (faster than the 220ms beat).
  const fast = simTaps({ tapIntervalMs: 80, tapCount: 5 });
  console.log(`fast taps: ${fast.taps} taps -> ${fast.executed} steps executed (overshoot: ${fast.executed - fast.taps})`);
  // Ideal: every tap moves exactly once (5 taps = 5 steps), no phantom extras.
  // The queue must not run away: executed should equal taps (each tap is real
  // intent), never more. Fewer is acceptable only via coalescing when a tap
  // arrives while its predecessor is still queued AND unstarted... but each
  // tap here is a distinct beat of intent, so 1:1 is the target.
  ok('fast taps: no phantom steps beyond taps', fast.executed <= fast.taps,
    `${fast.executed} executed for ${fast.taps} taps`);

  // Slow tapping: 1 tap/sec — each must execute exactly once, promptly.
  const slow = simTaps({ tapIntervalMs: 1000, tapCount: 3 });
  console.log(`slow taps: ${slow.taps} taps -> ${slow.executed} steps executed`);
  ok('slow taps: 1:1 tap:step', slow.executed === slow.taps,
    `${slow.executed} executed for ${slow.taps} taps`);

  // Hold-then-release: hold for 600ms (about 3 beats), release, measure drain.
  function simHold(holdMs) {
    const clock = makeClock();
    const M = loadAnim(clock);
    M.now = () => clock.now();
    let executed = 0;
    M.hooks.step = () => { executed++; return { moved: true }; };
    M.hooks.render = () => {};
    M.hooks.sync = () => {};
    M.hooks.gridEl = () => null;
    M.purgeKind('path');
    M.setHold({ dx: 1, dy: 0 });
    M.enqueue({ dx: 1, dy: 0, kind: 'step', ms: M.stepMs });
    clock.advance(holdMs);
    const atRelease = executed;
    M.clearHold();
    // NOTE: fixed version also purges hold-queued steps here (app.js release).
    if (M.purgeHold) M.purgeHold();
    clock.advance(10000);
    return { atRelease, total: executed, phantom: executed - atRelease };
  }
  const hold = simHold(600);
  console.log(`hold 600ms: ${hold.atRelease} steps by release, ${hold.total} total (phantom after release: ${hold.phantom})`);
  // After finger-up, at most the in-flight step should finish: phantom <= 1.
  ok('hold release: at most 1 phantom step after finger up', hold.phantom <= 1,
    `${hold.phantom} phantom steps`);
  // Genuine hold must still walk continuously: 700ms hold ~= 3+ steps.
  const hold2 = simHold(700);
  console.log(`hold 700ms: ${hold2.total} steps total (hold-to-walk continuity)`);
  ok('genuine hold: walks continuously (>=3 steps in 700ms)', hold2.total >= 3,
    `${hold2.total} steps`);

  // ===== 3. Input-to-action latency =====
  // With fake timers: pointerdown -> enqueue -> pump runs synchronously when
  // idle. Measure: tap while idle, does the step's game logic run before we
  // advance the clock at all?
  {
    const clock = makeClock();
    const M = loadAnim(clock);
    let logicAt = -1;
    M.hooks.step = () => { logicAt = clock.now(); return { moved: true }; };
    M.hooks.render = () => {};
    M.hooks.sync = () => {};
    M.hooks.gridEl = () => null;
    M.purgeKind('path');
    M.setHold({ dx: 1, dy: 0 });
    M.enqueue({ dx: 1, dy: 0, kind: 'step', ms: M.stepMs });
    M.clearHold();
    ok('input-to-logic is synchronous when idle (0ms)', logicAt === 0, `logic ran at t=${logicAt}ms`);
  }

  console.log(`\n${pass} passed, ${fail} failed (runtime)`);
  // ===== 4. Static wiring checks (app.js) =====
  const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');
  ok('app.js: setHTMLCached helper defined',
    /function setHTMLCached\(el, html\)/.test(appSrc));
  ok('app.js: action-bar rewire gated on HTML change',
    /if \(setHTMLCached\(actWrap, html\)\)/.test(appSrc));
  ok('app.js: dpad release purges hold queue',
    /MoveAnim\.clearHold\(\); MoveAnim\.purgeHold\(\)/.test(appSrc));
  const animSrcCheck = fs.readFileSync(ANIM_PATH, 'utf8');
  ok('move-anim.js: hold chains only when holdSince <= step._startT',
    /this\.holdSince <= step\._startT/.test(animSrcCheck));
  ok('move-anim.js: purgeHold() defined',
    /purgeHold\(\) \{ return this\._drop\(\(s\) => !!s\.hold\); \}/.test(animSrcCheck));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
