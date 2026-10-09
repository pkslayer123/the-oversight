#!/usr/bin/env node
// BREAK-IT monsters run 5 (2026-10-09): world-layer fear dead-code proof.
// CATCH: monsterTurn() computed a `feared` flag from mdef.fear
// (fire/daylight/movement) that NO live branch could consume — the only
// reader needing it true was the lockpick_raccoon branch, but the raccoon's
// fear is 'dogs', which matched no condition (always false); the numbers
// branch required !feared. 9 fear:'fire' monsters (bulldozer, heron, radio,
// stag, understudy, heckler, paparazzo, nightcourt, nevermore), 'cats'
// (hummice), 'darkness' (moth, sunbasker, moderator), 'movement'
// (memory_projector) all fed a flag that did nothing. scholarNearCell existed
// solely for the dead fire check.
// FIX: deleted the dead conditions + the dead raccoon-fearful branch +
// scholarNearCell. Surviving: fear='numbers' caution (hushwolf, review_drone)
// and fear='loud noise' in tbPlayerShout (untouched).
// PROOF: (A) static — flag/branch/helper gone, live branches intact;
// (B) DIFFERENTIAL — the same seeded world-monster scenarios run against
// HEAD's game.js and the patched game.js must produce byte-identical
// stance + say output (deletion provably behavior-preserving).
// Usage:
//   git show HEAD:src/js/game.js > /tmp/game-head.js
//   node scripts/test-break-monsters5-fear.js --gamejs /tmp/game-head.js > /tmp/fear-head.json
//   node scripts/test-break-monsters5-fear.js > /tmp/fear-new.json
//   diff /tmp/fear-head.json /tmp/fear-new.json && echo IDENTICAL
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const gi = args.indexOf('--gamejs');
const GAMEJS = gi >= 0 ? path.resolve(ROOT, args[gi + 1]) : path.join(ROOT, 'src/js/game.js');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED); // BEFORE eval: modules capture it at load
global.window = global; // eval-time stub (equipment.js), deleted after
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'GAMEJS', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) {
  const src = f === 'GAMEJS' ? fs.readFileSync(GAMEJS, 'utf8') : fs.readFileSync(path.join(ROOT, f), 'utf8');
  eval(src);
}
delete global.window;

const out = { seed: SEED, static: [], scenarios: [] };
const ok = (name, cond) => out.static.push({ name, pass: !!cond });

(async () => {
  const gameJs = fs.readFileSync(GAMEJS, 'utf8');
  // ---- A. static: the dead computation is gone ----
  ok('no `feared` flag computation remains', !/let feared = false/.test(gameJs));
  ok('no fire-fear condition remains', !/fear === 'fire'/.test(gameJs));
  ok('no daylight-fear condition remains', !/fear === 'daylight'/.test(gameJs));
  ok('no movement-fear condition remains', !/fear === 'movement'/.test(gameJs));
  ok('scholarNearCell helper gone (only caller was the dead check)',
    !/scholarNearCell\(type, r\)/.test(gameJs) && !/this\.scholarNearCell\(/.test(gameJs));
  // ---- A. static: the live fear paths survive ----
  ok("fear='numbers' caution branch intact", /fear === 'numbers'/.test(gameJs));
  ok("tbPlayerShout reads fear='loud noise'", /'loud noise'/.test(gameJs));
  ok('lockpick bespoke steal-then-bolt flee intact', /runs for its life, empty-handed/.test(gameJs));
  ok('fearful stance still reachable via fled-monster recovery',
    /still running scared/.test(gameJs));

  // ---- B. differential scenarios ----
  const Game = globalThis.Scattering.Game;
  await Game.init();
  Game.genRoster('Breaker');
  Game.newGame('Breaker', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const sayLog = [];
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { sayLog.push(String(t)); return origSay(t); };

  const runScenario = (label, monId, setup) => {
    sayLog.length = 0;
    // clear world monsters
    Game.state.worldMonsters = [];
    const mdef = Game.data.monsters.find(m => m.id === monId);
    Game.map.px = 4; Game.map.py = 4;
    s.mx = 4; s.my = 4;
    Game.spawnWorldMonster(mdef, 4, 4, { mx: 1, my: 1, stance: 'stalk' });
    if (setup) setup();
    try { Game.monsterTurn(); } catch (e) { sayLog.push('THREW: ' + e.message); }
    const m = Game.worldMonsters()[0];
    out.scenarios.push({ label, stance: m ? m.stance : null, mx: m ? m.mx : null, my: m ? m.my : null,
      say: sayLog.join(' | ').slice(0, 600) });
  };

  // fire-adjacent detail grid: 'fire' within 2 of the scholar (the dead check's trigger)
  const fireGrid = () => {
    const g = [];
    for (let y = 0; y < 9; y++) { g.push([]); for (let x = 0; x < 9; x++) g[y].push('grass'); }
    g[4][5] = 'fire';
    return g;
  };
  const realGenDetail = Game.genDetail.bind(Game);

  // 1. bulldozer (fear:fire) next to a fire — the dead flag USED to be set here
  Game.genDetail = () => fireGrid();
  runScenario('bulldozer near fire', 'bulldozer');
  // 2. voice_mimic_radio (fear:fire) near fire
  runScenario('radio near fire', 'voice_mimic_radio');
  // 3. memory_projector (fear:movement) within 2 tiles
  runScenario('projector close', 'memory_projector');
  // 4. hushwolf (fear:numbers) with 2 villagers within 3 — the LIVE branch
  Game.genDetail = realGenDetail;
  runScenario('hushwolf + crowd', 'hushwolf', () => {
    const v = Game.state.village; v.positions = v.positions || {};
    const ids = Object.keys(v.roster || {}).slice(0, 2);
    ids.forEach((id, i) => { v.positions[id] = { mx: 3 + i, my: 3 }; });
    // roster may be an array; fall back to generated ids
    if (!ids.length) {
      v.positions = { v1: { mx: 3, my: 3 }, v2: { mx: 5, my: 3 } };
    }
  });
  // 5. lockpick_raccoon (fear:dogs) — the dead raccoon branch's species
  runScenario('raccoon', 'lockpick_raccoon');
  // 6. bright_idea (fear:daylight) at night
  Game.dayPart = 3;
  runScenario('bright_idea at night', 'bright_idea');
  Game.dayPart = 1;

  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
