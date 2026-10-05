// Forager loop: the haven screen's "about N days" must run on the MEASURED
// net burn (villageEats), not the 12x2000 worst case — which told the forager
// their pantry was always ~2 days from empty even when the village covered 90%+
// of its own need. (2026-10-05: pantryDaysEstimate + burnHistory.)
// Usage: node scripts/test-pantry-days.js
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
Game.say = function (t) { return t; };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.village;
}

(async () => {
  await Game.init();

  // 1. fallback: no history yet -> old worst-case math (conservative day-1).
  {
    const v = freshGame();
    const pk = v.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    const est = Game.pantryDaysEstimate();
    const expected = Math.floor(pk / Math.max(1, (v.roster.length || 12) * 2000));
    ok('day-1 fallback = old worst-case', est === expected, `est=${est} expected=${expected}`);
  }

  // 2. after endDay, burnHistory records the measured net; estimate matches.
  {
    const v = freshGame();
    const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100;
    Game.endDay();
    ok('burnHistory recorded after endDay', Array.isArray(v.burnHistory) && v.burnHistory.length === 1,
      'burnHistory=' + JSON.stringify(v.burnHistory));
    const net = Math.max(0, (v.lastEat || 0) - (v.lastGive || 0));
    ok('burnHistory[0] equals measured net', v.burnHistory[0] === net, `hist=${v.burnHistory[0]} net=${net}`);
    const pk = v.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    const est = Game.pantryDaysEstimate();
    const expected = net > 0 ? Math.floor(pk / net) : 999;
    ok('estimate = pantry / measured burn', est === expected, `est=${est} expected=${expected} net=${net}`);
    console.log(`  measured net burn: ${Math.round(net)}/day -> pantry reads ~${est} days (old math would say ${Math.floor(pk / 24000)})`);
  }

  // 3. rolling window: 9 endDays -> history capped at 7.
  {
    const v = freshGame();
    const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100;
    for (let d = 0; d < 9 && !Game.over; d++) { s.kcal = 2400; s.hydration = 100; s.health = 100; Game.endDay(); }
    ok('burnHistory capped at 7', (v.burnHistory || []).length === 7, 'len=' + (v.burnHistory || []).length);
    const avg = v.burnHistory.reduce((a, b) => a + b, 0) / v.burnHistory.length;
    const pk = v.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    const expected = avg > 0 ? Math.floor(pk / avg) : 999;
    ok('estimate uses the 7-day average', Game.pantryDaysEstimate() === expected,
      `est=${Game.pantryDaysEstimate()} expected=${expected}`);
  }

  // 4. holding: village covers itself (net 0) -> 999 (UI renders "holding steady").
  {
    const v = freshGame();
    // make everyone wildly productive: no net draw possible
    for (const id of (v.roster || [])) {
      const p = Game.data.villagers.find(x => x.id === id) || Game.data.background_survivors.find(x => x.id === id);
      if (p) p.providesPerDay = 99999;
    }
    const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100;
    Game.endDay();
    const net = Math.max(0, (v.lastEat || 0) - (v.lastGive || 0));
    ok('forced surplus: net is 0', net === 0, 'net=' + net);
    ok('holding village reads 999', Game.pantryDaysEstimate() === 999, 'est=' + Game.pantryDaysEstimate());
  }

  // 5. the status object carries the honest estimate (what app.js renders).
  {
    freshGame();
    const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100;
    Game.endDay();
    const st = Game.status();
    ok('status.pantryDays matches estimator', st.pantryDays === Game.pantryDaysEstimate(),
      `status=${st.pantryDays} est=${Game.pantryDaysEstimate()}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e.message, e.stack && e.stack.split('\n')[1]); process.exit(1); });
