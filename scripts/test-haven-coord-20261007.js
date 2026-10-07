// Proof test: stale haven coordinates (2026-10-07).
// BUG: haven moved to world tile (4,4) with type 'haven' (map rework), but five
// checks still use the old coordinates:
//   - party.js betrayalOpportunity: atHaven = (px===3 && py===3) — backstabbers
//     no longer stand down at home; and (3,3) (now a trail) is treated as haven.
//   - party.js lureCheck: same stale check — lures can fire at (3,3), never at haven.
//   - perceive.js stash display: same — stash readout never shows at haven.
//   - carexplore.js tileFeature: isHaven = (nx===3 && ny===3) — 'oldcamp'
//     features can spawn on the haven tile itself.
//   - game.js checkGenesis: atHaven = (x===0 && y===0) — the haven genesis crop
//     never credits the pantry.
// FIX: all five check the tile (type 'haven' / isHaven), never coordinates.
// Run: node scripts/test-haven-coord-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/justice.js', 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/perceive.js', 'src/js/carexplore.js',
].forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('load skip', f, e.message); } });
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } };

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0;
  const others = () => Game.state.village.roster.filter(id => id !== Game.villagerId);

  // 1. betrayalOpportunity is 0 AT haven even for a primed backstabber
  // (opportunity is positional — no intent setup needed)
  {
    const vid = others()[0];
    Game.state.scholar.health = 20; // tempting target
    Game.state.scholar.inventory.push({ name: 'Rations', kcalEach: 150, units: 8 });
    Game.state.village.positions = {}; // no witnesses on the tile either
    const opp = Game.betrayalOpportunity(vid);
    ok(Game.map.px === 4 && Game.map.py === 4 && Game.playerTile().type === 'haven', 'setup: player starts on the haven tile');
    ok(opp === 0, 'betrayalOpportunity is 0 at haven (primed backstabber stands down)');
  }
  // 2. (3,3) is NOT haven — opportunity must not be zeroed there
  {
    const vid = others()[1];
    Game.map.px = 3; Game.map.py = 3; // the old haven coords: now a trail tile
    Game.state.village.positions = {};
    const opp = Game.betrayalOpportunity(vid);
    ok(Game.tileAt(3, 3).type !== 'haven', 'setup: (3,3) is not the haven tile');
    ok(opp > 0, 'betrayalOpportunity at (3,3) is not haven-zeroed');
    Game.map.px = 4; Game.map.py = 4;
  }
  // 3. checkGenesis: haven crop credits the pantry when the player is away
  {
    Game.map.px = 5; Game.map.py = 5; // player away from haven
    const ht = Game.tileAt(4, 4);
    ht.genesis = { daysLeft: 5, plantedDay: Game.state.scholar.day };
    const m = Game.log.length;
    Game.checkGenesis();
    const said = Game.log.slice(m).join('\n');
    ok(/haven genesis crop yielded .* to the pantry/i.test(said), 'checkGenesis: haven crop yields to pantry');
    ht.genesis = null;
    Game.map.px = 4; Game.map.py = 4;
  }
  // 4. tileFeature: no 'oldcamp' on the haven tile (sweep all detail cells)
  {
    let oldcampAtHaven = 0, checked = 0;
    for (let cx = 0; cx <= 8; cx++) for (let cy = 0; cy <= 8; cy++) {
      const f = Game.tileFeature(4, 4, cx, cy, 'dirt');
      checked++;
      if (f === 'oldcamp') oldcampAtHaven++;
    }
    ok(checked > 0 && oldcampAtHaven === 0, `tileFeature: no 'oldcamp' on haven tile (${checked} cells swept)`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
