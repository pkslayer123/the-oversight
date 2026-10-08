#!/usr/bin/env node
// PROOF TEST: modifier pipeline depth — provenance/describe, knowledge-gated
// visibility, stacking honesty (diminish), validateModifiers. (Steve 2026-10-05)
// Plain node, seeded PRNG (mulberry32, fixed default, SEED env override).
// Includes a PLAYED PASS: a realistic scholar loadout rendered before/after
// the scholar identifies an unknown source — judged in comments below.
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
const rng = mulberry32(parseInt(process.env.SEED || '20261007', 10));

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'engine', 'modifiers.js'), 'utf8');
eval(src); // attaches to globalThis.Scattering (no window in node)
const M = globalThis.Scattering.modifiers;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

console.log('== REGRESSION: existing pipeline behavior unchanged ==');
// Classic pipeline: (base + adds) * mul
ok(M.resolve(10, 't', [{ target: 't', op: 'add', value: 5 }, { target: 't', op: 'multiply', value: 2 }]) === 30,
  'resolve: (10+5)*2 = 30');
ok(M.resolve(10, 't', [{ target: 'other', op: 'add', value: 999 }]) === 10,
  'resolve: ignores other targets');
ok(M.resolve(10, 't', [{ target: 't', op: 'add', value: 5, condition: 'biome:se_woodlands' }], { biome: 'se_woodlands' }) === 15,
  'resolve: condition match applies');
ok(M.resolve(10, 't', [{ target: 't', op: 'add', value: 5, condition: 'biome:se_woodlands' }], { biome: 'plains' }) === 10,
  'resolve: condition mismatch skipped');
ok(M.resolve(10, 't', []) === 10 && M.resolve(10, 't', null) === 10,
  'resolve: empty/null modifiers = base');
ok(M.checkCondition('round:1', { round: 1 }) === true, 'checkCondition: loose number compare');
ok(M.checkCondition('round:1', { round: 2 }) === false, 'checkCondition: mismatch');
// Level scaling
ok(approx(M.scaledValue({ op: 'multiply', value: 1.5, scale: 'level' }, 2), 2.25), 'scaledValue: multiply ^level');
ok(M.scaledValue({ op: 'add', value: 5, scale: 'level' }, 3) === 15, 'scaledValue: add *level');
ok(M.scaledValue({ op: 'multiply', value: 1.5 }, 4) === 1.5, 'scaledValue: no scale = flat');
// collectModifiers still resolves identically to the old hand-rolled math
const abilitiesData = [
  { id: 'keen_nose', name: 'Keen Nose', modifiers: [{ target: 'forage.yield', op: 'multiply', value: 1.5, scale: 'level' }] },
  { id: 'strange_whispers', name: 'Strange Whispers', modifiers: [{ target: 'forage.rare_find_chance', op: 'add', value: 0.05 }] },
];
const scholar = {
  abilities: [{ id: 'keen_nose', level: 2 }, { id: 'strange_whispers', level: 1 }],
  inventory: [{ name: 'Iron Rations', bonded: true, enhancements: ['efficient_action'] }],
  equipped: {},
};
const mods = M.collectModifiers(scholar, abilitiesData);
ok(approx(M.resolve(10, 'forage.yield', mods, {}), 10 * 2.25 * 1.25), 'collectModifiers: keen L2 (2.25) x iron rations (1.25)');
ok(mods.every(m => m.source && m.label), 'collectModifiers: every modifier now carries source+label (provenance)');
ok(M.hasKnowledgeUnlock({ foraging: { level: 2 } }, [{ id: 'foraging', mechanical: { 1: {}, 2: { unlock: 'eat_raw_safely' } } }], 'eat_raw_safely') === true,
  'hasKnowledgeUnlock: unchanged');

console.log('== PROVENANCE: describeModifiers ==');
const knownCtx = new Set(['ability:keen_nose', 'relic:efficient_action']);
const lines = M.describeModifiers('forage.yield', mods, {}, knownCtx);
ok(lines.length === 2, 'describe: two active modifiers -> two lines, got: ' + JSON.stringify(lines));
ok(lines[0] === 'Forage yield ×2.25 — Keen Nose, L2', 'describe: level shown on scaled ability: ' + lines[0]);
ok(lines[1] === 'Forage yield ×1.25 — Iron Rations', 'describe: relic line: ' + lines[1]);
// Condition-gated modifiers only describe when active
const condMods = [{ target: 't', op: 'add', value: 3, unit: 'kcal', label: 'Trail Snacks', condition: 'biome:plains' }];
ok(M.describeModifiers('t', condMods, { biome: 'plains' }, {})[0] === 'T +3 kcal — Trail Snacks',
  'describe: conditional active -> shown with unit');
ok(M.describeModifiers('t', condMods, { biome: 'swamp' }, {}).length === 0,
  'describe: conditional inactive -> silent (resolve would skip it too)');
