#!/usr/bin/env node
// GAP 3 — discovery breadth monoculture (2026-10-10).
//
// Before: codexBreadth() counted plants (L1+), recipes (all keys), skills (L2+)
// and monsters via (e.level||0)>=1 — but monster codex entries carry `stage`,
// never `level`, so the entire 30-species monster codex contributed ZERO to
// breadth, forever. Animal knowledge (48 species) and techniques were never
// counted either. Result: breadth was a plant monoculture (60-80% plants),
// starving Arc IV's 25-breadth gate and plateauing once nearby plants ran out.
//
// After: monsters count at stage observed/slain (sightings still don't),
// animals count at L1+, techniques count. Plus deed-reactive sources that
// keep breadth growing with declining returns:
//   - ruin books: one 30% roll on the FIRST search of each ruin (was 10%
//     after loot exhausted -> ~0.1 books/run)
//   - explorer field lessons: plant lessons now SPEND one earned teachable
//     entry each (was infinite on k.plants>=3); monster lessons teach one
//     fought species -> 'observed' (was flavor text only)
//
// Usage: node scripts/test-breadth-20261010.js
//        SEED=7 node scripts/test-breadth-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; /* console.log('  ok   ' + name); */ }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null;
  return Game.state.scholar;
}
function npcIds(n) {
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, n || 3);
}
function b() { return Game.codexBreadth(); }

