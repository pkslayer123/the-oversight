// Drama Round E2: performance + polish proof. Usage:
//   node scripts/test-drama-perf-20261007.js
//   TEST_DRAMA_PATH=/tmp/drama-e2.js node scripts/test-drama-perf-20261007.js
// Proves:
//   1. Every CSS animation is GPU-composited (transform/opacity/translate only —
//      no margin/width/height/top/left/filter inside @keyframes, no `transition: all`).
//   2. No duplicate method definitions on the Drama object.
//   3. spawn() self-cleans (elements removed after duration — no leak).
//   4. spawn() sheds load past 80 live nodes (no unbounded growth).
//   5. setDisabled(true) suppresses all drama output (debug kill-switch).
const fs = require('fs');
const path = require('path');

const DRAMA_PATH = process.env.TEST_DRAMA_PATH || path.join(__dirname, '..', 'src', 'js', 'drama.js');
const src = fs.readFileSync(DRAMA_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- minimal DOM stub ----------
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    _html: '',
    style: {},
    dataset: {},
    parent: null,
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      contains(c) { return this._s.has(c); },
      remove(c) { this._s.delete(c); },
    },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
        this.parent = null;
      }
    },
    get childElementCount() { return this.children.length; },
    get firstChild() { return this.children[0] || null; },
    contains(n) { let p = n; while (p) { if (p === this) return true; p = p.parent; } return false; },
    getBoundingClientRect() { return { left: 10, top: 20, width: 40, height: 40 }; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    offsetWidth: 0,
  };
  Object.defineProperty(el.style, 'cssText', {
    set(v) { this._css = String(v); }, get() { return this._css || ''; },
    configurable: true,
  });
  el.style.setProperty = (k, v) => { el.style[k] = v; };
  el.style.getPropertyValue = (k) => el.style[k] || '';
  return el;
}

const headEl = makeEl('head');
const bodyEl = makeEl('body');
const gridEl = makeEl('div');
let styleEl = null;

global.document = {
  createElement: (t) => makeEl(t),
  querySelector: (sel) => {
    if (sel === '.detail' || sel === '#grid') return gridEl;
    return null;
  },
  head: headEl,
  body: bodyEl,
  getElementById: (id) => (id === 'drama-css' ? styleEl : null),
  contains: () => true,
};
global.getComputedStyle = () => ({ position: 'relative' });
global.requestAnimationFrame = (fn) => { fn(); return 1; };
// capture the injected style element
const origCreate = global.document.createElement;
global.document.createElement = (t) => {
  const el = origCreate(t);
  if (t === 'style') {
    const origAppend = headEl.appendChild.bind(headEl);
    // tag it when appended to head
    setTimeout(() => {}, 0);
    el._isStyle = true;
  }
  return el;
};
const origHeadAppend = headEl.appendChild.bind(headEl);
headEl.appendChild = (c) => { if (c._isStyle) styleEl = c; return origHeadAppend(c); };

// ---------- load drama.js ----------
global.window = global;
eval(src);
delete global.window;
const Drama = globalThis.Scattering.Drama;
ok('Drama object loaded', !!Drama && typeof Drama.spawn === 'function');

// ---------- 1. CSS compositing audit ----------
const cssText = styleEl ? (styleEl.textContent || '') : '';
ok('drama CSS injected', cssText.length > 1000, `len=${cssText.length}`);

// extract @keyframes bodies with brace matching
function keyframes(srcCss) {
  const out = {};
  const re = /@keyframes ([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(srcCss))) {
    let depth = 1, j = m[0].length + m.index;
    const start = j;
    while (depth > 0 && j < srcCss.length) {
      if (srcCss[j] === '{') depth++;
      else if (srcCss[j] === '}') depth--;
      j++;
    }
    out[m[1]] = srcCss.slice(start, j - 1);
    re.lastIndex = j;
  }
  return out;
}
const kfs = keyframes(cssText);
ok('keyframes found', Object.keys(kfs).length >= 10, `n=${Object.keys(kfs).length}`);
const LAYOUT_PROPS = ['margin-top', 'margin-left', 'margin-bottom', 'margin-right', 'margin:',
  'width:', 'height:', 'top:', 'left:', 'bottom:', 'right:', 'filter:', 'font-size:', 'padding'];
let kfBad = [];
for (const [name, body] of Object.entries(kfs)) {
  for (const p of LAYOUT_PROPS) {
    if (body.includes(p)) kfBad.push(`${name} animates ${p.replace(':', '')}`);
  }
}
ok('keyframes GPU-only (no layout/filter props)', kfBad.length === 0, kfBad.slice(0, 4).join('; '));
ok('no `transition: all` remains', !/transition:\s*all[\s;]/.test(cssText));

