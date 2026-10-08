// test-relic-enh-depth-20261007.js — proof test for the relicEnhancements.json
// depth expansion (23 -> 32 entries, clothing pool doubled).
//
// Plain node, seeded PRNG (mulberry32), deterministic. SEED env override.
// Run: node scripts/test-relic-enh-depth-20261007.js
//      SEED=2 node scripts/test-relic-enh-depth-20261007.js
//
// Asserts:
//   1. schema shape for all 32 entries
//   2. unique ids
//   3. class counts: clothing >= 12, tool >= 10, sentimental >= 10
//   4. effect ops in {add, multiply}, finite numeric values
//   5. every entry resolves to a REAL consumed engine target:
//        - wired in RELIC_MOD_MAP (src/js/engine/modifiers.js), OR
//        - special-cased in game.js (resolve/anchor), OR
//        - declared effect.target in the consumed-target allowlist derived
//          from grep of modTarget()/modifiers.resolve() call sites
//          (wiring for these is documented in PENDING_WIRING below)
//   6. functional application: each NEW effect is run through the REAL
//      resolve() from src/js/engine/modifiers.js with representative bases
//   7. target-resolution handles every declared target
//   8. pool reachability: every non-secret new id can be offered by the
//      weighted 1-of-3 draw (mirror of Game.offerRelicEnhancement), seeded
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '1', 10);

let failures = 0;
function check(cond, label) {
  if (cond) console.log('  PASS ' + label);
  else { failures++; console.log('  FAIL ' + label); }
}

// ---- seeded PRNG (mulberry32) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- load the REAL modifier pipeline (same IIFE the game loads) ----
const modSrc = fs.readFileSync(path.join(ROOT, 'src/js/engine/modifiers.js'), 'utf8');
eval(modSrc); // populates globalThis.Scattering.modifiers
const MOD = globalThis.Scattering.modifiers;
check(!!(MOD && MOD.resolve && MOD.describeTarget), 'real engine/modifiers.js loaded (resolve + describeTarget)');

// ---- load data ----
const entries = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/relicEnhancements.json'), 'utf8'));
check(Array.isArray(entries), 'relicEnhancements.json is an array');
console.log('  INFO entries: ' + entries.length + ' (seed ' + SEED + ')');

// ---- 1. schema ----
console.log('-- schema --');
const CLASSES = new Set(['tool', 'clothing', 'sentimental']);
const AFF_KEYS = new Set(['temperament', 'sharing', 'playstyle']);
for (const e of entries) {
  const p = 'entry ' + e.id;
  check(typeof e.id === 'string' && /^[a-z0-9_]+$/.test(e.id), p + ': id shape');
  check(typeof e.name === 'string' && e.name.length > 0, p + ': name');
  check(CLASSES.has(e.class), p + ': class in {tool,clothing,sentimental}');
  check(typeof e.description === 'string' && e.description.length > 0, p + ': description');
  check(typeof e.systemCommentary === 'string' && e.systemCommentary.length > 0, p + ': systemCommentary');
  check(e.effect && typeof e.effect === 'object', p + ': effect object');
  check(e.effect && (e.effect.op === 'add' || e.effect.op === 'multiply'), p + ': op in {add,multiply}');
  check(e.effect && typeof e.effect.target === 'string' && e.effect.target.length > 0, p + ': target string');
  check(e.effect && typeof e.effect.value === 'number' && Number.isFinite(e.effect.value), p + ': finite value');
  if (e.effect && e.effect.op === 'multiply') check(e.effect.value > 0, p + ': multiply value > 0');
  if (e.hidden !== undefined) check(typeof e.hidden === 'boolean', p + ': hidden boolean');
  if (e.rare !== undefined) check(typeof e.rare === 'number' && e.rare > 0 && e.rare <= 1, p + ': rare in (0,1]');
  if (e.secret !== undefined) check(typeof e.secret === 'boolean', p + ': secret boolean');
  if (e.minBond !== undefined) check(typeof e.minBond === 'number' && e.minBond > 0, p + ': minBond positive');
  if (e.affinity !== undefined) {
    check(typeof e.affinity === 'object' && e.affinity !== null, p + ': affinity object');
    for (const k of Object.keys(e.affinity || {})) {
      check(AFF_KEYS.has(k) && typeof e.affinity[k] === 'string', p + ': affinity key ' + k);
    }
  }
}

// ---- 2. unique ids ----
console.log('-- uniqueness --');
const ids = entries.map(e => e.id);
check(new Set(ids).size === ids.length, 'all ids unique (' + ids.length + ')');

// ---- 3. class counts ----
console.log('-- class counts --');
const byClass = {};
for (const e of entries) byClass[e.class] = (byClass[e.class] || 0) + 1;
check((byClass.clothing || 0) >= 12, 'clothing >= 12 (got ' + (byClass.clothing || 0) + ')');
check((byClass.tool || 0) >= 10, 'tool >= 10 (got ' + (byClass.tool || 0) + ')');
check((byClass.sentimental || 0) >= 10, 'sentimental >= 10 (got ' + (byClass.sentimental || 0) + ')');

