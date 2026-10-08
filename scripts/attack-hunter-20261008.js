#!/usr/bin/env node
// HOSTILE PLAYTEST (hunter archetype, 2026-10-08): play as an attacker, not a tourist.
// Every attack below tries to break the hunting economy, softlock, or catch the UI lying.
// Run: node scripts/attack-hunter-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
const verdicts = [];
const attack = (name, broke, detail) => { verdicts.push([name, broke]); console.log(`[${broke ? 'BREAK' : 'HELD '} ] ${name}${detail ? ' — ' + detail : ''}`); };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  s.inventory.push({ material: 'vine', units: 20, name: 'vine' }, { material: 'stick', units: 40, name: 'stick' },
    { material: 'stone', units: 6, name: 'stone' }, { name: 'berries', kcalEach: 30, units: 20, kg: 0.1 });
  say();
  return s;
}
const craftOk = id => { let m = null; for (let i = 0; i < 10 && !m; i++) m = Game.craft(id); say(); return !!m; };
const keepAlive = s => { s.kcal = 2400; s.hydration = 100; if (s.health < 200) s.health = 500; };
const wildlifeTotal = t => Object.values((t && t.wildlife) || {}).reduce((a, b) => a + b, 0);

(async () => {
  await Game.init();
  console.log('== SEED ' + SEED + ' ==');

  // ---- ATTACK 1: pit-trap deer economy ----
  {
    const s = fresh();
    Game.learnRecipe('pit_trap', 3);
    const pitNodes = [];
    for (let n = 0; n < 3; n++) {
      if (!craftOk('pit_trap')) break;
      if (!Game.setTrap('pit_trap')) break;
      pitNodes.push({ x: Game.map.px, y: Game.map.py, w0: wildlifeTotal(Game.playerTile()) });
      say();
      if (n < 2) { const tg = Game.travelTargets().find(t => Game.tileAt(t.x, t.y).type !== 'haven'); if (tg) Game.travelTo(tg.x, tg.y, true); say(); }
    }
    let catches = 0, grossKcal = 0;
    for (let d = 0; d < 15; d++) {
      keepAlive(s); Game.endDay(); say();
      if (Game.over) break;
      for (const it of s.inventory) {
        if (it && it.foodState === 'carcass' && !it.counted) { it.counted = true; catches++; grossKcal += (it.hiddenKcal || 0); }
      }
    }
    const w1 = pitNodes.map(p => wildlifeTotal(Game.tileAt(p.x, p.y)));
    const depleted = pitNodes.some((p, i) => w1[i] < p.w0);
    const expectedCleaned = Math.round(grossKcal * 0.4);
    attack('A1 pit-trap deer faucet', catches >= 3 && !depleted,
      `${catches} catches / 15 dawns / 3 pits, ~${grossKcal} kcal gross (~${expectedCleaned} cleaned), wildlife depleted: ${depleted}`);
  }

  // ---- ATTACK 2: gill net never wears out ----
  {
    const s = fresh();
    s.inventory.push({ id: 'gill_net', name: 'Gill net' });
    // find water: force current tile type for the test
    Game.playerTile().type = 'creek';
    const ok = Game.setNet(); say();
    let fish = 0;
    for (let d = 0; d < 30 && !Game.over; d++) {
      keepAlive(s); Game.endDay(); say();
      for (const it of s.inventory) if (it && it.foodState === 'carcass' && it.name === 'fish (carcass)' && !it.counted) { it.counted = true; fish++; }
    }
    const netAlive = (Game.playerTile().nets || []).length > 0;
    attack('A2 gill net infinite', ok && fish > 0 && netAlive, `${fish} fish / 30 dawns, net still set (never breaks): ${netAlive}`);
  }

  // ---- ATTACK 3: setting traps costs zero time ----
  {
    const s = fresh();
    Game.learnRecipe('pit_trap', 3); Game.learnRecipe('snare', 3);
    craftOk('pit_trap'); craftOk('snare');
    const t0 = s.dayTicks || 0;
    Game.setTrap('pit_trap'); say();
    const afterPit = (s.dayTicks || 0) - t0;
    Game.setTrap('snare'); say();
    const afterSnare = (s.dayTicks || 0) - t0 - afterPit;
    attack('A3 trap-setting is free', afterPit === 0 && afterSnare === 0,
      `pit dig cost ${afterPit} ticks, snare set cost ${afterSnare} ticks (recipe says "labor to dig")`);
  }

  // ---- ATTACK 4: minnow trap on dry land ----
  {
    const s = fresh();
    Game.learnRecipe('minnow_trap', 3);
    Game.playerTile().type = 'forest_floor';
    const made = craftOk('minnow_trap');
    const set = made && Game.setTrap('minnow_trap');
    const msg = say();
    attack('A4 minnow trap on dry land', !!set, set ? `allowed on forest_floor: "${msg.slice(0, 80)}"` : 'refused');
  }

  // ---- ATTACK 5: dead scholar sets traps (setNet guards, setTrap does not) ----
  {
    const s = fresh();
    Game.learnRecipe('snare', 3);
    craftOk('snare');
    Game.over = true;
    const r = Game.setTrap('snare'); say();
    Game.over = false;
    attack('A5 trap-setting while dead', r !== null, r === null ? 'refused (guarded)' : 'allowed while over=true');
  }

  // ---- ATTACK 6: prey flees when approached (Steve's design rule) ----
  {
    const s = fresh();
    // stock a deer on the current tile's wildlife so the encounter is real
    const t = Game.playerTile();
    t.type = 'meadow'; t.wildlife = { white_tailed_deer: 3 };
    let spawned = null;
    for (let i = 0; i < 30 && !spawned; i++) { Game.checkAnimals(); if (s.animal) spawned = s.animal.id; }
    let fled = false, satStill = false;
    if (spawned) {
      const a = s.animal;
      a.mx = 4; a.my = 4; a.aware = 0; a.pstate = 'graze'; a.stamina = 3;
      // walk straight at it: 3 approach steps
      for (let step = 0; step < 6 && s.animal; step++) {
        s.mx = 4; s.my = 5; s.stalked = false; s.pSteps = 1;
        Game.animalTurn();
        if (!s.animal) { fled = true; break; }
        if (['bolt', 'flee'].includes(s.animal.pstate)) fled = true;
      }
      if (s.animal && s.animal.pstate === 'graze' && (s.animal.aware || 0) < 0.3) satStill = true;
      s.animal = null;
    }
    attack('A6 prey sits still when approached', satStill && !fled, spawned ? `spawned ${spawned}, fled=${fled}, satStill=${satStill}` : 'no encounter spawned');
  }

  console.log('\n== SUMMARY ==');
  const breaks = verdicts.filter(v => v[1]).length;
  console.log(`${breaks} BREAKS / ${verdicts.length} attacks`);
  process.exit(0);
})().catch(e => { console.error('ATTACK CRASH:', e); process.exit(2); });
