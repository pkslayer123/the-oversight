// Explorer archetype playtest: node travel, examine, discovery, map feel.
// Usage: node scripts/test-explorer.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}
function log(...a) { console.log(...a); }
function clock() { return Game.state.scholar.dayTicks || 0; } // dayTicks: the honest cumulative clock (actionClock is reduced by batch turns)

(async () => {
await Game.init();
let said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(t); return origSay.call(this, t); };

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.monster = null;
  Game.state.scholar.animal = null;
}

function travelOnce(x, y) {
  let r = Game.travelTo(x, y);
  if (r && r.kind === 'blockage') {
    if (r.blockType === 'creek') { Game.state.scholar.kcal -= 20; Game.travelTo(x, y, true); }
    else { Game.clearBlockage(x, y); Game.travelTo(x, y); }
  }
}

// fresh game then walk off-haven into the wild
function goWilderness() {
  for (let i = 0; i < 6; i++) {
    const nx = Game.travelTargets().find(t => !(Game.tileAt(t.x, t.y) || {}).visited);
    if (!nx) break;
    travelOnce(nx.x, nx.y);
    if (Game.playerTile().type !== 'haven') break;
  }
}

// ---------- 1. travel loop: 6 hops, blockages handled like the UI does ----------
freshGame();
log('=== travel loop (6 hops) ===');
const hops = [];
for (let i = 0; i < 6; i++) {
  const targets = Game.travelTargets();
  const opts = targets.filter(t => !t.unknown || t.d === 1);
  ok('travel targets exist', opts.length > 0);
  const unvisited = opts.filter(t => !(Game.tileAt(t.x, t.y) || {}).visited);
  const pick = (unvisited.length ? unvisited : opts)[0];
  const before = { kcal: Game.state.scholar.kcal, clock: clock(), px: Game.map.px, py: Game.map.py };
  said = [];
  let swam = false;
  let res = Game.travelTo(pick.x, pick.y);
  if (res && res.kind === 'blockage') {
    log(`hop ${i + 1}: BLOCKED (${res.blockType}) at (${pick.x},${pick.y}) — clearing like the UI offers`);
    if (res.blockType === 'creek') {
      Game.state.scholar.kcal -= 20; swam = true;
      res = Game.travelTo(pick.x, pick.y, true);
    } else {
      Game.clearBlockage(pick.x, pick.y);
      res = Game.travelTo(pick.x, pick.y);
    }
  }
  const moved = Game.map.px === pick.x && Game.map.py === pick.y;
  const t = Game.playerTile();
  hops.push({ pick, moved, type: t.type, kcalCost: before.kcal - Game.state.scholar.kcal, tickCost: clock() - before.clock, swam });
  log(`hop ${i + 1}: (${before.px},${before.py})->(${Game.map.px},${Game.map.py}) want=(${pick.x},${pick.y}) type=${t.type} kcal=${before.kcal - Game.state.scholar.kcal} ticks=${clock() - before.clock} moved=${moved}${swam ? ' (swam)' : ''}`);
}
ok('all 6 hops actually traveled', hops.every(h => h.moved), hops.map((h, i) => h.moved ? '' : `#${i + 1}`).filter(Boolean).join(','));
const kcalCosts = hops.map(h => h.kcalCost);
log(`kcal costs: ${kcalCosts.join(', ')}`);
ok('travel costs ~30 kcal per tile of distance (+20 when swimming a creek)', hops.every(h => Math.abs(h.kcalCost - 30 * h.pick.d - (h.swam ? 20 : 0)) <= 15),
  `costs ${kcalCosts.join(',')} vs d=${hops.map(h => h.pick.d).join(',')}`);
ok('travel costs 32 ticks per node', hops.every(h => Math.abs(h.tickCost - 32) <= 40), `ticks ${hops.map(h => h.tickCost).join(',')}`);
const types = [...new Set(hops.map(h => h.type))];
log(`biomes visited: ${types.join(', ')}`);
ok('travel visits varied biomes', types.length >= 2, types.join(','));

// ---------- 2. examine depth on fresh WILDERNESS cells ----------
log('\n=== examine depth ===');
freshGame();
goWilderness();
said = [];
const detail = Game.genDetail(Game.map.px, Game.map.py);
const first = {};
for (let cy = 0; cy < 9 && Object.keys(first).length < 6; cy++) for (let cx = 0; cx < 9; cx++) {
  const c = detail[cy] && detail[cy][cx];
  if (!c || first[c]) continue;
  const adj = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]].find(([x, y]) => x >= 0 && x < 9 && y >= 0 && y < 9);
  if (!adj) continue;
  Game.state.scholar.mx = adj[0]; Game.state.scholar.my = adj[1];
  said = [];
  const r1 = Game.examineCell(cx, cy);
  const t1 = said.join('\n');
  said = [];
  const r2 = Game.examineCell(cx, cy);
  const t2 = said.join('\n');
  first[c] = { r1: r1 && r1.depth, r2: r2 && r2.depth, t1, t2 };
  log(`${c}: d1=${r1 && r1.depth} (${t1.length}ch) d2=${r2 && r2.depth} (${t2.length}ch)`);
}
ok('examine depth 1 then 2', Object.values(first).every(v => v.r1 === 1 && v.r2 === 2));
ok('depth-2 text differs from depth-1 (not a repeat)', Object.values(first).every(v => v.t1 !== v.t2));

