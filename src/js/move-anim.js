// @ontology
// system: move-anim
// description: Movement animation. Step-by-step tile transitions.
// provides:
//   - enqueue(anim)
//   - pump()
//   - purgeKind(kind)
//   - setHold(id)
//   - clearHold(id)
//   - purgeHold()
//   - stopAll()
//   - capture()
//   - flip()
//   - now()
// rules:
//   - TAP-vs-HOLD (Steve 2026-10-07): hold-to-walk chains only when the hold began at or before the landing step started (holdSince <= step._startT). A tap's brief finger-down straddling a step boundary must not spawn a phantom hold-step — that was the dpad overshoot bug. purgeHold() drops hold-generated queue on release (code: move-anim.js).
// consumes:
//   - (none documented)
/* The Oversight — movement animator.
   Smooth, step-by-step animated movement for the d-pad and tap-to-move paths.

   The step state machine guarantees three things Steve asked for:
   1. One step animates at a time — never overlapping, never skipping.
   2. Every step takes a visible beat (stepMs) — movement costs time you can
      feel, not an instant teleport.
   3. Entities glide tile-to-tile via FLIP transforms (capture position,
      re-render, invert, play) instead of jumping to the new tile.

   Framework-agnostic: the UI layer (app.js) injects hooks. Testable in node
   with stub hooks and stub DOM elements. */
