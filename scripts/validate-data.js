#!/usr/bin/env node
/* Content gate: validates every JSON file in src/data/ against src/data/schemas.json.
   Fails loudly on: missing/unknown fields, type mismatches, out-of-range numbers,
   duplicate ids, dangling cross-references. Run: node scripts/validate-data.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data');
const errors = [];
const err = (file, msg) => errors.push(`[${file}] ${msg}`);

// file -> schema key
const FILES = {
  'plants.json': 'plant', 'monsters.json': 'monster', 'abilities.json': 'ability',
  'villagers.json': 'villager', 'items.json': 'item', 'events.json': 'gameEvent',
  'systemMessages.json': 'systemMessage', 'shop.json': 'shopItem',
  'trials.json': 'trial', 'biomes.json': 'biome',
  'relicEnhancements.json': 'relicEnhancement',
};

function checkType(val, spec, where) {
  if (spec.endsWith('?') && (val === undefined || val === null)) return true;
  const s = spec.replace(/\?$/, '');
  if (s === 'string') return typeof val === 'string';
  if (s === 'number') return typeof val === 'number' && !Number.isNaN(val);
  if (s === 'object') return val && typeof val === 'object' && !Array.isArray(val);
  if (s === 'string[]') return Array.isArray(val) && val.every(v => typeof v === 'string');
  if (s === 'string[5..5]') return Array.isArray(val) && val.length === 5 && val.every(v => typeof v === 'string');
  if (s === 'string[3..3]') return Array.isArray(val) && val.length === 3 && val.every(v => typeof v === 'string');
  const arr = s.match(/^string\[\]$/); if (arr) return Array.isArray(val);
  const rng = s.match(/^number\[(\d+)\.\.(\d+)\]$/);
  if (rng) return typeof val === 'number' && val >= +rng[1] && val <= +rng[2];
  const tup2 = s.match(/^number\[2\.\.2\]$/);
  if (tup2) return Array.isArray(val) && val.length === 2 && val.every(v => typeof v === 'number');
  if (Array.isArray(spec)) return false; // handled as enum below
  return true;
}

function validateEntry(entry, schema, file, idx) {
  const where = `${file}#${idx} (${entry.id || 'no-id'})`;
  for (const f of schema.required || []) {
    if (entry[f] === undefined || entry[f] === null) err(file, `${where}: missing required field '${f}'`);
  }
  for (const [field, spec] of Object.entries(schema.types || {})) {
    const val = entry[field];
    if (val === undefined || val === null) continue;
    if (Array.isArray(spec)) { // enum OR array-of-shape
      if (spec.length === 1 && typeof spec[0] === 'object' && spec[0] !== null) {
        // array-of-shape: [{...}] means "array of objects shaped like spec[0]"
        if (!Array.isArray(val)) { err(file, `${where}: field '${field}' must be an array`); continue; }
        const shape = spec[0];
        val.forEach((el, ei) => {
          for (const [k, ks] of Object.entries(shape)) {
            if (Array.isArray(ks)) { // nested enum inside shape
              if (el[k] !== undefined && !ks.includes(el[k]))
                err(file, `${where}: '${field}[${ei}].${k}' not in enum ${JSON.stringify(ks)}`);
            } else if (!checkType(el[k], ks, where)) {
              err(file, `${where}: '${field}[${ei}].${k}' type/range mismatch (spec ${ks})`);
            }
          }
        });
        continue;
      }
      const ok = Array.isArray(val) ? val.every(v => spec.includes(v)) : spec.includes(val);
      if (!ok) err(file, `${where}: field '${field}' value not in enum ${JSON.stringify(spec)}`);
      continue;
    }
    if (typeof spec === 'object' && !Array.isArray(spec)) { // nested object schema
      if (field === 'attack' || field === 'edible') {
        for (const [k, ks] of Object.entries(spec)) {
          if (!checkType(val[k], ks, where)) err(file, `${where}: '${field}.${k}' type/range mismatch (spec ${ks})`);
        }
      } else if (field === 'codexStages') {
        for (const k of ['unknown', 'observed', 'slain'])
          if (typeof val[k] !== 'string') err(file, `${where}: codexStages.${k} must be string`);
      } else if (field === 'unlock') {
        if (!['granted', 'trial', 'discovery', 'mentorship'].includes(val.type))
          err(file, `${where}: unlock.type invalid`);
      } else if (field === 'effect') {
        for (const [k, ks] of Object.entries(spec)) {
          if (Array.isArray(ks)) {
            if (val[k] !== undefined && !ks.includes(val[k]))
              err(file, `${where}: 'effect.${k}' not in enum ${JSON.stringify(ks)}`);
          } else if (!checkType(val[k], ks, where)) err(file, `${where}: 'effect.${k}' type/range mismatch (spec ${ks})`);
        }
      }
      continue;
    }
    if (!checkType(val, spec, where)) err(file, `${where}: field '${field}' type/range mismatch (spec ${spec})`);
  }
  const allowed = new Set(Object.keys(schema.types || {}));
  for (const k of Object.keys(entry)) {
    if (k.startsWith('$')) continue;
    if (!allowed.has(k)) err(file, `${where}: unknown field '${k}' (typo?)`);
  }
}

function main() {
  const schemas = JSON.parse(fs.readFileSync(path.join(DATA, 'schemas.json'), 'utf8'));
  const ids = {}; // file -> Set of ids, for cross-reference checks
  for (const [file, key] of Object.entries(FILES)) {
    const p = path.join(DATA, file);
    if (!fs.existsSync(p)) { err(file, 'missing file (skipped)'); continue; }
    let arr;
    try { arr = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { err(file, `invalid JSON: ${e.message}`); continue; }
    if (!Array.isArray(arr)) { err(file, 'top level must be an array'); continue; }
    ids[key] = new Set();
    arr.forEach((e, i) => {
      validateEntry(e, schemas[key], file, i);
      if (e.id) {
        if (ids[key].has(e.id)) err(file, `duplicate id '${e.id}'`);
        ids[key].add(e.id);
      }
    });
  }
  // cross-references
  const has = (key, id) => ids[key] && ids[key].has(id);
  const ref = (file, where, key, id) => { if (id && !has(key, id)) err(file, `${where}: dangling reference '${id}' -> ${key}`); };
  const get = f => { const p = path.join(DATA, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; };
  get('villagers.json').forEach(v => (v.items || []).forEach(id => ref('villagers.json', v.id, 'item', id)));
  get('plants.json').forEach(pl => (pl.biomes || []).forEach(b => ref('plants.json', pl.id, 'biome', b)));
  get('monsters.json').forEach(m => (m.biomes || []).forEach(b => ref('monsters.json', m.id, 'biome', b)));
  get('trials.json').forEach(t => (t.offers || []).forEach(id => ref('trials.json', t.id, 'ability', id)));
  get('items.json').forEach(it => (it.bondThresholds || []).forEach(bt => (bt.offers || []).forEach(id => ref('items.json', it.id, 'relicEnhancement', id))));
  get('events.json').forEach(e => (e.choices || []).forEach(c => (c.outcomes || []).forEach(() => {}))); // effects are freeform strings for now

  if (errors.length) {
    console.error(`\nCONTENT GATE: ${errors.length} error(s)\n` + errors.map(e => '  ✗ ' + e).join('\n') + '\n');
    process.exit(1);
  }
  const counts = Object.entries(ids).map(([k, s]) => `${k}:${s.size}`).join(' ');
  console.log(`CONTENT GATE: OK — ${counts}`);
}
main();
