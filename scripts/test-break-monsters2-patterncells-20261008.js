// Proof: break-it monsters run 2 — zero-range beam/line/charge geometry
// (Steve 2026-10-08).
//
// CATCH (HONESTY, engine-level): S.combat.patternCells returned [] for
// beam/line/charge when attacker and target shared a tile (n=0). Same-tile
// spawns are real (bump-in-the-dark, startCombat with no world position).
// Consequences measured on HEAD:
//  - mirror_stag: Confrontation declared and "resolved" every 2 rounds for
//    40 rounds, dealing 0 — infinite wheel loop, signature attack a whiff.
//  - review_drone: beam "dies against the trees. Cover works." — a LIE
//    (no cover; degenerate geometry) — then project→countdown→recalc
//    forever, 0 damage.
//  - memory_projector: Home Movies beam resolved harmlessly at same tile.
//  - white_noise_heron: first strike ate the same "cover works" lie.
// FIX: combat.js patternCells — zero-range lane is the shared tile.
// This test fails on HEAD (cells=[] / 0 damage) and passes patched.
'use strict';
const H = require('./break-monsters-harness.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};

function fightSameTile(Game, id, seed, rounds) {
  H.seedRng(seed);
  Game.state.scholar.health = 100;
  Game.startCombat(id);
  const tbf = Game.tbfight;
  const p = Game.tbFighter('p');
  const m = tbf.fighters.find(x => x.kind === 'monster');
  // force the degenerate geometry: monster on the player's tile
  m.mx = p.mx; m.my = p.my;
  let dmg = 0;
  const origDmg = Game.tbDamage.bind(Game);
  Game.tbDamage = (key, d, src, a, b) => {
    if (key === 'p' && typeof d === 'number' && d > 0) dmg += d;
    return origDmg(key, d, src, a, b);
  };
  let coverLies = 0;
  const origSay = Game.say.bind(Game);
  Game.say = (msg) => {
    if (typeof msg === 'string' && msg.includes('dies against the trees')) coverLies++;
    return origSay(msg);
  };
  let r = 0;
  try {
    while (!tbf.over && r < rounds) {
      r++;
      Game.tbPlayerWait();
      const pp = Game.tbFighter('p');
      if (pp && !pp.alive && !tbf.over) { pp.hp = 60; pp.alive = true; }
      // keep the degenerate geometry (some AI moves)
      const mm = tbf.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
      if (mm) { mm.mx = p.mx; mm.my = p.my; }
    }
  } finally {
    Game.tbDamage = origDmg;
    Game.say = origSay;
    if (!tbf.over) { try { Game.tbEnd('fled'); } catch (e) {} }
  }
  return { dmg, coverLies, rounds: r };
}

(async () => {
  const Game = await H.freshGame(4242);
  const S = globalThis.Scattering.combat;

  // 1. Unit: zero-range lane is the shared tile for beam/line/charge.
  for (const type of ['beam', 'line', 'charge']) {
    const cells = S.patternCells({ type, length: 6, width: 1 }, 4, 4, 4, 4);
    ok(`patternCells ${type} same-tile covers the tile`,
      cells.length === 1 && cells[0].cx === 4 && cells[0].cy === 4,
      `got ${JSON.stringify(cells)}`);
  }
  // 2. Unit: non-degenerate lanes unchanged (adjacent target still in lane).
  const lane = S.patternCells({ type: 'charge', length: 6, width: 1 }, 4, 4, 4, 6);
  ok('patternCells charge adjacent lane hits target tile',
    lane.some(c => c.cx === 4 && c.cy === 6), `got ${lane.length} cells`);
  // 3. Unit: burst still centered on attacker (unaffected by the fix).
  const burst = S.patternCells({ type: 'burst', radius: 2 }, 4, 4, 4, 4);
  ok('patternCells burst same-tile still a radius-2 disc',
    burst.length === 25 && burst.some(c => c.cx === 4 && c.cy === 4),
    `got ${burst.length} cells`);

  // 4. Stag: same-tile Confrontation now lands (HEAD: 0 dmg / 40 rounds).
  let r = fightSameTile(Game, 'mirror_stag', 7001, 12);
  ok('mirror_stag same-tile charge damages the player', r.dmg > 0, `dmg=${r.dmg}`);

  // 5. Drone: same-tile beam lands, no "cover works" lie (HEAD: lie + 0 dmg).
  r = fightSameTile(Game, 'review_drone', 7002, 12);
  ok('review_drone same-tile beam damages the player', r.dmg > 0, `dmg=${r.dmg}`);
  ok('review_drone never claims "cover works" at zero range', r.coverLies === 0,
    `lies=${r.coverLies}`);

  // 6. Projector: same-tile Home Movies beam lands (HEAD: 0 dmg).
  r = fightSameTile(Game, 'memory_projector', 7003, 14);
  ok('memory_projector same-tile beam damages the player', r.dmg > 0, `dmg=${r.dmg}`);

  // 7. Heron: same-tile strike lands, no cover lie (HEAD: lie on strike 1).
  r = fightSameTile(Game, 'white_noise_heron', 7004, 10);
  ok('white_noise_heron same-tile strike damages the player', r.dmg > 0, `dmg=${r.dmg}`);
  ok('white_noise_heron never claims "cover works" at zero range', r.coverLies === 0,
    `lies=${r.coverLies}`);

  console.log(`\npatterncells proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
