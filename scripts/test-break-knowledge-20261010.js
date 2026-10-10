#!/usr/bin/env node
// BREAK-IT: knowledge system (2026-10-10). Hostile attacks on knowledge gating:
//
// K1. HONESTY (name leaks): pre-System, villagers are stranger descriptors,
//     not names ("Every user-facing reference to a person goes through
//     displayName()"). whoKnowsLump / specialistsHere / sortBag /
//     villageRoster / lastContrib returned or printed TRUE names.
// K2. HONESTY (footgun): plantCalledName() returned the true name with no
//     knowledge check — every call site happened to guard, but the function
//     itself was a leak waiting for the next caller.
// K3. HONESTY (prep ladder): preparation text is prepKnown-track / L2+
//     knowledge (the codex L1 card says "Prep: unknown — eat it or reach L2
//     to learn"), but identification (L1) printed p.preparation straight onto
//     items via foodForageItem / splitLumpOut / refreshItemNames.
// K4. DEAD CODE: grantKnowledge 'tree'/'monster' domains had zero callers —
//     _grantTree/_grantMonster were fully-built but never wired (Alien Players
//     lesson).
//
// HELD (attacked, resisted): trade-knowledge flow (counterfeit-currency +
// one-shot-lesson guards), conversation teach (wrong-name honesty, L1+
// filter), askSystemAbout (names via scientific name, never feeds),
// monster village-naming (proposal -> majority -> villageName), combineKnowledge
// (requires L1; hint uses believed name), canShow('plant',.,'kcal') display
// gating on pack/corpse/pantry surfaces.
//
// Usage: node scripts/test-break-knowledge-20261010.js
//        BEFORE=1 node scripts/test-break-knowledge-20261010.js  (pre-fix HEAD)
//        SEED=99 node scripts/test-break-knowledge-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

