/* The Scattering — slice 1: "Seven Days" playable.
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

  // ---------- shared ----------
  function statRow(label, val, pct, low) {
    return `<div class="stat"><div class="lbl"><span>${label}</span><span>${val}</span></div><div class="bar${low ? ' low' : ''}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`;
  }
  function statusBars(st) {
    return statRow('HEALTH', st.health, st.health, st.health < 35) +
      statRow('FOOD (you)', Math.round(st.kcal) + ' kcal', st.kcal / 24, st.kcal < 500) +
      statRow('PACK', st.invKcal + ' kcal · ' + st.packKg + '/' + st.packCap + ' kg', st.packKg / st.packCap * 100, st.packKg >= st.packCap) +
      statRow('WATER', st.hydration + '% · ' + st.water + ' clean', st.hydration, st.hydration < 30) +
      statRow('SYSTEM', st.integration + '% integrated', st.integration, false);
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
      <h1 class="title">THE SCATTERING</h1>
      <div class="subtitle">a system-apocalypse survival roguelite<br>hunger is the final boss</div>
      <button class="btn" id="b-new">New Expedition</button>
      ${Game.hasSave() ? '<button class="btn" id="b-cont">Continue Expedition</button>' : ''}
      <button class="btn ghost" id="b-codex0">Codex</button>
      ${(Game.state && Game.state.telemetry && Game.state.telemetry.length) ? '<button class="btn ghost" id="b-tel">📊 Telemetry</button>' : ''}
      <button class="btn ghost" id="b-about">About</button>
      <p class="small" style="margin-top:20px">slice 1: open expeditions. forage · eat · drink · bring it home.</p>`;
    document.getElementById('b-new').onclick = () => obColdOpen();
    const bc = document.getElementById('b-cont');
    if (bc) bc.onclick = () => { if (Game.load()) expeditionScreen(); };
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
    const homes = [
      { id: 'ohio', label: 'Ohio river valley', sub: 'farms and small woods' },
      { id: 'georgia', label: 'Georgia pines', sub: 'hunting country' },
      { id: 'seattle', label: 'Seattle', sub: 'city, rain, salt water' },
    ];
    screen.innerHTML = `${bar('scattering://home', '?')}
      <h1 class="title" style="font-size:22px">WHERE IS HOME?</h1>
      <p class="small">What you know grows where you're from. It doesn't grow here.</p>
      ${homes.map(h => `<button class="btn" data-h="${h.id}">${h.label}<br><span class="small">${h.sub}</span></button>`).join('')}`;
    screen.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { ob.home = b.dataset.h; obWho(); });
  }
  function obWho() {
    const vs = Game.data.villagers;
    screen.innerHTML = `${bar('scattering://wake', 'clearing')}
      <h1 class="title" style="font-size:22px">WHICH ONE IS YOU?</h1>
      <p class="small">A clearing. Confused people waking up. One of them is you.</p>
      ${vs.map(v => `
        <div class="card"><h3>${v.name}</h3>
        <p>${v.formerOccupation} · ${v.homeRegion}</p>
        <p class="small">${v.backstory}</p>
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
        Game.newGame(ob.home, ob.villager, [...picked]);
        questOverlay(() => { Game.depart(); expeditionScreen(); });
      };
    };
    render();
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

  function talkOverlay(vid) {
    const v = Game.data.villagers.find(x => x.id === vid);
    const line = Game.talkTo(vid);
    const trust = (Game.state.village.trust && Game.state.village.trust[vid]) || 10;
    const building = (Game.state.village.spawnBuilding && Game.state.village.spawnBuilding[vid]) || 'somewhere';
    const health = (Game.state.village.health && Game.state.village.health[vid] !== undefined) ? Game.state.village.health[vid] : 100;
    screen.innerHTML = `${bar('scattering://village', v.name.split(' ')[0].toLowerCase())}
      <div class="card" style="margin-top:40px">
        <h3>${v.name}</h3>
        <p class="small">${v.formerOccupation} · ${v.homeRegion} · woke up in ${building}</p>
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
        if (x === st.px && y === st.py) return;
        if (!Game.travelTo(x, y)) { toast('Not reachable — 3 tiles max, through scouted ground.'); return; }
        rerender();
      };
    });
    // detail grid: tap an adjacent cell to STEP there (costs 10 kcal). you're IN the world.
    // the macro map below is for travel between tiles. this is for moving within one.
    screen.querySelectorAll('.detail .cell').forEach(el => {
      el.onclick = () => {
        const cx = +el.dataset.cx, cy = +el.dataset.cy;
        if (Game.microMove(cx, cy)) rerender();
        else toast('Too far — step to an adjacent cell.');
      };
    });
    document.getElementById('x-codex').onclick = codexScreen;
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
      <p class="small" style="opacity:.75">${st.rosterCount} mouths need ${st.villageEat.toLocaleString()}/day · the village brings in ${st.villageGive.toLocaleString()} · shortfall ${net.toLocaleString()}/day</p>
      <p class="small">Haven survives when: ${Game.journalName()} 10 (${st.codexCount}) · Pantry 8000+ (${st.pantryKcal})</p>
      ${mains.map(p => {
        const h = (Game.state.village.health && Game.state.village.health[p.id] !== undefined) ? Game.state.village.health[p.id] : 100;
        const hb = h >= 70 ? '🟢' : h >= 40 ? '🟡' : '🔴';
        return `<p class="small"><b>${p.name}</b> — ${p.formerOccupation} ${hb} ${h}
        <button class="btn ghost sm" data-talk="${p.id}" style="margin-left:8px">Talk</button></p>`; }).join('')}
      <p class="small" style="margin-top:8px;opacity:.75"><b>Also here:</b> ${bg.map(p => `${p.name} (${p.formerOccupation})`).join(' · ')}</p>
      <div class="btnrow">
        <button class="btn sm" id="p-water">Fill water</button>
        <button class="btn sm" id="p-fire">Sit by the fire</button>
      </div></div>`;
  }

  function panelNode(st, n) {
    return `
      <div class="card"><h3>${esc(n.epithet).toUpperCase()}</h3>
      <p class="small">${esc(n.title)}</p>
      <p class="small">Here: ${n.here.length ? esc(n.here.join(' · ')) : 'nothing obvious'}</p>
      <div class="actions">
        <button class="btn sm" id="p-act" ${n.canForage ? '' : 'disabled'}>${n.isRuin ? 'Scavenge' : 'Forage'}<br><span class="cost">1 part · 120 kcal</span></button>
        <button class="btn sm" id="p-treat" ${n.canTreat ? '' : 'disabled'}>Treat water<br><span class="cost">1 part · 50 kcal</span></button>
        <button class="btn sm" id="p-wait">Wait<br><span class="cost">1 part</span></button>
      </div>
      <div class="actions">
        <button class="btn sm ghost" id="p-eat">Eat to full</button>
        <button class="btn sm ghost" id="p-drink" ${st.water > 0 ? '' : 'disabled'}>Drink clean (${st.water})</button>
        <button class="btn sm ghost" id="p-wild" ${n.canTreat ? '' : 'disabled'}>Drink wild</button>
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
    on('p-act', () => go('forage'));
    on('p-treat', () => go('treat'));
    on('p-wait', () => go('wait'));
    on('p-eat', () => { Game.eat(); rerender(); });
    on('p-drink', () => { Game.drinkTreated(); rerender(); });
    on('p-wild', () => { Game.drinkWild(); rerender(); });
    screen.querySelectorAll('[data-talk]').forEach(b => b.onclick = () => talkOverlay(b.dataset.talk));
    screen.querySelectorAll('.bgsurv').forEach(el => {
      el.onclick = () => { screen.querySelector('#bgsay').textContent = '\u201C' + el.dataset.line + '\u201D'; };
    });
    on('p-water', () => { Game.villageAction('water'); toast('Skin full. Cold. Clean.'); rerender(); });
    on('p-fire', () => { Game.villageAction('fire'); rerender(); });
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
  };
  function renderDetail(st) {
    const cells = Game.genDetail(st.px, st.py);
    const tile = Game.playerTile();
    const known = tile.knownPlant;
    const pmx = Game.state.scholar.mx ?? 4, pmy = Game.state.scholar.my ?? 4;
    let html = '';
    for (let cy = 0; cy < 9; cy++) {
      html += '<div class="drow">';
      for (let cx = 0; cx < 9; cx++) {
        const cell = cells[cy][cx];
        const isMe = (cx === pmx && cy === pmy);
        let g, cls = 'cell';
        if (isMe) { g = '🧍'; cls += ' me'; }
        else if (cell === 'plant') {
          g = known && PLANT_GLYPH[known] ? PLANT_GLYPH[known] : '🌱';
          cls += ' plantcell';
        }
        else if (cell === 'grass') { g = ''; cls += ' grass'; }
        else if (cell === 'dirt') { g = ''; cls += ' dirt'; }
        else { g = CELL_GLYPH[cell] || ''; }

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
        const g = isW ? '🐗' : (tl.revealed ? S.TILE_GLYPH[tl.type] : '?');
        html += `<div class="${cls}" data-x="${x}" data-y="${y}">${isP ? '●' : g}</div>`;
      }
      html += '</div>';
    }
    return html;
  }

  // ---------- codex ----------
  function codexScreen() {
    const entries = Game.codexEntries();
    const mons = Game.state.codex.monsters || {};
    screen.innerHTML = `
      ${bar('scattering://codex', entries.length + ' entries')}
      <h1 class="title" style="font-size:22px">${Game.journalName().toUpperCase()}</h1>
      <p class="small"><i>${Game.journalName() === 'Codex' ? 'the village keeps what you write. the System is watching.' : 'field journal — your handwriting. what you learned, so far just yours.'}</i></p>
      ${entries.length ? entries.map(e => `
        <div class="card codex"><h3>${e.name} <span class="small">· ${e.kcal} kcal/${e.unit}</span></h3>
        <p class="small"><b>Prep:</b> ${e.prep || '—'}</p><p>${e.text}</p></div>`).join('')
        : '<div class="card"><h3>No entries yet.</h3><p>Forage something. Survive it. Write it down.</p></div>'}
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
