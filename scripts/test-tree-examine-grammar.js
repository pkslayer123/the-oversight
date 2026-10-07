// Grammar regression: tree examine copy said "This a tree" when the species
// was unknown (treeName() returns null, falling back to 'a tree' after 'This').
// Explorer playtest 2026-10-06 (seed 777) caught: "This a tree, healthy. No
// nuts worth the trouble — but something might grow in its shade."
// Usage: node scripts/test-tree-examine-grammar.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/journal.js', 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}

(async () => {
  await Game.init();
  let said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // find a world tile whose 9x9 detail contains a tree: prefer forest, else scan targets
  let detail = Game.genDetail(Game.map.px, Game.map.py);
  const hasTree = (d) => d.some(row => row && row.some(c => c === 'tree' || c === 'bigtree'));
  if (!hasTree(detail)) {
    const targets = Game.travelTargets() || [];
    for (const t of targets) {
      const block = Game.travelBlockage && Game.travelBlockage(t.x, t.y);
      if (block && block.kind === 'blockage') { try { Game.clearBlockage(t.x, t.y); } catch (e) {} }
      try { Game.travelTo(t.x, t.y); } catch (e) {}
      detail = Game.genDetail(Game.map.px, Game.map.py);
      if (hasTree(detail)) break;
    }
  }
  // fall back: keep hopping one tile north/east until a tree shows up
  for (let hop = 0; hop < 40 && !hasTree(detail); hop++) {
    const tx = Game.map.px + (hop % 2 ? 0 : 1), ty = Game.map.py + (hop % 2 ? -1 : 0);
    try {
      const block = Game.travelBlockage && Game.travelBlockage(tx, ty);
      if (block && block.kind === 'blockage') Game.clearBlockage(tx, ty);
      Game.travelTo(tx, ty);
    } catch (e) {}
    detail = Game.genDetail(Game.map.px, Game.map.py);
  }
  let found = null;
  for (let cy = 0; cy < 9 && !found; cy++) {
    for (let cx = 0; cx < 9 && !found; cx++) {
      const cell = detail[cy] && detail[cy][cx];
      if (cell === 'tree' || cell === 'bigtree') found = { cx, cy, cell };
    }
  }
  ok('found a tree cell to examine', !!found);
  if (!found) { console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

  const setPlayerAt = (x, y) => { Game.state.scholar.mx = x; Game.state.scholar.my = y; };
  // adjacent: pick a neighbor inside 0..8
  const nx = found.cx > 0 ? found.cx - 1 : found.cx + 1;
  const ny = found.cy > 0 ? found.cy - 1 : found.cy + 1;
  setPlayerAt(nx, ny);
  // ensure we're adjacent (chebyshev <= 1) after clamping
  const ax = Math.min(8, Math.max(0, nx)), ay = Math.min(8, Math.max(0, ny));
  setPlayerAt(Math.abs(ax - found.cx) <= 1 ? ax : found.cx, Math.abs(ay - found.cy) <= 1 ? ay : found.cy);

  // wipe tree knowledge so speciesName is null (unknown species branch)
  Game.state.codex.trees = {};

  said = [];
  try { Game._cellInteract(found.cx, found.cy); } catch (e) { said.push('ERROR: ' + e.message); }

  const bad = said.filter(s => /This (a|an) (tree|bush|plant|water)\b/i.test(s) && !/This (is|was)/i.test(s));
  ok('no "This a/an tree" style copy when species unknown', bad.length === 0, bad.slice(0, 2).join(' | '));
  const treeLines = said.filter(s => /^This (tree you don't recognize|[a-z]+), /.test(s));
  ok('examine produces a tree description line', treeLines.length > 0, said.slice(0, 3).join(' | '));

  // known species branch still reads right ("This oak, ...")
  Game.state.codex.trees = { oak: { level: 1 } };
  const detail2 = Game.genDetail(Game.map.px, Game.map.py);
  // force a known-species modifier on this cell for the branch check
  const t = Game.playerTile();
  t.modifiers = t.modifiers || {};
  t.secrets = t.secrets || {};
  t.modifiers[found.cx + ',' + found.cy] = { species: 'oak', health: 'healthy' };
  t.secrets[found.cx + ',' + found.cy] = { known: false, yield: 0 };
  said = [];
  try { Game._cellInteract(found.cx, found.cy); } catch (e) { said.push('ERROR: ' + e.message); }
  const knownLines = said.filter(s => s.startsWith('This oak, healthy.'));
  ok('known species: "This oak, healthy."', knownLines.length > 0, said.slice(0, 3).join(' | '));

  // deep-examine branch ("You circle the ...") must not double the article either
  Game.state.codex.examined = {}; // reset depth for a fresh deep-examine cycle
  t.modifiers[found.cx + ',' + found.cy] = { health: 'healthy' }; // no species -> 'a tree'
  delete t.secrets[found.cx + ',' + found.cy]; // bypass cellInteract secret path; use examineCell directly
  said = [];
  try {
    Game.examineCell(found.cx, found.cy); // depth 1: "A tree, healthy."
    Game.examineCell(found.cx, found.cy); // depth 2: "You circle the tree."
  } catch (e) { said.push('ERROR: ' + e.message); }
  const circled = said.filter(s => /You circle the/.test(s));
  ok('deep examine circles exactly one tree', circled.length > 0 && !/You circle the (a|an) /i.test(circled[0]), circled.slice(0, 1).join(' | '));

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
