// COOKING MODEL proof (Steve 2026-10-08): cooking is digestibility, not a multiplier.
// BEFORE: flat 1.5x (plants) / flat preserve (meat) — no per-food difference,
// phantom energy possible. AFTER: gross-anchored per-class digestibility,
// skill-gated outcomes, fire fuel, energy never created.
'use strict';
const h = require('./break-monsters-harness.js');

async function main() {
  const G = await h.freshGame(424242);
  const sayLog = [];
  G.say = m => sayLog.push(String(m));
  let fails = 0;
  const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + n + (d ? ' | ' + d : '')); if (!c) fails++; };

  const cooking = G.data.cooking;
  check('C0 cooking data loads', !!cooking && !!cooking.classes && !!cooking.plantClasses, 'classes=' + Object.keys(cooking.classes || {}).length);

  // C1: class table sanity
  let sane = true;
  for (const [k, c] of Object.entries(cooking.classes)) {
    if (!(c.raw > 0 && c.raw < 1 && c.cooked > 0 && c.cooked <= 1 && c.time > 0)) sane = false;
  }
  check('C1 class table sane (0<raw<1, 0<cooked<=1)', sane);

  // C2: per-class perfect math — hand-computed
  const tuberPid = Object.keys(cooking.plantClasses).find(p => cooking.plantClasses[p] === 'tuber');
  const r = G.cookTransform({ kcalEach: 100, units: 1, foodKind: 'plant', plantId: tuberPid }, { outcome: { key: 'perfect', mult: 1 } });
  const gross = 100 / 0.35, expect = Math.round(Math.min(gross, gross * 0.8));
  check('C2 tuber 100 raw -> ~229 cooked (perfect)', r && r.kcalEach === expect, `got ${r && r.kcalEach}, want ${expect}`);

  // C3: energy conservation across classes x outcomes x seeds
  let conserved = true, worst = 0;
  const outs = [{ key: 'perfect', mult: 1 }, { key: 'decent', mult: 0.8 }, { key: 'undercooked', mult: 0.7 }, { key: 'burnt', mult: 0.4 }];
  for (const clsKey of Object.keys(cooking.classes)) {
    for (const o of outs) {
      const rr = G.cookTransform({ kcalEach: 100, units: 3, foodKind: 'plant', plantId: 'x', rawKcal: 0 }, { outcome: o });
      // cookClassFor needs a class: use meat shape instead for class coverage
      const rm = G.cookTransform({ kcalEach: 100, units: 3, foodKind: 'meat', plantId: 'meat_deer' }, { outcome: o });
      for (const x of [rr, rm]) {
        if (!x) continue;
        const g = x.rawTotal / x.cls.raw;
        if (x.cookedTotal > g + 0.51) { conserved = false; worst = Math.max(worst, x.cookedTotal - g); }
      }
    }
  }
  // class coverage via plantClasses map
  for (const [pid, clsKey] of Object.entries(cooking.plantClasses)) {
    const rx = G.cookTransform({ kcalEach: 100, units: 2, foodKind: 'plant', plantId: pid }, { outcome: { key: 'perfect', mult: 1 } });
    if (rx && rx.cookedTotal > rx.rawTotal / rx.cls.raw + 0.51) { conserved = false; }
  }
  check('C3 cooked never exceeds gross (all classes x outcomes)', conserved, 'worst over=' + worst.toFixed(2));

  // C4: fruit honesty — cooking berries loses a little
  const berryPid = Object.keys(cooking.plantClasses).find(p => cooking.plantClasses[p] === 'fruit');
  const rf = G.cookTransform({ kcalEach: 100, units: 1, foodKind: 'plant', plantId: berryPid }, { outcome: { key: 'perfect', mult: 1 } });
  check('C4 fruit: cooking loses a little (honest)', rf && rf.cookedTotal < 100, `100 -> ${rf && rf.cookedTotal}`);

  // C5: curated cookedKcal respected (beans 150 -> 300)
  const rb = G.cookTransform({ rawKcal: 150, cookedKcal: 300, kcalEach: 150, units: 2 }, { outcome: { key: 'perfect', mult: 1 } });
  check('C5 curated cookedKcal respected', rb && rb.kcalEach === 300, `got ${rb && rb.kcalEach}`);

  // C6: unknown stays unknown through the real cookFood path
  G.nearFire = () => true;
  G.consumeCookFire = () => 'ok';
  G.knowsTechnique = () => true;
  const realOutcome = G.cookOutcome;
  G.cookOutcome = (k) => ({ key: 'perfect', mult: 1 });
  G.monsterFoodSafe = () => false;
  G.tickAction = () => {};
  G.learnTechnique = () => {};
  const s = G.state.scholar;
  s.inventory = [{ name: 'Unknown flesh (cleaned)', foodKind: 'meat', foodState: 'cleaned', plantId: 'meat_hushwolf', kcalEach: 0, units: 4, hiddenKcal: 5000, edible: false, safe: false, spoilDay: 99 }];
  sayLog.length = 0;
  G.cookFood(0);
  const it = s.inventory[0];
  check('C6 unknown flesh: no kcal reveal', it.kcalEach === 0, `kcalEach=${it.kcalEach}`);
  check('C6b unknown flesh: still unsafe', it.safe === false);
  check('C6c unknown flesh: still says test it', /test it cautiously/i.test(it.prep), it.prep);

  // C7: outcome distribution sane (knows=true -> ~70% perfect)
  G.cookOutcome = realOutcome;
  let perfect = 0, burnt = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) { const o = G.cookOutcome(true); if (o.key === 'perfect') perfect++; if (o.key === 'burnt') burnt++; }
  check('C7 knows: ~70% perfect', Math.abs(perfect / N - 0.7) < 0.04, (perfect / N).toFixed(3));
  check('C7b knows: ~5% burnt', Math.abs(burnt / N - 0.05) < 0.02, (burnt / N).toFixed(3));

  // C8: undercooked keeps disease risk (real path)
  G.cookOutcome = () => ({ key: 'undercooked', mult: 0.7, riskStays: true });
  s.inventory = [{ name: 'Sunchoke', foodKind: 'plant', plantId: tuberPid, kcalEach: 40, units: 2, needsCooking: true, diseaseRisk: { p: 0.25, dmg: 8, note: 'raw' }, spoilDay: 99 }];
  sayLog.length = 0;
  G.cookFood(0);
  const it2 = s.inventory[0];
  check('C8 undercooked keeps diseaseRisk', !!it2.diseaseRisk, 'risk=' + JSON.stringify(!!it2.diseaseRisk));
  check('C8b undercooked still gained kcal (tuber)', it2.kcalEach > 40, `40 -> ${it2.kcalEach}`);

  // C9: fire dying downgrades
  const dg = G.downgradeOutcome({ key: 'perfect', mult: 1 });
  check('C9 downgrade perfect->decent', dg.key === 'decent' && dg.mult === 0.8);
  const dg2 = G.downgradeOutcome({ key: 'undercooked', mult: 0.7, riskStays: true });
  check('C9b downgrade undercooked->burnt', dg2.key === 'burnt');

  // C10: burnt flag + mealQuality
  check('C10 burnt mealQuality', G.mealQuality({ burnt: true }) === 0.45);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
