#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07): SURVIVALIST 3 — a full wild day as a player.
//   ACT 1: depart -> creek -> fill bottles (honest costs? mass gate? cistern?)
//   ACT 2: friction fire lottery -> boil -> drink -> cook raw food (net kcal?)
//   ACT 3: pitch tent -> sleep quality + heal; cold night exposed on purpose
//   ACT 4: hydration/energy/kcal curve across the day — can a wild day sustain?
// Run: node scripts/play-feel-20261007-survivalist3.js
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function flush(tag, max = 4) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 160)}`); }
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} ticks=${s.dayTicks}/${Game.TIME.TICKS_PER_DAY} @(${m.px},${m.py}) hp=${Math.round(s.health)} kcal=${Math.round(s.kcal)} hyd=${Math.round(s.hydration)} en=${Math.round(s.energy)} H2O=${(s.water || []).length}L`);
}
function newRun() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 3000; s.hydration = 100; s.energy = 100;
  return s;
}
function findCamp(withWater) {
  const tiles = Game.map.tiles;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = tiles[y][x]; if (t.type === 'haven') continue;
    const d = Game.genDetail(x, y);
    const flat = d.flat().join(',');
    const hasTrees = /tree/.test(flat);
    const hasCreek = t.type === 'creek' || /creek|water/.test(flat);
    if (hasTrees && (!withWater || hasCreek)) { Game.map.px = x; Game.map.py = y; return { x, y, detail: d }; }
  }
  throw new Error('no camp tile');
}
function moveNear(cx, cy) {
  const s = Game.state.scholar;
  s.mx = Math.max(1, Math.min(7, cx + (cx > 4 ? -1 : 1)));
  s.my = Math.max(1, Math.min(7, cy + (cy > 4 ? -1 : 1)));
}
function fireSpot(detail) {
  const s = Game.state.scholar;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0) continue;
    const cx = (s.mx ?? 4) + dx, cy = (s.my ?? 4) + dy;
    if (cx < 1 || cx > 7 || cy < 1 || cy > 7) continue;
    if (Game.fireGroundOK(detail[cy][cx])) return { x: cx, y: cy };
  }
  return null;
}
function forageSweep(detail, fn, max = 20) {
  // area forage: sweep nearby cells, run Game.forage() logic per tree/ground cell
  const s = Game.state.scholar;
  let n = 0;
  for (let dy = -1; dy <= 1 && n < max; dy++) for (let dx = -1; dx <= 1 && n < max; dx++) {
    const cx = (s.mx ?? 4) + dx, cy = (s.my ?? 4) + dy;
    if (cx < 1 || cx > 7 || cy < 1 || cy > 7) continue;
    const cell = detail[cy][cx];
    if (['tree', 'bigtree', 'grass', 'dirt', 'clearing'].includes(cell)) { fn(cx, cy, cell); n++; }
  }
  return n;
}

