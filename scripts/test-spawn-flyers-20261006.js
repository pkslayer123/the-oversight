#!/usr/bin/env node
// PROOF (Steve 2026-10-06): flying monsters — flight movement, melee
// reachability, dive/mark telegraphs, grounded vulnerability.
//   - tbAirStepToward ignores terrain blocking (flies over trees)
//   - airborne flyers whiff melee/spear (range<=2); sling/bow can hit
//   - nevermore: strafe lane telegraph (3 cells), grounded 1 (hit) / 2 (miss)
//   - nightcourt: dive → redive on miss (re-aimed), grounded 2 after
//   - statickite: 3x3 mark (2-beat) → transmit dip (low, +50% window)
//   - grounded/low flyers take +50% damage (universal rule)
// Monster turns are driven DIRECTLY (Game.tbMonsterTurn) for determinism —
// flyers are faster than the player (speed 5/4) and would otherwise open.
// Run: node scripts/test-spawn-flyers-20261006.js
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
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}
function treesGrid() {
  const g = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  for (let y = 0; y < 9; y++) g[y][4] = 'tree';
  return g;
}
function P() { return Game.tbFighter('p'); }
function MON() { return (Game.tbfight ? Game.tbfight.fighters : []).find(x => x.kind === 'monster' && x.alive); }
// drive exactly one monster turn, deterministically
function mturn() {
  const m = MON();
  if (m && Game.tbfight && !Game.tbfight.over) Game.tbMonsterTurn(m);
  return MON();
}
// force it to be the player's turn (for strikes)
function playerTurn() {
  const f = Game.tbfight;
  f.turnIdx = f.order.indexOf('p');
  Game.tbBeginTurn();
}
function newRun(detail) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genDetail = detail || (() => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.abilities = []; s.backgroundAbilities = [];
  s.stats = s.stats || {}; s.stats.agi = 5;
  Game.dayPart = 1;
  Game.audio = {};
  return s;
}
function startFightAt(mid, px, py, mx, my) {
  const s = Game.state.scholar;
  s.mx = px; s.my = py;
  Game.startCombat(mid);
  const m = MON();
  // undo any opening turn: reset to a clean perched/high state
  m.mx = mx; m.my = my;
  m.telegraph = null;
  const init = { nevermore: ['perch', 'high'], nightcourt: ['roost', 'high'], statickite: ['rise', 'high'], glasswing: ['circle', 'high'] }[mid];
  if (init) { m.beamPhase = init[0]; m.altitude = init[1]; }
  playerTurn();
  return m;
}

