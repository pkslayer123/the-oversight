#!/usr/bin/env node
/**
 * Proof: floatText '50%' bug class in src/js/drama.js (HEAD, pristine).
 *
 * Bug class: floatText(x, y, ...) passes x/y straight into this.tileCenter(x, y).
 * When a call site passes string percents ('50%'), tileCenter's grid-index math
 * coerces the string ('50%' * 9 -> 450, 450 + '50%' -> '45050%'), finds no tile,
 * and returns { x: '50%', y: '50%' } (strings). floatText then builds:
 *     left:${c.x + dx}px  ->  '50%' + 0 = '50%0' + 'px'  ->  left:50%0px  (INVALID)
 *     top:${c.y + dy}px   ->  '50%' + 0 = '50%0' + 'px'  ->  top:50%0px   (INVALID)
 * Per CSS error handling, invalid declarations are dropped -> left/top fall back
 * to `auto` -> an absolutely-positioned element with left:auto sits at its
 * static position = top-left of the .drama-overlay -> renders top-left of grid,
 * NOT centered as intended. (The migration's `_note` misdiagnosed this as
 * "screen center".)
 *
 * This script loads the REAL floatText + tileCenter source from pristine HEAD
 * (`git show HEAD:src/js/drama.js`), runs each of the 8 affected call sites with
 * their exact HEAD arguments, captures the generated CSS, and asserts each is
 * broken. Exit 0 = all 8 sites demonstrated broken. Non-zero = a site is fine
 * (bug not reproduced).
 *
 * No jest; plain node. Read-only: never touches the worktree.
 */
'use strict';
const { execSync } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Load pristine HEAD source.
// ---------------------------------------------------------------------------
const src = execSync('git show HEAD:src/js/drama.js', { cwd: REPO, encoding: 'utf8' });

