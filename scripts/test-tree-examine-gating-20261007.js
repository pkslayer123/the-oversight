#!/usr/bin/env node
// PROOF TEST (2026-10-07): tree examine species gating.
// Regression: commit 98b7f62 ("Examine is pure knowledge") replaced the live
// codex.trees read (this.treeName(mod.species)) with mod.speciesKnown — a
// field written nowhere — so NO tree was ever named on examine, not even
// oak/hickory which newGame grants as L1 common knowledge. Examine said
// "This tree you don't recognize... you're not sure what kind of tree this
// is" for trees the design says you know.
// Fix: examine reads codex.trees via this.treeName(mod.species) again.
// This test asserts, on a fresh game:
//   1. oak/hickory start at codex.trees L1 (common knowledge).
//   2. Examining an oak/hickory tree NAMES it and offers the nut take.
//   3. Examining a non-oak/hickory tree does NOT name it (gate holds).
//   4. The second tap (Forage nuts) still gates the NUTS on plant knowledge
//      (knowing the tree != knowing the nut is food) — unknown nuts lump.
// Seeded RNG (mulberry32, SEED env). Run: SEED=7 node scripts/test-tree-examine-gating-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const ORDER = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
  'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

const says = [];
const results = [];
const check = (name, cond, detail) => {
  results.push([name, !!cond]);
  console.log(`   [${cond ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};
function walkTo(tx, ty) {
  const s = Game.state.scholar;
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const walkable = (x, y) => {
    if (x < 0 || x > 8 || y < 0 || y > 8) return false;
    const c = detail[y] && detail[y][x];
    return !Game.cellProps(c).blocks;
  };
  const prev = {}, seen = new Set([s.mx + ',' + s.my]), q = [[s.mx, s.my]];
  let goal = null;
  const isGoal = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && walkable(x, y);
  if (isGoal(s.mx, s.my)) goal = [s.mx, s.my];
  while (q.length && !goal) {
    const [x, y] = q.shift();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || !walkable(nx, ny)) continue;
      seen.add(k); prev[k] = [x, y];
      if (isGoal(nx, ny)) { goal = [nx, ny]; q.length = 0; break; }
      q.push([nx, ny]);
    }
  }
  if (!goal) return false;
  const p = [];
  for (let cur = goal; cur[0] !== s.mx || cur[1] !== s.my; cur = prev[cur[0] + ',' + cur[1]]) p.unshift(cur);
  for (const [x, y] of p) { if (!Game.pathStep(x, y)) return false; }
  return true;
}
function examineCell(x, y) {
  if (!walkTo(x, y)) return null;
  says.length = 0;
  Game._cellInteract(x, y);
  const m = says.join(' || '); says.length = 0;
  return m;
}
// tree cells on current tile, categorized by modifier species
function treeCells() {
  const t = Game.playerTile(), d = Game.genDetail(Game.map.px, Game.map.py);
  const known = [], unknown = [];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
    const c = d[y] && d[y][x];
    if (c !== 'tree' && c !== 'bigtree') continue;
    const mod = t.modifiers && t.modifiers[x + ',' + y];
    const sp = mod && mod.species;
    if (!sp) continue;
    const sec = t.secrets && t.secrets[x + ',' + y];
    const rec = { x, y, sp, yield: (sec && sec.yield) || 0 };
    (((sp === 'oak' || sp === 'hickory') ? known : unknown)).push(rec);
  }
  // prefer trees that actually have nuts for the forage-nuts sub-check
  known.sort((a, b) => b.yield - a.yield);
  return { known, unknown };
}

(async () => {
  await Game.init();
  Game.say = ((os) => (t) => { says.push(String(t)); return os(t); })(Game.say.bind(Game));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  check('oak + hickory start as L1 common knowledge in codex.trees',
    (Game.treeLevel('oak') || 0) >= 1 && (Game.treeLevel('hickory') || 0) >= 1,
    `oak=${Game.treeLevel('oak')} hickory=${Game.treeLevel('hickory')}`);

  // find tiles with both a known-species tree and an unknown-species tree
  let kc = null, uc = null, tries = 0;
  const seenTiles = new Set();
  while (tries++ < 6 && (!kc || !uc)) {
    const { known, unknown } = treeCells();
    if (!kc && known.length) kc = known[0];
    if (!uc && unknown.length) uc = unknown[0];
    if (kc && uc) break;
    const targets = (Game.travelTargets() || []).filter(t => {
      const tt = Game.tileAt(t.x, t.y);
      return tt && tt.type !== 'ruin' && tt.type !== 'haven' && !seenTiles.has(t.x + ',' + t.y);
    });
    if (!targets.length) break;
    seenTiles.add(targets[0].x + ',' + targets[0].y);
    Game.travelTo(targets[0].x, targets[0].y);
  }
  if (!kc) { check('known-species tree found for examine', false, 'no oak/hickory tree on 6 tiles'); }
  else {
    const m = examineCell(kc.x, kc.y);
    const named = m && new RegExp(`this ${kc.sp}`, 'i').test(m);
    const noLie = m && !/don't recognize|not sure what kind/i.test(m);
    check('examine NAMES a common-knowledge tree (oak/hickory)',
      !!m && named && noLie, m ? m.slice(0, 120) : 'no message');
    // second tap: forage nuts — nuts still gated on PLANT knowledge
    if (m) {
      says.length = 0;
      const s2 = Game.state.scholar;
      Game._cellInteract(kc.x, kc.y);
      const m2 = says.join(' || '); says.length = 0;
      const lumped = /unfamiliar unknown nuts|into the bag/i.test(m2);
      check('foraging nuts from the tree lumps them (nut plant not yet known)',
        lumped, m2.slice(0, 110));
    }
  }
  if (!uc) { check('unknown-species tree found for examine', false, 'no non-oak/hickory tree on 6 tiles'); }
  else {
    const m = examineCell(uc.x, uc.y);
    const honest = m && /don't recognize/i.test(m);
    const noLeak = m && !new RegExp(`\\b${uc.sp}\\b`, 'i').test(m);
    check('examine does NOT name an unknown tree species (gate holds)',
      !!m && honest && noLeak, m ? m.slice(0, 120) : 'no message');
  }

  const passed = results.filter(r => r[1]).length;
  console.log(`\nchecks: ${passed}/${results.length} pass (seed ${SEED})`);
  if (passed !== results.length) process.exitCode = 1;
})();
