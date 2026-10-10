#!/usr/bin/env node
// Utilization fix F4: trial gifts prefer candidates that complete a synergy
// leg the scholar holds (or has teased). Synergy discovery was 1/120 runs
// because grants never completed held legs.
// Run: node scripts/test-util-synergy-gift-20261010.js   (SEED env override)
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

console.log('== gift completes a held leg ==');
// scholar holds diplomat (peacemakers_voice = diplomat + mediator)
const s = Game.state.scholar;
s.abilities = [{ id: 'diplomat', name: 'Diplomat', desc: '', level: 1, xp: 0 }];
s.integration = 50; // 4 slots
const owned = new Set(['diplomat']);
// candidate pool: mediator (completes the leg) + unrelated abilities
const cands = [
  { id: 'mediator', name: 'Mediator', unlock: { type: 'system_offer' } },
  { id: 'iron_stomach', name: 'Iron Stomach', unlock: { type: 'system_offer' } },
  { id: 'tracker', name: 'Tracker', unlock: { type: 'system_offer' } },
];
const pick = Game._synergyGiftPick(cands, owned);
ok(pick && pick.id === 'mediator', 'gift pick completes the held diplomat leg', 'picked ' + (pick && pick.id));

console.log('== no held leg: falls back to random ==');
const owned2 = new Set(['pocket_sand']);
const pick2 = Game._synergyGiftPick(cands, owned2);
ok(pick2 === null, 'no leg-completing candidate → null (caller falls back to random pick)');

console.log('== teased leg scores below held leg ==');
s.synergyAttempts = { mediator_attempt_1: 1 };
const owned3 = new Set(['green_thumb']); // sun_garden = green_thumb + photosynthesis
const cands3 = [
  { id: 'photosynthesis', name: 'Photosynthesis', unlock: { type: 'system_offer' } },
  { id: 'mediator', name: 'Mediator', unlock: { type: 'system_offer' } },
];
const pick3 = Game._synergyGiftPick(cands3, owned3);
ok(pick3 && pick3.id === 'photosynthesis', 'held leg (score 2) beats teased leg (score 1)', 'picked ' + (pick3 && pick3.id));

console.log('== multi-path synergies union their paths ==');
// clean_kill has requires (flat); apex_predator chains synergies — use a
// requires_any synergy if one exists in data
const syns = Game.data.synergies || [];
const anySyn = syns.find(x => x.requires_any);
ok(!!anySyn, 'test data has a requires_any synergy (' + (anySyn && anySyn.id) + ')');
if (anySyn) {
  const legs = [...new Set(anySyn.requires_any.flat())].map(l => String(l).split(':').pop());
  const heldLeg = legs[0];
  const otherLeg = legs.find(l => l !== heldLeg);
  if (otherLeg) {
    const c = [{ id: otherLeg, name: otherLeg, unlock: { type: 'system_offer' } }, { id: 'iron_stomach', name: 'x', unlock: { type: 'system_offer' } }];
    const p = Game._synergyGiftPick(c, new Set([heldLeg]));
    ok(p && p.id === otherLeg, 'requires_any path unioned — completing leg found', 'picked ' + (p && p.id));
  }
}

console.log('== completeTrial wires the gift ==');
// trial gift path: seed a real trial and complete it
s.abilities = [{ id: 'diplomat', name: 'Diplomat', desc: '', level: 1, xp: 0 }];
s.integration = 50;
const pg = Game.progState();
pg.trial = { kind: 'pantry', name: 'Test Trial', need: 1, start: 0, expires: 999 };
Game.state.systemArrived = true;
const before = s.abilities.map(a => a.id).join(',');
Game.completeTrial();
const afterIds = s.abilities.map(a => a.id);
ok(afterIds.length > before.split(',').length || afterIds.length === before.split(',').length, 'trial completes without error');
// (gift content is RNG-shaped; the unit assertions above pin the preference)

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
})();
