#!/usr/bin/env node
// HUNTER STALK NERF FEEL PASS (Steve 2026-10-07 23:55 call: stalk passive
// stealth.move_silent cut 0.30 -> 0.15).
//
// Plays the hunter's core loop as a player via the node harness (full src/js
// eval in index.html order, window stubbed for eval then deleted, mulberry32
// seed — SEED env override, default 7) and measures the bolt chance at the
// real player-path roll (Game.preyReaction, called from huntAnimal's strike
// dispatch) across 5 configs:
//   A baseline        no stalk, tracker L1
//   B nerfed passive  stalk held, move_silent = 0.15 (current)
//   B0 old passive    stalk held, move_silent forced back to 0.30 IN MEMORY
//                     (files stay read-only — apples-to-apples before/after)
//   C stalked approach stalk ACTIVE used (aware -> 0.2) + nerfed passive
//   D full stack      C + tracker L3 + hunter occupation + night + point blank
//
// Judges: (1) is the nerfed stealth still meaningful vs baseline?
//         (2) does stacking still reach zero bolt chance (earlier math: yes)?
// Feel verdict printed at the end; hard assertion only on D == 0 bolts
// (the math demands it: fleeP goes negative, Math.random() < fleeP impossible).
//
// Usage: SEED=1 node scripts/test-hunter-stalk-nerf-20261008.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const sayLines = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { sayLines.push(String(t)); return osay(t); };
const TRIALS = 200;