const PRE = ['src/js/food.js', 'src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bk10-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bk10-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seeded BEFORE eval: modules capture Math.random at load

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
// FULL script list in index.html order, minus DOM-only (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FILES = [...html.matchAll(/<script src="(src\/js\/[^"]+)\?/g)].map(m => m[1])
  .filter(f => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(f));
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // drop the stub: runtime checks take the sync path without window
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const says = [];
const origSay = Game.say;
Game.say = function (t) { says.push(String(t)); try { return origSay.call(this, t); } catch (e) {} };

function freshGame() {
  says.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return Game.state.scholar;
}
function trueNameOf(vid) {
  const v = (Game.data.villagers || []).find(x => x.id === vid) || {};
  return String(v.name || '');
}
function pickPlant() {
  // edible, non-nut plant with real preparation text
  const cands = (Game.data.plants || []).filter(p =>
    p.preparation && p.preparation.length > 10 &&
    !/crack|shell|husk/i.test(p.preparation) &&
    (p.edibility || 'safe') === 'safe' &&
    (p.caloriesPerUnit || 0) > 0);
  return cands[0];
}

(async () => {
await Game.init();
Game.drama = () => {};
Game.audioEvent = () => {};
console.log(`seed=${SEED}`);

console.log('K1. name leaks: stranger descriptors, not names (pre-System)');
{
  freshGame();
  ok('pre-System fixture', !Game.state.systemArrived);
  const me = Game.villagerId;
  const others = (Game.state.village.roster || []).filter(id => id !== me);
  // pick a villager whose name the player has NOT earned
  Game.state.village.knownNames = Game.state.village.knownNames || {};
  const stranger = others.find(id => !Game.nameKnown(id)) || others[0];
  delete Game.state.village.knownNames[stranger];
  const tn = trueNameOf(stranger);
  ok('stranger fixture unnamed', tn.length > 0 && !Game.nameKnown(stranger),
    `vid=${stranger} tn=${tn}`);
  const disp = Game.displayName(stranger);
  ok('displayName is a descriptor pre-System', disp !== tn && /woman|man|person/i.test(disp),
    `got "${disp}"`);

  // whoKnowsLump
  const P = pickPlant();
  const v = Game.state.village;
  v.plantKnowledge = v.plantKnowledge || {};
  v.plantKnowledge[stranger] = [P.id];
  Game.state.village.nodePos = Game.state.village.nodePos || {};
  Game.state.village.nodePos[stranger] = { nx: Game.map.px, ny: Game.map.py };
  const lump = { lump: { [P.id]: { units: 5, day: 0 } }, units: 5 };
  const knowers = Game.whoKnowsLump(lump) || [];
  const k = knowers.find(x => x.id === stranger);
  ok('whoKnowsLump: knower listed', !!k);
  if (k) ok('whoKnowsLump: no true name', k.name !== tn, `leaked "${k.name}"`);

  // specialistsHere — force a cook by temp occupation
  const rec = Game.getPerson(stranger);
  const oldOcc = rec ? rec.formerOccupation : null;
  if (rec) rec.formerOccupation = 'chef (test)';
  const specs = Game.specialistsHere('cook') || [];
  const s = specs.find(x => x.id === stranger);
  ok('specialistsHere: cook listed', !!s);
  if (s) ok('specialistsHere: no true name', s.name !== tn, `leaked "${s.name}"`);
  if (rec) rec.formerOccupation = oldOcc;

  // sortBag narration
  says.length = 0;
  const vv = Game.state.village;
  Game.map.px = vv.px ?? 4; Game.map.py = vv.py ?? 4; // at camp
  const stash = Game.state.scholar.prepStash = [];
  const lump2 = Game.addUnknownToLump(P, 4, Game.state.scholar.day, stash);
  Game.sortBag(stranger, stash.indexOf(lump2), stash);
  const leakedSort = says.some(t => t.includes(tn));
  ok('sortBag: narration has no true name', !leakedSort,
    leakedSort ? says.find(t => t.includes(tn)).slice(0, 90) : '');

  // villageRoster (haven panel source)
  const roster = Game.villageRoster();
  const r = roster.find(x => x.id === stranger);
  ok('villageRoster: entry present', !!r);
  if (r) ok('villageRoster: no true name', r.name !== tn, `leaked "${r.name}"`);
  const rme = roster.find(x => x.id === me);
  if (rme) ok('villageRoster: player keeps own name', rme.name === trueNameOf(me),
    `got "${rme.name}"`);

  // lastContrib (who's-pulling-weight source) via villageEats.
  // Entries carry no id — assert no UNEARNED true name appears anywhere.
  try {
    Game.villageEats();
    const lc = Game.state.village.lastContrib || [];
    ok('lastContrib: entries present', lc.length > 0);
    // lastContrib stores FIRST names — compare against those too
    const unearned = new Set();
    for (const id of others.filter(id => !Game.nameKnown(id))) {
      const full = trueNameOf(id);
      unearned.add(full);
      unearned.add(full.split(' ')[0]);
    }
    const leaked = lc.filter(x => unearned.has(x.name));
    ok('lastContrib: no unearned true name', leaked.length === 0,
      leaked.length ? `leaked "${leaked[0].name}"` : '');
  } catch (e) {
    ok('lastContrib: villageEats runs', false, 'threw: ' + e.message);
  }
}

console.log('K2. plantCalledName: no unguarded true name');
{
  freshGame();
  const P = pickPlant();
  delete (Game.state.codex.plants || {})[P.id];
  const called = Game.plantCalledName(P.id);
  ok('unknown plant: not the true name', called !== P.name, `leaked "${called}"`);
  ok('unknown plant: honest descriptor', called === (P.description || 'an unfamiliar plant'), `got "${called}"`);
  Game.identifyPlant(P.id, 'discovery');
  ok('known plant: true name', Game.plantCalledName(P.id) === P.name);
  // wrongAs still wins (believed name)
  Game.state.codex.plants[P.id].wrongAs = 'Fakeweed';
  ok('wrongly-known: believed name', Game.plantCalledName(P.id) === 'Fakeweed');
  delete Game.state.codex.plants[P.id].wrongAs;
}

console.log('K3. prep text is L2/prepKnown knowledge, not L1');
{
  freshGame();
  const P = pickPlant();
  ok('plant fixture has prep text', !!(P.preparation && P.preparation.length > 10));
  // background seeding may know it already — ensure a truly unknown slate
  delete (Game.state.codex.plants || {})[P.id];
  const day = Game.state.scholar.day;
  Game.addUnknownToLump(P, 4, day); // into inventory
  Game.identifyPlant(P.id, 'taught', 'Tester');
  const e = (Game.state.codex.plants || {})[P.id] || {};
  ok('identified at L1', (e.level || 0) === 1 && !e.prepKnown, `level=${e.level}`);
  const items = (Game.state.scholar.inventory || []).filter(it => it.plantId === P.id && !it.lump);
  ok('lump split out on identify', items.length > 0);
  const prepShown = items.some(it => String(it.prep || '').includes(P.preparation.slice(0, 24)));
  ok('L1 item does NOT print full prep text', !prepShown,
    prepShown ? `leaked: "${items[0].prep.slice(0, 70)}"` : '');
  const honestPlaceholder = items.length > 0 && items.every(it => /preparation unknown/i.test(String(it.prep || '')));
  ok('L1 item prep is honest placeholder', honestPlaceholder,
    `got "${String((items[0] || {}).prep || '').slice(0, 60)}"`);
  // earn prepKnown the honest way (first bite) -> items refresh
  if (typeof Game.refreshItemPrep === 'function') {
    e.prepKnown = true;
    Game.refreshItemPrep(P.id);
    const refreshed = (Game.state.scholar.inventory || []).filter(it => it.plantId === P.id && !it.lump);
    const nowShown = refreshed.some(it => String(it.prep || '').includes(P.preparation.slice(0, 24)));
    ok('prepKnown earned: items learn the prep text', nowShown);
  } else {
    ok('prepKnown earned: items learn the prep text', false, 'refreshItemPrep missing (expected pre-fix)');
  }
  // fresh forage of an L1 plant also gated
  delete (Game.state.codex.plants || {})[P.id];
  Game.identifyPlant(P.id, 'discovery');
  const fresh = Game.foodForageItem(P, true, 2, 200, day);
  ok('fresh forage at L1: prep gated', !String(fresh.prep || '').includes(P.preparation.slice(0, 24)),
    `leaked: "${String(fresh.prep).slice(0, 60)}"`);
}

console.log('K4. dead dispatcher domains');
{
  freshGame();
  const rt = Game.grantKnowledge('tree', 'oak_test', 1, { type: 'discovery' });
  ok("grantKnowledge('tree') refused (unwired domain)", rt === false, `returned ${rt}`);
  const rm = Game.grantKnowledge('monster', 'gallowdeer', 2, { type: 'discovery' });
  ok("grantKnowledge('monster') refused (unwired domain)", rm === false, `returned ${rm}`);
  ok('no phantom codex.trees entry', !(Game.state.codex.trees || {}).oak_test);
  // live domains still work
  const P = pickPlant();
  const rp = Game.grantKnowledge('plant', P.id, 1, { type: 'discovery' });
  ok("grantKnowledge('plant') still live", rp === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
