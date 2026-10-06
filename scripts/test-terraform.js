#!/usr/bin/env node
// TEST (terraform 2026-10-06): monster-reshaped ground.
// trample/crater = difficult (2 move/tile); paper/scorch = 1 damage on entry.
// Terrain is fight-scoped, monsters ignore it, the player pays.
// Run: node scripts/test-terraform.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let fails = 0;
function check(cond, label) {
  if (!cond) { fails++; console.log('FAIL: ' + label); }
  else console.log('ok: ' + label);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);

  // ---- 1. data flags exist on the four monsters ----
  const tdefs = {};
  for (const m of Game.data.monsters || []) {
    if (m.terraform) tdefs[m.id] = m.terraform;
  }
  check(tdefs['bulldozer'] === 'trample', 'bulldozer has terraform=trample');
  check(tdefs['contract_golem'] === 'paper', 'contract_golem has terraform=paper');
  check(tdefs['bright_idea'] === 'crater', 'bright_idea has terraform=crater');
  check(tdefs['sunbasker'] === 'scorch', 'sunbasker has terraform=scorch');

  // ---- 2. core API on a bare fight object ----
  Game.tbfight = { terraform: {}, fighters: [], over: false };
  Game.tbTerraform(3, 3, 'trample');
  check(Game.tbTerrainAt(3, 3) === 'trample', 'tbTerrainAt returns laid type');
  check(Game.tbTerrainAt(0, 0) === null, 'empty tile returns null');
  check(Game.tbTerrainCost(3, 3) === 2, 'trample costs 2');
  Game.tbTerraform(4, 4, 'crater');
  check(Game.tbTerrainCost(4, 4) === 2, 'crater costs 2');
  Game.tbTerraform(5, 5, 'paper');
  check(Game.tbTerrainCost(5, 5) === 1, 'paper costs 1 (damage, not difficult)');
  Game.tbTerraform(6, 6, 'scorch');
  check(Game.tbTerrainCost(6, 6) === 1, 'scorch costs 1 (damage, not difficult)');
  Game.tbTerraform(3, 3, 'paper');
  check(Game.tbTerrainAt(3, 3) === 'trample', 'first layer wins; no stacking');
  Game.tbTerraform(9, 9, 'trample');
  check(Game.tbTerrainAt(9, 9) === null, 'out-of-bounds ignored');
  Game.tbTerraform(-1, 3, 'trample');
  check(Game.tbTerrainAt(-1, 3) === null, 'negative coords ignored');
  Game.tbfight = null;

  // ---- 3. movement: difficult terrain eats 2 per tile ----
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100; s.mx = 4; s.my = 4;
  Game.startCombat('bulldozer');
  check(!!Game.tbfight, 'bulldozer combat starts');
  check(Game.tbfight.terraform && typeof Game.tbfight.terraform === 'object', 'fight init carries terraform map');
  const f = Game.tbfight;
  const p = Game.tbFighter('p');
  // lay a trample lane: (4,4) -> (5,4) -> (6,4)
  Game.tbTerraform(5, 4, 'trample');
  Game.tbTerraform(6, 4, 'trample');
  p.mx = 4; p.my = 4; s.mx = 4; s.my = 4;
  p.moveLeft = 4; p.acted = false;
  // wait for player turn
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 40) Game.tbAdvance();
  if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) {
    p.moveLeft = 4;
    const ok = Game.tbPlayerMove(6, 4);
    check(ok === true, 'move through 2 trample tiles succeeds with 4 move');
    check(p.moveLeft === 0, `2 trample tiles cost 4 move (left=${p.moveLeft})`);
    check(p.mx === 6 && p.my === 4, 'player arrived');
  } else {
    check(false, 'reached player turn for movement test');
  }
  // now with only 3 move, the same path is too far
  if (Game.tbfight && !Game.tbfight.over) {
    p.mx = 4; p.my = 4; s.mx = 4; s.my = 4; p.moveLeft = 3; p.acted = false;
    // force player turn again
    guard = 0;
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 40) Game.tbAdvance();
    if (Game.tbIsPlayerTurn()) {
      p.moveLeft = 3;
      const ok2 = Game.tbPlayerMove(6, 4);
      check(ok2 === false, '3 move cannot afford 2 trample tiles (cost 4)');
      check(p.mx === 4 && p.my === 4, 'player did not move on failed path');
    }
  }
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;

  // ---- 4. paper cuts: 1 damage on entry ----
  s.health = 100; s.mx = 4; s.my = 4;
  Game.startCombat('contract_golem');
  check(!!Game.tbfight, 'contract_golem combat starts');
  {
    const p2 = Game.tbFighter('p');
    Game.tbTerraform(5, 4, 'paper');
    p2.mx = 4; p2.my = 4; s.mx = 4; s.my = 4;
    const hp0 = p2.hp != null ? p2.hp : s.health;
    guard = 0;
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 40) Game.tbAdvance();
    if (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn()) {
      p2.moveLeft = 4; p2.acted = false;
      Game.tbPlayerMove(5, 4);
      const hp1 = p2.hp != null ? p2.hp : s.health;
      check(hp1 === hp0 - 1, `paper deals 1 on entry (${hp0} -> ${hp1})`);
      check(Game.tbfight.terraformFelt && Game.tbfight.terraformFelt.paper === true, 'first contact recorded');
    } else {
      check(false, 'reached player turn for paper test');
    }
  }
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;

  // ---- 5. sunbasker basks -> scorch on its tile (live behavior) ----
  s.health = 100; s.mx = 4; s.my = 4;
  Game.startCombat('sunbasker');
  Game.dayPart = 1; // midday, not night (set after depart/startCombat)
  check(!!Game.tbfight, 'sunbasker combat starts');
  {
    const sb = Game.tbfight.fighters.find(x => x.kind === 'monster');
    check(!!sb, 'sunbasker fighter present');
    if (sb) {
      // put it adjacent in sunlight
      sb.mx = 5; sb.my = 4;
      s.mx = 4; s.my = 4;
      const p3 = Game.tbFighter('p'); p3.mx = 4; p3.my = 4;
      guard = 0;
      let scorched = false;
      // tbAdvance steps whoever's turn it is (study doesn't spend the turn)
      while (Game.tbfight && !Game.tbfight.over && guard++ < 30) {
        Game.tbAdvance();
        if (!Game.tbfight) break;
        if (Game.tbTerrainAt(sb.mx, sb.my) === 'scorch') { scorched = true; break; }
      }
      check(scorched, 'sunbasker bask scorches its tile');
    }
  }
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;

  // ---- 6. terrain dies with the fight ----
  Game.startCombat('bulldozer');
  Game.tbTerraform(2, 2, 'trample');
  check(Game.tbTerrainAt(2, 2) === 'trample', 'terrain laid');
  Game.tbfight.over = true; Game.tbfight = null;
  Game.state.scholar.monster = null;
  Game.startCombat('bulldozer');
  check(Game.tbTerrainAt(2, 2) === null, 'new fight has clean terrain');
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
