#!/usr/bin/env node
// PROOF TEST (hunter loop 2026-10-08): _stanceHint names telegraphed wave-2
// attacks instead of falling through to "something violent".
// BUG: m.telegraph is an OBJECT for telegraphed attacks ({attackName,
// turnsLeft, ...}); _stanceHint only checked string form, so read_stance /
// read_fight said "something violent" even with a live telegraph on a
// pattern-known monster — breaking the verbs' promise to reveal the next move.
// FIX: _stanceHint handles the object telegraph (names attack + beats out)
// and falls back to the learned codex pattern list when nothing is winding up.
// RNG: seeded mulberry32 (SEED env override).
// Run: node scripts/test-hunter-stance-hint-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js'];
_SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function clearSays() { says.splice(0); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function monster() { return Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive); }
function grant(id) {
  const s = Game.state.scholar; s.abilities = s.abilities || [];
  if (!s.abilities.find(a => a.id === id)) s.abilities.push({ id, name: id, desc: '', level: 2, xp: 0 });
}
function awaitPT(max = 30) { let n = 0; while (Game.inCombat() && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n < max) { Game.tbAfterPlayerAction(); n++; } }

(async () => {
await Game.init();
console.log('== test-hunter-stance-hint-20261008 | SEED ' + SEED + ' ==');
Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
Game.genRoster('Columbus, Ohio');
Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
Game.depart();
const s = Game.state.scholar;
s.health = 500; s.kcal = 2600; s.mx = 4; s.my = 4;
grant('game_sense'); grant('tracker');
Game.state.village.day = 13; Game.state.scholar.day = 13; Game.dayPart = 1;
clearSays();

Game.startCombat('review_drone');
const m = monster();
// Earn the pattern (fair test: the hunter has survived this one before).
Game.state.codex.monsters = Game.state.codex.monsters || {};
Game.state.codex.monsters.review_drone = { patterns: { 'Scored Assessment': 'fires in a straight line from itself' } };

// 1. No telegraph yet: hint names the LEARNED pattern, not "something violent".
m.telegraph = null;
const quiet = Game._stanceHint(m);
check('quiet hint names the learned pattern', /Scored Assessment/.test(quiet) && !/something violent/i.test(quiet), quiet);
check('quiet hint is honest that nothing is winding up', /Nothing's winding up yet/i.test(quiet), quiet);

// 2. Live telegraph object: hint names the attack AND the timing.
m.telegraph = { kind: 'squares', attackName: 'Scored Assessment', turnsLeft: 2, cells: [] };
const live = Game._stanceHint(m);
check('live-telegraph hint names the attack', /Scored Assessment/.test(live), live);
check('live-telegraph hint gives the timing', /2 beats/.test(live), live);
check('live-telegraph hint never says "something violent"', !/something violent/i.test(live), live);

// 3. read_stance end-to-end on the known path with a live telegraph.
clearSays();
Game.useAbility('game_sense', 'read_stance');
const said = says.join(' ');
check('read_stance (known, telegraph live) names the attack', /Scored Assessment/.test(said), said.slice(0, 140));
check('read_stance never says "something violent" on known path', !/something violent/i.test(said), said.slice(0, 140));

// 4. read_fight known path: no crash, names the move.
clearSays();
s.stanceReadFight = null;
try {
  // read_fight lives in the same impl map; call via useAbility if exposed, else direct
  Game.useAbility('tracker', 'track'); // sanity: unrelated verb still works
  const rf = Game._stanceHint(monster());
  check('read_fight hint source names the move', /Scored Assessment/.test(rf), rf);
} catch (e) { check('read_fight hint source does not throw', false, e.message); }

// 5. Unknown-pattern path unchanged: still honest, still refuses.
delete Game.state.codex.monsters.review_drone;
s.stanceReadFight = null;
clearSays();
Game.useAbility('game_sense', 'read_stance');
const unk = says.join(' ');
check('unknown pattern still refuses honestly', /don't know this one well enough/i.test(unk), unk.slice(0, 110));

console.log(`\n== ${pass} pass, ${fail} fail ==`);
process.exit(fail ? 1 : 0);
})();