(function (global) {
  'use strict';
  const S = global.Scattering = global.Scattering || {};

  const M = {
    queue: [],          // pending step descriptors, FIFO
    active: false,      // a step is currently animating
    holdDir: null,      // {dx,dy} while a d-pad direction is held down
    holdSince: null,    // timestamp (now()) of the current hold's press
    stepMs: 220,        // one d-pad step = one visible beat (~4.5 steps/sec)
    pathMs: 140,        // committed tap-to-move path steps move brisker
    blockedMs: 160,     // bumping into a wall still takes a beat, not a snap
    maxQueue: 10,       // input spam cap — the queue never runs away
    // Hooks injected by the UI layer:
    //   step(step)  -> {moved:bool, purge?:walkId}  game logic for one step
    //   render()    -> re-render the grid after the logic ran
    //   sync(step, res) -> chrome update / full re-render after the animation
    //   gridEl()    -> the .detail element whose entities get FLIP-animated
    hooks: {},

    // Monotonic clock for hold-vs-tap disambiguation. Overridable in tests.
    now() {
      try {
        if (typeof performance !== 'undefined' && performance.now) return performance.now();
      } catch (e) {}
      return Date.now();
    },

    // enqueue a step: {dx, dy, kind:'step'|'path', walkId?, ms?}.
    // dx/dy are resolved against the CURRENT position at execution time,
    // so queued steps stay correct even as the player moves.
    // Returns a promise resolving true when the step landed.
    enqueue(step) {
      step = step || {};
      if (this.queue.length >= this.maxQueue) return Promise.resolve(false);
      let resolve;
      const p = new Promise((r) => { resolve = r; });
      step.resolve = resolve;
      this.queue.push(step);
      this.pump();
      return p;
    },

    pump() {
      if (this.active) return;
      const step = this.queue.shift();
      if (!step) return;
      this.active = true;
      step._startT = this.now();
      const H = this.hooks;
      const grid = H.gridEl ? H.gridEl() : null;
      const before = grid ? this.capture(grid) : null;
      step._sig = null;
      let res;
      try { res = (H.step && H.step(step)) || { moved: false }; }
      catch (e) { res = { moved: false }; }
      if (res && res.purge) this.purgeWalk(res.purge);
      const ms = step.ms || (res && res.moved ? this.stepMs : this.blockedMs);
      if (res && res.moved && grid && before) {
        try { if (H.render) H.render(); } catch (e) {}
        this.flip(before, grid, ms);
      }
      setTimeout(() => {
        this.active = false;
        try { if (H.sync) H.sync(step, res); } catch (e) {}
        try { step.resolve(!!(res && res.moved)); } catch (e) {}
        // HOLD-TO-WALK: while a direction is held, the next step queues the
        // moment the current one lands — continuous, gapless walking.
        // TAP-vs-HOLD (Steve 2026-10-07): a tap's brief finger-down can
        // straddle a step boundary — without the holdSince check that tap
        // would spawn a phantom hold-step the player never asked for
        // (the dpad overshoot bug). Only chain when the hold began at or
        // before the landing step started: a genuine hold, not a tap that
        // happened to be down when the beat landed.
        if (this.holdDir && this.holdSince != null && this.holdSince <= step._startT &&
            this.queue.length < this.maxQueue) {
          this.enqueue({ dx: this.holdDir.dx, dy: this.holdDir.dy, kind: 'step', ms: this.stepMs, hold: true });
        }
        this.pump();
      }, ms);
    },

    // Drop queued steps matching fn, resolving their promises as not-moved.
    _drop(fn) {
      const dropped = this.queue.filter(fn);
      if (dropped.length) this.queue = this.queue.filter((s) => !fn(s));
      dropped.forEach((s) => { try { s.resolve(false); } catch (e) {} });
      return dropped.length;
    },
    purgeWalk(walkId) { return this._drop((s) => s.walkId === walkId); },
    purgeKind(kind) { return this._drop((s) => s.kind === kind); },

    setHold(dir) {
      if (dir) {
        this.holdDir = { dx: dir.dx, dy: dir.dy };
        // Only stamp the press time on a fresh hold — repeat pointerdowns
        // for the same direction (multi-touch / re-press) must not move it.
        if (this.holdSince == null) this.holdSince = this.now();
      } else {
        this.holdDir = null;
        this.holdSince = null;
      }
    },
    clearHold() { this.holdDir = null; this.holdSince = null; },
    // Drop hold-generated steps still waiting in the queue (finger lifted:
    // stop after the in-flight step lands — no phantom drain).
    purgeHold() { return this._drop((s) => !!s.hold); },
    // The ■ button: stop everything, right now.
    stopAll() { this.clearHold(); this._drop(() => true); },
    get walking() { return this.active || this.queue.length > 0 || !!this.holdDir; },

    // FLIP helpers. Entities opt in by carrying a data-ent="<stable key>"
    // attribute (player, monsters, animals, villagers, corpses).
    capture(root) {
      const map = new Map();
      if (!root || !root.querySelectorAll) return map;
      const els = root.querySelectorAll('[data-ent]');
      for (const el of els) {
        const k = el.getAttribute ? el.getAttribute('data-ent') : el['data-ent'];
        if (!k || map.has(k)) continue;
        const r = el.getBoundingClientRect();
        map.set(k, { x: r.left, y: r.top, w: r.width, h: r.height });
      }
      return map;
    },

    // Animate every entity from its captured rect to its new rect.
    // Returns the list of [el, dx, dy] moves (for tests: max |delta| must be
    // <= one tile — steps are single-tile, so the eye never sees a jump).
    flip(before, root, ms) {
      const els = root.querySelectorAll('[data-ent]');
      const moves = [];
      for (const el of els) {
        const k = el.getAttribute ? el.getAttribute('data-ent') : el['data-ent'];
        const b = before.get(k);
        if (!b) continue;
        const r = el.getBoundingClientRect();
        const dx = b.x - r.left, dy = b.y - r.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        moves.push([el, dx, dy]);
      }
      if (!moves.length) return moves;
      const dur = this.prefersReducedMotion() ? 0 : ms;
      for (const [el, dx, dy] of moves) {
        el.style.transition = 'none';
        el.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      }
      // Reflow so the inverted position paints before we release it.
      void root.offsetWidth;
      const raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16);
      raf(() => {
        for (const [el] of moves) {
          el.style.transition = dur ? 'transform ' + dur + 'ms cubic-bezier(.22,.8,.3,1)' : 'none';
          el.style.transform = 'translate(0px,0px)';
        }
      });
      setTimeout(() => {
        for (const [el] of moves) { el.style.transition = ''; el.style.transform = ''; }
      }, dur + 80);
      return moves;
    },

    prefersReducedMotion() {
      try {
        return typeof matchMedia === 'function' &&
          matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) { return false; }
    },
  };

  S.MoveAnim = M;
})(typeof window !== 'undefined' ? window : globalThis);
