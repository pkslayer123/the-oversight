// @ontology
// system: drama
// description: Drama overlay — loosely-bound animation layer for emphasis.
// provides:
//   - abilitySignature: per-ability signature visuals — 10 unique + pool-styled fallbacks (Steve 2026-10-07, Drama D1)
//   - poolSignature: pool-styled fallback visuals (combat/social/exploration/investigation/system/care/fieldcraft/craft)
//   - ensureOverlay: creates the .drama-overlay div over the grid
//   - hit: impact starburst — L1 standard, L2 larger+secondary, L3 massive+shockwave (Steve 2026-10-07, Drama C3)
//   - floatText: damage numbers / labels that drift up and fade
//   - flash: full-screen color pulse for big moments
//   - shake: screen shake (transform on grid container, GPU-cheap)
//   - heroCard: centered high-res moment card (synergy, integration)
//   - soulWisp: death wisp floats up from tile
//   - systemCommentary: L2+ floating System observations — L2 cyan-gold, L3 👁️ white-gold (Steve 2026-10-07, Drama C3)
//   - exclaim: !/? above NPCs who want attention — L1 flat, L2 glow, L3 glow + 👁️ (Steve 2026-10-07, Drama C3)
//   - npcAlert: semantic NPC attention marker — talk/curious/dialogue/warn/heart/break; L2 glow, L3 + 👁️ (Steve 2026-10-07, Drama A1/C3)
//   - abilityBurst: radial pulse on ability use, color by pool — L1 thin ring, L2 double+glow, L3 triple+sparkles (Steve 2026-10-07, Drama C3)
//   - contestFlash: TV show moment banner
//   - integrationPulse: System presence evolves with integration level
//   - contestAnnounce: full-screen CONTEST INCOMING banner (Steve 2026-10-07)
//   - contestCheer: gold sparkle rain for audience cheers
//   - contestBoo: red pulses for audience boos
//   - contestJudging: slow-mo desaturation + spotlight
//   - contestWinner: confetti + hero card
//   - contestLoser: sympathetic dim + broken heart
//   - secretShimmer: hidden cache/ruin/secret discovery — shimmer + hero card (Steve 2026-10-07)
//   - ambushWarning: red vignette pulse + warning marker at ambush location (Steve 2026-10-07)
//   - wildRipple: subtle green ripple when wildlife appears/flees (Steve 2026-10-07)
//   - weatherShift: screen-wide weather effect — rain streaks, heat shimmer, cold breath (Steve 2026-10-07)
//   - trailMark: faint footprint marker for tracking (Steve 2026-10-07)
//   - phaseShift: monster phase-transition cue — edge pulse + label (Steve 2026-10-07, Drama B1)
//   - enrage: half-HP temperament — red aura + 💢 + shake (Steve 2026-10-07, Drama B1)
//   - lootSparkle: gold sparkles on monster death (Steve 2026-10-07, Drama B1)
//   - critHit: oversized starburst + CRIT! + damage (Steve 2026-10-07, Drama B1)
//   - playerHurt: red vignette + shake when hurt (Steve 2026-10-07, Drama B1)
//   - dodgeMiss: MISS float + ghost afterimage (Steve 2026-10-07, Drama B1)
//   - socialFlash: dispatcher for social scenario spectacle (Steve 2026-10-07, Drama C1)
//   - mootGather: village gathers — fire pulse + banner (Steve 2026-10-07, Drama C1)
//   - mootVote: vote tally bar with visual weight (Steve 2026-10-07, Drama C1)
//   - exileMoment: dark vignette + EXILED banner (Steve 2026-10-07, Drama C1)
//   - liarExposed: narrowing spotlight + ⚡ crackle (Steve 2026-10-07, Drama C1)
//   - reconcileGlow: warm glow + rising hearts (Steve 2026-10-07, Drama C1)
//   - betraySlash: red slash + BETRAYED banner (Steve 2026-10-07, Drama C1)
//   - playerDeath: slow fade to black + soul wisp + "THE STORY CONTINUES" (Steve 2026-10-07, Drama C2)
//   - newLife: bright emergence — "A NEW SCHOLAR AWAKENS" (Steve 2026-10-07, Drama C2)
//   - abilityLevelUp: golden burst + LEVEL UP + ability name (Steve 2026-10-07, Drama C2)
//   - synergyShimmer: pre-reveal shimmer — "something is happening" (Steve 2026-10-07, Drama C2)
//   - villageBirth: soft pink glow + baby (Steve 2026-10-07, Drama C2)
//   - villageDeath: gray wisp + bell toll (Steve 2026-10-07, Drama C2)
//   - plantIdentified: leaf unfurl + name reveal (Steve 2026-10-07, Drama D2)
//   - techniqueLearned: scroll unroll + golden name (Steve 2026-10-07, Drama D2)
//   - codexLinked: book-open card + page-flip shimmer (Steve 2026-10-07, Drama D2)
//   - skillGained: rising light beam + skill name (Steve 2026-10-07, Drama D2)
//   - teaseFaint: 1st-tease whisper shimmer (Steve 2026-10-07, Drama D2)
//   - ahaMoment: lightbulb + radiating lines on knowledge unlocks (Steve 2026-10-07, Drama D2)
// rules:
//   - Overlay is pointer-events:none — never blocks input (code: drama.js).
//   - All animations use transform/opacity only — GPU-composited, no layout/paint (code: drama.js).
//   - Elements self-remove after animation — no DOM bloat (code: drama.js).
//   - Coordinates are loosely bound: tile centers for anchored effects, screen-relative for full moments (code: drama.js).
// consumes: (none)
(function (global) {
  'use strict';
  const S = global.Scattering = global.Scattering || {};

  // DRAMA_AUDIO_MATES (Steve 2026-10-07, Drama E1): game.js drama kind ->
  // Game.audio voice name, or null when the moment stays quiet. Kinds whose
  // own call sites already fire audio (see the E1 comment in game.js) and
  // pure-visual primitives map to null — the dispatcher never double-fires.
  const DRAMA_AUDIO_MATES = {
    secret: 'knowledgeReveal',      // SECRET FOUND shimmer + card
    ambush: 'ambushSnap',           // arming-beat warning (the FIRE beat snaps on its own)
    wild: 'animalRustle',           // wildlife appears — subtle green ripple
    levelUp: 'levelup',             // an ability deepens (stat growth fires its own levelup)
    synergyShimmer: 'synergyDiscovered', // 2nd-tease pre-reveal (unlock fanfares separately)
    phaseShift: 'patternWindup',    // monster phase-transition cue
    codexLinked: 'paperRustle',     // the book opens — a village's knowledge is yours
    plantIdentified: 'knowledgeReveal', // identification is a SEEING moment
  };

  const Drama = {
    effectRegistry: null, // Scaffold #4 (Steve 2026-10-07): data-driven effect definitions from src/data/dramaEffects.json. Set by game.js after data load.
    overlay: null,

    // ensure the overlay exists, positioned over the grid
    ensureOverlay() {
      if (this.overlay && document.contains(this.overlay)) return this.overlay;
      // find the grid container
      const grid = document.querySelector('.detail') || document.querySelector('#grid') || document.body;
      const ov = document.createElement('div');
      ov.className = 'drama-overlay';
      ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:50;';
      // position relative to grid
      const gridPos = getComputedStyle(grid).position;
      if (gridPos === 'static') grid.style.position = 'relative';
      grid.appendChild(ov);
      this.overlay = ov;
      return ov;
    },

    // tile center in overlay coordinates (loosely bound — we use the tile's
    // DOM rect, but the effect itself is free-floating)
    tileCenter(x, y) {
      const grid = document.querySelector('.detail') || document.body;
      const tiles = grid.querySelectorAll('.tile');
      // 9x9 grid: index = y*9 + x
      const idx = y * 9 + x;
      const tile = tiles[idx];
      if (!tile) return { x: '50%', y: '50%' };
      const r = tile.getBoundingClientRect();
      const gr = grid.getBoundingClientRect();
      return { x: r.left - gr.left + r.width / 2, y: r.top - gr.top + r.height / 2 };
    },

    // spawn an element, animate, remove
    spawn(html, css, animClass, duration) {
      const ov = this.ensureOverlay();
      const el = document.createElement('div');
      el.innerHTML = html;
      el.style.cssText = css;
      ov.appendChild(el);
      // trigger animation
      requestAnimationFrame(() => el.classList.add(animClass));
      setTimeout(() => el.remove(), (duration || 600) + 100);
      return el;
    },

    // impact starburst at grid coords
    // INTEGRATION VISUAL LANGUAGES (Steve 2026-10-07, Drama C3):
    //   L1 LINKED:    standard starburst. The System observes.
    //   L2 ATTUNED:   larger starburst + secondary smaller burst. The System participates.
    //   L3 INTEGRATED: massive starburst + expanding shockwave ring. The System celebrates.
    // renderEffect(id, args): generic data-driven renderer (Steve 2026-10-07, Scaffold #4).
    // Reads src/data/dramaEffects.json instead of bespoke methods. Visual output
    // is IDENTICAL — the JSON contains the same expressions, evaluated in the
    // same scope. Migrated incrementally; unmigrated methods stay hand-written.
    renderEffect(id, args) {
      args = args || {};
      const def = (this.effectRegistry || {})[id];
      if (!def) return null;
      const scope = Object.assign({}, args);
      // computed expressions, in definition order (can reference params + earlier computed)
      if (def.computed) {
        for (const key of Object.keys(def.computed)) {
          scope[key] = this._evalExpr(def.computed[key], scope);
        }
      }
      // anchor coords: tile -> cx/cy from tileCenter
      if (def.anchor === 'tile' && typeof args.x === 'number' && typeof args.y === 'number') {
        const c = this.tileCenter(args.x, args.y);
        scope.cx = c.x; scope.cy = c.y;
      }
      for (const step of (def.steps || [])) {
        if (step.when && !this._evalExpr(step.when, scope)) continue;
        if (step.do === 'spawn') {
          this.spawn(
            this._evalTemplate(step.html || '', scope),
            this._evalTemplate(step.css || '', scope),
            step.animClass,
            this._evalField(step.duration, scope)
          );
        } else if (step.do === 'particles') {
          const count = this._evalField(step.count, scope);
          const stagger = step.stagger || 0;
          for (let i = 0; i < count; i++) {
            const pscope = Object.assign({ i: i }, scope);
            if (step.vary) {
              for (const vk of Object.keys(step.vary)) {
                const v = step.vary[vk];
                pscope[vk] = Array.isArray(v) ? v[i % v.length] : this._evalExpr(v, pscope);
              }
            }
            // Capture synchronously (matches original: values computed before setTimeout)
            const html = this._evalTemplate(step.html || '', pscope);
            const css = this._evalTemplate(step.css || '', pscope);
            const duration = this._evalField(step.duration, pscope);
            const animClass = step.animClass;
            setTimeout(() => { this.spawn(html, css, animClass, duration); }, i * stagger);
          }
        } else if (step.do === 'call') {
          const callArgs = (step.args || []).map(a => this._evalField(a, scope));
          if (typeof this[step.method] === 'function') this[step.method].apply(this, callArgs);
        }
      }
      return true;
    },

    // _evalExpr: evaluate a JS expression with scope vars + Math available.
    // Expressions come from our own dramaEffects.json — not user input.
    _evalExpr(expr, scope) {
      const keys = Object.keys(scope);
      const fn = new Function(...keys, 'Math', '"use strict"; return (' + expr + ');');
      return fn.apply(null, keys.map(k => scope[k]).concat([Math]));
    },

    // _evalTemplate: substitute {expression} placeholders in a string.
    _evalTemplate(tpl, scope) {
      return tpl.replace(/\{([^{}]+)\}/g, (m, expr) => {
        try {
          const v = this._evalExpr(expr, scope);
          return (v === undefined || v === null) ? '' : String(v);
        } catch (e) { return ''; }
      });
    },

    // _evalField: if the whole field is a single {expr}, return the raw value
    // (preserves numbers for duration/count). Otherwise template-substitute.
    // Numeric strings are returned as numbers (matches original number args).
    _evalField(field, scope) {
      if (typeof field !== 'string') return field;
      const m = /^\{([^{}]+)\}$/.exec(field.trim());
      if (m) {
        try { return this._evalExpr(m[1], scope); }
        catch (e) { return field; }
      }
      const sub = this._evalTemplate(field, scope);
      if (/^-?\d+(\.\d+)?$/.test(sub.trim())) return Number(sub);
      return sub;
    },

    hit(x, y, opts) {
      opts = opts || {};
      const c = this.tileCenter(x, y);
      const color = opts.color || '#ffd54a';
      const integ = opts.integration || 0;
      const star = (size) =>
        `<svg width="${size}" height="${size}" viewBox="0 0 60 60"><g fill="${color}"><polygon points="30,0 35,20 55,15 40,30 55,45 35,40 30,60 25,40 5,45 20,30 5,15 25,20"/></g></svg>`;
      if (integ >= 3) {
        // L3 INTEGRATED: massive starburst + expanding shockwave ring
        const size = opts.size || 120;
        this.spawn(
          star(size),
          `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
          'drama-hit',
          500
        );
        const wave = 170;
        this.spawn(
          `<svg width="${wave}" height="${wave}" viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.8"/></svg>`,
          `position:absolute;left:${c.x - wave/2}px;top:${c.y - wave/2}px;`,
          'drama-shockwave',
          700
        );
        this.flash('rgba(255,255,255,0.08)', 250);
      } else if (integ >= 2) {
        // L2 ATTUNED: larger starburst + secondary smaller burst, slightly offset
        const size = opts.size || 95;
        this.spawn(
          star(size),
          `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
          'drama-hit',
          450
        );
        const size2 = 46;
        this.spawn(
          star(size2),
          `position:absolute;left:${c.x + 18 - size2/2}px;top:${c.y - 22 - size2/2}px;`,
          'drama-hit',
          400
        );
      } else {
        // L1/L0 LINKED: standard starburst — the System observes
        const size = opts.size || 60;
        this.spawn(
          star(size),
          `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
          'drama-hit',
          400
        );
      }
    },

    // floating text (damage, labels)
    floatText(x, y, text, opts) {
      opts = opts || {};
      const color = opts.color || '#fff';
      const size = opts.size || 18;
      const dx = opts.dx || 0;
      const dy = opts.dy || 0;
      let left, top;
      // PERCENTAGE STRINGS (Steve 2026-10-07): if x/y are '50%' style strings,
      // use them directly as CSS. Passing them through tileCenter coerces to
      // invalid '50%0px' which browsers drop (text renders top-left).
      if (typeof x === 'string' && x.includes('%')) {
        left = `left:${x};`;
        top = `top:${y};`;
      } else {
        const c = this.tileCenter(x, y);
        left = `left:${c.x + dx}px;`;
        top = `top:${c.y + dy}px;`;
      }
      this.spawn(
        text,
        `position:absolute;${left}${top}transform:translate(-50%,-50%);color:${color};font-size:${size}px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
        'drama-float',
        800
      );
    },

    // full-screen flash
    flash(color, duration) {
      color = color || 'rgba(255,255,255,0.3)';
      this.spawn(
        '',
        `position:absolute;inset:0;background:${color};`,
        'drama-flash',
        duration || 300
      );
    },

    // screen shake (on grid container)
    shake(intensity) {
      intensity = intensity || 8;
      const grid = document.querySelector('.detail') || document.body;
      grid.classList.remove('drama-shake');
      grid.style.setProperty('--shake-intensity', intensity + 'px');
      // force reflow
      void grid.offsetWidth;
      grid.classList.add('drama-shake');
      setTimeout(() => grid.classList.remove('drama-shake'), 400);
    },

    // hero card: centered high-res moment (synergy discovery, integration up)
    heroCard(title, subtitle, iconSvg) {
      const icon = iconSvg || '✨';
      this.spawn(
        `<div style="text-align:center;padding:24px;background:rgba(10,15,10,0.92);border:2px solid #4df3ff;border-radius:12px;max-width:280px;">
          <div style="font-size:48px;margin-bottom:8px;">${icon}</div>
          <div style="font-size:20px;font-weight:bold;color:#4df3ff;margin-bottom:4px;">${title}</div>
          <div style="font-size:14px;color:#ccc;line-height:1.4;">${subtitle}</div>
        </div>`,
        `position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(0.8);`,
        'drama-hero',
        2500
      );
      this.flash('rgba(77,243,255,0.15)', 500);
    },

    // soul wisp: death effect
    soulWisp(x, y) {
      const c = this.tileCenter(x, y);
      this.spawn(
        `<svg width="30" height="40" viewBox="0 0 30 40"><ellipse cx="15" cy="20" rx="10" ry="15" fill="rgba(180,220,255,0.7)"/></svg>`,
        `position:absolute;left:${c.x - 15}px;top:${c.y - 20}px;`,
        'drama-wisp',
        1200
      );
    },

    // exclaim: ! or ? above an NPC who wants attention (loosely bound — floats above tile)
    // Steve 2026-10-07: "Exclamations above player characters when they want to catch your attention as they walk by"
    // INTEGRATION VISUAL LANGUAGES (Steve 2026-10-07, Drama C3):
    //   L1 LINKED:    standard icon. The System observes.
    //   L2 ATTUNED:   icon + subtle colored glow. The System participates.
    //   L3 INTEGRATED: icon + glow + tiny System eye 👁️ beneath. The System celebrates.
    exclaim(x, y, icon, opts) {
      opts = opts || {};
      const integ = opts.integration || 0;
      const c = this.tileCenter(x, y);
      const color = icon === '!' ? '#ff5252' : icon === '?' ? '#ffd54a' : '#4df3ff';
      let html;
      if (integ >= 3) {
        html = `<div style="text-align:center;font-size:30px;line-height:1.1;font-weight:bold;color:${color};text-shadow:0 0 14px ${color},0 2px 6px rgba(0,0,0,0.9);">${icon}<div style="font-size:12px;">👁️</div></div>`;
      } else if (integ >= 2) {
        html = `<div style="font-size:28px;font-weight:bold;color:${color};text-shadow:0 0 12px ${color},0 2px 6px rgba(0,0,0,0.9);">${icon}</div>`;
      } else {
        html = `<div style="font-size:28px;font-weight:bold;color:${color};text-shadow:0 2px 6px rgba(0,0,0,0.9);">${icon}</div>`;
      }
      this.spawn(
        html,
        `position:absolute;left:${c.x}px;top:${c.y - 30}px;transform:translate(-50%,-100%);`,
        'drama-exclaim',
        opts.duration || 1500
      );
    },

    // npcAlert: semantic NPC attention marker (Steve 2026-10-07, Drama Round A1).
    // kind: 'talk'(!) 'curious'(?) 'dialogue'(💬) 'warn'(⚠️) 'heart'(❤️) 'break'(💔)
    // Scales with integration: bigger icon at higher levels. Hearts linger longer.
    npcAlert(x, y, kind, opts) {
      opts = opts || {};
      const kinds = {
        talk:     { icon: '!',  color: '#ff5252' },
        curious:  { icon: '?',  color: '#ffd54a' },
        dialogue: { icon: '💬', color: '#4df3ff' },
        warn:     { icon: '⚠️', color: '#ff9d45' },
        heart:    { icon: '❤️', color: '#ff6b9d' },
        break:    { icon: '💔', color: '#9e9e9e' },
      };
      const k = kinds[kind] || kinds.talk;
      const integ = opts.integration || 0;
      const size = 28 + integ * 4; // 28 → 40px across L0–L3
      const c = this.tileCenter(x, y);
      // INTEGRATION VISUAL LANGUAGES (Steve 2026-10-07, Drama C3):
      //   L1: flat icon. L2: colored glow — the System participates. L3: glow + tiny 👁️.
      let shadow = 'text-shadow:0 2px 6px rgba(0,0,0,0.9);';
      if (integ >= 3) shadow = `text-shadow:0 0 14px ${k.color},0 2px 6px rgba(0,0,0,0.9);`;
      else if (integ >= 2) shadow = `text-shadow:0 0 10px ${k.color},0 2px 6px rgba(0,0,0,0.9);`;
      const eye = integ >= 3 ? '<div style="font-size:12px;">👁️</div>' : '';
      this.spawn(
        `<div style="text-align:center;font-size:${size}px;line-height:1.1;font-weight:bold;color:${k.color};${shadow}">${k.icon}${eye}</div>`,
        `position:absolute;left:${c.x}px;top:${c.y - 30}px;transform:translate(-50%,-100%);`,
        'drama-exclaim',
        opts.duration || ((kind === 'heart' || kind === 'break') ? 2000 : 1500)
      );
    },

    // abilityBurst: radial pulse when an ability fires (color by pool)
    // INTEGRATION VISUAL LANGUAGES (Steve 2026-10-07, Drama C3):
    //   L1 LINKED:    clean, minimal, blue — one thin ring, quiet fade. The System observes.
    //   L2 ATTUNED:   richer, layered, cyan-gold — double ring + inner glow. The System participates.
    //   L3 INTEGRATED: spectacular, white-gold — triple ring + prismatic sparkles + flash. The System celebrates.
    abilityBurst(x, y, color, integration) {
      const c = this.tileCenter(x, y);
      color = color || '#4df3ff';
      integration = integration || 0;
      if (integration >= 3) {
        // L3 INTEGRATED: triple ring, white-gold, prismatic sparkles, System flash
        const size = 150;
        const rings =
          `<circle cx="40" cy="40" r="36" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.95"/>` +
          `<circle cx="40" cy="40" r="28" fill="none" stroke="${color}" stroke-width="3" opacity="0.85"/>` +
          `<circle cx="40" cy="40" r="17" fill="${color}" opacity="0.3"/>`;
        this.spawn(
          `<svg width="${size}" height="${size}" viewBox="0 0 80 80">${rings}</svg>`,
          `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
          'drama-burst',
          700
        );
        // prismatic sparkles scattered around the ring
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + 0.26;
          const sx = c.x + Math.cos(ang) * 62;
          const sy = c.y + Math.sin(ang) * 62;
          const spark = ['#ffffff', '#ffd54a', color][i % 3];
          this.spawn(
            `<div style="width:8px;height:8px;background:${spark};clip-path:polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);box-shadow:0 0 8px ${spark};"></div>`,
            `position:absolute;left:${sx}px;top:${sy}px;transform:translate(-50%,-50%);`,
            'drama-sparkle',
            800
          );
        }
        // the System celebrates with you: white flash
        this.flash('rgba(255,255,255,0.12)', 300);
      } else if (integration >= 2) {
        // L2 ATTUNED: double ring + inner glow, cyan outer, gold inner
        const size = 112;
        const rings =
          `<circle cx="40" cy="40" r="35" fill="none" stroke="${color}" stroke-width="3" opacity="0.85"/>` +
          `<circle cx="40" cy="40" r="25" fill="none" stroke="#ffd54a" stroke-width="2" opacity="0.6"/>` +
          `<circle cx="40" cy="40" r="15" fill="${color}" opacity="0.22"/>`;
        this.spawn(
          `<svg width="${size}" height="${size}" viewBox="0 0 80 80">${rings}</svg>`,
          `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
          'drama-burst',
          600
        );
      } else {
        // L1/L0 LINKED: one thin clean ring, quiet fade — the System observes
        const size = 90;
        const rings = `<circle cx="40" cy="40" r="35" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.7"/>`;
        this.spawn(
          `<svg width="${size}" height="${size}" viewBox="0 0 80 80">${rings}</svg>`,
          `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
          'drama-burst',
          450
        );
      }
    },

    // contestFlash: TV show moment dispatcher (Steve 2026-10-07).
    // Game.drama('contest', spec) routes here. spec.type selects the moment:
    // 'announce' | 'cheer' | 'boo' | 'judging' | 'winner' | 'loser' | 'banner'
    // Legacy: contestFlash(title, color) still works as a simple banner.
    contestFlash(spec, color) {
      // Dispatch object form
      if (spec && typeof spec === 'object' && spec.type) {
        const integ = spec.integration || 0;
        switch (spec.type) {
          case 'announce': return this.contestAnnounce(spec.name || 'CONTEST', integ);
          case 'cheer': return this.contestCheer(integ);
          case 'boo': return this.contestBoo(integ);
          case 'judging': return this.contestJudging(integ);
          case 'winner': return this.contestWinner(spec.name || 'Winner', integ);
          case 'loser': return this.contestLoser(spec.name || 'Loser', integ);
          case 'banner': break; // fall through to banner
          default: break;
        }
        spec = spec.title || spec.name || '';
      }
      // Simple banner form
      const title = spec || 'CONTEST';
      color = color || '#ff6b9d';
      this.flash(color.replace(')', ',0.25)').replace('rgb', 'rgba'), 600);
      this.spawn(
        `<div style="font-size:24px;font-weight:bold;color:${color};text-shadow:0 2px 8px rgba(0,0,0,0.9);letter-spacing:2px;">${title}</div>`,
        `position:absolute;left:50%;top:25%;transform:translate(-50%,-50%);`,
        'drama-contest',
        2000
      );
    },

    // systemCommentary: floating System observations (Steve 2026-10-07, Drama C3).
    // L2 ATTUNED: plain cyan-gold italic text, drifts up — the System participates.
    // L3 INTEGRATED: 👁️ prefix + white-gold glow, longer — the System celebrates.
    // Silent below L2: the System only speaks once Attuned.
    systemCommentary(text, opts) {
      opts = opts || {};
      const integ = opts.integration || 0;
      if (integ < 2) return;
      const body = integ >= 3
        ? `<div style="font-size:15px;font-style:italic;color:#fff3c4;text-shadow:0 0 12px #ffd54a,0 2px 6px rgba(0,0,0,0.9);">👁️ ${text}</div>`
        : `<div style="font-size:14px;font-style:italic;color:#9be8ff;text-shadow:0 2px 6px rgba(0,0,0,0.9);">${text}</div>`;
      this.spawn(
        body,
        `position:absolute;left:50%;top:18%;transform:translate(-50%,-50%);max-width:300px;text-align:center;`,
        'drama-commentary',
        integ >= 3 ? 2600 : 2000
      );
    },

    // integrationPulse: the System is watching — evolves with integration level
    // L1: subtle blue pulse. L2: eye opens. L3: full overlay presence.
    integrationPulse(level) {
      if (level >= 3) {
        this.heroCard('⬢ SYSTEM', 'Full integration. I see everything you see.', '👁️');
      } else if (level >= 2) {
        this.flash('rgba(77,243,255,0.2)', 800);
        this.floatText('50%', '35%', '👁️ The System watches', { color: '#4df3ff', size: 16 });
      } else if (level >= 1) {
        this.flash('rgba(77,243,255,0.08)', 400);
      }
    },

    // CONTEST DRAMA (Steve 2026-10-07): contests are UNAVOIDABLE televised
    // events — they should FEEL like TV. All scale with integration.

    // Contest announcement: full-screen banner with dramatic flash
    contestAnnounce(contestName, integration) {
      integration = integration || 0;
      this.flash('rgba(255,107,157,0.25)', 800);
      this.shake(6 + integration * 2);
      this.spawn(
        `<div style="text-align:center;padding:32px;background:rgba(20,5,12,0.95);border:3px solid #ff6b9d;border-radius:16px;max-width:320px;box-shadow:0 0 40px rgba(255,107,157,0.5);">
          <div style="font-size:56px;margin-bottom:12px;">📺</div>
          <div style="font-size:22px;font-weight:bold;color:#ff6b9d;letter-spacing:3px;margin-bottom:8px;">CONTEST INCOMING</div>
          <div style="font-size:16px;color:#fff;font-weight:bold;">${contestName}</div>
          <div style="font-size:12px;color:#ff9dc0;margin-top:8px;">The village holds its breath.</div>
        </div>`,
        `position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(0.7);`,
        'drama-contest-announce',
        2200 + (integration * 400)
      );
    },

    // Audience cheers: gold sparkles rain
    contestCheer(integration) {
      integration = integration || 0;
      const count = 3 + integration * 2; // 3 → 9 sparkles
      for (let i = 0; i < count; i++) {
        const x = 20 + Math.random() * 60; // % across screen
        const delay = i * 80;
        setTimeout(() => {
          this.spawn(
            `<div style="font-size:${16 + integration * 4}px;color:#ffd54a;text-shadow:0 0 8px #ffd54a;">✨</div>`,
            `position:absolute;left:${x}%;top:15%;`,
            'drama-cheer',
            1200
          );
        }, delay);
      }
    },

    // Audience boos: red pulses from the edges
    contestBoo(integration) {
      integration = integration || 0;
      this.flash('rgba(255,60,60,0.15)', 500);
      const count = 2 + integration;
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? '5%' : '90%';
        setTimeout(() => {
          this.spawn(
            `<div style="font-size:24px;color:#ff5252;text-shadow:0 0 10px #ff5252;">👎</div>`,
            `position:absolute;left:${side};top:${30 + i * 15}%;`,
            'drama-boo',
            1000
          );
        }, i * 150);
      }
    },

    // Judging: slow-mo — brief desaturation + spotlight
    contestJudging(integration) {
      integration = integration || 0;
      this.spawn(
        '',
        `position:absolute;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:grayscale(0.7);`,
        'drama-judge-dim',
        1500 + (integration * 300)
      );
      this.spawn(
        `<div style="font-size:20px;font-weight:bold;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,1);letter-spacing:4px;">JUDGING</div>`,
        `position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);`,
        'drama-judge-text',
        1500 + (integration * 300)
      );
    },

    // ================= COMBAT SPECTACLE (Steve 2026-10-07, Drama B1) =================
    // phaseShift: monster shifts combat phase — edge pulse + readable label.
    // Scales with integration: L0 silent-ish, L3 full banner.
    phaseShift(x, y, phaseLabel, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const colors = { windup: '#ffd54a', strike: '#ff5252', recovery: '#7cfc9a' };
      const color = colors[phaseLabel] || '#4df3ff';
      // edge pulse ring
      const size = 70 + integration * 15;
      this.spawn(
        `<svg width="${size}" height="${size}" viewBox="0 0 80 80"><rect x="5" y="5" width="70" height="70" rx="8" fill="none" stroke="${color}" stroke-width="4" opacity="0.9"/></svg>`,
        `position:absolute;left:${c.x - size / 2}px;top:${c.y - size / 2}px;`,
        'drama-phase',
        600 + integration * 150
      );
      if (integration >= 1) {
        const label = { windup: '⚡ WINDUP', strike: '💥 STRIKE', recovery: '🌿 RECOVERY' }[phaseLabel] || String(phaseLabel).toUpperCase();
        this.floatText(x, y, label, { color: color, size: 14 + integration * 2, dy: -30 });
      }
    },

    // enrage: monster crosses half-HP temperament — red aura + shake + 💢.
    enrage(x, y, temper, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const size = 90 + integration * 20;
      this.spawn(
        `<svg width="${size}" height="${size}" viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" fill="rgba(255,40,40,0.25)" stroke="#ff3030" stroke-width="3" opacity="0.9"/></svg>`,
        `position:absolute;left:${c.x - size / 2}px;top:${c.y - size / 2}px;`,
        'drama-enrage',
        1000 + integration * 200
      );
      this.floatText(x, y, '💢', { color: '#ff5252', size: 28 + integration * 6, dy: -35 });
      const tname = { enraged: 'ENRAGED', cunning: 'CUNNING', desperate: 'DESPERATE' }[temper] || 'ENRAGED';
      this.floatText(x, y, tname, { color: '#ff6b6b', size: 13 + integration * 2, dy: 30 });
      this.shake(6 + integration * 3);
    },

    // lootSparkle: monster death — gold sparkles where it fell.
    lootSparkle(x, y, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const count = 5 + integration * 3; // 5 → 14 sparkles
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 15 + Math.random() * (20 + integration * 10);
        const sx = c.x + Math.cos(ang) * dist;
        const sy = c.y + Math.sin(ang) * dist;
        const sz = 8 + Math.random() * 8;
        setTimeout(() => {
          this.spawn(
            `<div style="width:${sz}px;height:${sz}px;background:#ffd54a;clip-path:polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);"></div>`,
            `position:absolute;left:${sx}px;top:${sy}px;transform:translate(-50%,-50%);`,
            'drama-sparkle',
            900
          );
        }, i * 50);
      }
    },

    // critHit: player crit — oversized starburst + CRIT! + damage number.
    critHit(x, y, dmg, integration) {
      integration = integration || 0;
      const size = 90 + integration * 25; // 90 → 165
      this.hit(x, y, { color: '#ffeb3b', size: size, integration: 0 });
      this.floatText(x, y, 'CRIT!', { color: '#ffeb3b', size: 24 + integration * 6, dy: -25 });
      this.floatText(x, y, String(dmg), { color: '#ffffff', size: 18 + integration * 4, dy: 20 });
      if (integration >= 2) this.shake(4 + integration * 2);
      if (integration >= 3) this.flash('rgba(255,235,59,0.18)', 400);
    },

    // playerHurt: monster lands on you — red vignette + shake.
    playerHurt(dmg, integration) {
      integration = integration || 0;
      const alpha = Math.min(0.45, 0.15 + (dmg / 100) + integration * 0.05);
      this.spawn(
        '',
        `position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 40%, rgba(200,0,0,${alpha}) 100%);`,
        'drama-vignette-red',
        500 + integration * 100
      );
      this.shake(5 + Math.min(8, Math.floor(dmg / 5)) + integration * 2);
    },

    // dodgeMiss: you slip aside — MISS float + ghost afterimage.
    dodgeMiss(x, y, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      this.floatText(x, y, 'MISS', { color: '#b0c4de', size: 16 + integration * 2, dy: -20 });
      // afterimage: fading silhouette ghost
      this.spawn(
        `<div style="font-size:32px;opacity:0.5;filter:blur(1px);">👤</div>`,
        `position:absolute;left:${c.x + 12}px;top:${c.y - 10}px;transform:translate(-50%,-50%);`,
        'drama-afterimage',
        600
      );
    },

    // Winner: confetti burst + hero card
    contestWinner(name, integration) {
      integration = integration || 0;
      this.flash('rgba(255,213,74,0.3)', 600);
      // Confetti: colorful pieces rain
      const colors = ['#ffd54a', '#ff6b9d', '#4df3ff', '#7cfc9a', '#c792ea'];
      const count = 8 + integration * 4; // 8 → 20 pieces
      for (let i = 0; i < count; i++) {
        const color = colors[i % colors.length];
        const x = Math.random() * 100;
        const delay = i * 60;
        setTimeout(() => {
          this.spawn(
            `<div style="width:10px;height:14px;background:${color};transform:rotate(${Math.random() * 360}deg);"></div>`,
            `position:absolute;left:${x}%;top:-20px;`,
            'drama-confetti',
            1800
          );
        }, delay);
      }
      // Hero card after confetti starts
      setTimeout(() => {
        this.heroCard('🏆 ' + name + ' WINS', 'The crowd is a weather system.', '🎉');
      }, 400);
    },

    // Loser: sympathetic dim + floating broken heart
    contestLoser(name, integration) {
      integration = integration || 0;
      this.spawn(
        '',
        `position:absolute;inset:0;background:rgba(0,0,20,0.35);`,
        'drama-loser-dim',
        2000
      );
      this.spawn(
        `<div style="font-size:40px;filter:grayscale(0.3);">💔</div>`,
        `position:absolute;left:50%;top:35%;transform:translate(-50%,-50%);`,
        'drama-loser-heart',
        2000 + (integration * 200)
      );
      this.floatText('50%', '50%', name, { color: '#a0a0c0', size: 16 + integration * 2 });
    },

    // secretShimmer: hidden cache/ruin/secret found — full-screen shimmer + hero card.
    // Steve 2026-10-07: wilderness drama. Scales with integration — bigger shimmer, longer card.
    secretShimmer(title, subtitle, integration) {
      integration = integration || 0;
      const shimmerColor = integration >= 2
        ? 'rgba(255,215,74,0.25)'
        : 'rgba(255,215,74,0.12)';
      this.flash(shimmerColor, 600 + (integration * 200));
      this.heroCard(title || '✨ SECRET FOUND', subtitle || '', integration >= 3 ? '🗝️' : '✨');
    },

    // ambushWarning: monsters about to ambush — red vignette pulse + warning at location.
    // Steve 2026-10-07: wilderness drama. Vignette scales with integration.
    ambushWarning(x, y, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      // red vignette: radial gradient overlay
      this.spawn(
        '',
        'position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 40%, rgba(255,30,30,0.35) 100%);',
        'drama-vignette',
        900 + (integration * 200)
      );
      // warning marker at the ambush location
      this.spawn(
        '<div style="font-size:32px;text-shadow:0 2px 8px rgba(0,0,0,0.9);">⚠️</div>',
        `position:absolute;left:${c.x}px;top:${c.y - 20}px;transform:translate(-50%,-100%);`,
        'drama-ambushmark',
        1200
      );
      // L2+: the System names the danger
      if (integration >= 2) {
        this.floatText(c.x, c.y - 50, 'AMBUSH', { color: '#ff5252', size: 20 });
      }
    },

    // wildRipple: subtle green ripple when wildlife appears or flees.
    // Steve 2026-10-07: wilderness drama. Quiet — animals aren't the System's business.
    wildRipple(x, y, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const size = 50 + (integration * 10);
      this.spawn(
        `<svg width="${size}" height="${size}" viewBox="0 0 80 80"><circle cx="40" cy="40" r="30" fill="none" stroke="#7cfc9a" stroke-width="2" opacity="0.5"/></svg>`,
        `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
        'drama-ripple',
        600
      );
    },

    // weatherShift: screen-wide weather effect.
    // kind: 'rain' (streaks), 'cold' (breath fog), 'clear' (warm shimmer).
    // Steve 2026-10-07: wilderness drama. Scales with integration — L2+ gets System commentary.
    weatherShift(kind, integration) {
      integration = integration || 0;
      if (kind === 'rain') {
        // rain streaks: diagonal lines falling
        this.spawn(
          `<svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">${Array.from({length: 30}, (_, i) => {
            const x = (i * 47) % 390, y = (i * 31) % 844;
            return `<line x1="${x}" y1="${y}" x2="${x - 8}" y2="${y + 24}" stroke="rgba(150,200,255,0.4)" stroke-width="2"/>`;
          }).join('')}</svg>`,
          'position:absolute;inset:0;',
          'drama-rain',
          2000 + (integration * 500)
        );
        if (integration >= 2) {
          this.floatText('50%', '20%', '🌧️ The System notes the rain', { color: '#96c8ff', size: 14 });
        }
      } else if (kind === 'cold') {
        // cold breath: blue-white fog pulse from edges
        this.spawn(
          '',
          'position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 30%, rgba(180,220,255,0.25) 100%);',
          'drama-vignette',
          1500
        );
        if (integration >= 2) {
          this.floatText('50%', '20%', '❄️ Cold snap — the System adjusts your HUD', { color: '#b4dcff', size: 14 });
        }
      } else if (kind === 'clear') {
        // clear: brief warm shimmer
        this.flash('rgba(255,240,200,0.08)', 800);
      }
    },

    // trailMark: faint footprint marker for tracking — accumulates, doesn't fade fast.
    // Steve 2026-10-07: wilderness drama. For trail_eyes and tracking play.
    trailMark(x, y, direction, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const arrow = direction === 'n' ? '↑' : direction === 's' ? '↓' : direction === 'e' ? '→' : direction === 'w' ? '←' : '•';
      const opacity = 0.4 + (integration * 0.15); // clearer with integration
      this.spawn(
        `<div style="font-size:20px;opacity:${opacity};text-shadow:0 1px 3px rgba(0,0,0,0.7);">🐾${arrow}</div>`,
        `position:absolute;left:${c.x}px;top:${c.y}px;transform:translate(-50%,-50%);`,
        'drama-trail',
        3000
      );
    },

    // socialFlash: dispatcher for social scenario spectacle (Steve 2026-10-07, Drama C1).
    // Game.drama('social', spec) routes here. spec.type:
    // 'moot' | 'vote' | 'exile' | 'liar' | 'reconcile' | 'betray'
    socialFlash(spec) {
      if (!spec || typeof spec !== 'object' || !spec.type) return;
      const integ = spec.integration || 0;
      switch (spec.type) {
        case 'moot': return this.mootGather(spec.caller || 'Someone', integ);
        case 'vote': return this.mootVote(spec.guilty || 0, spec.total || 0, integ);
        case 'exile': return this.exileMoment(spec.name || 'The accused', integ);
        case 'liar': return this.liarExposed(spec.name || 'The liar', integ);
        case 'reconcile': return this.reconcileGlow(spec.name || '', integ);
        case 'betray': return this.betraySlash(spec.name || 'The betrayer', integ);
        default: return;
      }
    },

    // mootGather: the village gathers — warm fire pulse, crowd converges
    mootGather(caller, integration) {
      integration = integration || 0;
      // fire glow: warm radial pulse from center
      this.spawn(
        '',
        'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(255,150,50,0.25) 0%, transparent 60%);',
        'drama-moot-glow',
        2000 + (integration * 400)
      );
      this.spawn(
        `<div style="font-size:22px;font-weight:bold;color:#ffb347;text-shadow:0 2px 8px rgba(0,0,0,0.9);letter-spacing:1px;">🔥 MOOT CALLED<br><span style="font-size:14px;font-weight:normal;color:#ccc;">${caller} summons the village</span></div>`,
        'position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;',
        'drama-moot-banner',
        2500
      );
      if (integration >= 2) {
        this.floatText('50%', '45%', '📺 The System tunes in — the galaxy watches', { color: '#ff6b9d', size: 13 });
      }
    },

    // mootVote: vote tally with visual weight — guilty votes stack red, innocent green
    mootVote(guilty, total, integration) {
      integration = integration || 0;
      const innocent = total - guilty;
      const guiltyPct = total > 0 ? Math.round((guilty / total) * 100) : 0;
      const barW = 200 + (integration * 20);
      this.spawn(
        `<div style="text-align:center;background:rgba(10,10,10,0.9);padding:16px;border-radius:8px;border:1px solid #666;">
          <div style="font-size:16px;font-weight:bold;color:#fff;margin-bottom:8px;">THE COUNT</div>
          <div style="display:flex;width:${barW}px;height:24px;border-radius:4px;overflow:hidden;margin:0 auto;">
            <div style="width:${guiltyPct}%;background:#c0392b;"></div>
            <div style="width:${100 - guiltyPct}%;background:#27ae60;"></div>
          </div>
          <div style="font-size:13px;color:#ccc;margin-top:6px;"><span style="color:#ff6b6b;">${guilty} guilty</span> · <span style="color:#7cfc9a;">${innocent} innocent</span></div>
        </div>`,
        'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);',
        'drama-vote',
        3000
      );
      // verdict flash: red for guilty, green for not
      if (guilty > innocent) {
        this.flash('rgba(192,57,43,0.2)', 600);
      } else {
        this.flash('rgba(39,174,96,0.15)', 600);
      }
    },

    // exileMoment: dark dramatic — red-black vignette, EXILED banner, crowd turns away
    exileMoment(name, integration) {
      integration = integration || 0;
      // dark vignette closing in
      this.spawn(
        '',
        'position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 20%, rgba(20,0,0,0.85) 100%);',
        'drama-exile-vignette',
        3000 + (integration * 500)
      );
      this.spawn(
        `<div style="font-size:36px;font-weight:bold;color:#c0392b;text-shadow:0 3px 12px rgba(0,0,0,1);letter-spacing:4px;">EXILED<br><span style="font-size:16px;font-weight:normal;color:#999;letter-spacing:1px;">${name} walks until the trees close</span></div>`,
        'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;',
        'drama-exile-banner',
        3500
      );
      this.shake(6 + (integration * 2));
      if (integration >= 2) {
        this.floatText('50%', '60%', '📺 The galaxy watches them go', { color: '#666', size: 13 });
      }
    },

    // liarExposed: tension — spotlight narrows, ⚡ crackle when the lie breaks
    liarExposed(name, integration) {
      integration = integration || 0;
      // narrowing spotlight: dark edges closing in
      this.spawn(
        '',
        'position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 10%, rgba(0,0,0,0.9) 70%);',
        'drama-liar-spot',
        2000
      );
      // crackle burst
      const c = { x: '50%', y: '40%' };
      this.spawn(
        `<div style="font-size:48px;text-shadow:0 0 20px #ffd54a;">⚡</div>`,
        'position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);',
        'drama-liar-crack',
        1200
      );
      this.spawn(
        `<div style="font-size:20px;font-weight:bold;color:#ffd54a;text-shadow:0 2px 8px rgba(0,0,0,0.9);">THE LIE BREAKS<br><span style="font-size:14px;font-weight:normal;color:#ccc;">${name} is exposed</span></div>`,
        'position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);text-align:center;',
        'drama-liar-text',
        2500
      );
      this.flash('rgba(255,213,74,0.15)', 400);
    },

    // reconcileGlow: warm healing — golden glow, hearts rise
    reconcileGlow(name, integration) {
      integration = integration || 0;
      this.spawn(
        '',
        'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(255,200,100,0.2) 0%, transparent 70%);',
        'drama-reconcile-glow',
        2500 + (integration * 300)
      );
      const hearts = 3 + integration; // 3 → 6 hearts
      for (let i = 0; i < hearts; i++) {
        const dx = (i - (hearts - 1) / 2) * 40;
        setTimeout(() => {
          this.spawn(
            `<div style="font-size:24px;">❤️</div>`,
            `position:absolute;left:calc(50% + ${dx}px);top:45%;transform:translate(-50%,-50%);`,
            'drama-heart-rise',
            1500
          );
        }, i * 200);
      }
      if (name) {
        this.floatText('50%', '35%', `${name} — forgiven`, { color: '#ff6b9d', size: 16 });
      }
    },

    // betraySlash: sharp red slash across the screen + gasp
    betraySlash(name, integration) {
      integration = integration || 0;
      // diagonal red slash
      this.spawn(
        `<svg width="400" height="100" viewBox="0 0 400 100"><line x1="20" y1="90" x2="380" y2="10" stroke="#c0392b" stroke-width="${6 + integration * 2}" stroke-linecap="round"/></svg>`,
        'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) rotate(-5deg);',
        'drama-betray-slash',
        800
      );
      this.spawn(
        `<div style="font-size:22px;font-weight:bold;color:#ff5252;text-shadow:0 2px 8px rgba(0,0,0,0.9);">BETRAYED<br><span style="font-size:14px;font-weight:normal;color:#ccc;">${name}</span></div>`,
        'position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);text-align:center;',
        'drama-betray-text',
        2500
      );
      this.flash('rgba(192,57,43,0.25)', 500);
      this.shake(8 + (integration * 2));
    },
    // playerDeath: the bearer falls. Slow fade to black, soul wisp rises.
    // The Oversight's tone is NOT Dark Souls bleak — the mantle passes, the
    // story continues. "THE STORY CONTINUES" lands as the black lifts.
    // Steve 2026-10-07: transitions drama (Round C2).
    playerDeath(x, y, name, cause, integration) {
      integration = integration || 0;
      // slow fade to black: in 1.5s, hold, out 1.5s — the game continues after
      this.spawn(
        '',
        'position:absolute;inset:0;background:#000;',
        'drama-deathfade',
        4200
      );
      // soul wisp rises from where they fell
      setTimeout(() => { this.soulWisp(x, y); }, 800);
      // the Oversight's epitaph — not bleak, the story continues
      setTimeout(() => {
        this.spawn(
          `<div style="text-align:center;">
             <div style="font-size:15px;color:#8a8a9a;letter-spacing:3px;margin-bottom:8px;">${(name || 'THE SCHOLAR').toUpperCase()} IS GONE</div>
             <div style="font-size:22px;font-weight:bold;color:#e8e8f0;letter-spacing:1px;">THE STORY CONTINUES</div>
             ${integration >= 2 ? '<div style="font-size:13px;color:#4df3ff;margin-top:10px;font-style:italic;">"Oh no. OH NO. The audience is standing. Somebody get the next one ready — the show goes ON."</div>' : ''}
           </div>`,
          'position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);',
          'drama-deathtext',
          2600
        );
      }, 1400);
    },

    // newLife: the mantle passes — bright emergence. A new scholar awakens.
    // Brighter and longer with integration: the System makes a show of it.
    // Steve 2026-10-07: transitions drama (Round C2).
    newLife(name, integration) {
      integration = integration || 0;
      // bright bloom: white-gold flash that settles
      this.flash('rgba(255,250,230,0.55)', 900 + (integration * 300));
      setTimeout(() => {
        this.spawn(
          `<div style="text-align:center;padding:22px 26px;background:rgba(12,14,10,0.94);border:2px solid #ffd54a;border-radius:12px;max-width:290px;">
             <div style="font-size:44px;margin-bottom:6px;">🌅</div>
             <div style="font-size:19px;font-weight:bold;color:#ffd54a;margin-bottom:4px;letter-spacing:2px;">A NEW SCHOLAR AWAKENS</div>
             <div style="font-size:15px;color:#e8e8f0;">${name || 'Someone'}</div>
             <div style="font-size:13px;color:#9a9aa8;margin-top:6px;font-style:italic;">The Codex turns a page. The mantle passes.</div>
             ${integration >= 3 ? '<div style="font-size:13px;color:#4df3ff;margin-top:8px;">⬢ "New face! Same job! We hardly noticed. (We noticed.)"</div>' : ''}
           </div>`,
          'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%) scale(0.85);',
          'drama-rebirth',
          2800 + (integration * 300)
        );
      }, 500);
    },

    // abilityLevelUp: golden burst + LEVEL UP + ability name at the player.
    // Steve 2026-10-07: transitions drama (Round C2).
    abilityLevelUp(x, y, abilityName, level, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const size = 90 + (integration * 25);
      this.spawn(
        `<svg width="${size}" height="${size}" viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" fill="none" stroke="#ffd54a" stroke-width="4" opacity="0.9"/><circle cx="40" cy="40" r="26" fill="none" stroke="#fff2b0" stroke-width="2" opacity="0.6"/></svg>`,
        `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
        'drama-levelup-ring',
        900 + (integration * 150)
      );
      this.spawn(
        `<div style="text-align:center;">
           <div style="font-size:20px;font-weight:bold;color:#ffd54a;letter-spacing:3px;text-shadow:0 2px 6px rgba(0,0,0,0.9);">LEVEL UP</div>
           <div style="font-size:15px;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,0.9);">${abilityName || ''} → L${level || ''}</div>
         </div>`,
        `position:absolute;left:${c.x}px;top:${c.y - 44}px;transform:translate(-50%,-100%);`,
        'drama-levelup-text',
        1600 + (integration * 200)
      );
      if (integration >= 3) {
        this.flash('rgba(255,213,74,0.12)', 400);
      }
    },

    // synergyShimmer: the pre-reveal — "something is happening." Fires on the
    // 2nd tease, before the hero card at unlock. Iridescent, brief, unmissable.
    // Steve 2026-10-07: transitions drama (Round C2).
    synergyShimmer(integration) {
      integration = integration || 0;
      const alpha = 0.10 + (integration * 0.05);
      this.spawn(
        '',
        `position:absolute;inset:0;background:linear-gradient(115deg, transparent 20%, rgba(199,146,234,${alpha}) 40%, rgba(77,243,255,${alpha}) 60%, transparent 80%);`,
        'drama-synshimmer',
        1200 + (integration * 200)
      );
      this.floatText('50%', '30%', 'something is happening…', { color: '#c792ea', size: 15 + integration });
    },

    // villageBirth: rare and soft — pink glow, a baby emoji, the System coos at L2+.
    // Steve 2026-10-07: transitions drama (Round C2). Births are gated to 270+ days.
    villageBirth(babyName, parentName, integration) {
      integration = integration || 0;
      this.spawn(
        '',
        'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(255,182,213,0.22) 0%, transparent 60%);',
        'drama-birthglow',
        2200 + (integration * 300)
      );
      this.spawn(
        `<div style="text-align:center;">
           <div style="font-size:42px;">👶</div>
           <div style="font-size:16px;font-weight:bold;color:#ffc4dd;text-shadow:0 2px 6px rgba(0,0,0,0.9);">${babyName || 'A child'}</div>
           <div style="font-size:13px;color:#d8d8e2;">born to ${parentName || 'the village'}</div>
           ${integration >= 2 ? '<div style="font-size:13px;color:#4df3ff;margin-top:8px;font-style:italic;">⬢ "A NEW VIEWER! ...a new person! We mean person! Welcome, tiny human!"</div>' : ''}
         </div>`,
        'position:absolute;left:50%;top:38%;transform:translate(-50%,-50%) scale(0.9);',
        'drama-birthcard',
        2600 + (integration * 300)
      );
    },

    // villageDeath: gray wisp rises, a bell tolls (visual pulse). Muted, respectful.
    // Steve 2026-10-07: transitions drama (Round C2).
    villageDeath(name, cause, integration) {
      integration = integration || 0;
      // gray wisp — the village dead are off-screen, this is memorial
      this.spawn(
        `<svg width="36" height="48" viewBox="0 0 30 40"><ellipse cx="15" cy="20" rx="10" ry="15" fill="rgba(160,160,175,0.6)"/></svg>`,
        'position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);',
        'drama-villagerwisp',
        1800 + (integration * 200)
      );
      this.spawn(
        `<div style="text-align:center;">
           <div style="font-size:34px;">🔔</div>
           <div style="font-size:15px;color:#b8b8c4;">${name || 'Someone'} — ${cause || 'gone'}</div>
           <div style="font-size:13px;color:#8a8a96;font-style:italic;">the village mourns</div>
         </div>`,
        'position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);',
        'drama-belltoll',
        2400 + (integration * 200)
      );
    },

    // _sigXY: resolve a tile center to pixel numbers for signature math.
    // tileCenter can return '50%' strings when the tile isn't in the DOM —
    // fall back to the overlay center so signature geometry never NaNs.
    _sigXY(x, y) {
      const c = this.tileCenter(x, y);
      const ov = this.ensureOverlay();
      const cx = (typeof c.x === 'number' && isFinite(c.x)) ? c.x : (ov.clientWidth || 390) / 2;
      const cy = (typeof c.y === 'number' && isFinite(c.y)) ? c.y : (ov.clientHeight || 400) / 2;
      return { cx, cy };
    },

    // abilitySignature: per-ability SIGNATURE visuals (Steve 2026-10-07, Drama D1).
    // The 10 most-used abilities get unique signatures; everything else gets a
    // pool-styled visual. All scale with integration:
    //   L1: minimal — one clean element. The System observes.
    //   L2: richer — extra elements, accents. The System participates.
    //   L3: spectacular — flash, sparkles, System eye. The System celebrates.
    abilitySignature(abilityId, x, y, color, pool, integration) {
      integration = integration || 0;
      color = color || '#4df3ff';
      const MAP = {
        triage: 'sigTriage',
        forage_identification: 'sigForageId',
        brawler_instinct: 'sigBrawler',
        patient_aim: 'sigPatientAim',
        silver_tongue: 'sigSilverTongue',
        diplomat: 'sigDiplomat',
        pathfinder: 'sigPathfinder',
        eagle_eye: 'sigEagleEye',
        lie_detector: 'sigLieDetector',
        game_sense: 'sigGameSense',
      };
      const m = MAP[abilityId];
      if (m && typeof this[m] === 'function') return this[m](x, y, color, integration);
      return this.poolSignature(pool, x, y, color, integration);
    },

    // poolSignature: pool-styled fallback for abilities without a unique signature.
    // Brawler: cracks + shockwave. Social: warm waves + bubble. Exploration:
    // compass ticks + trail sparkles. Investigation: magnifier pulse + clue
    // sparkles. System: rotating geometry + eye. Care/fieldcraft/craft: themed
    // bursts. Unknown: the standard abilityBurst.
    poolSignature(pool, x, y, color, integration) {
      integration = integration || 0;
      color = color || '#4df3ff';
      const { cx, cy } = this._sigXY(x, y);
      const n2 = integration >= 2, n3 = integration >= 3;
      if (pool === 'combat') {
        // ground cracks + shockwave
        for (let i = 0; i < (n3 ? 7 : 5); i++) {
          const ang = (i / (n3 ? 7 : 5)) * 360 + 12;
          this.spawn(
            `<div style="width:34px;height:3px;background:${color};border-radius:2px;box-shadow:0 0 6px ${color};"></div>`,
            `position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%) rotate(${ang}deg) translateX(26px);`,
            'drama-sig-pop', 550
          );
        }
        this.spawn(
          `<div style="width:90px;height:90px;border:3px solid ${color};border-radius:50%;"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;`,
          'drama-shockwave', 700
        );
        if (n2) this.shake(6);
      } else if (pool === 'social') {
        // warm radiating waves + speech bubble
        const waves = n3 ? 4 : 3;
        for (let i = 0; i < waves; i++) {
          this.spawn(
            `<div style="width:${50 + i * 26}px;height:${50 + i * 26}px;border:2px solid ${color};border-radius:50%;opacity:0.7;"></div>`,
            `position:absolute;left:${cx}px;top:${cy}px;`,
            'drama-sig-expand', 800 + i * 150
          );
        }
        this.spawn(
          `<div style="font-size:26px;">\uD83D\uDCAC</div>`,
          `position:absolute;left:${cx}px;top:${cy - 34}px;`,
          'drama-sig-pop', 900
        );
      } else if (pool === 'exploration') {
        // compass ticks + trail sparkles
        const dirs = ['N', 'E', 'S', 'W'];
        dirs.forEach((d, i) => {
          const ang = i * 90;
          this.spawn(
            `<div style="font-size:13px;font-weight:bold;color:${color};text-shadow:0 1px 4px rgba(0,0,0,0.8);">${d}</div>`,
            `position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%) rotate(${ang}deg) translateY(-30px) rotate(${-ang}deg);`,
            'drama-sig-pop', 800
          );
        });
        for (let i = 0; i < (n2 ? 4 : 2); i++) {
          this.spawn(
            `<div style="width:7px;height:7px;background:${color};border-radius:50%;box-shadow:0 0 6px ${color};"></div>`,
            `position:absolute;left:${cx - 24 + i * 14}px;top:${cy + 26}px;`,
            'drama-sparkle', 700 + i * 120
          );
        }
      } else if (pool === 'investigation') {
        // magnifier pulse + clue sparkles
        this.spawn(
          `<div style="width:64px;height:64px;border:3px solid ${color};border-radius:50%;"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;`,
          'drama-sig-expand', 750
        );
        this.spawn(
          `<div style="font-size:24px;">\uD83D\uDD0D</div>`,
          `position:absolute;left:${cx + 22}px;top:${cy - 22}px;`,
          'drama-sig-pop', 850
        );
        const clues = n2 ? 4 : 2;
        for (let i = 0; i < clues; i++) {
          const ang = (i / clues) * Math.PI * 2;
          this.spawn(
            `<div style="font-size:15px;color:${color};">\u2726</div>`,
            `position:absolute;left:${cx + Math.cos(ang) * 44}px;top:${cy + Math.sin(ang) * 44}px;`,
            'drama-sparkle', 700 + i * 100
          );
        }
      } else if (pool === 'system') {
        // rotating geometry + eye
        this.spawn(
          `<svg width="72" height="72" viewBox="0 0 72 72"><polygon points="36,6 66,60 6,60" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.9"/><circle cx="36" cy="42" r="8" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/></svg>`,
          `position:absolute;left:${cx}px;top:${cy}px;`,
          'drama-sig-spin', n3 ? 1600 : 1100
        );
        if (n3) this.spawn(
          `<div style="font-size:22px;">\uD83D\uDC41\uFE0F</div>`,
          `position:absolute;left:${cx}px;top:${cy - 52}px;`,
          'drama-sig-pop', 1200
        );
      } else if (pool === 'care') {
        // soft cross + healing wash
        this.spawn(
          `<div style="width:40px;height:12px;background:${color};border-radius:6px;box-shadow:0 0 12px ${color};"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;`,
          'drama-sig-bar', 800
        );
        this.spawn(
          `<div style="width:12px;height:40px;background:${color};border-radius:6px;box-shadow:0 0 12px ${color};"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;`,
          'drama-sig-bar', 950
        );
      } else if (pool === 'fieldcraft') {
        // leaf-ish sparkles
        for (let i = 0; i < (n2 ? 5 : 3); i++) {
          const ang = (i / (n2 ? 5 : 3)) * Math.PI * 2;
          this.spawn(
            `<div style="width:9px;height:9px;background:${color};border-radius:50% 0;box-shadow:0 0 6px ${color};"></div>`,
            `position:absolute;left:${cx + Math.cos(ang) * 30}px;top:${cy + Math.sin(ang) * 30}px;`,
            'drama-sparkle', 700 + i * 100
          );
        }
      } else if (pool === 'craft') {
        // hammer sparks
        for (let i = 0; i < (n2 ? 6 : 4); i++) {
          const ang = (i / (n2 ? 6 : 4)) * Math.PI * 2 + 0.4;
          this.spawn(
            `<div style="width:6px;height:6px;background:${color};box-shadow:0 0 8px ${color};"></div>`,
            `position:absolute;left:${cx + Math.cos(ang) * 34}px;top:${cy + Math.sin(ang) * 34}px;`,
            'drama-sparkle', 650 + i * 90
          );
        }
      } else {
        return this.abilityBurst(x, y, color, integration);
      }
      if (n3) this.flash('rgba(255,255,255,0.08)', 250);
    },

    // sigTriage: the healer's cross assembles — two green bars snap together,
    // then a soft healing wash. L2+: pulsing halo. L3: white flash.
    sigTriage(x, y, color, integration) {
      integration = integration || 0;
      color = '#7cfc9a';
      const { cx, cy } = this._sigXY(x, y);
      this.spawn(
        `<div style="width:52px;height:14px;background:${color};border-radius:7px;box-shadow:0 0 14px ${color};"></div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-bar', 850
      );
      this.spawn(
        `<div style="width:14px;height:52px;background:${color};border-radius:7px;box-shadow:0 0 14px ${color};"></div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-bar', 1000
      );
      this.spawn(
        `<div style="width:110px;height:110px;background:radial-gradient(circle, rgba(124,252,154,0.35) 0%, rgba(124,252,154,0) 70%);border-radius:50%;"></div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-expand', 1100
      );
      if (integration >= 2) this.spawn(
        `<div style="width:70px;height:70px;border:2px solid ${color};border-radius:50%;"></div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-expand', 1300
      );
      if (integration >= 3) this.flash('rgba(124,252,154,0.15)', 350);
    },

    // sigForageId: a leaf unfurls — rotating in with green-gold sparkles.
    // L2+: a second leaf. L3: golden flash.
    sigForageId(x, y, color, integration) {
      integration = integration || 0;
      color = '#7cfc9a';
      const { cx, cy } = this._sigXY(x, y);
      this.spawn(
        `<svg width="56" height="56" viewBox="0 0 56 56"><path d="M28 4 C44 16 46 36 28 52 C10 36 12 16 28 4 Z" fill="rgba(124,252,154,0.85)" stroke="#2d7a3f" stroke-width="2"/><line x1="28" y1="8" x2="28" y2="48" stroke="#2d7a3f" stroke-width="1.5"/></svg>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-pop', 900
      );
      for (let i = 0; i < (integration >= 2 ? 5 : 3); i++) {
        const ang = (i / (integration >= 2 ? 5 : 3)) * Math.PI * 2 + 0.5;
        this.spawn(
          `<div style="width:8px;height:8px;background:${i % 2 ? '#ffd54a' : color};border-radius:50% 0;box-shadow:0 0 6px ${color};"></div>`,
          `position:absolute;left:${cx + Math.cos(ang) * 36}px;top:${cy + Math.sin(ang) * 36}px;`,
          'drama-sparkle', 750 + i * 100
        );
      }
      if (integration >= 3) this.flash('rgba(255,213,74,0.12)', 300);
    },

    // sigBrawler: impact — ground cracks radiate from the fist point.
    // L2+: screen shake. L3: bigger shake + flash.
    sigBrawler(x, y, color, integration) {
      integration = integration || 0;
      color = '#ff5252';
      const { cx, cy } = this._sigXY(x, y);
      this.spawn(
        `<div style="font-size:34px;">\uD83D\uDCAA</div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-pop', 700
      );
      const cracks = integration >= 3 ? 8 : 6;
      for (let i = 0; i < cracks; i++) {
        const ang = (i / cracks) * 360 + 8;
        this.spawn(
          `<div style="width:30px;height:3px;background:${color};border-radius:2px;box-shadow:0 0 8px ${color};"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%) rotate(${ang}deg) translateX(30px);`,
          'drama-sig-pop', 650 + (i % 3) * 80
        );
      }
      this.spawn(
        `<div style="width:100px;height:100px;border:3px solid ${color};border-radius:50%;"></div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-shockwave', 700
      );
      if (integration >= 2) this.shake(integration >= 3 ? 10 : 6);
      if (integration >= 3) this.flash('rgba(255,82,82,0.12)', 300);
    },

    // sigPatientAim: crosshair ticks converge on the point — the shot is lined up.
    // L3: gold ticks.
    sigPatientAim(x, y, color, integration) {
      integration = integration || 0;
      color = integration >= 3 ? '#ffd54a' : '#ff5252';
      const { cx, cy } = this._sigXY(x, y);
      const far = 46, near = 18;
      const ticks = [
        { x0: 0, y0: -far, x1: 0, y1: -near, w: '3px', h: '14px' },
        { x0: 0, y0: far, x1: 0, y1: near, w: '3px', h: '14px' },
        { x0: -far, y0: 0, x1: -near, y1: 0, w: '14px', h: '3px' },
        { x0: far, y0: 0, x1: near, y1: 0, w: '14px', h: '3px' },
      ];
      ticks.forEach((t, i) => {
        this.spawn(
          `<div style="width:${t.w};height:${t.h};background:${color};border-radius:2px;box-shadow:0 0 8px ${color};--tx0:${t.x0}px;--ty0:${t.y0}px;--tx1:${t.x1}px;--ty1:${t.y1}px;"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;`,
          'drama-sig-tick', 800 + i * 60
        );
      });
      this.spawn(
        `<div style="width:8px;height:8px;background:${color};border-radius:50%;box-shadow:0 0 10px ${color};"></div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-pop', 950
      );
    },

    // sigSilverTongue: golden speech waves radiate outward + a speech bubble pops.
    sigSilverTongue(x, y, color, integration) {
      integration = integration || 0;
      color = '#ffd54a';
      const { cx, cy } = this._sigXY(x, y);
      const waves = integration >= 2 ? 4 : 3;
      for (let i = 0; i < waves; i++) {
        this.spawn(
          `<div style="width:${56 + i * 30}px;height:${56 + i * 30}px;border:2px solid ${color};border-radius:50%;opacity:0.75;"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;`,
          'drama-sig-expand', 850 + i * 160
        );
      }
      this.spawn(
        `<div style="font-size:28px;">\uD83D\uDCAC</div>`,
        `position:absolute;left:${cx}px;top:${cy - 40}px;`,
        'drama-sig-pop', 1000
      );
      if (integration >= 3) this.flash('rgba(255,213,74,0.1)', 300);
    },

    // sigDiplomat: two arcs sweep in from the sides and meet — the bridge is built.
    sigDiplomat(x, y, color, integration) {
      integration = integration || 0;
      color = '#ff6b9d';
      const { cx, cy } = this._sigXY(x, y);
      this.spawn(
        `<div style="width:44px;height:44px;border:3px solid ${color};border-right-color:transparent;border-bottom-color:transparent;border-radius:50%;"></div>`,
        `position:absolute;left:${cx - 30}px;top:${cy}px;`,
        'drama-sig-pop', 800
      );
      this.spawn(
        `<div style="width:44px;height:44px;border:3px solid ${color};border-left-color:transparent;border-top-color:transparent;border-radius:50%;"></div>`,
        `position:absolute;left:${cx + 30}px;top:${cy}px;`,
        'drama-sig-pop', 900
      );
      this.spawn(
        `<div style="font-size:26px;">\uD83E\uDD1D</div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-pop', 1050
      );
      if (integration >= 2) this.flash('rgba(255,107,157,0.1)', 350);
    },

    // sigPathfinder: a compass rose spins in — N/E/S/W lock on, then a sparkle
    // trail marks the way forward.
    sigPathfinder(x, y, color, integration) {
      integration = integration || 0;
      color = '#4df3ff';
      const { cx, cy } = this._sigXY(x, y);
      this.spawn(
        `<svg width="84" height="84" viewBox="0 0 84 84"><g stroke="${color}" stroke-width="2.5" opacity="0.9"><line x1="42" y1="6" x2="42" y2="20"/><line x1="42" y1="64" x2="42" y2="78"/><line x1="6" y1="42" x2="20" y2="42"/><line x1="64" y1="42" x2="78" y2="42"/></g><circle cx="42" cy="42" r="26" fill="none" stroke="${color}" stroke-width="2" opacity="0.7"/><polygon points="42,22 47,42 42,62 37,42" fill="${color}" opacity="0.85"/></svg>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-spin', integration >= 3 ? 1800 : 1200
      );
      const trail = integration >= 2 ? 4 : 3;
      for (let i = 0; i < trail; i++) {
        this.spawn(
          `<div style="width:7px;height:7px;background:${color};border-radius:50%;box-shadow:0 0 6px ${color};"></div>`,
          `position:absolute;left:${cx - 30 + i * 18}px;top:${cy + 34}px;`,
          'drama-sparkle', 700 + i * 130
        );
      }
    },

    // sigEagleEye: the eye opens — ellipse + pupil scale in, then sight rays
    // extend to the horizon.
    sigEagleEye(x, y, color, integration) {
      integration = integration || 0;
      color = '#4df3ff';
      const { cx, cy } = this._sigXY(x, y);
      this.spawn(
        `<svg width="76" height="44" viewBox="0 0 76 44"><ellipse cx="38" cy="22" rx="34" ry="18" fill="rgba(77,243,255,0.15)" stroke="${color}" stroke-width="2.5"/><circle cx="38" cy="22" r="10" fill="${color}" opacity="0.9"/><circle cx="38" cy="22" r="4" fill="#0a0f0a"/></svg>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-pop', 950
      );
      const rays = integration >= 2 ? 6 : 4;
      for (let i = 0; i < rays; i++) {
        const ang = (i / rays) * 360;
        this.spawn(
          `<div style="width:26px;height:2px;background:${color};box-shadow:0 0 8px ${color};"></div>`,
          `position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%) rotate(${ang}deg) translateX(48px);`,
          'drama-sig-pop', 750 + (i % 3) * 90
        );
      }
      if (integration >= 3) this.flash('rgba(77,243,255,0.1)', 300);
    },

    // sigLieDetector: the magnifier sweeps — a ring pulses out while "?" clue
    // marks pop around the point. L2+: extra clue sparkles.
    sigLieDetector(x, y, color, integration) {
      integration = integration || 0;
      color = '#c792ea';
      const { cx, cy } = this._sigXY(x, y);
      this.spawn(
        `<div style="width:60px;height:60px;border:3px solid ${color};border-radius:50%;"></div>`,
        `position:absolute;left:${cx}px;top:${cy}px;`,
        'drama-sig-expand', 800
      );
      this.spawn(
        `<div style="font-size:26px;">\uD83D\uDD0D</div>`,
        `position:absolute;left:${cx + 24}px;top:${cy - 24}px;`,
        'drama-sig-pop', 900
      );
      const clues = integration >= 2 ? 4 : 3;
      for (let i = 0; i < clues; i++) {
        const ang = (i / clues) * Math.PI * 2 + 0.7;
        this.spawn(
          `<div style="font-size:17px;font-weight:bold;color:${color};text-shadow:0 1px 4px rgba(0,0,0,0.8);">?</div>`,
          `position:absolute;left:${cx + Math.cos(ang) * 46}px;top:${cy + Math.sin(ang) * 46}px;`,
          'drama-sig-pop', 700 + i * 110
        );
      }
    },

    // sigGameSense: paw prints appear in a trail — something was here, and now
    // you know what and how long ago.
    sigGameSense(x, y, color, integration) {
      integration = integration || 0;
      color = '#7cfc9a';
      const { cx, cy } = this._sigXY(x, y);
      const prints = integration >= 2 ? 4 : 3;
      for (let i = 0; i < prints; i++) {
        this.spawn(
          `<div style="font-size:${20 - i * 2}px;opacity:${1 - i * 0.2};">\uD83D\uDC3E</div>`,
          `position:absolute;left:${cx - 28 + i * 22}px;top:${cy + 18 - i * 8}px;`,
          'drama-sig-pop', 700 + i * 160
        );
      }
      if (integration >= 3) this.spawn(
        `<div style="font-size:15px;color:${color};font-style:italic;text-shadow:0 1px 4px rgba(0,0,0,0.8);">sign read</div>`,
        `position:absolute;left:${cx}px;top:${cy + 44}px;`,
        'drama-float', 1100
      );
    },

    // plantIdentified: a leaf unfurls, the name blooms. Learning you can see.
    // Steve 2026-10-07: knowledge drama (Round D2). Green is the color of knowing what's edible.
    plantIdentified(x, y, plantName, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const size = 54 + (integration * 12);
      this.spawn(
        `<svg width="${size}" height="${size}" viewBox="0 0 50 50"><path d="M25 45 C25 30 25 20 25 8 M25 30 C15 28 8 20 6 10 C18 12 24 18 25 30 Z M25 30 C35 28 42 20 44 10 C32 12 26 18 25 30 Z" fill="rgba(124,252,154,0.9)" stroke="#2d7a3f" stroke-width="1.5"/></svg>`,
        `position:absolute;left:${c.x - size / 2}px;top:${c.y - size / 2}px;`,
        'drama-leafunfurl',
        1400 + (integration * 200)
      );
      this.floatText(x, y, `\u{1F33F} ${plantName || 'identified'}`, { color: '#7cfc9a', size: 16 + (integration * 2) });
      // L3: the System celebrates your learning.
      if (integration >= 3) this.flash('rgba(124,252,154,0.12)', 400);
    },

    // techniqueLearned: a scroll unrolls, the name lands in gold.
    // Steve 2026-10-07: knowledge drama (Round D2).
    techniqueLearned(x, y, techName, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const size = 40 + (integration * 8);
      this.spawn(
        `<div style="font-size:${size}px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.8));">\u{1F4DC}</div>`,
        `position:absolute;left:${c.x}px;top:${c.y - 10}px;transform:translate(-50%,-50%);`,
        'drama-scroll',
        1500 + (integration * 200)
      );
      this.floatText(x, y, `\u26A1 ${(techName || 'technique').replace(/_/g, ' ')}`, { color: '#ffd54a', size: 16 + (integration * 2) });
      if (integration >= 2) this.systemCommentary(`"${(techName || 'technique').replace(/_/g, ' ')} — filed under things that keep you alive."`, { integration });
    },

    // codexLinked: the book opens. Pages flip. A village's knowledge is yours now.
    // Steve 2026-10-07: knowledge drama (Round D2). This is the big one — linking a codex.
    codexLinked(villageName, integration) {
      integration = integration || 0;
      this.spawn(
        `<div style="text-align:center;padding:22px;background:rgba(12,14,8,0.94);border:2px solid #d4a017;border-radius:10px;max-width:280px;">
           <div style="font-size:44px;margin-bottom:6px;">\u{1F4D6}</div>
           <div style="font-size:18px;font-weight:bold;color:#ffd54a;margin-bottom:4px;">CODEX LINKED</div>
           <div style="font-size:14px;color:#ccc;line-height:1.4;">${villageName || 'A village'} shares its knowledge.</div>
           ${integration >= 3 ? '<div style="font-size:13px;color:#4df3ff;margin-top:8px;font-style:italic;">\u2B22 "Another shelf in the library of staying alive."</div>' : ''}
         </div>`,
        'position:absolute;left:50%;top:38%;transform:translate(-50%,-50%) scale(0.85);',
        'drama-codexcard',
        2400 + (integration * 300)
      );
      // page-flip shimmer across the screen
      this.spawn(
        '',
        'position:absolute;inset:0;background:linear-gradient(100deg, transparent 30%, rgba(212,160,23,0.18) 45%, rgba(212,160,23,0.18) 55%, transparent 70%);',
        'drama-pageflip',
        1200 + (integration * 200)
      );
      this.flash('rgba(212,160,23,0.10)', 500);
    },

    // skillGained: a shaft of rising light, the skill's name ascending.
    // Steve 2026-10-07: knowledge drama (Round D2).
    skillGained(x, y, skillName, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const w = 44 + (integration * 10);
      const h = 110 + (integration * 20);
      this.spawn(
        `<svg width="${w}" height="${h}" viewBox="0 0 44 110"><rect x="14" y="0" width="16" height="110" fill="url(#skillgrad)" opacity="0.85"/><defs><linearGradient id="skillgrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#4df3ff" stop-opacity="0.1"/><stop offset="100%" stop-color="#4df3ff" stop-opacity="0.9"/></linearGradient></defs></svg>`,
        `position:absolute;left:${c.x - w / 2}px;top:${c.y - h + 20}px;`,
        'drama-skillbeam',
        1300 + (integration * 200)
      );
      this.floatText(x, y, `\u{1F4D6} ${(skillName || 'skill').replace(/_/g, ' ')}`, { color: '#4df3ff', size: 15 + (integration * 2) });
      if (integration >= 3) this.flash('rgba(77,243,255,0.10)', 400);
    },

    // teaseFaint: the 1st synergy tease — barely there. A whisper, not a shimmer.
    // Steve 2026-10-07: knowledge drama (Round D2). Round C2 added the 2nd-tease shimmer;
    // the 1st tease gets something fainter so the escalation reads: whisper -> shimmer -> hero card.
    teaseFaint(integration) {
      integration = integration || 0;
      this.spawn(
        '',
        'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(199,146,234,0.07) 0%, transparent 55%);',
        'drama-faintshimmer',
        900 + (integration * 150)
      );
    },

    // ahaMoment: the lightbulb. Radiating lines. The click of understanding.
    // Steve 2026-10-07: knowledge drama (Round D2). Fires on knowledge->ability unlocks.
    ahaMoment(x, y, integration) {
      integration = integration || 0;
      const c = this.tileCenter(x, y);
      const size = 64 + (integration * 14);
      this.spawn(
        `<div style="position:relative;width:${size}px;height:${size}px;">
           <svg width="${size}" height="${size}" viewBox="0 0 64 64">
             <g stroke="#ffd54a" stroke-width="2.5" opacity="0.9">
               <line x1="32" y1="2" x2="32" y2="10"/><line x1="32" y1="54" x2="32" y2="62"/>
               <line x1="2" y1="32" x2="10" y2="32"/><line x1="54" y1="32" x2="62" y2="32"/>
               <line x1="11" y1="11" x2="16" y2="16"/><line x1="48" y1="48" x2="53" y2="53"/>
               <line x1="53" y1="11" x2="48" y2="16"/><line x1="16" y1="48" x2="11" y2="53"/>
             </g>
           </svg>
           <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:${28 + integration * 4}px;">\u{1F4A1}</div>
         </div>`,
        `position:absolute;left:${c.x - size / 2}px;top:${c.y - size / 2 - 14}px;`,
        'drama-aha',
        1600 + (integration * 200)
      );
      if (integration >= 2) this.systemCommentary('"Oh. OH. That\'s how it works."', { integration });
    },

    // audioFor(kind, arg): AUDIO-VISUAL SYNC mate lookup (Steve 2026-10-07,
    // Drama E1). Returns the Game.audio voice for a drama kind, or null when
    // the moment stays quiet. game.js calls this once per drama visual so
    // audio mates fire centrally — call sites never fire both. (arg is the
    // drama's first arg, reserved for per-instance mates; unused for now.)
    audioFor(kind, arg) {
      return DRAMA_AUDIO_MATES[kind] || null;
    },
  };

  S.Drama = Drama;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Inject drama CSS (GPU-composited animations only: transform, opacity)
(function() {
  if (document.getElementById('drama-css')) return;
  const style = document.createElement('style');
  style.id = 'drama-css';
  style.textContent = `
    .drama-overlay { pointer-events: none !important; }
    .drama-hit { opacity: 0; transform: scale(0.3) rotate(0deg); transition: all 0.4s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-hit.drama-hit { opacity: 1; transform: scale(1.2) rotate(45deg); }
    .drama-float { opacity: 0; transition: all 0.8s ease-out; }
    .drama-float.drama-float { opacity: 1; transform: translate(-50%, -120%); }
    .drama-flash { opacity: 0; transition: opacity 0.3s ease-out; }
    .drama-flash.drama-flash { opacity: 1; }
    .drama-hero { opacity: 0; transition: all 0.5s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-hero.drama-hero { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-wisp { opacity: 0; transition: all 1.2s ease-out; }
    .drama-wisp.drama-wisp { opacity: 1; transform: translateY(-60px); }
    .drama-exclaim { opacity: 0; transform: translate(-50%, -80%); transition: all 0.3s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-exclaim.drama-exclaim { opacity: 1; transform: translate(-50%, -100%); animation: drama-bob 1s ease-in-out infinite; }
    @keyframes drama-bob { 0%, 100% { margin-top: 0; } 50% { margin-top: -6px; } }
    .drama-burst { opacity: 0; transform: scale(0.5); transition: all 0.5s ease-out; }
    .drama-burst.drama-burst { opacity: 1; transform: scale(1.3); }
    .drama-contest { opacity: 0; transform: translate(-50%, -30%); transition: all 0.6s ease-out; }
    .drama-contest.drama-contest { opacity: 1; transform: translate(-50%, -50%); }
    .drama-vignette { opacity: 0; transition: opacity 0.5s ease-out; }
    .drama-vignette.drama-vignette { opacity: 1; }
    .drama-ambushmark { opacity: 0; transform: translate(-50%, -80%); transition: all 0.3s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-ambushmark.drama-ambushmark { opacity: 1; transform: translate(-50%, -100%); animation: drama-bob 0.6s ease-in-out infinite; }
    .drama-ripple { opacity: 0; transform: scale(0.6); transition: all 0.6s ease-out; }
    .drama-ripple.drama-ripple { opacity: 1; transform: scale(1.2); }
    .drama-rain { opacity: 0; transition: opacity 0.8s ease-out; }
    .drama-rain.drama-rain { opacity: 1; animation: drama-rainfall 1s linear infinite; }
    @keyframes drama-rainfall { 0% { transform: translateY(-10px); } 100% { transform: translateY(10px); } }
    .drama-trail { opacity: 0; transition: opacity 1s ease-out; }
    .drama-trail.drama-trail { opacity: 1; }
    .drama-contest-announce { opacity: 0; transition: all 0.5s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-contest-announce.drama-contest-announce { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-cheer { opacity: 0; transition: all 1.2s ease-out; }
    .drama-cheer.drama-cheer { opacity: 1; transform: translateY(120px) rotate(180deg); }
    .drama-boo { opacity: 0; transform: scale(0.5); transition: all 0.4s ease-out; }
    .drama-boo.drama-boo { opacity: 1; transform: scale(1.2); }
    .drama-judge-dim { opacity: 0; transition: opacity 0.6s ease-out; }
    .drama-judge-dim.drama-judge-dim { opacity: 1; }
    .drama-judge-text { opacity: 0; transform: translate(-50%, -70%); transition: all 0.8s ease-out; }
    .drama-judge-text.drama-judge-text { opacity: 1; transform: translate(-50%, -50%); }
    .drama-confetti { opacity: 1; transition: all 1.8s cubic-bezier(0.2, 0.6, 0.4, 1); }
    .drama-confetti.drama-confetti { opacity: 0.3; transform: translateY(400px) rotate(720deg); }
    .drama-loser-dim { opacity: 0; transition: opacity 0.8s ease-out; }
    .drama-loser-dim.drama-loser-dim { opacity: 1; }
    /* Social scenario spectacle (Steve 2026-10-07, Drama C1) — all GPU transform/opacity */
    .drama-moot-glow { opacity: 0; transition: opacity 1s ease-out; }
    .drama-moot-glow.drama-moot-glow { opacity: 1; animation: drama-fireflicker 0.8s ease-in-out infinite; }
    @keyframes drama-fireflicker { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
    .drama-moot-banner { opacity: 0; transform: translate(-50%, -30%); transition: all 0.6s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-moot-banner.drama-moot-banner { opacity: 1; transform: translate(-50%, -50%); }
    .drama-vote { opacity: 0; transform: translate(-50%, -40%) scale(0.9); transition: all 0.5s ease-out; }
    .drama-vote.drama-vote { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-exile-vignette { opacity: 0; transition: opacity 1.2s ease-out; }
    .drama-exile-vignette.drama-exile-vignette { opacity: 1; }
    .drama-exile-banner { opacity: 0; transform: translate(-50%, -50%) scale(0.8); transition: all 0.8s cubic-bezier(0.2, 1, 0.3, 1); }
    .drama-exile-banner.drama-exile-banner { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-liar-spot { opacity: 0; transition: opacity 0.8s ease-out; }
    .drama-liar-spot.drama-liar-spot { opacity: 1; }
    .drama-liar-crack { opacity: 0; transform: translate(-50%, -50%) scale(0.3); transition: all 0.3s cubic-bezier(0.2, 1.6, 0.4, 1); }
    .drama-liar-crack.drama-liar-crack { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
    .drama-liar-text { opacity: 0; transform: translate(-50%, -30%); transition: all 0.6s ease-out; }
    .drama-liar-text.drama-liar-text { opacity: 1; transform: translate(-50%, -50%); }
    .drama-reconcile-glow { opacity: 0; transition: opacity 1.2s ease-out; }
    .drama-reconcile-glow.drama-reconcile-glow { opacity: 1; }
    .drama-heart-rise { opacity: 0; transform: translate(-50%, -30%); transition: all 1.5s ease-out; }
    .drama-heart-rise.drama-heart-rise { opacity: 1; transform: translate(-50%, -150%); }
    .drama-betray-slash { opacity: 0; transform: translate(-50%, -50%) rotate(-5deg) scaleX(0); transition: all 0.4s cubic-bezier(0.3, 1.4, 0.4, 1); }
    .drama-betray-slash.drama-betray-slash { opacity: 1; transform: translate(-50%, -50%) rotate(-5deg) scaleX(1); }
    .drama-betray-text { opacity: 0; transform: translate(-50%, -30%); transition: all 0.5s ease-out; }
    .drama-betray-text.drama-betray-text { opacity: 1; transform: translate(-50%, -50%); }
    /* Social scenario spectacle (Steve 2026-10-07, Drama C1) — all GPU transform/opacity */
    .drama-moot-glow { opacity: 0; transition: opacity 1s ease-out; }
    .drama-moot-glow.drama-moot-glow { opacity: 1; animation: drama-fireflicker 0.8s ease-in-out infinite; }
    @keyframes drama-fireflicker { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
    .drama-moot-banner { opacity: 0; transform: translate(-50%, -30%); transition: all 0.6s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-moot-banner.drama-moot-banner { opacity: 1; transform: translate(-50%, -50%); }
    .drama-vote { opacity: 0; transform: translate(-50%, -40%) scale(0.9); transition: all 0.5s ease-out; }
    .drama-vote.drama-vote { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-exile-vignette { opacity: 0; transition: opacity 1.2s ease-out; }
    .drama-exile-vignette.drama-exile-vignette { opacity: 1; }
    .drama-exile-banner { opacity: 0; transform: translate(-50%, -50%) scale(0.8); transition: all 0.8s cubic-bezier(0.2, 1, 0.3, 1); }
    .drama-exile-banner.drama-exile-banner { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-liar-spot { opacity: 0; transition: opacity 0.8s ease-out; }
    .drama-liar-spot.drama-liar-spot { opacity: 1; }
    .drama-liar-crack { opacity: 0; transform: translate(-50%, -50%) scale(0.3); transition: all 0.3s cubic-bezier(0.2, 1.6, 0.4, 1); }
    .drama-liar-crack.drama-liar-crack { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
    .drama-liar-text { opacity: 0; transform: translate(-50%, -30%); transition: all 0.6s ease-out; }
    .drama-liar-text.drama-liar-text { opacity: 1; transform: translate(-50%, -50%); }
    .drama-reconcile-glow { opacity: 0; transition: opacity 1.2s ease-out; }
    .drama-reconcile-glow.drama-reconcile-glow { opacity: 1; }
    .drama-heart-rise { opacity: 0; transform: translate(-50%, -30%); transition: all 1.5s ease-out; }
    .drama-heart-rise.drama-heart-rise { opacity: 1; transform: translate(-50%, -150%); }
    .drama-betray-slash { opacity: 0; transform: translate(-50%, -50%) rotate(-5deg) scaleX(0); transition: all 0.4s cubic-bezier(0.3, 1.4, 0.4, 1); }
    .drama-betray-slash.drama-betray-slash { opacity: 1; transform: translate(-50%, -50%) rotate(-5deg) scaleX(1); }
    .drama-betray-text { opacity: 0; transform: translate(-50%, -30%); transition: all 0.5s ease-out; }
    .drama-betray-text.drama-betray-text { opacity: 1; transform: translate(-50%, -50%); }
    .drama-loser-heart { opacity: 0; transform: translate(-50%, -30%) scale(0.6); transition: all 1s ease-out; }
    .drama-loser-heart.drama-loser-heart { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-phase { opacity: 0; transform: scale(0.8) rotate(-4deg); transition: all 0.5s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-phase.drama-phase { opacity: 1; transform: scale(1.15) rotate(0deg); }
    .drama-enrage { opacity: 0; transform: scale(0.6); transition: all 0.6s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-enrage.drama-enrage { opacity: 1; transform: scale(1.2); animation: drama-enrage-pulse 0.8s ease-in-out infinite; }
    @keyframes drama-enrage-pulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.5); } }
    .drama-sparkle { opacity: 0; transform: translate(-50%, -50%) scale(0.2) rotate(0deg); transition: all 0.9s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-sparkle.drama-sparkle { opacity: 1; transform: translate(-50%, -80%) scale(1.2) rotate(180deg); }
    .drama-vignette-red { opacity: 0; transition: opacity 0.4s ease-out; }
    .drama-vignette-red.drama-vignette-red { opacity: 1; }
    .drama-afterimage { opacity: 0; transition: all 0.6s ease-out; }
    .drama-afterimage.drama-afterimage { opacity: 0.6; transform: translate(-30%, -50%); }
    .drama-shockwave { opacity: 0; transform: scale(0.3); transition: all 0.7s cubic-bezier(0.1, 0.6, 0.3, 1); }
    .drama-shockwave.drama-shockwave { opacity: 0.9; transform: scale(1.35); }
    .drama-commentary { opacity: 0; transition: all 1.4s ease-out; }
    .drama-commentary.drama-commentary { opacity: 1; transform: translate(-50%, -130%); }
    .drama-deathfade { opacity: 0; animation: drama-deathfade-anim 4.2s ease-in-out forwards; }
    @keyframes drama-deathfade-anim { 0% { opacity: 0; } 35% { opacity: 0.92; } 70% { opacity: 0.92; } 100% { opacity: 0; } }
    .drama-deathtext { opacity: 0; transition: opacity 1.2s ease-out; }
    .drama-deathtext.drama-deathtext { opacity: 1; }
    .drama-rebirth { opacity: 0; transform: translate(-50%, -50%) scale(0.85); transition: all 0.7s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-rebirth.drama-rebirth { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-levelup-ring { opacity: 0; transform: scale(0.4); transition: all 0.7s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-levelup-ring.drama-levelup-ring { opacity: 1; transform: scale(1.25); }
    .drama-levelup-text { opacity: 0; transition: all 1.2s ease-out; }
    .drama-levelup-text.drama-levelup-text { opacity: 1; transform: translate(-50%, -130%); }
    .drama-synshimmer { opacity: 0; transition: opacity 0.4s ease-out; }
    .drama-synshimmer.drama-synshimmer { opacity: 1; animation: drama-shimmer-sweep 1.2s ease-in-out infinite; }
    @keyframes drama-shimmer-sweep { 0%, 100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(40deg); } }
    .drama-birthglow { opacity: 0; transition: opacity 1s ease-out; }
    .drama-birthglow.drama-birthglow { opacity: 1; animation: drama-birth-pulse 2s ease-in-out infinite; }
    @keyframes drama-birth-pulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }
    .drama-birthcard { opacity: 0; transform: translate(-50%, -50%) scale(0.9); transition: all 0.6s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-birthcard.drama-birthcard { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .drama-villagerwisp { opacity: 0; transition: all 1.8s ease-out; }
    .drama-villagerwisp.drama-villagerwisp { opacity: 1; transform: translate(-50%, -120%); }
    .drama-belltoll { opacity: 0; transform: translate(-50%, -50%) scale(0.9); transition: all 0.8s ease-out; }
    .drama-belltoll.drama-belltoll { opacity: 1; transform: translate(-50%, -50%) scale(1); animation: drama-bell-sway 1.6s ease-in-out infinite; }
    @keyframes drama-bell-sway { 0%, 100% { margin-left: 0; } 25% { margin-left: -4px; } 75% { margin-left: 4px; } }
    .drama-sig-pop { opacity: 0; transform: translate(-50%, -50%) scale(0.3); transition: all 0.45s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-sig-pop.drama-sig-pop { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
    .drama-sig-expand { opacity: 0; transform: translate(-50%, -50%) scale(0.5); transition: all 0.9s ease-out; }
    .drama-sig-expand.drama-sig-expand { opacity: 0.8; transform: translate(-50%, -50%) scale(1.7); }
    .drama-sig-spin { opacity: 0; transition: opacity 0.4s ease-out; }
    .drama-sig-spin.drama-sig-spin { opacity: 1; animation: drama-sig-rotate 2.2s linear infinite; }
    @keyframes drama-sig-rotate { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
    .drama-sig-tick { opacity: 0; transform: translate(var(--tx0, 0px), var(--ty0, 0px)); transition: all 0.55s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-sig-tick.drama-sig-tick { opacity: 1; transform: translate(var(--tx1, 0px), var(--ty1, 0px)); }
    .drama-sig-bar { opacity: 0; transform: translate(-50%, -50%) scale(0.2); transition: all 0.4s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-sig-bar.drama-sig-bar { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    /* Knowledge drama (Steve 2026-10-07, Drama D2) — all GPU transform/opacity */
    .drama-leafunfurl { opacity: 0; transform: scale(0.3) rotate(-30deg); transition: all 0.7s cubic-bezier(0.2, 1.4, 0.4, 1); }
    .drama-leafunfurl.drama-leafunfurl { opacity: 1; transform: scale(1.15) rotate(8deg); }
    .drama-scroll { opacity: 0; transform: translate(-50%,-50%) scaleX(0.2); transition: all 0.6s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-scroll.drama-scroll { opacity: 1; transform: translate(-50%,-50%) scaleX(1); }
    .drama-codexcard { opacity: 0; transform: translate(-50%,-50%) scale(0.85); transition: all 0.6s cubic-bezier(0.2, 1.2, 0.4, 1); }
    .drama-codexcard.drama-codexcard { opacity: 1; transform: translate(-50%,-50%) scale(1); }
    .drama-pageflip { opacity: 0; transition: opacity 0.5s ease-out; }
    .drama-pageflip.drama-pageflip { opacity: 1; animation: drama-pageflip-sweep 1.2s ease-in-out infinite; }
    @keyframes drama-pageflip-sweep { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.4); } }
    .drama-skillbeam { opacity: 0; transform: translateY(20px); transition: all 0.8s ease-out; }
    .drama-skillbeam.drama-skillbeam { opacity: 1; transform: translateY(-30px); }
    .drama-faintshimmer { opacity: 0; transition: opacity 0.6s ease-out; }
    .drama-faintshimmer.drama-faintshimmer { opacity: 1; }
    .drama-aha { opacity: 0; transform: scale(0.4); transition: all 0.5s cubic-bezier(0.2, 1.6, 0.4, 1); }
    .drama-aha.drama-aha { opacity: 1; transform: scale(1.1); animation: drama-aha-glow 0.8s ease-in-out infinite; }
    @keyframes drama-aha-glow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
    .drama-shake { animation: drama-shake-anim 0.4s ease-out; }
    @keyframes drama-shake-anim {
      0%, 100% { transform: translate(0, 0); }
      20% { transform: translate(calc(var(--shake-intensity) * -1), calc(var(--shake-intensity) * 0.5)); }
      40% { transform: translate(var(--shake-intensity), calc(var(--shake-intensity) * -0.5)); }
      60% { transform: translate(calc(var(--shake-intensity) * -0.5), var(--shake-intensity)); }
      80% { transform: translate(calc(var(--shake-intensity) * 0.5), calc(var(--shake-intensity) * -1)); }
    }
  `;
  document.head.appendChild(style);
})();
