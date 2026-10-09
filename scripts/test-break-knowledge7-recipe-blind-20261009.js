// BREAK-IT knowledge 7th pass — BREAK 28 (DEAD/UI-UNREACHABLE) + BREAK 29 (PROBING LEAK).
//
// BREAK 28: commit a208a9e3 added gear-recipe L1 discovery (noteGearHandled on
// equip / corpse loot) and a full blind-craft engine path in craft() — L1 35%
// blind attempts with materials at risk, success teaches L2 ("PRACTICE: your
// hands learn what your eyes only guessed at"). But the ONLY craft UI (pack
// render, app.js) filters `level >= 3`, and no codex RECIPES section exists.
// The L1 grant narrates once, then strands: no button, no re-read, no way to
// attempt the blind craft the engine comment promises ("blind is never 'button
// disabled' — it's 'button honest'"). L2 is unreachable at runtime (its only
// grant is the unreachable blind success). Alien-Players class: engine without UI.
//
// BREAK 29: once the blind path IS attempted, craft()'s missing-materials check
// runs BEFORE any cost and names each missing material ("Need 1 branch (have
// 0)"). At L1 the materials list is L2 knowledge — a player with an empty pack
// can probe one free attempt per material and extract the full L2 list at zero
// cost. The blind attempt must stay blind.
//
// FIX 28: the pack Craft section lists recipes at level >= 1 with honest
// buttons — L1 "Try blind (35%)" with materials hidden ("materials unknown"),
// L2 "Try (85%)" with materials shown (L2 text teaches them), L3 "Make" as before.
// FIX 29: at blind (L1) the missing-materials refusal is vague and honest —
// no material names leak; at L2+ the detailed "Need X (have Y)" stays.
//
// This test stages recipe knowledge in the engine, extracts the SHIPPED filter
// + row template from app.js (not copies), and asserts reachability + gating.
// PRE-FIX: RED (L1/L2 filtered out of the UI; probing names materials).
// Usage: node scripts/test-break-knowledge7-recipe-blind-20261009.js (SEED override)
'use strict';
const h = require('./break-monsters-harness.js');
const fs = require('fs');
const path = require('path');
const SEEDS = [20261009, 7, 424242];

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) fails.push(name);
}

// brace-matched ${...} extractor (from test-knowledge-codex-sections-20261008.js)
function extractInterp(src, marker) {
  // find the nearest '${' before the marker that encloses it
  let j = src.indexOf(marker);
  if (j === -1) return null;
  let from = j;
  while (true) {
    from = src.lastIndexOf('${', from - 1);
    if (from === -1) return null;
    const expr = forwardInterp(src, from);
    if (expr && expr.containsMarker) return expr.text;
  }
}
function forwardInterp(src, start) {
  let i = start + 2, depth = 1, inStr = null;
  const tplStack = [];
  const markerAt = src.indexOf('Craft</h3>', start);
  while (i < src.length && depth > 0) {
    const c = src[i], n = src[i + 1];
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (inStr === '`' && c === '$' && n === '{') { tplStack.push(depth); depth++; i += 2; inStr = null; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (tplStack.length && depth === tplStack[tplStack.length - 1]) { tplStack.pop(); inStr = '`'; }
    }
    i++;
  }
  if (depth !== 0) return null;
  const text = src.slice(start + 2, i - 1);
  return { text, containsMarker: markerAt !== -1 && markerAt < i };
}

