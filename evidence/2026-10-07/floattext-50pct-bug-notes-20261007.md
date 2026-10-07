# floatText '50%' bug-class proof — 2026-10-07

**Status: PROVEN.** All 8 flagged call sites emit invalid CSS and render top-left instead of centered.
**Proof script:** `scripts/proof-floattext-50pct-20261007.js` (exit 0 = all 8 broken, control passes).
**Scope:** pristine `HEAD:src/js/drama.js` only — the worktree copy is sibling-dirty and was never read. No source files were edited.

## Root cause (verified against real HEAD code)

`floatText(x, y, text, opts)` (drama.js:170) passes x/y straight into `tileCenter(x, y)` (drama.js:87):

```js
const idx = y * 9 + x;            // '50%' * 9 -> 450 (number), 450 + '50%' -> '45050%' (string)
const tile = tiles[idx];          // tiles['45050%'] -> undefined
if (!tile) return { x: '50%', y: '50%' };   // string percents, NOT pixels
```

`floatText` then concatenates (drama.js:182):

```js
`position:absolute;left:${c.x + dx}px;top:${c.y + dy}px;...`
// c.x='50%' (string), dx=0 (number): '50%' + 0 -> '50%0', + 'px' -> 'left:50%0px'
```

Actual captured CSS per site: `position:absolute;left:50%0px;top:50%0px;transform:translate(-50%,-50%);...`
`50%0px` is not a valid CSS `<length-percentage>` (the `%` terminates the percentage token; the
trailing `0px` is a parse error), so per CSS 2.1 §4.1.8 the browser **drops both declarations**.
Computed `left`/`top` fall back to `auto`; an absolutely-positioned element with `left:auto`
renders at its **static position = top-left of the .drama-overlay**. The
`transform:translate(-50%,-50%)` still applies, shifting the text half its own size up-left from
that top-left anchor — i.e. the visual proof's observed "top-left instead of centered".

Two corrections to prior diagnoses:
1. The migration `_note` called this "screen center" — it is **not** centered anywhere; it is top-left.
2. The intended vertical position is also lost: `top` is `50%0px` (invalid) regardless of the
   caller's second arg (`'35%'`, `'20%'`, `'45%'`, `'60%'`, `'30%'` all become `top:50%0px`).

## Per-site patches (systemCommentary-style centered spawn pattern)

Known-good pattern from `systemCommentary` (drama.js:395):
```js
this.spawn(
  body,
  `position:absolute;left:50%;top:18%;transform:translate(-50%,-50%);max-width:300px;text-align:center;`,
  'drama-commentary',
  2000
);
```

Each patch below keeps the site's original text/color/size/duration and only repairs the positioning
to valid CSS: `left:50%` + the caller's intended `top:YY%` + `transform:translate(-50%,-50%)`.
The `drama-float` animation class and 800ms duration match `floatText`'s own spawn call.

### 1. integrationPulse L2 — drama.js:417 (currently `left:50%0px;top:50%0px`)

Offending:
```js
this.floatText('50%', '35%', '👁️ The System watches', { color: '#4df3ff', size: 16 });
```

Patch:
```js
this.spawn(
  '👁️ The System watches',
  `position:absolute;left:50%;top:35%;transform:translate(-50%,-50%);color:#4df3ff;font-size:16px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

### 2. contestLoser — drama.js:637

Offending:
```js
this.floatText('50%', '50%', name, { color: '#a0a0c0', size: 16 + integration * 2 });
```

Patch:
```js
this.spawn(
  name,
  `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#a0a0c0;font-size:${16 + integration * 2}px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

### 3. weatherShift (rain) — drama.js:707

Offending:
```js
this.floatText('50%', '20%', '🌧️ The System notes the rain', { color: '#96c8ff', size: 14 });
```

Patch:
```js
this.spawn(
  '🌧️ The System notes the rain',
  `position:absolute;left:50%;top:20%;transform:translate(-50%,-50%);color:#96c8ff;font-size:14px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

### 4. weatherShift (cold snap) — drama.js:718

Offending:
```js
this.floatText('50%', '20%', '❄️ Cold snap — the System adjusts your HUD', { color: '#b4dcff', size: 14 });
```

