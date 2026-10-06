// Catch-up sim must not nuke the map (forager loop 2026-10-05).
// A distant village's catch-up used to deplete its FULL daily need from
// STANDING stock (depleteRandomTile(91,...)) — one approach on day 1 zeroed
// 27 tiles. Villages visibly forage like the home village: 1-2 villagers out,
// 400-800 kcal hauls (2-8 stock/day). The rest is abstract.
// Usage: node scripts/test-catchup-depletion-scale.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
function mapStock() {
  let s = 0;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const t = Game.tileAt(x, y);
    if (t && t.type !== 'haven' && t.type !== 'ruin') s += (t.stock || 0);
  }
  return s;
}

(async () => {
  await Game.init();
  // run several maps; the village placement is random
  let worst = 0, worstInfo = '';
  for (let m = 0; m < 5; m++) {
    Game.genRoster('Minneapolis, USA');
    Game.newGame('Minneapolis, USA', null, Game.generatedRoster[0].id);
    Game.depart();
    const villages = Game.state.otherVillages || [];
    if (!villages.length) continue;
    const v = villages[0];
    const before = mapStock();
    // simulate 6 lived days (a late first approach)
    v.day = 0;
    const d0 = Game.state.scholar.day;
    Game.state.scholar.day = d0 + 6;
    Game.catchUpSim(v);
    Game.state.scholar.day = d0;
    const after = mapStock();
    const lost = before - after;
    // home-village scale: at most ~8 stock/day visible => 48 over 6 days,
    // plus margin for the grid-truth cell strips. 60 is generous.
    if (lost > worst) { worst = lost; worstInfo = `map ${m}: ${before} -> ${after}`; }
    ok(`catch-up 6 days doesn't strip the map (map ${m})`, lost <= 60, `lost ${lost} stock (${before} -> ${after})`);
  }
  console.log(`worst 6-day catch-up depletion: ${worst} stock (${worstInfo})`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
