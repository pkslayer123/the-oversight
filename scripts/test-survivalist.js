// Survivalist 7-day water economy sim (rewritten 2026-10-06 — the old version
// never advanced the clock: it foraged at haven, counted phantom gains, and
// slept at dawn. This one plays for real).
// Usage: node scripts/test-survivalist.js
// Plays 7 real days: drink, fill from the well, forage real tiles, cook,
// sleep (real Game.sleep path). Tracks the cistern across the week:
// player drain vs water-duty refill. Asserts the day actually advances.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const s = () => Game.state.scholar;
const v = () => Game.state.village;
const failures = [];
function ok(cond, label) {
  console.log((cond ? '  PASS ' : '  FAIL ') + label);
  if (!cond) failures.push(label);
}
const wellClean = () => Math.floor((v().water || {}).clean || 0);
const bottles = () => (s().water || []).length;
function goHome() {
  // walk home tile-by-tile; single travel is range-3
  // (9x9: haven sits at the 4,4 center — ?? 4, not the old ?? 3)
  const hx = v().px ?? 4, hy = v().py ?? 4;
  for (let hop = 0; hop < 10; hop++) {
    Game.travelTo(hx, hy);
    if (Game.playerTile().type === 'haven') return true;
    let best = null, bd = 99;
    for (const t of Game.travelTargets()) {
      const d = Math.abs(t.x - hx) + Math.abs(t.y - hy);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    const px0 = Game.map.px, py0 = Game.map.py;
    Game.travelTo(best.x, best.y);
    if (Game.map.px === px0 && Game.map.py === py0) break;
  }
  return Game.playerTile().type === 'haven';
}
function sleepNight() {
  for (let a = 0; a < 3; a++) {
    const d0 = s().day;
    Game.sleep();
    if (s().day > d0) return true;
    if (Game.over) return false;
  }
  return false;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  s().kcal = 2600;

  // put a villager on water duty — the cistern's only refill.
  // (Sim setup: grant the trust delegation requires; earning it is the
  // socialite's beat, not this sim's.)
  const helper = v().roster.find(id => id !== Game.villagerId);
  if (helper) {
    v().trust = v().trust || {};
    v().trust[helper] = 50;
    Game.assignTask(helper, 'water');
    console.log(`water duty: ${Game.displayName(helper)} (trust granted for sim)`);
  }

  // seed raw beans to exercise the cook path (needs water)
  s().inventory.push({ name: 'Raw beans', kcalEach: 0, units: 5, kg: 0.1, unit: 'handful', rawKcal: 300, cookedKcal: 600, needsCooking: true, safe: false, spoilDay: 30 });

  const rows = [];
  let daysAdvanced = 0;
  for (let day = 1; day <= 7; day++) {
    // water duty is one-shot per part — reassign daily (the leader's upkeep)
    if (helper) Game.assignTask(helper, 'water');
    const w0 = wellClean();
    // morning: drink up, fill bottles from the well
    let drank = 0;
    while (s().hydration < 90 && bottles() > 0 && drank++ < 10) Game.drinkWater();
    let fills = 0;
    while (bottles() < 4 && fills++ < 6) Game.fillWater();
    const w1 = wellClean();
    // cook beans once (day 1)
    let cooked = '';
    if (day === 1 && Game.nearFire()) {
      const wb = wellClean();
      Game.cookAll();
      cooked = `cooked(-${wb - wellClean()}L well)`;
    }
    // work the day on a real tile — try candidates in value order until
    // one is actually reachable (blockages are directional)
    const cands = Game.travelTargets()
      .filter(t => !['haven', 'ruin'].includes(Game.tileAt(t.x, t.y).type))
      .sort((a, b) => ((Game.tileAt(b.x, b.y).stock || 0) / (b.d + 1)) - ((Game.tileAt(a.x, a.y).stock || 0) / (a.d + 1)));
    let best = null;
    for (const c of cands) {
      Game.travelTo(c.x, c.y);
      if (Game.map.px === c.x && Game.map.py === c.y) { best = c; break; }
    }
    let foraged = 0;
    if (best) {
      for (let i = 0; i < 6; i++) {
        const before = s().inventory.length;
        try { Game.doAction('forage'); } catch (e) { break; }
        if (s().inventory.length > before) foraged++; // REAL gains only
      }
    }
    if (s().kcal < 1500) Game.eat();
    // burn the rest of the day deterministically (rest always ticks)
    let rg = 0;
    while ((s().dayTicks || 0) < 300 && rg++ < 8 && !Game.over) {
      if (s().kcal < 200) Game.eat();
      try { Game.doAction('rest'); } catch (e) { break; }
    }
    // home + sleep (real path)
    goHome();
    const d0 = s().day;
    const slept = sleepNight();
    if (slept && s().day === d0 + 1) daysAdvanced++;
    const w2 = wellClean();
    rows.push({ day, w0, w1, w2, foraged, drank, cooked, hyd: Math.round(s().hydration), kcal: Math.round(s().kcal) });
    if (Game.over) { console.log('GAME OVER on day', day); break; }
  }

  console.log('\n7-DAY WATER ECONOMY (real clock, real sleep)');
  console.log('day | well morn | well fill | well eod | foraged | drank | hyd | kcal | note');
  for (const r of rows) console.log(`${r.day} | ${r.w0}L | ${r.w1}L | ${r.w2}L | ${r.foraged} | ${r.drank} | ${r.hyd} | ${r.kcal} | ${r.cooked}`);
  ok(daysAdvanced === 7, `all 7 days actually advanced (got ${daysAdvanced})`);
  ok(rows.every(r => r.w2 >= 0), 'well never went negative');
  // duty resolves at part boundaries during the day: eod well > post-fill morning well
  const refilled = rows.some(r => r.w2 > r.w1);
  ok(refilled, 'water duty refilled the cistern during the day (eod > post-fill)');
  const totalForaged = rows.reduce((t, r) => t + r.foraged, 0);
  console.log(totalForaged > 0 ? `  PASS foraging produced ${totalForaged} real gains over the week`
                              : '  NOTE no forage gains this week (patch RNG; tick-burn carried the clock)');
  console.log(failures.length ? `\nRESULT: FAILURES (${failures.length})` : '\nRESULT: ALL PASS');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('PLAYTEST ERROR:', e.message); process.exit(1); });