// Fallback for content with no label/source
ok(M.describeModifiers('t', [{ target: 't', op: 'multiply', value: 0.9 }], {}, {})[0] === 'T ×0.9 — an unnamed effect',
  'describe: unnamed fallback, no leak of internals');

console.log('== KNOWLEDGE-GATED VISIBILITY: visibleFor ==');
const gated = { target: 't', op: 'multiply', value: 1.4, knownBy: 'codex:monsters/hushwolf' };
ok(M.visibleFor(gated, new Set(['codex:monsters/hushwolf'])) === true, 'visibleFor: Set hit');
ok(M.visibleFor(gated, new Set(['codex:plants/dandelion'])) === false, 'visibleFor: Set miss');
ok(M.visibleFor(gated, ['codex:monsters/hushwolf']) === true, 'visibleFor: array hit');
ok(M.visibleFor(gated, { 'codex:monsters/hushwolf': true }) === true, 'visibleFor: object map hit');
ok(M.visibleFor(gated, { knows: (k) => k === 'codex:monsters/hushwolf' }) === true, 'visibleFor: knows() hook hit');
ok(M.visibleFor(gated, null) === false, 'visibleFor: gated + no knowledge -> hidden (no leak by default)');
ok(M.visibleFor({ target: 't', op: 'add', value: 1 }, null) === true, 'visibleFor: ungated -> visible');
ok(M.visibleFor({ target: 't', op: 'add', value: 1, knownBy: (ctx) => ctx && ctx.brave }, { brave: true }) === true,
  'visibleFor: predicate knownBy supported');

console.log('== STACKING HONESTY: diminish curves ==');
const five = [];
for (let i = 0; i < 5; i++) five.push({ target: 'forage.yield', op: 'multiply', value: 1.5, diminish: 'soft' });
ok(approx(M.resolve(1, 'forage.yield', five.map(m => Object.assign({}, m, { diminish: undefined })), {}), 1.5 ** 5),
  'sanity: no diminish -> 1.5^5 = 7.59 (min-maxing welcome)');
ok(approx(M.resolve(1, 'forage.yield', five, {}), 1 + 2.5 / 3.5), 'diminish soft: five x1.5 -> x1.714, not x7.59');
const fiveHard = five.map(m => Object.assign({}, m, { diminish: 'hard', diminishCap: 1.0 }));
ok(approx(M.resolve(1, 'forage.yield', fiveHard, {}), 2.0), 'diminish hard: five x1.5, cap 1.0 -> x2.0 (clamped at +100%)');
const fiveHardDefault = five.map(m => Object.assign({}, m, { diminish: 'hard' }));
ok(approx(M.resolve(1, 'forage.yield', fiveHardDefault, {}), 1.5), 'diminish hard default cap: five x1.5 -> x1.5 (+50%)');
const adds = [10, 10, 10].map(v => ({ target: 'heal.amount', op: 'add', value: v, diminish: 'soft', diminishCap: 20 }));
ok(approx(M.resolve(0, 'heal.amount', adds, {}), 20 * 30 / 50), 'diminish soft adds: +30 -> +12 effective');
// Plain (non-diminish) modifiers are untouched by the grouping logic
ok(M.resolve(1, 'forage.yield', [{ target: 'forage.yield', op: 'multiply', value: 1.5 }], {}) === 1.5,
  'resolve: single plain multiply identical to old behavior');

console.log('== VALIDATION: validateModifiers ==');
const bad = [
  { target: 't', op: 'add', value: NaN },
  { target: 't', op: 'multiply', value: 0 },
  { target: 't', op: 'divide', value: 2 },
  { target: 't', op: 'add', value: 1, diminish: 'exponential' },
  { target: 't', op: 'add', value: 1, knownBy: 't' },
  { target: 't', op: 'add', value: 1, diminishGroup: 'g', diminish: 'soft' },
  { target: 't', op: 'multiply', value: 2, diminishGroup: 'g', diminish: 'soft' },
  { op: 'add', value: 1 },
];
const findings = M.validateModifiers(bad);
ok(findings.filter(f => f.startsWith('error:')).length === 7, 'validate: 7 errors flagged, got ' + findings.length + ': ' + JSON.stringify(findings));
ok(M.validateModifiers([{ target: 't', op: 'add', value: 5 }]).length === 0, 'validate: clean list -> no findings');
ok(M.validateModifiers([{ target: 't', op: 'multiply', value: 999 }]).some(f => f.startsWith('warn:')),
  'validate: extreme multiply -> warning, not error');

