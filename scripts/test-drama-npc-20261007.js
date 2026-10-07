// test-drama-npc-20261007.js (Steve 2026-10-07, Drama Round A1)
// Proof test for NPC attention drama wiring:
//   1. Game.drama routes 'npcAlert' to Drama.npcAlert with integration injected
//   2. systemArrived=false gates ALL drama (days 1-6 quiet)
//   3. bumpTrust crossing 50/75 upward fires 'heart' at the NPC's tile
//   4. bumpTrust crossing 50/25 downward fires 'break'
//   5. bumpTrust without a crossing fires nothing (no spam)
//   6. npcAlert icon/color mapping: talk(!) curious(?) dialogue(💬) warn(⚠️) heart(❤️) break(💔)
//   7. trust math unchanged: gain mult applies, real 0 stays 0
// Node-only (no jest). Run: node scripts/test-drama-npc-20261007.js
'use strict';

// --- load drama.js (needs a minimal document stub for its CSS-inject IIFE) ---
global.document = { getElementById: () => ({ id: 'drama-css' }) }; // truthy → early return
global.window = global; // stub for game.js eval phase (AGENTS.md: delete before "playing")
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

// Capture Drama.npcAlert calls (Game.drama grabs Scattering.Drama at call time).
const calls = [];
const origNpcAlert = Drama.npcAlert;
Drama.npcAlert = function (x, y, kind, opts) { calls.push({ x, y, kind, opts: opts || {} }); };

function makeGame() {
  const g = Object.create(Game);
  g.say = () => {};
  g.audioEvent = () => {};
  g.trustGainMult = (n) => n; // identity: deterministic thresholds
  g.playerAtHaven = () => true;
  g.systemIntegrationLevel = () => 2; // L2 for injection tests
  g.state = {
    scholar: { day: 8, mx: 4, my: 4 },
    systemArrived: true,
    village: {
      trust: {},
      positions: { v_alice: { mx: 3, my: 4 }, v_bob: { mx: 6, my: 2 } },
      roster: ['v_alice', 'v_bob'],
    },
  };
  g.map = { px: 4, py: 4 };
  g.data = {};
  return g;
}
const clear = () => { calls.length = 0; };

// ---------- T1: routing + integration injection ----------
console.log('T1: Game.drama routes npcAlert with integration injected');
{
  const g = makeGame(); clear();
  g.drama('npcAlert', 3, 4, 'talk');
  ok(calls.length === 1, 'one npcAlert call fired');
  ok(calls[0].x === 3 && calls[0].y === 4 && calls[0].kind === 'talk', 'args pass through (x, y, kind)');
  ok(calls[0].opts.integration === 2, 'integration injected into opts (L2)');
}

// ---------- T2: day-7 gate ----------
console.log('T2: systemArrived=false blocks all drama');
{
  const g = makeGame(); g.state.systemArrived = false; clear();
  g.drama('npcAlert', 3, 4, 'talk');
  g.drama('hit', 3, 4, { color: '#fff' });
  g.drama('hero', 'X', 'Y', '✨');
  ok(calls.length === 0, 'no drama fires before the System arrives');
}

// ---------- T3: heart on upward crossing ----------
console.log('T3: bumpTrust up through 50 fires heart at NPC tile');
{
  const g = makeGame(); g.state.village.trust = { v_alice: 45 }; clear();
  g.bumpTrust('v_alice', 10); // 45 → 55, crosses 50
  ok(g.state.village.trust.v_alice === 55, 'trust math unchanged (45+10=55)');
  ok(calls.length === 1, 'one alert fired');
  ok(calls[0].kind === 'heart' && calls[0].x === 3 && calls[0].y === 4, "heart at Alice's tile (3,4)");
}
{
  const g = makeGame(); g.state.village.trust = { v_bob: 70 }; clear();
  g.bumpTrust('v_bob', 10); // 70 → 80, crosses 75
  ok(calls.length === 1 && calls[0].kind === 'heart', 'crossing 75 upward also hearts');
}

