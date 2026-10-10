#!/usr/bin/env node
// PROOF TEST: trap rebalance (2026-10-10) — shyness, boar beat, gill-net haul.
// Run: SEED=N node scripts/test-trap-balance-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '20261010', 10);
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};
function tile(Game, x, y) { return Game.map.tiles[y][x]; }
function gotoTile(Game, x, y) { Game.map.px = x; Game.map.py = y; const s = Game.state.scholar; s.mx = 4; s.my = 4; }

async function fresh() {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  const said = [];
  Game.say = (m) => said.push(String(m));
  Game.sysSay = () => {};
  const s = Game.state.scholar;
  s.inventory.push({ name: 'stone knife', recipeId: 'stone_knife', units: 1, kg: 0.3 });
  Game.learnTechnique('clean', 'trial');
  Game.tickAction = () => undefined;
  Game.__said = said;
  return Game;
}
function grantTrap(Game, recipeId, uses) {
  const s = Game.state.scholar;
  s.tools = s.tools || [];
  s.tools.push({ recipeId, uses, name: recipeId });
}
function countCarcasses(Game) {
  return (Game.state.scholar.inventory || []).filter(i => i.foodKind === 'meat' && i.foodState === 'carcass').length;
}

(async () => {
  // ---- 1. SHYNESS: deterministic threshold test (override Math.random;
  // checkTraps rolls Math.random() directly, so the fixed value controls it).
  // fresh: 0.3 < 0.4 -> catch. shy3: 0.3 > 0.4*0.65^3=0.11 -> miss.
  // shy3 with 0.05 < 0.11 -> catch (the floor holds).
  async function catchWithFixedRandom(presetShy, randVal) {
    const Game = await fresh();
    const s = Game.state.scholar;
    Game.grantKnowledge('recipe', 'pit_trap', 3, { type: 'test' });
    gotoTile(Game, 2, 2);
    const t = tile(Game, 2, 2);
    t.type = 'forest'; t.traps = [];
    if (presetShy) t.trapShy = { pit_trap: { level: presetShy, day: 1 } };
    grantTrap(Game, 'pit_trap', 999);
    Game.setTrap('pit_trap');
    s.day = 1;
    t.wildlife = { white_tailed_deer: 8 };
    const orig = Math.random;
    Math.random = () => randVal;
    let caught = false;
    try {
      const before = countCarcasses(Game);
      Game.checkTraps();
      caught = countCarcasses(Game) > before;
    } finally { Math.random = orig; }
    return caught;
  }
  check('fresh trap catches on 0.30 roll (0.30 < 0.40)', await catchWithFixedRandom(0, 0.30));
  check('shy3 trap misses on 0.30 roll (0.30 > 0.40*0.65^3=0.11)', !(await catchWithFixedRandom(3, 0.30)));
  check('shy3 trap still catches on 0.05 roll (floor holds)', await catchWithFixedRandom(3, 0.05));

  // ---- 2. SHYNESS RELAXES: level 3 at day 1, check at day 10 (9 quiet days -> relax 3 -> 0)
  {
    const Game = await fresh();
    const s = Game.state.scholar;
    Game.grantKnowledge('recipe', 'pit_trap', 3, { type: 'test' });
    gotoTile(Game, 2, 2);
    const t = tile(Game, 2, 2);
    t.type = 'forest'; t.traps = [];
    t.trapShy = { pit_trap: { level: 3, day: 1 } };
    t.wildlife = { white_tailed_deer: 8 };
    grantTrap(Game, 'pit_trap', 999);
    s.day = 10;
    Game.setTrap('pit_trap');
    // read back the shyness after one checkTraps (relax computed at check time;
    // a catch on the same dawn re-raises to 1, which still proves relax ran)
    Game.checkTraps();
    const shy = (t.trapShy || {}).pit_trap || { level: 0 };
    check('shyness relaxes after quiet days', shy.level <= 1, `level=${shy.level} after 9 quiet days`);
  }

  // ---- 3. BOAR BEAT: L3 -> spear-from-above language; L1 -> climb-down language
  async function boarBeat(level) {
    const Game = await fresh();
    const s = Game.state.scholar;
    Game.grantKnowledge('recipe', 'pit_trap', level, { type: 'test' });
    gotoTile(Game, 2, 2);
    const t = tile(Game, 2, 2);
    t.type = 'forest'; t.traps = [];
    grantTrap(Game, 'pit_trap', 999);
    Game.setTrap('pit_trap');
    for (let d = 1; d <= 40; d++) {
      s.day = d;
      t.wildlife = { wild_boar: 8 };
      for (const tr of (t.traps || [])) if (tr.recipeId === 'pit_trap') tr.uses = 999;
      Game.__said.length = 0;
      Game.checkTraps();
      const text = Game.__said.join(' ');
      if (/boar/i.test(text) && /pit/i.test(text)) return text;
      s.inventory = (s.inventory || []).filter(i => !(i.foodKind === 'meat' && i.foodState === 'carcass'));
    }
    return null;
  }
  const l3text = await boarBeat(3);
  check('boar retrieval beat fires (L3)', !!l3text && /from above/i.test(l3text) && /like the recipe says/i.test(l3text),
    l3text ? l3text.slice(0, 90) + '...' : 'no boar catch in 40d');
  const l1text = await boarBeat(1);
  check('boar retrieval beat warns the careless (L1)', !!l1text && /from above/i.test(l1text) && !/like the recipe says/i.test(l1text),
    l1text ? l1text.slice(0, 90) + '...' : 'no boar catch in 40d');

  // ---- 4. GILL NET multi-haul: at least one 2+ fish night in 60 days; uses per fish
  {
    const Game = await fresh();
    const s = Game.state.scholar;
    gotoTile(Game, 3, 3);
    const t = tile(Game, 3, 3);
    t.type = 'creek'; t.nets = [];
    s.inventory.push({ name: 'Gill net', itemId: 'gill_net', units: 1, kg: 0.5 });
    Game.setNet();
    let multiHaul = false, totalFish = 0, nights = 0;
    for (let d = 1; d <= 60 && (t.nets || []).length; d++) {
      s.day = d;
      t.wildlife = { creek_chub: 8, bluegill: 8 };
      const before = countCarcasses(Game);
      Game.__said.length = 0;
      Game.checkNets();
      const got = countCarcasses(Game) - before;
      if (got > 0) { nights++; totalFish += got; if (got >= 2) multiHaul = true; }
      s.inventory = (s.inventory || []).filter(i => !(i.foodKind === 'meat' && i.foodState === 'carcass'));
    }
    console.log(`  INFO net: ${nights} successful nights, ${totalFish} fish`);
    check('gill net hauls multiple fish some nights', multiHaul, `nights=${nights} fish=${totalFish}`);
    check('gill net still finite (12 uses = 12 fish, then rags)', totalFish <= 12, `fish=${totalFish}`);
  }

  // ---- 5. REGRESSION: snare still works; shy hint message fires
  {
    const Game = await fresh();
    const s = Game.state.scholar;
    Game.grantKnowledge('recipe', 'snare', 3, { type: 'test' });
    gotoTile(Game, 2, 2);
    const t = tile(Game, 2, 2);
    t.type = 'meadow'; t.traps = [];
    grantTrap(Game, 'snare', 999);
    Game.setTrap('snare');
    let catches = 0, hintSeen = false;
    for (let d = 1; d <= 30; d++) {
      s.day = d;
      t.wildlife = { cottontail_rabbit: 8 };
      for (const tr of (t.traps || [])) tr.uses = 999;
      Game.__said.length = 0;
      const before = countCarcasses(Game);
      Game.checkTraps();
      catches += countCarcasses(Game) - before;
      if (Game.__said.join(' ').includes('has learned your trap')) hintSeen = true;
      s.inventory = (s.inventory || []).filter(i => !(i.foodKind === 'meat' && i.foodState === 'carcass'));
    }
    check('snare still catches (shyness does not kill small game)', catches >= 2, `catches=${catches}`);
    console.log(`  INFO snare 30d catches=${catches}, shy-hint seen=${hintSeen}`);
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(' | ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
