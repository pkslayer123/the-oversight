#!/usr/bin/env node
// DRIFTER PROOF 2 (2026-10-08): blockage button labels vs engine costs.
// BREAK (pre-fix): app.js buttons said "🪓 Cut through (1 part, 60 kcal, +2 wood)"
// and "🧹 Clear rubble (1 part, 40 kcal)" — but clearBlockage spends
// tickAction(32): 32 ticks, a quarter of a 128-tick day-part. The label
// overstated the time cost 4x (the engine was cheaper than promised — still a lie).
// FIXED: labels now read "(a while, ...)" — the established UI idiom for
// 16–32 tick actions (cf. "Clear brush (a while)", "Rest (a while)").
// This proof asserts: (a) labels no longer claim "1 part"; (b) engine spends
// exactly 32 ticks and the labeled kcal on both blockage types.
// Deterministic: seeded mulberry32 BEFORE eval. Run on 3 seeds via SEED env.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const drain = () => { const l = Game.log || []; l.length = 0; };
let failures = 0;
const check = (name, cond, detail) => {
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

(async () => {
  await Game.init();
  console.log(`== DRIFTER PROOF 2 — SEED ${SEED} ==`);

  // (a) labels: the blockage card must not promise "1 part" anymore
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('cut-through label honest', !appSrc.includes('Cut through (1 part'),
    appSrc.includes('Cut through (a while') ? 'now reads "(a while, 60 kcal, +2 wood)"' : 'label text changed unexpectedly');
  check('clear-rubble label honest', !appSrc.includes('Clear rubble (1 part'),
    appSrc.includes('Clear rubble (a while') ? 'now reads "(a while, 40 kcal)"' : 'label text changed unexpectedly');

  // (b) engine: clearBlockage costs exactly 32 ticks + labeled kcal
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  Game.map.px = 5; Game.map.py = 5; s.mx = 4; s.my = 4;
  drain();
  const dest = Game.tileAt(6, 5);
  for (const [type, kcalCost] of [['fallen_tree', 60], ['rubble', 40]]) {
    dest.blockFrom = { dx: 0, dy: 0, type };
    s.kcal = 2400;
    const k0 = s.kcal, t0 = s.dayTicks || 0;
    Game.clearBlockage(6, 5); drain();
    const dKcal = k0 - s.kcal, dTicks = (s.dayTicks || 0) - t0;
    check(`${type}: 32 ticks`, dTicks === 32, `dayTicks +${dTicks}`);
    check(`${type}: ${kcalCost} kcal`, dKcal === kcalCost, `kcal -${dKcal}`);
    check(`${type}: blockage cleared`, !dest.blockFrom, '');
  }

  console.log(failures ? `\nPROOF 2 FAILED (${failures})` : '\nPROOF 2 GREEN');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('PROOF FATAL: ' + (e && e.stack || e)); process.exit(3); });
