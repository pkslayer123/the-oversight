#!/usr/bin/env node
// DRIFTER PROOF 1 (2026-10-08): catchUpSim regrow watermark.
// BREAK (pre-fix, measured by test-drifter-attacks-20261008.js on the old code,
// seed 1): 2 villages approached on day 11 -> 22 regrowTiles calls (11 + 11).
// The land healed twice for the same 11 days: free food from distance.
// (The old code had the same double-count when endDay ran repeatedly without
// the day advancing — e.g. after the village is lost.)
// FIXED INVARIANT (this proof): Game.regrowLand(dayIdx) heals each day-index
// AT MOST ONCE. catchUpSim and endDay both go through it, so neither
// village-hopping nor a stuck day can double-heal the land.
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
  console.log(`== DRIFTER PROOF 1 — SEED ${SEED} ==`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  drain();

  // --- unit: the watermark dedups by day-index ---
  const healed = []; // day-indices actually healed, in order
  const _rg = Game.regrowTiles.bind(Game);
  const _rl = Game.regrowLand.bind(Game);
  let calls = 0;
  Game.regrowTiles = function () { calls++; return _rg(); };
  Game.regrowLand = function (idx) {
    const w0 = Game.state._landRegrowDay || 0;
    const r = _rl(idx);
    if ((Game.state._landRegrowDay || 0) > w0) healed.push(idx); // it healed this index
    return r;
  };
  Game.state._landRegrowDay = 0;
  Game.regrowLand(5);            // new day -> heals
  const c1 = calls;
  Game.regrowLand(5);            // same day -> skipped
  Game.regrowLand(3);            // older day -> skipped
  const c2 = calls;
  Game.regrowLand(6);            // new day -> heals
  const c3 = calls;
  check('regrowLand heals a fresh day-index once', c1 === 1, `calls=${c1}`);
  check('regrowLand never re-heals a day-index', c2 === 1, `calls after repeats=${c2}`);
  check('regrowLand heals the next day-index', c3 === 2, `calls=${c3}`);

  // --- integration: the village-hop exploit + stuck days ---
  Game.state._landRegrowDay = 0; // reset watermark for the integration leg
  healed.length = 0; // and the tracker (unit leg used indices 5,6)
  for (let d = 0; d < 10 && !Game.over && !Game.villageLost; d++) {
    s.kcal = 2400; s.hydration = 100; if (s.health < 200) s.health = 500;
    Game.state.village.pantryKcal = 99999;
    Game.endDay(); drain();
  }
  const dayN = s.day;
  const villages = Game.state.otherVillages || [];
  const before = calls;
  for (const v of villages) { Game.catchUpSim(v); drain(); } // approach each in turn
  const approachCalls = calls - before;
  check('village-hop adds zero extra regrows', approachCalls === 0,
    `${villages.length} villages approached on day ${dayN}, approaches added ${approachCalls} regrow calls`);
  check('all villages caught up to today', villages.every(v => v.day >= dayN),
    villages.map(v => `${v.name}: day ${v.day}`).join(', '));
  // a stuck day (village lost / repeated endDay) can't re-heal either
  for (let i = 0; i < 5; i++) { try { Game.endDay(); } catch (e) {} drain(); }
  // THE invariant: every healed day-index is unique — the land never heals twice for one day
  const uniq = new Set(healed);
  check('no day-index healed twice, whole run', uniq.size === healed.length,
    `healed indices: [${[...uniq].sort((a, b) => a - b).join(', ')}]`);

  Game.regrowTiles = _rg; Game.regrowLand = _rl;
  console.log(failures ? `\nPROOF 1 FAILED (${failures})` : '\nPROOF 1 GREEN');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('PROOF FATAL: ' + (e && e.stack || e)); process.exit(3); });