async function run(seed) {
  global.window = global; // loadGame() deletes it after each load; re-stub per seed
  const G = await h.freshGame(seed);
  const lines = [];
  G.say = (l) => { lines.push(String(l)); };
  // isolate the mechanic: no NPC turns / fights during repeated craft attempts
  G.tickAction = () => undefined;
  const Game = G;
  const out = {};

  // stage recipe knowledge: L1 (gear handled), L2 (practiced), L3 (taught)
  G.state.codex.recipes = {
    hunting_spear: { level: 1, learnedDay: 1, via: 'discovery' },
    bow: { level: 2, learnedDay: 1, via: 'discovery' },
    snare: { level: 3, learnedDay: 1, via: 'taught' },
  };

  const appSrc = fs.readFileSync(path.join(h.ROOT, 'src/js/app.js'), 'utf8');

  // ---- the SHIPPED filter (single line in the pack render) ----
  const fm = appSrc.match(/const (\w+) = (recipes\.filter\(r => [^;]*\));/);
  check('craft filter line found in shipped app.js', !!fm, true);
  if (!fm) return out;
  const filterName = fm[1], filterRhs = fm[2];
  const listed = new Function('Game', 'recipes', `return (${filterRhs}).map(r => r.id);`)(Game, G.data.recipes);
  out.b28_L1_listed = listed.includes('hunting_spear');
  out.b28_L2_listed = listed.includes('bow');
  out.b28_L3_listed = listed.includes('snare');
  check('B28 L1 recipe reaches the Craft UI', out.b28_L1_listed, true);
  check('B28 L2 recipe reaches the Craft UI', out.b28_L2_listed, true);
  check('B28 L3 recipe still reaches the Craft UI (control)', out.b28_L3_listed, true);

  // ---- the SHIPPED row template ----
  const tpl = extractInterp(appSrc, 'Craft</h3>');
  check('craft row template extracted from shipped app.js', !!tpl, true);
  let html = '';
  if (tpl) {
    const objs = new Function('Game', 'recipes', `return (${filterRhs});`)(Game, G.data.recipes);
    html = new Function('Game', filterName, `return (${tpl});`)(Game, objs);
  }
  const rowFor = (nm) => (html.split('<p class="small">').find(c => c.includes(nm)) || '');
  const l1row = rowFor('Hunting spear'), l2row = rowFor('Bow'), l3row = rowFor('Snare');
  check('B28 L1 row renders (name known — the grant narrated it)', !!l1row, true);
  check('B28 L1 row hides materials (L2 knowledge)', l1row.includes('branch'), false);
  check('B28 L1 row has an attempt button', l1row.includes('data-craft="hunting_spear"'), true);
  check('B28 L1 button is honest about blindness', /blind/i.test(l1row), true);
  check('B28 L2 row shows materials (L2 text teaches them)', l2row.includes('vine'), true);
  check('B28 L2 row has an attempt button', l2row.includes('data-craft="bow"'), true);
  check('B28 L3 row keeps its Make button (control)', l3row.includes('data-craft="snare"') && />Make</.test(l3row), true);

  // ---- engine half of B28: the blind path exists and teaches L2 ----
  G.state.codex.recipes = { hunting_spear: { level: 1, learnedDay: 1, via: 'discovery' } };
  const giveMats = () => {
    G.state.scholar.inventory = [
      { material: 'branch', name: 'Branch', units: 5, kg: 0.5, spoilDay: 9999 },
      { material: 'stone', name: 'Stone', units: 5, kg: 0.4, spoilDay: 9999 },
      { material: 'vine', name: 'Vine', units: 5, kg: 0.1, spoilDay: 9999 },
    ];
  };
  giveMats();
  lines.length = 0;
  G.craft('hunting_spear');
  out.b28_engine_accepts_blind = lines.some(l => /only SEEN/.test(l)) && !lines.some(l => /don't know how to make/.test(l));
  check('B28 engine accepts the L1 blind attempt (control — engine was never broken)', out.b28_engine_accepts_blind, true);
  // drive the 35% loop: success must teach L2 (the documented PRACTICE beat)
  let tries = 0;
  while (((G.state.codex.recipes.hunting_spear || {}).level || 0) < 2 && tries < 40) {
    giveMats();
    try { G.craft('hunting_spear'); } catch (e) { out.craftThrew = String(e && e.message); }
    tries++;
  }
  out.b28_blind_success_teaches_L2 = ((G.state.codex.recipes.hunting_spear || {}).level || 0) >= 2;
  check(`B28 a successful blind craft teaches L2 (took ${tries} tries)`, out.b28_blind_success_teaches_L2, true);
  if (out.craftThrew) check('B28 craft loop threw', out.craftThrew, undefined);

  // ---- B29: blind material probing ----
  G.state.codex.recipes = { hunting_spear: { level: 1, learnedDay: 1, via: 'discovery' } };
  G.state.scholar.inventory = []; // empty pack: nothing to spend, nothing to lose
  lines.length = 0;
  const ret = G.craft('hunting_spear');
  out.b29_refused = ret === null;
  check('B29 blind attempt with no materials is refused', out.b29_refused, true);
  const leaked = lines.some(l => /branch|stone|vine/.test(l));
  check('B29 refusal names NO materials (the L2 list stays hidden)', leaked, false);
  check('B29 refusal is honest about not knowing', lines.some(l => /don't know what.*made of|best guess/i.test(l)), true);
  // control: at L2 the detailed help is honest (materials are known)
  G.state.codex.recipes = { hunting_spear: { level: 2, learnedDay: 1, via: 'discovery' } };
  G.state.scholar.inventory = [];
  lines.length = 0;
  G.craft('hunting_spear');
  check('B29 L2 refusal still names the missing material (control — known at L2)', lines.some(l => /branch/.test(l)), true);

  return out;
}

(async () => {
  for (const seed of SEEDS) {
    console.log(`\n=== SEED ${seed} ===`);
    fails.length = 0;
    try { await run(seed); } catch (e) { console.log('HARNESS ERROR: ' + (e && e.stack || e)); fails.push('harness'); }
    console.log(fails.length ? `SEED ${seed}: ${fails.length} FAILURES` : `SEED ${seed}: ALL GREEN`);
    if (fails.length) process.exitCode = 1;
  }
})();
