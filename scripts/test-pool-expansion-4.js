// Pool expansion 4 (Steve 2026-10-06): queue-dry directive — grow the next
// smallest content pools. Baselines measured 2026-10-06 before expansion:
//   cell_defs.buildingRooms: 6 -> 12
//   lifeseeds.places kinds: 4 -> 8
//   lifeseeds.skillOrigins smallest categories (forecast/medicinal/mending/
//     navigation): 3 -> 6; food/tracking/trapping 5/5/4 -> 7/7/6
//   books: 12 -> 18
// Asserts all content loads, counts increased vs baseline, ids are unique,
// book unlocks reference real ids, and knowledge-gating flags hold
// (unlocks are granted on read, never shown on find).
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'src', 'data');
const load = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('PASS', msg); else { fails++; console.log('FAIL', msg); } };

// ---- POOL 1: buildingRooms ----
const cd = load('cell_defs.json');
ok(Object.keys(cd.buildingRooms).length >= 12, `buildingRooms count ${Object.keys(cd.buildingRooms).length} >= 12 (baseline 6)`);
const expectRooms = ['gym','class','office','bay','sanct','base','kitchen','infirmary','library','workshop','dormitory','cellar'];
for (const r of expectRooms) {
  const room = cd.buildingRooms[r];
  ok(!!room, `room exists: ${r}`);
  ok(room && typeof room.name === 'string' && room.name.length > 0, `room name set: ${r}`);
  const mods = (room && room.modifiers) || {};
  for (const [mkey, mdef] of Object.entries(mods)) {
    ok(Array.isArray(mdef.values) && Array.isArray(mdef.weights) &&
       mdef.values.length === mdef.weights.length, `${r}.${mkey} values/weights aligned`);
    const sum = mdef.weights.reduce((a, b) => a + b, 0);
    ok(Math.abs(sum - 1) < 1e-9, `${r}.${mkey} weights sum to 1 (${sum})`);
    ok(typeof mdef.visible === 'boolean', `${r}.${mkey} visible flag present`);
    if (mdef.visible === false) ok(mdef.discover === 'search', `${r}.${mkey} hidden modifier is search-discoverable`);
  }
}

// ---- POOL 2: lifeseeds places + skillOrigins ----
const ls = load('lifeseeds.json');
ok(ls.places.length >= 8, `places kinds ${ls.places.length} >= 8 (baseline 4)`);
const expectKinds = ['home','cache','water','work','hideout','market','grave','road'];
const kindSet = new Set(ls.places.map(p => p.kind));
for (const k of expectKinds) ok(kindSet.has(k), `place kind exists: ${k}`);
for (const p of ls.places) {
  ok(Array.isArray(p.names) && p.names.length >= 3, `place kind ${p.kind} has >=3 names`);
  ok(p.names.every(n => typeof n === 'string' && n.length > 0), `place kind ${p.kind} names non-empty`);
  // token check: only tokens the generator fills in ({first},{town},{workplace},{street},{place})
  for (const n of p.names) {
    const bad = (n.match(/\{[a-z]+\}/g) || []).filter(t => !['{first}','{town}','{workplace}','{street}','{place}','{kin}'].includes(t));
    ok(bad.length === 0, `place kind ${p.kind} name tokens valid (${n.slice(0,40)})`);
  }
}
const so = ls.skillOrigins;
const baseline = { food: 5, forecast: 3, medicinal: 3, mending: 3, navigation: 3, tracking: 5, trapping: 4 };
for (const [cat, base] of Object.entries(baseline)) {
  ok(so[cat].length > base, `skillOrigins.${cat} ${so[cat].length} > baseline ${base}`);
  ok(so[cat].length >= 6, `skillOrigins.${cat} >= 6`);
  ok(new Set(so[cat]).size === so[cat].length, `skillOrigins.${cat} no duplicates`);
}

// ---- POOL 3: books ----
const bk = load('books.json');
ok(bk.length >= 18, `books count ${bk.length} >= 18 (baseline 12)`);
const ids = new Set(bk.map(b => b.id));
ok(ids.size === bk.length, 'book ids unique');
const plants = new Set(load('plants.json').map(p => p.id));
const animals = new Set(load('animals.json').map(a => a.id));
const recipes = new Set(load('recipes.json').map(r => r.id));
const skills = new Set(load('knowledge.json').map(k => k.id));
const newBooks = ['hedge_witch_herbarium','night_walkers_guide','birds_of_the_scattering','fishers_ledger','mend_and_make_do','gardeners_winter'];
for (const b of bk) {
  ok(b.name && b.description && b.flavor, `book ${b.id} has name/description/flavor`);
  ok(b.unlocks && typeof b.unlocks === 'object', `book ${b.id} has unlocks object`);
  const u = b.unlocks;
  for (const p of (u.plants || [])) ok(plants.has(p), `book ${b.id} plant unlock valid: ${p}`);
  for (const a of (u.animals || [])) ok(animals.has(a), `book ${b.id} animal unlock valid: ${a}`);
  for (const r of (u.recipes || [])) ok(recipes.has(r), `book ${b.id} recipe unlock valid: ${r}`);
  for (const s of (u.skills || [])) ok(skills.has(s), `book ${b.id} skill unlock valid: ${s}`);
  if (u.skills && u.skills.length) ok(u.skillLevel >= 1, `book ${b.id} skill unlock has skillLevel (knowledge gate)`);
}
for (const id of newBooks) ok(ids.has(id), `new book present: ${id}`);
// knowledge-gating law: unlocks must never appear in find-time fields
for (const b of bk) {
  const visible = `${b.name} ${b.description} ${b.flavor}`.toLowerCase();
  for (const s of ((b.unlocks || {}).skills || [])) {
    const words = s.split('_');
    ok(!words.every(w => visible.includes(w)), `book ${b.id}: skill unlock "${s}" not leaked in find-time text`);
  }
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