function extractMethod(srcText, name) {
  const marker = name + '(';
  const start = srcText.indexOf(marker);
  if (start < 0) throw new Error('method not found: ' + name);
  let i = srcText.indexOf('{', start);
  let depth = 0;
  for (; i < srcText.length; i++) {
    if (srcText[i] === '{') depth++;
    else if (srcText[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('unbalanced braces for: ' + name);
  return srcText.slice(start, i + 1);
}

const tileCenterSrc = extractMethod(src, 'tileCenter');
const floatTextSrc = extractMethod(src, 'floatText');

// ---------------------------------------------------------------------------
// 2. Minimal DOM stubs. tileCenter needs document.querySelector('.detail')
//    -> null (falls back to document.body), then grid.querySelectorAll('.tile')
//    -> empty (no tile matches) -> returns { x: '50%', y: '50%' } strings.
// ---------------------------------------------------------------------------
const captured = [];
global.document = {
  querySelector: () => null,
  body: { querySelectorAll: () => [] },
  createElement: () => ({ innerHTML: '', style: {}, classList: { add() {} }, remove() {} }),
};
global.requestAnimationFrame = () => {};
global.setTimeout = () => 0;

const Drama = {
  ensureOverlay() { return { appendChild() {} }; },
  spawn(html, css, animClass, duration) {
    captured.push({ html, css, animClass, duration });
    return { classList: { add() {} }, remove() {} };
  },
};
Drama.tileCenter = eval('(' + tileCenterSrc.replace('tileCenter(x, y)', 'function (x, y)') + ')');
Drama.floatText = eval('(' + floatTextSrc.replace('floatText(x, y, text, opts)', 'function (x, y, text, opts)') + ')');

// ---------------------------------------------------------------------------
// 3. The 8 affected call sites — exact arguments from HEAD.
// ---------------------------------------------------------------------------
const SITES = [
  { fn: 'integrationPulse', line: 417, args: ['50%', '35%', '👁️ The System watches', { color: '#4df3ff', size: 16 }] },
  { fn: 'contestLoser',    line: 637, args: ['50%', '50%', 'villager-name',       { color: '#a0a0c0', size: 18 }] }, // integration=1
  { fn: 'weatherShift',    line: 707, args: ['50%', '20%', '🌧️ The System notes the rain', { color: '#96c8ff', size: 14 }] },
  { fn: 'weatherShift',    line: 718, args: ['50%', '20%', '❄️ Cold snap — the System adjusts your HUD', { color: '#b4dcff', size: 14 }] },
  { fn: 'mootGather',      line: 775, args: ['50%', '45%', '📺 The System tunes in — the galaxy watches', { color: '#ff6b9d', size: 13 }] },
  { fn: 'exileMoment',     line: 824, args: ['50%', '60%', '📺 The galaxy watches them go', { color: '#666', size: 13 }] },
  { fn: 'reconcileGlow',   line: 877, args: ['50%', '35%', 'name — forgiven',     { color: '#ff6b9d', size: 16 }] },
  { fn: 'synergyShimmer',  line: 991, args: ['50%', '30%', 'something is happening…', { color: '#c792ea', size: 16 }] }, // integration=1
];

// CSS validity model: a length/percentage must be <number><unit> with the unit
// LAST. "50%px" is a parse error: '%' terminates a percentage token, the stray
// "px" makes the declaration invalid, so per CSS 2.1 §4.1.8 the whole
// declaration is dropped -> computed value falls back to `auto`.
const VALID_POS = /^-?\d+(\.\d+)?(px|%|em|rem|vw|vh)$/;

function parseDecl(css, prop) {
  const m = css.match(new RegExp(prop + '\\s*:\\s*([^;]+);'));
  return m ? m[1].trim() : null;
}

let broken = 0;
let fine = 0;

for (const s of SITES) {
  captured.length = 0;
  Drama.floatText(...s.args);
  if (captured.length !== 1) {
    console.log(`[FAIL] ${s.fn}:${s.line} — expected 1 spawn, got ${captured.length}`);
    fine++;
    continue;
  }
  const css = captured[0].css;
  const left = parseDecl(css, 'left');
  const top = parseDecl(css, 'top');
  const leftOK = VALID_POS.test(left);
  const topOK = VALID_POS.test(top);
  console.log(`--- ${s.fn} (drama.js:${s.line})`);
  console.log(`    css: ${css}`);
  console.log(`    left="${left}" ${leftOK ? 'VALID' : 'INVALID'} | top="${top}" ${topOK ? 'VALID' : 'INVALID'}`);
  if (!leftOK || !topOK) {
    broken++;
    console.log(`    => BROKEN: invalid declaration(s) dropped by browser; left/top resolve to auto ->`);
    console.log(`       absolutely-positioned element renders at static position = TOP-LEFT of overlay.`);
  } else {
    fine++;
    console.log('    => fine (valid CSS, renders as positioned).');
  }
}

// ---------------------------------------------------------------------------
// 4. Control: a numeric-arg call site (the OK pattern) must produce VALID css,
//    proving the harness discriminates and the bug is specific to '50%' args.
// ---------------------------------------------------------------------------
captured.length = 0;
Drama.floatText(4, 4, 'MISS', { color: '#b0c4de', size: 16 });
// tileCenter with real grid absent still returns '50%' strings — the stub has no
// tiles. So emulate a resolved numeric tile center instead: patch tileCenter.
Drama.tileCenter = () => ({ x: 180.5, y: 132 });
captured.length = 0;
Drama.floatText(4, 4, 'MISS', { color: '#b0c4de', size: 16 });
const ctlCss = captured[0].css;
const ctlLeft = parseDecl(ctlCss, 'left');
const ctlTop = parseDecl(ctlCss, 'top');
const ctlOK = VALID_POS.test(ctlLeft) && VALID_POS.test(ctlTop);
console.log('--- control: floatText(4, 4, ...) with numeric tileCenter result');
console.log(`    css: ${ctlCss}`);
console.log(`    left="${ctlLeft}" top="${ctlTop}" => ${ctlOK ? 'VALID (control passes)' : 'INVALID (control FAILED)'}`);

console.log(`\nRESULT: ${broken}/8 sites broken, ${fine}/8 fine. Control: ${ctlOK ? 'pass' : 'FAIL'}.`);

if (broken === 8 && fine === 0 && ctlOK) {
  console.log('BUG CLASS PROVEN: all 8 floatText \'50%\' sites emit invalid left/top -> top-left render.');
  process.exit(0);
} else {
  console.log('NOT FULLY REPRODUCED: some site is fine or the control failed.');
  process.exit(1);
}
