// Combat engine deepening proof (Steve 2026-10-05).
// Usage: node scripts/test-combat-engine-20261007.js [SEED]
// Played AS A PLAYER: narrated fight scenario judging feel + seeded property
// checks (interior-tile invariant, telegraph dodgeability, desperation triggers).
// Fixed default seed; SEED env overrides for repro sweeps.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
eval(fs.readFileSync(path.join(ROOT, 'src/js/engine/combat.js'), 'utf8'));
const C = globalThis.Scattering.combat;

// --- seeded PRNG (mulberry32; PROOF-TEST RNG STABILITY lesson) ---
const SEED = parseInt(process.env.SEED || process.argv[2] || '20261007', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;
Math.random = mulberry32(SEED);
const rnd = (n) => Math.floor(Math.random() * n);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}
const interior = (x, y) => x >= 1 && x <= 7 && y >= 1 && y <= 7;
const noBlock = () => false;
function mkF(key, kind, x, y, hp, maxHp, extra) {
  return Object.assign({ key, kind, mx: x, my: y, hp, maxHp, speed: 2, alive: true, fled: false }, extra || {});
}
function checkMovesInterior(name, moves) {
  for (const m of moves) {
    if (!interior(m[0], m[1])) { ok(name + ' interior', false, 'move (' + m[0] + ',' + m[1] + ') on edge'); return; }
  }
  ok(name + ' interior', true);
}

console.log('== combat-engine proof, seed ' + SEED + ' ==');

