// Drifter fixes test: two bugs found in the 2026-10-05 drifter playtest loop.
// 1. System arrival atHaven check compared map.px/py against village.px/py,
//    which newGame never sets — so the "you were there, witness it together"
//    branch was dead code and every arrival got the "you were out" recap.
// 2. The village scattering ("Haven couldn't hold") re-announced and re-wiped
//    on every endDay after game over instead of firing once.
// Usage: node scripts/test-drifter-fixes.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
globalThis.Scattering.Game.progState = function () { const s = this.state.scholar; s.prog = s.prog || {}; s.prog.moments = s.prog || []; return s.prog; };
globalThis.Scattering.Game.recordMoment = function () {};
globalThis.Scattering.Game.broadcastLine = function () {};
eval(fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8'));
const Game = globalThis.Scattering.Game;

let rngState = 99 >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  rngState = 99 >>> 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 4000; s.health = 100; s.hydration = 100; s.exiled = false;
  return s;
}
function saidHas(sub) { return said.some(t => t.indexOf(sub) >= 0); }
function saidCount(sub) { return said.filter(t => t.indexOf(sub) >= 0).length; }

(async () => {
  await Game.init();

  // ---------- 1. System arrival: standing at Haven counts as being there ----------
  {
    const s = freshGame();
    s.day = 7;
    Game.map.px = 3; Game.map.py = 3; // standing at Haven
    // village.px/py unset, like a real newGame (and old saves)
    delete Game.state.village.px; delete Game.state.village.py;
    Game.state.systemArrived = false;
    Game.checkSystemArrival();
    ok('1a: arrival fires at day 7', !!Game.state.systemArrived);
    ok('1b: witness-together branch (not the away recap)', saidHas('The village gathers'));
    ok('1c: no pending "you were out" event', !s.pendingVillageEvent);
  }

  // ---------- 2. System arrival: away from Haven still gets the away path ----------
  {
    const s = freshGame();
    s.day = 7;
    Game.map.px = 0; Game.map.py = 0; // out in the wild
    Game.state.systemArrived = false;
    Game.checkSystemArrival();
    ok('2a: away path says you were not at Haven', saidHas("You're not at Haven"));
    ok('2b: pending village event queued for return', !!(s.pendingVillageEvent && s.pendingVillageEvent.id === 'system_arrival_discussion'));
    ok('2c: witness-together branch does NOT fire when away', !saidHas('The village gathers'));
  }

  // ---------- 3. Scattering fires exactly once, even if endDay keeps being called ----------
  {
    const s = freshGame();
    const v = Game.state.village;
    // deterministic starvation: no pantry income at all
    Game.stockPantry = function () {};
    v.pantry = [];
    for (let d = 0; d < 8; d++) {
      s.kcal = 4000; s.health = 100; s.hydration = 100; // player survives; the village doesn't
      try { Game.endDay(); } catch (e) {}
    }
    ok('3a: village scattered (game over)', Game.over === true && Game.villageLost === true);
    ok('3b: scattering announced exactly once', saidCount("couldn't hold") === 1);
    ok('3c: scattered flag set', v.scattered === true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
