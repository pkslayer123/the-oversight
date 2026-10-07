// @ontology
// system: drama
// description: Drama overlay — loosely-bound animation layer for emphasis.
// provides:
//   - ensureOverlay: creates the .drama-overlay div over the grid
//   - hit: impact starburst at grid coords (tile center, but free-floating)
//   - floatText: damage numbers / labels that drift up and fade
//   - flash: full-screen color pulse for big moments
//   - shake: screen shake (transform on grid container, GPU-cheap)
//   - heroCard: centered high-res moment card (synergy, integration)
//   - soulWisp: death wisp floats up from tile
//   - exclaim: !/? above NPCs who want attention (Steve 2026-10-07)
//   - npcAlert: semantic NPC attention marker — talk/curious/dialogue/warn/heart/break (Steve 2026-10-07, Drama A1)
//   - abilityBurst: radial pulse on ability use, color by pool
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
    // Steve 2026-10-07: scales with integration — bigger, more dramatic
    hit(x, y, opts) {
      opts = opts || {};
      const c = this.tileCenter(x, y);
      const color = opts.color || '#ffd54a';
      const integ = opts.integration || 0;
      const size = (opts.size || 60) + (integ * 15); // 60 → 105
      this.spawn(
        `<svg width="${size}" height="${size}" viewBox="0 0 60 60"><g fill="${color}"><polygon points="30,0 35,20 55,15 40,30 55,45 35,40 30,60 25,40 5,45 20,30 5,15 25,20"/></g></svg>`,
        `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
        'drama-hit',
        400
      );
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
    exclaim(x, y, icon, opts) {
      opts = opts || {};
      const c = this.tileCenter(x, y);
      const color = icon === '!' ? '#ff5252' : icon === '?' ? '#ffd54a' : '#4df3ff';
      this.spawn(
        `<div style="font-size:28px;font-weight:bold;color:${color};text-shadow:0 2px 6px rgba(0,0,0,0.9);">${icon}</div>`,
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
      this.spawn(
        `<div style="font-size:${size}px;font-weight:bold;color:${k.color};text-shadow:0 2px 6px rgba(0,0,0,0.9);">${k.icon}</div>`,
        `position:absolute;left:${c.x}px;top:${c.y - 30}px;transform:translate(-50%,-100%);`,
        'drama-exclaim',
        opts.duration || ((kind === 'heart' || kind === 'break') ? 2000 : 1500)
      );
    },

    // abilityBurst: radial pulse when an ability fires (color by pool)
    // Steve 2026-10-07: scales with system integration — L0 subtle, L3 spectacle
    abilityBurst(x, y, color, integration) {
      const c = this.tileCenter(x, y);
      color = color || '#4df3ff';
      integration = integration || 0;
      // Scale: size and rings grow with integration
      const size = 80 + (integration * 20); // 80 → 140
      const rings = integration >= 2 ? 2 : 1;
      const ringsSvg = rings === 2
        ? `<circle cx="40" cy="40" r="35" fill="none" stroke="${color}" stroke-width="3" opacity="0.8"/><circle cx="40" cy="40" r="25" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"/>`
        : `<circle cx="40" cy="40" r="35" fill="none" stroke="${color}" stroke-width="3" opacity="0.8"/>`;
      this.spawn(
        `<svg width="${size}" height="${size}" viewBox="0 0 80 80">${ringsSvg}</svg>`,
        `position:absolute;left:${c.x - size/2}px;top:${c.y - size/2}px;`,
        'drama-burst',
        500 + (integration * 100)
      );
      // L3: the System acknowledges the action
      if (integration >= 3) {
        this.flash(color.replace(')', ',0.1)').replace('#', 'rgba(').replace(/([0-9a-f]{2})/gi, m => parseInt(m, 16) + ','), 300);
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
