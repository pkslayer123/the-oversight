// Break-it alien-players r4: playground raid/burn/kill honesty (I).
// I1: pantry raid read v.pantry.kcal (a NUMBER on an ARRAY pantry) -> always
//     stole 0. The raid must actually remove food.
// I2: fire sabotage wrote write-only s.fireSabotaged; the fire never went out.
//     The doused fire must actually go out (grid cell + tracked fire).
// I3: apPlaygroundBurn wrote write-only s.burnedTiles; "tiles are ash" never
//     happened. The burn must scorch real tiles.
// I4 (control): villager kill + trust sabotage + fear were already real —
//     re-assert they still are.
const H = require('./break-alien-harness.js');
const assert = require('assert');
let N = 0;
function ok(c, m) { N++; assert(c, m); console.log('ok ' + N + ' - ' + m); }
// Wave-2 eligibility (pass-3 setup): alien systems gate on systemArrived +
// unlockedWave() >= 2. fresh() alone leaves wave 1 -> silent early-returns.
const _rawFresh = H.fresh.bind(H);
function setup(day) {
  const s = _rawFresh(day);
  H.Game.state.waveKills = { 1: 10 };
  H.Game.isSafeTile = () => false;
  return s;
}
const realRandom = Math.random;

function forceRoll(v) { Math.random = () => v; }
function unforce() { Math.random = realRandom; }

