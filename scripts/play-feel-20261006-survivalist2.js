#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): SURVIVALIST 2 — cold snaps and the water-filter chain.
// Played as a player, judged like a player.
//   ACT 1: cold snap, sleep exposed on the ground (the bite)
//   ACT 2: cold snap, fire fed to last the night (the protection)
//   ACT 3: cold snap, fire left to die (the "your fire died" note)
//   ACT 4: the full water-filter chain: deadfall fiber -> woven cloth -> charcoal -> filter -> clean water
//   ACT 5: fire-night branch economy — what does a cold night really cost?
// Run: node scripts/play-feel-20261006-survivalist2.js
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
function flush(tag, max = 6) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 150)}`); }
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} ticks=${s.dayTicks} @(${m.px},${m.py}) hp=${Math.round(s.health)} kcal=${Math.round(s.kcal)} hyd=${Math.round(s.hydration)} energy=${Math.round(s.energy)} weather=${Game.state.weather}`);
}
function lastSay(n = 1) { return says.splice(0).slice(-n).map(t => String(t).slice(0, 220)); }

function newRun() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2400; s.hydration = 100; s.energy = 100;
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
  let target = null;
  for (let y = 0; y < 9 && !target; y++) for (let x = 0; x < 9 && !target; x++) if (['tree', 'bigtree'].includes(detail[y][x])) target = { x, y };
  s.mx = 4; s.my = 4;
  Game.state.weather = 'cold';
  note(`   camp @(${camp.x},${camp.y}) cold snap forced, deadfall tree @(${target.x},${target.y})`);
  return { camp, detail, target };
}
function gatherTo(target, mat, n, maxIter = 80) {
  const s = Game.state.scholar; s.mx = Math.max(0, target.x - 1); s.my = target.y;
  let g = 0;
  while (g++ < maxIter && Game.materialCount(mat) < n && (s.kcal || 0) > 50) Game.gatherFallen(target.x, target.y);
  return Game.materialCount(mat);
}
function fireSpot(detail) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const cell = detail[4 + dy] && detail[4 + dy][4 + dx];
    if (Game.fireGroundOK(cell)) return { x: 4 + dx, y: 4 + dy };
  }
  return null;
}
function makeFireTillLit(fireAt, target) {
  const s = Game.state.scholar; s.mx = 4; s.my = 4;
  let tries = 6, lit = false;
  while (tries-- > 0 && !Game.nearFire()) {
    if (Game.materialCount('branch') < 2 && target) gatherTo(target, 'branch', 2, 20);
    Game.makeFire(fireAt.x, fireAt.y);
    flush('makeFire', 4);
    lit = Game.nearFire();
  }
  return lit;
}
function toNight() {
  let guard = 40;
  while (guard-- > 0 && Game.dayPart !== 3 && !Game.tbfight && !Game.over) Game.tickAction(32);
  return { part: Game.dayPart, ticks: Game.state.scholar.dayTicks };
}
function spendBranches(mat, n) { // bookkeeping helper: branches currently held
  return Game.materialCount(mat);
}

