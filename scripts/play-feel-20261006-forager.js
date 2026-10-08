#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06), FORAGER archetype — a full food day.
// Pure gathering: walk out, sweep patches, haul home, pantry stocking, eat.
// Walks honestly: Game.pathStep (2 kcal/step), interior tiles 1..7.
// Yield is LATENT: raw haul registers 0 kcal until processed/identified
// (food reality system) — measure raw units + potential kcal, and check the
// game is honest about "not food until identified".
// Questions: (a) effort in vs latent food out per day; (b) patch depletion
// guidance never lectures twice; (c) blind-forage honesty — true names never
// leak before knowledge; (d) pack-full friction; (e) chores or fun?
// Run: node scripts/play-feel-20261006-forager.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function note(t) { console.log(t); }
const says = [];
const results = [];
const check = (name, cond) => { results.push([name, !!cond]); note(`   [${cond ? 'OK' : 'FAIL'}] ${name}`); };
const tile = () => Game.playerTile();
const clampIn = v => Math.max(1, Math.min(7, v));

function walkOut() {
  const targets = (Game.travelTargets() || []).filter(t => {
    const tt = Game.tileAt(t.x, t.y); return tt && tt.type !== 'ruin' && tt.type !== 'haven';
  });
  // scout without traveling: genDetail(x,y) caches per tile
  const scored = targets.map(g => {
    const tt = Game.tileAt(g.x, g.y);
    const detail = Game.genDetail(g.x, g.y);
    let n = 0;
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      const c = detail[y] && detail[y][x];
      if (c === 'plant' || c === 'bush' || c === 'tree' || c === 'bigtree') n++;
    }
    return { g, n, stock: tt.stock || 0 };
  }).filter(s => s.n > 0);
  if (!scored.length) { note('   no green tiles in reach — the forager stays home'); return null; }
  scored.sort((a, b) => b.n - a.n || b.stock - a.stock);
  const pick = scored[0];
  const before = Game.map.px + ',' + Game.map.py;
  const r = Game.travelTo(pick.g.x, pick.g.y);
  if (Game.map.px + ',' + Game.map.py === before) {
    note(`   blocked toward ${pick.g.x},${pick.g.y} (${r && r.blockType}) — the land says no`);
    return null;
  }
  return pick.g;
}
// BFS walk to a walkable cell within 1 of (tx,ty). Returns true on arrival.
function walkTo(tx, ty) {
  const s = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const walkable = (x, y) => {
    // EXPLORATION (not combat): edges are normal ground here — travelTo
    // itself places the player on edge cells. The 1..7 restriction is for
    // combat playtests (flee-by-barrier).
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
  if (!goal) {
    // diagnostic: is the player boxed in on entry? (real softlock risk)
    const s2 = Game.state.scholar;
    const d2 = Game.genDetail(Game.map.px, Game.map.py);
    let ring = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = s2.mx + dx, y = s2.my + dy;
      const c = (d2[y] && d2[y][x]) || '?';
      ring.push(`${x},${y}:${c}${walkable(x, y) ? '' : '(X)'}`);
    }
    note(`   WALK-FAIL: player @${s2.mx},${s2.my} target ${tx},${ty} ring: ${ring.join(' ')}`);
    return false;
  }
  const path = [];
  for (let cur = goal; cur[0] !== s.mx || cur[1] !== s.my; cur = prev[cur[0] + ',' + cur[1]]) path.unshift(cur);
  for (const [x, y] of path) { if (!Game.pathStep(x, y)) return false; }
  return true;
}
// tap a green cell exactly like the player would: walk adjacent, then
// _cellInteract routes plant/bush to the forage sweep, trees to
// examine/tree-nuts first.
function tapGreen(tx, ty) {
  if (!walkTo(tx, ty)) return { ok: false, why: 'no path to green' };
  says.length = 0;
  const r = Game._cellInteract(tx, ty);
  const m = says.join(' || ');
  says.length = 0;
  return { ok: true, msg: m, ret: r };
}
function greenCells(only) {
  const t = tile(), detail = Game.genDetail(Game.map.px, Game.map.py);
  const out = [];
  const want = only || ['plant', 'bush', 'tree', 'bigtree'];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
    const c = detail[y] && detail[y][x];
    if (!want.includes(c)) continue;
    if (t.detailRegrow && t.detailRegrow[x + ',' + y]) continue;
    if (Game.cellScorched(x, y)) continue;
    out.push([x, y]);
  }
  return out;
}
function invUnits() {
  return Game.state.scholar.inventory.reduce((s, i) => s + (i.units || 1), 0);
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
  const flush = (tag, re, n) => {
    const hit = says.filter(t => re.test(t));
    for (const t of hit.slice(0, n || 8)) note(`   ${tag} ${t.slice(0, 160)}`);
    says.length = 0;
  };

  // ============ ACT 1: THE FORAGER'S MORNING — walk, sweep, deplete ============
  note('\n=== ACT 1: morning forage — walk the land, sweep patches ===');
  await fresh();
  flush('>', /./, 0);
  const s = Game.state.scholar;
  const dest = walkOut();
  const t0 = tile();
  note(`   walked to tile ${Game.map.px},${Game.map.py} (${t0.type}, stock=${t0.stock})`);
  // player stands where travelTo put them (often an edge cell) — no clamping.
  const kcalStart = s.kcal, unitsStart = invUnits();
  for (const it of s.inventory) it._counted = true; // baseline: starting gear
  let presses = 0, patchOuts = 0, silent = 0, short = 0, taps = 0, emptyStreak = 0;
  let workedOutSeen = false;
  const tapped = new Set(); // a real player moves on after working a cell
  let guard = 25;
  while (guard-- > 0) {
    const greens = greenCells().filter(g => !tapped.has(g[0] + ',' + g[1]));
    if (!greens.length) { note('   tile picked clean — a forager moves to the next tile'); break; }
    // nearest green
    greens.sort((a, b) => (Math.abs(a[0] - s.mx) + Math.abs(a[1] - s.my)) - (Math.abs(b[0] - s.mx) + Math.abs(b[1] - s.my)));
    const tap = tapGreen(greens[0][0], greens[0][1]);
    if (!tap.ok) { note(`   unreachable green (${tap.why}) — skipping`); tapped.add(greens[0][0] + ',' + greens[0][1]); continue; }
    tapped.add(greens[0][0] + ',' + greens[0][1]);
    taps++;
    const m = tap.msg || '';
    if (!m) { silent++; if (++emptyStreak >= 3) { note('   3 silent taps in a row — sim bails (player would too)'); break; } continue; }
    emptyStreak = 0;
    if (/worked out|another green patch/.test(m)) patchOuts++;
    if (/Still full/.test(m)) short++;
    const isSweep = /you work the patch|shot in the dark|no food in these trees|picked clean/i.test(m);
    if (isSweep) presses++;
    // PATCH-OUT PROBE: right after the first real sweep, tap the same cell
    // again. Its 3x3 is worked but the tile still has green elsewhere, so the
    // honest answer is "worked out — step to another green patch".
    if (isSweep && !workedOutSeen && presses === 1) {
      says.length = 0;
      Game.doAction('forage', { cx: greens[0][0], cy: greens[0][1] });
      const m2 = says.join(' ');
      says.length = 0;
      note(`   re-tap just-swept cell: "${m2.slice(0, 130)}"`);
      if (/worked out|another green patch/i.test(m2)) { workedOutSeen = true; patchOuts++; }
    }
  }
  const kcalSpent = kcalStart - s.kcal;
  const unitsGained = invUnits() - unitsStart;
  // LATENT HAUL: what the morning's new items could become once
  // identified/processed. Known food: kcalEach. Lumps: composition's
  // caloriesPerUnit. In-shell nuts: hiddenKcal.
  let latentKcal = 0, foodUnits = 0;
  for (const it of s.inventory) {
    if (it._counted) continue;
    const u = it.units || 1;
    if (it.lump && it.lumpForm) {
      for (const [pid, e] of Object.entries(it.lump)) {
        const p = Game.data.plants.find(pp => pp.id === pid);
        if (p) { latentKcal += e.units * (p.caloriesPerUnit || 0); foodUnits += e.units; }
      }
    } else if (it.foodKind === 'plant' || it.foodKind === 'nut') {
      foodUnits += u;
      latentKcal += u * ((it.kcalEach || 0) + (it.hiddenKcal || 0));
    }
  }
  note(`presses=${presses} taps=${taps} silent=${silent} patchOuts=${patchOuts} kcalSpent=${Math.round(kcalSpent)} rawUnitsGained=${unitsGained}`);
  note(`   food units: ${foodUnits}, latent haul: ~${Math.round(latentKcal)} kcal (once identified/processed)`);
  flush('>', /worked out|picked clean|shot in the dark|practiced hands|Unfamiliar/i, 10);
  check('every forage press says what happened (no silent action)', silent === 0);
  check('patch-out guidance points at the next patch', patchOuts > 0 || workedOutSeen);
  check('a morning of honest walking yields a real haul (units > 20)', unitsGained > 20);
  note(`   effort: ~${Math.round(kcalSpent)} kcal burned (walk 2/step + forage 60/press) for ${unitsGained} raw units`);

  // ============ ACT 2: the knowledge loop, end to end ============
  // forage blind -> lump -> haul home -> camp ritual (sortBag with a
  // knowledgeable villager) -> codex learns -> next forage names it.
  note('\n=== ACT 2: the knowledge loop — blind forage to named haul ===');
  await fresh();
  flush('>', /./, 0);
  const s2 = Game.state.scholar;
  walkOut();
  Game.state.codex.plants = {}; // utter ignorance
  const g2 = greenCells(['plant', 'bush']); // sweep path, not tree-examine
  const trueNames = Game.data.plants.map(p => p.name);
  if (!g2.length) {
    note('   no green cells — setup FAIL');
    results.push(['blind sweep never prints a true plant name', false]);
    results.push(['blind sweep says the haul is not food until identified', false]);
  } else {
    const tap = tapGreen(g2[0][0], g2[0][1]);
    if (!tap.ok) {
      note(`   could not reach green (${tap.why}) — setup FAIL`);
      results.push(['blind sweep never prints a true plant name', false]);
      results.push(['blind sweep says the haul is not food until identified', false]);
    } else {
    const m2 = tap.msg || '';
    flush('>', /shot in the dark|Unfamiliar|unknown|practiced hands/i, 6);
    const leak = trueNames.some(n => n.length > 4 && m2.includes(n));
    check('blind sweep never prints a true plant name', !leak);
    check('blind sweep says the haul is not food until identified', /not food until identified|unnamed|not named|sort (them|it) at camp/i.test(m2));
    const seen = Object.keys(tile().speciesSeen || {});
    const lumpIdx = s2.inventory.findIndex(i => i.lump && i.lumpForm);
    if (!seen.length || lumpIdx < 0) {
      note('   no lump hauled — setup FAIL'); results.push(['camp ritual teaches the lumped species', false]);
    } else {
      // haul home: the homecoming auto-stages unprocessed hauls onto the
      // kitchen counter (prep stash) — "the clock is ticking" — and may
      // trigger the fireside teaching moment.
      says.length = 0;
      Game.travelTo(3, 3);
      const mHome = says.join(' || ');
      flush('>', /counter|clock is ticking|pantry|teaches|show your haul/i, 8);
      const staged = Game.prepStash().findIndex(i => i.lump && i.lumpForm);
      check('homecoming stages the lump onto the counter (prep stash)', staged >= 0);
      check('homecoming says the clock is ticking on unprocessed hauls', /clock is ticking/i.test(mHome));
      if (staged < 0) { results.push(['camp ritual teaches the lumped species', false]); }
      else {
        // the camp ritual: sort the bag with someone who knows the species
        const comp = Game.prepStash()[staged].lump;
        const vps = Game.villagePeople ? Game.villagePeople() : [];
        let sorter = null, taughtPid = null;
        for (const pid of Object.keys(comp)) {
          const knower = vps.find(p => (Game.villagerKnowsPlants(p.id) || []).includes(pid));
          if (knower) { sorter = knower; taughtPid = pid; break; }
        }
        if (!sorter) {
          // no villager knows it yet: the village's herbalist learns it with
          // you. Seed the knowledge on the first villager — the mechanic
          // under test is the ritual (sort -> identify -> name), not the
          // background seeding (covered by seedBackgroundPlantKnowledge).
          sorter = vps[0];
          const pk = Game.state.village.plantKnowledge || (Game.state.village.plantKnowledge = {});
          pk[sorter.id] = Object.keys(comp);
          note(`   seeded ${sorter.name || sorter.id} as the knower (test setup)`);
          taughtPid = Object.keys(comp)[0];
        }
        {
          says.length = 0;
          Game.sortBag(sorter.id, staged);
          const mSort = says.join(' || ');
          flush('>', /resolves|named|taught|learn/i, 6);
          check('camp ritual teaches the lumped species', Game.plantKnown(taughtPid));
          // the ritual's split items carry the TRUE name into the player's
          // world — "from the lumped bag: X, named, and out."
          const pl = Game.data.plants.find(p => p.id === taughtPid);
          const namedInStash = Game.prepStash().some(i => i.plantId === taughtPid && i.name === (pl && pl.name));
          const mSortHasName = pl && mSort.includes(pl.name);
          note(`   stash named item: ${namedInStash}, ritual said the name: ${!!mSortHasName}`);
          check(`after the ritual, "${pl ? pl.name : taughtPid}" is named (not lumped)`, namedInStash || !!mSortHasName);
          // and the NEXT forage would name it too: the pack() branch is
          // e.known ? plant.name : lumpForm — the blind test proved the
          // lump half; plantKnown true proves the name half's gate is open.
          check('known-gate open for the next forage (plantKnown true)', Game.plantKnown(taughtPid));
        }
      } // end staged else
    } // end inner else (tap ok)
    } // end seen/lump else
  }

  // ============ ACT 3: pack-full streak — one lecture, then short ============
  note('\n=== ACT 3: pack-full friction ===');
  await fresh();
  flush('>', /./, 0);
  const s3 = Game.state.scholar;
  walkOut();
  const g4 = greenCells(['plant', 'bush']);
  if (!g4.length) { note('   no plant/bush cells — setup FAIL'); results.push(['pack-full lecture', false]); results.push(['pack-full repeat short', false]); }
  else {
    // walk next to a fresh plant cell WITHOUT tapping (a tap would harvest),
    // stuff the pack, then drive the sweep directly twice on the same cell.
    const [gx, gy] = g4[0];
    if (!walkTo(gx, gy)) { note('   could not walk to green — setup FAIL'); results.push(['pack-full lecture', false]); results.push(['pack-full repeat short', false]); }
    else {
      let tries = 0;
      while (tries++ < 40 && Game.canCarry(0.5)) s3.inventory.push({ material: 'branch', units: 2, name: 'Branch', kcalEach: 0, spoilDay: 9999, kg: 0.5 });
      note(`   pack stuffed (~${Game.packWeight().toFixed(1)} kg)`);
      // a blocked press does NOT consume the patch (pack check precedes the
      // harvest), so the second press hits the same full pack: lecture, then short.
      says.length = 0;
      Game.doAction('forage', { cx: gx, cy: gy });
      const firstFull = says.join(' ');
      says.length = 0;
      Game.doAction('forage', { cx: gx, cy: gy });
      const secondFull = says.join(' ');
      note(`   1st: "${firstFull.slice(0, 130)}"`);
      note(`   2nd: "${secondFull.slice(0, 130)}"`);
      check('first pack-full explains the real options (eat/test/leave)', /[Ee]at|test a lump|leave some/i.test(firstFull));
      check('repeat stays short (one lecture, not fifty)', /Still full/.test(secondFull) && secondFull.length < firstFull.length);
    }
  }

  // ============ ACT 4: haul home — pantry stocking ============
  note('\n=== ACT 4: haul home — pantry stocking ===');
  await fresh();
  flush('>', /./, 0);
  const s4 = Game.state.scholar;
  const haul = [
    { plantId: 'dandelion', name: 'Dandelion greens', units: 6, kcalEach: 25, spoilDay: s4.day + 2, kg: 0.2 },
    { plantId: 'blackberry', name: 'Blackberries', units: 8, kcalEach: 43, spoilDay: s4.day + 1, kg: 0.3 },
  ];
  s4.inventory.push(...haul.map(h => ({ ...h })));
  const pk = () => (Game.state.village.pantry || []).reduce((a, i) => a + (i.kcalEach || 0) * (i.units || 1), 0);
  const pk0 = pk();
  for (const h of haul) { s4.inventory.splice(s4.inventory.indexOf(h), 1); Game.stockPantry(h.kcalEach * h.units, h.name + ' (from pack)'); }
  note(`   pantry ${Math.round(pk0)} -> ${Math.round(pk())} kcal over ${(Game.state.village.pantry || []).length} items`);
  check('stocking moves REAL food items into the pantry', pk() > pk0);

  // ============ ACT 5: eat per item from pack ============
  note('\n=== ACT 5: eating per item ===');
  const eater = [{ plantId: 'blackberry', name: 'Blackberries', units: 4, kcalEach: 43, spoilDay: s4.day + 1, kg: 0.1 }];
  s4.inventory.push(...eater);
  const k0 = s4.kcal;
  Game.eatOne(s4.inventory.indexOf(eater[0]));
  const k1 = s4.kcal;
  note(`   ate 1 blackberry: ${Math.round(k0)} -> ${Math.round(k1)} kcal`);
  check('eatOne is per-item, not bulk', k1 > k0 && (k1 - k0) <= 200);

  // ============ VERDICT ============
  note('\n=== FORAGER FEEL VERDICT ===');
  const fails = results.filter(r => !r[1]).map(r => r[0]);
  note(`checks: ${results.length - fails.length}/${results.length} pass`);
  if (fails.length) note(`FAILS: ${fails.join(' | ')}`);
  if (fails.length) process.exitCode = 1;
})();