(async () => {
  await Game.init();

  // ================= ACT 1: depart, find water, fill =================
  note('\n=== ACT 1: water — depart, creek, fill ===');
  {
    const s = newRun(); says.length = 0;
    const camp = findCamp(true);
    note(`   camp at (${camp.x},${camp.y})`);
    const detail = camp.detail;
    let creekCell = null;
    for (let y = 1; y < 8 && !creekCell; y++) for (let x = 1; x < 8 && !creekCell; x++)
      if (['creek', 'water', 'stream'].includes(detail[y][x])) creekCell = { x, y };
    if (!creekCell) { // walk to the tile's creek edge
      for (let y = 1; y < 8 && !creekCell; y++) for (let x = 1; x < 8 && !creekCell; x++)
        if (detail[y][x] === 'creek') creekCell = { x, y };
    }
    note(`   creek cell: ${creekCell ? JSON.stringify(creekCell) : 'NONE FOUND'}`);
    if (creekCell) {
      moveNear(creekCell.x, creekCell.y);
      const t0 = s.dayTicks, k0 = Math.round(s.kcal);
      for (let i = 0; i < 3; i++) { says.length = 0; Game.fillWater(); }
      flush('fill');
      note(`   3 fills: ${s.dayTicks - t0} ticks, ${k0 - Math.round(s.kcal)} kcal, water=${JSON.stringify((s.water || []).map(w => w.quality))}`);
      vstate('after fill');
      // drink one risky liter raw — player's gamble
      const h0 = Math.round(s.hydration);
      says.length = 0; Game.drinkWater(); flush('drink');
      note(`   drank raw risky: hyd ${h0}->${Math.round(s.hydration)} (sick? see line above)`);
    }
    vstate('act1 end');
  }

  // ================= ACT 2: fire lottery -> boil -> cook =================
  note('\n=== ACT 2: fire lottery, boil, cook ===');
  {
    const s = newRun(); says.length = 0;
    const camp = findCamp(false);
    const detail = camp.detail;
    // gather branches via area forage sweep — stand ON a tree cell first
    let treeC = null;
    for (let y = 1; y < 8 && !treeC; y++) for (let x = 1; x < 8 && !treeC; x++)
      if (['tree', 'bigtree'].includes(detail[y][x])) treeC = { x, y };
    if (treeC) { s.mx = treeC.x; s.my = treeC.y; }
    let sweeps = 0;
    const b0 = Game.materialCount('branch');
    while (sweeps < 14 && Game.materialCount('branch') < 4 && (s.kcal || 0) > 500) {
      says.length = 0;
      Game.gatherFallen(s.mx ?? 4, s.my ?? 4); sweeps++;
      says.length = 0;
    }
    note(`   branches after ${sweeps} forage ticks: ${Game.materialCount('branch')} (was ${b0})`);
    // make fire on first burnable cell
    moveNear(4, 4);
    const fs2 = fireSpot(detail);
    note(`   fire spot: ${fs2 ? JSON.stringify(fs2) : 'NONE'}`);
    let attempts = 0, burned = 0;
    if (fs2) {
      const k0 = Math.round(s.kcal), t0 = s.dayTicks;
      while (attempts < 6 && !Game.nearFire()) {
        says.length = 0; Game.makeFire(fs2.x, fs2.y); attempts++;
        if (says.length) note(`   | fire-att${attempts} ${says[says.length - 1].slice(0, 130)}`);
        burned = attempts;
      }
      note(`   fire lit after ${burned} attempts (${s.dayTicks - t0} ticks, ${k0 - Math.round(s.kcal)} kcal)`);
      flush('fire');
      // fill + boil risky water
      s.mx = fs2.x; s.my = fs2.y;
      for (let i = 0; i < 2; i++) { Game.state.scholar.water = Game.state.scholar.water || []; }
      Game.addWater && Game.addWater(2, 'risky', 'Creek (unknown)');
      const kb = Math.round(s.kcal), tb = s.dayTicks;
      says.length = 0; Game.boilWater(); flush('boil');
      note(`   boil cost: ${s.dayTicks - tb} ticks, ${kb - Math.round(s.kcal)} kcal`);
      // cook a raw item if we have one
      const idx = (s.inventory || []).findIndex(i => i.rawKcal);
      note(`   raw item in pack: ${idx >= 0 ? s.inventory[idx].name : 'NONE'}`);
      if (idx >= 0) {
        const before = Math.round(s.kcal), tb2 = s.dayTicks;
        says.length = 0; Game.cookFood(idx); flush('cook');
        note(`   cook cost: ${s.dayTicks - tb2} ticks, ${before - Math.round(s.kcal)} kcal`);
      }
      // drink clean
      says.length = 0; Game.drinkWater(); flush('drink2');
    }
    vstate('act2 end');
  }

  // ================= ACT 2b: the equipped path — lighter + raw meat =================
  note('\n=== ACT 2b: equipped path — lighter, boil, cook, eat ===');
  {
    const s = newRun(); says.length = 0;
    const camp = findCamp(true);
    const detail = camp.detail;
    (s.inventory = s.inventory || []).push({ kind: 'tool', name: 'Lighter', itemId: 'lighter', units: 1 });
    (s.inventory = s.inventory || []).push({ kind: 'food', name: 'Raw rabbit haunch', rawKcal: 320, cookedKcal: 480, units: 1, needsCooking: true });
    Game.addMaterial('branch', 4);
    let treeC = null;
    for (let y = 1; y < 8 && !treeC; y++) for (let x = 1; x < 8 && !treeC; x++)
      if (['tree', 'bigtree'].includes(detail[y][x])) treeC = { x, y };
    s.mx = treeC.x; s.my = treeC.y;
    moveNear(4, 4);
    const fs2 = fireSpot(detail);
    const k0 = Math.round(s.kcal), t0 = s.dayTicks;
    says.length = 0; Game.makeFire(fs2.x, fs2.y); flush('fire2b');
    note(`   lighter fire: ${s.dayTicks - t0} ticks, ${k0 - Math.round(s.kcal)} kcal, lit=${Game.nearFire()}`);
    // fill 2 risky, boil
    s.water = [{ liters: 1, quality: 'risky', source: 'Creek (unknown)' }, { liters: 1, quality: 'risky', source: 'Creek (unknown)' }];
    says.length = 0; Game.boilWater(); flush('boil2b');
    note(`   after boil: ${JSON.stringify(s.water.map(w => w.quality))}`);
    // cook the raw haunch (needs clean water)
    const idx = s.inventory.findIndex(i => i.rawKcal);
    const kb = Math.round(s.kcal), tb = s.dayTicks;
    says.length = 0; Game.cookFood(idx); flush('cook2b');
    note(`   cook cost: ${s.dayTicks - tb} ticks, ${kb - Math.round(s.kcal)} kcal; water left=${s.water.length}L`);
    // eat it
    const ke = Math.round(s.kcal);
    says.length = 0; Game.eatOne(s.inventory.findIndex(i => i.name === 'Raw rabbit haunch')); flush('eat2b');
    note(`   ate: kcal ${ke} -> ${Math.round(s.kcal)} (net of the whole water+fire+cook chain)`);
    note(`   CHAIN TOTAL: ${s.dayTicks - t0} ticks of a ${Game.TIME.TICKS_PER_DAY}-tick day, ${k0 - Math.round(s.kcal)} kcal burned for ${Math.round(s.kcal) - k0} net — mastery or chores?`);
    vstate('act2b end');
  }

  // ================= ACT 3: shelter + sleep =================
  note('\n=== ACT 3: tent pitch + sleep; cold-night exposed ===');
  {
    const s = newRun(); says.length = 0;
    const camp = findCamp(false);
    const detail = camp.detail;
    // give a packed tent
    (s.inventory = s.inventory || []).push({ kind: 'tent', name: 'Canvas tent', units: 1 });
    let clearCell = null;
    for (let y = 1; y < 8 && !clearCell; y++) for (let x = 1; x < 8 && !clearCell; x++)
      if (['dirt', 'grass', 'clearing', 'path'].includes(detail[y][x])) clearCell = { x, y };
    note(`   clear cell for tent: ${clearCell ? JSON.stringify(clearCell) : 'NONE'}`);
    if (clearCell) {
      moveNear(clearCell.x, clearCell.y);
      const t0 = s.dayTicks, k0 = Math.round(s.kcal);
      says.length = 0; Game.pitchTent(clearCell.x, clearCell.y); flush('tent');
      note(`   pitch cost: ${s.dayTicks - t0} ticks, ${k0 - Math.round(s.kcal)} kcal; quality=${Game.sleepQuality()}`);
    }
    // jump to evening so sleep is legal
    s.dayTicks = Math.max(s.dayTicks, Game.TIME.TICKS_PER_PART * 3);
    s.health = 70; // banged up — can we heal?
    const q = Game.sleepQuality();
    const prev = Game.sleepPreview();
    note(`   sleep quality=${q} preview heal=~${prev.heal} warn=${prev.warn || 'none'}`);
    says.length = 0;
    const hp0 = Math.round(s.health), en0 = Math.round(s.energy);
    Game.sleep();
    flush('sleep');
    note(`   slept: hp ${hp0}->${Math.round(s.health)} (+${Math.round(s.health) - hp0}), en ${en0}->${Math.round(s.energy)}, day now ${s.day}`);
    vstate('act3 tent end');
  }
  {
    // cold-night exposed sleep — the mistake you make once
    const s = newRun(); says.length = 0;
    findCamp(false);
    Game.state.weather = 'cold';
    s.mx = 4; s.my = 4;
    s.dayTicks = Math.max(s.dayTicks, Game.TIME.TICKS_PER_PART * 3);
    s.health = 80;
    const prev = Game.sleepPreview();
    note(`   cold night, exposed: quality=${prev.quality} heal=~${prev.heal} warn=${prev.warn || 'NONE — BUG?'}`);
    const hp0 = Math.round(s.health);
    says.length = 0; Game.sleep(); flush('coldsleep');
    note(`   slept exposed in cold: hp ${hp0}->${Math.round(s.health)} (expect -18, no heal)`);
    vstate('act3 cold end');
  }

  // ================= ACT 4: needs curve — full wild day =================
  note('\n=== ACT 4: needs curve across a wild day ===');
  {
    const s = newRun(); says.length = 0;
    findCamp(true);
    s.dayTicks = 0;
    s.kcal = 2600; s.hydration = 60; s.energy = 90; s.health = 100;
    const T = Game.TIME;
    const snaps = [];
    for (let p = 0; p < 4; p++) {
      // live a part: idle ticks + one meal/drink midday
      says.length = 0;
      Game.tickAction(T.TICKS_PER_PART);
      snaps.push(`part${p + 1}: kcal=${Math.round(s.kcal)} hyd=${Math.round(s.hydration)} en=${Math.round(s.energy)} hp=${Math.round(s.health)}`);
    }
    for (const x of snaps) note('   ' + x);
    note('   (passive drains for a 512-tick day with no input — the floor the loop must beat)');
    vstate('act4 end');
  }

  note('\n=== DONE ===');
})().catch(e => { console.error('FATAL', e); process.exit(2); });