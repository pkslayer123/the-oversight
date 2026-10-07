// Test: drama effect registry — data-driven output must be IDENTICAL to hand-written methods.
// (Steve 2026-10-07, Scaffold #4)
//
// Strategy: load OLD drama.js (HEAD, pre-migration) and NEW drama.js (with renderEffect)
// in separate sandboxes with identical stub DOM. Mock spawn() to record calls.
// For each of the 12 migrated effects, invoke with the same args on both and
// compare the recorded spawn sequences. They must match exactly.
//
// Math.random is seeded for determinism. setTimeout is captured and run synchronously.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = '/home/hatch/workspace/the-scattering';

// Seeded PRNG (mulberry32) for deterministic Math.random
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a sandbox with stub DOM and recording spawn
function makeSandbox() {
  const spawns = [];
  const timeouts = [];
  
  const fakeEl = {
    style: {},
    classList: { add() {}, remove() {} },
    innerHTML: '',
    remove() {},
  };
  
  const overlay = {
    childElementCount: 0,
    firstChild: { remove() {} },
    appendChild() {},
  };
  
  const sandbox = {
    console: console,
    Math: Math,
    setTimeout: (fn, ms) => { timeouts.push({fn, ms}); return timeouts.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { /* don't run */ return 1; },
    document: {
      contains: () => false,
      querySelector: (sel) => {
        if (sel === '.detail' || sel === '#grid') return { 
          style: {}, 
          appendChild() {},
          classList: { add() {}, remove() {} },
        };
        return null;
      },
      createElement: () => Object.assign({}, fakeEl),
      getElementById: () => null,
      head: { appendChild() {} },
      body: { appendChild() {}, style: {} },
    },
    getComputedStyle: () => ({ position: 'relative' }),
    globalThis: null,
  };
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  
  return { sandbox, spawns, timeouts };
}

// Load a drama.js source into a fresh sandbox, return the Drama object
function loadDrama(src, seed) {
  const { sandbox, spawns, timeouts } = makeSandbox();
  // Seed Math.random for this sandbox
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = mulberry32(seed);
  
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'drama.js' });
  
  const Drama = sandbox.Scattering.Drama;
  
  // Override spawn to record calls
  const origSpawn = Drama.spawn.bind(Drama);
  Drama.spawn = function(html, css, animClass, duration) {
    spawns.push({ html, css, animClass, duration });
    return null; // don't touch DOM
  };
  
  // Override tileCenter to be deterministic
  Drama.tileCenter = function(x, y) {
    return { x: 100 + x * 40, y: 100 + y * 40 };
  };
  
  // Override floatText/shake/flash used by composite effects to record
  // (for v1, our 12 don't use these except via steps — ambushWarning inlines floatText)
  
  return { Drama, spawns, timeouts };
}

