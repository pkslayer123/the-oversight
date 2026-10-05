// Forager archetype: 7 real days of gathering as a player.
// Walk the ring around haven, sweep forage (real doAction path), haul home,
// sort/test at camp, cook, sleep. Judge: is the loop fun or chores? Does the
// land sustain the village? Do villagers pull their weight? Usage: node scripts/playtest-forager-week.js
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

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay ? origSay.call(this, t) : t; };
const sayText = () => said.join(' ');
const clearLog = () => { said.length = 0; };

function ringStock(rings) {
  let s = 0, max = 0;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const hx = Game.state.village.px ?? 3, hy = Game.state.village.py ?? 3;
    const d = Math.abs(x - hx) + Math.abs(y - hy);
    if (d >= rings[0] && d <= rings[1]) {
      const t = Game.tileAt(x, y);
      if (t && t.type !== 'haven' && t.type !== 'ruin') { s += (t.stock || 0); max += (t.maxStock || 0); }
    }
  }
  return { s, max };
}

function naturalTilesSorted(hx, hy, maxD) {
  const out = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (x === hx && y === hy) continue;
    const d = Math.abs(x - hx) + Math.abs(y - hy);
    if (d > maxD) continue;
    const t = Game.tileAt(x, y);
    if (!t || t.type === 'haven' || t.type === 'ruin' || !t.revealed) continue;
    out.push({ x, y, d, stock: t.stock || 0 });
  }
  out.sort((a, b) => a.d - b.d || b.stock - a.stock);
  return out;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const v = Game.state.village;
  const hx = v.px ?? 3, hy = v.py ?? 3;

  // reveal everything so the forager can walk the whole map like a real player would
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }

  const rows = [];
  const day0Pantry = Game.pantryKcal();
  for (let day = 1; day <= 7; day++) {
    clearLog();
    s.kcal = 2400; s.hydration = 100; s.health = 100; // isolate the loop from survival noise (survivalist's loop)
    const pantryBefore = Game.pantryKcal();
    let presses = 0, haulKcal = 0, cleanedOut = 0, traveled = 0;
    // morning sweep: work every natural tile within 2 rings, like a forager would
    const tiles = naturalTilesSorted(hx, hy, 2);
    for (const nt of tiles) {
      const before = Game.tileAt(nt.x, nt.y).stock || 0;
      if (before <= 0) continue;
      Game.travelTo(nt.x, nt.y); traveled++;
      for (let i = 0; i < 10; i++) {
        clearLog();
        Game.doAction('forage');
        presses++;
        const m = sayText();
        if (/Picked clean|Nothing within reach|nothing left/i.test(m)) break;
        if ((Game.tileAt(nt.x, nt.y).stock || 0) <= 0) break;
        if (presses > 90) break; // day's effort cap — a real player stops eventually
      }
      if ((Game.tileAt(nt.x, nt.y).stock || 0) <= 0 && before > 0) cleanedOut++;
    }
    // haul home
    Game.returnToVillage();
    const pantryAfterReturn = Game.pantryKcal();
    const haulIn = Math.max(0, pantryAfterReturn - pantryBefore); // what I added (incl. unprocessed→counter items excluded; they're stash)
    haulKcal = haulIn;
    // camp work: sort every lump, cautiously test every lump, cook
    let sorted = 0, tested = 0, cooked = '';
    for (let guard = 0; guard < 20; guard++) {
      const idx = (s.prepStash || []).findIndex(i => i.lump);
      if (idx < 0) break;
      Game.sortBag(null, idx); sorted++;
    }
    for (let guard = 0; guard < 20; guard++) {
      const idx = (s.prepStash || []).findIndex(i => i.lump);
      if (idx < 0) break;
      Game.testCautiously(idx, {}, s.prepStash); tested++;
    }
    if (Game.nearFire()) { clearLog(); Game.cookAll(); cooked = sayText().slice(0, 120); }
    const stashKcal = (s.prepStash || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
    const knownPlants = Object.keys(Game.state.codex.plants || {}).length;
    // sleep
    Game.endDay();
    const r1 = ringStock([1, 2]), r2 = ringStock([3, 4]);
    rows.push({
      day, presses, traveled, cleanedOut, haulIn: Math.round(haulKcal),
      stashKcal: Math.round(stashKcal), pantry: Math.round(Game.pantryKcal()),
      lastEat: Math.round(v.lastEat || 0), lastGive: Math.round(v.lastGive || 0),
      providers: (v.lastProviders || []).length, knownPlants,
      r1: `${r1.s}/${r1.max}`, r2: `${r2.s}/${r2.max}`,
      sorted, tested, dayPart: Game.dayPart
    });
    if (Game.over || Game.villageLost) { console.log('GAME OVER on day', day); break; }
  }

  console.log('FORAGER WEEK (7 days, ring<=2 sweeps, real doAction path)');
  console.log('day | presses | tilesHit | clean | haulIn | pantry | eat(net) | give(surplus) | providers | known | ring1-2 stock | ring3-4 stock | sorted/tested');
  for (const r of rows) console.log(
    `${r.day} | ${r.presses} | ${r.traveled} | ${r.cleanedOut} | ${r.haulIn} | ${r.pantry} | ${r.lastEat} | ${r.lastGive} | ${r.providers} | ${r.knownPlants} | ${r.r1} | ${r.r2} | ${r.sorted}/${r.tested}`);
  console.log('\nday0 pantry:', Math.round(day0Pantry), '| final:', rows.length ? rows[rows.length - 1].pantry : '?');
  console.log('DONE');
})().catch(e => { console.error('PLAYTEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