(async () => {
  await H.boot();
  const seeds = [20261009, 777, 4242];

  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30);
    const G = H.Game, ap = G.apState();

    // ---- I1: pantry raid actually steals ----
    G.stockPantry(5000, 'raid test');
    const kcalBefore = G.pantryKcalLive(G.state.village);
    ok(kcalBefore > 4000, `seed ${seed}: pantry stocked (${kcalBefore} kcal)`);
    ap.lastRaidDay = -999;
    forceRoll(0.1); // pantry branch (roll < 0.35)
    let r;
    try { r = G.apPlaygroundRaid('vex_marlowe'); } finally { unforce(); }
    const kcalAfter = G.pantryKcalLive(G.state.village);
    ok(r === true, `seed ${seed}: raid reports it did something`);
    ok(kcalAfter < kcalBefore, `seed ${seed}: pantry actually lighter (${kcalBefore} -> ${kcalAfter})`);
    ok(kcalBefore - kcalAfter <= 1500, `seed ${seed}: theft bounded near the 500-1000 design (took ${kcalBefore - kcalAfter})`);

    // ---- I2: fire sabotage douses a real fire ----
    H.RNG.reset(seed); const s2 = setup(30); const ap2 = H.Game.apState();
    const G2 = H.Game;
    // Light a player fire adjacent: grid cell + tracked fire entry.
    const d = G2.genDetail(G2.map.px, G2.map.py);
    const px = s2.mx ?? 4, py = s2.my ?? 4;
    const fx = Math.min(8, px + 1), fy = py;
    d[fy][fx] = 'fire';
    (G2.state.fires = G2.state.fires || []).push({ tx: G2.map.px, ty: G2.map.py, cx: fx, cy: fy, till: 99999999 });
    ok(G2.hasCampfireNearby(), `seed ${seed}: fire lit near player`);
    ap2.lastRaidDay = -999;
    forceRoll(0.5); // fire branch (0.35 <= roll < 0.60)
    let r2;
    try { r2 = G2.apPlaygroundRaid('vex_marlowe'); } finally { unforce(); }
    const dAfter = G2.genDetail(G2.map.px, G2.map.py);
    ok(r2 === true, `seed ${seed}: sabotage reports it did something`);
    ok(dAfter[fy][fx] !== 'fire', `seed ${seed}: the fire cell is actually out (now '${dAfter[fy][fx]}')`);
    const stillTracked = (G2.state.fires || []).some(f => f.tx === G2.map.px && f.ty === G2.map.py && f.cx === fx && f.cy === fy);
    ok(!stillTracked, `seed ${seed}: tracked fire entry removed`);
    // Douse every remaining fire in range; the helper reports honestly.
    let n = 0;
    while (G2.apDousePlayerFire() && n++ < 10) {}
    ok(!G2.hasCampfireNearby(), `seed ${seed}: hasCampfireNearby agrees all fires are out`);
    ok(G2.apDousePlayerFire() === false, `seed ${seed}: dousing with no fire returns false (no lie)`);
    // No fire nearby -> the raid must not lie about dousing one.
    ap2.lastRaidDay = -999;
    forceRoll(0.5);
    let r2b, said = false;
    const _say = G2.say.bind(G2);
    G2.say = (t) => { if (String(t).includes('fire is out')) said = true; return _say(t); };
    try { r2b = G2.apPlaygroundRaid('vex_marlowe'); } finally { unforce(); G2.say = _say; }
    ok(!said, `seed ${seed}: no 'your fire is out' lie when there is no fire`);

    // ---- I3: burn scorches real tiles ----
    H.RNG.reset(seed); const s3 = setup(30); const G3 = H.Game; const ap3 = G3.apState();
    // Leave Haven for a wild node (arsonists torch the wild, never Haven).
    let moved = false;
    for (let tx = 0; tx < 9 && !moved; tx++) for (let ty = 0; ty < 9 && !moved; ty++) {
      try { const t = G3.tileAt(tx, ty); if (t && t.type !== 'haven') { G3.map.px = tx; G3.map.py = ty; moved = true; } } catch (e) {}
    }
    ok(moved, `seed ${seed}: moved to a wild node for the burn`);
    const d3 = G3.genDetail(G3.map.px, G3.map.py);
    const rubbleBefore = d3.flat().filter(c => c === 'rubble').length;
    const before3 = d3.map(row => row.join(',')).join(';');
    ap3.lastBurnDay = -999;
    let r3;
    try { r3 = G3.apPlaygroundBurn('countess_sable'); } finally {}
    ok(r3 === true, `seed ${seed}: burn fires`);
    const d3a = G3.genDetail(G3.map.px, G3.map.py);
    const after3 = d3a.map(row => row.join(',')).join(';');
    ok(before3 !== after3, `seed ${seed}: the grid actually changed — burn scar is real`);
    const rubbleNew = d3a.flat().filter(c => c === 'rubble').length - rubbleBefore;
    ok(rubbleNew >= 3 && rubbleNew <= 5, `seed ${seed}: 3-5 newly scorched tiles (got ${rubbleNew})`);
    // Burn scar is scavengeable (real interaction, not set dressing).
    ok(G3.cellProps('rubble').interact === 'scavenge', `seed ${seed}: scorched tiles are scavengeable rubble`);

    // ---- I4 (control): kill + trust sabotage are real ----
    H.RNG.reset(seed); const s4 = setup(30); const G4 = H.Game; const ap4 = G4.apState();
    const rosterBefore = (G4.state.village.roster || []).filter(rid => !(G4.vpOf(rid) || {}).dead);
    ap4.lastVillagerKillDay = -999;
    let rk;
    try { rk = G4.apPlaygroundKill('vex_marlowe', 'villager'); } finally {}
    ok(rk === true, `seed ${seed}: villager kill fires`);
    const dead = rosterBefore.filter(rid => (G4.vpOf(rid) || {}).dead);
    ok(dead.length === 1, `seed ${seed}: exactly one villager actually dead`);
    const corpses = (typeof G4.corpses === 'function' ? G4.corpses() : []) || [];
    ok(corpses.some(c => c.villagerId === dead[0]), `seed ${seed}: a real corpse exists for the victim`);
    // Trust sabotage moves real trust.
    ap4.lastRaidDay = -999;
    const trustBefore = JSON.parse(JSON.stringify(G4.state.village.trust || {}));
    forceRoll(0.8); // trust branch (roll >= 0.60)
    let rt;
    try { rt = G4.apPlaygroundRaid('vex_marlowe'); } finally { unforce(); }
    const trustAfter = G4.state.village.trust || {};
    const deltas = Object.keys(trustAfter).map(k => (trustAfter[k] || 0) - (trustBefore[k] || 0));
    ok(rt === true && deltas.some(d => d === -15), `seed ${seed}: trust sabotage cut one villager's trust by exactly 15`);
  }

  console.log(`\nPASS: ${N} asserts (raid/burn/kill honesty)`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
