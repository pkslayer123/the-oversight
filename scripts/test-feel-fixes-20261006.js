#!/usr/bin/env node
// Feel-fixes verification (Steve 2026-10-06): three combat feel-fixes from the
// player playtests (feel-playtest-20261006.md + wave2b-pack-evidence-1x).
//  1. Sunbasker shade-fizzle (game.js): sun-aware approach avoids shaded tiles.
//  2. Charge-lane sign-snap (engine/combat.js patternCells): DDA rasterization
//     so a committed lane passes through the aim point at off-axis angles.
//  3. Crowd-deflate say-dedup (game.js saySituationOnce): repeat situation
//     lines speak once per distinct situation per fight; swarm-scatter sibling.
// Run: node scripts/test-feel-fixes-20261006.js
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
const C = globalThis.Scattering.combat;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`); }
}
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  Game.canSee = () => true;
  Game.dayPart = 1; // midday
}
function P() { return Game.tbFighter('p'); }
// Guarded endTurn: exactly one AI round per player action (AGENTS.md lesson).
function endTurn() {
  const p = P();
  if (p && Game.tbIsPlayerTurn()) { p.moveLeft = 0; p.acted = true; }
  if (Game.tbIsPlayerTurn()) Game.tbAdvance();
}

// ============ 1. CHARGE-LANE RASTERIZATION ============
(async () => {
await Game.init();
(function chargeLanes() {
  // Old sign-snap reimplemented for equivalence checking at 8-way angles.
  function oldSnap(pattern, ax, ay, tx, ty) {
    const dx = Math.sign(tx - ax), dy = Math.sign(ty - ay);
    const len = pattern.length || 5, cells = [];
    for (let i = 1; i <= len; i++) {
      const cx = ax + dx * i, cy = ay + dy * i;
      if (cx < 0 || cx > 8 || cy < 0 || cy > 8) break;
      cells.push(cx + ',' + cy);
    }
    return cells;
  }
  const has = (cells, x, y) => cells.some(c => c.cx === x && c.cy === y);
  const bulldozer = { type: 'charge', length: 5, width: 1 };
  const stag = { type: 'charge', length: 6, width: 1 };

  // 8-way equivalence sweep: new output must equal old at 8-way bearings.
  let equiv = 0, equivTotal = 0;
  for (let ax = 1; ax <= 7; ax += 2) for (let ay = 1; ay <= 7; ay += 2) {
    for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      for (const dist of [1, 2, 4, 7]) {
        const tx = ax + ddx * dist, ty = ay + ddy * dist;
        if (tx < 0 || tx > 8 || ty < 0 || ty > 8) continue;
        equivTotal++;
        const nw = C.patternCells(bulldozer, ax, ay, tx, ty).map(c => c.cx + ',' + c.cy);
        const od = oldSnap(bulldozer, ax, ay, tx, ty);
        if (JSON.stringify(nw) === JSON.stringify(od)) equiv++;
        else console.log(`  8-way mismatch (${ax},${ay})->(${tx},${ty}): new=${nw} old=${od}`);
      }
    }
  }
  ok('charge: 8-way output identical to old sign-snap', equiv === equivTotal, `${equiv}/${equivTotal}`);

  // Off-axis: lane must pass through the aim point (the reported bug).
  let aimHit = 0, aimTotal = 0;
  const offAxis = [[2,1],[3,1],[3,2],[4,1],[4,3],[1,2],[2,3],[5,2],[5,3],[1,3],[3,4]];
  for (const [ox, oy] of offAxis) for (const s of [1, -1]) {
    const ax = 2, ay = 4, tx = ax + ox, ty = ay + oy * s;
    if (tx > 8 || ty < 0 || ty > 8) continue;
    for (const pat of [bulldozer, stag]) {
      aimTotal++;
      const cells = C.patternCells(pat, ax, ay, tx, ty);
      if (has(cells, tx, ty)) aimHit++;
      else console.log(`  aim miss len=${pat.length} (${ax},${ay})->(${tx},${ty}): ${cells.map(c=>c.cx+','+c.cy)}`);
    }
  }
  ok('charge: off-axis lane contains the aim point', aimHit === aimTotal, `${aimHit}/${aimTotal}`);

  // Old code demonstrably missed the reported case (sanity: the bug was real).
  const oldMiss = oldSnap(bulldozer, 2, 4, 5, 5);
  ok('charge: old sign-snap missed (2,4)->(5,5) aim (repro of the bug)', !oldMiss.includes('5,5'), oldMiss.join(' '));
  const newHit = C.patternCells(bulldozer, 2, 4, 5, 5);
  ok('charge: new lane hits (2,4)->(5,5) aim', has(newHit, 5, 5), newHit.map(c=>c.cx+','+c.cy).join(' '));

  // Width semantics preserved.
  const wide = C.patternCells({ type: 'line', length: 4, width: 2 }, 2, 4, 6, 4);
  ok('charge: width>1 still widens', wide.length > 4, `cells=${wide.length}`);
  // Beam (non-charge) also benefits: aim on the lane.
  const beam = C.patternCells({ type: 'beam', length: 6, width: 1 }, 1, 1, 4, 3);
  ok('beam: off-axis aim on lane', has(beam, 4, 3));
  // Burst untouched.
  const burst = C.patternCells({ type: 'burst', radius: 2 }, 4, 4, 4, 4);
  ok('burst: unchanged', burst.length === 25, `cells=${burst.length}`);
})();

// ============ 2. SUNBASKER SUN-AWARE APPROACH ============
(function sunbasker() {
  freshGame();
  Game.debugScenario('sunbasker');
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  ok('sunbasker: fight started', !!Game.tbfight);
  if (!Game.tbfight) return;
  const sb = Game.tbfight.fighters.find(x => x.kind === 'monster' && ((x.mdef || {}).id === 'sunbasker'));
  ok('sunbasker: monster present', !!sb);
  if (!sb) return;
  const p = P();
  // Deterministic shade: tree at (sb.mx-1, sb.my-2) shades (sb.mx-1, sb.my-1),
  // the tile the OLD approach would step onto first.
  const tx = sb.mx - 1, ty = sb.my - 2;
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  grid[ty][tx] = 'tree';
  const origGen = Game.genDetail.bind(Game);
  Game.genDetail = () => grid;
  // Put the player 3 tiles west so the approach must close in.
  p.mx = sb.mx - 3; p.my = sb.my; p.moveLeft = 0;
  ok('sunbasker: setup not shaded at start', !Game.tbInShade(sb.mx, sb.my));
  ok('sunbasker: the first old-style step tile is shaded', Game.tbInShade(sb.mx - 1, sb.my - 1));
  // Repro: the OLD approach (plain tbStepToward, no shade avoid) picks shade.
  const oldStep = Game.tbStepToward(sb, p.mx, p.my, (x, y) => false, null);
  ok('sunbasker: old approach WOULD step into shade (the fizzle repro)',
    !!oldStep && Game.tbInShade(oldStep.x, oldStep.y),
    oldStep ? `(${oldStep.x},${oldStep.y})` : 'no step');

  // Now play: the fixed approach must stay in sun and reach adjacency.
  const trail = [];
  let flattenedDuringApproach = false, reachedAdjacent = false, turns = 0;
  for (let i = 0; i < 12 && Game.tbfight && !Game.tbfight.over; i++) {
    endTurn();
    turns++;
    if (!Game.tbfight || Game.tbfight.over) break;
    trail.push([sb.mx, sb.my]);
    if (sb.sbFlat) flattenedDuringApproach = true;
    const d = Math.max(Math.abs(p.mx - sb.mx), Math.abs(p.my - sb.my));
    if (d <= 1) { reachedAdjacent = true; break; }
    p.moveLeft = 0;
  }
  const shadedSteps = trail.filter(([x, y]) => Game.tbInShade(x, y));
  ok('sunbasker: approach never entered a shaded tile', shadedSteps.length === 0,
    shadedSteps.length ? shadedSteps.map(s => `(${s[0]},${s[1]})`).join(' ') : `trail=${trail.map(t=>t.join(',')).join(' ')}`);
  ok('sunbasker: reached adjacency without flattening', reachedAdjacent && !flattenedDuringApproach,
    `adjacent=${reachedAdjacent} flat=${flattenedDuringApproach} turns=${turns}`);
  // And the bask loop plays: keep waiting, charge must build (not flattened).
  let charged = false;
  for (let i = 0; i < 6 && Game.tbfight && !Game.tbfight.over; i++) {
    endTurn();
    if ((sb.sbCharge || 0) >= 1) { charged = true; break; }
    p.moveLeft = 0;
  }
  ok('sunbasker: bask→charge loop plays in sun', charged && !sb.sbFlat, `charge=${sb.sbCharge} flat=${sb.sbFlat}`);
  Game.genDetail = origGen;
})();

// ============ 3. CROWD-DEFLATE SAY-DEDUP ============
(function dedup() {
  freshGame();
  // Unit: helper semantics.
  const said = [];
  const origSay = Game.say;
  Game.say = (t) => said.push(t);
  Game.tbfight = { round: 3 };
  const m = { mdef: { id: 'hype_horn' } };
  Game.saySituationOnce(m, 'deflate:crowd:a+b', 'LINE-A');
  Game.saySituationOnce(m, 'deflate:crowd:a+b', 'LINE-A');
  Game.saySituationOnce(m, 'deflate:crowd:a+b', 'LINE-A');
  ok('dedup: identical situation line speaks once', said.filter(s => s === 'LINE-A').length === 1, said.join('|'));
  Game.saySituationOnce(m, 'deflate:crowd:a+c', 'LINE-A');
  ok('dedup: changed situation re-speaks', said.filter(s => s === 'LINE-A').length === 2);
  Game.saySituationOnce({ mdef: { id: 'camera_swarm' } }, 'scatter:fire:3,3', 'LINE-B');
  Game.saySituationOnce({ mdef: { id: 'camera_swarm' } }, 'scatter:fire:3,3', 'LINE-B');
  ok('dedup: per-monster identity (swarm scatter once)', said.filter(s => s === 'LINE-B').length === 1);
  Game.saySituationOnce({ mdef: { id: 'camera_swarm' } }, 'scatter:fire:4,3', 'LINE-B');
  ok('dedup: moved fire re-speaks', said.filter(s => s === 'LINE-B').length === 2);
  // New fight resets.
  Game.tbfight = { round: 1 };
  Game.saySituationOnce(m, 'deflate:crowd:a+b', 'LINE-A');
  ok('dedup: new fight resets', said.filter(s => s === 'LINE-A').length === 3);
  Game.say = origSay;
  Game.tbfight = null; // drop the fake fight — tbEnd can't clean a stub

  // E2E: horn crowd-deflate across windup cycles — one line per crowd.
  freshGame();
  const said2 = [];
  Game.say = (t) => said2.push(String(t));
  Game.debugScenario('motivationalspeaker');
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  { const s = Game.state.scholar; s.mx = s.monster.mx + 1; s.my = s.monster.my; }
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  ok('dedup: horn fight started', !!Game.tbfight);
  if (!Game.tbfight) { Game.say = origSay; return; }
  const hh = () => Game.tbfight.fighters.filter(x => x.kind === 'monster' && ((x.mdef || {}).id === 'hype_horn'));
  for (const h of hh()) { h.hp = h.maxHp = 400; }
  const f = Game.tbfight;
  let sawDeflatePhase = false;
  for (let i = 0; i < 2; i++) {
    f.fighters.push({ key: 'pal' + i, kind: 'villager', name: 'Pal ' + i, mx: P().mx, my: P().my, hp: 60, maxHp: 60, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
    for (const h of hh()) Game.encNoticeFighter(h, 'pal' + i, true);
    hh().forEach(h => { h.telegraph = null; h.hypeCooldown = 0; });
  }
  for (let i = 0; i < 14 && Game.tbfight && !Game.tbfight.over; i++) { endTurn(); if (hh().some(h => h.beamPhase === 'deflate')) sawDeflatePhase = true; }
  const deflates = said2.filter(t => /YOU'RE ALL WINNERS/.test(t));
  ok('dedup: crowd-deflate line printed exactly once across cycles', deflates.length === 1, `count=${deflates.length}`);
  ok('dedup: horn still deflates mechanically (phase reached)', sawDeflatePhase);
  Game.say = origSay;
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
