#!/usr/bin/env node
// BREAK-IT: knowledge system, depth pass 3 (2026-10-10).
// Prior passes (4th/5th/6th/7th/r2, plus this morning's displayName/prep-ladder
// pass) hardened: displayName gates, plantCalledName believed-name funnel,
// prep ladder, dead grantKnowledge branches, taught[] sync, diary believed
// names (learnPart/thickenKnowledge), deliberate-liar flag, per-sweep harvest
// pacing, teach-loop trust cap.
//
// This pass attacks the BELIEVED-NAME surface that r2 left: the false label
// (wrongAs) is the player's truth until corrected, but several surfaces still
// speak/print the TRUE name for wrongAs plants:
//   H1. forage pack line (game.js) + foodForageItem (food.js) name new items
//       with the TRUE name for a wrongAs plant.
//   H2. wrongTeaching never renames EXISTING inventory stacks: identify honestly
//       at L1 (items get true names), then get taught wrong -> wrongAs set,
//       items keep the true name you no longer believe.
//   H3. resolveWrongName never refreshes inventory names: after the truth
//       arrives, stacks keep showing the false/descriptor name.
//   H4. poison diary entry (journal.js wrap 10) uses p.name (true) for a
//       wrongAs plant — the diary is the player's hand.
//
// Also attacked (expected holds):
//   E1. grantKnowledge/learnSkill/_grantRecipe repeat + downgrade -> false.
//   E2. combineKnowledge jackpot one-shot per plant.
//   S1. L3 reachable for medicinal (non-food-use) plants via tastings.
//   D1. grantKnowledge('tree'/'monster') -> false; no callers in src.
//   H5. monsterDisplayName post-System vs monsterKnown gate divergence (document).
//
// Usage: node scripts/test-break-knowledge-20261010c.js
//        BEFORE=1 node scripts/test-break-knowledge-20261010c.js (pre-fix HEAD)
//        SEED=99 node scripts/test-break-knowledge-20261010c.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

const PRE = ['src/js/game.js', 'src/js/journal.js', 'src/js/food.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bk3-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bk3-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); try { return origSay.call(this, t); } catch (e) {} };

function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}
function pickPlant() {
  return (Game.data.plants || []).find(p => p.name && !(Game.state.codex.plants || {})[p.id]);
}
function pickOtherPlant(excludeId) {
  return (Game.data.plants || []).find(p => p.id !== excludeId && p.name);
}
function rigForagePatch(pid) {
  Game.debugToWildNode();
  const t = Game.playerTile();
  const detail = Game.genDetail(Game.map.px, Game.map.py);
  const mx = Game.state.scholar.mx ?? 4, my = Game.state.scholar.my ?? 4;
  t.plantSpecies = t.plantSpecies || {};
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = mx + dx, cy = my + dy;
    if (cx < 0 || cx > 8 || cy < 0 || cy > 8) continue;
    detail[cy][cx] = 'plant';
    delete (t.detailRegrow || {})[cx + ',' + cy];
    t.plantSpecies[cx + ',' + cy] = pid;
  }
  t.stock = Math.max(t.stock || 0, 20);
  return t;
}

