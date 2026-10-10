#!/usr/bin/env node
// Utilization fix F5: unapproached villages burn pantry daily (they eat too).
// Their inner lives were frozen (static pantry, tension → 0): 0/120 beg/raid
// answers, splinters nearly never. PROGRESSION.md §6: they run the same game.
// Run: node scripts/test-util-villages-live-20261010.js   (SEED env override)
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

const mkVillage = (id, pantry) => ({
  id, name: id, population: 10, pantryKcal: pantry,
  x: 6, y: 4, faces: null, inner: null, rumored: true, generated: false,
});
Game.state.otherVillages = [mkVillage('v_a', 20000)];

console.log('== pantries drain for the unapproached ==');
const v = Game.state.otherVillages[0];
const p0 = v.pantryKcal;
Game._vaSimInner(v);
ok(v.pantryKcal < p0, 'a lived day burns pantry (mouths eat)', `${p0} → ${v.pantryKcal}`);
ok(v.pantryKcal === p0 - 10 * 120, 'drain is pop × 120 kcal/day net', `-${p0 - v.pantryKcal}`);

console.log('== famine arrives for real ==');
// starve it fast: tiny pantry
v.pantryKcal = 100;
v.inner.famineDays = 0;
v.famine = null;
for (let d = 0; d < 5; d++) { Game.state.scholar.day++; Game._vaSimInner(v); }
ok(!!v.famine, 'empty pantry → famine (the existing machinery takes over)', JSON.stringify(v.famine && v.famine.since));
ok((v.inner.tension || 0) > 25, 'famine spikes tension', 'tension=' + Math.round(v.inner.tension || 0));

console.log('== beg/raid beats can stage ==');
// known village (rumored) + famine → _vaFamineAct may stage beg or raid
let staged = null;
for (let i = 0; i < 60 && !staged; i++) {
  Game.state.pendingBeg = null; Game.state.pendingRaidDefense = null;
  v.inner.begCooldownUntil = 0;
  Game._vaFamineAct(v);
  staged = Game.state.pendingBeg || Game.state.pendingRaidDefense;
}
ok(!!staged, 'a known starving village begs or raids (played beat)', staged ? (Game.state.pendingBeg ? 'beg' : 'raid') : 'none');
if (Game.state.pendingBeg) {
  const r = Game.answerBeg('give');
  ok(r !== null && r !== undefined, 'answerBeg resolves the beat');
  Game.state.pendingBeg = null;
}
if (Game.state.pendingRaidDefense) {
  const r = Game.answerRaidDefense('hold');
  ok(r !== null && r !== undefined, 'answerRaidDefense resolves the beat');
  Game.state.pendingRaidDefense = null;
}

console.log('== approached villages are not double-drained ==');
const v2 = mkVillage('v_b', 20000);
v2.generated = true; // the catch-up sim owns these
Game.state.otherVillages.push(v2);
const q0 = v2.pantryKcal;
Game._vaSimInner(v2);
ok(v2.pantryKcal === q0, 'generated villages hold (catch-up sim drains, not this tick)');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