(async () => {
  await Game.init();

  // ============ ACT 1: cold snap, exposed ground ============
  note('\n=== ACT 1: cold snap, sleep exposed ===');
  {
    newRun(); says.length = 0;
    const s = Game.state.scholar;
    toNight();
    vstate('nightfall-exposed');
    const prev = Game.sleepPreview();
    note(`   preview: quality=${prev.quality} heal=${prev.heal} warn="${(prev.warn || '').slice(0, 160)}"`);
    const hp0 = Math.round(s.health), en0 = Math.round(s.energy);
    Game.sleep(); flush('sleep', 8);
    vstate('dawn');
    const dHp = Math.round(s.health) - hp0;
    note(`   VERDICT: hp delta=${dHp} (expect -18 bite), energy=${Math.round(s.energy)} (expect 60)`);
    if (dHp !== -18 || Math.round(s.energy) !== 60) note('   !! MECHANIC MISMATCH — the cold bite did not land as documented');
  }

  // ============ ACT 2: cold snap, fire fed to last the night ============
  note('\n=== ACT 2: cold snap, fire kept alive all night ===');
  {
    const { detail, target } = newRun(); says.length = 0;
    const s = Game.state.scholar;
    const before = spendBranches('branch', 0);
    const got = gatherTo(target, 'branch', 8);
    note(`   branches gathered: ${got} (${gatherTo.calls || ''})`);
    const fireAt = fireSpot(detail);
    note(`   fire spot: (${fireAt.x},${fireAt.y})`);
    const lit = makeFireTillLit(fireAt, target);
    note(`   fire lit: ${lit}`);
    const s2 = Game.state.scholar;
    // rake charcoal while the fire burns — the filter chain needs it
    says.length = 0; Game.gatherCharcoal(); flush('rake', 3);
    const charcoal = Game.materialCount('charcoal');
    // advance to night, then feed until the fire outlasts the dark
    toNight();
    const nightStart = s2.dayTicks;
    note(`   night starts at tick ${nightStart} (dawn at 512; night = ${512 - nightStart} ticks)`);
    note(`   fireLastsTillDawn before feeding: ${Game.fireLastsTillDawn()}`);
    let feeds = 0;
    while (!Game.fireLastsTillDawn() && Game.materialCount('branch') >= 1 && feeds < 12) { Game.feedFire(fireAt.x, fireAt.y); feeds++; }
    note(`   feeds to outlast the night: ${feeds}; branches left: ${Game.materialCount('branch')}; fireLastsTillDawn: ${Game.fireLastsTillDawn()}`);
    const totalBranches = got - Game.materialCount('branch');
    note(`   NIGHT FUEL COST: ~${totalBranches} branches (2 to light + ${feeds} feeds)`);
    const prev = Game.sleepPreview();
    note(`   preview: quality=${prev.quality} heal=${prev.heal} warn="${(prev.warn || '').slice(0, 160)}"`);
    const hp0 = Math.round(s2.health);
    Game.sleep(); flush('sleep', 8);
    vstate('dawn');
    const dHp = Math.round(s2.health) - hp0;
    note(`   VERDICT: hp delta=${dHp} (expect +18 fireside heal, no bite), energy=${Math.round(s2.energy)}`);
  }

  // ============ ACT 3: cold snap, fire left to die ============
  note('\n=== ACT 3: cold snap, fire dies in the night ===');
  {
    const { detail, target } = newRun(); says.length = 0;
    const s = Game.state.scholar;
    gatherTo(target, 'branch', 6);
    const fireAt = fireSpot(detail);
    const lit = makeFireTillLit(fireAt, target);
    note(`   fire lit: ${lit}; deliberately NOT feeding`);
    toNight();
    note(`   fireLastsTillDawn: ${Game.fireLastsTillDawn()} (expect false)`);
    const prev = Game.sleepPreview();
    note(`   preview: quality=${prev.quality} warn="${(prev.warn || '').slice(0, 200)}"`);
    const hp0 = Math.round(s.health);
    says.length = 0; Game.sleep(); flush('sleep', 10);
    vstate('dawn');
    const dHp = Math.round(s.health) - hp0;
    note(`   VERDICT: hp delta=${dHp} (expect -18: "your fire died"), energy=${Math.round(s.energy)} (expect 60)`);
    if (dHp !== -18) note('   !! MECHANIC MISMATCH — dying-fire bite did not land');
  }

  // ============ ACT 4: the water-filter chain ============
  note('\n=== ACT 4: the full water-filter chain ===');
  {
    const { detail, target } = newRun(); says.length = 0;
    const s = Game.state.scholar;
    Game.state.weather = 'clear';
    // 4a: deadfall fiber — how many gathers for 3 fiber?
    let gathers = 0, gg = 120;
    const kcal0 = Math.round(s.kcal);
    while (gg-- > 0 && Game.materialCount('fiber') < 3 && (s.kcal || 0) > 100) { Game.gatherFallen(target.x, target.y); gathers++; }
    const fiber = Game.materialCount('fiber');
    note(`   4a deadfall: ${gathers} gathers -> ${fiber} fiber (need 3), kcal spent ~${kcal0 - Math.round(s.kcal)}`);
    // 4b: weave cloth
    let clothOk = false;
    if (fiber >= 3) { says.length = 0; clothOk = !!Game.craft('cloth'); flush('weave', 4); }
    note(`   4b weave cloth: ${clothOk ? 'OK' : 'FAILED (not enough fiber / craft fail)'}`);
    // 4c: charcoal from a live fire
    let charcoalOk = false;
    if (clothOk) {
      gatherTo(target, 'branch', 4, 30);
      const fireAt = fireSpot(detail);
      if (makeFireTillLit(fireAt, target)) { says.length = 0; Game.gatherCharcoal(); flush('rake', 3); charcoalOk = Game.materialCount('charcoal') >= 1; }
    }
    note(`   4c rake charcoal: ${charcoalOk ? 'OK' : 'FAILED'}`);
    // 4d: build the filter
    let filterOk = false;
    if (charcoalOk) { says.length = 0; filterOk = !!Game.craft('water_filter'); flush('build-filter', 4); }
    note(`   4d build water filter: ${filterOk ? 'OK' : 'FAILED'}`);
    const filter = (s.tools || []).find(t => t.recipeId === 'water_filter');
    note(`   filter uses: ${filter ? filter.uses : 'none'}`);
    // 4e: fill risky, filter it
    if (filterOk) {
      // find a water tile and stand on it
      const tiles = Game.map.tiles;
      let w = null;
      outerw: for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const t = tiles[y][x];
        if (/creek|wetland|river|lake|spring/.test(t.type || '')) { w = { x, y, type: t.type }; break outerw; }
      }
      if (w) {
        Game.map.px = w.x; Game.map.py = w.y;
        says.length = 0; Game.fillWater(); flush('fillRisky', 4);
        const before = JSON.stringify((s.water || []).map(b => b.quality));
        says.length = 0; Game.filterWater(); flush('filter', 4);
        const after = JSON.stringify((s.water || []).map(b => b.quality));
        note(`   4e filter risky: before=[${before}] after=[${after}]`);
        note(`   filter uses left: ${(s.tools || []).find(t => t.recipeId === 'water_filter') ? (s.tools || []).find(t => t.recipeId === 'water_filter').uses : 'filter consumed/dead'}`);
      } else note('   4e no water tile on map — could not test filtering');
    }
    vstate('chain-done');
    note('   VERDICT: cloth needs 3 fiber at 25%/gather; full chain spans ~4 distinct actions + fire. See notes.');
  }

  // ============ ACT 5: branch economy sanity ============
  note('\n=== ACT 5: fire-night branch economy ===');
  {
    const { detail, target } = newRun(); says.length = 0;
    const s = Game.state.scholar;
    Game.state.weather = 'clear';
    // gather 10 branches, count gathers (player-time) — the honest nightly chore
    let g = 0; const k0 = Math.round(s.kcal); const t0 = s.dayTicks;
    while (g < 40 && Game.materialCount('branch') < 10) { Game.gatherFallen(target.x, target.y); g++; }
    const branches = Game.materialCount('branch');
    note(`   10 branches cost ${g} gathers, ~${k0 - Math.round(s.kcal)} kcal, ${s.dayTicks - t0} ticks`);
    note(`   VERDICT: a cold night (~${2} light + feeds) ≈ ${Math.ceil((2 + 3) / branches * g)} gathers of the player's evening. See ACT 2 actuals.`);
  }
  note('\n=== SURVIVALIST 2 RUN COMPLETE ===');
})().catch(e => { console.error('PLAYTEST ERROR:', e.message); console.error(e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });
