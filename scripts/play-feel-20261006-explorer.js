#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): the EXPLORER loop — a player whose joy is
// node travel, examining things, discovering new things, and the map.
// Played as a player, judged like a player.
// Run: node scripts/play-feel-20261006-explorer.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/examine.js', 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;

const says = [];
function note(t) { console.log(t); }
const interesting = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); interesting.push(String(t)); return osay(t); };
function flushSays(tag, max = 6) {
  const take = says.splice(0).slice(0, max);
  for (const t of take) note(`   | ${tag} ${String(t).slice(0, 160)}`);
  return take;
}
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} part=${s.part} @node(${m.px},${m.py}) cell(${s.mx},${s.my}) kcal=${Math.round(s.kcal || 0)} dayTicks=${Math.round(s.dayTicks || 0)}`);
}
function travelStep(tx, ty) { says.length = 0; return Game.travelTo(tx, ty); }
function stepToward(tx, ty) {
  const axes = [];
  if (Game.map.px !== tx) axes.push([Game.map.px + Math.sign(tx - Game.map.px), Game.map.py]);
  if (Game.map.py !== ty) axes.push([Game.map.px, Game.map.py + Math.sign(ty - Game.map.py)]);
  for (const [nx, ny] of axes) {
    const before = { x: Game.map.px, y: Game.map.py };
    travelStep(nx, ny);
    if (Game.map.px !== before.x || Game.map.py !== before.y) return true;
  }
  return false;
}
// ASCII world map: V=visited by me, s=shared-known, R=revealed(visible for travel) but not seen, .=dark
function mapAscii() {
  const seen = (Game.state.scholar.seenTiles || {});
  const rows = [];
  for (let y = 0; y < 7; y++) {
    let r = '';
    for (let x = 0; x < 7; x++) {
      const t = Game.tileAt(x, y);
      const e = seen[x + ',' + y];
      let c = t.revealed ? 'R' : '.';
      if (e && e.k === 'v') c = 'V';
      else if (e && e.k === 's') c = 's';
      if (x === Game.map.px && y === Game.map.py) c = c.toUpperCase() + '*';
      r += c.padEnd(3, ' ');
    }
    rows.push(`   ${y} ${r}  (${(Game.tileAt(0, y).type)}...)`);
  }
  return rows.join('\n');
}
function counts() {
  let revealed = 0;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (Game.tileAt(x, y).revealed) revealed++;
  const seen = Object.keys(Game.state.scholar.seenTiles || {}).length;
  return { revealed, seen };
}
function plantCells() {
  // all plant/bush/tree cells in the current node detail, with their true species
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const t = Game.playerTile();
  const out = [];
  for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
    const cell = detail[cy] && detail[cy][cx];
    if (['plant', 'bush', 'tree', 'bigtree'].indexOf(cell) === -1) continue;
    let pid = null;
    if (cell === 'bush') pid = (t.bushSpecies || {})[cx + ',' + cy] || null;
    else if (cell === 'plant') pid = (t.plantSpecies || {})[cx + ',' + cy] || null;
    else {
      const mod = t.modifiers && t.modifiers[cx + ',' + cy];
      if (mod && mod.species) pid = 'tree_' + mod.species;
    }
    out.push({ cx, cy, cell, pid });
  }
  return out;
}
function standNextTo(p) {
  // place the scholar on an adjacent walkable cell of the plant cell
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const opts = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = p.cx + dx, ny = p.cy + dy;
    if (nx < 0 || ny < 0 || nx > 8 || ny > 8) continue;
    const c = detail[ny] && detail[ny][nx];
    if (c === 'plant' || c === 'bush' || c === 'tree' || c === 'bigtree' || c === 'water' || c === 'wall') continue;
    opts.push([nx, ny]);
  }
  if (!opts.length) return false;
  const [sx, sy] = opts[0];
  Game.state.scholar.mx = sx; Game.state.scholar.my = sy;
  return true;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  // Explorer, not a stranger: established villager so rations don't starve the sim.
  Game.state.village.trust[Game.villagerId] = 70;
  note('=== EXPLORER RUN: the world as a map to fill in ===');
  vstate('start');
  note('map at start:\n' + mapAscii());
  const c0 = counts();
  note(`   revealed=${c0.revealed} seenTiles=${c0.seen}`);

  // --- ACT 1: THE WALK — a winding route across the world, new + revisit ---
  note('\n=== ACT 1: the walk — travel feel, arrival beats, costs ===');
  // snake-ish route across the 7x7 world from haven, mixing new and known tiles
  const hx = Game.map.px, hy = Game.map.py;
  const route = [];
  const targets = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) targets.push([x, y]);
  targets.sort((a, b) => (Math.abs(a[0] - hx) + Math.abs(a[1] - hy)) - (Math.abs(b[0] - hx) + Math.abs(b[1] - hy)));
  // walk to the 10 farthest tiles in distance order, orthogonal steps
  const waypoints = targets.slice(-10);
  note(`   waypoints: ${waypoints.map(w => `(${w[0]},${w[1]})`).join(' ')}`);
  let hops = 0, blocks = 0, newBeats = 0, revisitBeats = 0;
  const arrivalTexts = new Set();
  for (const [wx, wy] of waypoints) {
    let guard = 14;
    while (guard-- > 0 && (Game.map.px !== wx || Game.map.py !== wy) && !Game.over) {
      const kcal0 = Math.round(Game.state.scholar.kcal || 0);
      const day0 = Game.state.scholar.day, clock0 = Math.round(Game.state.scholar.clock || 0);
      const from = `(${Game.map.px},${Game.map.py})`;
      const t0 = Game.playerTile();
      const moved = stepToward(wx, wy);
      if (!moved) { blocks++; note('   blocked leg — stopping waypoint'); break; }
      hops++;
      const t = Game.playerTile();
      const dK = Math.round(Game.state.scholar.kcal || 0) - kcal0;
      const dDay = Game.state.scholar.day - day0, dClock = Math.round(Game.state.scholar.clock || 0) - clock0;
      const msgs = says.splice(0);
      const first = !t0 || Game.tileAt(Game.map.px, Game.map.py).visited !== true || true;
      const isNew = /— /.test(msgs.join('\n'));
      if (isNew) { newBeats++; } else { revisitBeats++; }
      route.push(`${from}->(${Game.map.px},${Game.map.py}) ${t ? t.type : '?'}`);
      if (hops <= 4) {
        note(`   hop ${from} -> (${Game.map.px},${Game.map.py}) ${t.type} | new-beat=${isNew} kcalΔ=${dK} dayΔ=${dDay} clockΔ=${dClock}`);
        for (const m of msgs.slice(0, 3)) {
          note(`     | ${String(m).slice(0, 170).replace(/\n/g, ' / ')}`);
          if (isNew) arrivalTexts.add(String(m).slice(0, 60));
        }
      }
    }
    if (Game.over) { note('   DIED on the road — abort'); process.exit(1); }
  }
  note(`   hops=${hops} blocks=${blocks} new-arrival-beats=${newBeats} plain-revisit-lines=${revisitBeats}`);
  vstate('after-walk');
  const c1 = counts();
  note(`   revealed ${c0.revealed}->${c1.revealed} | seenTiles ${c0.seen}->${c1.seen}`);
  note('map after walk:\n' + mapAscii());
  // FOG CHECK: travelTargets shows adjacent unrevealed (walk into fog); far unrevealed hidden?
  const tts = Game.travelTargets();
  const adjUnrev = tts.filter(t => t.unknown && t.d === 1).length;
  const farUnrev = tts.filter(t => t.unknown && t.d > 1).length;
  note(`   travelTargets: total=${tts.length} adjacent-unknown=${adjUnrev} far-unknown=${farUnrev} ${farUnrev === 0 ? 'PASS (fog: can walk into adjacent fog, not teleport)' : 'CHECK (far unknown offered?)'}`);

  // --- ACT 2: EXAMINE — the explorer's core verb ---
  note('\n=== ACT 2: examine — looking closely at the unknown ===');
  // find a plant cell on the current tile
  let cells = plantCells();
  let testTile = null;
  if (!cells.length) {
    // wander to the nearest tile with plants
    note('   no plant cells here — walking to nearest tile with plants');
    for (let y = 0; y < 7 && !testTile; y++) for (let x = 0; x < 7; x++) {
      Game.travelTo(x, y, true); // force: explorer harness reposition
      const c = plantCells();
      if (c.length) { testTile = [x, y]; break; }
    }
    cells = plantCells();
    note(`   repositioned to (${Game.map.px},${Game.map.py}); plant cells=${cells.length}`);
  }
  const kcalE0 = Math.round(Game.state.scholar.kcal || 0);
  const ticksE0 = Game.state.scholar.dayTicks || 0;
  const unknown = cells.find(c => c.pid && c.pid.indexOf('tree_') !== 0 && !Game.plantKnown(c.pid));
  if (!unknown) { note('   no unknown plant cells found anywhere — examine loop dead. ABORT.'); process.exit(1); }
  const p = (Game.data.plants || []).find(x => x.id === unknown.pid);
  note(`   target: cell(${unknown.cx},${unknown.cy}) trueSpecies=<hidden from player> (test knows: ${unknown.pid})`);
  if (!standNextTo(unknown)) { note('   could not stand adjacent — abort examine'); process.exit(1); }
  // count 1: first examine
  says.length = 0;
  Ex.examinePlantCell(unknown.cx, unknown.cy);
  const m1 = says.splice(0).join('\n');
  note(`   examine#1: ${m1.slice(0, 200).replace(/\n/g, ' / ')}`);
  const leak1 = p && new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(m1);
  note(`   name-leak check: ${leak1 ? 'FAIL — name appears in unknown examine!' : 'PASS (no name)'}`);
  const obs1 = Ex.observationOf(unknown.pid);
  note(`   observation recorded: ${!!obs1} count=${obs1 && obs1.count} quality=${obs1 && obs1.quality}`);
  const dKE = Math.round(Game.state.scholar.kcal || 0) - kcalE0;
  const dTicks = (Game.state.scholar.dayTicks || 0) - ticksE0;
  note(`   examine cost: kcalΔ=${dKE} actionClockΔ=${dTicks} ticks (cheap look expected: ~15 kcal, ~8 ticks)`);
  // count 2 and 3: message changes, still no name
  for (let i = 2; i <= 3; i++) {
    says.length = 0;
    Ex.examinePlantCell(unknown.cx, unknown.cy);
    const m = says.splice(0).join('\n');
    const leak = p && new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(m);
    note(`   examine#${i}: ${m.slice(0, 170).replace(/\n/g, ' / ')} ${leak ? '[NAME LEAK!]' : '[no leak]'}`);
  }
  // SYSTEMATIC: scrub the whole plant pool — unknown-mode examineDescription q1..q3 must NEVER name
  note('   -- systematic name-leak sweep over ALL plants, q1/q2/q3 --');
  let sweeps = 0, leaks = 0, leakIds = [];
  for (const pl of (Game.data.plants || [])) {
    if (Game.plantKnown(pl.id)) continue; // known path is allowed to name
    for (let q = 1; q <= 3; q++) {
      sweeps++;
      const desc = Ex.examineDescription(pl.id, q);
      const esc = pl.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(esc, 'i').test(desc)) { leaks++; if (leakIds.length < 5) leakIds.push(pl.id + '/q' + q); }
    }
  }
  note(`   sweep: ${sweeps} descriptions, leaks=${leaks} ${leaks ? 'FAIL: ' + leakIds.join(',') : 'PASS'} ${leakIds.length ? '' : ''}`);
  // quality 3 "recognize the type again" beat: read one for flavor
  says.length = 0;
  note(`   q3 sample: ${Ex.examineDescription(unknown.pid, 3).slice(0, 220)}`);
  // examine the KNOWN plant: should name it (allowed)
  says.length = 0;
  Game.identifyPlant(unknown.pid, 'taught', 'test-teacher');
  const beatMsgs = says.splice(0).join('\n');
  const recogFired = /💡/u.test(beatMsgs);
  note(`   identifyPlant after 3+ examinations -> recognition beat: ${recogFired ? 'PASS (fired)' : 'FAIL (no recognition beat!)'}`);
  for (const m of beatMsgs.split('\n').slice(0, 2)) note(`     | ${m.slice(0, 180)}`);
  says.length = 0;
  Ex.examinePlantCell(unknown.cx, unknown.cy);
  const mk = says.splice(0).join('\n');
  note(`   examine KNOWN plant: ${mk.slice(0, 160).replace(/\n/g, ' / ')} ${mk.indexOf(p.name) !== -1 ? '(names it — correct)' : '(does not name it — CHECK)'}`);
  // plantVisualDepth progression
  note(`   visualDepth: should be 2 for known => ${Ex.plantVisualDepth(unknown.pid)}`);
  // too-far + nothing-there beats (no silent actions)
  says.length = 0;
  Game.state.scholar.mx = 0; Game.state.scholar.my = 0;
  Ex.examinePlantCell(8, 8);
  note(`   far examine: "${says.splice(0).join(' ').slice(0, 80)}"`);
  // tree pseudo-id path
  const treeCell = cells.find(c => c.pid && c.pid.indexOf('tree_') === 0);
  if (treeCell && standNextTo(treeCell)) {
    says.length = 0;
    Ex.examinePlantCell(treeCell.cx, treeCell.cy);
    note(`   tree examine: ${says.splice(0).join(' ').slice(0, 160)}`);
  } else note('   no tree cells on this tile — tree-examine path not exercised');
  vstate('after-examine');

  // --- ACT 3: DISCOVERY BEATS — ruins, villages, what opening-up feels like ---
  note('\n=== ACT 3: discovery beats — what opening up feels like ===');
  // find a ruin tile and travel there fresh
  let ruin = null;
  for (let y = 0; y < 7 && !ruin; y++) for (let x = 0; x < 7; x++) { if (Game.tileAt(x, y).type === 'ruin') ruin = [x, y]; }
  if (ruin) {
    note(`   ruin at (${ruin[0]},${ruin[1]}) — walking in fresh`);
    let guard = 14;
    while (guard-- > 0 && (Game.map.px !== ruin[0] || Game.map.py !== ruin[1])) stepToward(ruin[0], ruin[1]);
    flushSays('ruin', 5);
    const rt = Game.playerTile();
    note(`   ruinStory stored: ${!!rt.ruinStory} arrivalText reused: ${!!rt.arrivalText}`);
  } else note('   no ruin tiles on this worldgen — ruin discovery beat not exercised');
  // revisit a tile seen long ago: does the world remember, or repeat itself?
  note('   -- revisit check: long-ago tile vs first-visit beat --');
  says.length = 0;
  Game.travelTo(hx, hy, true); // haven tile, visited at start
  const rv = says.splice(0);
  note(`   haven revisit lines: ${rv.length} (first visit had the — TITLE — beat)`);
  for (const m of rv.slice(0, 3)) note(`     | ${String(m).slice(0, 150).replace(/\n/g, ' / ')}`);
  // map screen knowledge: seenTiles vs revealed gap
  const c2 = counts();
  note(`   final: revealed=${c2.revealed} seenTiles=${c2.seen} — map shows ONLY stepped tiles`);
  note('final map:\n' + mapAscii());

  note('\n=== EXPLORER RUN COMPLETE ===');
  note('interesting-log count: ' + interesting.length);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
