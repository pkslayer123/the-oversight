// test-drama-village-20261007.js (Steve 2026-10-07, Drama Round D3)
// Proof: village-life rhythm ambience — dawn/dusk washes, harvest motes,
// celebration notes, mourning veil, argue crackle, play sparkles.
// Covers:
//   1. villageFlash dispatcher routes all 7 types; invalid specs safe
//   2. dawn/dusk washes use the right CSS classes; alpha scales with integration
//   3. harvestGlow mote count scales 3 -> 9; celebration notes 3 -> 6
//   4. mourning gray veil; alpha scales
//   5. villageArgue: polyline between two tiles; falls back to red pulse w/o coords
//   6. childPlay: mark count scales 2 -> 5; works without coords
//   7. Game.drama('village', spec) routes + injects integration
//   8. Day-7 gate blocks all village drama pre-arrival
//   9. ambientSocial wiring (behavioral): grief->mourn, argue->crackle,
//      cheer->celebrate, haul->harvest, laugh->play; silent when not present
//   10. Source-level: advancePart dusk, endDay dawn, newGame dawn,
//      conflictIncident argue wiring
// Node-only (no jest). Run: node scripts/test-drama-village-20261007.js
'use strict';

global.document = { getElementById: () => ({ id: 'drama-css' }) }; // truthy -> CSS IIFE early return
global.window = global; // stub for game.js eval phase
global.requestAnimationFrame = (fn) => 0; // capture-only, never run animation
global.setTimeout = (fn) => { fn(); return 0; }; // run staggered spawns immediately
const fs = require('fs');
const path = require('path');
const repo = process.env.D3_REPO || path.resolve(__dirname, '..');

eval(fs.readFileSync(path.join(repo, 'src/js/drama.js'), 'utf8'));
eval(fs.readFileSync(path.join(repo, 'src/js/game.js'), 'utf8'));
const Game = global.Scattering.Game;
const Drama = global.Scattering.Drama;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

// Capture every spawn call: html/css/class/duration.
const spawns = [];
Drama.spawn = function (html, css, animClass, duration) {
  spawns.push({ html, css, animClass, duration });
  return {};
};
const flashes = [];
Drama.flash = function (color, duration) { flashes.push({ color, duration }); };
// Stub tileCenter to deterministic coordinates (no DOM needed).
Drama.tileCenter = (x, y) => ({ x: x * 10, y: y * 10 });
const clear = () => { spawns.length = 0; flashes.length = 0; };

// ---------- T1: villageFlash dispatcher ----------
console.log('T1: villageFlash dispatcher');
{
  const types = ['dawn', 'dusk', 'harvest', 'celebrate', 'mourn'];
  for (const t of types) {
    clear();
    Drama.villageFlash({ type: t, integration: 1 });
    ok(spawns.length > 0, `type '${t}' renders`);
  }
  clear();
  Drama.villageFlash({ type: 'argue', x1: 3, y1: 4, x2: 5, y2: 6, integration: 1 });
  ok(spawns.some(s => s.animClass === 'drama-crackle'), "type 'argue' renders crackle");
  clear();
  Drama.villageFlash({ type: 'play', x: 4, y: 4, integration: 1 });
  ok(spawns.some(s => s.animClass === 'drama-playmote'), "type 'play' renders playmotes");
  clear();
  Drama.villageFlash(null);
  Drama.villageFlash({});
  Drama.villageFlash({ type: 'bogus' });
  ok(spawns.length === 0, 'invalid specs render nothing, no crash');
}

// ---------- T2: dawn/dusk washes ----------
console.log('T2: dawn/dusk washes');
{
  clear();
  Drama.dawnBreak(1);
  ok(spawns.length === 1 && spawns[0].animClass === 'drama-dawnwash', 'dawn: dawnwash class');
  ok(spawns[0].css.includes('255,205,130'), 'dawn: golden gradient');
  const l1css = spawns[0].css;
  clear();
  Drama.dawnBreak(3);
  ok(spawns[0].css !== l1css, 'dawn: L3 differs from L1 (richer alpha)');
  ok(spawns[0].duration > 1600, 'dawn: L3 lasts longer');

  clear();
  Drama.duskFall(1);
  ok(spawns.length === 1 && spawns[0].animClass === 'drama-duskwash', 'dusk: duskwash class');
  ok(spawns[0].css.includes('110,60,140'), 'dusk: purple in gradient');
  ok(spawns[0].css.includes('255,140,60'), 'dusk: orange in gradient');
}

