/* The Scattering — slice 0 scaffold. Screen router + title screen.
   Game systems land in slice 1 (see docs/ROADMAP.md). */
(function () {
  'use strict';
  const screen = document.getElementById('screen');
  const toastEl = document.getElementById('toast');

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), 2200);
  }

  function termBar(left, right) {
    return `<div class="term-bar"><span>${left}</span><span>${right}</span></div>`;
  }

  const Screens = {
    title() {
      screen.innerHTML = `
        ${termBar('scattering://village', 'day 0')}
        <div class="ascii">      .-\"\"-.
     / .--. \\
    | (    ) |
     \\ '--' /
      '--'--'</div>
        <h1 class="title">THE SCATTERING</h1>
        <div class="subtitle">a system-apocalypse survival roguelite<br>hunger is the final boss</div>
        <button class="btn" id="b-new">New Expedition</button>
        <button class="btn ghost" id="b-codex">Codex</button>
        <button class="btn ghost" id="b-about">About</button>
        <p class="small" style="margin-top:24px">slice 0 scaffold — game systems arrive in slice 1.<br>docs/ROADMAP.md has the plan.</p>`;
      document.getElementById('b-new').onclick = () => Screens.village();
      document.getElementById('b-codex').onclick = () => Screens.codex();
      document.getElementById('b-about').onclick = () => Screens.about();
    },

    village() {
      screen.innerHTML = `
        ${termBar('scattering://village', 'day 1 · spring')}
        <h1 class="title" style="font-size:22px">VILLAGE</h1>
        <div class="stat"><div class="lbl"><span>HEALTH</span><span>100</span></div><div class="bar"><i style="width:100%"></i></div></div>
        <div class="stat"><div class="lbl"><span>FOOD</span><span>1,850 kcal</span></div><div class="bar low"><i style="width:38%"></i></div></div>
        <div class="stat"><div class="lbl"><span>WATER</span><span>3.0 L</span></div><div class="bar"><i style="width:75%"></i></div></div>
        <div class="stat"><div class="lbl"><span>MORALE</span><span>steady</span></div><div class="bar"><i style="width:60%"></i></div></div>
        <div class="card"><h3>Mara Okafor</h3><p>ex-ER nurse · scholar-designate<br>abilities: Triage, Steady Hands</p></div>
        <button class="btn" id="b-exp">Begin expedition (slice 1)</button>
        <button class="btn ghost" id="b-back">Back</button>`;
      document.getElementById('b-exp').onclick = () => toast('Expedition gameplay lands in slice 1.');
      document.getElementById('b-back').onclick = () => Screens.title();
    },

    codex() {
      screen.innerHTML = `
        ${termBar('scattering://codex', '0 entries')}
        <h1 class="title" style="font-size:22px">CODEX</h1>
        <p class="small">Held by the village Codex-keeper. Every plant correctly identified and survived becomes a permanent entry — across all scholars, across all deaths.</p>
        <div class="card"><h3>No entries yet.</h3><p>Die with knowledge, and it lives here.</p></div>
        <button class="btn ghost" id="b-back">Back</button>`;
      document.getElementById('b-back').onclick = () => Screens.title();
    },

    about() {
      screen.innerHTML = `
        ${termBar('scattering://about', 'v0.0.1')}
        <h1 class="title" style="font-size:22px">ABOUT</h1>
        <p class="small">The System scattered humanity into villages across a twisted Earth. It granted combat abilities freely — and forgot the survival basics.</p>
        <p class="small">You are a designated scholar of the village Codex. Keep the village fed. Grow the Codex. Survive the year.</p>
        <p class="small">Design docs: <span style="color:var(--acc)">docs/</span> in the repo.</p>
        <button class="btn ghost" id="b-back">Back</button>`;
      document.getElementById('b-back').onclick = () => Screens.title();
    }
  };

  Screens.title();
})();
