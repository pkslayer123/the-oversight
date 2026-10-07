// Regression: the player village's clock was frozen (forager loop 2026-10-07).
// village.day stayed 1 forever while scholar.day advanced. Two casualties:
//  1. villageEats' surplus merge stamped villagers' shared food spoilDay =
//     v.day+3 = 4 FOREVER — from day 4 on, fresh surplus was deposited already
//     spoiled and swept the same night (the exact bug 89dae4b's comment claims
//     it fixed: "villagers hauled food in and the village threw it out").
//  2. noteAbilityUse logged every ability use as day 1 — multi-day synergy
//     streaks could never complete.
// Fix: endDay syncs the player village's day to the scholar's day.
// Usage: node scripts/test-village-day-clock-20261007.js  (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};

(async () => {
  await Game.init();
  Game.say = () => {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0;
  const s = Game.state.scholar, v = Game.state.village;

  // force a deterministic surplus: one villager out-produces their need and is
  // trusted, so every endDay merges 'Foraged food' into the pantry.
  const providerId = v.roster.find(id => id !== Game.villagerId);
  const provider = Game.getPerson(providerId);
  provider.providesPerDay = 8000;
  v.trust = v.trust || {};
  v.trust[providerId] = 90;
  check('setup: provider forced into surplus', provider.providesPerDay === 8000);

  check('day 1: village clock starts synced', v.day === 1 && s.day === 1, `v.day=${v.day} s.day=${s.day}`);

  // ability-use log: day 1 use must log day 1
  Game.noteAbilityUse('test-ability', {});
  const log1 = s.abilityUseLog[s.abilityUseLog.length - 1];
  check('ability use on day 1 logs day 1', log1 && log1.day === 1, 'logged=' + (log1 && log1.day));

  for (let k = 1; k <= 4; k++) {
    s.kcal = 3000; s.hydration = 100; s.health = 100;
    Game.endDay();
    if (Game.over || Game.villageLost) { check('village survived 4 days', false, 'game ended'); break; }
    // k-th endDay: scholar.day is now k+1; the surplus merged during it was
    // deposited on day k and must carry a FRESH clock: spoilDay = k+3.
    check(`after endDay ${k}: village clock tracks scholar clock`, v.day === s.day, `v.day=${v.day} s.day=${s.day}`);
    const fresh = (v.pantry || []).find(i => i.name === 'Foraged food' && i.spoilDay === k + 3);
    check(`after endDay ${k}: fresh surplus carries a fresh clock (spoilDay ${k + 3})`,
      !!fresh, 'foraged-food spoilDays=' + (v.pantry || []).filter(i => i.name === 'Foraged food').map(i => i.spoilDay).join(','));
  }
  // ability-use log: day 5 use must log day 5, not day 1
  Game.noteAbilityUse('test-ability', {});
  const log2 = s.abilityUseLog[s.abilityUseLog.length - 1];
  check('ability use on day 5 logs day 5', log2 && log2.day === s.day, 'logged=' + (log2 && log2.day) + ' s.day=' + s.day);

  if (failures.length) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
  console.log('ALL VILLAGE-DAY-CLOCK TESTS PASS');
})().catch(e => { console.error('TEST ERROR:', e && e.message); process.exit(1); });