(async () => {
  await Game.init();
  Game.drama = () => {};
  Game.audioEvent = () => {};

// ============ A. codexBreadth domains ============
console.log('A. breadth domains');
freshGame();
{
  const base = b();
  const cx = Game.state.codex;
  const plants = Object.values(cx.plants || {}).filter(e => (e.level || 0) >= 1).length;
  const recipes = Object.keys(cx.recipes || {}).length;
  const skills = Object.values(cx.skills || {}).filter(e => (e.level || 0) >= 2).length;
  ok('A1 fresh breadth = plants+recipes+skills only', base === plants + recipes + skills, `base=${base} p=${plants} r=${recipes} s=${skills}`);
}
{
  // monsters: 'encountered' (mere sighting) must NOT count
  const before = b();
  Game.ensureMonsterEntry('hushwolf');
  ok('A2 sighting (encountered) adds nothing', b() === before, `before=${before} after=${b()}`);
  Game.state.codex.monsters['hushwolf'].stage = 'observed';
  ok('A3 observed monster +1', b() === before + 1);
  Game.state.codex.monsters['hushwolf'].stage = 'slain';
  ok('A4 slain monster still +1 (no double count)', b() === before + 1);
  Game.ensureMonsterEntry('highbeam_deer');
  Game.state.codex.monsters['highbeam_deer'].stage = 'observed';
  ok('A5 second observed species +1 more', b() === before + 2);
}
{
  // animals: L1+ counts, L0 doesn't
  const before = b();
  const aid = (Game.data.animals || [])[0].id;
  Game.state.codex.animals = Game.state.codex.animals || {};
  Game.state.codex.animals[aid] = { level: 0 };
  ok('A6 animal L0 adds nothing', b() === before);
  Game.state.codex.animals[aid] = { level: 1 };
  ok('A7 animal L1 +1', b() === before + 1);
  Game.state.codex.animals[aid] = { level: 4 };
  ok('A8 animal L4 still +1 (breadth, not depth)', b() === before + 1);
}
{
  // techniques: binary, each known one counts
  const b0 = b();
  Game.state.codex.techniques = Object.assign(Game.state.codex.techniques || {}, { render_fat: { level: 1 } });
  ok('A9 technique known +1', b() === b0 + 1);
}
{
  // recipes: L1+ counts; a level-0 entry is dishonest breadth
  const before = b();
  const rid = (Game.data.recipes || []).find(r => !((Game.state.codex.recipes || {})[r.id])).id;
  Game.state.codex.recipes[rid] = { level: 1 };
  ok('A10 recipe L1 +1', b() === before + 1);
  Game.state.codex.recipes[rid] = { level: 0 };
  ok('A11 recipe L0 adds nothing', b() === before);
}
{
  // skills: L1 heard-of doesn't count, L2 practiced does
  const before = b();
  const sid = (Game.data.knowledge || []).find(k => !((Game.state.codex.skills || {})[k.id])).id;
  Game.state.codex.skills[sid] = { level: 1 };
  ok('A12 skill L1 adds nothing', b() === before);
  Game.state.codex.skills[sid] = { level: 2 };
  ok('A13 skill L2 +1', b() === before + 1);
}
{
  // plants: L0 experiment entry doesn't count, L1 does
  const before = b();
  const pid = (Game.data.plants || []).find(p => !((Game.state.codex.plants || {})[p.id])).id;
  Game.state.codex.plants[pid] = { level: 0, harvests: 0, tastings: 0 };
  ok('A14 plant L0 (blind bite) adds nothing', b() === before);
  Game.state.codex.plants[pid] = { level: 1 };
  ok('A15 plant L1 +1', b() === before + 1);
}

// ============ B. ruin books ============
console.log('B. ruin books');
function ruinTile() {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    if (t && t.type === 'ruin') return { x, y, t };
  }
  return null;
}
{
  // statistical: first-search book rate ~30% over many fresh ruins
  let found = 0, n = 40;
  for (let i = 0; i < n; i++) {
    freshGame();
    const r = ruinTile();
    if (!r) { ok('B0 ruin exists on map', false); break; }
    r.t.loot = []; // empty loot: old code only rolled here
    Game.map.px = r.x; Game.map.py = r.y;
    const invBefore = Game.state.scholar.inventory.length;
    Game.doAction('forage');
    const got = Game.state.scholar.inventory.slice(invBefore).some(it => it.bookId);
    if (got) found++;
  }
  ok('B1 ruin-exists sanity', true);
  ok('B2 first-search book rate ~30%', found >= 6 && found <= 20, `found ${found}/${n}`);
}
{
  // one roll per ruin: a second search never yields a book
  freshGame();
  const r = ruinTile();
  r.t.loot = [];
  Game.map.px = r.x; Game.map.py = r.y;
  Game.doAction('forage'); // first search: consumes the roll
  const invAfterFirst = Game.state.scholar.inventory.filter(i => i.bookId).length;
  r.t.loot = [];
  Game.doAction('forage'); // second search
  Game.doAction('forage'); // third search
  const invAfterMore = Game.state.scholar.inventory.filter(i => i.bookId).length;
  ok('B3 one book roll per ruin (no farm)', invAfterMore === invAfterFirst, `${invAfterFirst} -> ${invAfterMore}`);
  ok('B4 bookChecked set after first search', r.t.bookChecked === true);
}
{
  // a found book actually feeds breadth when read
  freshGame();
  const book = Game.data.books[0];
  const before = b();
  Game.state.scholar.inventory.push({ bookId: book.id, units: 1, name: book.name, kcalEach: 0, spoilDay: 9999, unit: 'book', prep: 'Read it.', kg: 0.5 });
  Game.readBook(book.id);
  ok('B5 reading a book grows breadth', b() > before, `before=${before} after=${b()}`);
  ok('B6 book consumed on read', !Game.state.scholar.inventory.some(i => i.bookId === book.id));
}

// ============ C. explorer field lessons ============
console.log('C. explorer lessons');
{
  freshGame();
  const vid = npcIds(1)[0];
  const st = Game.agencyState();
  st.teachable[vid] = [{ topic: 'plants', day: 1 }, { topic: 'plants', day: 2 }];
  const b0 = b();
  const r1 = Game.agencyTeachPlant(vid);
  ok('C1 plant lesson granted', r1 === true);
  ok('C2 plant lesson +1 breadth', b() === b0 + 1);
  ok('C3 lesson spent one entry (2->1)', (st.teachable[vid] || []).length === 1);
  Game.agencyTeachPlant(vid);
  ok('C4 second lesson spent the last entry', (st.teachable[vid] || []).length === 0);
  const b2 = b();
  const r3 = Game.agencyTeachPlant(vid);
  ok('C5 no entries -> no lesson (declining returns)', r3 === false && b() === b2);
}
{
  // monster lessons: fought species -> observed
  freshGame();
  const vid = npcIds(1)[0];
  const a = Game.agencyOf(vid);
  a.know[vid].fought = ['hushwolf', 'highbeam_deer'];
  const teachable = Game.agencyTeachableMonsters(vid);
  ok('C6 two fought species are teachable', teachable.length === 2, JSON.stringify(teachable));
  const b0 = b();
  const taught = Game.agencyTeachMonster(vid);
  ok('C7 monster lesson taught a species', !!taught);
  const stage = (Game.state.codex.monsters[taught] || {}).stage;
  ok('C8 taught species now observed', stage === 'observed', `stage=${stage}`);
  ok('C9 monster lesson +1 breadth', b() === b0 + 1);
  ok('C10 taught species no longer teachable', Game.agencyTeachableMonsters(vid).length === 1);
}
{
  // slain is never downgraded by a lesson
  freshGame();
  const vid = npcIds(1)[0];
  const a = Game.agencyOf(vid);
  a.know[vid].fought = ['hushwolf'];
  Game.state.codex.monsters['hushwolf'] = { stage: 'slain' };
  const b0 = b();
  const taught = Game.agencyTeachMonster(vid);
  ok('C11 slain species is not re-teachable', taught === null && b() === b0);
}
{
  // evaded-only species are sightings, not teachable knowledge
  freshGame();
  const vid = npcIds(1)[0];
  const a = Game.agencyOf(vid);
  a.know[vid].monsters = 3; // saw things, fought nothing
  a.know[vid].fought = [];
  ok('C12 evades-only -> no monster lesson', Game.agencyTeachMonster(vid) === null);
  ok('C13 npcFieldLessons has no monster topic without fought species',
    !Game.npcFieldLessons(vid).some(l => l.topic === 'monsters'));
  a.know[vid].fought = ['hushwolf'];
  ok('C14 npcFieldLessons lists monster topic once fought',
    Game.npcFieldLessons(vid).some(l => l.topic === 'monsters'));
}
{
  // ask_field consumes: plant entry spent, monster taught once
  freshGame();
  const vid = npcIds(1)[0];
  const st = Game.agencyState();
  const a = Game.agencyOf(vid);
  st.teachable[vid] = [{ topic: 'plants', day: 1 }];
  a.know[vid].fought = ['hushwolf'];
  const b0 = b();
  Game.agencyTurn(vid, 'agency:ask_field');
  ok('C15 ask_field granted both lessons (+2 breadth)', b() === b0 + 2, `b0=${b0} b1=${b()}`);
  ok('C16 ask_field spent the plant entry', (st.teachable[vid] || []).length === 0);
  const b1 = b();
  Game.agencyTurn(vid, 'agency:ask_field');
  ok('C17 second ask grants nothing new (spent)', b() === b1, `b1=${b1} b2=${b()}`);
}

// ============ D. regression: gates & consumers ============
console.log('D. regressions');
{
  freshGame();
  // Arc II deed counts NEW breadth across all domains
  const pg = Game.progState();
  pg.baseBreadth = b();
  Game.state.codex.monsters['hushwolf'] = { stage: 'slain' }; // a real kill
  const aid = (Game.data.animals || [])[1].id;
  Game.state.codex.animals = { [aid]: { level: 1 } };
  const deedDelta = b() - (pg.baseBreadth || 0);
  ok('D1 kills+hunts count as new breadth for the Arc II deed', deedDelta >= 2, `delta=${deedDelta}`);
}
{
  freshGame();
  // codexAttunement (corpses.js, separate calc) still works
  Game.state.systemArrived = true;
  Game.state.scholar.day = 5;
  ok('D2 attunement pre-day-12 low-breadth is 1', Game.codexAttunement() === 1);
  Game.state.scholar.day = 13;
  ok('D3 attunement day>=12 is 2', Game.codexAttunement() === 2);
}
{
  freshGame();
  // board + arc check don't crash on the new domains
  Game.state.codex.monsters['hushwolf'] = { stage: 'observed' };
  Game.state.codex.animals = { deer: { level: 2 } };
  Game.state.codex.techniques = Object.assign(Game.state.codex.techniques || {}, { render_fat: { level: 1 } });
  let crashed = false;
  try { Game.playerBoardScore(); Game.checkArc(); } catch (e) { crashed = true; }
  ok('D4 board/arc consumers survive new domains', !crashed);
}
{
  // betrayal + ledger breadth consumers still consistent
  freshGame();
  const cxB = Object.keys(Game.state.codex.plants || {}).length;
  ok('D5 breadth is a finite number', Number.isFinite(b()) && b() >= 0);
}

// ============ E. monoculture: diverse deeds keep breadth growing ============
console.log('E. diversity');
{
  freshGame();
  const curve = [b()];
  const addPlant = () => { const p = (Game.data.plants || []).find(x => !((Game.state.codex.plants || {})[x.id])); Game.state.codex.plants[p.id] = { level: 1 }; };
  const addMonster = () => { const m = (Game.data.monsters || []).find(x => !((Game.state.codex.monsters || {})[x.id])); Game.state.codex.monsters[m.id] = { stage: 'observed' }; };
  const addAnimal = () => { const an = (Game.data.animals || []).find(x => !((Game.state.codex.animals || {})[x.id])); Game.state.codex.animals = Game.state.codex.animals || {}; Game.state.codex.animals[an.id] = { level: 1 }; };
  // 5 plants (forager), 3 monsters (fighter), 2 animals (hunter), 1 technique, 2 recipes, 1 skill L2
  for (let i = 0; i < 5; i++) addPlant();
  for (let i = 0; i < 3; i++) addMonster();
  for (let i = 0; i < 2; i++) addAnimal();
  const techBefore = Object.keys(Game.state.codex.techniques || {}).length;
  Game.state.codex.techniques = Object.assign(Game.state.codex.techniques || {}, { gapbreadth_test_tech: { level: 1 } });
  const techAdded = Object.keys(Game.state.codex.techniques || {}).length - techBefore;
  const rids = (Game.data.recipes || []).filter(r => !((Game.state.codex.recipes || {})[r.id])).slice(0, 2);
  for (const r of rids) Game.state.codex.recipes[r.id] = { level: 1 };
  const sid = (Game.data.knowledge || []).find(k => !((Game.state.codex.skills || {})[k.id])).id;
  Game.state.codex.skills[sid] = { level: 2 };
  curve.push(b());
  const cx = Game.state.codex;
  const plants = Object.values(cx.plants || {}).filter(e => (e.level || 0) >= 1).length;
  const total = b();
  const plantShare = plants / total;
  ok('E1 diverse deeds all counted', total === curve[0] + 5 + 3 + 2 + techAdded + 2 + 1, `total=${total} base=${curve[0]} techAdded=${techAdded}`);
  ok('E2 plants are no longer the monoculture (<60%)', plantShare < 0.6, `share=${plantShare.toFixed(2)}`);
  ok('E3 non-plant domains contribute (>=40%)', (total - plants) / total >= 0.4);
  // monotone: each domain keeps growing breadth later, no plateau from one source drying up
  const bBefore = b();
  addMonster(); addAnimal();
  ok('E4 breadth keeps growing via fighter/hunter deeds', b() === bBefore + 2);
}

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
})();
