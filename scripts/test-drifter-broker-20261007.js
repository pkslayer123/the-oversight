#!/usr/bin/env node
// UNIT TEST (Steve 2026-10-07): the knowledge-broker leak is closed.
// Bug: identifyPlant while AWAY seeded home witnesses ("X was watching"),
// home plantRumors, and spreadPlantKnowledge let the ABSENT player teach home
// villagers by "word of mouth" — knowledge teleported home; the drifter's
// return taught nothing. Fix: witness/rumor gated on playerAtHaven();
// away-learned plants queue in scholar.awayLearned; spreadPlantKnowledge
// excludes the absent player as teacher/learner; returnToVillage fires the
// broker's teaching beat and seeds the rumor only then.
// Run: node scripts/test-drifter-broker-20261007.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };
const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) { if (SKIP.has(f)) continue; eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) pass++; else fail++;
  console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`);
};
const homeTaughtCount = (pid) => (Game.state.village.roster || []).filter(rid => ((Game.state.village.taught || {})[rid] || []).includes(pid)).length;

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const me = Game.villagerId;
  const homePx = Game.state.village.px ?? 4, homePy = Game.state.village.py ?? 4;

  // a plant NOBODY knows: not in my codex, not in anyone's taught[]
  const pid = (Game.data.plants || []).map(p => p.id)
    .find(id => !Game.state.codex.plants[id] && homeTaughtCount(id) === 0);
  check('test plant unknown to everyone', !!pid, pid);

  // go far away (no witnesses possible in the fiction)
  Game.map.px = homePx + 20; Game.map.py = homePy + 20;
  check('player is away', !Game.playerAtHaven());

  // learn it while away (as studyVillageCodex does via grantKnowledge)
  says.length = 0;
  const ok = Game.identifyPlant(pid, 'taught', 'Somewhere Else');
  const studySay = says.splice(0).map(String);
  check('identifyPlant succeeds while away', ok === true);
  check('player codex grew', Game.plantKnown(pid));
  check('no "was watching" line while away', !studySay.some(t => /was watching/i.test(t)),
    studySay.filter(t => /was watching/i.test(t)).length + ' lines');
  check('no home rumor seeded while away', !((Game.state.village.plantRumors || {})[pid]));
  check('plant queued in scholar.awayLearned', (Game.state.scholar.awayLearned || []).includes(pid));
  check('player taught[] has it (they learned it)', ((Game.state.village.taught || {})[me] || []).includes(pid));

  // word of mouth cannot cross twenty tiles: hammer the spread
  for (let i = 0; i < 60; i++) { try { Game.spreadPlantKnowledge(); } catch (e) {} }
  const afterSpread = homeTaughtCount(pid);
  check('absent player taught NOBODY via rumor-spread', afterSpread === 1, `${afterSpread}/12 taught (1 = me)`);

  // come home: the broker's beat fires, the rumor seeds, the queue drains
  Game.map.px = homePx; Game.map.py = homePy;
  says.length = 0;
  try { Game.returnToVillage(); } catch (e) { console.log('   !! returnToVillage threw: ' + e.message); }
  const retSay = says.splice(0).map(String);
  const beat = retSay.filter(t => /where you've been|what you learned out there/i.test(t));
  check('homecoming broker beat fired', beat.length > 0);
  for (const t of beat.slice(0, 1)) console.log(`   beat> ${String(t).slice(0, 200)}`);
  check('rumor seeded ON return', !!((Game.state.village.plantRumors || {})[pid]));
  check('awayLearned drained', (Game.state.scholar.awayLearned || []).length === 0);

  // now that the rumor is home, word of mouth legitimately spreads it
  for (let i = 0; i < 60; i++) { try { Game.spreadPlantKnowledge(); } catch (e) {} }
  const afterReturn = homeTaughtCount(pid);
  check('knowledge spreads AFTER the return', afterReturn > 1, `${afterReturn}/12 taught`);

  console.log(`\n   ${pass}/${pass + fail} passed (seed ${_seed})`);
  process.exit(fail ? 1 : 0);
})();
