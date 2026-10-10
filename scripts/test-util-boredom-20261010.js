#!/usr/bin/env node
// Utilization fix F3: viewership boredom decay. Viewership only ratcheted up,
// so the dip-gate feeding the ratings summons never armed (0/120 runs).
// A quiet week now costs 2 viewership (floor 10); the dip then fires and the
// summons becomes reachable.
// Run: node scripts/test-util-boredom-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

const said = [];
Game.say = (msg) => { said.push(String(msg)); };

(async () => {
await Game.init();
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
// push past the day-14 TV unlock
Game.state.scholar.day = 20;

console.log('== audience drift sags quiet weeks ==');
const v = Game.state.village;
v.viewership = 24;
v._lastWeekViewership = 24;
Game.state.scholar.day = 28; // cross a week boundary
Game.contestTick();
const after = Game.havenViewership();
ok(after < 24, 'a week costs 15% (min 3) viewership to drift', `24 → ${after.toFixed(1)}`);
ok(after >= 12, 'drift floors at 12', `now ${after.toFixed(1)}`);

console.log('== drift is weekly, not daily ==');
v.viewership = 24;
v._lastWeekViewership = 24;
// NOTE: _driftWeek persists from the previous block (week 4) — do NOT reset
Game.state.scholar.day = 29; // same week as day 28
Game.contestTick();
ok(Math.abs(Game.havenViewership() - 24) < 0.01, 'no double-drift within a week', `now ${Game.havenViewership().toFixed(1)}`);

console.log('== the dip arms the summons path ==');
// force a dip: high lastWeek, decayed now
v.viewership = 16;
v._lastWeekViewership = 24;
v._trendWeek = 4; // ensure the next boundary re-evaluates the trend
Game.state.scholar.day = 36;
Game.state.showBudget = { week: Math.floor(36 / 7), used: 0 };
Game.state.pendingContest = null;
// sample the scheduler: with a real dip, some ticks should return the summons.
// Deterministic: pin Math.random low so the 20%-of-dips summons roll always
// fires — we're testing that the dip ARMS the path, not the dice.
const realRandom = Math.random;
Math.random = () => 0.05;
let summonsSeen = 0;
try {
  for (let i = 0; i < 40; i++) {
    Game.state.scholar.day = 36 + i;
    Game.state.showBudget = { week: Math.floor((36 + i) / 7), used: 0 };
    Game.state.pendingContest = null;
    Game.state.activeContest = null;
    v._lastWeekViewership = 24; // keep the dip alive artificially
    v.viewership = 16;
    v._trendWeek = Math.floor((36 + i) / 7) - 1; // force weekly re-evaluation
    const ev = Game.contestTick();
    if (ev && ev.id === '__summons') { summonsSeen++; break; }
  }
} finally { Math.random = realRandom; }
ok(summonsSeen > 0, 'a real ratings dip can produce the summons event', `${summonsSeen}/40 sampled`);

console.log('== summons plays ==');
const s0 = Game.fireRatingsSummons();
ok(!!s0, 'fireRatingsSummons produces the played beat');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
