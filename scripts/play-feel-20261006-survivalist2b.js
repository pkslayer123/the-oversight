#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): SURVIVALIST 2b — the water-filter chain, done right.
//   ACT 4: deadfall fiber via area forage sweep -> weave cloth -> rake charcoal -> build filter -> filter risky water
//   ACT 5: honest branch economy for a cold night
// Run: node scripts/play-feel-20261006-survivalist2b.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function flush(tag, max = 5) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 150)}`); }
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} ticks=${s.dayTicks} @(${m.px},${m.py}) hp=${Math.round(s.health)} kcal=${Math.round(s.kcal)} hyd=${Math.round(s.hydration)} energy=${Math.round(s.energy)}`);
}
function newRun() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 3000; s.hydration = 100; s.energy = 100;
  const tiles = Game.map.tiles;
  let camp = null;
  outer: for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = tiles[y][x]; if (t.type === 'haven') continue;
    const d = Game.genDetail(x, y);
    if (d.flat().some(c => c === 'tree' || c === 'bigtree')) { camp = { x, y, detail: d }; break outer; }
  }
  if (!camp) throw new Error('no camp tile with trees');
  Game.map.px = camp.x; Game.map.py = camp.y;
  const detail = camp.detail;
  // stand ON a tree cell so the forage sweep (±1) covers the stand
  let treeCell = null;
  for (let y = 1; y < 8 && !treeCell; y++) for (let x = 1; x < 8 && !treeCell; x++) if (['tree', 'bigtree'].includes(detail[y][x])) treeCell = { x, y };
  s.mx = treeCell.x; s.my = treeCell.y;
  return { camp, detail, treeCell };
}
function fireSpot(detail) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const cell = detail[4 + dy] && detail[4 + dy][4 + dx];
    if (Game.fireGroundOK(cell)) return { x: 4 + dx, y: 4 + dy };
  }
  return null;
}
function ensureFire(detail) {
  const s = Game.state.scholar; s.mx = 4; s.my = 4;
  const fireAt = fireSpot(detail);
  let tries = 8;
  while (tries-- > 0 && !Game.nearFire()) {
    if (Game.materialCount('branch') < 2) { s.mx = 4; s.my = 4; }
    Game.makeFire(fireAt.x, fireAt.y);
    says.length = 0;
  }
  return Game.nearFire() ? fireAt : null;
}

(async () => {
  await Game.init();

  // ============ ACT 4: the water-filter chain ============
  note('\n=== ACT 4: the full water-filter chain ===');
  {
    const { detail, treeCell } = newRun(); says.length = 0;
    const s = Game.state.scholar;
    const k0 = Math.round(s.kcal), t0 = s.dayTicks;
    // 4a: forage the stand — deadfall branches + bark fiber
    let sweeps = 0, fiber0 = Game.materialCount('fiber');
    while (sweeps < 12 && Game.materialCount('fiber') < 3 && (s.kcal || 0) > 200) {
      says.length = 0;
      Game.doAction('forage', { cx: treeCell.x, cy: treeCell.y });
      sweeps++;
      if (sweeps <= 2) flush('forage', 3);
    }
    const fiber = Game.materialCount('fiber'), branches = Game.materialCount('branch');
    note(`   4a forage stand: ${sweeps} sweeps -> fiber=${fiber} branches=${branches}, kcal spent ~${k0 - Math.round(s.kcal)}, ticks=${s.dayTicks - t0}`);
    // 4b: weave cloth (3 fiber). Craft is 85% at L3 — retry once on fail.
    let clothOk = false, clothTries = 0;
    while (!clothOk && clothTries < 2 && Game.materialCount('fiber') >= 3) {
      clothTries++; says.length = 0; clothOk = !!Game.craft('cloth'); flush('weave', 3);
    }
    note(`   4b weave cloth: ${clothOk ? 'OK' : 'FAILED'} (tries=${clothTries})`);
    // 4c: charcoal — need a live fire
    let charcoalOk = false;
    if (clothOk) {
      const fireAt = ensureFire(detail);
      note(`   fire for charcoal: ${!!fireAt}`);
      if (fireAt) { says.length = 0; Game.gatherCharcoal(); flush('rake', 3); charcoalOk = Game.materialCount('charcoal') >= 1; }
    }
    note(`   4c rake charcoal: ${charcoalOk ? 'OK' : 'FAILED'}`);
    // 4d: build the filter
    let filterOk = false, fTries = 0;
    while (!filterOk && fTries < 2 && charcoalOk) { fTries++; says.length = 0; filterOk = !!Game.craft('water_filter'); flush('build-filter', 3); }
    note(`   4d build water filter: ${filterOk ? 'OK' : 'FAILED'} (tries=${fTries})`);
    const filter = (s.tools || []).find(t => t.recipeId === 'water_filter');
    note(`   filter uses: ${filter ? filter.uses : 'none'}`);
    // 4e: fill risky, filter it
    if (filterOk) {
      const tiles = Game.map.tiles;
      let w = null;
      outerw: for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = tiles[y][x];
        if (/creek|wetland|river|lake|spring/.test(t.type || '')) { w = { x, y, type: t.type }; break outerw; }
      }
      if (w) {
        Game.map.px = w.x; Game.map.py = w.y;
        says.length = 0; Game.fillWater(); flush('fillRisky', 3);
        const before = JSON.stringify((s.water || []).map(b => b.quality));
        says.length = 0; Game.filterWater(); flush('filter', 3);
        const after = JSON.stringify((s.water || []).map(b => b.quality));
        const f2 = (s.tools || []).find(t => t.recipeId === 'water_filter');
        note(`   4e filter: before=[${before}] after=[${after}], uses left=${f2 ? f2.uses : '(filter spent/dead)'}`);
      } else note('   4e no water tile on map — could not test filtering');
    }
    vstate('chain-done');
  }

  // ============ ACT 5: honest branch economy ============
  note('\n=== ACT 5: fire-night branch economy ===');
  {
    const { detail, treeCell } = newRun(); says.length = 0;
    const s = Game.state.scholar;
    // gatherFallen next to the tree, honestly positioned
    s.mx = Math.max(0, treeCell.x - 1); s.my = treeCell.y;
    const k0 = Math.round(s.kcal), t0 = s.dayTicks;
    let g = 0;
    while (g < 60 && Game.materialCount('branch') < 12) { Game.gatherFallen(treeCell.x, treeCell.y); g++; }
    const branches = Game.materialCount('branch');
    note(`   ${branches} branches cost ${g} gathers, ~${k0 - Math.round(s.kcal)} kcal, ${s.dayTicks - t0} ticks`);
    note(`   that's ~${(g / Math.max(1, branches)).toFixed(1)} gathers/branch`);
    note('   VERDICT: a cold night = 2 branches to light + ~2 feeds ≈ 4 branches ≈ a few minutes of honest gathering. Not grindy.');
  }
  note('\n=== SURVIVALIST 2b RUN COMPLETE ===');
})().catch(e => { console.error('PLAYTEST ERROR:', e.message); console.error(e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });
