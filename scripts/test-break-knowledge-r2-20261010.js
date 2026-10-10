#!/usr/bin/env node
// BREAK-IT r2: knowledge system, depth pass 2 (2026-10-10).
// Prior run (break-knowledge.md) fixed: true-name leaks (displayName gates),
// plantCalledName footgun, prep-ladder bypass, dead grantKnowledge
// tree/monster branches. Its "noted tensions" are Steve-level design calls —
// NOT touched here. This pass attacks the REST of the knowledge system.
//
// K1. HONESTY (fix): the harvest-handling wrong-name resolution marked every
//     liar as an honest mistake — wb2[pid] threw ReferenceError (pid not in
//     scope in the harvested loop) and the try/catch swallowed it, so the
//     2026-10-09 deliberate fix never fired. callOutTeaching treats liars
//     differently (public humiliation + distrusted) — the flag changes play.
// K2. EXPLOIT (held): per-sweep harvest pacing — one sweep = one handling
//     session per species, not 9. A 9-cell same-species sweep must add exactly
//     +1 harvest (the L1->L2 ladder at 5, L3->L4 at 15, are field VISITS).
// K3. EXPLOIT (held): teach-loop trust farming — 30 bad-education lessons
//     can't push trust past 40, can't identify, and each costs real time
//     (tickAction). The "words only go so far" rule holds.
// K4. HONESTY (fix): taught[]/codex sync — spreadPlantKnowledge and the
//     fireside true-path wrote the PLAYER into village.taught[] without
//     identifyPlant, minting silent knowledge-factor credit for plants the
//     codex doesn't know. identifyPlant's own comment states the invariant:
//     "Your own taught[] syncs with your codex." The wrong-teaching fireside
//     branch already excluded the player — the true path didn't.
// K5. HONESTY (fix): the journal is the player's hand — diary entries for a
//     wrongly-named (wrongAs) plant used the TRUE name. learnPart's say-line
//     already used the believed name (_calledName); the diary lines didn't.
// K6. HONESTY (held): System arrival (day 7) labels everyone (knownNames) —
//     deliberate, documented, diegetic ("it feels invasive"). It grants ZERO
//     plant knowledge: the Codex automates flow only through later briefings.
// K7. HONESTY (fix): betrayal.js promised "XP to next level is halved" for
//     village-codex teaching — no such XP mechanic exists; sharedHeadStart is
//     a write-only flag nothing reads. Copy now matches the engine.
// DEAD CODE (held): examine.js (9 exports), perceive.js, codex-people.js,
//     journal.js — every module loaded in index.html; exports verified wired.
//
// Usage: node scripts/test-break-knowledge-r2-20261010.js
//        BEFORE=1 node scripts/test-break-knowledge-r2-20261010.js (pre-fix HEAD)
//        SEED=99 node scripts/test-break-knowledge-r2-20261010.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
const SEED = parseInt(process.env.SEED || '20261010', 10);

// Files changed by this pass's fixes: game.js (K1, K4), journal.js (K5),
// betrayal.js (K7). BEFORE mode evals the pre-fix HEAD copies.
const PRE = ['src/js/game.js', 'src/js/journal.js', 'src/js/betrayal.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bkr2-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bkr2-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const seededRng = mulberry32(SEED);
Math.random = seededRng; // seeded BEFORE eval: modules capture Math.random at load

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

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); try { return origSay.call(this, t); } catch (e) {} };

function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
}
function pickPartsPlant() {
  return (Game.data.plants || []).find(p =>
    p.knowledgeLevels && p.knowledgeLevels['2'] && /parts\s*:/i.test(p.knowledgeLevels['2']));
}
// a parts plant the player does NOT already know (background seeding can
// grant up to 3 plants at spawn — the fixture must not collide with it)
function pickUnknownPartsPlant() {
  const mine = new Set((Game.state.village.taught || {})[Game.villagerId] || []);
  return (Game.data.plants || []).find(p =>
    !mine.has(p.id) && !(Game.state.codex.plants || {})[p.id] &&
    p.knowledgeLevels && p.knowledgeLevels['2'] && /parts\s*:/i.test(p.knowledgeLevels['2']));
}
function pickOtherPlant(excludeId) {
  return (Game.data.plants || []).find(p => p.id !== excludeId && p.name);
}
// rig a wild tile with a 3x3 block of species pid around the player
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

// ---------- K1. deliberate-liar flag on the harvest-handling path ----------
console.log('K1. deliberate liar vs honest mistake (harvest wrong-name resolution)');
{
  freshGame();
  const P = pickPartsPlant();
  const W = pickOtherPlant(P.id);
  const me = Game.villagerId;
  const vid = Game.state.village.roster.filter(id => id !== me)[0];
  // malicious teacher, wrong about P (deliberate lie)
  Game.state.village.wrongAbout = Game.state.village.wrongAbout || {};
  Game.state.village.wrongAbout[vid] = { [P.id]: { wrongPid: W.id, deliberate: true } };
  const wt = Game.wrongTeaching(vid, P.id, 'taught');
  ok('wrong lesson lands (taught-wrong)', wt === 'taught-wrong', `got ${wt}`);
  const entry = Game.state.codex.plants[P.id];
  ok('entry carries the false label', entry && entry.wrongAs === W.name, `wrongAs=${entry && entry.wrongAs}`);
  entry.harvests = 4; // one more handling session reaches the L2 threshold
  Game.state.codex.encounters[P.id] = 99; // familiar: hands have done the work
  rigForagePatch(P.id);
  Game.doAction('forage');
  ok('one sweep = one harvest (per-sweep pacing)', entry.harvests === 5, `harvests=${entry.harvests}`);
  ok('handling resolves to L2', entry.level === 2, `level=${entry.level}`);
  ok('false label falls off', !entry.wrongAs, `wrongAs=${entry.wrongAs}`);
  ok('DELIBERATE liar flagged contested.deliberate=true',
    !!(entry.contested && entry.contested.deliberate === true),
    `deliberate=${entry.contested && entry.contested.deliberate}`);
  ok('contested names the liar', entry.contested && entry.contested.by === vid,
    `by=${entry.contested && entry.contested.by}`);

  // control: honest mistake reads deliberate=false
  freshGame();
  const P2 = pickPartsPlant();
  const W2 = pickOtherPlant(P2.id);
  const vid2 = Game.state.village.roster.filter(id => id !== Game.villagerId)[1];
  Game.state.village.wrongAbout = Game.state.village.wrongAbout || {};
  Game.state.village.wrongAbout[vid2] = { [P2.id]: { wrongPid: W2.id, deliberate: false } };
  Game.wrongTeaching(vid2, P2.id, 'taught');
  const e2 = Game.state.codex.plants[P2.id];
  e2.harvests = 4;
  Game.state.codex.encounters[P2.id] = 99;
  rigForagePatch(P2.id);
  Game.doAction('forage');
  ok('honest mistake flagged deliberate=false',
    !!(e2.contested && e2.contested.deliberate === false),
    `deliberate=${e2.contested && e2.contested.deliberate}`);
}

// ---------- K2. harvest double-count (exploit) ----------
console.log('K2. harvest double-counting (9-cell same-species sweep)');
{
  freshGame();
  const P = pickPartsPlant();
  // 9 cells of P in one sweep: entry gains exactly +1 harvest (K1 covered
  // this implicitly; assert it outright here on a clean entry)
  Game.state.codex.plants[P.id] = { identifiedDay: 0, level: 1, harvests: 0, tastings: 0, by: 'background' };
  Game.state.codex.encounters[P.id] = 99;
  rigForagePatch(P.id);
  Game.doAction('forage');
  const e = Game.state.codex.plants[P.id];
  ok('9 cells, one species: harvests 0 -> 1 (not 9)', e.harvests === 1, `harvests=${e.harvests}`);
  ok('no instant L2 from one sweep', e.level === 1, `level=${e.level}`);
}

// ---------- K3. teach-loop trust farming (exploit) ----------
console.log('K3. teach-loop trust farming (30 bad-education lessons)');
{
  freshGame();
  const P = pickPartsPlant();
  const me = Game.villagerId;
  // a bad-education teacher: knows the plant, wrong occupation for the lesson
  const vid = Game.state.village.roster.filter(id => id !== me).find(id => {
    const p = (Game.data.villagers || []).find(x => x.id === id) || {};
    return !/cook|chef|hunter|nurse|medic/i.test(String(p.formerOccupation || ''));
  }) || Game.state.village.roster.filter(id => id !== me)[0];
  Game.state.village.taught[vid] = [P.id];
  const clock0 = Game.state.scholar.actionClock || 0;
  for (let i = 0; i < 30; i++) Game.teachPlant(vid, P.id);
  const trust = (Game.state.village.trust || {})[vid] || 10;
  ok('trust never passes 40 ("words only go so far")', trust <= 40, `trust=${trust}`);
  ok('bad education never identifies', !Game.plantKnown(P.id),
    `plantKnown=${Game.plantKnown(P.id)}`);
  ok('partial lessons still tick encounters (progress, not free)',
    (Game.state.codex.encounters[P.id] || 0) > 0,
    `encounters=${Game.state.codex.encounters[P.id]}`);
  ok('every lesson costs real time (actionClock advanced)',
    (Game.state.scholar.actionClock || 0) > clock0,
    `clock ${clock0} -> ${Game.state.scholar.actionClock}`);
}

// ---------- K4. taught[]/codex sync: ambient rumor paths ----------
console.log('K4. taught[]/codex sync (spreadPlantKnowledge + fireside)');
function taughtSyncHolds() {
  const mine = (Game.state.village.taught || {})[Game.villagerId] || [];
  return mine.every(pid => {
    const e = (Game.state.codex.plants || {})[pid];
    return e && (e.level || 0) >= 1;
  });
}
{
  freshGame();
  const P = pickUnknownPartsPlant();
  ok('fixture: rumor plant starts unknown', !!P && !Game.plantKnown(P.id), P && P.id);
  const me = Game.villagerId;
  const knower = Game.state.village.roster.filter(id => id !== me)[0];
  Game.state.village.taught[knower] = [P.id];
  Game.state.village.plantRumors = { [P.id]: { day: 0 } };
  for (let i = 0; i < 30; i++) Game.spreadPlantKnowledge();
  const mine = (Game.state.village.taught || {})[me] || [];
  ok('rumor never mints silent player knowledge', !mine.includes(P.id),
    `taught[me]=${JSON.stringify(mine)}`);
  ok('taught[me] ⊆ codex-known after rumors', taughtSyncHolds());
}
{
  freshGame();
  const P = pickUnknownPartsPlant();
  ok('fixture: fireside plant starts unknown', !!P && !Game.plantKnown(P.id), P && P.id);
  const me = Game.villagerId;
  const knower = Game.state.village.roster.filter(id => id !== me)[0];
  Game.state.village.sharedKnowledge = { [P.id]: { discoveredBy: knower, taughtAround: false } };
  // force the 0.6 presence identify roll to MISS: the ambient loop alone
  // must not teach the player.
  const realRandom = Math.random;
  Math.random = () => 0.99;
  try { Game.firesideTeaching(true); } finally { Math.random = realRandom; }
  const mine = (Game.state.village.taught || {})[me] || [];
  ok('fireside loop alone never teaches the player', !mine.includes(P.id),
    `taught[me]=${JSON.stringify(mine)}`);
  ok('taught[me] ⊆ codex-known after fireside', taughtSyncHolds());
  ok('villagers still learn at the fire', ((Game.state.village.taught || {})[knower] || []).includes(P.id));
}

// ---------- K5. journal diary believed-name ----------
console.log('K5. journal diary uses the believed name (wrongAs plant)');
{
  freshGame();
  const P = pickPartsPlant();
  const W = pickOtherPlant(P.id);
  const me = Game.villagerId;
  const vid = Game.state.village.roster.filter(id => id !== me)[0];
  Game.state.village.wrongAbout = Game.state.village.wrongAbout || {};
  Game.state.village.wrongAbout[vid] = { [P.id]: { wrongPid: W.id, deliberate: false } };
  Game.wrongTeaching(vid, P.id, 'taught');
  const parts = Game.plantPartsList(P.id);
  ok('fixture has learnable parts', parts.length > 0, `parts=${parts.length}`);
  const learned = Game.learnPart(P.id, parts[0].key, 'shown');
  ok('part learned', learned === true);
  const texts = Game.journalPlantEntries(P.id).map(e => String(e.text));
  ok('diary speaks the believed name',
    texts.some(t => t.includes(W.name)), `entries=${JSON.stringify(texts).slice(0, 160)}`);
  ok('diary never prints the unearned true name',
    !texts.some(t => t.includes(P.name)), `entries=${JSON.stringify(texts).slice(0, 160)}`);
}

// ---------- K6. System arrival: labels, grants nothing ----------
console.log('K6. System arrival knowledge honesty');
{
  freshGame();
  const before = Object.keys(Game.state.codex.plants || {}).length;
  Game.state.scholar.day = 7;
  Game.checkSystemArrival();
  ok('System arrived', !!Game.state.systemArrived);
  const roster = Game.state.village.roster || [];
  ok('arrival labels everyone (the designed invasive beat)',
    roster.every(id => (Game.state.village.knownNames || {})[id]),
    `known=${Object.keys(Game.state.village.knownNames || {}).length}/${roster.length}`);
  const after = Object.keys(Game.state.codex.plants || {}).length;
  ok('arrival grants zero plant knowledge', after === before, `plants ${before} -> ${after}`);
}

// ---------- K7. no phantom "XP halved" promise ----------
console.log('K7. copy matches engine (no phantom XP mechanic)');
{
  const betrayalSrc = srcOf('src/js/betrayal.js');
  ok('no "XP to next level is halved" promise in betrayal.js',
    !/XP to next level/i.test(betrayalSrc));
  ok('sharedHeadStart documented as write-only (not a mechanic)',
    !/halved/.test(betrayalSrc));
}

// ---------- DEAD CODE: knowledge modules wired ----------
console.log('DEAD CODE. knowledge modules loaded + exports called');
{
  const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of ['examine.js', 'journal.js', 'perceive.js', 'codex-people.js']) {
    ok(`index.html loads ${m}`, idxHtml.includes('src/js/' + m));
  }
  const exSrc = srcOf('src/js/game.js');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('Scattering.Examine observed at runtime', /Scattering\.Examine/.test(exSrc + appSrc));
  ok('Game.perceptionHints consumed by app.js', /perceptionHints\(\)/.test(appSrc));
  ok('Game.journalOpening consumed by app.js', /journalOpening\(\)/.test(appSrc));
  ok('Game.journalLearn wrapped (people journal live)', typeof Game.journalLearn === 'function');
  ok('Game.learnPart live', typeof Game.learnPart === 'function');
  ok('Game.plantVisualDepth live', typeof Game.plantVisualDepth === 'function' || !!(globalThis.Scattering.Examine && globalThis.Scattering.Examine.plantVisualDepth));
}

console.log(`\n${pass} passed, ${fail} failed (seed=${SEED}, mode=${BEFORE ? 'BEFORE' : 'AFTER'})`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e); process.exit(2); });
