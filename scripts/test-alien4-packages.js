// Break-it alien-players r4: persona packages + favor tiers (E, F).
// E: every promised package item must land in a LIVE inventory as a USABLE
//    item (name, units) — the pass-2 fix pushed bare {itemId,id} bricks that
//    CRASH useItem (item.name.toLowerCase on undefined).
// F: favor tiers (20/40/70) must actually gate the care-package gift pool —
//    before: all 18 alien items were tier 1, so tiers gated nothing.
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

(async () => {
  await H.boot();
  const seeds = [20261009, 777, 4242];

  for (const seed of seeds) {
    H.RNG.reset(seed);
    const s = setup(30);
    const G = H.Game, ap = G.apState();

    // ---- E1: sadistic persona package -> medkit is usable ----
    ap.met = { vex_marlowe: { encounters: 3, bond: 0, lastOutcome: 'lost', lastDay: 29 } };
    ap.lastPersonaPackageDay = -999;
    let fired = false, guard = 0;
    while (!fired && guard++ < 400) {
      ap.lastPersonaPackageDay = -999; // re-arm the 6-day gate each attempt
      s.day++;
      fired = G.apPersonaPackage();
    }
    ok(fired, `seed ${seed}: sadistic persona package fired`);
    const medkitIdx = (s.inventory || []).findIndex(i => (i.itemId || i.id) === 'medfoam_canister');
    ok(medkitIdx >= 0, `seed ${seed}: medkit landed in live inventory`);
    const medkit = s.inventory[medkitIdx];
    ok(typeof medkit.name === 'string' && medkit.name.length > 0, `seed ${seed}: medkit has a display name`);
    ok((medkit.units || 0) >= 1, `seed ${seed}: medkit has units`);
    // The crash: useItem on the bare item threw TypeError pre-fix.
    // (game canonical field is s.health; s.hp is a harness leftover.)
    s.health = 40;
    const hpBefore = s.health;
    let threw = null;
    try { G.useItem(medkitIdx); } catch (e) { threw = e; }
    ok(!threw, `seed ${seed}: using the medkit does not throw (${threw ? threw.message : 'clean'})`);
    ok(s.health > hpBefore, `seed ${seed}: medkit actually heals (${hpBefore} -> ${s.health})`);
    const stillThere = (s.inventory || []).some(i => (i.itemId || i.id) === 'medfoam_canister');
    ok(!stillThere, `seed ${seed}: medkit consumed on use (no infinite-use brick)`);

    // ---- E2: care-package gift is usable too ----
    ap.favor = 60; ap.lastPackageDay = -999;
    fired = false; guard = 0;
    while (!fired && guard++ < 400) { ap.lastPackageDay = -999; s.day++; fired = G.apCarePackage(); }
    ok(fired, `seed ${seed}: care package fired at favor 60`);
    const giftIdx = (s.inventory || []).findIndex(i => i.itemId && !i.name === false);
    const gifts = (s.inventory || []).filter(i => i.itemId && (G.data.items || []).some(d => d.id === i.itemId && d.origin === 'alien'));
    ok(gifts.length > 0, `seed ${seed}: alien gift in inventory`);
    for (const g of gifts) {
      ok(typeof g.name === 'string' && g.name.length > 0, `seed ${seed}: gift ${g.itemId} has a name`);
      ok((g.units || 0) >= 1, `seed ${seed}: gift ${g.itemId} has units`);
    }
  }

  // ---- F: favor tiers gate the gift pool ----
  for (const seed of seeds) {
    const pools = {};
    for (const favor of [25, 50, 85]) {
      H.RNG.reset(seed);
      const s = setup(30);
      const G = H.Game, ap = G.apState();
      ap.favor = favor; // pinned: apFavor reads state
      const seen = new Set();
      for (let t = 0; t < 300; t++) {
        ap.lastPackageDay = -999; s.day++;
        if (G.apCarePackage()) {
          const g = (s.inventory || []).filter(i => i.itemId && (G.data.items || []).some(d => d.id === i.itemId && d.origin === 'alien')).pop();
          if (g) seen.add(g.itemId);
          s.inventory = (s.inventory || []).filter(i => !(i.itemId && (G.data.items || []).some(d => d.id === i.itemId && d.origin === 'alien')));
        }
      }
      pools[favor] = seen;
    }
    const p25 = pools[25], p50 = pools[50], p85 = pools[85];
    ok(p25.size > 0 && p50.size > 0 && p85.size > 0, `seed ${seed}: all tiers produce gifts (${p25.size}/${p50.size}/${p85.size})`);
    // Higher favor must unlock strictly more: tier-1 pool ⊂ tier-2 pool ⊂ tier-3 pool.
    const sub = (a, b) => [...a].every(x => b.has(x));
    ok(sub(p25, p50) && p50.size > p25.size, `seed ${seed}: favor 50 unlocks MORE than favor 25 (${p25.size} -> ${p50.size})`);
    ok(sub(p50, p85) && p85.size > p50.size, `seed ${seed}: favor 85 unlocks MORE than favor 50 (${p50.size} -> ${p85.size})`);
    // Tier 4 (apex) stays locked at favor 100 — Steve: apex is earned on its own terms.
    H.RNG.reset(seed);
    const s = setup(30); const G = H.Game, ap = G.apState(); ap.favor = 100;
    let apexSeen = false;
    for (let t = 0; t < 300; t++) {
      ap.lastPackageDay = -999; s.day++;
      if (G.apCarePackage()) {
        const gs = (s.inventory || []).filter(i => i.itemId && (G.data.items || []).some(d => d.id === i.itemId && d.origin === 'alien' && (d.tier || 1) >= 4));
        if (gs.length) apexSeen = true;
        s.inventory = (s.inventory || []).filter(i => !(i.itemId && (G.data.items || []).some(d => d.id === i.itemId && d.origin === 'alien')));
      }
    }
    ok(!apexSeen, `seed ${seed}: apex (tier 4) never leaks via care packages`);
  }

  console.log(`\nPASS: ${N} asserts (packages + favor tiers)`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
