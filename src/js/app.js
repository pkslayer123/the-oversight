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
      <p class="small" id="build-tag" style="opacity:.45;margin-top:14px;cursor:pointer" title="tap to check for updates">build ${esc(window.BUILD_VERSION || 'dev')}</p>`;
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
    // WHERE ARE YOU FROM? Free text, typed by the player. Stored raw —
    // someday characters trek home, and we'll need to know the way.
    // It also decides what you know: Arizona -> Georgia creek means almost nothing is familiar.
    screen.innerHTML = `${bar('scattering://home', '?')}
      <h1 class="title" style="font-size:22px">WHERE ARE YOU FROM?</h1>
      <p class="small">Type it. A town, a state, a country — anything. What you know grows where you're from. It doesn't grow here.</p>
      <input id="ob-origin" type="text" maxlength="60" placeholder="e.g. Tucson, Arizona" autocomplete="off"
        style="width:100%;padding:12px;margin:12px 0;background:#0a0f0a;color:#c9d4c0;border:1px solid #3a4a3a;font-size:16px">
      <p class="small" style="opacity:.6">This is stored with your character. It matters.</p>
      <button class="btn" id="b-home-go">This is where I'm from</button>`;
    const input = document.getElementById('ob-origin');
    input.focus();
    const go = () => { ob.home = input.value.trim() || 'somewhere unremembered'; obWho(); };
    document.getElementById('b-home-go').onclick = go;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }
  function obWho() {
    // 6 fresh randomized characters per expedition. Real people, not stat blocks.
    const vs = Game.genRoster();
    screen.innerHTML = `${bar('scattering://wake', 'clearing')}
      <h1 class="title" style="font-size:22px">WHICH ONE IS YOU?</h1>
      <p class="small">A clearing. Confused people waking up. One of them is you.</p>
      ${vs.map(v => `
        <div class="card"><h3>${v.name}</h3>
        <p>${v.formerOccupation} · from ${v.homeRegion}</p>
        <p class="small">${v.backstory}</p>
        <p class="small" style="opacity:.7">${v.personality.temperament}, ${v.personality.sharing} · ${v.systemAssessment}</p>
        <button class="btn" data-v="${v.id}">I am ${v.name.split(' ')[0]}</button></div>`).join('')}`;
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
    const info = document.getElementById('tileinfo');
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
    if (Game.state.scholar && (Game.state.scholar.inCombat || Game.fight)) return items;
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
        const vname = vp ? vp.name.split(' ')[0] : 'Someone';
        desc += ` ${vname} is here with you.`;
        actions.push(['💬 Talk to ' + vname, () => Game.talkTo(villagerId)]);
        actions.push(['Give food', () => Game.giveFood(villagerId)]);
      }
    } else if (isMon) {
      desc = 'Something big. It sees you.';
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
      const name = vp ? vp.name : villagerId;
      if (dist <= 2) {
        const info = document.getElementById('tileinfo');
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
    const info = document.getElementById('tileinfo');
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
    try { info.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  // refresh: full expedition screen re-render after an action.
  function refresh() { expeditionScreen(); }

  // refreshTilePanel: re-render the inline panel after an action (stays in context)
  function refreshTilePanel() {
    const info = document.getElementById('tileinfo');
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
  // TELEGRAPH their attacks: cells about to be hit glow red. You see it charging,
  // you have a moment to MOVE. Position matters. Cover matters.
  // This is the UI hook — the combat engine calls showTelegraph() with the
  // danger cells, and clearTelegraph() when the attack resolves.
  let dangerCells = new Set();
  let dangerLabel = '';

  function showTelegraph(cells, label) {
    // cells: [{cx, cy}] about to be hit. label: what's coming ("beam charging…")
    dangerCells = new Set((cells || []).map(c => c.cx + ',' + c.cy));
    dangerLabel = label || 'DANGER — move!';
    // A telegraph overrides everything. Sheets close, targeting cancels.
    // The ONLY thing that matters is getting out of the red.
    exitTargeting(true);
    sheetQueue = sheetQueue.filter(s => s.modal && s.priority >= 80);
    renderSheets();
    refresh();
  }

  function clearTelegraph() {
    dangerCells = new Set();
    dangerLabel = '';
    refresh();
  }

  function dangerBarHTML() {
    if (!dangerCells.size) return '';
    return `<div class="dangerbar">\u26A0 ${esc(dangerLabel)}</div>`;
  }

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
        out.push({ id: rid, cx: p.mx, cy: p.my, label: vp ? vp.name.split(' ')[0] : rid });
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
  function personSheet(villagerId) {
    const vp = (Game.data.villagers || []).find(v => v.id === villagerId) ||
               (Game.data.background_survivors || []).find(v => v.id === villagerId);
    if (!vp) return;
    const name = vp.name;
    const first = name.split(' ')[0];
    const trust = (Game.state.village.trust && Game.state.village.trust[villagerId]) || 10;
    const health = (Game.state.village.health && Game.state.village.health[villagerId] !== undefined)
      ? Game.state.village.health[villagerId] : 100;
    const tone = trust < 30 ? 'Guarded.' : trust < 60 ? 'Warming up.' : 'Trusts you.';
    const hb = health >= 70 ? '\U0001F7E2' : health >= 40 ? '\U0001F7E1' : '\U0001F534';
    const lang = vp.langNote ? `<p class="small" style="opacity:.7">${esc(vp.langNote)}</p>` : '';
    const conf = vp.conflictNote ? `<p class="small" style="opacity:.7">${esc(vp.conflictNote)}</p>` : '';
    const youKnow = Object.keys(Game.state.codex.plants || {});
    const theyKnow = (Game.state.village.taught && Game.state.village.taught[villagerId]) || [];
    const teachable = youKnow.filter(pid => !theyKnow.includes(pid));
    const said = Game.talkTo(villagerId); // returns their line, logs it too

    const body = `
      <p class="small">${esc(vp.formerOccupation || '')}${vp.homeRegion ? ' · ' + esc(vp.homeRegion) : ''}</p>
      <p class="small">${hb} Health ${health}/100 · ${tone}</p>
      ${lang}${conf}
      <p style="font-size:16px;line-height:1.6;margin-top:10px">\u201C${esc(said)}\u201D</p>
      <p class="small" id="psaid-extra" style="opacity:.7"></p>`;

    const buttons = [
      { label: '\U0001F4AC Talk', primary: true, keepOpen: true, onClick: () => {
          const line = Game.talkTo(villagerId);
          const el = document.querySelector('#sheet-root .sheet-body p[style*="font-size:16px"]');
          if (el) el.innerHTML = '\u201C' + esc(line) + '\u201D';
          refresh();
        } },
      { label: '\U0001F381 Give food', keepOpen: true, onClick: () => { Game.giveFood(villagerId); refresh(); } },
    ];
    if (teachable.length) {
      buttons.push({ label: `\U0001F4D6 Teach (${teachable.length})`, keepOpen: true, onClick: () => {
        const pid = teachable[0];
        if (!Game.state.village.taught[villagerId]) Game.state.village.taught[villagerId] = [];
        Game.state.village.taught[villagerId].push(pid);
        const pname = (Game.data.plants.find(p => p.id === pid) || {}).name || pid;
        Game.say(`You teach ${first} about ${pname}.`);
        personSheet(villagerId); // re-render with updated teachable list
      } });
    }

    openSheet({
      id: 'person-' + villagerId,
      title: '\U0001F464 ' + esc(first),
      html: body,
      buttons,
      priority: 40, modal: false, dismissible: true,
    });
  }


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
  function invSheet() {
    const st = Game.status();
    const inv = st.inventory;
    const tools = Game.state.scholar.tools || [];
    const recipes = Game.data.recipes || [];
    const knownRecipes = recipes.filter(r => (Game.state.codex.recipes || {})[r.id] && Game.state.codex.recipes[r.id].level >= 3);
    const bodyHtml = `
        ${(() => { const eq = Game.state.scholar.equipped || {}; const parts = []; if (eq.weapon) parts.push(`\u2694\uFE0F ${eq.weapon.name}`); if (eq.armor) parts.push(`\U0001F6E1\uFE0F ${eq.armor.name}`); return parts.length ? `<p class="small"><b>Equipped:</b> ${parts.join(' \u00B7 ')}</p>` : ''; })()}
        ${(() => { const bg = Game.state.scholar.backgroundAbilities || []; if (!bg.length) return ''; return `<p class="small"><b>Background:</b> ${bg.map(a => `${a.name} L${a.level}`).join(', ')}</p>`; })()}
        ${(() => { const ab = Game.state.scholar.abilities || []; if (!ab.length) return ''; return `<p class="small"><b>System:</b> ${ab.map(a => `${a.name} L${a.level}`).join(', ')} (${ab.length}/${Game.abilitySlots()} slots)</p>`; })()}
        ${(() => { const sy = Game.state.scholar.activeSynergies || []; if (!sy.length) return ''; const names = sy.map(id => { const d = (Game.data.synergies || []).find(x => x.id === id); return d ? d.name : id; }); return `<p class="small"><b>\u2726 Resonances:</b> ${names.join(' \u00B7 ')}</p>`; })()}
        ${(() => { const w = Game.state.scholar.water || []; if (!w.length) return ''; const clean = w.filter(b => b.quality === 'clean').length; const risky = w.filter(b => b.quality === 'risky').length; return `<p class="small"><b>\U0001F4A7 Water:</b> ${clean}L clean${risky ? `, ${risky}L risky` : ''} (${w.length}kg)</p>`; })()}
        ${inv.length ? inv.map((i, idx) => `<p class="small">${i.bonded ? '\u2756 ' : ''}<b>${Game.itemDisplayName(i)}</b> x${i.units} (${(i.kcalEach || 0) * i.units} kcal)${i.bonded ? ` <span class="small" title="Bonded relic \u2014 grown, not found">bond ${i.bond || 0}${(i.enhancements || []).length ? ' \u00B7 ' + i.enhancements.join(', ') : ''}</span>` : ''}${i.spoilDay <= st.day ? ' \u26A0 spoiled' : ''}${i.bookId ? ` <button class="btn ghost sm" data-read="${i.bookId}">Read</button>` : ''}${Game.isUsable(i) && !i.bonded ? ` <button class="btn ghost sm" data-use="${idx}">Use</button>` : ''}${i.rawKcal && Game.nearFire() ? ` <button class="btn ghost sm" data-cook="${idx}">Cook</button>` : ''}${Game.isWeapon(i) ? ` <button class="btn ghost sm" data-equip-w="${idx}">Equip</button>` : ''}${Game.isArmor(i) ? ` <button class="btn ghost sm" data-equip-a="${idx}">Wear</button>` : ''}${(i.kcalEach || 0) > 0 && !i.bonded ? ` <button class="btn ghost sm" data-donate="${idx}">Donate</button>` : ''}</p>`).join('') : '<p class="small">Empty. The world provides.</p>'}
        ${(() => { const acts = Game.activatableAbilities ? Game.activatableAbilities() : []; if (!acts.length) return ''; return `<h3 style="margin-top:12px">\u26A1 Abilities</h3>` + acts.map(a => `<p class="small"><b>${a.name}</b> \u2014 ${a.desc} ${a.available ? `<button class="btn ghost sm" data-activate="${a.id}">Use</button>` : `<span class="small" style="opacity:.6">(${a.why || 'not now'})</span>`}</p>`).join(''); })()}
        ${tools.length ? `<h3 style="margin-top:12px">Tools</h3>${tools.map(t => `<p class="small"><b>${t.name}</b> (${t.uses} uses left) <button class="btn ghost sm" data-settrap="${t.recipeId}">Set</button></p>`).join('')}` : ''}
        ${knownRecipes.length ? `<h3 style="margin-top:12px">Craft</h3>${knownRecipes.map(r => `<p class="small"><b>${r.name}</b> \u2014 ${Object.entries(r.materials).map(([m, n]) => n + ' ' + m).join(', ')} <button class="btn ghost sm" data-craft="${r.id}">Make</button></p>`).join('')}` : ''}`;

    const wire = (sheetEl) => {
      const rewire = (fn) => (e) => { fn(e); invSheet(); refresh(); };
      sheetEl.querySelectorAll('[data-craft]').forEach(b => b.onclick = rewire(() => Game.craft(b.dataset.craft)));
      sheetEl.querySelectorAll('[data-settrap]').forEach(b => b.onclick = (e) => { Game.setTrap(b.dataset.settrap); closeSheet('inv'); refresh(); });
      sheetEl.querySelectorAll('[data-read]').forEach(b => b.onclick = rewire(() => Game.readBook(b.dataset.read)));
      sheetEl.querySelectorAll('[data-use]').forEach(b => b.onclick = rewire(() => Game.useItem(+b.dataset.use)));
      sheetEl.querySelectorAll('[data-cook]').forEach(b => b.onclick = rewire(() => Game.cookFood(+b.dataset.cook)));
      sheetEl.querySelectorAll('[data-equip-w]').forEach(b => b.onclick = rewire(() => Game.equip(+b.dataset.equipW, 'weapon')));
      sheetEl.querySelectorAll('[data-equip-a]').forEach(b => b.onclick = rewire(() => Game.equip(+b.dataset.equipA, 'armor')));
      sheetEl.querySelectorAll('[data-donate]').forEach(b => b.onclick = rewire(() => Game.donateToPantry(+b.dataset.donate)));
      sheetEl.querySelectorAll('[data-activate]').forEach(b => b.onclick = (e) => {
        Game.activateAbility(b.dataset.activate); invSheet(); refresh();
      });
    };

    openSheet({
      id: 'inv',
      title: '\U0001F392 Pack (' + st.invCount + ' items)',
      html: bodyHtml,
      buttons: [],
      priority: 20, modal: false, dismissible: true,
      onRender: wire,
    });
  }

  // ---------- the one screen ----------
  // map + here-panel, always together. no view switching: the panel adapts to
  // where you stand (haven / wild node / ruin / combat). travel = tap a tile.
  function expeditionScreen() {
    const st = Game.status();
    if (st.over) return ending();
    // COMBAT MODE: the action system gets out of the way. Dodge-first.
    // Non-modal sheets close instantly, targeting cancels. No dialogs blocking
    // movement, no "are you sure?" — when something is charging a laser beam
    // at you, the only UI that matters is WHERE YOU ARE and WHERE IT ISN'T.
    if (st.inCombat || Game.fight) {
      exitTargeting(true);
      if (sheetQueue.some(s => !s.modal)) {
        sheetQueue = sheetQueue.filter(s => s.modal);
        renderSheets();
      }
    }
    const targets = Game.travelTargets();
    const tset = new Set(targets.map(t => t.x + ',' + t.y));
    const n = Game.nodeDetail();

    screen.innerHTML = `
      ${bar('scattering://field', `day ${st.day} · ${st.dayPart}`)}
      <div id="announce" style="position:sticky;top:0;background:#1a1a1a;border-bottom:1px solid #444;padding:6px 8px;font-size:13px;z-index:100;">${esc(st.log[st.log.length - 1] || '')}</div>
      <p class="small">${st.dayPartHint}</p>
      ${statusBars(st)}
      <p class="small">👁 ${esc(Game.nodeDetail().epithet)} — this ground, up close</p>
      ${st.activeQuest ? `<p class="small" style="border-left:3px solid #7fd67f;padding-left:8px">📋 ${esc(st.activeQuest.text)}</p>` : ''}
      <div class="detail">${renderDetail(st)}</div>
      ${contextBarHTML()}
      ${targetBarHTML()}
      ${dangerBarHTML()}
      ${abilityBarHTML()}
      <div id="tileinfo"></div>
      <p class="small">👆 tap a tile to walk there · 🗺 walk to the edge, tap yourself, head out (1 part · 30 kcal/tile)</p>
      <div class="map minimap">${renderMap(st, tset)}</div>
      ${panelFor(st, n)}
      <div class="actions">
        <button class="btn sm ghost" id="x-codex">${Game.journalName()} (${st.codexCount})</button>
      </div>
      <div class="log">${st.log.slice(-6).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>
      <p class="small" style="opacity:.4;text-align:center;margin-top:14px"><a href="#" id="x-share" style="color:inherit">📤 share the oversight</a></p>`;

    // MINIMAP IS A MAP, NOT A TELEPORTER. Unexplored tiles are fully hidden —
    // no hints, no guesses. Travel happens on foot: walk to the edge of the
    // 9x9, tap yourself, head out.
    screen.querySelectorAll('.minimap .tile').forEach(el => {
      el.onclick = () => {
        const x = +el.dataset.x, y = +el.dataset.y;
        const info = document.getElementById('tileinfo');
        const tl = Game.tileAt(x, y);
        if (!info) return;
        if (x === st.px && y === st.py) { info.innerHTML = ''; return; }
        if (!tl.revealed) {
          info.innerHTML = `<div class="card"><p>🌫 <b>Unexplored.</b><br><span class="small">No one has been there. Walk to the edge and head out to see what's really there.</span></p></div>`;
        } else {
          info.innerHTML = `<div class="card"><p>🗺 ${esc(S.TILE_NAME[tl.type] || tl.type)}.<br><span class="small">Walk to the edge of the map to travel there.</span></p></div>`;
        }
        try { info.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
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
    const xShare = document.getElementById('x-share');
    if (xShare) xShare.onclick = (e) => { e.preventDefault(); shareGame(); };
    const pantryBtn = document.getElementById('x-pantry');
    if (pantryBtn) pantryBtn.onclick = () => pantrySheet();
    wirePanel(st, n);
    wireContextBar();
    wireAbilityBar();
    wireTargetBar();
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
    if (st.inCombat || Game.fight) return panelCombat(st);
    if (n.isHaven) return panelHaven(st);
    return panelNode(st, n);
  }

  // pantrySheet: pack for the day. Non-modal sheet - the world stays visible.
  // Food and water, same sliders, one stockpile.
  function pantrySheet() {
    const st = Game.status();
    const pantry = Game.state.village.pantry || [];
    const vWater = Game.state.village.water || { clean: 0, dirty: 0 };
    const carry = st.carryKg;
    const maxCarry = Game.carryCapacity();
    const waterRow = vWater.clean > 0 ? `<div class="card" style="margin:6px 0;padding:8px 10px;border-left:3px solid #4df3ff">
        <p class="small"><b>\U0001F4A7 Water (clean)</b> \u00D7${vWater.clean} L<br>
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
          ${p.safe ? '' : ' \u26A0 UNSAFE'}${p.spoilDay <= st.day ? ' \u26A0 SPOILED' : ''}${p.needsCooking ? ' \U0001F373 needs cooking' : ''}<br>
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
        <p class="small">\u2696\uFE0F <span id="ps-kg">0.0</span> kg \u00B7 \U0001F525 <span id="ps-kcal">0 kcal</span> \u00B7 \U0001F4A7 <span id="ps-water">0 L</span></p>
      </div>`;

    const wireSliders = (sheetEl) => {
      const update = () => {
        let kg = 0, kcal = 0, wl = 0;
        const parts = [];
        sheetEl.querySelectorAll('[data-pack]').forEach(sl => {
          const key = sl.dataset.pack, q = +sl.value;
          const qEl = sheetEl.querySelector('#packq-' + key);
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
        sheetEl.querySelector('#ps-items').textContent = parts.length ? parts.join(', ') : 'nothing yet';
        sheetEl.querySelector('#ps-kg').textContent = kg.toFixed(1);
        sheetEl.querySelector('#ps-kcal').textContent = Game.fmtKcal(kcal);
        sheetEl.querySelector('#ps-water').textContent = wl + ' L';
        const over = carry + kg > maxCarry;
        sheetEl.querySelector('#ps-kg').style.color = over ? '#e05c5c' : '';
        const packBtn = sheetEl.parentElement.querySelector('[data-sheetbtn="0"]');
        if (packBtn) packBtn.disabled = !parts.length || over;
      };
      sheetEl.querySelectorAll('[data-pack]').forEach(sl => sl.oninput = update);
      update();
      // stash the pack action for the sheet button
      sheetEl._doPack = () => {
        const sel = {};
        sheetEl.querySelectorAll('[data-pack]').forEach(sl => { if (+sl.value > 0) sel[sl.dataset.pack] = +sl.value; });
        Game.takeFromPantryBulk(sel);
        closeSheet('pantry');
        pantrySheet(); // re-open fresh
        refresh();
      };
    };

    openSheet({
      id: 'pantry',
      title: '\U0001F375 Pantry — pack for the day',
      html: bodyHtml,
      buttons: [{ label: 'Pack it', primary: true, keepOpen: true, onClick: () => {
        const sheetEl = document.querySelector('#sheet-root .sheet');
        if (sheetEl && sheetEl._doPack) sheetEl._doPack();
      } }],
      priority: 20, modal: false, dismissible: true,
      onRender: wireSliders,
    });
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
      </div></div>`;
  }

  function panelCombat(st) {
    const f = Game.fight;
    if (!f) return '';
    const mv = S.combat.MOVES[f.telegraph];
    return `
      <div class="card warn"><h3>${f.monster.name.toUpperCase()} — round ${f.round + 1}</h3>
      ${statRow('BULLDOZER', f.monster.hp + ' hp', f.monster.hp / f.monster.maxHp * 100, f.monster.hp < 15)}
      <p class="small">⚠ ${mv.name} incoming — ${f.studied ? mv.hint : "you can't quite read it. (STUDY it.)"}</p>
      <div class="actions">
        <button class="btn sm" data-c="strike">STRIKE</button>
        <button class="btn sm" data-c="harry">HARRY</button>
        <button class="btn sm" data-c="brace">BRACE</button>
        ${Game.hasAbility('scream_cheese') && Game.state.scholar.screamDay !== Game.state.scholar.day ? '<button class="btn sm" data-c="scream">🧀 SCREAM</button>' : ''}
      </div>
      <div class="actions">
        <button class="btn sm ghost" data-c="study">STUDY</button>
        <button class="btn sm ghost" data-c="flee">FLEE</button>
      </div></div>`;
  }

  function wirePanel(st, n) {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on('p-face', () => { Game.startCombat(); rerender(); });
    screen.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { Game.combatRound(b.dataset.c); rerender(); });
    const go = (kind) => { Game.doAction(kind); rerender(); };
    on('p-wait', () => go('wait'));
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
          if (mon && cx === mon.mx && cy === mon.my) { g = '🐗'; cls += ' monster'; }
          else if (ani && cx === ani.mx && cy === ani.my) { g = ANIMAL_GLYPH[ani.id] || '🐾'; cls += ' animal'; }
          else {
            // villagers: 🧍 with a TINY name label underneath.
            // (names were rendering at full size and swallowing the grid.)
            for (const [rid, pos] of Object.entries(vpos)) {
              if (pos.mx === cx && pos.my === cy) {
                const vp = Game.data.villagers.find(v => v.id === rid) || Game.data.background_survivors.find(v => v.id === rid);
                const fname = (vp ? vp.name.split(' ')[0] : '?').slice(0, 7);
                g = `<span class="vtoken">🧍</span><span class="vname">${esc(fname)}</span>`;
                cls += ' villager';
                break;
              }
            }
          }
        }
        html += `<div class="${cls}${targetingCells().has(cx + ',' + cy) ? ' targetable' : ''}${dangerCells.has(cx + ',' + cy) ? ' danger' : ''}" data-cx="${cx}" data-cy="${cy}">${g}</div>`;
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
        const cls = 'tile' + (isP ? ' me' : '') + (tl.revealed ? '' : ' fog') + (isT ? ' dest' : '') + (isW ? ' beast' : '') + ((tl.maxStock - (tl.stock || 0) > 0) && tl.revealed ? ' spent' : '');
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
  function codexScreen() {
    const entries = Game.codexEntries();
    const inprog = Game.codexInProgress();
    const mons = Game.state.codex.monsters || {};
    const LVL = { 1: 'L1 · Named', 2: 'L2 · Parts', 3: 'L3 · Uses', 4: 'L4 · Mastery' };
    screen.innerHTML = `
      ${bar('scattering://codex', entries.length + ' entries')}
      <h1 class="title" style="font-size:22px">${Game.journalName().toUpperCase()}</h1>
      <p class="small"><i>${Game.journalName() === 'Codex' ? 'the village keeps what you write. the System is watching.' : 'field journal — your handwriting. what you learned, so far just yours.'}</i></p>
      ${entries.length ? entries.map(e => `
        <div class="card codex"><h3>${e.name} <span class="small">· ${e.kcal} kcal/${e.unit}</span> <span class="small" style="opacity:.7">[${LVL[e.level] || 'L1'}]</span></h3>
        <p class="small"><b>Prep:</b> ${e.level >= 2 ? (e.prep || '—') : '<i>unidentified uses — reach L2</i>'}</p>
        <p class="small"><i>${e.knowledge || ''}</i></p><p>${e.level >= 1 ? e.text : ''}</p></div>`).join('')
        : '<div class="card"><h3>No entries yet.</h3><p>Forage something. Survive it. Write it down.</p></div>'}
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

  // ---------- boot ----------
  Game.init().then(() => title()).catch(e => {
    screen.innerHTML = `<p class="small">Failed to load game data: ${esc(e.message)}<br>Serve over http (not file://) for fetch() to work.</p>`;
  });
})();
