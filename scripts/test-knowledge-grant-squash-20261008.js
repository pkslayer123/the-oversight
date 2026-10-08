#!/usr/bin/env node
// BREAK-IT: knowledge grant squash (2026-10-08).
//
// ATTACK (honesty + exploit): Game.grantKnowledge('plant', pid, LEVEL>1, ...)
// on an UNIDENTIFIED plant silently grants only LEVEL 1 — the level-up path
// early-returns through identifyPlant. Two live callers hit this:
//   - readBook: books with unlocks.level 2/3 (medicinal_plants, wardens_notebook,
//     late_summer_herbarium, foxfires_journal, ...) promise deep knowledge, the
//     book is CONSUMED (one-shot), and the player is left at L1 forever.
//   - studyVillageCodex: grants entry.level (up to 3) but the say-line claims
//     "(L3)" while the codex lands at L1 — the label lies.
//
// EXPECTED: granting level N lands the entry at level N (the one-path
// dispatcher promises "target level").
// PRE-FIX: level comes back 1. RED.
//
// Usage: node scripts/test-knowledge-grant-squash-20261008.js (SEED override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture it at load
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) fails.push(name);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // capture say-lines to test label honesty
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };

  // pick plants from real L3/L2 books that the player does NOT know yet
  const books = Game.data.books;
  const l3book = books.find(b => (b.unlocks || {}).level === 3 && (b.unlocks.plants || []).length);
  const l2book = books.find(b => (b.unlocks || {}).level === 2 && (b.unlocks.plants || []).length);
  const pid3 = (l3book.unlocks.plants).find(pid => !Game.plantKnown(pid));
  const pid2 = (l2book.unlocks.plants).find(pid => !Game.plantKnown(pid));
  console.log(`using L3 book "${l3book.id}" plant ${pid3}; L2 book "${l2book.id}" plant ${pid2}`);

  // ATTACK 1: read-path grant at level 3 on an unknown plant
  const r3 = Game.grantKnowledge('plant', pid3, 3, { type: 'read', by: l3book.name });
  check('L3 read-grant returns true', r3, true);
  check('L3 read-grant lands level 3', (Game.state.codex.plants[pid3] || {}).level, 3);

  // ATTACK 2: level 2 grant on an unknown plant
  const r2 = Game.grantKnowledge('plant', pid2, 2, { type: 'read', by: l2book.name });
  check('L2 read-grant returns true', r2, true);
  check('L2 read-grant lands level 2', (Game.state.codex.plants[pid2] || {}).level, 2);

  // ATTACK 3: studyVillageCodex honesty — village codex at L3, player label must match engine
  said.length = 0;
  const pidX = Game.data.plants.map(p => p.id).find(pid => !Game.plantKnown(pid) && pid !== pid3 && pid !== pid2);
  Game.state.otherVillages = [{ id: 'testvil', name: 'Testville',
    codex: { plants: { [pidX]: { level: 3 } }, techniques: {}, recipes: {}, animals: {} } }];
  Game.state.scholar.joinedVillage = 'testvil';
  const studyResult = Game.studyVillageCodex('testvil');
  const lvlX = (Game.state.codex.plants[pidX] || {}).level;
  check('studyVillageCodex L3 village entry lands level 3', lvlX, 3);
  // label honesty: the returned "Learned: ... (L3)" line must match the engine
  const claimMatch = String(studyResult).match(/\(L(\d)\)/);
  const claimed = claimMatch ? parseInt(claimMatch[1], 10) : null;
  check('studyVillageCodex "(L3)" label matches engine', claimed === lvlX ? true : `label L${claimed} vs engine L${lvlX}`, true);

  // REGRESSION: L1 grants still identify properly; repeats still no-op
  const pid1 = Game.data.plants.map(p => p.id).find(pid => !Game.plantKnown(pid));
  const r1 = Game.grantKnowledge('plant', pid1, 1, { type: 'discovery' });
  check('L1 grant returns true', r1, true);
  check('L1 grant lands level 1', (Game.state.codex.plants[pid1] || {}).level, 1);
  check('repeat L1 grant returns false', Game.grantKnowledge('plant', pid1, 1, { type: 'discovery' }), false);
  check('downgrade attempt returns false', Game.grantKnowledge('plant', pid3, 2, { type: 'read' }), false);
  check('L3 entry not downgraded', (Game.state.codex.plants[pid3] || {}).level, 3);

  console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
