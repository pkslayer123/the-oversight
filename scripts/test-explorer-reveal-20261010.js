#!/usr/bin/env node
// Break-it explorer run 2026-10-10 (target: REVEAL SCOPE / FOG HONESTY).
// Hostile-player attacks against fog-of-war reveal mechanics.
//
// CATCHES THIS RUN (fixed, proven below):
//   1. EXPLOIT — dowsing reveals a 13-tile diamond around the nearest water
//      tile, even when that tile is far away (the code comment says "reveal
//      the nearest water tile", singular). A hostile player dowses daily to
//      light up distant fog for free: tileInfo then names those tiles'
//      biomes without ever walking there, and tiles within travel range
//      unlock as travelTargets. Fixed: dowsing reveals exactly the water
//      tile — direction + distance is the knowledge, walking is still yours.
//   2. HONESTY — echo_location's copy promises "3x3 revealed", but the code
//      called this.reveal(nx,ny) for each of the 9 centers, and reveal() is
//      a Manhattan<=2 diamond (13 tiles) — the union is a Manhattan<=3
//      diamond of 25 tiles. The echo delivered almost 3x the promised
//      ground. Fixed: echo_location marks exactly the 3x3 revealed.
//
// HELD (attacked, resisted — documented, not fixed):
//   - hostile-input sweep across movement verbs (microMove OOB, travelTo OOB,
//     tryNodeExit while dead, beginPathWalk degenerate, examineCell OOB):
//     all refuse or no-op without state corruption; nobody teleports or
//     strands.
//   - travelTo(x, y, force=true) by direct call bypasses blockages — engine-
//     internal param; the only UI caller is the swim button (canSwim-gated).
//     Accepted as engine armor, same class as the insideTent note in travelTo.
//
// Run: node scripts/test-explorer-reveal-20261010.js
// (node harness: full src/js list in index.html order minus DOM-only
//  app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js; Math.random
//  seeded BEFORE eval since modules capture it at load.)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;
Math.random = mulberry32(0xE31010);

// ---------- minimal browser-ish globals ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, String(f)), 'utf8'))) });
global.window = global;
global.document = undefined;
global.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };

// ---------- eval full script list in index.html order, minus DOM-only ----------
const DOM_ONLY = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js', 'drama.js']);
const order = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .split('\n')
  .map(l => (l.match(/src="src\/js\/([^"?]+)/) || [])[1])
  .filter(Boolean)
  .filter(f => !DOM_ONLY.has(f));
for (const f of order) {
  const p = path.join(ROOT, 'src/js', f);
  try {
    eval(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.log('HARNESS EVAL FAIL ' + f + ': ' + (e && e.message));
    process.exit(2);
  }
}
const Game = globalThis.Scattering.Game;

const said = [];
function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  if (Game.log) Game.log.length = 0;
}
function revealedCount() {
  let n = 0;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (Game.tileAt(x, y).revealed) n++;
  return n;
}
function forceDowsingSuccess(fn) {
  // dowsing rolls <0.7; force the success path deterministically.
  const keep = Math.random;
  Math.random = () => 0.1;
  try { return fn(); } finally { Math.random = keep; }
}

