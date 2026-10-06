// Regrow timing: the 3-day promise, pinned (forager loop 2026-10-05).
// "The plant you picked comes back in 3 days" — stripped on day N, playable
// again on the morning of day N+3. An off-by-one (restore running in endDay
// BEFORE day++) made it 4 days. Tracks SPECIFIC cells (villagers compete, so
// global green counts are noisy). Both strip paths must tag day+2.
// Usage: node scripts/test-regrow-timing.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
function tileGreen(t) {
  const rg = t.detailRegrow || {};
  let n = 0;
  if (!t.detail) return 0;
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const c = t.detail[cy] && t.detail[cy][cx];
    if (FORAGEABLE[c] && !rg[cx + ',' + cy]) n++;
  }
  return n;
}
function endDayQuiet() {
  const d = Game.state.scholar.day;
  let guard = 0;
  while (Game.state.scholar.day === d && !Game.over && guard++ < 40) {
    const rem = Game.TIME.TICKS_PER_DAY - (Game.state.scholar.dayTicks || 0);
    if (rem <= 0) break;
    try { Game.tickAction(Math.min(Game.TIME.TICKS_PER_BATCH, rem)); } catch (e) { break; }
  }
}
function wildNode() {
  return Game.travelTargets().filter(t => {
    if (Game.travelBlockage(t.x, t.y)) return false;
    const tile = Game.tileAt(t.x, t.y);
    return tile && tile.type !== 'haven' && tile.type !== 'ruin';
  })[0];
}
function cellIsGreen(t, cx, cy) {
  const c = t.detail && t.detail[cy] && t.detail[cy][cx];
  return !!(FORAGEABLE[c] && !(t.detailRegrow && t.detailRegrow[cx + ',' + cy]));
}