// ---------- 2. no duplicate methods ----------
const methodNames = [...src.matchAll(/^    (\w+)\(/gm)].map(m => m[1]);
const seen = new Set(), dups = new Set();
for (const n of methodNames) { if (seen.has(n)) dups.add(n); seen.add(n); }
ok('no duplicate Drama methods', dups.size === 0, [...dups].join(','));

// ---------- 3-5. runtime behavior (async) ----------
(async () => {
  Drama.setDisabled(false);
  const ov = Drama.ensureOverlay();
  ok('overlay created under grid', ov && gridEl.contains(ov));

  // baseline spawn + self-clean
  const before = ov.childElementCount;
  Drama.flash('rgba(255,0,0,0.1)', 20);
  ok('spawn appends element', ov.childElementCount === before + 1);
  await sleep(250);
  ok('element self-removes after duration (no leak)', ov.childElementCount === before);

  // disabled kill-switch
  Drama.setDisabled(true);
  const r = Drama.hit(4, 4, { color: '#fff' });
  ok('setDisabled(true): no element created', r == null); // hit() doesn't forward; DOM churn is the contract
  ok('setDisabled(true): zero DOM churn', ov.childElementCount === before);
  // methods still callable (no throw) while disabled
  let threw = false;
  try {
    Drama.heroCard('T', 'S', '✨'); Drama.exclaim(1, 1, '!'); Drama.abilityBurst(1, 1, '#fff', 3);
  } catch (e) { threw = true; }
  ok('methods no-throw while disabled', !threw);
  ok('still zero churn after method calls', ov.childElementCount === before);
  Drama.setDisabled(false);
  ok('setDisabled(false) re-enables', Drama.disabled === false);

  // 80-node shed
  for (let i = 0; i < 85; i++) {
    const e = makeEl('div');
    ov.appendChild(e);
  }
  ok('prefill 85 nodes', ov.childElementCount === before + 85);
  Drama.flash('rgba(0,0,0,0.1)', 60000); // long-lived so it stays
  ok('shed caps live nodes at 80', ov.childElementCount === 80, `count=${ov.childElementCount}`);
  // cleanup: clear overlay for the drain test
  while (ov.firstChild) ov.firstChild.remove();

  // drain (isolated): a short effect self-cleans — no leak
  const c0 = ov.childElementCount;
  Drama.flash('rgba(0,0,0,0.1)', 20);
  ok('fresh spawn appends', ov.childElementCount === c0 + 1);
  await sleep(300);
  ok('short effect self-removes (no leak)', ov.childElementCount === c0, `count=${ov.childElementCount}`);

  // smoke: every major method runs without throwing on stub DOM
  const methods = ['hit', 'floatText', 'flash', 'shake', 'heroCard', 'soulWisp',
    'exclaim', 'npcAlert', 'abilityBurst', 'contestFlash', 'systemCommentary',
    'integrationPulse', 'phaseShift', 'enrage', 'lootSparkle', 'critHit',
    'playerHurt', 'dodgeMiss', 'secretShimmer', 'ambushWarning', 'wildRipple',
    'trailMark', 'playerDeath', 'newLife', 'abilityLevelUp', 'synergyShimmer',
    'villageBirth', 'villageDeath', 'plantIdentified', 'techniqueLearned',
    'skillGained', 'teaseFaint', 'ahaMoment', 'dawnBreak', 'duskFall',
    'harvestGlow', 'celebration', 'mourning', 'villageArgue', 'childPlay',
    'mootGather', 'mootVote', 'exileMoment', 'liarExposed', 'reconcileGlow', 'betraySlash'];
  let smokeBad = [];
  const argsets = {
    hit: [4, 4, {}], floatText: [4, 4, 'x', {}], flash: ['rgba(0,0,0,0.1)', 30],
    shake: [6], heroCard: ['T', 'S'], soulWisp: [4, 4], exclaim: [4, 4, '!'],
    npcAlert: [4, 4, 'talk'], abilityBurst: [4, 4, '#fff', 2], contestFlash: [{ type: 'cheer' }],
    systemCommentary: ['hi', {}], integrationPulse: [2], phaseShift: [4, 4, 'windup', 1],
    enrage: [4, 4, 'ENRAGED', 1], lootSparkle: [4, 4, 1], critHit: [4, 4, 99, 2],
    playerHurt: [10, 1], dodgeMiss: [4, 4, 1], secretShimmer: ['T', 'S', 1],
    ambushWarning: [4, 4, 1], wildRipple: [4, 4, 1], trailMark: [4, 4, 'n', 1],
    playerDeath: [4, 4, 'N', 'cause', 1], newLife: ['N', 1], abilityLevelUp: [4, 4, 'A', 2, 1],
    synergyShimmer: [1], villageBirth: ['B', 'P', 1], villageDeath: ['N', 'old age', 1],
    plantIdentified: [4, 4, 'P', 1], techniqueLearned: [4, 4, 'T', 1],
    skillGained: [4, 4, 'S', 1], teaseFaint: [1], ahaMoment: [4, 4, 1],
    dawnBreak: [1], duskFall: [1], harvestGlow: [1], celebration: [1], mourning: [1],
    villageArgue: [1, 1, 2, 2, 1], childPlay: [4, 4, 1], mootGather: ['C', 1],
    mootVote: [3, 5, 1], exileMoment: ['N', 1], liarExposed: ['N', 1],
    reconcileGlow: ['N', 1], betraySlash: ['N', 1],
  };
  for (const m of methods) {
    try { Drama[m](...(argsets[m] || [])); }
    catch (e) { smokeBad.push(`${m}: ${e.message}`); }
  }
  ok('all major methods run without throwing', smokeBad.length === 0, smokeBad.slice(0, 3).join('; '));
  // shed must hold under burst: never more than 80 live nodes
  ok('overlay bounded after burst (<=80 live)', ov.childElementCount <= 80, `count=${ov.childElementCount}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
