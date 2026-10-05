/* The Oversight — slice 1: "Seven Days" playable.
   Screens: title → onboarding → game (map/day loop) → combat → codex → ending. */
(function () {
  'use strict';
  const S = window.Scattering;
  const Game = S.Game;
  const screen = document.getElementById('screen');
  const toastEl = document.getElementById('toast');

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
  function statRow(label, val, pct, low, cls) {
    return `<div class="stat"><div class="lbl"><span>${label}</span><span>${val}</span></div><div class="bar${low ? ' low' : ''}${cls ? ' ' + cls : ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`;
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
      const phase = Game.deerPhaseBadge ? Game.deerPhaseBadge(m) : '';
      return `${m.emoji || '👹'} ${esc(label)}${m.telegraph ? ' ⚠' : ''}${phase}`;
    }).join(' · ') || '⚔ COMBAT';
    const tg = mons.find(m => m.telegraph);
    return `<div class="ord-combatstrip"><div class="combatstrip">` +
      `<div class="cs-row"><span>⚔ ${names}</span></div>` +
      (tg ? `<div class="cs-telegraph">⚠ ${esc(Game.tbTelegraphCue ? Game.tbTelegraphCue(tg) : 'incoming!')}</div>` : '') +
      `</div></div>`;
  }
  function statusBars(st) {
    const feastTag = st.feastState === 'gorged' ? ' ⚡⚡ GORGED' : st.feastState === 'feasting' ? ' ⚡ feasting' : '';
    // THE BANK: one pool. The FOOD bar IS the reserve — cap grows with bank
    // skillsets; the bar glows gold past the "fed" line (banked war chest).
    const cap = st.kcalCap || 2400;
    const banked = st.banked || 0;
    const foodVal = Math.round(st.kcal) + '/' + cap + ' kcal' + (banked > 0 ? ` (+${banked} banked)` : '') + feastTag;
    return statRow('HEALTH', st.health, st.health, st.health < 35) +
      statRow('FOOD (you)', foodVal, st.kcal / cap * 100, st.kcal < 500, banked > 0 ? 'banked' : '') +
      statRow('PACK', st.invKcal + ' kcal · ' + st.packKg + '/' + st.packCap + ' kg', st.packKg / st.packCap * 100, st.packKg >= st.packCap) +
      statRow('WATER', st.hydration + '% · ' + st.waterCleanL + 'L clean', st.hydration, st.hydration < 30) +
      (Game.state && Game.state.systemArrived ? statRow('SYSTEM', st.integration + '% integrated', st.integration, false) : '');
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
    // THE OPENING GAMBLE: functional gear vs keepsakes, side by side. Tools show
    // honest stats. Keepsakes show only the flag — dead weight you're asked to
    // carry for no stated reason. The player knows it will matter somehow.
    const func = items.filter(i => i.class !== 'sentimental');
    const keeps = items.filter(i => i.class === 'sentimental');
    const picked = new Set();
    const card = (i) => {
      const isKeep = i.class === 'sentimental';
      const sub = isKeep
        ? `<p class="small">💛 KEEPSAKE — no practical use. You can't quite throw it away.</p>`
        : `<p class="small">${i.flavor || ''}</p>${i.baseEffect ? `<p class="small" style="opacity:.75">⚙ ${i.baseEffect}</p>` : ''}`;
      return `<div class="card itempick${picked.has(i.id) ? ' sel' : ''}" data-i="${i.id}"><h3>${picked.has(i.id) ? '✓ ' : ''}${isKeep ? '💛 ' : ''}${i.name}</h3>${sub}</div>`;
    };
    const render = () => {
      screen.innerHTML = `${bar('scattering://pack', picked.size + '/5')}
      <h1 class="title" style="font-size:22px">WHAT DID YOU GRAB?</h1>
      <p class="small">The sky was changing. ${v.name.split(' ')[0]} could carry five things. Choose:</p>
      <h3 class="small" style="opacity:.7;margin:12px 0 6px">USEFUL NOW</h3>
      ${func.map(card).join('')}
      ${keeps.length ? `<h3 class="small" style="opacity:.7;margin:12px 0 6px">KEEPSAKES</h3>
      <p class="small" style="opacity:.6">Dead weight. Everyone knows you wouldn't be asked to carry dead weight for no reason.</p>
      ${keeps.map(card).join('')}` : ''}
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
  function doContextAction(cx, cy, label) {
    const mon = Game.state.scholar.monster;
    if (label === 'Fight' && mon && mon.mx === cx && mon.my === cy) { Game.startCombat(mon.id); return; }
    if (label === 'Hunt') { Game.huntAnimal(); return; }
    if (label === 'Stalk') { Game.stalkAnimal(); return; }
    if (label === 'Talk') { talkAction(); return; }
    if (label === 'Cut down (big job)') { Game.cutTree(cx, cy); return; }
    if (label === 'Prune branches') { Game.pruneBranches(cx, cy); return; }
    if (label === 'Gather fallen') { Game.gatherFallen(cx, cy); return; }
    if (label === 'Clear brush (a while)') { Game.clearBrush(cx, cy); return; }
    if (label === 'Fill water (1L)') { Game.fillWater(); return; }
    if (label === 'Fish') { Game.fish(); return; }
    if (label.startsWith('Cook (')) { Game.cookAll(); return; }
    if (label.startsWith('Smoke ')) { Game.preserveFood(); return; }
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
    return `<div class="contextbar"><span class="ctx-label">nearby:</span>` +
      items.map((it, i) => `<button class="ctx-btn" data-ctx="${i}">${esc(it.label)}${it.label === 'Talk' && wantTalk ? '<span class="dot"></span>' : ''}</button>`).join('') +
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
        actAndRefresh(() => doContextAction(it.cx, it.cy, it.label));
      };
    });
  }

  // selfBarHTML: your persistent body-actions — Eat, Sleep, Pack, Wait.
  // Always in reach, above the fold. Badges are peripheral, not nagging:
  // a quiet dot when something needs attention. Never a popup, never a
  // forced scroll. Hidden in combat (turn-based has its own economy).
  function selfBarHTML(st) {
    if (st.inCombat) return '';
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
    return `<div class="selfbar"><span class="ctx-label">you:</span>` +
      `<button class="self-btn" data-self="eat">🍽 Eat${eatDot}</button>` +
      `<button class="self-btn" data-self="sleep">😴 Sleep${sleepDot}</button>` +
      `<button class="self-btn" data-self="pack">🎒 Pack (${st.invCount})${packDot}</button>` +
      `<button class="self-btn" data-self="wait">⏳ Wait</button>${exileBtns}${caseBtn}</div>`;
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
  function abilityBarHTML() {
    const acts = (Game.activatableAbilities && Game.activatableAbilities()) || [];
    if (!acts.length) return '';
    return `<div class="abilitybar"><span class="ctx-label">⚡</span>` +
      acts.map(a => `<button class="ab-btn" data-ab="${a.id}" ${a.available ? '' : 'disabled title="' + esc(a.why || 'not now') + '"'}>⚡ ${esc(a.name)}</button>`).join('') +
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
        } else if (cell === 'water') {
          actions.push(['Drink', () => { Game.drinkWater(); refresh(); }]);
          actions.push(['Fill water (1L)', () => { Game.fillWater(); refresh(); }]);
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
    return `<div class="targetbar"><span>\u{1F3AF} ${esc(targeting.prompt)} — tap a highlighted target</span>` +
      `<button class="t-cancel" id="t-cancel">\u2715 Cancel</button></div>`;
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
    function sting(kind) {
      if (!ensure()) return;
      stopHeartbeat();
      const t = ctx.currentTime;
      const notes = kind === 'victory' ? [392, 523, 659] : kind === 'defeat' ? [220, 174, 130] : [330];
      notes.forEach((fq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fq;
        const st = t + i * 0.16;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.3, st + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.45);
        o.connect(g); g.connect(sfxBus);
        o.start(st); o.stop(st + 0.5);
      });
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
    return {
      ensureAudio() { return ensure(); },
      combatStart() { heartbeat(72); },
      telegraph(d) {
        // urgency = turnsLeft. 2+ = slow dread (80bpm), 1 = frantic (145bpm).
        heartbeat((d && d.urgency >= 2) ? 80 : 145);
        if (d && d.windupTick) return; // charge already rising from declare
        if (d && d.beam) beamCharge(Math.max(0.9, (d.urgency || 1) * 1.5));
        // highbeam bellow is explicit via deerAggro on declare (game.js), not here
      },
      impact(d) {
        if (d && d.beam) beamFire();
        else boom();
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
      combatEnd() { stopHeartbeat(); stopCharge(); beamSweepStop(); },
      toggleMute() { return toggleMute(); },
      isMuted() { return muted; },
      round() { /* hook reserved */ },
    };
  })();
  Game.audio = CombatAudio;

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
    if (inlineView.kind === 'person') renderPersonInline(target, inlineView);
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

  function renderPersonInline(slot, view) {
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

    slot.innerHTML = `<div class="inlinecard">
      ${inlineHead('\uD83D\uDC64 ' + esc(titleName))}
      ${view.result ? `<p class="inline-result">✓ ${esc(view.result)}</p>` : ''}
      ${challengeHtml}
      <div class="inline-body">
        <details class="person-details"><summary class="small" style="cursor:pointer;opacity:.7">about them</summary>${infoHtml}${conf}</details>
        ${convoHtml || (said ? `<p style="font-size:16px;line-height:1.6;margin-top:10px">\u201C${esc(said)}\u201D</p>` : '')}
      </div>
      <div class="inline-btns">${btns}</div>
    </div>`;
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
    chatView = { vid: vid, thinking: null, thinkingToken: 0 };
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
    chatView = { vid: vid, thinking: null, thinkingToken: 0 };
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
    const before = ui && ui.transcript ? ui.transcript.length : 0;
    const st = Game.convoTurn(vid, cid);
    if (!st || st.ended) { chatView = null; refresh(); return; }
    armChatThinking(vid, before, cid, false);
    refresh();
  }

  function renderChatScreen(cv, convo) {
    const vid = cv.vid;
    const vp = (Game.data.villagers || []).find(v => v.id === vid) ||
               (Game.data.background_survivors || []).find(v => v.id === vid) || {};
    const sys = !!Game.state.systemArrived;
    const known = sys || Game.nameKnown(vid);
    const titleName = known ? (vp.name || 'Someone') : Game.personDescriptor(vid);
    const sub = sys && vp.formerOccupation
      ? vp.formerOccupation + (vp.homeRegion ? ' · ' + vp.homeRegion : '') : '';
    const thinking = cv.thinking || null;
    const shownTranscript = thinking ? (convo.transcript || []).slice(0, thinking.hiddenFrom) : (convo.transcript || []);
    const msgs = shownTranscript.map(e => {
      const clean = Game.cleanDialogue ? Game.cleanDialogue(e.text) : String(e.text || '');
      const isSpeech = /^\s*"/.test(clean);
      const spCls = e.foreign ? 'fsp' : (isSpeech ? 'sp' : 'narr');
      const ftag = e.foreign
        ? ` <span class="flang">${esc(Game.langDef(e.foreign).icon)} ${esc(Game.langDef(e.foreign).name)}</span>` : '';
      if (!isSpeech) {
        return `<div class="chat-narr"><span class="narr">${esc(clean)}</span></div>`;
      }
      const who = e.who === 'you' ? 'You' : titleName;
      const side = e.who === 'you' ? 'you' : 'them';
      return `<div class="chat-msg ${side}"><div class="chat-name">${esc(who)}</div>` +
        `<div class="chat-bubble"><span class="${spCls}">${esc(clean)}</span>${ftag}</div></div>`;
    }).join('') + (thinking
      ? `<div class="chat-msg them"><div class="chat-name">${esc(titleName)}</div>` +
        `<div class="chat-bubble"><span class="thinking-dots" aria-label="thinking"><span>.</span><span>.</span><span>.</span></span></div></div>`
      : '');
    const choiceBtns = (convo.choices || []).map(cn => {
      const cleanLabel = Game.cleanDialogue ? Game.cleanDialogue(cn.label) : cn.label;
      return `<button class="btn chat-choice${cn.id === 'leave' ? ' ghost' : ''}" data-cid="${esc(cn.id)}"${thinking ? ' disabled' : ''}>${esc(cleanLabel)}</button>`;
    }).join('');
    screen.innerHTML = `
      <div class="chat">
        <div class="chat-head">
          <div><b>${esc(titleName)}</b>${sub ? `<br><span class="small" style="opacity:.6">${esc(sub)}</span>` : ''}</div>
          <button class="btn sm ghost" id="chat-end">End conversation</button>
        </div>
        <div class="chat-msgs" id="chat-msgs">${msgs}</div>
        <div class="chat-choices">${choiceBtns}</div>
      </div>`;
    document.getElementById('chat-end').onclick = () => closeChat(true);
    screen.querySelectorAll('[data-cid]').forEach(b => {
      b.onclick = () => chatChoice(vid, b.dataset.cid);
    });
    // Chat behavior: newest messages visible. Direct scrollTop assignment —
    // no smooth animation, no page-level scrolling calls (the iOS jump fix
    // stays intact; only the messages pane moves, which is expected in chat).
    const box = document.getElementById('chat-msgs');
    if (box) box.scrollTop = box.scrollHeight;
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
      const chal = Game.state.village.challenge || {};
      const task = chal.task || 'forage';
      const taskName = (Game.delegateTasks()[task] || {}).name || task;
      Game.state.village.taskLeads = Game.state.village.taskLeads || {};
      Game.state.village.taskLeads[task] = vid;
      const t = Game.state.village.trust || (Game.state.village.trust = {});
      t[vid] = Math.min(100, (t[vid] || 10) + 10);
      Game.state.village.heat = Game.state.village.heat || {};
      Game.state.village.heat[vid] = 0;
      Game.state.village.challenge = null;
      Game.say(`${dname} nods slowly. "Good call." They start organizing the ${taskName} crews their way.`);
      view.result = `You let them lead ${taskName}. They'll work it every part — and build their own base doing it.`;
    }
    else if (act === 'stand') {
      const t = Game.state.village.trust || (Game.state.village.trust = {});
      t[vid] = Math.max(0, (t[vid] || 10) - 5);
      Game.state.village.heat = Game.state.village.heat || {};
      Game.state.village.heat[vid] = 0;
      Game.state.village.challenge = null;
      Game.say(`${dname} holds your gaze, then looks away. "Fine. Your funeral." This isn't over — but it's quiet. For now.`);
      view.result = 'You held your ground.';
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
          return `<p class="small">${(Game.isKeepsake && Game.isKeepsake(i)) ? '💛 ' : ''}${i.bonded ? '\u2756 ' : ''}<b>${Game.itemDisplayName(i)}</b> x${i.units} (${(i.kcalEach || 0) * i.units} kcal)${foodMark}${i.bonded ? ` <span class="small" title="Bonded relic \u2014 grown, not found">bond ${i.bond || 0}${(i.enhancements || []).length ? ' \u00B7 ' + i.enhancements.join(', ') : ''}</span>` : ''}${(Game.isKeepsake && Game.isKeepsake(i)) ? ' <span class="small" style="opacity:.6">keepsake</span>' : ''}${i.spoilDay <= st.day ? ' \u26A0 spoiled' : ''}${i.bookId ? ` <button class="btn ghost sm" data-read="${i.bookId}">Read</button>` : ''}${Game.isUsable(i) && !i.bonded ? ` <button class="btn ghost sm" data-use="${idx}">Use</button>` : ''}${foodBtns}${i._cookable ? ` <button class="btn ghost sm" data-cook="${idx}">Cook</button>` : ''}${Game.isWeapon(i) ? ` <button class="btn ghost sm" data-equip-w="${idx}">Equip</button>` : ''}${Game.isArmor(i) ? ` <button class="btn ghost sm" data-equip-a="${idx}">Wear</button>` : ''}${(Game.isKeepsake && Game.isKeepsake(i) && Game.sentimentTaught && Game.sentimentTaught()) ? ` <button class="btn ghost sm" data-channel="${idx}">💛 Channel</button>` : ''}${(i.kcalEach || 0) > 0 && !i.bonded ? ` <button class="btn ghost sm" data-donate="${idx}">Donate</button>` : ''}${i.material ? ` <button class="btn ghost sm" data-stashmat="${idx}">Stash</button>` : ''}${Game.isStashableTool(i) ? ` <button class="btn ghost sm" data-stashtool="${idx}">Stash</button>` : ''}</p>`;
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
    slot.querySelectorAll('[data-channel]').forEach(b => b.onclick = rewire(() => Game.channelSentiment(+b.dataset.channel), 'Channeled.'));
    slot.querySelectorAll('[data-cook]').forEach(b => b.onclick = rewire(() => Game.cookFood(+b.dataset.cook), 'Cooked.'));
    // FOOD REALITY: processing buttons.
    slot.querySelectorAll('[data-shell]').forEach(b => b.onclick = rewire(() => Game.shellNuts(+b.dataset.shell), 'Shelled.'));
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
    return `<div class="dpad" id="dpad" role="group" aria-label="walk pad">${btns}<button class="dpmin" id="dp-min" aria-label="hide walk pad">–</button></div>`;
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
      return { moved: !!Game.tbPlayerMove(tx, ty) };
    }
    const s = Game.state.scholar;
    const tx = (s.mx ?? 4) + step.dx, ty = (s.my ?? 4) + step.dy;
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
      // DRAG TO MOVE (Steve 2026-10-04): the pad covered a quarter of the
      // screen and couldn't move. Drag the pad background (not the buttons)
      // to reposition it; the spot persists across renders via localStorage.
      try {
        const saved = JSON.parse(localStorage.getItem('oversight-dpad-pos') || 'null');
        if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
          pad.style.left = saved.left + 'px'; pad.style.top = saved.top + 'px';
          pad.style.right = 'auto'; pad.style.bottom = 'auto';
        }
      } catch (_) {}
      pad.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.dpbtn, .dpmin')) return; // buttons still walk
        e.preventDefault();
        const wrap = pad.parentElement;
        const wr = wrap.getBoundingClientRect(), pr = pad.getBoundingClientRect();
        const ox = pr.left - wr.left, oy = pr.top - wr.top;
        pad.style.left = ox + 'px'; pad.style.top = oy + 'px';
        pad.style.right = 'auto'; pad.style.bottom = 'auto';
        const sx = e.clientX, sy = e.clientY;
        const move = (ev) => {
          // Steve 2026-10-04: the pad must be draggable OFF the grid entirely.
          // Clamp loosely — keep 24px grabbable so it can never be lost.
          const grab = 24;
          const nx = Math.max(-pr.width + grab, Math.min(ox + (ev.clientX - sx), wr.width - grab));
          const ny = Math.max(-pr.height + grab, Math.min(oy + (ev.clientY - sy), wr.height - grab));
          pad.style.left = nx + 'px'; pad.style.top = ny + 'px';
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          try { localStorage.setItem('oversight-dpad-pos', JSON.stringify({ left: parseFloat(pad.style.left) || 0, top: parseFloat(pad.style.top) || 0 })); } catch (_) {}
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
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
    // CHAT MODE: conversation is the one acceptable interruption. The screen
    // is the conversation — full chat view, no scrolling to follow it.
    // Combat cancels it; an ended conversation drops the view.
    if (st.inCombat) chatView = null;
    if (chatView) {
      const _cc = Game.convoUI ? Game.convoUI(chatView.vid) : null;
      if (_cc && _cc.active) { renderChatScreen(chatView, _cc); return; }
      chatView = null;
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
          <p class="small ord-epithet">👁 ${esc(Game.nodeDetail().epithet)} — this ground, up close</p>
          ${st.inCombat ? combatStripHTML(st) : ''}
          <div class="ord-gridwrap">
            <div class="detail">${renderDetail(st)}</div>
            ${perceiveHTML()}
            <div id="inlineslot"></div>
            ${dpadHTML()}
            <button class="dpshow hidden" id="dpshow" aria-label="show walk pad">🧭</button>
          </div>
          ${st.inCombat ? `<div class="ord-combatpanel">${panelCombat(st)}</div>` : ''}
          <div class="ord-status">${statusBars(st)}</div>
          <div class="ord-self">${selfBarHTML(st)}</div>
          <div class="ord-ctx">${contextBarHTML()}</div>
          <div class="ord-target">${targetBarHTML()}</div>
          <div class="ord-danger">${dangerBarHTML()}</div>
          <div class="ord-ability">${abilityBarHTML()}</div>
          ${feedbackHTML()}
          ${isTutorialDone() ? '' : '<p class="small ord-taphint" id="taphint">🧭 d-pad walks a step · hold to keep walking · tap a far tile to walk the full path · 🗺 walk to the edge, tap yourself, head out <button class="linklike" id="taphint-x" style="font-size:12px">got it</button></p>'}
          <div class="map minimap ord-minimap">${renderMap(st, tset)}</div>
        </div>
        <div class="game-col-side">
          ${st.activeQuest ? `<p class="small ord-quest" style="border-left:3px solid #7fd67f;padding-left:8px">📋 ${esc(st.activeQuest.text)}</p>` : ''}
          <div class="ord-panel">${panelFor(st, n)}</div>
          <div class="actions ord-codex">
            <button class="btn sm ghost" id="x-codex">${Game.journalName()} (${st.codexCount})</button>
          </div>
          <div class="log ord-log">${st.log.slice(-3).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>
        </div>
      </div>`;

    // MINIMAP IS A MAP, NOT A TELEPORTER. Unexplored tiles are fully hidden —
    // no hints, no guesses. Travel happens on foot: walk to the edge of the
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
    if (st.pendingEncounter) return `
      <div class="card warn"><h3>⚠ BULLDOZER</h3>
      <p class="small">It crashes from the thicket. It is not going around.</p>
      <button class="btn sm" id="p-face">Face it</button></div>`;
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
    return `<p class="small" style="opacity:.6">😴 ${esc(prev.name)} · +${prev.heal} health · energy restored${prev.note ? `<br>${esc(prev.note)}` : ''}</p>`;
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
      <p class="small">Pantry: ${Game.fmtKcal(st.pantryKcal)} (about ${st.pantryDays} days)${st.hungryDays ? ' · ⚠ HUNGRY day ' + st.hungryDays : ''}</p>
      <p class="small">💧 Water: ${st.waterClean}L clean / ${st.waterDirty}L dirty</p>
      <button class="btn sm" id="x-pantry">Take from pantry</button>
      <button class="btn sm ghost" id="x-caches">📍 Caches</button>
      <div id="haven-stores-slot"></div>
      ${sleepHintHTML()}
      ${Game.stashHtml()}
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
  function panelCombat(st) {
    const tf = Game.tbfight;
    if (!tf) return '';
    const cur = Game.tbCurrent();
    const p = Game.tbFighter('p');
    const mons = tf.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
    const monRows = mons.map(m => {
      const mid = m.mdef ? m.mdef.id : m.monsterId;
      const name = Game.monsterDisplayName ? Game.monsterDisplayName(mid) : m.name;
      const threat = Game.monsterThreatSense && m.mdef ? Game.monsterThreatSense(m.mdef) : '';
      const hpSense = Game.monsterHpSense ? Game.monsterHpSense(m) : null;
      const bits = [threat, hpSense].filter(Boolean).join(' · ');
      return `<p class="small cc-mon">${m.emoji} <b>${esc(name)}</b>${bits ? ` <span style="opacity:.7">— ${esc(bits)}</span>` : ''}${m.telegraph ? ' ⚠' : ''}</p>`;
    }).join('');
    const adj = p ? mons.filter(m => Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)) <= (Game.equippedWeapon ? Game.equippedWeapon().range : 1)) : [];
    const wrange = Game.equippedWeapon ? Game.equippedWeapon().range : 1;
    const wname = Game.equippedWeapon ? Game.equippedWeapon().name : '';
    const canScream = Game.hasAbility('scream_cheese') && Game.state.scholar.screamDay !== Game.state.scholar.day;
    const yourTurn = Game.tbIsPlayerTurn();
    const turnLine = yourTurn && p
      ? `Your turn — <b>${p.moveLeft}</b> move${p.acted ? ' · acted' : ''}`
      : (cur ? `${esc(cur.kind === 'player' ? 'You' : (Game.monsterDisplayName && cur.mdef ? Game.monsterDisplayName(cur.mdef.id) : cur.name))} acting…` : '');
    return `
      <div class="card combat-compact"><div class="cc-head"><span>⚔ R${tf.round}</span><span class="cc-turn">${turnLine}</span></div>
      ${monRows}
      ${yourTurn && p ? `<div class="actions cc-actions">
        <button class="btn sm" id="c-strike" title="${esc(wname)} — range ${wrange}" ${(!adj.length || p.acted) ? 'disabled' : ''}>⚔ STRIKE${adj.length > 1 ? '…' : ''}</button>
        <button class="btn sm ghost" id="c-study" ${p.acted ? 'disabled' : ''}>👁</button>
        ${mons.some(m => m.kind === 'hostile') ? `<button class="btn sm ghost" id="c-talk" ${p.acted ? 'disabled' : ''}>💬</button>` : ''}
        ${canScream ? `<button class="btn sm ghost" id="c-scream" ${p.acted ? 'disabled' : ''}>🧀</button>` : ''}
        <button class="btn sm ghost" id="c-shout" ${p.acted ? 'disabled' : ''} title="Bellow — scatter noise-fearing monsters (2/fight)">📢</button>
        <button class="btn sm ghost" id="c-offer" ${p.acted ? 'disabled' : ''} title="Offer food — buy off the curious thief">🍖</button>
        <button class="btn sm ghost" id="c-flee" ${p.acted ? 'disabled' : ''}>🏃</button>
        <button class="btn sm ghost" id="c-endturn">⏭</button>
      </div>
      <div class="actions" id="c-talkrow" style="display:none"></div>` : ''}
      </div>`;
  }

  function wireCombatPanel() {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on('c-endturn', () => { Game.tbPlayerEndTurn(); rerender(); });
    on('c-study', () => { Game.tbPlayerStudy(); rerender(); });
    on('c-scream', () => { Game.tbPlayerScream(); rerender(); });
    on('c-shout', () => { Game.tbPlayerShout(); rerender(); });
    on('c-offer', () => { Game.tbPlayerOfferFood(); rerender(); });
    on('c-flee', () => { Game.tbPlayerFlee(); rerender(); });
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
  function renderDetail(st) {
    const cells = Game.genDetail(st.px, st.py);
    const tile = Game.playerTile();
    const pmx = Game.state.scholar.mx ?? 4, pmy = Game.state.scholar.my ?? 4;
    const mon = Game.state.scholar.monster;
    const ani = Game.state.scholar.animal;
    const vpos = (Game.state.village.positions || {});
    const secrets = tile.secrets || {};
    let html = '';
    for (let cy = 0; cy < 9; cy++) {
      html += '<div class="drow">';
      for (let cx = 0; cx < 9; cx++) {
        const cell = cells[cy][cx];
        const isMe = (cx === pmx && cy === pmy);
        let g, cls = 'cell';
        // Framework gating (encounters.js): species glyphs only AFTER codex ID —
        // before that every animal is just paw-prints. No visual name leaks.
        const _aniKnown = (id) => { try { return Game.encAnimalKnown(id); } catch (e) { return false; } };
        const ANIMAL_GLYPH = new Proxy({ cottontail_rabbit: '🐇', gray_squirrel: '🐿️', white_tailed_deer: '🦌', creek_chub: '🐟', wild_turkey: '🦃' }, {
          get(t, id) { return (typeof id === 'string' && _aniKnown(id)) ? t[id] : '🐾'; }
        });
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
              g = `<span data-ent="mon:${esc(mf.monsterId || mf.mdef && mf.mdef.id || ('tb' + _mfi))}">${esc(mf.emoji || '👹')}</span>`;
              cls += ' monster';
              drawn = true; break;
            }
          }
          if (!drawn && mon && cx === mon.mx && cy === mon.my) {
            const mdef = (Game.data.monsters || []).find(m => m.id === mon.id) || {};
            g = `<span data-ent="mon:${esc(mon.id || 'wild')}">${esc(mdef.emoji || '👹')}</span>`;
            cls += ' monster'; drawn = true;
          }
          if (!drawn && ani && cx === ani.mx && cy === ani.my) {
            g = `<span data-ent="ani:${esc(ani.id || 'wild')}">${ANIMAL_GLYPH[ani.id] || '🐾'}</span>`;
            cls += ' animal'; drawn = true;
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
        const _k = cx + ',' + cy;
        // beamLane: current beam path. beamLive: the beam is FIRING (faster,
        // hotter pulse). beamGhost: where the beam just was — the sweep arc,
        // so rotation reads as motion instead of teleporting.
        const _beamCls = (_lane && _lane.has(_k)) ? (' beamLane' + (_live ? ' beamLive' : '')) : ((_ghost && _ghost.has(_k)) ? ' beamGhost' : '');
        html += `<div class="${cls}${targetingCells().has(_k) ? ' targetable' : ''}${Game.cellScorched && Game.cellScorched(cx, cy) ? ' scorched' : ''}${_beamCls}" data-cx="${cx}" data-cy="${cy}">${g}</div>`;
      }
      html += '</div>';
    }
    return html;
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
        const g = isW ? '🐗' : otherV ? '🏘️' : (tl.revealed ? S.TILE_GLYPH[tl.type] : '?');
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
        <div class="card codex"><h3>${e.name} <span class="small">· ${e.kcal} kcal/${e.unit}</span> <span class="small" style="opacity:.7">[${LVL[e.level] || 'L1'}]</span></h3>
        <p class="small"><b>Prep:</b> ${e.level >= 2 ? (e.prep || '—') : '<i>unidentified uses — reach L2</i>'}</p>
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
    const scenBtns = (typeof Game.debugScenarioList === 'function' ? Game.debugScenarioList() : [])
      .map(([id, label]) => `<button class="dbg-scen" data-scen="${id}" style="display:block;width:100%;text-align:left;margin:3px 0;padding:8px;font-size:14px">${label}</button>`).join('');
    // RETIRED: never deleted, saved for later — collapsed behind a toggle.
    const retiredList = (typeof Game.debugRetiredList === 'function' ? Game.debugRetiredList() : []);
    const retBtns = retiredList
      .map(([id, label]) => `<button class="dbg-scen" data-scen="${id}" style="display:block;width:100%;text-align:left;margin:3px 0;padding:8px;font-size:14px;opacity:.65">${label}</button>`).join('');
    const retSection = retBtns
      ? `<p style="margin:8px 0 4px"><button id="dbg-retired-toggle" style="font-size:12px;opacity:.7">🗄️ Retired (${retiredList.length}) ▸</button></p><div id="dbg-retired" style="display:none">${retBtns}</div>`
      : '';
    el.innerHTML = `<b>🐞 DEBUG</b> <button id="dbg-x" style="float:right">✕</button>
      <p style="margin:8px 0 4px"><b>SCENARIOS</b> <span style="opacity:.6;font-size:11px">one tap, fresh run</span></p>
      <div id="dbg-scenarios">${scenBtns}</div>
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
