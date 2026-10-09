#!/usr/bin/env node
// BREAK-IT contest engine #1 — DETERMINISM (Steve 2026-10-08).
//
// The engine's @ontology header claims: "deterministic: same villager +
// same contest = same fate. No hidden rolls."
//
// PRE-FIX this was false: roll() preferred Scattering.combat.roll
// (Math.random-backed), duelFight drew from a stateful module RNG, and
// fieldFight used Math.random captured at load. Consequences:
//   (a) hidden rolls existed inside "deterministic" resolutions;
//   (b) the save-scum vector was open — save before dawn, reload after a
//       bad fate, Math.random reseeds, the fate changes.
//
// POST-FIX: every top-level resolution reseeds a private stream from
// (day, contest id, participants, stat snapshot) via _cxSeed/_cxWithSeed;
// roll() bypasses combat.roll while _det is set; fieldFight draws from
// opts.rng. Reloading replays the identical fate.
//
// Harness: full-module list (minus DOM-only), window stub deleted before
// play, seeded RNG BEFORE eval (SEED env override). Exit non-zero on failure.
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
const pit = { id: 'pit', cat: 'blood', risk: 'high', name: 'The Pit' };
const duel = { id: 'duel', cat: 'blood', risk: 'high', name: 'Duel' };

function setHp(map) { Game.state.village.health = Object.assign({}, map); }
function snapState() {
  return JSON.stringify({
    health: Game.state.village.health,
    roster: Game.state.village.roster,
    fallen: Game.state.village.fallen,
  });
}
function restoreState(s) {
  const o = JSON.parse(s);
  Game.state.village.health = o.health;
  Game.state.village.roster = o.roster;
  Game.state.village.fallen = o.fallen;
}
const fateOf = r => r.outcome + '|' + r.detail;

// ---- A. NO HIDDEN ROLLS: combat.roll (Math.random-backed) must never fire
// during a resolution.
note('A. hidden rolls — combat.roll must not fire during resolution');
(function () {
  const combat = globalThis.Scattering.combat;
  const orig = combat.roll;
  let calls = 0;
  combat.roll = function (range) { calls++; return orig(range); };
  setHp({ [v1]: 100, [v2]: 100 });
  try { Game.contestResolveVillager(v1, pit, {}); } catch (e) {}
  try { Game.contestResolveGroup([v1, v2], duel, {}); } catch (e) {}
  combat.roll = orig;
  ok('pit + duel resolutions consult combat.roll 0 times', calls === 0, `calls=${calls}`);
})();

// ---- B. DETERMINISM: identical state -> identical fate (pit).
note('B. determinism — same villager + same contest + same state = same fate');
(function () {
  setHp({ [v1]: 100, [v2]: 100 });
  const s0 = snapState();
  const r1 = Game.contestResolveVillager(v1, pit, {});
  const hpAfter1 = JSON.stringify(Game.state.village.health);
  restoreState(s0);
  const r2 = Game.contestResolveVillager(v1, pit, {});
  const hpAfter2 = JSON.stringify(Game.state.village.health);
  ok('pit fate identical across identical states', fateOf(r1) === fateOf(r2),
    `${fateOf(r1)} vs ${fateOf(r2)}`);
  ok('pit hp aftermath identical', hpAfter1 === hpAfter2);
  restoreState(s0);
})();

// ---- C. DUEL determinism (initiative + damage were RNG before).
note('C. duel determinism');
(function () {
  setHp({ [v1]: 100, [v2]: 100 });
  const s0 = snapState();
  const d1 = Game.duelFight(v1, v2);
  restoreState(s0);
  const d2 = Game.duelFight(v1, v2);
  ok('duel outcome identical', d1.outcome === d2.outcome, `${d1.outcome} vs ${d2.outcome}`);
  ok('duel rounds identical', d1.rounds === d2.rounds, `${d1.rounds} vs ${d2.rounds}`);
  ok('duel damage identical', d1.aTaken === d2.aTaken && d1.bTaken === d2.bTaken);
  restoreState(s0);
})();

// ---- D. SAVE-SCUM CLOSED: fate must not depend on Math.random at all.
// Simulate "reload then re-resolve" by swapping Math.random for extremes.
note('D. save-scum closed — fate independent of Math.random');
(function () {
  const origRandom = Math.random;
  setHp({ [v1]: 100, [v2]: 100 });
  const s0 = snapState();
  Math.random = () => 0.999999;
  const rHi = Game.contestResolveVillager(v1, pit, {});
  restoreState(s0);
  Math.random = () => 0.000001;
  const rLo = Game.contestResolveVillager(v1, pit, {});
  Math.random = origRandom;
  ok('pit fate identical under extreme Math.random swings', fateOf(rHi) === fateOf(rLo),
    `${fateOf(rHi)} vs ${fateOf(rLo)}`);
  restoreState(s0);
})();

// ---- E. different states can still differ (determinism is not constant).
note('E. determinism is state-sensitive, not constant');
(function () {
  if (typeof Game._cxSeed !== 'function') {
    ok('seed API exists (post-fix determinism machinery)', false, 'Game._cxSeed missing');
    return;
  }
  setHp({ [v1]: 100, [v2]: 100 });
  const s0 = snapState();
  const seeds = new Set();
  for (let hp = 20; hp <= 100; hp += 20) {
    restoreState(s0);
    Game.state.village.health[v1] = hp;
    seeds.add(Game._cxSeed([v1], pit));
  }
  ok('seed varies with villager hp', seeds.size > 1, `distinct=${seeds.size}`);
  restoreState(s0);
})();

note(`\n${passN} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
})();
