#!/usr/bin/env node
// Hunter adversarial 2026-10-10 (playtest loop, archetype 5: hunter).
// Attack: the trapline. Every run must break something or record why it held.
//   E1 (exploit): trap duplication — set must consume the tool; no verb may
//       return a set trap to the pack; the snare-wire shortcut must consume
//       the wire and leave no phantom tool.
//   E2 (exploit): a trap must never catch more than its `uses`; on the last
//       catch the trap breaks and leaves the tile.
//   E3 (exploit): gill net set must consume the net item.
//   S1 (softlock): your own pit at 1 HP must kill you honestly (named death
//       flow), never leave a 0-HP scholar wandering.
//   S2 (softlock): a trap on a far tile keeps checking while you travel.
//   S3 (softlock): a tile trap with an unknown recipeId (stale save) must not
//       crash the dawn check — checkTraps is the one endDay call with no
//       try/catch wrapper.
//   H1 (honesty): kill carcass gross == species calories exactly (no yield
//       inflation at the kill); cleaning yield capped 0.95.
// Run: node scripts/proof-hunter-trapline-20261010.js [SEED]
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

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || process.argv[2] || '0x7E41', 16);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('EVAL FAIL', f, e.message); process.exit(2); } }
delete global.window;
const Game = globalThis.Scattering.Game;
const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.sysSay = () => {};
Game.drama = () => {}; Game.audioEvent = () => {};

function withForcedRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}
function toolsOf(id) { return (Game.state.scholar.tools || []).filter(t => t.recipeId === id); }
function giveMaterials() {
  const s = Game.state.scholar;
  s.inventory.push({ itemId: 'vine_m', material: 'vine', units: 10, name: 'Vine', kg: 0.1 });
  s.inventory.push({ itemId: 'stick_m', material: 'stick', units: 10, name: 'Stick', kg: 0.1 });
}
function learnTrap(id, lvl) {
  Game.state.codex.recipes = Game.state.codex.recipes || {};
  Game.state.codex.recipes[id] = { level: lvl || 3 };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = () => Game.state.scholar;

  console.log('== E1. TRAP DUPLICATION ==');
  {
    learnTrap('snare'); giveMaterials();
    const before = toolsOf('snare').length;
    withForcedRandom(0.01, () => Game.craft('snare')); // 0.01: craft succeeds (85%)
    ok(toolsOf('snare').length === before + 1, 'craft stamps one snare tool');
    const tool = toolsOf('snare')[0];
    ok(tool.uses === 10, 'crafted snare has recipe uses (10)', 'uses=' + tool.uses);
    Game.map.px = 4; Game.map.py = 4; s().mx = 4; s().my = 4;
    const tile = Game.playerTile();
    tile.traps = [];
    Game.setTrap('snare');
    ok(toolsOf('snare').length === before, 'set consumes the tool from the pack');
    ok((tile.traps || []).filter(t => t.recipeId === 'snare').length === 1, 'exactly one tile trap lands');
    ok((tile.traps || [])[0].uses === 10, 'tile trap keeps the tool uses', 'uses=' + (tile.traps[0] || {}).uses);
    tile.traps = [];
  }
  {
    // snare-wire shortcut: wire in hand, no crafted snare
    s().inventory.push({ itemId: 'snare_wire', name: 'Snare wire', units: 1, kg: 0.05 });
    const wiresBefore = s().inventory.filter(i => i.itemId === 'snare_wire').reduce((t, i) => t + i.units, 0);
    const tile = Game.playerTile(); tile.traps = [];
    withForcedRandom(0.5, () => Game.setTrap('snare'));
    const wiresAfter = s().inventory.filter(i => i.itemId === 'snare_wire').reduce((t, i) => t + i.units, 0);
    ok(wiresAfter === wiresBefore - 1, 'wire shortcut consumes the wire', wiresBefore + '->' + wiresAfter);
    ok(toolsOf('snare').length === 0, 'wire shortcut leaves no phantom tool in the pack');
    const tt = (tile.traps || []).find(t => t.recipeId === 'snare');
    ok(!!tt && tt.uses === 2, 'wire snare is improvised (2 uses)', 'uses=' + (tt && tt.uses));
    tile.traps = [];
  }
  for (const fn of ['pickUpTrap', 'retrieveTrap', 'disarmTrap', 'liftTrap', 'takeUpTrap', 'collectTrap']) {
    ok(typeof Game[fn] === 'undefined', 'no ' + fn + ' verb exists (set traps stay set)');
  }

  console.log('== E2. USES HONORED — NO INFINITE CATCHES ==');
  {
    const tile = Game.tileAt(1, 1);
    tile.wildlife = { cottontail_rabbit: 50 };
    tile.traps = [{ recipeId: 'snare', mx: 4, my: 4, setDay: 1, uses: 3 }];
    let catches = 0;
    const inv0 = s().inventory.length;
    for (let d = 2; d <= 8; d++) {
      s().day = d;
      withForcedRandom(0, () => Game.checkTraps()); // 0: every catch roll succeeds
      catches = s().inventory.length - inv0;
    }
    ok(catches === 3, 'a 3-use snare catches exactly 3, then stops', 'catches=' + catches);
    ok(!(tile.traps || []).length, 'the spent trap breaks and leaves the tile');
    ok((tile.wildlife.cottontail_rabbit || 0) === 47, 'each catch removes one animal from the tile', 'left=' + (tile.wildlife.cottontail_rabbit || 0));
    tile.traps = [];
  }

  console.log('== E3. NET SET CONSUMES THE NET ==');
  {
    learnTrap('gill_net');
    s().inventory.push({ itemId: 'gill_net', name: 'Gill net', units: 2, kg: 0.5 });
    // find a water tile
    let wx = -1, wy = -1;
    outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const tt = Game.tileAt(x, y).type;
      if (tt === 'creek' || tt === 'wetland' || tt === 'pond') { wx = x; wy = y; break outer; }
    }
    if (wx >= 0) {
      Game.map.px = wx; Game.map.py = wy; s().mx = 4; s().my = 4;
      const netsBefore = s().inventory.filter(i => i.itemId === 'gill_net').reduce((t, i) => t + i.units, 0);
      withForcedRandom(0.5, () => Game.setNet());
      const netsAfter = s().inventory.filter(i => i.itemId === 'gill_net').reduce((t, i) => t + i.units, 0);
      ok(netsAfter === netsBefore - 1, 'setNet consumes one net', netsBefore + '->' + netsAfter);
      const nt = (Game.tileAt(wx, wy).nets || [])[0];
      ok(!!nt && nt.uses === 16, 'set net frays over 16 catches', 'uses=' + (nt && nt.uses));
      Game.tileAt(wx, wy).nets = [];
    } else { ok(false, 'water tile exists on the map'); }
  }

  console.log('== S1. OWN PIT AT 1 HP KILLS HONESTLY ==');
  {
    // put the pit on a reachable neighbor and walk onto it (creek crossings
    // refuse honestly — retry across travel targets until we actually move)
    let deathCause = null;
    const realDeath = Game.playerDeath;
    Game.playerDeath = function (cause) { deathCause = cause; s().health = 0; Game.over = true; return null; };
    const tgts = (Game.travelTargets() || []).filter(t => t.x >= 0 && t.x <= 8 && t.y >= 0 && t.y <= 8);
    let moved = false;
    for (const tg of tgts) {
      const ntt = Game.tileAt(tg.x, tg.y);
      ntt.traps = [{ recipeId: 'pit_trap', mx: 4, my: 4, setDay: 1, uses: 4 }];
      s().day = 5; s().health = 1;
      const px0 = Game.map.px, py0 = Game.map.py;
      try { withForcedRandom(0, () => Game.travelTo(tg.x, tg.y)); } catch (e) { console.log('  S1 travel threw: ' + e.message); }
      if (Game.map.px !== px0 || Game.map.py !== py0) { moved = true; break; }
      ntt.traps = [];
    }
    Game.playerDeath = realDeath;
    ok(moved, 'walked onto the pit tile');
    ok(deathCause === 'your own pit trap', 'pit death names its cause', String(deathCause));
    ok(!(s().health > 0 && !Game.over), 'no 0-HP scholar wandering (over=' + Game.over + ')');
    Game.playerTile().traps = [];
    Game.over = false; s().health = 100;
  }

  console.log('== S2. FAR TILE TRAP KEEPS CHECKING ==');
  {
    const far = Game.tileAt(0, 0);
    far.wildlife = { cottontail_rabbit: 30 };
    far.traps = [{ recipeId: 'snare', mx: 4, my: 4, setDay: 1, uses: 5 }];
    Game.map.px = 8; Game.map.py = 8; s().mx = 4; s().my = 4;
    s().day = 10;
    const inv0 = s().inventory.length;
    withForcedRandom(0, () => Game.checkTraps());
    ok(s().inventory.length > inv0, 'far trap caught while the player was across the map');
    far.traps = [];
  }

  console.log('== S3. UNKNOWN-RECIPE TRAP DOES NOT CRASH DAWN ==');
  {
    const tile = Game.tileAt(2, 2);
    tile.wildlife = { cottontail_rabbit: 10 };
    tile.traps = [{ recipeId: 'no_such_trap', mx: 4, my: 4, setDay: 1, uses: 5 }];
    s().day = 11;
    let threw = null;
    try { withForcedRandom(0.5, () => Game.checkTraps()); } catch (e) { threw = e; }
    ok(!threw, 'checkTraps survives a stale-recipe tile trap', threw && threw.message);
    tile.traps = [];
  }

  console.log('== H1. SPECIES-HONEST KILL GROSS; CAPPED CLEANING ==');
  {
    const deer = (Game.data.animals || []).find(a => a.id === 'white_tailed_deer');
    const carcass = Game.foodCarcass(deer, deer.calories, s().day, 'hunted');
    ok(carcass.hiddenKcal === deer.calories, 'kill carcass keeps species gross exactly', carcass.hiddenKcal + ' vs ' + deer.calories);
    const fracs = ['hunted', 'trapped', 'netted', 'fished'].map(h => Game.butcherYieldFrac(h));
    ok(fracs.every(f => f <= 0.95), 'cleaning yield capped at 0.95 in every path', fracs.join(','));
    ok(Game.butcherYieldFrac('hunted') >= 0.30, 'cleaning never pays below the blind floor');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed (seed 0x' + SEED.toString(16) + ')');
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
