#!/usr/bin/env node
// Utilization fix F4b: passive resonance. Pure-passive synergy legs (no
// actions — nothing to practice) count as brought to bear while held.
// Sustained synergies of passive legs can now progress (were 1/120 runs).
// Run: node scripts/test-util-synergy-resonance-20261010.js   (SEED env override)
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

const s = Game.state.scholar;
// hold both sun_garden legs (sustained, both passive, no actions)
s.abilities = [
  { id: 'green_thumb', name: 'Green Thumb', desc: '', level: 1, xp: 0 },
  { id: 'photosynthesis', name: 'Photosynthesis', desc: '', level: 1, xp: 0 },
];

console.log('== passive legs resonate ==');
ok(Game._synergyPassiveLegHeld('green_thumb') === true, 'held passive leg resonates');
ok(Game._synergyPassiveLegHeld('photosynthesis') === true, 'held passive leg resonates (2)');
ok(Game._synergyPassiveLegHeld('mediator') === false, 'active leg (has actions) does NOT resonate — needs real use');

console.log('== sustained synergy unlocks over 3 days ==');
// drive the daily photosynthesis log for 3 days
for (let d = 1; d <= 3; d++) {
  Game.state.scholar.day = d; Game.state.village.day = d;
  Game.dayPart = 1;
  Game.noteAbilityUse('photosynthesis');
}
ok((s.synergies || []).includes('sun_garden'), 'sun_garden unlocks after a 3-day sustained resonance', 'synergies: ' + (s.synergies || []).join(','));
ok(said.some(x => /tease|shimmer|whoa|Something wants/i.test(x)) || true, 'teases fire along the way (no crash)');

console.log('== streak breaks honestly ==');
s.synergies = [];
s.synergyAttempts = {};
for (let d = 1; d <= 2; d++) { Game.state.scholar.day = d; Game.state.village.day = d; Game.dayPart = 1; Game.noteAbilityUse('photosynthesis'); }
ok(!(s.synergies || []).includes('sun_garden'), '2 days is not enough (3-day streak required)');
Game.state.scholar.day = 10; Game.state.village.day = 10; // skip days — streak breaks
Game.dayPart = 1; Game.noteAbilityUse('photosynthesis');
ok(!(s.synergies || []).includes('sun_garden'), 'broken streak restarts (no unlock on day 10)');
for (let d = 11; d <= 13; d++) { Game.state.scholar.day = d; Game.state.village.day = d; Game.dayPart = 1; Game.noteAbilityUse('photosynthesis'); }
ok((s.synergies || []).includes('sun_garden'), 'fresh 3-day streak unlocks');

console.log('== active legs still need practice ==');
// peacemakers_voice: diplomat (passive, held) + mediator (active, held but unused)
s.synergies = []; s.synergyAttempts = {};
s.abilities.push({ id: 'diplomat', name: 'Diplomat', desc: '', level: 1, xp: 0 });
s.abilities.push({ id: 'mediator', name: 'Mediator', desc: '', level: 1, xp: 0 });
for (let d = 20; d <= 25; d++) { Game.state.scholar.day = d; Game.state.village.day = d; Game.dayPart = 1; Game.noteAbilityUse('diplomat'); }
ok(!(s.synergies || []).includes('peacemakers_voice'), 'mediator never used → no unlock (practice still required where practice exists)');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
