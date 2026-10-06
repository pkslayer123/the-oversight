// Proof: every item resolves to a valid unique SVG sprite (Steve 2026-10-06).
// Run: node scripts/test-sprites-items-20261006.js
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const items = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/items.json'), 'utf8'));
const itemList = Array.isArray(items) ? items : (items.items || []);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); }
}

// Load sprites.js in a sandbox
const src = fs.readFileSync(path.join(repo, 'src/js/sprites.js'), 'utf8');
const sandbox = {};
const fn = new Function('globalThis', src + '\nreturn globalThis.Scattering.Sprites;');
let Sprites;
try {
  Sprites = fn(sandbox);
} catch (e) {
  console.log('FAIL: sprites.js did not load:', e.message);
  process.exit(1);
}
check('Sprites module loads', !!Sprites);
check('itemSprite function exists', typeof Sprites.itemSprite === 'function');

// Every item has a sprite
const seen = new Set();
for (const item of itemList) {
  const svg = Sprites.itemSprite(item.id, true);
  check(`known ${item.id} resolves`, typeof svg === 'string' && svg.includes('<svg'));
  check(`${item.id} has viewBox`, svg.includes('viewBox="0 0 32 32"'));
  check(`${item.id} well-formed`, svg.includes('</svg>') && (svg.match(/<svg/g) || []).length === 1);
  if (seen.has(svg)) {
    check(`${item.id} unique (not duplicated)`, false);
  } else {
    check(`${item.id} unique`, true);
    seen.add(svg);
  }
}

// Unknown items get the generic fallback
const unk = Sprites.itemSprite('multitool', false);
check('unknown shows fallback', typeof unk === 'string' && unk.includes('<svg'));
check('unknown fallback has ?', unk.includes('?'));
check('unknown differs from known', unk !== Sprites.itemSprite('multitool', true));

// Unknown item ID falls back gracefully
const missing = Sprites.itemSprite('nonexistent_xyz', true);
check('missing id falls back', typeof missing === 'string' && missing.includes('<svg'));

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures.slice(0, 20)) console.log('  -', f);
  process.exit(1);
}
console.log('ALL GREEN');
