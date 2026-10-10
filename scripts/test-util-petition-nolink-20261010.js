#!/usr/bin/env node
// Utilization fix F2: splinter breakaways petition at your fire WITHOUT a
// hierarchy link (the link gate was a dead prerequisite — 0/120 runs had
// links; PROGRESSION.md §10 has breakaways petitioning with no link mentioned).
// Run: node scripts/test-util-petition-nolink-20261010.js   (SEED env override)
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

// fabricate an UNLINKED other village
const v = {
  id: 'v_test_1', name: 'Testfire', population: 10, pantryKcal: 20000,
  x: 6, y: 4, faces: null, inner: null,
};
Game.state.otherVillages = Game.state.otherVillages || [];
Game.state.otherVillages.push(v);
let linked = null;
try { linked = Game.linkWith(v.id); } catch (e) {}
ok(!linked, 'test village starts unlinked (the organic condition)');

console.log('== splinter without link petitions ==');
said.length = 0;
const res = Game.fireSplinter(v.id, 'famine-flight');
ok(!!res, 'fireSplinter runs');
ok(res && res.petitioners && res.petitioners.length > 0, 'breakaways petition WITHOUT a link', (res && res.petitioners.length) + ' petitioners');
const pet = Game.state.pendingPetition;
ok(!!pet, 'pendingPetition is set (the played beat opens)');

console.log('== the beat plays: interview, moot, vote ==');
// make room: the village starts at cap 12/12, and a full house honestly
// refuses the moot ("every bed's full"). Drop two villagers first.
const vv = Game.state.village;
vv.roster = vv.roster.slice(0, 10);
ok(Game.petitionInterview(pet.id, 'why') === true, 'interview: why');
ok(Game.petitionInterview(pet.id, 'bring') === true, 'interview: bring');
const moot = Game.conductPetitionMoot(pet.id);
ok(!!(moot && moot.awaitingPlayerVote), 'moot convenes and turns to the player');
const roomBefore = (Game.state.village.roster || []).length;
said.length = 0;
const ans = Game.answerPetition(pet.id, 'accept');
const roomAfter = (Game.state.village.roster || []).length;
// the moot can honestly vote no (your one vote isn't a veto-proof) — either
// way the beat must RESOLVE aloud, never limbo
const admitted = roomAfter - roomBefore;
const turnedAway = said.some(s => /kinder to them than we were|turned away|walk/i.test(s));
ok(!Game.state.pendingPetition, 'petition resolved, not limboed');
ok(admitted > 0 || turnedAway, 'the vote lands: admitted as named villagers, or turned away aloud', `admitted=${admitted}`);

console.log('== hardline cause still does not petition ==');
const v2 = { id: 'v_test_2', name: 'Coldfire', population: 10, pantryKcal: 20000, x: 2, y: 4, faces: null, inner: null };
Game.state.otherVillages.push(v2);
said.length = 0;
const res2 = Game.fireSplinter(v2.id, 'hardline');
ok(!!res2, 'hardline splinter runs');
ok(!res2.petitioners.length, 'hardliners do not petition (unchanged)');
ok(!Game.state.pendingPetition, 'no petition opened for hardliners');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