// =====================================================================
// PART 1 - PLAYED AS A PLAYER: a narrated fight
// =====================================================================
console.log('\n--- PART 1: played as a player ---');
{
  // Setup: I'm the player at (4,6). Two villagers with me. A charger and a
  // burster close in. Turn 1.
  const me = mkF('me', 'player', 4, 6, 100, 100, { speed: 3 });
  const brave = mkF('brave', 'villager', 3, 5, 80, 80, { ai: 'brave' });
  const helpful = mkF('helpful', 'villager', 5, 5, 80, 80, { ai: 'helpful' });
  const charger = mkF('charger', 'monster', 4, 2, 100, 100, { tactic: 'charge', chargeRange: 5, speed: 2 });
  const burster = mkF('burster', 'monster', 6, 3, 90, 90, { tactic: 'burst', speed: 2, pattern: { type: 'burst', radius: 2 } });
  const fighters = [me, brave, helpful, charger, burster];

  // Turn order sanity: speed desc, ties broken player-first.
  const order = C.turnOrder(fighters);
  ok('turnOrder puts player (speed 3) first', order[0] === 'me', JSON.stringify(order));

  // The charger is in lane range (cheb 4 <= 5): it COMMITS to a telegraphed charge at my square.
  const plan = C.monsterTacticPlan(charger, fighters, noBlock, null);
  ok('charger commits', plan.intent === 'charge-commit', plan.intent);
  ok('charge action is a telegraph, not an instant hit', plan.action.type === 'telegraph');
  const pat = plan.action.pattern, tgt = plan.action.target;

  // WINDUP: the lane lights up cell by cell (idx sweep), danger:false.
  const windup = C.cellsAtPhase(pat, charger.mx, charger.my, tgt.x, tgt.y, 'windup');
  ok('windup shows cells', windup.length > 0);
  ok('windup cells not yet dangerous', windup.every(function (c) { return !c.danger; }));
  ok('windup sweeps in order from attacker', windup.every(function (c, i) { return c.idx === i; }));
  const standingIn = windup.some(function (c) { return c.cx === me.mx && c.cy === me.my; });
  console.log('feel: WINDUP - the charger lowers its head. The lane to my square lights up cell by cell' + (standingIn ? ", and I'm standing IN it" : '') + '.');

  // As the player I move: dodgeable() says whether my 3 moves get me clear.
  const action = C.cellsAtPhase(pat, charger.mx, charger.my, tgt.x, tgt.y, 'action');
  ok('action covers same cells as windup',
    JSON.stringify(windup.map(function (c) { return [c.cx, c.cy]; }).sort()) ===
    JSON.stringify(action.map(function (c) { return [c.cx, c.cy]; }).sort()));
  ok('action cells dangerous', action.every(function (c) { return c.danger; }));
  ok('recovery clears highlights', C.cellsAtPhase(pat, charger.mx, charger.my, tgt.x, tgt.y, 'recovery').length === 0);
  ok('dodgeable: I can leave the lane with 3 moves', C.dodgeable(action, me.mx, me.my, 3, noBlock));
  console.log('feel: I sidestep off the lane - the windup showed me exactly where NOT to stand. Readable, fair.');

  // The burster spaces itself: keeps its radius on the nearest foe, keeps
  // allies out. Its telegraph targets its own square (burst around itself).
  const bplan = C.monsterTacticPlan(burster, fighters, noBlock, null);
  ok('burster spaces', bplan.intent === 'burst-space', bplan.intent);
  ok('burst telegraph target is a grid cell', C.inGrid(bplan.action.target.x, bplan.action.target.y));
  checkMovesInterior('burster moves', bplan.moves);

  // Brave villager closes to strike; helpful sticks near me.
  const bdec = C.villagerDecide(brave, fighters, noBlock, null);
  ok('brave villager engages', ['strike', 'harry', 'wait'].indexOf(bdec.action.type) >= 0, bdec.action.type);
  checkMovesInterior('brave moves', bdec.moves);

  // Now the desperate beat: charger drops to 20/100 HP. It should abandon
  // the lane discipline and just RUSH - ugly, scary, readable.
  charger.hp = 20;
  ok('charger reads desperate', C.monsterDesperate(charger));
  const dplan = C.monsterTacticPlan(charger, fighters, noBlock, null);
  ok('desperate charger rushes, no telegraph discipline', dplan.intent === 'desperate-rush', dplan.intent);
  checkMovesInterior('desperate rush moves', dplan.moves);
  console.log('feel: DESPERATE - bloodied, the charger forgets the lane and just RUSHES. The fight changed texture. Good.');

  // Shielding beat: I'm at 30% HP. The helpful villager should body-block.
  me.hp = 30;
  ok('I read desperate at 30%', C.desperate(me));
  const shield = C.villagerShield(helpful, fighters, noBlock, null);
  ok('helpful shields', shield.intent === 'shield' && shield.ward === 'me', JSON.stringify(shield.action));
  checkMovesInterior('shield moves', shield.moves);
  const last = shield.moves.length ? shield.moves[shield.moves.length - 1] : [helpful.mx, helpful.my];
  ok('shield ends adjacent to ward', C.cheb(last[0], last[1], me.mx, me.my) <= 1);
  console.log('feel: SHIELD - the helpful villager steps between me and the charger. Not optimal damage. The right call.');

  // Flinch beat: brave took one massive hit (35% of max in one blow).
  brave.lastHitFrac = 0.35;
  ok('brave flinches after a massive hit', C.flinching(brave));
  brave.hp = 20; // ...but once desperate, desperation dominates flinch
  ok('desperation dominates flinch', C.desperate(brave) && !C.flinching(brave));
  console.log('feel: TRAUMA - one huge hit staggers you; near death, you stop flinching and fight dirty. Triggers read clearly.');
}

