#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-07), FORAGER archetype — multi-day depletion/regrow.
// The sweep promises "it'll recover in a few days". This play strips a rich
// tile on day 1, comes back on day 2 (should read picked-clean, honestly),
// and again on day 3 (should pay again), then sweeps a fresh tile as control.
// Questions: (a) does the stripped tile tell the truth on day 2 — no green
// lies; (b) does the recovery promise hold on day 3; (c) does a fresh tile
// pay the same on day 3 as day 1 (no hidden drift); (d) every press on a
// stripped tile still says something (no silent actions).
// Seeded RNG (mulberry32, SEED env) for reproducibility.
// Run: node scripts/play-feel-20261007-forager-deplete.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
// deterministic PRNG (mulberry32) — see PROOF-TEST RNG STABILITY lesson
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const note = (t) => console.log(t);
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  note(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
const tile = () => Game.playerTile();
const greensNow = () => {
  const t = tile(), detail = Game.genDetail(Game.map.px, Game.map.py);
  const out = [];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
    const c = detail[y] && detail[y][x];
    if (!['plant', 'bush', 'tree', 'bigtree'].includes(c)) continue;
    if (t.detailRegrow && t.detailRegrow[x + ',' + y]) continue;
    if (Game.cellScorched(x, y)) continue;
    out.push([x, y]);
  }
  return out;
};
function invUnits() {
  return Game.state.scholar.inventory.reduce((s, i) => s + (i.units || 1), 0);
}
function latentKcal() {
  let k = 0;
  for (const it of Game.state.scholar.inventory) {
    if (it._counted) continue;
    const u = it.units || 1;
    if (it.lump && it.lumpForm) {
      for (const [pid, e] of Object.entries(it.lump)) {
        const p = Game.data.plants.find(pp => pp.id === pid);
        if (p) k += e.units * (p.caloriesPerUnit || 0);
      }
    } else if (it.foodKind === 'plant' || it.foodKind === 'nut') {
      k += u * ((it.kcalEach || 0) + (it.hiddenKcal || 0));
    }
  }
  return k;
}
function walkTo(tx, ty) {
  const s = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const walkable = (x, y) => {
    if (x < 0 || x > 8 || y < 0 || y > 8) return false;
    const c = detail[y] && detail[y][x];
    return !Game.cellProps(c).blocks;
  };
  const prev = {}, seen = new Set([s.mx + ',' + s.my]);
  const q = [[s.mx, s.my]];
  let goal = null;
  const isGoal = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && walkable(x, y);
  if (isGoal(s.mx, s.my)) goal = [s.mx, s.my];
  while (q.length && !goal) {
    const [x, y] = q.shift();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !walkable(nx, ny)) continue;
      seen.add(k); prev[k] = [x, y];
      if (isGoal(nx, ny)) { goal = [nx, ny]; q.length = 0; break; }
      q.push([nx, ny]);
    }
  }
  if (!goal) return false;
  const path = [];
  for (let cur = goal; cur[0] !== s.mx || cur[1] !== s.my; cur = prev[cur[0] + ',' + cur[1]]) path.unshift(cur);
  for (const [x, y] of path) { if (!Game.pathStep(x, y)) return false; }
  return true;
}
function tapGreen(tx, ty) {
  if (!walkTo(tx, ty)) return { ok: false, why: 'no path' };
  says.length = 0;
  Game._cellInteract(tx, ty);
  const m = says.join(' || ');
  says.length = 0;
  return { ok: true, msg: m };
}
// richest green tile in reach (excluding haven/ruin + one banned coord)
function walkOut(ban) {
  const targets = (Game.travelTargets() || []).filter(t => {
    const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'ruin' && tt.type !== 'haven';
  });
  const scored = targets.map(g => {
    const tt = Game.tileAt(g.x, g.y);
    const detail = Game.genDetail(g.x, g.y);
    let n = 0;
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      const c = detail[y] && detail[y][x];
      if (['plant', 'bush', 'tree', 'bigtree'].includes(c)) n++;
    }
    return { g, n, stock: tt.stock || 0 };
  }).filter(s => s.n > 0 && !(ban && s.g.x === ban[0] && s.g.y === ban[1]));
  if (!scored.length) { note('   no green tiles in reach'); return null; }
  scored.sort((a, b) => b.n - a.n || b.stock - a.stock);
  const before = Game.map.px + ',' + Game.map.py;
  Game.travelTo(scored[0].g.x, scored[0].g.y);
  if (Game.map.px + ',' + Game.map.py === before) { note('   travel blocked'); return null; }
  return [scored[0].g.x, scored[0].g.y];
}
// sweep until the tile's green is worked out. Returns metrics.
function sweepTile(label) {
  const s = Game.state.scholar;
  for (const it of s.inventory) it._counted = true;
  const unitsStart = invUnits(), kcalStart = s.kcal, latStart = latentKcal();
  const tapped = new Set();
  let presses = 0, silent = 0, taps = 0, workedOutNotes = 0;
  const samples = [];
  let guard = 40, walkFails = 0, packEats = 0, kcalEaten = 0;
  const packBlocked = new Set();
  while (guard-- > 0) {
    const greens = greensNow().filter(g => !tapped.has(g[0] + ',' + g[1]));
    if (!greens.length) break;
    greens.sort((a, b) => (Math.abs(a[0] - s.mx) + Math.abs(a[1] - s.my)) - (Math.abs(b[0] - s.mx) + Math.abs(b[1] - s.my)));
    const tap = tapGreen(greens[0][0], greens[0][1]);
    if (!tap.ok) { tapped.add(greens[0][0] + ',' + greens[0][1]); walkFails++; continue; }
    let m = tap.msg || '';
    // PACK FULL (forager loop 2026-10-07): a real player eats something and
    // keeps working the patch. Mirror that instead of marking the cell done.
    if (/pack is full|Still full/i.test(m)) {
      packBlocked.add(greens[0][0] + ',' + greens[0][1]);
      if (packEats < 24) {
        const fi = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 1) > 0);
        if (fi >= 0) {
          const ke0 = s.kcal;
          Game.eatOne(fi); packEats++;
          kcalEaten += Math.max(0, s.kcal - ke0);
          continue; // retry the same cell, untapped
        }
      }
      tapped.add(greens[0][0] + ',' + greens[0][1]); // gave up: honest block, noted
      continue;
    }
    // trees examine first ("This tree you don't recognize...") — a real
    // player taps again and the second tap forages. Mirror that.
    if (/you don't recognize|berry bush — berries, certainly/i.test(m) && !/you work the patch|shot in the dark|no food in these trees/i.test(m)) {
      const tap2 = tapGreen(greens[0][0], greens[0][1]);
      if (tap2.ok && tap2.msg) m = m + ' || ' + tap2.msg;
    }
    tapped.add(greens[0][0] + ',' + greens[0][1]);
    taps++;
    if (samples.length < 4) samples.push(m.slice(0, 140));
    if (!m) { silent++; continue; }
    if (/worked out|another green patch|picked clean|recover in a few days/i.test(m)) workedOutNotes++;
    if (/you work the patch|shot in the dark|no food in these trees|picked clean/i.test(m)) presses++;
  }
  const unitsGained = invUnits() - unitsStart;
  const kcalSpent = (kcalStart - s.kcal) + kcalEaten; // gross burn: net + eaten
  const latGained = latentKcal() - latStart;
  note(`   ${label}: taps=${taps} presses=${presses} silent=${silent} walkFails=${walkFails} packEats=${packEats} workedOutNotes=${workedOutNotes} units+${unitsGained} latent+${Math.round(latGained)}kcal burned=${Math.round(kcalSpent)}`);
  for (const sm of samples) note(`     > ${sm}`);
  return { taps, presses, silent, walkFails, packEats, unitsGained, kcalSpent, latGained, packBlocked };
}
// the tile's stock word must match its actual stock (no green lies)
function stockWordHonest() {
  const st = tile().stock || 0;
  const here = (Game.nodeDetail().here || []).join(' | ');
  const want = st >= 3 ? 'rich pickings' : st === 2 ? 'good foraging' : st === 1 ? 'a little left' : 'picked clean';
  return { ok: here.includes(want), here, stock: st, want };
}