(async () => {
await Game.init();
Game.drama = () => {};
Game.audioEvent = () => {};
console.log(`seed=${SEED}`);

// ---------- H1. wrongAs plant: forage names items/pack line with TRUE name ----------
console.log('H1. believed-name: forage of a wrongly-taught plant');
{
  freshGame();
  const P = pickPlant();
  const W = pickOtherPlant(P.id);
  const me = Game.villagerId;
  const vid = Game.state.village.roster.filter(id => id !== me)[0];
  Game.state.village.wrongAbout = Game.state.village.wrongAbout || {};
  Game.state.village.wrongAbout[vid] = { [P.id]: { wrongPid: W.id, deliberate: false } };
  const wt = Game.wrongTeaching(vid, P.id, 'taught');
  ok('wrong lesson lands', wt === 'taught-wrong', `got ${wt}`);
  const entry = Game.state.codex.plants[P.id];
  ok('entry carries false label', entry && entry.wrongAs === W.name, `wrongAs=${entry && entry.wrongAs}`);
  ok('believed name is the false one', Game.plantCalledName(P.id) === W.name,
    `called=${Game.plantCalledName(P.id)}`);

  rigForagePatch(P.id);
  Game.doAction('forage');
  const items = (Game.state.scholar.inventory || []).filter(i => i.plantId === P.id);
  ok('forage yielded items of P', items.length > 0, `n=${items.length}`);
  const trueNamed = items.filter(i => (i.name || '').indexOf(P.name) !== -1);
  ok('no inventory item carries the TRUE name', trueNamed.length === 0,
    `true-named items: ${trueNamed.map(i => i.name).join('|')}`);
  const believedNamed = items.filter(i => (i.name || '').indexOf(W.name) !== -1);
  ok('inventory items carry the BELIEVED name', believedNamed.length === items.length && items.length > 0,
    `names: ${items.map(i => i.name).join('|')}`);
  const packLines = said.filter(s => /×/.test(s));
  const trueInSay = packLines.filter(s => s.indexOf(P.name) !== -1);
  ok('pack say-line never prints the TRUE name', trueInSay.length === 0,
    `leaks: ${trueInSay.join(' // ').slice(0, 200)}`);
}

// ---------- H2. wrongTeaching renames EXISTING stacks to the false name ----------
console.log('H2. believed-name: taught-wrong renames existing inventory stacks');
{
  freshGame();
  const P = pickPlant();
  const W = pickOtherPlant(P.id);
  const me = Game.villagerId;
  const vid = Game.state.village.roster.filter(id => id !== me)[0];
  // honestly identify first: stacks get the true name
  Game.identifyPlant(P.id, 'discovery');
  Game.state.scholar.inventory.push(Game.foodForageItem(
    (Game.data.plants || []).find(x => x.id === P.id), true, 3, 100, Game.state.scholar.day));
  const before = Game.state.scholar.inventory.filter(i => i.plantId === P.id).map(i => i.name);
  ok('stack named truly before the lie', before.length > 0 && before.every(n => n.indexOf(P.name) !== -1),
    `names: ${before.join('|')}`);
  // now taught wrong (L1 -> taught-wrong branch)
  Game.state.village.wrongAbout = Game.state.village.wrongAbout || {};
  Game.state.village.wrongAbout[vid] = { [P.id]: { wrongPid: W.id, deliberate: true } };
  const wt = Game.wrongTeaching(vid, P.id, 'taught');
  ok('wrong lesson lands on L1 plant', wt === 'taught-wrong', `got ${wt}`);
  const after = Game.state.scholar.inventory.filter(i => i.plantId === P.id).map(i => i.name);
  ok('stacks renamed to the BELIEVED (false) name', after.length > 0 && after.every(n => n.indexOf(W.name) !== -1),
    `names: ${after.join('|')}`);
}

// ---------- H3. resolveWrongName refreshes inventory names to the truth ----------
console.log('H3. believed-name: correction refreshes inventory names');
{
  freshGame();
  const P = pickPlant();
  const W = pickOtherPlant(P.id);
  const me = Game.villagerId;
  const vid = Game.state.village.roster.filter(id => id !== me)[0];
  Game.state.village.wrongAbout = Game.state.village.wrongAbout || {};
  Game.state.village.wrongAbout[vid] = { [P.id]: { wrongPid: W.id, deliberate: false } };
  Game.wrongTeaching(vid, P.id, 'taught');
  Game.state.scholar.inventory.push(Game.foodForageItem(
    (Game.data.plants || []).find(x => x.id === P.id), true, 2, 80, Game.state.scholar.day));
  // force the false name onto the stack (post-H1/H2 this is automatic; belt-and-braces)
  for (const it of Game.state.scholar.inventory) if (it.plantId === P.id) it.name = W.name + ' (x)';
  const fixed = Game.resolveWrongName(P.id, 'tasted');
  ok('resolveWrongName fires', fixed === true);
  ok('wrongAs cleared', !((Game.state.codex.plants[P.id] || {}).wrongAs));
  const names = Game.state.scholar.inventory.filter(i => i.plantId === P.id).map(i => i.name);
  ok('stacks now carry the TRUE name', names.length > 0 && names.every(n => n.indexOf(P.name) !== -1),
    `names: ${names.join('|')}`);
  ok('no stack keeps the false name', names.every(n => n.indexOf(W.name) === -1),
    `names: ${names.join('|')}`);
}

// ---------- H4. poison diary uses the believed name (real wrap-10 path) ----------
console.log('H4. believed-name: poison diary entry for wrongAs plant');
{
  freshGame();
  const P = pickPlant();
  const W = pickOtherPlant(P.id);
  const me = Game.villagerId;
  const vid = Game.state.village.roster.filter(id => id !== me)[0];
  Game.state.village.wrongAbout = Game.state.village.wrongAbout || {};
  Game.state.village.wrongAbout[vid] = { [P.id]: { wrongPid: W.id, deliberate: false } };
  Game.wrongTeaching(vid, P.id, 'taught');
  const pdef = (Game.data.plants || []).find(x => x.id === P.id);
  const item = Game.foodForageItem(pdef, true, 1, pdef.caloriesPerUnit, Game.state.scholar.day);
  item.poisonRisk = { p: 1, note: 'bitter alkaloids' }; // deterministic: poison always lands
  Game.state.scholar.inventory.push(item);
  Game.state.scholar.kcal = 0;
  Game.eatOne(Game.state.scholar.inventory.length - 1);
  const entries = Game.journalPlantEntries(P.id);
  const poison = entries.filter(e => e.kind === 'poison');
  ok('poison entry written via the real wrap', poison.length > 0,
    `kinds=${entries.map(e => e.kind).join(',')}`);
  const text = poison.map(e => e.text || '').join(' ');
  ok('diary names the BELIEVED plant', text.indexOf(W.name) !== -1, `text=${text.slice(0, 160)}`);
  ok('diary never prints the TRUE name', text.indexOf(pdef.name) === -1, `text=${text.slice(0, 160)}`);
}

// ---------- E1. knowledge grants are one-shot ----------
console.log('E1. grant monotonicity (exploit: repeated grants)');
{
  freshGame();
  const P = pickPlant();
  const r1 = Game.grantKnowledge('plant', P.id, 3, { type: 'discovery' });
  ok('first deep grant lands', r1 === true);
  let repeats = 0;
  for (let i = 0; i < 5; i++) if (Game.grantKnowledge('plant', P.id, 3, { type: 'discovery' })) repeats++;
  ok('5 repeat grants all refused', repeats === 0, `granted ${repeats}`);
  ok('downgrade refused', Game.grantKnowledge('plant', P.id, 1, { type: 'discovery' }) === false);
  ok('level held at 3', ((Game.state.codex.plants[P.id] || {}).level) === 3);

  const R = (Game.data.recipes || []).find(r => r.id && !((Game.state.codex.recipes || {})[r.id] || {}).level);
  if (R) {
    ok('first recipe grant lands', Game.grantKnowledge('recipe', R.id, 2, { type: 'read' }) === true);
    ok('recipe repeat refused', Game.grantKnowledge('recipe', R.id, 2, { type: 'read' }) === false);
  }
  const K = (Game.data.knowledge || []).find(k => k.id && !((Game.state.codex.skills || {})[k.id]));
  if (K) {
    ok('first skill grant lands', Game.learnSkill(K.id, 1, 'discovery') === true);
    ok('skill repeat refused', Game.learnSkill(K.id, 1, { type: 'discovery' }) === false);
  }
}

// ---------- E2. combineKnowledge jackpot is one-shot ----------
console.log('E2. combineKnowledge (exploit: jackpot farming)');
{
  freshGame();
  const P = pickPlant();
  Game.identifyPlant(P.id, 'discovery');
  const e = Game.state.codex.plants[P.id];
  e.harvests = 5;
  const v = Game.state.village;
  v.sharedKnowledge = v.sharedKnowledge || {};
  v.sharedKnowledge[P.id] = { discoveredBy: v.roster[1], day: 0, level: 3 };
  const jacks = [];
  const origJackpot = Game.jackpot;
  Game.jackpot = function (t) { jacks.push(t); try { return origJackpot.call(this, t); } catch (err) {} };
  let grants = 0;
  for (let i = 0; i < 20; i++) if (Game.combineKnowledge(P.id)) grants++;
  Game.jackpot = origJackpot;
  ok('exactly one combine grant', grants === 1, `grants=${grants}`);
  ok('level capped at source depth', ((Game.state.codex.plants[P.id] || {}).level) === 3);
  ok('at most one jackpot', jacks.length <= 1, `jackpots=${jacks.length}`);
}

// ---------- S1. L3 reachable for medicinal (non-food-use) plants ----------
console.log('S1. softlock: L3 via tastings for a medicinal plant');
{
  freshGame();
  const med = (Game.data.plants || []).find(p => p.medicinal && (p.caloriesPerUnit || 0) > 0 && !(Game.state.codex.plants || {})[p.id]);
  if (!med) { console.log('  skip — no medicinal plant available'); }
  else {
    Game.identifyPlant(med.id, 'discovery');
    const e = Game.state.codex.plants[med.id];
    e.level = 2; e.harvests = 5; e.prepKnown = true;
    for (let i = 0; i < 3; i++) {
      Game.state.scholar.inventory.push(Game.foodForageItem(med, true, 1, med.caloriesPerUnit, Game.state.scholar.day));
      Game.state.scholar.kcal = 0;
      Game.eatOne(Game.state.scholar.inventory.length - 1);
    }
    ok('3 tastings accrue', (e.tastings || 0) >= 3, `tastings=${e.tastings}`);
    ok('L3 reached', (e.level || 0) === 3, `level=${e.level}`);
  }
}

// ---------- D1. dead grantKnowledge branches ----------
console.log('D1. dead code: tree/monster grant domains');
{
  freshGame();
  const P = pickPlant();
  ok("grantKnowledge('tree') refused", Game.grantKnowledge('tree', P.id, 1, {}) === false);
  ok("grantKnowledge('monster') refused", Game.grantKnowledge('monster', P.id, 1, {}) === false);
  const src = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'src/js/journal.js'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'src/js/food.js'), 'utf8');
  const callers = (src.match(/grantKnowledge\(\s*['"](tree|monster)['"]/g) || []);
  ok('no callers pass tree/monster domains', callers.length === 0, `found ${callers.length}`);
}

// ---------- H5. monster name gates post-System (documented divergence) ----------
console.log('H5. monster gates: displayName vs monsterKnown (post-System)');
{
  freshGame();
  const mdef = (Game.data.monsters || [])[0];
  if (!mdef) { console.log('  skip — no monsters'); }
  else {
    const pre = Game.monsterDisplayName(mdef.id);
    ok('pre-System: descriptor, not true name', pre !== mdef.name, `shown=${pre}`);
    Game.state.systemArrived = true;
    const post = Game.monsterDisplayName(mdef.id);
    const known = Game.monsterKnown(mdef.id);
    console.log(`  info: post-System displayName="${post}" monsterKnown=${known} (System labels everything — by design; gates diverge, documented)`);
    Game.state.systemArrived = false;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