(async () => {
  await Game.init();
  Game.canSee = () => true;

  // ---- 1. FLIGHT MOVEMENT: ignores terrain ----
  {
    newRun(treesGrid);
    const m = startFightAt('nevermore', 2, 4, 6, 4);
    const st = Game.tbAirStepToward(m, 2, 4, null);
    check('air step crosses trees', !!st && st.x < 6, JSON.stringify(st));
    const blocked = (x, y) => { const g = treesGrid(); return x < 0 || x > 8 || y < 0 || y > 8 || g[y][x] === 'tree'; };
    let crossed = false, cx = 6, cy = 4;
    for (let i = 0; i < 8; i++) {
      const q = S.combat.stepToward(cx, cy, 2, 4, blocked, null);
      if (!q) break;
      cx = q.x; cy = q.y;
      if (cx < 4) crossed = true;
    }
    check('grounded stepToward blocked by trees', !crossed && cx >= 4, `ended (${cx},${cy})`);
    m.mx = 0; m.my = 0;
    const e = Game.tbAirStepToward(m, -5, -5, null);
    check('air step stays on grid', !e || (e.x >= 0 && e.y >= 0), JSON.stringify(e));
  }

  // ---- 2. MELEE REACHABILITY ----
  {
    newRun();
    const m = startFightAt('nevermore', 4, 3, 4, 2); // adjacent, high
    check('flyerAirborne while perched', Game.flyerAirborne(m) === true, `alt=${m.altitude}`);
    const hp0 = m.hp;
    Game.state.scholar.equipped = {}; // unarmed, range 1
    Game.tbPlayerStrike(m.key);
    check('melee whiffs airborne (adjacent)', m.hp === hp0 && P().acted === true, `hp ${m.hp}/${hp0} acted=${P().acted}`);
    Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    playerTurn();
    Game.tbPlayerStrike(m.key);
    check('spear whiffs airborne (adjacent)', m.hp === hp0, `hp ${m.hp}/${hp0}`);
    // sling (range 4) + stones: hits the high bird
    Game.state.scholar.equipped = { weapon: { itemId: 'sling', name: 'Sling' } };
    Game.state.scholar.inventory.push({ material: 'stone', units: 5, name: 'stone' });
    playerTurn();
    Game.tbPlayerStrike(m.key);
    check('sling hits airborne flyer', m.hp < hp0, `hp ${m.hp}/${hp0}`);
    // grounded: no longer airborne
    m.altitude = 'low';
    check('flyerAirborne false when low', Game.flyerAirborne(m) === false);
  }

  // ---- 3. NEVERMORE: strafe lane ----
  {
    newRun();
    const m = startFightAt('nevermore', 4, 4, 4, 0); // d=4: approach first
    mturn(); // perch → closes to d=3
    const d1 = Math.max(Math.abs(P().mx - m.mx), Math.abs(P().my - m.my));
    check('nevermore closes to strafe range', d1 <= 3, `d=${d1} at (${m.mx},${m.my})`);
    mturn(); // declares strafe
    check('nevermore declares strafe', !!m.telegraph && m.beamPhase === 'strafe', `phase=${m.beamPhase}`);
    const cells = (m.telegraph && m.telegraph.cells) || [];
    check('strafe lane is 3 cells', cells.length === 3, JSON.stringify(cells));
    check('strafe lane covers player tile', cells.some(c => c.cx === 4 && c.cy === 4), JSON.stringify(cells));
    check('strafe descends', m.altitude === 'low', m.altitude);
    // dodge: move off the lane
    P().mx = 0; P().my = 0;
    const hp0 = Game.state.scholar.health;
    mturn(); // windup ticks → resolve (miss)
    check('nevermore miss → grounded', m.beamPhase === 'grounded', `phase=${m.beamPhase}`);
    check('nevermore miss → 2-turn grounded', m.nmGrounded === 2, `nmGrounded=${m.nmGrounded}`);
    check('dodge took no damage', Game.state.scholar.health === hp0, `${Game.state.scholar.health}/${hp0}`);
    // grounded window: melee reaches now
    const mhp0 = m.hp;
    P().mx = m.mx + 1; P().my = m.my;
    playerTurn();
    Game.state.scholar.equipped = {};
    Game.tbPlayerStrike(m.key);
    check('grounded punish lands', m.hp < mhp0, `hp ${m.hp}/${mhp0}`);
    // climbs back after the window
    mturn(); mturn();
    check('nevermore climbs back to perch', m.beamPhase === 'perch' && m.altitude === 'high', `phase=${m.beamPhase} alt=${m.altitude}`);
  }

  // ---- 4. NIGHTCOURT: dive → redive ----
  {
    newRun();
    Game.dayPart = 3;
    const m = startFightAt('nightcourt', 4, 4, 4, 0); // d=4: in dive range
    mturn(); // declares dive
    check('nightcourt declares dive', !!m.telegraph && m.beamPhase === 'dive', `phase=${m.beamPhase}`);
    check('dive is single-tile shadow', m.telegraph.cells.length === 1 && m.telegraph.cells[0].cx === 4 && m.telegraph.cells[0].cy === 4, JSON.stringify(m.telegraph.cells));
    P().mx = 7; P().my = 7; // dodge the first dive
    const hp0 = Game.state.scholar.health;
    mturn(); // resolve (miss) → redive armed
    check('miss arms redive', m.ncRedove === true, `ncRedove=${m.ncRedove}`);
    check('no damage from dodged dive', Game.state.scholar.health === hp0);
    mturn(); // next monster turn: immediate redive at NEW position
    check('redive declared at new position', !!m.telegraph && m.beamPhase === 'redive'
      && m.telegraph.cells[0].cx === 7 && m.telegraph.cells[0].cy === 7,
      `phase=${m.beamPhase} cells=${JSON.stringify(m.telegraph && m.telegraph.cells)}`);
    mturn(); // redive resolves (player still on tile → hit)
    check('redive resolved → grounded', m.beamPhase === 'grounded' && m.ncGrounded === 2, `phase=${m.beamPhase} ncGrounded=${m.ncGrounded}`);
    check('redive hit landed', Game.state.scholar.health < hp0, `${Game.state.scholar.health}/${hp0}`);
  }

  // ---- 5. STATICKITE: mark → transmit dip ----
  {
    newRun();
    const m = startFightAt('statickite', 4, 4, 4, 0); // d=4: standoff
    mturn(); // rise → declares mark (d=4 <= 6)
    check('kite declares mark', !!m.telegraph && m.beamPhase === 'mark', `phase=${m.beamPhase}`);
    const cells = (m.telegraph && m.telegraph.cells) || [];
    check('mark is 3x3', cells.length === 9, `${cells.length} cells`);
    check('mark stays high while marking', m.altitude === 'high', m.altitude);
    check('mark windup is 2', m.telegraph.turnsLeft === 2, `turnsLeft=${m.telegraph.turnsLeft}`);
    P().mx = 0; P().my = 0; // leave the square
    const hp0 = Game.state.scholar.health;
    mturn(); mturn(); // 2 windup ticks → resolve on 2nd
    check('kite transmit dip', m.beamPhase === 'transmit' && m.altitude === 'low', `phase=${m.beamPhase} alt=${m.altitude}`);
    check('mark dodged cleanly', Game.state.scholar.health === hp0, `${Game.state.scholar.health}/${hp0}`);
    // the dip is the melee window
    P().mx = m.mx + 1; P().my = m.my;
    Game.state.scholar.equipped = {};
    const mhp0 = m.hp;
    playerTurn();
    Game.tbPlayerStrike(m.key);
    check('dip punish lands', m.hp < mhp0, `hp ${m.hp}/${mhp0}`);
    mturn(); // dip turn → climbs
    check('kite climbs after dip', m.altitude === 'high' && m.beamPhase === 'recover', `phase=${m.beamPhase} alt=${m.altitude}`);
  }

  // ---- 6. GROUNDED +50% (universal rule) ----
  {
    newRun();
    const m = startFightAt('nevermore', 4, 4, 4, 3);
    m.altitude = 'low'; m.beamPhase = 'grounded';
    const h0 = m.hp;
    Game.tbDamage(m.key, 10, 'test', null, { quiet: true });
    check('low-altitude +50%', h0 - m.hp === 15, `dealt=${h0 - m.hp} (10 base)`);
    // kite dip also gets it
    const k = startFightAt('statickite', 4, 4, 4, 3);
    k.altitude = 'low'; k.beamPhase = 'transmit';
    const k0 = k.hp;
    Game.tbDamage(k.key, 10, 'test', null, { quiet: true });
    check('kite dip +50%', k0 - k.hp === 15, `dealt=${k0 - k.hp}`);
  }

  // ---- 7. GLASSWING parity (generic whiff covers it) ----
  {
    newRun();
    const m = startFightAt('glasswing', 4, 3, 4, 2);
    check('glasswing circle = high', m.altitude === 'high', m.altitude);
    const h0 = m.hp;
    Game.state.scholar.equipped = {};
    Game.tbPlayerStrike(m.key);
    check('glasswing circle still whiffs melee', m.hp === h0, `hp ${m.hp}/${h0}`);
  }

  // ---- 8. nevermoreVoice: dead villagers feed it ----
  {
    newRun();
    const v = Game.data.villagers.find(x => x.name);
    let name = 'NoName';
    if (v) { v.dead = true; name = String(v.name).split(' ')[0]; }
    const line = Game.nevermoreVoice();
    check('nevermoreVoice returns a fragment', typeof line === 'string' && line.length > 4, line);
    if (v) v.dead = false;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
