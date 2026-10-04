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
  function statRow(label, val, pct, low) {
    return `<div class="stat"><div class="lbl"><span>${label}</span><span>${val}</span></div><div class="bar${low ? ' low' : ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`;
  }
  function statusBars(st) {
    return statRow('HEALTH', st.health, st.health, st.health < 35) +
      statRow('FOOD (you)', Math.round(st.kcal) + ' kcal', st.kcal / 24, st.kcal < 500) +
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
      <p class="small" style="opacity:.45;margin-top:14px"><span id="build-tag" style="cursor:pointer" title="tap to check for updates">build ${esc(window.BUILD_VERSION || 'dev')}</span> <span id="b-debug" style="cursor:pointer;opacity:.35;font-size:11px" title="toggle debug tools">🐞</span></p>`;
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
    const picked = new Set();
    const render = () => {
      screen.innerHTML = `${bar('scattering://pack', picked.size + '/5')}
      <h1 class="title" style="font-size:22px">WHAT DID YOU GRAB?</h1>
      <p class="small">The sky was changing. ${v.name.split(' ')[0]} could carry five things. Choose:</p>
      ${items.map(i => `<div class="card itempick${picked.has(i.id) ? ' sel' : ''}" data-i="${i.id}"><h3>${picked.has(i.id) ? '✓ ' : ''}${i.name}</h3><p class="small">${i.flavor}</p></div>`).join('')}
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
        if (Game.movePath(best[0], best[1])) { refresh(); cellPopup(cx, cy); }
        else refresh();
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
    if (label === 'Talk') { talkAction(); return; }
    if (label === 'Cut down') { Game.cutTree(cx, cy); return; }
    if (label === 'Clear brush') { Game.clearBrush(cx, cy); return; }
    if (label === 'Fill water (+2L)') { Game.fillWater(); return; }
    if (label.startsWith('Cook (')) { Game.cookAll(); return; }
    if (label === 'Step outside') { Game.exitBuilding(); return; }
    if (label === 'Go inside') { Game.enterBuilding(); return; }
    if (label === 'Rest') { Game.doAction('rest'); return; }
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

  // contextBarHTML: scan your cell + 8 neighbors, surface what's usable.
  // quiet by design — small pill buttons, no takeover.
  function contextBarHTML() {
    const items = nearbyActionItems();
    if (!items.length) return '';
    return `<div class="contextbar"><span class="ctx-label">nearby:</span>` +
      items.map((it, i) => `<button class="ctx-btn" data-ctx="${i}">${esc(it.label)}</button>`).join('') +
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
        doContextAction(it.cx, it.cy, it.label);
        refresh();
      };
    });
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
            onPick: (t) => { Game.activateAbility(id, t.id); refresh(); } });
          return;
        }
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
    const name = CELL_NAME[cell] || cell;
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
        actions.push(['Give food', () => Game.giveFood(villagerId)]);
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
      desc = animal ? animal.description + '.' : 'An animal.';
      // knowledge level
      const enc = (Game.state.codex.animalEncounters || {})[ani.id] || 0;
      if (enc >= 3) desc += ` You know it: ${animal.name}.`;
      else if (enc > 0) desc += ' Looks familiar.';
      if (dist <= 1) actions.push(['Hunt', () => Game.huntAnimal()]);
      else { desc += ' (Too far to catch.)'; actions.push(walkCloser(cx, cy)); }
    } else if (villagerId) {
      // VILLAGER: people get sheets, not tile panels. Open the person sheet directly.
      // (cellPopup was called for a distant villager tap — walkCloser handles approach.)
      const vp = Game.data.villagers.find(v => v.id === villagerId) || Game.data.background_survivors.find(v => v.id === villagerId);
      const name = Game.displayName(villagerId);
      if (dist <= 2) {
        const info = document.getElementById('inlineslot');
        if (info) info.innerHTML = ''; // people get sheets, not panels
        personSheet(villagerId);
        return;
      } else {
        desc = `${name.split(' ')[0]} is over there. (Too far to talk.)`;
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
          // TERRAFORMING: fell it. costs a day-part + 80 kcal, yields wood.
          actions.push(['🪓 Cut down', () => { Game.cutTree(cx, cy); refresh(); }]);
        } else if (cell === 'water') {
          if (!sec || !sec.known) actions.push(['Examine', () => Game.cellInteract(cx, cy)]);
          else if (sec.safe) actions.push(['Drink', () => Game.cellInteract(cx, cy)]);
        } else if (cell === 'tent') {
          if (!sec || !sec.known) actions.push(['Examine', () => Game.cellInteract(cx, cy)]);
          else if (sec.condition === 'good') actions.push(['Rest', () => Game.cellInteract(cx, cy)]);
          else if (sec.condition === 'packable') actions.push(['Pack up', () => Game.cellInteract(cx, cy)]);
        } else if (cell === 'water') {
          actions.push(['Drink', () => { Game.drinkWater(); refresh(); }]);
          actions.push(['Fill water (1L)', () => { Game.fillWater(); refresh(); }]);
        } else if (cell === 'fire') {
          actions.push(['Warm hands', () => Game.cellInteract(cx, cy)]);
          // Cook raw food here. (Your Codex tells you what needs cooking.)
          const raw = Game.state.scholar.inventory.filter(i => i.rawKcal);
          if (raw.length) actions.push([`Cook ${raw.length} raw`, () => Game.cookAll()]);
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
      } else {
        // passable
        if (dist <= 1 && !isMe) {
          actions.push(['Step here', () => Game.microMove(cx, cy)]);
        } else if (!isMe) {
          // Farther walkable cell: offer the walk (costs kcal, not free).
          // Pathfind first — if no path, say so instead of offering.
          const path = Game.findPath(px, py, cx, cy);
          if (path && path.length) {
            const cost = path.length * 10;
            actions.push([`Walk here (${cost} kcal)`, () => Game.movePath(cx, cy)]);
          } else {
            desc += ' (No path there.)';
          }
        }
        if (cell === 'plant' || cell === 'bush') actions.push(['Forage', () => Game.cellInteract(cx, cy)]);
        // TERRAFORMING: clear brush for brushwood. costs a day-part + 40 kcal.
        if (cell === 'bush') actions.push(['🧹 Clear brush', () => { Game.clearBrush(cx, cy); refresh(); }]);
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
          actions.push(['😴 Rest', () => { Game.doAction('rest'); refresh(); }]);
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

  // refreshTilePanel: re-render the inline panel after an action (stays in context)
  function refreshTilePanel() {
    const info = document.getElementById('inlineslot');
    if (!info || info.dataset.cx === undefined || !info.innerHTML) return;
    cellPopup(+info.dataset.cx, +info.dataset.cy);
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
    return `<div class="targetbar"><span>\U0001F3AF ${esc(targeting.prompt)} — tap a highlighted target</span>` +
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
  const CombatAudio = (() => {
    let ctx = null, hbTimer = null;
    function ensure() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return !!ctx;
    }
    function thump(when, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 55;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
      o.connect(g); g.connect(ctx.destination);
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
        o.connect(g); g.connect(ctx.destination);
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
        o.connect(g); g.connect(ctx.destination);
        o.start(st); o.stop(st + 0.5);
      });
    }
    return {
      combatStart() { heartbeat(72); },
      telegraph(d) {
        // urgency = turnsLeft. 2+ = slow dread (80bpm), 1 = frantic (145bpm).
        heartbeat((d && d.urgency >= 2) ? 80 : 145);
      },
      impact() { boom(); },
      victory() { sting('victory'); },
      defeat() { sting('defeat'); },
      combatEnd() { stopHeartbeat(); },
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
      prompt: '\U0001F4AC Talk to whom?',
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
    if (!inlineView || (st && st.inCombat)) { slot.innerHTML = ''; return; }
    if (inlineView.kind === 'person') renderPersonInline(slot, inlineView);
    else if (inlineView.kind === 'assign') renderAssignInline(slot, inlineView);
    else if (inlineView.kind === 'remote') renderRemoteInline(slot, inlineView);
    else if (inlineView.kind === 'askabout') renderAskAboutInline(slot, inlineView);
    else if (inlineView.kind === 'pantry') renderPantryInline(slot, inlineView);
    else if (inlineView.kind === 'inv') renderInvInline(slot, inlineView);
    else slot.innerHTML = '';
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
    const titleName = known ? vp.name.split(' ')[0] : Game.personDescriptor(villagerId);
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
          return bits.length ? `<p class="small" style="opacity:.7">💭 ${esc(bits.join('. '))}.</p>` : ''; })()}`;
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
    // CONVERSATION: the dialogue surface. Transcript of the exchange so far
    // plus the player's response choices — never just "continue".
    const convo = Game.convoUI ? Game.convoUI(villagerId) : { active: false, transcript: [], choices: [] };
    // TRANSCRIPT: reads like dialogue, not a log. Speaker name always shown
    // (descriptor pre-System, real name once earned). Narration (non-quoted)
    // is italic and dimmed so speech stands out.
    const convoTranscript = (convo.transcript || []).slice(-6).map(e => {
      const isSpeech = /^\s*"/.test(e.text);
      const cls = e.who === 'you' ? 'tline you' : 'tline them';
      const who = e.who === 'you' ? 'You' : titleName;
      return `<p class="${cls}"><b>${esc(who)}:</b> <span class="${isSpeech ? 'sp' : 'narr'}">${esc(e.text)}</span></p>`;
    }).join('');
    const convoChoices = (convo.choices || []).map(cn =>
      `<button class="btn sm${cn.id === 'leave' ? ' ghost' : ''}" data-act="c:${esc(cn.id)}">${esc(cn.label)}</button>`).join(' ');
    const convoHtml = convoTranscript
      ? `<div class="convo" style="border-top:1px solid #ffffff22;margin-top:10px;padding-top:4px">${convoTranscript}${convoChoices ? `<div class="inline-btns" style="margin-top:8px">${convoChoices}</div>` : ''}</div>`
      : '';
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
    // === PARTY ===
    // Formal parties are a System unlock. Pre-System, followers are informal.
    try { btns += Game.partyButtonHtml(villagerId); } catch (e) {}
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

  // personAct: every action confirms visibly. The result line ("✓ ...") plus
  // updated numbers — no wondering whether the tap worked.
  function personAct(view, act) {
    const vid = view.vid;
    const vp = (Game.data.villagers || []).find(v => v.id === vid) ||
               (Game.data.background_survivors || []).find(v => v.id === vid) || {};
    const dname = Game.displayName(vid);
    if (act === 'talk') { const st = Game.startConvo(vid); view.line = st ? st.line : null; view.result = null; view.nvMode = null; }
    else if (act.indexOf('c:') === 0) { const st = Game.convoTurn(vid, act.slice(2)); if (st) view.line = st.line; view.result = null; }
    else if (act === 'give') {
      const gave = Game.giveFood(vid);
      view.result = gave ? 'You gave them food.' : 'You have no food to give.';
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
      const r = Game.comfort(vid);
      view.result = r ? 'You sat with them.' : null;
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
    else if (act === 'dismissParty') {
      const r = Game.dismissFromParty(vid);
      view.result = r ? r.msg : null;
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
    const topics = [
      ['goal', '\u0001F3AF "What do you want?"', goalKnown ? ' (you know: ' + (Game.goalWant(villagerId) || '?') + ')' : ''],
      ['gossip', '\U0001F442 "Heard anything?"', ''],
      ['village', '\U0001F3D5\uFE0F "How\u2019s everyone?"', ''],
    ];
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
        const labels = { goal: 'what they want', gossip: 'what they\u2019ve heard', village: 'how everyone\u2019s doing' };
        view.result = r ? `You asked about ${labels[b.dataset.topic] || 'it'}.` : null;
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
    // METHOD: how you ask matters. Just ask (default), sweeten with food
    // (costs 1 edible unit, +30 effective trust), or appeal to what they want
    // (requires knowing their goal). Contextual — not always available.
    const method = view.method || 'ask';
    const hasFood = (() => { try {
      const day = Game.state.scholar.day;
      return !!(Game.state.scholar.inventory || []).find(i =>
        (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && !i.bonded &&
        !(i.spoilDay !== undefined && i.spoilDay <= day));
    } catch (e) { return false; } })();
    const goalKnown = (() => { try { return Game.goalKnown(villagerId); } catch (e) { return false; } })();
    const goalWant = (() => { try { return Game.goalWant(villagerId); } catch (e) { return null; } })();
    let methodBtns = `<button class="btn sm${method === 'ask' ? '' : ' ghost'}" data-method="ask">💬 Just ask</button>`;
    methodBtns += ` <button class="btn sm${method === 'deal' ? '' : ' ghost'}" data-method="deal"${hasFood ? '' : ' disabled title="No food to offer"'}>🤝 Offer food${hasFood ? '' : ' (none)'}</button>`;
    methodBtns += ` <button class="btn sm${method === 'appeal' ? '' : ' ghost'}" data-method="appeal"${goalKnown ? '' : ' disabled title="Learn what they want first (Ask about…)"'}>🎯 Appeal${goalKnown && goalWant ? ` (${esc(goalWant)})` : ''}</button>`;
    const btns = `<div class="inline-btns" style="margin-bottom:6px">${methodBtns}</div>` +
      Object.entries(tasks).map(([tid, t]) => {
      const comp = Game.villagerCompetence(villagerId, tid);
      const compTag = tid === 'rest' ? '' : comp >= 1.3 ? ' ⭐ natural' : comp <= 0.8 ? ' ⚠ not their strength' : '';
      const isCurrent = current && current.task === tid;
      const ask = askPhrases[tid] || t.name;
      return `<button class="btn sm${isCurrent ? '' : ' ghost'}" data-task="${tid}">${t.icon} "${esc(ask)}"${compTag}${isCurrent ? ' ✓' : ''}</button>`;
    }).join('') + ` <button class="btn sm ghost" data-act="back">\u2190 Back</button>`;

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
    slot.querySelectorAll('[data-method]').forEach(b => {
      b.onclick = () => {
        inlineView = { kind: 'assign', vid: villagerId, line: view.line, result: view.result, via, method: b.dataset.method, mapKey: inlineMapKey() };
        refresh();
      };
    });
    slot.querySelectorAll('[data-task]').forEach(b => {
      b.onclick = () => {
        const tid = b.dataset.task;
        const m = view.method || 'ask';
        let resultMsg;
        if (m === 'deal') {
          const r = Game.offerDeal(villagerId, tid);
          resultMsg = r && r.ok ? `"${askPhrases[tid] || tasks[tid].name}" — sealed with food.` :
            (r && r.refused ? `They took the food. Still no.` : `No deal.`);
        } else if (m === 'appeal') {
          const r = Game.appealToGoal(villagerId, tid);
          resultMsg = r && r.ok ? `"${askPhrases[tid] || tasks[tid].name}" — for what they want.` :
            `The appeal didn't land.`;
        } else {
          Game.assignTask(villagerId, tid, { via });
          const ask = askPhrases[tid] || tasks[tid].name;
          resultMsg = `"${ask}" — they'll report back.`;
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
  function systemArrivalAnimation(callback) {
    const overlay = document.createElement('div');
    overlay.className = 'system-arrival-overlay';
    overlay.innerHTML = `
      <div class="system-crack"></div>
      <div class="system-text">🌟 THE SKY SPLITS OPEN 🌟</div>
      <div class="system-window">
        <div class="system-text system-typewriter">"HELLO! Welcome! We're SO glad you're all still here! What a week! The audience LOVED the foraging episode!"</div>
      </div>
      <div class="system-window" style="animation-delay: 1s">
        <div class="system-text">"Okay! So! Here's what's happening! You're on a show! Survive! Be interesting!"</div>
      </div>
      <div class="system-window" style="animation-delay: 2s">
        <div class="system-text">"We've been CALIBRATING all week! And YOU — every berry picked, every fire lit — that's your signature! You signed up by DOING THINGS!"</div>
      </div>
      <div class="system-window" style="animation-delay: 3s">
        <div class="system-text">"The ones who just sat there? Removed! Boring! But YOU have FANS now! They're betting on your UNDERSTANDING!"</div>
      </div>
      <div class="system-window" style="animation-delay: 4s">
        <div class="system-text">"Oh! And we noticed some of you are... hungry? We'll look into that! Probably! Anyway!"</div>
      </div>
      <div class="system-window" style="animation-delay: 5s">
        <div class="system-text">Your journal shimmers. It becomes... interface.</div>
      </div>
      <div class="system-window" style="animation-delay: 6s">
        <div class="system-text">"OH! Wait! We almost forgot! You were writing things down! We made it better! It talks now!"</div>
      </div>
      <button class="btn" id="b-arrival-ok" style="margin-top: 20px; z-index: 1001;">...what?</button>
    `;
    document.body.appendChild(overlay);
    document.getElementById('b-arrival-ok').onclick = () => {
      overlay.remove();
      if (callback) callback();
    };
    // Auto-dismiss after 10s (in case they don't click).
    setTimeout(() => { if (overlay.parentNode) { overlay.remove(); if (callback) callback(); } }, 14000);
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
          (o.systemCommentary ? '<br><i class="small">"' + esc(o.systemCommentary) + '"</i>' : ''),
        primary: true,
        onClick: () => { Game.chooseRelicEnhancement(o.id); refresh(); },
      })),
      priority: 80, modal: true, dismissible: false,
    });
  }

  // abilitySheet: the System offers you a choice. Pick one.
  // Modal sheet - you must choose. No dismissing the System.
  function abilitySheet() {
    const choices = Game.state.scholar.abilityChoices;
    if (!choices || !choices.length) return;
    openSheet({
      id: 'offer-ability',
      title: '\U0001F31F The System Offers a Gift',
      html:
        '<p>"We watched your first week! You\u2019re good at... let us see..."</p>' +
        '<p>Choose one ability:</p>',
      buttons: choices.map(c => ({
        label: '<b>' + esc(c.name) + '</b><br><span class="small">' + esc(c.description || c.desc) + '</span>' +
          (c.flavor ? '<br><i class="small">"' + esc(c.flavor) + '"</i>' : '') +
          (c.metabolic && c.metabolic.daily ? '<br><span class="small">\U0001F525 Costs ' + c.metabolic.daily + ' kcal/day to keep. Power is a trade.</span>' : ''),
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
        ${(() => { const ab = Game.state.scholar.abilities || []; if (!ab.length) return ''; return `<p class="small"><b>System:</b> ${ab.map(a => `${a.name} L${a.level}`).join(', ')} (${ab.length}/${Game.abilitySlots()} slots)</p>`; })()}
        ${(() => { const sy = Game.state.scholar.activeSynergies || []; if (!sy.length) return ''; const names = sy.map(id => { const d = (Game.data.synergies || []).find(x => x.id === id); return d ? d.name : id; }); return `<p class="small"><b>\u2726 Resonances:</b> ${names.join(' \u00B7 ')}</p>`; })()}
        ${(() => { const w = Game.state.scholar.water || []; if (!w.length) return ''; const clean = w.filter(b => b.quality === 'clean').length; const risky = w.filter(b => b.quality === 'risky').length; return `<p class="small"><b>\uD83D\uDCA7 Water:</b> ${clean}L clean${risky ? `, ${risky}L risky` : ''} (${w.length}kg)</p>`; })()}
        ${inv.length ? inv.map((i, idx) => `<p class="small">${i.bonded ? '\u2756 ' : ''}<b>${Game.itemDisplayName(i)}</b> x${i.units} (${(i.kcalEach || 0) * i.units} kcal)${i.bonded ? ` <span class="small" title="Bonded relic \u2014 grown, not found">bond ${i.bond || 0}${(i.enhancements || []).length ? ' \u00B7 ' + i.enhancements.join(', ') : ''}</span>` : ''}${i.spoilDay <= st.day ? ' \u26A0 spoiled' : ''}${i.bookId ? ` <button class="btn ghost sm" data-read="${i.bookId}">Read</button>` : ''}${Game.isUsable(i) && !i.bonded ? ` <button class="btn ghost sm" data-use="${idx}">Use</button>` : ''}${i.rawKcal && Game.nearFire() ? ` <button class="btn ghost sm" data-cook="${idx}">Cook</button>` : ''}${Game.isWeapon(i) ? ` <button class="btn ghost sm" data-equip-w="${idx}">Equip</button>` : ''}${Game.isArmor(i) ? ` <button class="btn ghost sm" data-equip-a="${idx}">Wear</button>` : ''}${(i.kcalEach || 0) > 0 && !i.bonded ? ` <button class="btn ghost sm" data-donate="${idx}">Donate</button>` : ''}</p>`).join('') : '<p class="small">Empty. The world provides.</p>'}
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
    slot.querySelectorAll('[data-cook]').forEach(b => b.onclick = rewire(() => Game.cookFood(+b.dataset.cook), 'Cooked.'));
    slot.querySelectorAll('[data-equip-w]').forEach(b => b.onclick = rewire(() => Game.equip(+b.dataset.equipW, 'weapon'), 'Equipped.'));
    slot.querySelectorAll('[data-equip-a]').forEach(b => b.onclick = rewire(() => Game.equip(+b.dataset.equipA, 'armor'), 'Worn.'));
    slot.querySelectorAll('[data-donate]').forEach(b => b.onclick = rewire(() => Game.donateToPantry(+b.dataset.donate), 'Donated to the pantry.'));
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

  function expeditionScreen() {
    const st = Game.status();
    if (st.over) return ending();
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
      ${bar('scattering://field', `${dialHTML(st)}<span>day ${st.day} · ${st.dayPart}<br><span style="font-size:11px;opacity:.7">${esc(st.dayPartHint)}</span></span>${Game.partyHud()}`)}
      ${dayTickBar(st)}
      <div class="game-cols">
        <div class="game-col-main">
          <p class="small ord-epithet">👁 ${esc(Game.nodeDetail().epithet)} — this ground, up close</p>
          <div class="detail ord-grid">${renderDetail(st)}</div>
          <div id="inlineslot" class="ord-inline"></div>
          <div class="ord-ctx">${contextBarHTML()}</div>
          <div class="ord-target">${targetBarHTML()}</div>
          <div class="ord-danger">${dangerBarHTML()}</div>
          <div class="ord-ability">${abilityBarHTML()}</div>
          ${isTutorialDone() ? '' : '<p class="small ord-taphint" id="taphint">👆 tap a tile to walk there · 🗺 walk to the edge, tap yourself, head out <button class="linklike" id="taphint-x" style="font-size:12px">got it</button></p>'}
          <div class="map minimap ord-minimap">${renderMap(st, tset)}</div>
        </div>
        <div class="game-col-side">
          <div class="ord-status">${statusBars(st)}</div>
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
            let moved = false;
            if (best) moved = Game.movePath(best[0], best[1]);
            else moved = Game.movePath(cx, cy); // surrounded — walk through as before
            expeditionScreen();
            if (moved) personSheet(villagerThere);
            else cellPopup(cx, cy); // couldn't move — popup explains why
            return;
          }
          // adjacent: a second tap on the same person (without moving away)
          // is an explicit step onto their tile.
          if (lastPersonTap && lastPersonTap.vid === villagerThere &&
              lastPersonTap.px === px && lastPersonTap.py === py) {
            lastPersonTap = null;
            if (Game.microMove(cx, cy)) { expeditionScreen(); personSheet(villagerThere); return; }
          }
          lastPersonTap = { vid: villagerThere, px, py };
          expeditionScreen();
          personSheet(villagerThere);
          return;
        }
        // walkable? GO. adjacent = step, distant = path. no confirmation, no popup.
        if (!Game.cellProps(cell).blocks) {
          const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
          let moved = false;
          if (dist <= 1) moved = Game.microMove(cx, cy);
          else moved = Game.movePath(cx, cy);
          if (moved) {
            // walked up to someone? their sheet opens — people get sheets, not panels.
            // (re-render first so the grid shows your new position.)
            expeditionScreen();
            if (villagerThere) personSheet(villagerThere);
            return;
          }
          // couldn't move (no path / not enough kcal) — popup explains why.
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
    const taphintX = document.getElementById('taphint-x');
    if (taphintX) taphintX.onclick = dismissTutorial;
    const pantryBtn = document.getElementById('x-pantry');
    if (pantryBtn) pantryBtn.onclick = () => pantrySheet();
    wirePanel(st, n);
    wireContextBar();
    wireAbilityBar();
    wireTargetBar();
    // THE SYSTEM INTEGRATING INTO YOUR PERCEPTION: post-day-7, the interface
    // gains System styling — glowing borders, overlay accents. You FEEL it.
    try { document.body.classList.toggle('system-live', !!Game.state.systemArrived); } catch (e) {}
    // Inline interaction slot: person panels, assignment, pantry — no overlays.
    renderInlineSlot(st);
    // Pending offers (ability/relic choices) queue as sheets — no screen takeover.
    processPendingSheets();
  }

  // processPendingSheets: ability/relic offers become queued sheets.
  // Deduped by id so re-renders don't double-queue.
  function processPendingSheets() {
    const s = Game.state.scholar;
    if (!s) return;
    if (s.abilityChoices && s.abilityChoices.length && !sheetQueued('offer-ability')) {
      abilitySheet();
    }
    if (s.relicChoices && !sheetQueued('offer-relic')) {
      relicSheet();
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
    if (st.inCombat) return panelCombat(st);
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
    const bodyHtml = `
      <p class="small">Slide to pack. Carrying ${carry.toFixed(1)}/${maxCarry} kg.</p>
      ${waterRow}
      <div id="packlist">
      ${pantry.length ? pantry.map((p, idx) => {
        const density = p.kg ? Math.round(p.kcalEach / p.kg) : 0;
        const unit = p.unit || 'item';
        return `<div class="card" style="margin:6px 0;padding:8px 10px">
          <p class="small"><b>${p.name}</b> \u00D7${p.units} ${unit}s
          ${p.safe ? '' : ' \u26A0 UNSAFE'}${p.spoilDay <= st.day ? ' \u26A0 SPOILED' : ''}${p.needsCooking ? ' \uD83C\uDF73 needs cooking' : ''}<br>
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


  // SLEEP: "sleep until morning" with the cost/benefit on the button.
  // Quality depends on where you are: bunk > tent > hall floor > cold ground.
  function sleepBtnHTML() {
    let prev = null;
    try { prev = Game.sleepPreview(); } catch (e) {}
    const hint = prev ? `${prev.name} · +${prev.heal} health · energy restored · hunger ticks slower` : 'Sleep until morning';
    return `<button class="btn sm" id="x-sleep">😴 Sleep until morning</button>`
      + `<p class="small" style="opacity:.6">${esc(hint)}${prev && prev.note ? `<br>${esc(prev.note)}` : ''}</p>`;
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
      ${sleepBtnHTML()}
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
    // Actions come from tapping squares (cell popup). No redundant buttons.
    // Global: Eat, Wait, Inventory. Everything else is in the world.
    return `
      <div class="card"><h3>${esc(n.epithet).toUpperCase()}</h3>
      <p class="small">${esc(n.title)}</p>
      <p class="small" style="opacity:.7">Tap a square to see what you can do there.</p>
      <div class="actions">
        <button class="btn sm ghost" id="p-eat">Eat</button>
        <button class="btn sm ghost" id="p-wait">Wait</button>
        <button class="btn sm ghost" id="p-inv">Pack (${st.invCount})</button>
      </div>
      ${sleepBtnHTML()}</div>`;
  }

  function panelCombat(st) {
    const tf = Game.tbfight;
    if (!tf) return '';
    const cur = Game.tbCurrent();
    const p = Game.tbFighter('p');
    const orderHtml = tf.order.map(k => {
      const f = Game.tbFighter(k);
      if (!f) return '';
      const label = f.kind === 'player' ? 'You' : `${f.emoji} ${esc(f.name)}`;
      const dead = !f.alive ? ' ☠' : f.fled ? ' 🏃' : '';
      const active = cur && cur.key === k;
      return active ? `<b style="color:#4df3ff">${label}${dead}</b>` : `<span style="opacity:.6">${label}${dead}</span>`;
    }).join(' → ');
    const mons = tf.fighters.filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive && !x.fled);
    const monRows = mons.map(m => {
      const pct = Math.max(0, Math.round(m.hp / m.maxHp * 100));
      return `<p class="small">${m.emoji} <b>${esc(m.name)}</b> — ${Math.max(0, Math.round(m.hp))}/${m.maxHp} HP ${m.telegraph ? '⚠ winding up…' : ''}</p>`;
    }).join('');
    const adj = p ? mons.filter(m => Math.max(Math.abs(m.mx - p.mx), Math.abs(m.my - p.my)) <= (Game.equippedWeapon ? Game.equippedWeapon().range : 1)) : [];
    const wrange = Game.equippedWeapon ? Game.equippedWeapon().range : 1;
    const wname = Game.equippedWeapon ? Game.equippedWeapon().name : '';
    const canScream = Game.hasAbility('scream_cheese') && Game.state.scholar.screamDay !== Game.state.scholar.day;
    const yourTurn = Game.tbIsPlayerTurn();
    return `
      <div class="card warn"><h3>⚔ COMBAT — round ${tf.round}</h3>
      <p class="small" style="opacity:.8">${orderHtml}</p>
      ${monRows}
      ${yourTurn && p ? `<p class="small">Your turn — <b>${p.moveLeft}</b> move left${p.acted ? ' · acted' : ''}. Tap a tile to move.</p>
      <div class="actions">
        <button class="btn sm" id="c-strike" title="${esc(wname)} — range ${wrange}" ${(!adj.length || p.acted) ? 'disabled' : ''}>⚔ STRIKE${wrange > 1 ? ` (${wrange})` : ''}${adj.length > 1 ? '…' : ''}</button>
        <button class="btn sm" id="c-study" ${p.acted ? 'disabled' : ''}>👁 STUDY</button>
        ${canScream ? `<button class="btn sm" id="c-scream" ${p.acted ? 'disabled' : ''}>🧀 SCREAM</button>` : ''}
      </div>
      <div class="actions">
        <button class="btn sm ghost" id="c-flee" ${p.acted ? 'disabled' : ''}>🏃 FLEE</button>
        <button class="btn sm ghost" id="c-endturn">⏭ END TURN</button>
      </div>` : `<p class="small">${cur ? esc(cur.kind === 'player' ? 'You' : cur.name) + ' is acting…' : ''}</p>`}
      </div>`;
  }

  function wireCombatPanel() {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on('c-endturn', () => { Game.tbPlayerEndTurn(); rerender(); });
    on('c-study', () => { Game.tbPlayerStudy(); rerender(); });
    on('c-scream', () => { Game.tbPlayerScream(); rerender(); });
    on('c-flee', () => { Game.tbPlayerFlee(); rerender(); });
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
    const go = (kind) => { Game.doAction(kind); rerender(); };
    on('p-wait', () => go('wait'));
    on('x-sleep', () => { Game.sleep(); rerender(); });
    on('p-eat', () => { Game.eat(); rerender(); });
    on('p-inv', () => invSheet());
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
    const known = tile.knownPlant;
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
        const ANIMAL_GLYPH = { cottontail_rabbit: '🐇', gray_squirrel: '🐿️', white_tailed_deer: '🦌', creek_chub: '🐟', wild_turkey: '🦃' };
        // CELL FIRST, entities overlay. (Bug was: entity glyphs got overwritten
        // by the cell chain below, making villagers invisible on grass/dirt.)
        let entityHere = false;
        if (isMe) {
          // DIRECTIONAL MARKER: you are a pulsing ring with a facing wedge.
          // Facing comes from your last step — the marker shows where you're headed.
          const f = Game.state.scholar.facing || { x: 0, y: 1 };
          const ang = Math.round(Math.atan2(f.x, -f.y) * 180 / Math.PI);
          g = `<span class="pmark"><span class="ptoken">🧑</span><span class="pdir" style="transform:rotate(${ang}deg)">▲</span></span>`;
          cls += ' me';
          entityHere = true;
        }
        // CELL GLYPH: what the ground itself looks like. Entities overlay after.
        if (cell === 'plant') {
          g = known && PLANT_GLYPH[known] ? PLANT_GLYPH[known] : '🌱';
          cls += ' plantcell';
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
            for (const mf of tbf.fighters) {
              if (mf.kind !== 'monster' && mf.kind !== 'hostile') continue;
              if (!mf.alive || mf.fled || mf.mx !== cx || mf.my !== cy) continue;
              g = esc(mf.emoji || '👹'); cls += ' monster';
              drawn = true; break;
            }
          }
          if (!drawn && mon && cx === mon.mx && cy === mon.my) {
            const mdef = (Game.data.monsters || []).find(m => m.id === mon.id) || {};
            g = esc(mdef.emoji || '👹'); cls += ' monster'; drawn = true;
          }
          if (!drawn && ani && cx === ani.mx && cy === ani.my) { g = ANIMAL_GLYPH[ani.id] || '🐾'; cls += ' animal'; drawn = true; }
          if (!drawn) {
            // villagers: 🧍 with a TINY name label underneath.
            // (names were rendering at full size and swallowing the grid.)
            for (const [rid, pos] of Object.entries(vpos)) {
              if (pos.mx === cx && pos.my === cy) {
                const vp = Game.data.villagers.find(v => v.id === rid) || Game.data.background_survivors.find(v => v.id === rid);
                const showName = Game.state.systemArrived || Game.nameKnown(rid);
                const fname = showName ? (vp ? vp.name.split(' ')[0] : '?').slice(0, 7) : '';
                g = `<span class="vtoken">🧍</span>` + (fname ? `<span class="vname">${esc(fname)}</span>` : '');
                cls += ' villager';
                break;
              }
            }
          }
        }
        html += `<div class="${cls}${targetingCells().has(cx + ',' + cy) ? ' targetable' : ''}" data-cx="${cx}" data-cy="${cy}">${g}</div>`;
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
        <p class="small"><i>${e.knowledge || ''}</i></p><p>${e.level >= 1 ? e.text : ''}</p></div>`).join('')
        : '<div class="card"><h3>No entries yet.</h3><p>Forage something. Survive it. Write it down.</p></div>'}
      ${skills.length ? '<h1 class="title" style="font-size:18px">SKILLS</h1><p class="small"><i>knowledge about anything — not just plants. your old life, books, strangers, hard lessons.</i></p>' + skills.map(s => `
        <div class="card codex"><h3>${esc(s.name)} <span class="small" style="opacity:.7">[L${s.level} · ${esc(s.domain)}]</span></h3>
        <p class="small"><i>${esc(s.text)}</i></p>${s.via ? `<p class="small" style="opacity:.5">via ${esc(s.via)}</p>` : ''}</div>`).join('') : ''}
      ${peopleSection()}
      ${techniques.length ? '<h1 class="title" style="font-size:18px">TECHNIQUES</h1><p class="small"><i>where knowledge meets power.</i></p>' + techniques.map(t => `
        <div class="card codex"><h3>⚡ ${esc(t.name)}</h3><p class="small">${esc(t.effect)}</p></div>`).join('') : ''}
      ${inprog.length ? '<h1 class="title" style="font-size:18px">UNIDENTIFIED</h1><p class="small"><i>seen, not named. keep looking.</i></p>' + inprog.map(u => `
        <div class="card"><h3 style="opacity:.75">${u.descriptor}</h3>
        <p class="small">encounters: ${u.enc}/${u.threshold} ${u.enc >= u.threshold - 1 ? '— <b>almost there</b>' : ''}</p></div>`).join('') : ''}
      ${Object.keys(mons).length ? '<h1 class="title" style="font-size:18px">BEASTS</h1>' + Object.entries(mons).map(([id, m]) => {
        const md = Game.data.monsters.find(x => x.id === id);
        return `<div class="card codex"><h3>${md.name}</h3><p class="small">System files it as: ${md.systemDesignation || '—'}</p><p>${esc(md.codexStages[m.stage] || '')}</p></div>`;
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
    el.innerHTML = `<b>🐞 DEBUG</b> <button id="dbg-x" style="float:right">✕</button>
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
      Game.map.px = Game.state.village.x ?? 3;
      Game.map.py = Game.state.village.y ?? 3;
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