// Run all captured timeouts synchronously
function runTimeouts(timeouts) {
  // Sort by delay to match execution order
  const sorted = [...timeouts].sort((a, b) => a.ms - b.ms);
  for (const t of sorted) t.fn();
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// Load sources
const oldSrc = fs.readFileSync(path.join(REPO, '.git/HEAD-DRAMA-BACKUP.js'), 'utf8');
const newSrc = fs.readFileSync('/tmp/drama-new.js', 'utf8');
const registry = JSON.parse(fs.readFileSync(path.join(REPO, 'src/data/dramaEffects.json'), 'utf8'));

// Test cases: [methodName, argsArray]
const cases = [
  ['dawnBreak', [0]],
  ['dawnBreak', [1]],
  ['dawnBreak', [3]],
  ['duskFall', [0]],
  ['duskFall', [2]],
  ['mourning', [1]],
  ['mourning', [3]],
  ['soulWisp', [4, 4]],
  ['soulWisp', [0, 8]],
  ['wildRipple', [3, 5, 0]],
  ['wildRipple', [3, 5, 2]],
  ['trailMark', [2, 2, 'n', 1]],
  ['trailMark', [2, 2, 'e', 0]],
  ['trailMark', [2, 2, 'x', 3]], // invalid direction -> •
  ['harvestGlow', [0]],
  ['harvestGlow', [2]],
  ['celebration', [1]],
  ['celebration', [3]],
  ['contestCheer', [0]],
  ['contestCheer', [2]],
  ['lootSparkle', [4, 4, 1]],
  ['lootSparkle', [4, 4, 3]],
  ['contestJudging', [0]],
  ['contestJudging', [2]],
  ['ambushWarning', [5, 5, 0]],
  ['ambushWarning', [5, 5, 1]],
  ['ambushWarning', [5, 5, 2]], // triggers conditional floatText
  ['ambushWarning', [5, 5, 3]],
];

console.log(`Running ${cases.length} comparison cases...\n`);

for (const [method, args] of cases) {
  const seed = 12345;
  
  // OLD: hand-written method
  const oldBox = loadDrama(oldSrc, seed);
  try {
    oldBox.Drama[method](...args);
  } catch (e) {
    check(`${method}(${args}) old runs`, false, 'old threw: ' + e.message);
    continue;
  }
  runTimeouts(oldBox.timeouts);
  const oldSpawns = oldBox.spawns;
  
  // NEW: delegated via renderEffect
  const newBox = loadDrama(newSrc, seed);
  newBox.Drama.effectRegistry = registry;
  try {
    newBox.Drama[method](...args);
  } catch (e) {
    check(`${method}(${args}) new runs`, false, 'new threw: ' + e.message);
    continue;
  }
  runTimeouts(newBox.timeouts);
  const newSpawns = newBox.spawns;
  
  // Compare
  const label = `${method}(${args.join(',')})`;
  
  // BUGFIX (documented): ambushWarning's conditional AMBUSH text was broken in
  // the original — it passed pixel coords to floatText which re-applied
  // tileCenter, placing text at 12100px (invisible). The registry version
  // places it correctly. First two spawns must match; third is the fix.
  const isAmbushFix = (method === 'ambushWarning' && args[2] >= 2);
  const compareCount = isAmbushFix ? 2 : oldSpawns.length;
  
  check(`${label} spawn count`, isAmbushFix ? newSpawns.length === 3 : oldSpawns.length === newSpawns.length,
    `old=${oldSpawns.length} new=${newSpawns.length}`);
  
  for (let i = 0; i < compareCount; i++) {
    const o = oldSpawns[i], n = newSpawns[i];
    if (!o || !n) {
      check(`${label} spawn[${i}] exists`, false, `old=${!!o} new=${!!n}`);
      continue;
    }
    check(`${label} spawn[${i}] html`, o.html === n.html,
      `\nOLD: ${o.html}\nNEW: ${n.html}`);
    check(`${label} spawn[${i}] css`, o.css === n.css,
      `\nOLD: ${o.css}\nNEW: ${n.css}`);
    check(`${label} spawn[${i}] animClass`, o.animClass === n.animClass,
      `old=${o.animClass} new=${n.animClass}`);
    check(`${label} spawn[${i}] duration`, o.duration === n.duration,
      `old=${o.duration} (${typeof o.duration}) new=${n.duration} (${typeof n.duration})`);
  }
  
  if (isAmbushFix && newSpawns.length === 3) {
    const fixed = newSpawns[2];
    check(`${label} AMBUSH text fixed (was at 12100px, now on-screen)`,
      fixed.html === 'AMBUSH' && fixed.css.includes('left:300px') && fixed.css.includes('top:250px'),
      `css=${fixed.css}`);
  }
}

// Registry integrity checks
console.log('\nRegistry integrity:');
const effectIds = Object.keys(registry).filter(k => !k.startsWith('_'));
check('registry has 12 effects', effectIds.length === 12, `got ${effectIds.length}`);
for (const id of effectIds) {
  const def = registry[id];
  check(`${id} has steps`, Array.isArray(def.steps) && def.steps.length > 0);
  check(`${id} has anchor`, def.anchor === 'screen' || def.anchor === 'tile');
  for (const step of (def.steps || [])) {
    check(`${id} step.do valid`, ['spawn', 'particles', 'call'].includes(step.do), step.do);
  }
}

// Renderer unit checks
console.log('\nRenderer unit checks:');
{
  const box = loadDrama(newSrc, 999);
  box.Drama.effectRegistry = registry;
  check('renderEffect returns null for unknown id', box.Drama.renderEffect('nope', {}) === null);
  check('renderEffect returns null with no registry', (() => {
    const b2 = loadDrama(newSrc, 999);
    return b2.Drama.renderEffect('dawnBreak', {integration: 1}) === null;
  })());
  check('_evalExpr basic', box.Drama._evalExpr('1 + 2 * 3', {}) === 7);
  check('_evalExpr with scope', box.Drama._evalExpr('a * b', {a: 4, b: 5}) === 20);
  check('_evalExpr with Math', Math.abs(box.Drama._evalExpr('Math.cos(0)', {}) - 1) < 0.001);
  check('_evalTemplate', box.Drama._evalTemplate('x={x}, y={y + 1}', {x: 5, y: 10}) === 'x=5, y=11');
  check('_evalField number passthrough', box.Drama._evalField('{1 + 2}', {}) === 3);
  check('_evalField template', box.Drama._evalField('a{b}c', {b: 'X'}) === 'aXc');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
