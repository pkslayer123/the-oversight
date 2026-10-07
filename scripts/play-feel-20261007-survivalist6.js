#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07): SURVIVALIST 6 — THE LONG MARCH.
// A competent wanderer lives NOMADICALLY: new tile every day, no haven,
// post-exile framing (exile haven hard reset makes this a REAL scenario).
// 6 days, 6 tiles. Each day: march in, forage, deadfall, fire, cook, eat,
// water discipline, pitch tent, sleep, pack tent at dawn, march on.
// Prior runs (1-5) camped ONE tile or stayed at haven; this tests the march:
//   - fuel/water/food findability on unfamiliar ground (RNG, not curated)
//   - the tent as pack weight (2.5kg) + 48-tick/50-kcal pitch cost, daily
//   - cumulative toll: does the body hold, or is nomadism a slow death?
//   - travel honesty: blockages, fog walking, encounters on the march
// Judge like a player: is the march fun or a death spiral? What's the friction?
// Run: node scripts/play-feel-20261007-survivalist6.js  (SEED env override)
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
function flush(tag, max = 2) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 160)}`); }
function clearSays() { says.splice(0); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; note(`  ok   ${name}`); }
  else { fail++; note(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const s = () => Game.state.scholar;
function vstate(label) {
  note(`   [${label}] day=${s().day} ticks=${s().dayTicks} hp=${Math.round(s().health)} kcal=${Math.round(s().kcal)} hyd=${Math.round(s().hydration)} en=${Math.round(s().energy)} H2O=${(s().water || []).length}L pack=${Game.packWeight().toFixed(1)}/${Game.packCapacity()} tile=(${Game.map.px},${Game.map.py})`);
}
// resolve a turn-based fight by fleeing through the node barrier (grid edges).
// Bounded: never spins forever; the player may take hits — that's the cost.
function resolveFight() {
  let guard = 0, tookHit = 0;
  const hp0 = Math.round(s().health || 0);
  while (Game.tbfight && !Game.tbfight.over && !Game.state.over && guard++ < 40) {
    try {
      if (!Game.tbIsPlayerTurn()) { Game.tbPlayerWait(); continue; }
      const p = Game.tbFighter('p');
      if (!p) break;
      const tx = (p.mx ?? 4) < 4 ? 0 : 8;
      if (!Game.tbPlayerMove(tx, p.my ?? 4)) Game.tbPlayerWait();
    } catch (e) { break; }
  }
  tookHit = hp0 - Math.round(s().health || 0);
  Game.log.length = 0; clearSays();
  return { fled: !Game.tbfight || !!Game.tbfight.over, tookHit, guard };
}
function fireSpot() {
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const px = s().mx ?? 4, py = s().my ?? 4;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const cx = px + dx, cy = py + dy;
    if (cx < 1 || cx > 7 || cy < 1 || cy > 7) continue;
    try { if (Game.fireGroundOK(detail[cy][cx])) return { x: cx, y: cy }; } catch (e) {}
  }
  return null;
}
// clearCells: every dirt/grass/clearing/path cell on the 9x9 — camp candidates.
// A real player taps-to-step to clear ground; the harness does the same by
// moving s.mx/s.my (tap-to-step equivalent, as in survivalist4).
function clearCells() {
  const out = [];
  try {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
      const c = detail[y] && detail[y][x];
      if (['dirt', 'grass', 'clearing', 'path'].indexOf(c) !== -1) out.push([x, y]);
    }
  } catch (e) {}
  return out;
}
// settleCamp: walk to clear ground like a player would. Returns {fire:[x,y], tent:[x,y]} or null.
function settleCamp() {
  const clears = clearCells();
  if (!clears.length) return null;
  const sch = s();
  const [fx, fy] = clears[0];
  // stand adjacent to the fire cell (not on it)
  sch.mx = Math.max(1, Math.min(7, fx + (fx < 7 ? 1 : -1)));
  sch.my = Math.max(1, Math.min(7, fy));
  if (sch.mx === fx && sch.my === fy) sch.mx = Math.max(1, fx - 1);
  // tent cell: another clear cell adjacent to where we stand, not under us
  let tent = null;
  for (const [tx, ty] of clears.slice(1)) {
    if (tx === sch.mx && ty === sch.my) continue;
    if (Math.max(Math.abs(tx - sch.mx), Math.abs(ty - sch.my)) <= 1) { tent = [tx, ty]; break; }
  }
  return { fire: [fx, fy], tent };
}
function treeCells() {
  const out = [];
  try {
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    for (let y = 1; y <= 7 && out.length < 4; y++) for (let x = 1; x <= 7 && out.length < 4; x++) {
      const c = detail[y] && detail[y][x];
      if (c === 'tree' || c === 'bigtree') out.push([x, y]);
    }
  } catch (e) {}
  return out;
}
function materialCount(name) {
  let n = 0;
  for (const i of (s().inventory || [])) if (i.material === name) n += (i.units || 0);
  return n;
}
function lumpIndices() {
  const out = [];
  (s().inventory || []).forEach((it, i) => { if (it.lump && Object.keys(it.lump).length) out.push(i); });
  return out;
}
function edibleIndex(preferCooked) {
  const inv = s().inventory || [];
  const okIt = (it) => (it.kcalEach || 0) > 0 && (it.units || 0) > 0 && it.edible !== false;
  let idx = inv.findIndex(it => okIt(it) && it.foodState === 'cooked');
  if (idx < 0 && !preferCooked) idx = inv.findIndex(it => okIt(it) && it.foodState !== 'raw' && it.foodState !== 'unknown');
  if (idx < 0) idx = inv.findIndex(it => okIt(it) && it.edible === true);
  return idx;
}
// evening: wait until late (but NEVER roll the day), resolve fights, then sleep
// honestly. Returns 'slept' | 'rolled' | 'fight' | 'refused'.
function restForNight(startDay) {
  if (Game.tbfight) { const r = resolveFight(); note(`   fight on the march: fled=${r.fled} took ${r.tookHit}hp`); }
  let guard = 0;
  while (s().day === startDay && (s().dayTicks || 0) < 360 && guard++ < 6 && !Game.state.over) {
    try { Game.doAction('wait'); } catch (e) { break; }
    if (Game.tbfight) resolveFight();
  }
  Game.log.length = 0; clearSays();
  if (s().day !== startDay) { note('   day burned straight through — no sleep tonight (all-nighter)'); return 'rolled'; }
  if (Game.tbfight) { const r = resolveFight(); if (Game.tbfight && !Game.tbfight.over) { note('   fight would not end — skipping sleep'); return 'fight'; } }
  // sleep gate: blocked only at dayPart 0 with < 32 ticks. We're at ~360+ ticks.
  Game.sleep();
  return 'slept';
}
function nextMarchTile() {
  const targets = Game.travelTargets();
  const fresh = targets.filter(t => t.unknown && t.d === 1);
  const any1 = targets.filter(t => t.d === 1);
  const pool = fresh.length ? fresh : (any1.length ? any1 : targets);
  if (!pool.length) return null;
  const scored = pool.map(t => {
    const tile = Game.tileAt(t.x, t.y);
    const type = tile && tile.type;
    let score = Math.random();
    if (type === 'creek') score += 2;
    if (type === 'forest' || type === 'woods' || type === 'forest_floor') score += 1;
    if (type === 'haven') score -= 5;
    return { t, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0].t;
}

(async () => {
  await Game.init();
  note(`seed=${SEED}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const sch = s();
  sch.health = 100; sch.kcal = 2600; sch.hydration = 90; sch.energy = 100;
  sch.inventory = (sch.inventory || []).concat([
    { itemId: 'tent', kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, unit: 'tent' },
    { itemId: 'knife', name: 'Knife', units: 1, kg: 0.4 },
    { itemId: 'axe', name: 'Axe', units: 1, kg: 1.2 },
    { itemId: 'lighter', name: 'Lighter', units: 1, kg: 0.05 },
    { itemId: 'camp_pot', name: 'Camp pot', units: 1, kg: 0.8 },
  ]);
  sch.water = [];
  Game.addWater(2, 'clean', 'Haven well');
  clearSays();
  Game.depart(); flush('depart', 1);

  let tentPitched = false, tentCell = null;
  let diseases = 0, tests = 0, marches = 0, blocked = 0, fights = 0;
  const dayLog = [];

  for (let d = 1; d <= 6 && !Game.state.over; d++) {
    note(`\n================ MARCH DAY ${d} ================`);
    const startDay = s().day;
    if (tentPitched && tentCell) {
      clearSays();
      try { Game.packTent(tentCell.x, tentCell.y); } catch (e) { note('   packTent err: ' + e.message); }
      flush('packtent', 1);
      tentPitched = false; tentCell = null;
    }
    const tileType = Game.playerTile() && Game.playerTile().type;
    note(`   on tile (${Game.map.px},${Game.map.py}) type=${tileType} weather=${Game.state.weather}`);
    if (d > 1) {
      const nt = nextMarchTile();
      if (nt) {
        const before = `(${Game.map.px},${Game.map.py})`;
        clearSays();
        const res = Game.travelTo(nt.x, nt.y);
        const dtype = Game.playerTile() && Game.playerTile().type;
        if (res && res.blocked) { blocked++; note(`   march BLOCKED ${before} -> (${nt.x},${nt.y}): ${res.blockType || 'unknown'}`); }
        else { marches++; note(`   marched ${before} -> (${nt.x},${nt.y}) type=${dtype} fresh-fog=${nt.unknown}`); }
        flush('travel', 2);
        if (Game.tbfight) { fights++; const r = resolveFight(); note(`   ambushed on the march: fled=${r.fled}, took ${r.tookHit}hp`); }
      } else note('   nowhere to march — staying put');
    }
    const kcalDawn = Math.round(sch.kcal);
    vstate('march-dawn');
    const day = { d, tile: tileType, fire: false, boiled: false, cooked: 0, ate: 0, intake: 0, slept: null, kcalNet: 0 };

    // ---- MORNING: water + fire ----
    Game.fillWater(); Game.fillWater(); clearSays();
    // fuel: forage tree cells for deadfall first, then cut if needed
    for (const [cx, cy] of treeCells().slice(0, 3)) {
      try { Game.doAction('forage', { cx, cy }); } catch (e) {}
    }
    let branches = Game.materialCount('branch');
    if (branches < 2 && Game.woodCount() < 1) {
      const tc = treeCells()[0];
      if (tc) { try { Game.cutTree(tc[0], tc[1]); } catch (e) { note('   cut err: ' + e.message); } }
      branches = Game.materialCount('branch');
    }
    note(`   fuel: branches=${branches} logs=${Game.woodCount()}`);
    // settle like a player: walk to clear ground, THEN light the fire
    day.camp = settleCamp();
    note(`   camp: ${day.camp ? `fire@(${day.camp.fire}) tent@(${day.camp.tent || 'none'})` : 'NO CLEAR GROUND on this tile'}`);
    if (!Game.nearFire() && day.camp && (branches >= 2 || Game.woodCount() >= 1)) {
      clearSays(); Game.makeFire(day.camp.fire[0], day.camp.fire[1]); flush('fire', 1);
    }
    day.fire = Game.nearFire();
    check(`day${d}: fire on unfamiliar ground`, day.fire || branches < 2 || !day.camp,
      day.fire ? 'lit' : (!day.camp ? 'no clear ground — tile genuinely barren' : 'no fuel on this tile — honest scarcity'));
    if (day.fire) { Game.boilWater(); day.boiled = true; flush('boil', 1); }
    for (let i = 0; i < 3; i++) { const b = sch.hydration; Game.drinkWater(); if (sch.hydration <= b && i > 0) break; }
    flush('drink', 1);

    // ---- MIDDAY: forage the new ground ----
    for (const [cx, cy] of [[3, 3], [5, 3], [3, 5], [5, 5]].slice(0, 3)) {
      try { Game.doAction('forage', { cx, cy }); } catch (e) {}
    }
    flush('forage', 2);
    note(`   lumps: ${lumpIndices().length}`);
    for (const li of lumpIndices().slice()) {
      try { Game.sortBag(null, li, sch.inventory); } catch (e) {}
    }
    flush('sort', 1);
    const fresh = lumpIndices();
    if (fresh.length && tests < 5) {
      const db4 = (sch.diseases || []).length;
      try { Game.testCautiously(fresh[0]); } catch (e) { note('   test err: ' + e.message); }
      flush('test', 2);
      if ((sch.diseases || []).length > db4) { diseases++; note('   !! disease from testing'); }
      tests++;
    }
    const nutIdx = (sch.inventory || []).findIndex(it => it.needsShelling || /shell/i.test(it.prep || ''));
    if (nutIdx >= 0) { try { Game.shellNuts(nutIdx); } catch (e) {} flush('shell', 1); }
    if (day.fire) {
      const kcalBeforeCook = Math.round(sch.kcal);
      Game.cookAll(); flush('cook', 1);
      day.cooked = 1;
    }
    const kcalPreEat = Math.round(sch.kcal);
    for (let i = 0; i < 6; i++) {
      const idx = edibleIndex(i < 3);
      if (idx < 0) break;
      const db4 = (sch.diseases || []).length;
      try { Game.eatOne(idx); day.ate++; } catch (e) { break; }
      if ((sch.diseases || []).length > db4) { diseases++; note('   !! disease from food'); }
    }
    flush('eat', 1);
    day.intake = Math.round(sch.kcal) - kcalPreEat;
    note(`   ate ${day.ate} items, kcal from eating: +${day.intake}`);

    // ---- EVENING: fire through the night, pitch, sleep ----
    if (day.fire && day.camp) {
      try { Game.feedFire(day.camp.fire[0], day.camp.fire[1]); } catch (e) { note('   feed err: ' + e.message); }
      flush('feed', 1);
      note(`   lastsTillDawn: ${Game.fireLastsTillDawn()}`);
    }
    if (!tentPitched && day.camp && day.camp.tent) {
      clearSays();
      try { Game.pitchTent(day.camp.tent[0], day.camp.tent[1]); tentPitched = true; tentCell = { x: day.camp.tent[0], y: day.camp.tent[1] }; }
      catch (e) { note('   tent err: ' + e.message); }
      flush('tent', 1);
    } else if (!tentPitched) note('   no tent pitched (no camp/tent cell)');
    if (tentCell) { sch.mx = Math.max(1, Math.min(7, tentCell.x + 1)); sch.my = tentCell.y; }
    let prev = null;
    try { prev = Game.sleepPreview(); } catch (e) {}
    note(`   sleepPreview: ${JSON.stringify(prev).slice(0, 200)}`);
    const hpB = Math.round(sch.health), kB = Math.round(sch.kcal);
    day.slept = restForNight(startDay);
    flush('sleep', 2);
    day.kcalNet = Math.round(sch.kcal) - kcalDawn;
    note(`   hp ${hpB}->${Math.round(sch.health)} kcal ${kB}->${Math.round(sch.kcal)} (day net: ${day.kcalNet>=0?'+':''}${day.kcalNet}) slept=${day.slept}`);
    note(`   fire alive after night: ${Game.nearFire()}`);
    vstate('after-sleep');
    day.hp = Math.round(sch.health); day.hyd = Math.round(sch.hydration);
    dayLog.push(day);
    check(`day${d}: alive`, !Game.state.over, 'died on the march');
  }

  note('\n=== MARCH VERDICT ===');
  vstate('end');
  note(`marches=${marches} blocked=${blocked} fights=${fights} cautious-tests=${tests} disease-events=${diseases}`);
  note('day nets: ' + dayLog.map(x => `d${x.d}:${x.kcalNet>=0?'+':''}${x.kcalNet}${x.slept==='slept'?'':'/'+x.slept}`).join(' '));
  const sleptDays = dayLog.filter(x => x.slept === 'slept');
  const avgNet = sleptDays.length ? Math.round(sleptDays.reduce((t, x) => t + x.kcalNet, 0) / sleptDays.length) : 0;
  note(`avg daily kcal net (slept days): ${avgNet}`);
  note(`fire lit: ${dayLog.filter(x => x.fire).length}/6 days | plants known: ${Object.keys((Game.state.codex || {}).plants || {}).length}`);
  check('nomadism viable: avg daily net >= -1500 on slept days', avgNet >= -1500, `avg=${avgNet}`);
  check('body intact: health >= 60 after the march', Math.round(sch.health) >= 60, `hp=${Math.round(sch.health)}`);
  note(`pass=${pass} fail=${fail}`);
  note('DONE');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
