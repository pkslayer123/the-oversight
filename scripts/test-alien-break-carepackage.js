// BREAK-IT: alien care package honesty (Steve 2026-10-08).
// ATTACK: the fan care package promises "Inside: <alien gift>" plus snacks.
//   BUG 1 (filter): apCarePackage filters items on `it.alien`, but items.json
//     uses `origin: 'alien'` (23 items) — `it.alien` matches ZERO items, so
//     the gift NEVER fires. The package always degrades to snacks-only while
//     the code advertises an item gift path.
//   BUG 2 (dead storage): the gift (if it ever fired) was pushed to
//     state.scholar.pack — an array NO other system reads. Equipping reads
//     state.scholar.inventory (app.js packOf). The item would be invisible
//     and unusable.
// FIX: filter on `it.origin === 'alien'` (tier-gated as before); push the
//   gift into state.scholar.inventory with {itemId, id} shape.
// These assertions encode the FIXED behavior — they FAIL before the fix.
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEED = parseInt(process.env.SEED || '20261008', 10);

function eligibleGame(seed) {
  RNG.reset(seed);
  const s = H.fresh(45);
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 2;
  return s;
}

async function main() {
  await H.boot();
  const items = Game.data.items || [];

  section('schema reality: what the filter sees');
  const byAlienFlag = items.filter(it => it.alien);
  const byOrigin = items.filter(it => it.origin === 'alien');
  console.log('  items with it.alien: ' + byAlienFlag.length + ' | with origin==="alien": ' + byOrigin.length);
  assert(byAlienFlag.length === 0, 'it.alien matches nothing in items.json (the old filter was dead)');
  assert(byOrigin.length > 0, 'origin==="alien" items exist to gift (' + byOrigin.length + ')');

  section('care package: the gift actually fires and lands somewhere real');
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    const s = eligibleGame(seed);
    const ap = Game.apState();
    Game.apAdjustFavor(75, 'test pin', 'fight'); // tier-3 fan love (per-lane clubs, audit-shows 2026-10-09)
    ap.lastPackageDay = -999;
    s.day = 50;
    const invBefore = (s.inventory || []).length;
    const packBefore = (s.pack || []).length;
    let ok = false;
    try { ok = Game.apCarePackage(); } catch (e) { console.log('  threw: ' + e.message); }
    assert(ok === true, 'seed ' + seed + ': apCarePackage fires at favor 75');
    const said = H.sayText();
    const promisedGift = /Inside:/.test(said);
    assert(promisedGift, 'seed ' + seed + ': package copy promises an item ("Inside: ...")');
    const invAfter = (s.inventory || []).length;
    const packAfter = (s.pack || []).length;
    assert(invAfter === invBefore + 1, 'seed ' + seed + ': gift lands in state.scholar.inventory (the array equipping reads), inv ' + invBefore + '->' + invAfter);
    assert(packAfter === packBefore, 'seed ' + seed + ': dead s.pack array untouched (' + packBefore + '->' + packAfter + ')');
    const gift = (s.inventory || [])[(s.inventory || []).length - 1];
    const def = items.find(it => it.id === (gift && (gift.itemId || gift.id)));
    assert(!!(def && def.origin === 'alien'), 'seed ' + seed + ': gifted item is an alien-origin item (' + (gift && (gift.itemId || gift.id)) + ')');
    assert(!def || (def.tier || 1) <= 3, 'seed ' + seed + ': gifted item respects the favor tier gate (tier ' + (def && def.tier) + ')');
  }

  section('cooldown still holds (no package farming)');
  {
    const s = eligibleGame(SEED + 10);
    const ap = Game.apState();
    ap.fanClubs = { fight: 0, survival: 0, social: 0, showbiz: 80 }; Game.apSyncFavor(); ap.lastPackageDay = -999; s.day = 60; // per-lane (audit-shows 2026-10-09)
    let n = 0;
    for (let d = 60; d < 80; d++) {
      s.day = d;
      // deterministic: force the 25% daily roll to pass every day
      const real = Math.random;
      Math.random = () => 0.0;
      try { if (Game.apCarePackage()) n++; } catch (e) {}
      Math.random = real;
    }
    assert(n <= 5, 'forced rolls over 20 days yield <=5 packages (4-day cooldown), got ' + n);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
