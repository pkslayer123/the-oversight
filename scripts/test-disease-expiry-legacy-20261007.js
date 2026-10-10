#!/usr/bin/env node
// REGRESSION TEST (Steve 2026-10-07, survivalist loop): status-effect expiry
// must clear the legacy s.diseases/s.poisons mirrors.
// Bug: tickStatuses -> seRemove spliced the engine entry but left the legacy
// mirror behind. Ghost diseases kept the journal badge on and the
// herbal_remedy/purify "cure" gates open forever (a fake cure then consumed
// the once-per-day remedy). Fixed in src/js/statusEffects.js (seRemove).
// Seeded mulberry32; run across SEED=1..5 (PROOF-TEST RNG STABILITY rule).
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '1', 10);
Math.random = mulberry32(SEED);
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;
Game.say = () => {};
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const s = () => Game.state.scholar;
const engine = (id) => (s().statuses || []).filter(x => x.id === id);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  s().health = 100; s().kcal = 3000; s().hydration = 100; s().energy = 100;
  s().abilities = (s().abilities || []).concat([
    { id: 'herbal_remedy', name: 'Herbal Remedy', level: 1, xp: 0 },
  ]);

  // ISOLATION (2026-10-10): the 2026-10-09 disease rework added ambient vectors
  // (the wound branch in diseaseVectorTick) that contract real diseases over 9
  // untreated parts — and can kill the bearer outright (mantle pass). This
  // test is about expiry of the entries IT applies, so heal and clear any
  // ambient-contracted entries between sections. cureStatus exercises the
  // mirror-sync path for the cleanup.
  function clearAmbient() {
    s().health = 100;
    for (const e of (s().statuses || []).slice()) Game.cureStatus('scholar', e.id, 'test isolation');
  }

  // Top-up heal every part: the 2026-10-09 ambient wound vector infects
  // open cuts below 40 HP, and 27 untreated parts of day-rollover damage
  // would otherwise inject ambient diseases mid-test. The wound branch is
  // health-gated, so pinning health keeps the test about expiry, not triage.
  function parts(n) { for (let i = 0; i < n; i++) { s().health = 100; Game.advancePart(); } }

  // 1. disease expiry clears legacy
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'test' });  check('disease applies (engine)', engine('disease').length === 1);
  check('disease mirrors to s.diseases', (s().diseases || []).length === 1);
  parts(9);
  check('disease expires from engine after 8 dayParts', engine('disease').length === 0);
  check('disease expiry clears s.diseases (ghost bug)', (s().diseases || []).length === 0, `len=${(s().diseases || []).length}`);

  clearAmbient();
  // 2. repeat apply/expire cycles don't accumulate ghosts
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'test' });
  parts(9);
  check('second expiry also clears legacy', (s().diseases || []).length === 0);

  clearAmbient();
  // 3. stacking: one engine entry, one legacy entry
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'test' });
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'test' });
  check('stacked disease: 1 engine entry', engine('disease').length === 1);
  check('stacked disease: 1 legacy entry', (s().diseases || []).length === 1, `len=${(s().diseases || []).length}`);
  check('stacked disease: stacks=2', (engine('disease')[0] || {}).stacks === 2);
  parts(9);
  check('stacked expiry clears legacy', (s().diseases || []).length === 0);

  clearAmbient();
  // 4. cure path still clears both
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'test' });
  Game.activateAbility('herbal_remedy');
  check('herbal_remedy cures engine', engine('disease').length === 0);
  check('herbal_remedy cures legacy', (s().diseases || []).length === 0);

  clearAmbient();
  // 5. poison bridge (purify's mirror) expires clean too
  Game.applyStatus('scholar', 'poison', { name: 'toxin', source: 'test' });
  check('poison mirrors to s.poisons', (s().poisons || []).length === 1);
  parts(7);
  check('poison expires from engine after 6 dayParts', engine('poison').length === 0);
  check('poison expiry clears s.poisons', (s().poisons || []).length === 0, `len=${(s().poisons || []).length}`);

  clearAmbient();
  // 6. not-sick gate reads clean state after expiry
  Game.applyStatus('scholar', 'disease', { name: 'creek fever', source: 'test' });
  parts(9);
  check('post-expiry: herbal_remedy gate sees not-sick', (s().diseases || []).length === 0);

  console.log(`RESULT: ${pass} ok, ${fail} FAIL (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR:', e && e.message); process.exit(2); });