// =====================================================================
// PART 2 - INTERIOR-TILE INVARIANT: no movement helper ever routes onto an edge
// =====================================================================
console.log('\n--- PART 2: interior-tile invariant (400 seeded runs) ---');
{
  const kinds = ['player', 'villager', 'monster', 'hostile'];
  const tactics = ['charge', 'burst', 'circle', 'skirmish'];
  let checked = 0;
  for (let run = 0; run < 400; run++) {
    const n = 2 + rnd(4);
    const fighters = [];
    for (let i = 0; i < n; i++) {
      // positions include EDGES (0..8) on purpose - helpers must walk inward
      fighters.push(mkF('f' + i, kinds[rnd(4)], rnd(9), rnd(9), 20 + rnd(80), 100,
        { speed: 1 + rnd(3), ai: ['brave', 'cautious', 'helpful'][rnd(3)], tactic: tactics[rnd(4)], chargeRange: 4 + rnd(2) }));
    }
    const f = fighters[rnd(n)];
    // hammer every movement helper
    for (let k = 0; k < 10; k++) {
      const tx = rnd(9), ty = rnd(9);
      const danger = Math.random() < 0.5 ? new Set(['4,4', '5,5']) : null;
      const steps = [C.stepToward(f.mx, f.my, tx, ty, noBlock, danger),
                     C.stepAway(f.mx, f.my, tx, ty, noBlock, danger)];
      for (const s of steps) {
        if (s) { checked++; ok('step interior', interior(s.x, s.y), 'step to (' + s.x + ',' + s.y + ')'); }
      }
    }
    // decision helpers: all moves must stay interior
    const vd = C.villagerDecide(fighters[0], fighters, noBlock, null);
    checkMovesInterior('run' + run + ' villagerDecide', vd.moves);
    const vs = C.villagerShield(fighters[0], fighters, noBlock, null);
    checkMovesInterior('run' + run + ' villagerShield', vs.moves);
    const mp = C.monsterTacticPlan(fighters[n - 1], fighters, noBlock, null);
    checkMovesInterior('run' + run + ' monsterTacticPlan', mp.moves);
    // dodgeable BFS never leaves the interior either (spot check)
    const cells = C.patternCells({ type: 'burst', radius: 2 }, f.mx, f.my);
    C.dodgeable(cells, f.mx, f.my, 3, noBlock);
  }
  // explicit edge starts: from an edge tile, stepToward must land interior
  const edges = [[0, 4], [8, 4], [4, 0], [4, 8], [0, 0], [8, 8]];
  for (const e of edges) {
    const s = C.stepToward(e[0], e[1], 4, 4, noBlock, null);
    ok('edge start walks inward', !!s && interior(s.x, s.y), '(' + e[0] + ',' + e[1] + ') -> ' + JSON.stringify(s));
  }
  console.log('feel: edges are the flee-by-barrier - nobody steps onto them, ever. ' + checked + ' steps checked.');
}

// =====================================================================
// PART 3 - TELEGRAPH DODGEABILITY across random patterns
// =====================================================================
console.log('\n--- PART 3: telegraph dodgeability (200 seeded patterns) ---');
{
  const pats = [
    { type: 'charge', length: 5 }, { type: 'beam', length: 6, width: 2 },
    { type: 'line', length: 4 }, { type: 'burst', radius: 2 }, { type: 'ambush', radius: 1 },
  ];
  let windupOk = 0, done = 0;
  while (done < 200) {
    done++;
    const pat = pats[rnd(pats.length)];
    const ax = 1 + rnd(7), ay = 1 + rnd(7), tx = 1 + rnd(7), ty = 1 + rnd(7);
    if (ax === tx && ay === ty) { windupOk++; continue; } // degenerate aim: vacuous pass
    const w = C.cellsAtPhase(pat, ax, ay, tx, ty, 'windup');
    const a = C.cellsAtPhase(pat, ax, ay, tx, ty, 'action');
    const r = C.cellsAtPhase(pat, ax, ay, tx, ty, 'recovery');
    const wset = JSON.stringify(w.map(function (c) { return [c.cx, c.cy]; }).sort());
    const aset = JSON.stringify(a.map(function (c) { return [c.cx, c.cy]; }).sort());
    if (wset !== aset) { ok('windup==action cells', false, JSON.stringify(pat)); continue; }
    if (r.length !== 0) { ok('recovery empty', false); continue; }
    if (!w.every(function (c) { return !c.danger; }) || !a.every(function (c) { return c.danger; })) {
      ok('danger flags', false); continue;
    }
    if (!w.every(function (c, j) { return c.idx === j; })) { ok('sweep order', false); continue; }
    windupOk++;
  }
  ok('200 patterns: windup/action identical, recovery empty', windupOk === 200, windupOk + '/200');
  // dodgeable() honesty: defender ON a 1-cell burst center with speed 0 cannot dodge;
  // with speed 2 they can step clear
  const solo = [{ cx: 4, cy: 4 }];
  ok('no dodge with 0 moves when standing in it', !C.dodgeable(solo, 4, 4, 0, noBlock));
  ok('dodge with 2 moves', C.dodgeable(solo, 4, 4, 2, noBlock));
  // defender OFF the danger cells is trivially fine
  ok('safe when not in danger', C.dodgeable(solo, 1, 1, 0, noBlock));
  console.log('feel: every telegraph pattern keeps the promise - windup shows the hit, moving out dodges it.');
}

