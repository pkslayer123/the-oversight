#!/usr/bin/env node
// PROOF TEST (forager break-it 2026-10-10): the forage sweep narrated twice.
// The sweep branch said its message AND fell through to doAction's generic
// tail say — every press printed the haul line twice ("39x Dandelion" x2).
// Fix: the branch sets msg; the tail owns the single narration.
// Run: SEED=N node scripts/test-forage-double-say-20261010.js
const H = require('./sim-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};

async function sweepOnce(seed, plantId) {
  const { Game } = await H.loadGame({ seed });
  await H.setupGame(Game);
  const said = [];
  Game.say = (m) => said.push(String(m));
  Game.map.px = 4; Game.map.py = 4;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  const t = Game.map.tiles[4][4];
  t.detail = t.detail || {}; t.plantSpecies = t.plantSpecies || {};
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = 4 + dx, cy = 4 + dy;
    t.detail[cy] = t.detail[cy] || {}; t.detail[cy][cx] = 'plant';
    t.plantSpecies[`${cx},${cy}`] = plantId;
  }
  t.detailRegrow = {}; t.stock = 9; t.maxStock = 9; t.vigor = 100;
  const u0 = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
  Game.doAction('forage');
  const u1 = Game.state.scholar.inventory.reduce((n, i) => n + (i.units || 0), 0);
  return { said, gained: u1 - u0 };
}

(async () => {
  const seed = Number(process.env.SEED) || 20261010;
  // known plant (practiced-hands line) and unknown plant (shot-in-the-dark line)
  for (const pid of ['dandelion', 'cattail']) {
    const { said, gained } = await sweepOnce(seed, pid);
    const lines = said.filter(s =>
      s.includes('practiced hands') || s.includes('shot in the dark') || s.includes('You work the patch:'));
    check(`sweep narrates exactly once (${pid})`, lines.length === 1,
      `count=${lines.length} gained=${gained}`);
    check(`sweep still harvests (${pid})`, gained > 0, `gained=${gained}`);
  }
  console.log(fails.length ? `\n${fails.length} FAILURES: ` + fails.join('; ') : '\nALL CHECKS PASSED');
  process.exit(fails.length ? 1 : 0);
})();
