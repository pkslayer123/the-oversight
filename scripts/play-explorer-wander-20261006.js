#!/usr/bin/env node
// EXPLORER RUN 2026-10-06 22:30 CDT (playtest loop, archetype 1).
// A fresh multi-day explorer play: wander ~10 nodes over 3 days, examine
// everything unknown (plants, bushes, trees, bigtrees), watch the map,
// measure the explorer economy (kcal in/out, discovery rate, feel).
// Judge like a player. Look for: name leaks on the map/grid surfaces,
// dead ends, dead messages, anything that feels like chores.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// FULL PRODUCTION SCRIPT LIST (AGENTS.md): eval everything in index.html
// order, minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js.
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
// AGENTS.md: equipment.js needs window at LOAD; but a window stub flips
// combat to the async path and headless fights stall. Stub for eval, then
// delete before playing so runtime checks take the sync path.
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('EVAL FAIL', f, e.message); process.exit(2); } });
delete global.window;
const Game = globalThis.Scattering.Game;
const Ex = globalThis.Scattering.Examine;

const says = [];
Game.say = (t) => { says.push(String(t)); };
function flush(tag, max) { const t = says.splice(0).splice(0, max || 5); t.forEach(x => console.log('   | ' + tag + ' ' + String(x).slice(0, 170))); }
function vstate(l) { const s = Game.state.scholar; console.log(`   [${l}] day=${s.day} part=${s.part} @node(${Game.map.px},${Game.map.py}) cell(${s.mx},${s.my}) kcal=${Math.round(s.kcal || 0)}`); }
let seed = 987654321;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  vstate('start');

  // ---- DAY-LONG WANDER: spiral out, visit every new node, examine all ----
  const visited = new Set(['3,3']);
  let examined = 0, discovered = 0, leaks = [];
  const targetNodes = [];
  for (let r = 1; r <= 3 && targetNodes.length < 10; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = 3 + dx, y = 3 + dy;
      if (x < 0 || x > 6 || y < 0 || y > 6) continue;
      targetNodes.push([x, y]);
      if (targetNodes.length >= 10) break;
    }
  }
  let arrivalTexts = [];
  for (const [tx, ty] of targetNodes) {
    // step one tile at a time (cost-free travel, world-time batch per step)
    let guard = 0;
    while ((Game.map.px !== tx || Game.map.py !== ty) && guard++ < 20) {
      const nx = Game.map.px + Math.sign(tx - Game.map.px);
      const ny = Game.map.py + Math.sign(ty - Game.map.py);
      const xok = (nx !== Game.map.px) ? tryT(nx, Game.map.py) : false;
      const yok = (ny !== Game.map.py) ? tryT(Game.map.px, ny) : false;
      if (!xok && !yok) break;
    }
    function tryT(nx, ny) {
      says.length = 0;
      const r = Game.travelTo(nx, ny);
      const line = says.find(s => /arriv|— TITLE —|Travel \d+ tile/i.test(String(s)));
      if (line && !visited.has(nx + ',' + ny)) arrivalTexts.push([nx + ',' + ny, String(line).slice(0, 120)]);
      return r;
    }
    visited.add(Game.map.px + ',' + Game.map.py);

    // walk the 9x9 grid, examine everything plant-like
    const detail = Game.genDetail(Game.map.px, Game.map.py);
    for (let cy = 1; cy < 8; cy++) for (let cx = 1; cx < 8; cx++) {
      const cell = detail[cy] && detail[cy][cx];
      if (['plant', 'bush', 'tree', 'bigtree'].indexOf(cell) === -1) continue;
      Game.state.scholar.mx = cx; Game.state.scholar.my = cy;
      says.length = 0;
      try {
        if (cell === 'plant') Ex.examinePlantCell(cx, cy);
        else if (cell === 'bush') Ex.examineBushCell(cx, cy);
        else Ex.examineTreeCell(cx, cy);
      } catch (e) { console.log('EXAMINE THREW', cell, e.message); }
      examined++;
      for (const s of says) {
        if (/Identified|discovered/i.test(String(s))) discovered++;
        // NAME LEAK HUNT: known-name appearing for a species the player
        // has not learned. Heuristic: the line names a species AND the
        // species is not known — checked below against codex.
      }
    }
  }
  vstate('after-wander');
  console.log(`   nodes=${targetNodes.length} examined=${examined} discoveries=${discovered}`);
  console.log('   -- arrival texts (first visit flavor) --');
  arrivalTexts.slice(0, 8).forEach(([k, t]) => console.log(`   [${k}] ${t}`));

  // ---- NAME LEAK SWEEP: every examine line mentioning any species name
  // where plantKnown(pid) is false ----
  console.log('   -- name-leak sweep over examine outputs --');
  const detail2 = Game.genDetail(Game.map.px, Game.map.py);
  let leakCount = 0;
  for (let cy = 1; cy < 8; cy++) for (let cx = 1; cx < 8; cx++) {
    const cell = detail2[cy] && detail2[cy][cx];
    if (cell !== 'plant' && cell !== 'bush') continue;
    Game.state.scholar.mx = cx; Game.state.scholar.my = cy;
    says.length = 0;
    try { if (cell === 'plant') Ex.examinePlantCell(cx, cy); else Ex.examineBushCell(cx, cy); } catch (e) {}
    const pid = (Game.resolveCellSpecies || (() => null))(cx, cy);
    const known = pid && Game.plantKnown(pid);
    for (const s of says) {
      const str = String(s);
      const pname = pid && (Game.data.plants.find(p => p.id === pid) || {}).name;
      if (pname && !known && str.toLowerCase().includes(pname.toLowerCase())) {
        leakCount++;
        console.log(`   LEAK: ${pname} named for unlearned ${pid}: ${str.slice(0, 140)}`);
      }
    }
  }
  console.log(`   leak sweep: ${leakCount} leaks`);

  // ---- TREE/BIGTREE examine: visual coherence + no crash ----
  console.log('   -- tree examine sample --');
  outer: for (let cy = 1; cy < 8; cy++) for (let cx = 1; cx < 8; cx++) {
    const cell = detail2[cy] && detail2[cy][cx];
    if (cell === 'tree' || cell === 'bigtree') {
      Game.state.scholar.mx = cx; Game.state.scholar.my = cy;
      says.length = 0;
      try { Ex.examineTreeCell(cx, cy); } catch (e) { console.log('   TREE THREW ' + e.message); }
      flush('tree');
      break outer;
    }
  }

  // ---- explorer economy: how does a 3-day wander feel? ----
  console.log('   -- feel: explorer economy --');
  const s = Game.state.scholar;
  console.log(`   dayTicks=${Math.round(s.dayTicks || 0)} hunger=${Math.round(s.hunger || 0)} energy=${Math.round(s.energy || 0)}`);
  console.log(`   codex plants seen(observations)=${Object.keys(Game.state.codex.observations || {}).length}`);
  console.log(`   seenTiles=${Object.keys(s.seenTiles || {}).length}`);
  console.log('\nDONE');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
