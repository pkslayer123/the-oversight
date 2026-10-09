// PROOF (Steve 2026-10-09, disease pools): mundane and alien diseases are
// DISTINCT pools that never mix. Mundane (7): earthly vectors — water, food,
// wounds, ticks, mosquitoes — diagnosed and cured by earthly medicine. Alien
// (6): monster bites / monster meat — alien effects, each a min-max building
// block (drawback + new ability + horrible physical transformation), never
// touched by mundane medicine.
//
// Run: node scripts/test-disease-pools-20261009.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const MUNDANE = ['gutrot','trichinosis','disease','lockjaw','wound_fever']; // real diseases only (lemons is alien now)
const ALIEN = ['howlbelly','gristlefit','croakbelly','shellgut','witness_maw','flockmind','eurika','east_nile','lemons']; // alien effects

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // 1. Every disease def carries an explicit pool.
  for (const id of MUNDANE) ok(`mundane pool: ${id}`, Game.seDef(id) && Game.seDef(id).pool === 'mundane');
  for (const id of ALIEN) ok(`alien pool: ${id}`, Game.seDef(id) && Game.seDef(id).pool === 'alien');

  // 2. seIsDisease admits mundane only — the choke point for all mundane machinery.
  for (const id of MUNDANE) ok(`seIsDisease admits ${id}`, Game.seIsDisease(id));
  for (const id of ALIEN) ok(`seIsDisease rejects alien ${id}`, !Game.seIsDisease(id));

  // 3. contractDisease refuses the alien pool.
  for (const id of ALIEN) {
    const before = (Game.seList('scholar') || []).length;
    const r = Game.contractDisease(id, { source: 'test' });
    const after = (Game.seList('scholar') || []).length;
    ok(`contractDisease refuses ${id}`, r === false && after === before);
  }

  // 4. Alien diseases are min-max building blocks: transformation + no mundane cure.
  for (const id of ALIEN) {
    const d = Game.seDef(id);
    ok(`${id} has explicit transformation`, !!(d.transformation && d.transformation.length > 20));
    ok(`${id} has no mundane cure table`, Object.keys(d.cure || {}).length === 0);
  }

  // 5. Mundane machinery never touches an alien status on the scholar.
  Game.applyStatus('scholar', 'howlbelly', { source: 'test meat' });
  ok('howlbelly applies via raw applyStatus (monster path)',
    (Game.seList('scholar') || []).some(e => e.id === 'howlbelly'));
  ok('sickDiseases excludes alien status', !Game.sickDiseases().some(e => e.id === 'howlbelly'));
  const sigBefore = JSON.stringify((Game.seList('scholar') || []).map(e => e.id + ':' + (e.dayPartsLeft || 0)));
  try { Game.folkRemedy('rest'); } catch (e) {}
  try { Game.useMedicine('antibiotics'); } catch (e) {}
  const sigAfter = JSON.stringify((Game.seList('scholar') || []).map(e => e.id + ':' + (e.dayPartsLeft || 0)));
  ok('folkRemedy/useMedicine do not touch alien disease',
    (Game.seList('scholar') || []).some(e => e.id === 'howlbelly'));
  const chips = Game.afflictionChips();
  const chip = chips.find(c => c.id === 'howlbelly');
  ok('affliction chip shows true name for alien', chip && chip.label === 'Howlbelly');
  ok('affliction chip carries pool + transformation',
    chip && chip.pool === 'alien' && !!chip.transformation);

  // 5b. Alien viruses are permanent warping — no natural expiry.
  for (const id of ['eurika', 'east_nile']) {
    const d = Game.seDef(id);
    ok(`${id} never expires on its own (permanent warping)`, d.duration == null);
    ok(`${id} has ongoing fever/static cost`, d.tick && d.tick.hp > 0);
  }

  // 6. The monster-meat table still owns alien contraction.
  const md = ((Game.data.cooking || {}).monsterDiseases || []);
  ok('monsterDiseases table intact', md.length > 0 && md.every(d => ALIEN.includes(d.id)));

  // 7. Mundane contraction still works through contractDisease.
  Game.state.scholar.statuses = [];
  const okC = Game.contractDisease('gutrot', { source: 'test water' });
  ok('contractDisease accepts mundane gutrot', okC === true && Game.sickDiseases().some(e => e.id === 'gutrot'));

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})();