Patch:
```js
this.spawn(
  '❄️ Cold snap — the System adjusts your HUD',
  `position:absolute;left:50%;top:20%;transform:translate(-50%,-50%);color:#b4dcff;font-size:14px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

### 5. mootGather — drama.js:775

Offending:
```js
this.floatText('50%', '45%', '📺 The System tunes in — the galaxy watches', { color: '#ff6b9d', size: 13 });
```

Patch:
```js
this.spawn(
  '📺 The System tunes in — the galaxy watches',
  `position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);color:#ff6b9d;font-size:13px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

### 6. exileMoment — drama.js:824

Offending:
```js
this.floatText('50%', '60%', '📺 The galaxy watches them go', { color: '#666', size: 13 });
```

Patch:
```js
this.spawn(
  '📺 The galaxy watches them go',
  `position:absolute;left:50%;top:60%;transform:translate(-50%,-50%);color:#666;font-size:13px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

### 7. reconcileGlow — drama.js:877

Offending:
```js
this.floatText('50%', '35%', `${name} — forgiven`, { color: '#ff6b9d', size: 16 });
```

Patch:
```js
this.spawn(
  `${name} — forgiven`,
  `position:absolute;left:50%;top:35%;transform:translate(-50%,-50%);color:#ff6b9d;font-size:16px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

### 8. synergyShimmer — drama.js:991

Offending:
```js
this.floatText('50%', '30%', 'something is happening…', { color: '#c792ea', size: 15 + integration });
```

Patch:
```js
this.spawn(
  'something is happening…',
  `position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);color:#c792ea;font-size:${15 + integration}px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;`,
  'drama-float',
  800
);
```

## Sibling sweep — every floatText call site in drama.js at HEAD

18 call sites total. 8 broken (all of the `'50%'`-string form), 10 OK (numeric tile coords → valid `left:Npx`).
No other `tileCenter` consumers pass string args — the class is confined to these 8 sites.

| # | HEAD line | enclosing fn | args form | verdict |
|---|-----------|--------------|-----------|---------|
| 1 | 417 | integrationPulse | `('50%','35%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 2 | 515 | phaseShift | `(x, y, …)` numeric | ok |
| 3 | 530 | enrage | `(x, y, …)` numeric | ok |
| 4 | 532 | enrage | `(x, y, …)` numeric | ok |
| 5 | 563 | critHit | `(x, y, …)` numeric | ok |
| 6 | 564 | critHit | `(x, y, …)` numeric | ok |
| 7 | 586 | dodgeMiss | `(x, y, …)` numeric | ok |
| 8 | 637 | contestLoser | `('50%','50%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 9 | 672 | ambushWarning | `(c.x, c.y-50, …)` numeric | ok |
| 10 | 707 | weatherShift | `('50%','20%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 11 | 718 | weatherShift | `('50%','20%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 12 | 775 | mootGather | `('50%','45%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 13 | 824 | exileMoment | `('50%','60%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 14 | 877 | reconcileGlow | `('50%','35%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 15 | 991 | synergyShimmer | `('50%','30%',…)` | **BROKEN** — `left:50%0px;top:50%0px` |
| 16 | 1462 | plantIdentified | `(x, y, …)` numeric | ok |
| 17 | 1479 | techniqueLearned | `(x, y, …)` numeric | ok |
| 18 | 1521 | skillGained | `(x, y, …)` numeric | ok |

Additional sites found by the sweep beyond the 8 flagged: **none** — the 8 flagged sites are the
complete broken set at HEAD. (The 10 numeric-arg sites were verified clean; the proof script's
control case shows the harness discriminates: numeric args → valid `left:180.5px;top:132px`.)

## Note for the drama owner

Two possible fix strategies — pick one, not both:
- **A (recommended, minimal):** apply the 8 per-site patches above (`this.spawn` with valid centered CSS).
- **B (structural):** teach `floatText`/`tileCenter` to handle percent strings (e.g. early-return
  `left:50%;top:<y>%` when x/y are strings). B fixes the class at the root but changes `floatText`'s
  contract, and risks colliding with the sibling's active drama.js work — coordinate before touching.

`drama.js` itself was NOT edited (sibling's active territory). All proof artifacts are new files only.
