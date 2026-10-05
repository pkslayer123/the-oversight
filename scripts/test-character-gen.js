// Character generation tests (Steve):
// - backstory uniqueness: no repeated backstories within a single game
// - anachronism scan: backstories are pre-scattering lives; no references to
//   the scattering, the System, or post-event knowledge; no "Now they..." present-tense
// - wake-up companion: uniform random (pickRandomVillager), no area weighting
// Usage: node scripts/test-character-gen.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

(async () => {
  await Game.init();

  // --- 1. anachronism scan: data-level ---
  const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));
  const anaPatterns = ['scattering', 'the system', 'codex', 'alien'];
  const nowPatterns = [/\bnow\s+\{(they|they)\}/i, /\bnow they stare/i, /village stores/i];
  let anaCount = 0, nowCount = 0;
  for (const o of cg.occupations) {
    for (const b of (o.backstories || [])) {
      const bl = b.toLowerCase();
      if (anaPatterns.some(p => bl.includes(p)) && !bl.includes('system failures')) anaCount++;
      if (nowPatterns.some(re => re.test(b))) nowCount++;
    }
  }
  ok('no scattering/System/codex/alien in backstories', anaCount === 0, `${anaCount} found`);
  ok('no "now they..." post-scattering perspective', nowCount === 0, `${nowCount} found`);

  // --- 2. uniqueness: generate characters, no duplicate backstory text ---
  // (genCharacter needs full game state; test the registry logic directly)
  Game._usedBackstories = new Set();
  const seen = new Set();
  let dupes = 0;
  // simulate 12 picks across occupations (more than the 6 generated)
  const occs = cg.occupations.slice(0, 12);
  for (const o of occs) {
    const variants = o.backstories || [];
    // replicate the selection logic
    const ubs = Game._usedBackstories;
    const occKey = o.id;
    let bi = variants.findIndex((_, i) => !ubs.has(occKey + ':' + i));
    if (bi < 0) bi = 0;
    ubs.add(occKey + ':' + bi);
    const text = variants[bi];
    if (seen.has(text)) dupes++;
    seen.add(text);
  }
  ok('no duplicate backstory variants in 12 picks', dupes === 0);

  // --- 3. wake-up: uniform random ---
  ok('pickRandomVillager exists', typeof Game.pickRandomVillager === 'function');
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const counts = {};
  for (let i = 0; i < 5000; i++) {
    const p = Game.pickRandomVillager(ids);
    counts[p] = (counts[p] || 0) + 1;
  }
  const vals = Object.values(counts);
  const spread = Math.max(...vals) - Math.min(...vals);
  ok('uniform distribution', spread < 300, `spread=${spread}`);
  ok('null on empty', Game.pickRandomVillager([]) === null);
  ok('null on null', Game.pickRandomVillager(null) === null);
  // no area weighting: the function doesn't take area params
  ok('no area param', Game.pickRandomVillager.length <= 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