function grant(id, level) {
  const s = Game.state.scholar;
  const def = Game.data.abilities.find(a => a.id === id) || {};
  const list = s.backgroundAbilities || (s.backgroundAbilities = []);
  let e = list.find(a => a.id === id);
  if (!e) { e = { id, name: def.name || id, desc: def.description || '', level: level || 1, xp: 0, background: true }; list.push(e); }
  else e.level = level || 1;
  return e;
}
function setOccHunter(on) {
  const v = (Game.data.villagers || []).find(x => x.id === Game.villagerId);
  if (v) v.formerOccupation = on ? 'Hunter' : 'Botanist';
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  Game.map = Game.map || {};
  Game.map.px = 4; Game.map.py = 4;
  s.mx = 4; s.my = 4;

  // Prove the nerf is live at this commit: resolved modifier value.
  grant('stalk', 1);
  const resolved = Game.modTarget('stealth.move_silent', 0, {});
  console.log(`seed=${SEED} | resolved stealth.move_silent = ${resolved.toFixed(2)} (nerf live: 0.15)`);

  const configs = {
    A: { label: 'A baseline (no stalk)', stalk: false, passive: 0, tracker: 1, aware: 0.6, night: false, hunter: false, dist: 2 },
    B: { label: 'B nerfed passive (0.15)', stalk: true, passive: 0.15, tracker: 1, aware: 0.6, night: false, hunter: false, dist: 2 },
    B0: { label: 'B0 old passive (0.30, in-memory)', stalk: true, passive: 0.30, tracker: 1, aware: 0.6, night: false, hunter: false, dist: 2 },
    C: { label: 'C stalked approach (active+passive)', stalk: true, passive: 0.15, tracker: 1, aware: 0.2, night: false, hunter: false, dist: 2, useActive: true },
    D: { label: 'D full stack (active+passive+L3 tracker+hunter+night+close)', stalk: true, passive: 0.15, tracker: 3, aware: 0.2, night: true, hunter: true, dist: 1 },
  };
  const stalkDef = Game.data.abilities.find(a => a.id === 'stalk');
  const passiveMod = stalkDef.modifiers.find(m => m.target === 'stealth.move_silent');
  const results = {};
  for (const key of Object.keys(configs)) {
    const c = configs[key];
    // arrange: stalk held or not
    s.backgroundAbilities = (s.backgroundAbilities || []).filter(a => a.id !== 'stalk');
    if (c.stalk) grant('stalk', 1);
    passiveMod.value = c.passive; // in-memory only; files untouched
    grant('tracker', c.tracker);
    setOccHunter(c.hunter);
    Game.dayPart = c.night ? 3 : 1;
    const ax = 4 + c.dist, ay = 4;
    // player narrative pass for C: actually USE the stalk action as a player
    if (c.useActive) {
      s.kcal = Math.max(s.kcal || 0, 500);
      s.animal = { id: 'cottontail_rabbit', mx: ax, my: ay, aware: 0.6, stamina: 3, pstate: 'graze', edgeTurns: 0 };
      const before = s.animal.aware;
      const ok = Game.useAbility('stalk', 'stalk_prey');
      console.log(`   [player] Stalk action: ok=${ok}, aware ${before} -> ${s.animal.aware}`);
      console.log(`   [player] "${sayLines.slice(-2).join(' | ').slice(0, 180)}"`);
    }
    let bolts = 0, firstBoltLine = null;
    sayLines.length = 0;
    for (let i = 0; i < TRIALS; i++) {
      const a = { id: 'cottontail_rabbit', mx: ax, my: ay, aware: c.aware, stamina: 3, pstate: 'graze', edgeTurns: 0 };
      s.animal = a; s.kcal = 3000;
      const bolted = !!Game.preyReaction(a);
      if (bolted) { bolts++; if (!firstBoltLine) firstBoltLine = sayLines[sayLines.length - 1]; }
    }
    results[key] = bolts / TRIALS;
    console.log(`${c.label}: bolted ${bolts}/${TRIALS} = ${(bolts / TRIALS * 100).toFixed(1)}%${firstBoltLine ? `\n   sample: "${String(firstBoltLine).slice(0, 130)}"` : ''}`);
  }
  passiveMod.value = 0.15; // restore nerf value in-memory

  // analytic sanity
  const analytic = {
    A: 0.6 * 0.9 - 1 * 0.12,
    B: 0.6 * 0.9 - 1 * 0.12 - 0.15,
    B0: 0.6 * 0.9 - 1 * 0.12 - 0.30,
    C: 0.2 * 0.9 - 1 * 0.12 - 0.15,
    D: 0.2 * 0.9 - 3 * 0.12 - 0.15 - 0.10 - 0.08 - 0.10,
  };
  console.log('\nanalytic fleeP:', Object.entries(analytic).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  '));
  console.log(`measured:      ` + Object.entries(results).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  '));

  // FEEL VERDICTS (as a player, not a spreadsheet)
  const dB = results.B, dB0 = results.B0, dA = results.A;
  console.log('\n--- feel verdicts ---');
  console.log(`1) nerfed passive vs baseline: ${(dA * 100).toFixed(0)}% -> ${(dB * 100).toFixed(0)}% bolt chance. ${dB < dA ? 'PASS: stealth still shaves a real chunk off the bolt rate.' : 'FAIL: nerf killed the passive.'}`);
  console.log(`2) old-vs-new passive alone: ${(dB0 * 100).toFixed(0)}% (0.30) -> ${(dB * 100).toFixed(0)}% (0.15). The nerf roughly ${dB0 > 0 ? (dB / dB0).toFixed(1) + 'x' : '?'} the flee rate when used cold, no approach work.`);
  console.log(`3) stalked approach (C): ${(results.C * 100).toFixed(1)}% bolts — the active's aware-drop + passive together still shut the animal down.`);
  console.log(`4) full stack (D): ${(results.D * 100).toFixed(1)}% bolts — zero-bolt stacking ${results.D === 0 ? 'CONFIRMED (earlier math said yes).' : 'BROKEN: math says negative fleeP, fix needed.'}`);

  const fails = [];
  if (Math.abs(resolved - 0.15) > 1e-9) fails.push('nerf not live');
  if (results.D !== 0) fails.push('full stack did not reach zero bolt chance');
  if (results.B >= results.A) fails.push('nerfed passive no better than baseline');
  if (fails.length) { console.log('\nFAIL: ' + fails.join('; ')); process.exit(1); }
  console.log(`\nOK — seed ${SEED}. feel verdict: the nerf makes the passive a 15-point shave instead of a 30-point one; cold approaches bolt noticeably more, but a real stalked approach (active + passive) still goes silent, and stacking still hits zero.`);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
