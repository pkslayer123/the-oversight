// test-drama-integration-levels-20261007.js (Steve 2026-10-07, Drama Round C3)
// Proof: integration levels have DISTINCT visual languages, not just scaling.
//   L1 LINKED:    clean, minimal, blue — observes
//   L2 ATTUNED:   richer, layered, cyan-gold — participates
//   L3 INTEGRATED: spectacular, white-gold — celebrates
// Covers:
//   1. abilityBurst: L1 one thin ring, L2 double ring + inner glow, L3 triple ring + sparkles + flash
//   2. hit: L1 standard starburst, L2 larger + secondary, L3 massive + shockwave ring
//   3. exclaim: L1 flat icon, L2 glow, L3 glow + 👁️
//   4. npcAlert: L1 flat, L2 glow, L3 glow + 👁️
//   5. systemCommentary: silent below L2, L2 cyan-gold, L3 white-gold + 👁️
//   6. Game.drama routes 'commentary' and injects integration into 'exclaim'/'commentary'
//   7. Day-7 gate still blocks all of it pre-arrival
// Node-only (no jest). Run: node scripts/test-drama-integration-levels-20261007.js
'use strict';

global.document = { getElementById: () => ({ id: 'drama-css' }) }; // truthy → CSS IIFE early return
global.window = global; // stub for game.js eval phase
global.requestAnimationFrame = (fn) => 0; // capture-only, never run animation
const fs = require('fs');
const path = require('path');
const repo = path.resolve(__dirname, '..');

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
// Neutralize flash/shake/floatText side channels so we can count them separately.
const flashes = [];
const origFlash = Drama.flash;
Drama.flash = function (color, duration) { flashes.push({ color, duration }); };
// Stub tileCenter to fixed coordinates (no DOM needed).
Drama.tileCenter = () => ({ x: 100, y: 100 });
const clear = () => { spawns.length = 0; flashes.length = 0; };

// ---------- T1: abilityBurst languages ----------
console.log('T1: abilityBurst — distinct per level');
{
  clear();
  Drama.abilityBurst(4, 4, '#ff5252', 1);
  const l1 = spawns.length;
  const l1html = spawns[0].html;
  const l1circles = (l1html.match(/<circle/g) || []).length;
  ok(l1 === 1, 'L1: exactly one spawn (single ring)');
  ok(l1circles === 1, 'L1: exactly one circle element');
  ok(l1html.includes('stroke-width="1.5"'), 'L1: thin stroke (1.5) — minimal');
  ok(flashes.length === 0, 'L1: no flash — quiet');

  clear();
  Drama.abilityBurst(4, 4, '#ff5252', 2);
  const l2 = spawns.length;
  const l2html = spawns[0].html;
  const l2circles = (l2html.match(/<circle/g) || []).length;
  ok(l2 === 1, 'L2: one spawn');
  ok(l2circles === 3, 'L2: double ring + inner glow (3 circles)');
  ok(l2html.includes('#ffd54a'), 'L2: gold inner ring — cyan-gold palette');
  ok(flashes.length === 0, 'L2: no flash yet');

  clear();
  Drama.abilityBurst(4, 4, '#ff5252', 3);
  const l3html = spawns[0].html;
  const l3circles = (l3html.match(/<circle/g) || []).length;
  ok(l3circles === 3, 'L3: triple ring (3 circles)');
  ok(l3html.includes('#ffffff'), 'L3: white outer ring — white-gold palette');
  ok(spawns.length === 1 + 6, 'L3: main ring + 6 prismatic sparkles');
  ok(flashes.length === 1, 'L3: System flash acknowledges');
}

// ---------- T2: hit languages ----------
console.log('T2: hit — distinct per level');
{
  clear();
  Drama.hit(4, 4, { color: '#ffd54a', integration: 1 });
  ok(spawns.length === 1, 'L1: one starburst spawn');
  ok(spawns[0].animClass === 'drama-hit', 'L1: starburst class');

  clear();
  Drama.hit(4, 4, { color: '#ffd54a', integration: 2 });
  ok(spawns.length === 2, 'L2: starburst + secondary burst');
  ok(spawns.every(s => s.animClass === 'drama-hit'), 'L2: both are bursts');

  clear();
  Drama.hit(4, 4, { color: '#ffd54a', integration: 3 });
  ok(spawns.length === 2, 'L3: starburst + shockwave');
  ok(spawns[0].animClass === 'drama-hit', 'L3: starburst first');
  ok(spawns[1].animClass === 'drama-shockwave', 'L3: shockwave ring second (distinct animation)');
  ok(spawns[1].html.includes('<circle'), 'L3: shockwave is an expanding ring, not a starburst');
}

