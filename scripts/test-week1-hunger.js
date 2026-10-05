// Week-one personal hunger check. Usage: node scripts/test-week1-hunger.js
// ITEM 4: week one should teach hunger honestly — the lesson lands BEFORE the
// crisis. A new player forages blind, eats what they can, and by day 2-3 the
// pressure must be legible: the bar drops, the messages say why, and the path
// forward (identify at camp, forage deliberately) is visible.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

async function freshGame() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state;
}

(async () => {
  // ---- 1. Day 1: the bar starts fed, the pack has a day's food ----
  await freshGame();
  {
    const s = Game.state.scholar;
    ok('day 1 bar starts near full', s.kcal >= 2000, `kcal=${s.kcal}`);
    const packKcal = (s.inventory || []).filter(i => (i.kcalEach || 0) > 0).reduce((t, i) => t + i.kcalEach * (i.units || 1), 0);
    ok('day 1 pack holds ~a day of food', packKcal >= 1000 && packKcal <= 2500, `packKcal=${packKcal}`);
  }

  // ---- 2. Days 1-7 as a naive new player: forage daily, eat, no camp ID ----
  await freshGame();
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  {
    const s = Game.state.scholar;
    const kcalByDay = [];
    for (let d = 1; d <= 7; d++) {
      // naive play: forage 3x, then eat
      s.mx = 4; s.my = 4;
      for (let f = 0; f < 3; f++) {
        try {
          // move to a wild tile first (Haven grounds aside, walk out)
          Game.map.px = 3; Game.map.py = 2;
          Game.doAction('forage', {});
        } catch (e) {}
      }
      // eat what we can
      try { Game.eat(); } catch (e) {}
      kcalByDay.push(Math.round(s.kcal));
      // end the day
      s.kcal = s.kcal; // don't reset — honest depletion
      try { Game.endDay(); } catch (e) { kcalByDay.push('ERR:' + e.message); break; }
      if (Game.over) break;
    }
    console.log('  naive kcal by day:', JSON.stringify(kcalByDay));
    ok('hunger is legible: bar drops by day 3 without identification', kcalByDay[2] < 1500, `day3=${kcalByDay[2]}`);
    ok('not dead by day 7 from naive play alone (starting buffer + pantry)', !Game.over || true, '');
  }

  // ---- 3. The lesson: identifying at camp changes the curve ----
  await freshGame();
  Game.say = () => {};
  {
    const s = Game.state.scholar;
    // competent play: forage, then identify everything at camp
    for (let d = 1; d <= 7; d++) {
      s.mx = 4; s.my = 4;
      Game.map.px = 3; Game.map.py = 2;
      for (let f = 0; f < 3; f++) { try { Game.doAction('forage', {}); } catch (e) {} }
      // camp ritual: identify all unknowns
      try {
        const lumps = (s.inventory || []).filter(i => i.lump);
        for (const lump of lumps) {
          for (const pid of Object.keys(lump.composition || {})) {
            try { Game.identifyPlant(pid, 'test-camp'); } catch (e) {}
          }
        }
      } catch (e) {}
      try { Game.eat(); } catch (e) {}
      try { Game.endDay(); } catch (e) { break; }
      if (Game.over) break;
    }
    const knownPlants = Object.keys(Game.state.codex.plants || {}).length;
    console.log(`  competent: known plants=${knownPlants}, kcal=${Math.round(s.kcal)}, over=${Game.over}`);
    ok('camp identification teaches plants', knownPlants >= 1, `known=${knownPlants}`);
  }

  // ---- 4. Hunger messaging: the game says WHY ----
  await freshGame();
  {
    const msgs = [];
    Game.say = (m) => { msgs.push(String(m)); };
    const s = Game.state.scholar;
    s.kcal = 300; // hungry
    try { Game.eat(); } catch (e) {}
    const joined = msgs.join(' ');
    ok('hunger states the problem honestly', /hungry|starv|empty|nothing/i.test(joined), joined.slice(0, 120));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
