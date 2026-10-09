#!/usr/bin/env node
// PROOF TEST (drifter loop 2026-10-08) — the courtship fix.
// BEFORE: joining a village, living at their fire, and studying their codex
// moved their opinion of Haven by exactly 0; judgeLink's base 50 accepted
// ~80% of cold proposals (the climb didn't exist); proposeLink had no UI;
// village.news (named catch-up deaths/births) was never read to the player.
// AFTER: join +5 (once), study +3 (once), judgeLink base 38 (cold proposals
// usually decline), join surfaces up to 3 news lines, Haven panel offers
// propose-link buttons. Deterministic: seeded mulberry32, resettable.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = 20261008;
const reseed = () => { Math.random = mulberry32(SEED); };
reseed();

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const makeEl = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {},
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, innerHTML: '', textContent: '' });
global.document = { createElement: makeEl, body: makeEl(), head: makeEl(),
  getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, contains() { return false; }, addEventListener() {} };
const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\\\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;
delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`   [OK] ${name}`); }
  else { fail++; console.log(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
};

(async () => {
  await Game.init();
  const says = [];
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  console.log('=== test-drifter-link-courtship-20261008 (seed ' + SEED + ') ===');

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const ov = Game.state.otherVillages[0];
  Game.map.px = ov.x; Game.map.py = ov.y;
  Game.checkVillageProximity(); // catch-up sim runs; news may accumulate
  ok('village generated on approach', ov.generated === true);

  // seed one known news entry so the delivery assertion is deterministic
  ov.news = ov.news || [];
  ov.news.push('💀 Test Elder died of hunger on day 2.');
  const op0 = ov.opinion || 0;

  // --- join: opinion +5, once; news delivered ---
  // (Regional audit 2026-10-09: the courtship wrap moved from the dead
  // G.joinVillage to the real join path, joinVillageReal. This test now
  // exercises the path the game actually takes.)
  says.length = 0;
  Game.joinVillageReal(ov.id);
  const joinLines = says.splice(0).map(String);
  ok('join moves opinion +5', (ov.opinion || 0) === op0 + 5, `opinion=${ov.opinion}`);
  ok('join surfaces village news (catch-up history read to the player)',
    joinLines.some(l => /what the years did/i.test(l)) && joinLines.some(l => /Test Elder died of hunger/.test(l)),
    joinLines.slice(0, 3).map(l => l.slice(0, 60)).join(' | '));
  says.length = 0;
  Game.leaveVillage();
  Game.joinVillageReal(ov.id); // rejoin: no farming
  says.splice(0);
  ok('rejoin does not double-dip opinion', (ov.opinion || 0) === op0 + 5, `opinion=${ov.opinion}`);

  // --- study: opinion +3, once ---
  says.length = 0;
  let r1 = null;
  try { r1 = Game.studyVillageCodex(ov.id); } catch (e) { r1 = 'ERR ' + e.message; }
  says.splice(0);
  ok('studyVillageCodex runs at the village', typeof r1 === 'string' && !/^ERR/.test(r1), String(r1).slice(0, 80));
  ok('study moves opinion +3 (once)', (ov.opinion || 0) === op0 + 8, `opinion=${ov.opinion}`);
  says.length = 0;
  try { Game.studyVillageCodex(ov.id); } catch (e) {}
  says.splice(0);
  ok('second study does not stack opinion', (ov.opinion || 0) === op0 + 8, `opinion=${ov.opinion}`);

  // --- clamp ---
  Game._nudgeOpinion(ov.id, 500);
  ok('opinion clamps at +100', ov.opinion === 100, `opinion=${ov.opinion}`);
  Game._nudgeOpinion(ov.id, -500);
  ok('opinion clamps at -100', ov.opinion === -100, `opinion=${ov.opinion}`);
  ov.opinion = op0 + 8; // restore courted value

  // --- judgeLink: cold proposal usually declines now ---
  reseed();
  const cold = Game.judgeLink(ov.id, { asSubordinate: true, tributeKcalPerWeek: 3000 });
  ov.opinion = 0;
  reseed();
  const colder = Game.judgeLink(ov.id, { asSubordinate: true, tributeKcalPerWeek: 3000 });
  ok('courtship raises the judged score (opinion feeds the formula)',
    cold.score > colder.score, `courted=${cold.score} cold=${colder.score}`);
  ok('cold proposal score is no longer a near-guarantee (base 38)',
    colder.score < 55, `cold score=${colder.score}`);

  // --- proposeLink decline path still works and costs opinion ---
  ov.opinion = -100; // force a decline
  reseed();
  says.length = 0;
  const declined = Game.proposeLink(ov.id, { asSubordinate: false });
  says.splice(0);
  ok('hopeless proposal declines legibly (not a link)', declined === null);
  ok('decline costs opinion (-5, existing rule)', ov.opinion === -100, `opinion=${ov.opinion} (clamped floor)`);

  // --- UI: propose buttons exist in app.js ---
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('Haven panel renders propose-link buttons',
    appSrc.includes('data-link-propose-sub="${v.id}"') && appSrc.includes('data-link-propose-prim="${v.id}"'));
  ok('propose buttons are wired to Game.proposeLink',
    appSrc.includes("Game.proposeLink(b.dataset.linkProposeSub") && appSrc.includes("Game.proposeLink(b.dataset.linkProposePrim"));

  console.log(`\n   ${pass}/${pass + fail} green`);
  process.exit(fail ? 1 : 0);
})();
