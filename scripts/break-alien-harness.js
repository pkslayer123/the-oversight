// Shared harness for break-it alien-players tests (Steve 2026-10-08).
// Boots the FULL src/js/*.js list in index.html order (minus DOM-only
// app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js), with one shared
// resettable RNG installed BEFORE eval (modules capture Math.random at load).
// window stubbed for eval, deleted before playing (sync combat path).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = 20261008;
const RNG = {
  reset(s) { _seed = (s >>> 0) || 1; },
  next() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; },
};
Math.random = RNG.next.bind(RNG);

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});

global.window = global;
[
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js',
  'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
  'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
  'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;

const Game = globalThis.Scattering.Game;

let log = [];
const _say = Game.say.bind(Game), _sys = Game.sysSay.bind(Game);
Game.say = t => { log.push(['say', String(t)]); return _say(t); };
Game.sysSay = t => { log.push(['sys', String(t)]); return _sys(t); };
function sayText() { return log.filter(([k]) => k === 'say').map(([, t]) => t).join('\n'); }
function sysText() { return log.filter(([k]) => k === 'sys').map(([, t]) => t).join('\n'); }
function allText() { return log.map(([, t]) => t).join('\n'); }
function clearLog() { log = []; }

function fresh(day) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {}
  const s = Game.state.scholar;
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.hp = 100; s.maxHp = 100; s.kcal = 3000; s.trauma = 0;
  s.mx = 4; s.my = 4;
  Game.state.over = false;
  clearLog();
  return s;
}

module.exports = { Game, ROOT, RNG, fresh, sayText, sysText, allText, clearLog };

// Boot: data load is async (Game.init). Callers must `await boot()` once.
async function boot() {
  await Game.init();
  return { Game, RNG, fresh, sayText, sysText, allText, clearLog };
}
module.exports.boot = boot;
