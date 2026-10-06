// Proof: every monster has calm + aggro sprites, valid SVG, calm != aggro.
// Steve 2026-10-06 — visual identity law + "identical until aggro" rule.
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const monsters = JSON.parse(fs.readFileSync(path.join(repo, 'src/data/monsters.json'), 'utf8'));
const ms = Array.isArray(monsters) ? monsters : (monsters.monsters || []);

// Load sprites.js in a sandbox
const src = fs.readFileSync(path.join(repo, 'src/js/sprites.js'), 'utf8');
const global = {};
global.globalThis = global;
eval(src.replace('(function (global) {', '(function (global) {').replace('})(globalThis);', '})(global);'));
const Sprites = global.Scattering.Sprites;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

// 1. Every monster has calm + aggro
for (const m of ms) {
  const calm = Sprites.get(m.id + '_calm');
  const aggro = Sprites.get(m.id + '_aggro');
  check(m.id + ' has calm', !!calm);
  check(m.id + ' has aggro', !!aggro);
  // 2. Valid SVG structure
  for (const [label, svg] of [['calm', calm], ['aggro', aggro]]) {
    if (!svg) continue;
    check(m.id + ' ' + label + ' starts <svg', svg.startsWith('<svg'), svg.slice(0, 40));
    check(m.id + ' ' + label + ' viewBox 32', svg.includes('viewBox="0 0 32 32"'));
    check(m.id + ' ' + label + ' ends </svg>', svg.trimEnd().endsWith('</svg>'));
    check(m.id + ' ' + label + ' no template holes', !svg.includes('${') && !svg.includes('undefined'));
  }
  // 3. Calm distinct from aggro
  if (calm && aggro) check(m.id + ' calm != aggro', calm !== aggro);
}

// 4. monsterSprite helper
for (const m of ms) {
  const c = Sprites.monsterSprite(m.id, false);
  const a = Sprites.monsterSprite(m.id, true);
  check('monsterSprite(' + m.id + ',false)', c === Sprites.get(m.id + '_calm'));
  check('monsterSprite(' + m.id + ',true)', a === Sprites.get(m.id + '_aggro'));
}
// Fallback: unknown monster -> null, aggro falls back to calm if aggro missing
check('monsterSprite unknown -> null', Sprites.monsterSprite('nope_nothing', false) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