async function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  const flush = () => { says.length = 0; };

  note('\n=== DAY 1: strip a rich tile ===');
  await fresh(); flush();
  const s = Game.state.scholar;
  const home = [Game.map.px, Game.map.py];
  const day1Tile = walkOut();
  if (!day1Tile) { note('setup FAIL: no green tile'); process.exitCode = 1; return; }
  const t1 = tile();
  const greens1 = greensNow().length;
  note(`   tile ${day1Tile[0]},${day1Tile[1]} (${t1.type}) — ${greens1} green cells, stock=${t1.stock}`);
  const d1 = sweepTile('day1 sweep');
  const sw1 = stockWordHonest();
  note(`   nodeDetail.here: "${sw1.here}" (stock=${sw1.stock}, expect "${sw1.want}")`);
  const left1 = greensNow();
  // leftovers are only acceptable if examined-and-empty: yield-0 trees stay
  // rendered as trees (they stand), but the game told the player "nothing to
  // take" — re-taps say "You already checked. Nothing."
  const t1b = tile();
  const badLeft = left1.filter(([gx, gy]) => {
    const sec = (t1b.secrets || {})[gx + ',' + gy];
    const empty = sec && sec.known && (sec.yield || 0) === 0;
    const regrowing = t1b.detailRegrow && t1b.detailRegrow[gx + ',' + gy];
    const blocked = d1.packBlocked.has(gx + ',' + gy);
    return !(empty || regrowing || blocked);
  });
  check('day-1 sweep works every reachable green', badLeft.length === 0, `unexplained=${badLeft.map(g=>g.join(',')).join(' ')} packBlocked=${[...d1.packBlocked].join(' ')} walkFails=${d1.walkFails}`);
  check('every press said something (no silent action)', d1.silent === 0, `silent=${d1.silent}`);
  check('the tile stock word matches its stock (no green lies)', sw1.ok, `"${sw1.here}"`);

  note('\n=== DAY 2: come back — it should read picked-clean ===');
  Game.travelTo(home[0], home[1]); flush();
  s.kcal = 3000; s.hydration = 100; s.health = 100; // isolate forage reads, not need collapse
  Game.endDay(); flush();
  note(`   now day ${s.day}`);
  Game.travelTo(day1Tile[0], day1Tile[1]); flush();
  const greens2 = greensNow().length;
  const t2 = tile();
  const sw2 = stockWordHonest();
  note(`   tile ${day1Tile[0]},${day1Tile[1]} — ${greens2} greens, stock=${t2.stock}, regrowing cells=${Object.keys(t2.detailRegrow || {}).length}`);
  note(`   nodeDetail.here: "${sw2.here}" (expect "${sw2.want}")`);
  // press on the best remaining green a few times (should be nearly none)
  let silent2 = 0, msg2 = [];
  const s2 = Game.state.scholar;
  for (let i = 0; i < 4; i++) {
    const gs = greensNow();
    if (!gs.length) { msg2.push('(no greens left to tap)'); break; }
    const tap = tapGreen(gs[0][0], gs[0][1]);
    const m = tap.ok ? (tap.msg || '') : tap.why;
    msg2.push(m.slice(0, 120));
    if (tap.ok && !m) silent2++;
  }
  for (const m of msg2) note(`     day2 tap> ${m}`);
  check('day-2 tile has almost nothing forageable (regrow not done)', greens2 < greens1 / 2, `day1=${greens1} day2=${greens2}`);
  check('day-2 stock word still honest', sw2.ok, `"${sw2.here}"`);
  check('day-2 taps never silent', silent2 === 0, `silent=${silent2}`);

  note('\n=== DAY 4: the recovery promise ===');
  // harvest on day 1 sets detailRegrow day=3; regrowTiles restores when
  // regDay <= scholar.day during endDay — so the tile is playable again on
  // the MORNING of day 4 (three nights later, matching the code comment's
  // "comes back in 3 days"). Two endDays here: day2->3, day3->4.
  Game.travelTo(home[0], home[1]); flush();
  s.kcal = 3000; s.hydration = 100; s.health = 100;
  Game.endDay(); flush();
  s.kcal = 3000; s.hydration = 100; s.health = 100;
  Game.endDay(); flush();
  note(`   now day ${s.day}`);
  Game.travelTo(day1Tile[0], day1Tile[1]); flush();
  const greens3 = greensNow().length;
  const t3 = tile();
  const sw3 = stockWordHonest();
  note(`   tile ${day1Tile[0]},${day1Tile[1]} — ${greens3} greens, stock=${t3.stock}, regrowing=${Object.keys(t3.detailRegrow || {}).length}`);
  note(`   nodeDetail.here: "${sw3.here}" (expect "${sw3.want}")`);
  const d3 = sweepTile('day4 re-sweep');
  check('day-4 stripped tile recovers (greens back, pays again)', greens3 > 0 && d3.unitsGained > 0, `greens=${greens3} units+${d3.unitsGained}`);
  check('day-4 stock word honest after recovery', sw3.ok, `"${sw3.here}"`);

  note('\n=== DAY 4 control: a fresh tile pays the same as day 1 ===');
  const fresh2 = walkOut(day1Tile);
  let ctl = null;
  if (fresh2) {
    const gf = greensNow().length;
    note(`   fresh tile ${fresh2[0]},${fresh2[1]} — ${gf} greens`);
    // sim convenience: empty the pack so the control measures the land, not the pack
    Game.state.scholar.inventory.length = 0;
    ctl = sweepTile('day4 fresh sweep');
    const perPress1 = d1.presses ? d1.unitsGained / d1.presses : 0;
    const perPress3 = ctl.presses ? ctl.unitsGained / ctl.presses : 0;
    note(`   day1 fresh: ${perPress1.toFixed(1)} units/press; day4 fresh: ${perPress3.toFixed(1)} units/press`);
    check('fresh-tile yield per press stable across days (no hidden drift)', perPress1 > 0 && Math.abs(perPress1 - perPress3) / perPress1 < 0.5, `${perPress1.toFixed(1)} vs ${perPress3.toFixed(1)}`);
  } else {
    note('   no second green tile — control skipped');
  }

  note('\n=== FORAGER DEPLETION VERDICT ===');
  const fails = results.filter(r => !r[1]).map(r => r[0]);
  note(`checks: ${results.length - fails.length}/${results.length} pass (seed ${SEED})`);
  if (fails.length) { note(`FAILS: ${fails.join(' | ')}`); process.exitCode = 1; }
})();
