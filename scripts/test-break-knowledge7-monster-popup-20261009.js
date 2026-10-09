// BREAK-IT knowledge 7th pass — BREAK 30 (HONESTY): map monster popup leaks
// the true name at codex stage 'observed'.
//
// app.js map popup (tap a monster): `known = Game.monsterKnown(mon.id)` —
// canShow('monster', id, 'name') is true at stage 'observed'/'slain' — then
// prints mdef.name, the TRUE name. But stage 'observed' is reached by surviving
// a single telegraph (game.js beam-windup witness) or one STUDY action — long
// before the village naming debate, pre-System. Canon (MEMORY/DESIGN) and
// monsterDisplayName's own contract: "before naming, only a strange
// descriptor"; "The TRUE name never shows pre-System." Every other surface
// (fighters, corpses, gossip, codex) routes through monsterDisplayName — the
// popup used the parallel monsterKnown gate instead. Two name gates disagreed;
// the popup trusted the wrong one.
//
// FIX: the popup calls it what the UI calls it — Game.monsterDisplayName
// (village name, else System true name once arrived, else the descriptor).
//
// This test extracts the SHIPPED isMon branch from app.js (brace-matched, not
// copied), evals it against the live Game with staged codex states, and
// asserts the rendered popup text.
// PRE-FIX: RED (popup prints "Hushpuppy" at 'observed', pre-naming).
// Usage: node scripts/test-break-knowledge7-monster-popup-20261009.js (SEED override)
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

// extract the `} else if (isMon) { ... }` block inner text from app.js
function extractIsMon(src) {
  const marker = '} else if (isMon) {';
  const mi = src.indexOf(marker);
  if (mi === -1) return null;
  let i = mi + marker.length - 1; // the '{'
  let depth = 0, inStr = null;
  const tplStack = [];
  const open = i;
  while (i < src.length) {
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
      if (depth === 0) return src.slice(open + 1, i);
    }
    i++;
  }
  return null;
}

async function run(seed) {
  global.window = global; // loadGame() deletes it after each load; re-stub per seed
  const G = await h.freshGame(seed);
  const Game = G; // the shipped branch references `Game`
  const mdef = G.data.monsters.find(m => m.id === 'hushwolf') || {};
  const TRUE = mdef.name || 'Hushpuppy';           // the System's true name
  const DESCR = mdef.unknown || 'a dog-shaped silence at the treeline';

  const appSrc = fs.readFileSync(path.join(h.ROOT, 'src/js/app.js'), 'utf8');
  const inner = extractIsMon(appSrc);
  check('isMon popup branch extracted from shipped app.js', !!inner, true);
  if (!inner) return;

  // eval the shipped statements with staged game state
  const popupDesc = (distVal) => {
    let desc = '';
    const actions = { push() {} };
    const mon = { id: 'hushwolf' };
    const dist = distVal;
    eval(inner); // eslint-disable-line no-eval
    return desc;
  };

  // ATTACK: observed (one telegraph survived) — no village name, pre-System
  G.state.systemArrived = false;
  G.state.codex.monsters = { hushwolf: { stage: 'observed', proposals: {}, attacksSeen: ['howl'], roundsSeen: 1 } };
  const d1 = popupDesc(5);
  check('B30 observed popup does NOT print the true name', d1.includes(TRUE), false);
  check('B30 observed popup shows the strange descriptor', d1.toLowerCase().includes(DESCR), true);
  console.log(`    popup text: ${JSON.stringify(d1)}`);

  // control: never encountered — descriptor, no name (held before and after)
  G.state.codex.monsters = {};
  const d0 = popupDesc(5);
  check('B30 unencountered popup shows descriptor (control)', d0.toLowerCase().includes(DESCR), true);
  check('B30 unencountered popup hides true name (control)', d0.includes(TRUE), false);

  // control: village named it — the agreed name shows
  G.state.codex.monsters = { hushwolf: { stage: 'observed', proposals: {}, attacksSeen: [], roundsSeen: 1, villageName: 'Headlight Harry' } };
  const d2 = popupDesc(5);
  check('B30 named popup shows the village name (control)', d2.includes('Headlight Harry'), true);
  check('B30 named popup does not show the true name', d2.includes(TRUE), false);

  // control: System arrived — the true name is legitimately shown
  G.state.systemArrived = true;
  G.state.codex.monsters = { hushwolf: { stage: 'observed', proposals: {}, attacksSeen: [], roundsSeen: 1 } };
  const d3 = popupDesc(5);
  check('B30 post-System popup shows the true name (control)', d3.includes(TRUE), true);

  G.state.systemArrived = false;
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
