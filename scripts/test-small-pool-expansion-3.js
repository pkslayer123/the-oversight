#!/usr/bin/env node
/* Queue-dry pool expansion 3 — assertions.
   Verifies the expansion-3 data changes:
   - foreignSpeech.json: 25 languages, all 11 dialogue categories, phrase shape,
     unique lines per (language, category)
   - synergies.json: 12 -> 18, schema-conformant, requires reference real ability
     ids, unique requires-pairs, discovery_method conformance
   - lifeseeds.json: regions 10 -> 14, events/wants/wounds 10 -> 15,
     skillOrigin fragments 19 -> 26, token hygiene, unique towns
   Run: node scripts/test-small-pool-expansion-3.js
   Exits non-zero on first failure. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA = path.join(__dirname, '..', 'src', 'data');
let pass = 0;
const ok = (cond, msg) => { assert(cond, msg); pass++; console.log('ok -', msg); };
const load = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

// ---------- 1. foreignSpeech ----------
{
 const f = load('foreignSpeech.json');
 const langs = Object.keys(f).filter(k => !k.startsWith('_'));
 ok(langs.length === 25, `foreignSpeech has 25 languages (got ${langs.length})`);
 const FULL = ['agree', 'confused', 'fewWords', 'laugh', 'need_danger', 'need_food', 'need_help', 'need_water', 'openers', 'questions', 'warm'];
 let phrases = 0, blocks = 0;
 for (const l of langs) {
  const have = Object.keys(f[l]).sort();
  ok(JSON.stringify(have) === JSON.stringify([...FULL].sort()), `${l}: has exactly the 11 dialogue categories`);
  for (const c of FULL) {
   if (c === 'fewWords') {
    ok(Array.isArray(f[l][c]) && f[l][c].every(s => typeof s === 'string' && s.length > 0), `${l}.fewWords: non-empty strings`);
    continue;
   }
   const pool = f[l][c];
   ok(Array.isArray(pool) && pool.length >= 2, `${l}.${c}: >=2 phrases`);
   const seen = new Set();
   for (const p of pool) {
    ok(typeof p.t === 'string' && p.t.length > 0, `${l}.${c}: t is non-empty string`);
    ok(typeof p.en === 'string' && p.en.length > 0, `${l}.${c}: en is non-empty string`);
    ok(p.kw && typeof p.kw === 'object' && !Array.isArray(p.kw), `${l}.${c}: kw is an object`);
    ok(!seen.has(p.t), `${l}.${c}: no duplicate native line "${p.t.slice(0, 24)}..."`);
    seen.add(p.t);
    phrases++;
   }
   blocks++;
  }
 }
 const partial = ['german', 'japanese', 'korean', 'vietnamese', 'tagalog', 'haitian_creole', 'thai', 'turkish', 'polish', 'ukrainian', 'bengali', 'amharic', 'indonesian', 'norwegian', 'yoruba', 'twi', 'swahili'];
 for (const l of partial) {
  for (const c of ['confused', 'laugh', 'need_help', 'need_water'])
   ok(f[l][c] && f[l][c].length === 3, `${l}.${c}: 3 new phrases present`);
 }
 ok(phrases > 0 && blocks === 25 * 10, `foreignSpeech: ${blocks} phrase blocks, ${phrases} phrases total`);
}

// ---------- 2. synergies ----------
{
 const s = load('synergies.json');
 ok(s.length === 18, `synergies 12 -> 18 (got ${s.length})`);
 const abilities = load('abilities.json');
 const abilityIds = new Set(abilities.map(a => a.id));
 ok(abilities.length === 69, `abilities pool still 69 (got ${abilities.length})`);
 const ALLOWED_TOP = new Set(['id', 'name', 'requires', 'minLevel', 'modifiers', 'flags', 'flavor', 'discovery', 'discovery_method']);
 const ids = new Set(), pairs = new Set();
 const NEW_IDS = ['field_pharmacy', 'surgeons_calm', 'critter_network', 'cornered_fury', 'clean_plate', 'polyglots_ledger'];
 for (const syn of s) {
  for (const req of ['id', 'name', 'requires', 'discovery'])
   ok(syn[req] !== undefined && syn[req] !== null, `synergy ${syn.id || '?'}: required field '${req}'`);
  for (const k of Object.keys(syn))
   ok(ALLOWED_TOP.has(k), `synergy ${syn.id}: no unknown field '${k}'`);
  ok(!ids.has(syn.id), `synergy ${syn.id}: unique id`);
  ids.add(syn.id);
  ok(Array.isArray(syn.requires) && syn.requires.length === 2 && syn.requires.every(r => typeof r === 'string'),
   `synergy ${syn.id}: requires is 2 ability ids`);
  for (const r of syn.requires)
   ok(abilityIds.has(r), `synergy ${syn.id}: requires references real ability '${r}'`);
  const pairKey = [...syn.requires].sort().join('+');
  ok(!pairs.has(pairKey), `synergy ${syn.id}: unique requires-pair (${pairKey})`);
  pairs.add(pairKey);
  ok(Array.isArray(syn.modifiers), `synergy ${syn.id}: modifiers is array`);
  for (const m of syn.modifiers) {
   ok(typeof m.target === 'string' && m.target.includes('.'), `synergy ${syn.id}: modifier target '${m.target}' dotted`);
   ok(['add', 'multiply'].includes(m.op), `synergy ${syn.id}: modifier op '${m.op}' valid`);
   ok(typeof m.value === 'number' && !Number.isNaN(m.value), `synergy ${syn.id}: modifier value is number`);
  }
  const dm = syn.discovery_method;
  ok(dm && typeof dm === 'object', `synergy ${syn.id}: discovery_method present`);
  ok(['sequential', 'simultaneous', 'sustained'].includes(dm.type), `synergy ${syn.id}: discovery_method.type '${dm.type}' valid`);
  ok(typeof dm.hint === 'string' && dm.hint.length > 0, `synergy ${syn.id}: hint present`);
  ok(typeof dm.tease1 === 'string' && dm.tease1.length > 0, `synergy ${syn.id}: tease1 present`);
  ok(typeof dm.tease2 === 'string' && dm.tease2.length > 0, `synergy ${syn.id}: tease2 present`);
  if (dm.type === 'sequential') {
   ok(Array.isArray(dm.order) && dm.order.length === 2 && dm.order.every(o => syn.requires.includes(o)),
    `synergy ${syn.id}: sequential order matches requires`);
  }
  if (syn.flags !== undefined) ok(Array.isArray(syn.flags), `synergy ${syn.id}: flags is array`);
 }
 for (const nid of NEW_IDS) ok(ids.has(nid), `synergy: new entry '${nid}' present`);
}

// ---------- 3. lifeseeds ----------
{
 const ls = load('lifeseeds.json');
 ok(ls.regions.length === 14, `lifeseeds regions 10 -> 14 (got ${ls.regions.length})`);
 const rids = new Set(), towns = new Set();
 for (const r of ls.regions) {
  ok(typeof r.id === 'string' && r.id.length > 0, `region ${r.id}: id present`);
  ok(!rids.has(r.id), `region ${r.id}: unique id`);
  rids.add(r.id);
  ok(typeof r.label === 'string' && r.label.length > 0, `region ${r.id}: label`);
  ok(typeof r.land === 'string' && r.land.length > 0, `region ${r.id}: land`);
  ok(Array.isArray(r.matchTags) && (r.matchTags.length >= 1 || r.id === 'far_away'), `region ${r.id}: matchTags non-empty (far_away is the empty fallback)`);
  ok(Array.isArray(r.towns) && (r.towns.length === 6 || (r.id === 'far_away' && r.towns.length === 4)), `region ${r.id}: towns count (6, or 4 for far_away fallback)`);
  ok(Array.isArray(r.workplaces) && r.workplaces.length === 4, `region ${r.id}: 4 workplaces`);
  for (const t of r.towns) {
   // 'jackson' pre-exists in deep_south (MS) and mountain_west (WY) — both real;
   // new regions must not introduce any other cross-region town duplicate.
   ok(!towns.has(t.toLowerCase()) || t.toLowerCase() === 'jackson', `region ${r.id}: town '${t}' unique across regions`);
   towns.add(t.toLowerCase());
  }
 }
 for (const nid of ['alaska', 'hawaii', 'florida', 'ozarks']) ok(rids.has(nid), `lifeseeds: new region '${nid}' present`);

 const TOKENS = new Set(['first', 'town', 'workplace', 'place', 'kin', 'street']);
 const checkFrag = (s, where) => {
  ok(typeof s === 'string' && s.length > 0, `${where}: fragment non-empty`);
  for (const m of s.matchAll(/\{([a-z_]+)\}/g))
   ok(TOKENS.has(m[1]), `${where}: known token {${m[1]}}`);
 };
 const noDup = (arr, label) => {
  const seen = new Set();
  for (const x of arr) { ok(!seen.has(x), `${label}: no duplicate "${String(x).slice(0, 40)}..."`); seen.add(x); }
 };
 ok(ls.events.length === 15, `lifeseeds events 10 -> 15 (got ${ls.events.length})`);
 ok(ls.wants.length === 15, `lifeseeds wants 10 -> 15 (got ${ls.wants.length})`);
 ok(ls.wounds.length === 15, `lifeseeds wounds 10 -> 15 (got ${ls.wounds.length})`);
 for (const [i, e] of ls.events.entries()) checkFrag(e, `event#${i}`);
 for (const [i, w] of ls.wants.entries()) checkFrag(w, `want#${i}`);
 for (const [i, w] of ls.wounds.entries()) checkFrag(w, `wound#${i}`);
 noDup(ls.events, 'events'); noDup(ls.wants, 'wants'); noDup(ls.wounds, 'wounds');
 let frags = 0;
 const soKeys = Object.keys(ls.skillOrigins).sort();
 ok(JSON.stringify(soKeys) === JSON.stringify(['food', 'forecast', 'medicinal', 'mending', 'navigation', 'tracking', 'trapping'].sort()),
  'lifeseeds skillOrigins keys unchanged');
 for (const [k, arr] of Object.entries(ls.skillOrigins)) {
  ok(Array.isArray(arr) && arr.length >= 2, `skillOrigins.${k}: >=2 fragments`);
  arr.forEach((f, i) => checkFrag(f, `skillOrigins.${k}#${i}`));
  frags += arr.length;
 }
 ok(frags === 26, `lifeseeds skillOrigin fragments 19 -> 26 (got ${frags})`);
}

console.log(`\nEXPANSION-3: ALL ${pass} ASSERTIONS PASSED`);
