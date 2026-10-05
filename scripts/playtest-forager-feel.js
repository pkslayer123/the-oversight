// Forager FEEL: 3 real days as a player, survival loop engaged.
// Works patches the way a human does: tap an adjacent green cell inside the
// tile's 9x9 detail grid, forage once, step to the next. Every say() message
// is captured for honesty/variety judging. Usage: node scripts/playtest-forager-feel.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay ? origSay.call(this, t) : t; };
const drain = () => { const m = said.join(' ||| '); said.length = 0; return m; };
drain();

const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };

// Work one tile like a player: step to adjacent green, forage, repeat.
// Returns {presses, kcalKnown, msgs[]}. Walking between patches is free.
function workTile(maxPresses) {
  const s = Game.state.scholar;
  const t = Game.playerTile();
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  let px = s.mx ?? 4, py = s.my ?? 4;
  let presses = 0, kcalKnown = 0;
  const msgs = [];
  const worked = (cx, cy) => !(t.detailRegrow && t.detailRegrow[cx + ',' + cy]) && !(Game.cellScorched && Game.cellScorched(cx, cy));
  const cellOk = (cx, cy) => cx >= 0 && cx <= 8 && cy >= 0 && cy <= 8 && FORAGEABLE[detail[cy] && detail[cy][cx]] && worked(cx, cy);
  while (presses < maxPresses) {
    // nearest unworked green on the whole grid
    let bx = -1, by = -1, bd = 1e9;
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      if (!cellOk(cx, cy)) continue;
      const d = Math.abs(cx - px) + Math.abs(cy - py);
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
    if (bx < 0) break; // tile fully worked
    if (bd > 1) { // walk one step toward it (free — the ACTION costs, not steps)
      px += Math.sign(bx - px); py += Math.sign(by - py);
      s.mx = px; s.my = py;
      continue;
    }
    const packBefore = (s.inventory || []).reduce((t, it) => t + (it.kcalEach || 0) * (it.units || 0), 0);
    drain();
    Game.doAction('forage', { cx: bx, cy: by });
    presses++;
    const packAfter = (s.inventory || []).reduce((t, it) => t + (it.kcalEach || 0) * (it.units || 0), 0);
    kcalKnown += Math.max(0, packAfter - packBefore);
    px = bx; py = by;
    let m = drain();
    msgs.push(m);
    if (/pack is full/i.test(m) && !workTile.testedToday) {
      // the intended unblock: test a lump from the pack, right here in the field
      const li = (s.inventory || []).findIndex(i => i.lump);
      if (li >= 0) { workTile.testedToday = true; Game.testCautiously(li, {}, s.inventory); msgs.push('[FIELD-TEST] ' + drain().slice(0, 300)); }
    }
    if (s.kcal < 1500) { Game.eat(); drain(); } // snack like a player
  }
  return { presses, kcalKnown, msgs };
}

