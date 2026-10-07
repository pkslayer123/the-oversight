// @ontology
// system: move-anim
// description: Movement animation. Step-by-step tile transitions.
// provides:
//   - enqueue(anim)
//   - pump()
//   - purgeKind(kind)
//   - setHold(id)
//   - clearHold(id)
//   - stopAll()
//   - capture()
//   - flip()
//   - lungeAt(dir, opts)
//   - recoil(dir, opts)
//   - knockback(dir, n, opts)
//   - windupShift(dir, opts)
//   - chargeStride(lane, opts)
// rules:
//   - Attack primitives are single steps through the same pump/queue, so the three step guarantees (one step at a time, visible beat, FLIP glide) apply to attacks too (code: move-anim.js).
//   - Durations are mobile-safe and short (<= 260ms per beat); sprites sit ON the grid and may overlap adjacent tiles, never affecting layout/scale (code: move-anim.js).
//   - lungeAt(dir): melee strike feel — one step toward the target's square, then one step back; dir is the unit step toward the target; out beat fast, return beat slightly slower (code: move-anim.js).
//   - recoil(dir): hit-react step-back in the given direction (away from the attacker), one short beat (code: move-anim.js).
//   - knockback(dir, n): multi-tile slide along dir, n fast beats, each a single tile — the eye never sees a jump (code: move-anim.js).
//   - windupShift(dir): anticipation step AWAY from the upcoming attack direction (dir is where the strike will go; shift is -dir) — telegraphs the telegraph with one slow, readable beat (code: move-anim.js).
//   - chargeStride(lane): burst of n steps along lane {dx, dy, n}; defaults to a paw-the-ground windup beat first (opts.paw, kind 'windup', step.paw) so chargers feel distinct from rushers (code: move-anim.js).
//   - opts.blur on lungeAt marks a rusher-style blurred strike (shorter beats + step.blur flag for the renderer to motion-blur the sprite) (code: move-anim.js).
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
        if (this.holdDir && this.queue.length < this.maxQueue) {
          this.enqueue({ dx: this.holdDir.dx, dy: this.holdDir.dy, kind: 'step', ms: this.stepMs });
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

    setHold(dir) { this.holdDir = dir ? { dx: dir.dx, dy: dir.dy } : null; },
    clearHold() { this.holdDir = null; },
    // The ■ button: stop everything, right now.
    stopAll() { this.clearHold(); this._drop(() => true); },
    get walking() { return this.active || this.queue.length > 0 || !!this.holdDir; },

    // --- Attack-motion primitives (additive; compose with the queue) ---
    // All five are single steps through the same enqueue/pump, so the three
    // guarantees above (one step at a time, every step a visible beat, FLIP
    // glide) apply to attacks too. Durations are mobile-safe: short beats,
    // sprites sit ON the grid and may overlap adjacent tiles without ever
    // impacting layout or scaling. Each returns a promise resolving when the
    // full sequence lands.
    //
    // Distinct feel per pattern type is the goal:
    //   - beam-shooter braces/planted stance: call windupShift with
    //     {planted:true} (zero-move beat, no retreat — the sprite stays put)
    //   - charger paws the ground first: chargeStride defaults opts.paw true
    //   - rusher blurs: lungeAt with {blur:true} — shorter beats, step.blur
    //     flag for the renderer to motion-blur the sprite
    //
    // WIRING: the game-logic step hook must honor the new kinds ('lunge',
    // 'lunge-back', 'recoil', 'knock', 'windup', 'charge') the same way it
    // honors 'step'/'path' — resolve dx/dy against the entity's CURRENT
    // position at execution time. The renderer maps kind (and step.blur /
    // step.paw flags) to per-pattern visuals.

    attackMs: {
      lunge: 100,      // strike out: fast, snappy
      lungeBack: 170,  // return: a touch slower, reads as recoil-into-stance
      recoil: 140,     // hit-react step-back
      knock: 105,      // knockback slide beats: quick but one tile each
      windup: 210,     // anticipation: slow, readable — this is the telegraph
      paw: 260,        // charger pawing the ground: longest single beat here
      charge: 120,     // charge strides: brisk, relentless
    },

    // lungeAt(dir, opts): melee strike feel — one step toward the target's
    // square, then one step back. dir = {dx,dy}, the unit step toward target.
    // WIRING: combat renderer calls MoveAnim.lungeAt(dir) on the attacker when
    // a melee strike resolves (monsters AND the player).
    lungeAt(dir, opts) {
      opts = opts || {};
      const dx = Math.sign(dir && dir.dx) || 0;
      const dy = Math.sign(dir && dir.dy) || 0;
      const msOut = opts.blur ? 70 : (opts.msOut || this.attackMs.lunge);
      const out = { dx, dy, kind: 'lunge', ms: msOut };
      const back = { dx: -dx, dy: -dy, kind: 'lunge-back', ms: opts.msBack || this.attackMs.lungeBack };
      if (opts.blur) { out.blur = true; back.blur = true; }
      const p1 = this.enqueue(out);
      const p2 = this.enqueue(back);
      return Promise.all([p1, p2]).then((r) => r.every(Boolean));
    },

    // recoil(dir, opts): hit-react step-back in the given direction (caller
    // passes the direction AWAY from the attacker). One short beat.
    // WIRING: combat renderer calls MoveAnim.recoil(awayDir) on whatever took
    // the hit, right as damage numbers render.
    recoil(dir, opts) {
      opts = opts || {};
      return this.enqueue({
        dx: Math.sign(dir && dir.dx) || 0,
        dy: Math.sign(dir && dir.dy) || 0,
        kind: 'recoil',
        ms: opts.ms || this.attackMs.recoil,
      });
    },

    // knockback(dir, n, opts): multi-tile slide when slammed — n fast beats
    // along dir, each a single tile so the eye never sees a jump.
    // WIRING: combat renderer calls MoveAnim.knockback(dir, n) after a heavy
    // slam/charge connects; the game-logic hook stops the slide early if a
    // tile is blocked (resolves against current position per step).
    knockback(dir, n, opts) {
      opts = opts || {};
      n = Math.max(1, Math.min(4, Math.floor(n) || 1));
      const dx = Math.sign(dir && dir.dx) || 0;
      const dy = Math.sign(dir && dir.dy) || 0;
      const ms = opts.ms || this.attackMs.knock;
      const ps = [];
      for (let i = 0; i < n; i++) ps.push(this.enqueue({ dx, dy, kind: 'knock', ms }));
      return Promise.all(ps).then((r) => r.every(Boolean));
    },

    // windupShift(dir, opts): anticipation step BEFORE a strike — shifts AWAY
    // from the upcoming attack direction (dir is where the strike will go).
    // One slow, readable beat: this telegraphs the telegraph.
    // WIRING: combat renderer calls MoveAnim.windupShift(attackDir) during a
    // monster's windup phase, BEFORE the strike primitive fires. For a
    // beam-shooter braced/planted stance pass {planted:true} — no retreat, the
    // sprite holds its square while the renderer draws the charging glow.
    windupShift(dir, opts) {
      opts = opts || {};
      const planted = !!opts.planted;
      return this.enqueue({
        dx: planted ? 0 : -(Math.sign(dir && dir.dx) || 0),
        dy: planted ? 0 : -(Math.sign(dir && dir.dy) || 0),
        kind: 'windup',
        ms: opts.ms || this.attackMs.windup,
        paw: false,
      });
    },

    // chargeStride(lane, opts): burst of steps along a lane for charger-type
    // monsters. lane = {dx, dy, n} — n single-tile strides along (dx,dy).
    // Defaults to a paw-the-ground windup beat first (opts.paw, default true)
    // so chargers feel distinct: paw… then GO.
    // WIRING: combat renderer calls MoveAnim.chargeStride(lane) when a charger
    // commits; the renderer draws the lane highlight and dust for step.paw.
    chargeStride(lane, opts) {
      opts = opts || {};
      const n = Math.max(1, Math.min(8, Math.floor(lane && lane.n) || 1));
      const dx = Math.sign(lane && lane.dx) || 0;
      const dy = Math.sign(lane && lane.dy) || 0;
      const ps = [];
      if (opts.paw !== false) {
        ps.push(this.enqueue({ dx: 0, dy: 0, kind: 'windup', paw: true, ms: opts.pawMs || this.attackMs.paw }));
      }
      for (let i = 0; i < n; i++) {
        ps.push(this.enqueue({ dx, dy, kind: 'charge', ms: opts.ms || this.attackMs.charge }));
      }
      return Promise.all(ps).then((r) => r.every(Boolean));
    },

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