// ---------- T3: harvestGlow scaling ----------
console.log('T3: harvestGlow mote scaling');
{
  clear();
  Drama.harvestGlow(1);
  const l1 = spawns.filter(s => s.animClass === 'drama-goldmote').length;
  clear();
  Drama.harvestGlow(3);
  const l3 = spawns.filter(s => s.animClass === 'drama-goldmote').length;
  ok(l1 === 5, `L1: 5 gold motes (got ${l1})`);
  ok(l3 === 9, `L3: 9 gold motes (got ${l3})`);
  ok(spawns.every(s => s.html.includes('\u2726')), 'motes are wheat-gold sparkle glyphs');
}

// ---------- T4: celebration scaling ----------
console.log('T4: celebration note scaling');
{
  clear();
  Drama.celebration(1);
  const l1 = spawns.filter(s => s.animClass === 'drama-celebrate').length;
  clear();
  Drama.celebration(3);
  const l3 = spawns.filter(s => s.animClass === 'drama-celebrate').length;
  ok(l1 === 4, `L1: 4 music notes (got ${l1})`);
  ok(l3 === 6, `L3: 6 music notes (got ${l3})`);
  ok(spawns.some(s => s.html.includes('\u266A') || s.html.includes('\u266B')), 'notes are music glyphs');
}

// ---------- T5: mourning ----------
console.log('T5: mourning veil');
{
  clear();
  Drama.mourning(1);
  ok(spawns.length === 1 && spawns[0].animClass === 'drama-mourn', 'mourn: mourn class');
  ok(spawns[0].css.includes('110,118,130'), 'mourn: gray gradient');
  const l1dur = spawns[0].duration;
  clear();
  Drama.mourning(3);
  ok(spawns[0].duration > l1dur, 'mourn: L3 lingers longer');
}

// ---------- T6: villageArgue ----------
console.log('T6: villageArgue');
{
  clear();
  Drama.villageArgue(3, 4, 5, 6, 1);
  ok(spawns.length === 1 && spawns[0].animClass === 'drama-crackle', 'argue: crackle class');
  ok(spawns[0].html.includes('<polyline'), 'argue: jagged bolt SVG');
  ok(spawns[0].html.includes('255,60,60'), 'argue: red bolt');
  clear();
  Drama.villageArgue(undefined, undefined, undefined, undefined, 1);
  ok(spawns.length === 0 && flashes.length === 1, 'argue w/o coords: falls back to soft red pulse');
  ok(flashes[0].color.includes('255,60,60'), 'fallback pulse is red');
}

// ---------- T7: childPlay ----------
console.log('T7: childPlay');
{
  clear();
  Drama.childPlay(4, 4, 1);
  const l1 = spawns.filter(s => s.animClass === 'drama-playmote').length;
  clear();
  Drama.childPlay(4, 4, 3);
  const l3 = spawns.filter(s => s.animClass === 'drama-playmote').length;
  ok(l1 === 3, `L1: 3 play marks (got ${l1})`);
  ok(l3 === 5, `L3: 5 play marks (got ${l3})`);
  clear();
  Drama.childPlay(undefined, undefined, 1);
  ok(spawns.length === 3, 'play w/o coords: still renders (screen-center fallback)');
  ok(spawns[0].css.includes('50%'), 'fallback positions at screen center');
}

// ---------- T8: Game.drama routing + injection ----------
console.log('T8: Game.drama routes village, injects integration');
{
  const calls = [];
  const orig = Drama.villageFlash;
  Drama.villageFlash = function (spec) { calls.push(spec); };
  const g = Object.create(Game);
  g.say = () => {};
  g.systemIntegrationLevel = () => 2;
  g.state = { scholar: {}, systemArrived: true };
  g.map = { px: 4, py: 4 };
  g.data = {};

  g.drama('village', { type: 'dawn' });
  ok(calls.length === 1, "Game.drama('village') routes to Drama.villageFlash");
  ok(calls[0].integration === 2, 'integration injected into village spec');
  ok(calls[0].type === 'dawn', 'spec type preserved');
  Drama.villageFlash = orig;
}

// ---------- T9: day-7 gate ----------
console.log('T9: day-7 gate blocks village drama pre-arrival');
{
  clear();
  const g = Object.create(Game);
  g.say = () => {};
  g.systemIntegrationLevel = () => 3;
  g.state = { scholar: {}, systemArrived: false };
  g.map = { px: 4, py: 4 };
  g.data = {};
  const types = ['dawn', 'dusk', 'harvest', 'celebrate', 'mourn', 'argue', 'play'];
  for (const t of types) g.drama('village', { type: t });
  ok(spawns.length === 0 && flashes.length === 0, 'zero village drama pre-System arrival');
  g.state.systemArrived = true;
  g.drama('village', { type: 'dawn' });
  ok(spawns.length === 1, 'post-arrival: dawn renders');
}

