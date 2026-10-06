// Forager KNOWLEDGE LOOP playtest (2026-10-05, loop rotation 0):
// learn -> recognize -> forage deliberately. As a player: does knowledge
// actually change how a forage day FEELS and PAYS? Blind day 1 vs
// deliberate day 2-3 on fresh wild tiles. Glyph reveal, sort ritual,
// teaching, level-up yields.
// Usage: node scripts/playtest-forager-knowledge.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay ? origSay.call(this, t) : t; };
const drain = () => { const m = said.join(' ||| '); said.length = 0; return m; };
drain();

// UI glyph logic, copied verbatim from app.js renderDetail (knowledge-gated):
const PLANT_GLYPH = {
  hickory_nut: '🌰', acorn_white_oak: '🌰', blackberry: '🫐', dandelion: '🌼',
  cattail: '🌾', persimmon: '🍑', muscadine: '🍇', wild_onion: '🧅',
  chickweed: '🌱', wood_sorrel: '☘️',
};
function glyphFor(tile, cx, cy, cell) {
  const sp = (tile.plantSpecies || {})[cx + ',' + cy];
  if (cell === 'plant') {
    const spKnown = sp && Game.plantKnown(sp);
    return (spKnown && PLANT_GLYPH[sp]) ? PLANT_GLYPH[sp] : '🌱';
  }
  if (cell === 'bush') {
    const bs = (tile.bushSpecies || {})[cx + ',' + cy];
    const codex = (Game.state.codex || {}).plants || {};
    if (bs && codex[bs] && codex[bs].level >= 1) return PLANT_GLYPH[bs] || '🌿';
    return bs ? '🫐' : '🌿';
  }
  return '?';
}
// count what the grid would show the player right now
function glyphCensus() {
  const tile = Game.playerTile();
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const census = { plants: 0, speciesShown: 0, blind: 0, bushes: 0, bushKnown: 0, shownSpecies: {} };
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const cell = detail[cy] && detail[cy][cx];
    if (cell === 'plant') {
      census.plants++;
      const g = glyphFor(tile, cx, cy, 'plant');
      if (g === '🌱') census.blind++; else { census.speciesShown++; const sp = (tile.plantSpecies || {})[cx + ',' + cy]; census.shownSpecies[sp] = (census.shownSpecies[sp] || 0) + 1; }
    } else if (cell === 'bush') {
      census.bushes++;
      const g = glyphFor(tile, cx, cy, 'bush');
      if (g === '🫐' || g === '🌿') { /* unknown */ } else census.bushKnown++;
    }
  }
  return census;
}

const FORAGEABLE = { plant: 1, bush: 1, tree: 1, bigtree: 1 };
function unworked(t, cx, cy) { return !(t.detailRegrow && t.detailRegrow[cx + ',' + cy]) && !(Game.cellScorched && Game.cellScorched(cx, cy)); }

// Work a tile. deliberate=true: only tap plant cells whose species is KNOWN
// (the skilled play). deliberate=false: tap everything green (blind).
function workTile(maxPresses, deliberate, censusOut) {
  const s = Game.state.scholar;
  const tile = Game.playerTile();
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  let px = s.mx ?? 4, py = s.my ?? 4;
  let presses = 0, knownKcal = 0, blindPresses = 0, deliberatePresses = 0;
  const msgs = [];
  const cellOk = (cx, cy) => cx >= 0 && cx <= 8 && cy >= 0 && cy <= 8 && FORAGEABLE[detail[cy] && detail[cy][cx]] && unworked(tile, cx, cy);
  const cellTargeted = (cx, cy) => {
    if (!deliberate) return true;
    const cell = detail[cy][cx];
    if (cell === 'plant') return glyphFor(tile, cx, cy, 'plant') !== '🌱';
    return true; // bushes/trees: visible species-or-berry is actionable either way
  };
  while (presses < maxPresses) {
    let bx = -1, by = -1, bd = 1e9;
    for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
      if (!cellOk(cx, cy) || !cellTargeted(cx, cy)) continue;
      const d = Math.abs(cx - px) + Math.abs(cy - py);
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
    if (bx < 0) break;
    if (bd > 1) { px += Math.sign(bx - px); py += Math.sign(by - py); s.mx = px; s.my = py; continue; }
    const inv = s.inventory || [];
    const packBefore = inv.reduce((t, it) => t + (it.kcalEach || 0) * (it.units || 0), 0);
    const stashBefore = (s.prepStash || []).length;
    drain();
    const isDelib = deliberate && glyphFor(tile, bx, by, detail[by][bx]) !== '🌱';
    Game.doAction('forage', { cx: bx, cy: by });
    presses++;
    if (deliberate) { if (isDelib) deliberatePresses++; else blindPresses++; }
    const packAfter = (s.inventory || []).reduce((t, it) => t + (it.kcalEach || 0) * (it.units || 0), 0);
    const stashAfter = (s.prepStash || []).length;
    knownKcal += Math.max(0, packAfter - packBefore);
    px = bx; py = by; s.mx = px; s.my = py;
    const m = drain();
    if (/IDENTIFIED|Deeper knowledge|MASTERY|clicks|teaches|showed you|yours now too/.test(m)) msgs.push('[KNOW] ' + m.slice(0, 260));
    if (stashAfter > stashBefore) msgs.push('[LUMP] ' + m.slice(0, 120));
    if (/pack is full/i.test(m)) { msgs.push('[FULL] ' + m.slice(0, 120)); break; }
    if (s.kcal < 1500) { Game.eat(); drain(); }
  }
  return { presses, knownKcal, blindPresses, deliberatePresses, msgs };
}