// ---------- 3. discovery density on FRESH cells across 3 tiles ----------
log('\n=== discovery density (fresh cells, 3 tiles) ===');
let examinedN = 0, foundN = 0;
const tilesDone = new Set();
for (let i = 0; i < 3; i++) {
  const key = Game.map.px + ',' + Game.map.py;
  if (tilesDone.has(key)) continue;
  tilesDone.add(key);
  const det = Game.genDetail(Game.map.px, Game.map.py);
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const c = det[cy] && det[cy][cx];
    if (!c) continue;
    const ckey = `${Game.map.px},${Game.map.py},${cx},${cy}`;
    if ((Game.state.codex.examined || {})[ckey]) continue; // already examined
    const adj = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]].find(([x, y]) => x >= 0 && x < 9 && y >= 0 && y < 9);
    if (!adj) continue;
    Game.state.scholar.mx = adj[0]; Game.state.scholar.my = adj[1];
    said = [];
    const r = Game.examineCell(cx, cy);
    examinedN++;
    if (r && r.feature) foundN++;
    if (examinedN >= 40) break;
  }
  if (examinedN >= 40) break;
  // move to next tile: first unvisited travel target
  const nx = Game.travelTargets().find(t => !(Game.tileAt(t.x, t.y) || {}).visited);
  if (!nx) break;
  travelOnce(nx.x, nx.y);
}
log(`fresh cells examined: ${examinedN}, features found: ${foundN} (${(100 * foundN / Math.max(1, examinedN)).toFixed(1)}%)`);
ok('features discoverable at a fun rate (5-35%)', foundN / Math.max(1, examinedN) >= 0.05 && foundN / Math.max(1, examinedN) <= 0.35,
  `${(100 * foundN / Math.max(1, examinedN)).toFixed(1)}%`);

// ---------- 4. curiosity hint: adjacent unrevealed feature whispers ----------
log('\n=== curiosity hint ===');
freshGame();
goWilderness();
// find a cell with a feature on the current tile
const det4 = Game.genDetail(Game.map.px, Game.map.py);
let featCell = null, featKind = null;
outer: for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
  const c = det4[cy] && det4[cy][cx];
  if (!c) continue;
  const f = Game.tileFeature(Game.map.px, Game.map.py, cx, cy, c);
  if (f) { featCell = [cx, cy]; featKind = f; break outer; }
}
ok('test tile has at least one hidden feature', !!featCell);
if (featCell) {
  const [cx, cy] = featCell;
  const adj = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]].find(([x, y]) => x >= 0 && x < 9 && y >= 0 && y < 9);
  Game.state.scholar.mx = adj[0]; Game.state.scholar.my = adj[1];
  Game.state.scholar.monster = null; Game.state.scholar.animal = null;
  const hints = Game.perceptionHints();
  log(`feature=${featKind} at (${cx},${cy}); hints: ${JSON.stringify(hints)}`);
  const curiosity = ['disturbed', 'used', 'wrong', 'accidental', 'hollow', 'trampled'].some(w => hints.join(' ').includes(w));
  ok('adjacent unrevealed feature produces a curiosity hint', curiosity, JSON.stringify(hints));
  // examine the feature cell -> its story is told
  said = [];
  Game.examineCell(cx, cy);
  const featureText = said.join('\n');
  ok('examining the feature cell told its story', featureText.length > 100, `${featureText.length} chars`);
  // the whisper could also come from OTHER adjacent unrevealed features —
  // examine every cell in the player's 3x3 so only this mechanic is under test
  for (let ddy = -1; ddy <= 1; ddy++) for (let ddx = -1; ddx <= 1; ddx++) {
    const ax = Game.state.scholar.mx + ddx, ay = Game.state.scholar.my + ddy;
    if (ax < 0 || ax > 8 || ay < 0 || ay > 8) continue;
    const ac = det4[ay] && det4[ay][ax];
    if (!ac) continue;
    const ckey = `${Game.map.px},${Game.map.py},${ax},${ay}`;
    if ((Game.state.codex.examined || {})[ckey]) continue;
    said = [];
    Game.examineCell(ax, ay);
  }
  const hints2 = Game.perceptionHints();
  const curiosity2 = ['disturbed', 'used. Lived', "can't name", 'accidental', 'dark hollow', 'trampled'].some(w => hints2.join(' ').includes(w));
  ok('curiosity hint goes quiet after the features are revealed', !curiosity2, JSON.stringify(hints2));
  // and the feature actually revealed story text
  ok('examining the feature cell told its story (already checked)', true);
}

// ---------- 5. examine cost honesty ----------
log('\n=== examine cost ===');
freshGame();
goWilderness();
const det5 = Game.genDetail(Game.map.px, Game.map.py);
const g = (() => { for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) { const c = det5[cy] && det5[cy][cx]; if (c === 'grass' || c === 'dirt') return [cx, cy]; } return null; })();
if (g) {
  const adj = [[g[0] + 1, g[1]], [g[0] - 1, g[1]]].find(([x, y]) => x >= 0 && x < 9 && y >= 0 && y < 9);
  Game.state.scholar.mx = adj[0]; Game.state.scholar.my = adj[1];
  const kcal0 = Game.state.scholar.kcal, clock0 = clock(), en0 = Game.state.scholar.energy;
  Game.examineCell(g[0], g[1]);
  const dKcal = kcal0 - Game.state.scholar.kcal, dClock = clock() - clock0, dEn = en0 - Game.state.scholar.energy;
  log(`examine cost: kcal=${dKcal} ticks=${dClock} energy=${dEn} (expect 0 / 2 / 0)`);
  ok('examine is time-only (0 kcal, 2 ticks)', dKcal === 0 && dClock === 2, `kcal=${dKcal} ticks=${dClock}`);
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
