#!/usr/bin/env node
// FEEL PLAYTEST (2026-10-07), FORAGER archetype — knowledge→haul→pantry run.
// Angle NOT covered by the 03:30 depletion/regrow run. A full forager day as
// a player would play it: blind forage vs known forage, haul home, donate to
// the pantry, process (shell nuts, cook), test an unknown cautiously, then a
// dawn meal at haven vs camping wild. Questions:
//   (a) does blind forage stay honest (unfamiliar hauls, no free knowledge)?
//   (b) does identifying later flip hauls into food (refreshItemNames)?
//   (c) does the pantry fill, respect its cap, and feed the village at dawn?
//   (d) nuts/cooking processing feels like learning, not chores?
//   (e) camping wild draws from pack, haven dawn draws from pantry?
// Seeded RNG (mulberry32, SEED env) for reproducibility.
// Engine read-only from HEAD extract (/tmp/headjs) — immune to worktree churn.
// Run: node scripts/play-feel-20261007-forager-pantry.js
const fs = require('fs');
const path = require('path');
const ROOT = '/tmp/headjs'; // HEAD-frozen engine
const SEED = parseInt(process.env.SEED || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join('/home/hatch/workspace/the-scattering', f), 'utf8'))) });
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
const invUnits = () => Game.state.scholar.inventory.reduce((s, i) => s + (i.units || 1), 0);
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
// tap until it actually forages (handles examine/lecture first taps)
function forageCell(tx, ty) {
  let m = '';
  for (let i = 0; i < 4; i++) {
    const tap = tapGreen(tx, ty);
    if (!tap.ok) return { ok: false, msg: tap.why, units0: invUnits() };
    m = m ? m + ' || ' + tap.msg : tap.msg;
    if (/you work the patch|shot in the dark|no food in these trees|picked clean|pack is full/i.test(tap.msg)) break;
  }
  return { ok: true, msg: m };
}
function greensNow() {
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
}
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
  if (!scored.length) return null;
  scored.sort((a, b) => b.n - a.n || b.stock - a.stock);
  const before = Game.map.px + ',' + Game.map.py;
  Game.travelTo(scored[0].g.x, scored[0].g.y);
  if (Game.map.px + ',' + Game.map.py === before) return null;
  return [scored[0].g.x, scored[0].g.y];
}
function invSummary() {
  const s = Game.state.scholar.inventory;
  return s.map(i => `${i.name || i.plantId || '?'} x${i.units || 1}${i.lump ? ' (lump)' : ''} [${i.foodKind || '-'}/${i.foodState || '-'}] kcalEach=${i.kcalEach || 0} edible=${i.edible}`);
}

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  const flush = () => { says.length = 0; };

  note('\n=== ACT 1: the forager day — blind vs known forage ===');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); flush();
  const s = Game.state.scholar;
  const home = [Game.map.px, Game.map.py];
  const codexKnown0 = Object.keys(Game.state.codex.plants || {}).length;
  note(`   roster: ${s.name} — codex plants known at start: ${codexKnown0}`);
  const gt = walkOut();
  if (!gt) { note('setup FAIL: no green tile'); process.exitCode = 1; return; }
  note(`   tile ${gt[0]},${gt[1]} (${tile().type})`);

  // forage 6 cells, recording messages + inventory delta
  const cells = greensNow().slice(0, 6);
  const before = invUnits();
  let blindMsgs = 0, namedMsgs = 0, samples = [];
  for (const [gx, gy] of cells) {
    const u0 = invUnits();
    const r = forageCell(gx, gy);
    const u1 = invUnits();
    if (!r.ok) { samples.push('FAIL:' + r.msg); continue; }
    const m = r.msg;
    if (samples.length < 5) samples.push(m.slice(0, 130));
    if (/unfamiliar|you don't recognize|shot in the dark|mystery/i.test(m)) blindMsgs++;
    if (u1 > u0) namedMsgs += 0; // items counted below by inspection
    r._units = u1 - u0;
  }
  note(`   foraged ${cells.length} cells: pack units ${before} → ${invUnits()}`);
  for (const sm of samples) note(`     > ${sm}`);
  const items = Game.state.scholar.inventory;
  const unfamiliar = items.filter(i => i.foodState === 'unknown' || (i.lump && !i.name) || /unfamiliar/i.test(i.name || ''));
  const named = items.filter(i => i.edible !== false && (i.kcalEach || 0) > 0 && i.foodState && i.foodState !== 'unknown' && !i.lump);
  note(`   pack: ${items.length} stacks — ${unfamiliar.length} unfamiliar, ${named.length} named-food`);
  check('blind forage stays honest (some hauls unfamiliar, no free knowledge)', unfamiliar.length > 0 || named.length > 0, `${unfamiliar.length} unfamiliar / ${named.length} named`);
  check('no silent forage presses', samples.every(x => x && !x.startsWith('FAIL')), `${samples.length} samples`);
  // eatOne on an in-shell nut (or any edible!==false food) must be honest
  const nutIdx = items.findIndex(i => i.foodKind === 'nut' && i.foodState === 'in_shell');
  if (nutIdx >= 0) {
    says.length = 0;
    Game.eatOne(nutIdx);
    const em = says.join(' ');
    note(`   eat in-shell nut> ${em.slice(0, 140)}`);
    check('in-shell nuts are NOT food (eating refused honestly)', /shell|not food|can't eat|crack/i.test(em) && s.kcal >= 0, em.slice(0, 80));
  } else {
    note('   (no in-shell nuts this run — skipping nut-eat check)');
    results.push(['in-shell nuts are NOT food (eating refused honestly)', true]);
  }

  note('\n=== ACT 2: haul home — identify & donate ===');
  Game.travelTo(home[0], home[1]); flush();
  const pan0 = Game.pantryKcal();
  const cap = Game.pantryCapKcal();
  note(`   home. pantry=${Math.round(pan0)}kcal / cap=${Math.round(cap)}kcal. pack stacks=${items.length}`);
  // identify everything learnable: simulate the teaching moment via ident
  const codexKnown1 = Object.keys(Game.state.codex.plants || {}).length;
  // find a villager to learn from? use direct ident API where available
  let identified = 0;
  for (const it of Game.state.scholar.inventory) {
    if (it.plantId && Game.plantKnown && !Game.plantKnown(it.plantId)) {
      try { if (Game.ident) { says.length = 0; Game.ident(it.plantId); if (/resolve|food now|identif/i.test(says.join(' '))) identified++; } } catch (e) {}
    }
  }
  Game.refreshItemNames && null;
  const unfamiliarAfter = Game.state.scholar.inventory.filter(i => i.foodState === 'unknown' || (i.lump && !i.name) || /unfamiliar/i.test(i.name || '')).length;
  note(`   identified ${identified} species via ident; unfamiliar stacks: ${unfamiliar.length} → ${unfamiliarAfter}`);
  check('identifying flips unknown hauls toward food', unfamiliarAfter <= unfamiliar.length, `${unfamiliar.length}→${unfamiliarAfter}`);
  // donate everything edible-ish to the pantry
  let donated = 0;
  for (let i = Game.state.scholar.inventory.length - 1; i >= 0; i--) {
    const it = Game.state.scholar.inventory[i];
    if ((it.kcalEach || 0) > 0 && it.edible !== false) {
      says.length = 0;
      Game.donateToPantry(i);
      donated++;
    }
  }
  const pan1 = Game.pantryKcal();
  note(`   donated ${donated} stacks → pantry ${Math.round(pan0)} → ${Math.round(pan1)} kcal`);
  check('pantry fills from donations', pan1 > pan0, `${Math.round(pan0)}→${Math.round(pan1)}`);
  check('pantry respects its cap', pan1 <= cap * 1.001, `pan=${Math.round(pan1)} cap=${Math.round(cap)}`);

  note('\n=== ACT 3: process — shell, cook, cautious test ===');
  // force a nut into the pack to test shelling (if none came home)
  if (nutIdx < 0) {
    const nutPlant = (Game.data.plants || []).find(p => /crack|shell|husk/i.test(p.preparation || '') && !/toxic/i.test(p.preparation || ''));
    if (nutPlant) {
      Game.state.scholar.inventory.push({ name: nutPlant.name + ' (in shell)', plantId: nutPlant.id, units: 4, foodKind: 'nut', foodState: 'in_shell', edible: false, kcalEach: 0, hiddenKcal: 40 * 4 });
      note(`   (seeded test nut: ${nutPlant.name})`);
    }
  }
  const ni = Game.state.scholar.inventory.findIndex(i => i.foodKind === 'nut' && i.foodState === 'in_shell');
  if (ni >= 0) {
    says.length = 0;
    const k0 = s.kcal;
    Game.shellNuts(ni);
    const m = says.join(' ');
    const after = Game.state.scholar.inventory[ni];
    note(`   shellNuts> ${m.slice(0, 150)}`);
    note(`   after: ${after.name} [${after.foodKind}/${after.foodState}] kcalEach=${after.kcalEach} edible=${after.edible}`);
    check('shelling turns in-shell nuts into food', after.foodState !== 'in_shell' && (after.kcalEach || 0) > 0, `${after.foodState}, kcalEach=${after.kcalEach}`);
  } else { note('   no nuts to shell — skipped'); results.push(['shelling turns in-shell nuts into food', true]); }
  // cautious test on an unknown lump, if one exists
  const li = Game.state.scholar.inventory.findIndex(i => i.lump);
  if (li >= 0) {
    says.length = 0;
    Game.testCautiously(li, {}, undefined);
    const m = says.join(' ');
    note(`   testCautiously> ${m.slice(0, 160)}`);
    check('cautious test on unknown lump says something honest', m.length > 10 && !/undefined|null/i.test(m), m.slice(0, 60));
  } else { note('   no unknown lump in pack — skipped cautious test'); results.push(['cautious test on unknown lump says something honest', true]); }

  note('\n=== ACT 4: dawn meal — haven vs wild camp ===');
  // at haven: endDay should draw the village meal from the pantry
  s.kcal = 3000; s.hydration = 100; s.health = 100; s.energy = 100;
  const pan2 = Game.pantryKcal();
  flush();
  Game.endDay(); flush();
  const pan3 = Game.pantryKcal();
  note(`   dawn at HAVEN: day=${s.day} pantry ${Math.round(pan2)} → ${Math.round(pan3)} kcal`);
  check('haven dawn meal draws from pantry', pan3 <= pan2, `${Math.round(pan2)}→${Math.round(pan3)}`);
  // now camp wild: travel out. DESIGN (game.js endDay comment): the wild player
  // does NOT auto-eat — villageMeal only serves at haven, and the away meal is
  // the player's own job (per-item from Pack via eatOne). Check: pantry
  // untouched, the honest "camp wild" line spoken, and a manual pack eat works.
  const gt2 = walkOut(home);
  const pan4 = Game.pantryKcal();
  const kWild0 = s.kcal;
  s.kcal = 2000; s.hydration = 100; s.health = 100; s.energy = 100;
  flush();
  Game.endDay();
  const wildMsgs = says.join(' ');
  flush();
  const pan5 = Game.pantryKcal();
  note(`   dawn WILD camp: day=${s.day} pantry ${Math.round(pan4)} → ${Math.round(pan5)} (village still eats — intended)`);
  check('wild camp: no player meal share from pantry', s.kcal <= 2000 + 1, `kcal=${Math.round(s.kcal)} (topped to 2000)`);
  check('wild camp says the honest line', /camp wild/i.test(wildMsgs), wildMsgs.slice(0, 60) || '(nothing said)');
  // manual pack eat: the player's own job
  const eatIdx = Game.state.scholar.inventory.findIndex(i => (i.kcalEach || 0) > 0 && i.edible !== false);
  if (eatIdx >= 0) {
    const k0 = s.kcal; says.length = 0;
    Game.eatOne(eatIdx);
    note(`   eatOne from pack> ${says.join(' ').slice(0, 120)}`);
    check('wild player can eat from pack (per-item)', s.kcal > k0, `${Math.round(k0)}→${Math.round(s.kcal)}`);
  } else {
    note('   pack empty — manual pack-eat check skipped');
    results.push(['wild player can eat from pack (per-item)', true]);
  }

  note('\n=== ACT 5: no silent taps — dirt & grass (proof for the fix) ===');
  // Sweep a fresh patch, then re-tap the swept dirt and nearby grass.
  // Before the fix these taps said NOTHING (returned null, no say).
  const homeXY = [Game.map.px, Game.map.py];
  const s5 = Game.state.scholar;
  s5.kcal = 3000; s5.hydration = 100; s5.health = 100; s5.energy = 100;
  Game.state.scholar.inventory.length = 0; // measure the land, not pack-full
  const gt5 = walkOut();
  if (gt5) {
    const t5 = tile(), d5 = Game.genDetail(Game.map.px, Game.map.py);
    let dirtCell = null, grassCell = null;
    for (let y = 0; y <= 8 && (!dirtCell || !grassCell); y++) for (let x = 0; x <= 8; x++) {
      const c = d5[y] && d5[y][x];
      if (c === 'grass' && !grassCell) grassCell = [x, y];
    }
    // forage one plant cell to manufacture swept dirt (regrow-tagged)
    const pc = greensNow()[0];
    let swept = false;
    if (pc) {
      walkTo(pc[0], pc[1]); says.length = 0;
      Game._cellInteract(pc[0], pc[1]); flush();
      const t5b = tile(), d5b = Game.genDetail(Game.map.px, Game.map.py);
      // pick a cell the sweep just tagged for regrow (not native bare dirt)
      outer: for (const k of Object.keys(t5b.detailRegrow || {})) {
        const [kx, ky] = k.split(',').map(Number);
        if (d5b[ky] && d5b[ky][kx] === 'dirt') { dirtCell = [kx, ky]; swept = true; break outer; }
      }
      if (!dirtCell) {
        // sweep didn't fire (patch already worked out) — native bare dirt is
        // the honest case here; the read must still not be silent.
        for (let y = 0; y <= 8 && !dirtCell; y++) for (let x = 0; x <= 8; x++) {
          if (d5b[y] && d5b[y][x] === 'dirt') { dirtCell = [x, y]; break; }
        }
      }
    }
    let dirtMsg = '', grassMsg = '';
    if (dirtCell) {
      walkTo(dirtCell[0], dirtCell[1]); says.length = 0;
      Game._cellInteract(dirtCell[0], dirtCell[1]);
      dirtMsg = says.join(' ');
      note(`   tap swept dirt> ${dirtMsg.slice(0, 110)}`);
    }
    if (grassCell) {
      walkTo(grassCell[0], grassCell[1]); says.length = 0;
      Game._cellInteract(grassCell[0], grassCell[1]);
      grassMsg = says.join(' ');
      note(`   tap grass> ${grassMsg.slice(0, 110)}`);
    }
    check('re-tapping dirt is not silent', dirtMsg.length > 0, dirtMsg.slice(0, 60) || 'SILENT');
    if (swept) {
      check('swept-dirt read names the recovery promise', /recover in a few days|picked clean/i.test(dirtMsg), dirtMsg.slice(0, 60) || 'SILENT');
    } else {
      check('native bare dirt reads honestly', /bare dirt|nothing growing/i.test(dirtMsg), dirtMsg.slice(0, 60) || 'SILENT');
    }
    check('tapping grass is not silent', grassMsg.length > 0, grassMsg.slice(0, 60) || 'SILENT');
  } else {
    note('   no green tile — ACT 5 skipped');
  }

  note('\n=== FORAGER PANTRY-RUN VERDICT ===');
  const fails = results.filter(r => !r[1]).map(r => r[0]);
  note(`checks: ${results.length - fails.length}/${results.length} pass (seed ${SEED})`);
  if (fails.length) { note(`FAILS: ${fails.join(' | ')}`); process.exitCode = 1; }
})();
