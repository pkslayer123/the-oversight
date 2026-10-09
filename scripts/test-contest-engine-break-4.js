#!/usr/bin/env node
// BREAK-IT contest engine #4 — SIBLING SWEEP: stale "odds" copy.
//
// The e657deb engine replaced win-ODDS with real PERFORMANCE (bravery in
// blood, case-lift in moot), but three player-facing lines still promised
// the old odds model:
//   - sadistic rigging: "The odds just shifted." (now -12 bravery)
//   - fan favor: "(+8% — the people love you)" (now +8 bravery / +1.6 case)
//   - fan disfavor: "(-8% — the crowd wants blood)" (now -8 bravery)
//   - cheer feedback log: "cheer +5% win odds" (now cheer points)
// POST-FIX all four speak performance, never odds.
//
// Harness: full-module list (minus DOM-only), seeded RNG BEFORE eval
// (SEED env override). Exit non-zero on failure.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global;
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/fieldFights.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
await Game.init();
const note = t => console.log(t);
let passN = 0, failN = 0;
const ok = (name, cond, extra) => { if (cond) passN++; else { failN++; note(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); } };
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
Game.audio = new Proxy({}, { get: (t, name) => (d) => {} });
Game.audioEvent = function (n) {};

Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
Game.state.systemArrived = true;
Game.state.scholar.day = 20;
drain();

const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
const v1 = roster[0];

// Force alien-players eligibility + a sadistic persona the player hasn't met.
const origWave = Game.unlockedWave;
Game.unlockedWave = () => 2;
const ap = Game.apState();
ap.met = { rig1: { encounters: 3, bond: 0 } };
ap.favor = 0;
const origPersona = Game.apPersona;
Game.apPersona = () => ({ disposition: 'sadistic', name: 'Rig', taunts: ['Enjoy.'] });
const origKnows = Game.apKnowsAlien;
Game.apKnowsAlien = () => false;
const origRandom = Math.random;
Math.random = () => 0.1; // force the 35% rigging roll to fire

note('A. sadistic rigging note speaks performance, not odds');
(function () {
  drain();
  const r = Game.apContestInterference({ participants: [v1] }, {});
  const said = drain();
  ok('rigging fired', r.winMod === -0.12, `winMod=${r.winMod}`);
  ok('no "odds" in the rigging note', !/odds/i.test(said), said.slice(0, 140));
})();

note('B. fan favor notes speak performance, not +8%/-8%');
(function () {
  Game.apPersona = () => ({ disposition: 'earnest', name: 'Fan' });
  ap.met = {};
  ap.favor = 50;
  drain();
  const r1 = Game.apContestInterference({ participants: [v1] }, {});
  const said1 = drain();
  ok('favor fired', r1.winMod === 0.08, `winMod=${r1.winMod}`);
  ok('no "+8%" in favor note', !/\+8%/.test(said1), said1.slice(0, 140));
  ap.favor = -50;
  drain();
  const r2 = Game.apContestInterference({ participants: [v1] }, {});
  const said2 = drain();
  ok('disfavor fired', r2.winMod === -0.08, `winMod=${r2.winMod}`);
  ok('no "-8%" in disfavor note', !/-8%/.test(said2), said2.slice(0, 140));
})();

Math.random = origRandom;
Game.apPersona = origPersona;
Game.apKnowsAlien = origKnows;
Game.unlockedWave = origWave;

note('C. cheer feedback log speaks cheer, not win odds');
(function () {
  const src = read('src/js/contests.js');
  ok('no "% win odds" in cheer feedback', !/% win odds/.test(src));
})();

note(`\n${passN} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
})();