(async () => {
  await Game.init();

  // ================= CATCH 1: dowsing reveal scope =================
  freshGame();
  const px = Game.map.px, py = Game.map.py;
  // Plant a water tile far away (Manhattan distance >= 5), unrevealed.
  let far = null;
  outer:
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (Math.abs(x - px) + Math.abs(y - py) >= 5) { far = { x, y }; break outer; }
  }
  ok(!!far, 'setup: a far tile exists', 'px=' + px + ' py=' + py);
  // Clear every mapgen water tile so OUR planted one is the nearest.
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    if (t.type === 'creek' || t.type === 'wetland') t.type = 'forest';
  }
  Game.tileAt(far.x, far.y).type = 'wetland';
  Game.tileAt(far.x, far.y).revealed = false;
  const before1 = revealedCount();
  Game.state.scholar.abilities = (Game.state.scholar.abilities || []).concat(['dowsing']);
  forceDowsingSuccess(() => Game.activateAbility('dowsing'));
  const after1 = revealedCount();
  const delta1 = after1 - before1;
  const waterRevealed = Game.tileAt(far.x, far.y).revealed;
  console.log('  info  dowsing: revealed delta=' + delta1 + ', water tile revealed=' + waterRevealed);
  ok(waterRevealed === true, 'dowsing reveals the water tile');
  ok(delta1 === 1, 'dowsing reveals EXACTLY the water tile (copy: "water, east. N tiles")',
    'revealed ' + delta1 + ' tiles — free fog knowledge beyond the promise');

  // ================= CATCH 2: echo_location reveal scope =================
  freshGame();
  const epx = Game.map.px, epy = Game.map.py;
  // Un-reveal everything in the echo's neighborhood so the delta is pure.
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const nx = epx + dx, ny = epy + dy;
    if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) Game.tileAt(nx, ny).revealed = false;
  }
  const before2 = revealedCount();
  Game.state.scholar.abilities = (Game.state.scholar.abilities || []).concat(['echo_location']);
  Game.activateAbility('echo_location');
  const after2 = revealedCount();
  const delta2 = after2 - before2;
  console.log('  info  echo_location: revealed delta=' + delta2 + ' (copy promises 3x3 = 9)');
  ok(delta2 === 9, 'echo_location reveals exactly the promised 3x3',
    'revealed ' + delta2 + ' tiles, copy says "3x3 revealed"');
  // 1/day gate still works
  Game.activateAbility('echo_location');
  ok(said.some(l => /Already echoed today/.test(l)), 'echo_location keeps its 1/day gate');

  // ================= HELD: hostile-input sweep =================
  freshGame();
  const hpx = Game.map.px, hpy = Game.map.py;
  const hmx = Game.state.scholar.mx ?? 4, hmy = Game.state.scholar.my ?? 4;
  const kcal0 = Game.state.scholar.kcal;
  ok(Game.microMove(-1, 5) === false, 'microMove OOB (negative) refuses');
  ok(Game.microMove(99, 99) === false, 'microMove OOB (huge) refuses');
  ok(Game.travelTo(9, 9) === null, 'travelTo OOB refuses');
  ok(Game.travelTo(-1, -1) === null, 'travelTo negative refuses');
  ok((Game.state.scholar.mx ?? 4) === hmx && (Game.state.scholar.my ?? 4) === hmy,
    'refused moves leave position untouched');
  ok(Game.state.scholar.kcal === kcal0, 'refused moves bill nothing');
  const pw = Game.beginPathWalk(hmx, hmy);
  ok(Array.isArray(pw) && pw.length === 0, 'beginPathWalk to own square is a no-op path');
  const exOob = Game.examineCell(-1, -1);
  ok(exOob === null || exOob === undefined, 'examineCell OOB says nothing, reveals nothing');
  // dead: every movement verb refuses
  Game.state.scholar.health = 0;
  Game.over = true;
  try {
    ok(Game.microMove(hmx + 1 > 8 ? hmx - 1 : hmx + 1, hmy) === false, 'microMove refuses for the dead');
    ok(Game.beginPathWalk(hmx, hmy) === null, 'beginPathWalk refuses for the dead');
    const r = Game.tryNodeExit(1, 0);
    ok(r && r.moved === false, 'tryNodeExit refuses for the dead');
    ok(Game.examineCell(hmx, hmy) === null, 'examineCell refuses for the dead');
  } finally { Game.over = false; Game.state.scholar.health = 100; }
  ok(Game.map.px === hpx && Game.map.py === hpy, 'hostile sweep never moved the player off-node');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH: ' + (e && e.stack || e)); process.exit(2); });