function naturalTilesSorted(hx, hy, maxD) {
  const out = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (x === hx && y === hy) continue;
    const d = Math.abs(x - hx) + Math.abs(y - hy);
    if (d > maxD) continue;
    const t = Game.tileAt(x, y);
    if (!t || t.type === 'haven' || t.type === 'ruin' || !t.revealed) continue;
    out.push({ x, y, d, stock: t.stock || 0 });
  }
  out.sort((a, b) => a.d - b.d || b.stock - a.stock);
  return out;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  const hx = v.px ?? 3, hy = v.py ?? 3;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }
  drain();

  for (let day = 1; day <= 3; day++) {
    const dayMsgs = [];
    let presses = 0, tilesWorked = 0, kcalKnown = 0, identBefore = 0;
    const pantryBefore = Game.pantryKcal();
    Game.doAction('drink'); Game.eat(); drain();
    workTile.testedToday = false; // one field test per day, like a player would ration it
    const known0 = Object.keys(Game.state.codex.plants || {}).filter(pid => (Game.state.codex.plants[pid] || {}).level >= 1).length;
    for (const nt of naturalTilesSorted(hx, hy, 2)) {
      if ((Game.tileAt(nt.x, nt.y).stock || 0) <= 0) continue;
      Game.travelTo(nt.x, nt.y); drain();
      tilesWorked++;
      const r = workTile(10);
      presses += r.presses; kcalKnown += r.kcalKnown;
      dayMsgs.push(...r.msgs);
      if (presses >= 45) break; // a human stops mid-morning eventually
    }
    Game.returnToVillage();
    dayMsgs.push('[RETURN] ' + drain());
    const haulIn = Math.max(0, Game.pantryKcal() - pantryBefore);
    // camp ritual: solo sort, then ask a knower to sort what's left
    let soloNamed = 0, taughtNamed = 0;
    for (let g = 0; g < 20; g++) {
      const idx = (s.prepStash || []).findIndex(i => i.lump);
      if (idx < 0) break;
      const before = Object.keys(Game.state.codex.plants || {}).filter(pid => (Game.state.codex.plants[pid] || {}).level >= 1).length;
      Game.sortBag(null, idx);
      const after = Object.keys(Game.state.codex.plants || {}).filter(pid => (Game.state.codex.plants[pid] || {}).level >= 1).length;
      soloNamed += after - before;
      const m = drain(); if (/IDENTIFIED|clicks|naming:/.test(m)) dayMsgs.push('[SOLO-SORT] ' + m.slice(0, 200));
    }
    const knowers = (Game.villagePeople() || []).filter(p => (Game.villagerKnowsPlants(p.id) || []).length > 0);
    for (let g = 0; g < 10; g++) {
      const idx = (s.prepStash || []).findIndex(i => i.lump);
      if (idx < 0 || !knowers.length) break;
      const before = Object.keys(Game.state.codex.plants || {}).filter(pid => (Game.state.codex.plants[pid] || {}).level >= 1).length;
      Game.sortBag(knowers[0].id, idx);
      const after = Object.keys(Game.state.codex.plants || {}).filter(pid => (Game.state.codex.plants[pid] || {}).level >= 1).length;
      taughtNamed += after - before;
      const m = drain(); if (/IDENTIFIED|yours now too|naming:/.test(m)) dayMsgs.push('[TAUGHT-SORT] ' + m.slice(0, 200));
    }
    if (Game.nearFire()) { Game.cookAll(); const m = drain(); if (m) dayMsgs.push('[COOK] ' + m.slice(0, 160)); }
    Game.doAction('drink'); Game.eat();
    const known1 = Object.keys(Game.state.codex.plants || {}).filter(pid => (Game.state.codex.plants[pid] || {}).level >= 1).length;
    const fam = Object.keys(Game.state.codex.encounters || {}).length;
    const vProviders = (v.lastProviders || []).length;
    console.log(`\n===== DAY ${day} =====`);
    console.log(`presses=${presses} tiles=${tilesWorked} knownKcalFromForage=${Math.round(kcalKnown)} haulIn(pantry)=${Math.round(haulIn)} pantry=${Math.round(Game.pantryKcal())}`);
    console.log(`player: kcal=${Math.round(s.kcal)} hydr=${Math.round(s.hydration)} hp=${Math.round(s.health)} | known ${known0}->${known1} (solo+${soloNamed} taught+${taughtNamed}) familiar=${fam} | villagerProviders=${vProviders}`);
    const templates = {};
    for (const m of dayMsgs) {
      if (m.startsWith('[')) { console.log('  ' + m.slice(0, 220)); continue; }
      const key = m.replace(/\d+×/g, 'N×').replace(/\+?\d+[\d,]* kcal/g, 'K kcal').slice(0, 200);
      templates[key] = (templates[key] || 0) + 1;
    }
    console.log('  -- forage message templates:');
    for (const [k, n] of Object.entries(templates)) console.log(`  [x${n}] ${k}`);
    Game.endDay();
    if (Game.over || Game.villageLost) { console.log('GAME OVER on day', day); break; }
  }
  console.log('\nDONE');
})().catch(e => { console.error('PLAYTEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