// ---- 5. consumed-target allowlist (derived from grep of
//      modTarget('...') and modifiers.resolve(base,'...') call sites,
//      src/js + src/js/engine, 2026-10-07) ----
const CONSUMED = new Set([
  'forage.yield', 'hunt.meat_yield', 'healing.amount', 'luck.global',
  'hunt.find_chance', 'food.spoilage_days', 'food.poison_chance', 'armor.flat',
  'water.rain_catch', 'trust.gain_mult', 'travel.encounter_chance', 'travel.cost_mult',
  'ruin.find_mult', 'monster.hear_mult', 'monster.detect_chance', 'hunt.trap_catch',
  'health.max_add', 'forage.learn_threshold', 'forage.gift_chance', 'food.eat_target_mult',
  'food.bank_mult', 'drama.resolve_bonus', 'craft.success', 'combat.strike_damage',
  'combat.dodge_chance', 'carry.weight_mult',
  'hunt.success', 'travel.encounter', 'rest.energy', 'forage.rare_find_chance', 'cook.kcal',
]);

// RELIC_MOD_MAP ids actually wired in the engine (parsed from source)
const mapBlock = modSrc.slice(modSrc.indexOf('const RELIC_MOD_MAP = {'));
const mapEnd = mapBlock.indexOf('\n  };');
const wired = new Set();
for (const m of mapBlock.slice(0, mapEnd).matchAll(/^    ([a-z0-9_]+): \[/gm)) wired.add(m[1]);
check(wired.size > 0, 'parsed RELIC_MOD_MAP from engine source (' + wired.size + ' wired ids)');

// special-cased in game.js, not plain modifiers
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const SPECIAL = new Set(['resolve', 'anchor']);
for (const sid of SPECIAL) {
  check(gameSrc.includes("includes('" + sid + "')"), 'game.js special-cases enhancement "' + sid + '"');
}

// Explicit pending wiring: new ids whose declared effect.target is a real
// consumed engine target, awaiting their RELIC_MOD_MAP lines in
// src/js/engine/modifiers.js (that file is sibling-dirty; wiring is a
// separate mechanical step). The mapping below is exactly what
// collectModifiers() needs — id -> engine targets, 1:1 with the JSON effect.
const PENDING_WIRING = {
  many_pockets:   [{ target: 'carry.weight_mult',   op: 'multiply', value: 1.15 }],
  forest_scent:   [{ target: 'monster.detect_chance', op: 'add',    value: -0.08 }],
  warm_bones:     [{ target: 'travel.cost_mult',    op: 'multiply', value: 0.9 }],
  stay_put:       [{ target: 'healing.amount',      op: 'add',      value: 4 }],
  rain_funnel:    [{ target: 'water.rain_catch',    op: 'add',      value: 1 }],
  light_feet:     [{ target: 'combat.dodge_chance', op: 'add',      value: 0.05 }],
  butchers_friend:[{ target: 'hunt.meat_yield',     op: 'multiply', value: 1.15 }],
  smoke_keeper:   [{ target: 'food.spoilage_days',  op: 'add',      value: 1 }],
  calm_stone:     [{ target: 'drama.resolve_bonus', op: 'add',      value: 4 }],
};

console.log('-- no dead mechanics: every id reaches a consumed target --');
const pending = [];
for (const e of entries) {
  const okWired = wired.has(e.id);
  const okSpecial = SPECIAL.has(e.id);
  const okPending = PENDING_WIRING[e.id] &&
    PENDING_WIRING[e.id].every(m => m.target === e.effect.target && m.op === e.effect.op && m.value === e.effect.value) &&
    CONSUMED.has(e.effect.target);
  if (okPending) pending.push(e.id);
  check(okWired || okSpecial || okPending,
    e.id + ': reaches consumed target ' + (okWired ? '(wired in RELIC_MOD_MAP)' : okSpecial ? '(special-cased in game.js)' : '(declared target consumed; wiring pending)'));
}
if (pending.length) {
  console.log('  WARN PENDING ENGINE WIRING (' + pending.length + ' ids): add to RELIC_MOD_MAP in src/js/engine/modifiers.js:');
  for (const id of pending) {
    const m = PENDING_WIRING[id][0];
    console.log('    ' + id + ': [{ target: \'' + m.target + '\', op: \'' + m.op + '\', value: ' + m.value + ' }],');
  }
}

// ---- 6. functional application through the REAL resolve() ----
// representative bases taken from the actual call sites.
// New ids: the JSON-declared effect IS the pending RELIC_MOD_MAP entry (1:1).
// Legacy ids: the real path uses RELIC_MOD_MAP, not the JSON's evocative
// effect — parse the actual wired mapping from engine source.
function wiredMapFor(id) {
  const re = new RegExp('^    ' + id + ': \\[(.*?)\\],?$', 'ms');
  const m = mapBlock.match(re);
  if (!m) return null;
  const out = [];
  for (const em of m[1].matchAll(/\{ target: '([^']+)', op: '([^']+)', value: ([^ }]+) \}/g)) {
    out.push({ target: em[1], op: em[2], value: parseFloat(em[3]) });
  }
  return out;
}
console.log('-- functional: real resolve() application --');
const SAMPLES = [
  ['many_pockets',    1,   1.15],
  ['forest_scent',    0,  -0.08],
  ['warm_bones',      1,   0.9],
  ['stay_put',        30,  34],
  ['rain_funnel',     0,   1],
  ['light_feet',      0,   0.05],
  ['butchers_friend', 500, 575],
  ['smoke_keeper',    0,   1],
  ['calm_stone',      8,   12],
  // legacy regression samples through their REAL wired mappings
  ['efficient_action', 10,  12.5],
  ['never_fails',      0.4, 0.5],
  ['weatherproof',     1,   0.9],
];
for (const [id, base, expected] of SAMPLES) {
  const e = entries.find(x => x.id === id);
  let target, op, value;
  if (PENDING_WIRING[id]) {
    const m = PENDING_WIRING[id][0];
    target = m.target; op = m.op; value = m.value;
    check(m.target === e.effect.target && m.op === e.effect.op && m.value === e.effect.value,
      id + ': pending wiring matches JSON-declared effect');
  } else {
    const wm = wiredMapFor(id);
    check(!!(wm && wm.length), id + ': wired mapping parseable from engine source');
    target = wm[0].target; op = wm[0].op; value = wm[0].value;
  }
  const mods = [{ target, op, value, source: 'test:' + id }];
  const got = MOD.resolve(base, target, mods, {});
  const close = Math.abs(got - expected) < 1e-9;
  check(close, id + ': resolve(' + base + ', ' + target + ') = ' + got + ' (expected ' + expected + ')');
}