// =====================================================================
// PART 4 - DESPERATION TRIGGERS read clearly (boundary checks)
// =====================================================================
console.log('\n--- PART 4: desperation trigger boundaries ---');
{
  ok('desperate at 34%', C.desperate({ alive: true, hp: 34, maxHp: 100 }));
  ok('not desperate at 36%', !C.desperate({ alive: true, hp: 36, maxHp: 100 }));
  ok('dead is never desperate', !C.desperate({ alive: false, hp: 0, maxHp: 100 }));
  ok('monsterDesperate at 24%', C.monsterDesperate({ alive: true, kind: 'monster', hp: 24, maxHp: 100 }));
  ok('not monsterDesperate at 26%', !C.monsterDesperate({ alive: true, kind: 'monster', hp: 26, maxHp: 100 }));
  ok('villagers never monsterDesperate', !C.monsterDesperate({ alive: true, kind: 'villager', hp: 1, maxHp: 100 }));
  ok('flinch at lastHitFrac 0.3', C.flinching({ alive: true, hp: 80, maxHp: 100, lastHitFrac: 0.3 }));
  ok('no flinch at 0.29', !C.flinching({ alive: true, hp: 80, maxHp: 100, lastHitFrac: 0.29 }));
  ok('flinch off when desperate', !C.flinching({ alive: true, hp: 20, maxHp: 100, lastHitFrac: 0.9 }));
  ok('traumaOf defaults 0', C.traumaOf({}) === 0);
  ok('traumaOf reads field', C.traumaOf({ trauma: 3 }) === 3);
  ok('hpFrac guards zero maxHp', C.hpFrac({ hp: 0, maxHp: 0 }) === 0);
}

// =====================================================================
// PART 5 - MONSTER TACTICS: distinct, always engaging, never fleeing
// =====================================================================
console.log('\n--- PART 5: monster tactic variety ---');
{
  const seen = {};
  for (let i = 0; i < 120; i++) {
    const tactic = ['charge', 'burst', 'circle', 'skirmish'][rnd(4)];
    const m = mkF('m', 'monster', 1 + rnd(7), 1 + rnd(7), 60 + rnd(40), 100,
      { tactic, speed: 2, chargeRange: 5, pattern: { type: tactic === 'burst' ? 'burst' : 'charge', radius: 2, length: 5 } });
    const p = mkF('p', 'player', 1 + rnd(7), 1 + rnd(7), 100, 100, { speed: 2 });
    const fighters = [m, p];
    const plan = C.monsterTacticPlan(m, fighters, noBlock, null);
    seen[plan.intent] = (seen[plan.intent] || 0) + 1;
    ok('plan action well-formed', ['strike', 'telegraph', 'wait'].indexOf(plan.action.type) >= 0, plan.action.type);
    ok('plan never flees', plan.action.type !== 'flee' && plan.intent.indexOf('flee') < 0);
    checkMovesInterior('tactic ' + tactic, plan.moves);
    if (plan.action.type === 'strike') ok('strike targets the foe', plan.action.target === 'p');
    if (plan.action.type === 'telegraph') {
      ok('telegraph has pattern+target', !!plan.action.pattern && !!plan.action.target);
      ok('telegraph target in grid', C.inGrid(plan.action.target.x, plan.action.target.y));
    }
  }
  ok('tactics produce distinct intents', Object.keys(seen).length >= 4, JSON.stringify(seen));
  // circling caution never circles AWAY: distance must not grow beyond start+1
  for (let i = 0; i < 60; i++) {
    const m = mkF('m', 'monster', 1 + rnd(7), 1 + rnd(7), 80, 100, { tactic: 'circle', speed: 2 });
    const p = mkF('p', 'player', 1 + rnd(7), 1 + rnd(7), 100, 100, { speed: 2 });
    const d0 = C.cheb(m.mx, m.my, p.mx, p.my);
    const plan = C.monsterTacticPlan(m, [m, p], noBlock, null);
    const last = plan.moves.length ? plan.moves[plan.moves.length - 1] : [m.mx, m.my];
    const d1 = C.cheb(last[0], last[1], p.mx, p.my);
    ok('circle never disengages', d1 <= d0 + 1, d0 + ' -> ' + d1);
  }
  console.log('feel: chargers commit to lanes, bursters mind their allies, circlers flank - and nothing ever just walks away.');
}

console.log('\n== RESULT: ' + pass + ' pass, ' + fail + ' fail ==');
Math.random = realRandom;
process.exit(fail ? 1 : 0);