// ---------- T3: exclaim languages ----------
console.log('T3: exclaim — distinct per level');
{
  clear();
  Drama.exclaim(4, 4, '!', { integration: 1 });
  const l1 = spawns[0].html;
  ok(!l1.includes('👁️'), 'L1: no System eye');
  ok(!l1.includes('0 0 14px') && !l1.includes('0 0 12px'), 'L1: no glow');

  clear();
  Drama.exclaim(4, 4, '!', { integration: 2 });
  const l2 = spawns[0].html;
  ok(!l2.includes('👁️'), 'L2: still no eye');
  ok(l2.includes('0 0 12px'), 'L2: subtle colored glow');

  clear();
  Drama.exclaim(4, 4, '!', { integration: 3 });
  const l3 = spawns[0].html;
  ok(l3.includes('👁️'), 'L3: tiny System eye beneath icon');
  ok(l3.includes('0 0 14px'), 'L3: stronger glow');
}

// ---------- T4: npcAlert languages ----------
console.log('T4: npcAlert — distinct per level');
{
  clear();
  Drama.npcAlert(4, 4, 'talk', { integration: 1 });
  const l1 = spawns[0].html;
  ok(!l1.includes('👁️'), 'L1 npcAlert: no eye, no glow');

  clear();
  Drama.npcAlert(4, 4, 'talk', { integration: 2 });
  ok(spawns[0].html.includes('0 0 10px'), 'L2 npcAlert: glow');

  clear();
  Drama.npcAlert(4, 4, 'talk', { integration: 3 });
  ok(spawns[0].html.includes('👁️'), 'L3 npcAlert: eye');
}

// ---------- T5: systemCommentary ----------
console.log('T5: systemCommentary — silent below L2, distinct at L2/L3');
{
  clear();
  Drama.systemCommentary('Noted.', { integration: 0 });
  ok(spawns.length === 0, 'L0: silent — System does not speak');

  clear();
  Drama.systemCommentary('Noted.', { integration: 1 });
  ok(spawns.length === 0, 'L1: silent — System only speaks once Attuned');

  clear();
  Drama.systemCommentary('The System notes the rain.', { integration: 2 });
  ok(spawns.length === 1, 'L2: renders');
  ok(spawns[0].html.includes('#9be8ff'), 'L2: cyan-gold text');
  ok(!spawns[0].html.includes('👁️'), 'L2: no eye prefix');
  ok(spawns[0].animClass === 'drama-commentary', 'L2: commentary animation class');

  clear();
  Drama.systemCommentary('The System notes the rain.', { integration: 3 });
  ok(spawns[0].html.includes('👁️'), 'L3: eye prefix');
  ok(spawns[0].html.includes('#fff3c4'), 'L3: white-gold color');
  ok(spawns[0].duration === 2600, 'L3: longer duration (2600ms vs 2000)');
}

// ---------- T6: Game.drama routing + injection ----------
console.log('T6: Game.drama routes commentary, injects integration');
{
  const calls = [];
  const origCommentary = Drama.systemCommentary;
  Drama.systemCommentary = function (text, opts) { calls.push({ text, opts: opts || {} }); };
  const g = Object.create(Game);
  g.say = () => {};
  g.audioEvent = () => {};
  g.systemIntegrationLevel = () => 2;
  g.state = { scholar: {}, systemArrived: true };
  g.map = { px: 4, py: 4 };
  g.data = {};

  g.drama('commentary', 'The System notes your haul.');
  ok(calls.length === 1, "Game.drama('commentary') routes to Drama.systemCommentary");
  ok(calls[0].opts.integration === 2, 'integration injected into commentary opts');

  const exCalls = [];
  const origExclaim = Drama.exclaim;
  Drama.exclaim = function (x, y, icon, opts) { exCalls.push({ x, y, icon, opts: opts || {} }); };
  g.drama('exclaim', 3, 4, '!', undefined);
  ok(exCalls.length === 1, "Game.drama('exclaim') routes");
  ok(exCalls[0].opts.integration === 2, 'integration injected into exclaim opts');
  Drama.systemCommentary = origCommentary;
  Drama.exclaim = origExclaim;
}

// ---------- T7: day-7 gate ----------
console.log('T7: day-7 gate blocks all new effects pre-arrival');
{
  clear();
  const g = Object.create(Game);
  g.say = () => {};
  g.audioEvent = () => {};
  g.systemIntegrationLevel = () => 3;
  g.state = { scholar: {}, systemArrived: false }; // pre-arrival
  g.map = { px: 4, py: 4 };
  g.data = {};
  g.drama('abilityBurst', 4, 4, '#ff5252');
  g.drama('hit', 4, 4, {});
  g.drama('exclaim', 4, 4, '!', {});
  g.drama('commentary', 'Should not render.');
  ok(spawns.length === 0 && flashes.length === 0, 'pre-arrival: zero drama — days 1–6 quiet');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
