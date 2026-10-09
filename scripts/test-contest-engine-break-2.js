#!/usr/bin/env node
// BREAK-IT contest engine #2 — WRONG RESOLVER + DROPPED DAMAGE + CHEER GAP.
//
// CATCH 2 (live bug): contestResolveGroup had no blood branch — a
// watch-mode Pit/Gauntlet/Siege/Tithe (any non-duel blood contest) fell
// through to _cxOther's generic "making" resolution, so a PIT FIGHT
// resolved as a cookfight ("makes something the aliens have never felt").
// CATCH 3: the duel branch applied hurtVillager only on aWon/bWon — a
// fatal duel's survivor walked away unwounded, and 15-round double-yields
// left zero wounds despite the log recording strikes.
// CATCH 4: cheer (braveryBonus) never reached duelFight — duels are blood,
// and blood gets the cheer.
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
const v1 = roster[0], v2 = roster[1];
Game.state.village.health = Game.state.village.health || {};
const pit = { id: 'pit', cat: 'blood', risk: 'high', name: 'The Pit' };
const tithe = { id: 'tithe', cat: 'blood', risk: 'extreme', name: 'The Blood Tithe' };
const duelC = { id: 'duel', cat: 'blood', risk: 'high', name: 'Duel' };
const BLOOD_DETAILS = /killed the beast|survived all \d+ waves|fell on wave|driven off|bled \d+ measures|found wanting|no beast|fight failed/;

// ---- A. group pit (1 villager, the live watch-mode shape) resolves as a
// FIGHT, not a cookfight.
note('A. group blood resolves through real fights, not the cookfight fallback');
(function () {
  Game.state.village.health[v1] = 100;
  const r = Game.contestResolveGroup([v1], pit, {});
  const log = (r[v1].log || []).join(' ');
  ok('pit outcome present', !!r[v1] && ['won', 'lost', 'died'].includes(r[v1].outcome), JSON.stringify(r[v1] && r[v1].outcome));
  ok('pit detail is a fight detail', BLOOD_DETAILS.test(r[v1].detail || ''), r[v1].detail);
  ok('pit log has no cookfight fiction', !/makes something the aliens/.test(log), log.slice(0, 120));
})();

// ---- B. group tithe bleeds measures.
note('B. group tithe bleeds measures');
(function () {
  Game.state.village.health[v1] = 100;
  const r = Game.contestResolveGroup([v1], tithe, {});
  ok('tithe detail is a bleeding detail', /bled \d+ measures|found wanting/.test(r[v1].detail || ''), r[v1].detail);
  ok('tithe log has no cookfight fiction', !/makes something the aliens/.test((r[v1].log || []).join(' ')));
})();

// ---- C. duel death applies wounds to BOTH duelists (survivor is hurt too).
note('C. duel death wounds both duelists');
(function () {
  const orig = Game.duelFight;
  Game.duelFight = function () {
    return { outcome: 'aDied', aTaken: 100, bTaken: 25, rounds: 3, log: ['canned fatal duel'] };
  };
  Game.state.village.health[v1] = 100;
  Game.state.village.health[v2] = 100;
  const r = Game.contestResolveGroup([v1, v2], duelC, {});
  Game.duelFight = orig;
  ok('fatal duel reports died', r[v1].outcome === 'died', r[v1].outcome);
  ok('dead duelist took damage', (Game.state.village.health[v1] || 0) < 100,
    `hp=${Game.state.village.health[v1]}`);
  ok('survivor took damage too', Game.state.village.health[v2] === 75,
    `hp=${Game.state.village.health[v2]}`);
})();

// ---- D. double-yield applies wounds to both.
note('D. double-yield wounds both duelists');
(function () {
  const orig = Game.duelFight;
  Game.duelFight = function () {
    return { outcome: 'doubleYield', aTaken: 12, bTaken: 9, rounds: 15, log: ['canned double yield'] };
  };
  Game.state.village.health[v1] = 100;
  Game.state.village.health[v2] = 100;
  const r = Game.contestResolveGroup([v1, v2], duelC, {});
  Game.duelFight = orig;
  ok('double yield reports lost/lost', r[v1].outcome === 'lost' && r[v2].outcome === 'lost');
  ok('both took damage', Game.state.village.health[v1] === 88 && Game.state.village.health[v2] === 91,
    `${Game.state.village.health[v1]},${Game.state.village.health[v2]}`);
})();

// ---- E. single-participant duel: 'duel needs a partner', not cookfight.
note('E. lone duel is not a cookfight');
(function () {
  const r = Game.contestResolveGroup([v1], duelC, {});
  ok('lone duel loses honestly', r[v1].outcome === 'lost' && r[v1].detail === 'duel needs a partner',
    `${r[v1].outcome}/${r[v1].detail}`);
})();

// ---- F. cheer (braveryBonus) reaches duelFight.
note('F. cheer reaches the duel');
(function () {
  const orig = Game.duelFight;
  let seen = null;
  Game.duelFight = function (a, b, opts) {
    seen = (opts || {}).braveryBonus;
    return orig.call(Game, a, b, opts);
  };
  Game.state.village.health[v1] = 100;
  Game.state.village.health[v2] = 100;
  Game.contestResolveGroup([v1, v2], duelC, { braveryBonus: 15, cheerLift: 3 });
  Game.duelFight = orig;
  ok('duelFight received braveryBonus 15', seen === 15, `seen=${seen}`);
})();

note(`\n${passN} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
})();