// ---------- T4: break on downward crossing ----------
console.log('T4: bumpTrust down through 50/25 fires break');
{
  const g = makeGame(); g.state.village.trust = { v_alice: 55 }; clear();
  g.bumpTrust('v_alice', -10); // 55 → 45, crosses 50 downward
  ok(calls.length === 1 && calls[0].kind === 'break', 'break at downward 50 crossing');
}
{
  const g = makeGame(); g.state.village.trust = { v_bob: 30 }; clear();
  g.bumpTrust('v_bob', -10); // 30 → 20, crosses 25 downward
  ok(calls.length === 1 && calls[0].kind === 'break', 'break at downward 25 crossing');
}

// ---------- T5: no crossing → no alert ----------
console.log('T5: small trust moves fire nothing');
{
  const g = makeGame(); g.state.village.trust = { v_alice: 60 }; clear();
  g.bumpTrust('v_alice', 3); // 60 → 63, no crossing
  ok(calls.length === 0, 'no spam on non-crossing gain');
  g.bumpTrust('v_alice', -3); // 63 → 60, no crossing
  ok(calls.length === 0, 'no spam on non-crossing loss');
}
{
  // no position → no alert (NPC not on grid), but trust still moves
  const g = makeGame(); g.state.village.trust = { v_ghost: 45 }; clear();
  g.bumpTrust('v_ghost', 10); // 45 → 55 crosses 50, but no tile
  ok(g.state.village.trust.v_ghost === 55, 'trust still updates without a tile');
  ok(calls.length === 0, 'no alert when NPC has no grid position');
}
{
  // away from haven → no alert (you're not there to see it)
  const g = makeGame(); g.playerAtHaven = () => false;
  g.state.village.trust = { v_alice: 45 }; clear();
  g.bumpTrust('v_alice', 10);
  ok(calls.length === 0, 'no alert when player is away');
}

// ---------- T6: npcAlert icon/color mapping ----------
console.log('T6: npcAlert renders the right icon, color, size, duration');
{
  // stub DOM-touching helpers, call the REAL npcAlert
  Drama.tileCenter = () => ({ x: 100, y: 200 });
  let spawned = null;
  Drama.spawn = (html, css, cls, dur) => { spawned = { html, css, cls, dur }; };
  const fire = (kind, opts) => { spawned = null; origNpcAlert.call(Drama, 4, 4, kind, opts); return spawned; };
  const cases = [
    ['talk', '!', '#ff5252', 1500],
    ['curious', '?', '#ffd54a', 1500],
    ['dialogue', '💬', '#4df3ff', 1500],
    ['warn', '⚠️', '#ff9d45', 1500],
    ['heart', '❤️', '#ff6b9d', 2000],
    ['break', '💔', '#9e9e9e', 2000],
  ];
  for (const [kind, icon, color, dur] of cases) {
    const s = fire(kind, { integration: 2 });
    ok(s && s.html.includes(icon), `${kind} shows ${icon}`);
    ok(s && s.html.includes(color), `${kind} uses ${color}`);
    ok(s && s.html.includes('font-size:36px'), `${kind} scales to 36px at L2 (28+2*4)`);
    ok(s && s.dur === dur, `${kind} lasts ${dur}ms`);
    ok(s && s.cls === 'drama-exclaim', `${kind} uses the bob animation class`);
  }
  const s0 = fire('talk', { integration: 0 });
  ok(s0.html.includes('font-size:28px'), 'L0 renders at base 28px');
}

// ---------- T7: trust math preserved ----------
console.log('T7: bumpTrust math unchanged');
{
  const g = makeGame();
  g.trustGainMult = (n) => n * 2; // gains doubled
  g.state.village.trust = {};
  g.bumpTrust('v_alice', 5); // unset → 10, +10 gain
  ok(g.state.village.trust.v_alice === 20, 'gain mult applies to gains (10+5*2=20)');
  clear();
  g.bumpTrust('v_alice', -4); // losses NOT multiplied
  ok(g.state.village.trust.v_alice === 16, 'losses skip the mult (20-4=16)');
  g.state.village.trust.v_bob = 0; clear();
  g.bumpTrust('v_bob', 3); // real 0 must stay anchored at 0, not resurrect to 10
  ok(g.state.village.trust.v_bob === 6, 'real 0 stays 0-based (0+3*2=6), not resurrected to 10');
  g.bumpTrust('v_alice', -100);
  ok(g.state.village.trust.v_alice === 0, 'trust clamps at 0');
  g.bumpTrust('v_alice', 1000);
  ok(g.state.village.trust.v_alice === 100, 'trust clamps at 100');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
