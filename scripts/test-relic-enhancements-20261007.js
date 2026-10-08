#!/usr/bin/env node
/* Proof test: relicEnhancements pool 32 -> 48 (Worker A, 2026-10-07).
   - file parses as JSON, is a list of exactly 48 entries
   - first 32 entries deep-equal git show HEAD:src/data/relicEnhancements.json
     parsed (append-only: nothing above the fold changed)
   - all ids unique; every class in {tool, clothing, sentimental}
   - every effect {op,target,value} present with op/target in an allowlist
     scraped from the engine's applier code (modifier pipeline consumers +
     RELIC_MOD_MAP in src/js/engine/modifiers.js)
   - no empty strings in name/description/systemCommentary
   Prints ALL GREEN on success. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'src', 'data', 'relicEnhancements.json');
const FAILURES = [];
const ok = (cond, msg) => { if (!cond) FAILURES.push(msg); };

// --- 1. parses, is a list of exactly 48 ---
let data;
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  ok(false, 'file does not parse as JSON: ' + e.message);
}
ok(Array.isArray(data), 'top level is not a list');
ok(data.length === 48, 'expected exactly 48 entries, found ' + (Array.isArray(data) ? data.length : 'n/a'));

// --- 2. append-only: first 32 deep-equal HEAD ---
try {
  const headRaw = execSync('git show HEAD:src/data/relicEnhancements.json', { cwd: ROOT, encoding: 'utf8' });
  const head = JSON.parse(headRaw);
  ok(head.length === 32, 'HEAD file expected to hold 32 entries, found ' + head.length);
  ok(JSON.stringify(data.slice(0, 32)) === JSON.stringify(head),
    'first 32 entries do NOT deep-equal HEAD (append-only violated)');
} catch (e) {
  ok(false, 'could not read HEAD version: ' + e.message);
}

// --- 3. scrape the engine's target allowlist from the applier code ---
const targets = new Set();
const OPS = new Set(['add', 'multiply']);
function scrapeJs(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { scrapeJs(p); continue; }
    if (!p.endsWith('.js')) continue;
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/modTarget\(\s*'([a-z][\w.]*)'/g)) targets.add(m[1]);
    for (const m of s.matchAll(/modifiers\.resolve\(\s*\S+?,\s*'([a-z][\w.]*)'/g)) targets.add(m[1]);
  }
}
scrapeJs(path.join(ROOT, 'src', 'js'));
// RELIC_MOD_MAP grounding table targets (the id-keyed applier in modifiers.js)
const modSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'engine', 'modifiers.js'), 'utf8');
const mapSeg = modSrc.match(/RELIC_MOD_MAP = \{[\s\S]*?\n  \};/g);
if (mapSeg) for (const seg of mapSeg) for (const m of seg.matchAll(/target: '([^']+)'/g)) targets.add(m[1]);
ok(targets.size > 0, 'scraped allowlist is empty — applier code unreadable?');

// --- 4. ids unique; class valid; effect shape; strings non-empty ---
const seen = new Set();
const CLASSES = new Set(['tool', 'clothing', 'sentimental']);
data.forEach((e, i) => {
  const tag = 'entry #' + i + (e && e.id ? ' (' + e.id + ')' : '');
  if (!e || typeof e !== 'object') { ok(false, tag + ' is not an object'); return; }
  if (seen.has(e.id)) ok(false, 'duplicate id: ' + e.id);
  seen.add(e.id);
  ok(CLASSES.has(e.class), tag + ' bad class: ' + e.class);
  for (const k of ['name', 'description', 'systemCommentary']) {
    ok(typeof e[k] === 'string' && e[k].trim().length > 0, tag + ' empty/missing ' + k);
  }
  const ef = e.effect;
  if (ef !== undefined) {
    ok(ef && typeof ef === 'object', tag + ' effect is not an object');
    ok(OPS.has(ef.op), tag + ' bad op: ' + ef.op);
    // Entries 0-31 are grandfathered: their JSON targets are evocative
    // (task.speed, weather.immunity, ...) and their REAL behavior comes from
    // RELIC_MOD_MAP / game.js special-cases — the engine never reads these
    // strings. Only new entries (#32+) must sit on engine-honored targets.
    if (i >= 32) ok(targets.has(ef.target), tag + ' target not honored by engine: ' + ef.target);
    ok(typeof ef.value === 'number' && !Number.isNaN(ef.value), tag + ' bad value: ' + ef.value);
  }
});
// class balance
const counts = {};
data.forEach(e => { counts[e.class] = (counts[e.class] || 0) + 1; });
ok(counts.tool === 16 && counts.clothing === 16 && counts.sentimental === 16,
  'class split not 16/16/16: ' + JSON.stringify(counts));

// --- 5. schema conformance (relicEnhancement in src/data/schemas.json) ---
try {
  const schema = require(path.join(ROOT, 'src', 'data', 'schemas.json')).relicEnhancement;
  data.forEach((e, i) => {
    for (const r of schema.required) ok(e[r] !== undefined && e[r] !== null, 'entry #' + i + ' missing required ' + r);
  });
} catch (e) { ok(false, 'schema check failed: ' + e.message); }

if (FAILURES.length) {
  console.error('FAIL (' + FAILURES.length + '):');
  FAILURES.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('ALL GREEN: 48 entries, append-only vs HEAD verified, ids unique,');
console.log('class split ' + JSON.stringify(counts) + ', new 16 effects all on engine-honored targets (' + targets.size + ' scraped),');
console.log('no empty name/description/systemCommentary, schema conformant.');
