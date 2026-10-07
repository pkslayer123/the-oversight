// Forage knowledge-depth proof test (Steve 2026-10-05).
// Exercises the additive engine API in src/js/engine/forage.js:
//   familiarity shifts outcomes honestly, blind vs deliberate yields differ,
//   depletion blocks re-farming and regrowth restores over days, costs named.
// Usage: node scripts/test-forage-depth-20261007.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// mulberry32 — deterministic by default, SEED env override (AGENTS.md: proof-test RNG stability)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);

['src/js/engine/modifiers.js', 'src/js/engine/calories.js', 'src/js/engine/forage.js']
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const F = globalThis.Scattering.forage;
const plants = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/plants.json'), 'utf8'));
const biomes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/biomes.json'), 'utf8'));
const bio = biomes.find(b => b.id === 'se_woodlands');
const dandelion = plants.find(p => p.id === 'dandelion'); // regions: ohio, georgia, pacific_nw, columbus

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

const nativeScholar = { homeRegion: 'Columbus, Ohio', formerOccupation: 'school teacher', day: 1, abilities: [] };
const outsiderScholar = { homeRegion: 'Oslo, Norway', formerOccupation: 'accountant', day: 1, abilities: [] };
const bgScholar = { homeRegion: 'Oslo, Norway', formerOccupation: 'forager and herbalist', day: 1, abilities: [] };
const codexEmpty = { plants: {} };
const freshTile = () => ({ type: 'meadow', stock: 10 });

// 1. familiarity shifts outcomes honestly
const fn = F.familiarityFor(nativeScholar, dandelion);
const fo = F.familiarityFor(outsiderScholar, dandelion);
const fb = F.familiarityFor(bgScholar, dandelion);
ok('native recognized', fn.level === 'native', JSON.stringify(fn.level));
ok('outsider recognized', fo.level === 'outsider', JSON.stringify(fo.level));
ok('native easier to ID', fn.idShift < fo.idShift, `native ${fn.idShift} vs outsider ${fo.idShift}`);
ok('native yields more', fn.yieldMult > fo.yieldMult, `native ${fn.yieldMult} vs outsider ${fo.yieldMult}`);
ok('notes explain why', fn.note && fo.note && fn.note.length > 20 && fo.note.length > 20);
ok('forager background softens outsider penalty', fb.idShift < fo.idShift && fb.yieldMult > fo.yieldMult,
  `bg ${fb.idShift}/${fb.yieldMult} vs outsider ${fo.idShift}/${fo.yieldMult}`);
ok('effectiveIdDifficulty clamps', F.effectiveIdDifficulty(dandelion, nativeScholar) >= 1 &&
  F.effectiveIdDifficulty({ idDifficulty: 5 }, outsiderScholar) <= 5);

// 2. mode resolution: targeted / deliberate / blind
const tTarget = F.forageModeFor(freshTile(), nativeScholar, codexEmpty, plants, { forcePlantId: 'dandelion' });
ok('forcePlantId → targeted', tTarget.mode === 'targeted' && tTarget.plantId === 'dandelion');
const knownTile = { type: 'meadow', stock: 10, knownPlant: 'dandelion' };
const tDelib = F.forageModeFor(knownTile, nativeScholar, { plants: { dandelion: { level: 1, identifiedDay: 1 } } }, plants, {});
ok('knownPlant + L1 → deliberate', tDelib.mode === 'deliberate' && tDelib.plantId === 'dandelion');
const tBlind = F.forageModeFor(freshTile(), outsiderScholar, codexEmpty, plants, {});
ok('ignorant outsider → blind', tBlind.mode === 'blind' && tBlind.plantId === null);
const tBlind2 = F.forageModeFor(knownTile, nativeScholar, codexEmpty, plants, {});
ok('knownPlant but unidentified → blind (no name = no target)', tBlind2.mode === 'blind');