(async () => {
  await Game.init();
  Game.genRoster('Minneapolis, USA');
  Game.newGame('Minneapolis, USA', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 2400; s.health = 100;

  // --- path 1: player harvest — track the exact cells stripped ---
  const n1 = wildNode();
  Game.travelTo(n1.x, n1.y);
  const t1 = Game.playerTile();
  Game.genDetail(Game.map.px, Game.map.py);
  // pick 3 green cells to watch
  const watch = [];
  for (let cy = 0; cy < 9 && watch.length < 3; cy++) for (let cx = 0; cx < 9 && watch.length < 3; cx++) {
    if (cellIsGreen(t1, cx, cy)) watch.push([cx, cy]);
  }
  ok('node has watchable green cells', watch.length === 3, `found ${watch.length}`);
  const dayN = s.day;
  const tagsBefore = new Set(Object.keys(t1.detailRegrow || {}));
  // harvest each watched cell via the real path (stand on it, forage).
  // A press sweeps 3x3, so watched cells may already be tagged by an earlier
  // press — and the pack may fill (a player snacks or leaves things).
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return t; };
  for (const [cx, cy] of watch) {
    s.mx = cx; s.my = cy; s.kcal = 2400;
    let guard = 0;
    while (!(t1.detailRegrow || {})[`${cx},${cy}`] && guard++ < 6) {
      if (!Game.canCarry(1)) {
        try { Game.eat(); } catch (e) {}
        if (!Game.canCarry(1)) {
          const idx = (s.inventory || []).findIndex(i => !i.bonded);
          if (idx >= 0) { try { Game.dropItem(idx); } catch (e) { break; } }
          else break;
        }
      }
      said.length = 0;
      Game.doAction('forage');
      if (said.some(m => /pack is full/i.test(m))) continue;
      break;
    }
  }
  Game.say = origSay;
  const newTags = Object.keys(t1.detailRegrow || {}).filter(k => !tagsBefore.has(k));
  ok('harvest tagged cells', newTags.length > 0, `new tags=${newTags.length}`);
  // (a press sweeps 3x3, so some watched cells were tagged by a neighbor's
  // press; a species-less plant cell may skip harvest — assert on the cells
  // that were actually tagged, requiring at least 2 for a real signal)
  const taggedWatched = watch.filter(([cx, cy]) => (t1.detailRegrow || {})[`${cx},${cy}`]);
  ok('at least 2 watched cells were harvested', taggedWatched.length >= 2,
    `tagged=${taggedWatched.length}/3`);
  const watchedTags = taggedWatched.map(([cx, cy]) => (t1.detailRegrow[`${cx},${cy}`] || {}).day);
  ok('harvest tags at day+2 (the 3-day promise)',
    watchedTags.every(d => d === dayN + 2),
    `day=${dayN} watched tags=${JSON.stringify(watchedTags)}`);
  ok('harvested cells are barren right after harvest',
    taggedWatched.every(([cx, cy]) => !cellIsGreen(t1, cx, cy)));
  endDayQuiet(); // -> N+1
  ok('day N+1: harvested cells still barren',
    taggedWatched.every(([cx, cy]) => !cellIsGreen(t1, cx, cy)), `day=${s.day}`);
  endDayQuiet(); // -> N+2
  ok('day N+2: harvested cells still barren',
    taggedWatched.every(([cx, cy]) => !cellIsGreen(t1, cx, cy)), `day=${s.day}`);
  endDayQuiet(); // -> N+3
  // a villager may have re-stripped a restored cell on a later night (honest
  // competition) — that's a NEW tag (day > N+2), not a broken promise.
  const restoredOk = taggedWatched.map(([cx, cy]) => {
    if (cellIsGreen(t1, cx, cy)) return true;
    const tag = (t1.detailRegrow || {})[`${cx},${cy}`];
    const td = tag && (typeof tag === 'object' ? tag.day : tag);
    return td > dayN + 2;
  });
  ok('day N+3 morning: harvested cells restored (3-day promise holds)',
    restoredOk.every(Boolean),
    `day=${s.day} ok=${restoredOk.join(',')}`);

  // --- path 2: villager competition tags the same schedule ---
  // fresh game: path 1's foraging + sim days may have stripped the local turf
  Game.genRoster('Minneapolis, USA');
  Game.newGame('Minneapolis, USA', null, Game.generatedRoster[0].id);
  Game.depart();
  const s2 = Game.state.scholar;
  s2.kcal = 2400; s2.health = 100;
  // (visit every wild node first so all tiles have a grid to strip —
  // unvisited tiles have no detail yet, only abstract stock)
  const dayM = Game.state.scholar.day;
  const allWild = Game.travelTargets().filter(t => {
    if (Game.travelBlockage(t.x, t.y)) return false;
    const tile = Game.tileAt(t.x, t.y);
    return tile && tile.type !== 'haven' && tile.type !== 'ruin';
  });
  for (const t of allWild) { Game.travelTo(t.x, t.y); Game.genDetail(Game.map.px, Game.map.py); Game.state.scholar.kcal = 2400; }
  const allTagsBefore = new Set();
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = Game.tileAt(x, y);
    for (const k of Object.keys((t && t.detailRegrow) || {})) allTagsBefore.add(`${x},${y}:${k}`);
  }
  Game.depleteRandomTile(4, Game.map.px, Game.map.py);
  const newVTags = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = Game.tileAt(x, y);
    for (const k of Object.keys((t && t.detailRegrow) || {})) {
      if (!allTagsBefore.has(`${x},${y}:${k}`)) {
        const r = t.detailRegrow[k];
        newVTags.push({ tile: `${x},${y}`, key: k, day: (typeof r === 'object') ? r.day : r });
      }
    }
  }
  ok('villager strip created tags', newVTags.length > 0, `new=${newVTags.length}`);
  ok('villager strip tags at day+2 (same schedule as the player)',
    newVTags.every(t => t.day === dayM + 2),
    `day=${dayM} tags=${JSON.stringify(newVTags.slice(0, 3).map(t => t.day))}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