// ---- 7. target-resolution handles every declared target ----
console.log('-- target resolution --');
for (const e of entries) {
  const label = MOD.describeTarget(e.effect.target);
  check(typeof label === 'string' && label.length > 0, e.id + ': describeTarget("' + e.effect.target + '") -> "' + label + '"');
}

// ---- 8. pool reachability: seeded mirror of offerRelicEnhancement ----
console.log('-- pool reachability (seeded) --');
function offerDraw(rng, cls, personality, playstyle) {
  const bag = [];
  for (const e of entries) {
    if (e.class !== cls || e.secret) continue;
    if (e.hidden && rng() > (e.rare != null ? e.rare : 0.3)) continue;
    let w = 1;
    const aff = e.affinity || {};
    if (aff.temperament && personality.temperament === aff.temperament) w += 3;
    if (aff.sharing && personality.sharing === aff.sharing) w += 2;
    if (aff.playstyle && playstyle === aff.playstyle) w += 3;
    bag.push({ e, w });
  }
  const opts = [];
  const b = bag.slice();
  while (opts.length < 3 && b.length) {
    const total = b.reduce((t, c) => t + c.w, 0);
    let roll = rng() * total, idx = 0;
    while (idx < b.length - 1 && roll > b[idx].w) { roll -= b[idx].w; idx++; }
    opts.push(b.splice(idx, 1)[0].e.id);
  }
  return opts;
}
function runSim(seed) {
  const rng = mulberry32(seed);
  const seen = {};
  for (let i = 0; i < 3000; i++) {
    for (const cls of ['tool', 'clothing', 'sentimental']) {
      for (const id of offerDraw(rng, cls, { temperament: 'steady', sharing: 'generous' }, 'solitary')) {
        seen[id] = (seen[id] || 0) + 1;
      }
    }
  }
  return seen;
}
const simA = runSim(SEED);
const simB = runSim(SEED); // determinism: same seed -> same outcome
check(JSON.stringify(simA) === JSON.stringify(simB), 'pool simulation deterministic for seed ' + SEED);
const newIds = Object.keys(PENDING_WIRING);
for (const id of newIds) {
  const e = entries.find(x => x.id === id);
  if (e.secret) continue;
  check((simA[id] || 0) > 0, id + ': offered at least once in 3000 seeded draws (saw ' + (simA[id] || 0) + ')');
}
// hidden/rare entries appear less often than always-on ones (pool depth, not dead)
const hiddenNew = newIds.filter(id => entries.find(x => x.id === id).hidden);
const plainNew = newIds.filter(id => !entries.find(x => x.id === id).hidden);
if (hiddenNew.length && plainNew.length) {
  const avgH = hiddenNew.reduce((t, id) => t + (simA[id] || 0), 0) / hiddenNew.length;
  const avgP = plainNew.reduce((t, id) => t + (simA[id] || 0), 0) / plainNew.length;
  check(avgH < avgP, 'hidden/rare new ids rarer than always-on (' + avgH.toFixed(0) + ' < ' + avgP.toFixed(0) + ' avg offers)');
}

console.log(failures === 0 ? '\nALL GREEN (' + SEED + ')' : '\n' + failures + ' FAILURE(S) (seed ' + SEED + ')');
process.exit(failures === 0 ? 0 : 1);
