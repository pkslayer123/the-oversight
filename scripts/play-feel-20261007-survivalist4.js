#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07): SURVIVALIST 4 — five days wild, off the land.
// A COMPETENT survivalist plays the intended loop:
//   Phase 0 (haven): forage -> sort at camp (the ritual) -> learn
//   Phase 1 (5 wild days at a creek camp): forage blind -> cautious-test lumps
//     -> shell/cook -> boil -> eat -> drink -> feed fire -> tent -> sleep
// Judge like a player: sustainable? fun or chores? honest? what breaks?
// Run: node scripts/play-feel-20261007-survivalist4.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function note(t) { console.log(t); }
function flush(tag, max = 3) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 170)}`); }
function clearSays() { says.splice(0); }
function vstate(label) {
  const s = Game.state.scholar;
  note(`   [${label}] day=${s.day} ticks=${s.dayTicks} hp=${Math.round(s.health)} kcal=${Math.round(s.kcal)} hyd=${Math.round(s.hydration)} en=${Math.round(s.energy)} H2O=${(s.water || []).length}L pack=${Game.packWeight().toFixed(1)}/${Game.packCapacity()} diseases=${(s.diseases || []).length}`);
}
function fireSpot() {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const s = Game.state.scholar, px = s.mx ?? 4, py = s.my ?? 4;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const cx = px + dx, cy = py + dy;
    if (cx < 1 || cx > 7 || cy < 1 || cy > 7) continue;
    try { if (Game.fireGroundOK(detail[cy][cx])) return { x: cx, y: cy }; } catch (e) {}
  }
  return null;
}
function materialCount(name) {
  let n = 0;
  for (const i of (Game.state.scholar.inventory || [])) if (i.material === name) n += (i.units || 0);
  return n;
}
function lumpIndices() {
  const out = [];
  (Game.state.scholar.inventory || []).forEach((it, i) => { if (it.lump && Object.keys(it.lump).length) out.push(i); });
  return out;
}
function edibleIndex(preferCooked) {
  const inv = Game.state.scholar.inventory || [];
  const ok = (it) => (it.kcalEach || 0) > 0 && (it.units || 0) > 0 && it.edible !== false;
  let idx = inv.findIndex(it => ok(it) && it.foodState === 'cooked');
  if (idx < 0 && !preferCooked) idx = inv.findIndex(it => ok(it) && it.foodState !== 'raw' && it.foodState !== 'unknown');
  if (idx < 0) idx = inv.findIndex(it => ok(it) && it.edible === true);
  return idx;
}
let actionCount = 0;
function act(fn, ...a) { actionCount++; return fn.apply(Game, a); }

(async () => {
  await Game.init();
  note(`seed=${SEED}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2600; s.hydration = 90; s.energy = 100;
  s.inventory = s.inventory.concat([
    { itemId: 'tent', kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, unit: 'tent' },
    { itemId: 'knife', name: 'Knife', units: 1, kg: 0.4 },
    { itemId: 'axe', name: 'Axe', units: 1, kg: 1.2 },
    { itemId: 'lighter', name: 'Lighter', units: 1, kg: 0.05 },
  ]);
  s.water = [];
  Game.addWater(2, 'clean', 'Haven well');
  clearSays();

  // ============ PHASE 0: haven day — forage, sort, learn ============
  note('\n=== PHASE 0: haven day — forage, sort (the ritual), learn ===');
  vstate('haven-dawn');
  const hcells = [[3, 3], [5, 3], [3, 5], [5, 5], [2, 4], [6, 4], [4, 2], [4, 6]];
  for (const [cx, cy] of hcells.slice(0, 6)) {
    try { act(Game.doAction, 'forage', { cx, cy }); } catch (e) { note('   forage err: ' + e.message); }
  }
  flush('forage', 3);
  note(`   lumps: ${lumpIndices().length}, branches: ${materialCount('branch')}`);
  note(' -- sort the bag (camp ritual, solo) --');
  for (const li of lumpIndices().slice()) {
    try { act(Game.sortBag, null, li, s.inventory); } catch (e) { note('   sort err: ' + e.message); }
    flush('sort', 2);
  }
  const knownPlants = Object.keys((Game.state.codex || {}).plants || {}).length;
  note(`   plants known after sorting: ${knownPlants}`);
  vstate('haven-eve');
  // sleep at haven (hall) to start fresh
  waitTillNight();
  clearSays();
  try { act(Game.sleep); } catch (e) { note('   sleep err: ' + e.message); }
  flush('sleep', 2);
  vstate('haven-dawn-2');

  // ============ PHASE 1: depart — 5 wild days ============
  note('\n=== PHASE 1: depart for the wild ===');
  act(Game.depart); flush('depart', 1);
  let camp = null;
  for (let y = 0; y < 7 && !camp; y++) for (let x = 0; x < 7 && !camp; x++)
    if (Game.map.tiles[y][x].type === 'creek') camp = { x, y };
  if (!camp) { note('FATAL: no creek tile'); process.exit(1); }
  Game.map.px = camp.x; Game.map.py = camp.y;
  s.mx = 4; s.my = 4;
  Game.genDetail(camp.x, camp.y);
  note(`camp at creek (${camp.x},${camp.y})`);
  vstate('wild-depart');

  // cut a tree for firewood (axe work, honest tradeoff: the tree is gone)
  function cutFirewood() {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    const px = s.mx ?? 4, py = s.my ?? 4;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const cx = px + dx, cy = py + dy;
      if (cx < 1 || cx > 7 || cy < 1 || cy > 7) continue;
      const cell = detail[cy] && detail[cy][cx];
      if (cell === 'tree' || cell === 'bigtree') {
        try { act(Game.cutTree, cx, cy); } catch (e) { note('   cut err: ' + e.message); }
        flush('cut', 1);
        return true;
      }
    }
    return false;
  }
  let tentCell = null;
  let diseaseEvents = 0, tested = 0, spoilRefused = 0;
  const heard = (re) => says.some(t => re.test(t));
  // wait until night WITHOUT crossing midnight (track the day)
  function waitTillNight() {
    const startDay = s.day;
    let guard = 0;
    while (s.day === startDay && (s.dayTicks || 0) < Game.TIME.TICKS_PER_DAY * 0.8 && guard++ < 8) {
      try { act(Game.doAction, 'wait'); } catch (e) { break; }
    }
  }

  for (let d = 1; d <= 5; d++) {
    note(`\n================ WILD DAY ${d} ================`);
    actionCount = 0;
    vstate('dawn');

    // ---- MORNING: water discipline ----
    act(Game.fillWater); flush('fill', 1);
    act(Game.fillWater); flush('fill', 1);
    // fuel check: need 2 branches for friction fire
    let branches = materialCount('branch');
    if (branches < 2 && Game.woodCount() < 1) {
      note(` -- no deadfall (have ${branches}) — cut a tree for firewood --`);
      cutFirewood();
      branches = materialCount('branch');
    }
    note(`   branches: ${branches}, wood logs: ${Game.woodCount()}`);
    const spot = fireSpot();
    if (!Game.nearFire() && spot && (branches >= 2 || Game.woodCount() >= 1)) { act(Game.makeFire, spot.x, spot.y); flush('fire', 1); }
    else if (!Game.nearFire()) note(`   no fire: spot=${!!spot} branches=${branches} wood=${Game.woodCount()}`);
    if (Game.nearFire()) { act(Game.boilWater); flush('boil', 1); }
    for (let i = 0; i < 3; i++) { const b = s.hydration; act(Game.drinkWater); if (s.hydration <= b && i > 0) break; }
    flush('drink', 2);

    // ---- MIDDAY: forage, cautious-test the biggest unknown lump ----
    const mcells = [[3, 3], [5, 3], [3, 5], [5, 5]];
    for (const [cx, cy] of mcells.slice(0, 2 + (d % 2))) {
      try { act(Game.doAction, 'forage', { cx, cy }); } catch (e) { note('   forage err: ' + e.message); }
    }
    flush('forage', 3);
    const lumps = lumpIndices();
    if (lumps.length && tested < 3) {
      note(` -- cautious edibility test (lump ${lumps[0]}) --`);
      const db4 = (s.diseases || []).length;
      try { act(Game.testCautiously, lumps[0]); } catch (e) { note('   test err: ' + e.message); }
      flush('test', 3);
      if ((s.diseases || []).length > db4) diseaseEvents++;
      tested++;
    } else if (lumps.length) note(`   (${lumps.length} unknown lump(s) left untested — testing costs an afternoon)`);
    // shell nuts if any
    const nutIdx = (s.inventory || []).findIndex(it => it.needsShelling || /shell/i.test(it.prep || ''));
    if (nutIdx >= 0) { try { act(Game.shellNuts, nutIdx); } catch (e) {} flush('shell', 1); }
    if (Game.nearFire()) { act(Game.cookAll); flush('cook', 2); }
    // eat: cooked first, then known-safe
    let ate = 0;
    for (let i = 0; i < 5; i++) {
      const idx = edibleIndex(i < 2);
      if (idx < 0) break;
      const db4 = (s.diseases || []).length;
      try { act(Game.eatOne, idx); ate++; } catch (e) { note('   eat err: ' + e.message); break; }
      if ((s.diseases || []).length > db4) { diseaseEvents++; note('   !! disease from food'); }
      if (heard(/went bad|beyond eating|flies/)) { spoilRefused++; note('   !! spoiled food refused'); clearSays(); }
    }
    flush('eat', 2);
    if (!ate) note('   ate NOTHING — no edible food in pack');

    // ---- EVENING: feed fire to outlast the night, tent, honest sleep ----
    const espot = fireSpot();
    if (Game.nearFire() && espot) {
      const f0 = (Game.state.fires || []).find(f => f.tx === camp.x && f.ty === camp.y);
      try { act(Game.feedFire, espot.x, espot.y); } catch (e) { note('   feed err: ' + e.message); }
      flush('feed', 1);
      const f1 = (Game.state.fires || []).find(f => f.tx === camp.x && f.ty === camp.y);
      note(`   fire till ${f0 ? f0.till : '?'} -> ${f1 ? f1.till : '?'}; lastsTillDawn: ${Game.fireLastsTillDawn()}`);
    }
    if (!s.tentPitched && espot) {
      try { act(Game.pitchTent, espot.x, espot.y); s.tentPitched = true; tentCell = { x: espot.x, y: espot.y }; } catch (e) { note('   tent err: ' + e.message); }
      flush('tent', 1);
    }
    // walk back to the tent before sleeping (tap-to-step moved us around)
    if (tentCell) { s.mx = Math.max(1, Math.min(7, tentCell.x + 1)); s.my = tentCell.y; }
    waitTillNight();
    clearSays();
    let prev = null;
    try { prev = Game.sleepPreview(); } catch (e) { note('   preview err: ' + e.message); }
    note(`   sleepPreview: ${JSON.stringify(prev).slice(0, 280)}`);
    const hpBefore = Math.round(s.health), kBefore = Math.round(s.kcal);
    try { act(Game.sleep); } catch (e) { note('   sleep err: ' + e.message); }
    flush('sleep', 2);
    note(`   hp ${hpBefore}->${Math.round(s.health)} kcal ${kBefore}->${Math.round(s.kcal)}`);
    vstate('after-sleep');
    try { note(`   fire alive after night: ${Game.nearFire()}`); } catch (e) {}
    note(`   distinct player actions today: ~${actionCount}`);
  }

  note('\n=== 5-DAY VERDICT STATE ===');
  vstate('end');
  note(`water: ${(s.water || []).map(b => b.quality).join(',') || 'none'}`);
  note(`disease events: ${diseaseEvents}, cautious tests: ${tested}, spoil refusals: ${spoilRefused}`);
  note(`plants known: ${Object.keys((Game.state.codex || {}).plants || {}).length}`);
  note('DONE');
})();
