#!/usr/bin/env node
// BRAWLER R7 — KITING AUDIT (2026-10-09).
// Hostile question: can a patient player kill a slow melee monster taking
// ZERO damage via strike-then-retreat every round? Combat is time-free
// (tickAction no-ops in combat), so patience is the only cost.
// Bot plays optimally: strike when adjacent, then retreat to max distance.
// Contrast: speedbump turtle (speed 1, kiteable?) vs hushwolf (speed 5,
// rush — should catch the runner).
// Usage: node scripts/test-brawler-kiting-r7-20261009.js (SEED env override)
const H = require('./combat-break-harness.js');

function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }

async function kite(Game, monId, maxRounds) {
  const mk = H.synthFight(Game, monId, { php: 300, mhp: 400 });
  const f = Game.tbfight;
  const m = f.fightersByKey[mk];
  const p = Game.tbFighter('p');
  // open interior, player starts 4 away
  p.mx = 4; p.my = 4; m.mx = 4; m.my = 7;
  // silence say() to keep output small, but count monster hits on player
  const osay = Game.say.bind(Game);
  let monsterHits = 0, playerStrikes = 0, monsterDmg = 0;
  const otb = Game.tbDamage.bind(Game);
  Game.tbDamage = (tk, dmg, src, sk, opts) => {
    const before = tk === 'p' ? p.hp : null;
    const r = otb(tk, dmg, src, sk, opts);
    if (tk === 'p' && p.hp < before) { monsterHits++; monsterDmg += (before - p.hp); }
    return r;
  };
  let rounds = 0, playerTurns = 0;
  const mhp0 = m.hp;
  try {
    while (!f.over && rounds < maxRounds) {
      // --- player turn ---
      f.turnIdx = Math.max(0, f.order.indexOf('p'));
      const pp = Game.tbFighter('p');
      if (!pp.alive) break;
      pp.acted = false; pp.moveLeft = 3; pp.blindTurns = 0;
      rounds++;
      // strike if in range 1
      if (cheb(pp.mx, pp.my, m.mx, m.my) <= 1 && m.alive) {
        try { if (Game.tbPlayerStrike(mk)) playerStrikes++; } catch (e) { break; }
        if (f.over) break;
      }
      // retreat: best interior tile (1..7) reachable within moveLeft, max cheb distance
      if (!f.over && pp.moveLeft > 0) {
        let best = null, bestD = -1;
        for (let ty = 1; ty <= 7; ty++) for (let tx = 1; tx <= 7; tx++) {
          if (tx === pp.mx && ty === pp.my) continue;
          let path = null;
          try { path = Game.findPath(pp.mx, pp.my, tx, ty); } catch (e) { continue; }
          if (!path || !path.length) continue;
          let cost = 0;
          try { cost = path.reduce((s, c) => s + Game.tbTerrainCost(c[0], c[1]), 0); } catch (e) { continue; }
          if (cost > pp.moveLeft) continue;
          const d = cheb(tx, ty, m.mx, m.my);
          if (d > bestD) { bestD = d; best = [tx, ty]; }
        }
        if (best) { try { Game.tbPlayerMove(best[0], best[1]); } catch (e) {} }
      }
      if (f.over) break;
      try { Game.tbPlayerEndTurn(); } catch (e) { break; }
      playerTurns++;
      if (!m.alive) break;
    }
  } finally {
    Game.say = osay; Game.tbDamage = otb;
    try { Game.tbEnd && !f.over && Game.tbEnd('fled'); } catch (e) {}
  }
  return { rounds, playerTurns, playerStrikes, monsterHits, monsterDmg,
           mhp0, mhp: m.hp, php: p.hp, over: f.over, result: f.result };
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  s.stats = { str: 8, end: 8, per: 5, agi: 8, pre: 5 };
  for (const [monId, maxR] of [['speedbump_turtle', 120], ['hushwolf', 60]]) {
    const r = await kite(Game, monId, maxR);
    console.log(`\n${monId}: rounds=${r.rounds} strikes=${r.playerStrikes} ` +
      `monsterHitsOnPlayer=${r.monsterHits} dmgTaken=${r.monsterDmg} ` +
      `monsterHP ${r.mhp0}->${Math.max(0, r.mhp)} playerHP=${r.php} ` +
      `fightOver=${r.over} result=${r.result}`);
    if (r.monsterHits === 0 && r.mhp <= 0)
      console.log(`  >> ZERO-DAMAGE KILL: kiting fully nullifies ${monId}`);
    else if (r.monsterHits === 0 && r.result === 'routed')
      console.log(`  >> DISENGAGED after ${r.rounds} round(s) — it won't chase, won't be kited; no free kill, no false flee`);
    else if (r.monsterHits === 0)
      console.log(`  >> UNTOUCHED after ${r.rounds} rounds (monster at ${Math.max(0, r.mhp)}/${r.mhp0}) — patience grinds it down for free`);
    else
      console.log(`  >> kiting FAILS vs ${monId}: it lands hits (${r.monsterDmg} dmg over ${r.rounds} rounds)`);
  }
  console.log(`\n(seed ${H.SEED})`);
})().catch(e => { console.error('HARNESS FATAL:', e); process.exit(2); });
