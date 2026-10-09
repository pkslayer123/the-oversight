// @ontology
// system: ui
// description: Renders all screens from game state. Mobile-first PWA UI. Grid, D-pad, action bars, sheets, status.
// provides:
//   - expeditionScreen()
//   - statusBars(st)
//   - lowerMenuHTML(st)
//   - renderInvInline(slot, view)
//   - invSheet()
//   - combatActionsHTML(st)
//   - modNotice(), modNoted(), modMute(), modViolation(), modRemoval(), modShadow(), modDown() (Moderator audio suite)
// rules:
//   - mobile_breakpoint: 899px (code: CSS media queries)
//   - grid_size: 9x9 (code: renderDetail)
//   - one_screen_rule: moment-to-moment play never scrolls (code: CSS)
//   - lower_menu: Pack/Sleep/Wait/Map below status (code: lowerMenuHTML)
//   - moderator_audio: every mod* audioEvent fired by game.js resolves in Game.audio (code: Game.audio registry)
// consumes:
//   - Game.state
//   - Game.status()
// The Oversight — slice 1: "Seven Days" playable.
// Screens: title → onboarding → game (map/day loop) → combat → codex → ending.
(function () {
  'use strict';
  const S = window.Scattering;
  const Game = S.Game;
  const screen = document.getElementById('screen');
  const toastEl = document.getElementById('toast');

  // ITEM SPRITES (Steve 2026-10-06): every item renders its unique SVG.
  // Knowledge-gated: unknown (lumped) items show the generic parcel.
  // Plant-derived items use the plant sprite at full depth when known.

  // HUMANOID SPRITES (Steve 2026-10-06): wave-2 human-like horrors render
  // their calm SVG on the grid — and villagers render generated portraits.
  // Some villagers echo the humanoids' silhouettes, so at grid-glance you
  // do a double-take: "is that a villager or is that one of THEM?"
  const HUMANOID_SPRITE_IDS = new Set(['landlord', 'heckler', 'paparazzo', 'union_rep', 'understudy', 'moderator', 'warranty_caller']);
  function humanoidSpriteHtml(mid) {
    try {
      if (!mid || !HUMANOID_SPRITE_IDS.has(mid)) return '';
      const svg = S.Sprites && S.Sprites.monsterSprite(mid, false);
      return svg ? `<span class="csprite">${svg}</span>` : '';
    } catch (e) { return ''; }
  }
  // MONSTER SPRITE HELPER (Steve 2026-10-06): get SVG for monster, fallback to emoji.
  function monsterSpriteHtml(mid, aggro) {
    try {
      if (mid && S.Sprites && S.Sprites.monsterSprite) {
        const svg = S.Sprites.monsterSprite(mid, aggro);
        if (svg) return `<span class="msprite">${svg}</span>`;
      }
    } catch (e) {}
    return '';
  }
    function villagerSpriteHtml(vp) {
    try {
      if (!vp || !S.Sprites || !S.Sprites.villagerSprite) return '';
      const svg = S.Sprites.villagerSprite(vp);
      return svg ? `<span class="vsprite">${svg}</span>` : '';
    } catch (e) { return ''; }
  }
  function itemSpriteHtml(it) {
    try {
      const Sp = S.Sprites;
      if (!Sp || !it) return '';
      // Plant-derived food: plant sprite, depth 2 if known, 1 if examined, else 0.
      const pid = it.plantId;
      if (pid && !String(pid).startsWith('meat_')) {
        const known = Game.plantKnown ? Game.plantKnown(pid) : false;
        let depth = 0;
        try {
          const Ex = (typeof Scattering !== 'undefined' && Scattering.Examine) || null;
          depth = Ex && Ex.plantVisualDepth ? Ex.plantVisualDepth(pid) : (known ? 2 : 0);
        } catch (e) { depth = known ? 2 : 0; }
        const svg = Sp.plantSprite(pid, depth, 'plant');
        return svg ? `<span class="itemsprite">${svg}</span>` : '';
      }
      // Manufactured/found items: item sprite, gated on lump.
      const known = !it.lump;
      const svg = Sp.itemSprite(it.id || it.itemId, known);
      return svg ? `<span class="itemsprite">${svg}</span>` : '';
    } catch (e) { return ''; }
  }
  // Exposed for betrayal.js trade UI.
  S.itemSpriteHtml = itemSpriteHtml;

  // FIRST-CONTACT MONSTER FLASH (Steve 2026-10-05): freaky pixelated rendition
  // flashes on the HUD on first encounter (after System online). Horror beyond emoji.
  // Renders the monster emoji to a tiny canvas, scales up with pixelation, then
  // glitches: RGB split, slice displacement, scanlines, flicker. Auto-dismisses.
  window.__monsterFlash = function (monsterId, emoji) {
    // Don't stack flashes.
    if (document.getElementById('mflash')) return;
    const overlay = document.createElement('div');
    overlay.id = 'mflash';
    overlay.innerHTML = '<canvas id="mflash-cv"></canvas><div class="mflash-scan"></div>';
    document.body.appendChild(overlay);
    const cv = document.getElementById('mflash-cv');
    const ctx = cv.getContext('2d');
    // Low-res source for pixelation.
    const SRC = 32;
    cv.width = SRC; cv.height = SRC;
    ctx.font = '28px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji || '👹', SRC / 2, SRC / 2 + 2);
    // Display canvas scaled up with pixelation via CSS.
    cv.style.width = 'min(70vw, 280px)';
    cv.style.height = 'min(70vw, 280px)';
    // Glitch loop: ~1.4s of horror.
    const start = performance.now();
    const DUR = 1400;
    // Audio sting: use existing combat/horror sound if available.
    try { if (Game.audio && Game.audio.horrorSting) Game.audio.horrorSting(); } catch (e) {}
    function frame(now) {
      const t = now - start;
      if (t >= DUR) {
        overlay.classList.add('mflash-out');
        setTimeout(() => overlay.remove(), 300);
        return;
      }
      // Flicker: random opacity dips.
      overlay.style.opacity = Math.random() < 0.12 ? '0.3' : '1';
      // Slice displacement: draw horizontal slices offset randomly.
      ctx.clearRect(0, 0, SRC, SRC);
      ctx.font = '28px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const slices = 6;
      for (let i = 0; i < slices; i++) {
        const sy = (SRC / slices) * i;
        const off = Math.random() < 0.4 ? (Math.random() - 0.5) * 8 : 0;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, sy, SRC, SRC / slices); ctx.clip();
        ctx.fillText(emoji || '👹', SRC / 2 + off, SRC / 2 + 2);
        ctx.restore();
      }
      // RGB split: occasional chromatic aberration via shadow.
      if (Math.random() < 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#ff0040'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 2;
        ctx.fillText(emoji || '👹', SRC / 2, SRC / 2 + 2);
        ctx.shadowColor = '#00ffff'; ctx.shadowOffsetX = -2;
        ctx.fillText(emoji || '👹', SRC / 2, SRC / 2 + 2);
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), 2400);
  }
  function bar(left, right) {
    return `<div class="term-bar"><span>${left}</span><span>${right}</span></div>`;
  }
  // dayTickBar: the action clock, visible. Every small thing you do fills it a little.
  // 512 ticks = the day's full budget. Subtle — a thin line under the day header.
  function dayTickBar(st) {
    const t = Math.max(0, Math.min(st.dayTicksMax || 512, st.dayTicks || 0));
    const pct = Math.round(100 * t / (st.dayTicksMax || 512));
    const left = (st.dayTicksMax || 512) - t;
    return `<div class="dayticks" title="The day's budget: ${t} of ${st.dayTicksMax || 512} used. Everything you do costs a little of the day."><div class="dayticks-fill" style="width:${pct}%"></div><span class="dayticks-lbl">${left} left today</span></div>`;
  }
  // SUN/MOON DIAL: your sense of time, made visible. Micro ticks move the marker.
  // Pre-System: hand-drawn, rough, personal — your character's own time-sense.
  // Post-System: the System "upgraded" it. Precise. Digital. Alien. Exact.
  // Marker orbit: dawn left, midday top, dusk right, midnight bottom.
  function dialHTML(st) {
    const sys = !!st.systemArrived;
    const p = Math.max(0, Math.min(1, st.dayProgress || 0));
    const ang = (180 + p * 360) * Math.PI / 180;
    const cx = 22, cy = 22, r = 14;
    const mx = (cx + r * Math.cos(ang)).toFixed(1);
    const my = (cy + r * Math.sin(ang)).toFixed(1);
    const ticksLeft = Math.max(0, Math.round((st.dayTicksMax || 512) - (st.dayTicks || 0)));
    const glitch = st.dialGlitch ? ' dial-glitch' : '';
    if (!sys) {
      return `<span class="sundial pre${glitch}" title="Your sense of the day — rough, but yours."><svg viewBox="0 0 44 44" width="38" height="38">`
        + `<circle cx="22" cy="22" r="14" fill="none" stroke="#8a7a5a" stroke-width="1.8" stroke-dasharray="3.2 2.2" opacity="0.95"/>`
        + `<text x="22" y="12" text-anchor="middle" font-size="10">☀️</text>`
        + `<text x="22" y="39" text-anchor="middle" font-size="10">🌙</text>`
        + `<circle cx="${mx}" cy="${my}" r="3.2" fill="#d8c98a" opacity="0.95"/></svg></span>`;
    }
    const partTicks = [0, 0.25, 0.5, 0.75].map(pp => {
      const a = (180 + pp * 360) * Math.PI / 180;
      const x1 = (cx + 10.5 * Math.cos(a)).toFixed(1), y1 = (cy + 10.5 * Math.sin(a)).toFixed(1);
      const x2 = (cx + 14 * Math.cos(a)).toFixed(1), y2 = (cy + 14 * Math.sin(a)).toFixed(1);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4df3ff" stroke-width="1.5"/>`;
    }).join('');
    return `<span class="sundial post${glitch}" title="SYSTEM CHRONOMETER — exact. ${ticksLeft} ticks to dawn."><svg viewBox="0 0 44 44" width="38" height="38">`
      + `<circle cx="22" cy="22" r="14" fill="rgba(77,243,255,.07)" stroke="#4df3ff" stroke-width="1.3"/>`
      + `<circle cx="22" cy="22" r="10" fill="none" stroke="#4df3ff" stroke-width="0.6" opacity="0.55"/>`
      + partTicks
      + `<text x="22" y="10.5" text-anchor="middle" font-size="7" fill="#4df3ff" opacity=".85">☀</text>`
      + `<text x="22" y="37.5" text-anchor="middle" font-size="7" fill="#4df3ff" opacity=".85">☾</text>`
      + `<circle cx="${mx}" cy="${my}" r="2.8" fill="#4df3ff"/>`
      + `<text x="22" y="25.5" text-anchor="middle" font-size="8.5" fill="#4df3ff" font-family="monospace">${ticksLeft}</text></svg></span>`;
  }
  function esc(s) { return String(s).replace(/</g, '&lt;'); }

  // ---------- shared ----------
  function statRow(label, val, pct, low, cls, clickable) {
    const clickAttr = clickable ? ` data-statclick="${clickable}" style="cursor:pointer"` : '';
    return `<div class="stat"${clickAttr}><div class="lbl"><span>${label}</span><span>${val}</span></div><div class="bar${low ? ' low' : ''}${cls ? ' ' + cls : ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`;
  }
  // combatStripHTML: glanceable combat awareness above the grid. When steel
  // is out, the top of the screen tells you who's in the fight and — most
  // importantly — the telegraph cue. (highbeam: restored minimal version)
  function combatStripHTML(st) {
    const tf = Game.tbfight;
    if (!tf) return '';
    const mons = tf.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
    const names = mons.map(m => {
      const mid = m.mdef ? m.mdef.id : m.monsterId;
      const label = Game.monsterDisplayName ? Game.monsterDisplayName(mid) : m.name;
      // PHASE BADGE (Steve): unearned specialness is stripped. The badge only
      // shows once the codex knows the pattern — discovered, not announced.
      const known = Game.encTelegraphKnown ? Game.encTelegraphKnown(m) : false;
      const phase = (known && Game.encPhaseBadge) ? Game.encPhaseBadge(m) : '';
      // INFO LEAK FIX (Steve): the ⚠ warning marker is gated behind codex
      // knowledge, just like the phase badge. First encounter: no warning
      // symbols — just beam visuals + audio dread.
      const _mspr1 = monsterSpriteHtml(m.id || m.monsterId, true);
      return `${_mspr1 || (m.emoji || '👹')} ${esc(label)}${(m.telegraph && known) ? ' ⚠' : ''}${phase}`;
    }).join(' · ') || '⚔ COMBAT';
    const tg = mons.find(m => m.telegraph);
    // INFO LEAK FIX (Steve): the telegraph cue line is gated behind codex
    // knowledge. First encounter shows no cue text — the beam itself is the warning.
    const tgKnown = tg && Game.encTelegraphKnown ? Game.encTelegraphKnown(tg) : false;
    return `<div class="ord-combatstrip"><div class="combatstrip">` +
      `<div class="cs-row"><span>⚔ ${names}</span></div>` +
      (tgKnown ? `<div class="cs-telegraph">⚠ ${esc(Game.tbTelegraphCue ? Game.tbTelegraphCue(tg) : 'incoming!')}</div>` : '') +
      `</div></div>`;
  }
  function statusBars(st) {
    const feastTag = st.feastState === 'gorged' ? ' ⚡⚡ GORGED' : st.feastState === 'feasting' ? ' ⚡ feasting' : '';
    // THE BANK: one pool. The FOOD bar IS the reserve — cap grows with bank
    // skillsets; the bar glows gold past the "fed" line (banked war chest).
    const cap = st.kcalCap || 2400;
    const banked = st.banked || 0;
    const foodVal = Math.round(st.kcal) + '/' + cap + ' kcal' + (banked > 0 ? ` (+${banked} banked)` : '') + feastTag;
    // PENDING CONTEST (Steve 2026-10-05): visible countdown so player knows what's coming
    let contestRow = '';
    try {
      const pc = Game.state && Game.state.pendingContest;
      if (pc) {
        const daysLeft = Math.max(0, (pc.firesDay || 1) - (Game.state.scholar.day || 1));
        // MULTI-TAKE (Steve 2026-10-06): show everyone taken, not just the
        // first — the countdown is the dread.
        let who;
        try {
          const ids = (pc.participants && pc.participants.length) ? pc.participants : [pc.participant];
          who = ids.map(id => id === 'player' ? 'YOU' : (Game.displayName ? Game.displayName(id) : id)).join(' + ');
        } catch (e) {
          who = pc.participant === 'player' ? 'YOU' : (pc.participant || 'someone');
        }
        // Show the contest's display name, not the raw id ("gauntlet" -> "Gauntlet").
        const cname = (typeof Game.contestPool === 'function'
          ? (Game.contestPool().find(c => c.id === pc.contestId) || {}).name
          : null) || pc.contestId || 'unknown';
        contestRow = `<div class="statrow contest-pending">📺 CONTEST: ${esc(cname)} — ${who} in ${daysLeft}d</div>`;
      }
    } catch (e) {}
    return statRow('HEALTH', st.health, st.health, st.health < 35) +
      statRow('FOOD (you)', foodVal, st.kcal / cap * 100, st.kcal < 500, banked > 0 ? 'banked' : '') +
      statRow('PACK 🎒', st.invKcal + ' kcal · ' + st.packKg + '/' + st.packCap + ' kg', st.packKg / st.packCap * 100, st.packKg >= st.packCap, '', 'pack') +
      statRow('WATER', st.hydration + '% · ' + st.waterCleanL + 'L clean', st.hydration, st.hydration < 30) +
      (Game.state && Game.state.systemArrived ? statRow('SYSTEM', st.integration + '% integrated', st.integration, false) : '') +
      contestRow + afflictionRow(st);
  }

  // DISEASE (Steve 2026-10-09): affliction chips — symptoms until diagnosed,
  // true names after. Tap 🧬 You for the full picture.
  function afflictionRow(st) {
    try {
      const affs = st.afflictions || [];
      if (!affs.length) return '';
      const chips = affs.map(a =>
        `<span class="affchip" title="${esc(a.diagnosed ? a.label + ' (diagnosed)' : 'Undiagnosed — examine (🧬 You) to identify')}">${a.icon ? esc(a.icon) + ' ' : ''}${esc(a.label)}${a.severe ? '!' : ''}</span>`
      ).join(' ');
      return `<div class="statrow afflictions">${chips}</div>`;
    } catch (e) { return ''; }
  }

  // LOWER MENU (Steve 2026-10-05): Pack, Sleep, Wait, Map — the slow actions.
  // Not in the moment-to-moment action row; they live below with status.
  // This frees the main action area for combat.
  function lowerMenuHTML(st) {
    if (st.inCombat || Game.state.over) return '';
    const sleepDot = st.energy < 30 ? '<span class="dot"></span>'
      : (st.isNight ? '<span class="dot soft"></span>' : '');
    return `<div class="lowermenu">` +
      `<button class="lm-btn" data-lm="pack">🎒 Pack</button>` +
      `<button class="lm-btn" data-lm="character">🧬 You</button>` +
      `<button class="lm-btn" data-lm="sleep">😴 Sleep${sleepDot}</button>` +
      `<button class="lm-btn" data-lm="wait">⏳ Wait</button>` +
      `<button class="lm-btn" data-lm="map">🗺️ Map</button>` +
      `</div>`;
  }

  function wireLowerMenu() {
    document.querySelectorAll('[data-lm]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.lm;
        try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
        if (a === 'pack') { invSheet(); }
        else if (a === 'character') { characterSheet(); }
        else if (a === 'sleep') { Game.sleep(); rerender(); }
        else if (a === 'wait') { Game.doAction('wait'); rerender(); }
        else if (a === 'map') {
          const compass = document.getElementById('compass');
          if (compass) compass.click();
        }
      };
    });
  }

  // ---------- title ----------
  function fmtWhen(ts) {
    if (!ts) return 'unknown';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  // Save list: name, character, day, location, last played. Load or delete (two-tap confirm).
  function renderSaves(el) {
    // STALE-VERSION HONESTY (break-it persistence 2026-10-09): saves from an
    // older version can't load, but hiding them pretends the expedition never
    // existed. Render them greyed with an honest line instead — Delete only.
    const saves = Game.listSaves({ includeStale: true });
    if (!saves.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<p class="small" style="margin:18px 0 6px;opacity:.7">SAVED EXPEDITIONS</p>` + saves.map(sv => {
      if (sv.stale) {
        const name = sv.runName || `Expedition · ${sv.villagerName || 'unknown'}`;
        return `<div class="card" style="text-align:left;opacity:.55">
        <h3 style="margin:0 0 4px">${esc(name)}</h3>
        <p class="small" style="margin:0 0 8px">from an older version of the game — it can't be loaded. Delete it to clear the slot.</p>
        <button class="btn sm ghost" data-del="${esc(sv.key)}">Delete</button>
      </div>`;
      }
      const name = sv.runName || `Expedition · ${sv.villagerName || 'unknown'}`;
      const sub = [sv.villagerName, 'Day ' + (sv.day || 1), sv.location].filter(Boolean).join(' · ');
      return `<div class="card" style="text-align:left">
        <h3 style="margin:0 0 4px">${esc(name)}</h3>
        <p class="small" style="margin:0 0 2px">${esc(sub)}</p>
        <p class="small" style="margin:0 0 8px;opacity:.6">last played ${fmtWhen(sv.lastPlayed)}</p>
        <button class="btn sm" data-load="${esc(sv.key)}">Continue</button>
        <button class="btn sm ghost" data-del="${esc(sv.key)}">Delete</button>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      if (Game.load(b.dataset.load)) expeditionScreen();
      else {
        // LOAD HONESTY (break-it persistence 2026-10-08): a save that can't load
        // (corrupt, version-mismatched, or deleted in another tab) must say so —
        // the old code silently did nothing on tap.
        toast('That expedition could not be loaded. It has been removed from the list.');
        renderSaves(el);
      }
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (b.dataset.armed) {
        Game.deleteSave(b.dataset.del);
        renderSaves(el);
        toast('Expedition deleted.');
      } else {
        b.dataset.armed = '1';
        b.textContent = 'Tap again to delete';
        setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'Delete'; } }, 3000);
      }
    });
  }

  // SHARE: native share sheet on mobile, clipboard fallback on desktop.
  // Used by the title screen button and the persistent in-game footer link.
  function shareGame() {
    const url = 'https://pkslayer123.github.io/the-oversight/';
    const text = "I'm surviving The Oversight — a roguelite survival game where aliens forgot to give us food. Think you can last a week?";
    if (navigator.share) {
      navigator.share({ title: 'The Oversight', text, url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url)
        .then(() => toast('Link copied — send it to someone who can survive.'))
        .catch(() => toast(url));
    } else {
      toast(url);
    }
  }

  function title() {
    screen.innerHTML = `
      ${bar('scattering://village', 'day 0')}
      <div class="ascii">      .-""-.
     / .--. \\
    | (    ) |
     \\ '--' /
      '--'--'</div>
      <h1 class="title">THE OVERSIGHT</h1>
      <div class="subtitle">a system-apocalypse survival roguelite<br>hunger is the final boss</div>
      <button class="btn" id="b-new">New Expedition</button>
      ${Game.hasSave() ? '<div id="saves"></div>' : ''}
      <button class="btn ghost" id="b-codex0">Codex</button>
      ${(Game.state && Game.state.telemetry && Game.state.telemetry.length) ? '<button class="btn ghost" id="b-tel">📊 Telemetry</button>' : ''}
      <button class="btn ghost" id="b-about">About</button>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn ghost" id="b-share" style="flex:1;margin:10px 0">📤 Share</button>
        <button class="btn ghost" id="b-install" style="flex:1;margin:10px 0;display:none">📲 Install</button>
      </div>
      <p class="small" id="install-hint" style="display:none;opacity:.7"></p>
      <p class="small" style="margin-top:20px">slice 1: open expeditions. forage · eat · drink · bring it home.</p>
      <p class="small" style="opacity:.45;margin-top:14px"><span id="build-tag" style="cursor:pointer" title="tap to check for updates">build ${esc(window.BUILD_VERSION || 'dev')}</span> <span id="b-debug" style="cursor:pointer;opacity:.35;font-size:11px" title="toggle debug tools">🐞</span> <span id="b-sound" style="cursor:pointer;opacity:.5;font-size:11px" title="toggle sound">🔊</span></p>`;
    document.getElementById('b-new').onclick = () => obColdOpen();
    const savesDiv = document.getElementById('saves');
    if (savesDiv) renderSaves(savesDiv);
    document.getElementById('b-codex0').onclick = () => { toast('The Codex is empty. For now.'); };
    const bt = document.getElementById('b-tel');
    if (bt) bt.onclick = () => telemetryScreen();
    document.getElementById('b-about').onclick = about;
    // SHARE: native share sheet on mobile, clipboard fallback on desktop.
    document.getElementById('b-share').onclick = shareGame;
    // INSTALL: prompt on Android/Chrome, instructions on iOS.
    // Don't nag: hidden if already installed or previously dismissed.
    (function wireInstall() {
      const btn = document.getElementById('b-install');
      const hint = document.getElementById('install-hint');
      if (!btn) return;
      const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      if (isStandalone || window.navigator.standalone) return; // already installed
      let dismissed = false;
      try { dismissed = localStorage.getItem('oversight-install-dismissed') === '1'; } catch (e) {}
      if (dismissed) return;
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const showBtn = (label, onTap) => {
        btn.style.display = '';
        btn.textContent = label;
        btn.onclick = onTap;
      };
      const dismiss = () => {
        try { localStorage.setItem('oversight-install-dismissed', '1'); } catch (e) {}
        btn.style.display = 'none';
        if (hint) hint.style.display = 'none';
      };
      if (window.__deferredInstallPrompt) {
        // Android/Chrome: we caught beforeinstallprompt — real install flow.
        showBtn('📲 Install', () => {
          const p = window.__deferredInstallPrompt;
          window.__deferredInstallPrompt = null;
          if (p && p.prompt) p.prompt();
          dismiss();
        });
      } else if (isIOS) {
        // iOS: no beforeinstallprompt — show the manual steps once.
        showBtn('📲 Install', () => {
          if (hint) {
            hint.style.display = '';
            hint.innerHTML = 'On iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>. <a href="#" id="install-dx" style="color:inherit">dismiss</a>';
            const dx = document.getElementById('install-dx');
            if (dx) dx.onclick = (e) => { e.preventDefault(); dismiss(); };
          }
        });
      }
      // else: desktop Chrome will get beforeinstallprompt on a later visit;
      // nothing to show right now.
    })();
    // Build tag: tap to force an update check (diagnostic + escape hatch).
    // Uses the version.json flow — works with or without service workers.
    const btag = document.getElementById('build-tag');
    if (btag) {
      btag.onclick = () => {
        btag.textContent = 'checking for updates…';
        const up = window.__oversightUpdate;
        if (!up) { btag.textContent = 'updater not ready — reload the page'; return; }
        up.check().then(has => {
          btag.textContent = has ? 'update ready — tap the banner above ↑'
            : 'build ' + (window.BUILD_VERSION || 'dev') + ' (latest)';
        }).catch(() => { btag.textContent = 'update check failed — reload the page'; });
      };
    }
    // 🐞 debug toggle: subtle, next to the build tag. Tap to enable the
    // floating debug button (spawn monsters, combat, day 7, abilities…).
    const bdbg = document.getElementById('b-debug');
    if (bdbg) {
      if (DEBUG) bdbg.style.opacity = '1';
      bdbg.onclick = () => { toggleDebug(); };
    }
    // 🔊 sound toggle: mutes the Web Audio terror system. Persists.
    const bsnd = document.getElementById('b-sound');
    if (bsnd && Game.audio) {
      const paintSnd = () => { bsnd.textContent = Game.audio.isMuted() ? '🔇' : '🔊'; };
      paintSnd();
      bsnd.onclick = () => { try { Game.audio.toggleMute(); } catch (e) {} paintSnd(); };
    }
  }
  function about() {
    screen.innerHTML = `${bar('scattering://about', 'v0.1')}
      <h1 class="title" style="font-size:22px">ABOUT</h1>
      <p class="small">The sky changed. You woke up somewhere else. All wiring and combustibles are gone — the Burn took them.</p>
      <p class="small">Keep yourself fed for seven days. The village is counting on you.</p>
      <button class="btn ghost" id="b-back">Back</button>`;
    document.getElementById('b-back').onclick = title;
  }

  // ---------- onboarding ----------
  let ob = {};
  function obColdOpen() {
    screen.innerHTML = `${bar('scattering://wake', '...')}
      <div style="margin:60px 0 30px;min-height:120px" id="ob-lines"></div>
      <button class="btn ghost" id="b-c1">...</button>`;
    const lines = [
      'You wake up with dirt in your mouth and blood on your hands that isn\'t yours.',
      'The sky is the wrong color — not sunset-wrong, wound-wrong.',
      'That was yesterday. This is now.'
    ];
    const el = document.getElementById('ob-lines');
    let i = 0;
    document.getElementById('b-c1').onclick = () => {
      if (i < lines.length) { el.innerHTML += `<p class="term-line">${lines[i++]}</p>`; }
      if (i >= lines.length) obHome();
    };
  }
  function obHome() {
    // WHERE ARE YOU FROM? Visual picker — tap a place. No typing.
    // Still stores the same origin string downstream (parseOrigin handles it).
    // What you know grows where you're from. It doesn't grow here.
    const picker = Game.data.originPicker || { regions: [] };
    const allOrigins = [];
    for (const r of picker.regions) for (const o of r.origins) allOrigins.push({ ...o, region: r.name });

    const render = (filter) => {
      const f = (filter || '').toLowerCase();
      const shown = f ? allOrigins.filter(o => o.label.toLowerCase().includes(f) || o.region.toLowerCase().includes(f)) : allOrigins;
      const byRegion = {};
      for (const o of shown) { (byRegion[o.region] = byRegion[o.region] || []).push(o); }
      let html = '';
      for (const r of picker.regions) {
        const list = byRegion[r.name];
        if (!list || !list.length) continue;
        html += `<h3 class="small" style="opacity:.7;margin:14px 0 6px">${esc(r.name).toUpperCase()}</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">`;
        for (const o of list) {
          html += `<button class="btn ghost origin-pick" data-origin="${esc(o.label)}" style="padding:14px 10px;font-size:15px;text-align:left"><span style="font-size:20px">${o.flag}</span> ${esc(o.label)}</button>`;
        }
        html += '</div>';
      }
      if (!html) html = '<p class="small" style="opacity:.6">No matches. Try another search.</p>';
      document.getElementById('origin-list').innerHTML = html;
      document.querySelectorAll('.origin-pick').forEach(b => b.onclick = () => {
        ob.home = b.dataset.origin;
        obWho();
      });
    };

    screen.innerHTML = `${bar('scattering://home', '?')}
      <h1 class="title" style="font-size:22px">WHERE ARE YOU FROM?</h1>
      <p class="small">Tap where you're from. What you know grows there — it doesn't grow here.</p>
      <input id="ob-origin-search" type="text" placeholder="🔍 Search places..." autocomplete="off"
        style="width:100%;padding:12px;margin:12px 0;background:#0a0f0a;color:#c9d4c0;border:1px solid #3a4a3a;font-size:16px">
      <div id="origin-list"></div>
      <p class="small" style="opacity:.6;margin-top:12px">Don't see it? <a href="#" id="ob-origin-custom" style="color:#8a9a8a">Type it instead</a>.</p>`;
    render('');
    const search = document.getElementById('ob-origin-search');
    search.addEventListener('input', () => render(search.value));
    // escape hatch: free text for places not listed
    document.getElementById('ob-origin-custom').onclick = (e) => {
      e.preventDefault();
      const v = prompt("Where are you from? (town, state, country)");
      if (v && v.trim()) { ob.home = v.trim(); obWho(); }
    };
  }
  function obWho() {
    // Candidates are generated FROM your origin — the character IS you.
    // Pick the life you're about to live.
    const vs = Game.genRoster(ob.home).filter(v => v.candidate !== false);
    screen.innerHTML = `${bar('scattering://wake', 'clearing')}
      <h1 class="title" style="font-size:22px">WHICH ONE IS YOU?</h1>
      <p class="small">People from ${esc(ob.home)} are waking up in a clearing. One of them is you.</p>
      ${vs.map(v => {
        const lang = Game.langLabel(v.languages);
        return `
        <div class="card"><h3>${v.name}</h3>
        <p>${v.formerOccupation}, ${v.age} · from ${v.homeRegion}</p>
        <p class="small">🗣 ${lang}</p>
        <p class="small">${v.backstory}</p>
        <p class="small" style="opacity:.7">${v.personality.temperament}, ${v.personality.sharing} · ${v.systemAssessment}</p>
        <button class="btn" data-v="${v.id}">I am ${v.name.split(' ')[0]}</button></div>`; }).join('')}`;
    screen.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { ob.villager = b.dataset.v; obItems(); });
  }
  function obItems() {
    const v = Game.data.villagers.find(x => x.id === ob.villager);
    const items = v.items.map(id => Game.data.items.find(i => i.id === id)).filter(Boolean);
    // THE OPENING GAMBLE (Steve 2026-10-05, revised): ONE pool, no type labels.
    // No "useful now" vs "keepsake" sections, no badges. The only signal is the
    // item's own description. A pocket knife reads like a pocket knife; a
    // dead spouse's wedding ring reads like a dead spouse's wedding ring.
    // Shuffled, so position carries no meaning either.
    const pool = [...items].sort(() => Math.random() - 0.5);
    const picked = new Set();
    const card = (i) => {
      // PERSONAL KEEPSAKES (Steve 2026-10-05): that person's items, not props.
      // The pick screen shows the named, dated version.
      const personal = (v.itemPersonal || {})[i.id];
      const showName = personal ? personal.name : i.name;
      const showFlavor = personal ? personal.flavor : (i.flavor || '');
      // ITEM KNOWLEDGE GATING (Steve 2026-10-06): NO mechanical knowledge at
      // selection. "If you don't know, it doesn't show." The only signal is
      // the item's own description/flavor — you learn what things do by
      // carrying them, using them, and (for keepsakes) bonding until the
      // System can translate them. The old ⚙ baseEffect line is gone.
      const sub = `<p class="small">${showFlavor}</p>`;
      return `<div class="card itempick${picked.has(i.id) ? ' sel' : ''}" data-i="${i.id}"><h3>${itemSpriteHtml(i)}${picked.has(i.id) ? '✓ ' : ''}${showName}</h3>${sub}</div>`;
    };
    const render = () => {
      screen.innerHTML = `${bar('scattering://pack', picked.size + '/5')}
      <h1 class="title" style="font-size:22px">WHAT DID YOU GRAB?</h1>
      <p class="small">The sky was changing. ${v.name.split(' ')[0]} could carry five things. Choose:</p>
      ${pool.map(card).join('')}
      <button class="btn" id="b-go" ${picked.size !== 5 ? 'disabled style="opacity:.4"' : ''}>${picked.size === 5 ? 'This is me. Begin.' : `Pick ${5 - picked.size} more`}</button>`;
      screen.querySelectorAll('.itempick').forEach(el => {
        el.onclick = () => {
          const id = el.dataset.i;
          if (picked.has(id)) picked.delete(id);
          else if (picked.size < 5) picked.add(id);
          render();
        };
      });
      const go = document.getElementById('b-go');
      if (picked.size === 5) go.onclick = () => {
        ob.charName = v.name;
        ob.picked = [...picked];
        obName();
      };
    };
    render();
  }

  // ---------- name the expedition ----------
  // Every run gets a name. It shows up in the save list.
  function obName() {
    const first = (ob.charName || 'Someone').split(' ')[0];
    const def = `${first}'s Expedition`;
    screen.innerHTML = `${bar('scattering://name', '?')}
      <h1 class="title" style="font-size:22px">NAME THIS EXPEDITION</h1>
      <p class="small">Every run gets a name. You'll see it in your saves.</p>
      <input id="ob-runname" type="text" maxlength="40" value="${esc(def)}" autocomplete="off" autocapitalize="words"
        style="width:100%;padding:12px;margin:12px 0;background:#0a0f0a;color:#c9d4c0;border:1px solid #3a4a3a;font-size:16px">
      <button class="btn" id="b-name-go">Begin</button>`;
    const input = document.getElementById('ob-runname');
    input.focus(); input.select();
    const go = () => {
      const name = input.value.trim() || def;
      Game.newGame(ob.home, null, ob.villager, ob.picked, name);
      obWake();
    };
    document.getElementById('b-name-go').onclick = go;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  // ---------- wake-up reveal ----------
  // The scattering is random. You don't choose where you wake up.
  // This is the first time the player sees the land — lean into disorientation.
  function obWake() {
    const loc = (Game.data.locations || []).find(l => l.id === Game.state.startLocation) || {};
    const lines = [
      `You wake up face-down in ${/^[aeiou]/i.test(loc.name || '') ? 'an' : 'a'} ${String(loc.name || 'unfamiliar place').toLowerCase()}.`,
      `You don't remember choosing this. You didn't.`,
      `${loc.tagline || 'Nothing looks familiar.'}`,
    ];
    screen.innerHTML = `${bar('scattering://wake', '?')}
      <h1 class="title" style="font-size:22px">YOU WAKE UP</h1>
      <div class="card" style="margin-top:24px">
        <p style="font-size:17px;line-height:1.7">${lines.join('<br><br>')}</p>
        <p class="small" style="opacity:.6;margin-top:16px">What you know grows where you're from. It doesn't grow here.</p>
        <button class="btn" id="b-wake">Open your eyes</button>
      </div>`;
    document.getElementById('b-wake').onclick = () => {
      questOverlay(() => { Game.depart(); expeditionScreen(); });
    };
  }

  // ---------- village node ----------
  function questOverlay(cb) {
    const q = Game.getQuest();
    if (!q) { cb(); return; }
    let i = 0;
    const render = () => {
      screen.innerHTML = `${bar('scattering://village', 'mara')}
        <div class="card" style="margin-top:40px">
          <h3>${q.from}</h3>
          <p style="font-size:17px;line-height:1.6">"${q.lines[i]}"</p>
          <button class="btn" id="b-qnext">${i < q.lines.length - 1 ? '...' : 'Understood.'}</button>
        </div>`;
      document.getElementById('b-qnext').onclick = () => {
        i++;
        if (i < q.lines.length) render(); else cb();
      };
    };
    render();
  }

  // cellPopup: click any space, see your options.
  // what it is, what you know about it, what you can do, why you can't.
  // you click your way through the world.
  // BLOCKED PATH: show what's in the way and every way through.
  // Always multiple solutions: work through it, bridge it, swim it, or go around.
  function showBlockage(block) {
    const info = document.getElementById('inlineslot');
    if (!info) return;
    const { x, y, blockType } = block;
    const wood = Game.woodCount();
    const canSwim = (Game.state.scholar.abilities || []).some(a => (a.id || a) === 'swimmer') ||
                    (Game.state.scholar.backgroundAbilities || []).some(a => (a.id || a) === 'swimmer');
    let html = '';
    const goAround = `<button class="btn sm ghost" data-act="around">Go around</button>`;
    if (blockType === 'fallen_tree') {
      html = `<div class="card"><p>🪵 A fallen tree blocks the path.</p><div class="actions">
        <button class="btn sm" data-act="cut">🪓 Cut through (a while, 60 kcal, +2 wood)</button>${goAround}</div></div>`;
    } else if (blockType === 'rubble') {
      html = `<div class="card"><p>🪨 Rubble chokes the path.</p><div class="actions">
        <button class="btn sm" data-act="clear">🧹 Clear rubble (a while, 40 kcal)</button>${goAround}</div></div>`;
    } else if (blockType === 'washed_out' || blockType === 'creek') {
      const label = blockType === 'creek' ? 'The creek runs fast here.' : 'The path is washed out.';
      html = `<div class="card"><p>🌊 ${label}</p><div class="actions">
        <button class="btn sm" data-act="bridge" ${wood < 4 ? 'disabled' : ''}>🌉 Build bridge (4 wood, 60 kcal — you have ${wood})</button>`;
      if (canSwim) html += `<button class="btn sm" data-act="swim">🏊 Swim across (20 kcal)</button>`;
      html += `${goAround}</div><p class="small">No bridge, no swim? Pick another tile — there's always another way.</p></div>`;
    }
    info.innerHTML = html;
    info.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const act = b.dataset.act;
        // MID-FIGHT (break-it travel r4 2026-10-09): the card can sit open
        // when a fight starts. Clearing/bridging mid-fight would spend kcal
        // and remove the blockage with NO time cost (tickAction no-ops in
        // combat) — and the swim would charge 20 kcal and then refuse the
        // crossing. The engine guards too; the barrier is the way out.
        if (Game.inCombat()) { Game.say('Not mid-fight — the barrier is the way out.'); refresh(); return; }
        if (act === 'cut' || act === 'clear') { Game.clearBlockage(x, y); }
        else if (act === 'bridge') { if (!Game.buildBridge(x, y)) { refresh(); return; } }
        else if (act === 'swim') {
          // HONESTY (break-it travel 2026-10-09): travel first, charge after.
          // The old order spent the 20 kcal and announced the crossing, then
          // travelTo could refuse (dead with the card open) — charged for a
          // swim that never happened, and the log lied about it.
          const swam = Game.travelTo(x, y, true);
          if (swam === null) { refresh(); return; }
          Game.state.scholar.kcal = Math.max(0, Game.state.scholar.kcal - 20);
          Game.say('You swim across, cold and grinning.');
          refresh(); return;
        }
        else { refresh(); return; } // go around: just close
        // after clearing/building, travel through
        const res = Game.travelTo(x, y);
        if (res && res.kind === 'blockage') { showBlockage(res); return; }
        refresh();
      };
    });
  }

  // walkCloser: tap a distant interactive thing → walk to the nearest adjacent
  // walkable cell, then re-open its panel. Multi-move never dead-ends.
  function walkCloser(cx, cy) {
    return ['🚶 Walk closer', () => {
      const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
      const detail = Game.genDetail(Game.map.px, Game.map.py);
      let best = null, bestD = 999;
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        if (Game.cellProps(detail[ny][nx]).blocks) continue;
        const path = Game.findPath(px, py, nx, ny);
        if (!path || !path.length) continue;
        if (path.length < bestD) { bestD = path.length; best = [nx, ny]; }
      }
      if (best) {
        // Animated: the popup re-opens when the walk lands.
        if (!walkPathAnimated(best[0], best[1], (ok) => { if (ok) cellPopup(cx, cy); })) cellPopup(cx, cy);
      } else {
        Game.say('No way to get closer.');
        refresh();
      }
    }];
  }

  // CONTEXTUAL ACTION STRIP: when you're on/adjacent to something you can use,
  // the actions surface quietly below the grid. No tapping around, no popups.
  // Maps Game.cellActions labels to real calls.
  function doContextAction(cx, cy, label, extra) {
    const mon = (typeof Game.playerMonster === 'function') ? Game.playerMonster() : Game.state.scholar.monster;
    if (label === 'Fight' && mon && mon.mx === cx && mon.my === cy) { Game.startCombat(mon.id); return; }
    if (label === 'Hunt') { Game.huntAnimal(); return; }
    if (label === 'Stalk') { try { Game.audioEvent('animalStalk'); } catch (e) {} Game.stalkAnimal(); return; }
    if (label === 'Talk') { talkAction(); return; }
    if (label === 'Clear the way' && extra && extra.blockX !== undefined) {
      Game.clearBlockage(extra.blockX, extra.blockY);
      return;
    }
    if (label === 'Cut down (big job)') { Game.cutTree(cx, cy); return; }
    if (label === 'Prune branches') { Game.pruneBranches(cx, cy); return; }
    if (label === 'Gather fallen') { Game.gatherFallen(cx, cy); return; }
    if (label === 'Clear brush (a while)') { Game.clearBrush(cx, cy); return; }
    if (label === 'Fill water (1L)') { Game.fillWater(); return; }
    if (label === 'Fish') { Game.fish(); return; }
    if (label.startsWith('Cook (')) { Game.cookAll(); return; }
    if (label.startsWith('Smoke ')) { Game.preserveFood(); return; }
    if (label === 'Start a fire (big job)') { Game.makeFire(cx, cy); return; }
    if (label === 'Feed the fire') { Game.feedFire(cx, cy); return; }
    if (label === 'Pitch tent') { Game.pitchTent(cx, cy); return; }
    if (label === 'Pack up tent') { Game.packTent(cx, cy); return; }
    if (label === 'Enter tent') { Game.enterTent(cx, cy); return; }
    if (label === 'Set up camp') {
      // Steve 2026-10-07: confirm before setting up camp — it's a commitment
      // BREAK-IT CAMPS-2 (2026-10-08): setting up on a new tile ABANDONS the
      // old camp (its tent is wrecked, its fire dies) — the confirm names
      // that cost honestly, per "expensive buttons name their cost".
      const old = Game.state.camp;
      const abandon = old && (old.px !== Game.map.px || old.py !== Game.map.py);
      const msg = abandon
        ? 'Set up camp here? Your OLD camp is abandoned — its tent is wrecked, its fire dies. The new camp is a shitty, breakable version of a haven. You can only have one camp.'
        : 'Set up camp here? Your tent and fire become a camp — a shitty, breakable version of a haven. You can only have one camp.';
      if (confirm(msg)) {
        Game.setUpCamp();
      }
      return;
    }
    if (label === 'Step outside') { Game.exitBuilding(); return; }
    if (label === 'Go inside') { Game.enterBuilding(); return; }
    if (label === 'Rest' || label === 'Rest (a while)') { Game.doAction('rest'); return; }
    if (label === 'Search') { Game.searchRoom(cx, cy); return; }
    // Examine, Use, Drink, Warm hands, Forage → the universal interact
    Game.cellInteract(cx, cy);
  }

  // nearbyActionItems: the 9 cells around you, deduped action labels. Single source.
  function nearbyActionItems() {
    const items = [];
    if (Game.state.over) return items;
    if (Game.tbfight) return items;
    const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
    const seen = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = px + dx, cy = py + dy;
      if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
      let labels = [];
      try { labels = Game.cellActions(cx, cy) || []; } catch (e) { continue; }
      for (const label of labels) {
        // dedupe: same action label once (nearest cell wins)
        if (seen.has(label)) continue;
        seen.add(label);
        items.push({ cx, cy, label });
      }
    }
    // BLOCKED EXITS (Steve 2026-10-05): if you're at the grid edge and the
    // node exit is blocked, offer to clear it. Without this, you can get
    // stuck in a node with all exits blocked.
    if ((px === 0 || px === 8 || py === 0 || py === 8)) {
      const dirs = [];
      if (px === 0) dirs.push({ dx: -1, dy: 0, dir: 'west' });
      if (px === 8) dirs.push({ dx: 1, dy: 0, dir: 'east' });
      if (py === 0) dirs.push({ dx: 0, dy: -1, dir: 'north' });
      if (py === 8) dirs.push({ dx: 0, dy: 1, dir: 'south' });
      for (const d of dirs) {
        try {
          const nx = Game.map.px + d.dx, ny = Game.map.py + d.dy;
          const block = Game.travelBlockage(nx, ny);
          // CREEK: only offer bridge if you have the wood. Otherwise you're
          // stuck on creeks — but washed_out/fallen_tree/rubble are always
          // clearable by hand now (washed_out scrambles through).
          if (block && !seen.has('Clear the way')) {
            if (block.blockType === 'creek' && Game.woodCount() < 4) continue;
            seen.add('Clear the way');
            items.push({ cx: px, cy: py, label: 'Clear the way', blockDir: d.dir, blockX: nx, blockY: ny });
          }
        } catch (e) {}
      }
    }
    return items;
  }

  // perceiveHTML: the quiet perception line under the grid. What you notice
  // by standing here — no popups, no flashing, peripheral vision only.
  // Cycles as you move; each render is just still text. Ignorable by design.
  function perceiveHTML() {
    if (Game.state.over || Game.tbfight) return '';
    let hints = [];
    try { hints = (Game.perceptionHints && Game.perceptionHints()) || []; }
    catch (e) { hints = []; }
    if (!hints.length) return '';
    return `<div class="ord-perceive"><p class="perceiveline">${hints.map(h => esc(h)).join('<br>')}</p></div>`;
  }

  // contextBarHTML: scan your cell + 8 neighbors, surface what's usable.
  // quiet by design — small pill buttons, no takeover.
  function contextBarHTML() {
    const items = nearbyActionItems();
    if (!items.length) return '';
    // TALK BADGE: someone nearby wants to talk to you. A quiet dot on the
    // Talk button — peripheral, not a popup. You see it; you're not nagged.
    const wantTalk = talkRequestNear();
    // ACTION CLARITY (Steve 2026-10-05): show WHAT you're acting on (direction
    // arrow to the target cell) and WHAT it does (ability description). No
    // more mystery "Dowse" buttons.
    const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
    const dirArrow = (cx, cy) => {
      const dx = Math.sign(cx - px), dy = Math.sign(cy - py);
      return { '-1,-1': '↖', '0,-1': '↑', '1,-1': '↗', '-1,0': '←', '0,0': '⊙', '1,0': '→', '-1,1': '↙', '0,1': '↓', '1,1': '↘' }[dx + ',' + dy] || '';
    };
    let abilityDescs = {};
    try {
      for (const a of (Game.activatableAbilities() || [])) abilityDescs[a.name] = a.desc;
    } catch (e) {}
    return `<div class="contextbar"><span class="ctx-label">nearby:</span>` +
      items.map((it, i) => {
        const arrow = dirArrow(it.cx, it.cy);
        const desc = abilityDescs[it.label];
        return `<button class="ctx-btn" data-ctx="${i}"${desc ? ` title="${esc(desc)}"` : ''}>${esc(it.label)} ${arrow}${it.label === 'Talk' && wantTalk ? '<span class="dot"></span>' : ''}${desc ? `<span class="ctx-desc">${esc(desc)}</span>` : ''}</button>`;
      }).join('') +
      `</div>`;
  }

  function wireContextBar() {
    const bar = document.querySelector('.contextbar');
    if (!bar) return;
    const items = nearbyActionItems();
    bar.querySelectorAll('[data-ctx]').forEach(b => {
      b.onclick = () => {
        const it = items[+b.dataset.ctx];
        if (!it) return;
        actAndRefresh(() => doContextAction(it.cx, it.cy, it.label, it));
      };
    });
  }

  // selfBarHTML: your persistent body-actions — Eat, Sleep, Pack, Wait.
  // Always in reach, above the fold. Badges are peripheral, not nagging:
  // a quiet dot when something needs attention. Never a popup, never a
  // forced scroll. Hidden in combat (turn-based has its own economy).
  // statsHTML: your human stats, compact. Tap to expand for passives.
  // Not a chore list — just who you're becoming.
  function statsHTML(st) {
    if (st.inCombat || Game.state.over) return '';
    const stats = (Game.state.scholar || {}).stats || { str: 5, end: 5, per: 5, agi: 5, pre: 5 };
    const passives = (Game.state.scholar || {}).passives || {};
    const names = { str: 'STR', end: 'END', per: 'PER', agi: 'AGI', pre: 'PRE' };
    const statLine = Object.entries(names).map(([k, n]) =>
      `<span class="stat" title="${n}">${n} ${stats[k] || 5}</span>`).join(' ');
    const passList = Object.entries(passives).filter(([id, t]) => t > 0)
      .map(([id, t]) => {
        const def = Game.PASSIVES ? Game.PASSIVES[id] : null;
        return def ? `<span class="passive" title="${esc(def.tiers[t-1])}">${esc(def.name)} ${'●'.repeat(t)}${'○'.repeat(3-t)}</span>` : '';
      }).join(' ');
    return `<div class="statsbar"><span class="ctx-label">you:</span> ${statLine}${passList ? ' <span class="ctx-label">·</span> ' + passList : ''}</div>`;
  }

  function selfBarHTML(st) {    if (st.inCombat) return '';
    const eatDot = st.kcal < 500 ? '<span class="dot"></span>' : '';
    const sleepDot = st.energy < 30 ? '<span class="dot"></span>'
      : (st.isNight ? '<span class="dot soft"></span>' : '');
    const packDot = st.packKg >= st.packCap ? '<span class="dot"></span>' : '';
    // THE BANK: no separate Feast button — Eat fills the bar to its cap.
    // Banking is what eating IS when your cap exceeds "fed".
    // EXILE: the self bar is the camp surface — petition via the 🏘️ tile,
    // but founding and drifting live here, always in reach.
    let exileBtns = '';
    try {
      const acts = Game.exileSelfActions ? Game.exileSelfActions() : [];
      exileBtns = acts.map(a => a.disabled
        ? `<span class="self-btn" style="opacity:.55" title="${esc(a.hint || '')}">${esc(a.label)}</span>`
        : `<button class="self-btn" data-self="exile:${a.id}" title="${esc(a.hint || '')}">${esc(a.label)}</button>`).join('');
    } catch (e) {}
    // CASE FILE: visible only while the player has an open/dormant accused
    // case. A quiet dot when the moot is imminent (<=1 day left).
    let caseBtn = '';
    try {
      const pc = Game.playerAccusedCase ? Game.playerAccusedCase() : null;
      if (pc && !pc.trial) {
        const day = Game.state.scholar.day;
        const left = Math.max(0, (pc.mootIn || 2) - (day - (pc.day || day)));
        const cdot = left <= 1 ? '<span class="dot"></span>' : '';
        caseBtn = `<button class="self-btn" data-self="casefile">⚖️ Case file${cdot}</button>`;
      }
    } catch (e) {}
    // REMOTE STORES (Steve 2026-10-04): at Full Integration the System
    // manifests the pantry anywhere. On the haven node the haven panel
    // covers it; out in the world it lives here, System-framed.
    let sysPantryBtn = '';
    try {
      const acc = Game.havenStoresAccess ? Game.havenStoresAccess() : 'none';
      const onHaven = Game.playerTile && Game.playerTile().type === 'haven';
      if (acc === 'remote' && !onHaven) sysPantryBtn = `<button class="self-btn" data-self="syspantry" title="◈ SYSTEM requisition — the pantry manifests">◈ Pantry</button>`;
    } catch (e) {}
    return (exileBtns || caseBtn || sysPantryBtn)
      ? `<div class="selfbar"><span class="ctx-label">you:</span>${exileBtns}${caseBtn}${sysPantryBtn}</div>`
      : '';
  }

  function wireSelfBar() {
    document.querySelectorAll('[data-self]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.self;
        try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
        if (a === 'eat') { Game.eat(); rerender(); }
        else if (a === 'sleep') { Game.sleep(); rerender(); }
        else if (a === 'pack') { invSheet(); }
        else if (a === 'wait') { Game.doAction('wait'); rerender(); }
        else if (a === 'casefile') { caseFileSheetForCurrent(); }
        else if (a === 'syspantry') { pantrySheet(); }
        else if (a.indexOf('exile:') === 0) { Game.exileSelfDo(a.slice(6)); rerender(); }
      };
    });
  }

  // talkRequestNear: someone within earshot wants to talk to you and hasn't
  // been heard yet. Feeds the Talk badge — the "act elsewhere" signal.
  function talkRequestNear() {
    try {
      const v = Game.state.village;
      const reqs = v && v.talkRequests;
      if (!reqs) return false;
      const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
      const pos = v.positions || {};
      for (const rid of Object.keys(reqs)) {
        if (reqs[rid] && !reqs[rid].delivered && pos[rid]) {
          const d = Math.abs(pos[rid].mx - px) + Math.abs(pos[rid].my - py);
          if (d <= 3) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // abilityBarHTML: your activatable powers, always in reach — not buried in inventory.
  // Scales to 6 slots + synergies without becoming a mess: one row, tap to use.
  // Abilities that need a target enter targeting mode; the rest fire directly.
  // CLARITY (Steve 2026-10-05): every button shows WHAT it does (desc), not
  // just a mystery name. In combat, only combat-sensible abilities appear —
  // Time Skip and Dowse have no business in a fight.
  function abilityBarHTML() {
    let acts = (Game.activatableAbilities && Game.activatableAbilities()) || [];
    if (!acts.length) return '';
    // In combat, filter to abilities flagged combat:true. The rest wait.
    if (Game.tbfight) {
      acts = acts.filter(a => a.combat);
      if (!acts.length) return '';
    }
    return `<div class="abilitybar"><span class="ctx-label">⚡</span>` +
      acts.map(a => `<button class="ab-btn" data-ab="${a.id}" ${a.available ? '' : 'disabled'} title="${esc(a.desc || a.name)}">⚡ ${esc(a.name)}<span class="ctx-desc">${esc(a.desc || '')}</span></button>`).join('') +
      `</div>`;
  }

  function wireAbilityBar() {
    const bar = document.querySelector('.abilitybar');
    if (!bar) return;
    bar.querySelectorAll('[data-ab]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.ab;
        const acts = (Game.activatableAbilities && Game.activatableAbilities()) || [];
        const a = acts.find(x => x.id === id);
        if (!a || !a.available) return;
        // Future abilities declare target: 'villager' | 'cell' | 'monster'.
        // Today all are self/none — the targeting path is ready when they aren't.
        if (a.target === 'villager') {
          const near = villagersNear(8);
          if (!near.length) { Game.say('No one in reach.'); return; }
          enterTargeting({ prompt: `⚡ ${a.name} — on whom?`, targets: near,
            onPick: (t) => { try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {} Game.activateAbility(id, t.id); refresh(); } });
          return;
        }
        try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
        Game.activateAbility(id);
        // in combat, an ability IS your action for the turn
        if (Game.tbfight) Game.tbPlayerActed();
        refresh();
      };
    });
  }

  function wireTargetBar() {
    const c = document.getElementById('t-cancel');
    if (c) c.onclick = () => { exitTargeting(); refresh(); };
    // Target pick buttons: tap to select (instead of tapping the grid)
    document.querySelectorAll('.target-pick').forEach(btn => {
      btn.onclick = () => {
        const idx = +btn.dataset.tidx;
        if (!targeting || !targeting.targets[idx]) return;
        const t = targeting.targets[idx];
        const cb = targeting.onPick;
        targeting = null;
        refresh();
        if (cb) { try { cb(t); } catch (e) {} }
      };
    });
  }

  function cellPopup(cx, cy) {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    const cell = detail[cy] && detail[cy][cx];
    const t = Game.playerTile();
    const sec = (t.secrets || {})[cx + ',' + cy];
    const mod = (t.modifiers || {})[cx + ',' + cy];
    const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
    const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    const isMe = (cx === px && cy === py);
    const mon = (typeof Game.playerMonster === 'function') ? Game.playerMonster() : Game.state.scholar.monster;
    const ani = Game.state.scholar.animal;
    const isMon = mon && cx === mon.mx && cy === mon.my;
    const isAni = ani && cx === ani.mx && cy === ani.my;
    // VILLAGER AT THIS CELL: villagers wander the grid (see ensureVillagerPositions).
    let villagerId = null;
    const vpos = Game.state.village && Game.state.village.positions;
    if (vpos) {
      for (const rid of Object.keys(vpos)) {
        if (vpos[rid].mx === cx && vpos[rid].my === cy) { villagerId = rid; break; }
      }
    }

    const CELL_NAME = {
      tree: 'Tree', bigtree: 'Big tree', bush: 'Bush', plant: 'Plant',
      water: 'Water', wall: 'Wall', rubble: 'Rubble', tent: 'Tent', fire: 'Fire',
      bridge: 'Bridge', door: 'Door', gym: 'Gym floor', class: 'Classroom', hall: 'Hallway',
      bunk: 'Bunk', lodge: 'Haven hall',
      office: 'Office', bay: 'Warehouse bay', dock: 'Loading dock', sanct: 'Sanctuary', base: 'Basement',
      grass: 'Grass', dirt: 'Dirt',
    };
    let name = CELL_NAME[cell] || cell;
    let desc = '';
    let actions = [];

    // MANUAL JOURNAL NOTES (Steve 2026-10-05): pre-codex, examining doesn't
    // auto-record observations. If something's waiting to be jotted down,
    // offer it here — visible, honest, costs a moment.
    try {
      const pj = Game.pendingJot && Game.pendingJot();
      if (pj) actions.push(['📓 Jot this down (a moment)', () => { Game.jotPendingNote(); refresh(); }]);
    } catch (e) {}

    if (isMe) {
      desc = 'You are here.';
      // EDGE OF THE MAP: you're on the rim. The next node is that way.
      // This is how you travel — walk to the edge, then head out.
      const exit = Game.edgeExit(cx, cy);
      const inside = Game.state.scholar.insideHaven && Game.playerTile().type === 'haven';
      const outTile = !inside;
      if (exit && outTile) {
        const nx = Game.map.px + exit.dx, ny = Game.map.py + exit.dy;
        const nt = (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) ? Game.tileAt(nx, ny) : null;
        const nm = nt ? (nt.revealed ? (S.TILE_NAME[nt.type] || nt.type) : 'unexplored ground') : 'the edge of the known world';
        const block = nt ? Game.travelBlockage(nx, ny) : null;
        // WORLD EDGE (explorer loop 2026-10-06): no travel button into the
        // void — the 9x9 map is the whole known world. The old button called
        // Game.travelTo with out-of-bounds coords and crashed the tap.
        if (nt) {
          const label = block ? `➡️ Head ${exit.dir} (blocked!)` : `➡️ Head ${exit.dir}`;
          actions.push([label, () => {
            if (block) { showBlockage({ kind: 'blockage', blockType: block.blockType, x: nx, y: ny }); refresh(); return; }
            const res = Game.travelTo(nx, ny);
            if (res && res.kind === 'blockage') { showBlockage(res); }
            refresh();
          }]);
          desc += ` You're on the ${exit.dir}ern edge — ${nm} lies that way.`;
        } else {
          desc += ` You're on the ${exit.dir}ern edge of the known world. Beyond is unmapped — there's no path to take.`;
        }
      } else if (inside) {
        desc += ' You\'re inside the hall. To leave Haven: tap the 🚪 door, step outside, walk to the edge of the grounds, then tap yourself.';
      }
      // someone's standing with you? you walked up to them — talk is right here.
      if (villagerId) {
        const vp = Game.data.villagers.find(v => v.id === villagerId) || Game.data.background_survivors.find(v => v.id === villagerId);
        const vname = Game.displayName(villagerId);
        desc += ` ${vname} is here with you.`;
        actions.push(['💬 Talk to ' + vname, () => openPerson(villagerId)]);
        // CARE IS A DECISION: open the person card to the give-food choices
        // (how much? the world decides public/private). No more one-click.
        actions.push(['🎁 Give food…', () => { inlineView = { kind: 'givefood', vid: villagerId, line: null, result: null, mapKey: inlineMapKey() }; refresh(); }]);
      }
      // CORPSE SYSTEM: you're standing with the dead.
      if (Game.corpseAt) {
        const deadHere = Game.corpseAt(cx, cy);
        if (deadHere.length) {
          const dc = deadHere[0];
          desc += ' ' + Game.corpseDesc(dc);
          actions.push(['Look closely', () => { Game.examineCorpse(dc.id); refresh(); }]);
          const remaining = (dc.items || []).filter(i => (i.units || 1) > 0).length;
          // LOOT-AS-ACTION (Steve 2026-10-06): open the pack, don't take-all.
          if (remaining && !dc.buried) actions.push(['🎒 Search the body', () => { inlineView = { kind: 'loot', cid: dc.id, mapKey: inlineMapKey() }; refresh(); }]);
          if (dc.kind === 'person' && !dc.buried && !dc.respectsPaid) actions.push(['Say a few words', () => { Game.payRespects(dc.id); refresh(); }]);
          if (dc.kind === 'person' && !dc.buried) actions.push(['Bury them', () => { Game.buryCorpse(dc.id); refresh(); }]);
        }
      }
    } else if (isMon) {
      // AMBIGUITY: name hidden until the Codex knows it.
      const mdef = (Game.data.monsters || []).find(m => m.id === mon.id) || {};
      const known = Game.monsterKnown(mon.id);
      desc = known ? `${mdef.name}. ${mdef.vibe || ''} It sees you.`
        : `${mdef.unknown ? mdef.unknown[0].toUpperCase() + mdef.unknown.slice(1) : 'Something big'}. It sees you. You don't know what it is.`;
      if (dist <= 1) actions.push(['Fight', () => Game.startCombat(mon.id)]);
      actions.push(['Back away', () => {}]);
    } else if (isAni) {
      const animal = Game.data.animals.find(a => a.id === ani.id);
      // DESCRIPTOR GATING: until the codex knows it, no true name anywhere —
      // not in the popup, not in the spawn message, not in the hunt text.
      const alabel = Game.encDescribeAnimal ? Game.encDescribeAnimal(animal) : (animal ? animal.description : 'an animal');
      desc = alabel + '.';
      // PREY PHASE BADGE (Steve 2026-10-06): the full badge string in the
      // popup; a compact symbol on the grid cell. Observable, ungated.
      try {
        if (typeof Game.encPreyPhaseBadge === 'function') {
          const pb = Game.encPreyPhaseBadge(ani);
          if (pb && pb !== 'grazing') desc += ' ' + pb + '.';
        }
      } catch (e) {}
      const enc = (Game.state.codex.animalEncounters || {})[ani.id] || 0;
      if (enc >= 3 && animal) desc += ` You know it: ${animal.name}.`;
      else if (enc > 0) desc += ' Looks familiar.';
      if (dist <= 1) actions.push(['Hunt', () => Game.huntAnimal()]);
      else {
        desc += ' (Too far to catch.)';
        actions.push(['Stalk', () => { try { Game.audioEvent('animalStalk'); } catch (e) {} Game.stalkAnimal(); }]);
        actions.push(walkCloser(cx, cy));
      }
    } else if (Game.corpseAt) {
      // CORPSE SYSTEM: the dead stay where they fell.
      const dead = Game.corpseAt(cx, cy);
      if (dead.length) {
        const dc = dead[0];
        name = dc.kind === 'person' ? 'A body' : 'A carcass';
        desc = Game.corpseDesc(dc);
        if (dist <= 1) {
          actions.push(['Look closely', () => { Game.examineCorpse(dc.id); refresh(); }]);
          const remaining = (dc.items || []).filter(i => (i.units || 1) > 0).length;
          // LOOT-AS-ACTION (Steve 2026-10-06): no take-all. Open the pack —
          // take, leave, or use per item.
          if (remaining && !dc.buried) actions.push(['🎒 Search the body', () => { inlineView = { kind: 'loot', cid: dc.id, mapKey: inlineMapKey() }; refresh(); }]);
          if (dc.kind === 'person' && !dc.buried && !dc.respectsPaid) actions.push(['Say a few words', () => { Game.payRespects(dc.id); refresh(); }]);
          if (dc.kind === 'person' && !dc.buried) actions.push(['Bury them', () => { Game.buryCorpse(dc.id); refresh(); }]);
        } else {
          desc += ' (Too far.)';
          actions.push(walkCloser(cx, cy));
        }
      }
    } else if (villagerId) {
      // VILLAGER: people get sheets, not tile panels. Open the person sheet directly.
      // (cellPopup was called for a distant villager tap — walkCloser handles approach.)
      const vp = Game.data.villagers.find(v => v.id === villagerId) || Game.data.background_survivors.find(v => v.id === villagerId);
      const vname = Game.displayName(villagerId);
      if (dist <= 2) {
        const info = document.getElementById('inlineslot');
        if (info) info.innerHTML = ''; // people get sheets, not panels
        personSheet(villagerId);
        return;
      } else {
        // title AND body agree: it's a person over there, not a plant.
        name = vname;
        desc = `${Game.firstRef(villagerId)} is over there. (Too far to talk.)`;
        actions.push(walkCloser(cx, cy));
      }
    } else {
      // what you know: modifiers + synthesized result.
      if (mod && mod.known) {
        if ((cell === 'tree' || cell === 'bigtree')) {
          // TREE SPECIES GATING (Steve 2026-10-06): species name only if known.
          // mod.known is set by ANY examine (game.js) regardless of species
          // knowledge — the examine message gates via treeName(), so the panel
          // must too, or the name leaks on every revisit.
          desc = `${Game.treeName(mod.species) || 'tree'}, ${mod.health}${mod.ivy ? ', ivy-covered' : ''}. `;
          desc += sec && sec.yield === 0 ? 'Nothing.' : `Nuts (about ${sec ? sec.yield : '?'}).`;
        } else if (cell === 'water') {
          desc = `${mod.flow}, ${mod.clarity}, ${mod.source}. `;
          desc += sec && sec.safe ? 'Safe.' : 'POISON.';
        } else {
          desc = 'Examined.';
        }
      } else if (sec && sec.known) {
        if ((cell === 'tree' || cell === 'bigtree')) {
          desc = sec.yield === 0 ? 'Ivy-covered. Nothing.' : `Has nuts (about ${sec.yield} worth).`;
        } else if (cell === 'water') {
          desc = sec.safe ? 'Safe to drink.' : 'POISON. Don\'t drink.';
        } else if (cell === 'tent') {
          desc = sec.condition === 'shredded' ? 'Shredded. Useless.' :
                 sec.condition === 'packable' ? 'Intact and light. You could take it.' : 'Good condition. Dry inside.';
        }
      } else {
        desc = 'You haven\'t examined this closely yet.';
      }

      // what you can do
      const BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
      const blocks = BLOCKS[cell];
      if (dist > 1) {
        desc += ' (Too far to reach.)';
        // MULTI-MOVE: never a dead panel. Walk to it, then see your options.
        if (cell !== 'wall') actions.push(walkCloser(cx, cy));
      } else if (blocks) {
        desc += ' (Blocked — can\'t walk through.)';
        // but you can USE it
        if (cell === 'tree' || cell === 'bigtree') {
          if (!sec || !sec.known) actions.push(['Examine', () => Game.cellInteract(cx, cy)]);
          else if (sec.yield > 0) actions.push(['Forage nuts', () => Game.cellInteract(cx, cy)]);
          // TOOL PREREQUISITES: felling needs an axe. A pruning saw takes
          // branches, not trunks. Impossible actions hide; the hint teaches.
          const ci = Game.cutInfo(cell);
          if (ci.canFell) actions.push(['🪓 Cut down (big job)', () => { Game.cutTree(cx, cy); refresh(); }]);
          else {
            desc += ' ' + ci.hint;
            if (ci.canPrune) actions.push(['🌿 Prune branches', () => { Game.pruneBranches(cx, cy); refresh(); }]);
          }
          actions.push(['🍂 Gather fallen branches', () => { Game.gatherFallen(cx, cy); refresh(); }]);
        } else if (cell === 'water') {
          if (!sec || !sec.known) actions.push(['Examine', () => Game.cellInteract(cx, cy)]);
          else if (sec.safe) actions.push(['Drink', () => Game.cellInteract(cx, cy)]);
        } else if (cell === 'tent') {
          if (!sec || !sec.known) actions.push(['Examine', () => Game.cellInteract(cx, cy)]);
          else if (sec.condition === 'good') actions.push(['😴 Rest (a while)', () => { Game.doAction('rest'); refresh(); }]);
          else if (sec.condition === 'packable') actions.push(['Pack up', () => Game.cellInteract(cx, cy)]);
        } else if (cell === 'fire') {
          actions.push(['Warm hands', () => Game.cellInteract(cx, cy)]);
          // Cook raw food here. (Your Codex tells you what needs cooking.)
          // FOOD REALITY: cleaned meat + must-cook plants join the raw pile.
          const raw = Game.state.scholar.inventory.filter(i => i.rawKcal || (i.foodKind === 'meat' && i.foodState === 'cleaned') || (i.foodKind === 'plant' && i.needsCooking && i.diseaseRisk));
          if (raw.length) actions.push([`Cook ${raw.length} raw`, () => Game.cookAll()]);
          // Smoke/preserve: cleaned or cooked meat, low and slow.
          const smokable = Game.state.scholar.inventory.filter(i => i.foodKind === 'meat' && (i.foodState === 'cleaned' || i.foodState === 'cooked'));
          if (smokable.length) actions.push([`Smoke ${smokable.length} (preserve)`, () => { Game.preserveFood(); refresh(); }]);
          // RENDER FAT (Steve 2026-10-09, bear rework): raw fat + fire.
          const rawFat = Game.state.scholar.inventory.filter(i => i.foodKind === 'fat' && i.foodState === 'raw');
          if (rawFat.length) actions.push([`Render ${rawFat.length} fat`, () => { Game.renderFat(); refresh(); }]);
          // PEMMICAN (Steve 2026-10-09, bear rework): the old way — dried
          // meat + rendered fat + berries. The top preservation tier, earned.
          if (Game.knowsTechnique && Game.knowsTechnique('render') && Game.pemmicanPreview) {
            const prev = Game.pemmicanPreview();
            // PEMMICAN LABEL (hunter break-it 2026-10-09): bars scale with
            // input kcal (~97% retention), so the label shows the honest
            // preview, not the old fixed sets*3 promise.
            if (prev.sets > 0) actions.push([`Make pemmican (${prev.bars} bar${prev.bars === 1 ? '' : 's'})`, () => { Game.makePemmican(); refresh(); }]);
          }
          // Boil risky water -> clean (kills bacteria, not chemicals).
          const risky = (Game.state.scholar.water || []).filter(b => b.quality === 'risky').length;
          if (risky) actions.push([`Boil ${risky}L water`, () => { Game.boilWater(); refresh(); }]);
          // Filter risky water -> clean (no fire needed, strips chemicals).
          const hasFilter = (Game.state.scholar.tools || []).some(t => t.recipeId === 'water_filter' && (t.uses || 0) > 0);
          if (risky && hasFilter) actions.push([`Filter ${risky}L water`, () => { Game.filterWater(); refresh(); }]);
          // Rake charcoal from the ash bed (water filters drink it up).
          actions.push(['Rake charcoal', () => { Game.gatherCharcoal(); refresh(); }]);
          // Village woodpile: take logs for your own work (the pile feeds the hearth first).
          if ((Game.state.village.wood || 0) > 0) actions.push(['Take wood (2kg/log)', () => { Game.takeWood(); refresh(); }]);
        } else if (['gym','class','office','apt','cube','break','conf','lobby','bay','sanct'].includes(cell)) {
          // BUILDING ROOMS: Search = examine + loot in one. No two-step.
          if (!sec || !sec.searched) actions.push(['Search', () => Game.searchRoom(cx, cy)]);
          else desc = 'Searched. Nothing left.';
        } else if (cell === 'wall') {
          desc += ' It\'s a wall.';
        }
        // EXAMINE: the exploration verb. Deep inspection — the story behind
        // the surface. Different from cellInteract (which reveals + acts).
        // Examining is deliberate looking: tracks, scars, stories, secrets.
        if (['tree','bigtree','water','tent','rubble'].includes(cell)) {
          actions.push(['🔍 Examine closely', () => { Game.examineCell(cx, cy); refresh(); }]);
        }
      } else {
        // passable
        if (dist <= 1 && !isMe) {
          actions.push(['Step here', () => {
            MoveAnim.purgeKind('path');
            MoveAnim.enqueue({ dx: cx - px, dy: cy - py, kind: 'step', ms: MoveAnim.stepMs });
          }]);
        } else if (!isMe) {
          // Farther walkable cell: offer the walk (costs kcal, not free).
          // Pathfind first — if no path, say so instead of offering.
          // HONESTY (break-it travel r4 2026-10-09): the label quotes
          // Game.walkCost — the SAME formula beginPathWalk charges, with
          // travel.cost_mult applied. The raw path.length*10 lied to
          // Wanderer/Second Skin holders.
          const path = Game.findPath(px, py, cx, cy);
          if (path && path.length) {
            const cost = (typeof Game.walkCost === 'function') ? Game.walkCost(path.length) : path.length * 10;
            actions.push([`Walk here (${cost} kcal)`, () => walkPathAnimated(cx, cy)]);
          } else {
            desc += ' (No path there.)';
          }
        }
        if (cell === 'plant' || cell === 'bush') actions.push(['Forage', () => Game.cellInteract(cx, cy)]);
        // EXAMINE (Steve 2026-10-06): cheap look without harvesting. Vague
        // description + observation memory — the foundation of recognition.
        if (cell === 'plant' || cell === 'bush') actions.push(['🔍 Examine', () => { Game.examineCell(cx, cy); refresh(); }]);
        // TERRAFORMING: clear brush for brushwood. costs a day-part + 40 kcal.
        if (cell === 'bush') actions.push(['🧹 Clear brush (a while)', () => { Game.clearBrush(cx, cy); refresh(); }]);
        else if (cell === 'rubble') actions.push(['Scavenge', () => Game.cellInteract(cx, cy)]);
        else if (cell === 'bridge') desc += ' The only way across.';
        else if (cell === 'door') {
          desc += ' Leads outside — the Haven grounds, the world beyond.';
          actions.push(['🚪 Step outside', () => { Game.exitBuilding(); refresh(); }]);
        }
        else if (cell === 'lodge') {
          desc += ' The Haven hall. Warmth and twelve people inside.';
          actions.push(['🏠 Go inside', () => { Game.enterBuilding(); refresh(); }]);
        }
        else if (cell === 'bunk') {
          desc += ' A bunk. Rest here.';
          actions.push(['😴 Rest (a while)', () => { Game.doAction('rest'); refresh(); }]);
        }
        // EXAMINE on passable ground: tracks, old camps, strange growths —
        // the ground has stories. Haven interiors have them too (home has
        // texture: mugs, blanket folds, the threshold's worn step), and
        // pre-Burn rooms read as old-world memory.
        if (['dirt','grass','bush','plant','rubble','hall','bunk','lodge',
             'gym','class','office','bay','dock','sanct','base',
             'apt','cube','break','conf','lobby'].includes(cell)) {
          actions.push(['🔍 Examine closely', () => { Game.examineCell(cx, cy); refresh(); }]);
        }
      }
    }

    // INLINE PANEL: the world stays visible. You're not yanked out of the experience.
    // Actions happen here, in context, below the grid.
    // GLASSWING TRAP SHADOW (Steve 2026-10-06): tapping the shadow names it.
    // Diegetic observation ("a shadow on the ground"), never coaching.
    try {
      const _gt = (typeof Game.glasswingTrapCells === 'function') ? Game.glasswingTrapCells() : null;
      if (_gt && _gt.tile && cx === _gt.tile.x && cy === _gt.tile.y) {
        const _dark = ['faint', 'darker', 'almost black'][Math.min(3, Math.max(1, _gt.turns || 1)) - 1];
        desc += ` A shadow on the ground — ${_dark}. Something is falling.`;
      }
    } catch (e) {}
    const info = document.getElementById('inlineslot');
    if (!info) { expeditionScreen(); return; } // fallback if panel target missing
    info.innerHTML = `
      <div class="tilepanel">
        <div class="tp-head"><b>${esc(name)}</b><button class="btn ghost sm tp-x" id="tp-close">✕</button></div>
        <p class="small">${desc}</p>
        <div class="btnrow">
          ${actions.map((a, i) => `<button class="btn sm" data-tpact="${i}">${a[0]}</button>`).join('')}
        </div>
      </div>`;
    info.querySelectorAll('[data-tpact]').forEach(b => {
      b.onclick = () => {
        const px0 = Game.state.scholar.mx, py0 = Game.state.scholar.my;
        try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
        actions[+b.dataset.tpact][1]();
        // If the action moved the player, the GRID is stale — full re-render.
        // Panel-only refresh is fine for in-place actions (examine, drink, etc).
        if (Game.state.scholar.mx !== px0 || Game.state.scholar.my !== py0) refresh();
        else refreshTilePanel();
      };
    });
    document.getElementById('tp-close').onclick = () => { info.innerHTML = ''; };
    // remember what we're looking at so actions can refresh the panel
    info.dataset.cx = cx; info.dataset.cy = cy;
    // the panel opens BELOW the grid — on a phone that's off-screen.
    // bring it into view instead of leaving the player wondering what happened.
  }

  // refresh: full expedition screen re-render after an action.
  function refresh() { expeditionScreen(); }

  // ACTION FEEDBACK: every action's result renders right under the action
  // bars — never scroll to read what just happened. The engine marks the log
  // at action start (Game.feedbackMark); every say() after the mark lands in
  // the feedback card. Wrap every action invocation with actAndRefresh.
  //
  // APP-SIDE FALLBACK (Steve 2026-10-07): the engine currently exposes no
  // feedbackMark/feedbackLines, which silently no-ops the feedback card and
  // every actAndRefresh call. The mark is purely presentation — a bookmark
  // into Game.log, which the engine still maintains via say() — so app.js
  // keeps its own. If the engine ever defines these, the engine wins: no
  // clobber, no logic change, presentation only.
  let _fbMarkIdx = 0;
  if (typeof Game !== 'undefined' && Game) {
    if (typeof Game.feedbackMark !== 'function') {
      Game.feedbackMark = function() { try { _fbMarkIdx = (Game.log || []).length; } catch (e) {} };
    }
    if (typeof Game.feedbackLines !== 'function') {
      Game.feedbackLines = function() { try { return (Game.log || []).slice(_fbMarkIdx); } catch (e) { return []; } };
    }
  }
  function actAndRefresh(fn) {
    try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
    try { fn(); } catch (e) { console.error(e); }
    refresh();
  }

  // SYNERGY TEASE STRINGS currently alive: tease1 (attempt 1) / tease2
  // (attempt 2) for undiscovered synergies with 1-2 attempts whose
  // requirements are held. Used to style their moment-of-use log lines as a
  // distinct block — a tease must land, not drown in log noise.
  function _synTeaseSet() {
    const set = new Set();
    try {
      const sch = Game.state.scholar;
      const syns = Game.data.synergies || [];
      const attempts = sch.synergyAttempts || {};
      const discovered = sch.synergies || [];
      for (const syn of syns) {
        if (discovered.includes(syn.id)) continue;
        const dm = syn.discovery_method || {};
        const key = syn.id + (dm.type === 'sustained' ? '_days' : '');
        const n = attempts[key] || 0;
        if (n !== 1 && n !== 2) continue;
        const minLvl = syn.minLevel || 1;
        const held = (syn.requires || []).every(rid => { try { return Game.abilityLevel(rid) >= minLvl; } catch (e) { return false; } });
        if (!held) continue;
        if (n === 1 && dm.tease1) set.add(dm.tease1);
        if (n === 2 && dm.tease2) set.add(dm.tease2);
      }
    } catch (e) {}
    return set;
  }

  function _isSynTeaseLine(l, teases) {
    if (teases.has(l)) return true;
    // game.js's attempt-2 nudge ("Something wants to happen when you do...
    // whatever you just did. (2/3)") is part of the tease beat.
    return /^Something wants to happen when you do/.test(l);
  }

  function feedbackInner() {
    let lines = [];
    try { lines = (Game.feedbackLines && Game.feedbackLines()) || []; } catch (e) {}
    if (!lines.length) return '';
    const teases = _synTeaseSet();
    return lines.map(l => {
      if (_isSynTeaseLine(l, teases)) {
        // IN-THE-MOMENT TEASE: distinct styled block, right under the action
        // bars — the shiver you felt using those two abilities together.
        return `<p class="fb-line fb-syntease" style="border-left:3px solid #b48cff;padding:6px 8px;background:rgba(150,100,255,.09);border-radius:6px;font-style:italic;margin:6px 0">🌀 ${esc(l)}</p>`;
      }
      return `<p class="fb-line">${esc(l)}</p>`;
    }).join('');
  }
  function feedbackHTML() {
    const inner = feedbackInner();
    if (!inner) return '';
    return `<div id="actionfeedback" class="ord-feedback"><div class="feedbackcard">${inner}</div></div>`;
  }
  function refreshFeedback() {
    const fb = document.getElementById('actionfeedback');
    const inner = feedbackInner();
    if (fb) {
      if (inner) fb.innerHTML = `<div class="feedbackcard">${inner}</div>`;
      else fb.innerHTML = '';
    }
  }

  // refreshTilePanel: re-render the inline panel after an action (stays in context)
  function refreshTilePanel() {
    const info = document.getElementById('inlineslot');
    if (!info || info.dataset.cx === undefined || !info.innerHTML) return;
    cellPopup(+info.dataset.cx, +info.dataset.cy);
    refreshFeedback();
  }

  // ============ SHEET SYSTEM ============
  // Bottom sheets, queued by priority. Replaces full-screen takeovers.
  // Sheets live in #sheet-root (OUTSIDE #screen) so re-renders don't kill them.
  // Priority: system 100 > offer 80 > combat 60 > social 40 > info 20.
  // Modal sheets (offers) block the game behind. Non-modal sheets (info,
  // pantry, inventory, person) let the world stay interactive.
  let sheetQueue = [];
  let sheetSeq = 0;

  function openSheet(opts) {
    // opts: {id, title, html, buttons, priority, modal, dismissible, onClose}
    // buttons: [{label, primary, keepOpen, onClick}]
    const id = opts.id || ('sheet-' + (++sheetSeq));
    // dedupe by id — re-renders must not queue duplicates
    if (opts.id && sheetQueue.some(s => s.id === opts.id)) return opts.id;
    sheetQueue.push({
      id,
      title: opts.title || '',
      html: opts.html || '',
      buttons: opts.buttons || [],
      priority: opts.priority || 20,
      modal: !!opts.modal,
      dismissible: opts.dismissible !== false,
      onClose: opts.onClose || null,
    });
    sheetQueue.sort((a, b) => b.priority - a.priority);
    renderSheets();
    return id;
  }

  function updateSheet(id, patch) {
    const s = sheetQueue.find(x => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    renderSheets();
  }

  function closeSheet(id) {
    const i = id ? sheetQueue.findIndex(x => x.id === id) : 0;
    if (i < 0) return;
    const [s] = sheetQueue.splice(i, 1);
    if (s && s.onClose) { try { s.onClose(); } catch (e) {} }
    renderSheets();
  }

  function clearSheets() { sheetQueue = []; renderSheets(); }

  function sheetQueued(id) { return sheetQueue.some(s => s.id === id); }

  function renderSheets() {
    const root = document.getElementById('sheet-root');
    if (!root) return;
    if (!sheetQueue.length) { root.innerHTML = ''; root.className = ''; return; }
    const s = sheetQueue[0];
    root.className = s.modal ? '' : 'nomodal';
    root.innerHTML = `
      <div class="sheet-backdrop"${s.dismissible && s.modal ? ' data-backdrop="1"' : ''}>
        <div class="sheet" role="dialog">
          <div class="sheet-head"><b>${s.title}</b>${s.dismissible ? '<button class="sheet-x" data-sheetx="1" aria-label="Close">\u2715</button>' : ''}</div>
          <div class="sheet-body">${s.html}</div>
          ${s.buttons.length ? `<div class="sheet-btns">${s.buttons.map((b, i) =>
            `<button class="btn sm${b.primary ? '' : ' ghost'}" data-sheetbtn="${i}">${b.label}</button>`).join('')}</div>` : ''}
        </div>
      </div>`;
    const x = root.querySelector('[data-sheetx]');
    if (x) x.onclick = () => closeSheet(s.id);
    const bd = root.querySelector('[data-backdrop]');
    if (bd) bd.onclick = (e) => { if (e.target === bd) closeSheet(s.id); };
    root.querySelectorAll('[data-sheetbtn]').forEach(btn => {
      btn.onclick = () => {
        const b = s.buttons[+btn.dataset.sheetbtn];
        if (!b) return;
        let keep = !!b.keepOpen;
        if (b.onClick) { try { const r = b.onClick(); if (r === 'keep') keep = true; } catch (e) {} }
        if (!keep) closeSheet(s.id);
      };
    });
    if (s.onRender) { try { s.onRender(root.querySelector('.sheet')); } catch (e) {} }
  }

  // ============ TARGETING MODE ============
  // Action -> target flow. When an action has multiple valid targets
  // (Talk with 3 people nearby, a future ability that needs aiming),
  // highlight the valid targets and let the player tap one.
  // Consistent pattern: strip = action-first, grid tap = target-first.
  let targeting = null; // {prompt, targets: [{cx,cy,label,id}], onPick, onCancel}

  function enterTargeting(opts) {
    // opts: {prompt, targets, onPick(target), onCancel}
    exitTargeting(true);
    targeting = {
      prompt: opts.prompt || 'Choose a target',
      targets: opts.targets || [],
      onPick: opts.onPick,
      onCancel: opts.onCancel || null,
    };
    refresh(); // re-render: grid highlights + target bar
  }

  function exitTargeting(silent) {
    if (!targeting) return;
    const t = targeting;
    targeting = null;
    if (!silent && t.onCancel) { try { t.onCancel(); } catch (e) {} }
  }

  function targetingCells() {
    if (!targeting) return new Set();
    return new Set(targeting.targets.map(t => t.cx + ',' + t.cy));
  }

  function pickTarget(cx, cy) {
    if (!targeting) return false;
    const t = targeting.targets.find(x => x.cx === cx && x.cy === cy);
    if (!t) return false; // tapped elsewhere — ignore, don't cancel (explicit ✕ cancels)
    const cb = targeting.onPick;
    targeting = null;
    refresh(); // clear the highlights before the sheet opens
    if (cb) { try { cb(t); } catch (e) {} }
    return true;
  }

  function targetBarHTML() {
    if (!targeting) return '';
    // TARGETING (Steve 2026-10-05): arrows and explanations are necessary.
    // When facing a pack, you must know WHICH one you're targeting. List them
    // with directional arrows and status, not just highlighted cells.
    const p = Game.state.scholar;
    const px = p.mx ?? Game.state.px ?? 4, py = p.my ?? Game.state.py ?? 4;
    const dirArrow = (dx, dy) => {
      const sx = Math.sign(dx), sy = Math.sign(dy);
      return { '-1,-1': '↖', '0,-1': '↑', '1,-1': '↗', '-1,0': '←', '0,0': '⊙', '1,0': '→', '-1,1': '↙', '0,1': '↓', '1,1': '↘' }[sx + ',' + sy] || '·';
    };
    const btns = targeting.targets.map((t, i) => {
      const arrow = dirArrow(t.cx - px, t.cy - py);
      // Status: wounded? telegraphing? (Qualitative wound words are honest
      // perception — blood shows. The ⚠ warning marker is knowledge-gated
      // behind encTelegraphKnown, same as the combat strip: first
      // encounter gets no warning symbols.)
      let status = '';
      try {
        const f = Game.tbfight ? Game.tbfight.fighters.find(x => x.key === t.key) : null;
        if (f) {
          if (f.hp < f.maxHp * 0.5) status = ' (wounded)';
          else if (f.hp < f.maxHp) status = ' (hurt)';
          const tKnown = Game.encTelegraphKnown ? Game.encTelegraphKnown(f) : false;
          if (f.telegraph && tKnown) status += ' ⚠';
        }
      } catch (e) {}
      const label = t.label || `target ${i + 1}`;
      // Shorten pack names: "the humming in the grass 3" -> "grass 3"
      const short = label.replace(/^the humming in the /i, '').trim() || label;
      return `<button class="btn sm target-pick" data-tidx="${i}">${arrow} ${esc(short)}${status}</button>`;
    }).join('');
    return `<div class="targetbar"><div class="target-prompt">🎯 ${esc(targeting.prompt)}</div>` +
      `<div class="target-list">${btns}</div>` +
      `<button class="t-cancel" id="t-cancel">✕ Cancel</button></div>`;
  }

  // ============ TELEGRAPHED DANGER ============
  // Combat is rare but high-stakes. Big threats (laser beam deer, bulldozers)
  // TELEGRAPH their attacks BEHAVIORALLY: "It freezes. Light gathers behind
  // its eyes. It is not frozen. It is aiming."
  //
  // NO RED SQUARES. EVER. You don't get to see where the attack lands.
  // You must LEARN what each cue means by surviving it — the Codex records
  // patterns you've lived through, and only then does the cue come with
  // understanding. Knowledge is earned, not given.
  // The engine calls showTelegraph(cueText); clearTelegraph() when it resolves.
  let dangerCue = '';

  function showTelegraph(cue) {
    // cue: behavioral text. That's all the warning you get.
    dangerCue = cue || 'Something is coming.';
    // A telegraph overrides everything. Sheets close, targeting cancels.
    // The ONLY thing that matters is reading the monster and moving.
    exitTargeting(true);
    sheetQueue = sheetQueue.filter(s => s.modal && s.priority >= 80);
    renderSheets();
    refresh();
  }

  function clearTelegraph() {
    dangerCue = '';
    refresh();
  }

  function dangerBarHTML() {
    if (!dangerCue) return '';
    return `<div class="dangerbar">\u26A0 ${esc(dangerCue)}</div>`;
  }

  // exposed so the combat engine can cue/clear
  Game.showTelegraph = showTelegraph;
  Game.clearTelegraph = clearTelegraph;

  // ============ COMBAT AUDIO: THE TERROR ============
  // Web Audio, all synthesized, no assets. Heartbeat during telegraphs
  // (speeds up as the attack charges), silence-then-impact, stings.
  // AudioContext requires a user gesture — the game is tap-driven, so taps init it.
  // Highbeam Deer sound design (Steve: "the beam should be terrifying"):
  //   heartbeat = base dread layer · deerCall = wrong-sounding bellow ·
  //   beamCharge = Shepard-rise whine that never resolves ·
  //   beamFire = sub-bass drop + noise roar + crackle · beamSweep = searing
  //   hum that pans as the beam hunts you.
  // Master chain: hbBus + sfxBus -> master -> DynamicsCompressor -> out.
  // The compressor is the seatbelt: the beam must never clip phone speakers.
  // HOOK CONTRACT for the sweep sibling (game.js calls Game.audioEvent(name, data),
  // which dispatches to Game.audio[name](data)):
  //   deerNotice()            — deer becomes aware (distant, wrong call)
  //   deerAggro()             — deer BELLOWS on aim declare / charge (loud, wrong)
  //   deerSnort()             — deer snorts while pawing through its recharge
  //   telegraph({beam, highbeam, urgency, windupTick}) — charge declare / windup tick
  //   impact({beam, highbeam}) — beam resolves (fire) or normal hit
  //   beamSweep(pan, heat)    — per sweep turn: pan -1..1 follows beam, heat 0..1 as it closes in
  //   beamSweepStop()         — beam ends / combat ends
  //   beamBlocked()           — beam dies against cover (fizzle, not bang)
  //   deerDown()              — the deer dies (bellow collapses)
  //   MONSTER BATCH 1 (The Beasts) — per-config audio, fired from game.js.
  //   Implemented 2026-10-06 (were no-ops):
  //   boarNotice()   — combat start: heavy snort, earth pawed
  //   boarSnort()    — boar aggro (pain / adjacency / declare)
  //   boarCharge()   — China-Shop Charge resolves (thundering)
  //   boarTrample()  — missed-charge trample
  //   wolfSilence()  — combat start: the birds cut out all at once
  //   wolfSnarl()    — wolf aggro
  //   wolfBreak()    — the lead is wounded / falls; pack coordination shatters
  //   heronStatic()  — the air goes staticky (notice / unfold)
  //   heronUnfold()  — heron aggro: it unfolds to full height
  //   heronStrike()  — Spearfish Strike resolves
  //   turtleSnap()   — Snap Decision (no warning, by design)
  //   turtleBunker() — the shell seals like a door closing
  //   turtleFlip()   — the flip lands: heave, then shell-on-dirt crash
  //   stagMirror()   — mirror / confront beat (glass harmonics, wrong)
  //   HUMMICE (Steve 2026-10-04) — the swarm is one instrument:
  //   humNotice()    — fight opens: the grass starts humming, low, unsettled
  //   humRise({stacks}) — the hum swells: N detuned voices for N stacks
  //   humBreak()     — a voice drops out: stutter, then thinner
  //   shout()        — the player's bellow: raw noise, no words, all lungs
  //   PREY BEATS (Steve 2026-10-06) — the hunt's missing sounds:
  //   animalKill()   — the kill thud (NOT for beam-kills; those unmake)
  //   animalHiss()   — snapping turtle hiss/lunge warning
  //   animalSnort()  — deer alarm snort on the white-tail bolt
  //   animalRustle() — the "Movement —" spawn notice (with one wrong note)
  //   animalStalk()  — the player's own careful step (Steve 2026-10-06: the
  //     quietest beat in the hunt — near-silent footfalls, held breath, your
  //     heartbeat slightly too fast; fired from the Stalk dispatch, app.js)
  //   animalPant()   — winded state: sides heaving, spent
  //   animalRattle() — timber rattlesnake warning: dry pulsed buzz (Steve 2026-10-06)
  //   animalSpray()  — striped skunk spray: wet sibilant burst + oily thump (Steve 2026-10-06)
  //   animalButcher() — the butcher's beat: knife scrape finding its rhythm,
  //     joints parting, one drip landing too loud (Steve 2026-10-06; wired:
  //     food.js cleanCarcass + specialist butcher task). Per-CARCASS, not
  //     per-part: the bison "horn" butcher-schema yield (2026-10-08) needs no
  //     dedicated horn hook — the horn is collected inside this beat.
  //   NEW ANIMALS (Steve 2026-10-06) — the animals worker's new beats:
  //   animalQuill()  — porcupine: dry gourd rattle warning + quill strike (one ping rings too long)
  //   animalHonk()   — goose: harsh detuned HONK blast + wing hammering (metallic ring)
  //   animalYowl()   — bobcat: unhurried chase yowl with a detuned partner a semitone off
  //   animalCharge() — charger: accelerating hoofbeats + tusk rake + sub-bass commitment
  //   animalTailSlap() — beaver: CRACK transient + watery body + dive glug + expanding rings
  //   animalWhistle() — groundhog: the whistle twice, second one bends wrong
  //   animalFlush()  — grouse: explosion + wing-whir flutter (one wingbeat too loud)
  //   stagSnort()    — stag aggro
  //   stagCharge()   — Confrontation charge resolves
  //   stagConfused() — the charge dies unspent (lost you)
  //   GLASSWING (Steve 2026-10-05):
  //   glasswingCircle() — circling high, thin whine with vibrato
  //   glasswingDive()   — the falling whistle, 2000→300Hz
  //   glasswingLand()   — crash: dirt thud + tangled wing buzz
  //   glasswingClimb()  — rising buzz, back into the sky
  //   glasswingShadowClose({turns}) — pre-combat dive shadow darkening:
  //     whine drops lower, dissonance thickens, air gets heavier each turn
  //   SUNBASKER (Steve 2026-10-05):
  //   baskCharge({charge}) — heat shimmer, brighter with charge
  //   baskBreak()    — the charge knocked out: descending zap
  //   baskFlatten()  — flattening into the dirt: soft deflate
  //   sunbaskerBite() — the molten-gold bite lands: detuned collapse + FM snarl + glassy shear (Steve 2026-10-07)
  //   SYSTEM (Steve 2026-10-06):
  //   round({round})   — combat round tick: the System's metronome, heavier each round
  //   crash({cause})   — a structure is destroyed ('bulldozer' hits heaviest)
  //   levelup({quiet}) — a stat grows: soft breathy rise, no fanfare, felt not heard
  //   passiveUnlock({quiet}) — a passive tier lands: a click + low settling hum
  //   PATTERN SYNTHS (Steve 2026-10-06): generic-per-pattern windup/resolve
  //   pairs, auto-dispatched from telegraph()/impact() by pattern type, and
  //   callable directly as patternWindup({pattern, urgency}). patternResolve
  //   REMOVED 2026-10-08: dead alias, zero callers — impact() already
  //   dispatches per-pattern resolve synths. The deer keeps its own beam set; droneBeam is
  //   the machine beam (review_drone/memory_projector). 'ambush' is silent on
  //   windup BY DESIGN (turtleSnap is the resolve).
  //   burstDetonate() chargeImpact() lockonTick() lockonHit() lineStrike()
  //   rushHit() diveImpact() ambushSnap()
  //   WAVE-2 BESPOKE (Steve 2026-10-06): staticScream() (voice_mimic reveal —
  //   wired: game.js fires it at the reveal-scream declare), serviceRush()
  //   (service_mimic resolve — wired: game.js rush-resolve),
  //   monsterDown() (wired: game.js death fallthrough for monsters with no
  //   deathAudio) / monsterHurt() (wired: game.js tbDamage, solid hits,
  //   once per round). delegateDebrief() REMOVED 2026-10-08: dead synth —
  //   retired delegate_beast, zero call sites (tbFifoBreather spec restructured,
  //   dispatch gone). contractBind() REMOVED 2026-10-07: dead synth — no
  //   contract_golem in monsters.json, zero fire sites, unfired since creation.
  //   unionRepChant() REMOVED 2026-10-07: dead synth — deepened 2026-10-06
  //   but never wired to a fire site (union_rep's voices are unionBullhorn
  //   aggro / unionWalkout resolve / unionPicket / unionRepWhistle); the
  //   2026-10-07 stale-tree damage commit briefly re-added it and 7b49fc5
  //   reverted. paparazzoFlash()/understudyLearn()/ducksRejoin()/
  //   landlordStamp() REMOVED 2026-10-07: same class — registered, unfired,
  //   no fire sites; manager*/delegate* voices likewise removed (retired
  //   manager/delegate_beast monsters; pending future owner follow-up per
  //   2026-10-08 audio sweep).
  //   WOUND TEMPERAMENTS (Steve 2026-10-07): woundEnraged()/woundCunning()/
  //   woundDesperate() — wired: game.js wound-temperament dispatch (dynamic
  //   'wound'+wcap; the audited literal always resolves) + contests.js beat
  //   arrays (pit/gauntlet/siege/etc. escalates). wound() (Steve 2026-10-08,
  //   audio-hook sweep): the GENERIC wound voice — damage that stays — and
  //   the safety net so the dynamic dispatch can never go silent. Emitters
  //   moved from encounters.js to game.js in a stale-tree-revert repair;
  //   doc corrected 2026-10-08.
  //   projectorFire() (memory_projector resolve: whine swelling into the cold
  //   pull tone, hard cut — the light has edges).
  //   WAVE-2 FLYER VOICES (Steve 2026-10-06): nevermoreCroak/nevermoreStrafe/
  //   nevermoreLand/nevermoreClimb (beak-hammer percussion + detuned corvid
  //   croak — wired: game.js first-contact/strafe/land/climb dispatch),
  //   nightcourtSilence/nightcourtLand/nightcourtClimb (negative space, hush,
  //   sub-bass — the dive makes NO sound; silence is the telegraph; wired:
  //   game.js), nightcourtTurn (roost head-turn beat — the owl rotates its
  //   head while ROOSTING, tracking; fires ~1/3 of roost turns via
  //   tbAggroAudio; the dive stays silent BY DESIGN — Steve 2026-10-08),
  //   nightcourtDive REMOVED 2026-10-08: dead synth — the dive is DELIBERATELY silent
  //   ("the silence IS the telegraph"; bespoke dive path skips declareAudio by design,
  //   Steve 2026-10-08), so the hook had zero fire sites. monsters.json entry removed too.
  //   kiteHum/kiteMark/kiteTransmit/kiteBroadcast/kiteClimb
  //   (detuned kite-string whine + radio-static bursts — wired: game.js
  //   first-contact/mark/transmit/broadcast/climb dispatch).
  //   WAVE-1 CONTRACT, NOW DEFINED (Steve 2026-10-06): boarNotice/boarSnort/
  //   boarCharge, wolfSilence/wolfSnarl, heronUnfold/heronStrike, turtleSnap
  //   (wired as speedbump_turtle encounter.resolveAudio in monsters.json).
  //   horrorSting() — the UI dread-beat sting (was referenced, undefined).
  //   CONTESTS + JUSTICE OUTCOMES (Steve 2026-10-06) — hooks for systems
  //   that fired no audio (contests.js, truth.js fire zero audioEvents):
  //   contestCall() — contest window announced (game-show jingle curdles)
  //   contestTaken() — the grab: you are chosen (reverse swell + slow klaxon)
  //   contestSpared() — announced not-taken (relief with a dissonant shadow)
  //   justiceVerdict() — the moot decides (one heavy strike + cold held tone)
  //   exileWalk() — footsteps receding, village hum dropping voices
  //   altarCurdle() — tithe declare: muzak curdles as the altar takes hold (Steve 2026-10-08)
  //   hungerGnaw() — starve escalate: the white room — hunger takes hold (Steve 2026-10-08)
  //   predatorListen() — hide declare: the sixty-count — it is already listening (Steve 2026-10-08)
  //   teethTick() — wheel escalate: the Wheel of Teeth counts (Steve 2026-10-08)
  //   mindMoth() — quiet escalate: the room reads the buried one (Steve 2026-10-08)
  //   engineVoices() — riddle declare: mouths almost like someone you know (Steve 2026-10-08)
  //   NOTE: dispatch wiring for these lives in the contests/truth workers'
  //   files, not here — this section only owns the synths.
  const CombatAudio = (() => {
    let ctx = null, hbTimer = null;
    let master = null, hbBus = null, sfxBus = null;
    let muted = false;
    try { muted = (typeof localStorage !== 'undefined') && localStorage.getItem('oversight_mute') === '1'; } catch (e) {}
    let charge = null;   // active beam-charge stopper
    let sweep = null;    // sustained beam hum {set, stop}
    let noiseBuf = null;

    function ensure() {
      // CONTEXT DEATH (break-it audio r3, Steve 2026-10-09): the OS can close
      // the AudioContext mid-session (iOS memory pressure, audio route torn
      // down by a call/bluetooth). A closed context never recovers on its own:
      // without this guard every voice kept building nodes on the dead
      // context — silent forever, no error, no recovery. Drop the corpse and
      // rebuild below. The cached noise buffer dies with the context (its
      // AudioBuffer belongs to the dead one); sustained handles are stopped.
      let dead = false;
      try { dead = !!(ctx && ctx.state === 'closed'); } catch (e) { dead = !!ctx; }
      if (dead) {
        try { stopHeartbeat(); } catch (e) {}
        try { if (charge) charge(); } catch (e) {}
        try { if (sweep) sweep.stop(); } catch (e) {}
        charge = null; sweep = null;
        ctx = null; master = null; hbBus = null; sfxBus = null; noiseBuf = null;
      }
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 12;
        comp.attack.value = 0.003; comp.release.value = 0.25;
        master = ctx.createGain();
        master.gain.value = muted ? 0.0001 : 0.9;
        hbBus = ctx.createGain(); sfxBus = ctx.createGain();
        hbBus.connect(master); sfxBus.connect(master);
        master.connect(comp);
        try { comp.connect(ctx.destination); } catch (e) {}
      }
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return !!ctx;
    }
    function noise(seconds) {
      if (!ctx) return null;
      if (!noiseBuf) {
        const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      return src;
    }
    function adsr(g, t, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }
    function thump(when, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 55;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
      o.connect(g); g.connect(hbBus);
      o.start(when); o.stop(when + 0.3);
    }
    function heartbeat(bpm) {
      stopHeartbeat();
      if (!ensure()) return;
      const interval = 60000 / bpm;
      const beat = () => {
        if (!ctx) return;
        const t = ctx.currentTime;
        thump(t, 0.5); thump(t + 0.18, 0.35); // lub-dub
      };
      beat();
      hbTimer = setInterval(beat, interval);
    }
    function stopHeartbeat() {
      if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    }
    function combatStartHit() {
      // THE FIGHT OPENS (Steve 2026-10-06): combatStart used to be just a
      // heartbeat — no distinct sound of its own. Now the opening lands
      // first: a single wrong-note horn, a detuned pair a tritone apart,
      // with the room's air sucked out before it. Then the heartbeat takes
      // over (the table still starts it).
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the air leaving: a short reverse swell into the horn
      const nz = noise(0.35), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(400, t);
        nf.frequency.exponentialRampToValueAtTime(3500, t + 0.3);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.2, t + 0.28);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.4);
      }
      // the wrong horn: tritone pair (220/311), one sagging flat
      const hornBus = ctx.createGain(); hornBus.connect(sfxBus);
      [[220, 214], [311.1, 300]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t + 0.3);
        o.frequency.exponentialRampToValueAtTime(f1, t + 0.9);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 1200;
        g.gain.setValueAtTime(0.0001, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.42);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(f); f.connect(g); g.connect(hornBus);
        o.start(t + 0.3); o.stop(t + 1.15);
      });
      // the shudder: a slow LFO gnawing at the horn bus — it can't hold the note steady
      const sh = ctx.createOscillator(), shg = ctx.createGain();
      sh.type = 'sine'; sh.frequency.value = 0.8;
      shg.gain.value = 0.05;
      sh.connect(shg); shg.connect(hornBus.gain);
      sh.start(t + 0.3); sh.stop(t + 1.15);
    }
    // duckHeartbeat: the blast is louder than your pulse. It comes back.
    function duckHeartbeat(downTo, downTime, recoverTime) {
      if (!ctx || !hbBus) return;
      const t = ctx.currentTime;
      try {
        hbBus.gain.cancelScheduledValues(t);
        hbBus.gain.setValueAtTime(hbBus.gain.value, t);
        hbBus.gain.linearRampToValueAtTime(downTo, t + downTime);
        hbBus.gain.linearRampToValueAtTime(1.0, t + downTime + recoverTime);
      } catch (e) {}
    }
    function boom() {
      // UNPATTERNED IMPACT (Steve 2026-10-06): this is still the fallthrough
      // for patterns nobody claimed — but it's not a boom anymore. It's a
      // collapse: the air buckling inward, a sub drop with a partner a
      // tritone away (the geometry is wrong), debris of pitches that don't
      // resolve, and a silence after that's slightly too long.
      if (!ensure()) return;
      stopHeartbeat();
      // SILENCE, then impact. The quiet is the scary part.
      setTimeout(() => {
        if (!ctx) return;
        const t = ctx.currentTime;
        // the buckling: sub drop + tritone partner — wrong geometry
        [120, 169.7].forEach((fq, i) => { // tritone apart
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(fq, t);
          o.frequency.exponentialRampToValueAtTime(fq * 0.25, t + 0.45);
          g.gain.setValueAtTime(i ? 0.4 : 0.7, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.7);
        });
        // debris that doesn't resolve: three pitches, none landing
        [523, 587, 466].forEach((fq, i) => {
          const dt = t + 0.05 + i * 0.06;
          const d2 = ctx.createOscillator(), dg = ctx.createGain();
          d2.type = 'triangle';
          d2.frequency.setValueAtTime(fq, dt);
          d2.frequency.exponentialRampToValueAtTime(fq * 1.13, dt + 0.3); // drifts UP, wrong
          dg.gain.setValueAtTime(0.1, dt);
          dg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.35);
          d2.connect(dg); dg.connect(sfxBus); d2.start(dt); d2.stop(dt + 0.4);
        });
      }, 280);
    }
    function impactWild() {
      // UNPATTERNED IMPACT (Steve 2026-10-06): impact()'s fallthrough used
      // to be the stock boom() — every unrecognized pattern landed the same
      // generic explosion. This is the alien version: a detuned cluster
      // thud (minor-2nd lows grinding) with torn-air noise and a tail that
      // doesn't resolve, it just thins into wrongness.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      // the cluster thud: three lows, two of them a semitone apart
      [[110, 34], [116.5, 36], [77, 30]].forEach(([f0, f1], i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 0.4);
        g.gain.setValueAtTime(i === 0 ? 0.5 : 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.6);
      });
      // torn air: noise ripped by an irregular gate
      const nz = noise(0.6), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 1.1;
        nf.frequency.setValueAtTime(2400, t);
        nf.frequency.exponentialRampToValueAtTime(350, t + 0.55);
        const tear = ctx.createOscillator(), tg = ctx.createGain();
        tear.type = 'square'; tear.frequency.value = 7.3; // uneven tear rate
        tg.gain.value = 0.5;
        tear.connect(tg); tg.connect(ng.gain);
        ng.gain.setValueAtTime(0.28, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.65);
        tear.start(t); tear.stop(t + 0.65);
      }
      // the thinning: a high wrong tone that refuses to land
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine';
      w.frequency.setValueAtTime(2093, t + 0.15);
      w.frequency.linearRampToValueAtTime(2063, t + 1.2); // drifts flat, never resolves
      wg.gain.setValueAtTime(0.0001, t + 0.15);
      wg.gain.exponentialRampToValueAtTime(0.06, t + 0.4);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t + 0.15); w.stop(t + 1.35);
    }
    // sting (Steve 2026-10-06): the System's stings. NOT a stock-game
    // fanfare — victory is bright but wrong (one voice bent sharp, beating
    // against its partner, and a low dissonant drone underneath: the
    // celebration is for THEM, not you), defeat descends with a detuned
    // companion tone that throbs like a bruise.
    function sting(kind) {
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      if (kind === 'victory') {
        const voices = [[392, 1], [523.25, 1.0047], [659.25, 1]]; // middle voice ~+8 cents, beating
        voices.forEach(([fq, det], i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = fq * det;
          const st = t + i * 0.14;
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.24, st + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.6);
          o.connect(g); g.connect(sfxBus);
          o.start(st); o.stop(st + 0.65);
        });
        // the wrong underneath: two low voices a semitone-ish apart
        const d1 = ctx.createOscillator(), d2 = ctx.createOscillator(), dg = ctx.createGain();
        d1.type = 'sawtooth'; d2.type = 'sawtooth';
        d1.frequency.value = 98; d2.frequency.value = 104;
        const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 260;
        dg.gain.setValueAtTime(0.0001, t);
        dg.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
        dg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        d1.connect(df); d2.connect(df); df.connect(dg); dg.connect(sfxBus);
        d1.start(t); d2.start(t); d1.stop(t + 1.2); d2.stop(t + 1.2);
      } else if (kind === 'defeat') {
        [220, 174, 130].forEach((fq, i) => {
          const st = t + i * 0.2;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = fq;
          // companion: detuned +11 cents, beating against the lead
          const o2 = ctx.createOscillator(), g2 = ctx.createGain();
          o2.type = 'sine'; o2.frequency.value = fq * 1.0064;
          g2.gain.value = 0.35; o2.connect(g2); g2.connect(g);
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.3, st + 0.04);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.65);
          o.connect(g); g.connect(sfxBus);
          o.start(st); o2.start(st); o.stop(st + 0.7); o2.stop(st + 0.7);
        });
        // the floor drops out: sub-bass sink under the last note
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'sine';
        s.frequency.setValueAtTime(70, t + 0.4);
        s.frequency.exponentialRampToValueAtTime(30, t + 1.2);
        sg.gain.setValueAtTime(0.0001, t + 0.4);
        sg.gain.exponentialRampToValueAtTime(0.28, t + 0.6);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        s.connect(sg); sg.connect(sfxBus);
        s.start(t + 0.4); s.stop(t + 1.35);
      } else {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = 330;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.5);
      }
    }
    // talkAttention (Steve 2026-10-05/06): someone wants to talk to you.
    // A soft two-tone chime — a tap on the shoulder, not an alarm. But the
    // second tone is bent a hair sharp, beating faintly against the first:
    // the tap is friendly, and the shoulder isn't yours.
    function talkAttention() {
      // (deepened Steve 2026-10-06): the ping that gets attention — two
      // tones a few cents apart, beating — with a sub-octave ghost under
      // the second. Now something ANSWERS: a faint response ping a tritone
      // away, arriving 0.35s later, quieter. Someone listened.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const pairs = [[660, 1], [880, 1.003]]; // +~5 cents on the second
      pairs.forEach(([fq, det], i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq * det;
        const st = t + i * 0.14;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.18, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5); // longer tail, lets the beat show
        o.connect(g); g.connect(sfxBus);
        o.start(st); o.stop(st + 0.55);
      });
      // faint wrong underneath: a sub-octave ghost of the second tone
      const gh = ctx.createOscillator(), gg = ctx.createGain();
      gh.type = 'sine'; gh.frequency.value = 110.6;
      gg.gain.setValueAtTime(0.0001, t + 0.14);
      gg.gain.exponentialRampToValueAtTime(0.04, t + 0.3);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      gh.connect(gg); gg.connect(sfxBus);
      gh.start(t + 0.14); gh.stop(t + 0.75);
      // the answer: a faint response ping a tritone away, 0.35s later —
      // and it withdraws, falling: someone listened, then left
      const a = ctx.createOscillator(), ag = ctx.createGain();
      a.type = 'sine';
      const at = t + 0.35;
      a.frequency.setValueAtTime(933, at); // Bb5: tritone above 660
      a.frequency.exponentialRampToValueAtTime(600, at + 0.32);
      ag.gain.setValueAtTime(0.0001, at);
      ag.gain.exponentialRampToValueAtTime(0.07, at + 0.03);
      ag.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      a.connect(ag); ag.connect(sfxBus); a.start(at); a.stop(at + 0.45);
    }
    // deerCall: a rutting-buck bellow, synthesized wrong on purpose.
    // FM guttural growl (detuned twin = the beating that says "not a deer"),
    // irregular struggle wobble, a strained overtone almost like a deer,
    // breath huff underneath. intensity 0..1: distant notice -> killing bellow.
    function deerCall(intensity, dying) {
      if (!ensure()) return;
      intensity = Math.max(0, Math.min(1, intensity == null ? 0.5 : intensity));
      const t = ctx.currentTime;
      const dur = 1.0 + intensity * 0.7;
      const out = ctx.createGain();
      out.gain.value = 0.14 + intensity * 0.22;
      if (intensity < 0.35) { // distant: muffled, wrong in the dark
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
        out.connect(lp); lp.connect(sfxBus);
      } else out.connect(sfxBus);
      const baseF = 68 + intensity * 22;
      const car = ctx.createOscillator(), car2 = ctx.createOscillator();
      car.type = 'sine'; car2.type = 'sine';
      car.frequency.value = baseF; car2.frequency.value = baseF * 1.009;
      const mod = ctx.createOscillator(), modG = ctx.createGain();
      mod.type = 'sine'; mod.frequency.value = 24 + intensity * 10;
      modG.gain.value = 48;
      const wob = ctx.createOscillator(), wobG = ctx.createGain();
      wob.type = 'sine'; wob.frequency.value = 0.63;
      wobG.gain.value = 22;
      wob.connect(wobG); wobG.connect(modG.gain);
      const vib = ctx.createOscillator(), vibG = ctx.createGain();
      vib.type = 'triangle'; vib.frequency.value = 5.1;
      vibG.gain.value = 6;
      vib.connect(vibG); vibG.connect(car.frequency); vibG.connect(car2.frequency);
      mod.connect(modG); modG.connect(car.frequency); modG.connect(car2.frequency);
      const cg = ctx.createGain();
      adsr(cg, t, 0.8, 0.09, dur);
      car.connect(cg); car2.connect(cg); cg.connect(out);
      if (dying) { // death rattle: the bellow collapses
        car.frequency.setValueAtTime(baseF, t + dur * 0.4);
        car.frequency.exponentialRampToValueAtTime(28, t + dur + 0.5);
        car2.frequency.setValueAtTime(baseF * 1.009, t + dur * 0.4);
        car2.frequency.exponentialRampToValueAtTime(29, t + dur + 0.5);
      }
      const ov = ctx.createOscillator(), ovF = ctx.createBiquadFilter(), ovG = ctx.createGain();
      ov.type = 'sawtooth';
      ov.frequency.setValueAtTime(330, t);
      ov.frequency.exponentialRampToValueAtTime(dying ? 120 : 225, t + dur);
      ovF.type = 'bandpass'; ovF.frequency.value = 950; ovF.Q.value = 3;
      adsr(ovG, t, 0.10 + intensity * 0.10, 0.12, dur);
      ov.connect(ovF); ovF.connect(ovG); ovG.connect(out);
      const nz = noise(dur), nzF = ctx.createBiquadFilter(), nzG = ctx.createGain();
      if (nz) {
        nzF.type = 'bandpass'; nzF.frequency.value = 380; nzF.Q.value = 1.2;
        adsr(nzG, t, 0.10, 0.06, dur);
        nz.connect(nzF); nzF.connect(nzG); nzG.connect(out);
        nz.start(t); nz.stop(t + dur + 0.2);
      }
      [car, car2, mod, wob, vib, ov].forEach(o => { o.start(t); o.stop(t + dur + 0.9); });
    }
    // deerSnort: short sharp exhalation through the nose — the deer is
    // annoyed, pawing the ground, recharging. Audible animal, not beam.
    function deerSnort() {
      // AGGRO: sharp exhale, then low rumble. It's going to charge.
      // (deepened Steve 2026-10-06): now it paws FIRST — a hoof scrape
      // before the snort — and the valley answers wrong: the snort's whistle
      // echoes back pitched UP and faint, half a second late, from nowhere.
      // The deer is not the only thing listening.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // hoof scrape first: the pawing
      const sz = noise(0.18), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
      if (sz) {
        sf.type = 'bandpass'; sf.Q.value = 1.5;
        sf.frequency.setValueAtTime(900, t - 0.18);
        sf.frequency.exponentialRampToValueAtTime(400, t - 0.02);
        sg.gain.setValueAtTime(0.0001, t - 0.18);
        sg.gain.exponentialRampToValueAtTime(0.16, t - 0.1);
        sg.gain.exponentialRampToValueAtTime(0.0001, t);
        sz.connect(sf); sf.connect(sg); sg.connect(sfxBus);
        sz.start(t - 0.18); sz.stop(t + 0.02);
      }
      // Snort (noise burst)
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      src.connect(bp); bp.connect(g); g.connect(sfxBus); src.start(t);
      // Rumble (pawing the earth) — with a beating partner: the earth answers too
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t + 0.15);
      o.frequency.linearRampToValueAtTime(45, t + 0.8);
      const oB = ctx.createOscillator(), gB = ctx.createGain();
      oB.type = 'sawtooth'; oB.frequency.setValueAtTime(60.9, t + 0.15);
      oB.frequency.linearRampToValueAtTime(45.7, t + 0.8);
      gB.gain.value = 0.5; oB.connect(gB); gB.connect(g2);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
      g2.gain.setValueAtTime(0.0001, t + 0.15);
      g2.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(lp); lp.connect(g2); g2.connect(sfxBus);
      o.start(t + 0.15); oB.start(t + 0.15); o.stop(t + 1.0); oB.stop(t + 1.0);
      // the valley answers wrong: the whistle echo, pitched UP, faint, late
      const e = ctx.createOscillator(), eg = ctx.createGain();
      e.type = 'sine';
      e.frequency.setValueAtTime(2400 * 1.26, t + 0.5); // a fourth too high
      e.frequency.exponentialRampToValueAtTime(1200 * 1.26, t + 0.62);
      eg.gain.setValueAtTime(0.0001, t + 0.5);
      eg.gain.exponentialRampToValueAtTime(0.05, t + 0.55);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
      e.connect(eg); eg.connect(sfxBus); e.start(t + 0.5); e.stop(t + 0.7);
    }
    function stopCharge() {
      if (!charge) return;
      try { charge(); } catch (e) {}
      charge = null;
    }
    // beamCharge: the windup whine. A Shepard rise — four voices climbing an
    // octave each, gains bell-shaped so the rise feels endless and never
    // resolves. The top of the climb is pure dread. Idempotent.
    function beamCharge(durSec) {
      if (!ensure() || charge) return;
      const t = ctx.currentTime;
      const dur = Math.max(0.9, Math.min(3.2, durSec || 1.6));
      const stoppers = [];
      const base = 196;
      for (let i = 0; i < 4; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(base * Math.pow(2, i), t);
        o.frequency.exponentialRampToValueAtTime(base * Math.pow(2, i + 1), t + dur);
        const peak = 0.055 - i * 0.010;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + dur * 0.55);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
        stoppers.push(o);
      }
      const sub = ctx.createOscillator(), subG = ctx.createGain();
      sub.type = 'sine'; sub.frequency.value = 48;
      subG.gain.setValueAtTime(0.0001, t);
      subG.gain.exponentialRampToValueAtTime(0.16, t + dur);
      subG.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      sub.connect(subG); subG.connect(sfxBus);
      sub.start(t); sub.stop(t + dur + 0.15);
      stoppers.push(sub);
      const sh = ctx.createOscillator(), shG = ctx.createGain();
      sh.type = 'sine'; sh.frequency.setValueAtTime(4900, t);
      sh.frequency.exponentialRampToValueAtTime(6400, t + dur);
      shG.gain.setValueAtTime(0.0001, t);
      shG.gain.exponentialRampToValueAtTime(0.012, t + dur * 0.7);
      shG.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      sh.connect(shG); shG.connect(sfxBus);
      sh.start(t); sh.stop(t + dur + 0.05);
      stoppers.push(sh);
      const done = () => { stoppers.forEach(o => { try { o.stop(); } catch (e) {} }); };
      const timer = setTimeout(() => { if (charge === done) charge = null; }, dur * 1000 + 200);
      charge = () => { clearTimeout(timer); done(); };
    }
    // beamFire: the Discharge. Sub-bass drop (physical on phone speakers) +
    // broadband roar + crackle as the air tears. Ducks the heartbeat, then
    // hands off to the sustained sweep hum.
    function beamFire() {
      if (!ensure()) return;
      stopCharge();
      duckHeartbeat(0.12, 0.06, 1.6);
      const t = ctx.currentTime;
      const sub = ctx.createOscillator(), subG = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(130, t);
      sub.frequency.exponentialRampToValueAtTime(26, t + 0.55);
      subG.gain.setValueAtTime(0.95, t);
      subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      sub.connect(subG); subG.connect(sfxBus);
      sub.start(t); sub.stop(t + 1.0);
      const nz = noise(1.6), nzF = ctx.createBiquadFilter(), nzG = ctx.createGain();
      if (nz) {
        nzF.type = 'lowpass';
        nzF.frequency.setValueAtTime(3400, t);
        nzF.frequency.exponentialRampToValueAtTime(170, t + 1.3);
        nzG.gain.setValueAtTime(0.8, t);
        nzG.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
        nz.connect(nzF); nzF.connect(nzG); nzG.connect(sfxBus);
        nz.start(t); nz.stop(t + 1.5);
      }
      for (let i = 0; i < 14; i++) {
        const st = t + Math.random() * 0.7;
        const c = noise(0.08), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
        if (!c) continue;
        cf.type = 'highpass'; cf.frequency.value = 2400 + Math.random() * 2000;
        const v = 0.08 + Math.random() * 0.22;
        cg.gain.setValueAtTime(0.0001, st);
        cg.gain.exponentialRampToValueAtTime(v, st + 0.008);
        cg.gain.exponentialRampToValueAtTime(0.0001, st + 0.05 + Math.random() * 0.04);
        c.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        c.start(st); c.stop(st + 0.15);
      }
      beamSweep(0, 1); // the beam keeps burning — the sweep hum takes over
    }
    // beamSweep: the sustained sear while the beam is live. pan (-1..1) follows
    // the beam across the stereo field; heat (0..1) lifts the pitch as it closes in.
    function beamSweep(pan, heat) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      if (!sweep) {
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        o1.type = 'sawtooth'; o2.type = 'sawtooth';
        o1.frequency.value = 82; o2.frequency.value = 123;
        const sg = ctx.createGain();
        const nz = noise(2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.8;
        ng.gain.value = 0.05;
        const wob = ctx.createOscillator(), wobG = ctx.createGain();
        wob.type = 'sine'; wob.frequency.value = 0.9; wobG.gain.value = 480;
        wob.connect(wobG); wobG.connect(nf.frequency);
        o1.connect(sg); o2.connect(sg);
        if (nz) { nz.connect(nf); nf.connect(ng); ng.connect(sg); }
        let panner = null;
        if (ctx.createStereoPanner) {
          panner = ctx.createStereoPanner();
          sg.connect(panner); panner.connect(sfxBus);
        } else sg.connect(sfxBus);
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.16, t + 0.18);
        [o1, o2, wob].forEach(o => o.start(t));
        if (nz) nz.start(t);
        sweep = {
          set(p, h) {
            const tt = ctx.currentTime;
            if (panner) panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, p || 0)), tt, 0.08);
            const f = 82 + (h || 0) * 26;
            o1.frequency.setTargetAtTime(f, tt, 0.08);
            o2.frequency.setTargetAtTime(f * 1.5, tt, 0.08);
          },
          stop() {
            const tt = ctx.currentTime;
            try {
              sg.gain.cancelScheduledValues(tt);
              sg.gain.setValueAtTime(sg.gain.value, tt);
              sg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.25);
              [o1, o2, wob].forEach(o => o.stop(tt + 0.35));
              if (nz) nz.stop(tt + 0.35);
            } catch (e) {}
          }
        };
      }
      sweep.set(pan, heat);
    }
    function beamSweepStop() {
      if (!sweep) return;
      try { sweep.stop(); } catch (e) {}
      sweep = null;
    }
    // HUMMICE (Steve 2026-10-04): the swarm is one instrument — a sustained
    // bed of detuned low voices, like a refrigerator, like a choir warming up
    // underground. N voices for N stacks; each voice breathes at its own rate
    // (that's the beating). humRise rebuilds at the new stack count, humBreak
    // chops it out when a voice dies, humNotice opens the fight low and
    // unsettled. combatEnd kills it — no hum follows you home.
    let hum = null;
    function humBuild(stacks) {
      if (!ensure()) return;
      humStop();
      const t = ctx.currentTime;
      const n = Math.max(1, Math.min(4, stacks || 1));
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.04 + 0.03 * n, t, 0.7);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 380; filt.Q.value = 2;
      g.connect(filt); filt.connect(sfxBus);
      const oscs = [];
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = 66 + i * 8 + Math.random() * 3;
        lfo.type = 'sine';
        lfo.frequency.value = 0.35 + i * 0.22 + Math.random() * 0.2;
        lg.gain.value = 0.4;
        lfo.connect(lg); lg.connect(og.gain);
        og.gain.value = 0.55;
        o.connect(og); og.connect(g);
        o.start(t); lfo.start(t);
        oscs.push(o, lfo);
      }
      hum = {
        stop() {
          const tt = ctx.currentTime;
          try {
            g.gain.cancelScheduledValues(tt);
            g.gain.setValueAtTime(g.gain.value, tt);
            g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.35);
            oscs.forEach(o => o.stop(tt + 0.45));
          } catch (e) {}
        }
      };
    }
    function humStop() {
      if (!hum) return;
      try { hum.stop(); } catch (e) {}
      hum = null;
    }
    function humBreak() {
      // a voice drops out of the choir: chop the hum hard, twice — the
      // stutter — then let it die. The next humRise rebuilds it thinner.
      // (deepened Steve 2026-10-06): the comment always promised a stutter
      // and the code never delivered. Now it does: the dying hum is chopped
      // by a hard square gate, twice, then a thin ghost of the voice
      // flickers back on, weaker — the choir can't quite hold the gap.
      if (!ensure() || !hum) return;
      humStop();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.45);
      // the stutter: a hard square gate chops the hum, twice
      const gate = ctx.createOscillator(), gg = ctx.createGain();
      gate.type = 'square'; gate.frequency.setValueAtTime(14, t);
      gate.frequency.exponentialRampToValueAtTime(7, t + 0.3);
      gg.gain.value = 0.5;
      gate.connect(gg); gg.connect(g.gain);
      g.gain.setValueAtTime(0.44, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(sfxBus);
      o.start(t); gate.start(t); o.stop(t + 0.55); gate.stop(t + 0.55);
      // the gap: one thin ghost flickers back on, weaker — then it's gone
      const gh = ctx.createOscillator(), ghg = ctx.createGain();
      gh.type = 'sine'; gh.frequency.value = 142; // almost the same voice
      ghg.gain.setValueAtTime(0.0001, t + 0.55);
      ghg.gain.exponentialRampToValueAtTime(0.06, t + 0.62);
      ghg.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      gh.connect(ghg); ghg.connect(sfxBus); gh.start(t + 0.55); gh.stop(t + 1.0);
    }
    function shout() {
      // raw bellow: bandpassed noise swell + a descending chest blast.
      // (deepened Steve 2026-10-06): the player's bellow — but the grass
      // ANSWERS: the same descending blast echoes back, detuned sharp and
      // quieter, 0.4s later — the hummice throwing your voice back at you.
      // Plus the inhale before: one sharp breath, because a bellow this raw
      // costs lungs.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the inhale: one sharp breath
      const iz = noise(0.25), inf = ctx.createBiquadFilter(), ig = ctx.createGain();
      if (iz) {
        inf.type = 'bandpass'; inf.Q.value = 1.5;
        inf.frequency.setValueAtTime(300, t - 0.25);
        inf.frequency.exponentialRampToValueAtTime(1200, t - 0.02);
        ig.gain.setValueAtTime(0.0001, t - 0.25);
        ig.gain.exponentialRampToValueAtTime(0.2, t - 0.05);
        ig.gain.exponentialRampToValueAtTime(0.0001, t);
        iz.connect(inf); inf.connect(ig); ig.connect(sfxBus);
        iz.start(t - 0.25); iz.stop(t + 0.02);
      }
      const nz = noise(0.7), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.8;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.7);
      }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.5);
      // the shout is bigger than one throat: a detuned partner, 1% sharp
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(181.8, t);
      o2.frequency.exponentialRampToValueAtTime(70.7, t + 0.5);
      g2.gain.value = 0.6; o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + 0.6); o2.stop(t + 0.6);
      // the grass answers: your bellow, thrown back — sharp, quieter, late
      const e = ctx.createOscillator(), eg = ctx.createGain();
      e.type = 'sawtooth';
      e.frequency.setValueAtTime(180 * 1.02, t + 0.4);
      e.frequency.exponentialRampToValueAtTime(70 * 1.02, t + 0.85);
      const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 900;
      eg.gain.setValueAtTime(0.0001, t + 0.4);
      eg.gain.exponentialRampToValueAtTime(0.14, t + 0.48);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      e.connect(ef); ef.connect(eg); eg.connect(sfxBus);
      e.start(t + 0.4); e.stop(t + 0.95);
    }
    // ---- GLASSWING DARTER / SUNBASKER (Steve 2026-10-05) ----
    function glasswingCircle() {
      // HIGH CIRCLING WHINE: glass wings, not feathers — inharmonic partials
      // (bar-mode ratios 1 : 2.76 : 5.40) with their own slow shimmer, vibrato
      // on the lead, and an airy wingbeat wisp underneath. It circles; the
      // sound circles wrong. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      const lead = ctx.createOscillator(), g = ctx.createGain();
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lead.type = 'sine'; lead.frequency.value = 1250;
      lfo.type = 'sine'; lfo.frequency.value = 5; lg.gain.value = 90;
      lfo.connect(lg); lg.connect(lead.frequency);
      // glass partials: inharmonic, faint, shimmering on their own LFOs
      [2.76, 5.40].forEach((ratio, i) => {
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = 1250 * ratio;
        const pl = ctx.createOscillator(), plg = ctx.createGain();
        pl.type = 'sine'; pl.frequency.value = 3 + i * 2.2; plg.gain.value = 1250 * ratio * 0.004;
        pl.connect(plg); plg.connect(p.frequency);
        pg.gain.setValueAtTime(0.0001, t);
        pg.gain.exponentialRampToValueAtTime(0.035 - i * 0.012, t + 0.3);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        p.connect(pg); pg.connect(sfxBus);
        p.start(t); p.stop(t + dur + 0.05); pl.start(t); pl.stop(t + dur + 0.05);
      });
      // wingbeat wisp: filtered noise, slow AM — the air it pushes
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 4000; nf.Q.value = 0.7;
        const wl = ctx.createOscillator(), wlg = ctx.createGain();
        wl.type = 'sine'; wl.frequency.value = 7; wlg.gain.value = 0.02;
        wl.connect(wlg); wlg.connect(ng.gain);
        ng.gain.setValueAtTime(0.03, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05); wl.start(t); wl.stop(t + dur + 0.05);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.10, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lead.connect(g); g.connect(sfxBus);
      lead.start(t); lead.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    function glasswingDive() {
      // THE FALLING WHISTLE: two voices falling at slightly different ratios,
      // beating wider as they drop — glass can't fall in tune. Wind roars up
      // under it, and a glass-sheen shimmer rides the top, falling faster.
      // (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      [[2000, 300, 0.14], [2030, 305, 0.10]].forEach(([f0, f1, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.8); // louder as it comes
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.1);
      });
      // glass-sheen: a faint high shimmer falling faster than the whistles
      const sh = ctx.createOscillator(), shg = ctx.createGain();
      sh.type = 'sine';
      sh.frequency.setValueAtTime(6900, t);
      sh.frequency.exponentialRampToValueAtTime(1400, t + dur);
      shg.gain.setValueAtTime(0.0001, t);
      shg.gain.exponentialRampToValueAtTime(0.03, t + dur * 0.5);
      shg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      sh.connect(shg); shg.connect(sfxBus);
      sh.start(t); sh.stop(t + dur + 0.05);
      // wind: rises as the glasswing falls toward you
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(600, t);
        nf.frequency.exponentialRampToValueAtTime(2400, t + dur);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.20, t + dur * 0.85);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.1);
      }
    }
    function belltoadCroak() {
      // DEEP RESONANT CROAK: low, felt in the chest. 80Hz fundamental with
      // harmonic wobble. Freaky: slightly detuned, like it's too big.
      // (deepened Steve 2026-10-06): the vocal sac INFLATES first — gated
      // throat-clicks, wet and close — and there's a THIRD voice now, a
      // tritone below the pair: the croak is too big for one throat. It's
      // too big for one animal.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      // throat-clicks: the sac inflating — gated wet bursts
      const cz = noise(0.2), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      if (cz) {
        cf.type = 'lowpass'; cf.frequency.value = 700;
        const ck = ctx.createOscillator(), ckg = ctx.createGain();
        ck.type = 'square'; ck.frequency.value = 17; ckg.gain.value = 0.5;
        ck.connect(ckg); ckg.connect(cg.gain);
        cg.gain.setValueAtTime(0.3, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        cz.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        cz.start(t); ck.start(t); cz.stop(t + 0.22); ck.stop(t + 0.22);
      }
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o1.type = 'sawtooth'; o1.frequency.setValueAtTime(78, t);
      o2.type = 'sawtooth'; o2.frequency.setValueAtTime(82, t); // detuned, beating
      // Throat swell: pitch drops as it croaks
      o1.frequency.exponentialRampToValueAtTime(55, t + dur);
      o2.frequency.exponentialRampToValueAtTime(58, t + dur);
      // the third voice: a tritone below — too big for one throat
      const o3 = ctx.createOscillator();
      o3.type = 'sawtooth'; o3.frequency.setValueAtTime(55, t);
      o3.frequency.exponentialRampToValueAtTime(39, t + dur);
      const g3 = ctx.createGain(); g3.gain.value = 0.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // Lowpass to keep it chesty, not buzzy
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      o1.connect(f); o2.connect(f); o3.connect(g3); g3.connect(f); f.connect(g); g.connect(sfxBus);
      o1.start(t); o2.start(t); o3.start(t); o1.stop(t + dur); o2.stop(t + dur); o3.stop(t + dur);
    }
    function belltoadStun() {
      // EARS RINGING: high dissonant whine + low throb. Freaky: the world tilts.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.2;
      // High whine (tinnitus-like)
      const o1 = ctx.createOscillator(), g1 = ctx.createGain();
      o1.type = 'sine'; o1.frequency.setValueAtTime(4200, t);
      o1.frequency.linearRampToValueAtTime(3800, t + dur);
      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
      g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o1.connect(g1); g1.connect(sfxBus); o1.start(t); o1.stop(t + dur);
      // Low throb (disorienting)
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.setValueAtTime(45, t);
      // Wobble the throb (seasick feeling)
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 7;
      lg.gain.value = 15; lfo.connect(lg); lg.connect(o2.frequency);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o2.connect(g2); g2.connect(sfxBus);
      o2.start(t); o2.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
    }
    function belltoadChorus() {
      // MULTIPLE CROAKS, slightly offset — the chorus answers. Freaky: they
      // harmonize but not quite, beating against each other.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const dt = t + i * 0.18; // staggered entrance
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(75 + i * 7 + Math.random() * 4, dt); // detuned cluster
        o.frequency.exponentialRampToValueAtTime(52 + i * 5, dt + 0.8);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.22, dt + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.85);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280;
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.9);
      }
    }
    // ============ WAVE 2 GROUP C: INSPIRATION / NOSTALGIA / MIDDLE MANAGER ============
    function eurekaTick(opts) {
      // BRIGHTENING TICK: the idea brightens as the boom nears — but the
      // pretty has WEIGHT now (a low thump under the ping, felt in the
      // teeth), and on the final tick the ping FRACTURES: a second tone a
      // minor second above, beating against the first. The idea no longer
      // agrees with itself. Then a ghost after-echo, fainter, detuned —
      // it's still in your head after.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.6;
      const urg = (opts && opts.urgency) || 2;
      const fin = urg <= 1;
      const base = fin ? 2093 : 1568; // G6 → C7: brighter = closer
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(fin ? 0.22 : 0.14, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(sfxBus);
      // the ping
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, t + dur * 0.6);
      o.connect(g); o.start(t); o.stop(t + dur);
      // the fracture: sweet shimmer while distant, a minor-second clash when close
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      const fr2 = fin ? 2 * 1.059 : 2.01;
      o2.frequency.setValueAtTime(base * fr2, t);
      o2.frequency.exponentialRampToValueAtTime(base * fr2 * 1.5, t + dur * 0.6);
      o2.connect(g); o2.start(t); o2.stop(t + dur);
      // the weight: a soft sub thump under the pretty — the idea is heavy
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine'; w.frequency.setValueAtTime(110, t);
      w.frequency.exponentialRampToValueAtTime(55, t + dur);
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(fin ? 0.16 : 0.08, t + 0.04);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
      w.connect(wg); wg.connect(sfxBus); w.start(t); w.stop(t + dur);
      // ghost after-echo: the fracture, fainter, arriving late
      const e = ctx.createOscillator(), eg = ctx.createGain();
      e.type = 'sine'; e.frequency.setValueAtTime(base * fr2 * 1.02, t + 0.35);
      eg.gain.setValueAtTime(0.0001, t + 0.35);
      eg.gain.exponentialRampToValueAtTime(fin ? 0.07 : 0.03, t + 0.42);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      e.connect(eg); eg.connect(sfxBus); e.start(t + 0.35); e.stop(t + 0.95);
    }
    function eurekaCharge() {
      // THE GATHERING: a rising shimmer that lures you to watch — but now
      // there are TWO of them, climbing at DIFFERENT rates, crossing and
      // beating against each other, amplitude-modulated into something
      // metallic. Plus static in the lure: a faint crackle that thickens as
      // it gathers. Don't watch. Don't.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.4;
      // AM edge: 13Hz amplitude modulation — pretty becomes metallic, alien
      const g = ctx.createGain();
      const am = ctx.createOscillator(), amg = ctx.createGain();
      am.type = 'sine'; am.frequency.value = 13; amg.gain.value = 0.35;
      am.connect(amg); amg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(sfxBus);
      // voice one: the lure
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(1760, t + dur);
      o.connect(g); o.start(t); o.stop(t + dur);
      // voice two: a fifth above at first — pretty — but climbing SLOWER,
      // so the lure overtakes it and they cross near the end. It disagrees.
      // And it's tuned slightly FLAT: a sour fifth, beating against the lure
      // the whole way up.
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(655, t);
      o2.frequency.exponentialRampToValueAtTime(1310, t + dur);
      o2.connect(g); o2.start(t); o2.stop(t + dur);
      am.start(t); am.stop(t + dur);
      // static in the lure: crackle thickening as it gathers
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 5000;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.85);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur);
      }
    }
    function eurekaDetonate() {
      // DETONATION: white flare — a major chord resolving TOO loud, light
      // with teeth. But under the beautiful chord something DISAGREES: a
      // ghost cluster a tritone away, slightly flat, beating against it. A
      // sub-bloom gives the idea a body. And the lingering ring is TWO
      // tones a minor second apart, refusing to settle. Beautiful, wrong.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.2;
      // the chord: major, too bright
      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      for (const fr of freqs) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = fr;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.6);
        o.connect(lp); lp.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur * 0.65);
      }
      // the ghost: F#5 + a flat C6 — a tritone wrongness, quiet but sour,
      // beating against the beautiful chord above
      for (const fr of [740, 1040]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = fr;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5);
        o.connect(lp); lp.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur * 0.55);
      }
      // sub-bloom: the idea has a body — felt more than heard
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine'; b.frequency.setValueAtTime(65, t);
      b.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.2, t + 0.06);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      b.connect(bg); bg.connect(sfxBus); b.start(t); b.stop(t + 0.75);
      // the ring: two tones a minor second apart, lingering, unsettled
      for (const f of [3136, 3322.4]) { // G7, G#7: the clash that won't leave
        const r = ctx.createOscillator(), rg = ctx.createGain();
        r.type = 'sine'; r.frequency.value = f;
        rg.gain.setValueAtTime(0.0001, t + 0.1);
        rg.gain.exponentialRampToValueAtTime(0.05, t + 0.25);
        rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        r.connect(rg); rg.connect(sfxBus); r.start(t + 0.1); r.stop(t + dur);
      }
    }
    function eurekaSpent() {
      // GUTTERING TO EMBER: the fizzle. High sizzle collapsing to a dull pulse.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1200, t);
      o.frequency.exponentialRampToValueAtTime(90, t + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + dur);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur);
          // (deepened Steve 2026-10-06): the fizzle crackles — gated noise
      // stuttering as the idea dies — and embers pulse twice, then not.
      const cz = noise(dur), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      if (cz) {
        cf.type = 'highpass'; cf.frequency.value = 2500;
        const cgate = ctx.createOscillator(), cgg = ctx.createGain();
        cgate.type = 'square'; cgate.frequency.value = 17; cgg.gain.value = 0.06;
        cgate.connect(cgg); cgg.connect(cg.gain); // stuttering gate
        cg.gain.setValueAtTime(0.09, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        cz.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        cz.start(t); cz.stop(t + dur); cgate.start(t); cgate.stop(t + dur);
      }
      for (const edt of [0.35, 0.62]) { // ember pulses
        const eo = ctx.createOscillator(), eg = ctx.createGain();
        eo.type = 'sine'; eo.frequency.value = 1900;
        eg.gain.setValueAtTime(0.0001, t + edt);
        eg.gain.exponentialRampToValueAtTime(0.07, t + edt + 0.03);
        eg.gain.exponentialRampToValueAtTime(0.0001, t + edt + 0.15);
        eo.connect(eg); eg.connect(sfxBus);
        eo.start(t + edt); eo.stop(t + edt + 0.2);
      }
    }
    function eurekaDisperse() {
      // DAWN DISPERSAL: thinning, evaporating. It was never meant for daytime.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(1760, t + dur); // rises as it thins
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // breathy: bandpass sweep upward
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(3600, t + dur);
      o.connect(bp); bp.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur);
          // (deepened Steve 2026-10-06): a detuned partner rises faster — the
      // idea coming apart at the seams — and an evaporation shimmer of
      // bandpassed noise drifts off with it.
      const p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'sine';
      p.frequency.setValueAtTime(932, t); // +1 semitone, rising faster
      p.frequency.exponentialRampToValueAtTime(2093, t + dur);
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.08, t + 0.3);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      p.connect(pg); pg.connect(sfxBus);
      p.start(t); p.stop(t + dur);
      const ez = noise(dur), ef = ctx.createBiquadFilter(), eg2 = ctx.createGain();
      if (ez) {
        ef.type = 'bandpass'; ef.Q.value = 4;
        ef.frequency.setValueAtTime(2000, t);
        ef.frequency.exponentialRampToValueAtTime(7000, t + dur); // evaporating
        eg2.gain.setValueAtTime(0.0001, t);
        eg2.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
        eg2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        ez.connect(ef); ef.connect(eg2); eg2.connect(sfxBus);
        ez.start(t); ez.stop(t + dur);
      }
    }
    function eurekaDrift() {
      // SOFT DRIFTING GLOW: gentle, luring. A light that wasn't there
      // yesterday. And one wrong shimmer — a twelfth too high, swelling at
      // the wrong moment — because the lure is alien and doesn't know music.
      // (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.8;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 660;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 663;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
      // wrong shimmer: not quite a twelfth, swells late, dies early — and can't
      // hold still: a slow wobble on its pitch, because the lure is restless
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine'; w.frequency.value = 660 * 3.02;
      const wl = ctx.createOscillator(), wlg = ctx.createGain();
      wl.type = 'sine'; wl.frequency.value = 0.8; wlg.gain.value = 18;
      wl.connect(wlg); wlg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t + 0.3);
      wg.gain.exponentialRampToValueAtTime(0.035, t + 0.55);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t + 0.3); w.stop(t + dur + 0.05); wl.start(t + 0.3); wl.stop(t + dur + 0.05);
    }
    function projectorHum(opts) {
      // OLD PROJECTOR: film clatter + mains hum. spell=true adds the low
      // pull-tone — warm, insistent, wrong. It wants you nearer.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.2;
      // clatter: filtered noise ticks, ~12fps projector rhythm
      const nb = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        const ph = (i / ctx.sampleRate * 12) % 1;
        ch[i] = (Math.random() * 2 - 1) * (ph < 0.08 ? 0.5 : 0.02);
      }
      const src = ctx.createBufferSource(); src.buffer = nb;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(sfxBus); src.start(t);
      // mains hum
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 120;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g2); g2.connect(sfxBus);
      o.start(t); o.stop(t + dur);
      // the hum is SICK: wow/flutter wobble on the mains — the projector
      // can't hold its speed. Something's wrong with the bulb.
      const wob = ctx.createOscillator(), wobg = ctx.createGain();
      wob.type = 'sine'; wob.frequency.value = 0.6; wobg.gain.value = 9;
      wob.connect(wobg); wobg.connect(o.frequency);
      wob.start(t); wob.stop(t + dur);
      // heterodyne ghost: two high whistles 15Hz apart, beating — the
      // interference of something that ISN'T the projector
      for (const f of [4200, 4215]) {
        const h = ctx.createOscillator(), hg = ctx.createGain();
        h.type = 'sine'; h.frequency.value = f;
        hg.gain.setValueAtTime(0.0001, t);
        hg.gain.exponentialRampToValueAtTime(0.014, t + dur * 0.5);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        h.connect(hg); hg.connect(sfxBus); h.start(t); h.stop(t + dur);
      }
      if (opts && opts.spell) {
        // the pull: low warm tone, slowly swelling — it wants you closer
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.setValueAtTime(65, t);
        p.frequency.linearRampToValueAtTime(72, t + dur);
        pg.gain.setValueAtTime(0.0001, t);
        pg.gain.exponentialRampToValueAtTime(0.14, t + dur * 0.8);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        p.connect(pg); pg.connect(sfxBus); p.start(t); p.stop(t + dur);
      }
    }
    function projectorStatic() {
      // GRAY STATIC: confused hiss. The picture won't come back yet — but a
      // weak carrier tone (60Hz mains hum, wobbling) fights through the
      // static. The projector is trying. It is not succeeding.
      // (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.8;
      const nb = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.3;
      const src = ctx.createBufferSource(); src.buffer = nb;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(g); g.connect(sfxBus); src.start(t);
      // carrier: 60Hz hum, wobbling, almost inaudible — the trying
      const c = ctx.createOscillator(), cg = ctx.createGain();
      const cl = ctx.createOscillator(), clg = ctx.createGain();
      c.type = 'sine'; c.frequency.value = 60;
      cl.type = 'sine'; cl.frequency.value = 1.3; clg.gain.value = 4;
      cl.connect(clg); clg.connect(c.frequency);
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.04, t + 0.3);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      c.connect(cg); cg.connect(sfxBus);
      c.start(t); c.stop(t + dur + 0.05); cl.start(t); cl.stop(t + dur + 0.05);
    }
    function projectorBreak() {
      // IMAGE BREAKING UP: judder, tear. Too fast — it can't hold the picture.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.6;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(220, t);
      // judder: stepped drops
      for (let i = 0; i < 5; i++) {
        o.frequency.setValueAtTime(220 - i * 30, t + i * 0.11);
      }
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur);
          // (deepened Steve 2026-10-06): the bulb pops first — then the picture
      // falls in glass sprinkles, and the hum dies down through a warble.
      const pop = ctx.createOscillator(), popg = ctx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(2400, t);
      pop.frequency.exponentialRampToValueAtTime(300, t + 0.1); // implosion
      popg.gain.setValueAtTime(0.3, t);
      popg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      pop.connect(popg); popg.connect(sfxBus);
      pop.start(t); pop.stop(t + 0.15);
      for (let i = 0; i < 7; i++) { // glass sprinkles
        const gdt = t + 0.1 + i * (0.05 + Math.random() * 0.05);
        const go = ctx.createOscillator(), gg = ctx.createGain();
        go.type = 'sine'; go.frequency.value = 4200 + Math.random() * 2600;
        gg.gain.setValueAtTime(0.06, gdt);
        gg.gain.exponentialRampToValueAtTime(0.0001, gdt + 0.05);
        go.connect(gg); gg.connect(sfxBus); go.start(gdt); go.stop(gdt + 0.06);
      }
      const hum = ctx.createOscillator(), humg = ctx.createGain();
      hum.type = 'sawtooth'; hum.frequency.value = 120;
      const hwb = ctx.createOscillator(), hwbg = ctx.createGain();
      hwb.type = 'sine'; hwb.frequency.value = 9; hwbg.gain.value = 40;
      hwb.connect(hwbg); hwbg.connect(hum.frequency); // death warble
      humg.gain.setValueAtTime(0.1, t + 0.1);
      humg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
      hum.connect(humg); humg.connect(sfxBus);
      hum.start(t + 0.1); hwb.start(t + 0.1);
      hum.stop(t + dur + 0.45); hwb.stop(t + dur + 0.45);
    }
    function projectorPull() {
      // THE SPELL PULLS: one warm insistent tug. You take a step closer
      // without deciding to.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(98, t);
      o.frequency.exponentialRampToValueAtTime(130, t + dur * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
          // (deepened Steve 2026-10-06): the machine behind the pull — a film
      // spool whirring up, sprockets clattering in irregular rhythm.
      const sw = ctx.createOscillator(), swg = ctx.createGain();
      sw.type = 'sawtooth';
      sw.frequency.setValueAtTime(80, t);
      sw.frequency.exponentialRampToValueAtTime(210, t + dur);
      const swf = ctx.createBiquadFilter(); swf.type = 'bandpass'; swf.frequency.value = 500; swf.Q.value = 2;
      swg.gain.setValueAtTime(0.0001, t);
      swg.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
      swg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      sw.connect(swf); swf.connect(swg); swg.connect(sfxBus);
      sw.start(t); sw.stop(t + dur);
      const sw2 = ctx.createOscillator(), swg2 = ctx.createGain(); // twin spool, 2% sharp
      sw2.type = 'sawtooth';
      sw2.frequency.setValueAtTime(81.6, t);
      sw2.frequency.exponentialRampToValueAtTime(214, t + dur);
      swg2.gain.setValueAtTime(0.0001, t);
      swg2.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
      swg2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      sw2.connect(swf); swf.connect(swg2); swg2.connect(sfxBus);
      sw2.start(t); sw2.stop(t + dur);
      for (let i = 0; i < 6; i++) { // sprocket clatter
        const cdt = t + i * (0.09 + Math.random() * 0.05);
        const co = ctx.createOscillator(), cg = ctx.createGain();
        co.type = 'square'; co.frequency.value = 1700 + Math.random() * 500;
        cg.gain.setValueAtTime(0.05, cdt);
        cg.gain.exponentialRampToValueAtTime(0.0001, cdt + 0.03);
        co.connect(cg); cg.connect(sfxBus); co.start(cdt); co.stop(cdt + 0.04);
      }
    }
    function projectorFire() {
      // THE PICTURE LOCKS — then the edges cut. Projector whine swelling
      // (bulb overdrive, rising to a scream) into the cold pull tone — but
      // sharpened, metallic, wrong. Then a hard cut. The light has edges.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.6;
      // overdrive whine: sawtooth climbing 800 -> 2400, thin and hot
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sawtooth';
      w.frequency.setValueAtTime(800, t);
      w.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.55);
      const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 1800; wbp.Q.value = 2;
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.5);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.62);
      w.connect(wbp); wbp.connect(wg); wg.connect(sfxBus); w.start(t); w.stop(t + dur * 0.62);
      // the pull, cold and edged: low swell + metallic shimmer cluster
      const p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'sine'; p.frequency.setValueAtTime(65, t + dur * 0.45);
      p.frequency.linearRampToValueAtTime(58, t + dur * 0.9);
      pg.gain.setValueAtTime(0.0001, t + dur * 0.45);
      pg.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.75);
      pg.gain.setValueAtTime(0.16, t + dur * 0.92);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.94); // hard cut
      p.connect(pg); pg.connect(sfxBus); p.start(t + dur * 0.45); p.stop(t + dur);
      for (const f of [2093, 2637, 3136]) { // the edges: cold inharmonic shimmer
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'sine'; s.frequency.value = f;
        sg.gain.setValueAtTime(0.0001, t + dur * 0.5);
        sg.gain.exponentialRampToValueAtTime(0.03, t + dur * 0.8);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.94);
        s.connect(sg); sg.connect(sfxBus); s.start(t + dur * 0.5); s.stop(t + dur);
      }
    }
    function staticCry(opts) {
      // VOICE IN STATIC: filtered noise shaped like a cry. Freaky: it almost
      // sounds like someone you know. Close = louder, clearer.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      const close = opts && opts.close;
      // Noise buffer for static
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      // Bandpass to shape it voice-like (formant-ish)
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(close ? 900 : 600, t);
      bp.frequency.linearRampToValueAtTime(close ? 1400 : 900, t + dur * 0.4);
      bp.frequency.linearRampToValueAtTime(500, t + dur);
      bp.Q.value = 8;
      // Cry envelope: swells like sobbing
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(close ? 0.3 : 0.18, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // Wobble (crying vibrato)
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 6;
      lg.gain.value = 200; lfo.connect(lg); lg.connect(bp.frequency);
      src.connect(bp); bp.connect(g); g.connect(sfxBus);
      src.start(t); lfo.start(t); src.stop(t + dur); lfo.stop(t + dur);
    }
    function staticBreak() {
      // THE ACT BREAKS: voice fragments into pure static, then silence.
      // (deepened Steve 2026-10-06): now you hear the last fragment of the
      // voice — one broken formant syllable ("ah") that dissolves INTO the
      // static — and the static itself thins from the top down, like a
      // picture losing signal, ending in a single dry click. Nobody's home.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      // the last syllable: formant-filtered, breaking apart — and it can't
      // hold still: a vibrato on the formant, the voice trying not to break
      const vz = noise(0.4), vf = ctx.createBiquadFilter(), vg = ctx.createGain();
      if (vz) {
        vf.type = 'bandpass'; vf.Q.value = 6;
        vf.frequency.setValueAtTime(750, t); // "ah"
        vf.frequency.exponentialRampToValueAtTime(1200, t + 0.25); // breaking up
        const vv = ctx.createOscillator(), vvg = ctx.createGain();
        vv.type = 'sine'; vv.frequency.value = 11; vvg.gain.value = 90;
        vv.connect(vvg); vvg.connect(vf.frequency);
        vg.gain.setValueAtTime(0.2, t);
        vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        vz.connect(vf); vf.connect(vg); vg.connect(sfxBus);
        vz.start(t); vv.start(t); vz.stop(t + 0.45); vv.stop(t + 0.45);
      }
      // the static: thins from the top down, like losing signal
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.setValueAtTime(2000, t);
      hp.frequency.exponentialRampToValueAtTime(8000, t + dur); // thinning upward
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(g); g.connect(sfxBus);
      src.start(t); src.stop(t + dur);
      // the dry click at the end: nobody's home
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'square'; c.frequency.value = 1800;
      cg.gain.setValueAtTime(0.08, t + dur);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
      c.connect(cg); cg.connect(sfxBus); c.start(t + dur); c.stop(t + dur + 0.05);
    }
    function stagMirror() {
      // GLASS HARMONICS, WRONG: high, pure, unsettling. The mirror sings.
      // (deepened Steve 2026-10-06): the wrongness deepened — one partial
      // doesn't belong to the series (the 7th, sharp, sour), the glass has
      // a finger circling it (slow amplitude wobble), and underneath is a
      // wolf-tone: two lows beating against each other, almost too low to
      // hear. The mirror isn't singing. It's being played.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.4;
      // Detuned glass tones (beating) — with a finger circling: slow AM wobble
      const wob = ctx.createOscillator(), wobg = ctx.createGain();
      wob.type = 'sine'; wob.frequency.value = 1.6; wobg.gain.value = 0.3;
      for (const fq of [2093, 2107, 2637]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        wob.connect(wobg); wobg.connect(g.gain);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      }
      wob.start(t); wob.stop(t + dur);
      // the wrong partial: the 7th harmonic, sharp — it doesn't belong
      const wp = ctx.createOscillator(), wpg = ctx.createGain();
      wp.type = 'sine'; wp.frequency.value = 2093 * 7.02; // sour, too high
      wpg.gain.setValueAtTime(0.0001, t + 0.3);
      wpg.gain.exponentialRampToValueAtTime(0.03, t + 0.7);
      wpg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      wp.connect(wpg); wpg.connect(sfxBus); wp.start(t + 0.3); wp.stop(t + dur);
      // wolf-tone: two lows beating, almost too low to hear
      [55, 57.8].forEach(fq => {
        const lo = ctx.createOscillator(), log = ctx.createGain();
        lo.type = 'sine'; lo.frequency.value = fq;
        log.gain.setValueAtTime(0.0001, t);
        log.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
        log.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        lo.connect(log); log.connect(sfxBus); lo.start(t); lo.stop(t + dur);
      });
    }
    function stagSnort() {
      // AGGRO: sharp exhale, then low rumble. It's going to charge.
      // (deepened Steve 2026-10-06): the rumble has a beating partner now —
      // the earth answers too (same sibling beat as deerSnort) — and it
      // drops DEEPER than the deer's: 60→36Hz. Bigger animal, deeper threat.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // Snort (noise burst)
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      src.connect(bp); bp.connect(g); g.connect(sfxBus); src.start(t);
      // Rumble (pawing the earth) — with a beating partner: the earth answers too
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t + 0.15);
      o.frequency.linearRampToValueAtTime(36, t + 0.8); // drops deeper than the deer
      const oB = ctx.createOscillator(), gB = ctx.createGain();
      oB.type = 'sawtooth'; oB.frequency.setValueAtTime(60.9, t + 0.15);
      oB.frequency.linearRampToValueAtTime(36.5, t + 0.8);
      gB.gain.value = 0.5; oB.connect(gB); gB.connect(g2);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
      g2.gain.setValueAtTime(0.0001, t + 0.15);
      g2.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(lp); lp.connect(g2); g2.connect(sfxBus);
      o.start(t + 0.15); oB.start(t + 0.15); o.stop(t + 1.0); oB.stop(t + 1.0);
    }
    function droneHum() {
      // EVALUATION DRONE: steady, bureaucratic hum. Freaky: it's too calm —
      // and underneath the calm is a form-stamp click-track (one stamp late,
      // always) and a high whine that can't hold its pitch. Paperwork, but
      // alive. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.0;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 220;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth'; o2.frequency.value = 221.5; // beating
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
      // form-stamp: bureaucratic clicks, uneven
      for (let i = 0; i < 4; i++) {
        const dt = t + 0.12 + i * 0.24 + (i === 2 ? 0.06 : 0); // one stamp late
        const c = ctx.createOscillator(), cg = ctx.createGain();
        c.type = 'square'; c.frequency.value = 1400;
        cg.gain.setValueAtTime(0.06, dt);
        cg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.03);
        c.connect(cg); cg.connect(sfxBus); c.start(dt); c.stop(dt + 0.05);
      }
      // wavering whine: the part of the drone that isn't sure
      const w = ctx.createOscillator(), wg = ctx.createGain();
      const wl = ctx.createOscillator(), wlg = ctx.createGain();
      w.type = 'sine'; w.frequency.value = 1760;
      wl.type = 'sine'; wl.frequency.value = 0.7; wlg.gain.value = 60;
      wl.connect(wlg); wlg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(0.025, t + 0.4);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t); w.stop(t + dur + 0.05); wl.start(t); wl.stop(t + dur + 0.05);
    }
    function droneCount(opts) {
      // COUNTDOWN: flat, synthesized voice-like beeps. 3... 2... 1...
      // Freaky: each beep sits on a mechanical relay clunk — the machine is
      // THINKING about the number. The last beep gets a rising edge: GO.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const count = (opts && opts.count) || 3;
      // Higher pitch = more urgent
      const freq = count === 3 ? 660 : count === 2 ? 740 : 880;
      // relay clunk first: the mechanism engaging
      const cl = ctx.createOscillator(), clg = ctx.createGain();
      cl.type = 'square'; cl.frequency.setValueAtTime(180, t);
      cl.frequency.exponentialRampToValueAtTime(90, t + 0.06);
      const clf = ctx.createBiquadFilter(); clf.type = 'lowpass'; clf.frequency.value = 600;
      clg.gain.setValueAtTime(0.12, t);
      clg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      cl.connect(clf); clf.connect(clg); clg.connect(sfxBus);
      cl.start(t); cl.stop(t + 0.1);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.15, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(sfxBus); o.start(t + 0.05); o.stop(t + 0.32);
      if (count === 1) {
        // the edge: rising tone under the final beep — it means GO
        const e = ctx.createOscillator(), eg = ctx.createGain();
        e.type = 'sawtooth';
        e.frequency.setValueAtTime(440, t + 0.05);
        e.frequency.exponentialRampToValueAtTime(1320, t + 0.4);
        const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2500;
        eg.gain.setValueAtTime(0.0001, t + 0.05);
        eg.gain.exponentialRampToValueAtTime(0.1, t + 0.15);
        eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        e.connect(ef); ef.connect(eg); eg.connect(sfxBus);
        e.start(t + 0.05); e.stop(t + 0.45);
      }
    }
    function droneBeam() {
      // CORRECTIVE BEAM: harsh electric zap. Freaky: it sounds disappointed.
      // (deepened Steve 2026-10-06): the zap is a detuned saw pair beating
      // through the waveshaper — the machine's aim wobbles — with a low
      // disappointed throb sagging under it and scorched-air noise behind.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      const ws = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(3 * (i / 128 - 1));
      ws.curve = curve;
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.22, t);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      ws.connect(wg); wg.connect(sfxBus);
      // the wobbling aim: detuned pair beating at ~2%, both diving
      [[1800, 200], [1836, 204]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        o.connect(ws); o.start(t); o.stop(t + dur + 0.05);
      });
      // the disappointment: a low throb that sags and gives up
      const th = ctx.createOscillator(), tg = ctx.createGain();
      th.type = 'sine';
      th.frequency.setValueAtTime(120, t);
      th.frequency.exponentialRampToValueAtTime(68, t + dur);
      tg.gain.setValueAtTime(0.0001, t);
      tg.gain.exponentialRampToValueAtTime(0.14, t + 0.08);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      th.connect(tg); tg.connect(sfxBus); th.start(t); th.stop(t + dur + 0.05);
      // scorched air: grinding noise tail
      const nz = noise(0.4), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 2;
        nf.frequency.setValueAtTime(3000, t);
        nf.frequency.exponentialRampToValueAtTime(500, t + 0.4);
        ng.gain.setValueAtTime(0.14, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.45);
      }
    }
    function droneRecalc() {
      // RECALIBRATING: confused warble, pitch hunting — now with a partner
      // hunting at the wrong rate and a square-gate stutter on the whole
      // thing. Two drones, neither one right. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.8;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(400, t);
      // Warble: up-down-up-down
      for (let i = 0; i < 4; i++) {
        o.frequency.linearRampToValueAtTime(i % 2 ? 300 : 500, t + 0.2 * (i + 1));
      }
      // stutter gate on the whole warble
      const gl = ctx.createOscillator(), glg = ctx.createGain();
      gl.type = 'square'; gl.frequency.value = 11; glg.gain.value = 0.06;
      gl.connect(glg); glg.connect(g.gain);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      gl.start(t); gl.stop(t + dur);
      // wrong partner: hunts at 1.5x the rate, a fifth off
      const p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'triangle';
      p.frequency.setValueAtTime(600, t);
      for (let i = 0; i < 6; i++) {
        p.frequency.linearRampToValueAtTime(i % 2 ? 450 : 750, t + 0.133 * (i + 1));
      }
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.05, t + 0.2);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      p.connect(pg); pg.connect(sfxBus); p.start(t); p.stop(t + dur + 0.05);
    }
    function swarmBuild() {
      // FLASH BUILDING: clicks quicken, pitch rises. Freaky: it's excited —
      // an inharmonic shimmer rises with the clicks and a sub pulse quickens
      // under them. The swarm is building to something and enjoying it.
      // (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 8; i++) {
        const dt = t + i * 0.09; // accelerating
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 2000 + i * 300;
        g.gain.setValueAtTime(0.1, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.04);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.05);
      }
      // shimmer: inharmonic voices rising with the excitement
      [3.91, 7.24].forEach(ratio => {
        const sh = ctx.createOscillator(), shg = ctx.createGain();
        sh.type = 'sine';
        sh.frequency.setValueAtTime(2000 * ratio, t);
        sh.frequency.exponentialRampToValueAtTime(4400 * ratio, t + 0.72);
        shg.gain.setValueAtTime(0.0001, t);
        shg.gain.exponentialRampToValueAtTime(0.03, t + 0.5);
        shg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        sh.connect(shg); shg.connect(sfxBus);
        sh.start(t); sh.stop(t + 0.85);
      });
      // sub pulse: the swarm's shared heartbeat, quickening
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine'; s.frequency.setValueAtTime(50, t);
      s.frequency.exponentialRampToValueAtTime(90, t + 0.72);
      const sl = ctx.createOscillator(), slg = ctx.createGain();
      sl.type = 'square';
      sl.frequency.setValueAtTime(8, t);
      sl.frequency.exponentialRampToValueAtTime(16, t + 0.72);
      slg.gain.value = 0.03; sl.connect(slg); slg.connect(sg.gain);
      sg.gain.setValueAtTime(0.08, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      s.connect(sg); sg.connect(sfxBus);
      s.start(t); s.stop(t + 0.85); sl.start(t); sl.stop(t + 0.85);
    }
    function swarmFlash() {
      // FLASH MOB: blinding white noise burst. Freaky: it's too bright.
      // (deepened Steve 2026-10-06): the flash leaves an afterimage — a
      // high thin whine that fades SLOWER than the flash, like the retinal
      // ghost — plus photon ricochets: bright pings bouncing down in pitch,
      // and the swarm's delayed answer: three shutter clicks AFTER, filming
      // your blindness.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.4;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(g); g.connect(sfxBus);
      src.start(t); src.stop(t + dur);
      // afterimage whine: the retinal ghost, fading slower than the flash —
      // and it PULSES, faintly, like the ghost is breathing
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine';
      w.frequency.setValueAtTime(5200, t);
      w.frequency.exponentialRampToValueAtTime(4800, t + 1.4);
      const wl = ctx.createOscillator(), wlg = ctx.createGain();
      wl.type = 'sine'; wl.frequency.value = 6; wlg.gain.value = 140;
      wl.connect(wlg); wlg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t + 0.1);
      wg.gain.exponentialRampToValueAtTime(0.07, t + 0.25);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t + 0.1); wl.start(t + 0.1); w.stop(t + 1.55); wl.stop(t + 1.55);
      // photon ricochets: bright pings bouncing down
      [4100, 3300, 2600, 1900].forEach((fq, i) => {
        const dt = t + 0.06 + i * 0.09;
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = fq + Math.random() * 120;
        pg.gain.setValueAtTime(0.1, dt);
        pg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.12);
        p.connect(pg); pg.connect(sfxBus); p.start(dt); p.stop(dt + 0.14);
      });
      // the swarm's answer: three shutter clicks AFTER — filming your blindness
      for (let i = 0; i < 3; i++) {
        const dt = t + 0.55 + i * 0.17;
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'square'; s.frequency.value = 2900;
        sg.gain.setValueAtTime(0.06, dt);
        sg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.04);
        s.connect(sg); sg.connect(sfxBus); s.start(dt); s.stop(dt + 0.05);
      }
    }
    // WAVE-2 REDESIGN (Steve 2026-10-06): five new monsters, five new voices.
    function understudyCopy() {
      // THE COPY (deepened 2026-10-06): your move, played back at you — a
      // perfect mirror, then a semitone off AND sour: a third voice beating
      // against the mockery, with a cold ring-modulated shimmer on top. Not
      // a laugh. A correction.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const voice = (fq, dt, dur, peak, type) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'sawtooth'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(peak, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + dur);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + dur + 0.02);
      };
      voice(523, t, 0.16, 0.1);              // the mirror: exact
      const dt2 = t + 0.18;
      voice(554, dt2, 0.2, 0.09);            // the mockery: a semitone off
      voice(557.2, dt2, 0.2, 0.09);          // sour: beating against it
      // cold shimmer: ring-modulated edge on the mockery
      const sh = ctx.createOscillator(), shg = ctx.createGain();
      sh.type = 'triangle'; sh.frequency.value = 1108;
      const am = ctx.createOscillator(), amg = ctx.createGain();
      am.type = 'sine'; am.frequency.value = 23; amg.gain.value = 0.03;
      am.connect(amg); amg.connect(shg.gain);
      shg.gain.setValueAtTime(0.03, dt2);
      shg.gain.exponentialRampToValueAtTime(0.0001, dt2 + 0.25);
      sh.connect(shg); shg.connect(sfxBus);
      sh.start(dt2); sh.stop(dt2 + 0.27); am.start(dt2); am.stop(dt2 + 0.27);
    }
    function landlordClaim() {
      // JURISDICTION SPREADING (deepened 2026-10-06): a low brass note that
      // widens — the claim getting bigger. A second sawtooth a hair off the
      // first beats as the jurisdiction spreads (civic and wrong), with
      // paperwork rustling underneath it all.
      // (freak pass 2026-10-08): the claim is now STAMPED — three thumps
      // hammering it into law, harder each time — and it LEAVES A DRONE:
      // the 55Hz root with a tritone partner (77.78) that stays after the
      // brass fades. The claim doesn't end when the sound ends. You live
      // in it now.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the brass: two detuned saws, widening together
      [[110, 0.1], [110.9, 0.08]].forEach(([fq, peak]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 1.5, t + 0.8);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.95);
      });
      // the stamping: written down, three times — it is now true
      thump(t + 0.15, 0.35); thump(t + 0.42, 0.42); thump(t + 0.66, 0.5);
      // the notary drone: root + tritone, lingering past the brass
      [[55, 0.07], [77.78, 0.055]].forEach(([fq, peak]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t + 0.5);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.9);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
        o.connect(g); g.connect(sfxBus); o.start(t + 0.5); o.stop(t + 1.75);
      });
      // paperwork: the forms, always the forms
      const nz = noise(1), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 1600;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.06, t + 0.25);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.9);
      }
    }
    function hecklerTaunt(d) {
      // THE TAUNT (deepened Steve 2026-10-06): mocking laughter — and it
      // STACKS with your shame. Three jeers when you're clean, up to eight
      // when you're drowning in it; each jeer is a detuned beating pair,
      // each pair wobbling faster and deeper the worse the shame gets, the
      // pitch climbing because it stings more. Halfway through, a second
      // set of voices joins in — fainter, off-pitch, arriving late. There
      // is no crowd. And the last jeer doesn't end laughing: it curdles
      // down past laughter into something that isn't laughing at all.
      // Not a laugh with you. At you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const shame = Math.min(10, Math.max(0, (d && d.shame) || 0));
      const nJeers = 3 + Math.floor(shame / 2); // 3 clean .. 8 ashamed
      const base = 392 + shame * 14;            // sharper the more it stings
      const wobbleRate = 8 + shame;             // the mockery quickens
      const wobbleDepth = 15 + shame * 1.6;
      // 1) THE JEER STACK: descending jeers, each a detuned beating pair
      for (let i = 0; i < nJeers; i++) {
        const dt = t + i * 0.13;
        const fq = base * Math.pow(0.93, i);
        [0, 6].forEach(det => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'square'; o.frequency.value = fq + det;
          // detuned wobble: the mockery wobbles, meaner with shame
          const lfo = ctx.createOscillator(), lg = ctx.createGain();
          lfo.type = 'sine'; lfo.frequency.value = wobbleRate;
          lg.gain.value = wobbleDepth; lfo.connect(lg); lg.connect(o.frequency);
          g.gain.setValueAtTime(0.0001, dt);
          g.gain.exponentialRampToValueAtTime(0.07, dt + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.12);
          o.connect(g); g.connect(sfxBus);
          o.start(dt); o.stop(dt + 0.14); lfo.start(dt); lfo.stop(dt + 0.14);
        });
      }
      const stackEnd = t + nJeers * 0.13;
      // 2) THE CROWD THAT ISN'T THERE: faint off-pitch echoes arriving
      //    late, louder the more ashamed you are — shame echoing itself.
      [0.97, 1.02].forEach((mul, k) => {
        const edt = t + 0.22 + k * 0.12;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = base * 0.82 * mul;
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = wobbleRate * 1.35;
        lg.gain.value = wobbleDepth * 1.3; lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, edt);
        g.gain.exponentialRampToValueAtTime(0.035 + shame * 0.005, edt + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, edt + 0.22);
        o.connect(g); g.connect(sfxBus);
        o.start(edt); o.stop(edt + 0.24); lfo.start(edt); lfo.stop(edt + 0.24);
      });
      // 3) THE CURDLING TAIL: the last jeer slides down past laughter —
      //    a detuned pair falling together, then gone.
      [[260, 120], [266, 120]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, stackEnd);
        o.frequency.exponentialRampToValueAtTime(f1, stackEnd + 0.34);
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = wobbleRate;
        lg.gain.value = wobbleDepth; lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, stackEnd);
        g.gain.exponentialRampToValueAtTime(0.085, stackEnd + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, stackEnd + 0.4);
        o.connect(g); g.connect(sfxBus);
        o.start(stackEnd); o.stop(stackEnd + 0.42);
        lfo.start(stackEnd); lfo.stop(stackEnd + 0.42);
      });
    }
    function hecklerPileOn() {
      // PILE-ON (deepened 2026-10-06): the taunt multiplies — overlapping
      // jeers, a chorus of mean, each one wobbling. The last jeer slides
      // down into something nastier than laughter.
      // (freak pass 2026-10-08): it's not one heckler jeering — it's a
      // CHORUS. Two interleaved jeer streams, the second a sour 30 cents
      // sharp and arriving late, wobbling out of sync with the first.
      // Between jeers the whisper-crowd swells — the audience that isn't
      // there, reacting anyway. The last jeer slides down past laughter
      // into a flat score-buzz: you have been marked down.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the chorus: two streams, out of sync, the second one sour
      const streams = [
        { off: 0, cents: 1, peak: 0.07, wob: 9 },
        { off: 0.055, cents: 1.0178, peak: 0.055, wob: 11.3 }, // 30 cents sharp
      ];
      streams.forEach((st) => {
        for (let i = 0; i < 5; i++) {
          const dt = t + st.off + i * 0.11;
          const last = i === 4 && st.off === 0;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'square';
          if (last) { // the slide: the first stream's last jeer curdles down
            o.frequency.setValueAtTime(280, dt);
            o.frequency.exponentialRampToValueAtTime(140, dt + 0.4);
          } else {
            o.frequency.value = (300 + (i % 2) * 40 + Math.random() * 30) * st.cents;
          }
          // vibrato: every jeer wobbles with meanness — the streams wobble apart
          const lfo = ctx.createOscillator(), lg = ctx.createGain();
          lfo.type = 'sine'; lfo.frequency.value = st.wob; lg.gain.value = 20;
          lfo.connect(lg); lg.connect(o.frequency);
          const dur = last ? 0.42 : 0.13;
          g.gain.setValueAtTime(0.0001, dt);
          g.gain.exponentialRampToValueAtTime(last ? 0.1 : st.peak, dt + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, dt + dur);
          o.connect(g); g.connect(sfxBus);
          o.start(dt); o.stop(dt + dur + 0.02); lfo.start(dt); lfo.stop(dt + dur + 0.02);
        }
      });
      // the whisper-crowd: it isn't there, but it reacts anyway
      const nz = noise(1.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 800; nf.Q.value = 0.7;
        ng.gain.setValueAtTime(0.0001, t + 0.15);
        ng.gain.exponentialRampToValueAtTime(0.09, t + 0.5);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.15); nz.stop(t + 1.35);
      }
      // the mark: after the slide, a flat score-buzz — marked down
      const m = ctx.createOscillator(), mg = ctx.createGain();
      m.type = 'square'; m.frequency.value = 58;
      mg.gain.setValueAtTime(0.0001, t + 1.0);
      mg.gain.exponentialRampToValueAtTime(0.09, t + 1.04);
      mg.gain.setValueAtTime(0.09, t + 1.12);
      mg.gain.exponentialRampToValueAtTime(0.0001, t + 1.14);
      m.connect(mg); mg.connect(sfxBus);
      m.start(t + 1.0); m.stop(t + 1.18);
    }
    function paparazzoShutter(opts) {
      // THE SHUTTER (deepened 2026-10-06): an expensive click — not a swarm,
      // a sniper. Prediction level raises the pitch: it knows. The lens
      // whirrs, hunting focus, wobbling as it locks — then the motor drive
      // fires a second frame, worn and lower. It is not done with you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const pred = (opts && opts.prediction) || 0;
      const baseFq = 2000 + pred * 300;
      const click = (dt, fq, peak) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(peak, dt + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.06);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.07);
      };
      click(t, baseFq, 0.12);                 // the sniper frame
      click(t + 0.09, baseFq * 0.85, 0.09);  // the motor drive: worn, lower
      // the lens whirr: focusing, hunting, wobbling as it locks
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(800, t);
      o2.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 11; lg.gain.value = 40;
      lfo.connect(lg); lg.connect(o2.frequency);
      g2.gain.setValueAtTime(0.05, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o2.connect(g2); g2.connect(sfxBus);
      o2.start(t); o2.stop(t + 0.36); lfo.start(t); lfo.stop(t + 0.36);
    }
    function unionRepWhistle() {
      // THE WHISTLE (deepened 2026-10-06): a pea-whistle blast — the line
      // moves. Two harmonics with a 28Hz AM flutter (the pea rattling), a
      // breath puff at the attack, and the pitch sagging at the end like
      // the blower's lungs give out. Attention must be paid.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      [[2200, 0.1], [4400, 0.035]].forEach(([fq, peak]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
        g.gain.setValueAtTime(peak, t + dur - 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        // the pea: AM flutter on the gain
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 28; lg.gain.value = peak * 0.6;
        lfo.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.02); lfo.start(t); lfo.stop(t + dur + 0.02);
      });
      // pitch sag: the lungs giving out
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sawtooth';
      s.frequency.setValueAtTime(2100, t);
      s.frequency.exponentialRampToValueAtTime(1200, t + dur);
      sg.gain.setValueAtTime(0.04, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(sg); sg.connect(sfxBus); s.start(t); s.stop(t + dur + 0.02);
      // breath puff at the attack
      const nz = noise(0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 3000;
        ng.gain.setValueAtTime(0.12, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.12);
      }
    }
    function unionBullhorn() {
      // THE BULLHORN (Steve 2026-10-06): "STAND TOGETHER!" through a megaphone
      // that hates you. Two nasal blasts (square through a 1500Hz bandpass =
      // cheap plastic horn), a feedback ring blooming over them, and the
      // chant already starting underneath. Solidarity has a sound, and it
      // is loud.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [0, 0.3].forEach((dt, i) => {
        const dur = i === 1 ? 0.34 : 0.22;
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 523;
        bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 2.5;
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.22, t + dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + dur);
        o.connect(bp); bp.connect(g); g.connect(sfxBus);
        o.start(t + dt); o.stop(t + dt + dur + 0.02);
      });
      // feedback: the horn hears itself, wobbling
      const f = ctx.createOscillator(), fg = ctx.createGain();
      f.type = 'sine';
      f.frequency.setValueAtTime(3050, t);
      f.frequency.exponentialRampToValueAtTime(3350, t + 0.8);
      const fl = ctx.createOscillator(), flg = ctx.createGain();
      fl.type = 'sine'; fl.frequency.value = 5.5; flg.gain.value = 60;
      fl.connect(flg); flg.connect(f.frequency);
      fg.gain.setValueAtTime(0.0001, t + 0.1);
      fg.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
      fg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      f.connect(fg); fg.connect(sfxBus);
      f.start(t); f.stop(t + 0.95); fl.start(t); fl.stop(t + 0.95);
      // the chant starts under it — and then it disagrees with itself: the
      // line answers back in the wrong notes — a minor second and a tritone
      // off, each arriving late. Solidarity, arguing.
      [110, 98].forEach((fq, i) => {
        const dt = t + 0.15 + i * 0.26;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.08, dt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.22);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.24);
      });
      [[116.5, 0.45], [155.6, 0.62], [123.5, 0.79]].forEach(([fq, dt]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.06, t + dt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.3);
        o.connect(g); g.connect(sfxBus); o.start(t + dt); o.stop(t + dt + 0.32);
      });
      // the feedback bites back: a 60Hz square chewing at the horn's ring
      const rm = ctx.createOscillator(), rmg = ctx.createGain();
      rm.type = 'square'; rm.frequency.value = 60; rmg.gain.value = 0.02;
      rm.connect(rmg); rmg.connect(fg.gain);
      rm.start(t); rm.stop(t + 0.95);
      // the stomp under the chant: the line is moving
      thump(t + 0.2, 0.4); thump(t + 0.5, 0.45); thump(t + 0.8, 0.4);
    }
    function unionWalkout() {
      // THE WALKOUT (Steve 2026-10-06): the rep climbs onto the bullhorn and
      // stops fighting entirely. First the fight's noise thins — a low
      // receding rumble, near-silence — then the picket-line stomp: four
      // floor-shaking thuds under a rising wail made of two voices that
      // can't quite agree, never resolving. It is not attacking you anymore.
      // That is somehow worse.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the thinning: everything drops away
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sine';
      r.frequency.setValueAtTime(90, t);
      r.frequency.exponentialRampToValueAtTime(38, t + 0.7);
      rg.gain.setValueAtTime(0.14, t);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      r.connect(rg); rg.connect(sfxBus); r.start(t); r.stop(t + 0.8);
      // the stomp: picket-line cadence
      [0.5, 0.85, 1.2, 1.55].forEach((dt) => {
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'sine'; s.frequency.value = 52;
        sg.gain.setValueAtTime(0.0001, t + dt);
        sg.gain.exponentialRampToValueAtTime(0.3, t + dt + 0.02);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
        s.connect(sg); sg.connect(sfxBus); s.start(t + dt); s.stop(t + dt + 0.3);
      });
      // the wail: two voices rising, never agreeing, never resolving
      [[280, 880, 420], [281.5, 883, 421]].forEach(([f0, f1, f2]) => {
        const w = ctx.createOscillator(), wg = ctx.createGain();
        w.type = 'sawtooth';
        w.frequency.setValueAtTime(f0, t + 0.6);
        w.frequency.linearRampToValueAtTime(f1, t + 1.6);
        w.frequency.linearRampToValueAtTime(f2, t + 2.2);
        wg.gain.setValueAtTime(0.0001, t + 0.6);
        wg.gain.exponentialRampToValueAtTime(0.07, t + 1.0);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
        w.connect(wg); wg.connect(sfxBus); w.start(t + 0.6); w.stop(t + 2.35);
      });
    }
    function unionPicket() {
      // THE PICKET LINE (Steve 2026-10-06): a wave-1 monster lumbers in
      // holding a tiny sign. Shuffling steps, the sign's squeaky waggle —
      // and then the worst part: it joins the chant. Wrong. A tritone off
      // the line, proud of itself.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // shuffles: three dragged steps
      [0, 0.28, 0.56].forEach((dt) => {
        const nz = noise(0.3), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(1200, t + dt);
        nf.frequency.exponentialRampToValueAtTime(400, t + dt + 0.22);
        ng.gain.setValueAtTime(0.0001, t + dt);
        ng.gain.exponentialRampToValueAtTime(0.16, t + dt + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.24);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + dt); nz.stop(t + dt + 0.26);
      });
      // the sign waggle: thin, squeaky, wobbling
      const sq = ctx.createOscillator(), sqg = ctx.createGain();
      sq.type = 'sine';
      sq.frequency.setValueAtTime(2400, t + 0.7);
      sq.frequency.linearRampToValueAtTime(3100, t + 1.3);
      const sql = ctx.createOscillator(), sqlg = ctx.createGain();
      sql.type = 'sine'; sql.frequency.value = 7; sqlg.gain.value = 120;
      sql.connect(sqlg); sqlg.connect(sq.frequency);
      sqg.gain.setValueAtTime(0.0001, t + 0.7);
      sqg.gain.exponentialRampToValueAtTime(0.05, t + 0.85);
      sqg.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
      sq.connect(sqg); sqg.connect(sfxBus);
      sq.start(t + 0.7); sq.stop(t + 1.4); sql.start(t + 0.7); sql.stop(t + 1.4);
      // the chant, joined WRONG: the line's 110Hz against a proud tritone
      [0.85, 1.15].forEach((dt) => {
        [110, 155.5].forEach((fq) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = fq;
          const peak = fq === 155.5 ? 0.09 : 0.06;
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(peak, t + dt + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.26);
          o.connect(g); g.connect(sfxBus); o.start(t + dt); o.stop(t + dt + 0.28);
        });
      });
    }
    function understudyWatch() {
      // THE WATCH (Steve 2026-10-06): a blank shape at the tree line,
      // watching. Learning. Quiet paper scratches — it is taking notes, in
      // your handwriting — under a thin tone that rises like a question,
      // trying to be a voice. Not quite. A second scratch answers the
      // first: it is practicing your rhythm.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [0, 0.35, 0.62, 1.05].forEach((dt) => {
        const nz = noise(0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'bandpass'; nf.frequency.value = 2800; nf.Q.value = 3;
        ng.gain.setValueAtTime(0.0001, t + dt);
        ng.gain.exponentialRampToValueAtTime(0.07, t + dt + 0.04);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + dt); nz.stop(t + dt + 0.18);
      });
      // the almost-voice: thin, rising like a question, wobbling
      const v = ctx.createOscillator(), vg = ctx.createGain();
      v.type = 'sine';
      v.frequency.setValueAtTime(620, t + 0.2);
      v.frequency.linearRampToValueAtTime(950, t + 1.1);
      const vl = ctx.createOscillator(), vlg = ctx.createGain();
      vl.type = 'sine'; vl.frequency.value = 5; vlg.gain.value = 25;
      vl.connect(vlg); vlg.connect(v.frequency);
      vg.gain.setValueAtTime(0.0001, t + 0.2);
      vg.gain.exponentialRampToValueAtTime(0.05, t + 0.5);
      vg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      v.connect(vg); vg.connect(sfxBus);
      v.start(t + 0.2); v.stop(t + 1.25); vl.start(t + 0.2); vl.stop(t + 1.25);
      // the echo: a second tone almost in unison, beating while they overlap
      const e = ctx.createOscillator(), eg = ctx.createGain();
      e.type = 'triangle'; e.frequency.value = 622.5;
      eg.gain.setValueAtTime(0.0001, t + 0.25);
      eg.gain.exponentialRampToValueAtTime(0.03, t + 0.4);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      e.connect(eg); eg.connect(sfxBus); e.start(t + 0.25); e.stop(t + 0.85);
    }
    function understudyRehearse() {
      // THE REHEARSAL (Steve 2026-10-06): it is doing the thing you do
      // before you do it. Badly. But recognizably. A tone starts at the
      // right pitch and slides off, wobbling as it tries; the retry comes
      // closer but sour — a beating pair that can't quite lock. Then a
      // small frustrated puff of breath.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const attempt = (f0, f1, dt, peak) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f0, dt);
        o.frequency.exponentialRampToValueAtTime(f1, dt + 0.3);
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 7; lg.gain.value = 10;
        lfo.connect(lg); lg.connect(o.frequency); // the trying wobble
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(peak, dt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.34);
        o.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.36); lfo.start(dt); lfo.stop(dt + 0.36);
      };
      attempt(440, 415, t, 0.1);            // the right pitch, sliding off
      attempt(445, 438, t + 0.4, 0.09);     // trying again...
      attempt(447.8, 443, t + 0.4, 0.09);   // ...closer, but sour: beats
      // frustrated puff
      const nz = noise(0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 800;
        ng.gain.setValueAtTime(0.09, t + 0.75);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.75); nz.stop(t + 1.0);
      }
    }
    function understudyPerform() {
      // THE PERFORMANCE (Steve 2026-10-06): "I've got it now." The confident
      // copy — the exact mirror, then the mockery, colder: the beating pair
      // with a ring-modulated edge, over a low drone that locks in like a
      // held breath. It stands the way you stand now.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const voice = (fq, dt, dur, peak, type) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'sawtooth'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(peak, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + dur);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + dur + 0.02);
      };
      voice(523, t, 0.16, 0.1);              // the mirror: exact
      const dt2 = t + 0.18;
      voice(554, dt2, 0.22, 0.09);           // the mockery
      voice(557.2, dt2, 0.22, 0.09);         // sour: beating
      // cold edge: ring-modulated shimmer on the mockery
      const sh = ctx.createOscillator(), shg = ctx.createGain();
      sh.type = 'triangle'; sh.frequency.value = 1108;
      const am = ctx.createOscillator(), amg = ctx.createGain();
      am.type = 'sine'; am.frequency.value = 23; amg.gain.value = 0.03;
      am.connect(amg); amg.connect(shg.gain);
      shg.gain.setValueAtTime(0.03, dt2);
      shg.gain.exponentialRampToValueAtTime(0.0001, dt2 + 0.28);
      sh.connect(shg); shg.connect(sfxBus);
      sh.start(dt2); sh.stop(dt2 + 0.3); am.start(dt2); am.stop(dt2 + 0.3);
      // the held breath: a low drone locking in under it all
      const dr = ctx.createOscillator(), drg = ctx.createGain();
      dr.type = 'sine';
      dr.frequency.setValueAtTime(65, t);
      dr.frequency.linearRampToValueAtTime(65.8, t + 0.6);
      drg.gain.setValueAtTime(0.0001, t);
      drg.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
      drg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      dr.connect(drg); drg.connect(sfxBus); dr.start(t); dr.stop(t + 0.85);
    }
    function landlordSpread() {
      // THE ADDENDUM (Steve 2026-10-06): "this agreement now covers a WIDER
      // AREA." The claim widening, bigger than the brass note: three
      // detuned saws spreading apart as they rise, the ground itself
      // rumbling lower, paperwork rustling over it all. The safe ground
      // shrinks and you can hear it.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [[110, 0.09], [110.7, 0.08], [111.4, 0.07]].forEach(([fq, peak]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 1.5, t + 1.0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.15);
      });
      // the ground, giving way
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sine';
      r.frequency.setValueAtTime(48, t);
      r.frequency.exponentialRampToValueAtTime(30, t + 0.9);
      rg.gain.setValueAtTime(0.0001, t);
      rg.gain.exponentialRampToValueAtTime(0.2, t + 0.2);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      r.connect(rg); rg.connect(sfxBus); r.start(t); r.stop(t + 1.05);
      // paperwork over it all
      const nz = noise(1.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 2500;
        ng.gain.setValueAtTime(0.0001, t + 0.1);
        ng.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.1); nz.stop(t + 1.15);
      }
    }
    function landlordEvict() {
      // THE EVICTION (Steve 2026-10-06): "EVICTION NOTICE. It serves the
      // paperwork. Personally." Three hammer knocks driving the sign into
      // the dirt — the last one landing crooked, beating wrong — then the
      // deep stamp of finality, then the paper sliding across. It always
      // had your name on it.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [0, 0.2, 0.4].forEach((dt, i) => {
        const last = i === 2;
        // knock: thump + woody crack; the last knock lands crooked
        [95, last ? 96.5 : 95].forEach((fq, k) => {
          if (k === 1 && !last) return;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(fq, t + dt);
          o.frequency.exponentialRampToValueAtTime(50, t + dt + 0.1);
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(last ? 0.22 : 0.25, t + dt + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
          o.connect(g); g.connect(sfxBus); o.start(t + dt); o.stop(t + dt + 0.18);
        });
        const nz = noise(0.15), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (nz) {
          nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 2;
          ng.gain.setValueAtTime(0.12, t + dt);
          ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.08);
          nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
          nz.start(t + dt); nz.stop(t + dt + 0.1);
        }
      });
      // the stamp of finality
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine';
      s.frequency.setValueAtTime(90, t + 0.65);
      s.frequency.exponentialRampToValueAtTime(45, t + 0.8);
      sg.gain.setValueAtTime(0.0001, t + 0.65);
      sg.gain.exponentialRampToValueAtTime(0.3, t + 0.68);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      s.connect(sg); sg.connect(sfxBus); s.start(t + 0.65); s.stop(t + 1.0);
      // the paper, sliding across
      const pz = noise(0.4), pf = ctx.createBiquadFilter(), pg = ctx.createGain();
      if (pz) {
        pf.type = 'highpass'; pf.frequency.value = 4000;
        pg.gain.setValueAtTime(0.0001, t + 0.9);
        pg.gain.exponentialRampToValueAtTime(0.06, t + 1.0);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        pz.connect(pf); pf.connect(pg); pg.connect(sfxBus);
        pz.start(t + 0.9); pz.stop(t + 1.35);
      }
    }
    function hecklerHeadliner() {
      // THE HEADLINER (Steve 2026-10-06): "Oh, we've got a LIVE ONE!" The
      // show starts — a cheap spotlight fanfare that curdles: two rising
      // square tones with a mocking wobble, then the slide down into
      // something meaner, while a crowd that isn't there swells and is
      // gone. It has your number now.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [[392, 0], [523, 0.16]].forEach(([fq, dt]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = fq;
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 8; lg.gain.value = 18;
        lfo.connect(lg); lg.connect(o.frequency); // the mocking wobble
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.09, t + dt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.3);
        o.connect(g); g.connect(sfxBus);
        o.start(t + dt); o.stop(t + dt + 0.32); lfo.start(t + dt); lfo.stop(t + dt + 0.32);
      });
      // the curdle: the fanfare slides down into a jeer
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'sawtooth';
      c.frequency.setValueAtTime(523, t + 0.34);
      c.frequency.exponentialRampToValueAtTime(196, t + 0.7);
      cg.gain.setValueAtTime(0.0001, t + 0.34);
      cg.gain.exponentialRampToValueAtTime(0.1, t + 0.4);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      c.connect(cg); cg.connect(sfxBus); c.start(t + 0.34); c.stop(t + 0.8);
      // the crowd that isn't there
      const nz = noise(1), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 1200; nf.Q.value = 0.7;
        ng.gain.setValueAtTime(0.0001, t + 0.3);
        ng.gain.exponentialRampToValueAtTime(0.1, t + 0.55);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.3); nz.stop(t + 1.05);
      }
    }
    function hecklerJibe(d) {
      // THE JIBE (Steve 2026-10-06): it narrates your miss. A pointed,
      // descending jeer — sharper and higher the more shame is stacked,
      // the wobble quickening with it — ending in a nasty little flick of
      // noise. The laugh has notes, and every note is about you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const shame = Math.min(10, Math.max(0, (d && d.shame) || 0));
      const fq = 400 + shame * 60;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(fq, t);
      o.frequency.exponentialRampToValueAtTime(fq * 0.65, t + 0.22);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 10 + shame; lg.gain.value = 22;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.28); lfo.start(t); lfo.stop(t + 0.28);
      // the flick: a nasty little noise at the end
      const nz = noise(0.15), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 5000;
        ng.gain.setValueAtTime(0.08, t + 0.22);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.22); nz.stop(t + 0.34);
      }
    }
    function paparazzoExclusive() {
      // THE MONEY SHOT (Steve 2026-10-06): "GOT IT." The lens winds up — a
      // motor whirr climbing and wobbling — then the flash, bigger this
      // time, with the beating afterimage hanging longer, and underneath
      // a deep satisfied thump. It knows exactly where you'll go.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the wind-up: motor climbing
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sawtooth';
      w.frequency.setValueAtTime(500, t);
      w.frequency.exponentialRampToValueAtTime(1700, t + 0.5);
      const wl = ctx.createOscillator(), wlg = ctx.createGain();
      wl.type = 'sine'; wl.frequency.value = 13; wlg.gain.value = 60;
      wl.connect(wlg); wlg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(0.06, t + 0.15);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t); w.stop(t + 0.6); wl.start(t); wl.stop(t + 0.6);
      // the flash: white burst, personal
      const dur = 0.3, ft = t + 0.5;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
      const fg = ctx.createGain();
      fg.gain.setValueAtTime(0.4, ft);
      fg.gain.exponentialRampToValueAtTime(0.0001, ft + dur);
      src.connect(hp); hp.connect(fg); fg.connect(sfxBus);
      src.start(ft); src.stop(ft + dur);
      // afterimage: beating pair, hanging longer this time
      [3300, 3312].forEach((fq) => {
        const a = ctx.createOscillator(), ag = ctx.createGain();
        a.type = 'sine'; a.frequency.value = fq;
        ag.gain.setValueAtTime(0.0001, ft + 0.05);
        ag.gain.exponentialRampToValueAtTime(0.04, ft + 0.25);
        ag.gain.exponentialRampToValueAtTime(0.0001, ft + 1.6);
        a.connect(ag); ag.connect(sfxBus); a.start(ft + 0.05); a.stop(ft + 1.65);
      });
      // gotcha: the satisfied thump
      const th = ctx.createOscillator(), thg = ctx.createGain();
      th.type = 'sine';
      th.frequency.setValueAtTime(75, ft);
      th.frequency.exponentialRampToValueAtTime(42, ft + 0.25);
      thg.gain.setValueAtTime(0.0001, ft);
      thg.gain.exponentialRampToValueAtTime(0.22, ft + 0.04);
      thg.gain.exponentialRampToValueAtTime(0.0001, ft + 0.35);
      th.connect(thg); thg.connect(sfxBus); th.start(ft); th.stop(ft + 0.4);
    }
    function modNotice() {
      // THE REVIEW (Steve 2026-10-06): "CONTENT UNDER REVIEW." A cold boot
      // chime — two sterile sine pings, customer-service calm — under a
      // modem-handshake screech that climbs and never resolves. The machine
      // is reading everything you have ever done, and it is not impressed.
      // (freak pass 2026-10-08): the machine reads you FIRST — twelve tiny
      // accelerating ticks, your data being scanned — then the chime. The
      // handshake no longer rises smoothly: it climbs in hard digital
      // STEPS, stutter-gated, and when it cuts off the verdict lands flat:
      // two 110Hz DENIED blasts. The review is over. You failed it.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the reading: twelve ticks, accelerating — it is going through everything
      for (let i = 0; i < 12; i++) {
        const dt = t + i * 0.045 * (1 - i * 0.03);
        const tz = noise(0.03), tf = ctx.createBiquadFilter(), tg = ctx.createGain();
        if (!tz) break;
        tf.type = 'highpass'; tf.frequency.value = 4200;
        tg.gain.setValueAtTime(0.045, dt);
        tg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.025);
        tz.connect(tf); tf.connect(tg); tg.connect(sfxBus);
        tz.start(dt); tz.stop(dt + 0.035);
      }
      [880, 1174.7].forEach((fq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        const dt = t + i * 0.22;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.09, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.2);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.25);
      });
      // the handshake that never completes: rising in DIGITAL STEPS,
      // stutter-gated, cut off
      const h = ctx.createOscillator(), hg = ctx.createGain();
      h.type = 'sawtooth';
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const ft = t + 0.3 + (i / steps) * 0.8;
        h.frequency.setValueAtTime(300 * Math.pow(8, i / steps), ft); // 300 -> 2400 in steps
      }
      const hl = ctx.createOscillator(), hlg = ctx.createGain();
      hl.type = 'sine'; hl.frequency.value = 9; hlg.gain.value = 120;
      hl.connect(hlg); hlg.connect(h.frequency);
      // the stutter: a square gate chopping the handshake — the machine stammers
      const ch = ctx.createOscillator(), chg = ctx.createGain();
      ch.type = 'square'; ch.frequency.value = 12; chg.gain.value = 0.028;
      ch.connect(chg); chg.connect(hg.gain);
      const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1400; hf.Q.value = 2;
      hg.gain.setValueAtTime(0.0001, t + 0.3);
      hg.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
      h.connect(hf); hf.connect(hg); hg.connect(sfxBus);
      h.start(t + 0.3); h.stop(t + 1.2); hl.start(t + 0.3); hl.stop(t + 1.2);
      ch.start(t + 0.3); ch.stop(t + 1.2);
      // the verdict: flat, cold, twice
      [0, 0.22].forEach((d2) => {
        const dt = t + 1.2 + d2;
        const v = ctx.createOscillator(), vg = ctx.createGain();
        v.type = 'square'; v.frequency.value = 110;
        const vf = ctx.createBiquadFilter(); vf.type = 'lowpass'; vf.frequency.value = 900;
        vg.gain.setValueAtTime(0.0001, dt);
        vg.gain.exponentialRampToValueAtTime(0.11, dt + 0.02);
        vg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
        v.connect(vf); vf.connect(vg); vg.connect(sfxBus);
        v.start(dt); v.stop(dt + 0.18);
      });
    }
    function modNoted() {
      // THE RANGING TAP (Steve 2026-10-06): "Content noted." Almost gentle —
      // a rubber-stamp thump and a flat little blip, the sound of a box being
      // ticked. The politeness is the scary part.
      if (!ensure()) return;
      const t = ctx.currentTime;
      thump(t, 0.3);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(520, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(480, t + 0.16);
      g.gain.setValueAtTime(0.0001, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(sfxBus); o.start(t + 0.08); o.stop(t + 0.25);
    }
    function modMute() {
      // THE GAVEL (Steve 2026-10-06): a verb gets muted. A deep stamp-thud,
      // then a descending square wave spelling M-U-T-E-D, then paper shredding
      // — your options going through the machine.
      if (!ensure()) return;
      const t = ctx.currentTime;
      thump(t, 0.7);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(392, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(98, t + 0.5);
      g.gain.setValueAtTime(0.0001, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(sfxBus); o.start(t + 0.05); o.stop(t + 0.6);
      // the shred: your options, processed
      const nz = noise(0.4), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 4000;
        ng.gain.setValueAtTime(0.0001, t + 0.4);
        ng.gain.exponentialRampToValueAtTime(0.1, t + 0.5);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.4); nz.stop(t + 0.95);
      }
    }
    function modViolation(d) {
      // THE FLAG, ANGRIER (Steve 2026-10-07): bitcrushed buzzes, a detuned
      // fifth sliding up a semitone between buzzes (the second buzz knows
      // more about you), a 31Hz AM stutter — prime, alien throat-clearing —
      // and a paper-tear static sweep down before the stamp lands.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const v = Math.min(8, Math.max(0, (d && d.violations) || 1));
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(3 * x); }
      [0, 0.28].forEach((dt, i) => {
        const bb = ctx.createGain(); bb.connect(sfxBus);
        const f0 = 110 + v * 14 + i * 22;
        [[f0, 1], [f0 * 1.5, 1.0595]].forEach(([fq, slide]) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), ws = ctx.createWaveShaper();
          ws.curve = curve; ws.oversample = '2x';
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(fq, t + dt);
          o.frequency.exponentialRampToValueAtTime(fq * slide, t + dt + 0.22);
          o.connect(ws); ws.connect(g); g.connect(bb);
          g.gain.setValueAtTime(0.0001, t + dt);
          g.gain.exponentialRampToValueAtTime(0.08, t + dt + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.24);
          o.start(t + dt); o.stop(t + dt + 0.28);
        });
        const am = ctx.createOscillator(), amg = ctx.createGain();
        am.type = 'square'; am.frequency.value = 31; amg.gain.value = 0.6;
        am.connect(amg); amg.connect(bb.gain);
        am.start(t + dt); am.stop(t + dt + 0.28);
      });
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass';
        nf.frequency.setValueAtTime(6000, t + 0.5);
        nf.frequency.exponentialRampToValueAtTime(800, t + 0.75);
        ng.gain.setValueAtTime(0.0001, t + 0.5);
        ng.gain.exponentialRampToValueAtTime(0.1, t + 0.58);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.5); nz.stop(t + 0.85);
      }
      thump(t + 0.8, 0.5);
    }
    function modRemoval(d) {
      // THE NOTICE (Steve 2026-10-06): "REMOVAL IMMINENT." A send-whoosh —
      // filtered noise sweeping UP like something being filed away — into a
      // heavy impact. The final variant (Deplatform) adds a low tolling bell:
      // a period at the end of you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 3;
        nf.frequency.setValueAtTime(600, t);
        nf.frequency.exponentialRampToValueAtTime(5000, t + 0.4);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.14, t + 0.35);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.5);
      }
      thump(t + 0.4, 0.9);
      if (d && d.final) {
        // the toll: low bell, slightly detuned pair, long decay
        [98, 98.7, 147].forEach((fq) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = fq;
          g.gain.setValueAtTime(0.0001, t + 0.4);
          g.gain.exponentialRampToValueAtTime(0.1, t + 0.45);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
          o.connect(g); g.connect(sfxBus); o.start(t + 0.4); o.stop(t + 1.85);
        });
      }
    }
    function modShadow() {
      // THE SHADOWBAN (Steve 2026-10-06): the drone drops an octave into a
      // dark low hum, and the air gets sucked out — a reverse swell that
      // never lands. You are still here. Nobody can see you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const drop = ctx.createOscillator(), dg = ctx.createGain();
      drop.type = 'sawtooth';
      drop.frequency.setValueAtTime(220, t);
      drop.frequency.exponentialRampToValueAtTime(55, t + 0.8);
      const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 300;
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      drop.connect(df); df.connect(dg); dg.connect(sfxBus);
      drop.start(t); drop.stop(t + 1.05);
      // the hum that stays: two detuned lows, beating slowly, wrong
      [55, 56.3].forEach((fq) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.07, t + 1.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(g); g.connect(sfxBus); o.start(t + 0.7); o.stop(t + 2.25);
      });
    }
    function modDown() {
      // DEPLATFORMED (Steve 2026-10-06): the machine powers down. A descending
      // gliss that gives up halfway, a sad dial tone, and one wrong note that
      // hangs in the air after the machine is gone.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.8);
      // dial tone, then the wrong note
      [350, 440].forEach((fq) => {
        const d2 = ctx.createOscillator(), g2 = ctx.createGain();
        d2.type = 'sine'; d2.frequency.value = fq;
        g2.gain.setValueAtTime(0.0001, t + 0.8);
        g2.gain.exponentialRampToValueAtTime(0.05, t + 0.85);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        d2.connect(g2); g2.connect(sfxBus); d2.start(t + 0.8); d2.stop(t + 1.35);
      });
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine'; w.frequency.value = 466.2; // Bb — wrong on purpose
      wg.gain.setValueAtTime(0.0001, t + 1.2);
      wg.gain.exponentialRampToValueAtTime(0.06, t + 1.4);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      w.connect(wg); wg.connect(sfxBus); w.start(t + 1.2); w.stop(t + 2.45);
    }
    function glasswingLand() {
      // CRASH: dirt thud + tangled wing buzz — then the glass talks back:
      // inharmonic shard-pings, randomly detuned, dying fast. The last thing
      // you hear is a low wrong resonance settling into the dirt.
      // (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime;
      thump(t, 0.5);
      const nz = noise(0.4), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 2500;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.45);
      }
      // shard pings: inharmonic, detuned, dying fast (a tritone apart — wrong)
      [4150, 5870, 7230].forEach((fq, i) => {
        const dt = t + 0.08 + i * 0.07;
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = fq * (1 + (Math.random() - 0.5) * 0.01);
        const pdur = 0.5 - i * 0.1;
        pg.gain.setValueAtTime(0.12 - i * 0.03, dt);
        pg.gain.exponentialRampToValueAtTime(0.0001, dt + pdur);
        p.connect(pg); pg.connect(sfxBus);
        p.start(dt); p.stop(dt + pdur + 0.05);
      });
      // wrong resonance: a low glass tone that shouldn't exist — shivering as it settles
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'triangle'; r.frequency.value = 233; // Bb3, against everything
      const rl = ctx.createOscillator(), rlg = ctx.createGain();
      rl.type = 'sine'; rl.frequency.value = 4.5; rlg.gain.value = 9;
      rl.connect(rlg); rlg.connect(r.frequency);
      rg.gain.setValueAtTime(0.0001, t + 0.15);
      rg.gain.exponentialRampToValueAtTime(0.08, t + 0.3);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      r.connect(rg); rg.connect(sfxBus);
      r.start(t + 0.15); r.stop(t + 1.05); rl.start(t + 0.15); rl.stop(t + 1.05);
    }
    function glasswingClimb() {
      // RISING BUZZ: a detuned saw pair climbing in almost-unison — glass
      // wings beat wrong — with an AM buzz-undertone you feel in your teeth
      // and an airy swell. It goes back up. It will circle again.
      // (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      [[200, 650], [203, 659.5]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(2200, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
      });
      // buzz undertone: AM'd low square, the wingbeat you feel
      const b = ctx.createOscillator(), bg = ctx.createGain();
      const bl = ctx.createOscillator(), blg = ctx.createGain();
      b.type = 'square'; b.frequency.setValueAtTime(80, t);
      b.frequency.exponentialRampToValueAtTime(160, t + dur);
      bl.type = 'sine'; bl.frequency.value = 22; blg.gain.value = 0.04;
      bl.connect(blg); blg.connect(bg.gain);
      bg.gain.setValueAtTime(0.06, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      b.connect(bg); bg.connect(sfxBus);
      b.start(t); b.stop(t + dur + 0.05); bl.start(t); bl.stop(t + dur + 0.05);
      // airy swell
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.setValueAtTime(1800, t);
        nf.frequency.exponentialRampToValueAtTime(3600, t + dur); nf.Q.value = 1.2;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.10, t + dur * 0.7);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05);
      }
    }
    function glasswingShadowClose(d) {
      // THE SHADOW CLOSES IN (Steve 2026-10-06): the glasswing's pre-combat
      // dive shadow darkens over turns — audible, escalating. Each turn the
      // whine drops lower, the dissonance thickens, and the air gets heavier:
      // faint → darker → almost black. The sky is falling and it has a sound.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.8;
      const turns = Math.min(3, Math.max(1, (d && d.turns) || 1));
      // descending glass whine: lower and more present each turn
      const base = 1800 - turns * 350;
      [[1, 0.10], [1.021, 0.07]].forEach(([det, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(base * det, t);
        o.frequency.exponentialRampToValueAtTime(base * det * 0.55, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol + turns * 0.03, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
      });
      // thickening dissonance: inharmonic partials stack with the turns
      for (let i = 0; i < turns; i++) {
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = base * [2.76, 5.40, 7.93][i];
        pg.gain.setValueAtTime(0.0001, t);
        pg.gain.exponentialRampToValueAtTime(0.035, t + dur * 0.5);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        p.connect(pg); pg.connect(sfxBus);
        p.start(t); p.stop(t + dur + 0.05);
      }
      // air displacement: the shadow has weight, more each turn
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(500 + turns * 300, t);
        nf.frequency.exponentialRampToValueAtTime(200, t + dur);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.10 + turns * 0.04, t + dur * 0.7);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05);
      }
    }

    // ============ WAVE 2 GROUP B: corporate horrors audio ============
    function hypeInflate() {
      // SWELLING BAGPIPE OF ENCOURAGEMENT: a drone that never quite tunes, a
      // reedy chanter rising against it with vibrato, and a fifth-away voice
      // cheering at the wrong pitch, flat by design — plus the lungs behind
      // it. The hype_horn means well. It is unbearable.
      // (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.0;
      // drone: low, constant, slightly sour
      const dr = ctx.createOscillator(), drg = ctx.createGain();
      dr.type = 'sawtooth'; dr.frequency.value = 110;
      const drf = ctx.createBiquadFilter(); drf.type = 'lowpass'; drf.frequency.value = 500;
      drg.gain.setValueAtTime(0.0001, t);
      drg.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.5);
      drg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      dr.connect(drf); drf.connect(drg); drg.connect(sfxBus);
      dr.start(t); dr.stop(t + dur + 0.15);
      // chanter: rising, reedy, with vibrato
      const ch = ctx.createOscillator(), chg = ctx.createGain();
      ch.type = 'sawtooth';
      ch.frequency.setValueAtTime(220, t);
      ch.frequency.exponentialRampToValueAtTime(440, t + dur);
      const chl = ctx.createOscillator(), chlg = ctx.createGain();
      chl.type = 'sine'; chl.frequency.value = 6; chlg.gain.value = 12;
      chl.connect(chlg); chlg.connect(ch.frequency);
      const chf = ctx.createBiquadFilter(); chf.type = 'bandpass'; chf.frequency.value = 900; chf.Q.value = 2;
      chg.gain.setValueAtTime(0.0001, t);
      chg.gain.exponentialRampToValueAtTime(0.10, t + dur * 0.6);
      chg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      ch.connect(chf); chf.connect(chg); chg.connect(sfxBus);
      ch.start(t); ch.stop(t + dur + 0.05); chl.start(t); chl.stop(t + dur + 0.05);
      // wrong fifth: cheering at the wrong pitch, flat by design
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'triangle';
      w.frequency.setValueAtTime(164.8 * 0.985, t); // E3, 26 cents flat
      w.frequency.exponentialRampToValueAtTime(329.6 * 0.985, t + dur);
      wg.gain.setValueAtTime(0.0001, t + 0.15);
      wg.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.7);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t + 0.15); w.stop(t + dur + 0.05);
      // breath: the lungs behind it
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 700;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.08, t + dur * 0.5);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05);
      }
    }
    function hypeDetonate() {
      // sonic encouragement detonation: big boom + ringing.
      // (deepened Steve 2026-10-06): this is FEARED, not festive — the boom
      // is a detuned cluster of wrong lows (a tritone apart, the System's
      // favorite interval), the shrapnel is irregular, and the after-ring
      // comes back twice, quieter, like it's checking you heard it.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      // the wrong boom: detuned cluster, tritone apart
      [[160, 38], [164.8, 39], [226.3, 54]].forEach(([f0, f1], i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i === 0 ? 0.5 : 0.22, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
      });
      // shrapnel: irregular metallic fragments, never evenly spaced
      [0.06, 0.19, 0.23, 0.41, 0.58].forEach((dt, i) => {
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'square';
        s.frequency.value = 1900 + (i * 977) % 2400; // deterministic, uneven
        sg.gain.setValueAtTime(0.0001, t + dt);
        sg.gain.exponentialRampToValueAtTime(0.06, t + dt + 0.01);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.09);
        s.connect(sg); sg.connect(sfxBus);
        s.start(t + dt); s.stop(t + dt + 0.12);
      });
      // the check-back: two quieter rings, asking if you heard
      [0.75, 1.25].forEach((dt, i) => {
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'triangle'; o2.frequency.setValueAtTime(1240, t + dt);
        g2.gain.setValueAtTime(0.0001, t + dt);
        g2.gain.exponentialRampToValueAtTime(i === 0 ? 0.10 : 0.05, t + dt + 0.08);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.7);
        o2.connect(g2); g2.connect(sfxBus);
        o2.start(t + dt); o2.stop(t + dt + 0.75);
      });
    }
    function hypeDeflate() {
      // sad trombone deflate: descending wah-wah.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(90, t + dur);
      // wah-wah wobble
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 6; lg.gain.value = 40;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.20, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
          // (deepened Steve 2026-10-06): the deflate leaks air — a bandpass hiss
      // sinking with the trombone — and a second trombone, detuned flat,
      // tries to follow and can't. The hype dies in public.
      const hz = noise(dur), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
      if (hz) {
        hf.type = 'bandpass'; hf.Q.value = 1.5;
        hf.frequency.setValueAtTime(1800, t);
        hf.frequency.exponentialRampToValueAtTime(300, t + dur); // air sinking
        hg.gain.setValueAtTime(0.0001, t);
        hg.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        hz.connect(hf); hf.connect(hg); hg.connect(sfxBus);
        hz.start(t); hz.stop(t + dur);
      }
      const t2 = ctx.createOscillator(), t2g = ctx.createGain(); // the flat echo
      t2.type = 'sawtooth';
      t2.frequency.setValueAtTime(308, t + 0.12); // a semitone flat, late
      t2.frequency.exponentialRampToValueAtTime(86, t + dur);
      const t2l = ctx.createOscillator(), t2lg = ctx.createGain();
      t2l.type = 'sine'; t2l.frequency.value = 6.7; t2lg.gain.value = 38;
      t2l.connect(t2lg); t2lg.connect(t2.frequency);
      const t2f = ctx.createBiquadFilter(); t2f.type = 'lowpass'; t2f.frequency.value = 800;
      t2g.gain.setValueAtTime(0.0001, t + 0.12);
      t2g.gain.exponentialRampToValueAtTime(0.12, t + 0.22);
      t2g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      t2.connect(t2f); t2f.connect(t2g); t2g.connect(sfxBus);
      t2.start(t + 0.12); t2l.start(t + 0.12);
      t2.stop(t + dur + 0.15); t2l.stop(t + dur + 0.15);
    }
    function holdMusic(d) {
      // muzak from nowhere: tinny, looping, wrong. Two detuned triangles.
      // (deepened Steve 2026-10-06): now hears { broken } (the tape warps —
      // pitch wobbles, notes drop out) and { watching } (hushed, one voice
      // leaning on a wrong fifth). These are the service_mimic's moods.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.6;
      const broken = !!(d && d.broken), watching = !!(d && d.watching);
      const notes = [392, 440, 523, 440];
      if (watching) notes[2] = 523 * 1.5 * 1.02; // a wrong fifth, slightly off
      notes.forEach((fr, i) => {
        const dt = t + i * 0.38;
        if (broken && Math.random() < 0.3) return; // tape dropout
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(fr * 1.01, dt); // slightly sharp = wrong
        if (broken) { // the tape warps mid-note: wobble + sag
          const wb = ctx.createOscillator(), wbg = ctx.createGain();
          wb.type = 'sine'; wb.frequency.value = 1.7; wbg.gain.value = fr * 0.045;
          wb.connect(wbg); wbg.connect(o.frequency);
          o.frequency.exponentialRampToValueAtTime(fr * 0.93, dt + 0.34);
          wb.start(dt); wb.stop(dt + 0.4);
        }
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(watching ? 0.05 : 0.10, dt + 0.05); // hushed when watching
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.36);
        // telephone bandpass: it comes through a headset
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 1.2;
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.4);
      });
    }
    function lineCut() {
      // the voice cuts out: abrupt digital dropout + click.
      // (deepened Steve 2026-10-06): the line tries to come back — two
      // fragments at falling pitch, the first with a detuned twin beating
      // against it, the second sweeping down hard and cut shorter. Then it
      // gives up. The System doesn't redial. It just stops trying.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.setValueAtTime(0.14, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.2);
      // click
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.setValueAtTime(2400, t + 0.13);
      g2.gain.setValueAtTime(0.12, t + 0.13);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o2.connect(g2); g2.connect(sfxBus);
      o2.start(t + 0.13); o2.stop(t + 0.25);
      // the retries: it tries to re-establish, twice, failing
      const r1t = t + 0.45, r1f = 660, r1d = 0.16;
      const r1a = ctx.createOscillator(), r1b = ctx.createOscillator(), r1g = ctx.createGain();
      r1a.type = 'square'; r1b.type = 'square';
      r1a.frequency.setValueAtTime(r1f, r1t);
      r1b.frequency.setValueAtTime(r1f * 1.008, r1t); // beating twin — the voice arguing with itself
      r1a.frequency.exponentialRampToValueAtTime(r1f * 0.94, r1t + r1d); // sagging as it dies
      r1b.frequency.exponentialRampToValueAtTime(r1f * 0.94 * 1.008, r1t + r1d);
      r1g.gain.setValueAtTime(0.0001, r1t);
      r1g.gain.exponentialRampToValueAtTime(0.09, r1t + 0.02);
      r1g.gain.exponentialRampToValueAtTime(0.0001, r1t + r1d);
      r1a.connect(r1g); r1b.connect(r1g); r1g.connect(sfxBus);
      r1a.start(r1t); r1b.start(r1t); r1a.stop(r1t + r1d + 0.02); r1b.stop(r1t + r1d + 0.02);
      // second try: shorter, falling hard, cut dead
      const r2t = t + 0.78, r2f = 440, r2d = 0.10;
      const r2 = ctx.createOscillator(), r2g = ctx.createGain();
      r2.type = 'square';
      r2.frequency.setValueAtTime(r2f, r2t);
      r2.frequency.exponentialRampToValueAtTime(r2f * 0.55, r2t + r2d); // 1.8x fall — then nothing
      r2g.gain.setValueAtTime(0.09, r2t);
      r2g.gain.exponentialRampToValueAtTime(0.0001, r2t + r2d);
      r2.connect(r2g); r2g.connect(sfxBus);
      r2.start(r2t); r2.stop(r2t + r2d + 0.02);
    }
    function paperRustle(data) {
      // dry paper unfolding: filtered noise bursts.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const binding = data && data.binding;
      const bursts = binding ? 5 : 3;
      for (let i = 0; i < bursts; i++) {
        const dt = t + i * (binding ? 0.16 : 0.22);
        const dur = 0.18;
        const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let s = 0; s < ch.length; s++) ch[s] = (Math.random() * 2 - 1) * (1 - s / ch.length);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = binding ? 2500 : 3200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(binding ? 0.20 : 0.13, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + dur);
        src.connect(f); f.connect(g); g.connect(sfxBus);
        src.start(dt);
      }
      if (binding) {
        // low tightening tone under the rustle: the clauses closing.
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 1.05);
      }
    }
    function baskCharge(d) {
      // HEAT SHIMMER: triangle rising, brighter with charge — plus a tremolo
      // that quickens as the charge builds, a sub pulse you feel in your
      // teeth, and a faint inharmonic shimmer. The air bends before the
      // basker moves. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.6;
      const ch = Math.min(3, (d && d.charge) || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(500 + ch * 120, t);
      o.frequency.exponentialRampToValueAtTime(900 + ch * 200, t + dur);
      // tremolo quickens with charge
      const tr = ctx.createOscillator(), trg = ctx.createGain();
      tr.type = 'sine'; tr.frequency.value = 6 + ch * 4; trg.gain.value = 0.03;
      tr.connect(trg); trg.connect(g.gain);
      const peak = 0.06 + ch * 0.05;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05); tr.start(t); tr.stop(t + dur + 0.05);
      // sub pulse: the heat you feel
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine'; s.frequency.value = 55;
      const sl = ctx.createOscillator(), slg = ctx.createGain();
      sl.type = 'square'; sl.frequency.value = 3 + ch * 2; slg.gain.value = 0.03;
      sl.connect(slg); slg.connect(sg.gain);
      sg.gain.setValueAtTime(0.05, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(sg); sg.connect(sfxBus);
      s.start(t); s.stop(t + dur + 0.05); sl.start(t); sl.stop(t + dur + 0.05);
      // inharmonic shimmer: wrong partial of the rising tone
      const sh = ctx.createOscillator(), shg = ctx.createGain();
      sh.type = 'sine';
      sh.frequency.setValueAtTime((500 + ch * 120) * 2.76, t);
      sh.frequency.exponentialRampToValueAtTime((900 + ch * 200) * 2.76, t + dur);
      shg.gain.setValueAtTime(0.0001, t);
      shg.gain.exponentialRampToValueAtTime(0.025, t + dur * 0.7);
      shg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      sh.connect(shg); shg.connect(sfxBus);
      sh.start(t); sh.stop(t + dur + 0.05);
    }
    function baskBreak() {
      // THE CHARGE KNOCKED OUT: a descending zap — but it arcs, it crackles,
      // it tears on the way down, and the collapse has a tail. Nothing about
      // alien sunlight is clean. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.3;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(800, t);
      o.frequency.exponentialRampToValueAtTime(150, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
      // arc crackle: noise torn by a square gate
      const nz = noise(dur + 0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 1800;
        const gl = ctx.createOscillator(), glg = ctx.createGain();
        gl.type = 'square'; gl.frequency.value = 41; glg.gain.value = 0.08;
        gl.connect(glg); glg.connect(ng.gain);
        ng.gain.setValueAtTime(0.12, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.2); gl.start(t); gl.stop(t + dur + 0.2);
      }
      // collapse tail: a low sine sinking past where it should stop
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'sine';
      c.frequency.setValueAtTime(220, t + dur * 0.5);
      c.frequency.exponentialRampToValueAtTime(55, t + dur + 0.5);
      cg.gain.setValueAtTime(0.0001, t + dur * 0.5);
      cg.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.7);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.55);
      c.connect(cg); cg.connect(sfxBus);
      c.start(t + dur * 0.5); c.stop(t + dur + 0.6);
    }
    function baskFlatten() {
      // FLATTENING: the basker lets go — air sighs out (hiss falling), the
      // body-tone deflates, a low squash lands it, and one wrong wobble at
      // the end says the dirt is surprised too. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.6;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(400, t);
      o.frequency.exponentialRampToValueAtTime(120, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
      // escaping air
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(2500, t);
        nf.frequency.exponentialRampToValueAtTime(500, t + dur);
        ng.gain.setValueAtTime(0.14, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05);
      }
      // squash: the body meets the dirt
      thump(t + dur * 0.7, 0.35);
      // wobble: one wrong oscillation, decaying
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'triangle'; w.frequency.value = 97;
      const wl = ctx.createOscillator(), wlg = ctx.createGain();
      wl.type = 'sine'; wl.frequency.value = 9; wlg.gain.value = 25;
      wl.connect(wlg); wlg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t + dur * 0.8);
      wg.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.9);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t + dur * 0.8); w.stop(t + dur + 0.55);
      wl.start(t + dur * 0.8); wl.stop(t + dur + 0.55);
    }
    function sunbaskerBite() {
      // THE BITE LANDS (Steve 2026-10-07): the charge is spent — dull brown
      // again. All that stored sun discharged through the jaws at once, and
      // it sounds WRONG: not a chomp. First the molten pair — two detuned
      // triangles beating against each other as they collapse 600->90Hz,
      // the beating slowing as they converge (the gold cooling in real
      // time). Under it, an FM snarl: a 70Hz carrier chewed by a 55Hz
      // modulator, the jaw as a badly-tuned radio. Then the shear: three
      // glassy cracks, inharmonic and staggered, like cooling metal
      // splitting — and the after-hiss of heat leaving the scales, sighing
      // down into a dull thud. The basker is brown again. It is not sorry.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      // the molten pair: detuned triangles collapsing, beating slowing
      [612, 618].forEach(f0 => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.55);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.75);
      });
      // the snarl: FM jaw — 70Hz carrier, 55Hz modulator through a depth gain
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'sine'; c.frequency.value = 70;
      const md = ctx.createOscillator(), mg = ctx.createGain();
      md.type = 'sine'; md.frequency.value = 55; mg.gain.value = 40;
      md.connect(mg); mg.connect(c.frequency);
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.2, t + 0.06);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      c.connect(cg); cg.connect(sfxBus);
      c.start(t); c.stop(t + 0.65); md.start(t); md.stop(t + 0.65);
      // the shear: three glassy cracks, inharmonic, staggered
      [0.12, 0.31, 0.47].forEach((dt, i) => {
        const nz = noise(0.09), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'bandpass'; nf.frequency.value = 2800 + i * 1300; nf.Q.value = 9;
        ng.gain.setValueAtTime(0.14 - i * 0.03, t + dt);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.08);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + dt); nz.stop(t + dt + 0.1);
      });
      // the after-hiss: heat leaving the scales, sighing down
      const hz = noise(dur), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
      if (hz) {
        hf.type = 'lowpass';
        hf.frequency.setValueAtTime(6000, t + 0.2);
        hf.frequency.exponentialRampToValueAtTime(400, t + dur);
        hg.gain.setValueAtTime(0.0001, t + 0.2);
        hg.gain.exponentialRampToValueAtTime(0.1, t + 0.45);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        hz.connect(hf); hf.connect(hg); hg.connect(sfxBus);
        hz.start(t + 0.2); hz.stop(t + dur + 0.05);
      }
      // dull brown again: the thud of spent scales
      thump(t + 0.5, 0.3);
    }
    // beamBlocked: the beam dies against something real. Fizzle, not bang.
    function beamBlocked() {      if (!ensure()) return;
      stopCharge(); beamSweepStop();
      const t = ctx.currentTime;
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(1400, t);
        nf.frequency.exponentialRampToValueAtTime(180, t + 0.45);
        ng.gain.setValueAtTime(0.42, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.6);
      }
      const th = ctx.createOscillator(), thG = ctx.createGain();
      th.type = 'sine';
      th.frequency.setValueAtTime(95, t);
      th.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      thG.gain.setValueAtTime(0.35, t);
      thG.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      th.connect(thG); thG.connect(sfxBus);
      th.start(t); th.stop(t + 0.45);
    }
    // ============ AUDIO COMPLETION (Steve 2026-10-05): every audioEvent must
    // resolve to a real synth. These were silent no-ops — now they're not.
    // ---- ANIMALS: the hunt has sound ----
    function animalBite() {
      // TEETH: sharp snap + wet tear. Short, violent, animal.
      // (deepened Steve 2026-10-06): the tear is a minor-2nd pair ripping
      // in opposite directions — flesh doesn't tear clean — and the crunch
      // underneath is wet noise chewed by a stuttering gate, like the jaw
      // working.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // Snap: high click
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(1800, t);
      o.frequency.exponentialRampToValueAtTime(400, t + 0.08);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.12);
      // Tear: minor-2nd pair ripping apart — one up, one down
      [[800, 1180], [848, 660]].forEach(([f0, f1]) => {
        const to = ctx.createOscillator(), tg = ctx.createGain();
        const tf = ctx.createBiquadFilter();
        to.type = 'sawtooth';
        to.frequency.setValueAtTime(f0, t + 0.04);
        to.frequency.exponentialRampToValueAtTime(f1, t + 0.24);
        tf.type = 'bandpass'; tf.frequency.value = 900; tf.Q.value = 1.5;
        tg.gain.setValueAtTime(0.0001, t + 0.04);
        tg.gain.exponentialRampToValueAtTime(0.12, t + 0.09);
        tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        to.connect(tf); tf.connect(tg); tg.connect(sfxBus);
        to.start(t + 0.04); to.stop(t + 0.32);
      });
      // Crunch: wet noise chewed by a stuttering jaw-gate
      const nz = noise(0.35), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 900;
        const jg = ctx.createGain(); jg.gain.value = 0.15;
        const jaw = ctx.createOscillator(); jaw.type = 'square'; jaw.frequency.value = 31;
        jaw.connect(jg); jg.connect(ng.gain);
        ng.gain.setValueAtTime(0.2, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.05); nz.stop(t + 0.4);
        jaw.start(t + 0.05); jaw.stop(t + 0.4);
      }
    }
    function animalBolt() {
      // SCAMPER: fast rustling scramble, dopplering away.
      // (deepened Steve 2026-10-06): the scramble gets a detuned pair of
      // receding whistles — the animal crying out as it runs, two voices
      // that can't agree on the pitch of panic — under the footfall stutter.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'highpass'; nf.frequency.setValueAtTime(2000, t);
      nf.frequency.exponentialRampToValueAtTime(4000, t + dur); // receding = brighter, thinner
      ng.gain.setValueAtTime(0.28, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // Stutter the gain for footfalls
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'square'; lfo.frequency.value = 14;
      lg.gain.value = 0.12; lfo.connect(lg); lg.connect(ng.gain);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur);
      lfo.start(t); lfo.stop(t + dur);
      // panic whistles: detuned pair, receding and thinning
      [[2900, 3600], [2967, 3700]].forEach(([f0, f1]) => {
        const w = ctx.createOscillator(), wg = ctx.createGain();
        w.type = 'sine';
        w.frequency.setValueAtTime(f0, t);
        w.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
        wg.gain.setValueAtTime(0.0001, t);
        wg.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.85);
        w.connect(wg); wg.connect(sfxBus);
        w.start(t); w.stop(t + dur);
      });
    }
    function animalChatter() {
      // SQUIRREL: rapid angry clicks, scolding you from the branches.
      // (deepened Steve 2026-10-06): the scold has RHYTHM — it stops dead
      // mid-scold (did it hear something?), one click comes out TOO LOW
      // (wrong throat, wrong animal), and the branch knocks twice when it
      // stamps off. The anger is performed. The pause is real.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const clicks = [0, 0.09, 0.18, 0.27, 0.55, 0.64, 0.73]; // the pause is the gap
      clicks.forEach((off, i) => {
        const dt = t + off;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        const wrong = i === 4; // one click comes out too low
        o.frequency.setValueAtTime(wrong ? 900 : 2800 + Math.random() * 800, dt);
        o.frequency.exponentialRampToValueAtTime(wrong ? 500 : 1800, dt + 0.05);
        // the wrong click has a detuned partner: two throats in one scold
        if (wrong) {
          const w2 = ctx.createOscillator(), wg2 = ctx.createGain();
          w2.type = 'square';
          w2.frequency.setValueAtTime(954, dt); // semitone up, clashing
          w2.frequency.exponentialRampToValueAtTime(530, dt + 0.05);
          wg2.gain.setValueAtTime(0.09, dt);
          wg2.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
          w2.connect(wg2); wg2.connect(sfxBus); w2.start(dt); w2.stop(dt + 0.08);
        }
        g.gain.setValueAtTime(wrong ? 0.18 : 0.14, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.08);
      });
      // branch knocks: it stamps off, twice
      for (let i = 0; i < 2; i++) {
        const dt = t + 0.95 + i * 0.14;
        const k = ctx.createOscillator(), kg = ctx.createGain();
        k.type = 'sine'; k.frequency.setValueAtTime(320, dt);
        k.frequency.exponentialRampToValueAtTime(140, dt + 0.08);
        kg.gain.setValueAtTime(0.2, dt);
        kg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.1);
        k.connect(kg); kg.connect(sfxBus); k.start(dt); k.stop(dt + 0.12);
      }
    }
    function animalFlop() {
      // OPOSSUM FLOP: soft body-thud, then... nothing. The silence is the point.
      // (deepened Steve 2026-10-06): the silence is still the point — but
      // now it TWITCHES once (one tiny knock after the dead air), and the
      // heartbeat keeps going under the silence, quiet and steady: it's
      // faking. The body is still. The body is lying.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.3);
      // A tiny exhale — then dead air
      const nz = noise(0.15), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 500;
        ng.gain.setValueAtTime(0.1, t + 0.1);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.1); nz.stop(t + 0.28);
      }
      // the twitch: one tiny knock in the dead air
      const tw = ctx.createOscillator(), twg = ctx.createGain();
      tw.type = 'sine'; tw.frequency.setValueAtTime(300, t + 0.7);
      tw.frequency.exponentialRampToValueAtTime(120, t + 0.76);
      twg.gain.setValueAtTime(0.1, t + 0.7);
      twg.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
      tw.connect(twg); twg.connect(sfxBus); tw.start(t + 0.7); tw.stop(t + 0.8);
      // the lie: a heartbeat under the silence, quiet and steady — but the
      // second beat is slightly detuned: the lie has a tell
      [[1.0, 65], [1.45, 66.3]].forEach(([dt0, fq]) => {
        const dt = t + dt0;
        const hb = ctx.createOscillator(), hbg = ctx.createGain();
        hb.type = 'sine'; hb.frequency.setValueAtTime(fq, dt);
        hb.frequency.exponentialRampToValueAtTime(fq * 0.62, dt + 0.12);
        hbg.gain.setValueAtTime(0.09, dt);
        hbg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.18);
        hb.connect(hbg); hbg.connect(sfxBus); hb.start(dt); hb.stop(dt + 0.2);
      });
    }
    function animalPinch() {
      // CRAYFISH PINCH: tiny but vicious — a sharp click with a metallic ring.
      // (deepened Steve 2026-10-06): the ring now BEATS — two harmonics
      // clashing against each other (the claw is resonant in a way claws
      // shouldn't be) — and there's a wet snap BEFORE the click: the joint
      // loading. Small animal, wrong physics.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the wet snap first: the joint loading
      const wz = noise(0.06), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
      if (wz) {
        wf.type = 'lowpass'; wf.frequency.value = 1200;
        wg.gain.setValueAtTime(0.14, t - 0.06);
        wg.gain.exponentialRampToValueAtTime(0.0001, t);
        wz.connect(wf); wf.connect(wg); wg.connect(sfxBus);
        wz.start(t - 0.06); wz.stop(t + 0.01);
      }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(3200, t);
      o.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      // Metallic ring: TWO detuned high harmonics, beating — the wrong physics.
      // The ring shimmers: a slow wobble on its amplitude.
      const ringG = ctx.createGain();
      const rw = ctx.createOscillator(), rwg = ctx.createGain();
      rw.type = 'sine'; rw.frequency.value = 8; rwg.gain.value = 0.3;
      rw.connect(rwg); rwg.connect(ringG.gain);
      ringG.gain.setValueAtTime(1, t);
      ringG.connect(sfxBus);
      [5200, 5260].forEach(fq => {
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'sine'; o2.frequency.setValueAtTime(fq, t);
        g2.gain.setValueAtTime(0.05, t);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o2.connect(g2); g2.connect(ringG); o2.start(t); o2.stop(t + 0.4);
      });
      rw.start(t); rw.stop(t + 0.4);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.16);
    }
    function animalSplash() {
      // SPLASH: water takes it — noise burst, lowpass sweep down.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.6;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'lowpass';
      nf.frequency.setValueAtTime(3000, t);
      nf.frequency.exponentialRampToValueAtTime(300, t + dur);
      ng.gain.setValueAtTime(0.35, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur);
      // Droplets: a few high pings after
      for (let i = 0; i < 3; i++) {
        const dt = t + 0.25 + i * 0.12;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(2000 - i * 300, dt);
        g.gain.setValueAtTime(0.06, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.08);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.1);
      }
    }
    // ---- PREY BEATS (Steve 2026-10-06): the hunt's missing sounds ----
    function animalKill() {
      // THE KILL THUD: heavy body-fall, then a wrong resonance underneath —
      // two low voices a semitone apart beating against each other as the
      // life leaves. Final. Don't fire this for beam-kills (charsMeat).
      if (!ensure()) return;
      const t = ctx.currentTime;
      // Body thud: the weight arriving
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.4);
      // Bone-tick: a sharp transient at impact
      const nz = noise(0.1), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 3;
        ng.gain.setValueAtTime(0.25, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.12);
      }
      // The wrong underneath: two beating lows, dying slow
      [74, 78.5].forEach(fq => {
        const wo = ctx.createOscillator(), wg = ctx.createGain();
        wo.type = 'sine'; wo.frequency.value = fq;
        wg.gain.setValueAtTime(0.0001, t + 0.05);
        wg.gain.exponentialRampToValueAtTime(0.09, t + 0.25);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        wo.connect(wg); wg.connect(sfxBus); wo.start(t + 0.05); wo.stop(t + 1.35);
      });
    }
    function animalButcher() {
      // THE BUTCHER'S BEAT: wet, deliberate work — no hook fired for this
      // before (Steve 2026-10-06). A knife scrape that finds its rhythm,
      // the thud of joints parting, and one drip that lands too loud.
      // Respectful. The animal fed people; the sound knows it.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) { // the scrape finds its rhythm
        const sdt = t + i * 0.42;
        const sz = noise(0.35), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
        if (sz) {
          sf.type = 'bandpass'; sf.Q.value = 3;
          sf.frequency.setValueAtTime(2600, sdt);
          sf.frequency.exponentialRampToValueAtTime(1400, sdt + 0.3); // the draw
          sg.gain.setValueAtTime(0.0001, sdt);
          sg.gain.exponentialRampToValueAtTime(0.14, sdt + 0.08);
          sg.gain.exponentialRampToValueAtTime(0.0001, sdt + 0.32);
          sz.connect(sf); sf.connect(sg); sg.connect(sfxBus);
          sz.start(sdt); sz.stop(sdt + 0.36);
        }
      }
      for (const jdt of [0.5, 1.1]) { // joints parting: low wet thuds
        const jo = ctx.createOscillator(), jg = ctx.createGain();
        jo.type = 'sine';
        jo.frequency.setValueAtTime(140, t + jdt);
        jo.frequency.exponentialRampToValueAtTime(60, t + jdt + 0.12);
        jg.gain.setValueAtTime(0.32, t + jdt);
        jg.gain.exponentialRampToValueAtTime(0.0001, t + jdt + 0.16);
        jo.connect(jg); jg.connect(sfxBus);
        jo.start(t + jdt); jo.stop(t + jdt + 0.2);
      }
      const d = ctx.createOscillator(), dg = ctx.createGain(); // the drip
      d.type = 'sine';
      d.frequency.setValueAtTime(1400, t + 1.35);
      d.frequency.exponentialRampToValueAtTime(700, t + 1.45); // falls, lands loud
      dg.gain.setValueAtTime(0.0001, t + 1.35);
      dg.gain.exponentialRampToValueAtTime(0.16, t + 1.4);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      d.connect(dg); dg.connect(sfxBus);
      d.start(t + 1.35); d.stop(t + 1.55);
      const d2 = ctx.createOscillator(), dg2 = ctx.createGain(); // the drip's shadow, a semitone up
      d2.type = 'sine';
      d2.frequency.setValueAtTime(1484, t + 1.35);
      d2.frequency.exponentialRampToValueAtTime(743, t + 1.45);
      dg2.gain.setValueAtTime(0.0001, t + 1.35);
      dg2.gain.exponentialRampToValueAtTime(0.08, t + 1.4);
      dg2.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      d2.connect(dg2); dg2.connect(sfxBus);
      d2.start(t + 1.35); d2.stop(t + 1.55);
    }
    function animalHiss() {
      // SNAPPING TURTLE HISS/LUNGE WARNING: an angry exhale, bandpassed —
      // a dry sibilant rush with a guttural undertow. Ancient and furious.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.55;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'bandpass'; nf.frequency.setValueAtTime(3800, t);
      nf.frequency.exponentialRampToValueAtTime(2200, t + dur); nf.Q.value = 1.2;
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.4, t + 0.08);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // Pulsed: a hiss is breath, breath has rhythm
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sawtooth'; lfo.frequency.value = 26;
      lg.gain.value = 0.16; lfo.connect(lg); lg.connect(ng.gain);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
      // Undertow: low growl, almost felt more than heard
      const go = ctx.createOscillator(), gg = ctx.createGain();
      go.type = 'sawtooth'; go.frequency.setValueAtTime(90, t);
      go.frequency.exponentialRampToValueAtTime(65, t + dur);
      const gf = ctx.createBiquadFilter(); gf.type = 'lowpass'; gf.frequency.value = 200;
      gg.gain.setValueAtTime(0.12, t);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      go.connect(gf); gf.connect(gg); gg.connect(sfxBus);
      go.start(t); go.stop(t + dur);
    }
    function animalSnort() {
      // DEER ALARM SNORT: two explosive nasal puffs — the white tail's
      // trumpet. Short, violent, unmistakable. Fired WITH the bolt scamper.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const dt = t + i * 0.22;
        const nz = noise(0.18), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) continue;
        // Nasal resonance: the sound of air through a deer's nose
        nf.type = 'bandpass'; nf.frequency.setValueAtTime(320, dt);
        nf.frequency.exponentialRampToValueAtTime(180, dt + 0.15); nf.Q.value = 2.5;
        ng.gain.setValueAtTime(0.42, dt);
        ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.17);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(dt); nz.stop(dt + 0.18);
        // The snort's edge: a high whistle of forced air
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(2400, dt);
        o.frequency.exponentialRampToValueAtTime(1200, dt + 0.12);
        g.gain.setValueAtTime(0.1, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.13);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.14);
      }
    }
    function animalRustle() {
      // "MOVEMENT —" : a soft dry rustle — and one note that's wrong.
      // The wrongness is the cue: this grass doesn't behave like grass.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'highpass'; nf.frequency.value = 4500;
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.16, t + 0.15);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur);
      // The wrong note: a high detuned ping that shouldn't be in grass
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 3100;
      const o2 = ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.value = 3170; // beating, slightly off
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0.05, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      o.connect(g); g.connect(sfxBus); o.start(t + 0.2); o2.start(t + 0.2);
      o.stop(t + 0.7); o2.stop(t + 0.7);
    }
    function animalPanic() {
      // CORNER PANIC (Steve 2026-10-07, audio round 5): trapped prey
      // DETONATES — the hook contract in encounters.js said a real synth
      // wins over the bolt+rustle composition. bolt RECEDES (the animal
      // leaving); panic does not — it is close, loud, and ends cut, because
      // the corner has no exit. Four layers: the thrash, the scream, the
      // triple-time heart, the wrong low.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the thrash: brush exploding — broadband noise, bandpass sweeping UP,
      // chopped by a 23Hz square stutter (prime: the claws can't find rhythm)
      const nz = noise(0.9), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 1.2;
        nf.frequency.setValueAtTime(400, t);
        nf.frequency.exponentialRampToValueAtTime(3600, t + 0.55);
        const st = ctx.createOscillator(), sg = ctx.createGain();
        st.type = 'square'; st.frequency.value = 23; sg.gain.value = 0.16;
        st.connect(sg); sg.connect(ng.gain);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.34, t + 0.06);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.85); st.start(t); st.stop(t + 0.85);
      }
      // the scream: a rabbit screams like a stepped-on toy — saw falling
      // 2400->700 with a 31Hz vibrato, CUT not faded (something happened)
      const sc = ctx.createOscillator(), scg = ctx.createGain();
      sc.type = 'sawtooth';
      sc.frequency.setValueAtTime(2400, t + 0.05);
      sc.frequency.exponentialRampToValueAtTime(700, t + 0.5);
      const vib = ctx.createOscillator(), vg = ctx.createGain();
      vib.type = 'sine'; vib.frequency.value = 31; vg.gain.value = 120;
      vib.connect(vg); vg.connect(sc.frequency);
      const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1500; sf.Q.value = 1.5;
      scg.gain.setValueAtTime(0.0001, t + 0.05);
      scg.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
      scg.gain.setValueAtTime(0.22, t + 0.48);
      scg.gain.exponentialRampToValueAtTime(0.0001, t + 0.52); // cut
      sc.connect(sf); sf.connect(scg); scg.connect(sfxBus);
      sc.start(t + 0.05); sc.stop(t + 0.55); vib.start(t + 0.05); vib.stop(t + 0.55);
      // the heart: prey hearts run triple-time — thumps, accelerating
      [0.1, 0.32, 0.5, 0.66].forEach(dt => {
        thump(t + dt, 0.36);
      });
      // the wrong low: a sub that bends FLAT and stays — no exit, no resolve
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine';
      w.frequency.setValueAtTime(52, t);
      w.frequency.exponentialRampToValueAtTime(45, t + 0.9);
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(0.2, t + 0.15);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      w.connect(wg); wg.connect(sfxBus); w.start(t); w.stop(t + 1.15);
    }
    function animalStalk() {
      // THE STALK: the quietest beat in the hunt — this is YOUR sound, the
      // player's own careful step (Steve 2026-10-06). A good stalk makes
      // almost no sound, so the synth stays near-silent on purpose: two soft
      // footfalls (lowpassed, felt more than heard), a held breath between
      // them, one leaf-shift. The wrongness: your heartbeat is slightly too
      // fast underneath — the hunter's nerves, audible only to you. If the
      // stalk were loud, the prey would already be gone.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // two soft footfalls: weight arriving through leaf litter, lowpassed
      [[0, 0.055], [0.55, 0.045]].forEach(([dt, vol]) => {
        const nz = noise(0.22), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'lowpass'; nf.frequency.value = 700;
        ng.gain.setValueAtTime(0.0001, t + dt);
        ng.gain.exponentialRampToValueAtTime(vol, t + dt + 0.06);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + dt); nz.stop(t + dt + 0.25);
      });
      // the held breath between steps: near-silence with a thin edge
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine'; b.frequency.setValueAtTime(1180, t + 0.28);
      b.frequency.exponentialRampToValueAtTime(1120, t + 0.5);
      bg.gain.setValueAtTime(0.0001, t + 0.28);
      bg.gain.exponentialRampToValueAtTime(0.018, t + 0.36);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
      b.connect(bg); bg.connect(sfxBus); b.start(t + 0.28); b.stop(t + 0.55);
      // the hunter's nerves: your heartbeat, slightly too fast, felt in the chest
      [0.15, 0.52, 0.89].forEach(dt => {
        const h = ctx.createOscillator(), hg = ctx.createGain();
        h.type = 'sine'; h.frequency.setValueAtTime(58, t + dt);
        h.frequency.exponentialRampToValueAtTime(40, t + dt + 0.1);
        hg.gain.setValueAtTime(0.07, t + dt);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.12);
        h.connect(hg); hg.connect(sfxBus); h.start(t + dt); h.stop(t + dt + 0.14);
      });
      // one leaf-shift that almost gives you away — then doesn't
      const lz = noise(0.09), lf = ctx.createBiquadFilter(), lg = ctx.createGain();
      if (lz) {
        lf.type = 'highpass'; lf.frequency.value = 5200;
        lg.gain.setValueAtTime(0.0001, t + 0.72);
        lg.gain.exponentialRampToValueAtTime(0.03, t + 0.75);
        lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.81);
        lz.connect(lf); lf.connect(lg); lg.connect(sfxBus);
        lz.start(t + 0.72); lz.stop(t + 0.82);
      }
    }
    function animalPant() {
      // WINDED: sides heaving — ragged breathing, irregular, wheezy.
      // Three breath pairs, each weaker. You ran it down. It's spent.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const pairs = [[0, 0.22], [0.5, 0.26], [1.05, 0.3]];
      pairs.forEach(([dt, breath]) => {
        // exhale: pushed air, bandpassed low
        const nx = noise(breath), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (nx) {
          nf.type = 'bandpass'; nf.frequency.value = 480 + Math.random() * 120; nf.Q.value = 1;
          ng.gain.setValueAtTime(0.0001, t + dt);
          ng.gain.exponentialRampToValueAtTime(0.22, t + dt + 0.05);
          ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + breath);
          nx.connect(nf); nf.connect(ng); ng.connect(sfxBus);
          nx.start(t + dt); nx.stop(t + dt + breath + 0.05);
        }
        // the wheeze inside: a thin, almost-whistle on the inhale
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(900 + Math.random() * 300, t + dt + breath * 0.6);
        o.frequency.exponentialRampToValueAtTime(700, t + dt + breath);
        g.gain.setValueAtTime(0.0001, t + dt + breath * 0.6);
        g.gain.exponentialRampToValueAtTime(0.05, t + dt + breath * 0.75);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + breath + 0.15);
        o.connect(g); g.connect(sfxBus);
        o.start(t + dt + breath * 0.6); o.stop(t + dt + breath + 0.2);
      });
    }
    function animalRattle() {
      // TIMBER RATTLESNAKE (Steve 2026-10-06): the warning. Dry pulsed
      // buzz — bandpass noise chopped at ~13Hz, like shaking dry seeds in a
      // gourd. Heed it.
      // (deepened Steve 2026-10-06): the rattle is two dry buzzes now, a
      // detuned pair of segments beating against each other — the snake is
      // bigger than one rattle — and the chop stutters once, like it
      // considered stopping and decided against it.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      const nx = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nx) return;
      nf.type = 'bandpass'; nf.frequency.value = 4200; nf.Q.value = 3;
      // rattle rhythm: ~13 pulses/sec via gain LFO, with one stutter
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'square'; lfo.frequency.value = 13;
      lg.gain.value = 0.5;
      // the stutter: the chop misses once at 0.55s, then resumes angrier
      lfo.frequency.setValueAtTime(13, t);
      lfo.frequency.setValueAtTime(6.5, t + 0.55);
      lfo.frequency.setValueAtTime(15, t + 0.62);
      const base = ctx.createGain(); base.gain.value = 0.5;
      lfo.connect(lg); lg.connect(ng.gain);
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.16, t + 0.1);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nx.connect(nf); nf.connect(base); base.connect(ng); ng.connect(sfxBus);
      nx.start(t); nx.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
      // the second rattle: a detuned segment-pair beating underneath
      [[420, 400], [429, 408]].forEach(([f0, f1]) => {
        const b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = 'sawtooth';
        b.frequency.setValueAtTime(f0, t);
        b.frequency.exponentialRampToValueAtTime(f1, t + dur);
        bg.gain.setValueAtTime(0.0001, t);
        bg.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        b.connect(bg); bg.connect(sfxBus);
        b.start(t); b.stop(t + dur + 0.05);
      });
    }
    function animalSpray() {
      // STRIPED SKUNK (Steve 2026-10-06): the chemistry. A wet sibilant
      // burst — high hiss with a low oily thump underneath. Then it lingers
      // in your nose for days (that's the debuff, not the synth).
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      const nx = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nx) return;
      nf.type = 'highpass'; nf.frequency.value = 2600;
      ng.gain.setValueAtTime(0.22, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nx.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nx.start(t); nx.stop(t + dur);
      // the oily thump under it
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.4);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.55);
    }
    // ---- NEW ANIMALS (Steve 2026-10-06): the animals worker's new beats ----
    function animalQuill() {
      // PORCUPINE: quills rising with a dry rattle, like beans in a gourd —
      // two shaken bursts — then the strike: barbed quills in your hand,
      // sharp and wrong. One quill-ping rings too long.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // gourd rattle: two shaken bursts of dry clicks
      for (let b = 0; b < 2; b++) {
        const bt = t + b * 0.28;
        const nz = noise(0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (nz) {
          nf.type = 'bandpass'; nf.frequency.value = 3200; nf.Q.value = 2;
          const sh = ctx.createOscillator(), shg = ctx.createGain();
          sh.type = 'square'; sh.frequency.value = 31; shg.gain.value = 0.12;
          sh.connect(shg); shg.connect(ng.gain);
          ng.gain.setValueAtTime(0.16, bt);
          ng.gain.exponentialRampToValueAtTime(0.0001, bt + 0.2);
          nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
          nz.start(bt); nz.stop(bt + 0.22); sh.start(bt); sh.stop(bt + 0.22);
        }
      }
      // strike: barbed quills, sharp
      const st = t + 0.55;
      const nz2 = noise(0.15), nf2 = ctx.createBiquadFilter(), ng2 = ctx.createGain();
      if (nz2) {
        nf2.type = 'highpass'; nf2.frequency.value = 4500;
        ng2.gain.setValueAtTime(0.25, st);
        ng2.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
        nz2.connect(nf2); nf2.connect(ng2); ng2.connect(sfxBus);
        nz2.start(st); nz2.stop(st + 0.15);
      }
      // one quill rings too long: inharmonic, wrong
      const p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'sine'; p.frequency.value = 5230;
      pg.gain.setValueAtTime(0.08, st);
      pg.gain.exponentialRampToValueAtTime(0.0001, st + 0.8);
      p.connect(pg); pg.connect(sfxBus);
      p.start(st); p.stop(st + 0.85);
    }
    function animalHonk() {
      // GOOSE: HONK — a harsh detuned blast, wings hammering under it. The
      // blast carries a metallic ring it shouldn't have.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      [420, 428].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 0.62, t + dur);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
      });
      // wing hammer: low thumps, fast
      for (let i = 0; i < 5; i++) {
        const dt = t + i * 0.11;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120, dt);
        o.frequency.exponentialRampToValueAtTime(60, dt + 0.08);
        g.gain.setValueAtTime(0.25, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.1);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.12);
      }
      // metallic ring: the wrong edge
      const m = ctx.createOscillator(), mg = ctx.createGain();
      m.type = 'square'; m.frequency.value = 2093;
      const mf = ctx.createBiquadFilter(); mf.type = 'highpass'; mf.frequency.value = 1800;
      mg.gain.setValueAtTime(0.03, t);
      mg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      m.connect(mf); mf.connect(mg); mg.connect(sfxBus);
      m.start(t); m.stop(t + dur + 0.05);
    }
    function animalYowl() {
      // BOBCAT: the chase yowl — unhurried, rising and falling, with a
      // detuned partner a semitone off. It is not hurrying. That is the
      // frightening part.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.4;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(880, t + dur * 0.4);
      o.frequency.exponentialRampToValueAtTime(420, t + dur);
      const v = ctx.createOscillator(), vg = ctx.createGain();
      v.type = 'sine'; v.frequency.value = 5.5; vg.gain.value = 40;
      v.connect(vg); vg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05); v.start(t); v.stop(t + dur + 0.05);
      // detuned partner, a semitone off: the wrongness
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(551, t); // C#5 against the C5
      o2.frequency.exponentialRampToValueAtTime(932, t + dur * 0.4);
      o2.frequency.exponentialRampToValueAtTime(445, t + dur);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o2.connect(f); o2.connect(g2); g2.connect(sfxBus);
      o2.start(t); o2.stop(t + dur + 0.05);
      // breath under it
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 300;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05);
      }
    }
    function animalCharge() {
      // CHARGER: drops its head and COMES — thundering hooves accelerating,
      // a tusk-rake tearing through, and a sub-bass pulse you feel in your
      // chest. It has committed.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // accelerating hoofbeats
      for (let i = 0; i < 6; i++) {
        const dt = t + i * (0.22 - i * 0.02);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(75, dt);
        o.frequency.exponentialRampToValueAtTime(38, dt + 0.14);
        g.gain.setValueAtTime(0.38, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.18);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.2);
      }
      // tusk rake: tearing bandpass noise, rising
      const nz = noise(0.7), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 1.2;
        nf.frequency.setValueAtTime(900, t + 0.3);
        nf.frequency.exponentialRampToValueAtTime(2600, t + 0.9);
        ng.gain.setValueAtTime(0.0001, t + 0.3);
        ng.gain.exponentialRampToValueAtTime(0.28, t + 0.55);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.3); nz.stop(t + 1.0);
      }
      // sub-bass pulse: the commitment
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine'; s.frequency.setValueAtTime(48, t);
      s.frequency.exponentialRampToValueAtTime(36, t + 1.0);
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.22, t + 0.4);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      s.connect(sg); sg.connect(sfxBus);
      s.start(t); s.stop(t + 1.15);
      // grunt: the boar is vocal about this — reedy, with a fast vibrato
      const gr = ctx.createOscillator(), grg = ctx.createGain();
      gr.type = 'sawtooth';
      gr.frequency.setValueAtTime(150, t);
      gr.frequency.exponentialRampToValueAtTime(90, t + 0.9);
      const grl = ctx.createOscillator(), grlg = ctx.createGain();
      grl.type = 'sine'; grl.frequency.value = 13; grlg.gain.value = 18;
      grl.connect(grlg); grlg.connect(gr.frequency);
      const grf = ctx.createBiquadFilter(); grf.type = 'lowpass'; grf.frequency.value = 500;
      grg.gain.setValueAtTime(0.0001, t);
      grg.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
      grg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      gr.connect(grf); grf.connect(grg); grg.connect(sfxBus);
      gr.start(t); gr.stop(t + 1.05); grl.start(t); grl.stop(t + 1.05);
    }
    function animalTailSlap() {
      // BEAVER: CRACK — the flat tail slaps the water, a hard transient with
      // a watery body — then the dive: a low glug sinking with a wobble, and
      // faint rings expanding outward. Every animal on the creek heard that.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // crack: hard transient
      const nz = noise(0.08), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 2000;
        ng.gain.setValueAtTime(0.4, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.1);
      }
      // watery body of the slap
      const nz2 = noise(0.4), nf2 = ctx.createBiquadFilter(), ng2 = ctx.createGain();
      if (nz2) {
        nf2.type = 'lowpass';
        nf2.frequency.setValueAtTime(2800, t + 0.02);
        nf2.frequency.exponentialRampToValueAtTime(400, t + 0.4);
        ng2.gain.setValueAtTime(0.3, t + 0.02);
        ng2.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        nz2.connect(nf2); nf2.connect(ng2); ng2.connect(sfxBus);
        nz2.start(t + 0.02); nz2.stop(t + 0.45);
      }
      // dive glug: a low tone sinking with a wobble
      const g = ctx.createOscillator(), gg = ctx.createGain();
      g.type = 'sine';
      g.frequency.setValueAtTime(300, t + 0.15);
      g.frequency.exponentialRampToValueAtTime(90, t + 0.7);
      const gl = ctx.createOscillator(), glg = ctx.createGain();
      gl.type = 'sine'; gl.frequency.value = 7; glg.gain.value = 30;
      gl.connect(glg); glg.connect(g.frequency);
      gg.gain.setValueAtTime(0.0001, t + 0.15);
      gg.gain.exponentialRampToValueAtTime(0.14, t + 0.3);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      g.connect(gg); gg.connect(sfxBus);
      g.start(t + 0.15); g.stop(t + 0.8); gl.start(t + 0.15); gl.stop(t + 0.8);
      // rings: faint pings expanding outward
      [1560, 1320, 1170].forEach((fq, i) => {
        const dt = t + 0.3 + i * 0.22;
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = fq;
        pg.gain.setValueAtTime(0.05 - i * 0.012, dt);
        pg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.25);
        p.connect(pg); pg.connect(sfxBus);
        p.start(dt); p.stop(dt + 0.3);
      });
    }
    function animalWhistle() {
      // GROUNDHOG: the whistle splits the meadow, sharp, twice. A faint
      // detuned ghost rides the second one — slightly flat, slightly too
      // long — because even the meadow is on edge.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [[0, 2900, 3200], [0.22, 2900, 3050]].forEach(([off, f0, f1]) => {
        const dt = t + off;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, dt);
        o.frequency.exponentialRampToValueAtTime(f1, dt + 0.14);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.2, dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.18);
        o.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.22);
      });
      // the wrong edge: a faint detuned ghost of the second whistle — and it
      // can't hold still: a fast wobble on its pitch
      const gh = ctx.createOscillator(), ghg = ctx.createGain();
      gh.type = 'sine';
      gh.frequency.setValueAtTime(2900 * 1.012, t + 0.22);
      gh.frequency.exponentialRampToValueAtTime(3050 * 1.012, t + 0.38);
      const wl = ctx.createOscillator(), wlg = ctx.createGain();
      wl.type = 'sine'; wl.frequency.value = 9; wlg.gain.value = 40;
      wl.connect(wlg); wlg.connect(gh.frequency);
      ghg.gain.setValueAtTime(0.0001, t + 0.22);
      ghg.gain.exponentialRampToValueAtTime(0.04, t + 0.26);
      ghg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      gh.connect(ghg); ghg.connect(sfxBus);
      gh.start(t + 0.22); gh.stop(t + 0.45); wl.start(t + 0.22); wl.stop(t + 0.45);
    }
    function animalFlush() {
      // GROUSE: EXPLODES from under your boots — a hard noise burst, then
      // the wing-whir: rapid AM flutter as it twists away. One wingbeat lands
      // too loud and metallic. Your heart restarts after.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.8;
      // the explosion
      const nz = noise(0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(4000, t);
        nf.frequency.exponentialRampToValueAtTime(800, t + 0.2);
        ng.gain.setValueAtTime(0.4, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.22);
      }
      // wing-whir: rapid flutter, receding
      const nz2 = noise(dur), nf2 = ctx.createBiquadFilter(), ng2 = ctx.createGain();
      if (nz2) {
        nf2.type = 'bandpass'; nf2.frequency.value = 900; nf2.Q.value = 1;
        const fl = ctx.createOscillator(), flg = ctx.createGain();
        fl.type = 'square'; fl.frequency.value = 24; flg.gain.value = 0.1;
        fl.connect(flg); flg.connect(ng2.gain);
        ng2.gain.setValueAtTime(0.28, t + 0.08);
        ng2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz2.connect(nf2); nf2.connect(ng2); ng2.connect(sfxBus);
        nz2.start(t + 0.08); nz2.stop(t + dur + 0.05);
        fl.start(t + 0.08); fl.stop(t + dur + 0.05);
      }
      // one wingbeat too loud: metallic, wrong
      const m = ctx.createOscillator(), mg = ctx.createGain();
      m.type = 'square'; m.frequency.value = 1750;
      const mf = ctx.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 1750; mf.Q.value = 6;
      mg.gain.setValueAtTime(0.09, t + 0.2);
      mg.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      m.connect(mf); mf.connect(mg); mg.connect(sfxBus);
      m.start(t + 0.2); m.stop(t + 0.35);
    }
    // ---- BATCH MONSTERS: the ones that were silent ----
    function boarTrample() {
      // BULLDOZER TRAMPLE: heavy rhythmic thuds, ground shaking.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const dt = t + i * 0.22;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(70, dt);
        o.frequency.exponentialRampToValueAtTime(35, dt + 0.15);
        g.gain.setValueAtTime(0.4, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.2);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.22);
      }
      // Dirt churn underneath
      const nz = noise(0.9), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 250;
        ng.gain.setValueAtTime(0.2, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.95);
      }
    }
    function catfishSnap() {
      // THE SNAP: sudden, violent — no warning (by design).
      if (!ensure()) return;
      const t = ctx.currentTime;
      const nz = noise(0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 1200; nf.Q.value = 2;
        ng.gain.setValueAtTime(0.5, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.22);
      }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.18);
          // (deepened Steve 2026-10-06): the jaw slams shut — a low wet thud —
      // and the water itself pulls back: an undertow suck under the snap.
      const j = ctx.createOscillator(), jg = ctx.createGain();
      j.type = 'sine';
      j.frequency.setValueAtTime(160, t);
      j.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      jg.gain.setValueAtTime(0.4, t);
      jg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      j.connect(jg); jg.connect(sfxBus); j.start(t); j.stop(t + 0.2);
      const uz = noise(0.5), uf = ctx.createBiquadFilter(), ug = ctx.createGain();
      if (uz) {
        uf.type = 'lowpass';
        uf.frequency.setValueAtTime(1200, t);
        uf.frequency.exponentialRampToValueAtTime(200, t + 0.5); // the pull
        ug.gain.setValueAtTime(0.0001, t);
        ug.gain.exponentialRampToValueAtTime(0.18, t + 0.15);
        ug.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        uz.connect(uf); uf.connect(ug); ug.connect(sfxBus);
        uz.start(t); uz.stop(t + 0.55);
      }
    }
    function catfishStill() {
      // UNNATURAL STILLNESS: almost nothing — a faint held breath.
      // The horror is the absence. Under the absence, one sub-bass breath
      // swells once and stops: something down there is alive. Minimal by
      // design — the absence is the instrument. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.2;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 55;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      // one breath, sub-bass, then nothing again
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine'; b.frequency.value = 27.5;
      bg.gain.setValueAtTime(0.0001, t + 0.4);
      bg.gain.exponentialRampToValueAtTime(0.06, t + 0.7);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      b.connect(bg); bg.connect(sfxBus); b.start(t + 0.4); b.stop(t + 1.05);
    }
    // ---- DUCKS IN A ROW: the formation's voice ----
    // Muscovy ducks don't quack. Males hiss — a breathy exhalation, the
    // "trolling" sound. Females trill softly. (Steve 2026-10-06)
    function duckHissAt(t, dur, vol) {
      // the male's hiss: broadband breath through a bandpass — tsssshh
      const nz = noise(dur + 0.05), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'bandpass'; nf.frequency.value = 3200; nf.Q.value = 0.8;
      // breathy envelope: swell then fade
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur + 0.05);
    }
    function duckTrillAt(t, baseFq, dur, vol) {
      // the female's trill: soft warbling coo
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(baseFq, t);
      const v = ctx.createOscillator(), vg = ctx.createGain();
      v.type = 'sine'; v.frequency.value = 11; vg.gain.value = baseFq * 0.15;
      v.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05); v.start(t); v.stop(t + dur + 0.05);
    }
    function ducksQuack() {
      // AMBIENT: just muscovies. Loose hisses and soft trills wandering
      // in time. This is the sound before the silence.
      if (!ensure()) return;
      const t = ctx.currentTime;
      duckHissAt(t, 0.35, 0.10);
      duckTrillAt(t + 0.34, 420, 0.25, 0.08);
      duckHissAt(t + 0.61, 0.3, 0.09);
      duckTrillAt(t + 1.02, 380, 0.3, 0.07);
      duckHissAt(t + 1.31, 0.4, 0.11);
    }
    function ducksQuackCut() {
      // THE TELEGRAPH: the hissing STOPS. Two quacks, a third cut dead
      // mid-burst — then nothing. The silence after is the scary part.
      if (!ensure()) return;
      const t = ctx.currentTime;
      duckHissAt(t, 0.35, 0.14);
      duckHissAt(t + 0.45, 0.35, 0.14);
      // third hiss: starts, then the knife — gain slammed to zero mid-burst
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(290, t + 0.64);
      o.frequency.exponentialRampToValueAtTime(200, t + 0.8);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 750; f.Q.value = 2.5;
      g.gain.setValueAtTime(0.0001, t + 0.64);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.66);
      g.gain.setValueAtTime(0.16, t + 0.72);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.74); // cut dead
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t + 0.64); o.stop(t + 0.8);
      // the room tone dying: a breath of filtered noise fading to nothing
      const nz = noise(1.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 400;
        ng.gain.setValueAtTime(0.05, t + 0.74);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.74); nz.stop(t + 1.95);
      }
    }
    function duckLineUp() {
      // THE TELL: hisses snapping into lockstep — intervals shrink until
      // fourteen ducks quack as one. Too precise. Too quiet, after.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const gaps = [0.3, 0.24, 0.19, 0.15, 0.12];
      let dt = 0;
      duckHissAt(t, 0.3, 0.12);
      for (let i = 0; i < gaps.length; i++) {
        dt += gaps[i];
        duckHissAt(t + dt, 0.3, 0.12 + i * 0.008);
      }
      // the unison beat: all six at once
      duckHissAt(t + dt + 0.12, 0.45, 0.2);
    }
    function duckMarch() {
      // MARCH: hisses in perfect military time. Do not be in the way.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) duckHissAt(t + i * 0.32, 0.35, 0.14);
    }
    function duckNip() {
      // NIP: six beak snaps, fast — short filtered noise bursts, no pitch.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const dt = t + i * 0.07;
        const nz = noise(0.06), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) continue;
        nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 4;
        ng.gain.setValueAtTime(0.22, dt);
        ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.06);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(dt); nz.stop(dt + 0.08);
      }
    }
    function duckRegroup() {
      // REGROUP: the formation loosens — hisses drift apart in time and
      // pitch. For a moment the line is just ducks.
      if (!ensure()) return;
      const t = ctx.currentTime;
      duckHissAt(t, 0.3, 0.09);
      duckTrillAt(t + 0.38, 400, 0.25, 0.07);
      duckHissAt(t + 0.85, 0.35, 0.08);
      duckTrillAt(t + 1.4, 360, 0.3, 0.06);
    }
    function duckScreech() {
      // ENRAGED: the head is all that's left and it knows it — a harsh
      // descending screech with a vibrato that sounds wrong on a duck.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(950, t);
      o.frequency.exponentialRampToValueAtTime(320, t + dur);
      const v = ctx.createOscillator(), vg = ctx.createGain();
      v.type = 'sine'; v.frequency.value = 9; vg.gain.value = 90;
      v.connect(vg); vg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 1400; f.Q.value = 1.8;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05); v.start(t); v.stop(t + dur + 0.05);
    }
    function heronStatic() {
      // WHITE NOISE HERON: the air goes staticky — crackling wrongness.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.0;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'highpass'; nf.frequency.value = 3000;
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.18, t + 0.3);
      // Crackle: amplitude stutter
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'square'; lfo.frequency.value = 23;
      lg.gain.value = 0.08; lfo.connect(lg); lg.connect(ng.gain);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
          // (deepened Steve 2026-10-06): a sub-bass throb under the static — the
      // heron's weight in the air — and occasional zap cracks like a wire
      // shorting in water.
      const th = ctx.createOscillator(), thg = ctx.createGain();
      th.type = 'sine'; th.frequency.value = 41;
      const thl = ctx.createOscillator(), thlg = ctx.createGain();
      thl.type = 'sine'; thl.frequency.value = 2.2; thlg.gain.value = 0.028;
      thl.connect(thlg); thlg.connect(thg.gain); // the throb
      thg.gain.setValueAtTime(0.11, t);
      thg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      th.connect(thg); thg.connect(sfxBus);
      th.start(t); thl.start(t); th.stop(t + dur); thl.stop(t + dur);
      for (let i = 0; i < 3; i++) { // zap cracks
        const zdt = t + Math.random() * (dur - 0.2);
        const zo = ctx.createOscillator(), zg = ctx.createGain();
        zo.type = 'sawtooth';
        zo.frequency.setValueAtTime(5200, zdt);
        zo.frequency.exponentialRampToValueAtTime(900, zdt + 0.06);
        zg.gain.setValueAtTime(0.09, zdt);
        zg.gain.exponentialRampToValueAtTime(0.0001, zdt + 0.07);
        zo.connect(zg); zg.connect(sfxBus); zo.start(zdt); zo.stop(zdt + 0.08);
      }
    }
    function lockpickChitter() {
      // RACCOON CHITTER: fast, clever, mocking — it knows something you don't.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const dt = t + i * 0.07;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900 + Math.random() * 600, dt);
        o.frequency.exponentialRampToValueAtTime(500, dt + 0.05);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200;
        g.gain.setValueAtTime(0.12, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.06);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.07);
      }
          // (deepened Steve 2026-10-06): lockpicks are metal — tinny clicks ride
      // the chitter — and it leaves a mocking three-note tail, descending.
      for (let i = 0; i < 5; i++) {
        const cdt = t + i * 0.09 + 0.02;
        const co = ctx.createOscillator(), cg = ctx.createGain();
        co.type = 'square'; co.frequency.value = 2900 + Math.random() * 800;
        cg.gain.setValueAtTime(0.05, cdt);
        cg.gain.exponentialRampToValueAtTime(0.0001, cdt + 0.03);
        co.connect(cg); cg.connect(sfxBus); co.start(cdt); co.stop(cdt + 0.04);
      }
      [880, 740, 587].forEach((fq, i) => { // the mocking tail
        const mdt = t + 0.48 + i * 0.13;
        const mo = ctx.createOscillator(), mg = ctx.createGain();
        mo.type = 'sawtooth';
        mo.frequency.setValueAtTime(fq, mdt);
        mo.frequency.exponentialRampToValueAtTime(fq * 0.94, mdt + 0.11); // sliding off, smug
        const mf = ctx.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 1200;
        mg.gain.setValueAtTime(0.0001, mdt);
        mg.gain.exponentialRampToValueAtTime(0.11, mdt + 0.02);
        mg.gain.exponentialRampToValueAtTime(0.0001, mdt + 0.12);
        mo.connect(mf); mf.connect(mg); mg.connect(sfxBus);
        mo.start(mdt); mo.stop(mdt + 0.14);
      });
    }
    function lockpickGrab() {
      // THE GRAB: claws on fabric — scratch + snatch. The scratch tears down,
      // the snatch thuds the body sideways, and the lockpicks jangle: two
      // metallic inharmonic pings, because the tools are metal and the System
      // never files them down. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime;
      const nz = noise(0.3), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.setValueAtTime(2500, t);
        nf.frequency.exponentialRampToValueAtTime(800, t + 0.25);
        ng.gain.setValueAtTime(0.3, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.32);
      }
      // snatch: the body yanked sideways
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine'; s.frequency.setValueAtTime(180, t + 0.08);
      s.frequency.exponentialRampToValueAtTime(60, t + 0.28);
      sg.gain.setValueAtTime(0.0001, t + 0.08);
      sg.gain.exponentialRampToValueAtTime(0.3, t + 0.12);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      s.connect(sg); sg.connect(sfxBus);
      s.start(t + 0.08); s.stop(t + 0.35);
      // jangle: metal on metal, inharmonic (a tritone apart — wrong)
      [3120, 4417].forEach((fq, i) => {
        const dt = t + 0.1 + i * 0.06;
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'square'; p.frequency.value = fq;
        const pf = ctx.createBiquadFilter(); pf.type = 'highpass'; pf.frequency.value = 2500;
        pg.gain.setValueAtTime(0.05, dt);
        pg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.18);
        p.connect(pf); pf.connect(pg); pg.connect(sfxBus);
        p.start(dt); p.stop(dt + 0.22);
      });
    }
    function mothFlash() {
      // MIRRORMOTH FLASH: searing bright shimmer — beautiful, blinding.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(3500, t);
      o.frequency.exponentialRampToValueAtTime(5000, t + 0.15);
      // Shimmer: rapid tremolo
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 30;
      lg.gain.value = 0.1; lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
          // (deepened Steve 2026-10-06): a second shimmer a semitone sharp — the
      // flash doubles you — and an after-image gliss falling out of the world.
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(3715, t); // +1 semitone, beating against the first
      o2.frequency.exponentialRampToValueAtTime(5297, t + 0.15);
      const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain();
      lfo2.type = 'sine'; lfo2.frequency.value = 37; lg2.gain.value = 0.08;
      lfo2.connect(lg2); lg2.connect(g2.gain);
      g2.gain.setValueAtTime(0.12, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o2.connect(g2); g2.connect(sfxBus);
      o2.start(t); lfo2.start(t); o2.stop(t + dur); lfo2.stop(t + dur);
      const a = ctx.createOscillator(), ag = ctx.createGain();
      a.type = 'sine';
      a.frequency.setValueAtTime(4800, t + 0.2);
      a.frequency.exponentialRampToValueAtTime(900, t + 1.0); // the brightness falls away
      ag.gain.setValueAtTime(0.0001, t + 0.2);
      ag.gain.exponentialRampToValueAtTime(0.1, t + 0.35);
      ag.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      a.connect(ag); ag.connect(sfxBus);
      a.start(t + 0.2); a.stop(t + 1.05);
    }
    function mothFlutter() {
      // WING FLUTTER: soft rapid papery beats — and the scale-dust: a high
      // sparkle drifting down as the moth sheds. Moths leave pieces of
      // themselves in the air. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime;
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'bandpass'; nf.frequency.value = 600; nf.Q.value = 3;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 18;
      lg.gain.value = 0.1; lfo.connect(lg); lg.connect(ng.gain);
      ng.gain.setValueAtTime(0.14, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + 0.55); lfo.start(t); lfo.stop(t + 0.55);
      // scale-dust: high sparkle, drifting down
      const sd = ctx.createOscillator(), sdg = ctx.createGain();
      sd.type = 'sine';
      sd.frequency.setValueAtTime(8800, t);
      sd.frequency.exponentialRampToValueAtTime(5200, t + 0.5);
      sdg.gain.setValueAtTime(0.0001, t);
      sdg.gain.exponentialRampToValueAtTime(0.02, t + 0.15);
      sdg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      sd.connect(sdg); sdg.connect(sfxBus);
      sd.start(t); sd.stop(t + 0.55);
    }
    function snakeSplit() {
      // THE SPLIT: wet tearing — one becomes two. Deeply wrong.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.8;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(800, t);
        nf.frequency.exponentialRampToValueAtTime(200, t + dur);
        ng.gain.setValueAtTime(0.35, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur);
      }
      // Two tones diverging — the split made audible
      for (const dir of [-1, 1]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(220 + dir * 110, t + dur);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur);
      }
          // (deepened Steve 2026-10-06): the two halves hiss apart in stereo —
      // one slides left, one right, diverging.
      for (const dir of [-1, 1]) {
        const hz = noise(dur), hzf = ctx.createBiquadFilter(), hzg = ctx.createGain();
        if (!hz) continue;
        hzf.type = 'highpass'; hzf.frequency.value = 3500;
        hzg.gain.setValueAtTime(0.0001, t);
        hzg.gain.exponentialRampToValueAtTime(0.1, t + 0.2);
        hzg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        hz.connect(hzf); hzf.connect(hzg);
        if (ctx.createStereoPanner) {
          const p = ctx.createStereoPanner();
          p.pan.setValueAtTime(0, t);
          p.pan.linearRampToValueAtTime(dir * 0.8, t + dur); // sliding apart
          hzg.connect(p); p.connect(sfxBus);
        } else hzg.connect(sfxBus);
        hz.start(t); hz.stop(t + dur + 0.05);
      }
    }
    function stagConfused() {
      // STAG CONFUSED: the charge dies — a deflating snort, almost embarrassed.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'bandpass'; nf.frequency.setValueAtTime(400, t);
      nf.frequency.exponentialRampToValueAtTime(150, t + dur);
      nf.Q.value = 2;
      ng.gain.setValueAtTime(0.25, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur);
          // (deepened Steve 2026-10-06): an embarrassed whinny — the charge dies
      // into a descending minor-2nd warble — and a hoof scraping the dirt.
      const wn = ctx.createOscillator(), wng = ctx.createGain();
      wn.type = 'sawtooth';
      wn.frequency.setValueAtTime(660, t + 0.05);
      wn.frequency.exponentialRampToValueAtTime(311, t + 0.5); // a fifth down, ashamed
      const wbl = ctx.createOscillator(), wblg = ctx.createGain();
      wbl.type = 'sine'; wbl.frequency.value = 11; wblg.gain.value = 22;
      wbl.connect(wblg); wblg.connect(wn.frequency); // the wobble of shame
      const wnf = ctx.createBiquadFilter(); wnf.type = 'bandpass'; wnf.frequency.value = 500; wnf.Q.value = 2;
      wng.gain.setValueAtTime(0.0001, t + 0.05);
      wng.gain.exponentialRampToValueAtTime(0.1, t + 0.15);
      wng.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      wn.connect(wnf); wnf.connect(wng); wng.connect(sfxBus);
      wn.start(t + 0.05); wbl.start(t + 0.05);
      wn.stop(t + 0.6); wbl.stop(t + 0.6);
      const hz = noise(0.25), hzf = ctx.createBiquadFilter(), hzg = ctx.createGain(); // hoof scrape
      if (hz) {
        hzf.type = 'highpass'; hzf.frequency.value = 2500;
        hzg.gain.setValueAtTime(0.1, t + 0.45);
        hzg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        hz.connect(hzf); hzf.connect(hzg); hzg.connect(sfxBus);
        hz.start(t + 0.45); hz.stop(t + 0.75);
      }
    }
    function turtleBunker() {
      // SHELL SEALS: like a heavy door closing — final, stone.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.45);
      // Stone scrape
      const nz = noise(0.35), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 400;
        ng.gain.setValueAtTime(0.2, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.05); nz.stop(t + 0.42);
      }
          // (deepened Steve 2026-10-06): the seal rings — a stone-on-stone ring
      // tail — and a low thud echoes back off the shell's inside.
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sine'; r.frequency.value = 1150;
      rg.gain.setValueAtTime(0.0001, t + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); // long ring
      r.connect(rg); rg.connect(sfxBus);
      r.start(t + 0.05); r.stop(t + 0.95);
      const r2 = ctx.createOscillator(), rg2 = ctx.createGain(); // the ring's twin, 8Hz sharp
      r2.type = 'sine'; r2.frequency.value = 1158;
      rg2.gain.setValueAtTime(0.0001, t + 0.05);
      rg2.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
      rg2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      r2.connect(rg2); rg2.connect(sfxBus);
      r2.start(t + 0.05); r2.stop(t + 0.95);
      const e = ctx.createOscillator(), eg = ctx.createGain(); // the echo inside
      e.type = 'sine';
      e.frequency.setValueAtTime(80, t + 0.25);
      e.frequency.exponentialRampToValueAtTime(40, t + 0.6);
      eg.gain.setValueAtTime(0.0001, t + 0.25);
      eg.gain.exponentialRampToValueAtTime(0.14, t + 0.32);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      e.connect(eg); eg.connect(sfxBus);
      e.start(t + 0.25); e.stop(t + 0.7);
    }
    function turtleFlip() {
      // TURTLE FLIP (break-it 2026-10-08): the heave and the crash — effort
      // rising, then shell on dirt. The codex weakness made audible.
      // (Was: tbPlayerFlip fired audioEvent('turtleFlip') with no handler —
      // fired-but-silent since the flip commit c00b92f.)
      if (!ensure()) return;
      const t = ctx.currentTime;
      // The heave: effort rising
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.25);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.32);
      // The crash: shell hits dirt
      const nz = noise(0.4), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 900;
        ng.gain.setValueAtTime(0.5, t + 0.28);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.28); nz.stop(t + 0.72);
      }
      // A dull stone thud underneath
      const th = ctx.createOscillator(), thg = ctx.createGain();
      th.type = 'sine'; th.frequency.setValueAtTime(140, t + 0.28);
      th.frequency.exponentialRampToValueAtTime(50, t + 0.5);
      thg.gain.setValueAtTime(0.35, t + 0.28);
      thg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      th.connect(thg); thg.connect(sfxBus); th.start(t + 0.28); th.stop(t + 0.62);
    }
    function wolfBreak() {
      // PACK BREAKS: the coordination shatters — a howl that fractures.
      // (deepened Steve 2026-10-06): now it actually fractures — a second
      // howl fragment enters a tritone away and DIES MID-NOTE, and a noise
      // tear (bandpass, gated hard) rips under the break. The pack isn't
      // one instrument anymore. It's several, disagreeing.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(180, t + dur);
      // Fracture: pitch stutters downward
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'square'; lfo.frequency.value = 9;
      lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
      // the fragment: a second howl, a tritone away, that dies mid-note
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(622, t + 0.25); // tritone above the fall
      o2.frequency.exponentialRampToValueAtTime(330, t + 0.55);
      g2.gain.setValueAtTime(0.0001, t + 0.25);
      g2.gain.exponentialRampToValueAtTime(0.12, t + 0.35);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.58); // cut, not faded
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1400;
      o2.connect(f2); f2.connect(g2); g2.connect(sfxBus);
      o2.start(t + 0.25); o2.stop(t + 0.62);
      // the tear: gated bandpass noise ripping under the break
      const nz = noise(0.6), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 2;
        nf.frequency.setValueAtTime(900, t + 0.2);
        nf.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
        const tg = ctx.createOscillator(), tgg = ctx.createGain();
        tg.type = 'square'; tg.frequency.value = 21; tgg.gain.value = 0.5;
        tg.connect(tgg); tgg.connect(ng.gain);
        ng.gain.setValueAtTime(0.3, t + 0.2);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.2); tg.start(t + 0.2); nz.stop(t + 0.75); tg.stop(t + 0.75);
      }
    }
    function toadSwell() {
      // THROAT SWELLS: rising pressure — you can hear it filling up.
      // The croak is coming. Move.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.0;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(60, t);
      o.frequency.exponentialRampToValueAtTime(110, t + dur); // swelling upward
      // Wobble intensifies as it fills
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(3, t);
      lfo.frequency.exponentialRampToValueAtTime(9, t + dur);
      lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      o.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.15); lfo.stop(t + dur + 0.15);
          // (deepened Steve 2026-10-06): the throat is wet — a mucosal gulp rides
      // the swell, and throat-clicks rattle faster as the pressure builds.
      const gp = ctx.createOscillator(), gpg = ctx.createGain(); // the gulp
      gp.type = 'sine';
      gp.frequency.setValueAtTime(200, t + 0.1);
      gp.frequency.exponentialRampToValueAtTime(90, t + 0.35);
      gpg.gain.setValueAtTime(0.0001, t + 0.1);
      gpg.gain.exponentialRampToValueAtTime(0.16, t + 0.2);
      gpg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      gp.connect(gpg); gpg.connect(sfxBus);
      gp.start(t + 0.1); gp.stop(t + 0.45);
      for (let i = 0; i < 6; i++) { // throat clicks, accelerating
        const cdt = t + 0.3 + i * (0.11 - i * 0.012);
        const co = ctx.createOscillator(), cg = ctx.createGain();
        co.type = 'square'; co.frequency.value = 300 + Math.random() * 150;
        cg.gain.setValueAtTime(0.07, cdt);
        cg.gain.exponentialRampToValueAtTime(0.0001, cdt + 0.03);
        co.connect(cg); cg.connect(sfxBus); co.start(cdt); co.stop(cdt + 0.04);
      }
    }
    // ---- WAVE 2 GAPS ----
    function droneCorrect() {
      // CORRECTIVE ACTION: flat bureaucratic beep — you are being adjusted.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const dt = t + i * 0.22;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 660;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
        g.gain.setValueAtTime(0.14, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.18);
      }
      // Second beep lower — the correction escalates
      const dt = t + 0.5;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 440;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1000;
      g.gain.setValueAtTime(0.16, dt);
      g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.25);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(dt); o.stop(dt + 0.28);
          // (deepened Steve 2026-10-06): the correction arrives over a channel —
      // radio squelch gated by a stutter, and a servo whine inside the drone
      // as it adjusts you. The beeps were the paperwork; this is the hand.
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 3;
        const sq = ctx.createOscillator(), sqg = ctx.createGain(); // squelch gate
        sq.type = 'square'; sq.frequency.value = 25;
        sqg.gain.value = 0.09;
        sq.connect(sqg); sqg.connect(ng.gain);
        ng.gain.setValueAtTime(0.12, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.55); sq.start(t); sq.stop(t + 0.55);
      }
      const sv = ctx.createOscillator(), svg = ctx.createGain();
      sv.type = 'sawtooth';
      sv.frequency.setValueAtTime(190, t + 0.2);
      sv.frequency.exponentialRampToValueAtTime(260, t + 0.75);
      const svf = ctx.createBiquadFilter(); svf.type = 'bandpass'; svf.frequency.value = 700; svf.Q.value = 5;
      svg.gain.setValueAtTime(0.0001, t + 0.2);
      svg.gain.exponentialRampToValueAtTime(0.05, t + 0.45);
      svg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      sv.connect(svf); svf.connect(svg); svg.connect(sfxBus);
      sv.start(t + 0.2); sv.stop(t + 0.85);
    }
    function swarmEscalate() {
      // ENGAGEMENT DROPPING: shutters accelerate — it's getting desperate.
      if (!ensure()) return;
      const t = ctx.currentTime;
      let dt = t;
      for (let i = 0; i < 10; i++) {
        const gap = 0.12 - i * 0.008; // accelerating
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.setValueAtTime(3000 + i * 150, dt);
        g.gain.setValueAtTime(0.08, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.04);
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.05);
        dt += Math.max(0.03, gap);
      }
          // (deepened Steve 2026-10-06): the swarm's weight lands too — bass
      // pulses accelerating under the pips, and a servo grinding to keep up.
      let bdt = t;
      for (let i = 0; i < 5; i++) {
        const bo = ctx.createOscillator(), bg = ctx.createGain();
        bo.type = 'sine';
        bo.frequency.setValueAtTime(90 - i * 8, bdt);
        bo.frequency.exponentialRampToValueAtTime(55, bdt + 0.12);
        bg.gain.setValueAtTime(0.22, bdt);
        bg.gain.exponentialRampToValueAtTime(0.0001, bdt + 0.14);
        bo.connect(bg); bg.connect(sfxBus); bo.start(bdt); bo.stop(bdt + 0.16);
        bdt += 0.16 - i * 0.02; // accelerating with the pips
      }
      const sv = ctx.createOscillator(), svg = ctx.createGain();
      sv.type = 'square';
      sv.frequency.setValueAtTime(180, t);
      sv.frequency.exponentialRampToValueAtTime(320, t + 0.8);
      const svf = ctx.createBiquadFilter(); svf.type = 'lowpass'; svf.frequency.value = 700;
      svg.gain.setValueAtTime(0.0001, t);
      svg.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
      svg.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      sv.connect(svf); svf.connect(svg); svg.connect(sfxBus);
      sv.start(t); sv.stop(t + 0.9);
    }
    // ---- SYSTEM EVENTS ----
    function confront() {
      // JUSTICE: three low drums — someone is being called to answer. Under
      // them, two detuned low voices a semitone apart swell and hold: the
      // System itself is in the room. Each drumbeat gets a cold high ping —
      // something taking notes. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const dt = t + i * 0.4;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(80, dt);
        o.frequency.exponentialRampToValueAtTime(50, dt + 0.25);
        g.gain.setValueAtTime(0.35, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.35);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.4);
        // cold ping on each beat: the System taking notes
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = 2093; // C7, too clean for the room
        pg.gain.setValueAtTime(0.05, dt + 0.02);
        pg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.3);
        p.connect(pg); pg.connect(sfxBus); p.start(dt + 0.02); p.stop(dt + 0.35);
      }
      // the System in the room: two low voices, a semitone apart, never resolving
      [55, 58.27].forEach(fq => {
        const v = ctx.createOscillator(), vg = ctx.createGain();
        v.type = 'sawtooth'; v.frequency.value = fq;
        const vf = ctx.createBiquadFilter(); vf.type = 'lowpass'; vf.frequency.value = 220;
        vg.gain.setValueAtTime(0.0001, t);
        vg.gain.exponentialRampToValueAtTime(0.07, t + 0.8);
        vg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        v.connect(vf); vf.connect(vg); vg.connect(sfxBus);
        v.start(t); v.stop(t + 1.7);
      });
    }
    // CONTESTS + JUSTICE OUTCOMES (Steve 2026-10-06): the contest system and
    // justice outcomes fired no audio at all. These synths are the hooks —
    // dispatch wiring belongs to the contests/truth workers. Freaky bar: the
    // wave-2 and glasswing sets. The System is twisted and out of touch but
    // genuinely trying: game-show joy over real dread.
    function contestCall() {
      // THE CALL: a contest window opens. A bright game-show arpeggio — with
      // one voice sliding off pitch, and a crowd swell that cuts dead.
      // Someone might be taken. It might be you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6 — bright, televised
      notes.forEach((fq, i) => {
        const dt = t + i * 0.16;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fq * (i === 3 ? 0.94 : 1); // the last one slides off
        if (i === 3) o.frequency.exponentialRampToValueAtTime(fq * 0.89, dt + 0.3);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.2, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.4);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.45);
      });
      // crowd: noise swell that cuts dead — the audience, then nothing
      const nz = noise(0.9), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.7;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.12, t + 0.7);
        ng.gain.setValueAtTime(0.12, t + 0.78);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8); // cut dead
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.85);
      }
    }
    function contestTaken() {
      // THE GRAB: you are chosen. The air sucks out (reverse swell), then a
      // klaxon that's slightly too slow — the System is savoring it.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // reverse swell: the world inhaling
      const nz = noise(0.7), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.setValueAtTime(300, t);
        nf.frequency.exponentialRampToValueAtTime(4000, t + 0.7);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.3, t + 0.65);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.75);
      }
      // too-slow klaxon: 3 blasts, each a hair longer than the last
      for (let i = 0; i < 3; i++) {
        const dt = t + 0.75 + i * 0.5;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(620, dt);
        o.frequency.exponentialRampToValueAtTime(440, dt + 0.28 + i * 0.06);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.22, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.35 + i * 0.06);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.42 + i * 0.06);
      }
    }
    function contestSpared() {
      // NOT TAKEN: announced spared. A relieved exhale that doesn't quite
      // land — a soft major tone with a dissonant shadow that outlives it.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(392, t);
      o.frequency.exponentialRampToValueAtTime(523, t + 0.5); // G4 → C5, relief
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.95);
      // the shadow: a minor-second shadow that stays after the relief fades
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine'; s.frequency.value = 554; // C#5 against the C5 — wrong
      sg.gain.setValueAtTime(0.0001, t + 0.5);
      sg.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      s.connect(sg); sg.connect(sfxBus); s.start(t + 0.5); s.stop(t + 1.65);
          // (deepened Steve 2026-10-06): the crowd exhales with you — a soft sigh
      // that cuts dead, just like the contestCall crowd — and the shadow
      // gets a beating twin: two voices a hair apart, neither leaving.
      const sz = noise(1.0), sf = ctx.createBiquadFilter(), sng = ctx.createGain();
      if (sz) {
        sf.type = 'bandpass'; sf.frequency.value = 700; sf.Q.value = 0.6;
        sng.gain.setValueAtTime(0.0001, t);
        sng.gain.exponentialRampToValueAtTime(0.08, t + 0.5);
        sng.gain.setValueAtTime(0.08, t + 0.62);
        sng.gain.exponentialRampToValueAtTime(0.0001, t + 0.65); // cut dead
        sz.connect(sf); sf.connect(sng); sng.connect(sfxBus);
        sz.start(t); sz.stop(t + 0.7);
      }
      const s2 = ctx.createOscillator(), sg2 = ctx.createGain(); // the twin
      s2.type = 'sine'; s2.frequency.value = 557; // beats against the 554
      sg2.gain.setValueAtTime(0.0001, t + 0.6);
      sg2.gain.exponentialRampToValueAtTime(0.035, t + 1.0);
      sg2.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      s2.connect(sg2); sg2.connect(sfxBus); s2.start(t + 0.6); s2.stop(t + 1.75);
      const shl = ctx.createOscillator(), shlg = ctx.createGain(); // the shadow breathes
      shl.type = 'sine'; shl.frequency.value = 0.7; shlg.gain.value = 0.02;
      shl.connect(shlg); shlg.connect(sg2.gain);
      shl.start(t + 0.6); shl.stop(t + 1.75);
    }
    function justiceVerdict() {
      // THE VERDICT: the moot has decided. The three drums compress into one
      // heavy strike, and a cold tone holds too long afterward — the System
      // letting the decision sit in the room.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(65, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.85);
      // the strike's crack: splintered attack transient
      const nz = noise(0.15), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 1800;
        ng.gain.setValueAtTime(0.2, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.18);
      }
      // the cold tone that holds too long
      [110, 116.5].forEach(fq => { // A2 vs Bb2 — a semitone of unease
        const v = ctx.createOscillator(), vg = ctx.createGain();
        v.type = 'sine'; v.frequency.value = fq;
        vg.gain.setValueAtTime(0.0001, t + 0.3);
        vg.gain.exponentialRampToValueAtTime(0.06, t + 1.0);
        vg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        v.connect(vg); vg.connect(sfxBus); v.start(t + 0.3); v.stop(t + 2.25);
      });
    }
    function exileWalk() {
      // THE WALK, LONELIER (Steve 2026-10-07): each hum voice goes flat as it
      // drops — the village forgets the note. A limping gait with gravel
      // under every step. A lone wandering wind arrives after the voices are
      // gone. One distant bell partial rings once and never resolves.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [130, 131.2, 138.5, 140].forEach((fq, i) => {
        const v = ctx.createOscillator(), vg = ctx.createGain();
        v.type = 'triangle';
        const stopAt = t + 0.6 + i * 0.7;
        v.frequency.setValueAtTime(fq, t);
        v.frequency.exponentialRampToValueAtTime(fq * 0.94, stopAt);
        vg.gain.setValueAtTime(0.0001, t);
        vg.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
        vg.gain.setValueAtTime(0.07, stopAt - 0.15);
        vg.gain.exponentialRampToValueAtTime(0.0001, stopAt);
        v.connect(vg); vg.connect(sfxBus); v.start(t); v.stop(stopAt + 0.05);
      });
      const gait = [0.55, 0.62, 0.51, 0.58, 0.66, 0.55];
      let dt = t + 0.3;
      gait.forEach((step, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, dt);
        o.frequency.exponentialRampToValueAtTime(55, dt + 0.12);
        f.type = 'lowpass'; f.frequency.value = 900 - i * 120;
        g.gain.setValueAtTime(0.2 - i * 0.028, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
        o.connect(f); f.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.2);
        const nz2 = noise(0.08), nf2 = ctx.createBiquadFilter(), ng2 = ctx.createGain();
        if (nz2) {
          nf2.type = 'highpass'; nf2.frequency.value = 2500;
          ng2.gain.setValueAtTime(Math.max(0.012, 0.05 - i * 0.006), dt);
          ng2.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
          nz2.connect(nf2); nf2.connect(ng2); ng2.connect(sfxBus);
          nz2.start(dt); nz2.stop(dt + 0.1);
        }
        dt += step;
      });
      [196, 196.9].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 0.07; lg.gain.value = 1.2;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t + 1.5);
        g.gain.exponentialRampToValueAtTime(0.035, t + 2.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
        o.connect(g); g.connect(sfxBus);
        o.start(t + 1.5); o.stop(t + 5.6); lfo.start(t + 1.5); lfo.stop(t + 5.6);
      });
      const lastDrop = t + 0.6 + 3 * 0.7;
      [[660, 0.05], [1320, 0.018]].forEach(([fq, peak]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, lastDrop);
        g.gain.exponentialRampToValueAtTime(peak, lastDrop + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, lastDrop + 2.6);
        o.connect(g); g.connect(sfxBus);
        o.start(lastDrop); o.stop(lastDrop + 2.7);
      });
    }
    // CONTEST BESPOKE SET (Steve 2026-10-08): the 30 older contests had beats
    // composed over existing synths; these six beats had fiction too strong
    // for borrowed voices — each gets its own alien texture. No two share a
    // waveform+envelope shape.
    function altarCurdle() {
      // THE ALTAR TAKES HOLD: muzak in a side-room key — three triangle
      // voices, each one sagging flat mid-note, and a sub pedal that was
      // never in the scale. The room is wrong in a way you can hum.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [196, 233.1, 311.1].forEach((fq, i) => { // G3 Bb3 Eb4 — the altar's key
        const dt = t + i * 0.42;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(fq, dt);
        o.frequency.exponentialRampToValueAtTime(fq * 0.94, dt + 0.38); // the curdle: each note sags
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.11, dt + 0.09);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.5);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 1.2;
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.55);
      });
      // the pedal: a sub tone outside the scale, arriving late, staying wrong
      const p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'sine'; p.frequency.value = 51.7; // between the notes — not in the key
      pg.gain.setValueAtTime(0.0001, t + 0.9);
      pg.gain.exponentialRampToValueAtTime(0.14, t + 1.6);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      p.connect(pg); pg.connect(sfxBus); p.start(t + 0.9); p.stop(t + 2.7);
      // the pedal warbles: a slow LFO on its frequency — the wrongness breathes
      const pw = ctx.createOscillator(), pwg = ctx.createGain();
      pw.type = 'sine'; pw.frequency.value = 0.4; pwg.gain.value = 2.6;
      pw.connect(pwg); pwg.connect(p.frequency);
      pw.start(t + 0.9); pw.stop(t + 2.7);
    }
    function hungerGnaw() {
      // HUNGER TAKES HOLD: the white room gets inside you. An FM gut-growl
      // (low carrier, slow modulator — peristalsis as synthesis) under
      // irregular wet gurgle bursts, and one hollow thump where the broth
      // would have been. It does not stop when the phase ends in your head.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 2.2;
      // the growl: FM — carrier 48Hz, modulator 9Hz chewing at it
      const car = ctx.createOscillator(), cg = ctx.createGain();
      const mod = ctx.createOscillator(), mg = ctx.createGain();
      car.type = 'sine'; car.frequency.value = 48;
      mod.type = 'sine'; mod.frequency.value = 9; mg.gain.value = 26;
      mod.connect(mg); mg.connect(car.frequency);
      const trem = ctx.createOscillator(), tg = ctx.createGain(); // the chew rhythm
      trem.type = 'sine'; trem.frequency.value = 2.3; tg.gain.value = 0.05;
      trem.connect(tg); tg.connect(cg.gain);
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.16, t + 0.5);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      car.connect(cg); cg.connect(sfxBus);
      car.start(t); mod.start(t); trem.start(t);
      car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05); trem.stop(t + dur + 0.05);
      // gurgle bursts: lowpassed noise plosives, irregular
      [0.15, 0.62, 1.05, 1.7].forEach((off, i) => {
        const dt = t + off;
        const nz = noise(0.12), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'lowpass'; nf.frequency.value = 400 - i * 60;
        ng.gain.setValueAtTime(0.0001, dt);
        ng.gain.exponentialRampToValueAtTime(0.22 - i * 0.02, dt + 0.02); // plosive: fast in
        ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.11);          // wet tail out
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(dt); nz.stop(dt + 0.14);
      });
      // the hollow thump: where food should be
      const h = ctx.createOscillator(), hg = ctx.createGain();
      h.type = 'sine';
      h.frequency.setValueAtTime(70, t + 0.8);
      h.frequency.exponentialRampToValueAtTime(38, t + 0.95);
      hg.gain.setValueAtTime(0.0001, t + 0.8);
      hg.gain.exponentialRampToValueAtTime(0.25, t + 0.83);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      h.connect(hg); hg.connect(sfxBus); h.start(t + 0.8); h.stop(t + 1.25);
    }
    function predatorListen() {
      // IT IS ALREADY LISTENING: the sixty-count over deliberate hush. Almost
      // nothing — an infrasound pressure you feel in your teeth, five tiny
      // clicks (twigs? ears?) that must not be yours, and one exhale too deep
      // to be human, arriving from the wrong direction.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the pressure: 16Hz sine, felt not heard, swelling then holding
      const sub = ctx.createOscillator(), sg = ctx.createGain();
      sub.type = 'sine'; sub.frequency.setValueAtTime(16, t);
      sub.frequency.exponentialRampToValueAtTime(13, t + 1.4); // the air gets heavier
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.2, t + 1.2);
      sg.gain.setValueAtTime(0.2, t + 1.8);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      sub.connect(sg); sg.connect(sfxBus); sub.start(t); sub.stop(t + 2.5);
      // the pressure comes in waves: a slow LFO on the infrasound gain
      const sw = ctx.createOscillator(), swg = ctx.createGain();
      sw.type = 'sine'; sw.frequency.value = 0.13; swg.gain.value = 0.09;
      sw.connect(swg); swg.connect(sg.gain);
      sw.start(t); sw.stop(t + 2.5);
      // micro-clicks: irregular, too quiet to place
      [0.3, 0.75, 1.1, 1.55, 1.9].forEach((off) => {
        const dt = t + off;
        const nz = noise(0.03), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'highpass'; nf.frequency.value = 3000;
        ng.gain.setValueAtTime(0.09, dt);
        ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.025);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(dt); nz.stop(dt + 0.04);
      });
      // the exhale: lowpassed noise swell from the wrong direction
      const nz = noise(0.6), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 500;
        ng.gain.setValueAtTime(0.0001, t + 1.0);
        ng.gain.exponentialRampToValueAtTime(0.18, t + 1.35);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.65);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 1.0); nz.stop(t + 1.7);
      }
    }
    function teethTick() {
      // THE WHEEL COUNTS: six ticks, each brighter than the last — dry clicks
      // with a wet resonance rising in semitones, under a gnashing undertone
      // that descends while the ticks climb. The last tick is too long. The
      // teeth are smiling. Or not.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const res = [400, 462, 534, 617, 713, 823]; // rising semitone-ish
      res.forEach((fq, i) => {
        const dt = t + i * 0.22, last = i === res.length - 1;
        const nz = noise(0.08), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'bandpass'; nf.frequency.value = fq; nf.Q.value = 12; // wet tooth resonance
        ng.gain.setValueAtTime(0.0001, dt);
        ng.gain.exponentialRampToValueAtTime(0.28, dt + 0.012); // staccato: instant in
        ng.gain.exponentialRampToValueAtTime(0.0001, dt + (last ? 0.22 : 0.07)); // last one lingers
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(dt); nz.stop(dt + (last ? 0.26 : 0.1));
        // the click's dry transient under the resonance
        const hz = noise(0.02), hf = ctx.createBiquadFilter(), hg2 = ctx.createGain();
        hf.type = 'highpass'; hf.frequency.value = 2500;
        hg2.gain.setValueAtTime(0.12, dt);
        hg2.gain.exponentialRampToValueAtTime(0.0001, dt + 0.02);
        hz.connect(hf); hf.connect(hg2); hg2.connect(sfxBus);
        hz.start(dt); hz.stop(dt + 0.03);
      });
      // the gnash: a saw undertone descending while the ticks climb
      const g = ctx.createOscillator(), gg = ctx.createGain(), gf = ctx.createBiquadFilter();
      g.type = 'sawtooth';
      g.frequency.setValueAtTime(95, t);
      g.frequency.exponentialRampToValueAtTime(68, t + 1.4);
      gf.type = 'lowpass'; gf.frequency.value = 300;
      const am = ctx.createOscillator(), amg = ctx.createGain(); // gnash rhythm
      am.type = 'square'; am.frequency.value = 6.5; amg.gain.value = 0.03;
      am.connect(amg); amg.connect(gg.gain);
      gg.gain.setValueAtTime(0.0001, t);
      gg.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      g.connect(gf); gf.connect(gg); gg.connect(sfxBus);
      g.start(t); am.start(t); g.stop(t + 1.7); am.stop(t + 1.7);
    }
    function mindMoth() {
      // IT READS THE BURIED ONE: the quiet room leans in. Two syllables of
      // formant-shaped noise that swell IN like a reversed tape — your voice
      // arriving before you think it — while a high reading tone wobbles,
      // finds the buried frequency, and locks on. It heard that.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // reverse-swell syllables: bandpassed noise, formants cycling
      [[700, 0.0], [1100, 0.55], [2600, 1.1]].forEach(([fq, off]) => {
        const dt = t + off;
        const nz = noise(0.8), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'bandpass'; nf.Q.value = 6;
        nf.frequency.setValueAtTime(fq * 1.3, dt);
        nf.frequency.exponentialRampToValueAtTime(fq, dt + 0.6); // the voice settles onto you
        ng.gain.setValueAtTime(0.0001, dt);
        ng.gain.exponentialRampToValueAtTime(0.2, dt + 0.55);   // swell IN — reversed
        ng.gain.setValueAtTime(0.2, dt + 0.6);
        ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.68); // cut sharp
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(dt); nz.stop(dt + 0.75);
      });
      // the reading tone: high, pure, wobbling — then it locks on
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sine';
      r.frequency.setValueAtTime(2450, t);
      const wob = ctx.createOscillator(), wg = ctx.createGain();
      wob.type = 'sine'; wob.frequency.value = 13; wg.gain.value = 60;
      wob.connect(wg); wg.connect(r.frequency);
      rg.gain.setValueAtTime(0.0001, t);
      rg.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
      rg.gain.setValueAtTime(0.05, t + 0.9);
      r.connect(rg); rg.connect(sfxBus); r.start(t); wob.start(t);
      r.stop(t + 2.0); wob.stop(t + 2.0);
      // the lock: pitch settles onto the buried frequency as automation
      r.frequency.setValueAtTime(2450, t + 0.9);
      r.frequency.exponentialRampToValueAtTime(2200, t + 1.1);
      rg.gain.exponentialRampToValueAtTime(0.07, t + 1.1);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    }
    function engineVoices() {
      // THE ENGINE'S MOUTHS: a detuned saw drone — two voices a hair apart,
      // beating against each other — and over it the mouths: vowel-shaped
      // notes in a lullaby cadence with one extra beat, the last syllable a
      // minor second too low. It almost sounds like someone you know.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 2.4;
      // the drone: 110Hz and 110.8 — the beating pair
      [110, 110.8].forEach((fq) => {
        const d = ctx.createOscillator(), dg = ctx.createGain(), df = ctx.createBiquadFilter();
        d.type = 'sawtooth'; d.frequency.value = fq;
        df.type = 'lowpass'; df.frequency.value = 500;
        dg.gain.setValueAtTime(0.0001, t);
        dg.gain.exponentialRampToValueAtTime(0.06, t + 0.8);
        dg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        d.connect(df); df.connect(dg); dg.connect(sfxBus);
        d.start(t); d.stop(t + dur + 0.05);
        // the mouths wobble: a slow vibrato on the drone pair — they can't hold the note
        const dw = ctx.createOscillator(), dwg = ctx.createGain();
        dw.type = 'sine'; dw.frequency.value = 4.7; dwg.gain.value = 3.2;
        dw.connect(dwg); dwg.connect(d.frequency);
        dw.start(t); dw.stop(t + dur + 0.05);
      });
      // the mouths: vowel formants on saw notes, lullaby + one extra beat
      const vowels = [800, 500, 1200, 800, 660]; // ah oo eh ah ...uh
      const notes = [220, 196, 246.9, 220, 207.6]; // the last one a minor 2nd low
      vowels.forEach((form, i) => {
        const dt = t + 0.3 + i * 0.36;
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = notes[i];
        f.type = 'bandpass'; f.frequency.value = form; f.Q.value = 5;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(i === 4 ? 0.14 : 0.1, dt + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + (i === 4 ? 0.5 : 0.3)); // the last one hangs
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + (i === 4 ? 0.55 : 0.35));
      });
    }
    // ---- HAVEN ARC (Steve 2026-10-06): a sibling's exile/betrayal system
    // fired joinVillage/claimSite/chopWood/buildShelter/foundHaven with no
    // synths — now they have them. The exile's redemption has a sound:
    // probation's half-welcome, the claim's wind, honest work, timber
    // becoming shelter, and the new hearth catching.
    function joinVillage() {
      // PROBATION: fourteen days at their fire. The fire is shared — a
      // crackle swelling as you're let closer — many small voices settling,
      // and one warm tone that doesn't quite resolve. You're not one of
      // them — not yet. You're the chance they took.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.6;
      // fire shared: crackle swelling
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 0.8;
        nf.frequency.setValueAtTime(800, t);
        nf.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.7);
        const cg = ctx.createOscillator(), cgg = ctx.createGain();
        cg.type = 'square'; cg.frequency.value = 9; cgg.gain.value = 0.5; // crackle gate
        cg.connect(cgg); cgg.connect(ng.gain);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.6);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); cg.start(t); nz.stop(t + dur); cg.stop(t + dur);
      }
      // small voices settling: three short murmurs, detuned
      [196, 207, 174].forEach((fq, i) => {
        const dt = t + 0.2 + i * 0.3;
        const v = ctx.createOscillator(), vg = ctx.createGain();
        v.type = 'triangle'; v.frequency.setValueAtTime(fq * 1.4, dt);
        v.frequency.exponentialRampToValueAtTime(fq, dt + 0.2);
        vg.gain.setValueAtTime(0.0001, dt);
        vg.gain.exponentialRampToValueAtTime(0.06, dt + 0.08);
        vg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.3);
        v.connect(vg); vg.connect(sfxBus); v.start(dt); v.stop(dt + 0.35);
      });
      // the warm tone that doesn't resolve: a major third left hanging
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine'; w.frequency.value = 329.6; // E4 — the third, no root
      wg.gain.setValueAtTime(0.0001, t + 0.8);
      wg.gain.exponentialRampToValueAtTime(0.07, t + 1.1);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      w.connect(wg); wg.connect(sfxBus); w.start(t + 0.8); w.stop(t + dur + 0.05);
    }
    function claimSite() {
      // THE CLAIM: a cairn stone set on stone (three clicks, each finding
      // its seat), a branch snapped for the mark, and the wind — the wind
      // is wrong here, it bends a semitone flat halfway through.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // cairn: three stone clicks, each settling
      [0, 0.22, 0.5].forEach((off, i) => {
        const dt = t + off;
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'sine';
        s.frequency.setValueAtTime(1400 - i * 150, dt);
        s.frequency.exponentialRampToValueAtTime(900 - i * 100, dt + 0.06);
        sg.gain.setValueAtTime(0.16 - i * 0.03, dt);
        sg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.1);
        s.connect(sg); sg.connect(sfxBus); s.start(dt); s.stop(dt + 0.12);
      });
      // the branch snap: a dry crack
      const bz = noise(0.08), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
      if (bz) {
        bf.type = 'highpass'; bf.frequency.value = 2500;
        bg.gain.setValueAtTime(0.2, t + 0.75);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
        bz.connect(bf); bf.connect(bg); bg.connect(sfxBus);
        bz.start(t + 0.75); bz.stop(t + 0.86);
      }
      // the wind: wrong — bends a semitone flat halfway through — and it
      // shudders: an LFO wobble on the formant, the air unsure of itself
      const wz = noise(1.4), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
      if (wz) {
        wf.type = 'bandpass'; wf.Q.value = 2;
        wf.frequency.setValueAtTime(600, t);
        wf.frequency.exponentialRampToValueAtTime(566, t + 0.7); // semitone flat
        wf.frequency.exponentialRampToValueAtTime(600, t + 1.4); // ...and back. wrong.
        const wl = ctx.createOscillator(), wlg = ctx.createGain();
        wl.type = 'sine'; wl.frequency.value = 2.3; wlg.gain.value = 60;
        wl.connect(wlg); wlg.connect(wf.frequency);
        wg.gain.setValueAtTime(0.0001, t);
        wg.gain.exponentialRampToValueAtTime(0.1, t + 0.4);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        wz.connect(wf); wf.connect(wg); wg.connect(sfxBus);
        wz.start(t); wl.start(t); wz.stop(t + 1.45); wl.stop(t + 1.45);
      }
    }
    function chopWood() {
      // HONEST WORK: the axe falls in rhythm — thunk, crack, breath. Three
      // swings, each a fraction harder, wood splitting brighter each time,
      // and the worker's exhale under it. Green wood is heavy.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const dt = t + i * 0.55;
        // the thunk: low, harder each swing
        const th = ctx.createOscillator(), thg = ctx.createGain();
        th.type = 'sine'; th.frequency.setValueAtTime(110, dt);
        th.frequency.exponentialRampToValueAtTime(45, dt + 0.15);
        thg.gain.setValueAtTime(0.3 + i * 0.06, dt);
        thg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.2);
        th.connect(thg); thg.connect(sfxBus); th.start(dt); th.stop(dt + 0.22);
        // the split: brighter each time — wood giving way
        const sz = noise(0.12), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
        if (sz) {
          sf.type = 'bandpass'; sf.Q.value = 2;
          sf.frequency.value = 1600 + i * 500;
          sg.gain.setValueAtTime(0.2, dt + 0.04);
          sg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
          sz.connect(sf); sf.connect(sg); sg.connect(sfxBus);
          sz.start(dt + 0.04); sz.stop(dt + 0.18);
        }
        // the exhale: effort, under the work
        const ez = noise(0.2), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
        if (ez) {
          ef.type = 'bandpass'; ef.frequency.value = 400; ef.Q.value = 1;
          eg.gain.setValueAtTime(0.0001, dt + 0.1);
          eg.gain.exponentialRampToValueAtTime(0.08, dt + 0.2);
          eg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.32);
          ez.connect(ef); ef.connect(eg); eg.connect(sfxBus);
          ez.start(dt + 0.1); ez.stop(dt + 0.35);
        }
      }
    }
    function buildShelter() {
      // RAISING: timber knocking into timber — joints finding each other —
      // rope creaking under the strain, and the whole frame settling with
      // one long groan at the end. A roof that mostly keeps the rain out.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // joints: four knocks, each more certain
      [0, 0.35, 0.75, 1.2].forEach((off, i) => {
        const dt = t + off;
        const k = ctx.createOscillator(), kg = ctx.createGain();
        k.type = 'sine'; k.frequency.setValueAtTime(220 - i * 20, dt);
        k.frequency.exponentialRampToValueAtTime(90, dt + 0.1);
        const kf = ctx.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 900;
        kg.gain.setValueAtTime(0.24 + i * 0.04, dt);
        kg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
        k.connect(kf); kf.connect(kg); kg.connect(sfxBus); k.start(dt); k.stop(dt + 0.18);
      });
      // rope creak: a strained rising tone under the third joint
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sawtooth';
      r.frequency.setValueAtTime(180, t + 0.7);
      r.frequency.exponentialRampToValueAtTime(260, t + 1.2);
      const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 500;
      rg.gain.setValueAtTime(0.0001, t + 0.7);
      rg.gain.exponentialRampToValueAtTime(0.05, t + 0.95);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      r.connect(rf); rf.connect(rg); rg.connect(sfxBus); r.start(t + 0.7); r.stop(t + 1.3);
      // the settling groan: the whole frame, one long exhale
      const g2 = ctx.createOscillator(), gg = ctx.createGain();
      g2.type = 'sawtooth';
      g2.frequency.setValueAtTime(85, t + 1.4);
      g2.frequency.exponentialRampToValueAtTime(50, t + 2.1);
      const gf = ctx.createBiquadFilter(); gf.type = 'lowpass'; gf.frequency.value = 220;
      gg.gain.setValueAtTime(0.0001, t + 1.4);
      gg.gain.exponentialRampToValueAtTime(0.12, t + 1.6);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      g2.connect(gf); gf.connect(gg); gg.connect(sfxBus); g2.start(t + 1.4); g2.stop(t + 2.25);
    }
    function foundHaven() {
      // NEW HEARTH: the haven is founded — a hard reset, a real fork. Many
      // hands raising the last beam together (one knock, many echoes), the
      // fire catching (a breath becoming a roar), and a warm chord that
      // lands with ONE note slightly sharp — nothing's perfect — while far
      // away, faint, the old haven's hum answers once. It continues without you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the last beam: one knock, many echoes
      const k = ctx.createOscillator(), kg = ctx.createGain();
      k.type = 'sine'; k.frequency.setValueAtTime(150, t);
      k.frequency.exponentialRampToValueAtTime(50, t + 0.2);
      kg.gain.setValueAtTime(0.4, t);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      k.connect(kg); kg.connect(sfxBus); k.start(t); k.stop(t + 0.35);
      [0.3, 0.55, 0.9].forEach((off, i) => {
        const e = ctx.createOscillator(), eg = ctx.createGain();
        e.type = 'sine'; e.frequency.setValueAtTime(150, t + off);
        e.frequency.exponentialRampToValueAtTime(60, t + off + 0.15);
        eg.gain.setValueAtTime(0.12 - i * 0.03, t + off);
        eg.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.2);
        e.connect(eg); eg.connect(sfxBus); e.start(t + off); e.stop(t + off + 0.25);
      });
      // the fire catching: a breath becoming a roar
      const fz = noise(1.6), ff = ctx.createBiquadFilter(), fg = ctx.createGain();
      if (fz) {
        ff.type = 'lowpass';
        ff.frequency.setValueAtTime(400, t + 0.4);
        ff.frequency.exponentialRampToValueAtTime(3000, t + 1.8);
        const cg = ctx.createOscillator(), cgg = ctx.createGain();
        cg.type = 'square'; cg.frequency.value = 11; cgg.gain.value = 0.4;
        cg.connect(cgg); cgg.connect(fg.gain);
        fg.gain.setValueAtTime(0.0001, t + 0.4);
        fg.gain.exponentialRampToValueAtTime(0.22, t + 1.6);
        fg.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
        fz.connect(ff); ff.connect(fg); fg.connect(sfxBus);
        fz.start(t + 0.4); cg.start(t + 0.4); fz.stop(t + 2.05); cg.stop(t + 2.05);
      }
      // the chord: warm, landing — with one note slightly sharp
      [261.6, 329.6, 392, 523.3 * 1.004].forEach((fq, i) => {
        const dt = t + 1.0 + i * 0.12;
        const c = ctx.createOscillator(), cg2 = ctx.createGain();
        c.type = 'triangle'; c.frequency.value = fq;
        cg2.gain.setValueAtTime(0.0001, dt);
        cg2.gain.exponentialRampToValueAtTime(0.09, dt + 0.1);
        cg2.gain.exponentialRampToValueAtTime(0.0001, dt + 1.2);
        c.connect(cg2); cg2.connect(sfxBus); c.start(dt); c.stop(dt + 1.25);
      });
      // the old haven, far away: one faint answering hum — then it's gone
      const oh = ctx.createOscillator(), ohg = ctx.createGain();
      oh.type = 'sine'; oh.frequency.value = 130;
      ohg.gain.setValueAtTime(0.0001, t + 1.6);
      ohg.gain.exponentialRampToValueAtTime(0.04, t + 2.0);
      ohg.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      oh.connect(ohg); ohg.connect(sfxBus); oh.start(t + 1.6); oh.stop(t + 2.85);
    }
    function genesis_plant() {
      // ALIEN GENESIS: something growing that shouldn't — wet, vegetal, wrong.
      // The second voice starts late and grows DOWNWARD while the first grows
      // up: something growing wrong inside the wrong thing. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.4;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(420, t + dur); // growing upward
      // Organic wobble
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 5;
      lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
      // Wet filter
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(1500, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
      // the wrong growth: joins late, climbs down, wobbles faster — sicker
      const w = ctx.createOscillator(), wg = ctx.createGain(), wf = ctx.createBiquadFilter();
      const wt = t + 0.5;
      w.type = 'triangle'; w.frequency.setValueAtTime(300, wt);
      w.frequency.exponentialRampToValueAtTime(120, wt + dur * 0.7); // growing DOWN
      const wl = ctx.createOscillator(), wlg = ctx.createGain();
      wl.type = 'sine'; wl.frequency.value = 11; // faster wobble: feverish
      wlg.gain.value = 35; wl.connect(wlg); wlg.connect(w.frequency);
      wf.type = 'bandpass'; wf.Q.value = 6;
      wf.frequency.setValueAtTime(900, wt);
      wf.frequency.exponentialRampToValueAtTime(350, wt + dur * 0.7);
      wg.gain.setValueAtTime(0.0001, wt);
      wg.gain.exponentialRampToValueAtTime(0.13, wt + 0.3);
      wg.gain.exponentialRampToValueAtTime(0.0001, wt + dur * 0.7);
      w.connect(wf); wf.connect(wg); wg.connect(sfxBus);
      w.start(wt); wl.start(wt); w.stop(wt + dur * 0.7 + 0.05); wl.stop(wt + dur * 0.7 + 0.05);
    }
    function gravity_well() {
      // GRAVITY DISTORTS: everything pitches down — the world gets heavy.
      // Two voices fall at DIFFERENT rates: the stretch is uneven, which is
      // what makes your stomach drop. When they bottom out, a sub-bass thump
      // lands like the world hitting the floor. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.2;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(400, t);
      o.frequency.exponentialRampToValueAtTime(60, t + dur); // falling into the well
      // the partner: starts a fifth up, falls slower — the uneven stretch
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sawtooth'; o2.frequency.setValueAtTime(600, t);
      o2.frequency.exponentialRampToValueAtTime(110, t + dur * 1.15);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(2000, t);
      f.frequency.exponentialRampToValueAtTime(200, t + dur);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); o2.connect(f); f.connect(g); f.connect(g2); g.connect(sfxBus); g2.connect(sfxBus);
      o.start(t); o.stop(t + dur); o2.start(t); o2.stop(t + dur * 1.15);
      // bottoming out: the world hits the floor
      const th = ctx.createOscillator(), thg = ctx.createGain();
      th.type = 'sine'; th.frequency.setValueAtTime(70, t + dur * 0.9);
      th.frequency.exponentialRampToValueAtTime(30, t + dur + 0.25);
      thg.gain.setValueAtTime(0.0001, t + dur * 0.9);
      thg.gain.exponentialRampToValueAtTime(0.4, t + dur + 0.03);
      thg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
      th.connect(thg); thg.connect(sfxBus); th.start(t + dur * 0.9); th.stop(t + dur + 0.45);
    }
    function waveUnlock() {
      // NEW WAVE: a fanfare — but wrong. The celebration is for THEM, not you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const notes = [392, 494, 587, 466]; // G4 B4 D5 Bb4 — almost triumphant, then off
      notes.forEach((freq, i) => {
        const dt = t + i * 0.18;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq * 0.99; // slightly detuned
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
        g.gain.setValueAtTime(0.16, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.3);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.32);
      });
      // Wrongness underneath: low dissonant drone
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 98;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 103;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + 1.0); o2.stop(t + 1.0);
    }
    // AUDIO COMPLETION (Steve 2026-10-06): these fired with no synth at all.
    // ---- CRASH: a structure is destroyed ----
    function crash(d) {
      // SMASH: the world breaks. Cause matters: the bulldozer is heavier,
      // deeper, dirtier; terraform is the ground itself churning. Either way
      // it rattles the phone.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const bulldozer = (d && d.cause) === 'bulldozer';
      // the deep hit: sub-bass drop, heavier for the bulldozer
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(bulldozer ? 110 : 90, t);
      o.frequency.exponentialRampToValueAtTime(26, t + 0.5);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.75);
      // splintering: crackling burst of bandpassed noise
      const nz = noise(0.7), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass';
        nf.frequency.setValueAtTime(2600, t);
        nf.frequency.exponentialRampToValueAtTime(400, t + 0.55);
        nf.Q.value = 1.4;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.4, t + 0.04);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.65);
      }
      // settling dust: low rumble tail
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sawtooth'; r.frequency.setValueAtTime(55, t + 0.3);
      const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 150;
      rg.gain.setValueAtTime(0.0001, t + 0.3);
      rg.gain.exponentialRampToValueAtTime(0.16, t + 0.45);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      r.connect(rf); rf.connect(rg); rg.connect(sfxBus);
      r.start(t + 0.3); r.stop(t + 1.15);
    }
    // ---- LEVELUP: a stat grows. quiet: true. No fanfare — the work is
    // changing you, and change doesn't announce itself. A soft breathy rise,
    // low and warm, felt more than heard. ----
    function levelup(d) {
      // (deepened Steve 2026-10-06): a stat grows — soft breathy rise, no
      // fanfare, felt not heard — but now the System NOTICES: a faint chime,
      // slightly sharp, arriving 0.45s late like an afterthought, and a soft
      // harmonic an octave above the rise. Growth is being filed.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      const quiet = !(d && d.quiet === false);
      const peak = quiet ? 0.10 : 0.18;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(196, t);
      o.frequency.exponentialRampToValueAtTime(262, t + dur * 0.7); // G3 → C4, a breath up
      // breathy: soft noise bed under the tone
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 1;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(peak * 0.35, t + dur * 0.5);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur);
      }
      // soft harmonic an octave above the rise — overshooting slightly,
      // then settling: the growth is being filed
      const oh = ctx.createOscillator(), gh = ctx.createGain();
      oh.type = 'sine';
      oh.frequency.setValueAtTime(392, t);
      oh.frequency.exponentialRampToValueAtTime(640, t + dur * 0.7);
      gh.gain.setValueAtTime(0.0001, t);
      gh.gain.exponentialRampToValueAtTime(peak * 0.3, t + dur * 0.55);
      gh.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      oh.connect(gh); gh.connect(sfxBus); oh.start(t); oh.stop(t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      // the System notices: a faint chime, sharp, arriving late — and it
      // notices twice, slightly out of sync: the second chime is flat,
      // beating against the first
      const ct = t + 0.45;
      [[1580, 0], [1569.5, 0.09]].forEach(([fq, off]) => {
        const c = ctx.createOscillator(), cg = ctx.createGain();
        c.type = 'sine'; c.frequency.value = fq;
        const st = ct + off;
        cg.gain.setValueAtTime(0.0001, st);
        cg.gain.exponentialRampToValueAtTime(peak * 0.5, st + 0.03);
        cg.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
        c.connect(cg); cg.connect(sfxBus); c.start(st); c.stop(st + 0.55);
      });
    }
    // ---- PASSIVE UNLOCK: you feel yourself learning. quiet: true. A small
    // knowing click — the lesson landing — under a low resonant hum that
    // lingers a moment, like the ground settling into you. ----
    function passiveUnlock(d) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const quiet = !(d && d.quiet === false);
      const peak = quiet ? 0.10 : 0.18;
      // the click: a lesson landing
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'triangle'; c.frequency.setValueAtTime(1900, t);
      c.frequency.exponentialRampToValueAtTime(1200, t + 0.06);
      cg.gain.setValueAtTime(peak * 1.6, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      c.connect(cg); cg.connect(sfxBus);
      c.start(t); c.stop(t + 0.15);
      // the settling: low resonant hum, slightly detuned pair
      const h1 = ctx.createOscillator(), h2 = ctx.createOscillator(), hg = ctx.createGain();
      h1.type = 'sine'; h2.type = 'sine';
      h1.frequency.value = 110; h2.frequency.value = 111.3; // slow beat
      hg.gain.setValueAtTime(0.0001, t + 0.08);
      hg.gain.exponentialRampToValueAtTime(peak, t + 0.5);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      h1.connect(hg); h2.connect(hg); hg.connect(sfxBus);
      h1.start(t + 0.08); h2.start(t + 0.08);
      h1.stop(t + 1.35); h2.stop(t + 1.35);
    }
    // ---- KNOWLEDGE REVEAL (Steve 2026-10-07): the "aha!" — you learned
    // something. Bright ascending arpeggio (the lightbulb), but the System
    // is alien: the top note arrives slightly sharp and keeps climbing past
    // where it should resolve, like the universe just leaned in to whisper.
    // A shimmer underneath that doesn't quite settle — curiosity, not closure.
    function knowledgeReveal(d) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const peak = 0.16;
      // the aha: quick ascending arpeggio, C-E-G, each note brighter
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t + i * 0.09);
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(peak * (0.7 + i * 0.2), t + i * 0.09 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.35);
        o.connect(g); g.connect(sfxBus);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
      });
      // the top note overshoots: G5 climbing sharp past resolution
      const top = ctx.createOscillator(), tg = ctx.createGain();
      top.type = 'sine';
      top.frequency.setValueAtTime(783.99, t + 0.27);
      top.frequency.exponentialRampToValueAtTime(830, t + 0.7); // drifts sharp, never lands
      tg.gain.setValueAtTime(0.0001, t + 0.27);
      tg.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.35);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      top.connect(tg); tg.connect(sfxBus);
      top.start(t + 0.27); top.stop(t + 0.95);
      // the shimmer: high harmonic that won't settle — detuned pair beating
      [2093, 2105].forEach((f) => {
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'sine'; s.frequency.value = f;
        sg.gain.setValueAtTime(0.0001, t + 0.2);
        sg.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.5);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        s.connect(sg); sg.connect(sfxBus);
        s.start(t + 0.2); s.stop(t + 1.25);
      });
    }
    // ---- SYNERGY DISCOVERED (Steve 2026-10-07): the hero fanfare — two
    // things just became more than the sum. Triumphant layered ascending
    // chords, but this is the Oversight: the fanfare has one note slightly
    // flat, beating against the triumph. The alien audience is cheering,
    // and they're cheering WRONG. That's what makes it yours.
    function synergyDiscovered(d) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const peak = 0.20;
      // the fanfare: two ascending chords, C major then F major, layered
      const chords = [
        [261.63, 329.63, 392.00], // C4, E4, G4
        [349.23, 440.00, 523.25], // F4, A4, C5
      ];
      chords.forEach((chord, ci) => {
        const ct = t + ci * 0.35;
        chord.forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = f;
          const fl = ctx.createBiquadFilter();
          fl.type = 'lowpass'; fl.frequency.value = 1800;
          g.gain.setValueAtTime(0.0001, ct + i * 0.03);
          g.gain.exponentialRampToValueAtTime(peak * 0.5, ct + i * 0.03 + 0.08);
          g.gain.exponentialRampToValueAtTime(0.0001, ct + 0.6);
          o.connect(fl); fl.connect(g); g.connect(sfxBus);
          o.start(ct + i * 0.03); o.stop(ct + 0.65);
        });
      });
      // the wrong note: one flat fifth beating against the triumph
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'triangle';
      w.frequency.value = 369.5; // F#4, slightly flat — the tritone against C
      wg.gain.setValueAtTime(0.0001, t + 0.15);
      wg.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.3);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t + 0.15); w.stop(t + 1.15);
      // the cheer: noise swell like a crowd, filtered bright then gone
      const nz = noise(0.8), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 1200; nf.Q.value = 0.8;
        ng.gain.setValueAtTime(0.0001, t + 0.2);
        ng.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.5);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.2); nz.stop(t + 1.05);
      }
      // the landing: deep root note, the earth under the fanfare
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sine'; r.frequency.value = 65.41; // C2
      rg.gain.setValueAtTime(0.0001, t + 0.7);
      rg.gain.exponentialRampToValueAtTime(peak * 0.8, t + 0.75);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      r.connect(rg); rg.connect(sfxBus);
      r.start(t + 0.7); r.stop(t + 1.45);
    }
    // ---- ROUND: the alien metronome. ROUND N! gets a tick — flat, clinical,
    // the System counting. Each round it gets a little heavier and a little
    // higher: the count is closing in.
    // (deepened Steve 2026-10-06): the old tick was two clean voices — too
    // honest for a machine counting your rounds for an audience. Now the tick
    // has a detuned twin it can't quite sync with (the beating between them
    // is the part that watches you), and the low count drags a shadow a
    // tritone below that breathes — the count is closing in, and something
    // else is counting along.
    function roundTick(d) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const r = Math.max(1, Math.min(20, (d && d.round) || 1));
      const w = Math.min(1, (r - 1) / 6); // 0 at round 1 → 1 by round 7
      const tickF = 1250 + r * 25;
      // the tick: sharp clock strike — and the twin it can't sync with
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(tickF, t);
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.setValueAtTime(tickF * 1.006, t); // ~8Hz beating — the watchful shimmer
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14 + w * 0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + 0.14); o2.stop(t + 0.14);
      // the count underneath: a low pulse, deeper and heavier each round
      const p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'sine';
      p.frequency.setValueAtTime(90 - w * 25, t);
      p.frequency.exponentialRampToValueAtTime(45 - w * 12, t + 0.4);
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.16 + w * 0.14, t + 0.05);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      p.connect(pg); pg.connect(sfxBus);
      p.start(t); p.stop(t + 0.55);
      // the shadow: a tritone below the count's floor, breathing — something
      // else is counting along, and it's heavier than the System
      const sh = ctx.createOscillator(), shg = ctx.createGain();
      sh.type = 'sine';
      sh.frequency.setValueAtTime((90 - w * 25) * 0.7071, t);
      sh.frequency.exponentialRampToValueAtTime((45 - w * 12) * 0.7071, t + 0.4);
      const shl = ctx.createOscillator(), shlg = ctx.createGain();
      shl.type = 'sine'; shl.frequency.value = 2.2 + w * 2; // breathes faster as the rounds climb
      shlg.gain.value = 0.05;
      shl.connect(shlg); shlg.connect(shg.gain);
      shg.gain.setValueAtTime(0.0001, t);
      shg.gain.exponentialRampToValueAtTime(0.10 + w * 0.08, t + 0.08);
      shg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      sh.connect(shg); shg.connect(sfxBus);
      sh.start(t); shl.start(t); sh.stop(t + 0.65); shl.stop(t + 0.65);
    }
    function toggleMute() {
      muted = !muted;
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('oversight_mute', muted ? '1' : '0'); } catch (e) {}
      if (ctx && master) {
        const t = ctx.currentTime;
        try {
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(master.gain.value, t);
          master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.9, t + 0.15);
        } catch (e) {}
      }
      return muted;
    }
    // ============ PATTERN SYNTHS (Steve 2026-10-06) ============
    // Generic-per-pattern windup/resolve pairs, dispatched from telegraph()
    // and impact() by pattern type ('beam','burst','charge','direct','line',
    // 'rush','single','ambush'). Wave-2 siblings can ALSO call these
    // directly via Game.audioEvent('<name>') for bespoke beats, alongside
    // the per-monster hooks below. Every windup ends unresolved — the
    // resolve is what lands. (The Highbeam Deer keeps its own beam set:
    // beamCharge/beamFire — the deer's beam is an animal, these are machines.)
    function beamTechWindup(durSec) {
      // COLD SPOOL: a scanner waking up. Glassy sheen rising in perfect
      // steps — no organic warmth. (review_drone, memory_projector)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.8, durSec || 1.6);
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const dt = t + (dur * 0.8 * i) / steps;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 1400 * Math.pow(1.18, i);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.09, dt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + dur / steps);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + dur / steps + 0.05);
      }
      // cold breath under it: filtered noise, perfectly even
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 10; nf.frequency.value = 5200;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.7);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur);
      }
    }
    function burstWindup(durSec) {
      // INHALATION: the air pressure rises. Faint voices multiply inside
      // the swell — one more each half second, none of them yours.
      // (mirrormoth, belltoad, hummice, bright_idea — camera_swarm/hype_horn
      // retired, Steve 2026-10-08)
      // (deepened Steve 2026-10-06): the voices ARGUE now — three rise, but
      // a fourth FALLS through them, crossing, tuned flat. The inhale can't
      // agree with itself. And the swell has a pressure wobble: the air
      // itself is unsure.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.8, durSec || 1.5);
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(300, t);
        nf.frequency.exponentialRampToValueAtTime(2400, t + dur);
        // pressure wobble: the air is unsure
        const pw = ctx.createOscillator(), pwg = ctx.createGain();
        pw.type = 'sine'; pw.frequency.value = 3.2; pwg.gain.value = 0.06;
        pw.connect(pwg); pwg.connect(ng.gain);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.85);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur); pw.start(t); pw.stop(t + dur);
      }
      for (let i = 0; i < 3; i++) {
        const dt = t + (dur * 0.7 * i) / 4;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(160 * (1 + i * 0.26), dt);
        o.frequency.exponentialRampToValueAtTime(220 * (1 + i * 0.26), dt + 0.3);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.05, dt + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.45);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.5);
      }
      // the arguer: a fourth voice FALLING through the rising three — flat
      const a = ctx.createOscillator(), ag = ctx.createGain();
      a.type = 'sine';
      a.frequency.setValueAtTime(340 * 0.97, t + dur * 0.2); // flat from the start
      a.frequency.exponentialRampToValueAtTime(150, t + dur * 0.8);
      ag.gain.setValueAtTime(0.0001, t + dur * 0.2);
      ag.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.45);
      ag.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.85);
      a.connect(ag); ag.connect(sfxBus); a.start(t + dur * 0.2); a.stop(t + dur * 0.9);
    }
    function burstDetonate() {
      // The held breath, released wrong: noise blast with pitched debris
      // falling out of it — distinct from the deer's sub-bass beam fire.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const nz = noise(0.8), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(6000, t);
        nf.frequency.exponentialRampToValueAtTime(300, t + 0.5);
        ng.gain.setValueAtTime(0.5, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.65);
      }
      // debris: three pitched shards dropping past each other
      [880, 660, 520].forEach((fq, i) => {
        const dt = t + 0.05 + i * 0.07;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(fq, dt);
        o.frequency.exponentialRampToValueAtTime(fq * 0.4, dt + 0.4);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 6;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.12, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.45);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.5);
      });
    }
    function chargeWindup(durSec) {
      // EARTH TREMBLES: low rumble with an accelerating rhythm inside it —
      // hooves, or an engine, you can't tell which. (bulldozer, mirror_stag)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.9, durSec || 1.8);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 42;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      // accelerating tread: 6 hits, interval shrinking
      let dt = t;
      for (let i = 0; i < 6; i++) {
        const gap = dur * 0.75 / (6 - i * 0.7);
        dt += gap;
        const no = ctx.createOscillator(), ng2 = ctx.createGain();
        no.type = 'sine';
        no.frequency.setValueAtTime(90 - i * 8, dt);
        no.frequency.exponentialRampToValueAtTime(50, dt + 0.09);
        ng2.gain.setValueAtTime(0.0001, dt);
        ng2.gain.exponentialRampToValueAtTime(0.25 + i * 0.03, dt + 0.02);
        ng2.gain.exponentialRampToValueAtTime(0.0001, dt + 0.11);
        no.connect(ng2); ng2.connect(sfxBus); no.start(dt); no.stop(dt + 0.13);
      }
    }
    function chargeImpact() {
      // THUNDER, DOUBLE: the trample, then the wreckage a beat behind it.
      // (deepened Steve 2026-10-06): now the ground ANSWERS — after the
      // second hit, a low pair (55/58.3Hz, beating) blooms under the debris:
      // the earth humming back at whatever hit it. The charge doesn't just
      // land. It gets acknowledged.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const hit = (dt, vol, drop) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(drop, dt);
        o.frequency.exponentialRampToValueAtTime(30, dt + 0.35);
        g.gain.setValueAtTime(vol, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.45);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.5);
      };
      hit(t, 0.6, 110);
      hit(t + 0.22, 0.45, 85);
      // grinding debris between them
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 1.2;
        nf.frequency.setValueAtTime(1800, t);
        nf.frequency.exponentialRampToValueAtTime(300, t + 0.5);
        ng.gain.setValueAtTime(0.3, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.55);
      }
      // the ground's answer: a low beating pair blooming after the second hit
      [55, 58.3].forEach(fq => {
        const a = ctx.createOscillator(), ag = ctx.createGain();
        a.type = 'sine'; a.frequency.value = fq;
        const at = t + 0.45;
        ag.gain.setValueAtTime(0.0001, at);
        ag.gain.exponentialRampToValueAtTime(0.14, at + 0.3);
        ag.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
        a.connect(ag); ag.connect(sfxBus); a.start(at); a.stop(at + 1.15);
      });
    }
    function lockonTick(durSec) {
      // TARGETING: clinical ticks, like a camera finding focus — or a call
      // connecting. Shortens as it locks. (direct-pattern windup)
      // (deepened Steve 2026-10-06): now there's a machine getting SURE
      // underneath: a rising sub-whine the player only notices near the
      // end — and the lock itself lands: a two-tone confirm, slightly sharp,
      // like a call connecting to the wrong number.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.7, durSec || 1.2);
      // the machine getting sure: a rising sub-whine under the ticks —
      // with a detuned partner, beating: the machine is unsure after all
      const u = ctx.createOscillator(), ug = ctx.createGain();
      u.type = 'sine';
      u.frequency.setValueAtTime(180, t);
      u.frequency.exponentialRampToValueAtTime(640, t + dur * 0.9);
      const u2 = ctx.createOscillator();
      u2.type = 'sine';
      u2.frequency.setValueAtTime(181.8, t); // 1% sharp, beating
      u2.frequency.exponentialRampToValueAtTime(646, t + dur * 0.9);
      const ug2 = ctx.createGain(); ug2.gain.value = 0.6;
      u2.connect(ug2); ug2.connect(ug);
      ug.gain.setValueAtTime(0.0001, t);
      ug.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.9);
      ug.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      u.connect(ug); ug.connect(sfxBus);
      u.start(t); u2.start(t); u.stop(t + dur); u2.stop(t + dur);
      let dt = t;
      let gap = 0.22;
      const minGap = 0.05; // the ticking never quite stops, but it always ends
      while (dt < t + dur * 0.9) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 2100;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 8;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.08, dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.06);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.08);
        dt += gap; gap = Math.max(minGap, gap * 0.86);
      }
      // the lock: two-tone confirm, slightly sharp — wrong number
      const lt = t + dur * 0.92;
      [[880, 0], [1320, 0.09]].forEach(([fq, off]) => {
        const lo = ctx.createOscillator(), lg2 = ctx.createGain();
        lo.type = 'sine'; lo.frequency.value = fq * 1.006; // sharp
        const st = lt + off;
        lg2.gain.setValueAtTime(0.0001, st);
        lg2.gain.exponentialRampToValueAtTime(0.12, st + 0.02);
        lg2.gain.exponentialRampToValueAtTime(0.0001, st + 0.22);
        lo.connect(lg2); lg2.connect(sfxBus); lo.start(st); lo.stop(st + 0.25);
      });
    }
    function lockonHit() {
      // Close-range crack: a dry snap and a short electric bite. Quieter
      // than boom — it's personal, not explosive.
      // (deepened Steve 2026-10-06): the bite is a tritone zap pair — the
      // lock finds you at the wrongest interval — with a thin decay tail
      // that rings where the shot entered.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const nz = noise(0.25), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 2500;
        ng.gain.setValueAtTime(0.45, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.2);
      }
      // the bite: tritone pair (1400/1980 ≈ 6 semitones), both collapsing
      [[1400, 300], [1980, 420]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.2);
      });
      // the ring where it entered: a thin metallic tail, slightly flat
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'triangle'; r.frequency.setValueAtTime(2470, t + 0.05);
      r.frequency.exponentialRampToValueAtTime(2330, t + 0.5);
      rg.gain.setValueAtTime(0.0001, t + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.08, t + 0.1);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      r.connect(rg); rg.connect(sfxBus); r.start(t + 0.05); r.stop(t + 0.6);
    }
    function lineWindup(durSec) {
      // THE FILAMENT TIGHTENS: one thin wire tone rising past comfortable.
      // (white_noise_heron — Spearfish Strike)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.8, durSec || 1.5);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(3400, t + dur);
      // beating companion: the wire has a second strand, slightly off
      const o2 = ctx.createOscillator(); o2.type = 'sine';
      o2.frequency.setValueAtTime(912, t);
      o2.frequency.exponentialRampToValueAtTime(3455, t + dur);
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
    }
    function lineStrike() {
      // WIRE SNAP: the filament lets go — a piercing shriek downward and
      // a thin, wet punch. Not a boom; a needle.
      // (deepened Steve 2026-10-06): the shriek shatters into a minor-2nd
      // cluster of glass partials falling together, and the punch lands in
      // water — a wet slap of noise closing around the needle.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      // the shattering shriek: three partials a semitone apart, all diving
      [[3600, 400, 0.26], [3817, 424, 0.12], [3399, 378, 0.12]].forEach(([f0, f1, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 0.3);
        f.type = 'bandpass'; f.Q.value = 9;
        f.frequency.setValueAtTime(f0, t);
        f.frequency.exponentialRampToValueAtTime(f1 + 100, t + 0.3);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.4);
      });
      // wet punch: water slapping shut around the needle
      const nz = noise(0.3), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(2500, t);
        nf.frequency.exponentialRampToValueAtTime(300, t + 0.25);
        ng.gain.setValueAtTime(0.3, t + 0.03);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.03); nz.stop(t + 0.35);
      }
    }
    function rushWindup() {
      // HELD BREATH: almost nothing. A soft intake, then the world slows —
      // a tape-stop drag on the heartbeat. (hushwolf, service_mimic: no
      // telegraph by design at the TEXT level; this is the sound of that.)
      if (!ensure()) return;
      const t = ctx.currentTime;
      // one soft intake of breath
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 2; nf.frequency.value = 800;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.45);
      }
      // heartbeat drags: a single thump pitched down hard
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(55, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
      g.gain.setValueAtTime(0.35, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(hbBus); o.start(t + 0.25); o.stop(t + 0.95);
    }
    function rushHit() {
      // AIR DISPLACEMENT: it's suddenly HERE. Low whoom and a close scrape —
      // no boom, the rush doesn't explode, it arrives.
      // (deepened Steve 2026-10-06): the whoom is a detuned low pair beating
      // as it lands — two bodies of air disagreeing — the scrape drags
      // longer and wrong, and there's a sharp intake underneath, like the
      // world gasping at what just arrived.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      // the arrival: detuned lows beating against each other
      [[180, 45], [183, 46]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 0.3);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.45);
      });
      // the scrape: dragged longer, bandpass wandering down
      const nz = noise(0.45), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 3;
        nf.frequency.setValueAtTime(1600, t);
        nf.frequency.exponentialRampToValueAtTime(500, t + 0.4);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.47);
      }
      // the gasp: a thin intake under everything, slightly too late
      const gp = ctx.createOscillator(), gg = ctx.createGain(), gf = ctx.createBiquadFilter();
      gp.type = 'sine';
      gp.frequency.setValueAtTime(300, t + 0.08);
      gp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
      gf.type = 'bandpass'; gf.frequency.value = 700; gf.Q.value = 4;
      gg.gain.setValueAtTime(0.0001, t + 0.08);
      gg.gain.exponentialRampToValueAtTime(0.1, t + 0.2);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      gp.connect(gf); gf.connect(gg); gg.connect(sfxBus);
      gp.start(t + 0.08); gp.stop(t + 0.42);
    }
    function diveWindup(durSec) {
      // FALLING: thin whistles dropping out of the sky — a detuned pair, so
      // the fall beats against itself, with the displaced air rushing up
      // under it. The generic 'single'-pattern windup — glasswing/sunbasker
      // have bespoke dives. (deepened Steve 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.7, durSec || 1.3);
      [[2600, 500], [2652, 510]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      });
      // air: the sky being displaced
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 0.8;
        nf.frequency.setValueAtTime(900, t);
        nf.frequency.exponentialRampToValueAtTime(2600, t + dur);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.10, t + dur * 0.7);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05);
      }
    }
    function diveImpact() {
      // SKYFALL: dirt thud, then skittering debris — small, fast, nasty.
      // (deepened Steve 2026-10-06): now you hear the air first — a whoosh
      // swelling just before the thud (the dive displacing it) — and one
      // debris shard rings METALLIC with inharmonic partials: whatever fell
      // out of the sky, it wasn't just dirt.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime, hitAt = t + 0.18;
      // the air first: a whoosh swelling into the impact
      const az = noise(0.3), af = ctx.createBiquadFilter(), ag = ctx.createGain();
      if (az) {
        af.type = 'bandpass'; af.Q.value = 1.5;
        af.frequency.setValueAtTime(2500, t);
        af.frequency.exponentialRampToValueAtTime(400, hitAt);
        ag.gain.setValueAtTime(0.0001, t);
        ag.gain.exponentialRampToValueAtTime(0.22, hitAt - 0.03);
        ag.gain.exponentialRampToValueAtTime(0.0001, hitAt + 0.05);
        az.connect(af); af.connect(ag); ag.connect(sfxBus);
        az.start(t); az.stop(hitAt + 0.08);
      }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, hitAt);
      o.frequency.exponentialRampToValueAtTime(35, hitAt + 0.25);
      g.gain.setValueAtTime(0.5, hitAt);
      g.gain.exponentialRampToValueAtTime(0.0001, hitAt + 0.35);
      o.connect(g); g.connect(sfxBus); o.start(hitAt); o.stop(hitAt + 0.4);
      for (let i = 0; i < 5; i++) {
        const dt = hitAt + 0.12 + i * 0.06;
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'triangle'; s.frequency.value = 900 + Math.random() * 1400;
        sg.gain.setValueAtTime(0.0001, dt);
        sg.gain.exponentialRampToValueAtTime(0.07, dt + 0.015);
        sg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
        s.connect(sg); sg.connect(sfxBus); s.start(dt); s.stop(dt + 0.09);
      }
      // the alien shard: inharmonic metallic ring, longer than the dirt
      [1180, 1717, 2493].forEach((fq, i) => {
        const dt = hitAt + 0.1 + i * 0.05;
        const m2 = ctx.createOscillator(), mg = ctx.createGain();
        m2.type = 'sine'; m2.frequency.value = fq;
        mg.gain.setValueAtTime(0.08 - i * 0.02, dt);
        mg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.7);
        m2.connect(mg); mg.connect(sfxBus); m2.start(dt); m2.stop(dt + 0.75);
      });
    }
    function ambushSnap() {
      // BEAR-TRAP JAWS: no warning, by design. Instant metallic clack and a
      // low, surprised thud. (speedbump_turtle — Snap Decision)
      // (deepened Steve 2026-10-06): the clack is a detuned metal pair
      // beating as the jaws close — the trap rings wrong — the air gets
      // shoved aside, and the thud lands a quarter-tone flat underneath.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      // the wrong ring: detuned metal pair, beating as it dies
      [[3400, 0.3], [3468, 0.18]].forEach(([fq, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        o.type = 'square'; o.frequency.value = fq;
        f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 5;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.12);
      });
      // displaced air: the world flinches a frame after the jaws
      const nz = noise(0.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 900;
        ng.gain.setValueAtTime(0.0001, t + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.02); nz.stop(t + 0.24);
      }
      // the thud: lands a quarter-tone flat, like the ground disagrees
      const th = ctx.createOscillator(), tg = ctx.createGain();
      th.type = 'sine';
      th.frequency.setValueAtTime(117, t);
      th.frequency.exponentialRampToValueAtTime(39, t + 0.25);
      tg.gain.setValueAtTime(0.4, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      th.connect(tg); tg.connect(sfxBus); th.start(t); th.stop(t + 0.35);
    }
    function haymakerMiss() {
      // THE HAYMAKER WHIFF (Steve 2026-10-07): the readied haymaker sails
      // past — displaced air, nothing landed. Two noise voices fall at
      // DIFFERENT rates (the stretch is uneven — wrong on purpose), then a
      // hollow detuned sag: the air settling into a shape that isn't a body.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      // the whoosh-cut: bandpassed noise tearing downward, ragged
      [[3600, 900, 0.22, 1.0], [2500, 420, 0.15, 0.68]].forEach(([f0, f1, vol, rate], i) => {
        const nz = noise(dur + 0.1), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (!nz) return;
        nf.type = 'bandpass'; nf.Q.value = 1.8;
        nf.frequency.setValueAtTime(f0, t + i * 0.035);
        nf.frequency.exponentialRampToValueAtTime(f1, t + dur * rate);
        ng.gain.setValueAtTime(0.0001, t + i * 0.035);
        ng.gain.exponentialRampToValueAtTime(vol, t + 0.06 + i * 0.035);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + i * 0.035); nz.stop(t + dur + 0.05);
      });
      // the hollow tail: the swing's momentum going nowhere
      [110, 116.5].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(fq, t + 0.12);
        o.frequency.exponentialRampToValueAtTime(fq * 0.45, t + dur + 0.22);
        g.gain.setValueAtTime(0.0001, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.22);
        o.connect(g); g.connect(sfxBus);
        o.start(t + 0.12); o.stop(t + dur + 0.28);
      });
    }
    // ============ WAVE-2 BESPOKE BEATS (Steve 2026-10-06) ============
    // Missing resolves for the wave-2 flesh-out siblings to wire up.
    function staticScream() {
      // THE RADIO SCREAMS: no voice left, just noise and fury. The lure is
      // over — this is the part that hurts. (voice_mimic_radio reveal)
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime, dur = 1.2;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 1.5;
        nf.frequency.setValueAtTime(500, t);
        nf.frequency.exponentialRampToValueAtTime(3800, t + dur * 0.5);
        nf.frequency.exponentialRampToValueAtTime(300, t + dur);
        ng.gain.setValueAtTime(0.45, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur);
      }
      // detuned sirens underneath: the voice, shredded
      [620, 641].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 2.1, t + dur * 0.5);
        o.frequency.exponentialRampToValueAtTime(fq * 0.5, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      });
    }
    function serviceRush() {
      // PLEASE HOLD: the pleasant hold music SLAMMED into motion. A warm
      // major-chord fragment pitch-drops as it rushes you — customer service
      // with teeth. (service_mimic rush resolve)
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime, dur = 0.9;
      // the fragment: three warm tones, chipper, doomed
      [523.25, 659.25, 783.99].forEach((fq, i) => {
        const dt = t + i * 0.09;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(fq, dt);
        o.frequency.exponentialRampToValueAtTime(fq * 0.45, dt + dur - i * 0.09); // dropping
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.2, dt + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(t + dur + 0.05);
      });
      // the arrival: low whoom
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine';
      w.frequency.setValueAtTime(160, t + dur * 0.6);
      w.frequency.exponentialRampToValueAtTime(40, t + dur);
      wg.gain.setValueAtTime(0.0001, t + dur * 0.6);
      wg.gain.exponentialRampToValueAtTime(0.45, t + dur * 0.85);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
      w.connect(wg); wg.connect(sfxBus); w.start(t + dur * 0.6); w.stop(t + dur + 0.25);
    }
    function monsterDown() {
      // GENERIC DEATH (wave-2 siblings): a small collapse, a breath out,
      // and one wrong note hanging in the air after it.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.5);
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.65);
      // the wrong note: slightly sharp, hangs too long
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'triangle'; w.frequency.value = 466.5; // Bb, a hair sharp
      wg.gain.setValueAtTime(0.0001, t + 0.3);
      wg.gain.exponentialRampToValueAtTime(0.07, t + 0.5);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      w.connect(wg); wg.connect(sfxBus); w.start(t + 0.3); w.stop(t + 1.65);
    }
    function monsterHurt() {
      // WOUNDED: a flinch — short, pained, cut off. Generic, for siblings —
      // but pain sounds wrong here: a saw flinch with a detuned partner a
      // tritone away, and a gasp (bandpass noise) that stops mid-breath
      // instead of fading. Alien pain doesn't resolve. (deepened 2026-10-06)
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.18);
      // detuned partner, a tritone away: the wrongness of it
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'square';
      o2.frequency.setValueAtTime(700 * 1.4142, t);
      o2.frequency.exponentialRampToValueAtTime(380 * 1.4142, t + 0.18);
      g2.gain.value = 0.35; o2.connect(g2); g2.connect(g);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.25);
      o2.start(t); o2.stop(t + 0.25);
      // gasp: cut off mid-breath
      const nz = noise(0.12), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 1200; nf.Q.value = 2;
        ng.gain.setValueAtTime(0.18, t + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); // stops, doesn't fade
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.02); nz.stop(t + 0.15);
      }
    }
    // ============ WAVE-1 CONTRACT HOOKS (Steve 2026-10-06) ============
    // Promised in the HOOK CONTRACT above, never defined until now. Distinct
    // per-monster beats for the batch-1 flesh-out.
    function boarNotice() {
      // COMBAT START: heavy snort, earth pawed. The bulldozer knows you're here.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const nz = noise(0.4), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 500;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.4);
      }
      // pawing: three dull scrapes
      for (let i = 0; i < 3; i++) {
        const dt = t + 0.15 + i * 0.16;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 95;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.2, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.12);
        o.connect(f); f.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.14);
      }
    }
    function boarSnort() {
      // AGGRO: sharper and angrier than the deer's snort — a wet, furious bark.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const dt = t + i * 0.14;
        const nz = noise(0.12), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (nz) {
          nf.type = 'bandpass'; nf.Q.value = 2; nf.frequency.value = 700;
          ng.gain.setValueAtTime(0.0001, dt);
          ng.gain.exponentialRampToValueAtTime(0.4, dt + 0.03);
          ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.12);
          nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
          nz.start(dt); nz.stop(dt + 0.13);
        }
      }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.35);
    }
    function boarCharge() {
      // CHINA-SHOP CHARGE RESOLVES: the generic thunder, with a porcine
      // grunt riding it — the bulldozer is an animal, not a machine.
      chargeImpact();
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.4);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 28; lg.gain.value = 30;
      lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
          // (deepened Steve 2026-10-06): the charge arrives on hooves — four
      // accelerating thumps — and a furious snort bursts over the thunder.
      for (let i = 0; i < 4; i++) {
        const hdt = t + i * (0.14 - i * 0.02);
        const ho = ctx.createOscillator(), hg = ctx.createGain();
        ho.type = 'sine';
        ho.frequency.setValueAtTime(110, hdt);
        ho.frequency.exponentialRampToValueAtTime(45, hdt + 0.09);
        hg.gain.setValueAtTime(0.28, hdt);
        hg.gain.exponentialRampToValueAtTime(0.0001, hdt + 0.11);
        ho.connect(hg); hg.connect(sfxBus); ho.start(hdt); ho.stop(hdt + 0.13);
      }
      const snz = noise(0.2), snf = ctx.createBiquadFilter(), sng = ctx.createGain(); // snort burst
      if (snz) {
        snf.type = 'bandpass'; snf.Q.value = 2;
        snf.frequency.setValueAtTime(900, t);
        snf.frequency.exponentialRampToValueAtTime(300, t + 0.2);
        sng.gain.setValueAtTime(0.0001, t + 0.35);
        sng.gain.exponentialRampToValueAtTime(0.3, t + 0.4);
        sng.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        snz.connect(snf); snf.connect(sng); sng.connect(sfxBus);
        snz.start(t + 0.35); snz.stop(t + 0.6);
      }
    }
    function wolfSilence() {
      // THE BIRDS CUT OUT: the world ducks for a beat — then one low tone.
      // Combat start for the hushwolf.
      if (!ensure()) return;
      const t = ctx.currentTime;
      if (hbBus) duckHeartbeat(0.05, 0.08, 0.9);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 73;
      g.gain.setValueAtTime(0.0001, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g); g.connect(sfxBus); o.start(t + 0.25); o.stop(t + 1.25);
          // (deepened Steve 2026-10-06): after the duck, the insects try to start
      // again — and one sub tone blooms, then bends wrong and dies.
      const ins = ctx.createOscillator(), insg = ctx.createGain(); // insect restart
      ins.type = 'square'; ins.frequency.value = 4300;
      const insl = ctx.createOscillator(), inslg = ctx.createGain();
      insl.type = 'sine'; insl.frequency.value = 41; inslg.gain.value = 900;
      insl.connect(inslg); inslg.connect(ins.frequency);
      insg.gain.setValueAtTime(0.0001, t + 0.9);
      insg.gain.exponentialRampToValueAtTime(0.025, t + 1.4);
      insg.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      ins.connect(insg); insg.connect(sfxBus);
      ins.start(t + 0.9); insl.start(t + 0.9);
      ins.stop(t + 1.85); insl.stop(t + 1.85);
      const sb = ctx.createOscillator(), sbg = ctx.createGain(); // the wrong bloom
      sb.type = 'sine';
      sb.frequency.setValueAtTime(55, t + 1.1);
      sb.frequency.exponentialRampToValueAtTime(52, t + 1.5); // bends flat = wrong
      sbg.gain.setValueAtTime(0.0001, t + 1.1);
      sbg.gain.exponentialRampToValueAtTime(0.12, t + 1.45);
      sbg.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
      sb.connect(sbg); sbg.connect(sfxBus);
      sb.start(t + 1.1); sb.stop(t + 1.8);
    }
    function wolfSnarl() {
      // AGGRO: layered low growls, detuned, CLOSE. The pack is one instrument.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      [68, 71.5, 74].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = fq;
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = 9 + fq * 0.05; lg.gain.value = fq * 0.35;
        lfo.connect(lg); lg.connect(o.frequency);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
      });
    }
    function heronUnfold() {
      // AGGRO: the air goes staticky and something TALL unfolds — a rising
      // static sheet with a wooden creak inside it.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.6;
      heronStatic();
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass';
        nf.frequency.setValueAtTime(3000, t);
        nf.frequency.exponentialRampToValueAtTime(7000, t + dur);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.8);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur);
      }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(190, t + dur * 0.7);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 3; lg.gain.value = 25;
      lfo.connect(lg); lg.connect(o.frequency); // the creak wobble
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
    }
    function heronStrike() {
      // SPEARFISH STRIKE: the wire snap with a wet punch under it.
      // (deepened Steve 2026-10-06): the heron LOADS first — two glassy
      // throat-clicks, high and hollow, like the beak cocking — then the
      // spear-whistle: the beak cutting air, a descending scream that ends
      // in the wet punch. Then the ripple: the pond ring expanding, slow.
      lineStrike();
      if (!ctx) return;
      const t = ctx.currentTime;
      // throat-clicks: the beak cocking, glassy and hollow
      for (let i = 0; i < 2; i++) {
        const dt = t - 0.22 + i * 0.1;
        const c = ctx.createOscillator(), cg = ctx.createGain();
        c.type = 'sine'; c.frequency.value = 3400 - i * 300;
        cg.gain.setValueAtTime(0.12, dt);
        cg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.05);
        c.connect(cg); cg.connect(sfxBus); c.start(dt); c.stop(dt + 0.06);
      }
      // the spear-whistle: air torn, descending fast
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine';
      w.frequency.setValueAtTime(1900, t - 0.1);
      w.frequency.exponentialRampToValueAtTime(480, t + 0.06);
      wg.gain.setValueAtTime(0.0001, t - 0.1);
      wg.gain.exponentialRampToValueAtTime(0.16, t - 0.02);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      w.connect(wg); wg.connect(sfxBus); w.start(t - 0.1); w.stop(t + 0.1);
      // the wet punch, kept
      const nz = noise(0.3), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 900;
        ng.gain.setValueAtTime(0.3, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.05); nz.stop(t + 0.35);
      }
      // the ripple: one low ring expanding, with a slow wobble
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sine'; r.frequency.setValueAtTime(150, t + 0.15);
      r.frequency.exponentialRampToValueAtTime(70, t + 0.9);
      const rl = ctx.createOscillator(), rlg = ctx.createGain();
      rl.type = 'sine'; rl.frequency.value = 4; rlg.gain.value = 0.2;
      rl.connect(rlg); rlg.connect(rg.gain);
      rg.gain.setValueAtTime(0.0001, t + 0.15);
      rg.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      r.connect(rg); rg.connect(sfxBus);
      r.start(t + 0.15); rl.start(t + 0.15); r.stop(t + 1.0); rl.stop(t + 1.0);
    }
    function turtleSnap() {
      // SNAP DECISION: no warning, by design. (speedbump_turtle)
      // (deepened Steve 2026-10-06): the snap lands inside a hollow shell —
      // two woody knocks frame it, the second one ringing the carapace.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const kdt = t + i * 0.09;
        const ko = ctx.createOscillator(), kg = ctx.createGain();
        ko.type = 'sine';
        ko.frequency.setValueAtTime(320 - i * 40, kdt);
        ko.frequency.exponentialRampToValueAtTime(140, kdt + 0.07);
        const kf = ctx.createBiquadFilter(); kf.type = 'bandpass'; kf.frequency.value = 700; kf.Q.value = 3;
        kg.gain.setValueAtTime(0.3, kdt);
        kg.gain.exponentialRampToValueAtTime(0.0001, kdt + (i ? 0.22 : 0.08)); // the second one rings
        ko.connect(kf); kf.connect(kg); kg.connect(sfxBus);
        ko.start(kdt); ko.stop(kdt + 0.25);
      }
      ambushSnap();
    }
    function stagCharge() {
      // CONFRONTATION RESOLVES: the mirror SHATTERS into the charge — glass
      // harmonics splintering apart, then the thunder underneath. The grief
      // counselor stops talking and starts running. (mirror_stag)
      if (!ensure()) return;
      const t = ctx.currentTime;
      // shattering glass: bright shards, accelerating
      let dt = t;
      for (let i = 0; i < 7; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 2800 - i * 260 + Math.random() * 120;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.1, dt + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.09);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.11);
        dt += 0.09 - i * 0.008;
      }
      // then the thunder: it was always coming
      const late = t + 0.45;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(100, late);
      o.frequency.exponentialRampToValueAtTime(30, late + 0.4);
      g.gain.setValueAtTime(0.55, late);
      g.gain.exponentialRampToValueAtTime(0.0001, late + 0.55);
      o.connect(g); g.connect(sfxBus); o.start(late); o.stop(late + 0.6);
    }
    // ============ MISSING MONSTER VOICES (Steve 2026-10-07) ============
    function kiteUnfold() {
      // STATIC KITE UNFOLDS: crackling static discharge as the kite snaps open —
      // nylon taut, electricity arcing across the frame. (statickite aggro)
      if (!ensure()) return;
      const t = ctx.currentTime;
      // static crackle burst
      for (let i = 0; i < 5; i++) {
        const dt = t + i * 0.06 + Math.random() * 0.02;
        const nz = noise(0.08), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (nz) {
          nf.type = 'highpass'; nf.frequency.value = 3000;
          ng.gain.setValueAtTime(0.0001, dt);
          ng.gain.exponentialRampToValueAtTime(0.25, dt + 0.01);
          ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
          nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
          nz.start(dt); nz.stop(dt + 0.08);
        }
      }
      // nylon snap: sharp twang
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(800, t + 0.1);
      o.frequency.exponentialRampToValueAtTime(200, t + 0.25);
      g.gain.setValueAtTime(0.3, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(sfxBus); o.start(t + 0.1); o.stop(t + 0.32);
    }
    function nevermoreUnfold() {
      // NEVERMORE UNFOLDS: vast dark wings opening — deep wingbeats and a
      // hollow croak from somewhere too close. (nevermore aggro)
      if (!ensure()) return;
      const t = ctx.currentTime;
      // wingbeats: three deep whooshes
      for (let i = 0; i < 3; i++) {
        const dt = t + i * 0.22;
        const nz = noise(0.25), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (nz) {
          nf.type = 'lowpass'; nf.frequency.setValueAtTime(400, dt);
          nf.frequency.exponentialRampToValueAtTime(120, dt + 0.2);
          ng.gain.setValueAtTime(0.0001, dt);
          ng.gain.exponentialRampToValueAtTime(0.4, dt + 0.05);
          ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.22);
          nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
          nz.start(dt); nz.stop(dt + 0.24);
        }
      }
      // croak: low and wrong
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.6);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      g.gain.setValueAtTime(0.25, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t + 0.3); o.stop(t + 0.72);
    }
    function nightcourtTurn() {
      // NIGHT COURT TURNS: the court shifts its attention — a gavel crack
      // and the rustle of a thousand pages turning at once. (nightcourt aggro)
      if (!ensure()) return;
      const t = ctx.currentTime;
      // gavel: sharp wooden crack
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.14);
      // pages: papery rustle
      const nz = noise(0.3), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 2500; nf.Q.value = 0.8;
        ng.gain.setValueAtTime(0.0001, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.15, t + 0.2);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.05); nz.stop(t + 0.5);
      }
    }
    // ============ ROUND-5 AGGRO VOICES (Steve 2026-10-07) ============
    // Seven monsters declared combat with the deer bellow
    // (cfg.aggroAudio || 'deerAggro') — a knowledge-leak-class fiction
    // break (a glasswing bellowing like a deer). Each gets its own voice,
    // freaky not generic, built from its fiction.
    function gallowdeerAim() {
      // GALLOWDEER AGGRO: the Highbeam Deer does not bellow — it AIMS.
      // The headlights power on: a capacitor whine (two sines rising
      // 880->3400, 33Hz apart so they beat), then the ocular hum locks in
      // underneath — 55Hz saw and its fifth, lowpassed, the whine still
      // bleeding through. The freeze is the telegraph.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the charge whine: twin sines, 33Hz apart — the heterodyne shimmer
      [880, 913].forEach(f0 => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 3.86, t + 1.1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.65);
      });
      // the ocular hum: 55Hz saw + fifth, locked in — the eyes are ON
      [[55, 0.16], [82.5, 0.1]].forEach(([fq, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = fq;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
        g.gain.setValueAtTime(0.0001, t + 0.9);
        g.gain.exponentialRampToValueAtTime(vol, t + 1.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t + 0.9); o.stop(t + 2.45);
      });
    }
    function mirrormothFlash() {
      // MIRRORMOTH AGGRO: the Flashbulb Moth catches light wrong — the
      // light has a sound. A flash-charge whine (5000->14000, nearly
      // ultrasonic, very quiet), the FLASH itself (full-spectrum noise
      // snap, unfiltered), then the afterimage: an 8800Hz sine with a
      // 67Hz-beating partner, decaying 2.5s — the retinal shimmer after
      // you look away.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the charge: rising toward the edge of hearing
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'sine';
      c.frequency.setValueAtTime(5000, t);
      c.frequency.exponentialRampToValueAtTime(14000, t + 0.7);
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.03, t + 0.55);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
      c.connect(cg); cg.connect(sfxBus); c.start(t); c.stop(t + 0.75);
      // the FLASH: unfiltered noise, everything at once
      const nz = noise(0.2), ng = ctx.createGain();
      if (nz) {
        ng.gain.setValueAtTime(0.5, t + 0.72);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.86);
        nz.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.72); nz.stop(t + 0.9);
      }
      // the afterimage: 8800Hz beating against 8867 — the shimmer in your eyes
      [[8800, 0.05], [8867, 0.05]].forEach(([fq, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t + 0.85);
        g.gain.exponentialRampToValueAtTime(vol, t + 1.0);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.3);
        o.connect(g); g.connect(sfxBus); o.start(t + 0.85); o.stop(t + 3.35);
      });
    }
    function lockpickFingers() {
      // LOCKPICK AGGRO: a raccoon with too many fingers, working at
      // something. The fingers first: tiny metallic taps in 5-against-7
      // polyrhythm (two hands, disagreeing), then the curious chitter —
      // three square blips rising like a question — ending on one low
      // thoughtful hum. It wants your stuff, not your life. Probably.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // 5-against-7: two rhythms of metallic pick-taps that never line up
      const tap = (dt) => {
        const tz = noise(0.05), tf = ctx.createBiquadFilter(), tg = ctx.createGain();
        if (!tz) return;
        tf.type = 'highpass'; tf.frequency.value = 6000;
        tg.gain.setValueAtTime(0.16, dt);
        tg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.045);
        tz.connect(tf); tf.connect(tg); tg.connect(sfxBus);
        tz.start(dt); tz.stop(dt + 0.06);
      };
      for (let i = 0; i < 5; i++) tap(t + i * 0.19);        // five
      for (let i = 0; i < 7; i++) tap(t + 0.07 + i * 0.135); // seven, offset — they cross, never land
      // the chitter: three blips, each higher and each RISING — a question
      [320, 480, 720].forEach((fq, i) => {
        const dt = t + 1.05 + i * 0.16;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(fq, dt);
        o.frequency.exponentialRampToValueAtTime(fq * 1.6, dt + 0.12);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq * 2; f.Q.value = 3;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.09, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.12);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.14);
      });
      // the hum: one low note, considering you
      const h = ctx.createOscillator(), hg = ctx.createGain();
      h.type = 'sine'; h.frequency.value = 150;
      hg.gain.setValueAtTime(0.0001, t + 1.5);
      hg.gain.exponentialRampToValueAtTime(0.1, t + 1.7);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      h.connect(hg); hg.connect(sfxBus); h.start(t + 1.5); h.stop(t + 2.25);
    }
    function turtleGrind() {
      // SPEEDBUMP AGGRO: a boulder with opinions about where you're
      // walking. It barely moves, so the aggro is SLOW — a sub groan with
      // a 0.8s attack (stone waking), lowpass rumble of grinding rock —
      // and then the snap: all the violence in 0.09 seconds, because its
      // head is suddenly somewhere else. The speed contrast IS the freak.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the waking: 32Hz sine, slow attack — the boulder notices you
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine'; w.frequency.value = 32;
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(0.22, t + 0.8);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      w.connect(wg); wg.connect(sfxBus); w.start(t); w.stop(t + 1.65);
      // the grind partner: 32.6Hz beating against the 32 — stone on stone
      const w2 = ctx.createOscillator(), wg2 = ctx.createGain();
      w2.type = 'sine'; w2.frequency.value = 32.6;
      wg2.gain.setValueAtTime(0.0001, t);
      wg2.gain.exponentialRampToValueAtTime(0.18, t + 0.8);
      wg2.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      w2.connect(wg2); wg2.connect(sfxBus); w2.start(t); w2.stop(t + 1.65);
      // the grind: rock on rock, lowpassed rumble
      const nz = noise(1.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 200;
        ng.gain.setValueAtTime(0.0001, t + 0.2);
        ng.gain.exponentialRampToValueAtTime(0.14, t + 0.9);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.2); nz.stop(t + 1.55);
      }
      // THE SNAP: 0.09 seconds — square dropping 200->60 + a highpassed crack
      const dt = t + 1.15;
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'square';
      s.frequency.setValueAtTime(200, dt);
      s.frequency.exponentialRampToValueAtTime(60, dt + 0.08);
      sg.gain.setValueAtTime(0.3, dt);
      sg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.12);
      s.connect(sg); sg.connect(sfxBus); s.start(dt); s.stop(dt + 0.14);
      const cn = noise(0.1), cf = ctx.createBiquadFilter(), cng = ctx.createGain();
      if (cn) {
        cf.type = 'highpass'; cf.frequency.value = 3000;
        cng.gain.setValueAtTime(0.28, dt);
        cng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.09);
        cn.connect(cf); cf.connect(cng); cng.connect(sfxBus);
        cn.start(dt); cn.stop(dt + 0.12);
      }
    }
    function catfishLure() {
      // NIGHTLIGHT AGGRO: a soft green glow under the water. Pretty —
      // that's the problem. Everything lowpassed (you hear it through
      // water): a breathing 220Hz pulse swelling at 0.7Hz (the lure,
      // patient), one wet glug — and then the grasp: the pulse doubles,
      // and a suction drags the lowpass down 800->150. Curiosity was
      // the bait.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the breathing glow: 220Hz, swelling at 0.7Hz
      const p = ctx.createOscillator(), pg = ctx.createGain();
      p.type = 'sine'; p.frequency.value = 220;
      const br = ctx.createOscillator(), bg = ctx.createGain();
      br.type = 'sine'; br.frequency.value = 0.7; bg.gain.value = 0.05;
      br.connect(bg); bg.connect(pg.gain);
      const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 900;
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.12, t + 0.5);
      pg.gain.setValueAtTime(0.12, t + 1.4);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      p.connect(pf); pf.connect(pg); pg.connect(sfxBus);
      p.start(t); p.stop(t + 2.65); br.start(t); br.stop(t + 2.65);
      // the glug: one bubble rising through the glow
      const gz = noise(0.3), gf = ctx.createBiquadFilter(), gg = ctx.createGain();
      if (gz) {
        gf.type = 'bandpass'; gf.frequency.value = 300; gf.Q.value = 4;
        gg.gain.setValueAtTime(0.0001, t + 0.6);
        gg.gain.exponentialRampToValueAtTime(0.1, t + 0.75);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        gz.connect(gf); gf.connect(gg); gg.connect(sfxBus);
        gz.start(t + 0.6); gz.stop(t + 1.05);
      }
      // THE GRASP: the pulse doubles — and the water closes over you
      const q = t + 1.5;
      const gr = ctx.createOscillator(), grg = ctx.createGain();
      gr.type = 'sine'; gr.frequency.value = 110;
      const am = ctx.createOscillator(), amg = ctx.createGain();
      am.type = 'square'; am.frequency.value = 1.4; amg.gain.value = 0.09;
      am.connect(amg); amg.connect(grg.gain);
      const qf = ctx.createBiquadFilter(); qf.type = 'lowpass';
      qf.frequency.setValueAtTime(800, q);
      qf.frequency.exponentialRampToValueAtTime(150, q + 0.7);
      grg.gain.setValueAtTime(0.0001, q);
      grg.gain.exponentialRampToValueAtTime(0.2, q + 0.2);
      grg.gain.exponentialRampToValueAtTime(0.0001, q + 0.9);
      gr.connect(qf); qf.connect(grg); grg.connect(sfxBus);
      gr.start(q); gr.stop(q + 0.95); am.start(q); am.stop(q + 0.95);
      thump(q + 0.55, 0.4);
    }
    function glasswingBuzz() {
      // GLASSWING AGGRO: a dragonfly the size of a hawk, circling high.
      // The wingbeat first — 190Hz saw with 24Hz AM chop, a detuned
      // 192.5Hz partner beating against it — rising in pitch and level as
      // it comes DOWN at you. Then the air screams: a bandpass tear
      // 800->5000 as the shadow detaches. The codex says watch the shadow.
      // The sound says it's already too late.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the wingbeat: chopped saw pair, dopplering down toward you
      [[190, 0.1], [192.5, 0.1]].forEach(([f0, vol]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.37, t + 1.0);
        const am = ctx.createOscillator(), amg = ctx.createGain();
        am.type = 'square'; am.frequency.value = 24; amg.gain.value = vol * 0.6;
        am.connect(amg); amg.connect(g.gain);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 1.35); am.start(t); am.stop(t + 1.35);
      });
      // the tear: the air screams as the shadow detaches
      const nz = noise(0.7), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 2.5;
        nf.frequency.setValueAtTime(800, t + 0.7);
        nf.frequency.exponentialRampToValueAtTime(5000, t + 1.2);
        ng.gain.setValueAtTime(0.0001, t + 0.7);
        ng.gain.exponentialRampToValueAtTime(0.24, t + 1.0);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.7); nz.stop(t + 1.4);
      }
    }
    function sunbaskerShimmer() {
      // SUNBASKER AGGRO: scales going from dull brown to molten gold. Heat
      // has a sound: a highpass shimmer sweeping up 1000->8000 (the haze
      // rising off its back), a sizzle-crackle of 8 short bursts — and
      // underneath, the coiled readiness: a breathing 90Hz saw that never
      // resolves. Don't let it bask.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the heat haze: highpassed noise climbing out of hearing's middle
      const hz = noise(1.4), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
      if (hz) {
        hf.type = 'highpass';
        hf.frequency.setValueAtTime(1000, t);
        hf.frequency.exponentialRampToValueAtTime(8000, t + 1.2);
        hg.gain.setValueAtTime(0.0001, t);
        hg.gain.exponentialRampToValueAtTime(0.1, t + 0.9);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        hz.connect(hf); hf.connect(hg); hg.connect(sfxBus);
        hz.start(t); hz.stop(t + 1.45);
      }
      // the sizzle: 8 crackles, irregular
      const crack = [0.15, 0.33, 0.41, 0.62, 0.78, 0.83, 1.02, 1.2];
      crack.forEach(dt => {
        const cz = noise(0.06), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
        if (!cz) return;
        cf.type = 'highpass'; cf.frequency.value = 5000;
        cg.gain.setValueAtTime(0.07, t + dt);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.05);
        cz.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        cz.start(t + dt); cz.stop(t + dt + 0.07);
      });
      // the inrush: the air bends inward just before the coil wakes — a reverse swell
      const rz = noise(0.45), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
      if (rz) {
        rf.type = 'lowpass';
        rf.frequency.setValueAtTime(300, t);
        rf.frequency.exponentialRampToValueAtTime(1400, t + 0.38);
        rg.gain.setValueAtTime(0.0001, t);
        rg.gain.exponentialRampToValueAtTime(0.12, t + 0.36);
        rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42); // sucked back in
        rz.connect(rf); rf.connect(rg); rg.connect(sfxBus);
        rz.start(t); rz.stop(t + 0.45);
      }
      // the molten scales: inharmonic plate partials — the scales themselves ringing
      [2.76, 5.40, 8.93].forEach((mul) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 90 * mul;
        g.gain.setValueAtTime(0.0001, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.022, t + 1.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.connect(g); g.connect(sfxBus); o.start(t + 0.5); o.stop(t + 1.85);
      });
      // the coil: breathing 90Hz saw that never resolves
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sawtooth'; b.frequency.value = 90;
      const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 400;
      const br = ctx.createOscillator(), brg = ctx.createGain();
      br.type = 'sine'; br.frequency.value = 1.1; brg.gain.value = 0.05;
      br.connect(brg); brg.connect(bg.gain);
      // the mirage: a fast shimmer AM on the coil — the air won't hold still
      const mz = ctx.createOscillator(), mzg = ctx.createGain();
      mz.type = 'sine'; mz.frequency.value = 7.3; mzg.gain.value = 0.035;
      mz.connect(mzg); mzg.connect(bg.gain);
      bg.gain.setValueAtTime(0.0001, t + 0.4);
      bg.gain.exponentialRampToValueAtTime(0.09, t + 1.0);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      b.connect(bf); bf.connect(bg); bg.connect(sfxBus);
      b.start(t + 0.4); b.stop(t + 2.05); br.start(t + 0.4); br.stop(t + 2.05);
      mz.start(t + 0.4); mz.stop(t + 2.05);
    }
    // ============ ROUND-6 EVENT BEATS (Steve 2026-10-07) ============
    // The six scheduled-event handlers from 9709eba fired with zero audio,
    // and truth.js's liar confrontation was the one social scenario with no
    // voice at all. Each beat is layered and fiction-derived: freaky, not
    // generic.
    function fanPackageDrop() {
      // FAN PACKAGE: a crate thumps down outside your door, trailing
      // parachute silk and the smell of glitter. Four layers: the descent
      // whistle (falling too slowly, wobbling — the silk catching air it
      // shouldn't), the silk flutter (bandpass noise chopped by an uneven
      // gate), the THUMP (sub drop + cardboard crack), and the glitter —
      // tiny high pings, two of them beating, like breaking glass. Because
      // glitter is just glass that gave up. Far away, the fans cheer —
      // and the feed cuts.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // descent: a whistle falling too slowly, wobbling on the way down
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine';
      w.frequency.setValueAtTime(1600, t);
      w.frequency.exponentialRampToValueAtTime(480, t + 1.1);
      const wob = ctx.createOscillator(), wobg = ctx.createGain();
      wob.type = 'sine'; wob.frequency.value = 9; wobg.gain.value = 60;
      wob.connect(wobg); wobg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(0.14, t + 0.2);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t); w.stop(t + 1.2); wob.start(t); wob.stop(t + 1.2);
      // silk flutter: bandpass noise chopped by an uneven gate
      const nz = noise(1.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 1.4;
        const gt = ctx.createOscillator(), gg = ctx.createGain();
        gt.type = 'square'; gt.frequency.setValueAtTime(13, t);
        gt.frequency.exponentialRampToValueAtTime(7, t + 1.1); // the silk settling
        gg.gain.value = 0.5;
        gt.connect(gg); gg.connect(ng.gain);
        ng.gain.setValueAtTime(0.12, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 1.2); gt.start(t); gt.stop(t + 1.2);
      }
      // THUMP at t+1.05: sub drop + cardboard crack
      const tt = t + 1.05;
      const th = ctx.createOscillator(), thg = ctx.createGain();
      th.type = 'sine';
      th.frequency.setValueAtTime(95, tt);
      th.frequency.exponentialRampToValueAtTime(32, tt + 0.3);
      thg.gain.setValueAtTime(0.5, tt);
      thg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.4);
      th.connect(thg); thg.connect(sfxBus); th.start(tt); th.stop(tt + 0.45);
      const cz = noise(0.15), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      if (cz) {
        cf.type = 'bandpass'; cf.frequency.value = 750; cf.Q.value = 1.2;
        cg.gain.setValueAtTime(0.3, tt);
        cg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.14);
        cz.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        cz.start(tt); cz.stop(tt + 0.18);
      }
      // glitter: tiny high pings, two of them beating — glass that gave up
      [[6800, 0], [7215, 0.07], [6831, 0.16], [9150, 0.24], [9188, 0.31]].forEach(([f, off]) => {
        const dt = tt + 0.1 + off;
        const p = ctx.createOscillator(), pg = ctx.createGain();
        p.type = 'sine'; p.frequency.value = f;
        pg.gain.setValueAtTime(0.0001, dt);
        pg.gain.exponentialRampToValueAtTime(0.06, dt + 0.015);
        pg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.22);
        p.connect(pg); pg.connect(sfxBus); p.start(dt); p.stop(dt + 0.25);
      });
      // the fans, far away — then the feed cuts
      const fz = noise(0.9), ff = ctx.createBiquadFilter(), fg = ctx.createGain();
      if (fz) {
        ff.type = 'bandpass'; ff.frequency.value = 1100; ff.Q.value = 0.8;
        fg.gain.setValueAtTime(0.0001, tt + 0.15);
        fg.gain.exponentialRampToValueAtTime(0.12, tt + 0.5);
        fg.gain.setValueAtTime(0.12, tt + 0.78);
        fg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.8); // cut
        fz.connect(ff); ff.connect(fg); fg.connect(sfxBus);
        fz.start(tt + 0.15); fz.stop(tt + 0.85);
      }
    }
    function duckSqueak() {
      // RUBBER DUCK: "The duck squeaks. Somehow, that helps." The squeak is
      // almost a word — a fast vibrato bending it toward speech — and half
      // a beat later a fainter squeak answers a fifth down, from slightly
      // the wrong side, like the duck heard itself. Underneath, the rubber
      // creaks; and a soft low hum lingers. The part that helps.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the squeak: bending toward speech, too fast a vibrato to be rubber
      const q = ctx.createOscillator(), qg = ctx.createGain();
      q.type = 'triangle';
      q.frequency.setValueAtTime(850, t);
      q.frequency.exponentialRampToValueAtTime(1350, t + 0.09);
      q.frequency.exponentialRampToValueAtTime(700, t + 0.22);
      const vib = ctx.createOscillator(), vg = ctx.createGain();
      vib.type = 'sine'; vib.frequency.value = 23; vg.gain.value = 70; // too fast
      vib.connect(vg); vg.connect(q.frequency);
      qg.gain.setValueAtTime(0.0001, t);
      qg.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
      qg.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      q.connect(qg); qg.connect(sfxBus);
      q.start(t); q.stop(t + 0.3); vib.start(t); vib.stop(t + 0.3);
      // the rubber creaks under it
      const rz = noise(0.25), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
      if (rz) {
        rf.type = 'lowpass'; rf.frequency.setValueAtTime(500, t);
        rf.frequency.exponentialRampToValueAtTime(180, t + 0.22);
        rg.gain.setValueAtTime(0.1, t);
        rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        rz.connect(rf); rf.connect(rg); rg.connect(sfxBus);
        rz.start(t); rz.stop(t + 0.28);
      }
      // the answer: a fifth down, fainter, from slightly the wrong side
      const at = t + 0.34;
      const a2 = ctx.createOscillator(), a2g = ctx.createGain();
      a2.type = 'triangle';
      a2.frequency.setValueAtTime(560, at);
      a2.frequency.exponentialRampToValueAtTime(900, at + 0.08);
      a2.frequency.exponentialRampToValueAtTime(460, at + 0.2);
      const pan = (ctx.createStereoPanner) ? ctx.createStereoPanner() : null;
      a2g.gain.setValueAtTime(0.0001, at);
      a2g.gain.exponentialRampToValueAtTime(0.1, at + 0.04);
      a2g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
      a2.connect(a2g);
      if (pan) { pan.pan.value = 0.55; a2g.connect(pan); pan.connect(sfxBus); }
      else { a2g.connect(sfxBus); }
      a2.start(at); a2.stop(at + 0.28);
      // the part that helps: a soft low hum that stays a little too long
      const h = ctx.createOscillator(), hg = ctx.createGain();
      h.type = 'sine'; h.frequency.value = 110;
      hg.gain.setValueAtTime(0.0001, t + 0.1);
      hg.gain.exponentialRampToValueAtTime(0.08, t + 0.5);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      h.connect(hg); hg.connect(sfxBus); h.start(t + 0.1); h.stop(t + 1.65);
    }
    function stormFront() {
      // STORM FRONT: "The sky to the west has gone the color of a bruise."
      // The warning beat — the storm hasn't arrived, and that's the dread.
      // Three layers: thunder that arrives WRONG (a low swell building
      // toward a crack that never comes — cut, no release), wind tuned in
      // whole tones stepping down (the wind is in a key, which wind should
      // never be), and the bruise itself — a high thin beating pair that
      // doesn't leave.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // thunder, wrong: builds toward a crack that never comes
      const th = ctx.createOscillator(), thg = ctx.createGain();
      th.type = 'sine';
      th.frequency.setValueAtTime(48, t);
      th.frequency.exponentialRampToValueAtTime(36, t + 1.4);
      thg.gain.setValueAtTime(0.0001, t);
      thg.gain.exponentialRampToValueAtTime(0.4, t + 1.3);
      thg.gain.setValueAtTime(0.4, t + 1.42);
      thg.gain.exponentialRampToValueAtTime(0.0001, t + 1.45); // cut, no release
      th.connect(thg); thg.connect(sfxBus); th.start(t); th.stop(t + 1.5);
      const rz = noise(1.5), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
      if (rz) {
        rf.type = 'lowpass'; rf.frequency.value = 160;
        rg.gain.setValueAtTime(0.0001, t);
        rg.gain.exponentialRampToValueAtTime(0.22, t + 1.3);
        rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
        rz.connect(rf); rf.connect(rg); rg.connect(sfxBus);
        rz.start(t); rz.stop(t + 1.5);
      }
      // wind in a key: whole tones stepping down — wind should never do this
      const wz = noise(1.8), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
      if (wz) {
        wf.type = 'bandpass'; wf.Q.value = 2.2;
        [800, 712, 634, 565].forEach((f, i) => {
          wf.frequency.setValueAtTime(f, t + i * 0.42);
        });
        wg.gain.setValueAtTime(0.0001, t + 0.2);
        wg.gain.exponentialRampToValueAtTime(0.16, t + 0.7);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        wz.connect(wf); wf.connect(wg); wg.connect(sfxBus);
        wz.start(t + 0.2); wz.stop(t + 1.95);
      }
      // the bruise: a high thin beating pair that doesn't leave
      [2350, 2383].forEach((f) => {
        const b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = 'sine'; b.frequency.value = f;
        const bv = ctx.createOscillator(), bvg = ctx.createGain();
        bv.type = 'sine'; bv.frequency.value = 0.7; bvg.gain.value = 18;
        bv.connect(bvg); bvg.connect(b.frequency);
        bg.gain.setValueAtTime(0.0001, t + 0.4);
        bg.gain.exponentialRampToValueAtTime(0.045, t + 1.0);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        b.connect(bg); bg.connect(sfxBus);
        b.start(t + 0.4); b.stop(t + 2.25); bv.start(t + 0.4); bv.stop(t + 2.25);
      });
    }
    function systemCooking() {
      // COOKING LESSON: the System's cooking segment. "We have studied
      // cooking." Four layers: the pot bubbling (lowpass gurgle chewed by
      // a slowing gate), the System taking notes — a pencil-scribble
      // rhythm that STUMBLES (five quick, a pause, two, a longer pause:
      // it misspelled something) — the System's earnest hum underneath
      // (a minor-2nd pair, humming along to a song it doesn't know), and
      // the tasting blip: too high, too fast. "Is the rock food?"
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the pot: gurgle chewed by an irregular, slowing gate
      const pz = noise(1.6), pf = ctx.createBiquadFilter(), pg = ctx.createGain();
      if (pz) {
        pf.type = 'lowpass'; pf.frequency.value = 420;
        const gl = ctx.createOscillator(), glg = ctx.createGain();
        gl.type = 'square'; gl.frequency.setValueAtTime(7.3, t);
        gl.frequency.exponentialRampToValueAtTime(4.1, t + 1.5); // slowing, wrong
        glg.gain.value = 0.5;
        gl.connect(glg); glg.connect(pg.gain);
        pg.gain.setValueAtTime(0.14, t);
        pg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        pz.connect(pf); pf.connect(pg); pg.connect(sfxBus);
        pz.start(t); pz.stop(t + 1.65); gl.start(t); gl.stop(t + 1.65);
      }
      // the notes: a scribble that stumbles
      const scribble = [0, 0.09, 0.18, 0.27, 0.36, 0.62, 0.71, 1.05, 1.14];
      scribble.forEach((off) => {
        const dt = t + 0.15 + off;
        const sz = noise(0.06), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
        if (sz) {
          sf.type = 'highpass'; sf.frequency.value = 3800;
          sg.gain.setValueAtTime(0.11, dt);
          sg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.055);
          sz.connect(sf); sf.connect(sg); sg.connect(sfxBus);
          sz.start(dt); sz.stop(dt + 0.07);
        }
      });
      // the earnest hum: a minor-2nd pair, humming along wrong
      [220, 233].forEach((f, i) => {
        const h = ctx.createOscillator(), hg = ctx.createGain();
        h.type = 'sine'; h.frequency.value = f;
        hg.gain.setValueAtTime(0.0001, t + 0.3);
        hg.gain.exponentialRampToValueAtTime(i ? 0.05 : 0.07, t + 0.8);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
        h.connect(hg); hg.connect(sfxBus); h.start(t + 0.3); h.stop(t + 1.75);
      });
      // the tasting blip: too high, too fast
      const bt = t + 1.5;
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine';
      b.frequency.setValueAtTime(1800, bt);
      b.frequency.exponentialRampToValueAtTime(2500, bt + 0.08);
      bg.gain.setValueAtTime(0.09, bt);
      bg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.12);
      b.connect(bg); bg.connect(sfxBus); b.start(bt); b.stop(bt + 0.15);
    }
    function traderArrive() {
      // RIVER TRADER: "A trader from the downriver village walks into
      // Haven, pack heavy, smile practiced." Four layers: the river
      // itself (two slow lapping swells), river-mud boots (two low
      // squelches, the second one reluctant), the pack settling (a wooden
      // creak, lowpassed), and the practiced smile — a two-note laugh
      // where the second note comes in a semitone flat. You can hear the
      // practice. That's the point.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the river: two slow laps
      [0, 0.55].forEach((off) => {
        const dt = t + off;
        const rz = noise(0.5), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
        if (rz) {
          rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 0.9;
          rg.gain.setValueAtTime(0.0001, dt);
          rg.gain.exponentialRampToValueAtTime(0.1, dt + 0.22);
          rg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.5);
          rz.connect(rf); rf.connect(rg); rg.connect(sfxBus);
          rz.start(dt); rz.stop(dt + 0.55);
        }
      });
      // mud boots: two squelches, the second one reluctant
      [[0.15, 160, 0.14], [0.52, 140, 0.1]].forEach(([off, f0, vol]) => {
        const dt = t + off;
        const bz = noise(0.16), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
        if (bz) {
          bf.type = 'lowpass'; bf.frequency.setValueAtTime(600, dt);
          bf.frequency.exponentialRampToValueAtTime(180, dt + 0.14);
          bg.gain.setValueAtTime(vol, dt);
          bg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
          bz.connect(bf); bf.connect(bg); bg.connect(sfxBus);
          bz.start(dt); bz.stop(dt + 0.2);
        }
        const bs = ctx.createOscillator(), bsg = ctx.createGain();
        bs.type = 'sine';
        bs.frequency.setValueAtTime(f0, dt);
        bs.frequency.exponentialRampToValueAtTime(f0 * 0.55, dt + 0.14);
        bsg.gain.setValueAtTime(vol * 0.8, dt);
        bsg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
        bs.connect(bsg); bsg.connect(sfxBus); bs.start(dt); bs.stop(dt + 0.2);
      });
      // the pack settling: a wooden creak
      const ct = t + 0.75;
      const c = ctx.createOscillator(), cg = ctx.createGain(), cf = ctx.createBiquadFilter();
      c.type = 'sawtooth';
      c.frequency.setValueAtTime(140, ct);
      c.frequency.exponentialRampToValueAtTime(92, ct + 0.4);
      cf.type = 'lowpass'; cf.frequency.value = 500;
      cg.gain.setValueAtTime(0.0001, ct);
      cg.gain.exponentialRampToValueAtTime(0.09, ct + 0.12);
      cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.45);
      c.connect(cf); cf.connect(cg); cg.connect(sfxBus);
      c.start(ct); c.stop(ct + 0.5);
      // the practiced smile: two notes, the second a semitone flat
      [[660, 1.25, 0.12], [622, 1.42, 0.1]].forEach(([f, off, vol]) => {
        const dt = t + off;
        const l = ctx.createOscillator(), lg = ctx.createGain();
        l.type = 'triangle'; l.frequency.value = f;
        lg.gain.setValueAtTime(vol, dt);
        lg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.14);
        l.connect(lg); lg.connect(sfxBus); l.start(dt); l.stop(dt + 0.18);
      });
    }
    function trialFanfare() {
      // TRIAL OF THE SYSTEM: "We have designed a trial JUST for you." The
      // System's fanfare is almost right — three ascending notes with the
      // middle one a quarter-tone sharp, because the System tunes by math
      // and math is nearly music. Then the countdown: four ticks, but the
      // fourth comes too early — it has run the simulations and it is
      // terrible at keeping secrets. Then the TA-DA: a big chord that
      // can't hold itself together (two voices beating) and collapses
      // into a small questioning blip, waiting for applause.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // almost-fanfare: three notes up, the middle one quarter-sharp
      [[392, 0], [537, 0.22], [659, 0.44]].forEach(([f, off]) => {
        const dt = t + off;
        const n = ctx.createOscillator(), ng = ctx.createGain(), nf = ctx.createBiquadFilter();
        n.type = 'sawtooth'; n.frequency.value = f;
        nf.type = 'lowpass'; nf.frequency.value = 1800;
        ng.gain.setValueAtTime(0.0001, dt);
        ng.gain.exponentialRampToValueAtTime(0.14, dt + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.3);
        n.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        n.start(dt); n.stop(dt + 0.35);
      });
      // the miscount: tick tick tick — tick (too early)
      [0.7, 0.85, 1.0, 1.08].forEach((off) => {
        const dt = t + off;
        const k = ctx.createOscillator(), kg = ctx.createGain();
        k.type = 'square'; k.frequency.value = 1200;
        kg.gain.setValueAtTime(0.08, dt);
        kg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.05);
        k.connect(kg); kg.connect(sfxBus); k.start(dt); k.stop(dt + 0.08);
      });
      // the TA-DA: a chord that can't hold itself together
      const ct = t + 1.25;
      [261, 266, 329].forEach((f) => {
        const c = ctx.createOscillator(), cg = ctx.createGain();
        c.type = 'sawtooth'; c.frequency.value = f;
        cg.gain.setValueAtTime(0.0001, ct);
        cg.gain.exponentialRampToValueAtTime(0.1, ct + 0.15);
        cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.7);
        c.connect(cg); cg.connect(sfxBus); c.start(ct); c.stop(ct + 0.75);
      });
      // ...collapsing into a small questioning blip — up, like a question
      const qt = t + 1.9;
      const q = ctx.createOscillator(), qg = ctx.createGain();
      q.type = 'sine';
      q.frequency.setValueAtTime(880, qt);
      q.frequency.exponentialRampToValueAtTime(1400, qt + 0.2);
      qg.gain.setValueAtTime(0.0001, qt);
      qg.gain.exponentialRampToValueAtTime(0.1, qt + 0.06);
      qg.gain.exponentialRampToValueAtTime(0.0001, qt + 0.32);
      q.connect(qg); qg.connect(sfxBus); q.start(qt); q.stop(qt + 0.35);
    }
    function liarConfront(d) {
      // LIAR CONFRONTED: "You told me X, but [evidence]." truth.js fired
      // zero audio — the one social scenario with no voice. Two phases:
      // the tension (the room goes quiet, a breath held too long and
      // drifting sharp, a thread snapping) and the resolution, which
      // takes the outcome — confessed (the exhale, a low tone that
      // actually lands, something small settling), deflected (a sidestep
      // gliss that dodges the note, twice, never landing, plus a too-quick
      // throat-clear), attacked (a short hostile flare, cut hard, with
      // one meaner echo).
      if (!ensure()) return;
      const t = ctx.currentTime;
      const out = (d && d.outcome) || 'tension';
      if (out === 'confessed') {
        // the exhale: the held breath let out all at once
        const ez = noise(0.9), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
        if (ez) {
          ef.type = 'lowpass';
          ef.frequency.setValueAtTime(1400, t);
          ef.frequency.exponentialRampToValueAtTime(280, t + 0.8);
          eg.gain.setValueAtTime(0.0001, t);
          eg.gain.exponentialRampToValueAtTime(0.2, t + 0.15);
          eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          ez.connect(ef); ef.connect(eg); eg.connect(sfxBus);
          ez.start(t); ez.stop(t + 0.95);
        }
        // a low tone resolving: two voices, almost together, not quite
        [147, 155].forEach((f0) => {
          const r = ctx.createOscillator(), rg = ctx.createGain();
          r.type = 'sine';
          r.frequency.setValueAtTime(f0, t + 0.2);
          r.frequency.exponentialRampToValueAtTime(f0 * 0.88, t + 0.9);
          rg.gain.setValueAtTime(0.0001, t + 0.2);
          rg.gain.exponentialRampToValueAtTime(0.1, t + 0.5);
          rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
          r.connect(rg); rg.connect(sfxBus); r.start(t + 0.2); r.stop(t + 1.25);
        });
        // something small settling: a soft knock
        const kt = t + 0.85;
        const k = ctx.createOscillator(), kg = ctx.createGain();
        k.type = 'sine';
        k.frequency.setValueAtTime(220, kt);
        k.frequency.exponentialRampToValueAtTime(110, kt + 0.08);
        kg.gain.setValueAtTime(0.14, kt);
        kg.gain.exponentialRampToValueAtTime(0.0001, kt + 0.12);
        k.connect(kg); kg.connect(sfxBus); k.start(kt); k.stop(kt + 0.15);
        return;
      }
      if (out === 'deflected') {
        // the sidestep: a gliss that dodges the note, twice, never landing
        [0, 0.45].forEach((off) => {
          const dt = t + off;
          const g = ctx.createOscillator(), gg = ctx.createGain();
          g.type = 'sine';
          g.frequency.setValueAtTime(600, dt);
          g.frequency.exponentialRampToValueAtTime(920, dt + 0.14);
          g.frequency.exponentialRampToValueAtTime(540, dt + 0.3); // dodges
          const sh = ctx.createOscillator(), shg = ctx.createGain();
          sh.type = 'sine';
          sh.frequency.setValueAtTime(720, dt); // a third off, clumsy shadow
          sh.frequency.exponentialRampToValueAtTime(1080, dt + 0.14);
          sh.frequency.exponentialRampToValueAtTime(648, dt + 0.3);
          gg.gain.setValueAtTime(0.0001, dt);
          gg.gain.exponentialRampToValueAtTime(0.09, dt + 0.06);
          gg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.36);
          shg.gain.setValueAtTime(0.0001, dt);
          shg.gain.exponentialRampToValueAtTime(0.05, dt + 0.06);
          shg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.36);
          g.connect(gg); gg.connect(sfxBus); sh.connect(shg); shg.connect(sfxBus);
          g.start(dt); g.stop(dt + 0.4); sh.start(dt); sh.stop(dt + 0.4);
        });
        // the throat-clear: too quick
        const ct = t + 0.95;
        const cz = noise(0.12), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
        if (cz) {
          cf.type = 'bandpass'; cf.frequency.value = 900; cf.Q.value = 1.5;
          cg.gain.setValueAtTime(0.16, ct);
          cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.12);
          cz.connect(cf); cf.connect(cg); cg.connect(sfxBus);
          cz.start(ct); cz.stop(ct + 0.15);
        }
        return;
      }
      if (out === 'attacked') {
        // the flare: short, hostile, cut hard
        const fz = noise(0.3), ff = ctx.createBiquadFilter(), fg = ctx.createGain();
        if (fz) {
          ff.type = 'highpass'; ff.frequency.value = 2000;
          fg.gain.setValueAtTime(0.3, t);
          fg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
          fz.connect(ff); ff.connect(fg); fg.connect(sfxBus);
          fz.start(t); fz.stop(t + 0.32);
        }
        // the snarl has two throats: a minor-2nd pair rising together
        [180, 190].forEach((f0) => {
          const s = ctx.createOscillator(), sg = ctx.createGain(), sf = ctx.createBiquadFilter();
          s.type = 'sawtooth';
          s.frequency.setValueAtTime(f0, t + 0.02);
          s.frequency.exponentialRampToValueAtTime(f0 * 2.39, t + 0.3);
          sf.type = 'lowpass'; sf.frequency.value = 1400;
          sg.gain.setValueAtTime(0.0001, t + 0.02);
          sg.gain.exponentialRampToValueAtTime(0.2, t + 0.1);
          sg.gain.setValueAtTime(0.2, t + 0.3);
          sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); // cut hard
          s.connect(sf); sf.connect(sg); sg.connect(sfxBus);
          s.start(t + 0.02); s.stop(t + 0.36);
        });
        // the echo of it: one blip, lower, meaner
        const et = t + 0.4;
        const e = ctx.createOscillator(), eg = ctx.createGain();
        e.type = 'square';
        e.frequency.setValueAtTime(140, et);
        e.frequency.exponentialRampToValueAtTime(90, et + 0.1);
        eg.gain.setValueAtTime(0.12, et);
        eg.gain.exponentialRampToValueAtTime(0.0001, et + 0.14);
        e.connect(eg); eg.connect(sfxBus); e.start(et); e.stop(et + 0.18);
        return;
      }
      // TENSION (default): the room goes quiet
      const hz = noise(0.8), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
      if (hz) {
        hf.type = 'highpass'; hf.frequency.value = 3000;
        hg.gain.setValueAtTime(0.1, t);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); // the room going quiet
        hz.connect(hf); hf.connect(hg); hg.connect(sfxBus);
        hz.start(t); hz.stop(t + 0.8);
      }
      // a breath held too long: swelling, drifting sharp — and someone
      // else in the room is holding theirs too, slightly out of sync
      [[440, 452], [447, 459]].forEach(([f0, f1]) => {
        const br = ctx.createOscillator(), brg = ctx.createGain();
        br.type = 'sine';
        br.frequency.setValueAtTime(f0, t + 0.1);
        br.frequency.linearRampToValueAtTime(f1, t + 0.9); // sharp, held too long
        brg.gain.setValueAtTime(0.0001, t + 0.1);
        brg.gain.exponentialRampToValueAtTime(0.07, t + 0.6);
        brg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        br.connect(brg); brg.connect(sfxBus); br.start(t + 0.1); br.stop(t + 1.05);
      });
      // a thread snapping
      const st = t + 0.95;
      const sn = ctx.createOscillator(), sng = ctx.createGain();
      sn.type = 'square';
      sn.frequency.setValueAtTime(3000, st);
      sn.frequency.exponentialRampToValueAtTime(1400, st + 0.04);
      sng.gain.setValueAtTime(0.1, st);
      sng.gain.exponentialRampToValueAtTime(0.0001, st + 0.07);
      sn.connect(sng); sng.connect(sfxBus); sn.start(st); sn.stop(st + 0.1);
    }
    // ============ STATUS SYNTHS (Steve 2026-10-07) ============
    function statusApplied() {
      // STATUS APPLIED: something wrong takes hold — a sickly descending
      // tone, like health draining away.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(330, t);
      o.frequency.exponentialRampToValueAtTime(165, t + 0.4);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.5);
    }
    function statusCured() {
      // STATUS CURED: relief — a clean ascending tone, the body righting itself.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(262, t);
      o.frequency.exponentialRampToValueAtTime(523, t + 0.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.42);
    }
    // ============ AMBIENT STING (Steve 2026-10-06) ============
    function horrorSting() {
      // THE STING THAT NOTICES YOU NOTICING (Steve 2026-10-07): tritone pair
      // rising, never arriving — under it, three sines spiral DOWN an octave
      // (your ear can't tell which way is up). Static gated at 17.3Hz — the
      // System doesn't keep time like you do — then a sub drop: the flinch.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.8;
      [[110, 165], [155.56, 233]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(320, t);
        f.frequency.exponentialRampToValueAtTime(750, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur);
      });
      [220, 440, 880].forEach((f0, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 / 2, t + dur);
        const a0 = t + i * 0.25;
        g.gain.setValueAtTime(0.0001, a0);
        g.gain.exponentialRampToValueAtTime(0.06, a0 + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus);
        o.start(a0); o.stop(t + dur);
      });
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 2;
        const gate = ctx.createOscillator(), gg = ctx.createGain();
        gate.type = 'square'; gate.frequency.value = 17.3; gg.gain.value = 0.5;
        gate.connect(gg); gg.connect(ng.gain);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.12, t + 0.5);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 1.6); gate.start(t); gate.stop(t + 1.6);
      }
      const s = ctx.createOscillator(), sg = ctx.createGain();
      s.type = 'sine';
      s.frequency.setValueAtTime(64, t + 1.3);
      s.frequency.exponentialRampToValueAtTime(27, t + 1.8);
      sg.gain.setValueAtTime(0.0001, t + 1.3);
      sg.gain.exponentialRampToValueAtTime(0.22, t + 1.42);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      s.connect(sg); sg.connect(sfxBus);
      s.start(t + 1.3); s.stop(t + 1.95);
    }

    // on beam fire — brief, violent, unmistakable. The phone screen itself
    // flinches. (Reduced-motion: shorter, dimmer — still unmistakable.)
    // Lives INSIDE the CombatAudio IIFE so impact() always resolves it —
    // a test-extracted copy of the IIFE must be self-contained (Steve 2026-10-06).
    function beamFlash() {
      try {
        if (typeof document === 'undefined') return;
        let el = document.getElementById('beamflash');
        if (!el) {
          el = document.createElement('div');
          el.id = 'beamflash';
          document.body.appendChild(el);
        }
        el.classList.remove('go');
        void el.offsetWidth; // restart the animation
        el.classList.add('go');
      } catch (e) {}
    }

    // ======== WAVE-2 FLYER VOICES (Steve 2026-10-06) ========
    // The flyer redesign (nevermore / nightcourt / statickite) fired 12
    // hooks with no registered synth — every signature beat played mute.
    // These are the voices, freaky not generic:
    //   nevermore  = beak-hammer percussion + detuned corvid croak
    //   nightcourt = negative space / hush with sub-bass (the dive makes NO
    //                sound — the silence IS the telegraph)
    //   statickite = detuned kite-string whine + radio-static bursts
    //                (dead television, tuned to you)

    // A single corvid croak: detuned saw pair a semitone apart (it doesn't
    // sit right), rattled by a square LFO on the bus gain (the harsh throat),
    // pitch sagging as the croak runs out.
    function nmCroak(t, dur, vol, f0) {
      const bus = ctx.createGain(); bus.connect(sfxBus);
      [f0, f0 * 1.0595].forEach(fq => { // minor 2nd: wrong on purpose
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 0.72, t + dur); // sags
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(bus);
        o.start(t); o.stop(t + dur + 0.05);
      });
      // the rattle: 27 Hz square gnawing the bus gain — the corvid throat
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'square'; r.frequency.value = 27;
      rg.gain.value = vol * 0.55;
      r.connect(rg); rg.connect(bus.gain);
      r.start(t); r.stop(t + dur + 0.05);
    }
    // A beak hammer: a dry knock — triangle, high, gone before it lands.
    function nmBeak(t, vol, fq) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = fq || 1900;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.1);
    }
    function nevermoreCroak() {
      // FIRST CONTACT: "A crow on the treeline. Watching." Three croaks,
      // spaced — it is in no hurry. Each sags and ends in a beak clack.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [0, 0.55, 1.25].forEach((dt, i) => {
        nmCroak(t + dt, 0.42, 0.22, 392 - i * 40);
        nmBeak(t + dt + 0.42, 0.16, 1750 + i * 200);
      });
    }
    function nevermoreStrafe() {
      // THE STRAFE DECLARED — "in a voice you buried". The run is FAST: a
      // croak dopplering down the lane, wingbeat flaps, and the beak hammer
      // slamming shut at the end of the pass.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.15;
      // the passing croak: a pair sweeping down hard, like a doppler pass
      [440, 466].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(fq * 0.5, t + dur);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.1;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
      });
      // wingbeats: noise thumped at ~9 Hz, close then gone
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 700;
        const fl = ctx.createOscillator(), flg = ctx.createGain();
        fl.type = 'sine'; fl.frequency.value = 9; flg.gain.value = 0.14;
        fl.connect(flg); flg.connect(ng.gain);
        ng.gain.setValueAtTime(0.14, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur); fl.start(t); fl.stop(t + dur);
      }
      // the hammer at the end of the lane
      nmBeak(t + dur - 0.08, 0.3, 1500);
      nmBeak(t + dur + 0.02, 0.22, 2100);
    }
    function nevermoreLand() {
      // THE RUN ENDS IN THE DIRT: talons-out impact, a wing-tangle scrape,
      // and one last beak clack. GROUNDED. Now.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // dirt thud
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.3);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.45);
      // talon scrape: bandpassed noise sweeping down
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 2.2;
        nf.frequency.setValueAtTime(4200, t);
        nf.frequency.exponentialRampToValueAtTime(700, t + 0.4);
        ng.gain.setValueAtTime(0.2, t + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.5);
      }
      nmBeak(t + 0.45, 0.2, 1800); // ...beak hammering. GROUNDED. Now.
    }
    function nevermoreClimb() {
      // "It hammers its beak shut — four ways at once — and climbs, still
      // talking, back into the dark." Four hammers, then muttered croak
      // fragments rising away as the lowpass closes.
      if (!ensure()) return;
      const t = ctx.currentTime;
      [1500, 1750, 2000, 2300].forEach((fq, i) => {
        nmBeak(t + i * 0.11, 0.26, fq);
      });
      // still talking, climbing: fragments that rise and thin into the dark
      const bus = ctx.createGain();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t + 0.5);
      lp.frequency.exponentialRampToValueAtTime(300, t + 1.9);
      bus.connect(lp); lp.connect(sfxBus);
      [0.55, 0.95, 1.3].forEach((dt, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300 + i * 60, t + dt);
        o.frequency.exponentialRampToValueAtTime(520 + i * 60, t + dt + 0.3);
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.14, t + dt + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.32);
        o.connect(g); g.connect(bus);
        o.start(t + dt); o.stop(t + dt + 0.4);
      });
    }

    function nightcourtSilence() {
      // FIRST CONTACT: "No wingsound. Owls don't make sound when they hunt —
      // that's the problem." This is a DELIBERATE near-silence, not a missing
      // synth. The world ducks (the heartbeat thins) and almost nothing comes
      // back: a sub-bass pressure bloom you feel more than hear, and one soft
      // blink. The absence is the telegraph.
      if (!ensure()) return;
      duckHeartbeat(0.06, 0.1, 1.2); // the world holds its breath
      const t = ctx.currentTime;
      // pressure bloom: 28 Hz, felt not heard, bending flat = wrong
      const sb = ctx.createOscillator(), sbg = ctx.createGain();
      sb.type = 'sine';
      sb.frequency.setValueAtTime(28, t + 0.3);
      sb.frequency.exponentialRampToValueAtTime(25.5, t + 1.1);
      sbg.gain.setValueAtTime(0.0001, t + 0.3);
      sbg.gain.exponentialRampToValueAtTime(0.1, t + 0.7);
      sbg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      sb.connect(sbg); sbg.connect(sfxBus);
      sb.start(t + 0.3); sb.stop(t + 1.45);
      // the blink: once, slowly — a soft blip at the edge of hearing
      const bl = ctx.createOscillator(), blg = ctx.createGain();
      bl.type = 'sine'; bl.frequency.value = 1250;
      blg.gain.setValueAtTime(0.0001, t + 0.9);
      blg.gain.exponentialRampToValueAtTime(0.05, t + 0.98);
      blg.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
      bl.connect(blg); blg.connect(sfxBus);
      bl.start(t + 0.9); bl.stop(t + 1.2);
    }
    function nightcourtLand() {
      // LANDED: "wings mantling, head turned too far. It stands there,
      // breathing." A muted thud, a feather drag — and the breathing,
      // because owls shouldn't pant.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // muted thud: the dive's energy, swallowed
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
      const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 220;
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(lf); lf.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.5);
      // the breathing: two slow, wrong swells of low noise
      const nz = noise(2.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 400;
        [0.5, 1.5].forEach((dt, i) => {
          ng.gain.setValueAtTime(0.0001, t + dt);
          ng.gain.exponentialRampToValueAtTime(i ? 0.11 : 0.09, t + dt + 0.35);
          ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.8);
        });
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.4); nz.stop(t + 2.6);
      }
    }
    function nightcourtClimb() {
      // "It blinks — once, slowly — and the night takes it back. Gone,
      // upward." The hush lifts: a sub tone rising slightly, thinning into
      // nothing, the dark closing over it. What leaves is less than what came.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const sb = ctx.createOscillator(), sbg = ctx.createGain();
      sb.type = 'sine';
      sb.frequency.setValueAtTime(26, t);
      sb.frequency.exponentialRampToValueAtTime(34, t + 1.3); // rising away
      sbg.gain.setValueAtTime(0.09, t + 0.1);
      sbg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      sb.connect(sbg); sbg.connect(sfxBus);
      sb.start(t); sb.stop(t + 1.55);
      // the night closing: dark noise that swells and seals shut
      const nz = noise(1.6), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 260;
        ng.gain.setValueAtTime(0.0001, t + 0.2);
        ng.gain.exponentialRampToValueAtTime(0.07, t + 0.7);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.2); nz.stop(t + 1.6);
      }
    }

    // A detuned kite-string whine: two thin sines a few Hz apart, beating
    // against each other — dead television, fluorescent, mosquito.
    function skWhine(t, dur, vol, f0, f1) {
      [f0, f1].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
      });
    }
    // Radio-static burst: bandpassed noise, bitten by a square gate.
    function skStatic(t, dur, vol, bpFq, gateHz) {
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (!nz) return;
      nf.type = 'bandpass'; nf.frequency.value = bpFq; nf.Q.value = 0.8;
      const gl = ctx.createOscillator(), glg = ctx.createGain();
      gl.type = 'square'; gl.frequency.value = gateHz; glg.gain.value = vol * 0.5;
      gl.connect(glg); glg.connect(ng.gain);
      ng.gain.setValueAtTime(vol * 0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
      nz.start(t); nz.stop(t + dur); gl.start(t); gl.stop(t + dur);
    }
    function kiteHum() {
      // FIRST CONTACT: "A kite over the treeline. Nobody is holding the
      // string." The string whine with no string — and under it, a dead
      // channel crackling to itself.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 2.0;
      skWhine(t, dur, 0.075, 3150, 3188); // the beating pair
      skStatic(t, dur, 0.05, 2600, 7);   // the dead channel
    }
    function kiteMark() {
      // THE MARK DECLARED: "The ground lights up in a grid under you. It's
      // framing the shot." A lens focusing — the whine sweeping up, tighter —
      // then the shot: static burst + shutter snap.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // focus sweep: rising pair, converging
      [[3150, 3450], [3188, 3470]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 0.7);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.85);
      });
      // the shot
      skStatic(t + 0.72, 0.35, 0.22, 3400, 31);
      // shutter snap: a dry click
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'square'; c.frequency.setValueAtTime(2400, t + 0.74);
      cg.gain.setValueAtTime(0.14, t + 0.74);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      c.connect(cg); cg.connect(sfxBus);
      c.start(t + 0.74); c.stop(t + 0.82);
    }
    function kiteTransmit() {
      // THE DIP: "the screen strobes. On it: you, sleeping." It hangs low,
      // broadcasting: rhythmic packet bursts of gated static, a garbled data
      // whine descending, the strobe chopping the air.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.8;
      skStatic(t, dur, 0.2, 2900, 13); // packet bursts
      // garbled data: two saws stepping down wrong, strobed
      [1180, 1247].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 0.55, t + dur);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 2600;
        const strobe = ctx.createOscillator(), sg = ctx.createGain();
        strobe.type = 'square'; strobe.frequency.value = 9; sg.gain.value = 0.05;
        strobe.connect(sg); sg.connect(g.gain);
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
        strobe.start(t); strobe.stop(t + dur);
      });
    }
    function kiteBroadcast() {
      // THE SQUARE SCREAMS: static made solid. Full-band white violence, a
      // detuned scream with vibrato, and a hard sub bite underneath — it
      // hits the body too.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      // the solid static: full-band, gated hard
      skStatic(t, dur, 0.34, 1800, 47);
      // the scream: two saws a semitone apart, vibrato gnawing
      [1567, 1661].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = fq;
        const vib = ctx.createOscillator(), vg = ctx.createGain();
        vib.type = 'sine'; vib.frequency.value = 11; vg.gain.value = 60;
        vib.connect(vg); vg.connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.7;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur + 0.05);
        vib.start(t); vib.stop(t + dur);
      });
      // the bite: sub drop under the scream
      const sb = ctx.createOscillator(), sbg = ctx.createGain();
      sb.type = 'sine';
      sb.frequency.setValueAtTime(110, t);
      sb.frequency.exponentialRampToValueAtTime(36, t + 0.5);
      sbg.gain.setValueAtTime(0.35, t);
      sbg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      sb.connect(sbg); sbg.connect(sfxBus);
      sb.start(t); sb.stop(t + 0.65);
    }
    function kiteClimb() {
      // "The screen goes dark. It climbs — the string that isn't there
      // pulling it back." The whine thins and rises away, the static
      // dissolves — and one phantom creak, a string that doesn't exist.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.6;
      // whine rising away + lowpass closing = distance
      const bus = ctx.createGain();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(6000, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + dur);
      bus.connect(lp); lp.connect(sfxBus);
      [3150, 3188].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 1.35, t + dur); // rising away
        g.gain.setValueAtTime(0.07, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + dur + 0.05);
      });
      // the phantom creak: a triangle bending up, then gone
      const c = ctx.createOscillator(), cg = ctx.createGain();
      c.type = 'triangle';
      c.frequency.setValueAtTime(220, t + 0.4);
      c.frequency.exponentialRampToValueAtTime(660, t + 0.75);
      cg.gain.setValueAtTime(0.0001, t + 0.4);
      cg.gain.exponentialRampToValueAtTime(0.08, t + 0.55);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      c.connect(cg); cg.connect(sfxBus);
      c.start(t + 0.4); c.stop(t + 0.85);
    }

    // WOUND TEMPERAMENTS (Steve 2026-10-07): game.js fires these when a
    // monster's wound-state changes the fight's personality — the registry
    // entries never existed, so every temperament shift played mute. Three
    // voices, three psychologies. All synthesis, bounded node counts.
    function woundEnraged() {
      // ENRAGED: BLEEDING — and it likes it. Louder, faster, no more feints.
      // A low pounding that accelerates into a detuned saw-stack scream, a
      // tritone apart and climbing, with a wet tearing noise underneath.
      // The telegraphs get bigger because the rage is.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the pounding: thumps accelerating, 0.3s apart closing to 0.12
      let dt = t, gap = 0.3;
      while (dt < t + 1.1) {
        thump(dt, 0.26);
        dt += gap; gap = Math.max(0.12, gap * 0.82);
      }
      // the scream: two saws a tritone apart, climbing together
      [[220, 330], [311.1, 466.2]].forEach(([f0, f1]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 1.0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.1, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.22);
      });
      // the tear: wet noise ripping upward through a bandpass
      const nz = noise(0.9), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 3;
        nf.frequency.setValueAtTime(300, t);
        nf.frequency.exponentialRampToValueAtTime(2800, t + 0.8);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.08, t + 0.2);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 1.0);
      }
    }
    function woundCunning() {
      // CUNNING: hurt — and it goes quiet and clever. It stops rushing. It
      // starts CHOOSING. Near-silence first (the hush IS the cue), then
      // careful deliberate ticks at even intervals — something counting —
      // under a low watchful tone whose slow LFO scans the room.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the counting: six dry ticks, perfectly even — deliberate
      for (let i = 0; i < 6; i++) {
        const dt = t + 0.25 + i * 0.28;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 1900;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 9;
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.055, dt + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.05);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.07);
      }
      // the watcher: low tone scanning slowly, never settling
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'sine'; w.frequency.value = 82;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 0.5; lg.gain.value = 22;
      lfo.connect(lg); lg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t + 0.2);
      wg.gain.exponentialRampToValueAtTime(0.11, t + 0.6);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t + 0.2); w.stop(t + 2.25); lfo.start(t + 0.2); lfo.stop(t + 2.25);
    }
    function woundDesperate() {
      // DESPERATE: hurt bad — and it knows it. Wild swings, everything
      // committed, nothing held back. Erratic flailing: detuned stabs at
      // irregular intervals over a failing-engine sputter (a low saw
      // choking on a prime-rate AM stutter), ending ragged, mid-gasp.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the flailing: five stabs, irregular gaps, climbing sharper
      const gaps = [0, 0.19, 0.47, 0.66, 1.02];
      gaps.forEach((off, i) => {
        const dt = t + off;
        const base = 340 + i * 45;
        [0, 7].forEach(det => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.value = base + det;
          g.gain.setValueAtTime(0.0001, dt);
          g.gain.exponentialRampToValueAtTime(0.11, dt + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
          o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.18);
        });
      });
      // the failing engine: low saw choking on 29Hz AM — prime, arrhythmic
      const e = ctx.createOscillator(), eg = ctx.createGain();
      e.type = 'sawtooth'; e.frequency.value = 65;
      const am = ctx.createOscillator(), amg = ctx.createGain();
      am.type = 'square'; am.frequency.value = 29; amg.gain.value = 0.05;
      am.connect(amg); amg.connect(eg.gain);
      eg.gain.setValueAtTime(0.08, t);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      e.connect(eg); eg.connect(sfxBus);
      e.start(t); e.stop(t + 1.35); am.start(t); am.stop(t + 1.35);
      // the gasp: one breath that doesn't finish
      const nz = noise(0.5), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 2;
        ng.gain.setValueAtTime(0.0001, t + 1.1);
        ng.gain.exponentialRampToValueAtTime(0.09, t + 1.25);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.45); // cut off — never finishes
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 1.1); nz.stop(t + 1.5);
      }
    }
    function alienRetreat() {
      // THE WITHDRAWAL (Steve 2026-10-08, audio-hook sweep): encounters.js
      // fires this when a broke alien-persona breaks off instead of dying —
      // "backing away, hands raised, then GONE into the treeline." This is
      // not a panicked flee; it is attention being WITHDRAWN. Three layers:
      // (1) the held tone that was keeping the scene taut sags a quarter-tone
      // and dissolves — like someone letting go of a thought; (2) two
      // footfalls that get quieter and lower, and a third that STARTS to
      // rise and is CUT before it lands — the step that never happens;
      // (3) the treeline swallowing the air: a reversed-breath swell of
      // filtered noise, cut hard. What's gone is gone mid-gesture.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the released hold: two near-unison highs, beating, bending down a
      // quarter-tone as they fade — the grip letting go
      [1568, 1582.6].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 0.9727, t + 0.9); // quarter-tone sag
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.05);
      });
      // steps that don't land: two real, one aborted
      thump(t, 0.35);
      thump(t + 0.35, 0.22);
      const st = ctx.createOscillator(), sg = ctx.createGain();
      st.type = 'sine'; st.frequency.value = 48;
      sg.gain.setValueAtTime(0.0001, t + 0.7);
      sg.gain.exponentialRampToValueAtTime(0.15, t + 0.95); // rising toward the step…
      sg.gain.setValueAtTime(0.15, t + 0.99);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0); // …cut. Never lands.
      st.connect(sg); sg.connect(sfxBus); st.start(t + 0.7); st.stop(t + 1.05);
      // the treeline: reversed-breath swell of filtered air, hard cut
      const nz = noise(1.2), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'highpass'; nf.frequency.value = 900;
        ng.gain.setValueAtTime(0.0001, t + 0.3);
        ng.gain.exponentialRampToValueAtTime(0.12, t + 1.0);
        ng.gain.setValueAtTime(0.12, t + 1.08);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); // swallowed
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.3); nz.stop(t + 1.15);
      }
    }
    function meleeHit() {
      // THE CLOSE STRIKE (Steve 2026-10-08, audio-hook sweep): encounters.js
      // fires this when an AP-persona lands a melee strike — "strikes...
      // Efficient. Practiced. No wasted motion." Violence here is desperate
      // and traumatic, never cinematic: no whoosh-swash, no glory. A wet
      // contact transient, the body-mass thump, a too-close exhale cut
      // short, and one metallic wrong note that doesn't resolve. Distinct
      // from monsterHurt (a flinch, cut off) and wound (damage that stays).
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the contact: wet transient, close-miked
      const c = noise(0.07), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      if (c) {
        cf.type = 'bandpass'; cf.frequency.value = 1900; cf.Q.value = 2.5;
        cg.gain.setValueAtTime(0.28, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        c.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        c.start(t); c.stop(t + 0.09);
      }
      // the mass: body behind it
      thump(t, 0.5);
      // the exhale, too close: swells and is cut — no follow-through
      const h = noise(0.3), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
      if (h) {
        hf.type = 'bandpass'; hf.frequency.value = 700; hf.Q.value = 1.2;
        hg.gain.setValueAtTime(0.0001, t + 0.03);
        hg.gain.exponentialRampToValueAtTime(0.13, t + 0.18);
        hg.gain.setValueAtTime(0.13, t + 0.22);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24); // cut — no follow-through
        h.connect(hf); hf.connect(hg); hg.connect(sfxBus);
        h.start(t + 0.03); h.stop(t + 0.3);
      }
      // the wrong note: a detuned metallic pair, low, decaying, unresolved
      [466, 469.5].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(fq, t + 0.02);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
        g.gain.setValueAtTime(0.0001, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t + 0.02); o.stop(t + 0.5);
      });
    }
    function stasisBlock() {
      // THE STASIS BLOCK (break-it 2026-10-08): alienPlayers.js fires this
      // when Rax's stasis field eats the barrier exit — "The air goes still...
      // You leave when Rax says you leave." The hook was fired with NO
      // registered voice (silent no-op) since the stasis system landed. The
      // moment is time itself being grabbed: a hard metallic snap (the field
      // engaging), then everything collapses into one held, detuned high
      // tone — the mosquito-whine of frozen time — over a sub-pressure that
      // ramps up and is CUT, never resolved. One-shot, fully self-
      // terminating: no sustained nodes, nothing for combatEnd to clean.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the snap: the field engaging, hard and metallic
      const c = noise(0.06), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      if (c) {
        cf.type = 'highpass'; cf.frequency.value = 2600;
        cg.gain.setValueAtTime(0.32, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        c.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        c.start(t); c.stop(t + 0.08);
      }
      // the freeze: a single held tone, detuned pair beating — time held still
      [2093, 2096.5].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(fq, t + 0.05);
        g.gain.setValueAtTime(0.0001, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.35);
        g.gain.setValueAtTime(0.06, t + 1.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
        o.connect(g); g.connect(sfxBus);
        o.start(t + 0.05); o.stop(t + 1.5);
      });
      // the pressure: sub rising under the held tone, then CUT — the held barrier
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine';
      b.frequency.setValueAtTime(48, t + 0.1);
      b.frequency.exponentialRampToValueAtTime(72, t + 1.0);
      bg.gain.setValueAtTime(0.0001, t + 0.1);
      bg.gain.exponentialRampToValueAtTime(0.22, t + 1.0);
      bg.gain.setValueAtTime(0.22, t + 1.05);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.08); // cut — held, not released
      b.connect(bg); bg.connect(sfxBus);
      b.start(t + 0.1); b.stop(t + 1.15);
    }
    function wound() {
      // THE WOUND (Steve 2026-10-08, audio-hook sweep): the generic wound
      // voice — the sound of damage that STAYS. Distinct from monsterHurt
      // (a flinch, cut off — brief) and from the temperament trio (which are
      // psychology shifts, not the injury itself). Violence here is desperate
      // and traumatic, so this is not a hit-marker: it is wet, heavy, and
      // unfinished. Also the safety net for game.js's dynamic 'wound'+wcap
      // dispatch — the audited literal always resolves, so a future
      // temperament value can never go silent.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // the crack: wet transient, the moment of damage
      const c = noise(0.09), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      if (c) {
        cf.type = 'bandpass'; cf.frequency.value = 1900; cf.Q.value = 2.5;
        cg.gain.setValueAtTime(0.3, t);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        c.connect(cf); cf.connect(cg); cg.connect(sfxBus);
        c.start(t); c.stop(t + 0.1);
      }
      // the thud: sub-bass body — the mass of it landing
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = 'sine';
      b.frequency.setValueAtTime(95, t);
      b.frequency.exponentialRampToValueAtTime(38, t + 0.2);
      bg.gain.setValueAtTime(0.32, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      b.connect(bg); bg.connect(sfxBus); b.start(t); b.stop(t + 0.26);
      // the hitched breath: swells, then gets CUT HARD mid-exhale — the
      // breath that doesn't finish. Desperate, not dramatic.
      const h = noise(0.5), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
      if (h) {
        hf.type = 'bandpass'; hf.frequency.value = 800; hf.Q.value = 1.5;
        hg.gain.setValueAtTime(0.0001, t + 0.15);
        hg.gain.exponentialRampToValueAtTime(0.14, t + 0.45);
        hg.gain.setValueAtTime(0.14, t + 0.52);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.54); // cut — unfinished
        h.connect(hf); hf.connect(hg); hg.connect(sfxBus);
        h.start(t + 0.15); h.stop(t + 0.56);
      }
      // the sag: two saws a semitone apart, beating, both sagging flat and
      // never resolving. The body keeps score.
      [110, 116.54].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t + 0.3);
        o.frequency.exponentialRampToValueAtTime(fq * 0.93, t + 1.7); // sags flat
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        g.gain.setValueAtTime(0.0001, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t + 0.3); o.stop(t + 1.8);
      });
    }
    return {
      ensureAudio() { return ensure(); },
      combatStart() { combatStartHit(); heartbeat(72); }, // (Steve 2026-10-06): the opening now lands its own wrong-horn sting, then the heartbeat takes over
      telegraph(d) {
        // urgency = turnsLeft. 2+ = slow dread (80bpm), 1 = frantic (145bpm).
        heartbeat((d && d.urgency >= 2) ? 80 : 145);
        if (d && d.windupTick) return; // charge already rising from declare
        // PATTERN-AWARE WINDUP (Steve 2026-10-06): every pattern gets its own
        // charge sound. The deer's beam keeps beamCharge; other beams are
        // machines (beamTechWindup). windup duration scales with urgency.
        const dur = Math.max(0.9, ((d && d.urgency) || 1) * 1.5);
        if (d && d.beam && d.highbeam) { beamCharge(dur); return; }
        const pat = (d && d.pattern) || '';
        if (pat === 'beam' || (d && d.beam)) beamTechWindup(dur);
        else if (pat === 'burst') burstWindup(dur);
        else if (pat === 'charge') chargeWindup(dur);
        else if (pat === 'direct') lockonTick(dur);
        else if (pat === 'line') lineWindup(dur);
        else if (pat === 'rush') rushWindup();
        else if (pat === 'single') diveWindup(dur);
        // 'ambush' deliberately silent: no warning, by design.
      },
      impact(d) {
        // PATTERN-AWARE RESOLVE (Steve 2026-10-06): mirrors telegraph.
        if (d && d.beam && d.highbeam) { beamFire(); beamFlash(); return; }
        const pat = (d && d.pattern) || '';
        if (pat === 'beam' || (d && d.beam)) { droneBeam(); return; }
        if (pat === 'burst') { burstDetonate(); return; }
        if (pat === 'charge') { chargeImpact(); return; }
        if (pat === 'direct') { lockonHit(); return; }
        if (pat === 'line') { lineStrike(); return; }
        if (pat === 'rush') { rushHit(); return; }
        if (pat === 'single') { diveImpact(); return; }
        if (pat === 'ambush') { ambushSnap(); return; }
        impactWild(); // (Steve 2026-10-06): unpatterned impacts get the alien fallthrough, not the stock boom
      },
      miss() { haymakerMiss(); }, // (Steve 2026-10-07): brawler haymaker whiff — the swing sails past, air displaced, nothing landed
      beamBlocked() { beamBlocked(); },
      deerNotice() { deerCall(0.22); },
      deerDown() { deerCall(0.95, true); },
      deerCall(i, dying) { deerCall(i, dying); },
      deerAggro() { deerCall(0.85); }, // the bellow: wrong, too deep
      deerSnort() { deerSnort(); }, // pawing, recharging — the animal, not the beam
      beamCharge(s) { beamCharge(s); },
      beamFire() { beamFire(); },
      beamSweep(pan, heat) {
        if (pan && typeof pan === 'object') { heat = pan.heat; pan = pan.pan; } // audioEvent passes one data arg
        beamSweep(pan, heat);
      },
      beamSweepStop() { beamSweepStop(); },
      victory() { sting('victory'); },
      defeat() { sting('defeat'); },
      talkAttention() { talkAttention(); },
      combatEnd() { stopHeartbeat(); stopCharge(); beamSweepStop(); humStop(); },
      humNotice() { humBuild(2); }, // the grass starts humming — low, unsettled
      humRise(d) { humBuild(d && d.stacks ? d.stacks : 1); },
      humBreak() { humBreak(); },
      humStop() { humStop(); },
      shout() { shout(); },
      glasswingCircle() { glasswingCircle(); },
      glasswingDive() { glasswingDive(); },
      glasswingLand() { glasswingLand(); },
      glasswingClimb() { glasswingClimb(); },
      glasswingShadowClose(d) { glasswingShadowClose(d); }, // pre-combat dive shadow, escalates with turns
      staticCry(opts) { staticCry(opts); },
      staticBreak() { staticBreak(); },
      stagMirror() { stagMirror(); },
      stagSnort() { stagSnort(); },
      droneHum() { droneHum(); },
      droneCount(opts) { droneCount(opts); },
      droneBeam() { droneBeam(); },
      droneRecalc() { droneRecalc(); },
      swarmBuild() { swarmBuild(); },
      swarmFlash() { swarmFlash(); },
      understudyCopy() { understudyCopy(); },
      landlordClaim() { landlordClaim(); },
      hecklerTaunt(d) { hecklerTaunt(d); },
      hecklerPileOn() { hecklerPileOn(); },
      // (Steve 2026-10-06): orphaned hook — the heckler's monsters.json
      // aggroAudio fires 'hecklerLaugh' but no voice existed; it gets the
      // deepened taunt (closest existing voice).
      hecklerLaugh(d) { hecklerTaunt(d); },
      paparazzoShutter() { paparazzoShutter(); },
      unionRepWhistle() { unionRepWhistle(); },
      unionBullhorn() { unionBullhorn(); }, // (Steve 2026-10-06): solidarity — the bullhorn
      unionWalkout() { unionWalkout(); },   // (Steve 2026-10-06): the walkout — stomp + wail
      unionPicket() { unionPicket(); },     // (Steve 2026-10-06): picket line summoned
      // WAVE-2 SIBLING HOOKS (Steve 2026-10-06): the roster redesign fired
      // these with no synth at all — the other four monsters' voices.
      understudyWatch() { understudyWatch(); },       // blank shape, watching
      understudyRehearse() { understudyRehearse(); }, // doing your move badly
      understudyPerform() { understudyPerform(); },   // "I've got it now"
      landlordSpread() { landlordSpread(); },   // ADDENDUM — wider area
      landlordEvict() { landlordEvict(); },     // EVICTION NOTICE
      hecklerHeadliner(d) { hecklerHeadliner(d); }, // "we've got a LIVE ONE!"
      hecklerJibe(d) { hecklerJibe(d); },       // narrated miss, shame-scaled
      paparazzoExclusive() { paparazzoExclusive(); }, // the money shot
      // THE MODERATOR (Steve 2026-10-06): wave-2 apex — content enforcement.
      modNotice() { modNotice(); },             // CONTENT UNDER REVIEW
      modNoted() { modNoted(); },               // the ranging tap
      modMute(d) { modMute(d); },               // the gavel
      modViolation(d) { modViolation(d); },     // flagged: muted verb used
      modRemoval(d) { modRemoval(d); },         // REMOVAL IMMINENT / Deplatform
      modShadow() { modShadow(); },             // SHADOWBAN
      modDown() { modDown(); },                 // deplatformed
      // WAVE-2 FLYER VOICES (Steve 2026-10-06): the flyer redesign fired
      // these 12 hooks with no synth — every signature beat played mute.
      nevermoreCroak() { nevermoreCroak(); },       // first contact: the crow that has been watching
      nevermoreStrafe() { nevermoreStrafe(); },     // the unkind cut: strafing run declared
      nevermoreLand() { nevermoreLand(); },         // the run ends in the dirt
      nevermoreClimb() { nevermoreClimb(); },       // beak hammered shut, four ways — climbs, still talking
      nightcourtSilence() { nightcourtSilence(); }, // first contact: no wingsound — that's the problem (deliberate hush)
      nightcourtLand() { nightcourtLand(); },       // landed on its kill — wings mantling, breathing
      nightcourtClimb() { nightcourtClimb(); },     // the night takes it back
      kiteHum() { kiteHum(); },                     // first contact: dead television, tuned to you
      kiteMark() { kiteMark(); },                   // the mark: framing the shot
      kiteTransmit() { kiteTransmit(); },           // the dip: transmitting at melee height
      kiteBroadcast() { kiteBroadcast(); },         // the square SCREAMS — static made solid
      kiteClimb() { kiteClimb(); },                 // the screen goes dark; the string that isn't there pulls
      belltoadCroak() { belltoadCroak(); },
      belltoadStun() { belltoadStun(); },
      belltoadChorus() { belltoadChorus(); },
      eurekaTick(d) { eurekaTick(d); },
      eurekaCharge() { eurekaCharge(); },
      eurekaDetonate() { eurekaDetonate(); },
      eurekaSpent() { eurekaSpent(); },
      eurekaDisperse() { eurekaDisperse(); },
      eurekaDrift() { eurekaDrift(); },
      projectorHum(d) { projectorHum(d); },
      projectorStatic() { projectorStatic(); },
      projectorBreak() { projectorBreak(); },
      projectorPull() { projectorPull(); },
      projectorFire() { projectorFire(); },
      hypeInflate() { hypeInflate(); },
      hypeDetonate() { hypeDetonate(); },
      hypeDeflate() { hypeDeflate(); },
      holdMusic(d) { holdMusic(d); }, // (Steve 2026-10-06): broken/watching moods
      lineCut() { lineCut(); },
      paperRustle(d) { paperRustle(d); },
      baskCharge(d) { baskCharge(d); },
      baskBreak() { baskBreak(); },
      baskFlatten() { baskFlatten(); },
      sunbaskerBite() { sunbaskerBite(); }, // (Steve 2026-10-07): bite-land hook was a no-op until now
      // AUDIO COMPLETION (Steve 2026-10-05): every fired event now resolves.
      heartbeat() { heartbeat(72); },
      // Animals
      animalBite() { animalBite(); },
      animalBolt() { animalBolt(); },
      animalChatter() { animalChatter(); },
      animalFlop() { animalFlop(); },
      animalPinch() { animalPinch(); },
      animalSplash() { animalSplash(); },
      // Prey beats (Steve 2026-10-06): the hunt's missing sounds
      animalKill() { animalKill(); },
      animalButcher() { animalButcher(); }, // (Steve 2026-10-06): wired — food.js cleanCarcass + specialist butcher task
      animalHiss() { animalHiss(); },
      animalSnort() { animalSnort(); },
      animalRustle() { animalRustle(); },
      animalStalk() { animalStalk(); }, // (Steve 2026-10-06): the player's own careful step — fired from the Stalk dispatch
      animalPant() { animalPant(); },
      animalRattle() { animalRattle(); },
      animalSpray() { animalSpray(); },
      // New animals (Steve 2026-10-06): the animals worker's new beats
      animalQuill() { animalQuill(); },
      animalHonk() { animalHonk(); },
      animalYowl() { animalYowl(); },
      animalCharge() { animalCharge(); },
      animalTailSlap() { animalTailSlap(); },
      animalWhistle() { animalWhistle(); },
      animalFlush() { animalFlush(); },
      // Batch monsters (were silent)
      boarTrample() { boarTrample(); },
      catfishSnap() { catfishSnap(); },
      catfishStill() { catfishStill(); },
      heronStatic() { heronStatic(); },
      lockpickChitter() { lockpickChitter(); },
      lockpickGrab() { lockpickGrab(); },
      mothFlash() { mothFlash(); },
      mothFlutter() { mothFlutter(); },
      snakeSplit() { snakeSplit(); },
      // Ducks in a row: the formation's voice (Steve 2026-10-06)
      ducksQuack() { ducksQuack(); },
      ducksQuackCut() { ducksQuackCut(); },
      duckLineUp() { duckLineUp(); },
      duckMarch() { duckMarch(); },
      duckNip() { duckNip(); },
      duckRegroup() { duckRegroup(); },
      duckScreech() { duckScreech(); },
      stagConfused() { stagConfused(); },
      turtleBunker() { turtleBunker(); },
      turtleFlip() { turtleFlip(); }, // speedbump_turtle flip (break-it 2026-10-08)
      wolfBreak() { wolfBreak(); },
      toadSwell() { toadSwell(); },
      // Wave 2 gaps
      droneCorrect() { droneCorrect(); },
      swarmEscalate() { swarmEscalate(); },
      // delegateCircle/managerCircle removed 2026-10-08 — retired delegate_beast/manager monster ids; zero call sites (Steve 2026-10-08).
      // System events
      confront() { confront(); },
      // CONTESTS + JUSTICE OUTCOMES (Steve 2026-10-06): hooks for the
      // contest/truth workers to wire dispatch to. Registered and verified
      // here; dispatch sites belong to those workers' files.
      contestCall() { contestCall(); },     // contest window announced
      contestTaken() { contestTaken(); },   // the grab: you are chosen
      contestSpared() { contestSpared(); }, // announced not-taken
      justiceVerdict() { justiceVerdict(); }, // the moot has decided
      exileWalk() { exileWalk(); },         // footsteps receding, hum thinning
      // CONTEST BESPOKE SET (Steve 2026-10-08): six beats with fiction too
      // strong for borrowed voices — registered here, wired in contests.js
      // CX_BEAT_DEFS.
      altarCurdle() { altarCurdle(); },       // tithe declare: muzak curdles as the altar takes hold
      hungerGnaw() { hungerGnaw(); },         // starve escalate: the white room — hunger takes hold
      predatorListen() { predatorListen(); }, // hide declare: the sixty-count — it is already listening
      teethTick() { teethTick(); },           // wheel escalate: the Wheel of Teeth counts
      mindMoth() { mindMoth(); },             // quiet escalate: the room reads the buried one
      engineVoices() { engineVoices(); },     // riddle declare: mouths almost like someone you know
      // Haven arc (exile redemption; were unmapped betrayal.js hooks)
      joinVillage() { joinVillage(); },   // probation: the chance they took
      claimSite() { claimSite(); },       // cairn, branch, wrong wind
      chopWood() { chopWood(); },         // honest work: thunk, crack, breath
      buildShelter() { buildShelter(); }, // timber becoming shelter
      foundHaven() { foundHaven(); },     // the new hearth catches
      genesis_plant() { genesis_plant(); },
      gravity_well() { gravity_well(); },
      waveUnlock() { waveUnlock(); },
      toggleMute() { return toggleMute(); },
      isMuted() { return muted; },
      round(d) { roundTick(d); }, // the System is counting — it gets heavier each round
      // AUDIO COMPLETION (Steve 2026-10-06): these fired with no synth at all.
      crash(d) { crash(d); },
      levelup(d) { levelup(d); },
      passiveUnlock(d) { passiveUnlock(d); },
      // KNOWLEDGE + SYNERGY (Steve 2026-10-07): were orphaned hooks — 7
      // knowledgeReveal sites and 1 synergyDiscovered site fired silence.
      knowledgeReveal(d) { knowledgeReveal(d); },
      synergyDiscovered(d) { synergyDiscovered(d); },
      // PATTERN SYNTHS (Steve 2026-10-06): generic-per-pattern beats for the
      // wave-2 flesh-out siblings — call directly, or let telegraph()/impact()
      // dispatch them by pattern. Patterns: beam, burst, charge, direct,
      // line, rush, single, ambush. (The deer's beam is separate: beamCharge/
      // beamFire are the animal; droneBeam is the machine.)
      patternWindup(d) {
        const pat = (d && d.pattern) || '';
        const dur = Math.max(0.9, ((d && d.urgency) || 1) * 1.5);
        if (pat === 'beam' || (d && d.beam)) beamTechWindup(dur);
        else if (pat === 'burst') burstWindup(dur);
        else if (pat === 'charge') chargeWindup(dur);
        else if (pat === 'direct') lockonTick(dur);
        else if (pat === 'line') lineWindup(dur);
        else if (pat === 'rush') rushWindup();
        else if (pat === 'single') diveWindup(dur);
      },
      burstDetonate() { burstDetonate(); },
      chargeImpact() { chargeImpact(); },
      lockonTick(d) { lockonTick(d && d.dur); },
      lockonHit() { lockonHit(); },
      lineStrike() { lineStrike(); },
      rushHit() { rushHit(); },
      diveImpact() { diveImpact(); },
      ambushSnap() { ambushSnap(); },
      // WAVE-2 BESPOKE BEATS (Steve 2026-10-06): missing resolves for siblings
      staticScream() { staticScream(); }, // voice_mimic_radio reveal: the radio SCREAMS
      serviceRush() { serviceRush(); },   // service_mimic: hold music slammed into motion
      monsterDown() { monsterDown(); },   // generic death — collapse, breath out, wrong note
      monsterHurt() { monsterHurt(); },   // generic wound — a flinch, cut off
      // WOUND TEMPERAMENTS (Steve 2026-10-07): game.js fires these on
      // wound-state shifts (dynamic 'wound'+wcap) + contests.js beat arrays.
      // wound() (Steve 2026-10-08, audio-hook sweep): the GENERIC wound voice
      // — damage that stays (wet crack + sub thud + hitched breath + sagging
      // semitone pair). Safety net so the dynamic dispatch's audited literal
      // always resolves; distinct from monsterHurt (a flinch, cut off).
      wound() { wound(); },
      woundEnraged() { woundEnraged(); },     // BLEEDING — and it likes it: accelerating pounding + tritone scream
      woundCunning() { woundCunning(); },     // goes quiet and clever: hush, counting ticks, watcher tone
      woundDesperate() { woundDesperate(); }, // hurt bad, knows it: erratic stabs + failing-engine sputter
      // HOOK-COMPLETION 2026-10-08 (Steve 2026-10-05 census): the last two
      // fired-but-silent hooks in the encounter system.
      alienRetreat() { alienRetreat(); },     // broke persona breaks off — the withdrawal: held tone lets go, a step that never lands, the treeline swallows the air
      meleeHit() { meleeHit(); },             // AP-persona melee strike lands — wet contact, body thump, cut-off exhale, one unresolved wrong note
      stasisBlock() { stasisBlock(); },       // (break-it 2026-10-08): Rax's stasis field eats the barrier exit — the field snaps shut, time freezes into one held detuned tone over a rising sub that is CUT, never released
      // WAVE-1 CONTRACT HOOKS (Steve 2026-10-06): promised in the HOOK
      // CONTRACT above, never defined until now
      boarNotice() { boarNotice(); },
      boarSnort() { boarSnort(); },
      boarCharge() { boarCharge(); },
      wolfSilence() { wolfSilence(); },
      wolfSnarl() { wolfSnarl(); },
      heronUnfold() { heronUnfold(); },
      heronStrike() { heronStrike(); },
      turtleSnap() { turtleSnap(); }, // speedbump_turtle resolveAudio
      stagCharge() { stagCharge(); }, // mirror_stag Confrontation resolve (monsters.json)
      kiteUnfold() { kiteUnfold(); }, // statickite aggroAudio (monsters.json)
      nevermoreUnfold() { nevermoreUnfold(); }, // nevermore aggroAudio (monsters.json)
      nightcourtTurn() { nightcourtTurn(); }, // nightcourt aggroAudio (monsters.json)
      statusApplied(data) { statusApplied(data); }, // statusEffects.js applyStatus
      statusCured(data) { statusCured(data); }, // statusEffects.js cureStatus
      // ROUND-5 AGGRO VOICES (Steve 2026-10-07): seven monsters stopped
      // bellowing like deer. animalPanic fulfills the encounters.js hook
      // contract (real synth wins over the bolt+rustle composition).
      gallowdeerAim() { gallowdeerAim(); },       // gallowdeer aggroAudio (monsters.json) — the headlights power on
      mirrormothFlash() { mirrormothFlash(); },   // mirrormoth aggroAudio (monsters.json) — the light has a sound
      lockpickFingers() { lockpickFingers(); },   // lockpick_raccoon aggroAudio (monsters.json) — too many fingers
      turtleGrind() { turtleGrind(); },           // speedbump_turtle aggroAudio (monsters.json) — a boulder with opinions
      catfishLure() { catfishLure(); },           // nightlight_catfish aggroAudio (monsters.json) — pretty is the problem
      glasswingBuzz() { glasswingBuzz(); },       // glasswing aggroAudio (monsters.json) — the air screamed
      sunbaskerShimmer() { sunbaskerShimmer(); }, // sunbasker aggroAudio (monsters.json) — molten gold
      animalPanic() { animalPanic(); },           // CORNER PANIC — encounters.js ENC_AUDIO_FALLBACK contract fulfilled
      // ROUND-6 EVENT BEATS (Steve 2026-10-07): the six scheduled-event
      // handlers from 9709eba fired with zero audio, and the truth.js liar
      // confrontation — the one social scenario with no voice at all.
      fanPackageDrop() { fanPackageDrop(); }, // the crate thumps down, trailing parachute silk and glitter
      duckSqueak() { duckSqueak(); },         // the bonded duck squeaks. Somehow, that helps.
      stormFront() { stormFront(); },         // the bruised-sky warning — thunder that arrives wrong
      systemCooking() { systemCooking(); },   // the System's cooking segment — bubbles, scribbles, lint
      traderArrive() { traderArrive(); },     // river-mud boots and a practiced smile
      trialFanfare() { trialFanfare(); },     // a fanfare that's almost right, from a god that can't keep secrets
      liarConfront(d) { liarConfront(d); },   // "You told me X, but [evidence]." — tension + three resolutions
      // AMBIENT STING (Steve 2026-10-06): the UI dread-beat's horrorSting was
      // referenced at the top of app.js but never defined. Now it is.
      horrorSting() { horrorSting(); },
    };
  })();
  Game.audio = CombatAudio;

  // (beamFlash lives inside the CombatAudio IIFE — impact() resolves it there.)

  // villagersNear: everyone within `range` of the player (Chebyshev).
  function villagersNear(range) {
    const out = [];
    const vpos = Game.state.village && Game.state.village.positions;
    if (!vpos) return out;
    const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
    for (const rid of Object.keys(vpos)) {
      const p = vpos[rid];
      if (Math.max(Math.abs(p.mx - px), Math.abs(p.my - py)) <= range) {
        const vp = (Game.data.villagers || []).find(v => v.id === rid) ||
                   (Game.data.background_survivors || []).find(v => v.id === rid);
        out.push({ id: rid, cx: p.mx, cy: p.my, label: Game.displayName(rid) });
      }
    }
    return out;
  }

  // talkAction: the Talk flow. 0/1/many people in earshot.
  function talkAction() {
    const near = villagersNear(3);
    if (!near.length) { Game.say('No one close enough to talk to.'); refresh(); return; }
    if (near.length === 1) { personSheet(near[0].id); return; }
    enterTargeting({
      prompt: '\u{1F4AC} Talk to whom?',
      targets: near,
      onPick: (t) => personSheet(t.id),
    });
  }

  // ============ PERSON SHEET ============
  // People get sheets, not tile panels. Talk / give / teach, all in one place.
  // Talk updates the sheet in place ("say more") — no screen takeover.
  // ============ INLINE INTERACTION SLOT ============
  // ONE SCREEN. Person panels, assignment, remote assign, pantry — everything
  // renders into #inlineslot in the main flow. No overlays, no screen hopping.
  // The game comes to you.
  // openSheet() remains ONLY for modal System offers (ability/relic choices):
  // the System doesn't ask politely.
  let inlineView = null; // {kind:'person'|'assign'|'remote'|'pantry', vid, line, result, nvMode, via, mapKey}
  // chatView: the ONE acceptable interruption (Steve). When you're talking to
  // someone, the screen becomes the conversation — full chat view, no
  // scrolling to follow the dialogue. {vid, thinking, thinkingToken}.
  let chatView = null;
  // lastPersonTap: tapping a person's tile while already adjacent steps onto
  // their tile (explicit). Any movement elsewhere invalidates it.
  let lastPersonTap = null; // {vid, px, py}

  function inlineMapKey() {
    return (Game.map ? Game.map.px + ',' + Game.map.py : '?') + ':' +
      (Game.state.scholar ? Game.state.scholar.day + '.' + Game.state.scholar.dayPart : '');
  }


  // openPerson: tap a person → their card appears inline, in the main screen.
  // Dialogue, buttons, everything — no screen transition. Their opening line
  // fires once per open (talking costs energy; re-renders must not re-charge).
  function openPerson(villagerId) {
    // Opening a card doesn't start a conversation — that's the player's choice.
    // (It used to burn energy and fire a line on every open.)
    inlineView = { kind: 'person', vid: villagerId, line: null, result: null, nvMode: null, mapKey: inlineMapKey() };
    refresh();
  }

  // personSheet is now openPerson — alias so no call site breaks.
  function personSheet(villagerId) { openPerson(villagerId); }

  function renderInlineSlot(st) {
    const slot = document.getElementById('inlineslot');
    if (!slot) return;
    // stale? new tile, new day part, or combat started → clear.
    if (inlineView && inlineView.mapKey !== inlineMapKey()) inlineView = null;
    // STORES CO-LOCATION: pantry and caches belong with the Haven panel's
    // pantry/stash display — not in the far-away main-column slot. Render them
    // into the slot sitting right under the pantry/caches buttons.
    const havenSlot = document.getElementById('haven-stores-slot');
    const isStores = inlineView && (inlineView.kind === 'pantry' || inlineView.kind === 'caches');
    const target = (isStores && havenSlot) ? havenSlot : slot;
    if (havenSlot && havenSlot !== target) havenSlot.innerHTML = '';
    if (!inlineView || (st && st.inCombat)) { slot.innerHTML = ''; if (havenSlot) havenSlot.innerHTML = ''; return; }
    if (isStores && target !== slot) slot.innerHTML = '';
    // PERSON CARDS now render in the narration box (Steve 2026-10-05) — not here.
    if (inlineView.kind === 'person') { slot.innerHTML = ''; return; }
    else if (inlineView.kind === 'assign') renderAssignInline(target, inlineView);
    else if (inlineView.kind === 'remote') renderRemoteInline(target, inlineView);
    else if (inlineView.kind === 'askabout') renderAskAboutInline(target, inlineView);
    else if (inlineView.kind === 'pantry') renderPantryInline(target, inlineView);
    else if (inlineView.kind === 'caches') renderCachesInline(target, inlineView);
    else if (inlineView.kind === 'givefood') renderGiveFoodInline(target, inlineView);
    else if (inlineView.kind === 'comfort') renderComfortInline(target, inlineView);
    else if (inlineView.kind === 'inv') renderInvInline(target, inlineView);
    else if (inlineView.kind === 'character') renderCharacterInline(target, inlineView);
    else if (inlineView.kind === 'loot') renderLootInline(target, inlineView);
    else target.innerHTML = '';
  }

  function inlineHead(title) {
    return `<div class="inline-head"><b>${title}</b><button class="sheet-x" data-x aria-label="Close">\u2715</button></div>`;
  }

  function wireInlineX(slot) {
    const x = slot.querySelector('[data-x]');
    if (x) x.onclick = () => { inlineView = null; refresh(); };
  }

  function personCardHTML(view) {
    const villagerId = view.vid;
    const vp = (Game.data.villagers || []).find(v => v.id === villagerId) ||
               (Game.data.background_survivors || []).find(v => v.id === villagerId);
    if (!vp) { slot.innerHTML = ''; inlineView = null; return; }
    const sys = !!Game.state.systemArrived;
    const known = sys || Game.nameKnown(villagerId);
    const titleName = known ? vp.name : Game.personDescriptor(villagerId);
    // VILLAGER PORTRAIT (Steve 2026-10-06): generated FROM the person.
    const _portrait = villagerSpriteHtml(vp);
    const trust = (Game.state.village.trust && Game.state.village.trust[villagerId]) || 10;
    const health = (Game.state.village.health && Game.state.village.health[villagerId] !== undefined)
      ? Game.state.village.health[villagerId] : 100;
    const comm = Game.commLevel(villagerId);
    let infoHtml;
    if (sys) {
      const tone = trust < 30 ? 'Guarded.' : trust < 60 ? 'Warming up.' : 'Trusts you.';
      const hb = health >= 70 ? '\uD83D\uDFE2' : health >= 40 ? '\uD83D\uDFE1' : '\uD83D\uDD34';
      infoHtml = `<p class="small">${esc(vp.formerOccupation || '')}${vp.homeRegion ? ' · ' + esc(vp.homeRegion) : ''}</p>
        <p class="small">${hb} Health ${health}/100 · ${tone}</p>
        <p class="small" style="opacity:.7">🗣 ${esc(Game.langLabel(Game.npcLangs(villagerId)))}</p>
        ${(() => { const w = Game.goalWant(villagerId); return w ? `<p class="small" style="opacity:.7">🎯 Wants ${esc(w)}.</p>` : ''; })()}
        <p class="small" style="opacity:.7">👁 Sees you as: ${esc(Game.repWords(villagerId))}.</p>
        ${(() => { const pers = vp.personality || {}; const bits = [];
          const qk = Game.npcQuirk(villagerId) || pers.quirk;
          if (qk) bits.push(qk.charAt(0).toUpperCase() + qk.slice(1));
          if (pers.hope) bits.push('Hopes ' + pers.hope);
          return bits.length ? `<p class="small" style="opacity:.7">💭 ${esc(bits.join('. '))}.</p>` : ''; })()}
        ${(() => { try {
          const kl = Game.npcKeepsakeLine ? Game.npcKeepsakeLine(villagerId) : '';
          if (!kl) return '';
          const readLvl = ((Game.state.codex.skills || {}).read_people || {}).level || 0;
          const t = (Game.state.village.trust && Game.state.village.trust[villagerId]) || 0;
          // visible to the observant: high read, or they trust you enough to let it show
          return (readLvl >= 2 || t >= 50 || Game.state.systemArrived) ? `<p class="small" style="opacity:.7">${esc(kl)}</p>` : '';
        } catch (e) { return ''; } })()}`;
    } else {
      // PRE-SYSTEM: observed info only. No names unless earned, no health
      // bars, no stats. You're just a person meeting strangers.
      const commNote = comm.level === 'none' ? 'You share no words.'
        : comm.level === 'partial' ? 'A few shared words. Gestures. Patience.' : 'You can talk.';
      const rough = health < 40 ? " They look rough — hurt or sick, you can't tell which." : '';
      infoHtml = `<p class="small">${esc(Game.personActivityLine(villagerId))}${rough}</p>
        <p class="small" style="opacity:.7">${esc(commNote)}${known ? '' : " You don't know their name yet."}</p>`;
    }
    const conf = vp.conflictNote ? `<p class="small" style="opacity:.7">${esc(vp.conflictNote)}</p>` : '';
    const said = view.line || '';
    // CONVERSATION: Steve 2026-10-04 — ONE surface. The full-screen chat is the
    // conversation; the person panel no longer renders an inline transcript or
    // inline choice buttons (redundant second chat). The Talk / Talk-again
    // button below is the single entry point.
    const convo = Game.convoUI ? Game.convoUI(villagerId) : { active: false, transcript: [], choices: [] };
    const convoHtml = '';
    const talkLabel = convo.active ? null : (convo.transcript && convo.transcript.length ? '\uD83D\uDCAC Talk again' : '\uD83D\uDCAC Talk');
    const youKnow = Object.keys(Game.state.codex.plants || {});
    const theyKnow = (Game.state.village.taught && Game.state.village.taught[villagerId]) || [];
    const teachable = youKnow.filter(pid => !theyKnow.includes(pid));

    let btns = `${talkLabel ? `<button class="btn sm" data-act="talk">${talkLabel}</button>\n      ` : ''}<button class="btn sm ghost" data-act="give"${Game.edibleCount() ? '' : ' disabled'}>\uD83C\uDF81 Give food${Game.edibleCount() ? '' : ' (none)'}</button>
      <button class="btn sm ghost" data-act="ask">\uD83D\uDDE3\uFE0F Ask for help</button>`;
    if (comm.level === 'none') {
      if (view.nvMode === 'gesture') {
        const intents = [['friendly', '\uD83D\uDC4B Wave hello'], ['food', '\uD83C\uDF56 Mime eating'],
          ['follow', '\u27A1\uFE0F Beckon: follow me'], ['danger', '\u26A0\uFE0F Warn: danger'], ['count', '\uD83D\uDD22 Hold up fingers']];
        btns = intents.map(([intent, label]) => `<button class="btn sm" data-act="g:${intent}">${label}</button>`).join('') +
          `<button class="btn sm ghost" data-act="back">\u2190 Back</button>`;
      } else if (view.nvMode === 'draw') {
        const concepts = [['food', '\uD83C\uDF56 Food'], ['water', '\uD83D\uDCA7 Water'], ['danger', '\u26A0\uFE0F Danger'], ['shelter', '\uD83C\uDFE0 Shelter']];
        btns = concepts.map(([concept, label]) => `<button class="btn sm" data-act="d:${concept}">${label}</button>`).join('') +
          `<button class="btn sm ghost" data-act="back">\u2190 Back</button>`;
      } else {
        btns += `<button class="btn sm ghost" data-act="read">\uD83D\uDC41 Read them</button>
          <button class="btn sm ghost" data-act="gesture">\uD83D\uDC4B Gesture \u25B8</button>
          <button class="btn sm ghost" data-act="draw">\u2710\uFE0F Draw \u25B8</button>`;
      }
    }
    // TEACH and TRADE KNOWLEDGE are conversation paths now, not buttons.
    // Steve's rule: social mechanics are discovered through talking.
    // "You know things. I know things. Shall we trade?" — in dialogue.
    // === CONTEXTUAL SOCIAL ACTIONS ===
    // Not perpetual buttons -- opportunities that appear when relevant.
    // Every deep system gets a player-facing verb.
    try {
      if (comm.level !== 'none' && !(Game.state.village.challenge || {}).cid) {
        btns += ' <button class="btn sm ghost" data-act="askabout">\u2753 Ask about\u2026</button>';
      }
    } catch (e) {}
    try {
      const _mood = Game.npcMood(villagerId);
      if ((_mood === 'scared' || _mood === 'grieving') && !(Game.state.village.challenge || {}).cid) {
        btns += ' <button class="btn sm ghost" data-act="comfort">🤗 Comfort</button>';
      }
    } catch (e) {}
    try {
      if (Game.worstRepAxis(villagerId) && !(Game.state.village.challenge || {}).cid) {
        btns += ' <button class="btn sm ghost" data-act="amends">🙏 Make amends</button>';
      }
    } catch (e) {}
    try {
      const _conf = (Game.state.village.conflicts || []).find(x => !x.resolved && x.known && (x.a === villagerId || x.b === villagerId));
      if (_conf && !(Game.state.village.challenge || {}).cid) {
        btns += ' <button class="btn sm ghost" data-act="mediate">🕊 Mediate</button>';
      }
    } catch (e) {}
    try {
      const _v = Game.state.village;
      const _heatIds = Object.keys(_v.heat || {}).filter(id => (_v.heat[id] || 0) > 0);
      if ((_v.challenge || _heatIds.length) && !(Game.state.village.challenge || {}).cid) {
        btns += ' <button class="btn sm ghost" data-act="support">🤝 Ask for support</button>';
        btns += ' <button class="btn sm ghost" data-act="rally">📢 Rally the village</button>';
      }
    } catch (e) {}
    // PROMISES are made in conversation now ("I could help with that."),
    // not via button. Discovered through talking about what they want.
    try {
      const _heard = (Game.state.village.gossip || []).filter(g => (g.heard || []).includes(villagerId));
      const _neg = _heard.find(g => Object.entries(g.dims || {}).some(([k, val]) => val < -3));
      if (_neg && !(Game.state.village.challenge || {}).cid) {
        btns += ' <button class="btn sm ghost" data-act="confront">\u26A1 Confront</button>';
      }
    } catch (e) {}
    // LEADERSHIP CHALLENGE: they're confronting you about who's in charge.
    // This conversation is about one thing. Yield a domain or hold your ground.
    // === VILLAGE JUSTICE: they're confronting you about what you've done.
    // Answer here — pay restitution, or refuse and face the vote.
    try {
      if (Game.justicePendingConfront && Game.justicePendingConfront(villagerId)) {
        const owed = Game.justiceRestitutionOwed ? Game.justiceRestitutionOwed() : 0;
        btns += ` <button class="btn sm" data-act="justicePay" style="border-color:#e0a55c">💰 Pay restitution (~${owed > 1000 ? Math.round(owed / 1000) + 'k' : owed} kcal food)</button>`;
        btns += ` <button class="btn sm ghost" data-act="justiceRefuse">✖ Refuse</button>`;
      }
    } catch (e) {}
    // === PARTY ===
    // Formal parties are a System unlock. Pre-System, followers are informal.
    try { btns += Game.partyButtonHtml(villagerId); } catch (e) {}
    // === STEAL: rifle their pack. Deliberate, but the drama is detection.
    // === INTIMIDATE: "your food, now." Two-tap — a threat is a choice.
    try {
      if (Game.state.village.roster && Game.state.village.roster.includes(villagerId) && villagerId !== Game.villagerId) {
        btns += ` <button class="btn sm ghost" data-act="stealFrom" style="opacity:.55">🤏 Lift rations</button>`;
        if (view.confirmIntimidate === villagerId) {
          btns += ` <button class="btn sm" data-act="intimidateConfirm" style="border-color:#e0a55c;color:#e0a55c">👊 Threaten ${esc(titleName)}? Tap again — they'll remember this.</button>`;
        } else {
          btns += ` <button class="btn sm ghost" data-act="intimidateAsk" style="opacity:.55">👊 Intimidate</button>`;
        }
      }
    } catch (e) {}
    // === ATTACK: deliberate, two-tap. Violence against people is always a choice.
    // Not an accident, not a misclick. You tap once, it asks. You tap again, it's done.
    if (view.confirmAttack === villagerId) {
      btns += ` <button class="btn sm" data-act="attackConfirm" style="border-color:#e05c5c;color:#e05c5c">⚔ Attack ${esc(titleName)}? Tap again — this can't be undone.</button>`;
    } else {
      btns += ` <button class="btn sm ghost" data-act="attackAsk" style="opacity:.55">⚔ Attack</button>`;
    }
    const chal = (Game.state.village.challenge || {});
    let challengeHtml = '';
    if (chal.cid === villagerId) {
      const taskName = (Game.delegateTasks()[chal.task] || {}).name || chal.task || 'work';
      challengeHtml = `<div class="card" style="border-left:3px solid #e05c5c;margin:8px 0">
        <p class="small"><b>⚠ ${esc(titleName)} is challenging your lead.</b><br>
        "Let ME run the ${esc(taskName)}. People listen to me. You know they do."</p></div>`;
      btns = `<button class="btn sm" data-act="yield">Let them lead ${esc(taskName)}</button>
        <button class="btn sm ghost" data-act="stand">Hold your ground</button>`;
    }

    return `<div class="inlinecard">
      ${inlineHead((_portrait ? '<span class="vportrait">' + _portrait + '</span> ' : '') + '\uD83D\uDC64 ' + esc(titleName))}
      ${view.result ? `<p class="inline-result">✓ ${esc(view.result)}</p>` : ''}
      ${challengeHtml}
      <div class="inline-body">
        <details class="person-details"><summary class="small" style="cursor:pointer;opacity:.7">about them</summary>${infoHtml}${conf}</details>
        ${convoHtml || (said ? `<p style="font-size:16px;line-height:1.6;margin-top:10px">\u201C${esc(said)}\u201D</p>` : '')}
      </div>
      <div class="inline-btns">${btns}</div>
    </div>`;
  }
  function renderPersonInline(slot, view) {
    slot.innerHTML = personCardHTML(view);
    wireInlineX(slot);
    slot.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => personAct(view, b.dataset.act); });
  }

  // HESITATION: people don't respond instantly. armThinking computes the
  // turn immediately (game state advances now) but holds the new transcript
  // entries back for a personality-shaped beat — a "..." while they think.
  // The response lands after the pause, like a real person considering.
  function armThinking(view, vid, hiddenFrom, choiceId, isOpening) {
    const tok = (view.thinkingToken = (view.thinkingToken || 0) + 1);
    const ms = Game.convoHesitationMs ? Game.convoHesitationMs(vid, choiceId, isOpening) : 450;
    view.thinking = { vid, hiddenFrom, token: tok };
    refresh();
    setTimeout(() => {
      if (inlineView && inlineView.kind === 'person' && inlineView.vid === vid && inlineView.thinkingToken === tok) {
        inlineView.thinking = null;
        refresh();
      }
    }, ms);
  }

  // ============ CHAT VIEW ============
  // Conversation is the ONE acceptable interruption (Steve). Tapping Talk
  // opens a full-screen chat: messages stacked, speaker names, hesitation
  // beats preserved, room for narrative. No scrolling to follow the dialogue.
  // When the conversation ends, the normal one-screen view returns.
  function openChat(vid) {
    inlineView = null;
    chatView = { vid: vid, thinking: null, thinkingToken: 0, msgIndex: 0 };
    Game.startConvo(vid);
    // startConvo resets the transcript — the opening lands after a beat.
    armChatThinking(vid, 0, null, true);
    refresh();
  }

  // openChatKeep: open the chat UI on a conversation a debug scenario
  // already set up (thread, transcript) — WITHOUT startConvo's reset.
  // The ambush scenario springs its plot onto an opened conversation; the
  // panel then drops the player straight into the RUN/TALK/FIGHT beat.
  function openChatKeep(vid) {
    inlineView = null;
    chatView = { vid: vid, thinking: null, thinkingToken: 0, msgIndex: 0 };
    try { Game.convoGet(vid).active = true; } catch (e) {}
    armChatThinking(vid, 0, null, true);
    refresh();
  }

  function closeChat(sayGoodbye) {
    if (!chatView) return;
    const vid = chatView.vid;
    chatView = null;
    if (sayGoodbye !== false) { try { Game.endConvo(vid, 'left'); } catch (e) {} }
    refresh();
  }

  // Chat hesitation: same personality-shaped beat as inline, held on chatView.
  function armChatThinking(vid, hiddenFrom, choiceId, isOpening) {
    if (!chatView || chatView.vid !== vid) return;
    const tok = (chatView.thinkingToken = (chatView.thinkingToken || 0) + 1);
    const ms = Game.convoHesitationMs ? Game.convoHesitationMs(vid, choiceId, isOpening) : 450;
    chatView.thinking = { hiddenFrom: hiddenFrom, token: tok };
    refresh();
    setTimeout(() => {
      if (chatView && chatView.vid === vid && chatView.thinkingToken === tok) {
        chatView.thinking = null;
        refresh();
      }
    }, ms);
  }

  function chatChoice(vid, cid) {
    if (!chatView || chatView.vid !== vid) return;
    if (cid === 'leave') { closeChat(true); return; }
    const ui = Game.convoUI ? Game.convoUI(vid) : null;
    // DESYNC FIX (Steve 2026-10-05): convoTurn appends AND the transcript can
    // shift old entries off, so "length before" is not a stable index. Anchor
    // on the last entry's object identity instead — the first entry after it
    // is the first new beat, no matter what shifted.
    const t0 = (ui && ui.transcript) || [];
    const lastBefore = t0.length ? t0[t0.length - 1] : null;
    const st = Game.convoTurn(vid, cid);
    if (!st || st.ended) { chatView = null; refresh(); return; }
    // Pokémon-style: jump to the first new message — the reply paces beat by
    // beat under ▼, never dumps/skips.
    const t1 = (Game.convoUI ? Game.convoUI(vid) : null) || {};
    const t = t1.transcript || [];
    let idx = 0;
    if (lastBefore) {
      const li = t.lastIndexOf(lastBefore);
      idx = li >= 0 ? li + 1 : 0;
      // ONE-BEAT TURNS (Steve 2026-10-05): your own line lives in the
      // history, not paginated back at you — land on their reply.
      while (idx < t.length && t[idx].who === 'you') idx++;
      idx = Math.min(idx, Math.max(0, t.length - 1));
    }
    chatView.msgIndex = idx;
    chatView.history = false;
    armChatThinking(vid, idx, cid, false);
    refresh();
  }

  // DIALOGUE BOX (Steve 2026-10-05): Pokémon-style — the map stays visible and
  // tappable; the box sits under the grid. Speaker tab (name, descriptor-gated
  // until you know them), ONE message at a time, ▼ to continue, choices land
  // in the box when it's your turn to pick. No screen takeover, no scrolling.
  function dialogueBoxHTML(cv) {
    const vid = cv.vid;
    const convo = Game.convoUI ? Game.convoUI(vid) : null;
    if (!convo || !convo.active) return '';
    const sys = !!Game.state.systemArrived;
    const known = sys || Game.nameKnown(vid);
    const vp = (Game.data.villagers || []).find(v => v.id === vid) ||
               (Game.data.background_survivors || []).find(v => v.id === vid) || {};
    const titleName = known ? (vp.name || 'Someone') : Game.personDescriptor(vid);
    const transcript = convo.transcript || [];
    const thinking = !!(cv.thinking);
    // msgIndex: Pokémon-style, one message at a time. Clamp to the transcript.
    let mi = cv.msgIndex || 0;
    if (mi >= transcript.length) mi = Math.max(0, transcript.length - 1);
    const atEnd = mi >= transcript.length - 1 || transcript.length === 0;
    const choices = (atEnd && !thinking) ? (convo.choices || []) : [];
    let body;
    if (thinking) {
      body = `<div class="dlg-line"><span class="thinking-dots" aria-label="thinking"><span>.</span><span>.</span><span>.</span></span></div>`;
    } else if (!transcript.length) {
      body = `<div class="dlg-line">…</div>`;
    } else {
      const e = transcript[mi];
      const clean = Game.cleanDialogue ? Game.cleanDialogue(e.text) : String(e.text || '');
      const isSpeech = /^\s*"/.test(clean);
      const who = e.who === 'you' ? 'You' : titleName;
      const ftag = e.foreign
        ? ` <span class="flang">${esc(Game.langDef(e.foreign).icon)} ${esc(Game.langDef(e.foreign).name)}</span>` : '';
      body = isSpeech
        ? `<div class="dlg-line"><span class="dlg-who">${esc(who)}:</span> <span class="sp">${esc(clean)}</span>${ftag}</div>`
        : `<div class="dlg-line narr"><span class="narr">${esc(clean)}</span></div>`;
    }
    const more = !thinking && !atEnd;
    const choiceBtns = choices.map(cn => {
      const cleanLabel = Game.cleanDialogue ? Game.cleanDialogue(cn.label) : cn.label;
      return `<button class="btn sm dlg-choice${cn.id === 'leave' ? ' ghost' : ''}" data-cid="${esc(cn.id)}"${thinking ? ' disabled' : ''}>${esc(cleanLabel)}</button>`;
    }).join('');
    // HISTORY (Steve 2026-10-05): tap the speaker tab to see the whole
    // conversation. One message at a time is the default (one screen, no
    // scroll); history is one tap away and scrolls inside the box.
    let histBody = '';
    if (cv.history && transcript.length) {
      const renderEntry = (e) => {
        const clean = Game.cleanDialogue ? Game.cleanDialogue(e.text) : String(e.text || '');
        const isSpeech = /^\s*"/.test(clean);
        const who = e.who === 'you' ? 'You' : titleName;
        const ftag = e.foreign
          ? ` <span class="flang">${esc(Game.langDef(e.foreign).icon)} ${esc(Game.langDef(e.foreign).name)}</span>` : '';
        return isSpeech
          ? `<div class="dlg-line"><span class="dlg-who">${esc(who)}:</span> <span class="sp">${esc(clean)}</span>${ftag}</div>`
          : `<div class="dlg-line narr"><span class="narr">${esc(clean)}</span></div>`;
      };
      histBody = `<div class="dlg-history">${transcript.map(renderEntry).join('')}</div>`;
    }
    const showBody = cv.history && histBody ? histBody : body;
    return `<div class="dialogue-box">
      <div class="dlg-speaker"><button class="dlg-hist" id="dlg-hist" aria-label="conversation history" title="See full conversation">💬 ${esc(titleName)} ${cv.history ? '▾' : '▸'}</button><button class="dlg-x" id="dlg-end" aria-label="end conversation">✕</button></div>
      ${showBody}
      ${!cv.history && choiceBtns ? `<div class="dlg-choices">${choiceBtns}</div>` : ''}
      ${!cv.history && more ? `<button class="dlg-next" id="dlg-next" aria-label="continue">▼</button>` : ''}
    </div>`;
  }

  // NARRATION (Steve 2026-10-05): ONE box, ONE format, Pokémon-style.
  // Dialogue, combat, exploration — all narration renders here, identically.
  // No separate combat narr, no feedback card, no bottom log. One surface.
  // Contest box: current phase text + choice buttons. One surface,
  // no scrolling for the current beat (same discipline as dialogue).
  function contestBoxHTML(ac) {
    const phases = ac.phases || [];
    const phase = phases[ac.phaseIdx || 0];
    if (!phase) return '';
    const text = String(phase.text || '').split('\n').map(l => `<p class="small" style="margin:6px 0">${esc(l) || '&nbsp;'}</p>`).join('');
    const btns = (phase.choices || []).map((c, i) =>
      `<button class="btn sm" data-contest-choice="${i}">${esc(c.label)}${c.sub ? ` <span class="small" style="opacity:.65">· ${esc(c.sub)}</span>` : ''}</button>`
    ).join('');
    const tag = ac.participant === 'player' ? '📺 CONTEST — YOU' : '📺 CONTEST — WATCHING';
    return `<div class="dialogue-box contest-box"><div class="dlg-head">${tag}</div><div class="dlg-line">${text}</div><div class="inline-btns">${btns}</div></div>`;
  }

  function narrationBoxHTML(st, chatView) {
    // CONTEST (Steve 2026-10-05): active contests are modal — they take over
    // the narration surface until resolved. Unavoidable means unavoidable.
    try {
      const ac = Game.state && Game.state.activeContest;
      // ARENA (Steve 2026-10-08): a suspended contest yielded the narration
      // surface to the tactical fight — the grid is the arena now.
      if (ac && ac.phases && ac.phase !== 'done' && !ac.arenaSuspended) {
        const html = contestBoxHTML(ac);
        if (html) return html;
      }
    } catch (e) {}
    // PERSON CARD (Steve 2026-10-05): tapping a person shows their card HERE,
    // in the narration/chat area — not below the grid. One interaction surface.
    if (inlineView && inlineView.kind === 'person') {
      return personCardHTML(inlineView);
    }
    // Dialogue takes precedence (already Pokémon-style)
    if (chatView) return dialogueBoxHTML(chatView);
    // Otherwise: latest narration line, if any
    // TOAST SYSTEM (Steve 2026-10-06): ambient events appear top-screen, auto-fade.
    // Cohesive with speech bubbles (villager chatter) and narration box (big beats).
    if (!window._toastInit) {
      window._toastInit = true;
      window.showToast = function(msg, important) {
        try {
          const layer = document.getElementById('toast-layer');
          if (!layer) return;
          // Max 3 toasts; oldest fades out
          while (layer.children.length >= 3) layer.removeChild(layer.firstChild);
          const el = document.createElement('div');
          el.className = 'toast' + (important ? ' important' : '');
          el.textContent = msg;
          layer.appendChild(el);
          setTimeout(() => el.classList.add('fading'), important ? 5000 : 3500);
          setTimeout(() => { try { layer.removeChild(el); } catch (e) {} }, important ? 5600 : 4100);
        } catch (e) {}
      };
      // Speech bubble above a grid cell (cx, cy are 0-8 detail coords)
      window.showSpeechBubble = function(cx, cy, who, text) {
        try {
          const grid = document.querySelector('.detail-grid');
          if (!grid) return;
          const cell = grid.querySelector(`[data-cx="${cx}"][data-cy="${cy}"]`);
          if (!cell) return;
          // Remove old bubble on this cell
          const old = cell.querySelector('.speech-bubble');
          if (old) old.remove();
          const b = document.createElement('div');
          b.className = 'speech-bubble';
          b.innerHTML = `<span class="who">${esc(who)}</span>${esc(text)}`;
          b.onclick = () => b.remove();
          cell.appendChild(b);
          setTimeout(() => b.classList.add('fading'), 4500);
          setTimeout(() => { try { b.remove(); } catch (e) {} }, 5000);
        } catch (e) {}
      };
      // Game.toast: ambient narration goes to toast, not the log
      if (typeof Game !== 'undefined' && Game) {
        Game.toast = function(msg, important) {
          if (window.showToast) window.showToast(msg, important);
          // Also log it (history), but don't show in narration box
          try { this.log.push(String(msg)); if (this.log.length > 40) this.log.shift(); } catch (e) {}
        };
      }
    }
    const lastNarr = (Game.log && Game.log.length) ? Game.log[Game.log.length - 1] : '';
    const fb = feedbackInner();
    const text = fb || lastNarr;
    if (!text) return '';
    // Strip HTML, show as plain narration (</p> boundaries become spaces
    // so adjacent feedback lines don't glue: "slams through!A woman..." fix
    const clean = String(text).replace(/<\/p>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return `<div class="dialogue-box narr-box"><div class="dlg-line narr"><span class="narr">${esc(clean)}</span></div></div>`;
  }

  function wireDialogueBox() {
    const nx = document.getElementById('dlg-next');
    if (nx) nx.onclick = () => chatAdvance();
    const hist = document.getElementById('dlg-hist');
    if (hist) hist.onclick = (e) => {
      e.stopPropagation();
      if (!chatView) return;
      chatView.history = !chatView.history;
      refresh();
    };
    const box = document.querySelector('.dialogue-box');
    if (box && !nx) {
      // Tapping the box itself also advances (Pokémon muscle memory) — but
      // never when choices are showing, the ✕ was tapped, or history toggle.
      box.onclick = (e) => {
        if (e.target.closest('[data-cid]') || e.target.closest('#dlg-end') || e.target.closest('#dlg-hist')) return;
        chatAdvance();
      };
    }
    const end = document.getElementById('dlg-end');
    if (end) end.onclick = (e) => { e.stopPropagation(); closeChat(true); };
    document.querySelectorAll('.dialogue-box [data-cid]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); chatChoice(chatView.vid, b.dataset.cid); };
    });
  }

  // Pokémon advance: one message at a time. When the transcript runs out and
  // the engine has choices, they render — the box never goes blank mid-talk.
  function chatAdvance() {
    if (!chatView || chatView.thinking) return;
    const convo = Game.convoUI ? Game.convoUI(chatView.vid) : null;
    if (!convo || !convo.active) { chatView = null; refresh(); return; }
    const n = (convo.transcript || []).length;
    chatView.msgIndex = Math.min((chatView.msgIndex || 0) + 1, Math.max(0, n - 1));
    refresh();
  }

  // personAct: every action confirms visibly. The result line ("✓ ...") plus
  // updated numbers — no wondering whether the tap worked.
  function personAct(view, act) {
    const vid = view.vid;
    const vp = (Game.data.villagers || []).find(v => v.id === vid) ||
               (Game.data.background_survivors || []).find(v => v.id === vid) || {};
    const dname = Game.displayName(vid);
    if (act === 'talk') {
      // Talk opens the full-screen chat — the one acceptable interruption.
      openChat(vid);
      return;
    }
    else if (act.indexOf('c:') === 0) {
      const cid = act.slice(2);
      const before = (Game.convoUI && Game.convoUI(vid).transcript ? Game.convoUI(vid).transcript.length : 0);
      const st = Game.convoTurn(vid, cid); if (st) view.line = st.line; view.result = null;
      armThinking(view, vid, before, cid, false);
      return;
    }
    else if (act === 'give') {
      inlineView = { kind: 'givefood', vid, line: view.line, result: null, mapKey: inlineMapKey() };
    }
    else if (act === 'ask') { inlineView = { kind: 'assign', vid, line: view.line, result: null, via: 'in-person', mapKey: inlineMapKey() }; }
    else if (act === 'read') { Game.nonverbalRead(vid); view.result = 'You study them.'; }
    else if (act === 'gesture') { view.nvMode = 'gesture'; }
    else if (act === 'draw') { view.nvMode = 'draw'; }
    else if (act === 'back') { view.nvMode = null; }
    else if (act === 'yield') {
      const r = Game.yieldChallenge(vid);
      view.result = r ? r.result : null;
    }
    else if (act === 'stand') {
      const r = Game.standGround(vid);
      view.result = r ? r.result : null;
    }
    else if (act.startsWith('g:')) { Game.nonverbalGesture(vid, act.slice(2)); view.nvMode = null; view.result = 'You tried gestures.'; }
    else if (act.startsWith('d:')) { Game.nonverbalDraw(vid, act.slice(2)); view.nvMode = null; view.result = 'You drew in the dirt.'; }
    // TEACH, TRADE, PROMISE, INVITE moved to conversation choices (conversation.js).
    // Social mechanics are discovered through talking, not buttons.
    else if (act === 'askabout') {
      inlineView = { kind: 'askabout', vid, line: view.line, result: null, mapKey: inlineMapKey() };
    }
    else if (act === 'comfort') {
      inlineView = { kind: 'comfort', vid, line: view.line, result: null, mapKey: inlineMapKey() };
    }
    else if (act === 'amends') {
      const r = Game.makeAmends(vid);
      view.result = r ? `You owned it (${r.axis}).` : null;
    }
    else if (act === 'mediate') {
      const r = Game.mediateConflict(vid);
      view.result = r ? 'You tried to mediate.' : null;
    }
    else if (act === 'support') {
      const r = Game.askSupport(vid);
      view.result = r ? 'They stand with you.' : null;
    }
    else if (act === 'rally') {
      const r = Game.rallyVillage();
      view.result = r ? 'You addressed the village.' : null;
    }
    else if (act === 'confront') {
      const r = Game.confrontGossip(vid);
      view.result = r ? 'You confronted them.' : null;
    }
    else if (act === 'justicePay') {
      const r = Game.justiceRespond('pay');
      view.result = r ? (r.enough ? 'You paid restitution. It\'s over — for now.' : 'Not enough. They didn\'t accept it.') : null;
    }
    else if (act === 'justiceRefuse') {
      Game.justiceRespond('refuse');
      view.result = 'You refused. The village will decide without you.';
    }
    else if (act === 'dismissParty') {
      const r = Game.dismissFromParty(vid);
      view.result = r ? r.msg : null;
    }
    else if (act === 'stealFrom') {
      const r = Game.stealFrom(vid);
      view.result = r === 'caught' ? 'Caught. Hands in the pack. No deniability.'
        : r === 'unseen' ? 'Nobody saw. Yet.' : null;
    }
    else if (act === 'intimidateAsk') {
      view.confirmIntimidate = vid;
    }
    else if (act === 'intimidateConfirm') {
      view.confirmIntimidate = null;
      const r = Game.intimidate(vid);
      view.result = r ? `They ${r}. The village will hear about this.` : null;
    }
    else if (act === 'attackAsk') {
      // First tap: arm the choice. Deliberate, not accidental.
      view.confirmAttack = vid;
    }
    else if (act === 'attackConfirm') {
      // Second tap: it's done. There is no third tap.
      view.confirmAttack = null;
      Game.playerAttacks(vid);
      view.result = null; // playerAttacks says its own terrible things
    }
    else if (act === 'attackPerson') {
      // legacy path — route through confirm
      view.confirmAttack = vid;
    }
    refresh();
  }

  // LEADER: ask for help. This lives in the talk flow — you're TALKING to them,
  // asking them to do something. Not a management UI. A conversation.
  // Remote assignment (shout, runner, System ping) unlocks via abilities.
  // ASK ABOUT: the conversation verb for content paths. Topics unlock systems:
  // their goal (learn what they want), gossip (what have you heard?),
  // the village (how's everyone doing?). Contextual, not a menu dump.
  function renderAskAboutInline(slot, view) {
    const villagerId = view.vid;
    const vp = (Game.data.villagers || []).find(v => v.id === villagerId) ||
               (Game.data.background_survivors || []).find(v => v.id === villagerId);
    if (!vp) { slot.innerHTML = ''; inlineView = null; return; }
    const dname = Game.displayName(villagerId);
    const goalKnown = Game.goalKnown(villagerId);
    const namingActive = Game.monsterNamingActive ? Game.monsterNamingActive() : false;
    const tellActive = Game.monsterTellActive ? Game.monsterTellActive() : false;
    const topics = [
      ['goal', '\u{1F3AF} "What do you want?"', goalKnown ? ' (you know: ' + (Game.goalWant(villagerId) || '?') + ')' : ''],
      ['gossip', '\u{1F442} "Heard anything?"', ''],
      ['village', '\u{1F3D5}\uFE0F "How\u2019s everyone?"', ''],
    ];
    if (tellActive) topics.push(['tellbeast', '\u{1F441}\uFE0F "You saw something out there..."', '']);
    if (namingActive) topics.push(['namebeast', '\u{1F4A1} "What are we calling that thing?"', '']);
    const btns = topics.map(([tid, label, extra]) =>
      `<button class="btn sm ghost" data-topic="${tid}">${label}${extra}</button>`).join('') +
      ` <button class="btn sm ghost" data-act="back">\u2190 Back</button>`;
    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\u2753 Ask ' + esc(dname) + ' about\u2026')}
      ${view.result ? `<p class="inline-result">\u2713 ${esc(view.result)}</p>` : ''}
      <div class="inline-body"><p class="small" style="opacity:.7">What do you want to know?</p></div>
      <div class="inline-btns">${btns}</div>
    </div>`;
    wireInlineX(slot);
    slot.querySelector('[data-act="back"]').onclick = () => {
      inlineView = { kind: 'person', vid: villagerId, line: view.line, result: null, nvMode: null, mapKey: inlineMapKey() };
      refresh();
    };
    slot.querySelectorAll('[data-topic]').forEach(b => {
      b.onclick = () => {
        const r = Game.askAbout(villagerId, b.dataset.topic);
        const labels = { goal: 'what they want', gossip: 'what they\u2019ve heard', village: 'how everyone\u2019s doing', namebeast: 'what to call the beast', tellbeast: 'what you saw out there' };
        view.result = r ? `You asked about ${labels[b.dataset.topic] || 'it'}.` : null;
        view.naming = r && r.naming ? r.naming : null;
        refresh();
      };
    });
    // NAMING: back a name for the beast. Your vote counts double.
    if (view.naming) {
      const nz = document.createElement('div');
      nz.className = 'inline-btns';
      nz.innerHTML = `<p class="small" style="opacity:.7">Back a name for ${esc(view.naming.descriptor)}:</p>` +
        view.naming.options.map(n => `<button class="btn sm ghost" data-name="${esc(n)}">"${esc(n)}"</button>`).join('');
      slot.querySelector('.inline-body').appendChild(nz);
      nz.querySelectorAll('[data-name]').forEach(b => {
        b.onclick = () => {
          Game.backMonsterName(view.naming.mid, b.dataset.name);
          view.naming = null; view.result = `You backed "${b.dataset.name}."`;
          refresh();
        };
      });
    }
  }

  // GIVE FOOD — a decision, not a button. How much? The world (witnesses)
  // decides public/private. Each amount has real tradeoffs.
  function renderGiveFoodInline(slot, view) {
    const villagerId = view.vid;
    const vp = (Game.data.villagers || []).find(v => v.id === villagerId) ||
               (Game.data.background_survivors || []).find(v => v.id === villagerId);
    if (!vp) { slot.innerHTML = ''; inlineView = null; return; }
    const dname = Game.displayName(villagerId);
    const opts = Game.giveFoodOptions ? Game.giveFoodOptions() : [];
    const n = Game.npcNeeds(villagerId);
    const hunger = (n && n.hunger) || 0;
    const hungerNote = hunger > 70 ? ' They look hungry — really hungry.'
      : hunger > 40 ? ' They could eat.' : ' They seem okay for now.';
    let witNote = '';
    try {
      const wit = (Game.witnesses(3) || []).filter(id => id !== villagerId && id !== Game.villagerId);
      witNote = wit.length
        ? `<p class="small" style="opacity:.7">Others are watching. This will be seen — generosity, and the expectation it creates.</p>`
        : `<p class="small" style="opacity:.7">No one else is here. Just you and ${esc(dname)}. A private gift cuts deeper.</p>`;
    } catch (e) {}
    const btns = opts.map(o =>
      `<button class="btn sm" data-amount="${o.id}">${esc(o.label)}<br><span class="small" style="opacity:.65">${esc(o.desc)}</span></button>`
    ).join('') + ` <button class="btn sm ghost" data-act="back">\u2190 Back</button>`;
    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\uD83C\uDF81 Give food to ' + esc(dname))}
      ${view.result ? `<p class="inline-result">\u2713 ${esc(view.result)}</p>` : ''}
      <div class="inline-body"><p class="small" style="opacity:.7">How much?${esc(hungerNote)}</p>${witNote}</div>
      <div class="inline-btns">${btns || '<p class="small">You have no food to give.</p>'}</div>
    </div>`;
    wireInlineX(slot);
    const back = slot.querySelector('[data-act="back"]');
    if (back) back.onclick = () => {
      inlineView = { kind: 'person', vid: villagerId, line: view.line, result: null, nvMode: null, mapKey: inlineMapKey() };
      refresh();
    };
    slot.querySelectorAll('[data-amount]').forEach(b => {
      b.onclick = () => {
        const r = Game.giveFood(villagerId, b.dataset.amount);
        if (r && r.ok) {
          inlineView = { kind: 'person', vid: villagerId, line: view.line, result: `You gave ${r.units} portion${r.units > 1 ? 's' : ''}${r.public ? ' — the village saw' : ', privately'}.`, nvMode: null, mapKey: inlineMapKey() };
        } else {
          view.result = 'You have no food to give.';
        }
        refresh();
      };
    });
  }

  // COMFORT — what do you SAY? Approach matters. Personality matching matters.
  function renderComfortInline(slot, view) {
    const villagerId = view.vid;
    const vp = (Game.data.villagers || []).find(v => v.id === villagerId) ||
               (Game.data.background_survivors || []).find(v => v.id === villagerId);
    if (!vp) { slot.innerHTML = ''; inlineView = null; return; }
    const dname = Game.displayName(villagerId);
    const mood = Game.npcMood(villagerId);
    const moodNote = mood === 'grieving'
      ? `${esc(dname)} is grieving. They're not scared — they're sad. Reassurance misses the point; presence doesn't.`
      : mood === 'scared'
      ? `${esc(dname)} is scared. Fear wants either a plan or a hand to hold.`
      : `${esc(dname)} is struggling.`;
    const opts = Game.comfortOptions ? Game.comfortOptions(villagerId) : [];
    const btns = opts.map(o =>
      `<button class="btn sm" data-approach="${o.id}">${esc(o.label)}<br><span class="small" style="opacity:.65">${esc(o.desc)}</span></button>`
    ).join('') + ` <button class="btn sm ghost" data-act="back">\u2190 Back</button>`;
    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\uD83E\uDD17 Comfort ' + esc(dname))}
      ${view.result ? `<p class="inline-result">\u2713 ${esc(view.result)}</p>` : ''}
      <div class="inline-body"><p class="small" style="opacity:.7">${moodNote}</p>
      <p class="small" style="opacity:.7">What do you do? There's no safe answer — only honest ones.</p></div>
      <div class="inline-btns">${btns}</div>
    </div>`;
    wireInlineX(slot);
    const back = slot.querySelector('[data-act="back"]');
    if (back) back.onclick = () => {
      inlineView = { kind: 'person', vid: villagerId, line: view.line, result: null, nvMode: null, mapKey: inlineMapKey() };
      refresh();
    };
    slot.querySelectorAll('[data-approach]').forEach(b => {
      b.onclick = () => {
        const r = Game.comfort(villagerId, b.dataset.approach);
        const labels = { silent: 'sat with them in silence', reassure: 'tried to reassure them', practical: 'gave them a plan', share: 'shared your own fear', space: 'gave them space' };
        if (r && r.ok) {
          inlineView = { kind: 'person', vid: villagerId, line: view.line, result: `You ${labels[b.dataset.approach] || 'were there'}.`, nvMode: null, mapKey: inlineMapKey() };
        } else {
          view.result = null;
        }
        refresh();
      };
    });
  }

  function renderAssignInline(slot, view) {
    const villagerId = view.vid;
    const via = view.via || 'in-person';
    const vp = (Game.data.villagers || []).find(v => v.id === villagerId) ||
               (Game.data.background_survivors || []).find(v => v.id === villagerId);
    if (!vp) { slot.innerHTML = ''; inlineView = null; return; }
    const dname = Game.displayName(villagerId);
    const trust = (Game.state.village.trust && Game.state.village.trust[villagerId]) || 10;
    const tasks = Game.delegateTasks();
    const current = Game.assignmentFor(villagerId);
    const viaLabel = via === 'in-person' ? '' : ` <span class="small" style="opacity:.6">via ${esc(via)}</span>`;
    const askPhrases = {
      forage: `Could you go forage?`, hunt: `Could you hunt for us?`, wood: `Could you gather wood?`,
      water: `Could you fetch water?`, scout: `Could you scout around?`, patrol: `Could you patrol for threats?`,
      rest: `You should rest.`,
    };
    let body = '';
    if (current && tasks[current.task]) {
      body += `<p class="small" style="opacity:.8">"I'm on it — ${tasks[current.task].icon} ${esc(tasks[current.task].name).toLowerCase()}." — out until next part.</p>`;
    } else {
      body += `<p style="font-size:15px;line-height:1.5">"What do you need?"</p>`;
      // NUMBERS DON'T LEAK (break-it social r5 2026-10-09): the person panel
      // and the people journal read trust as qualitative bands — the assign
      // panel showed the raw Trust: N/100. One convention everywhere.
      const tone = trust < 30 ? 'Guarded.' : trust < 60 ? 'Warming up.' : 'Trusts you.';
      body += `<p class="small" style="opacity:.6">${tone}</p>`;
    }
    if (trust < 20) body += `<p class="small" style="color:#e88">"I don't take orders from strangers." (Need 20+ trust.)</p>`;
    body += `<p class="small" style="opacity:.6;margin-top:8px">They'll report back at the end of this part. Dangerous work can get people hurt.</p>`;
    // NO METHOD TOGGLE. Steve's rule: bribery isn't a perpetual button — it's
    // an opportunity that appears when someone says no. You ask. If they're
    // reluctant, THEN food or an appeal to what they want becomes an option.
    // Discovered through doing, not through a menu.
    const hasFood = (() => { try {
      return !!(Game.state.scholar.inventory || []).find(i =>
        (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && !i.bonded &&
        !(Game.isSpoiled && Game.isSpoiled(i)));
    } catch (e) { return false; } })();
    const goalKnown = (() => { try { return Game.goalKnown(villagerId); } catch (e) { return false; } })();
    const goalWant = (() => { try { return Game.goalWant(villagerId); } catch (e) { return null; } })();
    // REFUSAL: they said no. The opportunity emerges HERE — not before.
    let btns;
    if (view.refused && view.refusedTask) {
      const rtask = view.refusedTask;
      const rname = (tasks[rtask] || {}).name || rtask;
      const reason = ((Game.state.village.lastRefusal || {}).reason) || 'They shook their head.';
      body = `<p style="font-size:15px;line-height:1.5">"No."</p>
        <p class="small" style="opacity:.7">${esc(reason)}</p>
        <p class="small" style="opacity:.6;margin-top:8px">They won't ${esc(rname.toLowerCase())} just because you asked. Now what?</p>`;
      btns = '';
      if (hasFood) btns += `<button class="btn sm" data-refuse="deal">🤝 Offer food <span class="small" style="opacity:.6">(1 unit)</span></button> `;
      if (goalKnown) btns += `<button class="btn sm" data-refuse="appeal">🎯 Appeal <span class="small" style="opacity:.6">${goalWant ? '— ' + esc(goalWant) : ''}</span></button> `;
      if (!hasFood && !goalKnown) btns += `<p class="small" style="opacity:.6">You have nothing to sweeten this with — no food to offer, and you don't know what they want yet. (Talk to them. Learn.)</p>`;
      btns += `<button class="btn sm ghost" data-refuse="leave">← Leave it</button>`;
    } else {
      btns = Object.entries(tasks).map(([tid, t]) => {
        const comp = Game.villagerCompetence(villagerId, tid);
        const compTag = tid === 'rest' ? '' : comp >= 1.3 ? ' ⭐ natural' : comp <= 0.8 ? ' ⚠ not their strength' : '';
        const isCurrent = current && current.task === tid;
        const ask = askPhrases[tid] || t.name;
        return `<button class="btn sm${isCurrent ? '' : ' ghost'}" data-task="${tid}">${t.icon} "${esc(ask)}"${compTag}${isCurrent ? ' ✓' : ''}</button>`;
      }).join('') + ` <button class="btn sm ghost" data-act="back">\u2190 Back</button>`;
    }

    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\uD83D\uDDE3\uFE0F Ask ' + esc(dname) + ' for help' + viaLabel)}
      ${view.result ? `<p class="inline-result">✓ ${esc(view.result)}</p>` : ''}
      <div class="inline-body">${body}</div>
      <div class="inline-btns">${btns}</div>
    </div>`;
    wireInlineX(slot);
    slot.querySelector('[data-act="back"]').onclick = () => {
      inlineView = { kind: 'person', vid: villagerId, line: view.line, result: null, nvMode: null, mapKey: inlineMapKey() };
      refresh();
    };
    slot.querySelectorAll('[data-task]').forEach(b => {
      b.onclick = () => {
        const tid = b.dataset.task;
        // You just ask. If they're reluctant, the refusal opens the door —
        // deal and appeal emerge THEN, not as a perpetual toggle.
        const r = Game.assignTask(villagerId, tid, { via });
        if (r && r.ok) {
          const ask = askPhrases[tid] || tasks[tid].name;
          inlineView = { kind: 'person', vid: villagerId, line: view.line, result: `"${ask}" — they'll report back.`, nvMode: null, mapKey: inlineMapKey() };
        } else if (r && r.refused) {
          // They said no. Now — and only now — do the other options appear.
          inlineView = { kind: 'assign', vid: villagerId, line: view.line, result: null, via, refused: true, refusedTask: tid, mapKey: inlineMapKey() };
        } else {
          inlineView = { kind: 'person', vid: villagerId, line: view.line, result: null, nvMode: null, mapKey: inlineMapKey() };
        }
        refresh();
      };
    });
    slot.querySelectorAll('[data-refuse]').forEach(b => {
      b.onclick = () => {
        const how = b.dataset.refuse;
        const tid = view.refusedTask;
        let resultMsg;
        if (how === 'deal') {
          const r = Game.offerDeal(villagerId, tid);
          resultMsg = r && r.ok ? `"${askPhrases[tid] || tasks[tid].name}" — sealed with food.` :
            (r && r.refused ? `They took the food. Still no.` : `No deal.`);
        } else if (how === 'appeal') {
          const r = Game.appealToGoal(villagerId, tid);
          resultMsg = r && r.ok ? `"${askPhrases[tid] || tasks[tid].name}" — for what they want.` :
            `The appeal didn't land.`;
        } else {
          resultMsg = null; // leave it — walk away from the ask
        }
        inlineView = { kind: 'person', vid: villagerId, line: view.line, result: resultMsg, nvMode: null, mapKey: inlineMapKey() };
        refresh();
      };
    });
  }

  // assignTaskSheet is now inline — alias so no call site breaks.
  function assignTaskSheet(villagerId, via) {
    inlineView = { kind: 'assign', vid: villagerId, line: null, result: null, via: via || 'in-person', mapKey: inlineMapKey() };
    refresh();
  }

  // Remote assignment: abilities unlock assigning without face-to-face.
  function renderRemoteInline(slot, view) {
    const v = Game.state.village;
    const roster = (v.roster || []).filter(id => id !== Game.villagerId);
    const methods = Game.remoteAssignMethods ? Game.remoteAssignMethods() : [];
    if (!roster.length || !methods.length) { slot.innerHTML = ''; inlineView = null; return; }
    const m = methods[0];
    const btns = roster.map(vid => {
      const cur = Game.assignmentFor(vid);
      return `<button class="btn sm ghost" data-vid="${vid}">\uD83D\uDCE3 ${esc(Game.displayName(vid))}${cur ? ' (busy)' : ''}</button>`;
    }).join('');
    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\uD83D\uDCE3 Remote assign (' + esc(m.name) + ')')}
      <div class="inline-body"><p class="small" style="opacity:.7">${esc(m.desc)} Who do you want to reach?</p></div>
      <div class="inline-btns">${btns}</div>
    </div>`;
    wireInlineX(slot);
    slot.querySelectorAll('[data-vid]').forEach(b => {
      b.onclick = () => {
        inlineView = { kind: 'assign', vid: b.dataset.vid, line: null, result: null, via: m.id, mapKey: inlineMapKey() };
        refresh();
      };
    });
  }

  function remoteAssignSheet() {
    const methods = Game.remoteAssignMethods ? Game.remoteAssignMethods() : [];
    if (!methods.length) { Game.say("You need to be face-to-face to ask for help. (Abilities can unlock remote assignment.)"); refresh(); return; }
    inlineView = { kind: 'remote', mapKey: inlineMapKey() };
    refresh();
  }


  // LEADER: task assignment sheet. Pick a villager, pick a task, they go do it.
  // "This game is what you want it to be." — including a leader who never fights.
  // LEADER: ask for help. This lives in the talk menu — you're TALKING to them,
  // asking them to do something. Not a management UI. A conversation.
  // Remote assignment (shout, runner, System ping) unlocks via abilities — see Game.canAssignRemote.

  // Remote assignment: abilities unlock assigning without face-to-face.
  // Future abilities: "Shout" (village-wide), "Runner" (send someone), "System Ping" (post-day-7).
  // This is the UI entry point — Game.canAssignRemote gates it.


  // systemArrivalAnimation: the sky splits. Animated. Dramatic.
  // Full-screen overlay, crack grows, text types out, windows slide in.
  // systemArrivalAnimation: the sky splits. STAGED cinematic — one beat at a
  // time, tap to continue. Trailer pacing: tease, escalate, button. The script
  // lives in Game.systemArrivalBeats() (game.js) so it's unit-testable.
  function systemArrivalAnimation(callback) {
    const beats = Game.systemArrivalBeats();
    let i = 0, done = false;
    const overlay = document.createElement('div');
    overlay.className = 'system-arrival-overlay';
    document.body.appendChild(overlay);
    function finish() {
      if (done) return;
      done = true;
      try { overlay.remove(); } catch (e) {}
      if (callback) callback();
    }
    function showBeat() {
      const b = beats[i] || beats[beats.length - 1];
      overlay.innerHTML =
        '<div class="system-crack"></div>' +
        '<div class="system-beat-kicker">' + esc(b.kicker || '') + '</div>' +
        b.lines.map(l =>
          '<div class="system-window"><div class="system-text' + (l.who === 'narr' ? ' system-narr' : '') + '">' +
          (l.who === 'sys' ? '&ldquo;' + esc(Game.quoteWrap(l.text).slice(1, -1)) + '&rdquo;' : esc(l.text)) +
          '</div></div>'
        ).join('') +
        '<button class="btn" id="b-arrival-next" style="margin-top: 14px; z-index: 1001;">' + esc(b.button || '…') + '</button>';
      document.getElementById('b-arrival-next').onclick = () => {
        i++;
        if (i >= beats.length) finish();
        else showBeat();
      };
    }
    showBeat();
    // Backstop: never trap the player behind the overlay.
    setTimeout(finish, 120000);
  }

  // relicSheet: the System noticed your attachment. Pick 1 of 3 enhancements.
  // relicSheet: the System noticed your attachment. Pick 1 of 3 enhancements.
  // Modal sheet - you must choose. The world waits behind the backdrop.
  function relicSheet() {
    const rc = Game.state.scholar.relicChoices;
    if (!rc) return;
    openSheet({
      id: 'offer-relic',
      title: '\u2756 The System Noticed',
      html:
        '<p>"We have detected elevated attachment to Unit ' + esc(rc.itemName.toUpperCase()) +
        '. This is inefficient. This is also... [PROCESSING] ...valuable? Optimization available."</p>' +
        '<p>Your <b>' + esc(rc.itemName) + '</b> (bond ' + rc.threshold + ') can become more. Choose one:</p>',
      buttons: rc.options.map(o => ({
        label: '<b>' + esc(o.name) + '</b><br><span class="small">' + esc(o.description) + '</span>' +
          (o.systemCommentary ? '<br><i class="small">' + esc(Game.quoteWrap(o.systemCommentary)) + '</i>' : ''),
        primary: true,
        onClick: () => { Game.chooseRelicEnhancement(o.id); refresh(); },
      })),
      priority: 80, modal: true, dismissible: false,
    });
  }

  // caseFileSheet: the moot-redesign dossier. Post-System it's a System
  // overlay sheet in the unhinged alien voice (🔴 LIVE energy — the aliens
  // LOVE trials, there's a spin-off literally called "The Moot").
  // Pre-System it's diegetic: plain journal styling, same content.
  // The strategic actions live here — speak, witnesses, press, investigate,
  // expose, force the moot, flee — each appearing only while it's live.
  function caseFileSheetForCurrent() {
    let c = null;
    try { c = Game.playerAccusedCase(); } catch (e) {}
    if (c) caseFileSheet(c.id);
  }
  function caseFileButtons(caseId) {
    let acts = [];
    try { acts = Game.caseDossierActions(caseId) || []; } catch (e) {}
    return acts.map(a => ({
      label: '<b>' + esc(a.label) + '</b>' + (a.hint ? '<br><span class="small">' + esc(a.hint) + '</span>' : ''),
      keepOpen: true,
      onClick: () => {
        try { Game.caseDossierDo(caseId, a.id); } catch (e) {}
        let cur = null;
        try { cur = Game.getCase(caseId); } catch (e) {}
        refresh();
        // the case moved on (trial called, fled, resolved) — close the sheet
        if (!cur || (cur.status !== 'open' && cur.status !== 'dormant') || cur.trial) return;
        try { updateSheet('case-file', { html: Game.caseDossierHtml(cur), buttons: caseFileButtons(caseId) }); } catch (e) {}
        return 'keep';
      },
    }));
  }
  function caseFileSheet(caseId) {
    let c = null;
    try { c = Game.getCase(caseId); } catch (e) {}
    if (!c) return;
    const post = !!Game.state.systemArrived;
    openSheet({
      id: 'case-file',
      title: post ? '🔴 LIVE — THE MOOT: CASE FILE' : '⚖️ Case file',
      html: Game.caseDossierHtml(c),
      buttons: caseFileButtons(caseId),
      priority: 40, modal: false, dismissible: true,
    });
  }

  // tableSheet: the galactic table. One final live choice, inside your earned frame.
  // Modal sheet - the galaxy waits.
  function tableSheet() {
    const tc = Game.state.scholar.tableChoices;
    if (!tc) return;
    openSheet({
      id: 'the-table',
      title: '\u{1F30C} The Table',
      html: '<p>The ring of pale light. The too-many-angled faces. The trillions of eyes.</p>' +
        '<p>Your case is made. Now — the last choice is yours, and it\'s live:</p>',
      buttons: tc.options.map(o => ({
        label: '<b>' + esc(o.label) + '</b>',
        primary: true,
        onClick: () => { Game.chooseTableOption(o.id); refresh(); },
      })),
      priority: 100, modal: true, dismissible: false,
    });
  }

  // abilitySheet: the System offers you a choice. Pick one.
  // Modal sheet - you must choose. No dismissing the System.
  function abilitySheet() {
    const choices = Game.state.scholar.abilityChoices;
    if (!choices || !choices.length) return;
    openSheet({
      id: 'offer-ability',
      title: '\u{1F31F} The System Offers a Gift',
      html:
        '<p>"We watched your first week! You\u2019re good at... let us see..."</p>' +
        '<p>Choose one ability:</p>',
      buttons: choices.map(c => ({
        label: '<b>' + esc(c.name) + '</b><br><span class="small">' + esc(c.description || c.desc) + '</span>' +
          (c.flavor ? '<br><i class="small">' + esc(Game.quoteWrap(c.flavor)) + '</i>' : '') +
          (c.metabolic && c.metabolic.daily ? '<br><span class="small">\u{1F525} Costs ' + c.metabolic.daily + ' kcal/day to keep. Power is a trade.</span>' : ''),
        primary: true,
        onClick: () => { Game.chooseAbility(c.id); refresh(); },
      })),
      priority: 80, modal: true, dismissible: false,
    });
  }

  // AUTOSAVE: the phone kills background tabs. Save aggressively.
  // When you switch to Muse chat and back, your game must still be there.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      try { Game.save(); } catch (e) {}
    }
  });
  window.addEventListener('beforeunload', () => {
    try { Game.save(); } catch (e) {}
  });
  window.addEventListener('pagehide', () => {
    try { Game.save(); } catch (e) {}
  });
  // PWA install: capture beforeinstallprompt so the title screen can offer
  // a real install flow (Android/Chrome). iOS gets manual instructions instead.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__deferredInstallPrompt = e;
  });
  // Also save every 30 seconds (in case the above don't fire).
  // SAVE HONESTY (break-it persistence 2026-10-09): Game.save() returns false
  // when the save didn't persist (quota, blocked storage, unserializable
  // state). A silent no-op here means the player believes they're saved and
  // they're not — say so once, then stay quiet until a save succeeds again.
  let __saveFailToasted = false;
  setInterval(() => {
    try {
      const r = Game.save();
      if (r === false && !__saveFailToasted) {
        __saveFailToasted = true;
        toast('Could not save — storage may be full. Progress since your last save is at risk.');
      } else if (r === true) {
        __saveFailToasted = false;
      }
    } catch (e) {}
  }, 30000);

  // invSheet: what are you carrying? always accessible, not hidden.
  // Crafting lives here too — supplies to feed yourself.
  // invSheet: what are you carrying? Non-modal sheet - always accessible, never hidden.
  // Crafting, abilities, equipment - all here. The ability bar on the main
  // screen covers quick activation; this is the full inventory view.
  // PREP STASH: the kitchen counter. Mission board, not a storage dump.
  // Unprocessed hauls, auto-sorted by what's rotting first. Three decisions
  // per batch: WHAT FIRST (triage), WHO (you vs specialist), HOW FAR
  // (raw / cook / smoke) — every cost stated before committing.
  function stashSectionHtml() {
    if (!Game.prepStash || !Game.atCamp) return '';
    const atCamp = Game.atCamp();
    const stash = Game.prepStash();
    const order = Game.stashUrgency ? Game.stashUrgency() : stash.map((it, idx) => ({ it, idx, left: 99 }));
    let html = `<h3 style="margin-top:12px">\uD83C\uDF73 Prep stash — the counter</h3>`;
    if (!atCamp) {
      html += `<p class="small" style="opacity:.7">Your counter is back at camp.</p>`;
      return html;
    }
    html += `<p class="small" style="opacity:.7">Unprocessed hauls, rotting-first. Pick your battles.</p>`;
    if (!order.length) {
      html += `<p class="small" style="opacity:.6">Counter's clear.</p>`;
    }
    for (const { it, idx, left } of order) {
      const clock = Game.stashClock ? Game.stashClock(it) : '';
      const urgent = left <= 0;
      const needs = Game.prepNeeds ? Game.prepNeeds(it) : '';
      html += `<p class="small"><b>${esc(Game.itemDisplayName(it))}</b> ×${it.units || 1} — <span${urgent ? ' style="color:#e5484d;font-weight:bold"' : ''}>${esc(clock)}</span><br>`;
      html += `<span style="opacity:.7">needs: ${esc(needs)}</span><br>`;
      html += stashActionsHtml(it, idx);
      html += `</p>`;
    }
    html += `<p class="small"><button class="btn ghost sm" data-stash-stage>Stage unprocessed</button> <button class="btn ghost sm" data-stash-putaway>Put away finished food</button></p>`;
    return html;
  }

  // Per-entry action row: the three decisions, honestly stated.
  function stashActionsHtml(it, idx) {
    let html = '';
    const stash = Game.prepStash();
    if (it.lump) {
      html += `<button class="btn ghost sm" data-stash-sort="${idx}">Sort the bag</button>`;
      try {
        const knowers = Game.whoKnowsLump(it) || [];
        if (knowers.length) {
          html += ` <button class="btn ghost sm" data-stash-sortask="${idx}" data-vid="${knowers[0].id}">Ask ${esc(knowers[0].name)}</button>`;
        }
      } catch (e) {}
      html += ` <button class="btn ghost sm" data-stash-test="${idx}">Test cautiously</button>`;
      html += ` <button class="btn ghost sm" data-stash-rush="${idx}">Rush it</button>`;
      html += ` <button class="btn ghost sm" data-stash-watch="${idx}">Watch the fauna</button>`;
      if (Game.state.systemArrived) {
        html += ` <button class="btn ghost sm" data-stash-system="${idx}">Ask the System</button>`;
      }
      if (it.hint) {
        html += ` <span class="small" style="opacity:.6">(hint: animals ${it.hint.kind === 'safe' ? 'eat it' : 'avoid it'} — not proof)</span>`;
      }
    }
    if (it.foodState === 'carcass') {
      try {
        const who = Game.whoOptions(it, 'butcher') || [];
        for (const o of who) {
          if (o.id === 'you') {
            html += ` <button class="btn ghost sm" data-stash-clean="${idx}"${o.blocked ? ' disabled' : ''}>${esc(o.label)}</button> <span class="small" style="opacity:.6">${esc(o.detail)}${o.blocked ? ' (' + esc(o.blocked) + ')' : ''}</span>`;
          } else if (o.id && o.id.indexOf('spec:') === 0) {
            html += ` <button class="btn ghost sm" data-stash-askclean="${idx}" data-vid="${o.id.slice(5)}">${esc(o.label)}</button> <span class="small" style="opacity:.6">${esc(o.detail)}</span>`;
          } else if (o.blocked) {
            html += ` <span class="small" style="opacity:.6">(${esc(o.label)}: ${esc(o.blocked)})</span>`;
          }
        }
      } catch (e) {}
    }
    if (it.foodState === 'in_shell') {
      html += ` <button class="btn ghost sm" data-stash-shell="${idx}">Shell them</button> <span class="small" style="opacity:.6">4 ticks · net 75%</span>`;
    }
    if ((it.foodKind === 'meat' && it.foodState === 'cleaned') || it.needsCooking) {
      try {
        const how = Game.howFarOptions(it) || [];
        for (const o of how) {
          if (o.id === 'raw') {
            html += ` <button class="btn ghost sm" data-stash-raw="${idx}">${esc(o.label)}</button> <span class="small" style="opacity:.6">${esc(o.detail)}</span>`;
          } else if (o.id === 'cook') {
            const specs = Game.specialistsHere('cook') || [];
            html += ` <button class="btn ghost sm" data-stash-cook="${idx}"${o.blocked ? ' disabled' : ''}>Cook — you</button>`;
            if (specs.length) html += ` <button class="btn ghost sm" data-stash-askcook="${idx}" data-vid="${specs[0].id}">Cook — ask ${esc(specs[0].name)}</button>`;
            html += ` <span class="small" style="opacity:.6">${esc(o.detail)}${o.blocked ? ' (' + esc(o.blocked) + ')' : ''}</span>`;
          } else if (o.id === 'smoke') {
            const specs = Game.specialistsHere('preserver') || [];
            html += ` <button class="btn ghost sm" data-stash-smoke="${idx}"${o.blocked ? ' disabled' : ''}>Smoke — you</button>`;
            if (specs.length) html += ` <button class="btn ghost sm" data-stash-asksmoke="${idx}" data-vid="${specs[0].id}">Smoke — ask ${esc(specs[0].name)}</button>`;
            html += ` <span class="small" style="opacity:.6">${esc(o.detail)}${o.blocked ? ' (' + esc(o.blocked) + ')' : ''}</span>`;
          }
        }
      } catch (e) {}
    }
    return html;
  }

  // BUILD ARCHETYPE INDICATOR (Steve 2026-10-07): specialist/generalist are
  // real bonuses (Game.buildBonus) but invisible. One compact line in the
  // pack, next to the ability list — a badge you EARNED, not a label.
  function renderBuildIndicator() {
    try {
      if (!Game.buildArchetype || !Game.buildBonus) return '';
      const arch = Game.buildArchetype();
      if (!arch) return '';
      const bonus = Game.buildBonus();
      const title = bonus ? esc(bonus.desc) : '';
      if (arch.type === 'specialist') {
        const icons = { combat: '\u2694\uFE0F', care: '\u{1F49A}', fieldcraft: '\u{1F33F}', craft: '\u{1F528}', social: '\u{1F4AC}', exploration: '\u{1F9ED}', investigation: '\u{1F50E}' };
        const verbs = { combat: 'strikes hit harder', care: 'healing flows stronger', fieldcraft: 'the land yields more', craft: 'your craft holds true', social: 'your words carry weight', exploration: 'you cover ground faster', investigation: "the truth can't hide" };
        const poolName = arch.pool.charAt(0).toUpperCase() + arch.pool.slice(1);
        return `<p class="small buildbadge" title="${title}">${icons[arch.pool] || '\u{1F3AF}'} <b>${esc(poolName)} Specialist</b> <span style="color:#ffd166">+25%</span> <span style="opacity:.75">\u2014 ${esc(verbs[arch.pool] || 'your mastery deepens')}. Mastery has its rewards.</span></p>`;
      }
      return `<p class="small buildbadge" title="${title}">\u{1F310} <b>Versatile Generalist</b> <span style="color:#ffd166">+10%</span> <span style="opacity:.75">to everything \u2014 no lock you can't work around.</span></p>`;
    } catch (e) { return ''; }
  }

  // SYNERGY STIRRINGS (Steve 2026-10-07): an undiscovered synergy with 1-2
  // attempts whose requirements you hold is ALIVE — surface its tease in the
  // pack so the thread stays warm between visits. The full hint is earned at
  // attempt 2 (mirrors game.js: tease1 -> tease2 + hint) — showing it at
  // attempt 1 would short-circuit the discovery loop. Knowledge gating holds.
  function renderSynergyStirrings() {
    try {
      const sch = Game.state.scholar;
      const syns = Game.data.synergies || [];
      const attempts = sch.synergyAttempts || {};
      const discovered = sch.synergies || [];
      const rows = [];
      for (const syn of syns) {
        if (discovered.includes(syn.id)) continue;
        const dm = syn.discovery_method || {};
        const n = attempts[syn.id + (dm.type === 'sustained' ? '_days' : '')] || 0;
        if (n < 1 || n > 2) continue;
        // requirements held? same check game.js uses for activation.
        const minLvl = syn.minLevel || 1;
        const held = (syn.requires || []).every(rid => {
          try { return Game.abilityLevel(rid) >= minLvl; } catch (e) { return false; }
        });
        if (!held) continue;
        const tease = n === 1 ? dm.tease1 : dm.tease2;
        const pips = '\u25CF'.repeat(n) + '\u25CB'.repeat(3 - n);
        let line = `<b>\u{1F300} ${esc(syn.name)}</b> <span style="opacity:.7">${pips}</span>`;
        if (tease) line += ` \u2014 <i>${esc(tease)}</i>`;
        // attempt 2: the game itself nudges toward the hint — the HUD may
        // name it outright. Attempt 1 keeps only the tease.
        if (n === 2 && dm.hint) line += ` <span style="opacity:.85">\u{1F4A1} ${esc(dm.hint)}</span>`;
        rows.push(`<p class="small">${line}</p>`);
      }
      return rows.join('');
    } catch (e) { return ''; }
  }

  // SYSTEM INTEGRATION LEVEL (Steve 2026-10-07): game.js tracks linkedCodices
  // -> systemIntegrationLevel 0-3. One compact line: pips, what the System
  // sees at this level, and the next step. The level-up itself announces in
  // the moment (feedback card) — this is the standing readout.
  function renderIntegrationLevel() {
    try {
      if (!Game.systemIntegrationLevel) return '';
      const sch = Game.state.scholar;
      const linked = (sch.linkedCodices || []).length;
      const lvl = Game.systemIntegrationLevel();
      if (!Game.state.systemArrived && lvl === 0) return '';
      const pips = '\u25CF'.repeat(lvl) + '\u25CB'.repeat(Math.max(0, 3 - lvl));
      const sees = ['the System barely knows you', 'village power on the map', 'wildlife + travelers tracked', 'full rosters, codex summaries, strategy intel'];
      const prog = lvl >= 3
        ? 'fully integrated'
        : `study 1 more village codex \u2192 L${lvl + 1}`;
      return `<p class="small" title="Study village codices to link them. The System integrates — and the HUD literally gets smarter."><b>\u2B22 Integration</b> <span style="color:#b48cff">${pips}</span> <span style="opacity:.75">${esc(sees[Math.min(lvl, 3)] || sees[0])}</span> <span style="opacity:.6">\u00B7 ${esc(prog)}</span></p>`;
    } catch (e) { return ''; }
  }


  // ABILITIES MENU (Steve 2026-10-07): full loadout below Equipment.
  // 6 slots, each with name, active/passive badge, level/xp, path tags.
  // Tap for detail. Swap only at camp (not in combat).
  function renderAbilitiesSection() {
    try {
      const sch = Game.state.scholar;
      const equipped = sch.abilities || [];
      const bg = sch.backgroundAbilities || [];
      const maxSlots = Game.abilitySlots ? Game.abilitySlots() : 6;
      const defs = Game.data.abilities || [];

      const pathColors = {
        hunter: '#7cfc9a', brawler: '#ff6b6b', forager: '#ffd166',
        survivalist: '#4df3ff', detective: '#c792ea', socialite: '#ff9ff3',
        miser: '#feca57', explorer: '#54a0ff', drifter: '#a4b0be', caregiver: '#ff7979'
      };

      const renderSlot = (ab, idx, isBg) => {
        if (!ab) {
          return `<div style="border:1px dashed #444;border-radius:6px;padding:8px;margin:4px 0;opacity:.5">
            <p class="small" style="margin:0"><b>Empty slot ${idx + 1}</b> — learn abilities through trials, mentors, or the System.</p>
          </div>`;
        }
        const def = defs.find(d => d.id === (ab.id || ab)) || {};
        const name = ab.name || def.name || ab.id || 'Unknown';
        const level = ab.level || 1;
        const xp = ab.xp || 0;
        const xpNeed = level * 100; // rough
        const xpPct = Math.min(100, Math.round((xp / xpNeed) * 100));
        const isActive = !!(def.actions && def.actions.length);
        const badge = isActive
          ? `<span style="background:#4df3ff22;border:1px solid #4df3ff;border-radius:3px;padding:1px 5px;font-size:10px;color:#4df3ff">ACTIVE</span>`
          : `<span style="background:#8882;border:1px solid #888;border-radius:3px;padding:1px 5px;font-size:10px;color:#aaa">PASSIVE</span>`;
        const paths = (def.paths || []).map(p => {
          const c = pathColors[p] || '#aaa';
          return `<span style="color:${c};font-size:11px">● ${esc(p)}</span>`;
        }).join(' ');
        const canSwap = !Game.inCombat || !Game.inCombat();
        // Detail: description, actions, modifiers
        let detail = `<p class="small" style="opacity:.8">${esc(ab.desc || def.description || '')}</p>`;
        if (def.actions && def.actions.length) {
          detail += `<p class="small"><b>Actions:</b></p>` + def.actions.map(a => {
            const cost = a.cost ? Object.entries(a.cost).map(([k, v]) => `${k}: ${v}`).join(', ') : '—';
            return `<p class="small" style="margin-left:12px">⚡ <b>${esc(a.name)}</b> <span style="opacity:.6">(${esc(a.context)})</span><br><span style="opacity:.75">${esc(a.effect || '')}</span><br><span style="opacity:.5">Cost: ${esc(cost)}</span></p>`;
          }).join('');
        }
        if (def.modifiers && def.modifiers.length) {
          detail += `<p class="small" style="opacity:.6"><b>Passive:</b> ${def.modifiers.map(m => `${esc(m.target)} ${esc(m.op)} ${esc(m.value)}`).join('; ')}</p>`;
        }
        const swapBtn = (!isBg && canSwap)
          ? ` <button class="btn ghost sm" data-ability-swap="${ab.id || ab}">Swap</button>`
          : (!isBg ? ` <span class="small" style="opacity:.5">(swap at camp)</span>` : '');
        return `<details style="border:1px solid #333;border-radius:6px;padding:6px 8px;margin:4px 0">
          <summary style="cursor:pointer;list-style:none">
            <b>${esc(name)}</b> ${badge} <span style="opacity:.7">L${level}</span>
            <div style="background:#222;border-radius:3px;height:4px;margin:4px 0"><div style="background:#4df3ff;height:4px;border-radius:3px;width:${xpPct}%"></div></div>
            ${paths ? `<div>${paths}</div>` : ''}
          </summary>
          <div style="margin-top:6px">${detail}${swapBtn}</div>
        </details>`;
      };

      let html = `<details style="margin:10px 0;border-top:1px solid #333;padding-top:8px">
        <summary style="cursor:pointer;font-size:15px;font-weight:bold">⚡ Abilities <span style="opacity:.6;font-weight:normal">(${equipped.length}/${maxSlots})</span></summary>
        <div style="margin-top:6px">`;

      // System abilities (the 6 slots)
      for (let i = 0; i < maxSlots; i++) {
        html += renderSlot(equipped[i] || null, i, false);
      }
      // Background abilities (separate, not in slots)
      if (bg.length) {
        html += `<p class="small" style="margin-top:8px;opacity:.7"><b>Background</b> (yours — not slotted):</p>`;
        bg.forEach((ab, i) => { html += renderSlot(ab, i, true); });
      }
      html += `</div></details>`;
      return html;
    } catch (e) { return `<p class="small" style="opacity:.5">Abilities unavailable.</p>`; }
  }

  // SKILLS MENU (Steve 2026-10-07): Codex browser below Abilities.
  // Grouped by domain. Knowledge-gated: unknown shows as ???.
  function renderSkillsSection() {
    try {
      const codexSkills = (Game.state.codex || {}).skills || {};
      const defs = Game.data.knowledge || [];
      if (!defs.length) return '';

      // Group by domain
      const byDomain = {};
      for (const def of defs) {
        const d = def.domain || 'general';
        if (!byDomain[d]) byDomain[d] = [];
        byDomain[d].push(def);
      }

      let html = `<details style="margin:10px 0;border-top:1px solid #333;padding-top:8px">
        <summary style="cursor:pointer;font-size:15px;font-weight:bold">📖 Skills <span style="opacity:.6;font-weight:normal">(Codex)</span></summary>
        <div style="margin-top:6px">`;

      for (const [domain, skills] of Object.entries(byDomain)) {
        const known = skills.filter(s => {
          try { return Game.canShow('skill', s.id, 'name'); } catch (e) { return !!codexSkills[s.id]; }
        });
        html += `<details style="margin:6px 0">
          <summary style="cursor:pointer"><b style="text-transform:capitalize">${esc(domain)}</b> <span style="opacity:.6">(${known.length}/${skills.length})</span></summary>
          <div style="margin:4px 0 4px 8px">`;
        for (const sk of skills) {
          let showName = true;
          try { showName = Game.canShow('skill', sk.id, 'name'); } catch (e) { showName = !!codexSkills[sk.id]; }
          if (!showName) {
            html += `<p class="small" style="opacity:.4">??? <span style="opacity:.6">(undiscovered)</span></p>`;
            continue;
          }
          const entry = codexSkills[sk.id] || {};
          const lvl = entry.level || 0;
          const pips = '\u25CF'.repeat(lvl) + '\u25CB'.repeat(Math.max(0, 4 - lvl));
          const levels = sk.levels || {};
          let levelDetail = '';
          for (let l = 1; l <= 4; l++) {
            if (levels[String(l)]) {
              const unlocked = lvl >= l;
              levelDetail += `<p class="small" style="margin:2px 0 2px 12px;${unlocked ? '' : 'opacity:.4'}"><b>L${l}:</b> ${unlocked ? esc(levels[String(l)]) : '???'}</p>`;
            }
          }
          // Techniques from abilitySynergies
          let techHtml = '';
          const syns = sk.abilitySynergies || [];
          if (syns.length) {
            techHtml = `<p class="small" style="margin-top:4px"><b>Techniques:</b></p>` + syns.map(t => {
              const tKnown = lvl >= (t.minLevel || 1);
              return `<p class="small" style="margin-left:12px;${tKnown ? '' : 'opacity:.4'}">🔧 <b>${tKnown ? esc(t.technique || t.ability) : '???'}</b>${tKnown && t.effect ? ` — ${esc(t.effect)}` : ''}</p>`;
            }).join('');
          }
          html += `<details style="margin:4px 0">
            <summary style="cursor:pointer"><b>${esc(sk.name)}</b> <span style="color:#ffd166">${pips}</span></summary>
            <div style="margin-top:4px">${levelDetail}${techHtml}</div>
          </details>`;
        }
        html += `</div></details>`;
      }
      html += `</div></details>`;
      return html;
    } catch (e) { return `<p class="small" style="opacity:.5">Skills unavailable.</p>`; }
  }

  // SYNERGIES MENU (Steve 2026-10-07): Discoveries below Skills.
  // Three states: Active (firing), Near (1 away), Discovered (known, inactive).
  function renderSynergiesSection() {
    try {
      const active = Game.getActiveSynergies ? Game.getActiveSynergies() : [];
      const near = Game.getNearSynergies ? Game.getNearSynergies() : [];
      const discovered = Game.getDiscoveredSynergies ? Game.getDiscoveredSynergies() : [];

      let html = `<details style="margin:10px 0;border-top:1px solid #333;padding-top:8px">
        <summary style="cursor:pointer;font-size:15px;font-weight:bold">✦ Synergies <span style="opacity:.6;font-weight:normal">(${active.length} active)</span></summary>
        <div style="margin-top:6px">`;

      // ACTIVE
      if (active.length) {
        html += `<p class="small" style="color:#7cfc9a"><b>● Active</b></p>`;
        for (const s of active) {
          const triggers = (s.triggers || []).map(t => esc(t.name || t.id)).join(' + ');
          html += `<details style="margin:4px 0;border:1px solid #2a4d2a;border-radius:6px;padding:6px 8px">
            <summary style="cursor:pointer"><b>${esc(s.name)}</b> ${triggers ? `<span style="opacity:.6;font-size:11px">${triggers}</span>` : ''}</summary>
            <p class="small" style="opacity:.8;margin-top:4px">${esc(s.flavor)}</p>
          </details>`;
        }
      }

      // NEAR (1 away)
      if (near.length) {
        html += `<p class="small" style="color:#ffd166;margin-top:8px"><b>◐ Near</b> <span style="opacity:.6">(one piece away)</span></p>`;
        for (const s of near) {
          html += `<p class="small" style="margin:4px 0">🔶 <b>${esc(s.name)}</b> <span style="opacity:.7">${s.have}/${s.total}</span> — need <b>${esc(s.needName)}</b></p>`;
        }
      }

      // DISCOVERED (known, inactive)
      if (discovered.length) {
        html += `<p class="small" style="opacity:.6;margin-top:8px"><b>○ Discovered</b> <span style="opacity:.6">(dormant)</span></p>`;
        for (const s of discovered) {
          html += `<details style="margin:4px 0;opacity:.7">
            <summary style="cursor:pointer">${esc(s.name)}</summary>
            <p class="small" style="opacity:.7;margin-top:4px">${esc(s.flavor)}</p>
          </details>`;
        }
      }

      if (!active.length && !near.length && !discovered.length) {
        html += `<p class="small" style="opacity:.5">No synergies yet. Combine abilities and skills — the resonances will find you.</p>`;
      }
      html += `</div></details>`;
      return html;
    } catch (e) { return `<p class="small" style="opacity:.5">Synergies unavailable.</p>`; }
  }

  // inventory: your pack. Inline — one screen, no overlay hopping.
  function renderInvInline(slot, view) {
    const st = Game.status();
    const inv = st.inventory;
    const tools = Game.state.scholar.tools || [];
    const recipes = Game.data.recipes || [];
    const knownRecipes = recipes.filter(r => (Game.state.codex.recipes || {})[r.id] && Game.state.codex.recipes[r.id].level >= 3);
    const bodyHtml = `
        ${(() => { const w = Game.state.scholar.water || []; if (!w.length) return ''; const clean = w.filter(b => b.quality === 'clean').length; const risky = w.filter(b => b.quality === 'risky').length; const hasFilter = (Game.state.scholar.tools || []).some(t => t.recipeId === 'water_filter' && (t.uses || 0) > 0); return `<p class="small" style="margin:8px 0;padding:8px;background:#1a2a3a;border-radius:6px"><b>\uD83D\uDCA7 Water:</b> ${clean}L clean${risky ? `, ${risky}L risky` : ''} (${w.length}kg)${risky && hasFilter ? ` <button class="btn ghost sm" data-filterwater="1">Filter ${risky}L</button>` : ''} <button class="btn ghost sm" data-pourwater="1" title="Pour out 1L, risky first. Water is heavy.">Pour out 1L</button></p>`; })()}
        <h3 style="margin:12px 0 6px">🎒 Carried <span style="opacity:.6;font-weight:normal;font-size:13px">(${inv.length} items)</span></h3>
        ${inv.length ? inv.map((i, idx) => {
          // FOOD REALITY: per-item processing buttons + state markers.
          let foodBtns = '';
          let foodMark = '';
          try {
            const fm = Game.foodMarker ? Game.foodMarker(i) : '';
            if (fm) foodMark = ` <span class="small" style="opacity:.75">${fm}</span>`;
            // going bad tomorrow — visible, not silent (bonus-aware boundary)
            const _gb = (Game.spoilBonusDays ? Game.spoilBonusDays() : 0);
            if (i.spoilDay !== undefined && i.spoilDay !== null && i.spoilDay + _gb === st.day + 1 && (i.kcalEach || 0) > 0) {
              foodMark += ` <span class="small" style="opacity:.75">going bad</span>`;
            }
            if (i.foodKind === 'nut' && i.foodState === 'in_shell') {
              foodBtns += ` <button class="btn ghost sm" data-shell="${idx}">Shell</button>`;
            }
            // FIELD IDENTIFICATION (Steve: the cautious test is always available,
            // always honest): unknown lumps can be tested from the pack, not
            // just at camp. Sorting stays camp-only (flat surface, good light).
            if (i.lump) {
              foodBtns += ` <button class="btn ghost sm" data-test="${idx}">Test cautiously</button>`;
              foodBtns += ` <button class="btn ghost sm" data-rush="${idx}">Rush it</button>`;
              foodBtns += ` <button class="btn ghost sm" data-watch="${idx}">Watch the fauna</button>`;
            }
            // UNKNOWN MONSTER MEAT (Steve 2026-10-05): if you don't know it's safe,
            // you can test it — cautiously (honest risk) or not. This is how you learn.
            if (i.foodKind === 'meat' && i.edible === false) {
              foodBtns += ` <button class="btn ghost sm" data-meattest="${idx}">Test cautiously</button>`;
            }
            if (i.foodState === 'carcass') {
              if (Game.knowsTechnique && Game.knowsTechnique('clean')) {
                foodBtns += Game.hasCuttingTool()
                  ? ` <button class="btn ghost sm" data-clean="${idx}">Clean</button>`
                  : ` <span class="small" style="opacity:.6">(needs a knife)</span>`;
              } else {
                const butchers = Game.specialistsHere ? Game.specialistsHere('butcher') : [];
                foodBtns += butchers.length
                  ? ` <button class="btn ghost sm" data-ask="${idx}" data-vid="${butchers[0].id}">Ask ${butchers[0].name}</button>`
                  : ` <span class="small" style="opacity:.6">(find a butcher)</span>`;
              }
            }
            const cookable = (i.rawKcal || (i.foodKind === 'meat' && i.foodState === 'cleaned')) && Game.nearFire();
            if (i.foodKind === 'meat' && (i.foodState === 'cleaned' || i.foodState === 'cooked') && Game.nearFire()) {
              foodBtns += ` <button class="btn ghost sm" data-preserve="${idx}">Smoke</button>`;
            }
            // RENDER FAT (Steve 2026-10-09, bear rework): raw fat + fire.
            if (i.foodKind === 'fat' && i.foodState === 'raw' && Game.nearFire()) {
              foodBtns += ` <button class="btn ghost sm" data-render="${idx}">Render</button>`;
            }
            // note: data-cook below covers cookable via the extended condition
            i._cookable = cookable;
          } catch (e) {}
          return `<p class="small">${itemSpriteHtml(i)}${(Game.isKeepsake && Game.isKeepsake(i)) ? '💛 ' : ''}${i.bonded ? '\u2756 ' : ''}<b>${Game.itemDisplayName(i)}</b> x${i.units} (${(() => { try {
            // KNOWLEDGE GATE (Steve 2026-10-07): kcal hidden for unknown plants.
            // "If you don't know it's food, you don't know its calories."
            if (i.foodKind === "meat" && i.edible === false) return "?";
            if (i.plantId && !String(i.plantId).startsWith('meat_')) {
              const isPlant = (Game.data.plants || []).some(x => x.id === i.plantId);
              if (isPlant && !Game.canShow('plant', i.plantId, 'kcal')) return "?";
            }
            return (i.kcalEach || 0) * i.units;
          } catch (e) { return (i.kcalEach || 0) * i.units; } })()} kcal · ${(((i.kg || 0.1)) * i.units).toFixed(1)} kg)${foodMark}${i.bonded ? ` <span class="small" title="Bonded relic \u2014 grown, not found">bond ${i.bond || 0}${(i.enhancements || []).length ? ' \u00B7 ' + i.enhancements.join(', ') : ''}</span>` : ''}${(Game.isKeepsake && Game.isKeepsake(i)) ? ' <span class="small" style="opacity:.6">keepsake</span>' : ''}${(() => { try { const et = Game.keepsakeEffectText ? Game.keepsakeEffectText(i) : null; return et ? ` <span class="small" style="opacity:.75">⚙ ${et}</span>` : ''; } catch (e) { return ''; } })()}${(Game.isSpoiled && Game.isSpoiled(i)) ? ' \u26A0 spoiled' : ''}${i.bookId ? ` <button class="btn ghost sm" data-read="${i.bookId}">Read</button>` : ''}${Game.isUsable(i) && !i.bonded ? ` <button class="btn ghost sm" data-use="${idx}">Use</button>` : ''}${(i.kcalEach || 0) > 0 && i.edible !== false && !i.bonded ? ` <button class="btn ghost sm" data-eatone="${idx}">Eat</button>` : ''}${foodBtns}${i._cookable ? ` <button class="btn ghost sm" data-cook="${idx}">Cook</button>` : ''}${Game.isWeapon(i) ? ` <button class="btn ghost sm" data-equip-w="${idx}">Equip</button>` : ''}${Game.isArmor(i) ? ` <button class="btn ghost sm" data-equip-a="${idx}">Wear</button>` : ''}${(Game.isKeepsake && Game.isKeepsake(i) && Game.sentimentTaught && Game.sentimentTaught()) ? ` <button class="btn ghost sm" data-channel="${idx}">💛 Channel</button>` : ''}${(i.kcalEach || 0) > 0 && i.edible !== false && !i.bonded ? ` <button class="btn ghost sm" data-donate="${idx}">Donate</button>` : ''}${!i.bonded && !(Game.isKeepsake && Game.isKeepsake(i)) ? ` <button class="btn ghost sm" data-drop="${idx}">Leave it</button>` : ''}${i.material ? ` <button class="btn ghost sm" data-stashmat="${idx}">Stash</button>` : ''}${Game.isStashableTool(i) ? ` <button class="btn ghost sm" data-stashtool="${idx}">Stash</button>` : ''}</p>`;
        }).join('') : '<p class="small">Empty. The world provides.</p>'}
        ${stashSectionHtml()}
        ${tools.length ? `<h3 style="margin-top:12px">🔧 Tools</h3>${tools.map(t => `<p class="small"><b>${t.name}</b> (${t.uses} uses left) <button class="btn ghost sm" data-settrap="${t.recipeId}">Set</button></p>`).join('')}` : ''}
        ${knownRecipes.length ? `<h3 style="margin-top:12px">Craft</h3>${knownRecipes.map(r => `<p class="small"><b>${r.name}</b> \u2014 ${Object.entries(r.materials).map(([m, n]) => n + ' ' + m).join(', ')} <button class="btn ghost sm" data-craft="${r.id}">Make</button></p>`).join('')}` : ''}`;

    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\uD83C\uDF92 Pack (' + st.invCount + ' items)')}
      ${view.result ? `<p class="inline-result">✓ ${esc(view.result)}</p>` : ''}
      <div class="inline-body">${bodyHtml}</div>
    </div>`;
    wireInlineX(slot);
    // obvious feedback: every action confirms, then the panel re-renders fresh.
    const rewire = (fn, ok) => (e) => { fn(e); inlineView.result = ok; refresh(); };
    slot.querySelectorAll('[data-craft]').forEach(b => b.onclick = rewire(() => Game.craft(b.dataset.craft), 'Crafted.'));
    slot.querySelectorAll('[data-settrap]').forEach(b => b.onclick = (e) => { Game.setTrap(b.dataset.settrap); inlineView.result = 'Trap set.'; refresh(); });
    slot.querySelectorAll('[data-read]').forEach(b => b.onclick = rewire(() => Game.readBook(b.dataset.read), 'You read.'));
    slot.querySelectorAll('[data-use]').forEach(b => b.onclick = rewire(() => Game.useItem(+b.dataset.use), 'Used.'));
    slot.querySelectorAll('[data-eatone]').forEach(b => b.onclick = rewire(() => Game.eatOne(+b.dataset.eatone), 'Eaten.'));
    slot.querySelectorAll('[data-channel]').forEach(b => b.onclick = rewire(() => Game.channelSentiment(+b.dataset.channel), 'Channeled.'));
    slot.querySelectorAll('[data-cook]').forEach(b => b.onclick = rewire(() => Game.cookFood(+b.dataset.cook), 'Cooked.'));
    // FOOD REALITY: processing buttons.
    slot.querySelectorAll('[data-shell]').forEach(b => b.onclick = rewire(() => Game.shellNuts(+b.dataset.shell), 'Shelled.'));
    // WATER FILTER: pour risky water through the filter, anywhere.
    slot.querySelectorAll('[data-filterwater]').forEach(b => b.onclick = rewire(() => Game.filterWater(), 'Filtered.'));
    // POUR OUT: shed water weight — water is heavy, and the pack is honest.
    slot.querySelectorAll('[data-pourwater]').forEach(b => b.onclick = rewire(() => Game.pourWater(), 'Poured out.'));
    // UNKNOWN MEAT: test cautiously to learn if it's food.
    slot.querySelectorAll('[data-meattest]').forEach(b => b.onclick = rewire(() => Game.testMonsterMeat(+b.dataset.meattest, packOf()), 'Tested.'));
    // FIELD IDENTIFICATION: the cautious test works from the pack, anywhere.
    const packOf = () => Game.state.scholar.inventory;
    slot.querySelectorAll('[data-test]').forEach(b => b.onclick = rewire(() => Game.testCautiously(+b.dataset.test, {}, packOf()), 'Tested.'));
    slot.querySelectorAll('[data-rush]').forEach(b => b.onclick = rewire(() => Game.testCautiously(+b.dataset.rush, { rush: true }, packOf()), 'Rushed.'));
    slot.querySelectorAll('[data-watch]').forEach(b => b.onclick = rewire(() => Game.watchFauna(+b.dataset.watch, packOf()), 'Watched.'));
    slot.querySelectorAll('[data-clean]').forEach(b => b.onclick = rewire(() => Game.cleanCarcass(+b.dataset.clean), 'Cleaned.'));
    slot.querySelectorAll('[data-preserve]').forEach(b => b.onclick = rewire(() => Game.preserveFood(+b.dataset.preserve), 'Smoked.'));
    // RENDER FAT (Steve 2026-10-09, bear rework).
    slot.querySelectorAll('[data-render]').forEach(b => b.onclick = rewire(() => Game.renderFat(+b.dataset.render), 'Rendered.'));
    slot.querySelectorAll('[data-ask]').forEach(b => b.onclick = rewire(() => Game.askSpecialist(b.dataset.vid, +b.dataset.ask), 'A specialist handles it.'));
    // PREP STASH: the kitchen counter. Every action confirms, panel re-renders.
    const stashOf = () => Game.prepStash();
    slot.querySelectorAll('[data-stash-stage]').forEach(b => b.onclick = rewire(() => Game.stageForPrep(), 'Staged.'));
    slot.querySelectorAll('[data-stash-putaway]').forEach(b => b.onclick = rewire(() => Game.putAwayFinished(), 'Put away.'));
    slot.querySelectorAll('[data-stash-sort]').forEach(b => b.onclick = rewire(() => Game.sortBag(null, +b.dataset.stashSort, stashOf()), 'Sorted.'));
    slot.querySelectorAll('[data-stash-sortask]').forEach(b => b.onclick = rewire(() => Game.sortBag(b.dataset.vid, +b.dataset.stashSortask, stashOf()), 'Sorted.'));
    slot.querySelectorAll('[data-stash-test]').forEach(b => b.onclick = rewire(() => Game.testCautiously(+b.dataset.stashTest, {}, stashOf()), 'Tested.'));
    slot.querySelectorAll('[data-stash-rush]').forEach(b => b.onclick = rewire(() => Game.testCautiously(+b.dataset.stashRush, { rush: true }, stashOf()), 'Rushed.'));
    slot.querySelectorAll('[data-stash-watch]').forEach(b => b.onclick = rewire(() => Game.watchFauna(+b.dataset.stashWatch, stashOf()), 'Watched.'));
    slot.querySelectorAll('[data-stash-system]').forEach(b => b.onclick = rewire(() => Game.askSystemAbout(+b.dataset.stashSystem, stashOf()), 'Asked.'));
    slot.querySelectorAll('[data-stash-clean]').forEach(b => b.onclick = rewire(() => Game.cleanCarcass(+b.dataset.stashClean, stashOf()), 'Cleaned.'));
    slot.querySelectorAll('[data-stash-askclean]').forEach(b => b.onclick = rewire(() => Game.askSpecialist(b.dataset.vid, +b.dataset.stashAskclean, stashOf()), 'A specialist handles it.'));
    slot.querySelectorAll('[data-stash-shell]').forEach(b => b.onclick = rewire(() => Game.shellNuts(+b.dataset.stashShell, stashOf()), 'Shelled.'));
    slot.querySelectorAll('[data-stash-raw]').forEach(b => b.onclick = rewire(() => Game.eatStashOne(+b.dataset.stashRaw), 'Eaten raw.'));
    slot.querySelectorAll('[data-stash-cook]').forEach(b => b.onclick = rewire(() => Game.cookFood(+b.dataset.stashCook, stashOf()), 'Cooked.'));
    slot.querySelectorAll('[data-stash-askcook]').forEach(b => b.onclick = rewire(() => Game.askSpecialist(b.dataset.vid, +b.dataset.stashAskcook, stashOf(), 'cook'), 'A specialist handles it.'));
    slot.querySelectorAll('[data-stash-smoke]').forEach(b => b.onclick = rewire(() => Game.preserveFood(+b.dataset.stashSmoke, stashOf()), 'Smoked.'));
    slot.querySelectorAll('[data-stash-asksmoke]').forEach(b => b.onclick = rewire(() => Game.askSpecialist(b.dataset.vid, +b.dataset.stashAsksmoke, stashOf(), 'preserver'), 'A specialist handles it.'));
    slot.querySelectorAll('[data-equip-w]').forEach(b => b.onclick = rewire(() => {
      // GEAR SLOTS (Steve 2026-10-07): route to melee or ranged by item type.
      const it = Game.state.scholar.inventory[+b.dataset.equipW];
      let tgt = 'melee';
      try {
        const def = (Game.data.items||[]).find(i => i.id === (it.itemId || it.id));
        if (def && window.S && window.S.equipment && window.S.equipment.isRangedWeapon(def)) tgt = 'ranged';
      } catch (e) {}
      Game.equip(+b.dataset.equipW, tgt);
    }, 'Equipped.'));
    slot.querySelectorAll('[data-equip-a]').forEach(b => b.onclick = rewire(() => {
      // GEAR SLOTS (Steve 2026-10-07): route armor to its assigned slot.
      const it = Game.state.scholar.inventory[+b.dataset.equipA];
      let tgt = 'armor';
      try {
        const def = (Game.data.items||[]).find(i => i.id === (it.itemId || it.id));
        if (def && window.S && window.S.equipment) {
          const want = window.S.equipment.slotForItem(def);
          if (want) tgt = want;
        }
      } catch (e) {}
      Game.equip(+b.dataset.equipA, tgt);
    }, 'Worn.'));
    slot.querySelectorAll('[data-unequip-slot]').forEach(b => b.onclick = rewire(() => Game.unequip(b.dataset.unequipSlot), 'Taken off.'));
    slot.querySelectorAll('[data-donate]').forEach(b => b.onclick = rewire(() => Game.donateToPantry(+b.dataset.donate), 'Donated to the pantry.'));
    // FORAGER LOOP: "leave it for the woods" — the pack-full message promises
    // this, so it exists. Anything not bonded or keepsake can be left behind.
    slot.querySelectorAll('[data-drop]').forEach(b => b.onclick = rewire(() => Game.dropItem(+b.dataset.drop), 'Left for the woods.'));
    slot.querySelectorAll('[data-stashmat]').forEach(b => b.onclick = rewire(() => {
      const it = Game.state.scholar.inventory[+b.dataset.stashmat];
      if (it && it.material) Game.donateMaterial(it.material, it.units || 1);
    }, 'Stashed.'));
    slot.querySelectorAll('[data-stashtool]').forEach(b => b.onclick = rewire(() => Game.donateTool(+b.dataset.stashtool), 'Tool stashed.'));
    slot.querySelectorAll('[data-activate]').forEach(b => b.onclick = (e) => {
      Game.activateAbility(b.dataset.activate); inlineView.result = 'Activated.'; refresh();
    });
  }

  // invSheet is now inline — alias so no call site breaks.
  function invSheet() {
    inlineView = { kind: 'inv', result: null, mapKey: inlineMapKey() };
    refresh();
  }

  // CHARACTER SHEET (Steve 2026-10-07): who you are — abilities, skills,
  // synergies, equipped gear, build. Separate from Pack (what you carry).
  function characterSheet() {
    inlineView = { kind: 'character', result: null, mapKey: inlineMapKey() };
    refresh();
  }

  // DISEASE (Steve 2026-10-09): the affliction panel. Symptoms until
  // diagnosed; examine/treat/folk-remedy/medicine/villager care all live here.
  function renderAfflictionsSection() {
    try {
      const sick = (Game.sickDiseases && Game.sickDiseases()) || [];
      const v = (Game.state && Game.state.village) || {};
      const sickVillagers = Object.keys(v.sick || {});
      const hasTick = !!(Game.hasStatus && Game.hasStatus('scholar', 'tick_attached'));
      if (!sick.length && !sickVillagers.length && !hasTick) return '';
      let html = `<details open style="margin:8px 0"><summary style="cursor:pointer;font-size:15px;font-weight:bold">🤒 Afflictions <span style="opacity:.6;font-weight:normal">(${sick.length + sickVillagers.length})</span></summary><div style="margin-top:6px">`;
      for (const e of sick) {
        const def = Game.seDef(e.id) || {};
        const dl = Game.diseaseLabel('scholar', e);
        const diagnosed = Game.isDiagnosed('scholar', e.id);
        html += `<p class="small">${dl.icon ? esc(dl.icon) + ' ' : ''}<b>${esc(dl.label)}</b>${diagnosed ? '' : ' <span style="opacity:.6">(unnamed — examine to identify)</span>'}${e.severe ? ' <b style="color:#ff5252">SEVERE</b>' : ''}<br><span style="opacity:.75">${esc(diagnosed ? (def.diagnosedDesc || def.description || '') : (def.description || ''))}</span></p>`;
        html += `<p class="small">`;
        if (!diagnosed && Game.canDiagnose && Game.canDiagnose()) html += `<button class="btn ghost sm" data-aff="examine">🔍 Examine</button> `;
        if (Game.hasAbility('herbal_remedy')) html += `<button class="btn ghost sm" data-aff="treat:herbal_remedy">🌿 Herbal remedy</button> `;
        if (Game.hasAbility('field_medicine')) html += `<button class="btn ghost sm" data-aff="treat:field_medicine">🩹 Field medicine</button> `;
        if (Game.hasAbility('triage')) html += `<button class="btn ghost sm" data-aff="treat:triage">⚕️ Triage</button> `;
        html += `</p><p class="small" style="opacity:.85">Folk remedies — anyone can try: `;
        html += `<button class="btn ghost sm" data-aff="folk:rest">😴 Rest up</button> `;
        html += `<button class="btn ghost sm" data-aff="folk:fluids">💧 Clean water</button> `;
        html += `<button class="btn ghost sm" data-aff="folk:tea">🍵 Bitter tea</button> `;
        html += `<button class="btn ghost sm" data-aff="folk:fast">🚫 Fast</button></p>`;
        const meds = (Game.state.scholar.inventory || []).filter(i => i.medType && (i.doses || 0) > 0);
        if (meds.length) {
          html += `<p class="small">💊 Medicine (rare, specific — read the label): `;
          for (const m of meds) html += `<button class="btn ghost sm" data-aff="med:${m.medType}">${esc(m.name)} (${m.doses})</button> `;
          html += `</p>`;
        }
      }
      // AMBIENT TICK (Steve 2026-10-09): attached tick gets its own row —
      // narrated, visible, removable. Never silent.
      if (hasTick) {
        const knowsTick = !!(((Game.state.codex || {}).techniques || {}).tick_removal) ||
          Game.hasAbility('triage') || Game.hasAbility('field_medicine') || Game.hasAbility('herbal_remedy');
        html += `<p class="small">🪲 <b>Tick attached</b><br><span style="opacity:.75">Something itches at your ankle — a tick, latched on. Each day it stays, the fever risk climbs.</span></p>`;
        html += `<p class="small"><button class="btn ghost sm" data-aff="removetick">🪲 ${knowsTick ? 'Remove tick' : 'Remove tick (blind — risky)'}</button></p>`;
      }
      for (const vid of sickVillagers) {
        const rec = v.sick[vid] || {};
        let first = 'Someone';
        try { first = Game.displayName ? Game.displayName(vid) : vid; } catch (e2) {}
        const label = rec.diagnosed || 'sick (unnamed)';
        html += `<p class="small">🧍 <b>${esc(String(first).split(' ')[0])}</b> — ${esc(label)}<br>`;
        if (Game.canDiagnose && Game.canDiagnose() && !rec.diagnosed) html += `<button class="btn ghost sm" data-aff="vexamine:${vid}">🔍 Examine</button> `;
        html += `<button class="btn ghost sm" data-aff="vtend:${vid}">🤲 Tend</button> `;
        for (const ab of ['herbal_remedy', 'field_medicine', 'triage']) {
          if (Game.hasAbility(ab) && Game.abilityLevel(ab) >= 2) {
            const nm = ab === 'herbal_remedy' ? 'herbs' : ab === 'field_medicine' ? 'field med' : 'triage';
            html += `<button class="btn ghost sm" data-aff="vtreat:${vid}:${ab}">⚕️ Treat (${nm}, -150 kcal)</button> `;
          }
        }
        html += `</p>`;
      }
      html += `</div></details>`;
      return html;
    } catch (e) { return ''; }
  }

  function renderCharacterInline(slot, view) {
    const st = Game.status();
    const bodyHtml = `
        ${(() => {
          // GEAR SLOTS: full slot display with blocked-slot grey-out.
          try {
            const eq = Game.state.scholar.equipped || {};
            const S = window.S || {};
            const E = S.equipment || {};
            const slots = ['melee', 'ranged', 'head', 'torso', 'legs', 'hands', 'shoes', 'acc1', 'acc2', 'acc3', 'acc4'];
            const blocked = E.blockedSlots ? E.blockedSlots(eq) : [];
            const label = E.slotLabel ? E.slotLabel.bind(E) : (s => s);
            const eqCount = Object.keys(eq).filter(k => eq[k]).length;
            const rows = slots.map(slot => {
              const isBlocked = blocked.indexOf(slot) !== -1;
              const item = eq[slot];
              const lbl = label(slot);
              if (isBlocked) {
                return `<p class="small" style="opacity:.35"><b>${lbl}:</b> <span style="text-decoration:line-through">blocked</span> <span style="opacity:.7">(covered by ${esc((eq.torso||{}).name||'full-body gear')})</span></p>`;
              }
              if (!item) return `<p class="small" style="opacity:.5"><b>${lbl}:</b> —</p>`;
              const bond = item.bonded ? ` <span class="small" style="opacity:.75">bond ${item.bond||0}${item.heirloom ? ' \u00B7 heirloom' : ''}</span>` : '';
              return `<p class="small"><b>${lbl}:</b> ${itemSpriteHtml(item)}${esc(item.name)}${bond} <button class="btn ghost sm" data-unequip-slot="${slot}">Take off</button></p>`;
            }).join('');
            return `<details open style="margin:8px 0"><summary style="cursor:pointer;font-size:15px;font-weight:bold">🛡️ Equipped <span style="opacity:.6;font-weight:normal">(${eqCount} worn)</span></summary><div style="margin-top:6px">${rows}</div></details>`;
          } catch (e) { return ''; }
        })()}
        ${renderAbilitiesSection()}
        ${renderSkillsSection()}
        ${renderSynergiesSection()}
        ${renderAfflictionsSection()}
        ${renderBuildIndicator()}
        ${renderSynergyStirrings()}
        ${renderIntegrationLevel()}
    `;
    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('🧬 You — ' + esc(Game.state.scholar.name || 'Wanderer'))}
      ${view.result ? `<p class="inline-result">✓ ${esc(view.result)}</p>` : ''}
      <div class="inline-body">${bodyHtml}</div>
    </div>`;
    wireInlineX(slot);
    const rewire = (fn, ok) => (e) => { fn(e); inlineView.result = ok; refresh(); };
    slot.querySelectorAll('[data-unequip-slot]').forEach(b => b.onclick = rewire(() => Game.unequip(b.dataset.unequipSlot), 'Taken off.'));
    // DISEASE (Steve 2026-10-09): affliction buttons — examine, treat, folk
    // remedies, medicine, villager care.
    slot.querySelectorAll('[data-aff]').forEach(b => b.onclick = rewire(() => {
      const k = b.dataset.aff;
      if (k === 'examine') Game.examineSick();
      else if (k.indexOf('treat:') === 0) { const ab = k.slice(6); Game.treatDisease(ab); Game.gainAbilityXP(ab, 1); }
      else if (k.indexOf('folk:') === 0) Game.folkRemedy(k.slice(5));
      else if (k.indexOf('med:') === 0) Game.useMedicine(k.slice(4));
      else if (k.indexOf('vexamine:') === 0) Game.examineSick(k.slice(9));
      else if (k.indexOf('vtend:') === 0) Game.tendVillager(k.slice(6));
      else if (k.indexOf('vtreat:') === 0) { const parts = k.split(':'); Game.treatVillager(parts[1], parts[2]); }
      else if (k === 'removetick') Game.removeTick();
    }, 'Done.'));
  }

  // LOOT-AS-ACTION (Steve 2026-10-06): the enemy's pack. Per item: take it,
  // leave it, or use it on the spot. Knowledge-gated: unknown items show
  // weight (always known) but not identity/effects.
  function renderLootInline(slot, view) {
    const cid = view.cid;
    const c = (Game.state.corpses || []).find(x => x.id === cid);
    if (!c || c.buried) { slot.innerHTML = ''; inlineView = null; return; }
    const st = Game.status();
    const items = (c.items || []).map((it, idx) => ({ it, idx }))
      .filter(({ it }) => (it.units == null ? 1 : it.units) > 0);
    const who = c.kind === 'monster'
      ? (c.descriptor || c.monsterName || 'the beast')
      : (c.name || 'the body');
    const stage = Game.corpseStageInfo ? Game.corpseStageInfo(c).id : 'fresh';
    const bodyHtml = items.length ? items.map(({ it, idx }) => {
      const nm = Game.itemDisplayName ? Game.itemDisplayName(it) : (it.name || 'something');
      const units = it.units || 1;
      // WEIGHT IS ALWAYS KNOWN (Steve): physical, even when identity isn't.
      const kg = (((it.kg || 0.1)) * units).toFixed(1);
      // kcal gated: unknown meat shows "?", like the pack.
      // KNOWLEDGE GATE (Steve 2026-10-07): kcal hidden for unknown plants, like the pack.
      const kcalStr = (() => { try {
        if (it.foodKind === 'meat' && it.edible === false) return '?';
        if (it.plantId && !String(it.plantId).startsWith('meat_')) {
          const isPlant = (Game.data.plants || []).some(x => x.id === it.plantId);
          if (isPlant && !Game.canShow('plant', it.plantId, 'kcal')) return '?';
        }
        return ((it.kcalEach || 0) * units);
      } catch (e) { return ((it.kcalEach || 0) * units); } })();
      let spoilMark = '';
      try {
        if (it.spoilDay !== undefined && it.spoilDay !== null) {
          const _sb = (Game.spoilBonusDays ? Game.spoilBonusDays() : 0);
          if (it.spoilDay + _sb <= st.day) spoilMark = ' ⚠ spoiled';
          else if (it.spoilDay + _sb === st.day + 1) spoilMark = ' <span class="small" style="opacity:.75">going bad</span>';
        }
      } catch (e) {}
      const left = it._left ? ' <span class="small" style="opacity:.6">(left)</span>' : '';
      const canUse = Game.isUsable ? Game.isUsable(it) : false;
      const canEat = (it.kcalEach || 0) > 0 && it.edible !== false;
      return `<p class="small"${it._left ? ' style="opacity:.55"' : ''}>${itemSpriteHtml(it)}<b>${esc(nm)}</b> x${units} (${kcalStr} kcal · ${kg} kg)${spoilMark}${left}<br>` +
        `<button class="btn ghost sm" data-loottake="${idx}">Take</button>` +
        (canUse ? ` <button class="btn ghost sm" data-lootuse="${idx}">Use</button>` : '') +
        (canEat ? ` <button class="btn ghost sm" data-looteat="${idx}">Eat</button>` : '') +
        (it._left ? '' : ` <button class="btn ghost sm" data-lootleave="${idx}">Leave</button>`) +
        `</p>`;
    }).join('') : '<p class="small">Nothing left worth taking.</p>';
    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('🎒 ' + esc(who) + ' — ' + stage)}
      <p class="small" style="opacity:.7">Take what you want. What's left stays — and meat rots where it lies.</p>
      ${bodyHtml}
    </div>`;
    wireInlineX(slot);
    const rewire = (fn, ok) => (e) => { fn(e); inlineView.result = ok; refresh(); };
    slot.querySelectorAll('[data-loottake]').forEach(b => b.onclick = rewire(() => Game.corpseTakeItem(cid, +b.dataset.loottake), 'Taken.'));
    slot.querySelectorAll('[data-lootuse]').forEach(b => b.onclick = rewire(() => Game.corpseUseItem(cid, +b.dataset.lootuse), 'Used.'));
    slot.querySelectorAll('[data-looteat]').forEach(b => b.onclick = rewire(() => Game.corpseEatItem(cid, +b.dataset.looteat), 'Eaten.'));
    slot.querySelectorAll('[data-lootleave]').forEach(b => b.onclick = rewire(() => {
      const cc = (Game.state.corpses || []).find(x => x.id === cid);
      const it = cc && (cc.items || [])[+b.dataset.lootleave];
      if (it) it._left = true;
    }, 'Left.'));
  }


  // ---------- the one screen ----------
  // map + here-panel, always together. no view switching: the panel adapts to
  // where you stand (haven / wild node / ruin / combat). travel = tap a tile.

  // Tutorial hint: shown until dismissed. One line, then it's gone forever.
  function isTutorialDone() {
    try { return localStorage.getItem('oversight_tutorial_done') === '1'; } catch (e) { return false; }
  }
  function dismissTutorial() {
    try { localStorage.setItem('oversight_tutorial_done', '1'); } catch (e) {}
    const el = document.getElementById('taphint');
    if (el) el.style.display = 'none';
  }

  // ============ D-PAD MOVEMENT + STEP ANIMATOR ============
  // The d-pad is the PRIMARY movement: 8 directions, one press = one step.
  // Each step animates tile-to-tile (FLIP, eased) and takes a visible beat —
  // movement costs time you can feel, never an instant teleport.
  // Tap-to-move stays as the accessibility alternative, and it now walks the
  // FULL path step-by-step instead of jumping.
  const MoveAnim = S.MoveAnim;
  function expHeadHTML(st) {
    return bar('scattering://field', `${dialHTML(st)}<span>day ${st.day} · ${st.dayPart}<br><span style="font-size:11px;opacity:.7">${esc(st.dayPartHint)}</span></span>${Game.partyHud()}`);
  }
  // D-PAD: compact floating pad docked bottom-right of the grid — the thumb
  // zone on a one-handed phone. It overlays the grid (never pushes layout,
  // never breaks the one-screen rule) and collapses to 🧭 when you need to
  // see the tiles underneath. ■ stops a walk in progress.
  function dpadHTML() {
    const dirs = [
      [-1, -1, '↖', 'northwest'], [0, -1, '↑', 'north'], [1, -1, '↗', 'northeast'],
      [-1, 0, '←', 'west'], null, [1, 0, '→', 'east'],
      [-1, 1, '↙', 'southwest'], [0, 1, '↓', 'south'], [1, 1, '↘', 'southeast'],
    ];
    const btns = dirs.map(d => d
      ? `<button class="dpbtn" data-dx="${d[0]}" data-dy="${d[1]}" aria-label="step ${d[3]}">${d[2]}</button>`
      : `<button class="dpbtn dpstop" id="dp-stop" aria-label="stop walking" title="Stop">■</button>`).join('');
    // SIDE TOGGLE (Steve 2026-10-05): tap to switch D-pad left/right.
    // Actions fill the other side.
    return `<div class="dpad" id="dpad" role="group" aria-label="walk pad">${btns}<button class="dpmin" id="dp-min" aria-label="hide walk pad">–</button><button class="dpside" id="dp-side" aria-label="switch dpad side" title="Move pad to other side">⇄</button></div>`;
  }
  // The animator's game-logic hook: resolve the step against the CURRENT
  // position at execution time and run exactly one Game step — monsters,
  // animals, villagers, and the 1-tick time cost all ride along per step.
  function moveStepHook(step) {
    step._sig = moveSig();
    if (Game.inCombat()) {
      const p = Game.tbFighter('p');
      if (!p || !Game.tbIsPlayerTurn()) { Game.say('Not your turn — hold.'); return { moved: false }; }
      const tx = p.mx + step.dx, ty = p.my + step.dy;
      // BARRIER EXIT (Steve 2026-10-06): pushing off the grid edge in combat
      // attempts a barrier crossing. Walking along the edge is safe.
      // A crossing is deliberate — kill hold-to-move so a held finger doesn't
      // chain-cross into the next node unintentionally.
      if (tx < 0 || tx > 8 || ty < 0 || ty > 8) {
        const exited = Game.tbBarrierExit(step.dx, step.dy);
        if (exited) MoveAnim.clearHold();
        return { moved: !!exited };
      }
      const mlBefore = p.moveLeft;
      const moved = !!Game.tbPlayerMove(tx, ty);
      // TURN BOUNDARY (Steve): if this step ended the turn (moveLeft reset for
      // a fresh turn), kill hold-to-move. A held D-pad finger must not spend
      // the NEW turn's movement — each turn starts with a conscious input.
      const pAfter = Game.tbFighter('p');
      if (pAfter && Game.tbIsPlayerTurn() && pAfter.moveLeft > mlBefore) {
        MoveAnim.clearHold();
      }
      return { moved };
    }
    const s = Game.state.scholar;
    const tx = (s.mx ?? 4) + step.dx, ty = (s.my ?? 4) + step.dy;
    // NODE EXIT (Steve 2026-10-04): stepping off the 9x9 rim crosses to the next
    // node automatically — no tap-yourself, no confirmation. Blocked exits stop
    // you with a reason.
    if (tx < 0 || tx > 8 || ty < 0 || ty > 8) {
      const r = Game.tryNodeExit(step.dx, step.dy);
      if (r && r.blocked) toast(r.blocked.blockType === 'creek' ? '🌊 Creek blocks the way — bridge it or swim it.' : `🚧 Blocked ${r.dir} — clear the way first.`);
      // NODE EXIT (Steve 2026-10-06): a successful crossing kills hold-to-move.
      // A held finger must not chain-travel into the next node unintentionally.
      if (r && r.moved) MoveAnim.clearHold();
      return { moved: !!(r && r.moved) };
    }
    const moved = step.kind === 'path' ? Game.pathStep(tx, ty) : Game.microMove(tx, ty);
    // A blocked path step kills the rest of the walk — the world changed.
    if (!moved && step.walkId) return { moved: false, purge: step.walkId };
    return { moved: !!moved };
  }
  function renderMoveGrid() {
    const g = document.querySelector('.ord-gridwrap .detail');
    if (g) g.innerHTML = renderDetail(Game.status());
  }
  // Sync signature: what counts as "something actually changed" this step.
  function moveSig() {
    const st = Game.status();
    return {
      log: (Game.state.log || []).length, day: st.day, part: Game.dayPart,
      combat: Game.inCombat(), over: !!st.over,
      tbm: Game.inCombat() && Game.tbFighter('p') ? Game.tbFighter('p').moveLeft : -1,
    };
  }
  // DPAD PERF (Steve 2026-10-07): syncAfterMove runs after EVERY step during
  // fast movement. Rebuilding + re-wiring the action bars each step is the
  // heaviest main-thread cost in the walk loop. The bars usually render
  // identical HTML between adjacent tiles — skip the DOM write (and the
  // re-wire) when nothing actually changed. Visual output is identical.
  function setHTMLCached(el, html) {
    if (!el) return false;
    if (el._cachedHTML === html) return false;
    el._cachedHTML = html;
    el.innerHTML = html;
    return true;
  }
  function syncAfterMove(step, res) {
    // The player moved: any open tile panel is now about somewhere else.
    const info = document.getElementById('inlineslot');
    if (info && res && res.moved) info.innerHTML = '';
    const before = step._sig, now = moveSig();
    const big = !before || now.log !== before.log || now.day !== before.day ||
      now.part !== before.part || now.combat !== before.combat ||
      now.over !== before.over || now.tbm !== before.tbm;
    // Big changes (day part turned, combat started/ended, something was
    // said) get the full re-render — the grid is already in its final
    // position from the animation, so nothing jumps.
    if (big) { expeditionScreen(); return; }
    // Light sync: the clock visibly advances EVERY step — the day-tick bar
    // drains and the dial turns. That's the time cost, made visible.
    // Cached writes: identical HTML between steps skips the DOM churn.
    const st = Game.status();
    setHTMLCached(document.getElementById('exphead'), expHeadHTML(st));
    setHTMLCached(document.getElementById('daytickwrap'), dayTickBar(st));
    setHTMLCached(document.querySelector('.ord-status'), statusBars(st));
    // ACTIONS (Steve 2026-10-05): buttons must refresh EVERY step. The old
    // code only updated them on "big" changes, so they'd disappear or appear
    // late as the player moved. Contextual actions depend on position.
    const actWrap = document.querySelector('.ord-actions');
    if (actWrap) {
      const inCombat = Game.inCombat();
      const html = `
        <div class="ord-self">${inCombat ? combatActionsHTML(st) : selfBarHTML(st)}</div>
        <div class="ord-ctx">${inCombat ? '' : contextBarHTML()}</div>
        <div class="ord-target">${targetBarHTML()}</div>
        <div class="ord-danger">${dangerBarHTML()}</div>
        <div class="ord-ability">${abilityBarHTML()}</div>
        ${feedbackHTML()}`;
      // Re-wire the new buttons (each bar has its own wirer) — but only
      // when the HTML actually changed; re-wiring identical buttons is
      // pure main-thread cost during fast movement.
      if (setHTMLCached(actWrap, html)) {
        try { wireSelfBar(); } catch (e) {}
        try { wireContextBar(); } catch (e) {}
        try { wireAbilityBar(); } catch (e) {}
      }
    }
  }
  MoveAnim.hooks.step = moveStepHook;
  MoveAnim.hooks.render = renderMoveGrid;
  MoveAnim.hooks.sync = syncAfterMove;
  MoveAnim.hooks.gridEl = () => document.querySelector('.ord-gridwrap .detail');
  // D-PAD PRESS: immediate first step + hold-to-keep-walking. A manual step
  // cancels any in-progress tap-to-move path — hands on the pad win.
  function dpadPress(dx, dy) {
    if (targeting) { toast('Pick a target first — or ✕ to cancel.'); return; }
    if (Game.inCombat() && !Game.tbIsPlayerTurn()) { Game.say('Not your turn — hold.'); refresh(); return; }
    MoveAnim.purgeKind('path');
    MoveAnim.setHold({ dx, dy });
    MoveAnim.enqueue({ dx, dy, kind: 'step', ms: MoveAnim.stepMs });
  }
  // TAP-TO-MOVE (accessibility alternative): the FULL path walks step by
  // step through the animator — never a teleport. onDone(ok) fires when the
  // walk's steps all resolve (ok=false if interrupted or blocked).
  let walkSeq = 0;
  function walkPathAnimated(tx, ty, onDone) {
    if (Game.inCombat()) return false;
    const path = Game.beginPathWalk(tx, ty);
    if (!path) { expeditionScreen(); return false; } // the say() needs a render
    if (!path.length) { if (onDone) onDone(true); return true; }
    const walkId = 'w' + (++walkSeq);
    MoveAnim.purgeKind('path');
    let px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
    let pending = 0, okAll = true;
    for (const [x, y] of path) {
      pending++;
      MoveAnim.enqueue({ dx: x - px, dy: y - py, kind: 'path', walkId, ms: MoveAnim.pathMs })
        .then((ok) => { okAll = okAll && ok; if (--pending === 0 && onDone) onDone(okAll); });
      px = x; py = y;
    }
    return true;
  }
  function wireDpad() {
    const pad = document.getElementById('dpad');
    if (pad) {
      // DOCKED (Steve 2026-10-05): the pad lives in the fixed bottom bar now —
      // no more dragging, no more saved positions, no more edging off-screen.
      // (Drag-to-move retired; the pad is fixed by design.)
      pad.querySelectorAll('.dpbtn[data-dx]').forEach((b) => {
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try { b.setPointerCapture(e.pointerId); } catch (_) {}
          b.classList.add('held');
          dpadPress(+b.dataset.dx, +b.dataset.dy);
        });
        const release = () => { b.classList.remove('held'); MoveAnim.clearHold(); MoveAnim.purgeHold(); };
        b.addEventListener('pointerup', release);
        b.addEventListener('pointercancel', release);
        b.addEventListener('lostpointercapture', release);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      });
      const stop = document.getElementById('dp-stop');
      if (stop) stop.addEventListener('click', () => { MoveAnim.stopAll(); toast('Stopped.'); });
      const min = document.getElementById('dp-min');
      if (min) min.addEventListener('click', () => {
        pad.classList.add('hidden');
        const show = document.getElementById('dpshow');
        if (show) show.classList.remove('hidden');
      });
      // SIDE TOGGLE (Steve 2026-10-05): switch D-pad left/right.
      const side = document.getElementById('dp-side');
      if (side) side.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = Game.dpadSide();
        Game.setDpadSide(cur === 'right' ? 'left' : 'right');
        refresh();
      });
    }
    const show = document.getElementById('dpshow');
    if (show) show.onclick = () => {
      show.classList.add('hidden');
      const p = document.getElementById('dpad');
      if (p) p.classList.remove('hidden');
    };
  }
  // Global: releasing the pointer ANYWHERE stops hold-to-walk. (The pad can
  // be re-rendered mid-hold — the stop must not depend on the button living.)
  window.addEventListener('pointerup', () => { MoveAnim.clearHold(); MoveAnim.purgeHold(); });
  window.addEventListener('pointercancel', () => { MoveAnim.clearHold(); MoveAnim.purgeHold(); });
  // COMBAT CADENCE (Steve 2026-10-06): highlight the acting monster during
  // async stepped turns. Each monster gets a visible beat — no more
  // instantaneous grid jumps.
  window.addEventListener('tb-turn', (e) => {
    try {
      const d = e.detail || {};
      if (d.phase === 'player') {
        // Player's turn: clear highlights, re-render
        document.querySelectorAll('.cell.creature.acting').forEach(el => {
          el.classList.remove('acting');
        });
      } else if (d.phase === 'monster' && d.key) {
        // Monster acting: highlight its cell(s)
        document.querySelectorAll('.cell.creature.acting').forEach(el => {
          el.classList.remove('acting');
        });
        const sel = document.querySelector(`[data-ent="creature:${CSS.escape(d.key)}"]`);
        if (sel) {
          const cell = sel.closest('.cell');
          if (cell) cell.classList.add('acting');
        }
      }
      // Re-render to show the updated state
      if (typeof refresh === 'function') refresh();
    } catch (err) {}
  });
  // DESKTOP QA: arrow keys walk. Only when the walk pad is on screen and the
  // user isn't typing. Key repeat = hold-to-walk.
  document.addEventListener('keydown', (e) => {
    const K = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = K[e.key];
    if (!d || !document.getElementById('dpad')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (targeting) return; // same rule as the pad: pick a target first
    e.preventDefault();
    MoveAnim.enqueue({ dx: d[0], dy: d[1], kind: 'step', ms: MoveAnim.stepMs });
  });
  document.addEventListener('keyup', () => MoveAnim.clearHold());

  // TENT ROOM (Steve 2026-10-08): when you're inside your tent, the grid steps
  // aside — a room screen, not a map. One screen, no scroll: the fire, the
  // vent flap, your pack, sleep, and the way out. Moment-to-moment play
  // never scrolls, even in canvas.
  function tentRoomScreen() {
    const st = Game.status();
    if (st.over) return ending();
    const s = Game.state.scholar;
    const ins = s.insideTent;
    if (!ins) { expeditionScreen(); return; }
    let fireLine = 'No fire — dark and cold canvas.';
    let fireLit = false, fireLow = false;
    try {
      const f = Game.tentFire();
      if (f) {
        fireLit = true;
        const rem = f.till - Game._absTick();
        fireLow = rem < 48;
        fireLine = fireLow ? '🔥 The little fire is burning low — feed it soon.'
          : rem > 128 ? '🔥 The tent fire burns strong. Light dances on the canvas.'
          : '🔥 The tent fire burns steady.';
      }
    } catch (e) {}
    let ventOpen = true;
    try { ventOpen = Game.tentVentOpenAt(ins.tx, ins.ty, ins.cx, ins.cy); } catch (e) {}
    const wx = Game.state.weather;
    const wxLine = wx === 'rain' ? '🌧️ Rain hammers the canvas. In here: dry.'
      : wx === 'cold' ? '❄️ Cold snap outside. In here: out of the wind.'
      : '🌤️ Clear outside. The canvas glows faintly.';
    const smoke = s.tentSmoke || 0;
    const hasFuel = (() => { try { return !!Game.feedFuel(); } catch (e) { return false; } })();
    const rawCount = (s.inventory || []).filter(i => i.rawKcal).length;
    let prev = null;
    try { prev = Game.sleepPreview(); } catch (e) {}
    // TENT BREACH: the encounter panel lives here now — it's IN the tent.
    // BREAK-IT CAMPS-2 (2026-10-08): while it's in here with you, the breach
    // card is the ONLY action — the fire/cook/vent/sleep/exit buttons are
    // suppressed (their Game functions refuse too, via _breachLock).
    const breached = Game.pendingEncounter && Game.pendingInTent;
    let breachCard = '';
    if (breached) {
      const pmid = Game.pendingMonsterId || 'bulldozer';
      const praw = (Game.monsterDisplayName ? Game.monsterDisplayName(pmid) : null) || 'something big';
      const pname = String(praw[0]).toUpperCase() + String(praw).slice(1);
      breachCard = `<div class="card warn"><h3>⚠ ${esc(pname)}</h3>
        <p class="small">It is INSIDE the tent with you. Eyes in the dark, breath on your face.</p>
        <button class="btn sm" id="tr-face">Face it</button></div>`;
    }
    const screen = document.getElementById('screen');
    screen.innerHTML = `
      <div id="exphead">${expHeadHTML(st)}</div>
      <div id="daytickwrap">${dayTickBar(st)}</div>
      <div class="game-cols"><div class="game-col-main">
      ${breachCard}
      <div class="card"><h3>⛺ Your tent — inside</h3>
        <p class="small">${esc(fireLine)}</p>
        <p class="small">${esc(wxLine)}</p>
        <p class="small">Vent flap: <b>${ventOpen ? 'open' : 'closed'}</b>${!ventOpen && fireLit ? ' — smoke has nowhere to go.' : ''}${ventOpen && fireLit ? ' — the draft feeds the fire (burns a little faster).' : ''}</p>
        ${smoke > 60 ? '<p class="small" style="color:#e8a33d">💨 Smoke is building — vent the flap or let the fire die down.</p>' : ''}
        ${prev ? `<p class="small" style="opacity:.6">😴 ${esc(prev.name)} · +${prev.heal} health${prev.note ? `<br>${esc(prev.note)}` : ''}${prev.warn ? `<br>⚠️ ${esc(prev.warn)}` : ''}</p>` : ''}
      </div>
      ${breached ? '' : `<div class="actions">
        ${!fireLit ? '<button class="btn" id="tr-light">🔥 Light tent fire</button>'
          : hasFuel ? '<button class="btn" id="tr-feed">🪵 Feed the fire</button>' : ''}
        ${fireLit && rawCount ? `<button class="btn" id="tr-cook">🍲 Cook (slow, ${rawCount} raw)</button>` : ''}
        <button class="btn sm ghost" id="tr-vent">${ventOpen ? 'Close vent flap' : 'Open vent flap'}</button>
        <button class="btn sm" id="tr-sleep">😴 Sleep</button>
        <button class="btn sm ghost" id="tr-exit">🚪 Exit tent</button>
      </div>`}
      <div class="ord-status">${statusBars(st)}</div>
      </div><div class="game-col-side">
        <div class="ord-narration">${narrationBoxHTML(st, null)}</div>
        ${feedbackHTML()}
      </div></div>`;
    const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = () => { fn(); refresh(); }; };
    wire('tr-light', () => Game.lightTentFire());
    wire('tr-feed', () => Game.feedTentFire());
    wire('tr-cook', () => Game.cookInTent());
    wire('tr-vent', () => Game.setTentVent(!ventOpen));
    wire('tr-sleep', () => Game.sleep());
    wire('tr-exit', () => Game.exitTent());
    wire('tr-face', () => Game.faceTentIntruder());
    try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
  }

  function expeditionScreen() {
    const st = Game.status();
    if (st.over) return ending();
    // TENT ROOM: inside your tent, the room screen replaces the grid.
    try { if (Game.state.scholar && Game.state.scholar.insideTent) return tentRoomScreen(); } catch (e) {}
    // DIALOGUE BOX (Steve 2026-10-05, revising the old "conversation is the one
    // acceptable full-screen interruption" rule): talking no longer takes over
    // the screen. A Pokémon-style box sits under the grid — speaker tab, one
    // line at a time, ▼ to continue — while the map stays visible and tappable.
    // Combat still cancels it; an ended conversation drops the view.
    if (st.inCombat) chatView = null;
    if (chatView) {
      const _cc = Game.convoUI ? Game.convoUI(chatView.vid) : null;
      if (!_cc || !_cc.active) chatView = null;
    }
    // NPCs must be visible on first load, not just after the first step.
    try { Game.ensureVillagerPositions(); } catch (e) {}
    // COMBAT MODE: the action system gets out of the way. Dodge-first.
    // Non-modal sheets close instantly. No dialogs blocking movement, no
    // "are you sure?" — when something is winding up an attack, the only UI
    // that matters is WHERE YOU ARE and WHAT IT'S DOING.
    // (Targeting is NOT canceled here — showTelegraph cancels it when a real
    // telegraph lands. Strike targeting must survive re-renders.)
    if (st.inCombat) {
      if (sheetQueue.some(s => !s.modal)) {
        sheetQueue = sheetQueue.filter(s => s.modal);
        renderSheets();
      }
    }
    // MODE SHIFT: combat gets its own visual skin — darkened edges,
    // claustrophobic grid. You FEEL the game change.
    try { document.body.classList.toggle('in-combat', !!st.inCombat); } catch (e) {}
    // NIGHT: the world gets dark, continuously. --sky-light (0..1) drives the
    // grid dimming in CSS; is-night adds the moonlight tint and fire glow.
    try {
      document.body.classList.toggle('is-night', !!st.isNight);
      document.body.classList.toggle('in-combat', !!st.inCombat);
      document.body.style.setProperty('--sky-light', (st.lightLevel == null ? 1 : st.lightLevel).toFixed(2));
    } catch (e) {}
    // DIAL GLITCH: played once — the System replacing your time-sense.
    if (st.dialGlitch) { try { Game.clearDialGlitch(); } catch (e) {} }
    const n = Game.nodeDetail();

    screen.innerHTML = `
      <div id="exphead">${expHeadHTML(st)}</div>
      <div id="daytickwrap">${dayTickBar(st)}</div>
      <div class="game-cols">
        <div class="game-col-main">
          <div class="ord-gridwrap">
            <div class="detail">${renderDetail(st)}</div>
            ${perceiveHTML()}
            <div id="inlineslot"></div>
          </div>
          <p class="small ord-epithet">👁 ${esc(Game.nodeDetail().epithet)} — this ground, up close</p>
          ${isTutorialDone() ? '' : '<p class="small ord-taphint" id="taphint">🧭 d-pad walks a step · hold to keep walking · tap a far tile to walk the full path · 🗺 walk to the edge, tap yourself, head out <button class="linklike" id="taphint-x" style="font-size:12px">got it</button></p>'}
          <div class="ord-compass">${compassHTML(st)}</div>
          <div id="mapoverlay" class="mapoverlay hidden"></div>
        </div>
        <div class="game-col-side">
          <div class="ord-controls">
            <div class="ord-dpad ${Game.dpadSide() === 'right' ? 'dpad-right' : 'dpad-left'}">${dpadHTML()}</div>
            <div class="ord-actions ${Game.dpadSide() === 'right' ? 'dpad-right' : 'dpad-left'}">
              <div class="ord-self">${st.inCombat ? combatActionsHTML(st) : selfBarHTML(st)}</div>
              <div class="ord-ctx">${st.inCombat ? '' : contextBarHTML()}</div>
              <div class="ord-target">${targetBarHTML()}</div>
              <div class="ord-danger">${dangerBarHTML()}</div>
              <div class="ord-ability">${abilityBarHTML()}</div>
              ${feedbackHTML()}
            </div>
          </div>
          <button class="dpshow hidden" id="dpshow" aria-label="show walk pad">🧭</button>
          <div class="toast-layer" id="toast-layer"></div>
          <div class="ord-narration">${narrationBoxHTML(st, chatView)}</div>
          ${st.activeQuest ? `<div class="ord-quest-top"><p class="small" style="border-left:3px solid #7fd67f;padding:6px 8px;margin:8px 0;background:rgba(127,214,127,0.08);border-radius:4px">📋 ${esc(st.activeQuest.text || (st.activeQuest.giverName + ' needs ' + st.activeQuest.qty + ' ' + st.activeQuest.plant + '.'))}</p></div>` : ''}
          <div class="ord-status">${statusBars(st)}</div>
          <div class="ord-lowermenu">${lowerMenuHTML(st)}</div>
          <div class="ord-panel">${panelFor(st, n)}</div>
          <div class="actions ord-codex">
            <button class="btn sm ghost" id="x-codex">${Game.journalName()} (${st.codexCount})</button>
          </div>
        </div>
      </div>`;

    // MINIMAP IS A MAP, NOT A TELEPORTER. Unexplored tiles are fully hidden —
    // no hints, no guesses. Travel happens on foot: walk to the edge of the
    // COMPASS: tap to expand the full map overlay. Tap ✕ or the backdrop to close.
    const compass = document.getElementById('compass');
    const overlay = document.getElementById('mapoverlay');
    if (compass && overlay) {
      compass.onclick = () => {
        try { if (Game.backfillSeen) Game.backfillSeen(); } catch (e) {}
        const st = Game.state;
        // No travel-destination system exists (the old destination hook was
        // removed) — the map highlights nothing as a destination. renderMap
        // keeps the tset parameter for the highlight machinery.
        const tset = new Set();
        const _seenCount = Object.keys((Game.state.scholar || {}).seenTiles || {}).length;
        overlay.innerHTML = `<div class="mapoverlay-back"></div><div class="mapoverlay-box"><div class="mapoverlay-head"><span>🗺️ World (${_seenCount} seen)</span><button class="btn sm ghost" id="mapoverlay-x">✕</button></div><div class="map minimap">${renderMap(st, tset)}</div></div>`;
        overlay.classList.remove('hidden');
        overlay.querySelector('#mapoverlay-x').onclick = () => overlay.classList.add('hidden');
        overlay.querySelector('.mapoverlay-back').onclick = () => overlay.classList.add('hidden');
        // wire tile taps inside the overlay (Steve 2026-10-06): tapping a
        // node shows its info WITHOUT leaving the map. Tap through freely.
        let mapInfoEl = overlay.querySelector('.map-info');
        if (!mapInfoEl) {
          mapInfoEl = document.createElement('div');
          mapInfoEl.className = 'map-info';
          overlay.querySelector('.mapoverlay-box').appendChild(mapInfoEl);
        }
        overlay.querySelectorAll('.minimap .tile').forEach(el => {
          el.onclick = (ev) => {
            ev.stopPropagation();
            const x = +el.dataset.x, y = +el.dataset.y;
            const tl = Game.tileAt(x, y);
            const seen = Game.mapSeen ? Game.mapSeen(x, y) : null;
            if (!seen) { mapInfoEl.innerHTML = '<span class="dim">Unexplored — you haven\'t been here.</span>'; return; }
            if (x === (Game.map || {}).px && y === (Game.map || {}).py) {
              mapInfoEl.innerHTML = '<b>You are here.</b>';
              return;
            }
            const otherV = (Game.state.otherVillages || []).find(v => v.x === x && v.y === y && v.generated);
            if (otherV) {
              mapInfoEl.innerHTML = `<b>🏘️ ${esc(otherV.name || 'Another village')}</b> — tap again to visit.`;
              el.dataset.village = otherV.id;
              return;
            }
            // MAP IS FOR VIEWING (Steve 2026-10-06): no travel from the map.
            // Travel happens by walking. The map shows where you've been.
            const how = seen === 'shared' ? ' <span class="dim">(shown to you by someone)</span>' : '';
            const glyph = (typeof S !== 'undefined' && S.TILE_GLYPH && tl) ? (S.TILE_GLYPH[tl.type] || '·') : '·';
            const tname = tl ? (((typeof S !== 'undefined' && S.TILE_NAME && S.TILE_NAME[tl.type]) || tl.type)) : 'unknown';
            mapInfoEl.innerHTML = `${glyph} <b>${esc(tname)}</b>${how}.`;
          };
        });
      };
    }
    // 9x9, tap yourself, head out.
    screen.querySelectorAll('.minimap .tile').forEach(el => {
      el.onclick = () => {
        const x = +el.dataset.x, y = +el.dataset.y;
        const info = document.getElementById('inlineslot');
        const tl = Game.tileAt(x, y);
        if (!info) return;
        if (x === st.px && y === st.py) { info.innerHTML = ''; return; }
        // another village on this tile? it's a door, not scenery.
        // FOG (break-it travel 2026-10-09): only on seen tiles — an unseen
        // tile with a generated village reads "Unexplored" below, never the
        // village's name. (villageCard also holds this line at the engine.)
        const _seenTile = Game.mapSeen ? Game.mapSeen(x, y) : null;
        const otherV = _seenTile && (Game.state.otherVillages || []).find(v => v.x === x && v.y === y && v.generated);
        if (otherV && Game.villageCard) {
          const card = Game.villageCard(otherV.id);
          if (card) {
            const btns = (card.actions || []).map((a, i) =>
              `<button class="btn sm" data-vact="${i}">${esc(a.label)}</button>`).join('');
            const hints = (card.actions || []).map(a => `<p class="small" style="opacity:.7">${esc(a.hint || '')}</p>`).join('');
            info.innerHTML = `<div class="card"><p>🏘️ <b>${esc(card.name)}</b><br><span class="small">${esc(card.sub)}</span></p>${hints}<div class="actions">${btns}</div>${card.hint ? `<p class="small" style="opacity:.7">${esc(card.hint)}</p>` : ''}</div>`;
            info.querySelectorAll('[data-vact]').forEach(b => {
              b.onclick = () => {
                const a = card.actions[+b.dataset.vact];
                try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
                Game.villageCardAction(otherV.id, a.id, { giftKcal: a.giftKcal || 0 });
                refresh();
              };
            });
            return;
          }
        }
        const seenHow = Game.mapSeen ? Game.mapSeen(x, y) : null;
        if (!seenHow) {
          info.innerHTML = `<div class="card"><p>🌫 <b>Unexplored.</b><br><span class="small">No one has been there. Walk to the edge and head out to see what's really there.</span></p></div>`;
        } else {
          const via = seenHow === 'shared' ? '<br><span class="small" style="opacity:.7">Someone showed you this ground — you haven\'t walked it yourself.</span>' : '';
          info.innerHTML = `<div class="card"><p>🗺 ${esc(S.TILE_NAME[tl.type] || tl.type)}.<br><span class="small">Walk to the edge of the map to travel there.</span>${via}</p></div>`;
        }
      };
    });
    // detail grid: TAP A TILE = GO THERE. That's the whole interaction model.
    // Walkable tile → you move there (step if adjacent, path if distant). One tap.
    // Monster/animal → popup (fight/hunt). Blocked thing → popup (examine/use).
    // VILLAGERS DON'T BLOCK. Tapping a person walks up to them, then their
    // popup opens (talk/give/teach). People are not walls.
    // Popups are for EXAMINING, never for movement.
    screen.querySelectorAll('.detail .cell').forEach(el => {
      el.onclick = () => {
        const cx = +el.dataset.cx, cy = +el.dataset.cy;
        // TARGETING MODE: tap a highlighted target to pick it. Anything else is ignored.
        if (targeting) { pickTarget(cx, cy); return; }
        const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
        // COMBAT: tap = move (up to speed squares). No popups, no examining.
        // Your turn is for moving and acting — the panel below has your actions.
        if (Game.tbfight) {
          if (!Game.tbIsPlayerTurn()) { Game.say('Not your turn — hold.'); refresh(); return; }
          if (cx === px && cy === py) return; // tapping yourself: nothing
          try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
          Game.tbPlayerMove(cx, cy);
          expeditionScreen();
          return;
        }
        if (cx === px && cy === py) { cellPopup(cx, cy); return; } // yourself: info/travel panel
        const detail = Game.genDetail(Game.map.px, Game.map.py);
        const cell = detail[cy] && detail[cy][cx];
        // monster/animal? popup — you don't stroll through a boar.
        const mon = (typeof Game.playerMonster === 'function') ? Game.playerMonster() : Game.state.scholar.monster;
        const ani = Game.state.scholar.animal;
        if ((mon && mon.mx === cx && mon.my === cy) || (ani && ani.mx === cx && ani.my === cy)) {
          cellPopup(cx, cy); return;
        }
        // someone here? (villagers never block pathing — only terrain does.)
        let villagerThere = null;
        const vpos = Game.state.village && Game.state.village.positions;
        if (vpos) for (const rid of Object.keys(vpos)) {
          if (vpos[rid].mx === cx && vpos[rid].my === cy) { villagerThere = rid; break; }
        }
        // from here on, the tap DOES something (walk) — mark for feedback.
        try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
        // PEOPLE: tap a person → walk NEXT TO them, not onto their tile.
        // Standing inside someone feels wrong, even though NPCs don't block.
        // (Tap their tile again while adjacent = explicit step onto it.)
        if (villagerThere && !Game.tbfight) {
          const vdist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
          if (vdist > 1) {
            // path to the nearest walkable tile adjacent to them
            let best = null, bestD = 999;
            for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
              if (Game.cellProps(detail[ny] && detail[ny][nx]).blocks) continue;
              const path = Game.findPath(px, py, nx, ny);
              if (!path || !path.length) continue;
              if (path.length < bestD) { bestD = path.length; best = [nx, ny]; }
            }
            let walked = false;
            // The sheet opens when the walk LANDS, not when the tap happens.
            const _openAfter = (ok) => { if (ok) personSheet(villagerThere); else cellPopup(cx, cy); };
            if (best) walked = walkPathAnimated(best[0], best[1], _openAfter);
            else walked = walkPathAnimated(cx, cy, _openAfter); // surrounded — walk through as before
            if (!walked) cellPopup(cx, cy); // couldn't start — popup explains why
            return;
          }
          // adjacent: a second tap on the same person (without moving away)
          // is an explicit step onto their tile.
          if (lastPersonTap && lastPersonTap.vid === villagerThere &&
              lastPersonTap.px === px && lastPersonTap.py === py) {
            lastPersonTap = null;
            MoveAnim.purgeKind('path');
            MoveAnim.enqueue({ dx: cx - px, dy: cy - py, kind: 'step', ms: MoveAnim.stepMs })
              .then((ok) => { if (ok) { personSheet(villagerThere); return; } cellPopup(cx, cy); });
            return;
          }
          lastPersonTap = { vid: villagerThere, px, py };
          expeditionScreen();
          personSheet(villagerThere);
          return;
        }
        // walkable? GO. adjacent = one animated step, distant = the FULL path
        // animated step-by-step. Tap-to-move is the accessibility alternative
        // now — the d-pad is primary — but it never teleports.
        if (!Game.cellProps(cell).blocks) {
          const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
          if (dist <= 1) {
            MoveAnim.purgeKind('path');
            MoveAnim.enqueue({ dx: cx - px, dy: cy - py, kind: 'step', ms: MoveAnim.stepMs })
              .then((ok) => { if (ok && villagerThere) personSheet(villagerThere); });
          } else {
            // couldn't start (no path / not enough kcal): the say() from
            // beginPathWalk renders via walkPathAnimated's fallback.
            walkPathAnimated(cx, cy, (ok) => { if (ok && villagerThere) personSheet(villagerThere); });
          }
          return;
        }
        // blocked or unpathable: popup for examine/interact.
        cellPopup(cx, cy);
      };
    });
    // System arrival? Play the animation (once). Full-screen overlay — it's THE moment.
    if (Game.state.systemArrived && !Game.state.systemAnimationShown) {
      Game.state.systemAnimationShown = true;
      systemArrivalAnimation(() => {
        processPendingSheets();
        expeditionScreen();
      });
      return;
    }
    document.getElementById('x-codex').onclick = codexScreen;
    wireDpad();
    const taphintX = document.getElementById('taphint-x');
    if (taphintX) taphintX.onclick = dismissTutorial;
    const pantryBtn = document.getElementById('x-pantry');
    if (pantryBtn) pantryBtn.onclick = () => pantrySheet();
    const cachesBtn = document.getElementById('x-caches');
    if (cachesBtn) cachesBtn.onclick = () => cachesSheet();
    // Village stash buttons (Haven panel). Give = all you carry; Take = 5.
    document.querySelectorAll('[data-stash-give]').forEach(b => b.onclick = () => { Game.donateMaterial(b.dataset.stashGive, 9999); refresh(); });
    document.querySelectorAll('[data-stash-take]').forEach(b => b.onclick = () => { Game.takeMaterial(b.dataset.stashTake, 5); refresh(); });
    document.querySelectorAll('[data-stash-tool]').forEach(b => b.onclick = () => { Game.takeTool(b.dataset.stashTool); refresh(); });
    // Visitors (Haven panel). Trade opens the cart; ware buys are real exchanges.
    document.querySelectorAll('[data-visitor-act]').forEach(b => b.onclick = () => { Game.visitorInteract(b.dataset.visitorAct, b.dataset.how); refresh(); });
    document.querySelectorAll('[data-ware-buy]').forEach(b => b.onclick = () => { const p = b.dataset.wareBuy.split(':'); Game.visitorBuyWare(p[0], +p[1]); refresh(); });
    document.querySelectorAll('[data-ware-sell]').forEach(b => b.onclick = () => { const p = b.dataset.wareSell.split(':'); Game.traderSell(p[0], +p[1]); refresh(); });
    // Membership: remote applications + shelter building (Haven panel).
    document.querySelectorAll('[data-mship-accept]').forEach(b => b.onclick = () => { Game.acceptApplication(b.dataset.mshipAccept); refresh(); });
    document.querySelectorAll('[data-mship-refuse]').forEach(b => b.onclick = () => { Game.refuseApplication(b.dataset.mshipRefuse); refresh(); });
    document.querySelectorAll('[data-mship-build]').forEach(b => b.onclick = () => { Game.buildShelter(); refresh(); });
    // Hierarchy: tribute + demands (Haven panel).
    document.querySelectorAll('[data-link-pay]').forEach(b => b.onclick = () => { Game.payTribute(b.dataset.linkPay); refresh(); });
    // Hierarchy: propose a link (drifter loop 2026-10-08 — was engine-only).
    document.querySelectorAll('[data-link-propose-sub]').forEach(b => b.onclick = () => { Game.proposeLink(b.dataset.linkProposeSub, { asSubordinate: true, tributeKcalPerWeek: 4000 }); refresh(); });
    document.querySelectorAll('[data-link-propose-prim]').forEach(b => b.onclick = () => { Game.proposeLink(b.dataset.linkProposePrim, { asSubordinate: false, tributeKcalPerWeek: 4000 }); refresh(); });
    document.querySelectorAll('[data-demand-yes]').forEach(b => b.onclick = () => { Game.answerDemand(b.dataset.demandYes, true); refresh(); });
    document.querySelectorAll('[data-demand-no]').forEach(b => b.onclick = () => { Game.answerDemand(b.dataset.demandNo, false); refresh(); });
    // Hierarchy: the climb (break-it social r2 2026-10-08 — were engine-only).
    document.querySelectorAll('[data-link-reneg]').forEach(b => b.onclick = () => { Game.renegotiateLink(b.dataset.linkReneg); refresh(); });
    document.querySelectorAll('[data-link-bid]').forEach(b => b.onclick = () => { Game.bidForPrimacy(b.dataset.linkBid); refresh(); });
    document.querySelectorAll('[data-link-break]').forEach(b => b.onclick = () => { Game.breakLink(b.dataset.linkBreak, 'gambit'); refresh(); });
    wirePanel(st, n);
    wireContextBar();
    wireSelfBar();
    wireAbilityBar();
    wireTargetBar();
    wireLowerMenu();
    // PACK MENU (Steve 2026-10-05): PACK status row opens inventory, not a button
    document.querySelectorAll('[data-statclick="pack"]').forEach(el => {
      el.onclick = () => invSheet();
    });
    // THE SYSTEM INTEGRATING INTO YOUR PERCEPTION: post-day-7, the interface
    // gains System styling — glowing borders, overlay accents. You FEEL it.
    try { document.body.classList.toggle('system-live', !!Game.state.systemArrived); } catch (e) {}
    // Inline interaction slot: person panels, assignment, pantry — no overlays.
    renderInlineSlot(st);
    // Pending offers (ability/relic choices) queue as sheets — no screen takeover.
    processPendingSheets();
    // SCROLL PIN (restore): keep the world where the player's eyes were.
    try {
      if (typeof window !== 'undefined' && Math.abs(window.scrollY - _savedY) > 2) window.scrollTo(0, _savedY);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => {
        try { if (Math.abs(window.scrollY - _savedY) > 2) window.scrollTo(0, _savedY); } catch (e) {}
      });
    } catch (e) {}
  }

  // processPendingSheets: ability/relic offers become queued sheets.
  // Deduped by id so re-renders don't double-queue.
  function processPendingSheets() {
    const s = Game.state.scholar;
    if (!s) return;
    // SEQUENCING (Steve): no overlapping modals, ever. The Day 7 cinematic
    // is a full-screen overlay, not a sheet — the gift/relic offers queue
    // BEHIND it. The cinematic's finish callback calls processPendingSheets
    // again, so the gift lands the moment the intro is dismissed.
    try {
      if (document.querySelector('.system-arrival-overlay')) return;
    } catch (e) {}
    if (s.abilityChoices && s.abilityChoices.length && !sheetQueued('offer-ability')) {
      abilitySheet();
    }
    if (s.relicChoices && !sheetQueued('offer-relic')) {
      relicSheet();
    }
    if (s.tableChoices && !sheetQueued('the-table')) {
      tableSheet();
    }
    // MOOT REDESIGN: post-System accusations auto-offer the case file sheet.
    if (s.caseDossierOffer && !sheetQueued('case-file')) {
      const cid = s.caseDossierOffer;
      s.caseDossierOffer = null;
      caseFileSheet(cid);
    }
  }

  function rerender() {
    const st = Game.status();
    if (st.over) return ending();
    expeditionScreen();
  }

  function panelFor(st, n) {
    if (st.pendingEncounter) {
      // NAME DISCIPLINE (Steve): never the true name pre-naming. Village-agreed
      // name wins, else the strange descriptor — same rule as the grid popup.
      const pmid = Game.pendingMonsterId || 'bulldozer';
      const praw = (Game.monsterDisplayName ? Game.monsterDisplayName(pmid) : null) || 'something big';
      const pname = praw[0].toUpperCase() + praw.slice(1);
      // TENT BREACH (Steve 2026-10-08): it's IN the tent with you — different
      // panel, different stakes. Face it and the fight starts at arm's length.
      const inTent = !!Game.pendingInTent;
      const sub = inTent
        ? 'It is INSIDE the tent with you. Eyes in the dark, breath on your face.'
        : 'It crashes from the thicket. It is not going around.';
      return `
      <div class="card warn"><h3>⚠ ${pname}</h3>
      <p class="small">${sub}</p>
      <button class="btn sm" id="p-face">Face it</button></div>`;
    }
    // COMBAT renders in the main column, directly under the grid
    // (ord-combatpanel) — never below the fold. This slot stays empty in combat.
    if (st.inCombat) return '';
    if (n.isHaven) return panelHaven(st);
    return panelNode(st, n);
  }

  // pantrySheet: pack for the day. Non-modal sheet - the world stays visible.
  // Food and water, same sliders, one stockpile.
  // pantry: pack for the day. Inline — food and water, same sliders, one stockpile.
  function renderPantryInline(slot, view) {
    const st = Game.status();
    const pantry = Game.state.village.pantry || [];
    const vWater = Game.state.village.water || { clean: 0, dirty: 0 };
    const carry = st.carryKg;
    const maxCarry = Game.carryCapacity();
    const waterRow = vWater.clean > 0 ? `<div class="card" style="margin:6px 0;padding:8px 10px;border-left:3px solid #4df3ff">
        <p class="small"><b>\uD83D\uDCA7 Water (clean)</b> \u00D7${vWater.clean} L<br>
        <span style="opacity:.7">0 kcal/L \u00B7 1 kg/L \u00B7 from the Haven well</span></p>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="range" min="0" max="${vWater.clean}" value="0" data-pack="water" style="flex:1">
          <span class="small" id="packq-water" style="min-width:44px;text-align:right">0 L</span>
        </div>
      </div>` : '';
    // FAIR SHARE NORM: the village's expectation, shown not enforced. Take
    // what you want — but everyone knows what "fair" looks like, and blatant
    // theft with witnesses present gets confronted. (fairShareNote in game.js.)
    let fairShareHtml = '';
    try {
      const fsn = Game.fairShareNote();
      if (fsn) fairShareHtml = `<p class="small" style="opacity:.65">Fair share is ~${fsn.perPerson} kcal/day each. The pantry holds ~${fsn.daysLeft} days at that pace. Take what you need — people notice what you take.</p>`;
    } catch (e) {}
    const bodyHtml = `
      <p class="small">Slide to pack. Carrying ${carry.toFixed(1)}/${maxCarry} kg — ${(() => { try { return Game.burden().name; } catch (e) { return 'light'; } })()}.</p>
      ${fairShareHtml}
      ${(() => { try {
        // FOOD REALITY: storage has real caps. Expand them with materials + labor.
        const cap = Game.pantryCapKcal ? Game.pantryCapKcal() : 0;
        const wcap = Game.waterCapL ? Game.waterCapL() : 0;
        const pkcal = Game.pantryKcal ? Game.pantryKcal() : 0;
        const wtot = (vWater.clean || 0) + (vWater.dirty || 0);
        const tier = Game.storageTier ? Game.storageTier() : 0;
        const builders = Game.specialistsHere ? Game.specialistsHere('builder') : [];
        return `<p class="small" style="opacity:.8">\uD83D\uDCE6 Pantry ${Math.round(pkcal).toLocaleString()} / ${Math.round(cap).toLocaleString()} kcal \u00B7 \uD83D\uDCA7 Water ${wtot} / ${wcap}L \u00B7 Storage tier ${tier}</p>
        <p><button class="btn ghost sm" data-expand-storage>Expand storage${builders.length ? ` (${builders[0].name} can help)` : ''}</button></p>`;
      } catch (e) { return ''; } })()}
      ${waterRow}
      <div id="packlist">
      ${(() => {
        // PANTRY KNOWLEDGE GATE (Steve 2026-10-06): the stash must not reveal
        // names, counts, or stats of items you haven't discovered. Known items
        // render as before (original pantry index kept in data-pack so
        // takeFromPantryBulk still lines up). Unknown items collapse into one
        // honest line -- no count, no stats, no take-slider: you can't
        // deliberately pack what you can't identify. Aggregate pantry kcal
        // above stays (the pile's size is observable; its contents aren't).
        // Caches are untouched -- you buried them, you know what's in them.
        const knownIdx = [], unknownIdx = [];
        pantry.forEach((p, idx) => { (Game.pantryItemKnown(p) ? knownIdx : unknownIdx).push(idx); });
        const rows = knownIdx.map(idx => {
          const p = pantry[idx];
          const density = p.kg ? Math.round(p.kcalEach / p.kg) : 0;
          const unit = p.unit || 'item';
          const dname = Game.itemDisplayName ? Game.itemDisplayName(p) : (p.name || 'something');
          return `<div class="card" style="margin:6px 0;padding:8px 10px">
          <p class="small">${itemSpriteHtml(p)}<b>${dname}</b> \u00D7${p.units} ${unit}s
          ${p.safe ? '' : ' \u26A0 UNSAFE'}${(Game.isSpoiled && Game.isSpoiled(p)) ? ' \u26A0 SPOILED' : ''}${p.needsCooking ? ' \uD83C\uDF73 needs cooking' : ''}${(() => { try { const fm = Game.foodMarker ? Game.foodMarker(p) : ''; return fm ? ' \u00B7 ' + fm : ''; } catch (e) { return ''; } })()}<br>
          <span style="opacity:.7">${(() => { try {
            // KNOWLEDGE GATE (Steve 2026-10-07): pantry shows kcal only if YOU
            // know it's food. Name-known (L1) isn't enough.
            if (p.plantId && !String(p.plantId).startsWith('meat_')) {
              const isPlant = (Game.data.plants || []).some(x => x.id === p.plantId);
              if (isPlant && !Game.canShow('plant', p.plantId, 'kcal')) return '?';
            }
            return p.kcalEach;
          } catch (e) { return p.kcalEach; } })()} kcal/${unit} \u00B7 ${p.kg} kg/${unit} \u00B7 <b>${density} kcal/kg</b></span></p>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="range" min="0" max="${p.units}" value="0" data-pack="${idx}" style="flex:1">
            <span class="small" id="packq-${idx}" style="min-width:44px;text-align:right">0</span>
          </div>
        </div>`;
        });
        // WEIGHT IS ALWAYS KNOWN (Steve 2026-10-06): you can heft the pile even
        // when you can't name what's in it. Names/counts/stats stay gated;
        // the aggregate mass is physical and honest.
        if (unknownIdx.length) {
          const unknownKg = unknownIdx.reduce((t, idx) => t + ((pantry[idx].kg || 0.1) * (pantry[idx].units || 1)), 0);
          rows.push(`<div class="card" style="margin:6px 0;padding:8px 10px;border-left:3px solid #8a8a8a">
          <p class="small"><b>Unfamiliar provisions</b> · ~${unknownKg.toFixed(1)} kg<br>
          <span style="opacity:.7">Things in the pile you don't recognize yet -- no telling what's what, but you can feel the heft. Learn them (forage, ask around, codex) to pack them deliberately.</span></p>
        </div>`);
        }
        return rows.length ? rows.join('') : '<p class="small">Empty.</p>';
      })()}
      </div>
      <div class="card" id="packsummary" style="border-left:3px solid #7fd67f">
        <p class="small"><b>Packing:</b> <span id="ps-items">nothing yet</span></p>
        <p class="small">\u2696\uFE0F <span id="ps-kg">0.0</span> kg \u00B7 \uD83D\uDD25 <span id="ps-kcal">0 kcal</span> \u00B7 \uD83D\uDCA7 <span id="ps-water">0 L</span></p>
      </div>`;

    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\uD83C\uDF75 Pantry — pack for the day')}
      ${view.result ? `<p class="inline-result">✓ ${esc(view.result)}</p>` : ''}
      <div class="inline-body">${bodyHtml}</div>
      <div class="inline-btns"><button class="btn sm" data-act="pack" id="pack-btn" disabled>Pack it</button></div>
    </div>`;
    wireInlineX(slot);
    const update = () => {
      let kg = 0, kcal = 0, wl = 0;
      const parts = [];
      slot.querySelectorAll('[data-pack]').forEach(sl => {
        const key = sl.dataset.pack, q = +sl.value;
        const qEl = slot.querySelector('#packq-' + key);
        if (key === 'water') {
          if (qEl) qEl.textContent = q + ' L';
          if (q > 0) { kg += q; wl += q; parts.push(`${q}L water`); }
          return;
        }
        const idx = +key;
        if (qEl) qEl.textContent = q;
        if (q > 0) {
          const p = pantry[idx];
          kg += q * (p.kg || 0);
          kcal += q * p.kcalEach;
          parts.push(`${q} ${(Game.itemDisplayName ? Game.itemDisplayName(p) : (p.name || 'something'))}`);
        }
      });
      slot.querySelector('#ps-items').textContent = parts.length ? parts.join(', ') : 'nothing yet';
      slot.querySelector('#ps-kg').textContent = kg.toFixed(1);
      slot.querySelector('#ps-kcal').textContent = Game.fmtKcal(kcal);
      slot.querySelector('#ps-water').textContent = wl + ' L';
      const over = carry + kg > maxCarry;
      slot.querySelector('#ps-kg').style.color = over ? '#e05c5c' : '';
      const packBtn = slot.querySelector('#pack-btn');
      if (packBtn) packBtn.disabled = !parts.length || over;
    };
    slot.querySelectorAll('[data-pack]').forEach(sl => { sl.oninput = update; });
    update();
    // FOOD REALITY: expand storage from the pantry view.
    const expBtn = slot.querySelector('[data-expand-storage]');
    if (expBtn) expBtn.onclick = () => { Game.expandStorage(); refresh(); };
    slot.querySelector('#pack-btn').onclick = () => {
      const sel = {};
      slot.querySelectorAll('[data-pack]').forEach(sl => { if (+sl.value > 0) sel[sl.dataset.pack] = +sl.value; });
      Game.takeFromPantryBulk(sel);
      // obvious feedback: packed, sliders reset, summary confirms.
      const n = Object.values(sel).reduce((a, b) => a + b, 0);
      inlineView = { kind: 'pantry', result: `Packed ${n} item${n === 1 ? '' : 's'}.`, mapKey: inlineMapKey() };
      refresh();
    };
  }

  // pantrySheet is now inline — alias so no call site breaks.
  function pantrySheet() {
    inlineView = { kind: 'pantry', result: null, mapKey: inlineMapKey() };
    refresh();
  }

  // cachesSheet: your buried goods + bury form. Inline — the world stays visible.
  function cachesSheet() {
    inlineView = { kind: 'caches', result: null, mapKey: inlineMapKey() };
    refresh();
  }

  function renderCachesInline(slot, view) {
    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('📍 Caches & buried goods')}
      ${view.result ? `<p class="inline-result">✓ ${esc(view.result)}</p>` : ''}
      <div class="inline-body">${Game.cachesHtml()}</div>
    </div>`;
    wireInlineX(slot);
    slot.querySelectorAll('[data-cache-dig]').forEach(b => b.onclick = () => {
      Game.digUpCache(b.dataset.cacheDig);
      inlineView = { kind: 'caches', result: 'Dug up.', mapKey: inlineMapKey() };
      refresh();
    });
    // RATION DRAWER: take some from a cache without digging it all up.
    // Only show the confirmation when the engine actually handed something
    // over — a refused take (wrong node, too heavy) already explains itself.
    slot.querySelectorAll('[data-cache-take]').forEach(b => b.onclick = () => {
      const parts = (b.dataset.cacheTake || '').split(':');
      const qEl = slot.querySelector('#take-qty-' + parts[0]);
      const qty = Math.max(1, (qEl && +qEl.value) || 1);
      const res = Game.takeFromCache(parts[0], +(parts[1] || 0), qty);
      inlineView = { kind: 'caches', result: res ? 'Drew from the cache.' : null, mapKey: inlineMapKey() };
      refresh();
    });
    const buryGo = slot.querySelector('#bury-go');
    if (buryGo) buryGo.onclick = () => {
      const sel = slot.querySelector('#bury-what').value; // "material:branch" | "food:3"
      const qty = Math.max(1, +slot.querySelector('#bury-qty').value || 1);
      const [kind, key] = sel.split(':');
      // HONESTY (miser break-it 2026-10-08): only confirm when the engine
      // actually buried something — a refused bury explains itself, and the
      // old code stamped "Buried." even on refusals (mirrors takeFromCache
      // wiring above, which already gates its confirmation on res).
      const res = Game.buryCache(kind, kind === 'food' ? +key : key, qty);
      inlineView = { kind: 'caches', result: res ? 'Buried.' : null, mapKey: inlineMapKey() };
      refresh();
    };
  }


  // SLEEP: quality depends on where you are: bunk > tent > hall floor > cold ground.
  // sleepHintHTML: sleep quality info only — the button lives in the self bar.
  function sleepHintHTML() {
    let prev = null;
    try { prev = Game.sleepPreview(); } catch (e) {}
    if (!prev) return '';
    return `<p class="small" style="opacity:.6">😴 ${esc(prev.name)} · +${prev.heal} health · energy restored${prev.note ? `<br>${esc(prev.note)}` : ''}${prev.warn ? `<br>⚠️ ${esc(prev.warn)}` : ''}</p>`;
  }

  function panelHaven(st) {
    const v = Game.villageInfo();
    const vs = Game.data.villagers;
    const roster = Game.villageRoster();
    const mains = roster.filter(r => r.isMain);
    const bg = roster.filter(r => !r.isMain);
    const net = st.villageEat - st.villageGive;
    return `
      <div class="card"><h3>🏠 HAVEN — ${st.rosterCount} souls</h3>
      <p class="small"><i>${v.atmos}</i></p>
      <p class="small">Pantry: ${Game.fmtKcal(st.pantryKcal)} (${st.pantryDays >= 999 ? 'holding steady — the village feeds itself' : `about ${st.pantryDays} days at this burn`})${st.hungryDays ? ' · ⚠ HUNGRY day ' + st.hungryDays : ''}</p>
      <p class="small">💧 Water: ${st.waterClean}L clean / ${st.waterDirty}L dirty</p>
      ${(() => {
        // STORES GATE (Steve 2026-10-04): the pantry and village stash are
        // physical — inside the hall, or via the System at Full Integration.
        // Outside the building they disappear: no disabled buttons, no hints.
        // (Caches stay: they're your buried goods, dug up where they lie.)
        const acc = Game.havenStoresAccess ? Game.havenStoresAccess() : 'inside';
        if (acc === 'none') return '';
        const sysNote = acc === 'remote'
          ? '<p class="small">◈ SYSTEM: requisition from anywhere — the pantry manifests.</p>' : '';
        return `${sysNote}
        <button class="btn sm" id="x-pantry">Take from pantry</button>
        <div id="haven-stores-slot"></div>
        ${Game.stashHtml()}
        ${Game.visitorHtml ? Game.visitorHtml() : ''}`;
      })()}
      <button class="btn sm ghost" id="x-caches">📍 Caches</button>
      ${sleepHintHTML()}
      ${(() => {
        try {
          const gs = Game.growthStatus();
          const m = Game.mshipState();
          const away = Game.awayMembers().length;
          const apps = (m.applications || []).map(a => {
            const j = Game.judgeApplication(a);
            return `<p class="small">📨 <b>${a.name}</b>${a.fromVillageName ? ' <span style="opacity:.7">of ' + a.fromVillageName + '</span>' : ''} — ${a.formerOccupation || 'drifter'} · "${a.reason}"<br><span style="opacity:.7">${j.reasons.join(' ')}</span><br><button class="btn sm" data-mship-accept="${a.id}">Accept</button> <button class="btn sm ghost" data-mship-refuse="${a.id}">Turn away</button></p>`;
          }).join('');
          return `<p class="small" style="margin-top:6px"><b>🏠 Membership:</b> ${gs.used}/${gs.housing} housed${away ? ' · ' + away + ' away (still ours — no check-ins)' : ''}${gs.room <= 0 ? ' · ⚠ FULL' : ''}</p>
          <div class="btnrow"><button class="btn sm ghost" data-mship-build>🔨 Build shelter (+2, 10 wood)</button></div>
          ${apps ? `<div style="margin-top:4px"><p class="small"><b>Remote applications:</b></p>${apps}</div>` : ''}
          ${(() => {
            try {
              const links = Game.villageLinks('haven');
              let html = '';
              if (links.length) {
                html = '<div style="margin-top:4px"><p class="small"><b>⛓️ Links:</b></p>' + links.map(l => {
                  const other = l.subordinate === 'haven' ? l.primary : l.subordinate;
                  const nm = Game._ovName(other);
                  const sub = l.subordinate === 'haven';
                  const paid = (l.tributePaidWeek >= Math.floor(Game.state.scholar.day / 7));
                  let h = `<p class="small">⛓️ ${sub ? 'Bows to ' + nm : nm + ' bows to Haven'} · trust ${l.trust} · tribute ${l.tributeKcalPerWeek.toLocaleString()} kcal/wk${sub ? (paid ? ' (paid ✓)' : ' (DUE ⚠)') : ''}`;
                  if (sub && !paid) h += ` <button class="btn sm" data-link-pay="${l.id}">Pay tribute</button>`;
                  // BREAK-IT (social r2 2026-10-08): renegotiateLink /
                  // bidForPrimacy / breakLink were engine-only — a
                  // subordinate could never climb or break away (same class
                  // as the proposeLink gap the drifter loop wired).
                  if (sub) h += ` <button class="btn sm ghost" data-link-reneg="${l.id}">Renegotiate</button> <button class="btn sm ghost" data-link-bid="${l.id}">Bid for primacy</button> <button class="btn sm ghost" data-link-break="${l.id}">🗡️ Break away</button>`;
                  if (l.pendingDemand) h += `<br>📯 ${l.pendingDemand.detail}<br><button class="btn sm" data-demand-yes="${l.id}">Honor it</button> <button class="btn sm ghost" data-demand-no="${l.id}">Refuse</button>`;
                  return h + '</p>';
                }).join('') + '</div>';
              }
              // PROPOSE (drifter loop 2026-10-08): proposeLink had no UI — the
              // whole link system was engine-only and unreachable. Court them
              // first (join, learn their codex, deeds); cold proposals decline.
              if (typeof Game.proposeLink === 'function') {
                const linked = {};
                for (const l of links) { linked[l.primary] = 1; linked[l.subordinate] = 1; }
                const cands = (Game.state.otherVillages || []).filter(v => v.id !== 'haven' && !linked[v.id]);
                if (cands.length) {
                  html += '<div style="margin-top:4px"><p class="small" style="opacity:.75"><b>⛓️ No link yet — propose one:</b></p>' + cands.map(v => {
                    const op = v.opinion || 0;
                    const opTxt = op >= 20 ? ' (they think well of us)' : op <= -20 ? ' (they think poorly of us)' : '';
                    return `<p class="small">${v.name || v.id}${opTxt}<br><button class="btn sm ghost" data-link-propose-sub="${v.id}">Bow to them (4k kcal/wk)</button> <button class="btn sm ghost" data-link-propose-prim="${v.id}">Ask them to bow</button></p>`;
                  }).join('') + '</div>';
                }
              }
              return html;
            } catch (e) { return ''; }
          })()}`;
        } catch (e) { return ''; }
      })()}
      <p class="small" style="opacity:.75">${st.rosterCount} mouths need ${st.villageEat.toLocaleString()}/day · the village brings in ${st.villageGive.toLocaleString()} · shortfall ${net.toLocaleString()}/day</p>
      ${(() => {
        // WHO'S PULLING WEIGHT (Steve 2026-10-09): per-person actual vs expected.
        // Knowledge-gated like everything: you see effort bands, not numbers
        // you haven't earned. (Bands are honest — they come from the ledger.)
        const rows = (st.villageContrib || []).filter(r => !r.me);
        if (!rows.length) return '';
        const band = r => {
          if (!r.expected) return '—';
          const e = r.produced / r.expected;
          return e >= 0.9 ? '💪' : e >= 0.5 ? '👍' : e >= 0.2 ? '😟' : '⚠️';
        };
        return `<p class="small" style="margin-top:4px"><b>Who's pulling weight</b> <span style="opacity:.6">(today vs their own capacity)</span><br>` +
          rows.map(r => `${band(r)} ${esc(r.name)}`).join(' · ') + '</p>';
      })()}
      <p class="small">Haven survives when: ${Game.journalName()} 10 (${st.codexCount}) · Pantry ${Game.fmtKcal(8000)}+ (${Game.fmtKcal(st.pantryKcal)})</p>
      <p class="small" style="opacity:.7">Tap a person in the grid to talk. They\'re living their lives.</p>
      ${mains.map(p => {
        const h = (Game.state.village.health && Game.state.village.health[p.id] !== undefined) ? Game.state.village.health[p.id] : 100;
        const hb = h >= 70 ? '🟢' : h >= 40 ? '🟡' : '🔴';
        const lang = p.langNote ? ` <span style="opacity:.7">${p.langNote}</span>` : '';
        const conf = p.conflictNote ? `<br><span style="opacity:.7">${p.conflictNote}</span>` : '';
        // OCCUPATION GATE (Steve 2026-10-06): gated until learned, like names.
        // Unknown → omitted, not "???".
        const occ = (typeof Game.occupationLabel === 'function') ? Game.occupationLabel(p.id) : p.formerOccupation;
        const occBit = occ ? ` — ${esc(occ)}` : '';
        return `<p class="small">${hb} <b>${p.name}</b>${occBit} (${h})${lang}${conf}</p>`; }).join('')}
      <p class="small" style="margin-top:8px;opacity:.75"><b>Also here:</b> ${bg.map(p => `${p.name}`).join(' · ')}</p>
      ${(() => {
        const asg = (Game.state.village.assignments || {});
        const ids = Object.keys(asg);
        if (!ids.length) return '<p class="small" style="opacity:.6">📋 No one assigned. Tap a person → Assign task to direct them.</p>';
        const tasks = Game.delegateTasks();
        const lines = ids.map(rid => {
          const vp = (Game.data.villagers || []).find(v => v.id === rid) /* unified: hydrated seeds are in villagers */ || {};
          const t = tasks[asg[rid].task];
          return t ? `${t.icon} ${(vp.name || '?').split(' ')[0]} — ${t.name}` : null;
        }).filter(Boolean);
        return `<p class="small" style="margin-top:6px"><b>📋 Assigned:</b><br>${lines.join('<br>')}</p>`;
      })()}
      <div class="btnrow">
      </div></div>`;
  }

  function panelNode(st, n) {
    // Self-care (Eat/Sleep/Pack/Wait) lives in the persistent self bar above
    // the fold. This panel is information only — no redundant buttons.
    return `
      <div class="card"><h3>${esc(n.epithet).toUpperCase()}</h3>
      <p class="small">${esc(n.title)}</p>
      <p class="small" style="opacity:.7">Tap a square to see what you can do there.</p></div>`;
  }

  // COMBAT CARD: compact, non-obstructive, progressive disclosure.
  // Steve's rules: it arrives, it doesn't intrude. First encounter shows a
  // strange descriptor and a vague threat sense — never the true name, never
  // numbers. Stats unlock through survival (rounds), hits, and the village
  // naming the beast. Knowing is earned.
  // COMBAT ACTIONS (Steve 2026-10-05): buttons live in the combined actions
  // area, not a separate combat card. Threat/status stays as a compact header.
  function combatActionsHTML(st) {
    const tf = Game.tbfight;
    if (!tf) return '';
    const p = Game.tbFighter('p');
    const mons = tf.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
    const adj = p ? mons.filter(m => Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)) <= (Game.equippedWeapon ? Game.equippedWeapon().range : 1)) : [];
    const wrange = Game.equippedWeapon ? Game.equippedWeapon().range : 1;
    const wname = Game.equippedWeapon ? Game.equippedWeapon().name : '';
    const canScream = Game.hasAbility('scream_cheese') && Game.state.scholar.screamDay !== Game.state.scholar.day;
    const hasWell = Game.hasItem && Game.hasItem('gravity_well');
    // FLIP (speedbump, Steve 2026-10-08): show when a live turtle is adjacent.
    const flippable = p ? mons.some(m => Game.turtleIs && Game.turtleIs(m) && Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)) <= 1) : false;
    const yourTurn = Game.tbIsPlayerTurn();
    if (!yourTurn || !p) return '';
    // INTEGRATED (Steve 2026-10-05): combat actions use the SAME selfbar
    // styling as the normal you: bar. No separate combat UI block — the
    // actions live where actions always live.
    // Enemy status: compact single line above the buttons (not a card).
    const monGroups = {};
    for (const m of mons) { const mid = m.mdef ? m.mdef.id : m.monsterId; (monGroups[mid] = monGroups[mid] || []).push(m); }
    const enemyLine = Object.values(monGroups).map(g => {
      const m = g[0];
      const mid = m.mdef ? m.mdef.id : m.monsterId;
      const name = Game.monsterDisplayName ? Game.monsterDisplayName(mid) : m.name;
      const hp = g.reduce((s, x) => s + (x.hp || 0), 0);
      const maxHp = g.reduce((s, x) => s + (x.maxHp || 1), 0);
      const frac = Math.max(0, Math.min(1, hp / maxHp));
      const count = g.length > 1 ? ` ×${g.length}` : '';
      const _mspr2 = monsterSpriteHtml(m.id || m.monsterId, true);
      return `${_mspr2 || m.emoji} ${esc(name)}${count} <span class="cc-hpbar"><span style="width:${Math.round(frac * 100)}%"></span></span>`;
    }).join(' · ');
    return `<div class="combat-enemies" style="font-size:12px;opacity:.85;margin:0 6px 4px">${enemyLine} <span style="opacity:.6">· ${p.moveLeft || 0} move · ${p.acted ? 0 : 1} act</span></div>` +
    `<div class="selfbar">
      <button class="self-btn" id="c-strike" title="${esc(wname)} — range ${wrange}" ${(!adj.length || p.acted) ? 'disabled' : ''}>⚔ Strike${adj.length > 1 ? '…' : ''}</button>
      <button class="self-btn" id="c-study" ${p.acted ? 'disabled' : ''}>👁 Study</button>
      ${mons.some(m => m.kind === 'hostile') ? `<button class="self-btn" id="c-talk" ${p.acted ? 'disabled' : ''}>💬 Talk</button>` : ''}
      ${canScream ? `<button class="self-btn" id="c-scream" ${p.acted ? 'disabled' : ''}>🧀 Scream</button>` : ''}
      ${hasWell ? `<button class="self-btn" id="c-well" ${p.acted ? 'disabled' : ''} title="Gravity well — hold monsters within 3 tiles for 2 turns (one use)">🕳 Well</button>` : ''}
      ${flippable ? `<button class="self-btn" id="c-flip" ${p.acted ? 'disabled' : ''} title="Flip the turtle — strength check. Upside down: no armor, can't snap, 3 turns. Fail and it snaps you.">🐢 Flip</button>` : ''}
      <button class="self-btn" id="c-shout" ${p.acted ? 'disabled' : ''} title="Bellow — scatter noise-fearing monsters (2/fight)">📢 Shout</button>
      <button class="self-btn" id="c-offer" ${p.acted ? 'disabled' : ''} title="Offer food — buy off the curious thief">🍖 Offer</button>
      <button class="self-btn" id="c-wait" title="Hold still — forfeit the rest of the turn">⏸ Wait</button>
    </div>
    <div class="actions" id="c-talkrow" style="display:none"></div>`;
  }

  function panelCombat(st) {
    const tf = Game.tbfight;
    if (!tf) return '';
    const cur = Game.tbCurrent();
    const p = Game.tbFighter('p');
    const mons = tf.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
    // COMBAT-CARD DISCIPLINE (Steve): the card carries ONLY what it uniquely
    // knows — name (descriptor-gated until earned) + health bar. No threat
    // text, no HP text, no round, no phase badges the player hasn't earned.
    // First encounter: strange descriptor, vague threat sense — the
    // specialness is DISCOVERED through the fight and the codex, never
    // announced by the UI.
    // SWARM COLLAPSE (Steve 2026-10-05): pack monsters share one card row —
    // four hum-mice read as one chorus (count + combined bar), not four
    // identical rows. Targeting stays on the grid tiles.
    const monGroups = {};
    for (const m of mons) { const mid = m.mdef ? m.mdef.id : m.monsterId; (monGroups[mid] = monGroups[mid] || []).push(m); }
    const monRows = Object.values(monGroups).map(g => {
      const m = g[0];
      const mid = m.mdef ? m.mdef.id : m.monsterId;
      const name = Game.monsterDisplayName ? Game.monsterDisplayName(mid) : m.name;
      const hp = g.reduce((s, x) => s + (x.hp || 0), 0);
      const maxHp = g.reduce((s, x) => s + (x.maxHp || 1), 0);
      const frac = Math.max(0, Math.min(1, hp / maxHp));
      const known = Game.encTelegraphKnown ? Game.encTelegraphKnown(m) : false;
      const badge = (known && Game.encPhaseBadge) ? Game.encPhaseBadge(m) : '';
      const count = g.length > 1 ? ` ×${g.length}` : '';
      // INFO LEAK FIX (Steve): the ⚠ warning marker is gated behind codex
      // knowledge. First encounter: no warning symbols.
      const _mspr3 = monsterSpriteHtml(m.id || m.monsterId, true);
      return `<span class="cs-mon">${_mspr3 || m.emoji} <b>${esc(name)}</b>${count}` +
        `<span class="cc-hpbar"><span style="width:${Math.round(frac * 100)}%"></span></span>` +
        `${(g.some(x => x.telegraph) && known) ? ' ⚠' : ''}${badge}</span>`;
    }).join(' · ');
    const adj = p ? mons.filter(m => Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)) <= (Game.equippedWeapon ? Game.equippedWeapon().range : 1)) : [];
    const wrange = Game.equippedWeapon ? Game.equippedWeapon().range : 1;
    const wname = Game.equippedWeapon ? Game.equippedWeapon().name : '';
    const canScream = Game.hasAbility('scream_cheese') && Game.state.scholar.screamDay !== Game.state.scholar.day;
    const yourTurn = Game.tbIsPlayerTurn();
    // ACTION ECONOMY (Steve): the turn ends when you're out of actions — the
    // line shows what's left. No end-turn button; WAIT forfeits the rest.
    // TURN CLARITY (Steve 2026-10-05): movement and actions are SEPARATE.
    // You get 3 moves AND 1 action. The line shows both distinctly.
    const turnLine = yourTurn && p
      ? (p.moveLeft <= 0 && !p.acted
          ? `<b style="color:#ffd54d">ACT!</b> <span style="opacity:.8">strike, shout… or ⏸ hold</span>`
          : `<span title="Movement — D-pad or tap to walk"><b>${p.moveLeft}</b> move</span>${p.acted ? '' : ' <span title="Action — strike, study, shout…" style="opacity:.8">· <b>1</b> act</span>'}`)
      : (cur ? `${esc(cur.kind === 'player' ? 'You' : (Game.monsterDisplayName && cur.mdef ? Game.monsterDisplayName(cur.mdef.id) : cur.name))} acting…` : '');
    // COMBAT STRIP (Steve 2026-10-05, revised): threat + turn status ONLY.
    // Narration lives in the unified narration box. Actions live in the
    // combined actions area. This is just the compact header.
    return `
      <div class="combat-strip"><div class="cs-line"><span>⚔</span> ${monRows} <span class="cs-turn">${turnLine}</span></div>
      </div>`;
  }

  function wireCombatPanel() {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on('c-wait', () => { Game.tbPlayerWait(); rerender(); });
    on('c-study', () => { Game.tbPlayerStudy(); rerender(); });
    on('c-scream', () => { Game.tbPlayerScream(); rerender(); });
    on('c-shout', () => { Game.tbPlayerShout(); rerender(); });
    on('c-well', () => { Game.tbPlayerGravityWell(); rerender(); });
    on('c-flip', () => {
      const tf = Game.tbfight;
      if (!tf || !Game.turtleIs) return;
      const p = Game.tbFighter('p');
      const cands = tf.fighters.filter(x => Game.turtleIs(x) && x.alive && !x.fled
        && Math.max(Math.abs(x.mx - p.mx), Math.abs(x.my - p.my)) <= 1);
      if (!cands.length) return;
      if (cands.length === 1) { Game.tbPlayerFlip(cands[0].key); rerender(); return; }
      enterTargeting({
        prompt: '🐢 Flip which?',
        targets: cands.map(m => ({ key: m.key, cx: m.mx, cy: m.my, label: m.name })),
        onPick: (t) => { Game.tbPlayerFlip(t.key); rerender(); },
      });
    });
    on('c-offer', () => { Game.tbPlayerOfferFood(); rerender(); });
    // TALK: words are actions too. Pick who, then how.
    const showTalkRow = (targetKey) => {
      const row = document.getElementById('c-talkrow');
      if (!row) return;
      const tactics = Game.tbTalkTactics ? Game.tbTalkTactics() : [];
      row.innerHTML = tactics.map(t => `<button class="btn sm ghost" data-tactic="${t.id}">${esc(t.label)}</button>`).join('') +
        ` <button class="btn sm ghost" data-tactic="">✖</button>`;
      row.style.display = '';
      row.querySelectorAll('[data-tactic]').forEach(b => {
        b.onclick = () => {
          row.style.display = 'none';
          if (b.dataset.tactic) { Game.tbPlayerTalk(targetKey, b.dataset.tactic); }
          rerender();
        };
      });
    };
    on('c-talk', () => {
      const tf = Game.tbfight;
      if (!tf) return;
      const p = Game.tbFighter('p');
      const hostiles = tf.fighters.filter(x => x.kind === 'hostile' && x.alive && !x.fled);
      if (!hostiles.length || !p || p.acted) return;
      if (hostiles.length === 1) { showTalkRow(hostiles[0].key); return; }
      enterTargeting({
        prompt: '💬 Talk to whom?',
        targets: hostiles.map(h => ({ key: h.key, cx: h.mx, cy: h.my, label: h.name })),
        onPick: (t) => { showTalkRow(t.key); },
      });
    });
    on('c-strike', () => {
      const tf = Game.tbfight;
      if (!tf) return;
      const p = Game.tbFighter('p');
      const wr = Game.equippedWeapon ? Game.equippedWeapon().range : 1;
      const adj = tf.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled
        && Math.max(Math.abs(x.mx - p.mx), Math.abs(x.my - p.my)) <= wr);
      if (!adj.length) return;
      if (adj.length === 1) { Game.tbPlayerStrike(adj[0].key); rerender(); return; }
      enterTargeting({
        prompt: '⚔ Strike which?',
        targets: adj.map(m => ({ key: m.key, cx: m.mx, cy: m.my, label: m.name })),
        onPick: (t) => { Game.tbPlayerStrike(t.key); rerender(); },
      });
    });
  }

  function wirePanel(st, n) {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on('p-face', () => {
      // TENT BREACH: the thing is IN your tent — facing it means bursting out
      // through the flap with it right behind you.
      if (Game.pendingInTent) Game.faceTentIntruder();
      else Game.startCombat();
      rerender();
    });
    wireCombatPanel();
    wireDialogueBox();
    // CONTEST in narration box: wire choice buttons (Steve 2026-10-05)
    try {
      const ac2 = Game.state && Game.state.activeContest;
      if (narrBox && ac2 && ac2.phase !== 'done') {
        narrBox.querySelectorAll('[data-contest-choice]').forEach(b => {
          b.onclick = () => { try { Game.contestChoose(+b.dataset.contestChoice); } catch (e) {} rerender(); };
        });
      }
    } catch (e) {}
    // PERSON CARD in narration box: wire its buttons (Steve 2026-10-05)
    const narrBox = document.querySelector('.ord-narration');
    if (narrBox && inlineView && inlineView.kind === 'person') {
      wireInlineX(narrBox);
      narrBox.querySelectorAll('[data-act]').forEach(b => {
        b.onclick = () => personAct(inlineView, b.dataset.act);
      });
    }
    // NOTE: Eat/Sleep/Pack/Wait moved to the persistent self bar (wireSelfBar).
    screen.querySelectorAll('.bgsurv').forEach(el => {
      el.onclick = () => { screen.querySelector('#bgsay').textContent = '\u201C' + el.dataset.line + '\u201D'; };
    });
  }

  // detail grid: 9x9 cells, the world INSIDE the tile. one continuous world —
  // edges blend into neighbors, so walking east shows the same water and trees.
  // plant cells show 🌱 until you've discovered what's there, then the real thing.
  const PLANT_GLYPH = {
    hickory_nut: '🥜', acorn_white_oak: '🌰', blackberry: '🫐', dandelion: '🌼',
    cattail: '🌾', persimmon: '🍑', muscadine: '🍇', wild_onion: '🧅',
    chickweed: '🌱', wood_sorrel: '☘️',
  };
  const CELL_GLYPH = {
    tree: '🌳', bigtree: '🌲', bush: '🌿', water: '💧', rubble: '🪨',
    wall: '⬛', tent: '⛺', fire: '🔥',
    gym: '🏀', class: '🏫', hall: '', door: '🚪', bridge: '🌉',
    office: '🗄️', bay: '📦', dock: '🚚', sanct: '⛪', base: '🕯️',
    apt: '🏢', lobby: '🛋️', cube: '💼', break: '☕', conf: '📊',
    bunk: '🛏️', lodge: '🏠',
  };
  // ATTACK VISUALS (Steve 2026-10-05): the grid IS the telegraph.
  // Collects telegraph cells by pattern type for ALL monsters, not just beams.
  // Returns { patternType: Set("x,y"), ... } plus direct-target keys.
  // Knowledge gating: if pattern not learned, the telegraph does NOT show at all.
  // (Steve 2026-10-05: "Not dimmed if not learned. They don't show up. Dimmed will still give it away.")
  // The beam WHILE FIRING is always visible — you see it happening.
  function tbAllTelegraphCells() {
    // NOTE: no 'ambush' bucket (Steve 2026-10-06): the speedbump's snap is
    // no-warning BY DESIGN ("No warning. There never is."), so no ambush
    // telegraph ever carries cells. Its one fair tell is the world-view
    // warn cue ("Still doesn't move. But something about the stillness
    // changed.") + the ROCK phase badge + the codex knownCue — never a grid
    // zone. Should a future ambush monster declare with cells, `out[ptype] ||
    // out.single` below falls back to the targetTile highlight (no crash).
    // WAVE 2 GROUP C (Steve 2026-10-06): biHot (bright_idea — the burst goes
    // white-hot on its last windup tick, "about to break loose").
    // Knowledge-gated like every bucket.
    // WING/BASK (Steve 2026-10-06): sbLock (sunbasker — the Sun-Charged
    // Bite's tracking lock-on reads MOLTEN GOLD, not the generic purple
    // lockOn). The glasswing's in-combat dive shadow is NOT a bucket: it
    // renders diegetic-ungated via the Game.gwDiveShadow() overlay below
    // (trap-shadow precedent) and is skipped from the generic buckets so
    // the dive keeps its own visual voice.
    // WAVE 1 STYLE VOICES (Steve 2026-10-06): dozeLane (bulldozer — its
    // charge reads as a DUST WALL, not the generic charge lane), swarmHum
    // (hummice — dotted many-bodies), resonantBurst (belltoad — green croak
    // rings), flashBurst (mirrormoth — hard silver blink). Routed from
    // burstStyle/chargeStyle below. Knowledge-gated like every bucket.
    // pepBurst REMOVED 2026-10-08: hype_horn retired — no monster carries
    // burstStyle 'pep' (verified against monsters.json), so the bucket was
    // unreachable dead code. main.css .cell.pepBurst rule now orphaned
    // (CSS untouched by this pass).
    // No 'rush' bucket (Steve 2026-10-06): rush patterns never declare, so
    // nothing could ever paint it — removed as unreachable dead code.
    const out = { burst: new Set(), charge: new Set(), biHot: new Set(), sbLock: new Set(), line: new Set(), single: new Set(), direct: new Set(), dozeLane: new Set(), swarmHum: new Set(), resonantBurst: new Set(), flashBurst: new Set(), pzFlash: new Set(), ideaHeat: new Set(), beam: new Set(), heronStrike: new Set() };
    // WAVE 2 TELEGRAPH IDENTITY (Steve 2026-10-06/08): per-monster telegraph
    // identity — which monster each telegraph cell belongs to, so the grid
    // can render each monster's attack in its own visual voice. Covers every
    // wave-2 monster with a grid telegraph (warranty_caller is rush — it
    // declares nothing by design, so it has no class). Knowledge-gated
    // like the rest.
    out.mon = {};
    const W2A_IDS = { mirror_stag: 1, review_drone: 1, voice_mimic_radio: 1, bright_idea: 1, paparazzo: 1, statickite: 1, understudy: 1, landlord: 1, heckler: 1, union_rep: 1, moderator: 1 };
    // WAVE 1 STYLE VOICES (Steve 2026-10-06): burstStyle/chargeStyle existed
    // in monsters.json but NOTHING consumed them — the bulldozer's charge
    // and the hype_horn/hummice/belltoad/mirrormoth bursts all rendered as
    // the generic yellow lane / orange burst. Route per style to dedicated
    // buckets so each monster's attack reads in its own visual voice.
    // WAVE 2 STYLE VOICES (Steve 2026-10-08): exposure (paparazzo) and
    // detonation (bright_idea) now route to dedicated buckets too — the
    // flash-bulb attack reads as a FLASH (white strobe, not a generic
    // orange burst) and Eureka's early windup ticks read as heating embers
    // (biHot white wins the last tick). pzFlash/ideaHeat.
    // Mirrors the W2A_IDS / wave-2-groupC per-id routing above. Unknown
    // styles fall through to the generic bucket (no crash, no silence).
    const STYLE_BUCKETS = { bulldozer: 'dozeLane', swarm: 'swarmHum', resonant: 'resonantBurst', flash: 'flashBurst', exposure: 'pzFlash', detonation: 'ideaHeat' };
    try {
      const f = Game.tbfight;
      if (!f) return out;
      for (const m of (f.fighters || [])) {
        if ((m.kind !== 'monster' && m.kind !== 'hostile') || !m.alive || !m.telegraph) continue;
        const tg = m.telegraph;
        const ptype = (tg.pattern && tg.pattern.type) || 'single';
        // If pattern not learned, skip entirely — no telegraph markers at all
        // TELEGRAPH KNOWLEDGE GATE (Steve 2026-10-06): if you don't know
        // the pattern, you don't see the telegraph. Default to HIDDEN.
        let known = false;
        try {
          known = Game.encTelegraphKnown ? Game.encTelegraphKnown(m) : false;
        } catch (e) {}
        if (!known) continue;
        const mid = (m.mdef || {}).id;
        const w2a = W2A_IDS[mid];
        let targetSet = out[ptype] || out.single;
        // BRIGHT IDEA (Steve 2026-10-06): last windup tick → white-hot.
        if (mid === 'bright_idea' && ptype === 'burst' && tg.turnsLeft <= 1) targetSet = out.biHot;
        // WHITE NOISE HERON (Steve 2026-10-06): the Spearfish Strike is a
        // needle out of static, not the deer's harsh red beam — route its
        // line telegraph to the heronStrike bucket (white-noise static
        // visual, main.css). Knowledge-gated like every bucket (the
        // `if (!known) continue` above already ran).
        if (mid === 'white_noise_heron' && ptype === 'line') targetSet = out.heronStrike;
        // STYLE ROUTING (Steve 2026-10-06): the style lives on the attack
        // pattern in mdef (burstStyle/chargeStyle); the live telegraph
        // clones it. Runs after the `if (!known) continue` above, so the
        // style voices are knowledge-gated like every other bucket.
        const _pat = ((m.mdef || {}).attack || {}).pattern || {};
        const _style = ptype === 'charge' ? _pat.chargeStyle : (ptype === 'burst' ? _pat.burstStyle : null);
        const _sb = _style && STYLE_BUCKETS[_style];
        // BIHOT PRECEDENCE (Steve 2026-10-08): the bright idea's last windup
        // tick goes white-hot (biHot above) — the detonation style voice must
        // NOT route that tick back into the ember bucket. The white-hot read
        // wins.
        if (_sb && out[_sb] && targetSet !== out.biHot) {
          targetSet = out[_sb];
          // DOZE ANGLE (Steve 2026-10-06): the bulldozer's ➤ arrows ride the
          // charge direction — first→last telegraph cell.
          if (_sb === 'dozeLane' && tg.cells && tg.cells.length >= 2) {
            const _sa = tg.cells[0], _sbb = tg.cells[tg.cells.length - 1];
            out.dozeAngle = Math.round(Math.atan2(_sbb.cy - _sa.cy, _sbb.cx - _sa.cx) * 180 / Math.PI);
          }
          // SWARM SOURCES (Steve 2026-10-06): every declaring mouse is a
          // throat of the hum — renderDetail rings each one (◎); the burst
          // cells between them are the many small bodies.
          if (_sb === 'swarmHum') { (out.swarmSrc = out.swarmSrc || []).push({ x: m.mx, y: m.my }); }
        }
        if (tg.kind === 'direct' && tg.targetKey) {
          const tgt = (f.fighters || []).find(x => x.key === tg.targetKey);
          if (tgt) {
            const k = tgt.mx + ',' + tgt.my;
            // SUNBASKER (Steve 2026-10-06): the Sun-Charged Bite tracks — its
            // lock-on is molten gold (sbLock), not the generic purple lockOn.
            // The heat halo (Game.sbHeatKeys) is the charge meter; this cell
            // is the bite itself. Knowledge-gated like every bucket.
            if (mid === 'sunbasker') out.sbLock.add(k); else out.direct.add(k);
            if (w2a) out.mon[k] = mid;
          }
        } else if (tg.cells && tg.cells.length) {
          // GLASSWING DIVE (Steve 2026-10-06): the in-combat dive's shadow is
          // owned by the Game.gwDiveShadow() overlay (diegetic — renders
          // ungated like the pre-combat trap shadow), not the generic
          // targetTile. Skip it here so the dive keeps its own visual voice.
          const gwDive = (mid === 'glasswing' && tg.kind === 'squares');
          for (const c of tg.cells) {
            const k = c.cx + ',' + c.cy;
            // Don't double-add beam cells (they have their own renderer)
            if (ptype === 'beam') { if (w2a) out.mon[k] = mid; continue; }
            if (!gwDive) targetSet.add(k);
            if (w2a) out.mon[k] = mid;
          }
        }
      }
    } catch (e) {}
    return out;
  }
  // PLAYER-COINCIDENT TELEGRAPH ALERTS (Steve 2026-10-06): when a telegraph
  // lands on the player's own tile, the white player marker sits on top of
  // the tile fill and swallows the read — ring the MARKER itself so the
  // danger survives. Pure helper (no Game calls): renderDetail consumes it,
  // scripts/test-telegraph-judgment.js tests it.
  //  diveTarget: the glasswing's dive shadow is ON you (dark tile + red ring).
  //  sbLockTarget: the sunbasker's molten-gold lock is ON you (gold ring).
  // WAVE 2 DIRECT VOICES (Steve 2026-10-08): the six direct telegraphs all
  // land on the player's tile, where the token swallows the tile fill — ring
  // the token in the voice's own color so the read survives. Knowledge-gated
  // upstream: the mon map only populates for learned patterns.
  // Positional only — reveals nothing about unknown patterns, so the
  // knowledge gate is untouched (the buckets are already gated upstream).
  function tgPlayerAlertClasses(tgBuckets, gwDive, px, py) {
    const out = [];
    if (gwDive && gwDive.phase === 'dive' && gwDive.tile &&
        gwDive.tile.x === px && gwDive.tile.y === py) out.push('diveTarget');
    if (tgBuckets && tgBuckets.sbLock && typeof tgBuckets.sbLock.has === 'function' &&
        tgBuckets.sbLock.has(px + ',' + py)) out.push('sbLockTarget');
    const W2B_RING = { voice_mimic_radio: 'staticTarget', understudy: 'underTarget',
      landlord: 'lordTarget', heckler: 'heckTarget', union_rep: 'unionTarget',
      moderator: 'modTarget' };
    if (tgBuckets && tgBuckets.mon) {
      const pmid = tgBuckets.mon[px + ',' + py];
      if (pmid && W2B_RING[pmid]) out.push(W2B_RING[pmid]);
    }
    return out;
  }
  function renderDetail(st) {
    // Collect telegraph visuals once per render (not per cell)
    const _tg = tbAllTelegraphCells();
    const cells = Game.genDetail(st.px, st.py);
    const tile = Game.playerTile();
    const pmx = Game.state.scholar.mx ?? 4, pmy = Game.state.scholar.my ?? 4;
    const mon = (typeof Game.playerMonster === 'function') ? Game.playerMonster() : Game.state.scholar.monster;
    const ani = Game.state.scholar.animal;
    const vpos = (Game.state.village.positions || {});
    const secrets = tile.secrets || {};
    // GLASSWING TRAP SHADOW (Steve 2026-10-06): the pre-combat dive shadow.
    // game.js sibling owns Game.glasswingTrapCells() — null or
    // {tile:{x,y}, turns:1|2|3, splash:[{x,y}]}. GUARDED: if absent, nothing renders.
    // The shadow is DIEGETIC (a shadow on the ground is physically there),
    // so it renders ungated — but no coaching text beyond the observation.
    let _gwTrap = null;
    try { _gwTrap = (typeof Game.glasswingTrapCells === 'function') ? Game.glasswingTrapCells() : null; } catch (e) { _gwTrap = null; }
    // NIGHTLIGHT TELL (Steve 2026-10-06): the catfish's still-phase shimmer.
    // game.js sibling owns Game.catfishTellCell() — null or {x, y} of the
    // catfish tile, and ONLY when the pattern is learned (codex observed+).
    // Unknown players get the stillness text alone — "if you don't know,
    // it doesn't show." GUARDED: if absent, nothing renders.
    let _cfTell = null;
    try { _cfTell = (typeof Game.catfishTellCell === 'function') ? Game.catfishTellCell() : null; } catch (e) { _cfTell = null; }
    // WING/BASK OVERLAYS (Steve 2026-10-06): diegetic combat visuals owned
    // by game.js — collected once per render, applied per cell below.
    //  Game.gwDiveShadow() — null or {phase:'circle',monster:{x,y}} |
    //    {phase:'dive',tile:{x,y},turnsLeft,streak:[{x,y}]}: the in-combat
    //    dive shadow + fall-path streak. Ungated (a shadow is physically
    //    there); the coaching stays codex-gated.
    //  Game.sbHeatKeys() — null or {charge,monster:{x,y},ring:[{x,y}]}: the
    //    sunbasker's molten-gold heat halo, the solar charge made visible.
    //    Ungated (gold scales physically glow); counterplay is codex-gated.
    // GUARDED: if absent, nothing renders.
    let _gwDive = null, _sbHeat = null;
    try { _gwDive = (typeof Game.gwDiveShadow === 'function') ? Game.gwDiveShadow() : null; } catch (e) { _gwDive = null; }
    try { _sbHeat = (typeof Game.sbHeatKeys === 'function') ? Game.sbHeatKeys() : null; } catch (e) { _sbHeat = null; }
    let html = '';
    for (let cy = 0; cy < 9; cy++) {
      html += '<div class="drow">';
      for (let cx = 0; cx < 9; cx++) {
        const cell = cells[cy][cx];
        const isMe = (cx === pmx && cy === pmy);
        let g, cls = 'cell';
        // INDISTINCT (Steve 2026-10-05): creatures show their species emoji —
        // that's fine to know from looking. The ANIMAL_GLYPH paw-print gating
        // is removed; the emoji doesn't reveal monster vs animal.
        // CELL FIRST, entities overlay. (Bug was: entity glyphs got overwritten
        // by the cell chain below, making villagers invisible on grass/dirt.)
        let entityHere = false;
        if (isMe) {
          // YOU ARE A VILLAGER (Steve 2026-10-06): no special marker, no
          // arrow, no pulsing ring. You find yourself the way you find
          // anyone else — by recognizing your own face. Telegraph alerts
          // (diveTarget/sbLockTarget) still ring the token: danger is
          // danger, not a "you are here" sign.
          const _alert = tgPlayerAlertClasses(_tg, _gwDive, pmx, pmy).join(' ');
          const meVp = Game.data.villagers.find(v => v.id === Game.villagerId) || (Game.data.background_survivors || []).find(v => v.id === Game.villagerId);
          const _mspr = villagerSpriteHtml(meVp);
          // Steve 2026-10-07: player name ALWAYS shows above sprite. No flicker.
          // Fall back to 'You' if villager record not found.
          const meName = meVp ? meVp.name.split(' ')[0] : 'You';
          g = `<span class="vent${_alert ? ' ' + _alert : ''}" data-ent="me"><span class="vtoken">${_mspr || '🧍'}</span>` + (meName ? `<span class="vname">${esc(meName)}</span>` : '') + `</span>`;
          cls += ' me';
          entityHere = true;
        }
        // CELL GLYPH: what the ground itself looks like. Entities overlay after.
        // DEPLETED: a foraged bush/tree stays standing but is picked clean —
        // detailRegrow tracks it until it recovers. Show it dimmed/wilted so
        // the player SEES what they've taken. (Plants become dirt instead.)
        const deplKey = cx + ',' + cy;
        const isDepleted = tile.detailRegrow && tile.detailRegrow[deplKey] &&
          (typeof tile.detailRegrow[deplKey].day === 'number' ? tile.detailRegrow[deplKey].day > (Game.state.scholar.day || 0) : true);
        if (cell === 'plant') {
          // KNOWLEDGE-GATED GLYPHS (Steve): the game knows the species (t.plantSpecies),
          // the player sees it only when their knowledge earns it. Below threshold
          // every plant is just 🌱 — foraging blind never reveals.
          const sp = (tile.plantSpecies || {})[cx + ',' + cy];
          const spKnown = sp && Game.plantKnown && Game.plantKnown(sp);
          // PLANT SVGS (Steve 2026-10-06): use custom sprites, not just emoji.
          let _psvg = '';
          try {
            if (spKnown && sp && S.Sprites && S.Sprites.plantSprite) {
              const _depth = 2; // known = full visual
              const _svg = S.Sprites.plantSprite(sp, _depth, 'plant');
              if (_svg) _psvg = `<span class="plantsprite">${_svg}</span>`;
            }
          } catch (e) {}
          g = _psvg || ((spKnown && PLANT_GLYPH[sp]) ? PLANT_GLYPH[sp] : '🌱');
          cls += ' plantcell' + (spKnown ? ' knownplant' : '');
          // EXAMINED (Steve 2026-10-06): looked-at-but-unnamed plants get a
          // visual marker — you've studied this one, it's not just green.
          try {
            const Ex = (typeof Scattering !== 'undefined' && Scattering.Examine) || null;
            if (!spKnown && sp && Ex && Ex.observedPlant && Ex.observedPlant(sp)) cls += ' examinedplant';
          } catch (e) {}
        } else if (cell === 'bush') {
          // If you've learned this bush, show what it IS. Not just "bush."
          const bs = (tile.bushSpecies || {})[cx + ',' + cy];
          const codex = Game.state.codex.plants || {};
          if (bs && codex[bs] && codex[bs].level >= 1) {
            g = PLANT_GLYPH[bs] || '🌿';
            cls += ' knownbush';
          } else if (bs) {
            g = '🫐'; // you know it's a berry, not which one
            cls += ' berrybush';
            try {
              const Ex2 = (typeof Scattering !== 'undefined' && Scattering.Examine) || null;
              if (Ex2 && Ex2.observedPlant && Ex2.observedPlant(bs)) cls += ' examinedbush';
            } catch (e) {}
          } else {
            g = '🌿';
          }
          if (isDepleted) { cls += ' depleted'; }
        } else if (cell === 'tree' || cell === 'bigtree') {
          // TREE SVGS (Steve 2026-10-06): use custom sprites.
          let _tsvg = '';
          try {
            if (S.Sprites && S.Sprites.get) {
              const _tid = (cell === 'bigtree') ? 'generic_tree' : 'generic_tree';
              const _svg = S.Sprites.get(_tid);
              if (_svg) _tsvg = `<span class="treesprite">${_svg}</span>`;
            }
          } catch (e) {}
          g = _tsvg || (CELL_GLYPH[cell] || '');
          if (cell) cls += ' c-' + cell;
          if (isDepleted) { cls += ' depleted'; }
        }
        else if (cell === 'grass') { g = ''; cls += ' grass'; }
        else if (cell === 'dirt') {
          // Was this a bush you identified? Show it as EMPTY, not just dirt.
          // You know what it is. You know it's picked clean. That's information.
          const bs = (tile.bushSpecies || {})[cx + ',' + cy];
          const codex = Game.state.codex.plants || {};
          if (bs && codex[bs] && codex[bs].level >= 1) {
            g = PLANT_GLYPH[bs] || '🌿';
            cls += ' emptybush'; // greyed out, but you know what it is
          } else {
            g = ''; cls += ' dirt';
          }
        }
        else { g = CELL_GLYPH[cell] || ''; if (cell) cls += ' c-' + cell; }

        // known secrets override the look: knowledge is visible.
        const sec = secrets[cx + ',' + cy];
        if (sec && sec.known && !entityHere) {
          // Trees stay trees even when known to have no yield (Steve 2026-10-06).
          // A non-fruit tree is still a tree, not a plant.
          if (cell === 'water' && sec.safe === false) { g = '☠️'; cls += ' poison'; }
          else if (cell === 'tent' && sec.condition === 'shredded') { g = '💨'; cls += ' shredded'; }
        }
        // TERRAFORM (Steve 2026-10-06): monster-reshaped ground. The visuals
        // always show — wreckage, paper, craters and scorched earth are
        // physically there. (The mechanical effect is learned by touch;
        // game.js narrates first contact.) GUARDED: if absent, nothing renders.
        try {
          const _terr = (typeof Game.tbTerrainAt === 'function') ? Game.tbTerrainAt(cx, cy) : null;
          if (_terr) cls += ' terr-' + _terr;
        } catch (e) { /* no terrain layer */ }
        // ENTITIES OVERLAY: player, monster, animal, villager — always visible,
        // never overwritten by the cell underneath. People are not grass.
        // (Player was skipped here and the cell glyph overwrote the sprite —
        //  Steve 2026-10-06: player invisible on grid.)
        if (isMe) {
          const _alert2 = tgPlayerAlertClasses(_tg, _gwDive, pmx, pmy).join(' ');
          const meVp2 = Game.data.villagers.find(v => v.id === Game.villagerId) || (Game.data.background_survivors || []).find(v => v.id === Game.villagerId);
          const _mspr2 = villagerSpriteHtml(meVp2);
          const meName2 = meVp2 ? meVp2.name.split(' ')[0] : 'You';
          g = `<span class="vent${_alert2 ? ' ' + _alert2 : ''}" data-ent="me"><span class="vtoken">${_mspr2 || '🧍'}</span>` + (meName2 ? `<span class="vname">${esc(meName2)}</span>` : '') + `</span>`;
        } else {
          // turn-based combat: fighters render from the fight, not scholar.monster
          // COMBAT-OVER GUARD (Steve 2026-10-06): if the fight is over but
          // tbfight hasn't cleared yet (or got stuck), do NOT render fighters.
          // Dead fighters on the grid after combat = the softlock bug.
          // INSIDE SCOPING (Steve 2026-10-06): fights happen OUTSIDE. If the
          // player is inside Haven, never render field fighters — "they show
          // on the grid inside too" was the bug. Combat inside is impossible;
          // the door-flee path ends it.
          const _inside = Game.state.scholar && Game.state.scholar.insideHaven;
          const tbf = Game.tbfight;
          let drawn = false;
          if (tbf && !tbf.over && !_inside) {
            for (let _mfi = 0; _mfi < tbf.fighters.length; _mfi++) {
              const mf = tbf.fighters[_mfi];
              if (mf.kind !== 'monster' && mf.kind !== 'hostile') continue;
              if (!mf.alive || mf.fled) continue;
              // MULTI-TILE (Steve 2026-10-06): check all occupied tiles.
              const _msz = Math.max(1, Math.min(3, ((mf.mdef && mf.mdef.size) || mf.size || 1)));
              let _onTile = false;
              for (let _dy = 0; _dy < _msz && !_onTile; _dy++)
                for (let _dx = 0; _dx < _msz && !_onTile; _dx++)
                  if (mf.mx + _dx === cx && mf.my + _dy === cy) _onTile = true;
              if (!_onTile) continue;
              // data-ent: stable key so the move animator can glide fighters
              // tile-to-tile instead of teleporting them on re-render.
              // INDISTINCT (Steve 2026-10-05): creatures render the same whether
              // monster or animal — the emoji shows what it looks like, not what it is.
              // HUMANOID SPRITES (Steve 2026-10-06): human-like horrors show
              // their calm SVG — the paranoia needs a real silhouette.
              const _hkey = mf.monsterId || (mf.mdef && mf.mdef.id) || ('tb' + _mfi);
              const _mid = mf.monsterId || (mf.mdef && mf.mdef.id);
              // MONSTER SVGS (Steve 2026-10-06): use the custom SVG for all monsters,
              // not just humanoids. The emoji is a last resort.
              let _mspr = '';
              try {
                if (_mid && S.Sprites && S.Sprites.monsterSprite) {
                  const _aggro = true; // combat = aggro form
                  const _svg = S.Sprites.monsterSprite(_mid, _aggro);
                  if (_svg) _mspr = `<span class="csprite">${_svg}</span>`;
                }
              } catch (e) {}
              // Humanoids get the special ambiguous treatment; others get their SVG
              const _hspr = humanoidSpriteHtml(_mid);
              g = `<span data-ent="creature:${esc(_hkey)}">${_hspr || _mspr || esc(mf.emoji || '👹')}</span>`;
              cls += ' creature';
              drawn = true; break;
            }
          }
          if (!drawn && mon && !_inside && cx === mon.mx && cy === mon.my) {
            const mdef = (Game.data.monsters || []).find(m => m.id === mon.id) || {};
            // INDISTINCT (Steve 2026-10-05): same 'creature' class as animals
            // HUMANOID SPRITES (Steve 2026-10-06): human-like horrors show
            // their calm SVG on the field too.
            const _mhspr = humanoidSpriteHtml(mon.id || mdef.id);
            const _mmspr = monsterSpriteHtml(mon.id || mdef.id, false);
            g = `<span data-ent="creature:${esc(mon.id || 'wild')}">${_mhspr || _mmspr || esc(mdef.emoji || '👹')}</span>`;
            cls += ' creature'; drawn = true;
          }
          if (!drawn && ani && cx === ani.mx && cy === ani.my) {
            // INDISTINCT (Steve 2026-10-05): show the correct species emoji —
            // that's fine to know from looking. But no 'animal' vs 'monster' indicator.
            let aemoji = '🐾';
            try {
              const adef = Game.encAnimalDef ? Game.encAnimalDef(ani.id) : null;
              if (adef && adef.emoji) aemoji = adef.emoji;
            } catch (e) {}
            // PREY PHASE BADGE (Steve 2026-10-06): windup → action → recovery
            // is visible on the grid. Observable behavior — no knowledge gate.
            // Calm (grazing) shows no badge: the grid stays quiet until it matters.
            let _pbadge = '';
            try {
              const _pp = (typeof Game.encPreyPhase === 'function') ? Game.encPreyPhase(ani) : null;
              _pbadge = ({ wary: '⚠', bolt: '💨', winded: '😮‍💨', playing_dead: '💀', taunt: '👀' })[_pp] || '';
            } catch (e) {}
            const _aniSpr = monsterSpriteHtml(ani.id || ani.monsterId, false);
            g = `<span data-ent="creature:${esc(ani.id || 'wild')}">${_aniSpr || esc(aemoji)}${_pbadge ? `<span class="preybadge" style="display:block;font-size:9px;line-height:1;margin-top:-3px">${esc(_pbadge)}</span>` : ''}</span>`;
            cls += ' creature'; drawn = true;
          }
          if (!drawn) {
            // villagers: 🧍 with a TINY name label underneath.
            // (names were rendering at full size and swallowing the grid.)
            for (const [rid, pos] of Object.entries(vpos)) {
              if (pos.mx === cx && pos.my === cy) {
                const vp = Game.data.villagers.find(v => v.id === rid) || Game.data.background_survivors.find(v => v.id === rid);
                const showName = Game.state.systemArrived || Game.nameKnown(rid);
                const fname = showName ? (vp ? vp.name.split(' ')[0] : '?') : '';
                // vent wrapper: one animatable unit (glyph + name glide together).
                const _vspr = villagerSpriteHtml(vp);
                g = `<span class="vent" data-ent="vil:${esc(rid)}"><span class="vtoken">${_vspr || '🧍'}</span>` + (fname ? `<span class="vname">${esc(fname)}</span>` : '') + `</span>`;
                cls += ' villager';
                break;
              }
            }
          }
          // CORPSE SYSTEM: the dead stay where they fell. Always visible.
          if (!drawn && Game.corpseAt) {
            const dead = Game.corpseAt(cx, cy);
            if (dead.length) {
              const dc = dead[0];
              const _ckey = dc.kind + ':' + (dc.villagerId || dc.monsterId || dc.name || '?');
              g = `<span data-ent="corpse:${esc(_ckey)}">${esc(Game.corpseGlyph(dc))}</span>`;
              cls += ' corpse';
              drawn = true;
            }
          }
        }
        const _lane = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : null;
        const _ghost = Game.tbBeamPrevLaneCells ? Game.tbBeamPrevLaneCells() : null;
        const _live = Game.tbBeamIsFiring ? Game.tbBeamIsFiring() : false;
        const _src = Game.tbBeamSourceCell ? Game.tbBeamSourceCell() : null;
        const _halo = Game.tbBeamHaloCells ? Game.tbBeamHaloCells() : null;
        const _k = cx + ',' + cy;
        // beamLane: current beam path. beamLive: the beam is FIRING (kamehameha,
        // not a highlight). beamGhost: where the beam just was — the sweep arc.
        // beamSource: the deer's tile — the beam EMANATES from the beast.
        // beamLight: halo — the beam lights up the night around it.
        const _beamCls = (_lane && _lane.has(_k)) ? (' beamLane' + (_live ? ' beamLive' : '')) : ((_ghost && _ghost.has(_k)) ? ' beamGhost' : '');
        const _srcCls = (_src && _src === _k) ? ' beamSource' : '';
        const _haloCls = (_halo && _halo.has(_k)) ? ' beamLight' : '';
        // ATTACK VISUALS: pattern-specific telegraph classes. The grid IS the telegraph.
        // If pattern not learned, the telegraph does NOT show at all (Steve 2026-10-05).
        // The beam WHILE FIRING is always visible.
        const _tgCls =
          (_tg.burst.has(_k) ? ' burstRadius' : '') +
          (_tg.charge.has(_k) ? ' chargeLane' : '') +
          (_tg.biHot.has(_k) ? ' biHot' : '') +
          (_tg.sbLock.has(_k) ? ' sbLock' : '') +
          (_tg.dozeLane.has(_k) ? ' dozeLane' : '') +
          (_tg.swarmHum.has(_k) ? ' swarmHum' : '') +
          (_tg.resonantBurst.has(_k) ? ' resonantBurst' : '') +
          (_tg.flashBurst.has(_k) ? ' flashBurst' : '') +
          (_tg.pzFlash.has(_k) ? ' pzFlash' : '') +
          (_tg.ideaHeat.has(_k) ? ' ideaHeat' : '') +
          (_tg.line.has(_k) ? ' lineCells' : '') +
          (_tg.heronStrike.has(_k) ? ' heronStrike' : '') +
          (_tg.single.has(_k) ? ' targetTile' : '') +
          (_tg.direct.has(_k) ? ' lockOn' : '');
        // (no ambushZone: the speedbump's snap is no-warning by design —
        // see tbAllTelegraphCells note. Steve 2026-10-06)
        // WAVE 2 GROUP C telegraph identity (Steve 2026-10-06): inline styles
        // keep this in app.js (no CSS file touch — precedent: glasswing trap).
        //  biHot: the bright idea's burst, white-hot on the last windup
        //    tick — "about to break loose", distinct from burstPulse.
        //  mpBeam tint: the memory projector's film-beam — warm amber
        //    home-light, not the highbeam deer's harsh red. (The generic
        //    beamLane renderer also covers these cells; the inline tint
        //    overrides it.)
        // All of these are knowledge-gated in game.js: if you don't know,
        // it doesn't show.
        let _w2cStyle = '';
        if (_tg.biHot.has(_k)) {
          _w2cStyle = 'outline:3px solid #ffffff;outline-offset:-3px;background-color:rgba(255,255,255,.42);box-shadow:inset 0 0 20px rgba(255,255,255,.95)';
        }
        // (delegate circle ring retired 2026-10-08: the delegate's circle beat
        // is cue-only now, no grid cells — the circle-keys helper no longer
        // exists.)
        const _mpKeys = (typeof Game.mpBeamKeys === 'function') ? Game.mpBeamKeys() : null;
        if (_mpKeys && _mpKeys.has(_k) && !_w2cStyle) {
          _w2cStyle = 'outline:2px solid #ffca7a;outline-offset:-2px;background-color:rgba(255,190,110,.16);box-shadow:inset 0 0 14px rgba(255,200,120,.45)';
        }
        // DUCKS IN A ROW (Steve 2026-10-06): the line_up aim lane — dotted
        // pale-yellow march orders, locked at the line_up beat. Distinct
        // from the deer's harsh red beamLane. Knowledge-gated in
        // Game.duckLaneKeys().
        const _duckKeys = (typeof Game.duckLaneKeys === 'function') ? Game.duckLaneKeys() : null;
        if (_duckKeys && _duckKeys.has(_k) && !_w2cStyle) {
          _w2cStyle = 'outline:2px dotted #e8d44d;outline-offset:-2px;background-color:rgba(232,212,77,.13);box-shadow:inset 0 0 10px rgba(232,212,77,.25)';
        }
        // WING/BASK OVERLAYS (Steve 2026-10-06): inline styles keep this in
        // app.js (no CSS file touch — precedent: glasswing trap, wave 2C).
        //  dive-circle: faint sliding shadow under the circling monster —
        //    "soar". The shadow slides across the grass while it chooses.
        //  dive: the shadow detaches onto the TARGET tile — near-black and
        //    growing as the dive commits (turnsLeft 1 = about to land), with
        //    a ▼ impact marker and the fall-path streak from the sky-monster
        //    to the target. Reads as "something is falling HERE, along THIS
        //    line" — nothing else on the grid looks like it.
        //  sbHeat: the sunbasker's molten-gold halo — the solar charge made
        //    visible. The monster's tile glows gold and brightens with
        //    charge; the ring shimmers around it. Flattened/shaded/night =
        //    no glow (game.js returns null). Distinct from burst telegraphs:
        //    it sits ON the monster, not on a blast zone.
        //  sbLock: the Sun-Charged Bite's tracking lock-on — molten gold,
        //    not the generic purple lockOn. The bite tracks; the gold is the
        //    warning. Knowledge-gated (in the sbLock bucket).
        // All diegetic overlays render ungated — the shadow and the gold are
        // physically there. Coaching stays codex-gated in game.js.
        let _wbStyle = '';
        if (_tg.sbLock.has(_k)) {
          _wbStyle = 'outline:2px solid #ffd34d;outline-offset:-2px;background-color:rgba(255,211,77,.28);box-shadow:inset 0 0 14px rgba(255,211,77,.55)';
        } else if (_gwDive) {
          if (_gwDive.phase === 'circle' && _gwDive.monster && _k === (_gwDive.monster.x + ',' + _gwDive.monster.y)) {
            _wbStyle = 'box-shadow:inset 0 0 0 999px rgba(10,10,20,0.28)';
          } else if (_gwDive.phase === 'dive' && _gwDive.tile) {
            const _dk = _gwDive.tile.x + ',' + _gwDive.tile.y;
            if (_k === _dk) {
              const _dark = (_gwDive.turnsLeft || 1) <= 1 ? 0.72 : 0.45;
              _wbStyle = `position:relative;box-shadow:inset 0 0 0 999px rgba(10,10,20,${_dark});outline:2px solid rgba(10,10,20,.85);outline-offset:-2px`;
              // DIVE ON YOU (Steve 2026-10-06): the player marker carries the
              // read via its diveTarget ring — a centered ▼ would just sit on
              // top of the 🧑 token and clutter it. Tile darkening stays.
              if (!isMe) g += `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;color:rgba(255,255,255,.9);text-shadow:0 0 6px rgba(0,0,0,.9);pointer-events:none">▼</span>`;
            } else if ((_gwDive.streak || []).some(c => _k === (c.x + ',' + c.y))) {
              _wbStyle = 'box-shadow:inset 0 0 0 999px rgba(10,10,20,0.14)';
            }
          }
        }
        if (!_wbStyle && _sbHeat && _sbHeat.monster) {
          const _mk = _sbHeat.monster.x + ',' + _sbHeat.monster.y;
          const _ch = Math.min(3, _sbHeat.charge || 0);
          if (_k === _mk) {
            const _op = [0.10, 0.18, 0.30, 0.45][_ch];
            _wbStyle = `box-shadow:inset 0 0 0 999px rgba(255,180,60,${_op})` +
              (_ch >= 3 ? ', inset 0 0 18px rgba(255,220,120,.9)' : '') +
              `;outline:2px solid rgba(255,211,77,${0.35 + 0.15 * _ch});outline-offset:-2px`;
          } else if ((_sbHeat.ring || []).some(c => _k === (c.x + ',' + c.y))) {
            const _op = [0, 0.08, 0.15, 0.22][_ch];
            if (_op > 0) _wbStyle = `box-shadow:inset 0 0 0 999px rgba(255,180,60,${_op})`;
          }
        }
        // WAVE 2 GROUP A (Steve 2026-10-06): per-monster telegraph identity.
        // Each of the four tricksters renders its attack in its own visual
        // voice, layered over the pattern class above. Knowledge-gated: the
        // mon map is only populated once the pattern is learned.
        // WAVE 2 TELEGRAPH IDENTITY (Steve 2026-10-06/08): per-monster visual
        // voice, layered over the pattern class above. Group A (tricksters)
        // keeps the w2a* classes; every other wave-2 monster with a grid
        // telegraph gets a w2b* voice (Steve 2026-10-08). Knowledge-gated:
        // the mon map is only populated once the pattern is learned.
        const _w2aMon = (_tg.mon || {})[_k];
        const _w2aCls =
          (_w2aMon === 'mirror_stag' ? ' w2aStag' : '') +
          (_w2aMon === 'review_drone' ? ' w2aDrone' : '') +
          (_w2aMon === 'voice_mimic_radio' ? ' w2aStatic' : '') +
          (_w2aMon === 'bright_idea' && !_tg.biHot.has(_k) ? ' w2bIdea' : '') +
          (_w2aMon === 'paparazzo' ? ' w2bPz' : '') +
          (_w2aMon === 'statickite' ? ' w2bKite' : '') +
          (_w2aMon === 'understudy' ? ' w2bUnder' : '') +
          (_w2aMon === 'landlord' ? ' w2bLord' : '') +
          (_w2aMon === 'heckler' ? ' w2bHeck' : '') +
          (_w2aMon === 'union_rep' ? ' w2bUnion' : '') +
          (_w2aMon === 'moderator' ? ' w2bMod' : '');
        // WAVE 1 STYLE VOICES (Steve 2026-10-06): per-style glyph overlays.
        //  dozeLane: ➤ arrows riding the charge direction (dozeAngle —
        //    first→last telegraph cell). The cell class carries
        //    position:relative (main.css).
        //  swarmHum: ◎ expanding hum rings on each declaring mouse
        //    (swarmSrc) — the hum's many throats. (.swarmRing, main.css.)
        // Knowledge-gated upstream in tbAllTelegraphCells like every bucket.
        if (_tg.dozeLane.has(_k)) {
          const _dang = _tg.dozeAngle || 0;
          g += `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${_dang}deg);font-size:15px;line-height:1;color:#c98a3d;text-shadow:0 0 5px rgba(0,0,0,.9);pointer-events:none">➤</span>`;
        }
        if ((_tg.swarmSrc || []).some(s => _k === (s.x + ',' + s.y))) {
          g += `<span class="swarmRing" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;color:#e8e8f2;text-shadow:0 0 6px rgba(0,0,0,.9);pointer-events:none">◎</span>`;
        }
        // GLASSWING TRAP SHADOW: the target tile darkens with turns
        // (faint → darker → almost black); splash tiles get a light mark.
        // Inline styles keep this in app.js (no CSS file touch).
        let _gwCls = '', _gwStyle = '';
        if (_gwTrap && _gwTrap.tile) {
          if (cx === _gwTrap.tile.x && cy === _gwTrap.tile.y) {
            const _turns = Math.min(3, Math.max(1, _gwTrap.turns || 1));
            const _dark = [0.22, 0.42, 0.68][_turns - 1];
            _gwStyle = `box-shadow:inset 0 0 0 999px rgba(10,10,20,${_dark})`;
            _gwCls = ' gwtrap';
          } else if (_gwTrap.splash) {
            for (const _sc of _gwTrap.splash) {
              if (_sc && _sc.x === cx && _sc.y === cy) {
                _gwStyle = 'box-shadow:inset 0 0 0 999px rgba(10,10,20,0.12)';
                _gwCls = ' gwtrap-splash';
                break;
              }
            }
          }
        }
        // NIGHTLIGHT TELL: the learned shimmer. The catfish's tile glows a
        // sickly green while the water is too still — the lure betraying
        // itself, but only to eyes that have learned what it means.
        // Inline styles keep this in app.js (no CSS file touch).
        let _cfCls = '', _cfStyle = '';
        if (_cfTell && cx === _cfTell.x && cy === _cfTell.y) {
          _cfStyle = 'box-shadow:inset 0 0 0 999px rgba(120,255,170,0.16);outline:2px solid rgba(120,255,170,0.55);outline-offset:-2px';
          _cfCls = ' cftell';
        }
        // BARRIER EDGE (Steve 2026-10-06): during combat, grid edges are exits —
        // stepping off flees through the node barrier (50% break, 50% followed).
        // The edge must READ as an exit, not a wall. Players were "teleporting"
        // without understanding why.
        const _inCombat = !!(Game.tbfight && !Game.tbfight.over);
        const _isEdge = (cx === 0 || cx === 8 || cy === 0 || cy === 8);
        const _barrierCls = (_inCombat && _isEdge) ? ' barrierEdge' : '';
        html += `<div class="${cls}${targetingCells().has(_k) ? ' targetable' : ''}${Game.cellScorched && Game.cellScorched(cx, cy) ? ' scorched' : ''}${_beamCls}${_srcCls}${_haloCls}${_tgCls}${_w2aCls}${_gwCls}${_cfCls}${_barrierCls}"${(_gwStyle || _cfStyle || _w2cStyle || _wbStyle) ? ` style="${[_gwStyle, _cfStyle, _w2cStyle, _wbStyle].filter(Boolean).join(';')}"` : ''} data-cx="${cx}" data-cy="${cy}">${g}</div>`;
      }
      html += '</div>';
    }
    // WAVE 2 TELEGRAPH VOICES (Steve 2026-10-06/08): per-monster visual
    // identity, layered over the generic pattern classes. Injected here (not
    // main.css) to keep wave-2 render additions in app.js.
    // Group A (tricksters):
    //  w2aStag: mirror-shimmer lane — pale glass, not the bulldozer's hazard stripes.
    //  w2aDrone: projected grid — cyan dotted, the beam is a presentation.
    //  w2aStatic: VOICE-RIPPLE — a voice calling your name reads as SOUND:
    //    bright electric-violet outline, glowing violet fill (real color
    //    distance from lockOn purple), an expanding ripple ring and a ≋ glyph.
    //    (Boosted Steve 2026-10-08: the old violet-on-purple was invisible
    //    at mobile size. The paparazzo's flash now carries the strobe voice
    //    (w2bPz; pzFlash is the exposure-style twin bucket).
    // Group B/C/D (Steve 2026-10-08) — every wave-2 monster with a grid
    // telegraph now renders in its own voice, no more generic sharing:
    //  w2bIdea: EUREKA WARM-UP — the idea heats as it thinks: radial ember
    //    glow on every windup tick except the last, which goes white-hot
    //    (biHot inline style; the class is withheld that tick so the
    //    white-hot read wins). ideaHeat is the detonation-style twin bucket.
    //  w2bPz: EXPOSURE — the paparazzo doesn't explode, it FLASHES: near-black
    //    cell, hard white strobe, viewfinder corner brackets (::before/::after).
    //    pzFlash is the exposure-style twin bucket (STYLE_BUCKETS routing).
    //  w2bKite: THE BROADCAST — electric static discharge, not an explosion:
    //    jagged cyan-white static bands + ↯. (Area static — distinct from
    //    w2aStatic's violet VOICE on a single tile.)
    //  w2bUnder: THE MIMIC — "doing the thing you do before you do it": the
    //    negative of your own lock-on — dark plum fill, WHITE dashed outline,
    //    ◐ half-face. Your reflection is attacking.
    //  w2bLord: EVICTION NOTICE — red tape: diagonal caution stripes + §.
    //    The sign has your name on it.
    //  w2bHeck: THE TAUNT — jeering hot-pink radial glow + ‼. The grid heckles.
    //  w2bUnion: GRIEVANCE FILED — ledger blue, ruled like a form. "Let's put
    //    this one in writing."
    //  w2bMod: REMOVAL NOTICE — the banhammer falls: heavy dark-red stamp + ✕.
    html += `<style>
.cell.w2aStag { outline: 2px solid #bfe9ff !important; outline-offset: -2px;
  background: linear-gradient(135deg, rgba(191,233,255,.30), rgba(191,233,255,.08) 50%, rgba(191,233,255,.30)) !important;
  animation: w2aShimmer 1.1s infinite alternate; }
@keyframes w2aShimmer { from { filter: brightness(1.0); } to { filter: brightness(1.5); } }
.cell.beamLane.w2aDrone { outline: 2px dotted #4df3ff !important; outline-offset: -2px;
  background-color: rgba(77,243,255,.16) !important; animation: w2aProject 0.7s infinite alternate; }
@keyframes w2aProject { from { filter: brightness(1.0); } to { filter: brightness(1.35); } }
.cell.w2aStatic { outline: 3px solid #d9a7ff !important; outline-offset: -3px;
  background-color: rgba(88,40,140,.55) !important;
  box-shadow: inset 0 0 18px rgba(217,167,255,.75) !important;
  animation: w2aRipple 0.9s infinite alternate; }
.cell.w2aStatic::before { content: ''; position: absolute; inset: 6px;
  border: 2px solid rgba(217,167,255,.60); border-radius: 50%;
  animation: w2aRingPulse 0.9s ease-out infinite; pointer-events: none; }
.cell.w2aStatic::after { content: '≋'; position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 16px; line-height: 1;
  color: #e9cfff; text-shadow: 0 0 6px rgba(0,0,0,.9); pointer-events: none; }
@keyframes w2aRipple { from { filter: brightness(1.0); } to { filter: brightness(1.5); } }
@keyframes w2aRingPulse { from { transform: scale(.55); opacity: .9; } to { transform: scale(1.15); opacity: .15; } }
.cell.w2bIdea, .cell.ideaHeat { outline: 2px solid #ffb020 !important; outline-offset: -2px;
  background: radial-gradient(circle at center, rgba(255,220,120,.55) 0, rgba(255,107,53,.30) 55%, rgba(255,107,53,.12) 100%) !important;
  animation: w2bIdeaHeat 1.0s infinite alternate; }
@keyframes w2bIdeaHeat { from { filter: brightness(1.0); } to { filter: brightness(1.6); } }
.cell.w2bPz, .cell.pzFlash { background-color: rgba(8,8,10,.80) !important;
  outline: 2px solid #ffffff !important; outline-offset: -2px;
  animation: w2bPzFlash 0.5s steps(2) infinite; }
@keyframes w2bPzFlash { 0%, 49% { filter: brightness(1.0); } 50%, 100% { filter: brightness(2.2); } }
.cell.w2bPz::before, .cell.w2bPz::after, .cell.pzFlash::before, .cell.pzFlash::after { content: ''; position: absolute;
  width: 10px; height: 10px; pointer-events: none; }
.cell.w2bPz::before, .cell.pzFlash::before { top: 3px; left: 3px; border-top: 3px solid #fff; border-left: 3px solid #fff; }
.cell.w2bPz::after, .cell.pzFlash::after { bottom: 3px; right: 3px; border-bottom: 3px solid #fff; border-right: 3px solid #fff; }
.cell.w2bKite { outline: 2px solid #a5f3fc !important; outline-offset: -2px;
  background: repeating-linear-gradient(115deg, rgba(165,243,252,.34) 0 4px, rgba(30,27,75,.55) 4px 9px) !important;
  animation: w2bKiteCrackle 0.4s steps(3) infinite; }
@keyframes w2bKiteCrackle { 0% { filter: brightness(1.0); } 100% { filter: brightness(1.7); } }
.cell.w2bKite::after { content: '↯'; position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 16px; line-height: 1;
  color: #d9fbff; text-shadow: 0 0 6px rgba(0,0,0,.9); pointer-events: none; }
.cell.w2bUnder { outline: 2px dashed #f5f0ff !important; outline-offset: -2px;
  background-color: rgba(30,10,45,.80) !important;
  box-shadow: inset 0 0 16px rgba(245,240,255,.35) !important;
  animation: w2bUnderPulse 1.1s infinite alternate; }
@keyframes w2bUnderPulse { from { filter: brightness(1.0); } to { filter: brightness(1.45); } }
.cell.w2bUnder::after { content: '◐'; position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 16px; line-height: 1;
  color: #f5f0ff; text-shadow: 0 0 6px rgba(0,0,0,.9); pointer-events: none; }
.cell.w2bLord { outline: 2px solid #ff5a5a !important; outline-offset: -2px;
  background: repeating-linear-gradient(45deg, rgba(255,90,90,.42) 0 6px, rgba(20,10,10,.55) 6px 12px) !important;
  animation: w2bLordPulse 1.2s infinite alternate; }
@keyframes w2bLordPulse { from { filter: brightness(1.0); } to { filter: brightness(1.35); } }
.cell.w2bLord::after { content: '§'; position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 16px; line-height: 1;
  color: #ffd7d7; text-shadow: 0 0 6px rgba(0,0,0,.9); pointer-events: none; }
.cell.w2bHeck { outline: 2px solid #ff4d9d !important; outline-offset: -2px;
  background: radial-gradient(circle at center, rgba(255,77,157,.42) 0, rgba(255,77,157,.14) 100%) !important;
  animation: w2bHeckJeer 0.7s infinite alternate; }
@keyframes w2bHeckJeer { from { filter: brightness(1.0); } to { filter: brightness(1.6); } }
.cell.w2bHeck::after { content: '‼'; position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 15px; line-height: 1;
  color: #ffc2dd; text-shadow: 0 0 6px rgba(0,0,0,.9); pointer-events: none; }
.cell.w2bUnion { outline: 2px solid #7aa2ff !important; outline-offset: -2px;
  background-color: rgba(16,28,68,.72) !important;
  background-image: repeating-linear-gradient(0deg, rgba(122,162,255,.30) 0 1px, transparent 1px 7px) !important;
  animation: w2bUnionPulse 1.3s infinite alternate; }
@keyframes w2bUnionPulse { from { filter: brightness(1.0); } to { filter: brightness(1.35); } }
.cell.w2bMod { outline: 3px solid #e03131 !important; outline-offset: -3px;
  background-color: rgba(80,10,10,.72) !important;
  box-shadow: inset 0 0 18px rgba(224,49,49,.60) !important;
  animation: w2bModStamp 0.9s infinite alternate; }
@keyframes w2bModStamp { from { filter: brightness(1.0); } to { filter: brightness(1.4); } }
.cell.w2bMod::after { content: '✕'; position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 18px; line-height: 1;
  font-weight: bold; color: #ffb3b3; text-shadow: 0 0 6px rgba(0,0,0,.9);
  pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .cell.w2aStag, .cell.beamLane.w2aDrone, .cell.w2aStatic, .cell.w2bIdea,
  .cell.w2bPz, .cell.w2bKite, .cell.w2bUnder, .cell.w2bLord, .cell.w2bHeck,
  .cell.w2bUnion, .cell.w2bMod, .cell.pzFlash, .cell.ideaHeat { animation: none; }
}
/* PLAYER-COINCIDENT TELEGRAPH ALERTS (Steve 2026-10-06): a telegraph landing
   on the player's own tile rings the marker itself — the tile fill alone
   hides under the white token. sbLockTarget: molten gold (sunbasker lock on
   you). diveTarget: warning red (glasswing dive shadow on you). diveTarget
   is listed after, so the red wins when both coincide (the dive landing is
   the more urgent read; the gold tile fill still shows underneath). */
.cell.me .vent.sbLockTarget::before {
  content: ''; position: absolute; inset: -2px;
  border: 3px solid #ffd34d; border-radius: 50%;
  box-shadow: 0 0 14px rgba(255,211,77,.95), inset 0 0 8px rgba(255,211,77,.55);
  animation: ppulse .7s ease-in-out infinite; pointer-events: none;
}
.cell.me .vent.diveTarget::before {
  content: ''; position: absolute; inset: -2px;
  border: 3px solid #ff2d2d; border-radius: 50%;
  box-shadow: 0 0 14px rgba(255,45,45,.95), inset 0 0 8px rgba(255,45,45,.55);
  animation: ppulse .55s ease-in-out infinite; pointer-events: none;
}
.cell.me .vent.diveTarget, .cell.me .vent.sbLockTarget { position: relative; }
@keyframes ppulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .6; transform: scale(.92); }
}
/* WAVE 2 DIRECT-VOICE TOKEN RINGS (Steve 2026-10-08): the six direct attacks
   all land on the player's tile — the token swallows the tile fill, so the
   token itself rings in the voice's color. Same ppulse language as
   diveTarget/sbLockTarget; the dashed white ring is the mimic's negative. */
.cell.me .vent.staticTarget::before, .cell.me .vent.underTarget::before,
.cell.me .vent.lordTarget::before, .cell.me .vent.heckTarget::before,
.cell.me .vent.unionTarget::before, .cell.me .vent.modTarget::before {
  content: ''; position: absolute; inset: -2px; border-radius: 50%;
  pointer-events: none; animation: ppulse .7s ease-in-out infinite; }
.cell.me .vent.staticTarget, .cell.me .vent.underTarget,
.cell.me .vent.lordTarget, .cell.me .vent.heckTarget,
.cell.me .vent.unionTarget, .cell.me .vent.modTarget { position: relative; }
.cell.me .vent.staticTarget::before {
  border: 3px solid #d9a7ff;
  box-shadow: 0 0 14px rgba(217,167,255,.95), inset 0 0 8px rgba(217,167,255,.55); }
.cell.me .vent.underTarget::before {
  border: 3px dashed #f5f0ff;
  box-shadow: 0 0 14px rgba(245,240,255,.9), inset 0 0 8px rgba(245,240,255,.5); }
.cell.me .vent.lordTarget::before {
  border: 3px solid #ff5a5a;
  box-shadow: 0 0 14px rgba(255,90,90,.95), inset 0 0 8px rgba(255,90,90,.55); }
.cell.me .vent.heckTarget::before {
  border: 3px solid #ff4d9d;
  box-shadow: 0 0 14px rgba(255,77,157,.95), inset 0 0 8px rgba(255,77,157,.55); }
.cell.me .vent.unionTarget::before {
  border: 3px solid #7aa2ff;
  box-shadow: 0 0 14px rgba(122,162,255,.95), inset 0 0 8px rgba(122,162,255,.55); }
.cell.me .vent.modTarget::before {
  border: 3px solid #e03131;
  box-shadow: 0 0 16px rgba(224,49,49,.95), inset 0 0 8px rgba(224,49,49,.6); }
@media (prefers-reduced-motion: reduce) {
  .cell.me .vent.diveTarget::before, .cell.me .vent.sbLockTarget::before,
  .cell.me .vent.staticTarget::before, .cell.me .vent.underTarget::before,
  .cell.me .vent.lordTarget::before, .cell.me .vent.heckTarget::before,
  .cell.me .vent.unionTarget::before, .cell.me .vent.modTarget::before { animation: none; }
}
</style>`;
    return html;
  }

  // compassHTML (Steve 2026-10-05): the minimap was 49 tiles for minor info.
  // This is one line: where you are, where home is, where you're going,
  // what's nearby. Tap to expand the full map.
  function compassHTML(st) {
    if (st.inCombat || Game.state.over) return '';
    const px = st.px ?? 4, py = st.py ?? 4;
    const dirArrow = (dx, dy) => {
      const sx = Math.sign(dx), sy = Math.sign(dy);
      return { '-1,-1': '↖', '0,-1': '↑', '1,-1': '↗', '-1,0': '←', '0,0': '⊙', '1,0': '→', '-1,1': '↙', '0,1': '↓', '1,1': '↘' }[sx + ',' + sy] || '·';
    };
    const dist = (x, y) => Math.max(Math.abs(x - px), Math.abs(y - py));
    const parts = [];
    // Current node
    try {
      const nodeName = Game.nodeDetail ? Game.nodeDetail().epithet : 'field';
      parts.push(`📍 ${esc(nodeName.split('—')[0].trim())}`);
    } catch (e) { parts.push('📍 here'); }
    // Haven (home)
    try {
      const hv = Game.state.village;
      if (hv && hv.px !== undefined) {
        const d = dist(hv.px, hv.py);
        if (d > 0) parts.push(`🏘️ ${dirArrow(hv.px - px, hv.py - py)}${d}`);
      }
    } catch (e) {}
    // (No travel-destination marker: the old destination hook was removed.
    // The compass marks haven, discovered villages, and the revealed beast —
    // all earned.)
    // Wanderer/beast
    try {
      const w = st.wanderer;
      if (w && w.x !== undefined) {
        const tl = Game.tileAt(w.x, w.y);
        if (tl && tl.revealed) parts.push(`🐗 ${dirArrow(w.x - px, w.y - py)}${dist(w.x, w.y)}`);
      }
    } catch (e) {}
    // Other villages
    try {
      for (const v of (Game.state.otherVillages || [])) {
        if (v.generated) parts.push(`🏘️ ${dirArrow(v.x - px, v.y - py)}${dist(v.x, v.y)}`);
      }
    } catch (e) {}
    if (!parts.length) return '';
    return `<div class="compass" id="compass" title="Tap for full map">${parts.join(' · ')}</div>`;
  }

  function renderMap(st, tset) {
    let html = '';
    // PLAYER PERSON (Steve 2026-10-06): you render as your villager sprite —
    // like any villager. No marker, no arrow, no "you are here". You find
    // yourself by recognizing your own face.
    let meVp = null, meSpr = '';
    try {
      meVp = Game.data.villagers.find(v => v.id === Game.villagerId) || (Game.data.background_survivors || []).find(v => v.id === Game.villagerId);
      meSpr = villagerSpriteHtml(meVp);
    } catch (e) {}
    // SVG TILE SCENES (Steve 2026-10-06): tiles render as miniature scenes
    // when the module is loaded; glyph fallback otherwise.
    const TS = (typeof Scattering !== 'undefined' && Scattering.TileScenes) || null;
    for (let y = 0; y < 9; y++) {
      html += '<div class="mrow">';
      for (let x = 0; x < 9; x++) {
        // FOG OF WAR (Steve 2026-10-06): only tiles you've WALKED IN reveal.
        // Check seenTiles for visited status. No hardcoded visibility.
        // FOG DEPTH (break-it travel r4 2026-10-09): 'shared' tiles render
        // as BIOME COLOR ONLY in the block below (Steve 2026-10-07) — never
        // full TileScenes/emoji detail. The old check treated ANY seenTiles
        // entry as fully-seen, so a scout's report rendered full scene
        // detail. Only 'visited' earns the detail path here; 'shared' falls
        // through to the biome-color branch.
        let _seenSimple = false;
        try {
          const _st = (Game.state && Game.state.scholar && Game.state.scholar.seenTiles) || {};
          const _e = _st[x + ',' + y];
          if (_e && _e.k === 'v') _seenSimple = true;
        } catch (e) {}
        if (_seenSimple) {
          // Get tile type
          let _tl = null, _ttype = 'meadow';
          try {
            const _tiles = Game.map && Game.map.tiles;
            if (_tiles && _tiles[y] && _tiles[y][x]) {
              _tl = _tiles[y][x];
              if (_tl.type) _ttype = _tl.type;
            }
          } catch (e) {}
          // Haven always shows 🏘️ (Steve 2026-10-06) — center of 9x9
          if (x === 4 && y === 4) {
            html += `<div class="tile" data-x="${x}" data-y="${y}"><div style="background:#7cbd6b;width:100%;height:100%;min-height:40px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px">🏘️</div></div>`;
            continue;
          }
          // Try TileScenes SVG for detailed terrain
          let _svgOut = null;
          try {
            const _TS = (typeof Scattering !== 'undefined' && Scattering.TileScenes) || null;
            if (_TS && _TS.svgFor && _tl) {
              _svgOut = _TS.svgFor(x, y, { seen: true, tile: _tl });
            }
          } catch (e) {}
          const _svgValid = _svgOut && _svgOut.length > 100 && _svgOut.indexOf('#0d120d') === -1;
          if (_svgValid) {
            html += `<div class="tile" data-x="${x}" data-y="${y}">${_svgOut}</div>`;
          } else {
            // Fallback: bright biome DIV with emoji
            const _terrain = {
              forest_floor: ['#8a5a3a', '🌲'], forest: ['#5a8a3a', '🌲'],
              grove: ['#7cbd6b', '🌳'], meadow: ['#7cbd6b', '🌿'],
              field: ['#a0d060', '🌾'], thicket: ['#4a8a3a', '🌳'],
              wetland: ['#5aa0b0', '💧'], swamp: ['#5aa0b0', '💧'],
              creek: ['#4a9ad0', '💧'], water: ['#4a9ad0', '🌊'],
              river: ['#4a9ad0', '🌊'], trail_edge: ['#c0a060', '🟫'],
              trail: ['#c0a060', '🟫'], path: ['#c0a060', '🟫'],
              ruin: ['#9a9a9a', '🏚️'],
            };
            const _t = _terrain[_ttype] || _terrain['meadow'];
            html += `<div class="tile" data-x="${x}" data-y="${y}"><div style="background:${_t[0]};width:100%;height:100%;min-height:40px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px">${_t[1]}</div></div>`;
          }
          continue;
        }
        let tl = null;
        try {
          // Try direct tiles access first (old saves may have map without tiles via tileAt)
          const tiles = Game.map && Game.map.tiles;
          if (tiles && tiles[y] && tiles[y][x]) {
            tl = tiles[y][x];
          } else {
            tl = Game.tileAt(x, y);
          }
        } catch (e) { tl = null; }
        const mpp = Game.map || {};
        const isP = (x === mpp.px && y === mpp.py);
        // VISIBILITY - ROOT CAUSE FIX (Steve 2026-10-06):
        // The seenTiles lookup was unreliable in the render context (tiles
        // showed as unseen despite the counter saying "3 seen").
        // VISIBILITY (Steve 2026-10-07):
        // - ONLY seenTiles grants visibility. No proximity reveal.
        // - 'visited' (player walked there): full SVG detail node
        // - 'shared' (villager/codex shared): biome tile color only, NOT detailed SVG
        // - null: fog of war. You haven't earned it.
        let seen = null;
        let diagColor = null;
        try {
          const st = (Game.state && Game.state.scholar && Game.state.scholar.seenTiles) || {};
          const entry = st[x + ',' + y];
          if (entry) {
            seen = entry.k === 'v' ? 'visited' : 'shared';
          }
          // Player's current tile is always 'visited' (you're standing there)
          const px = (Game.map && Game.map.px);
          const py = (Game.map && Game.map.py);
          if (px !== undefined && x === px && y === py) seen = 'visited';
        } catch (e) {}
        const isW = st.wanderer && x === st.wanderer.x && y === st.wanderer.y && seen;
        const isT = tset.has(x + ',' + y);
        // depletionClass gates fog internally (break-it travel r4 2026-10-09):
        // only seen tiles show picked-clean/barren.
        const depCls = Game.depletionClass ? Game.depletionClass(tl, x, y) : ((((tl.maxStock - (tl.stock || 0) > 0)) && seen) ? ' spent' : '');
        const pathCls = (tl.wornPath && seen) ? 'worn-path' : '';
        const shrCls = seen === 'shared' ? ' shared' : '';
        const cls = 'tile' + (isT ? ' dest' : '') + (isW ? ' beast' : '') + (depCls ? ' ' + depCls : '') + (pathCls ? ' ' + pathCls : '') + shrCls;
        // other villages: show 🏘️ ONLY if the tile is seen (Steve 2026-10-06:
        // "another village I never visited" = fog leak. generated != discovered)
        const otherV = (Game.state.otherVillages || []).find(v => {
          if (v.x !== x || v.y !== y || !v.generated) return false;
          const st2 = (Game.state && Game.state.scholar && Game.state.scholar.seenTiles) || {};
          return !!st2[x + ',' + y];
        });
        let g;
        if (isP) {
          g = meSpr ? `<span class="mface msprite">${meSpr}</span>` : '🧍';
        } else if (isW && seen) {
          g = '🐗';
        } else if (otherV) {
          // SYSTEM INTEGRATION (Steve 2026-10-07): L1+ shows village power.
          // The System sees more as you link codices. Your HUD sharpens.
          let vInfo = '';
          try {
            const integ = Game.systemIntegrationLevel ? Game.systemIntegrationLevel() : 0;
            if (integ >= 1 && Game.villagePower) {
              const pw = Game.villagePower(otherV);
              const focus = (otherV.knowledgeProfile || {}).focus || 'survivors';
              vInfo = ` title="${otherV.name} (Pwr ${pw}, ${focus})"`;
            }
          } catch (e) {}
          g = `<span${vInfo}>🏘️</span>`;
        } else {
          // HAVEN/VILLAGE ICON (Steve 2026-10-06): havens and villages ALWAYS
          // show the 🏘️ icon, not terrain. You need to see where people are.
          // Haven is always at (4,4); check coords directly (tile data may be null).
          const isHavenTile = (x === 4 && y === 4) || (tl && (tl.type === 'haven' || tl.village));
          if (isHavenTile) {
            g = '🏘️';
          } else if (diagColor) {
            // DIAGNOSTIC: show the failure color
            g = `<div style="background:${diagColor};width:100%;height:100%;border-radius:4px"></div>`;
        } else if (!seen) {
            g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">` +
              `<rect x="2" y="2" width="60" height="60" rx="8" fill="#0d120d" stroke="#1a2a1a" stroke-width="1"/></svg>`;
          } else if (seen === 'shared') {
            // Steve 2026-10-07: shared tiles show as BIOME COLOR ONLY,
            // not detailed SVG. Fog of war for detail until visited personally
            // or via codex connection.
            const biomeColors = {
              haven: '#7cbd6b', meadow: '#7cbd6b', forest: '#2d6a2d', grove: '#3a7d3a',
              wetland: '#4a8a8a', creek: '#5a9aba', thicket: '#2d5a2d', trail_edge: '#8a7a5a',
              forest_floor: '#3a5a3a'
            };
            const bg = biomeColors[(tl && tl.type) || 'meadow'] || '#7cbd6b';
            g = `<div style="background:${bg};width:100%;height:100%;min-height:40px;border-radius:4px;opacity:0.7"></div>`;
          } else {
            try {
              if (TS && TS.svgFor && tl) {
                g = TS.svgFor(x, y, { seen: true, tile: tl });
              } else {
                g = ''; // No TileScenes or no tile data
              }
            } catch (e) {
              g = ''; // Error - blank, not mixed
            }
            // If TileScenes returned blank/fog (failed), use simple fallback
            // (better than blank - Steve confirmed simple version works)
            // Blank SVG is 130 chars with fog color #0d120d - must detect it
            const isBlank = !g || g.length < 100 || g.indexOf('#0d120d') !== -1;
            if (isBlank) {
              const ttype = tl ? tl.type : 'unknown';
              // TRUE MINECRAFT PALETTE (Steve 2026-10-06): unmistakably bright.
              const colors = {
                forest_floor: '#8a5a3a', forest: '#5a8a3a', grove: '#7cbd6b',
                meadow: '#7cbd6b', field: '#a0d060', thicket: '#4a8a3a',
                wetland: '#5aa0b0', swamp: '#5aa0b0', creek: '#4a9ad0',
                water: '#4a9ad0', river: '#4a9ad0', trail_edge: '#c0a060',
                trail: '#c0a060', path: '#c0a060', ruin: '#9a9a9a',
                haven: '#7cbd6b'
              };
              // If no tile data, use bright meadow default (Steve 2026-10-06).
              // Explored tiles must NEVER be dark.
              const isUnknown = !tl || ttype === 'unknown';
              const base = isUnknown ? '#7aaa4a' : (colors[ttype] || '#7aaa4a');
              // Simple DIV (not SVG) - must render (Steve 2026-10-06)
              g = `<div style="background:${base};width:100%;height:100%;min-height:40px;border-radius:4px"></div>`;
            }
          }
        }
        html += `<div class="${cls}" data-x="${x}" data-y="${y}">${g}</div>`;
      }
      html += '</div>';
    }
    return html;
  }

  // ---------- codex ----------
  // LANGUAGES: tongues you're absorbing, word by word. Exposure teaches —
  // unless the translator does it for you, in which case your brain
  // never bothers. "Italian: 12 words — catching phrases."
  function languagesSection() {
    if (!Game.langExposureReport) return '';
    const langs = Game.langExposureReport();
    if (!langs.length) return '';
    const sys = !!Game.state.systemArrived;
    const rows = langs.map(l =>
      `<p class="small">${l.icon} <b>${esc(l.name)}</b> — ${l.n} words · <i>${esc(l.stage)}</i>${l.fluent ? ' ✓' : ''}</p>`
    ).join('');
    return `<h1 class="title" style="font-size:18px">LANGUAGES</h1>
      <p class="small"><i>${sys ? 'every tongue you\'ve brushed against. the translator knows them all, of course. it would.' : 'tongues you\'re picking up the hard way — ears, patience, embarrassment.'}</i></p>${rows}`;
  }

  // PEOPLE: the journal fills as you learn. Pre-System it's your handwriting —
  // uncertain, personal. Post-System the Codex gets precise and invasive.
  function peopleSection() {
    if (!Game.peopleJournal) return '';
    const sys = !!Game.state.systemArrived;
    const folks = Game.peopleJournal();
    if (!folks.length) return '';
    const cards = folks.map(({ vid, e }) => {
      const trust = (Game.state.village.trust || {})[vid] || 10;
      const rel = trust >= 60 ? (sys ? 'Trusts you.' : 'I think they trust me.')
        : trust >= 40 ? (sys ? 'Warming.' : 'Warming up, maybe.')
        : trust >= 25 ? (sys ? 'Guarded.' : 'Still guarded.')
        : (sys ? 'Distrustful.' : 'Doesn\'t trust me yet.');
      const title = e.name ? esc(e.name.value) : esc(Game.personDescriptor(vid));
      const nameNote = e.name
        ? (sys ? `<span class="small" style="opacity:.6"> · id: ${esc(e.name.how || 'filed')}</span>` : `<span class="small" style="opacity:.6"> · ${esc(e.name.how === 'overheard by the fire' ? 'heard someone say it' : e.name.how || '')}</span>`)
        : '';
      const q = sys ? '—' : '?';
      const occ = e.occupation
        ? (e.occupation.sure ? esc(e.occupation.value) : `<i>I think: ${esc(e.occupation.value)}?</i>`)
        : (sys ? '—' : `<span style="opacity:.5">What did they do before? ${q}</span>`);
      const goal = e.goal
        ? `Wants ${esc(e.goal.want || e.goal.id)}.`
        : (sys ? 'Motive: —' : `<span style="opacity:.5">What do they want? ${q}</span>`);
      const langs = e.languages.length
        ? e.languages.map(l => esc(l.label)).join(' · ')
        : (sys ? '—' : `<span style="opacity:.5">Haven't really talked yet.</span>`);
      const traits = (e.traits || []).map(t =>
        `<p class="small">${t.sure ? '' : '<i>maybe: </i>'}${esc(t.text)} <span style="opacity:.45">· ${esc(t.via || 'noticed')}</span></p>`).join('');
      const story = (e.backstory || []).map(b => `<p class="small"><i>"${esc(b.text)}"</i></p>`).join('');
      const notes = (e.notes || []).map(n => `<p class="small">· ${esc(n.text)}</p>`).join('');
      const promises = (e.promises || []).map(p => {
        const mark = p.status === 'kept' ? '✓' : p.status === 'broken' ? '✗' : '○';
        const col = p.status === 'kept' ? '#8f8' : p.status === 'broken' ? '#f88' : '#fd8';
        return `<p class="small" style="color:${col}">${mark} ${esc(p.text)} <span style="opacity:.6">(${p.status})</span></p>`;
      }).join('');
      return `<div class="card codex"><h3>${title}${nameNote}</h3>
        <p class="small">${sys ? `<b>OCC:</b> ${occ} · <b>GOAL:</b> ${goal} · <b>LANG:</b> ${langs}` : `${occ}<br>${goal}<br><span style="opacity:.7">Speaks: ${langs}</span>`}</p>
        ${traits}${story}${notes}${promises}
        ${Game.personDepthHTML ? Game.personDepthHTML(vid, e) : ''}
        <p class="small" style="opacity:.6">${esc(rel)}</p></div>`;
    }).join('');
    return `<h1 class="title" style="font-size:18px">PEOPLE</h1>
      <p class="small"><i>${sys ? 'personnel files. the System knows them better than you do.' : 'your handwriting. who these people are, as far as you can tell.'}</i></p>${cards}`;
  }

  // 📺 OVERSIGHT (Steve 2026-10-06): visible eligibility — who can go, and why.
  // Driven by Game.contestEligible(): eligible names + notability notes
  // (earned deeds — showing them here is the intended "why was I picked"),
  // or the reason pre-day-14. Absent fn = no panel (sibling owns contests.js).
  function oversightPanel() {
    if (typeof Game.contestEligible !== 'function') return '';
    let el = null;
    try { el = Game.contestEligible(); } catch (e) { return ''; }
    if (!el) return '';
    const head = '<h1 class="title" style="font-size:18px">📺 OVERSIGHT</h1><p class="small"><i>the flagship is watching. contests are its teeth. who can go — and why.</i></p>';
    if (el.eligible && el.eligible.length) {
      return head + el.eligible.map(e =>
        `<p class="small">🎯 <b>${esc(e.name)}</b>` +
        ((e.notability && e.notability.length)
          ? ' — <i>' + esc(e.notability.join('; ')) + '</i>'
          : ' — <i>no deeds on the record. the show decides.</i>') +
        '</p>').join('');
    }
    return head + `<p class="small">${esc(el.reason || "The show isn't casting yet.")}</p>`;
  }

  // VILLAGE MAP (Steve 2026-10-06): the codex keeps the VILLAGE's
  // cumulative map — everywhere anyone has been and shared. Union of every
  // villager's visited tiles plus your own seen tiles. This is the shared
  // knowledge surface; your personal map may know less.
  function villageMapSection() {
    try {
      // FOG (break-it travel r4 2026-10-09): the old code unioned every
      // villager's seeded visitedTiles directly — ground nobody ever shared
      // with you rendered NAMED in your codex, bypassing the compareMaps
      // conversation gate (maps_are_social). villageMapKnown() applies the
      // gate: your seen tiles + villagers who actually shared.
      const known = (typeof Game.villageMapKnown === 'function') ? Game.villageMapKnown() : {};
      const seen = known;
      const n = Object.keys(seen).length;
      if (!n) return '';
      let cells = '';
      for (let y = 0; y < 9; y++) {
        cells += '<div class="mrow">';
        for (let x = 0; x < 9; x++) {
          const k = x + ',' + y;
          const tl = Game.tileAt(x, y);
          cells += `<div class="tile${seen[k] ? '' : ' fog'}" title="${seen[k] ? esc((S.TILE_NAME || {})[tl.type] || tl.type) : 'unknown'}">${seen[k] ? (S.TILE_GLYPH[tl.type] || '·') : ''}</div>`;
        }
        cells += '</div>';
      }
      return `<h1 class="title" style="font-size:18px">MAPS</h1>
        <p class="small"><i>everywhere the village has walked, pooled together. ${n} place${n === 1 ? '' : 's'} known.</i></p>
        <div class="map minimap" style="margin:8px 0">${cells}</div>`;
    } catch (e) { return ''; }
  }

  // ---------- codex: ALIENS ----------
  // KNOWLEDGE GATE (Steve 2026-10-08): the section renders only once the
  // player has met at least one alien player — "if you don't know, it
  // doesn't show." The entry fields are gated upstream in alienPlayers.js
  // apCodexEntry: pre-reveal title reads 'stranger', species/disposition
  // read 'unknown', and the note is suspicion-only. This renderer prints
  // those fields verbatim and never consults apPersona — the gate lives
  // there, never here, so no alien truth can leak through this surface.
  function codexAliensSection(aliens) {
    const list = Object.entries(aliens || {});
    if (!list.length) return '';
    const STAGE = { encountered: 'encountered', identified: 'identified', understood: 'understood' };
    return '<h1 class="title" style="font-size:18px">ALIENS</h1>' +
      '<p class="small"><i>not everyone out there is a person. the book keeps what you have learned about them — and nothing you have not.</i></p>' +
      list.map(([pid, a]) => {
        const truth = a.species && a.species !== 'unknown';
        return `<div class="card codex"><h3>${esc(a.name || 'someone')} <span class="small" style="opacity:.7">${esc(a.title || 'stranger')}</span></h3>` +
          `<p class="small" style="opacity:.7">${esc(STAGE[a.stage] || 'encountered')}${truth ? ` · ${esc(a.species)} · ${esc(a.disposition || 'unknown')}` : ''}</p>` +
          `<p class="small"><i>${esc(a.note || '')}</i></p></div>`;
      }).join('');
  }

  function codexScreen() {
    const entries = Game.codexEntries();
    const inprog = Game.codexInProgress();
    const mons = Game.state.codex.monsters || {};
    const LVL = { 1: 'L1 · Named', 2: 'L2 · Parts', 3: 'L3 · Uses', 4: 'L4 · Mastery' };
    // KNOWLEDGE TAXONOMY: skills section — knowledge about ANYTHING, not just plants
    const skills = Object.entries(Game.state.codex.skills || {}).map(([sid, e]) => {
      const k = (Game.data.knowledge || []).find(x => x.id === sid);
      if (!k) return null;
      return { sid, name: k.name, domain: k.domain, level: e.level || 1,
               text: (k.levels || {})[String(e.level || 1)] || '', via: e.via || '' };
    }).filter(Boolean);
    const techniques = Game.techniqueList ? Game.techniqueList() : [];
    screen.innerHTML = `
      ${bar('scattering://codex', entries.length + ' entries')}
      <h1 class="title" style="font-size:22px">${Game.journalName().toUpperCase()}</h1>
      <p class="small"><i>${Game.journalName() === 'Codex' ? 'the village keeps what you write. the System is watching.' : 'field journal — your handwriting. what you learned, so far just yours.'}</i></p>
      ${(() => { try { const jo = Game.journalOpening ? Game.journalOpening() : null; return jo && jo.line ? `<p class="small" style="opacity:.7"><i>${esc(jo.line)}</i></p>` : ''; } catch (e) { return ''; } })()}
      ${villageMapSection()}
      ${entries.length ? entries.map(e => `
        <div class="card codex"><h3>${e.wrongAs ? esc(e.wrongAs) + ' <span class="small" style="opacity:.6">(as taught)</span>' : e.name} <span class="small">· ${e.kcalKnown ? `${e.kcal} kcal/${e.unit}` : `<i>kcal unknown — learn preparation</i>`}</span> <span class="small" style="opacity:.7">[${LVL[e.level] || 'L1'}]</span></h3>
        ${e.contested ? `<p class="small" style="color:#e8a13c"><b>⚠ Disputed:</b> ${esc(e.contested.byName)} insists this is <b>${esc(e.contested.claim)}</b> — you know it's ${esc(e.name)}.${e.contested.deliberate ? ' (You think they knew better.)' : ''}</p>` : ''}
        ${e.wrongAs ? `<p class="small" style="color:#e8a13c"><b>⚠ Taught wrong:</b> ${esc(e.taughtByName || 'someone')} taught you this as <b>${esc(e.wrongAs)}</b>. You haven't verified it yourself.</p>` : ''}
        <p class="small"><b>Prep:</b> ${e.prepKnown ? (e.prep || '—') : '<i>unknown — eat it or reach L2 to learn</i>'}</p>
        <p class="small"><b>Uses:</b> ${e.uses ? esc(e.uses) : '<i>unknown — harvest and taste to learn</i>'}</p>
        ${(e.knowledgeGaps || []).length ? `<p class="small" style="opacity:.8">🔍 <i>still to learn:</i> ${esc(e.knowledgeGaps.join(' '))}</p>` : ''}
        ${(e.journalMarks || []).length ? e.journalMarks.map(m => `<p class="small" style="color:#e8a13c">⚠ ${esc(m.kind)} — day ${m.day}${m.note ? ': ' + esc(m.note) : ''}</p>`).join('') : ''}
        ${(e.journalEntries || []).length ? `<p class="small"><i>📓 ${esc(e.journalEntries[e.journalEntries.length - 1].text)}</i></p>` : ''}
        ${(e.marginalia || []).length ? e.marginalia.slice(-2).map(m => `<p class="small" style="opacity:.7"><i>✒ ${esc(m.first || 'a former hand')}${m.register ? ' · ' + esc(m.register) : ''}, day ${m.day}: ${esc(m.text)}</i></p>`).join('') : ''}
        <p class="small"><i>${e.knowledge || ''}</i></p><p>${e.level >= 1 ? e.text : ''}</p></div>`).join('')
        : '<div class="card"><h3>No entries yet.</h3><p>Forage something. Survive it. Write it down.</p></div>'}
      ${skills.length ? '<h1 class="title" style="font-size:18px">SKILLS</h1><p class="small"><i>knowledge about anything — not just plants. your old life, books, strangers, hard lessons.</i></p>' + skills.map(s => `
        <div class="card codex"><h3>${esc(s.name)} <span class="small" style="opacity:.7">[L${s.level} · ${esc(s.domain)}]</span></h3>
        <p class="small"><i>${esc(s.text)}</i></p>${s.via ? `<p class="small" style="opacity:.5">via ${esc(s.via)}</p>` : ''}</div>`).join('') : ''}
      ${peopleSection()}
      ${languagesSection()}
      ${techniques.length ? '<h1 class="title" style="font-size:18px">TECHNIQUES</h1><p class="small"><i>where knowledge meets power.</i></p>' + techniques.map(t => `
        <div class="card codex"><h3>⚡ ${esc(t.name)}</h3><p class="small">${esc(t.effect)}</p></div>`).join('') : ''}
      ${Game.codexDeeds && Game.codexDeeds().length ? '<h1 class="title" style="font-size:18px">DEEDS</h1><p class="small"><i>the village remembers who did what. synced to the book.</i></p>' + Game.codexDeeds().slice(0, 12).map(d => `
        <div class="card codex"><h3>${esc(Game.displayName ? Game.displayName(d.vid) : 'Someone')} <span class="small" style="opacity:.6">· day ${d.day}</span></h3><p class="small">${esc(d.text)}</p></div>`).join('') : ''}
      ${Game.villagerBoard ? '<h1 class="title" style="font-size:18px">CONTEST</h1><p class="small"><i>the leaderboard. the show is watching.</i></p>' + Game.villagerBoard().slice(0, 6).map((r, i) => `
        <p class="small">${i + 1}. <b>${esc(r.name)}</b> — ${r.score}${r.you ? ' (you)' : ''}${r.trend ? ' ' + r.trend : ''}</p>`).join('') : ''}
      ${oversightPanel()}
      ${inprog.length ? '<h1 class="title" style="font-size:18px">UNIDENTIFIED</h1><p class="small"><i>seen, not named. keep looking.</i></p>' + inprog.map(u => `
        <div class="card"><h3 style="opacity:.75">${u.descriptor}</h3>
        <p class="small">encounters: ${u.enc}/${u.threshold} ${u.enc >= u.threshold - 1 ? '— <b>almost there</b>' : ''}</p></div>`).join('') : ''}
      ${Object.keys(mons).length ? '<h1 class="title" style="font-size:18px">BEASTS</h1>' + Object.entries(mons).map(([id, m]) => {
        const md = Game.data.monsters.find(x => x.id === id);
        const name = Game.monsterDisplayName ? Game.monsterDisplayName(id) : md.name;
        const stageText = md.codexStages[m.stage] || md.codexStages.unknown || '';
        // KNOWLEDGE GATE (Steve 2026-10-07): the telegraph tell is EARNED —
        // seeing the attack once isn't enough; you must survive a full
        // discharge (tbPatternKnown) or slay it. Before that the codex
        // names the gap honestly instead of leaking the tell.
        const atkName = (md.attack || {}).name;
        const tgKnown = m.stage === 'slain' || (atkName && Game.tbPatternKnown ? Game.tbPatternKnown(id, atkName) : false);
        let attacks = '';
        if ((m.attacksSeen || []).length) {
          const enc = md.encounter || {};
          let coach = '';
          if (tgKnown) {
            // EARNED KNOWLEDGE SURFACES (Steve 2026-10-08): the pattern you
            // paid for — its name, its tell, and what the village figured
            // out. This is the payoff beat.
            coach = ` — <b>${esc(atkName || 'its attack')}</b>: ${esc((md.attack || {}).telegraph || 'it gives warning first')}` +
              (enc.knownCue ? `<br>💡 ${esc(enc.knownCue)}` : '') +
              (enc.knownTactics ? `<br>📋 ${esc(enc.knownTactics)}` : '');
          } else {
            coach = ` — <i>you haven't lived through its full attack yet. Survive one and the codex writes the pattern.</i>`;
          }
          attacks = `<p class="small">You've seen it attack ${m.attacksSeen.length}×${coach}</p>`;
        }
        return `<div class="card codex"><h3>${esc(name)}</h3>${m.villageName ? `<p class="small" style="opacity:.7">named by the village</p>` : `<p class="small" style="opacity:.7">not yet named — the village is arguing about it</p>`}<p>${esc(stageText)}</p>${attacks}</div>`;
      }).join('') : ''}
      ${Object.entries(Game.state.codex.animals || {}).length ? '<h1 class="title" style="font-size:18px">ANIMALS</h1><p class="small"><i>what the land runs on — named only once learned. (break-it 2026-10-08: animal codex entries had no readable surface.)</i></p>' + Object.entries(Game.state.codex.animals).map(([aid, e]) => {
        const ad = (Game.data.animals || []).find(x => x.id === aid) || {};
        const aKnown = Game.encAnimalKnown ? Game.encAnimalKnown(aid) : true;
        const aName = aKnown ? (ad.name || aid) : (ad.unknown || 'something');
        const aLvl = e.level || 1;
        const aText = ((ad.knowledgeLevels || {})[String(aLvl)] || '');
        return `<div class="card codex"><h3>${esc(aName)} <span class="small" style="opacity:.7">[L${aLvl}]</span></h3>${aText ? `<p class="small"><i>${esc(aText)}</i></p>` : ''}${e.learnedFrom ? `<p class="small" style="opacity:.5">via ${esc(e.via || 'discovery')}${e.learnedFrom ? ' — ' + esc(e.learnedFrom) : ''}</p>` : ''}</div>`;
      }).join('') : ''}
      ${Object.entries(Game.state.codex.trees || {}).length ? '<h1 class="title" style="font-size:18px">TREES</h1><p class="small"><i>timber you know by name. (break-it 2026-10-08: tree codex entries had no readable surface.)</i></p>' + Object.entries(Game.state.codex.trees).map(([sp, e]) => {
        return `<div class="card codex"><h3>${esc(sp)} <span class="small" style="opacity:.7">[L${e.level || 1}]</span></h3>${e.via ? `<p class="small" style="opacity:.5">via ${esc(e.via)}</p>` : ''}</div>`;
      }).join('') : ''}
      ${codexAliensSection(Game.state.codex.aliens || {})}
      <button class="btn ghost" id="b-back">Back</button>`;
    document.getElementById('b-back').onclick = () => expeditionScreen();
  }

  // ---------- telemetry: the playtest flight recorder ----------
  function telemetryScreen() {
    const tel = (Game.state.telemetry || []).slice(-60).reverse();
    screen.innerHTML = `${bar('scattering://telemetry', tel.length + ' events')}
      <h1 class="title" style="font-size:22px">TELEMETRY</h1>
      <p class="small">Every action, every change. If something felt wrong, it's in here.</p>
      ${tel.map(e => `<p class="term-line small">d${e.day} ${e.part} <b>${e.type}</b> ${e.epithet || e.tile || ''} ${e.plant || e.item || ''}${e.units ? ' x' + e.units : ''}${e.kcal ? ' +' + e.kcal + 'kcal' : ''}${e.ateKcal ? ' ate ' + e.ateKcal : ''} → you ${e.kcal}kcal / pack ${e.packKcal} / pantry ${e.pantry}</p>`).join('') || '<p class="small">No events yet.</p>'}
      <button class="btn ghost" id="b-tback">Back</button>`;
    document.getElementById('b-tback').onclick = () => expeditionScreen();
  }

  // ---------- ending ----------
  function ending() {
    const st = Game.status();
    const entries = Game.codexEntries().length;
    screen.innerHTML = `
      ${bar('scattering://end', st.won ? 'survived' : 'fallen')}
      <h1 class="title" style="font-size:26px">${st.won ? 'SEVEN DAYS' : 'THE WOODS KEEP YOU'}</h1>
      <p class="small">${st.won
        ? 'You ate. You drank. You came back. The village eats because of you.'
        : 'You didn\'t make it. The village remembers. The Codex keeps what you brought home.'}</p>
      <div class="card"><h3>Expedition record</h3>
        <p class="small">Days: ${st.day} / 7 · Plants learned: ${entries}<br>
        ${st.won ? 'The first week is the hardest. It gets no easier — but you get better.' : 'Someone else will carry the journal next time.'}</p></div>
      <button class="btn" id="b-again">New expedition</button>
      <button class="btn ghost" id="b-title">Title</button>`;
    document.getElementById('b-again').onclick = () => title();
    document.getElementById('b-title').onclick = () => title();
  }

  // ============ DEBUG MODE (dev only, subtle for players) ============
  // ?debug=1 in the URL enables it at boot; otherwise tap the tiny 🐞
  // next to the build tag on the title screen. Spawn monsters, trigger
  // combat, skip to day 7, grant abilities, teleport, heal. For testing
  // combat without wandering the woods hoping to get mauled.
  let DEBUG = /[?&]debug=1/.test(location.search);
  function debugPanel() {
    let el = document.getElementById('debug-panel');
    if (el) { el.remove(); return; }
    el = document.createElement('div');
    el.id = 'debug-panel';
    el.style.cssText = 'position:fixed;bottom:60px;right:8px;z-index:9999;background:#111;border:2px solid #f90;border-radius:8px;padding:10px;max-width:260px;max-height:70vh;overflow:auto;font-size:13px;';
    const monsters = (Game.data.monsters || []).map(m =>
      `<option value="${m.id}">${m.name}</option>`).join('');
    const abilities = (Game.data.abilities || []).map(a =>
      `<option value="${a.id}">${a.name || a.id}</option>`).join('');
    // CATEGORIZED SCENARIOS (Steve 2026-10-05): categories first, then specifics.
    // Falls back to flat list if categories aren't available.
    let scenHtml = '';
    if (typeof Game.debugScenarioCategories === 'function') {
      const cats = Game.debugScenarioCategories();
      scenHtml = Object.entries(cats).map(([cat, items]) => {
        const btns = items.map(([id, label]) =>
          `<button class="dbg-scen" data-scen="${id}" style="display:block;width:100%;text-align:left;margin:3px 0;padding:8px;font-size:14px">${label}</button>`
        ).join('');
        const catId = 'dbg-cat-' + cat.replace(/[^a-z0-9]/gi, '');
        return `<p style="margin:10px 0 4px"><button id="${catId}-toggle" style="font-size:14px;font-weight:bold">${cat} ▸</button></p><div id="${catId}" style="display:none">${btns}</div>`;
      }).join('');
    } else {
      const scenBtns = (typeof Game.debugScenarioList === 'function' ? Game.debugScenarioList() : [])
        .map(([id, label]) => `<button class="dbg-scen" data-scen="${id}" style="display:block;width:100%;text-align:left;margin:3px 0;padding:8px;font-size:14px">${label}</button>`).join('');
      scenHtml = `<div id="dbg-scenarios">${scenBtns}</div>`;
    }
    // LOADOUTS (Steve 2026-10-05): fighter/equipment presets for rapid iteration.
    // Apply AFTER starting a scenario to test different builds vs same monster.
    const loadoutBtns = (typeof Game.debugLoadoutList === 'function' ? Game.debugLoadoutList() : [])
      .map(([id, label]) => `<button class="dbg-loadout" data-loadout="${id}" style="display:block;width:100%;text-align:left;margin:3px 0;padding:8px;font-size:14px">${label}</button>`).join('');
    const loadoutSection = loadoutBtns
      ? `<p style="margin:10px 0 4px"><b>LOADOUTS</b> <span style="opacity:.6;font-size:11px">apply to current run</span></p>
         <div id="dbg-loadouts">${loadoutBtns}</div>`
      : '';
    // RETIRED: never deleted, saved for later — collapsed behind a toggle.
    const retiredList = (typeof Game.debugRetiredList === 'function' ? Game.debugRetiredList() : []);
    const retBtns = retiredList
      .map(([id, label]) => `<button class="dbg-scen" data-scen="${id}" style="display:block;width:100%;text-align:left;margin:3px 0;padding:8px;font-size:14px;opacity:.65">${label}</button>`).join('');
    const retSection = retBtns
      ? `<p style="margin:8px 0 4px"><button id="dbg-retired-toggle" style="font-size:12px;opacity:.7">🗄️ Retired (${retiredList.length}) ▸</button></p><div id="dbg-retired" style="display:none">${retBtns}</div>`
      : '';
    el.innerHTML = `<b>🐞 DEBUG</b> <button id="dbg-x" style="float:right">✕</button>
      <p style="margin:8px 0 4px"><b>SCENARIOS</b> <span style="opacity:.6;font-size:11px">one tap, fresh run</span></p>
      ${scenHtml}
      ${loadoutSection}
      ${retSection}
      <p style="margin:10px 0 4px;border-top:1px solid #f90;padding-top:8px"><b>CHEATS</b></p>
      <p><select id="dbg-mon">${monsters}</select>
      <button id="dbg-spawn">Spawn</button>
      <button id="dbg-fight">Fight!</button></p>
      <p><button id="dbg-day7">Skip to day 7</button>
      <button id="dbg-heal">Heal+feed</button></p>
      <p><select id="dbg-ab">${abilities}</select>
      <button id="dbg-grant">Grant ability</button></p>
      <p><button id="dbg-haven">Teleport: haven</button>
      <button id="dbg-kill">Kill foes</button>
      <button id="dbg-endc">End combat</button></p>
      <p style="border-top:1px solid #f90;padding-top:8px"><b>SAVES</b>
      <button id="dbg-wipeall">Wipe ALL saves</button></p>`;
    document.body.appendChild(el);
    const q = (id) => el.querySelector(id);
    q('#dbg-x').onclick = () => el.remove();
    const _rt = q('#dbg-retired-toggle');
    if (_rt) _rt.onclick = () => {
      const d = q('#dbg-retired');
      const open = d.style.display === 'none';
      d.style.display = open ? 'block' : 'none';
      _rt.textContent = _rt.textContent.replace(open ? '▸' : '▾', open ? '▾' : '▸');
    };
    el.querySelectorAll('.dbg-scen').forEach(b => {
      b.onclick = () => {
        const ok = Game.debugScenario(b.dataset.scen);
        el.remove();
        if (ok) refresh();
        // scenario-requested chat (the ambush opens mid-confrontation)
        const cv = Game.debugChatRequest; Game.debugChatRequest = null;
        if (cv) openChatKeep(cv);
      };
    });
    // CATEGORY TOGGLES (Steve 2026-10-05): expand/collapse scenario groups.
    el.querySelectorAll('[id$="-toggle"]').forEach(btn => {
      if (!btn.id.startsWith('dbg-cat-')) return;
      btn.onclick = () => {
        const catId = btn.id.replace('-toggle', '');
        const div = el.querySelector('#' + catId);
        if (!div) return;
        const open = div.style.display !== 'none';
        div.style.display = open ? 'none' : 'block';
        btn.innerHTML = btn.innerHTML.replace(open ? '▾' : '▸', open ? '▸' : '▾');
      };
    });
    // LOADOUTS (Steve 2026-10-05): apply to current run, no fresh game.
    // Pick a scenario, then pick a loadout to test that build vs that monster.
    el.querySelectorAll('.dbg-loadout').forEach(b => {
      b.onclick = () => {
        Game.debugApplyLoadout(b.dataset.loadout);
        el.remove();
        refresh();
      };
    });
    q('#dbg-spawn').onclick = () => {
      const id = q('#dbg-mon').value;
      const s = Game.state.scholar;
      // walkable cell a few squares away
      const detail = Game.genDetail(Game.map.px, Game.map.py);
      outer:
      for (let r = 2; r <= 5; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = (s.mx ?? 4) + dx, ny = (s.my ?? 4) + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cell = detail[ny] && detail[ny][nx];
          if (!Game.cellProps(cell).blocks) {
            Game.spawnWorldMonster({ id }, Game.map.px, Game.map.py, { mx: nx, my: ny });
            Game.say(`🐞 DEBUG: ${id} spawned at ${nx},${ny}.`);
            break outer;
          }
        }
      }
      refresh();
    };
    q('#dbg-fight').onclick = () => {
      const id = q('#dbg-mon').value;
      const _dbgMon = (typeof Game.playerMonster === 'function') ? Game.playerMonster() : Game.state.scholar.monster;
      if (!_dbgMon || _dbgMon.id !== id) q('#dbg-spawn').onclick();
      Game.startCombat(id);
      refresh();
    };
    q('#dbg-day7').onclick = () => {
      Game.state.scholar.day = 7;
      Game.checkSystemArrival();
      Game.say('🐞 DEBUG: jumped to day 7. The System has arrived.');
      refresh();
    };
    q('#dbg-heal').onclick = () => {
      const s = Game.state.scholar;
      s.health = 100; s.kcal = 2500; s.hydration = 100; s.energy = 100;
      Game.say('🐞 DEBUG: healed + fed.');
      refresh();
    };
    q('#dbg-grant').onclick = () => {
      const id = q('#dbg-ab').value;
      const s = Game.state.scholar;
      s.abilities = s.abilities || [];
      if (!s.abilities.includes(id)) s.abilities.push(id);
      Game.say(`🐞 DEBUG: granted ${id}.`);
      refresh();
    };
    q('#dbg-haven').onclick = () => {
      Game.map.px = Game.state.village.px ?? 4;
      Game.map.py = Game.state.village.py ?? 4;
      Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
      Game.say('🐞 DEBUG: teleported to haven.');
      refresh();
    };
    q('#dbg-kill').onclick = () => {
      const tf = Game.tbfight;
      if (!tf) { Game.say('🐞 DEBUG: no combat running.'); return; }
      for (const m of tf.fighters) {
        if ((m.kind === 'monster' || m.kind === 'hostile') && m.alive) {
          m.hp = 0; m.alive = false;
          Game.say(`🐞 DEBUG: ${m.name} smote.`);
        }
      }
      Game.tbEndCheck();
      refresh();
    };
    q('#dbg-endc').onclick = () => {
      if (Game.tbfight) { Game.tbEnd('fled'); Game.say('🐞 DEBUG: combat ended.'); }
      refresh();
    };
    // SAVES (break-it persistence 2026-10-08): S.state.wipeAll had zero callers
    // (dead code). Two-tap confirm; wipes every save + the index + legacy key.
    q('#dbg-wipeall').onclick = () => {
      const b = q('#dbg-wipeall');
      if (b.dataset.armed) {
        try { Game.wipeAllSaves(); } catch (e) {}
        b.dataset.armed = ''; b.textContent = 'Wipe ALL saves';
        Game.say('🐞 DEBUG: all saves wiped.');
        refresh();
      } else {
        b.dataset.armed = '1'; b.textContent = 'Tap again to wipe ALL';
        setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'Wipe ALL saves'; } }, 3000);
      }
    };
  }
  function maybeDebugButton() {
    if (!DEBUG || document.getElementById('debug-btn')) return;
    const b = document.createElement('button');
    b.id = 'debug-btn';
    b.textContent = '🐞';
    b.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:9999;font-size:22px;background:#111;border:2px solid #f90;border-radius:50%;width:44px;height:44px;';
    b.onclick = debugPanel;
    document.body.appendChild(b);
  }
  // Toggle the floating debug button from the title screen's 🐞 toggle.
  function toggleDebug() {
    DEBUG = !DEBUG;
    const b = document.getElementById('debug-btn');
    if (DEBUG) { maybeDebugButton(); }
    else if (b) { b.remove(); const p = document.getElementById('debug-panel'); if (p) p.remove(); }
    const t = document.getElementById('b-debug');
    if (t) t.style.opacity = DEBUG ? '1' : '.35';
    return DEBUG;
  }

  // ---------- boot ----------
  Game.init().then(() => { maybeDebugButton(); title(); }).catch(e => {
    screen.innerHTML = `<p class="small">Failed to load game data: ${esc(e.message)}<br>Serve over http (not file://) for fetch() to work.</p>`;
  });
})();
