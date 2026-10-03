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
      statRow('ENERGY', st.energy + '%', st.energy, st.energy < 25);
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
      <button class="btn ghost" id="b-about">About</button>
      <p class="small" style="margin-top:20px">slice 1: seven days. forage · eat · drink · survive.</p>`;
    document.getElementById('b-new').onclick = () => obColdOpen();
    const bc = document.getElementById('b-cont');
    if (bc) bc.onclick = () => { if (Game.load()) { Game.status().location === 'village' ? villageScreen() : gameMain(); } };
    document.getElementById('b-codex0').onclick = () => { toast('The Codex is empty. For now.'); };
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
    screen.innerHTML = `${bar('scattering://pack', '5 items')}
      <h1 class="title" style="font-size:22px">WHAT DID YOU GRAB?</h1>
      <p class="small">The sky was changing. ${v.name.split(' ')[0]} grabbed five things:</p>
      ${items.map(i => `<div class="card"><h3>${i.name}</h3><p class="small">${i.flavor}</p></div>`).join('')}
      <button class="btn" id="b-go">This is me. Begin.</button>`;
    document.getElementById('b-go').onclick = () => {
      Game.newGame(ob.home, ob.villager);
      villageScreen();
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

  function talkOverlay(vid) {
    const v = Game.data.villagers.find(x => x.id === vid);
    const line = Game.talkTo(vid);
    screen.innerHTML = `${bar('scattering://village', v.name.split(' ')[0].toLowerCase())}
      <div class="card" style="margin-top:40px">
        <h3>${v.name}</h3>
        <p class="small">${v.formerOccupation} · ${v.homeRegion}</p>
        <p style="font-size:17px;line-height:1.6">"${line}"</p>
        <button class="btn sm" id="b-tagain">Say more</button>
        <button class="btn ghost sm" id="b-tback">Back to the fire</button>
      </div>`;
    document.getElementById('b-tagain').onclick = () => talkOverlay(vid);
    document.getElementById('b-tback').onclick = () => villageScreen();
  }

  function villageScreen() {
    const st = Game.status();
    if (st.over) return ending();
    // first arrival: Mara gives the quest — the intro into the narrative
    if (!st.departed && !Game.state.questGiven) { questOverlay(() => villageScreen()); return; }
    const v = Game.villageInfo();
    const vs = Game.data.villagers;
    screen.innerHTML = `
      ${bar('scattering://village', 'haven')}
      <div class="ascii">      .-""-.
     / .--. \\
    | (    ) |
     \\ '--' /
      '--'--'</div>
      <h1 class="title">HAVEN</h1>
      <p><i>${v.atmos}</i></p>
      ${statRow('PANTRY', v.pantryKcal + ' kcal', Math.min(100, v.pantryKcal / 100), v.pantryKcal < 5000)}
      ${statRow('CODEX', v.codexN + ' entries', Math.min(100, v.codexN * 10))}
      <div class="card"><h3>Who's here</h3>
        ${vs.map(p => `<p class="small"><b>${p.name}</b> — ${p.formerOccupation}
          <button class="btn ghost sm" data-talk="${p.id}" style="margin-left:8px">Talk</button></p>`).join('')}
      </div>
      <div class="card"><h3>🗺 Nodes</h3>
        <p class="small">● <b>Haven</b> — you are here</p>
        <p class="small">○ <b>The Wilds</b> — 7×7 region, fog-of-war, one bulldozer (probably)</p>
      </div>
      ${st.departed
        ? `<div class="log">${st.log.slice(-6).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>
           <button class="btn" id="b-end">Rest by the fire</button>`
        : `<div class="btnrow">
             <button class="btn sm" id="b-water">Fill water</button>
             <button class="btn sm" id="b-fire">Sit by the fire</button>
           </div>
           <button class="btn" id="b-depart">Head into the wilds</button>`}
      <button class="btn ghost" id="b-codex2">Codex (${v.codexN})</button>`;
    screen.querySelectorAll('[data-talk]').forEach(b => b.onclick = () => talkOverlay(b.dataset.talk));
    const dep = document.getElementById('b-depart');
    if (dep) dep.onclick = () => { Game.depart(); gameMain(); };
    const end = document.getElementById('b-end');
    if (end) end.onclick = () => ending();
    const wat = document.getElementById('b-water');
    if (wat) wat.onclick = () => { Game.villageAction('water'); toast('Skin full. Cold. Clean.'); villageScreen(); };
    const fir = document.getElementById('b-fire');
    if (fir) fir.onclick = () => { Game.villageAction('fire'); villageScreen(); };
    document.getElementById('b-codex2').onclick = codexScreen;
  }

  // ---------- main game ----------
  // ---------- main game: the map is the decision screen ----------
  // tap a highlighted tile → travel there (time passes) → node detail
  // tap your ● → node detail. every action consumes the day-part; no "end part" button.
  function gameMain() {
    const st = Game.status();
    if (st.over) return ending();
    if (st.pendingEncounter) return combatIntro();
    if (st.inCombat) return combatScreen();

    const targets = Game.travelTargets();
    const tset = new Set(targets.map(t => t.x + ',' + t.y));
    const t = Game.playerTile();

    screen.innerHTML = `
      ${bar('scattering://field', `day ${st.day} · ${st.dayPart}`)}
      <p class="small">${st.dayPartHint}</p>
      ${statusBars(st)}
      <div class="map">${renderMap(st, tset)}</div>
      <p class="small">📍 ${S.TILE_NAME[t.type]} — tap a highlighted tile to travel (costs the ${st.dayPart}); tap ● to look around</p>
      <div class="actions">
        <button class="btn sm ghost" id="a-codex">Codex (${st.codexCount})</button>
      </div>
      <div class="log">${st.log.slice(-6).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>`;

    screen.querySelectorAll('.tile').forEach(el => {
      el.onclick = () => {
        const x = +el.dataset.x, y = +el.dataset.y;
        const s2 = Game.status();
        if (x === s2.px && y === s2.py) { nodeScreen(); return; }
        if (!Game.travelTo(x, y)) { toast('Not reachable — 3 tiles max, through scouted ground.'); return; }
        const s3 = Game.status();
        if (s3.over) return ending();
        if (s3.pendingEncounter) return combatIntro();
        if (s3.inCombat) return combatScreen();
        nodeScreen(true);
      };
    });
    document.getElementById('a-codex').onclick = codexScreen;
  }

  // ---------- node detail: each tile is a node; this is its detail screen ----------
  function nodeScreen(arrived) {
    const st = Game.status();
    if (st.over) return ending();
    if (st.pendingEncounter) return combatIntro();
    if (st.inCombat) return combatScreen();
    const n = Game.nodeDetail();

    screen.innerHTML = `
      ${bar('scattering://node', n.type)}
      <h1 class="title" style="font-size:22px">${esc(n.title).toUpperCase()}</h1>
      ${arrived ? `<p><i>${esc(n.text)}</i></p>` : ''}
      <p class="small">Here: ${n.here.length ? esc(n.here.join(' · ')) : 'nothing obvious'}</p>
      ${statusBars(st)}
      <div class="actions">
        <button class="btn sm" id="n-act" ${n.canForage ? '' : 'disabled'}>${n.isRuin ? 'Scavenge' : 'Forage'}</button>
        <button class="btn sm" id="n-treat" ${n.canTreat ? '' : 'disabled'}>Treat water</button>
        <button class="btn sm" id="n-rest">Rest</button>
        <button class="btn sm" id="n-wait">Wait</button>
      </div>
      <div class="actions">
        <button class="btn sm ghost" id="n-eat">Eat to full</button>
        <button class="btn sm ghost" id="n-drink" ${st.water > 0 ? '' : 'disabled'}>Drink clean (${st.water})</button>
        <button class="btn sm ghost" id="n-wild" ${n.canTreat ? '' : 'disabled'}>Drink wild</button>
        <button class="btn sm ghost" id="n-codex">Codex (${st.codexCount})</button>
      </div>
      <button class="btn ghost" id="n-map">Back to map</button>
      <div class="log">${st.log.slice(-4).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>`;

    // actions consume the day-part → back to the map for the next decision.
    // failed actions (null) didn't take time → stay here, message is in the log.
    const go = (kind) => {
      const r = Game.doAction(kind);
      if (r === null) nodeScreen();
      else gameMain();
    };
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on('n-act', () => go('forage'));
    on('n-treat', () => go('treat'));
    on('n-rest', () => go('rest'));
    on('n-wait', () => go('wait'));
    on('n-eat', () => { Game.eat(); nodeScreen(); });
    on('n-drink', () => { Game.drinkTreated(); nodeScreen(); });
    on('n-wild', () => { Game.drinkWild(); nodeScreen(); });
    on('n-codex', () => codexScreen());
    on('n-map', () => gameMain());
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
        const cls = 'tile' + (isP ? ' me' : '') + (tl.revealed ? '' : ' fog') + (isT ? ' dest' : '') + (isW ? ' beast' : '') + (tl.foraged && tl.revealed ? ' spent' : '');
        const g = isW ? '⚠' : (tl.revealed ? S.TILE_GLYPH[tl.type] : '?');
        html += `<div class="${cls}" data-x="${x}" data-y="${y}">${isP ? '●' : g}</div>`;
      }
      html += '</div>';
    }
    return html;
  }

  // ---------- combat ----------
  function combatIntro() {
    const st = Game.status();
    screen.innerHTML = `
      ${bar('scattering://field', `day ${st.day} · ⚠`)}
      ${statusBars(st)}
      <h1 class="title" style="font-size:22px">⚠ BULLDOZER ⚠</h1>
      <p class="small">It crashes from the thicket. It is not going around.</p>
      <div class="log">${st.log.slice(-3).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>
      <button class="btn" id="b-fight">Face it</button>`;
    document.getElementById('b-fight').onclick = () => { Game.startCombat(); combatScreen(); };
  }
  function combatScreen() {
    const st = Game.status();
    const f = Game.fight;
    if (!f) return gameMain();
    const mv = S.combat.MOVES[f.telegraph];
    screen.innerHTML = `
      ${bar('scattering://combat', `round ${f.round + 1}`)}
      ${statusBars(st)}
      <h1 class="title" style="font-size:22px">${f.monster.name.toUpperCase()}</h1>
      ${statRow('BULLDOZER', f.monster.hp + ' hp', f.monster.hp / f.monster.maxHp * 100, f.monster.hp < 15)}
      <div class="card warn"><h3>⚠ ${mv.name} incoming</h3><p class="small">${f.studied ? mv.hint : "It shifts — you can't quite read it. (STUDY it.)"}</p></div>
      <div class="actions">
        <button class="btn sm" data-c="strike">STRIKE</button>
        <button class="btn sm" data-c="harry">HARRY</button>
        <button class="btn sm" data-c="brace">BRACE</button>
      </div>
      <div class="actions">
        <button class="btn sm ghost" data-c="study">STUDY</button>
        <button class="btn sm ghost" data-c="flee">FLEE</button>
      </div>
      <div class="log">${f.log.slice(-4).map(l => `<p class="term-line">${esc(l)}</p>`).join('')}</div>`;
    screen.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      Game.combatRound(b.dataset.c);
      const s2 = Game.status();
      if (s2.over) return ending();
      if (!Game.fight) return gameMain();
      combatScreen();
    });
  }

  // ---------- codex ----------
  function codexScreen() {
    const entries = Game.codexEntries();
    const mons = Game.state.codex.monsters || {};
    screen.innerHTML = `
      ${bar('scattering://codex', entries.length + ' entries')}
      <h1 class="title" style="font-size:22px">CODEX</h1>
      <p class="small"><i>field journal — your handwriting. what you learned, the village keeps.</i></p>
      ${entries.length ? entries.map(e => `
        <div class="card codex"><h3>${e.name} <span class="small">· ${e.kcal} kcal/${e.unit}</span></h3>
        <p class="small"><b>Prep:</b> ${e.prep || '—'}</p><p>${e.text}</p></div>`).join('')
        : '<div class="card"><h3>No entries yet.</h3><p>Forage something. Survive it. Write it down.</p></div>'}
      ${Object.keys(mons).length ? '<h1 class="title" style="font-size:18px">BEASTS</h1>' + Object.entries(mons).map(([id, m]) => {
        const md = Game.data.monsters.find(x => x.id === id);
        return `<div class="card codex"><h3>${md.name}</h3><p class="small">System files it as: ${md.systemDesignation || '—'}</p><p>${esc(md.codexStages[m.stage] || '')}</p></div>`;
      }).join('') : ''}
      <button class="btn ghost" id="b-back">Back</button>`;
    document.getElementById('b-back').onclick = () => {
      const st = Game.status();
      if (st.location === 'village') villageScreen(); else gameMain();
    };
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
