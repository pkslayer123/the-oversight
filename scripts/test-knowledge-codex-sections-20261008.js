#!/usr/bin/env node
// BREAK-IT: animal/tree codex entries had no readable surface (2026-10-08).
//
// ATTACK (dead-code): _grantAnimal / _grantTree (and carexplore.js tree writes)
// land entries in state.codex.animals / state.codex.trees, but codexScreen in
// app.js rendered plants, skills, techniques, beasts, aliens, people — never
// animals or trees. Earned knowledge landed nowhere the player could re-read.
//
// FIX: ANIMALS and TREES sections in codexScreen, name-gated (encAnimalKnown
// / unknown-descriptor fallback for animals; species names are inherently
// gated for trees since entries only exist once learned).
//
// This test grants animal + tree knowledge in the engine, extracts the actual
// section template expressions shipped in app.js (brace-matched, not copied),
// evals them against the live Game, and asserts the rendered HTML names the
// known animal, hides the unknown animal's true name, and lists trees.
// PRE-FIX: extraction finds no such sections. RED.
//
// Usage: node scripts/test-knowledge-codex-sections-20261008.js (SEED override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) fails.push(name);
}

// extract a ${...} template expression from app.js source by proper
// tokenizing (handles nested template literals, strings, comments)
function extractSection(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) return null;
  let i = start + 2; // skip '${'; depth counts the interpolation brace
  let depth = 1;
  let inStr = null;
  const tplStack = [];
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
  return depth === 0 ? src.slice(start + 2, i - 1) : null;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const animalExpr = extractSection(appSrc, '${Object.entries(Game.state.codex.animals || {})');
  const treeExpr = extractSection(appSrc, '${Object.entries(Game.state.codex.trees || {})');
  check('ANIMALS section exists in shipped codexScreen', !!animalExpr, true);
  check('TREES section exists in shipped codexScreen', !!treeExpr, true);
  if (!animalExpr || !treeExpr) { console.log('\nRESULT: FAILED'); process.exit(1); }

  // known animal: grant via the real path (book-style read grant)
  const knownAid = 'cottontail_rabbit'; // common NA: region-known for Ohio player
  Game.grantKnowledge('animal', knownAid, 2, { type: 'read', by: 'test' });
  // unknown animal: entry exists but never encountered, not region-common
  const unknownAid = 'gila_monster';
  Game.state.codex.animals[unknownAid] = { level: 1, learnedDay: 0, via: 'test' };
  // tree: grant a non-common species
  Game.grantKnowledge('tree', 'walnut', 2, { type: 'discovery' });

  const render = (expr) => eval(expr);
  const animalHtml = render(animalExpr);
  const treeHtml = render(treeExpr);

  const adef = Game.data.animals.find(a => a.id === knownAid);
  const udef = Game.data.animals.find(a => a.id === unknownAid);
  check('known animal name renders', animalHtml.includes(esc(adef.name)), true);
  check('known animal level renders', animalHtml.includes('[L2]'), true);
  check('unknown animal true name does NOT render', animalHtml.includes(udef.name), false);
  check('unknown animal shows descriptor', animalHtml.includes(esc(udef.unknown)), true);
  check('tree species renders', treeHtml.includes('walnut'), true);
  check('oak (starting common knowledge) renders', treeHtml.includes('oak'), true);

  // empty state: sections vanish when nothing is known
  const savedA = Game.state.codex.animals, savedT = Game.state.codex.trees;
  Game.state.codex.animals = {}; Game.state.codex.trees = {};
  check('ANIMALS section hides when empty', render(animalExpr), '');
  check('TREES section hides when empty', render(treeExpr), '');
  Game.state.codex.animals = savedA; Game.state.codex.trees = savedT;

  console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
