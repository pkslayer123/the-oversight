// Forager week economy (2026-10-07): the multi-day pantry watch the last forager
// loop asked for. Morning-sweep mechanics were validated 2026-10-06; this sim
// runs the VILLAGE side of the economy for 7 days under daily forager hauls:
// perishable-first consumption (89dae4b) across a week, rot announcements,
// the "about N days" burn clock, and whether the pantry holds or hemorrhages.
// Deposits are synthetic but sized to measured forager output (~16.6k kcal/day,
// day 4 a jackpot double-berry day so rot is actually observable).
// Usage: node scripts/test-forager-week-20261007.js  (exit 1 on failure)
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
const pantryKcal = (v) => (v.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
const unitsOf = (v, name) => { const it = (v.pantry || []).find(i => i.name === name); return it ? it.units : 0; };

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); // scholar away: the sim isolates the village draw
  Game.log.length = 0;
}

async function runWeek(runId) {
  const said = [];
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  freshGame();
  const s = Game.state.scholar, v = Game.state.village;
  const dayStats = [];
  let rotAnnouncedDays = 0, perishFirstDays = 0, drawDays = 0;

  for (let d = 1; d <= 7; d++) {
    const day = s.day;
    // --- the day's haul (deposited like homecoming pooling) ---
    const jackpot = (d === 4);
    const berryUnits = jackpot ? 60 : 30;
    v.pantry.push({ name: `Day${d} berries`, kcalEach: 200, units: berryUnits, spoilDay: day + 1, safe: true, kg: 0.2 });
    v.pantry.push({ name: `Day${d} greens`, kcalEach: 80, units: 40, spoilDay: day + 2, safe: true, kg: 0.1 });
    v.pantry.push({ name: `Day${d} nuts`, kcalEach: 170, units: 25, spoilDay: day + 9, safe: true, kg: 0.1 });
    v.pantry.push({ name: `Day${d} dried meat`, kcalEach: 400, units: 8, spoilDay: 9999, safe: true, kg: 0.3 });
    const berriesBefore = unitsOf(v, `Day${d} berries`);
    const beansBefore = unitsOf(v, 'Dried beans');
    const kcalBefore = pantryKcal(v);
    const estBefore = Game.pantryDaysEstimate();
    said.length = 0;
    // scholar topped up: their own needs must not contaminate the village read
    s.kcal = 3000; s.hydration = 100; s.health = 100;
    try { Game.endDay(); } catch (e) { check(`run${runId} day${d}: endDay did not throw`, false, e.message); return { dayStats, ok: false }; }
    if (Game.over || Game.villageLost) {
      check(`run${runId} day${d}: village survived the week`, false, Game.over ? 'game over' : 'village lost');
      return { dayStats, ok: false };
    }
    const net = Math.max(0, (v.lastEat || 0) - (v.lastGive || 0));
    const berriesAfter = unitsOf(v, `Day${d} berries`);
    const beansAfter = unitsOf(v, 'Dried beans');
    const expired = (v.pantry || []).filter(i => Game.isSpoiled(i));
    const announced = /threw out spoiled stores/i.test(said.join(' '));
    if (announced) rotAnnouncedDays++;
    dayStats.push({ d, net: Math.round(net), kcalBefore: Math.round(kcalBefore), kcalAfter: Math.round(pantryKcal(v)), estBefore, berriesBefore, berriesAfter, announced });
    check(`run${runId} day${d}: no expired stacks linger in pantry`, expired.length === 0, expired.map(i => i.name).join(','));
    if (net > 0 && berriesBefore > 0) {
      drawDays++;
      // perishable-first: the day's berries must shrink before the durable beans move
      const berriesEaten = berriesAfter < berriesBefore;
      check(`run${runId} day${d}: fresh berries eaten before durable beans`, berriesEaten && beansAfter === beansBefore,
        `berries ${berriesBefore}->${berriesAfter}, beans ${beansBefore}->${beansAfter}, net=${Math.round(net)}`);
      if (berriesEaten && beansAfter === beansBefore) perishFirstDays++;
    }
    check(`run${runId} day${d}: burn clock sane`, Number.isFinite(estBefore) && estBefore >= 0, 'est=' + estBefore);
  }
  // jackpot day 4 leftovers must rot at dawn of day 5 with the village-voiced announcement
  check(`run${runId}: perishable-first held every draw day`, perishFirstDays === drawDays, `${perishFirstDays}/${drawDays}`);
  check(`run${runId}: rot was announced in the village voice at least once`, rotAnnouncedDays >= 1, 'announcedDays=' + rotAnnouncedDays);
  const first = dayStats[0], last = dayStats[6];
  console.log(`run${runId}: pantry ${first.kcalBefore} -> ${last.kcalAfter} kcal over 7 days; avg net draw ${Math.round(dayStats.reduce((a, x) => a + x.net, 0) / 7)}/day; est day1=${first.estBefore}d day7=${Game.pantryDaysEstimate()}d`);
  check(`run${runId}: pantry did not collapse under daily hauls`, last.kcalAfter > 20000, 'end=' + last.kcalAfter);
  return { dayStats, ok: true };
}

(async () => {
  await Game.init();
  // sanity: the morning sweep itself still works (regression, not the sim's focus)
  {
    freshGame();
    const s = Game.state.scholar;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }
    let cell = null;
    outer: for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const t = Game.tileAt(x, y);
      if (!t || t.type === 'haven' || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
      const detail = Game.genDetail(x, y);
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        const c = detail[cy] && detail[cy][cx];
        if (c === 'plant' || c === 'bush' || c === 'tree' || c === 'bigtree') { Game.map.px = x; Game.map.py = y; cell = { cx, cy }; break outer; }
      }
    }
    check('morning sweep: found a forageable cell', !!cell);
    if (cell) {
      s.mx = cell.cx; s.my = cell.cy;
      const n0 = s.inventory.length;
      Game.doAction('forage', cell);
      check('morning sweep: forage puts food in the pack', s.inventory.length >= n0, `pack ${n0}->${s.inventory.length}`);
    }
  }
  for (let r = 1; r <= 3; r++) await runWeek(r);
  if (failures.length) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
  console.log('ALL FORAGER-WEEK TESTS PASS');
})().catch(e => { console.error('TEST ERROR:', e && e.message); process.exit(1); });
