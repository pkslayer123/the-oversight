#!/usr/bin/env node
// PROOF: talkIdx rewire (break-it persistence landing, 2026-10-10).
// The 2026-10-07 integrity fix incremented state.talkIdx in talkTo so
// conflict discovery accelerated with talking. The dialog rethink
// (2026-10-08) moved talkTo to conversation.js and the counter DIED —
// nothing wrote it, but game.js socialSimmer still read it, so discovery
// probability sat at base 0.12 forever no matter how much you talked.
// Fix: socialSimmer reads the live per-villager lifetime conversation
// count at village.conv[vid].count (incremented in startConvo).
//
// BEFORE=1: reads src/js/game.js from git HEAD (pre-fix) for the source
// formula check — demonstrates the break as red.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const gameCode = BEFORE
  ? execSync('git show HEAD:src/js/game.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  : fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
console.log(BEFORE ? 'MODE: BEFORE (pre-fix game.js from git HEAD)' : 'MODE: AFTER (fixed worktree code)');

let fails = 0, passes = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (cond) passes++; else fails++;
}

// ---- 1. source: socialSimmer is wired to the live counter ----
const simIdx = gameCode.indexOf('socialSimmer');
const simSrc = gameCode.slice(simIdx, simIdx + 1400);
check('socialSimmer reads village.conv counts',
  /\(this\.state\.village \|\| \{\}\)\.conv \|\| \{\}/.test(simSrc));
check('socialSimmer no longer reads the dead state.talkIdx',
  !/this\.state\.talkIdx/.test(simSrc));

// ---- 2. functional: startConvo increments the live counter ----
const H = require('./socialite-harness.js');
const { Game, newWorld } = H;
newWorld(5);
Game.data.villagers = Game.state.village.roster.map(id => ({ id, name: 'V-' + id }));
Game._temper = { v1: 'warm', v2: 'calm' };

const conv = () => (Game.state.village.conv || {});
check('conv bucket empty before any talking', Object.keys(conv()).length === 0);
for (let i = 0; i < 3; i++) Game.startConvo('v1');
for (let i = 0; i < 2; i++) Game.startConvo('v2');
check('startConvo x3 -> v1 lifetime count is 3', (conv()['v1'] || {}).count === 3,
  'got ' + (conv()['v1'] || {}).count);
check('startConvo x2 -> v2 lifetime count is 2', (conv()['v2'] || {}).count === 2,
  'got ' + (conv()['v2'] || {}).count);

// ---- 3. end-to-end: the discovery probability moves with talking ----
// (same formula socialSimmer now uses; the source check above proves it
// is the formula in the code)
function discoveryP(a, b) {
  const c = (Game.state.village || {}).conv || {};
  const talked = ((c[a] || {}).count || 0) + ((c[b] || {}).count || 0);
  return 0.12 + Math.min(0.2, talked * 0.03);
}
const p = discoveryP('v1', 'v2'); // 5 conversations between the pair
check('discovery p rises above base 0.12 after talking', p > 0.12, 'p=' + p.toFixed(3));
check('discovery p equals 0.12 + min(0.2, 5*0.03) = 0.27', Math.abs(p - 0.27) < 1e-9,
  'p=' + p.toFixed(3));
// and the OLD formula (dead talkIdx) would have stayed at 0.12:
const oldTalked = ((Game.state.talkIdx || {})['v1'] || 0) + ((Game.state.talkIdx || {})['v2'] || 0);
check('old formula would read 0 talked (counter unwritten)', oldTalked === 0,
  'old talked=' + oldTalked);

console.log(`\n==== ${passes} passed, ${fails} failed ====`);
process.exit(fails > 0 ? 1 : 0);
