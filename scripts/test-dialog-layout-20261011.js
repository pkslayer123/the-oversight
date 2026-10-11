#!/usr/bin/env node
// PROOF TEST (Worker C, dialog-layout 2026-10-11) — layout stability.
// Steve 2026-10-11: the chat region "spawns in paragraphs" and pushes the
// screen around. Hard rules: ONE mobile screen (390×844), NO scrolling for
// moment-to-moment play, no layout shift.
//
// Asserts the CSS + render contract:
//   1. .ord-narration has a FIXED pixel height + internal overflow
//      (content scrolls inside the region, never pushes grid/d-pad/status)
//   2. .dialogue-box fills the region exactly (height:100%), flex column —
//      speaker pinned, current line scrolls, choices/▼ stay visible
//   3. .ord-feedback has a FIXED pixel height + internal overflow, and
//      feedbackHTML() ALWAYS emits the slot (never ''), so the slot's
//      appearance/disappearance can't shift anything
//   4. .toast-layer is position:fixed (out of flow — toasts never shift layout)
//   5. .speech-bubble is position:absolute inside position:relative .cell
//      with fixed cell sizing (flex:none + aspect-ratio) — bubbles cannot
//      resize grid cells
//   6. in-combat keeps the same discipline (fixed height, shorter region)
//   7. no unmeasured content injection: the narration/feedback builders emit
//      no inline height/min-height styles that could bypass the fixed slots
//
// LIMITS (honest): this VM cannot run a layout engine — headless Chromium
// hangs here (AGENTS.md). These are CSS-contract + source-structure
// assertions, not measured pixel heights. [needs-eyes] on a real phone at
// 390×844 is the final gate.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

// Extract the declaration block for a selector (first match, naive but fine
// for these single-definition rules).
function rule(selector) {
  // matches the selector whether it stands alone or heads a comma list
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc + '\\s*(?:,|\\{)([^}]*?)\\}', 's');
  const m = CSS.match(re);
  return m ? m[1] : null;
}
const has = (block, prop, valRe) => {
  if (!block) return false;
  const m = block.match(new RegExp(prop + '\\s*:\\s*([^;]+);?'));
  return m ? valRe.test(m[1].trim()) : false;
};

// --- 1. .ord-narration: fixed pixel height + internal scroll ---
{
  const b = rule('.ord-narration');
  ok('ord-narration exists', !!b);
  ok('ord-narration fixed px height', has(b, 'height', /^\d+px$/), b && b.trim().split('\n')[0]);
  ok('ord-narration overflow-y internal', has(b, 'overflow-y', /^(auto|scroll)$/));
  ok('ord-narration no horizontal growth', has(b, 'overflow-x', /^hidden$/));
}

// --- 2. .dialogue-box fills region, flex column ---
{
  const b = rule('.ord-narration .dialogue-box');
  ok('dialogue-box fills region (height:100%)', has(b, 'height', /^100%$/));
  ok('dialogue-box flex column', has(b, 'display', /^flex$/) && has(b, 'flex-direction', /^column$/));
  ok('dialogue-box clips internally', has(b, 'overflow', /^hidden$/));
  const line = rule('.ord-narration .dialogue-box .dlg-line');
  ok('dlg-line flexes + scrolls internally', has(line, 'flex', /1/) && has(line, 'overflow-y', /^(auto|scroll)$/));
  const hist = rule('.ord-narration .dialogue-box .dlg-history');
  ok('dlg-history scrolls inside box', !!hist && /overflow-y\s*:\s*(auto|scroll)/.test(hist));
  const card = rule('.ord-narration .inlinecard');
  ok('person card scrolls inside region', !!card && /overflow-y\s*:\s*(auto|scroll)/.test(card));
}

// --- 3. .ord-feedback: fixed slot, always rendered ---
{
  const b = rule('.ord-feedback');
  ok('ord-feedback fixed px height', has(b, 'height', /^\d+px$/));
  ok('ord-feedback overflow-y internal', has(b, 'overflow-y', /^(auto|scroll)$/));
  // feedbackHTML must never return '' — the slot is always in the DOM.
  const fn = APP.match(/function feedbackHTML\(\) \{[\s\S]*?\n  \}/);
  ok('feedbackHTML defined', !!fn);
  ok('feedbackHTML never returns empty string', !!fn && !/return\s+'';/.test(fn[0]));
  ok('feedbackHTML always emits ord-feedback container',
    !!fn && /class="ord-feedback"/.test(fn[0]));
  const rf = APP.match(/function refreshFeedback\(\) \{[\s\S]*?\n  \}/);
  ok('refreshFeedback keeps container, swaps inner only',
    !!rf && /fb\.innerHTML\s*=/.test(rf[0]) && !/remove\(\)|outerHTML\s*=/.test(rf[0]));
}

// --- 4. toast layer: out of flow ---
{
  const b = rule('.toast-layer');
  ok('toast-layer position:fixed', has(b, 'position', /^fixed$/));
  ok('toast-layer pointer-events none (overlay)', has(b, 'pointer-events', /^none$/));
  // max 3 toasts — bounded overlay growth
  ok('showToast caps at 3 toasts', /children\.length\s*>=\s*3/.test(APP));
}

// --- 5. speech bubbles: absolute, cells fixed-size ---
{
  const b = rule('.speech-bubble');
  ok('speech-bubble position:absolute', has(b, 'position', /^absolute$/));
  const cell = rule('.cell');
  // .cell is defined twice (fluid sizing + bubble anchor) — any block counts
  const cellBlocks = [...CSS.matchAll(/\.cell\s*(?:,|\{)([^}]*?)\}/gs)].map(m => m[1]);
  ok('cell position:relative (bubble anchor)', cellBlocks.some(b => /position\s*:\s*relative/.test(b)));
  ok('cell fixed sizing (flex:none + aspect-ratio)',
    !!cell && /flex\s*:\s*none/.test(cell) && /aspect-ratio\s*:\s*1/.test(cell));
  ok('showSpeechBubble appends into the cell (absolute → no resize)',
    /cell\.appendChild\(b\)/.test(APP));
}

// --- 6. in-combat keeps fixed heights ---
{
  const b = rule('body.in-combat .ord-narration');
  ok('in-combat narration region still fixed px height', has(b, 'height', /^\d+px$/));
}

// --- 7. no unmeasured content injection in the text builders ---
{
  const builders = ['narrationBoxHTML', 'dialogueBoxHTML', 'contestBoxHTML', 'feedbackHTML', 'feedbackInner'];
  let bad = [];
  for (const name of builders) {
    const m = APP.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}', ''));
    if (!m) { bad.push(name + ': not found'); continue; }
    // inline height/min-height styles would bypass the fixed slots
    const inl = m[0].match(/style="[^"]*(?:min-)?height\s*:/g);
    if (inl) bad.push(name + ': ' + inl.join(','));
  }
  ok('builders emit no inline height styles', bad.length === 0, bad.join(' | '));
}

// --- 8. the three regions are never display:none-toggled by content ---
{
  ok('narration region div always rendered in expedition screen',
    /<div class="ord-narration">/.test(APP));
}

console.log(`\nlayout-stability: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
