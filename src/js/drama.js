// @ontology
// system: drama
// description: Drama overlay — loosely-bound animation layer for emphasis.
// provides:
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
//   - socialFlash: dispatcher for social scenario spectacle (Steve 2026-10-07, Drama C1)
//   - mootGather: village gathers — fire pulse + banner (Steve 2026-10-07, Drama C1)
//   - mootVote: vote tally bar with visual weight (Steve 2026-10-07, Drama C1)
//   - exileMoment: dark vignette + EXILED banner (Steve 2026-10-07, Drama C1)
//   - liarExposed: narrowing spotlight + ⚡ crackle (Steve 2026-10-07, Drama C1)
//   - reconcileGlow: warm glow + rising hearts (Steve 2026-10-07, Drama C1)
//   - betraySlash: red slash + BETRAYED banner (Steve 2026-10-07, Drama C1)
// rules:
//   - Overlay is pointer-events:none — never blocks input (code: drama.js).
//   - All animations use transform/opacity only — GPU-composited, no layout/paint (code: drama.js).
//   - Elements self-remove after animation — no DOM bloat (code: drama.js).
//   - Coordinates are loosely bound: tile centers for anchored effects, screen-relative for full moments (code: drama.js).
// consumes: (none)
(function (global) {
  'use strict';
  const S = global.Scattering = global.Scattering || {};

  const Drama = {
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
      const c = this.tileCenter(x, y);
      const color = opts.color || '#fff';
      const size = opts.size || 18;
      this.spawn(
        text,
        `position:absolute;left:${c.x}px;top:${c.y}px;transform:translate(-50%,-50%);color:${color};font-size:${size}px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
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
        this.floatText(c.x, c.y - 30, label, { color: color, size: 14 + integration * 2 });
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
      this.floatText(c.x, c.y - 35, '💢', { color: '#ff5252', size: 28 + integration * 6 });
      const tname = { enraged: 'ENRAGED', cunning: 'CUNNING', desperate: 'DESPERATE' }[temper] || 'ENRAGED';
      this.floatText(c.x, c.y + 30, tname, { color: '#ff6b6b', size: 13 + integration * 2 });
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
      const c = this.tileCenter(x, y);
      this.floatText(c.x, c.y - 25, 'CRIT!', { color: '#ffeb3b', size: 24 + integration * 6 });
      this.floatText(c.x, c.y + 20, String(dmg), { color: '#ffffff', size: 18 + integration * 4 });
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
      this.floatText(c.x, c.y - 20, 'MISS', { color: '#b0c4de', size: 16 + integration * 2 });
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
