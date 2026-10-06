// Knowledge-gating playtest (2026-10-05): verify "if you don't know, it
// doesn't show" for a fresh ignorant day-1 player.
// Usage: node scripts/knowledge-playtest.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/corpses.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}`); }
}
function drain() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  const c = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, c.id);
  Game.depart();
  drain();
  const st = Game.state;

  // go to a wild node (mirrors debug-scenarios toWildNode: actually out,
  // distance >= 2 from haven, no travel clock, no encounters)
  (function toWildNode() {
    const tiles = Game.map.tiles;
    let best = null;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const t = tiles[y][x];
      if (!t || t.type === 'haven' || t.type === 'ruin') continue;
      const d = Math.abs(x - 3) + Math.abs(y - 3);
      if (d < 2) continue;
      if (!best || d > best.d) best = { x, y, d };
    }
    if (!best) { console.log('no wild tile'); process.exit(2); }
    Game.map.px = best.x; Game.map.py = best.y;
    tiles[best.y][best.x].visited = true; tiles[best.y][best.x].revealed = true;
    st.scholar.insideHaven = false; st.scholar.mx = 4; st.scholar.my = 4;
  })();

  const nd = Game.nodeDetail();
  console.log('=== NODE DETAIL "here" (ignorant) ===');
  console.log(nd.here.join('\n'));

  // check: no real plant names in "here" for unknown species
  const plantNames = Game.data.plants.map(p => ({ id: p.id, name: p.name.toLowerCase() }));
  const leaks = [];
  for (const h of nd.here) {
    for (const n of plantNames) {
      if (n.name.length > 4 && h.toLowerCase().includes(n.name) && !Game.plantKnown(n.id)) {
        leaks.push(`${h} :: leaks "${n.name}"`);
      }
    }
  }
  ok('no plant-name leaks in nodeDetail.here', leaks.length === 0);
  if (leaks.length) console.log(leaks.join('\n'));

  // blind forage (area sweep around player)
  Game.doAction('forage');
  const log = drain();
  console.log('=== BLIND FORAGE LOG ===');
  console.log(log.slice(0, 1200));
  console.log('=== PACK (display vs raw) ===');
  for (const it of (st.scholar.inventory || []).slice(0, 14)) {
    console.log('-', JSON.stringify(Game.itemDisplayName(it)), '| raw:', JSON.stringify(it.name), '| kcalEach:', it.kcalEach, '| edible:', it.edible, '| plantId:', it.plantId);
  }
  // blind forage must not put kcal-bearing edible items in pack for unknown species
  const kcalLeaks = [];
  for (const it of (st.scholar.inventory || [])) {
    if (it.plantId && Game.data.plants.find(p => p.id === it.plantId)) {
      if (it.kcalEach && it.kcalEach > 0 && !Game.plantKnown(it.plantId)) {
        kcalLeaks.push(`${Game.itemDisplayName(it)} shows ${it.kcalEach} kcal but species unknown`);
      }
    }
  }
  ok('no kcal leaks for unknown plants in pack', kcalLeaks.length === 0);
  if (kcalLeaks.length) console.log(kcalLeaks.join('\n'));

  // do the log lines from the blind forage leak species names?
  const logLeaks = [];
  for (const n of plantNames) {
    if (n.name.length > 4 && log.toLowerCase().includes(n.name) && !Game.plantKnown(n.id)) {
      logLeaks.push(`log leaks "${n.name}"`);
    }
  }
  ok('blind-forage log hides unknown species names', logLeaks.length === 0);
  if (logLeaks.length) console.log(logLeaks.join('\n'));

  // name-privacy check: unknown species items must show the descriptor, not the name
  const nameLeaks = [];
  for (const it of (st.scholar.inventory || [])) {
    if (it.plantId && Game.data.plants.find(p => p.id === it.plantId) && !Game.plantKnown(it.plantId)) {
      const disp = Game.itemDisplayName(it).toLowerCase();
      const p = Game.data.plants.find(pp => pp.id === it.plantId);
      if (disp.includes(p.name.toLowerCase())) nameLeaks.push(`pack shows real name "${p.name}" for unknown species`);
    }
  }
  ok('pack shows descriptors not names for unknown plants', nameLeaks.length === 0);
  if (nameLeaks.length) console.log(nameLeaks.join('\n'));

  console.log(`\npass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
