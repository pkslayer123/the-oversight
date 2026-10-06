// Forager archetype: depletion + regrow + press economy + pantry rot.
// As a player: how many presses does a tile take to strip? Is the press
// churn fun or chores? Does the land come back when promised? Does the
// pantry rot out from under the village?
// Usage: node scripts/playtest-forager-depletion.js
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
const drain = () => { const m = said.join(' '); said.length = 0; return m; };
const invKcal = () => (Game.state.scholar.inventory || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);

function greenCells(t, skipRegrow) {
  const out = [];
  if (!t.detail) return out;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const c = t.detail[y] && t.detail[y][x];
    if (c !== 'plant' && c !== 'bush' && c !== 'tree' && c !== 'bigtree') continue;
    if (skipRegrow && t.detailRegrow && t.detailRegrow[x + ',' + y]) continue;
    out.push({ x, y, c });
  }
  return out;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const v = Game.state.village;
  const hx = v.px ?? 3, hy = v.py ?? 3;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }

  // richest natural tile within 2 rings — by actual green cells in the
  // detail grid (map-level stock is a pre-visit placeholder; the grid is
  // the truth). Detail must be generated first: travel there and back.
  const cand = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const d = Math.abs(x - hx) + Math.abs(y - hy);
    if (d < 1 || d > 2) continue;
    const t = Game.tileAt(x, y);
    if (!t || t.type === 'haven' || t.type === 'ruin') continue;
    cand.push({ x, y, t });
  }
  Game.travelTo(hx, hy); // ensure we're somewhere sane first
  let best = null;
  for (const c of cand) {
    Game.travelTo(c.x, c.y);
    const g = greenCells(c.t, false).length;
    if (!best || g > best.g) best = { ...c, g };
  }
  console.log('target tile:', best.x, best.y, 'type=' + best.t.type, 'greenCells=' + best.g, 'stock=' + best.t.stock + '/' + best.t.maxStock);

  Game.travelTo(best.x, best.y);
  s.kcal = 2400; s.hydration = 100; s.health = 100; s.energy = 100;

  // ---- PHASE 1: strip the tile ----
  let presses = 0, kcal0 = invKcal(), ticks0 = s.dayTicks || 0, kcalSpent = 0;
  const templates = {};
  let stoppedWhy = '';
  for (let g = 0; g < 80; g++) {
    const greens = greenCells(best.t, true);
    if (!greens.length || (best.t.stock || 0) <= 0) { stoppedWhy = 'no green / stock 0'; break; }
    const gc = greens[0];
    s.mx = gc.x; s.my = gc.y;
    const before = s.kcal;
    drain();
    Game.doAction('forage');
    presses++;
    kcalSpent += Math.max(0, before - s.kcal);
    const m = drain();
    const key = m.replace(/\d+×/g, 'N×').replace(/\+?[\d,]+ kcal/g, 'K kcal').slice(0, 160);
    templates[key] = (templates[key] || 0) + 1;
    if (/Nothing within reach|Nothing left to take here|worked out — step/i.test(m)) { stoppedWhy = 'message: ' + m.slice(0, 90); break; }
    if (presses >= 60) { stoppedWhy = 'press cap'; break; }
  }
  const kcalGained = invKcal() - kcal0;
  const ticksSpent = (s.dayTicks || 0) - ticks0;
  console.log(`\nSTRIP: presses=${presses} stopped=[${stoppedWhy}]`);
  console.log(`  inventory kcal gained=${Math.round(kcalGained)} (est kcal/press=${(kcalGained / Math.max(1, presses)).toFixed(1)})`);
  console.log(`  player kcal spent=${Math.round(kcalSpent)} ticks spent=${ticksSpent} (ticks/press=${(ticksSpent / Math.max(1, presses)).toFixed(1)})`);
  console.log(`  tile stock after: ${best.t.stock}/${best.t.maxStock} regrowingCells=${Object.keys(best.t.detailRegrow || {}).length}`);
  console.log('  message templates:');
  for (const [k, n] of Object.entries(templates)) console.log(`    [x${n}] ${k}`);

  // ---- PHASE 2: haul home, pantry snapshot ----
  Game.returnToVillage(); drain();
  const pantryItems = (v.pantry || []).map(i => ({ name: i.name, units: i.units, kcalEach: i.kcalEach, spoilDay: i.spoilDay }));
  console.log(`\npantry after return: ${Math.round(Game.pantryKcal())} kcal across ${pantryItems.length} stacks`);
  const perish = pantryItems.filter(i => i.spoilDay !== 9999).slice(0, 8);
  console.log('  perishable stacks:', JSON.stringify(perish));

  // ---- PHASE 3: days pass — regrow + rot watch ----
  const startDay = s.day;
  const regrowStart = Object.keys(best.t.detailRegrow || {}).length;
  console.log(`\nREGROW WATCH (start day ${startDay}, ${regrowStart} cells regrowing, promise: "a few days"/day+2)`);
  for (let d = 1; d <= 7; d++) {
    s.kcal = 2400; s.hydration = 100; s.health = 100; // isolate the loop
    drain();
    Game.endDay();
    const m = drain();
    const rotNotes = [];
    for (const line of m.split(/(?<=[.!?])\s+/)) if (/spoil|rot|rotten|mold|gone bad|wasted/i.test(line)) rotNotes.push(line.slice(0, 120));
    const left = Object.keys(best.t.detailRegrow || {}).length;
    console.log(`day ${s.day}: stock=${best.t.stock}/${best.t.maxStock} regrowing=${left} pantry=${Math.round(Game.pantryKcal())}${rotNotes.length ? ' ROTMSG: ' + rotNotes.join(' | ') : ''}`);
    if (Game.over || Game.villageLost) { console.log('GAME OVER'); break; }
  }

  // ---- PHASE 4: revisit the stripped tile — is the promise kept? ----
  Game.travelTo(best.x, best.y); drain();
  const greens = greenCells(best.t, true);
  console.log(`\nrevisit day ${s.day}: green cells now=${greens.length} stock=${best.t.stock}/${best.t.maxStock}`);
  s.mx = 4; s.my = 4;
  Game.doAction('forage'); presses++;
  console.log('  forage here says:', drain().slice(0, 200));
  console.log('\nDONE');
})().catch(e => { console.error('PLAYTEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
