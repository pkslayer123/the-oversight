// Forager archetype A/B: what does perishable-first village consumption SAVE?
// Arm A: current HEAD game.js (89dae4b: villageEats/villageMeal eat
// soonest-spoilDay first, skip spoiled).
// Arm B: game.js from 89dae4b^ (durable-first consumption — the old bug —
// but WITH the pantry-rot sweep from 2dc0663, so waste is visible).
// Both arms play 5 identical forager days (seeded RNG): ring<=2 sweeps via
// the real doAction path, haul home, sort/test at camp, cook, endDay.
// Metrics per arm: fresh haul in, kcal swept as spoiled (waste), pantry
// trajectory, village net burn. Feel question: does hauling fresh food home
// feel rewarding (eaten) or futile (rots while beans burn)?
// Usage: node scripts/playtest-forager-perishable-ab.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const BEFORE = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js'];
const AFTER = ['src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'];
// seeded RNG for arm comparability
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function loadArm(gameJsSource) {
  // fresh global scope per arm: re-eval everything.
  // ORDER MATTERS: game.js REPLACES Scattering.Game, so food.js (which extends
  // it via Object.assign) must be eval'd after — same order as the test files.
  delete globalThis.Scattering;
  BEFORE.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  eval(gameJsSource);
  AFTER.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  return globalThis.Scattering.Game;
}
const gameHead = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const gameBefore = execSync('git -C ' + ROOT + ' show 89dae4b^:src/js/game.js', { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

function playArm(Game, label) {
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay ? origSay.call(this, t) : t; };
  const swept = []; // {day, names, kcal}
  return (async () => {
    await Game.init();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart();
    const s = Game.state.scholar, v = Game.state.village;
    const hx = v.px ?? 3, hy = v.py ?? 3;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }
    const rows = [];
    for (let day = 1; day <= 5; day++) {
      said.length = 0;
      s.kcal = 2400; s.hydration = 100; s.health = 100;
      const pantryBefore = Game.pantryKcal();
      const perishBefore = (v.pantry || []).filter(i => (i.spoilDay ?? 99999) - s.day <= 2)
        .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      let presses = 0;
      for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 7; xx++) {
        const d = Math.abs(xx - hx) + Math.abs(yy - hy);
        if (d > 2 || d < 1) continue;
        const t = Game.tileAt(xx, yy);
        if (!t || (t.stock || 0) <= 0) continue;
        Game.travelTo(xx, yy);
        for (let i = 0; i < 10; i++) {
          const m0 = said.length;
          Game.doAction('forage'); presses++;
          const m = said.slice(m0).join(' ');
          if (/Picked clean|Nothing within reach|nothing left/i.test(m)) break;
          if ((Game.tileAt(xx, yy).stock || 0) <= 0) break;
          if (presses > 120) break;
        }
        if (presses > 120) break;
      }
      Game.returnToVillage();
      for (let g = 0; g < 20; g++) {
        const idx = (s.prepStash || []).findIndex(i => i.lump);
        if (idx < 0) break;
        Game.sortBag(null, idx);
      }
      for (let g = 0; g < 20; g++) {
        const idx = (s.prepStash || []).findIndex(i => i.lump);
        if (idx < 0) break;
        try { Game.testCautiously(idx, {}, s.prepStash); } catch (e) { break; }
      }
      if (Game.nearFire()) { try { Game.cookAll(); } catch (e) {} }
      // fresh haul that made it into the pantry today (perishable, spoilDay-day<=2)
      const perishAfterHaul = (v.pantry || []).filter(i => (i.spoilDay ?? 99999) - s.day <= 2)
        .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
      const freshHaul = Math.max(0, perishAfterHaul - perishBefore);
      const daySaid = said.join(' ');
      const mSweep = daySaid.match(/threw out spoiled stores: ([^.]+)\./i);
      let wasteKcal = 0;
      if (mSweep) {
        // waste = kcal of perishable stacks that vanished without being eaten.
        // Approx: perishable kcal dropped beyond what the village ate fresh.
        wasteKcal = Math.max(0, perishAfterHaul - 0); // upper bound; refined below
        swept.push({ day, names: mSweep[1].slice(0, 80) });
      }
      const pantryMid = Game.pantryKcal();
      Game.endDay();
      const endSaid = said.join(' ');
      const mSweep2 = endSaid.match(/threw out spoiled stores: ([^.]+)\./i);
      if (mSweep2 && !mSweep) swept.push({ day, names: mSweep2[1].slice(0, 80) });
      const pantryAfter = Game.pantryKcal();
      rows.push({
        day, presses, freshHaul: Math.round(freshHaul),
        pantry: Math.round(pantryAfter),
        net: Math.round((v.lastEat || 0) - (v.lastGive || 0)),
        swept: mSweep2 ? mSweep2[1].slice(0, 40) : (mSweep ? mSweep[1].slice(0, 40) : '')
      });
      if (Game.over || Game.villageLost) break;
    }
    console.log(`\n=== ${label} ===`);
    console.log('day | presses | freshHaulIn | pantry | villNet | swept');
    for (const r of rows) console.log(`${r.day} | ${r.presses} | ${r.freshHaul} | ${r.pantry} | ${r.net} | ${r.swept}`);
    const totalFresh = rows.reduce((t, r) => t + r.freshHaul, 0);
    console.log(`fresh hauled: ${totalFresh} kcal | pantry ${Math.round(rows[0] ? 0 : 0)} | sweeps: ${swept.length} (${swept.map(x => 'd' + x.day + ':' + x.names).join('; ')})`);
    return { rows, swept, totalFresh };
  })().catch(e => { console.error('ARM ERROR:', e.message); process.exit(1); });
}

(async () => {
  const realRandom = Math.random;
  Math.random = mulberry32(20261006);
  const GameA = loadArm(gameHead);
  const a = await playArm(GameA, 'ARM A — perishable-first (HEAD)');
  Math.random = mulberry32(20261006);
  const GameB = loadArm(gameBefore);
  const b = await playArm(GameB, 'ARM B — durable-first (89dae4b^)');
  Math.random = realRandom;
  console.log('\n--- A/B verdict ---');
  console.log(`A fresh hauled: ${a.totalFresh} kcal, sweeps: ${a.swept.length}`);
  console.log(`B fresh hauled: ${b.totalFresh} kcal, sweeps: ${b.swept.length}`);
  console.log(`A pantry end: ${a.rows.length ? a.rows[a.rows.length - 1].pantry : '?'}, B pantry end: ${b.rows.length ? b.rows[b.rows.length - 1].pantry : '?'}`);
})().catch(e => { console.error('PLAYTEST ERROR:', e.message); process.exit(1); });