// ---------- T10: ambientSocial wiring (behavioral) ----------
console.log('T10: ambientSocial branch wiring');
{
  function makeGame(randSeq) {
    let ri = 0;
    const origRandom = Math.random;
    Math.random = () => (ri < randSeq.length ? randSeq[ri++] : 0);
    const g = Object.create(Game);
    const said = [];
    g.say = (s) => said.push(s);
    g.stockPantry = () => {};
    g.displayName = (id) => id.toUpperCase();
    g.npcTemper = () => 'bold';
    g.playerAtHaven = () => true;
    g.systemIntegrationLevel = () => 1;
    g.state = {
      scholar: {},
      systemArrived: true,
      village: {
        roster: ['p1', 'n1', 'n2'],
        positions: { n1: { mx: 3, my: 4 }, n2: { mx: 5, my: 6 } },
        grief: 0, cheer: 0,
      },
    };
    g.villagerId = 'p1';
    g.map = { px: 4, py: 4 };
    g.data = {};
    return { g, said, restore: () => { Math.random = origRandom; } };
  }

  // grief -> mourning
  {
    const { g, said, restore } = makeGame([0.0, 0.0, 0.5, 0.0, 0.0]);
    g.state.village.grief = 1;
    clear();
    g.ambientSocial(true);
    restore();
    ok(spawns.some(s => s.animClass === 'drama-mourn'), 'grief branch fires mourning veil');
    ok(said.length === 1, 'grief line still narrated');
  }
  // argue -> crackle between the two
  {
    const { g, restore } = makeGame([0.0, 0.0, 0.5, 0.1]);
    clear();
    g.ambientSocial(true);
    restore();
    ok(spawns.some(s => s.animClass === 'drama-crackle'), 'argue branch fires red crackle');
  }
  // cheer -> celebration
  {
    const { g, restore } = makeGame([0.0, 0.0, 0.5, 0.45]);
    g.state.village.cheer = 1;
    clear();
    g.ambientSocial(true);
    restore();
    ok(spawns.some(s => s.animClass === 'drama-celebrate'), 'cheer branch fires celebration notes');
  }
  // haul -> harvest glow
  {
    const { g, restore } = makeGame([0.0, 0.0, 0.5, 0.55]);
    clear();
    g.ambientSocial(true);
    restore();
    ok(spawns.some(s => s.animClass === 'drama-goldmote'), 'haul branch fires harvest motes');
  }
  // laugh line -> play sparkles
  {
    const { g, restore } = makeGame([0.0, 0.0, 0.5, 0.3, 0.0]);
    clear();
    g.ambientSocial(true);
    restore();
    ok(spawns.some(s => s.animClass === 'drama-playmote'), 'laugh line fires play sparkles');
  }
  // not present -> silent
  {
    const { g, said, restore } = makeGame([0.0, 0.0, 0.5, 0.0, 0.0]);
    g.state.village.grief = 1;
    g.playerAtHaven = () => false;
    clear();
    g.ambientSocial(); // isPresent undefined -> playerAtHaven() false
    restore();
    ok(spawns.length === 0, 'away from haven: no village drama');
    ok(said.length === 0, 'away from haven: no narration either');
  }
}

// ---------- T11: source-level wiring checks ----------
console.log('T11: source-level wiring');
{
  const gameSrc = fs.readFileSync(path.join(repo, 'src/js/game.js'), 'utf8');
  ok(gameSrc.includes("if (DAY_PARTS[this.dayPart] === 'dusk') this.drama('village', { type: 'dusk' })"),
    'advancePart: dusk wired');
  const dawnWires = (gameSrc.match(/this\.drama\('village', \{ type: 'dawn' \}\)/g) || []).length;
  ok(dawnWires === 2, `dawn wired in endDay + newGame (found ${dawnWires})`);
  const argueWires = (gameSrc.match(/type: 'argue', x1: pa\.mx, y1: pa\.my, x2: pb\.mx, y2: pb\.my/g) || []).length;
  ok(argueWires === 2, `argue wired in ambientSocial + conflictIncident (found ${argueWires})`);
  ok(gameSrc.includes("type: 'play', x: pa.mx, y: pa.my"), 'play wired to laugh line');
  ok(gameSrc.includes("type: 'celebrate'"), 'celebrate wired to cheer branch');
  ok(gameSrc.includes("type: 'harvest'"), 'harvest wired to haul branch');
  ok(gameSrc.includes("type: 'mourn'"), 'mourn wired to grief branch');
  const dramaSrc = fs.readFileSync(path.join(repo, 'src/js/drama.js'), 'utf8');
  for (const cls of ['drama-dawnwash', 'drama-duskwash', 'drama-goldmote', 'drama-celebrate', 'drama-mourn', 'drama-crackle', 'drama-playmote']) {
    ok(dramaSrc.includes('.' + cls), `CSS class .${cls} defined`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