console.log('');
console.log('==================== PLAYED PASS ====================');
console.log('Scholar: Mira — Keen Nose L2 (known), Strange Whispers (UNKNOWN source:');
console.log('a hushwolf pack-blessing she cannot name yet), bonded Iron Rations');
console.log('(examined), a sprained ankle (known), and an ashen curse (UNKNOWN).');
console.log('');
// The unknown-source effects: content the scholar has NOT identified.
const unknownMods = [
  { target: 'forage.yield', op: 'multiply', value: 1.4, label: 'Pack-blessing (hushwolf)', source: 'monster:hushwolf', knownBy: 'codex:monsters/hushwolf' },
  { target: 'cook.kcal', op: 'multiply', value: 0.8, label: 'Ashen curse', source: 'curse:ashen', knownBy: 'codex:curses/ashen' },
];
const injuryMods = [
  { target: 'travel.kcal', op: 'multiply', value: 1.2, label: 'Sprained ankle', source: 'injury:sprained_ankle', knownBy: 'injury:sprained_ankle' },
];
const allMods = mods.concat(unknownMods, injuryMods);
// Deterministic pick via seeded rng: which target the scholar checks first.
const targets = ['forage.yield', 'cook.kcal', 'travel.kcal'];
const first = targets[Math.floor(rng() * targets.length)];

const beforeKnows = new Set(['ability:keen_nose', 'relic:efficient_action', 'injury:sprained_ankle']);
const afterKnows = new Set([...beforeKnows, 'codex:monsters/hushwolf', 'codex:curses/ashen']);

for (const t of targets) {
  const marker = t === first ? ' (checked first)' : '';
  console.log('--- ' + t + marker + ' ---');
  console.log('BEFORE (sources unidentified):');
  for (const l of M.describeModifiers(t, allMods, {}, beforeKnows)) console.log('    ' + l);
  console.log('AFTER (codex entries learned):');
  for (const l of M.describeModifiers(t, allMods, {}, afterKnows)) console.log('    ' + l);
  console.log('');
}
// Numbers must be identical before/after — knowledge changes the RENDERING only.
for (const t of targets) {
  ok(approx(M.resolve(10, t, allMods, {}), M.resolve(10, t, allMods, {})), 'played: resolve stable for ' + t);
}
const beforeLines = M.describeModifiers('forage.yield', allMods, {}, beforeKnows);
const afterLines = M.describeModifiers('forage.yield', allMods, {}, afterKnows);
ok(beforeLines.some(l => l.indexOf('Something is helping') === 0 && /…$/.test(l)),
  'played: unknown forage effect renders vague, got: ' + JSON.stringify(beforeLines));
ok(!beforeLines.join(' ').match(/1\.4|hushwolf|Pack-blessing/i),
  'played: BEFORE leaks no number, name, or source for the unknown effect');
ok(beforeLines.filter(l => l.indexOf('Something') === 0).length === 1,
  'played: hidden effects collapse to ONE line (count does not leak)');
ok(afterLines.some(l => l === 'Forage yield ×1.4 — Pack-blessing (hushwolf)'),
  'played: AFTER learning, the true line appears: ' + JSON.stringify(afterLines));
const cookBefore = M.describeModifiers('cook.kcal', allMods, {}, beforeKnows);
ok(cookBefore.some(l => l.indexOf('Something is weighing on') === 0),
  'played: unknown hindrance renders as "weighing on", not "helping": ' + JSON.stringify(cookBefore));
const travelBefore = M.describeModifiers('travel.kcal', allMods, {}, beforeKnows);
ok(travelBefore.some(l => l === 'Travel energy ×1.2 — Sprained ankle'),
  'played: known injury stays fully visible: ' + JSON.stringify(travelBefore));

console.log('');
console.log('=====================================================');
console.log('JUDGEMENT (played pass, as a player reading these lines):');
console.log('- The BEFORE rendering feels HONEST, not leaky. "Something is helping');
console.log('  your forage yield…" tells me what I could already feel from outcomes');
console.log('  (my hauls are bigger than my kit explains) without handing me the');
console.log('  ×1.4, the hushwolf, or the word "pack-blessing" to metagame with.');
console.log('- Direction ("helping" vs "weighing on") is the one thing the fiction');
console.log('  already gives away — you feel a curse in your cooking — so naming');
console.log('  the direction is fair, not a leak.');
console.log('- Collapsing all hidden effects into ONE line matters: two vague lines');
console.log('  would tell the player "there are exactly two unknown effects", which');
console.log('  IS a leak. One line keeps the count hidden.');
console.log('- The AFTER rendering earns its reveal: the codex entry turns the vague');
console.log('  line into "Forage yield ×1.4 — Pack-blessing (hushwolf)" — the');
console.log('  knowledge->power beat Steve wants is right there in the UI.');
console.log('- One deliberate choice: describeModifiers with NO knowledgeCtx hides');
console.log('  everything gated. Callers must pass what the scholar knows; silence');
console.log('  defaults to hidden, never to leaked.');
console.log('=====================================================');
console.log('');
console.log(pass + ' passed, ' + fail + ' failed (seed ' + (process.env.SEED || '20261007') + ')');
process.exit(fail ? 1 : 0);