// 3. blind vs deliberate yields differ (same seed family, fresh tiles each)
function meanUnits(scholar, codex, tileFn, n, seed) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = F.forageSweep(tileFn(), bio, plants, scholar, codex, [], null, { rng: mulberry32(seed + i) });
    if (!r.ok) { sum = -9999; break; }
    sum += r.units;
  }
  return sum / n;
}
const blindMean = meanUnits(outsiderScholar, codexEmpty, freshTile, 60, SEED);
const delibCodex = { plants: { dandelion: { level: 1, identifiedDay: 1 } } };
const delibMean = meanUnits(nativeScholar, delibCodex, () => ({ type: 'meadow', stock: 10, knownPlant: 'dandelion' }), 60, SEED);
ok('deliberate out-yields blind', delibMean > blindMean, `deliberate ${delibMean.toFixed(2)} vs blind ${blindMean.toFixed(2)}`);

// 4. knowledge-gating: the blind preview hides names and kcal
const table = F.forageTableFor(bio, plants, freshTile(), outsiderScholar, codexEmpty, null, 'blind');
const preview = F.sweepPreview('blind', table, plants, codexEmpty);
const unknownRows = preview.filter(r => !r.known);
ok('blind preview hides kcal for unknowns', unknownRows.length > 0 && unknownRows.every(r => r.kcalPerUnit === null),
  `unknown rows: ${unknownRows.length}`);
ok('blind preview shows descriptors not names', unknownRows.every(r => r.display !== plants.find(p => p.id === r.plantId).name));
const dPrev = F.sweepPreview('deliberate', { dandelion: 1 }, plants, delibCodex);
ok('deliberate preview names + values known plants',
  dPrev[0].display === 'Dandelion' && dPrev[0].kcalPerUnit === dandelion.caloriesPerUnit);

// 5. depletion blocks re-farming; regrowth restores over days
const tile = freshTile();
const r1 = F.forageSweep(tile, bio, plants, outsiderScholar, codexEmpty, [], null, { rng: mulberry32(SEED) });
ok('first sweep succeeds', r1.ok === true);
ok('patch depleted after sweep', F.patchStatus(tile, 1).state === 'depleted');
const r2 = F.forageSweep(tile, bio, plants, outsiderScholar, codexEmpty, [], null, { rng: mulberry32(SEED + 1) });
ok('second sweep same day refused (no re-farming)', r2.ok === false && /picked clean/i.test(r2.message));
ok('canForageNow false while depleted', F.canForageNow(tile, 1) === false);
ok('regrowCheck false before regrow day', F.regrowCheck(tile, 2) === false);
ok('patchStatus honest label', /picked clean/i.test(F.patchStatus(tile, 2).label));
ok('regrowCheck true on regrow day', F.regrowCheck(tile, 4) === true);
ok('canForageNow true after regrowth', F.canForageNow(tile, 4) === true);
const r3 = F.forageSweep(tile, bio, plants, outsiderScholar, codexEmpty, [], null, { rng: mulberry32(SEED + 2) });
ok('sweep works again after regrowth', r3.ok === true);

// 6. costs are named
ok('cost names ticks + kcal', r1.cost.ticks === 16 && typeof r1.cost.kcal === 'number' && r1.cost.kcal > 0,
  JSON.stringify(r1.cost));
ok('message names the cost', r1.message.includes('16 ticks') && /\d+ kcal/.test(r1.message));
ok('refusal is not silent', r2.message && r2.message.length > 10 && r2.why);

// 7. haulLearnData feeds the codex flow
ok('first find stages identify beat', r1.learnData.isFirstFind === true && r1.learnData.beat === 'identify');
ok('teachable stages knowledge levels', r1.learnData.teachable.length >= 1 && r1.learnData.teachable[0].level === 1);
const knownLearn = F.haulLearnData(dandelion, delibCodex, 1, 6);
ok('known plant stages learn-more', knownLearn.beat === 'learn-more' && knownLearn.isFirstFind === false);

// 8. existing exports keep their signatures (legacy behavior intact)
const leg = F.forage({ type: 'meadow' }, bio, plants, nativeScholar, codexEmpty, [], null, { forcePlantId: 'dandelion' });
ok('legacy forage() unchanged', leg.plantId === 'dandelion' && leg.units >= 1 && typeof leg.message === 'string');
ok('canForage signature intact', F.canForage({ type: 'meadow', stock: 5 }) === true && F.canForage({ type: 'ruin', stock: 5 }) === false);
ok('weightedPick deterministic w/ rng', F.weightedPick({ a: 1, b: 1 }, mulberry32(SEED)) === F.weightedPick({ a: 1, b: 1 }, mulberry32(SEED)));

console.log(`\nforage-depth: ${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
