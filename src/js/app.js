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
      statRow('WATER', st.hydration + '% · ' + st.water + ' clean', st.hydration, st.hydration < 30) +
      (Game.state && Game.state.systemArrived ? statRow('SYSTEM', st.integration + '% integrated', st.integration, false) : '');
  }

  // ---------- title ----------
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
      <p class="small" style="margin-top:20px">slice 1: open expeditions. forage · eat · drink · bring it home.</p>`;
    document.getElementById('b-new').onclick = () => obColdOpen();
    const bc = document.getElementById('b-cont');
    // Save list: pick which character to continue.
    const savesDiv = document.getElementById('saves');
    if (savesDiv) {
      const saves = Game.listSaves();
      savesDiv.innerHTML = saves.map(sv => {
        const v = Game.data.villagers.find(v => v.id === sv.villagerId) || {};
        const name = sv.villagerName || v.name || sv.villagerId;
        return `<button class="btn" data-save="${sv.key}">Continue ${name} (Day ${sv.day || 1})</button>`;
      }).join('');
      savesDiv.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
        if (Game.load(b.dataset.save)) expeditionScreen();
      });
    }
    document.getElementById('b-codex0').onclick = () => { toast('The Codex is empty. For now.'); };
    const bt = document.getElementById('b-tel');
    if (bt) bt.onclick = () => telemetryScreen();
    document.getElementById('b-about').onclick = about;
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
        Game.newGame(ob.home, null, ob.villager, [...picked]);
        obWake();
      };
    };
    render();
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

    const CELL_NAME = {
      tree: 'Tree', bigtree: 'Big tree', bush: 'Bush', plant: 'Plant',
      water: 'Water', wall: 'Wall', rubble: 'Rubble', tent: 'Tent', fire: 'Fire',
      bridge: 'Bridge', door: 'Door', gym: 'Gym floor', class: 'Classroom', hall: 'Hallway',
      office: 'Office', bay: 'Warehouse bay', dock: 'Loading dock', sanct: 'Sanctuary', base: 'Basement',
      grass: 'Grass', dirt: 'Dirt',
    };
    const name = CELL_NAME[cell] || cell;
    let desc = '';
    let actions = [];

    if (isMe) {
      desc = 'You are here.';
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
      else desc += ' (Too far to catch.)';
    } else if (villagerId) {
      // VILLAGER: tap to talk. all 12 are interactable, not just mains.
      const vp = Game.data.villagers.find(v => v.id === villagerId) || Game.data.background_survivors.find(v => v.id === villagerId);
      const name = vp ? vp.name : villagerId;
      const trust = (Game.state.village.trust && Game.state.village.trust[villagerId]) || 10;
      const health = (Game.state.village.health && Game.state.village.health[villagerId] !== undefined) ? Game.state.village.health[villagerId] : 100;
      desc = `${vp ? vp.formerOccupation : ''} · Health ${health}/100.`;
      const tone = trust < 30 ? 'Guarded.' : trust < 60 ? 'Warming up.' : 'Trusts you.';
      desc += ` ${tone}`;
      if (dist <= 2) {
        actions.push(['Talk', () => Game.talkTo(villagerId)]);
        actions.push(['Give food', () => Game.giveFood(villagerId)]);
        const youKnow = Object.keys(Game.state.codex.plants);
        const theyKnow = (Game.state.village.taught && Game.state.village.taught[villagerId]) || [];
        const teachable = youKnow.filter(pid => !theyKnow.includes(pid));
        if (teachable.length) actions.push(['Teach', () => {
          const pid = teachable[0];
          if (!Game.state.village.taught[villagerId]) Game.state.village.taught[villagerId] = [];
          Game.state.village.taught[villagerId].push(pid);
          Game.say(`You teach ${name.split(' ')[0]} about ${Game.data.plants.find(p => p.id === pid).name}.`);
        }]);
      } else {
        desc += ' (Too far to talk.)';
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
        else if (cell === 'door') desc += ' Leads outside.';
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
      b.onclick = () => { actions[+b.dataset.tpact][1](); refreshTilePanel(); };
    });
    document.getElementById('tp-close').onclick = () => { info.innerHTML = ''; };
    // remember what we're looking at so actions can refresh the panel
    info.dataset.cx = cx; info.dataset.cy = cy;
  }

  // refresh: full expedition screen re-render after an action.
  function refresh() { expeditionScreen(); }

  // refreshTilePanel: re-render the inline panel after an action (stays in context)
  function refreshTilePanel() {
    const info = document.getElementById('tileinfo');
    if (!info || info.dataset.cx === undefined || !info.innerHTML) return;
    cellPopup(+info.dataset.cx, +info.dataset.cy);
  }

  // confirmMove: >3 steps is a commitment. Confirm the cost.
  function confirmMove(cx, cy, steps) {
    const cost = steps * 10;
    const screen = document.getElementById('screen');
    screen.innerHTML = `
      <div class="card">
        <h3>Walk ${steps} squares?</h3>
        <p class="small">That's ${cost} kcal. You're committing to the walk.</p>
        <div class="btnrow">
          <button class="btn sm" id="b-walk">Walk (${cost} kcal)</button>
          <button class="btn ghost sm" id="b-cback">Back</button>
        </div>
      </div>`;
    document.getElementById('b-walk').onclick = () => { Game.movePath(cx, cy); expeditionScreen(); };
    document.getElementById('b-cback').onclick = () => expeditionScreen();
  }

  // moveOrActPopup: destination is interactable. Step here, OR step here and do the thing.
  function moveOrActPopup(cx, cy, steps, actions) {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    const cell = detail[cy] && detail[cy][cx];
    const CELL_NAME = {
      tree: 'Tree', bigtree: 'Big tree', bush: 'Bush', plant: 'Plant',
      water: 'Water', wall: 'Wall', rubble: 'Rubble', tent: 'Tent', fire: 'Fire',
      bridge: 'Bridge', door: 'Door',
    };
    const name = CELL_NAME[cell] || cell || 'Ground';
    const screen = document.getElementById('screen');
    // Build "step and act" options: for each action, offer to walk there and do it.
    const stepActs = actions.map(a => [`Step here and ${a.toLowerCase()}`, () => {
      // walk to adjacent (can't stand on blocked cells)
      const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
      // find adjacent walkable cell
      let best = null, bestD = 99;
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        const c = detail[ny] && detail[ny][nx];
        if (Game.cellProps(c).blocks) continue;
        const d = Math.abs(nx - px) + Math.abs(ny - py);
        if (d < bestD) { bestD = d; best = [nx, ny]; }
      }
      if (best) Game.movePath(best[0], best[1]);
      // then do the action (via cellPopup logic — for now, open the popup)
      cellPopup(cx, cy);
    }]);
    screen.innerHTML = `
      <div class="card">
        <h3>${name}</h3>
        <p class="small">${steps > 0 ? `It's ${steps} squares away.` : `You're here.`} What do you want to do?</p>
        <div class="btnrow">
          <button class="btn sm" id="b-step">Step here</button>
          ${stepActs.map((a, i) => `<button class="btn sm" data-act="${i}">${a[0]}</button>`).join('')}
          <button class="btn ghost sm" id="b-cback">Back</button>
        </div>
      </div>`;
    document.getElementById('b-step').onclick = () => {
      // step to adjacent if blocked, else to the cell
      const c = detail[cy] && detail[cy][cx];
      if (Game.cellProps(c).blocks) {
        // find adjacent
        const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
        let best = null, bestD = 99;
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
          const cc = detail[ny] && detail[ny][nx];
          if (Game.cellProps(cc).blocks) continue;
          const d = Math.abs(nx - px) + Math.abs(ny - py);
          if (d < bestD) { bestD = d; best = [nx, ny]; }
        }
        if (best) Game.movePath(best[0], best[1]);
      } else {
        Game.movePath(cx, cy);
      }
      expeditionScreen();
    };
    stepActs.forEach((a, i) => {
      document.querySelector(`[data-act="${i}"]`).onclick = () => a[1]();
    });
    document.getElementById('b-cback').onclick = () => expeditionScreen();
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

  // relicPopup: the System noticed your attachment. Pick 1 of 3 enhancements.
  function relicPopup() {
    const rc = Game.state.scholar.relicChoices;
    if (!rc) return;
    const screen = document.getElementById('screen');
    screen.innerHTML = `
      <div class="card">
        <h3>❖ The System Noticed</h3>
        <p class="small">"We have detected elevated attachment to Unit ${esc(rc.itemName.toUpperCase())}. This is inefficient. This is also... [PROCESSING] ...valuable? Optimization available."</p>
        <p class="small">Your <b>${esc(rc.itemName)}</b> (bond ${rc.threshold}) can become more. Choose one:</p>
        <div class="btnrow">
          ${rc.options.map(o => `<button class="btn sm" data-relic="${o.id}"><b>${esc(o.name)}</b><br><span class="small">${esc(o.description)}</span>${o.systemCommentary ? `<br><i class="small">"${esc(o.systemCommentary)}"</i>` : ''}</button>`).join('')}
        </div>
      </div>`;
    screen.querySelectorAll('[data-relic]').forEach(b => b.onclick = () => {
      Game.chooseRelicEnhancement(b.dataset.relic);
      expeditionScreen();
    });
  }

  // abilityPopup: the System offers you a choice. Pick one.
  function abilityPopup() {
    const choices = Game.state.scholar.abilityChoices;
    if (!choices || !choices.length) return;
    const screen = document.getElementById('screen');
    screen.innerHTML = `
      <div class="card">
        <h3>🌟 The System Offers a Gift</h3>
        <p class="small">"We watched your first week! You're good at... let us see..."</p>
        <p class="small">Choose one ability:</p>
        <div class="btnrow">
          ${choices.map((c, i) => `<button class="btn sm" data-abil="${c.id}"><b>${c.name}</b><br><span class="small">${c.description || c.desc}</span>${c.flavor ? `<br><i class="small">"${c.flavor}"</i>` : ''}${c.metabolic && c.metabolic.daily ? `<br><span class="small">🔥 Costs ${c.metabolic.daily} kcal/day to keep. Power is a trade.</span>` : ''}</button>`).join('')}
        </div>
      </div>`;
    screen.querySelectorAll('[data-abil]').forEach(b => b.onclick = () => {
      Game.chooseAbility(b.dataset.abil);
      expeditionScreen();
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
  // Also save every 30 seconds (in case the above don't fire).
  setInterval(() => { try { Game.save(); } catch (e) {} }, 30000);

  // invPopup: what are you carrying? always accessible, not hidden.
  // Crafting lives here too — supplies to feed yourself.
  function invPopup() {
    const st = Game.status();
    const inv = st.inventory;
    const tools = Game.state.scholar.tools || [];
    const recipes = Game.data.recipes || [];
    const knownRecipes = recipes.filter(r => (Game.state.codex.recipes || {})[r.id] && Game.state.codex.recipes[r.id].level >= 3);
    screen.innerHTML = `${bar('scattering://pack', st.invCount + ' items')}
      <div class="card" style="margin-top:40px">
        <h3>Pack</h3>
        ${(() => { const eq = Game.state.scholar.equipped || {}; const parts = []; if (eq.weapon) parts.push(`⚔️ ${eq.weapon.name}`); if (eq.armor) parts.push(`🛡️ ${eq.armor.name}`); return parts.length ? `<p class="small"><b>Equipped:</b> ${parts.join(' · ')}</p>` : ''; })()}
        ${(() => { const bg = Game.state.scholar.backgroundAbilities || []; if (!bg.length) return ''; return `<p class="small"><b>Background:</b> ${bg.map(a => `${a.name} L${a.level}`).join(', ')}</p>`; })()}
        ${(() => { const ab = Game.state.scholar.abilities || []; if (!ab.length) return ''; return `<p class="small"><b>System:</b> ${ab.map(a => `${a.name} L${a.level}`).join(', ')} (${ab.length}/${Game.abilitySlots()} slots)</p>`; })()}
        ${(() => { const sy = Game.state.scholar.activeSynergies || []; if (!sy.length) return ''; const names = sy.map(id => { const d = (Game.data.synergies || []).find(x => x.id === id); return d ? d.name : id; }); return `<p class="small"><b>✦ Resonances:</b> ${names.join(' · ')}</p>`; })()}
        ${(() => { const w = Game.state.scholar.water || []; if (!w.length) return ''; const clean = w.filter(b => b.quality === 'clean').length; const risky = w.filter(b => b.quality === 'risky').length; return `<p class="small"><b>💧 Water:</b> ${clean}L clean${risky ? `, ${risky}L risky` : ''} (${w.length}kg)</p>`; })()}
        ${inv.length ? inv.map((i, idx) => `<p class="small">${i.bonded ? '❖ ' : ''}<b>${Game.itemDisplayName(i)}</b> x${i.units} (${(i.kcalEach || 0) * i.units} kcal)${i.bonded ? ` <span class="small" title="Bonded relic — grown, not found">bond ${i.bond || 0}${(i.enhancements || []).length ? ' · ' + i.enhancements.join(', ') : ''}</span>` : ''}${i.spoilDay <= st.day ? ' ⚠ spoiled' : ''}${i.bookId ? ` <button class="btn ghost sm" data-read="${i.bookId}">Read</button>` : ''}${Game.isUsable(i) && !i.bonded ? ` <button class="btn ghost sm" data-use="${idx}">Use</button>` : ''}${i.rawKcal && Game.nearFire() ? ` <button class="btn ghost sm" data-cook="${idx}">Cook</button>` : ''}${Game.isWeapon(i) ? ` <button class="btn ghost sm" data-equip-w="${idx}">Equip</button>` : ''}${Game.isArmor(i) ? ` <button class="btn ghost sm" data-equip-a="${idx}">Wear</button>` : ''}${(i.kcalEach || 0) > 0 && !i.bonded ? ` <button class="btn ghost sm" data-donate="${idx}">Donate</button>` : ''}</p>`).join('') : '<p class="small">Empty. The world provides.</p>'}
        ${(() => { const acts = Game.activatableAbilities ? Game.activatableAbilities() : []; if (!acts.length) return ''; return `<h3 style="margin-top:12px">⚡ Abilities</h3>` + acts.map(a => `<p class="small"><b>${a.name}</b> — ${a.desc} ${a.available ? `<button class="btn ghost sm" data-activate="${a.id}">Use</button>` : `<span class="small" style="opacity:.6">(${a.why || 'not now'})</span>`}</p>`).join(''); })()}
        ${tools.length ? `<h3 style="margin-top:12px">Tools</h3>${tools.map(t => `<p class="small"><b>${t.name}</b> (${t.uses} uses left) <button class="btn ghost sm" data-settrap="${t.recipeId}">Set</button></p>`).join('')}` : ''}
        ${knownRecipes.length ? `<h3 style="margin-top:12px">Craft</h3>${knownRecipes.map(r => `<p class="small"><b>${r.name}</b> — ${Object.entries(r.materials).map(([m, n]) => n + ' ' + m).join(', ')} <button class="btn ghost sm" data-craft="${r.id}">Make</button></p>`).join('')}` : ''}
        <button class="btn ghost sm" id="b-iback">Back</button>
      </div>`;
    document.getElementById('b-iback').onclick = () => expeditionScreen();
    screen.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => { Game.craft(b.dataset.craft); invPopup(); });
    screen.querySelectorAll('[data-settrap]').forEach(b => b.onclick = () => { Game.setTrap(b.dataset.settrap); expeditionScreen(); });
    screen.querySelectorAll('[data-read]').forEach(b => b.onclick = () => { Game.readBook(b.dataset.read); invPopup(); });
    screen.querySelectorAll('[data-use]').forEach(b => b.onclick = () => { Game.useItem(+b.dataset.use); invPopup(); });
    screen.querySelectorAll('[data-cook]').forEach(b => b.onclick = () => { Game.cookFood(+b.dataset.cook); invPopup(); });
    screen.querySelectorAll('[data-equip-w]').forEach(b => b.onclick = () => { Game.equip(+b.dataset.equipW, 'weapon'); invPopup(); });
    screen.querySelectorAll('[data-equip-a]').forEach(b => b.onclick = () => { Game.equip(+b.dataset.equipA, 'armor'); invPopup(); });
    screen.querySelectorAll('[data-donate]').forEach(b => b.onclick = () => { Game.donateToPantry(+b.dataset.donate); invPopup(); });
    screen.querySelectorAll('[data-activate]').forEach(b => b.onclick = () => { Game.activateAbility(b.dataset.activate); invPopup(); });
  }

  function talkOverlay(vid) {
    const v = Game.data.villagers.find(x => x.id === vid);
    const line = Game.talkTo(vid);
    const trust = (Game.state.village.trust && Game.state.village.trust[vid]) || 10;
    const building = Game.state.village.spawnBuilding || 'the school gymnasium';
    const health = (Game.state.village.health && Game.state.village.health[vid] !== undefined) ? Game.state.village.health[vid] : 100;
    screen.innerHTML = `${bar('scattering://village', v.name.split(' ')[0].toLowerCase())}
      <div class="card" style="margin-top:40px">
        <h3>${v.name}</h3>
        <p class="small">${v.formerOccupation} · ${v.homeRegion}</p>
        <p class="small" style="opacity:.7">Woke up in ${building} — same as you. Same as everyone.</p>
        <p class="small">Health: ${health}/100</p>
        <p style="font-size:17px;line-height:1.6">"${line}"</p>
        <button class="btn sm" id="b-tagain">Say more</button>
        <button class="btn sm" id="b-give">Give food</button>
        <button class="btn ghost sm" id="b-tback">Back to the fire</button>
      </div>`;
    document.getElementById('b-tagain').onclick = () => talkOverlay(vid);
    document.getElementById('b-give').onclick = () => { Game.giveFood(vid); talkOverlay(vid); };
    document.getElementById('b-tback').onclick = () => expeditionScreen();
  }

  // ---------- the one screen ----------
  // map + here-panel, always together. no view switching: the panel adapts to
  // where you stand (haven / wild node / ruin / combat). travel = tap a tile.
  function expeditionScreen() {
    const st = Game.status();
    if (st.over) return ending();
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
      <div id="tileinfo"></div>
      <p class="small">🗺 travel — tap a highlighted tile (1 part · 30 kcal/tile)</p>
      <div class="map minimap">${renderMap(st, tset)}</div>
      ${panelFor(st, n)}
      <div class="actions">
        <button class="btn sm ghost" id="x-codex">${Game.journalName()} (${st.codexCount})</button>
      </div>
      <div class="log">${st.log.slice(-6).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>`;

    screen.querySelectorAll('.minimap .tile').forEach(el => {
      el.onclick = () => {
        const x = +el.dataset.x, y = +el.dataset.y;
        const info = document.getElementById('tileinfo');
        if (x === st.px && y === st.py) { pendingTravel = null; return; }
        const d = Math.abs(x - st.px) + Math.abs(y - st.py);
        const tl = Game.tileAt(x, y);
        const isTarget = tset.has(x + ',' + y);
        // FOG: tap an unexplored tile for a rough guess. No commitment.
        if (!isTarget) {
          pendingTravel = null;
          if (!tl.revealed && info) {
            info.innerHTML = `<div class="card"><p>🔭 ${esc(tl.guess || 'unknown ground')}.<br><span class="small">You'll know when you get there. Walk to an adjacent tile first.</span></p></div>`;
          } else if (!tl.revealed && d > 1) toast('Unexplored — walk to an adjacent tile first.');
          else if (d > 3) toast('Too far — 3 tiles max per trip.');
          else toast('Not reachable from here.');
          return;
        }
        // TWO-CLICK: first tap selects, second tap confirms.
        if (!pendingTravel || pendingTravel.x !== x || pendingTravel.y !== y) {
          pendingTravel = { x, y };
          const kcal = Math.round(30 * d);
          const name = tl.revealed ? (S.TILE_NAME[tl.type] || tl.type) : `unknown (${esc(tl.guess || '??')})`;
          const block = Game.travelBlockage(x, y);
          let warn = '';
          if (block) {
            const BT = { fallen_tree: '🪵 fallen tree blocks the way', rubble: '🧱 rubble blocks the way', washed_out: '🌊 washed out — needs a bridge', creek: '🌊 fast water — needs a bridge or a swimmer' };
            warn = `<br><span style="color:#e0a040">⚠ ${BT[block.blockType] || 'blocked'}</span>`;
          }
          if (info) info.innerHTML = `<div class="card"><p>🧭 Travel to <b>${esc(name)}</b> — ${d} tile${d > 1 ? 's' : ''}, ${kcal} kcal.${warn}<br><span class="small">Tap again to go.</span></p></div>`;
          else toast(`Tap again to travel (${kcal} kcal).`);
          return;
        }
        // second tap: go.
        pendingTravel = null;
        const res = Game.travelTo(x, y);
        if (res && res.blocked === undefined && res.kind === 'blockage') { showBlockage(res); return; }
        if (!res && res !== undefined) {
          // travelTo returned null/undefined without blockage info — shouldn't happen
          toast('Not reachable from here.');
          return;
        }
        rerender();
      };
    });
    // detail grid: tap a cell to see your options. the popup tells you what it is,
    // Click a cell: if there's a DECISION (forage, drink, fight, talk), popup.
    // If it's just ground, STEP there. No bubble asking to confirm walking.
    // Steps cost kcal (not free), but they're not decisions.
    screen.querySelectorAll('.detail .cell').forEach(el => {
      el.onclick = () => {
        const cx = +el.dataset.cx, cy = +el.dataset.cy;
        // INLINE: the panel appears below the grid. The world stays visible.
        // Tapping ground steps there (free for 1 step, confirmed for long walks).
        // Tapping something interesting shows what you can do — in context.
        const px = Game.state.scholar.mx ?? 4, py = Game.state.scholar.my ?? 4;
        if (cx === px && cy === py) { cellPopup(cx, cy); return; } // yourself: info panel
        const detail = Game.genDetail(Game.map.px, Game.map.py);
        const cell = detail[cy] && detail[cy][cx];
        const walkable = !Game.cellProps(cell).blocks;
        const dist = Math.max(Math.abs(cx - px), Math.abs(cy - py));
        const actions = Game.cellActions(cx, cy);
        if (walkable && actions.length === 0 && dist <= 1) {
          // Adjacent ground: just step. Free. No panel, no fuss.
          Game.microMove(cx, cy);
          expeditionScreen();
          return;
        }
        // Everything else: inline panel with context-appropriate options.
        cellPopup(cx, cy);
      };
    });
    // System arrival? Play the animation (once).
    if (Game.state.systemArrived && !Game.state.systemAnimationShown) {
      Game.state.systemAnimationShown = true;
      systemArrivalAnimation(() => {
        // After animation, show ability choice if available.
        if (Game.state.scholar.abilityChoices && Game.state.scholar.abilityChoices.length) {
          abilityPopup();
        } else {
          expeditionScreen();
        }
      });
      return;
    }
    // System ability choice? Show it.
    if (Game.state.scholar.abilityChoices && Game.state.scholar.abilityChoices.length) {
      abilityPopup();
      return;
    }
    // Relic enhancement offer? Show it.
    if (Game.state.scholar.relicChoices) {
      relicPopup();
      return;
    }
    document.getElementById('x-codex').onclick = codexScreen;
    const pantryBtn = document.getElementById('x-pantry');
    if (pantryBtn) pantryBtn.onclick = () => pantryPopup();
    wirePanel(st, n);
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

  function pantryPopup() {
    const st = Game.stateSnapshot();
    const pantry = Game.state.village.pantry || [];
    const carry = st.carryKg;
    screen.innerHTML = `${bar('scattering://pantry', 'pack for the day')}
      <h2>Pantry</h2>
      <p class="small">Take what you need. Carrying ${carry.toFixed(1)}/20 kg.</p>
      <p class="small">💧 ${st.waterClean}L clean / ${st.waterDirty}L dirty</p>
      ${pantry.length ? pantry.map((p, idx) => `<p class="small"><b>${p.name}</b> x${p.units} (${p.kcalEach * p.units} kcal)${p.safe ? '' : ' ⚠ UNSAFE'}${p.spoilDay <= st.day ? ' ⚠ SPOILED' : ''} <button class="btn ghost sm" data-take="${idx}">Take 1</button></p>`).join('') : '<p class="small">Empty.</p>'}
      <button class="btn" id="x-back">Back</button>`;
    screen.querySelectorAll('[data-take]').forEach(b => b.onclick = () => { Game.takeFromPantry(+b.dataset.take); pantryPopup(); });
    document.getElementById('x-back').onclick = () => expeditionScreen();
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
      <p class="small">Pantry: ${st.pantryKcal} kcal (about ${st.pantryDays} days)${st.hungryDays ? ' · ⚠ HUNGRY day ' + st.hungryDays : ''}</p>
      <p class="small">💧 Water: ${st.waterClean}L clean / ${st.waterDirty}L dirty</p>
      <button class="btn sm" id="x-pantry">Take from pantry</button>
      <p class="small" style="opacity:.75">${st.rosterCount} mouths need ${st.villageEat.toLocaleString()}/day · the village brings in ${st.villageGive.toLocaleString()} · shortfall ${net.toLocaleString()}/day</p>
      <p class="small">Haven survives when: ${Game.journalName()} 10 (${st.codexCount}) · Pantry 8000+ (${st.pantryKcal})</p>
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
    on('p-inv', () => invPopup());
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
    wall: '🧱', tent: '⛺', fire: '🔥',
    gym: '🏀', class: '🏫', hall: '🚪', door: '🚪', bridge: '🌉',
    office: '🗄️', bay: '📦', dock: '🚚', sanct: '⛪', base: '🕯️',
    apt: '🏢', lobby: '🛋️', cube: '💼', break: '☕', conf: '📊',
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
        if (isMe) {
          // DIRECTIONAL MARKER: you are a pulsing ring with a facing wedge.
          // Facing comes from your last step — the marker shows where you're headed.
          const f = Game.state.scholar.facing || { x: 0, y: 1 };
          const ang = Math.round(Math.atan2(f.x, -f.y) * 180 / Math.PI);
          g = `<span class="pmark"><span class="pdir" style="transform:rotate(${ang}deg)">▲</span></span>`;
          cls += ' me';
        }
        else if (mon && cx === mon.mx && cy === mon.my) { g = '🐗'; cls += ' monster'; }
        else if (ani && cx === ani.mx && cy === ani.my) { g = ANIMAL_GLYPH[ani.id] || '🐾'; cls += ' animal'; }
        else {
          // villagers: show 🧍 with name (first name only, small)
          for (const [rid, pos] of Object.entries(vpos)) {
            if (pos.mx === cx && pos.my === cy) {
              const vp = Game.data.villagers.find(v => v.id === rid) || Game.data.background_survivors.find(v => v.id === rid);
              const fname = vp ? vp.name.split(' ')[0] : '?';
              g = `🧍<span class="vname">${fname}</span>`;
              cls += ' villager';
              break;
            }
          }
        }
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
        else { g = CELL_GLYPH[cell] || ''; }

        // known secrets override the look: knowledge is visible.
        const sec = secrets[cx + ',' + cy];
        if (sec && sec.known && !isMe) {
          if ((cell === 'tree' || cell === 'bigtree') && sec.yield === 0) { g = '🌿'; cls += ' ivy'; }
          else if (cell === 'water' && sec.safe === false) { g = '☠️'; cls += ' poison'; }
          else if (cell === 'tent' && sec.condition === 'shredded') { g = '💨'; cls += ' shredded'; }
        }
        html += `<div class="${cls}" data-cx="${cx}" data-cy="${cy}">${g}</div>`;
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
