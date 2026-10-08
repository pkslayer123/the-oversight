// test-locations-depth-20261007.js
// Proof test for the locations.json depth pass (20 -> 28 entries, city 4 -> 10).
// Plain node, deterministic seeded PRNG (mulberry32), SEED env override.
// Validates schema shape, pool counts, gen/startMod key allowlists (derived from
// game.js: locParams() consumes exactly these gen keys; newGame() consumes only
// startMod.waterClean), non-empty copy, knowledge-leak check on monster names,
// and runs the game's actual startLocation selection expression for every id.
//
// Usage: node scripts/test-locations-depth-20261007.js
//        SEED=7 node scripts/test-locations-depth-20261007.js
'use strict';
const fs = require('fs');
const path = require('path');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.SEED || 20261007);
const rand = mulberry32(SEED);

let failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.error('FAIL:', msg); }
}
function note(msg) { console.log('  ' + msg); }

// ---- load data (same files the game loads) ----
const repo = path.join(__dirname, '..');
const locations = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/locations.json'), 'utf8'));
const monsRaw = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monsters.json'), 'utf8'));
const monsterNames = (Array.isArray(monsRaw) ? monsRaw : monsRaw.monsters).map(m => m.name || '');

// ---- 1. schema shape (required keys per schemas.json location.required) ----
const REQUIRED = ['id', 'name', 'description', 'tagline', 'gen', 'spawnType'];
// Allowlist derived from game.js locParams() (the ONLY gen keys the game reads),
// which exactly matches schemas.json location.types.gen.
const GEN_ALLOW = ['creeks', 'wetlands', 'groveBlobs', 'groveSize', 'meadowSize',
  'thickets', 'trailLines', 'ruinMaxDist', 'lootMult', 'stockMult', 'startReveal'];
// Allowlist derived from grep: only startMod.waterClean is consumed anywhere in src/.
const STARTMOD_ALLOW = ['waterClean'];

assert(Array.isArray(locations), 'locations.json must be a JSON array');
note(`entries: ${locations.length} (seed ${SEED})`);
assert(locations.length === 28, `expected 28 entries, got ${locations.length}`);

const seenIds = new Set();
for (const l of locations) {
  for (const k of REQUIRED) assert(k in l, `${l.id || '?'}: missing required key "${k}"`);
  assert(typeof l.id === 'string' && l.id.length > 0, 'id must be non-empty string');
  assert(!seenIds.has(l.id), `duplicate id: ${l.id}`);
  seenIds.add(l.id);
  assert(typeof l.name === 'string' && l.name.length > 0, `${l.id}: name non-empty`);
  assert(typeof l.description === 'string' && l.description.length > 20, `${l.id}: description non-empty`);
  assert(typeof l.tagline === 'string' && l.tagline.length > 0, `${l.id}: tagline non-empty`);
  if ('hazard' in l) assert(typeof l.hazard === 'string' && l.hazard.length > 10, `${l.id}: hazard non-empty`);
  assert(['city', 'countryside'].includes(l.spawnType), `${l.id}: spawnType must be city|countryside`);

  // gen: exact allowlist, all numbers
  const gk = Object.keys(l.gen || {});
  for (const k of gk) assert(GEN_ALLOW.includes(k), `${l.id}: unknown gen key "${k}" (not consumed by locParams)`);
  for (const k of GEN_ALLOW) assert(k in (l.gen || {}), `${l.id}: missing gen key "${k}"`);
  for (const k of gk) assert(typeof l.gen[k] === 'number', `${l.id}: gen.${k} must be a number`);
  // sane ranges anchored to existing data (lootMult 0.65-1.7, stockMult 0.65-1.35)
  assert(l.gen.lootMult >= 0.5 && l.gen.lootMult <= 1.8, `${l.id}: lootMult ${l.gen.lootMult} out of sane range`);
  assert(l.gen.stockMult >= 0.6 && l.gen.stockMult <= 1.4, `${l.id}: stockMult ${l.gen.stockMult} out of sane range`);
  assert(Number.isInteger(l.gen.startReveal) && l.gen.startReveal >= 0 && l.gen.startReveal <= 3, `${l.id}: startReveal ${l.gen.startReveal} odd`);
  for (const k of ['creeks', 'wetlands', 'groveBlobs', 'groveSize', 'meadowSize', 'thickets', 'trailLines', 'ruinMaxDist']) {
    assert(Number.isInteger(l.gen[k]) && l.gen[k] >= 0, `${l.id}: gen.${k} must be non-negative int`);
  }

  // startMod: only consumed keys
  if (l.startMod) {
    for (const k of Object.keys(l.startMod)) assert(STARTMOD_ALLOW.includes(k), `${l.id}: unknown startMod key "${k}" (not consumed by game.js)`);
    if ('waterClean' in l.startMod) assert(typeof l.startMod.waterClean === 'number' && l.startMod.waterClean >= 0, `${l.id}: waterClean odd`);
  }
}