function wildTilesSorted(hx, hy, minD, maxD, skip) {
  const out = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (x === hx && y === hy) continue;
    if (skip && skip.has(x + ',' + y)) continue;
    const d = Math.abs(x - hx) + Math.abs(y - hy);
    if (d < minD || d > maxD) continue;
    const t = Game.tileAt(x, y);
    if (!t || t.type === 'haven' || t.type === 'ruin' || !t.revealed) continue;
    out.push({ x, y, d, stock: t.stock || 0 });
  }
  out.sort((a, b) => a.d - b.d || b.stock - a.stock);
  return out;
}

function countKnown() {
  return Object.keys(Game.state.codex.plants || {}).filter(pid => (Game.state.codex.plants[pid] || {}).level >= 1).length;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  // most ignorant playable character: no plant background
  const ign = Game.generatedRoster.find(c => /accountant|bus driver|dropout|analyst|cashier/i.test(c.formerOccupation || '')) || Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, ign.id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  const hx = v.px ?? 3, hy = v.py ?? 3;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }
  drain();
  console.log('playing as', ign.name, '/', ign.formerOccupation, '| known plants at start:', countKnown());
  const used = new Set();

  // ---------- DAY 1: BLIND ----------
  console.log('\n===== DAY 1 (blind) =====');
  Game.doAction('drink'); Game.eat(); drain();
  let presses1 = 0, kcal1 = 0, tiles1 = 0;
  for (const nt of wildTilesSorted(hx, hy, 2, 3, used)) {
    if ((Game.tileAt(nt.x, nt.y).stock || 0) <= 0) continue;
    Game.travelTo(nt.x, nt.y); drain();
    const cen = glyphCensus();
    console.log(`tile (${nt.x},${nt.y}): plants=${cen.plants} speciesShown=${cen.speciesShown} blind=${cen.blind} bushes=${cen.bushes} bushKnown=${cen.bushKnown}`);
    used.add(nt.x + ',' + nt.y); tiles1++;
    const r = workTile(12, false);
    presses1 += r.presses; kcal1 += r.knownKcal;
    for (const m of r.msgs) console.log('  ' + m.slice(0, 200));
    if (presses1 >= 24) break;
  }
  Game.returnToVillage(); drain();
  console.log(`day1 blind: presses=${presses1} tiles=${tiles1} knownKcal=${Math.round(kcal1)} | player kcal=${Math.round(s.kcal)}`);
  const fam1 = Object.keys(Game.state.codex.encounters || {}).length;
  console.log(`familiar-species=${fam1} (encounter counts) | known=${countKnown()}`);

  // ---------- EVENING RITUAL: sort ----------
  console.log('\n===== EVENING SORT (camp) =====');
  let soloNamed = 0;
  for (let g = 0; g < 20; g++) {
    const idx = (s.prepStash || []).findIndex(i => i.lump);
    if (idx < 0) break;
    const b = countKnown(); Game.sortBag(null, idx); const a = countKnown();
    soloNamed += a - b;
    const m = drain();
    if (/named|naming|clicks|mystery|frowning/i.test(m)) console.log('  [SOLO] ' + m.slice(0, 240));
  }
  const knowers = Game.whoKnowsLump ? [] : [];
  let taughtNamed = 0, teacher = null;
  for (let g = 0; g < 20; g++) {
    const idx = (s.prepStash || []).findIndex(i => i.lump);
    if (idx < 0) break;
    const wk = Game.whoKnowsLump((s.prepStash || [])[idx]);
    if (!wk.length) { console.log('  nobody here knows anything in this lump'); break; }
    teacher = teacher || wk[0];
    const b = countKnown(); Game.sortBag(wk[0].id, idx); const a = countKnown();
    taughtNamed += a - b;
    const m = drain();
    if (/named|yours now too|IDENTIFIED|mystery/i.test(m)) console.log(`  [${wk[0].name.toUpperCase()}] ` + m.slice(0, 240));
    if (g === 0) break; // show first; rest counted silently
  }
  // count remaining taught silently
  for (let g = 1; g < 20; g++) {
    const idx = (s.prepStash || []).findIndex(i => i.lump);
    if (idx < 0) break;
    const wk = Game.whoKnowsLump((s.prepStash || [])[idx]);
    if (!wk.length) break;
    const b = countKnown(); Game.sortBag(wk[0].id, idx); const a = countKnown();
    taughtNamed += a - b; drain();
  }
  console.log(`sort result: solo-named=${soloNamed} taught-named=${taughtNamed} teacher=${teacher ? teacher.name + ' (' + teacher.occupation + ')' : 'none'} known=${countKnown()}`);
  if (Game.nearFire()) { Game.cookAll(); drain(); }
  Game.doAction('drink'); Game.eat();
  const pantryBefore = Game.pantryKcal();
  Game.endDay();
  if (Game.over || Game.villageLost) { console.log('GAME OVER day 1'); process.exit(0); }

  // ---------- DAY 2: KNOWLEDGEABLE, fresh tiles ----------
  console.log('\n===== DAY 2 (deliberate, fresh tiles) =====');
  Game.doAction('drink'); Game.eat(); drain();
  let presses2 = 0, kcal2 = 0, delib2 = 0, blind2 = 0, tiles2 = 0;
  for (const nt of wildTilesSorted(hx, hy, 2, 4, used)) {
    if ((Game.tileAt(nt.x, nt.y).stock || 0) <= 0) continue;
    Game.travelTo(nt.x, nt.y); drain();
    const cen = glyphCensus();
    console.log(`tile (${nt.x},${nt.y}): plants=${cen.plants} speciesShown=${cen.speciesShown} blind=${cen.blind} bushes=${cen.bushes} bushKnown=${cen.bushKnown}`);
    console.log(`  shown species: ${JSON.stringify(cen.shownSpecies)}`);
    used.add(nt.x + ',' + nt.y); tiles2++;
    const r = workTile(12, true);
    presses2 += r.presses; kcal2 += r.knownKcal; delib2 += r.deliberatePresses; blind2 += r.blindPresses;
    for (const m of r.msgs) console.log('  ' + m.slice(0, 200));
    if (presses2 >= 24) break;
  }
  Game.returnToVillage(); drain();
  console.log(`day2 deliberate: presses=${presses2} (deliberate=${delib2} fallback-blind=${blind2}) tiles=${tiles2} knownKcal=${Math.round(kcal2)}`);
  console.log(`kcal/press: day1=${(kcal1 / Math.max(1, presses1)).toFixed(1)} day2=${(kcal2 / Math.max(1, presses2)).toFixed(1)}`);
  // harvest counts toward level 2?
  const lvls = Object.entries(Game.state.codex.plants || {}).map(([pid, e]) => ({ pid, level: e.level, harvests: e.harvests || 0 })).sort((a, b) => b.harvests - a.harvests).slice(0, 6);
  console.log('top harvested:', JSON.stringify(lvls));
  Game.doAction('drink'); Game.eat();
  Game.endDay();
  console.log('\nDONE | pantry=' + Math.round(Game.pantryKcal()) + ' known=' + countKnown() + ' playerKcal=' + Math.round(s.kcal));
})().catch(e => { console.error('PLAYTEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
