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
// rules:
//   - mobile_breakpoint: 899px (code: CSS media queries)
//   - grid_size: 9x9 (code: renderDetail)
//   - one_screen_rule: moment-to-moment play never scrolls (code: CSS)
//   - lower_menu: Pack/Sleep/Wait/Map below status (code: lowerMenuHTML)
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

  // TWO-CLICK TRAVEL: first tap selects, second tap confirms. Travel is deliberate.
  let pendingTravel = null;

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
      const phase = (known && Game.deerPhaseBadge) ? Game.deerPhaseBadge(m) : '';
      // INFO LEAK FIX (Steve): the ⚠ warning marker is gated behind codex
      // knowledge, just like the phase badge. First encounter: no warning
      // symbols — just beam visuals + audio dread.
      return `${m.emoji || '👹'} ${esc(label)}${(m.telegraph && known) ? ' ⚠' : ''}${phase}`;
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
        const who = pc.participant === 'player' ? 'YOU' : (pc.participant || 'someone');
        contestRow = `<div class="statrow contest-pending">📺 CONTEST: ${esc(pc.contestId || 'unknown')} — ${who} in ${daysLeft}d</div>`;
      }
    } catch (e) {}
    return statRow('HEALTH', st.health, st.health, st.health < 35) +
      statRow('FOOD (you)', foodVal, st.kcal / cap * 100, st.kcal < 500, banked > 0 ? 'banked' : '') +
      statRow('PACK 🎒', st.invKcal + ' kcal · ' + st.packKg + '/' + st.packCap + ' kg', st.packKg / st.packCap * 100, st.packKg >= st.packCap, '', 'pack') +
      statRow('WATER', st.hydration + '% · ' + st.waterCleanL + 'L clean', st.hydration, st.hydration < 30) +
      (Game.state && Game.state.systemArrived ? statRow('SYSTEM', st.integration + '% integrated', st.integration, false) : '') +
      contestRow;
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
    const saves = Game.listSaves();
    if (!saves.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<p class="small" style="margin:18px 0 6px;opacity:.7">SAVED EXPEDITIONS</p>` + saves.map(sv => {
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
    const lines = ['The sky changed on a Tuesday.', 'You woke up somewhere else.'];
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
      // SEMANTIC HONESTY (Steve 2026-10-05): items with real effects show them.
      const effect = i.baseEffect ? `<p class="small" style="opacity:.75">⚙ ${i.baseEffect}</p>` : '';
      const sub = `<p class="small">${showFlavor}</p>${effect}`;
      return `<div class="card itempick${picked.has(i.id) ? ' sel' : ''}" data-i="${i.id}"><h3>${picked.has(i.id) ? '✓ ' : ''}${showName}</h3>${sub}</div>`;
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
        <button class="btn sm" data-act="cut">🪓 Cut through (1 part, 60 kcal, +2 wood)</button>${goAround}</div></div>`;
    } else if (blockType === 'rubble') {
      html = `<div class="card"><p>🧱 Rubble chokes the path.</p><div class="actions">
        <button class="btn sm" data-act="clear">🧹 Clear rubble (1 part, 40 kcal)</button>${goAround}</div></div>`;
    } else if (blockType === 'washed_out' || blockType === 'creek') {
      const label = blockType === 'creek' ? 'The creek runs fast here.' : 'The path is washed out.';
      html = `<div class="card"><p>🌊 ${label}</p><div class="actions">
        <button class="btn sm" data-act="bridge" ${wood < 4 ? 'disabled' : ''}>🌉 Build bridge (4 wood — you have ${wood})</button>`;
      if (canSwim) html += `<button class="btn sm" data-act="swim">🏊 Swim across</button>`;
      html += `${goAround}</div><p class="small">No bridge, no swim? Pick another tile — there's always another way.</p></div>`;
    }
    info.innerHTML = html;
    info.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (act === 'cut' || act === 'clear') { Game.clearBlockage(x, y); }
        else if (act === 'bridge') { if (!Game.buildBridge(x, y)) { refresh(); return; } }
        else if (act === 'swim') { Game.state.scholar.kcal = Math.max(0, Game.state.scholar.kcal - 20); Game.say('You swim across, cold and grinning.'); Game.travelTo(x, y, true); refresh(); return; }
        else { pendingTravel = null; refresh(); return; } // go around: just close
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
    const mon = Game.state.scholar.monster;
    if (label === 'Fight' && mon && mon.mx === cx && mon.my === cy) { Game.startCombat(mon.id); return; }
    if (label === 'Hunt') { Game.huntAnimal(); return; }
    if (label === 'Stalk') { Game.stalkAnimal(); return; }
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
    const mon = Game.state.scholar.monster;
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
        const nt = (nx >= 0 && nx < 7 && ny >= 0 && ny < 7) ? Game.tileAt(nx, ny) : null;
        const nm = nt ? (nt.revealed ? (S.TILE_NAME[nt.type] || nt.type) : 'unexplored ground') : 'the void';
        const block = nt ? Game.travelBlockage(nx, ny) : null;
        const label = block ? `➡️ Head ${exit.dir} (blocked!)` : `➡️ Head ${exit.dir}`;
        actions.push([label, () => {
          if (block) { showBlockage({ kind: 'blockage', blockType: block.blockType, x: nx, y: ny }); refresh(); return; }
          const res = Game.travelTo(nx, ny);
          if (res && res.kind === 'blockage') { showBlockage(res); }
          refresh();
        }]);
        desc += ` You're on the ${exit.dir}ern edge — ${nm} lies that way.`;
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
          if (remaining && !dc.buried) actions.push(['Search the body', () => { Game.lootCorpse(dc.id, true); refresh(); }]);
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
        actions.push(['Stalk', () => Game.stalkAnimal()]);
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
          if (remaining && !dc.buried) actions.push(['Search the body', () => { Game.lootCorpse(dc.id, true); refresh(); }]);
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
          desc = `${mod.species}, ${mod.health}${mod.ivy ? ', ivy-covered' : ''}. `;
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
          // Boil risky water -> clean (kills bacteria, not chemicals).
          const risky = (Game.state.scholar.water || []).filter(b => b.quality === 'risky').length;
          if (risky) actions.push([`Boil ${risky}L water`, () => { Game.boilWater(); refresh(); }]);
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
          const path = Game.findPath(px, py, cx, cy);
          if (path && path.length) {
            const cost = path.length * 10;
            actions.push([`Walk here (${cost} kcal)`, () => walkPathAnimated(cx, cy)]);
          } else {
            desc += ' (No path there.)';
          }
        }
        if (cell === 'plant' || cell === 'bush') actions.push(['Forage', () => Game.cellInteract(cx, cy)]);
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
  function actAndRefresh(fn) {
    try { if (Game.feedbackMark) Game.feedbackMark(); } catch (e) {}
    try { fn(); } catch (e) { console.error(e); }
    refresh();
  }

  function feedbackInner() {
    let lines = [];
    try { lines = (Game.feedbackLines && Game.feedbackLines()) || []; } catch (e) {}
    if (!lines.length) return '';
    return lines.map(l => `<p class="fb-line">${esc(l)}</p>`).join('');
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
      // Status: wounded? telegraphing?
      let status = '';
      try {
        const f = Game.tbfight ? Game.tbfight.fighters.find(x => x.key === t.key) : null;
        if (f) {
          if (f.hp < f.maxHp * 0.5) status = ' (wounded)';
          else if (f.hp < f.maxHp) status = ' (hurt)';
          if (f.telegraph) status += ' ⚠';
        }
      } catch (e) {}
      const label = t.label || `target ${i + 1}`;
      // Shorten pack names: "the grass is humming in harmony 3" -> "harmony 3"
      const short = label.replace(/^the grass is humming in /i, '').trim() || label;
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
  //   animalPant()   — winded state: sides heaving, spent
  //   stagSnort()    — stag aggro
  //   stagCharge()   — Confrontation charge resolves
  //   stagConfused() — the charge dies unspent (lost you)
  //   GLASSWING (Steve 2026-10-05):
  //   glasswingCircle() — circling high, thin whine with vibrato
  //   glasswingDive()   — the falling whistle, 2000→300Hz
  //   glasswingLand()   — crash: dirt thud + tangled wing buzz
  //   glasswingClimb()  — rising buzz, back into the sky
  //   SUNBASKER (Steve 2026-10-05):
  //   baskCharge({charge}) — heat shimmer, brighter with charge
  //   baskBreak()    — the charge knocked out: descending zap
  //   baskFlatten()  — flattening into the dirt: soft deflate
  //   SYSTEM (Steve 2026-10-06):
  //   round({round})   — combat round tick: the System's metronome, heavier each round
  //   crash({cause})   — a structure is destroyed ('bulldozer' hits heaviest)
  //   levelup({quiet}) — a stat grows: soft breathy rise, no fanfare, felt not heard
  //   passiveUnlock({quiet}) — a passive tier lands: a click + low settling hum
  //   PATTERN SYNTHS (Steve 2026-10-06): generic-per-pattern windup/resolve
  //   pairs, auto-dispatched from telegraph()/impact() by pattern type, and
  //   callable directly as patternWindup({pattern, urgency}) /
  //   patternResolve({pattern}). The deer keeps its own beam set; droneBeam is
  //   the machine beam (review_drone/memory_projector). 'ambush' is silent on
  //   windup BY DESIGN (turtleSnap is the resolve).
  //   burstDetonate() chargeImpact() lockonTick() lockonHit() lineStrike()
  //   rushHit() diveImpact() ambushSnap()
  //   WAVE-2 BESPOKE (Steve 2026-10-06): staticScream() (voice_mimic reveal),
  //   serviceRush() (service_mimic resolve), contractBind() (contract_golem
  //   strike), monsterDown() / monsterHurt() (generic death/wound for
  //   siblings), delegateDebrief() (was fired by tbFifoBreather, silent).
  //   WAVE-1 CONTRACT, NOW DEFINED (Steve 2026-10-06): boarNotice/boarSnort/
  //   boarCharge, wolfSilence/wolfSnarl, heronUnfold/heronStrike, turtleSnap
  //   (wired as speedbump_turtle encounter.resolveAudio in monsters.json).
  //   horrorSting() — the UI dread-beat sting (was referenced, undefined).
  const CombatAudio = (() => {
    let ctx = null, hbTimer = null;
    let master = null, hbBus = null, sfxBus = null;
    let muted = false;
    try { muted = (typeof localStorage !== 'undefined') && localStorage.getItem('oversight_mute') === '1'; } catch (e) {}
    let charge = null;   // active beam-charge stopper
    let sweep = null;    // sustained beam hum {set, stop}
    let noiseBuf = null;

    function ensure() {
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
      if (!ensure()) return;
      stopHeartbeat();
      // SILENCE, then impact. The quiet is the scary part.
      setTimeout(() => {
        if (!ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(28, t + 0.45);
        g.gain.setValueAtTime(0.7, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
        o.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 0.7);
      }, 280);
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
      if (!ensure()) return;
      const t = ctx.currentTime;
      const dur = 0.28;
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass';
        nf.frequency.setValueAtTime(900, t);
        nf.frequency.exponentialRampToValueAtTime(300, t + dur);
        nf.Q.value = 1.5;
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur + 0.05);
      }
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(70, t + dur);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.25, t + 0.04);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og); og.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
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
      if (!ensure() || !hum) return;
      humStop();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.4);
    }
    function shout() {
      // raw bellow: bandpassed noise swell + a descending chest blast.
      if (!ensure()) return;
      const t = ctx.currentTime;
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
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.6);
    }
    // ---- GLASSWING DARTER / SUNBASKER (Steve 2026-10-05) ----
    function glasswingCircle() {
      // high circling whine: thin sine with slow vibrato, unsettled.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      const o = ctx.createOscillator(), g = ctx.createGain();
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 1250;
      lfo.type = 'sine'; lfo.frequency.value = 5; lg.gain.value = 90;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.10, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    function glasswingDive() {
      // the falling whistle: 2000 → 300, louder as it comes.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(2000, t);
      o.frequency.exponentialRampToValueAtTime(300, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.1);
    }
    function belltoadCroak() {
      // DEEP RESONANT CROAK: low, felt in the chest. 80Hz fundamental with
      // harmonic wobble. Freaky: slightly detuned, like it's too big.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.9;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o1.type = 'sawtooth'; o1.frequency.setValueAtTime(78, t);
      o2.type = 'sawtooth'; o2.frequency.setValueAtTime(82, t); // detuned, beating
      // Throat swell: pitch drops as it croaks
      o1.frequency.exponentialRampToValueAtTime(55, t + dur);
      o2.frequency.exponentialRampToValueAtTime(58, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // Lowpass to keep it chesty, not buzzy
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus);
      o1.start(t); o2.start(t); o1.stop(t + dur); o2.stop(t + dur);
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
      // BRIGHTENING TICK: glassy ping, sharper as the boom nears. urgency =
      // turnsLeft (2 → 1): pitch climbs, the pretty becomes painful.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      const urg = (opts && opts.urgency) || 2;
      const base = urg > 1 ? 1568 : 2093; // G6 → C7: brighter = closer
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, t + dur * 0.6);
      // glassy harmonic, slightly detuned (beautiful but wrong)
      const o2 = ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.setValueAtTime(base * 2.01, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(urg > 1 ? 0.14 : 0.22, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
    }
    function eurekaCharge() {
      // THE GATHERING: rising shimmer — beautiful, luring, wrong. It wants
      // you to watch. Don't.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.4;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(440, t);
      o.frequency.exponentialRampToValueAtTime(1760, t + dur);
      // shimmer: amplitude tremolo, quickening
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.setValueAtTime(4, t);
      lfo.frequency.exponentialRampToValueAtTime(14, t + dur);
      lg.gain.value = 0.08; lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
    }
    function eurekaDetonate() {
      // DETONATION: white flare. The idea goes off — light with teeth.
      // Not an explosion: a chord resolving too loud, then the ring.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.0;
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
      // the ring: high sine that lingers after
      const r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = 'sine'; r.frequency.value = 3136; // G7
      rg.gain.setValueAtTime(0.0001, t + 0.1);
      rg.gain.exponentialRampToValueAtTime(0.08, t + 0.2);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      r.connect(rg); rg.connect(sfxBus); r.start(t + 0.1); r.stop(t + dur);
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
    }
    function eurekaDrift() {
      // SOFT DRIFTING GLOW: gentle, luring. A light that wasn't there yesterday.
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
      // GRAY STATIC: confused hiss. The picture won't come back yet.
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
    }
    function managerCircle() {
      // PACING + DICTATION: rhythmic hoofbeats in a circle, under a faint
      // warble — it's dictating into nothing. "Per my last roar..."
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const dt = t + i * 0.32;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(95 - i * 4, dt);
        o.frequency.exponentialRampToValueAtTime(60, dt + 0.12);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.22, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.16);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.2);
      }
      // dictation warble: thin, self-important
      const w = ctx.createOscillator(), wg = ctx.createGain();
      w.type = 'triangle'; w.frequency.setValueAtTime(520, t);
      w.frequency.linearRampToValueAtTime(480, t + 1.3);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 9; lg.gain.value = 25;
      lfo.connect(lg); lg.connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      w.connect(wg); wg.connect(sfxBus);
      w.start(t); w.stop(t + 1.35); lfo.start(t); lfo.stop(t + 1.35);
    }
    function managerAnnounce() {
      // MEETING CALLED TO ORDER: sharp horn blast + paper slap. Attendance mandatory.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.7;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(196, t); // G3: the horn
      o.frequency.setValueAtTime(196, t + 0.35);
      o.frequency.setValueAtTime(147, t + 0.36); // drop: E3, final
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.24, t + 0.06);
      g.gain.setValueAtTime(0.24, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur);
      // paper slap
      const nb = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ch.length * 0.15));
      const src = ctx.createBufferSource(); src.buffer = nb;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      src.connect(hp); hp.connect(g2); g2.connect(sfxBus); src.start(t + 0.4);
    }
    function managerCharge() {
      // THE CHARGE: thundering hooves, low and inevitable — plus the tie
      // flapping like a flag. It delegated the violence to itself.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const dt = t + i * 0.16;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(80 - i * 3, dt);
        o.frequency.exponentialRampToValueAtTime(50, dt + 0.1);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.26, dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.14);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.16);
      }
      // tie flap: thin rapid flutter
      const f = ctx.createOscillator(), fg = ctx.createGain();
      f.type = 'square'; f.frequency.value = 55;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 22; lg.gain.value = 20;
      lfo.connect(lg); lg.connect(f.frequency);
      fg.gain.setValueAtTime(0.0001, t);
      fg.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
      fg.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      f.connect(fg); fg.connect(sfxBus);
      f.start(t); f.stop(t + 1.05); lfo.start(t); lfo.stop(t + 1.05);
    }
    function managerDebrief() {
      // TAKING NOTES: pen scratching + a satisfied sigh. The meeting is minuted.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.0;
      const nb = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        const ph = (i / ctx.sampleRate * 7) % 1; // scratch rhythm
        ch[i] = (Math.random() * 2 - 1) * (ph < 0.3 ? 0.25 : 0.03);
      }
      const src = ctx.createBufferSource(); src.buffer = nb;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(g); g.connect(sfxBus); src.start(t);
      // satisfied sigh: descending breathy tone
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(300, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(180, t + 1.0);
      g2.gain.setValueAtTime(0.0001, t + 0.5);
      g2.gain.exponentialRampToValueAtTime(0.06, t + 0.65);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
      o.connect(g2); g2.connect(sfxBus); o.start(t + 0.5); o.stop(t + 1.1);
    }
    function managerFear() {
      // RETREAT: hoofbeats receding + nervous paper rustle. Too many stakeholders.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const dt = t + i * 0.28;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(100, dt);
        o.frequency.exponentialRampToValueAtTime(65, dt + 0.1);
        const amp = 0.2 - i * 0.04; // receding
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(Math.max(0.05, amp), dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.14);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.16);
      }
      // nervous paper rustle
      const nb = ctx.createBuffer(1, ctx.sampleRate * 0.9, ctx.sampleRate);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.12 * (0.5 + 0.5 * Math.sin(i / 900));
      const src = ctx.createBufferSource(); src.buffer = nb;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
      const g = ctx.createGain(); g.gain.value = 0.5;
      src.connect(hp); hp.connect(g); g.connect(sfxBus); src.start(t + 0.2);
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
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.6;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(g); g.connect(sfxBus);
      src.start(t); src.stop(t + dur);
    }
    function stagMirror() {
      // GLASS HARMONICS, WRONG: high, pure, unsettling. The mirror sings.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.4;
      // Detuned glass tones (beating)
      for (const fq of [2093, 2107, 2637]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
      }
      // Low dread under it
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = 55;
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.15, t + 0.5);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o2.connect(g2); g2.connect(sfxBus); o2.start(t); o2.stop(t + dur);
    }
    function stagSnort() {
      // AGGRO: sharp exhale, then low rumble. It's going to charge.
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
      // Rumble (pawing the earth)
      const o = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t + 0.15);
      o.frequency.linearRampToValueAtTime(45, t + 0.8);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
      g2.gain.setValueAtTime(0.0001, t + 0.15);
      g2.gain.exponentialRampToValueAtTime(0.2, t + 0.4);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(lp); lp.connect(g2); g2.connect(sfxBus);
      o.start(t + 0.15); o.stop(t + 1.0);
    }
    function droneHum() {
      // EVALUATION DRONE: steady, bureaucratic hum. Freaky: it's too calm.
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
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1800, t);
      o.frequency.exponentialRampToValueAtTime(200, t + dur);
      const ws = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(3 * (i / 128 - 1));
      ws.curve = curve;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(ws); ws.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur);
    }
    function droneRecalc() {
      // RECALIBRATING: confused warble, pitch hunting.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.8;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(400, t);
      // Warble: up-down-up-down
      for (let i = 0; i < 4; i++) {
        o.frequency.linearRampToValueAtTime(i % 2 ? 300 : 500, t + 0.2 * (i + 1));
      }
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
    }
    function swarmFilm() {
      // FILMING: tiny shutter clicks, irregular, creepy — and a slow
      // zoom-lens whirr underneath: it's FOCUSING on you, not just watching.
      if (!ensure()) return;
      const t = ctx.currentTime;
      // zoom whirr: bandpassed noise, pitch slowly rising — the lens hunting
      const nz = noise(0.9), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 5;
        nf.frequency.setValueAtTime(500, t);
        nf.frequency.exponentialRampToValueAtTime(1100, t + 0.9);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.95);
      }
      for (let i = 0; i < 5; i++) {
        const dt = t + Math.random() * 0.8;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 2500 + Math.random() * 1000;
        g.gain.setValueAtTime(0.08, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.05);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.06);
      }
    }
    function swarmBuild() {
      // FLASH BUILDING: clicks quicken, pitch rises. Freaky: it's excited.
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
    }
    function swarmFlash() {
      // FLASH MOB: blinding white noise burst. Freaky: it's too bright.
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
    }
    function glasswingLand() {
      // crash: dirt thud + tangled wing buzz.
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
    }
    function glasswingClimb() {
      // rising buzz: climbing back into the sky.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.5;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(200, t);
      o.frequency.exponentialRampToValueAtTime(650, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
    }

    // ============ WAVE 2 GROUP B: corporate horrors audio ============
    function hypeInflate() {
      // swelling bagpipe of encouragement: low sine swelling up, getting louder.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.0;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(220, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.30, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.1);
    }
    function hypeEncourage(data) {
      // escalating shout: each beat louder. n = turnsLeft (3,2,1).
      if (!ensure()) return;
      const n = (data && data.n) || 2;
      const t = ctx.currentTime, dur = 0.45;
      const vol = n === 3 ? 0.18 : n === 2 ? 0.26 : 0.36;
      const base = n === 3 ? 300 : n === 2 ? 380 : 480;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.25, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function hypeDetonate() {
      // sonic encouragement detonation: big boom + ringing.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.1;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(38, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
      // metallic ring on top
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'triangle'; o2.frequency.setValueAtTime(1240, t);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.10, t + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o2.connect(g2); g2.connect(sfxBus);
      o2.start(t); o2.stop(t + 0.75);
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
    }
    function holdMusic() {
      // muzak from nowhere: tinny, looping, wrong. Two detuned triangles.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.6;
      const notes = [392, 440, 523, 440];
      notes.forEach((fr, i) => {
        const dt = t + i * 0.38;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(fr * 1.01, dt); // slightly sharp = wrong
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.10, dt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.36);
        // telephone bandpass: it comes through a headset
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 1.2;
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.4);
      });
    }
    function lineCut() {
      // the voice cuts out: abrupt digital dropout + click.
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
      // heat shimmer: soft rising shimmer, brighter with charge.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 0.6;
      const ch = Math.min(3, (d && d.charge) || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(500 + ch * 120, t);
      o.frequency.exponentialRampToValueAtTime(900 + ch * 200, t + dur);
      const peak = 0.06 + ch * 0.05;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function baskBreak() {
      // the charge knocked out: descending zap.
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
    }
    function baskFlatten() {
      // flattening: soft deflate into the dirt.
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
    }
    // beamBlocked: the beam dies against something real. Fizzle, not bang.
    function beamBlocked() {
      if (!ensure()) return;
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
      if (!ensure()) return;
      const t = ctx.currentTime;
      // Snap: high click
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(1800, t);
      o.frequency.exponentialRampToValueAtTime(400, t + 0.08);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.12);
      // Tear: noise burst, bandpass around 800Hz
      const nz = noise(0.25), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.frequency.value = 800; nf.Q.value = 1.5;
        ng.gain.setValueAtTime(0.3, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.05); nz.stop(t + 0.3);
      }
    }
    function animalBolt() {
      // SCAMPER: fast rustling scramble, dopplering away.
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
    }
    function animalChatter() {
      // SQUIRREL: rapid angry clicks, scolding you from the branches.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 7; i++) {
        const dt = t + i * 0.09;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(2800 + Math.random() * 800, dt);
        o.frequency.exponentialRampToValueAtTime(1800, dt + 0.05);
        g.gain.setValueAtTime(0.14, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.08);
      }
    }
    function animalFlop() {
      // OPOSSUM FLOP: soft body-thud, then... nothing. The silence is the point.
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
    }
    function animalPinch() {
      // CRAYFISH PINCH: tiny but vicious — a sharp click with a metallic ring.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(3200, t);
      o.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      // Metallic ring: detuned high harmonic
      const o2 = ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.setValueAtTime(5200, t);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.08, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); o2.connect(g2); g.connect(sfxBus); g2.connect(sfxBus);
      o.start(t); o2.start(t); o.stop(t + 0.16); o2.stop(t + 0.22);
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
    function catfishLure() {
      // NIGHTLIGHT LURE: hypnotic slow pulse — pretty, wrong, pulling.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.6;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(520, t);
      // Slow siren wobble
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 0.8;
      lg.gain.value = 120; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // Shimmer harmonic
      const o2 = ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.setValueAtTime(1040, t);
      lfo.connect(lg);
      o.connect(g); o2.connect(g); g.connect(sfxBus);
      o.start(t); o2.start(t); lfo.start(t);
      o.stop(t + dur); o2.stop(t + dur); lfo.stop(t + dur);
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
    }
    function catfishStill() {
      // UNNATURAL STILLNESS: almost nothing — a faint held breath.
      // The horror is the absence.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.2;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 55;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
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
    }
    function lockpickGrab() {
      // THE GRAB: claws on fabric — scratch + snatch.
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
    }
    function mothFlutter() {
      // WING FLUTTER: soft rapid papery beats.
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
    }
    function wolfBreak() {
      // PACK BREAKS: the coordination shatters — a howl that fractures.
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
    }
    function swarmScatter() {
      // SCATTERED: clicks fly apart — dopplering in all directions.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 8; i++) {
        const dt = t + Math.random() * 0.4;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(2500 + Math.random() * 1500, dt);
        o.frequency.exponentialRampToValueAtTime(4000, dt + 0.1); // fleeing upward
        g.gain.setValueAtTime(0.07, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.12);
        o.connect(g); g.connect(sfxBus); o.start(dt); o.stop(dt + 0.14);
      }
    }
    function swarmShutters() {
      // SHUTTERS: irregular tiny clicks — it's filming you.
      if (!ensure()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < 5; i++) {
        const dt = t + i * (0.11 + Math.random() * 0.08); // irregular
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 3400;
        g.gain.setValueAtTime(0.09, dt);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.03);
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(dt); o.stop(dt + 0.04);
      }
    }
    // ---- SYSTEM EVENTS ----
    function confront() {
      // JUSTICE: a low drum — someone is being called to answer.
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
      }
    }
    function genesis_plant() {
      // ALIEN GENESIS: something growing that shouldn't — wet, vegetal, wrong.
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
    }
    function gravity_well() {
      // GRAVITY DISTORTS: everything pitches down — the world gets heavy.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.2;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(400, t);
      o.frequency.exponentialRampToValueAtTime(60, t + dur); // falling into the well
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(2000, t);
      f.frequency.exponentialRampToValueAtTime(200, t + dur);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur);
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
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
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
    // ---- ROUND: the alien metronome. ROUND N! gets a tick — flat, clinical,
    // the System counting. Each round it gets a little heavier and a little
    // higher: the count is closing in. ----
    function roundTick(d) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const r = Math.max(1, Math.min(20, (d && d.round) || 1));
      const w = Math.min(1, (r - 1) / 6); // 0 at round 1 → 1 by round 7
      // the tick: sharp clock strike
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(1250 + r * 25, t);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14 + w * 0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.14);
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
      // (mirrormoth, belltoad, hummice, camera_swarm, hype_horn, bright_idea)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.8, durSec || 1.5);
      const nz = noise(dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass';
        nf.frequency.setValueAtTime(300, t);
        nf.frequency.exponentialRampToValueAtTime(2400, t + dur);
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.85);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + dur);
      }
      for (let i = 0; i < 4; i++) {
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
      // hooves, or an engine, you can't tell which. (bulldozer, mirror_stag,
      // delegate_beast)
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
    }
    function lockonTick(durSec) {
      // TARGETING: clinical ticks, like a camera finding focus — or a call
      // connecting. Shortens as it locks. (direct-pattern windup)
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.7, durSec || 1.2);
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
    }
    function lockonHit() {
      // Close-range crack: a dry snap and a short electric bite. Quieter
      // than boom — it's personal, not explosive.
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
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.12);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.2);
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
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(3600, t);
      o.frequency.exponentialRampToValueAtTime(400, t + 0.3);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9;
      f.frequency.setValueAtTime(3600, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.4);
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
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.45);
      const nz = noise(0.3), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'bandpass'; nf.Q.value = 3; nf.frequency.value = 1200;
        ng.gain.setValueAtTime(0.25, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t); nz.stop(t + 0.3);
      }
    }
    function diveWindup(durSec) {
      // FALLING: a thin whistle dropping out of the sky. The generic
      // 'single'-pattern windup — glasswing/sunbasker have bespoke dives.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = Math.max(0.7, durSec || 1.3);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(2600, t);
      o.frequency.exponentialRampToValueAtTime(500, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur);
    }
    function diveImpact() {
      // SKYFALL: dirt thud, then skittering debris — small, fast, nasty.
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.4);
      for (let i = 0; i < 5; i++) {
        const dt = t + 0.12 + i * 0.06;
        const s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'triangle'; s.frequency.value = 900 + Math.random() * 1400;
        sg.gain.setValueAtTime(0.0001, dt);
        sg.gain.exponentialRampToValueAtTime(0.07, dt + 0.015);
        sg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
        s.connect(sg); sg.connect(sfxBus); s.start(dt); s.stop(dt + 0.09);
      }
    }
    function ambushSnap() {
      // BEAR-TRAP JAWS: no warning, by design. Instant metallic clack and a
      // low, surprised thud. (speedbump_turtle — Snap Decision)
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 3400;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3400; f.Q.value = 5;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.12);
      const th = ctx.createOscillator(), tg = ctx.createGain();
      th.type = 'sine';
      th.frequency.setValueAtTime(120, t);
      th.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      tg.gain.setValueAtTime(0.4, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      th.connect(tg); tg.connect(sfxBus); th.start(t); th.stop(t + 0.35);
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
    function contractBind() {
      // BINDING AGREEMENT: fine print crawling, accelerating into a heavy
      // STAMP. Paper becomes law becomes weight. (contract_golem strike)
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      // paper rattle accelerating: 8 hits, interval shrinking
      let dt = t;
      for (let i = 0; i < 8; i++) {
        const nz = noise(0.09), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
        if (nz) {
          nf.type = 'highpass'; nf.frequency.value = 4500;
          ng.gain.setValueAtTime(0.16, dt);
          ng.gain.exponentialRampToValueAtTime(0.0001, dt + 0.07);
          nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
          nz.start(dt); nz.stop(dt + 0.09);
        }
        dt += 0.16 - i * 0.016;
      }
      // the STAMP: low, official, final
      const st = t + 0.85;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(95, st);
      o.frequency.exponentialRampToValueAtTime(28, st + 0.4);
      g.gain.setValueAtTime(0.6, st);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.55);
      o.connect(g); g.connect(sfxBus); o.start(st); o.stop(st + 0.6);
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
      // WOUNDED: a flinch — short, pained, cut off. Generic, for siblings.
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.18);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.25);
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
      lineStrike();
      if (!ctx) return;
      const t = ctx.currentTime;
      const nz = noise(0.3), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      if (nz) {
        nf.type = 'lowpass'; nf.frequency.value = 900;
        ng.gain.setValueAtTime(0.3, t + 0.05);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        nz.connect(nf); nf.connect(ng); ng.connect(sfxBus);
        nz.start(t + 0.05); nz.stop(t + 0.35);
      }
    }
    function turtleSnap() {
      // SNAP DECISION: no warning, by design. (speedbump_turtle)
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
    // ============ AMBIENT STING (Steve 2026-10-06) ============
    function horrorSting() {
      // THE MISSING STING: referenced by the UI dread-beat (app.js top),
      // never defined until now. A detuned swell that never resolves —
      // something noticed you noticing it.
      if (!ensure()) return;
      const t = ctx.currentTime, dur = 1.8;
      [110, 116.5].forEach(fq => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fq, t);
        o.frequency.exponentialRampToValueAtTime(fq * 1.5, t + dur); // rising, never arriving
        const f = ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(900, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + dur);
      });
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
    return {
      ensureAudio() { return ensure(); },
      combatStart() { heartbeat(72); },
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
        boom();
      },
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
      staticCry(opts) { staticCry(opts); },
      staticBreak() { staticBreak(); },
      stagMirror() { stagMirror(); },
      stagSnort() { stagSnort(); },
      droneHum() { droneHum(); },
      droneCount(opts) { droneCount(opts); },
      droneBeam() { droneBeam(); },
      droneRecalc() { droneRecalc(); },
      swarmFilm() { swarmFilm(); },
      swarmBuild() { swarmBuild(); },
      swarmFlash() { swarmFlash(); },
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
      managerCircle() { managerCircle(); },
      managerAnnounce() { managerAnnounce(); },
      managerCharge() { managerCharge(); },
      managerDebrief() { managerDebrief(); },
      managerFear() { managerFear(); },
      hypeInflate() { hypeInflate(); },
      hypeEncourage(d) { hypeEncourage(d); },
      hypeDetonate() { hypeDetonate(); },
      hypeDeflate() { hypeDeflate(); },
      holdMusic() { holdMusic(); },
      lineCut() { lineCut(); },
      paperRustle(d) { paperRustle(d); },
      baskCharge(d) { baskCharge(d); },
      baskBreak() { baskBreak(); },
      baskFlatten() { baskFlatten(); },
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
      animalHiss() { animalHiss(); },
      animalSnort() { animalSnort(); },
      animalRustle() { animalRustle(); },
      animalPant() { animalPant(); },
      // Batch monsters (were silent)
      boarTrample() { boarTrample(); },
      catfishLure() { catfishLure(); },
      catfishSnap() { catfishSnap(); },
      catfishStill() { catfishStill(); },
      heronStatic() { heronStatic(); },
      lockpickChitter() { lockpickChitter(); },
      lockpickGrab() { lockpickGrab(); },
      mothFlash() { mothFlash(); },
      mothFlutter() { mothFlutter(); },
      snakeSplit() { snakeSplit(); },
      stagConfused() { stagConfused(); },
      turtleBunker() { turtleBunker(); },
      wolfBreak() { wolfBreak(); },
      toadSwell() { toadSwell(); },
      // Wave 2 gaps
      droneCorrect() { droneCorrect(); },
      swarmEscalate() { swarmEscalate(); },
      swarmScatter() { swarmScatter(); },
      swarmShutters() { swarmShutters(); },
      // Middle Manager fires delegate* names; the synths are the manager* set
      delegateAnnounce() { managerAnnounce(); },
      delegateCharge() { managerCharge(); },
      delegateCircle() { managerCircle(); },
      // System events
      confront() { confront(); },
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
      patternResolve(d) {
        const pat = (d && d.pattern) || '';
        if (pat === 'beam' || (d && d.beam)) droneBeam();
        else if (pat === 'burst') burstDetonate();
        else if (pat === 'charge') chargeImpact();
        else if (pat === 'direct') lockonHit();
        else if (pat === 'line') lineStrike();
        else if (pat === 'rush') rushHit();
        else if (pat === 'single') diveImpact();
        else if (pat === 'ambush') ambushSnap();
        else boom();
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
      contractBind() { contractBind(); }, // contract_golem: paper becomes law becomes weight
      monsterDown() { monsterDown(); },   // generic death — collapse, breath out, wrong note
      monsterHurt() { monsterHurt(); },   // generic wound — a flinch, cut off
      delegateDebrief() { managerDebrief(); }, // fired by tbFifoBreather, was silent
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
      ${inlineHead('\uD83D\uDC64 ' + esc(titleName))}
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
      if (ac && ac.phases && ac.phase !== 'done') {
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
    const lastNarr = (Game.log && Game.log.length) ? Game.log[Game.log.length - 1] : '';
    const fb = feedbackInner();
    const text = fb || lastNarr;
    if (!text) return '';
    // Strip HTML, show as plain narration
    const clean = String(text).replace(/<[^>]*>/g, '').trim();
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
      body += `<p class="small" style="opacity:.6">Trust: ${trust}/100.</p>`;
    }
    if (trust < 20) body += `<p class="small" style="color:#e88">"I don't take orders from strangers." (Need 20+ trust.)</p>`;
    body += `<p class="small" style="opacity:.6;margin-top:8px">They'll report back at the end of this part. Dangerous work can get people hurt.</p>`;
    // NO METHOD TOGGLE. Steve's rule: bribery isn't a perpetual button — it's
    // an opportunity that appears when someone says no. You ask. If they're
    // reluctant, THEN food or an appeal to what they want becomes an option.
    // Discovered through doing, not through a menu.
    const hasFood = (() => { try {
      const day = Game.state.scholar.day;
      return !!(Game.state.scholar.inventory || []).find(i =>
        (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && !i.bonded &&
        !(i.spoilDay !== undefined && i.spoilDay <= day));
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
  setInterval(() => { try { Game.save(); } catch (e) {} }, 30000);

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

  // inventory: your pack. Inline — one screen, no overlay hopping.
  function renderInvInline(slot, view) {
    const st = Game.status();
    const inv = st.inventory;
    const tools = Game.state.scholar.tools || [];
    const recipes = Game.data.recipes || [];
    const knownRecipes = recipes.filter(r => (Game.state.codex.recipes || {})[r.id] && Game.state.codex.recipes[r.id].level >= 3);
    const bodyHtml = `
        ${(() => { const eq = Game.state.scholar.equipped || {}; const parts = []; if (eq.weapon) parts.push(`\u2694\uFE0F ${eq.weapon.name}`); if (eq.armor) parts.push(`\uD83D\uDEE1\uFE0F ${eq.armor.name}`); return parts.length ? `<p class="small"><b>Equipped:</b> ${parts.join(' \u00B7 ')}</p>` : ''; })()}
        ${(() => { const bg = Game.state.scholar.backgroundAbilities || []; if (!bg.length) return ''; return `<p class="small"><b>Background:</b> ${bg.map(a => `${a.name} L${a.level}`).join(', ')}</p>`; })()}
        ${(() => { const ab = Game.state.scholar.abilities || []; if (!ab.length) return ''; let cc = ''; try { const t = Game.challengeCountdownText ? Game.challengeCountdownText() : ''; if (t) cc = ` · <b style="color:#ff5d5d">${t}</b>`; } catch (e) {} return `<p class="small"><b>System:</b> ${ab.map(a => `${a.name} L${a.level}`).join(', ')} (${ab.length}/${Game.abilitySlots()} slots)${Game.integrationStageName ? ` · ${Game.integrationStageName()}` : ''}${Game.arcName ? ` · ${Game.arcName()}` : ''}${cc}</p>`; })()}
        ${(() => { const sy = Game.state.scholar.activeSynergies || []; if (!sy.length) return ''; const names = sy.map(id => { const d = (Game.data.synergies || []).find(x => x.id === id); return d ? d.name : id; }); return `<p class="small"><b>\u2726 Resonances:</b> ${names.join(' \u00B7 ')}</p>`; })()}
        ${(() => { const w = Game.state.scholar.water || []; if (!w.length) return ''; const clean = w.filter(b => b.quality === 'clean').length; const risky = w.filter(b => b.quality === 'risky').length; return `<p class="small"><b>\uD83D\uDCA7 Water:</b> ${clean}L clean${risky ? `, ${risky}L risky` : ''} (${w.length}kg)</p>`; })()}
        ${inv.length ? inv.map((i, idx) => {
          // FOOD REALITY: per-item processing buttons + state markers.
          let foodBtns = '';
          let foodMark = '';
          try {
            const fm = Game.foodMarker ? Game.foodMarker(i) : '';
            if (fm) foodMark = ` <span class="small" style="opacity:.75">${fm}</span>`;
            // going bad tomorrow — visible, not silent
            if (i.spoilDay !== undefined && i.spoilDay !== null && i.spoilDay === st.day + 1 && (i.kcalEach || 0) > 0) {
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
            // note: data-cook below covers cookable via the extended condition
            i._cookable = cookable;
          } catch (e) {}
          return `<p class="small">${(Game.isKeepsake && Game.isKeepsake(i)) ? '💛 ' : ''}${i.bonded ? '\u2756 ' : ''}<b>${Game.itemDisplayName(i)}</b> x${i.units} (${(i.foodKind === "meat" && i.edible === false) ? "?" : (i.kcalEach || 0) * i.units} kcal)${foodMark}${i.bonded ? ` <span class="small" title="Bonded relic \u2014 grown, not found">bond ${i.bond || 0}${(i.enhancements || []).length ? ' \u00B7 ' + i.enhancements.join(', ') : ''}</span>` : ''}${(Game.isKeepsake && Game.isKeepsake(i)) ? ' <span class="small" style="opacity:.6">keepsake</span>' : ''}${i.spoilDay <= st.day ? ' \u26A0 spoiled' : ''}${i.bookId ? ` <button class="btn ghost sm" data-read="${i.bookId}">Read</button>` : ''}${Game.isUsable(i) && !i.bonded ? ` <button class="btn ghost sm" data-use="${idx}">Use</button>` : ''}${(i.kcalEach || 0) > 0 && i.edible !== false && !i.bonded ? ` <button class="btn ghost sm" data-eatone="${idx}">Eat</button>` : ''}${foodBtns}${i._cookable ? ` <button class="btn ghost sm" data-cook="${idx}">Cook</button>` : ''}${Game.isWeapon(i) ? ` <button class="btn ghost sm" data-equip-w="${idx}">Equip</button>` : ''}${Game.isArmor(i) ? ` <button class="btn ghost sm" data-equip-a="${idx}">Wear</button>` : ''}${(Game.isKeepsake && Game.isKeepsake(i) && Game.sentimentTaught && Game.sentimentTaught()) ? ` <button class="btn ghost sm" data-channel="${idx}">💛 Channel</button>` : ''}${(i.kcalEach || 0) > 0 && i.edible !== false && !i.bonded ? ` <button class="btn ghost sm" data-donate="${idx}">Donate</button>` : ''}${!i.bonded && !(Game.isKeepsake && Game.isKeepsake(i)) ? ` <button class="btn ghost sm" data-drop="${idx}">Leave it</button>` : ''}${i.material ? ` <button class="btn ghost sm" data-stashmat="${idx}">Stash</button>` : ''}${Game.isStashableTool(i) ? ` <button class="btn ghost sm" data-stashtool="${idx}">Stash</button>` : ''}</p>`;
        }).join('') : '<p class="small">Empty. The world provides.</p>'}
        ${stashSectionHtml()}
        ${(() => { const acts = Game.activatableAbilities ? Game.activatableAbilities() : []; if (!acts.length) return ''; return `<h3 style="margin-top:12px">\u26A1 Abilities</h3>` + acts.map(a => `<p class="small"><b>${a.name}</b> \u2014 ${a.desc} ${a.available ? `<button class="btn ghost sm" data-activate="${a.id}">Use</button>` : `<span class="small" style="opacity:.6">(${a.why || 'not now'})</span>`}</p>`).join(''); })()}
        ${tools.length ? `<h3 style="margin-top:12px">Tools</h3>${tools.map(t => `<p class="small"><b>${t.name}</b> (${t.uses} uses left) <button class="btn ghost sm" data-settrap="${t.recipeId}">Set</button></p>`).join('')}` : ''}
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
    // UNKNOWN MEAT: test cautiously to learn if it's food.
    slot.querySelectorAll('[data-meattest]').forEach(b => b.onclick = rewire(() => Game.testMonsterMeat(+b.dataset.meattest, packOf()), 'Tested.'));
    // FIELD IDENTIFICATION: the cautious test works from the pack, anywhere.
    const packOf = () => Game.state.scholar.inventory;
    slot.querySelectorAll('[data-test]').forEach(b => b.onclick = rewire(() => Game.testCautiously(+b.dataset.test, {}, packOf()), 'Tested.'));
    slot.querySelectorAll('[data-rush]').forEach(b => b.onclick = rewire(() => Game.testCautiously(+b.dataset.rush, { rush: true }, packOf()), 'Rushed.'));
    slot.querySelectorAll('[data-watch]').forEach(b => b.onclick = rewire(() => Game.watchFauna(+b.dataset.watch, packOf()), 'Watched.'));
    slot.querySelectorAll('[data-clean]').forEach(b => b.onclick = rewire(() => Game.cleanCarcass(+b.dataset.clean), 'Cleaned.'));
    slot.querySelectorAll('[data-preserve]').forEach(b => b.onclick = rewire(() => Game.preserveFood(+b.dataset.preserve), 'Smoked.'));
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
    slot.querySelectorAll('[data-equip-w]').forEach(b => b.onclick = rewire(() => Game.equip(+b.dataset.equipW, 'weapon'), 'Equipped.'));
    slot.querySelectorAll('[data-equip-a]').forEach(b => b.onclick = rewire(() => Game.equip(+b.dataset.equipA, 'armor'), 'Worn.'));
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
    if (Game.tbfight) {
      const p = Game.tbFighter('p');
      if (!p || !Game.tbIsPlayerTurn()) { Game.say('Not your turn — hold.'); return { moved: false }; }
      const tx = p.mx + step.dx, ty = p.my + step.dy;
      if (tx < 0 || tx > 8 || ty < 0 || ty > 8) return { moved: false };
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
      combat: !!Game.tbfight, over: !!st.over,
      tbm: Game.tbfight && Game.tbFighter('p') ? Game.tbFighter('p').moveLeft : -1,
    };
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
    const st = Game.status();
    const hw = document.getElementById('exphead');
    if (hw) hw.innerHTML = expHeadHTML(st);
    const dw = document.getElementById('daytickwrap');
    if (dw) dw.innerHTML = dayTickBar(st);
    const sb = document.querySelector('.ord-status');
    if (sb) sb.innerHTML = statusBars(st);
    // ACTIONS (Steve 2026-10-05): buttons must refresh EVERY step. The old
    // code only updated them on "big" changes, so they'd disappear or appear
    // late as the player moved. Contextual actions depend on position.
    const actWrap = document.querySelector('.ord-actions');
    if (actWrap) {
      const inCombat = !!Game.tbfight;
      actWrap.innerHTML = `
        <div class="ord-self">${inCombat ? combatActionsHTML(st) : selfBarHTML(st)}</div>
        <div class="ord-ctx">${inCombat ? '' : contextBarHTML()}</div>
        <div class="ord-target">${targetBarHTML()}</div>
        <div class="ord-danger">${dangerBarHTML()}</div>
        <div class="ord-ability">${abilityBarHTML()}</div>`;
      // Re-wire the new buttons (each bar has its own wirer)
      try { wireSelfBar(); } catch (e) {}
      try { wireContextBar(); } catch (e) {}
      try { wireAbilityBar(); } catch (e) {}
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
    if (Game.tbfight && !Game.tbIsPlayerTurn()) { Game.say('Not your turn — hold.'); refresh(); return; }
    MoveAnim.purgeKind('path');
    MoveAnim.setHold({ dx, dy });
    MoveAnim.enqueue({ dx, dy, kind: 'step', ms: MoveAnim.stepMs });
  }
  // TAP-TO-MOVE (accessibility alternative): the FULL path walks step by
  // step through the animator — never a teleport. onDone(ok) fires when the
  // walk's steps all resolve (ok=false if interrupted or blocked).
  let walkSeq = 0;
  function walkPathAnimated(tx, ty, onDone) {
    if (Game.tbfight) return false;
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
        const release = () => { b.classList.remove('held'); MoveAnim.clearHold(); };
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
  window.addEventListener('pointerup', () => MoveAnim.clearHold());
  window.addEventListener('pointercancel', () => MoveAnim.clearHold());
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

  function expeditionScreen() {
    const st = Game.status();
    if (st.over) return ending();
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
    const targets = Game.travelTargets();
    const tset = new Set(targets.map(t => t.x + ',' + t.y));
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
            </div>
          </div>
          <button class="dpshow hidden" id="dpshow" aria-label="show walk pad">🧭</button>
          <div class="ord-narration">${narrationBoxHTML(st, chatView)}</div>
          <div class="ord-status">${statusBars(st)}</div>
          <div class="ord-lowermenu">${lowerMenuHTML(st)}</div>
          ${st.activeQuest ? `<p class="small ord-quest" style="border-left:3px solid #7fd67f;padding-left:8px">📋 ${esc(st.activeQuest.text)}</p>` : ''}
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
        const st = Game.state;
        const tset = new Set(); // travel dest, if any
        try { const td = Game.travelDest ? Game.travelDest() : null; if (td) for (const k of td) tset.add(k); } catch (e) {}
        overlay.innerHTML = `<div class="mapoverlay-back"></div><div class="mapoverlay-box"><div class="mapoverlay-head"><span>🗺️ World</span><button class="btn sm ghost" id="mapoverlay-x">✕</button></div><div class="map minimap">${renderMap(st, tset)}</div></div>`;
        overlay.classList.remove('hidden');
        overlay.querySelector('#mapoverlay-x').onclick = () => overlay.classList.add('hidden');
        overlay.querySelector('.mapoverlay-back').onclick = () => overlay.classList.add('hidden');
        // wire tile taps inside the overlay
        overlay.querySelectorAll('.minimap .tile').forEach(el => {
          el.onclick = () => {
            const x = +el.dataset.x, y = +el.dataset.y;
            const tl = Game.tileAt(x, y);
            if (x === st.px && y === st.py) return;
            const otherV = (Game.state.otherVillages || []).find(v => v.x === x && v.y === y && v.generated);
            if (otherV && Game.villageCard) {
              const card = Game.villageCard(otherV.id);
              if (card) { overlay.classList.add('hidden'); Game.say(card); refresh(); }
            } else if (tl && tl.revealed) {
              Game.say(`${S.TILE_GLYPH[tl.type] || '·'} ${tl.type} — ${tl.revealed ? 'explored' : 'unknown'}`);
              refresh();
            }
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
        const otherV = (Game.state.otherVillages || []).find(v => v.x === x && v.y === y && v.generated);
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
        if (!tl.revealed) {
          info.innerHTML = `<div class="card"><p>🌫 <b>Unexplored.</b><br><span class="small">No one has been there. Walk to the edge and head out to see what's really there.</span></p></div>`;
        } else {
          info.innerHTML = `<div class="card"><p>🗺 ${esc(S.TILE_NAME[tl.type] || tl.type)}.<br><span class="small">Walk to the edge of the map to travel there.</span></p></div>`;
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
        const mon = Game.state.scholar.monster;
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
    // Membership: remote applications + shelter building (Haven panel).
    document.querySelectorAll('[data-mship-accept]').forEach(b => b.onclick = () => { Game.acceptApplication(b.dataset.mshipAccept); refresh(); });
    document.querySelectorAll('[data-mship-refuse]').forEach(b => b.onclick = () => { Game.refuseApplication(b.dataset.mshipRefuse); refresh(); });
    document.querySelectorAll('[data-mship-build]').forEach(b => b.onclick = () => { Game.buildShelter(); refresh(); });
    // Hierarchy: tribute + demands (Haven panel).
    document.querySelectorAll('[data-link-pay]').forEach(b => b.onclick = () => { Game.payTribute(b.dataset.linkPay); refresh(); });
    document.querySelectorAll('[data-demand-yes]').forEach(b => b.onclick = () => { Game.answerDemand(b.dataset.demandYes, true); refresh(); });
    document.querySelectorAll('[data-demand-no]').forEach(b => b.onclick = () => { Game.answerDemand(b.dataset.demandNo, false); refresh(); });
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
      return `
      <div class="card warn"><h3>⚠ ${pname}</h3>
      <p class="small">It crashes from the thicket. It is not going around.</p>
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
      <p class="small">Slide to pack. Carrying ${carry.toFixed(1)}/${maxCarry} kg.</p>
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
      ${pantry.length ? pantry.map((p, idx) => {
        const density = p.kg ? Math.round(p.kcalEach / p.kg) : 0;
        const unit = p.unit || 'item';
        return `<div class="card" style="margin:6px 0;padding:8px 10px">
          <p class="small"><b>${p.name}</b> \u00D7${p.units} ${unit}s
          ${p.safe ? '' : ' \u26A0 UNSAFE'}${p.spoilDay <= st.day ? ' \u26A0 SPOILED' : ''}${p.needsCooking ? ' \uD83C\uDF73 needs cooking' : ''}${(() => { try { const fm = Game.foodMarker ? Game.foodMarker(p) : ''; return fm ? ' \u00B7 ' + fm : ''; } catch (e) { return ''; } })()}<br>
          <span style="opacity:.7">${p.kcalEach} kcal/${unit} \u00B7 ${p.kg} kg/${unit} \u00B7 <b>${density} kcal/kg</b></span></p>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="range" min="0" max="${p.units}" value="0" data-pack="${idx}" style="flex:1">
            <span class="small" id="packq-${idx}" style="min-width:44px;text-align:right">0</span>
          </div>
        </div>`;
      }).join('') : '<p class="small">Empty.</p>'}
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
          parts.push(`${q} ${p.name}`);
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
    const buryGo = slot.querySelector('#bury-go');
    if (buryGo) buryGo.onclick = () => {
      const sel = slot.querySelector('#bury-what').value; // "material:branch" | "food:3"
      const qty = Math.max(1, +slot.querySelector('#bury-qty').value || 1);
      const [kind, key] = sel.split(':');
      Game.buryCache(kind, kind === 'food' ? +key : key, qty);
      inlineView = { kind: 'caches', result: 'Buried.', mapKey: inlineMapKey() };
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
        ${Game.stashHtml()}`;
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
              if (!links.length) return '';
              return '<div style="margin-top:4px"><p class="small"><b>⛓️ Links:</b></p>' + links.map(l => {
                const other = l.subordinate === 'haven' ? l.primary : l.subordinate;
                const nm = Game._ovName(other);
                const sub = l.subordinate === 'haven';
                const paid = (l.tributePaidWeek >= Math.floor(Game.state.scholar.day / 7));
                let html = `<p class="small">⛓️ ${sub ? 'Bows to ' + nm : nm + ' bows to Haven'} · trust ${l.trust} · tribute ${l.tributeKcalPerWeek.toLocaleString()} kcal/wk${sub ? (paid ? ' (paid ✓)' : ' (DUE ⚠)') : ''}`;
                if (sub && !paid) html += ` <button class="btn sm" data-link-pay="${l.id}">Pay tribute</button>`;
                if (l.pendingDemand) html += `<br>📯 ${l.pendingDemand.detail}<br><button class="btn sm" data-demand-yes="${l.id}">Honor it</button> <button class="btn sm ghost" data-demand-no="${l.id}">Refuse</button>`;
                return html + '</p>';
              }).join('') + '</div>';
            } catch (e) { return ''; }
          })()}`;
        } catch (e) { return ''; }
      })()}
      <p class="small" style="opacity:.75">${st.rosterCount} mouths need ${st.villageEat.toLocaleString()}/day · the village brings in ${st.villageGive.toLocaleString()} · shortfall ${net.toLocaleString()}/day</p>
      <p class="small">Haven survives when: ${Game.journalName()} 10 (${st.codexCount}) · Pantry ${Game.fmtKcal(8000)}+ (${Game.fmtKcal(st.pantryKcal)})</p>
      <p class="small" style="opacity:.7">Tap a person in the grid to talk. They\'re living their lives.</p>
      ${mains.map(p => {
        const h = (Game.state.village.health && Game.state.village.health[p.id] !== undefined) ? Game.state.village.health[p.id] : 100;
        const hb = h >= 70 ? '🟢' : h >= 40 ? '🟡' : '🔴';
        const lang = p.langNote ? ` <span style="opacity:.7">${p.langNote}</span>` : '';
        const conf = p.conflictNote ? `<br><span style="opacity:.7">${p.conflictNote}</span>` : '';
        return `<p class="small">${hb} <b>${p.name}</b> — ${p.formerOccupation} (${h})${lang}${conf}</p>`; }).join('')}
      <p class="small" style="margin-top:8px;opacity:.75"><b>Also here:</b> ${bg.map(p => `${p.name}`).join(' · ')}</p>
      ${(() => {
        const asg = (Game.state.village.assignments || {});
        const ids = Object.keys(asg);
        if (!ids.length) return '<p class="small" style="opacity:.6">📋 No one assigned. Tap a person → Assign task to direct them.</p>';
        const tasks = Game.delegateTasks();
        const lines = ids.map(rid => {
          const vp = (Game.data.villagers || []).find(v => v.id === rid) || (Game.data.background_survivors || []).find(v => v.id === rid) || {};
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
      return `${m.emoji} ${esc(name)}${count} <span class="cc-hpbar"><span style="width:${Math.round(frac * 100)}%"></span></span>`;
    }).join(' · ');
    return `<div class="combat-enemies" style="font-size:12px;opacity:.85;margin:0 6px 4px">${enemyLine} <span style="opacity:.6">· ${p.moveLeft || 0} move · ${p.acted ? 0 : 1} act</span></div>` +
    `<div class="selfbar">
      <button class="self-btn" id="c-strike" title="${esc(wname)} — range ${wrange}" ${(!adj.length || p.acted) ? 'disabled' : ''}>⚔ Strike${adj.length > 1 ? '…' : ''}</button>
      <button class="self-btn" id="c-study" ${p.acted ? 'disabled' : ''}>👁 Study</button>
      ${mons.some(m => m.kind === 'hostile') ? `<button class="self-btn" id="c-talk" ${p.acted ? 'disabled' : ''}>💬 Talk</button>` : ''}
      ${canScream ? `<button class="self-btn" id="c-scream" ${p.acted ? 'disabled' : ''}>🧀 Scream</button>` : ''}
      ${hasWell ? `<button class="self-btn" id="c-well" ${p.acted ? 'disabled' : ''} title="Gravity well — hold monsters within 3 tiles for 2 turns (one use)">🕳 Well</button>` : ''}
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
      return `<span class="cs-mon">${m.emoji} <b>${esc(name)}</b>${count}` +
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
    on('p-face', () => { Game.startCombat(); rerender(); });
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
    hickory_nut: '🌰', acorn_white_oak: '🌰', blackberry: '🫐', dandelion: '🌼',
    cattail: '🌾', persimmon: '🍑', muscadine: '🍇', wild_onion: '🧅',
    chickweed: '🌱', wood_sorrel: '☘️',
  };
  const CELL_GLYPH = {
    tree: '🌳', bigtree: '🌲', bush: '🌿', water: '💧', rubble: '🧱',
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
    const out = { burst: new Set(), charge: new Set(), line: new Set(), single: new Set(), direct: new Set(), rush: new Set(), beam: new Set() };
    try {
      const f = Game.tbfight;
      if (!f) return out;
      for (const m of (f.fighters || [])) {
        if ((m.kind !== 'monster' && m.kind !== 'hostile') || !m.alive || !m.telegraph) continue;
        const tg = m.telegraph;
        const ptype = (tg.pattern && tg.pattern.type) || 'single';
        // If pattern not learned, skip entirely — no telegraph markers at all
        let known = true;
        try {
          known = Game.encTelegraphKnown ? Game.encTelegraphKnown(m) : true;
        } catch (e) {}
        if (!known) continue;
        const targetSet = out[ptype] || out.single;
        if (tg.kind === 'direct' && tg.targetKey) {
          const tgt = (f.fighters || []).find(x => x.key === tg.targetKey);
          if (tgt) {
            out.direct.add(tgt.mx + ',' + tgt.my);
          }
        } else if (tg.cells && tg.cells.length) {
          for (const c of tg.cells) {
            const k = c.cx + ',' + c.cy;
            // Don't double-add beam cells (they have their own renderer)
            if (ptype === 'beam') continue;
            targetSet.add(k);
          }
        }
      }
    } catch (e) {}
    return out;
  }
  function renderDetail(st) {
    // Collect telegraph visuals once per render (not per cell)
    const _tg = tbAllTelegraphCells();
    const cells = Game.genDetail(st.px, st.py);
    const tile = Game.playerTile();
    const pmx = Game.state.scholar.mx ?? 4, pmy = Game.state.scholar.my ?? 4;
    const mon = Game.state.scholar.monster;
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
          // DIRECTIONAL MARKER: you are a pulsing ring with a facing wedge.
          // Facing comes from your last step — the marker shows where you're headed.
          const f = Game.state.scholar.facing || { x: 0, y: 1 };
          const ang = Math.round(Math.atan2(f.x, -f.y) * 180 / Math.PI);
          g = `<span class="pmark" data-ent="me"><span class="ptoken">🧑</span><span class="pdir" style="transform:rotate(${ang}deg)">▲</span></span>`;
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
          g = (spKnown && PLANT_GLYPH[sp]) ? PLANT_GLYPH[sp] : '🌱';
          cls += ' plantcell' + (spKnown ? ' knownplant' : '');
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
          } else {
            g = '🌿';
          }
          if (isDepleted) { cls += ' depleted'; }
        } else if (cell === 'tree' || cell === 'bigtree') {
          g = CELL_GLYPH[cell] || '';
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
          if ((cell === 'tree' || cell === 'bigtree') && sec.yield === 0) { g = '🌿'; cls += ' ivy'; }
          else if (cell === 'water' && sec.safe === false) { g = '☠️'; cls += ' poison'; }
          else if (cell === 'tent' && sec.condition === 'shredded') { g = '💨'; cls += ' shredded'; }
        }
        // ENTITIES OVERLAY: player, monster, animal, villager — always visible,
        // never overwritten by the cell underneath. People are not grass.
        if (!isMe) {
          // turn-based combat: fighters render from the fight, not scholar.monster
          const tbf = Game.tbfight;
          let drawn = false;
          if (tbf) {
            for (let _mfi = 0; _mfi < tbf.fighters.length; _mfi++) {
              const mf = tbf.fighters[_mfi];
              if (mf.kind !== 'monster' && mf.kind !== 'hostile') continue;
              if (!mf.alive || mf.fled || mf.mx !== cx || mf.my !== cy) continue;
              // data-ent: stable key so the move animator can glide fighters
              // tile-to-tile instead of teleporting them on re-render.
              // INDISTINCT (Steve 2026-10-05): creatures render the same whether
              // monster or animal — the emoji shows what it looks like, not what it is.
              g = `<span data-ent="creature:${esc(mf.monsterId || mf.mdef && mf.mdef.id || ('tb' + _mfi))}">${esc(mf.emoji || '👹')}</span>`;
              cls += ' creature';
              drawn = true; break;
            }
          }
          if (!drawn && mon && cx === mon.mx && cy === mon.my) {
            const mdef = (Game.data.monsters || []).find(m => m.id === mon.id) || {};
            // INDISTINCT (Steve 2026-10-05): same 'creature' class as animals
            g = `<span data-ent="creature:${esc(mon.id || 'wild')}">${esc(mdef.emoji || '👹')}</span>`;
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
            g = `<span data-ent="creature:${esc(ani.id || 'wild')}">${esc(aemoji)}${_pbadge ? `<span class="preybadge" style="display:block;font-size:9px;line-height:1;margin-top:-3px">${esc(_pbadge)}</span>` : ''}</span>`;
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
                g = `<span class="vent" data-ent="vil:${esc(rid)}"><span class="vtoken">🧍</span>` + (fname ? `<span class="vname">${esc(fname)}</span>` : '') + `</span>`;
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
          (_tg.line.has(_k) ? ' lineCells' : '') +
          (_tg.single.has(_k) ? ' targetTile' : '') +
          (_tg.direct.has(_k) ? ' lockOn' : '') +
          (_tg.rush.has(_k) ? ' rushIndicator' : '');
        // (no ambushZone: the speedbump's snap is no-warning by design —
        // see tbAllTelegraphCells note. Steve 2026-10-06)
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
        html += `<div class="${cls}${targetingCells().has(_k) ? ' targetable' : ''}${Game.cellScorched && Game.cellScorched(cx, cy) ? ' scorched' : ''}${_beamCls}${_srcCls}${_haloCls}${_tgCls}${_gwCls}${_cfCls}"${(_gwStyle || _cfStyle) ? ` style="${[_gwStyle, _cfStyle].filter(Boolean).join(';')}"` : ''} data-cx="${cx}" data-cy="${cy}">${g}</div>`;
      }
      html += '</div>';
    }
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
    // Destination (if traveling)
    try {
      const tset = Game.travelDest ? Game.travelDest() : null;
      if (tset && tset.size) {
        const [tx, ty] = [...tset][0].split(',').map(Number);
        parts.push(`🎯 ${dirArrow(tx - px, ty - py)}${dist(tx, ty)}`);
      }
    } catch (e) {}
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
    for (let y = 0; y < 7; y++) {
      html += '<div class="mrow">';
      for (let x = 0; x < 7; x++) {
        const tl = Game.tileAt(x, y);
        const isP = (x === st.px && y === st.py);
        const isW = st.wanderer && x === st.wanderer.x && y === st.wanderer.y && tl.revealed;
        const isT = tset.has(x + ',' + y);
        const depCls = Game.depletionClass ? Game.depletionClass(tl) : (((tl.maxStock - (tl.stock || 0) > 0) && tl.revealed) ? ' spent' : '');
        const pathCls = (tl.wornPath && tl.revealed) ? 'worn-path' : '';
        const cls = 'tile' + (isP ? ' me' : '') + (tl.revealed ? '' : ' fog') + (isT ? ' dest' : '') + (isW ? ' beast' : '') + (depCls ? ' ' + depCls : '') + (pathCls ? ' ' + pathCls : '');
        // other villages: show 🏘️ if generated (you've been near)
        const otherV = (Game.state.otherVillages || []).find(v => v.x === x && v.y === y && v.generated);
        // PLAYER MARKER (Steve 2026-10-05): always show YOU clearly, even on
        // fog. The old code showed the tile glyph which could hide you.
        const g = isP ? '📍' : isW ? '🐗' : otherV ? '🏘️' : (tl.revealed ? S.TILE_GLYPH[tl.type] : '?');
        const pf = Game.state.scholar.facing || { x: 0, y: 1 };
        const pang = Math.round(Math.atan2(pf.x, -pf.y) * 180 / Math.PI);
        html += `<div class="${cls}" data-x="${x}" data-y="${y}">${isP ? `<span class="mface" style="transform:rotate(${pang}deg)">➤</span>` : g}</div>`;
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
      ${entries.length ? entries.map(e => `
        <div class="card codex"><h3>${e.name} <span class="small">· ${e.kcalKnown ? `${e.kcal} kcal/${e.unit}` : `<i>kcal unknown — learn preparation</i>`}</span> <span class="small" style="opacity:.7">[${LVL[e.level] || 'L1'}]</span></h3>
        <p class="small"><b>Prep:</b> ${e.prepKnown ? (e.prep || '—') : '<i>unknown — eat it or reach L2 to learn</i>'}</p>
        <p class="small"><b>Uses:</b> ${e.uses ? esc(e.uses) : '<i>unknown — harvest and taste to learn</i>'}</p>
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
        const attacks = (m.attacksSeen || []).length ? `<p class="small">You've seen it attack ${m.attacksSeen.length}× — ${esc((md.attack || {}).telegraph || 'it gives warning first')}.</p>` : '';
        return `<div class="card codex"><h3>${esc(name)}</h3>${m.villageName ? `<p class="small" style="opacity:.7">named by the village</p>` : `<p class="small" style="opacity:.7">not yet named — the village is arguing about it</p>`}<p>${esc(stageText)}</p>${attacks}</div>`;
      }).join('') : ''}
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
      <button id="dbg-endc">End combat</button></p>`;
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
            s.monster = { id, mx: nx, my: ny };
            Game.say(`🐞 DEBUG: ${id} spawned at ${nx},${ny}.`);
            break outer;
          }
        }
      }
      refresh();
    };
    q('#dbg-fight').onclick = () => {
      const id = q('#dbg-mon').value;
      const s = Game.state.scholar;
      if (!s.monster || s.monster.id !== id) q('#dbg-spawn').onclick();
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
      Game.map.px = Game.state.village.px ?? 3;
      Game.map.py = Game.state.village.py ?? 3;
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