// ---- 2. pool balance: both spawnType pools non-empty, city>=10, countryside>=16 ----
const byType = { city: 0, countryside: 0 };
for (const l of locations) byType[l.spawnType]++;
note(`city: ${byType.city}, countryside: ${byType.countryside}`);
assert(byType.city >= 10, `city pool too small: ${byType.city}`);
assert(byType.countryside >= 16, `countryside pool too small: ${byType.countryside}`);

// ---- 3. knowledge-leak check: no distinctive monster name in copy ----
// "If you don't know, it doesn't show" - the waking player must not read monster names.
const distinct = monsterNames.filter(n => n.length >= 7);
note(`leak-checking ${distinct.length} distinctive monster names against copy`);
for (const l of locations) {
  const txt = ((l.description || '') + ' ' + (l.hazard || '') + ' ' + (l.tagline || '')).toLowerCase();
  for (const n of distinct) {
    assert(!txt.includes(n.toLowerCase()), `${l.id}: leaks monster name "${n}" in copy`);
  }
}

// ---- 4. the game's ACTUAL startLocation selection, for every id ----
// Exact expression from game.js newGame():
//   const loc = (locationId && locPool.find(l => l.id === locationId))
//     || locPool[Math.floor(Math.random() * locPool.length)] || {};
function selectStart(locPool, locationId, rnd) {
  return (locationId && locPool.find(l => l.id === locationId))
    || locPool[Math.floor(rnd() * locPool.length)] || {};
}
// Exact locParams() from game.js (defaults included).
function locParams(loc) {
  const g = (loc && loc.gen) || {};
  return {
    creeks: g.creeks ?? 1, wetlands: g.wetlands ?? 3,
    groveBlobs: g.groveBlobs ?? 2, groveSize: g.groveSize ?? 4,
    meadowSize: g.meadowSize ?? 5, thickets: g.thickets ?? 5,
    trailLines: g.trailLines ?? 1, ruinMaxDist: g.ruinMaxDist ?? 3,
    lootMult: g.lootMult ?? 1, stockMult: g.stockMult ?? 1,
    startReveal: g.startReveal ?? 0,
  };
}
for (const l of locations) {
  const picked = selectStart(locations, l.id, rand);
  assert(picked && picked.id === l.id, `selection by id failed for ${l.id}`);
  const P = locParams(picked);
  // params must be the location's own gen (no default fallback for a full entry)
  assert(P.creeks === l.gen.creeks && P.lootMult === l.gen.lootMult && P.stockMult === l.gen.stockMult,
    `${l.id}: locParams did not resolve to the location's own gen`);
  // exact water formula from game.js newGame()
  const water = { clean: 20 + ((l.startMod && l.startMod.waterClean) || 0), dirty: 0 };
  assert(typeof water.clean === 'number' && water.clean >= 20, `${l.id}: starting water odd`);
}
// random path stays in-pool (seeded)
for (let i = 0; i < 50; i++) {
  const picked = selectStart(locations, null, rand);
  assert(picked && picked.id && seenIds.has(picked.id), 'random selection returned unknown id');
}
note('selection-by-id resolved for all 28 ids; random path in-pool (50 draws)');

// ---- 5. playability: every NEW start needs water + a food path ----
// (informational for the 20 legacy entries; asserted for the 8 new ones)
const NEW_IDS = ['rail_yard', 'market_row', 'hospital_grounds', 'school_yard',
  'warehouse_row', 'subway_cut', 'alder_marsh', 'limestone_glade'];
for (const l of locations) {
  const hasWater = l.gen.creeks >= 1 || l.gen.wetlands >= 1 || (l.startMod && l.startMod.waterClean >= 5);
  const hasFood = l.gen.lootMult >= 1.3 || l.gen.stockMult >= 0.85;
  if (NEW_IDS.includes(l.id)) {
    assert(hasWater, `${l.id} (new): no water path`);
    assert(hasFood, `${l.id} (new): no food path`);
  }
}
note('playability: all 8 new starts have a water path and a food path');

// ---- summary ----
if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S) (seed ${SEED})`);
  process.exit(1);
}
console.log(`\nALL GREEN (seed ${SEED}): 28 entries, city ${byType.city}, countryside ${byType.countryside}`);
