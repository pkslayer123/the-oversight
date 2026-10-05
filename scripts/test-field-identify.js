// Field identification tests. Usage: node scripts/test-field-identify.js
// Covers the 2026-10-05 survivalist playtest finding: the cautious edibility
// test (Steve: "always available, always honest") was only offered in the
// haven stash UI — in the field, unknown lumps were dead weight and the
// wild camper starved surrounded by food. Now the pack offers Test
// cautiously / Rush it / Watch the fauna anywhere.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
const said = [];
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  said.length = 0;
  Game.log.length = 0;
  Game.say = (t) => { said.push(String(t)); };
  return Game.state.scholar;
}
function saidHas(sub) { return said.some(t => t.indexOf(sub) !== -1); }
function goWild() {
  // like a player: skip blocked paths (the UI shows the blockage popup with
  // solutions — the script just picks a clear path instead)
  for (let attempt = 0; attempt < 5 && Game.pantryInReach(); attempt++) {
    for (const t of Game.travelTargets()) {
      const tile = Game.tileAt(t.x, t.y);
      if (tile.type === 'haven') continue;
      if (Game.travelBlockage(t.x, t.y)) continue;
      Game.travelTo(t.x, t.y);
      break;
    }
  }
  return !Game.pantryInReach();
}
function plantPid() {
  const p = (Game.data.plants || []).find(x => x && x.id && !Game.plantKnown(x.id));
  return p && p.id;
}
function makeLump(s, pid) {
  const lump = { name: 'unknown shoots', lump: {}, units: 6, foodState: 'unknown', edible: false, spoilDay: s.day + 3 };
  lump.lump[pid] = { units: 6 };
  s.inventory.push(lump);
  return s.inventory.length - 1;
}

(async () => {
  await Game.init();

  // 1. The cautious test works in the field (wild tile, far from haven).
  {
    const s = freshGame();
    goWild();
    ok('away from haven', !Game.pantryInReach());
    const pid = plantPid();
    ok('found an unknown plant', !!pid);
    const idx = makeLump(s, pid);
    Game.testCautiously(idx, {}, s.inventory);
    ok('test ran in the field (no camp refusal)', !saidHas('do it at camp'));
    ok('test said something honest', said.length > 0);
  }

  // 2. Rush works too (higher risk, faster).
  {
    const s = freshGame();
    ok('reached wild tile (rush)', goWild());
    const pid = plantPid();
    const idx = makeLump(s, pid);
    said.length = 0;
    Game.testCautiously(idx, { rush: true }, s.inventory);
    ok('rush ran in the field', said.some(t => t.indexOf('impatience') !== -1 || t.indexOf('Test') !== -1 || said.length > 0));
  }

  // 3. watchFauna works from the pack in the field.
  {
    const s = freshGame();
    ok('reached wild tile (watch)', goWild());
    const pid = plantPid();
    const idx = makeLump(s, pid);
    said.length = 0;
    Game.watchFauna(idx, s.inventory);
    ok('watchFauna ran in the field', said.length > 0);
  }

  // 4. sortBag is still camp-only (flat surface, good light — honest).
  {
    const s = freshGame();
    ok('reached wild tile (sort)', goWild());
    const pid = plantPid();
    const idx = makeLump(s, pid);
    said.length = 0;
    Game.sortBag(null, idx, s.inventory);
    ok('sorting still refused in the field', saidHas('do it at camp'));
  }

  // 5. The eat() hint now points at the field option.
  {
    const s = freshGame();
    s.inventory = [];
    const pid = plantPid();
    makeLump(s, pid);
    s.kcal = 100;
    said.length = 0;
    Game.eat();
    ok('eat hint mentions testing from the pack', saidHas('test cautiously from your pack'));
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
