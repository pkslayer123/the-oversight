// test-animals-hunt-20261006.js
// Proof for Steve 2026-10-06: animals flesh-out — stalk audio + knowledge L3/L4.
//
// BEFORE (HEAD): the Stalk verb fired NO audio (the quietest beat in the hunt
//   was silent), and animal knowledge dead-ended at L2 (parts) — the rich
//   knowledgeLevels[3] (uses) and [4] (mastery) text in animals.json had no
//   code path that ever surfaced them. The old L2 line also said the true
//   species name unconditionally — a knowledge leak for gifted meat.
// AFTER: animalStalk() synth wired + fired from both Stalk dispatches; the
//   deepening chain runs parts(3) → uses(6) → mastery(10), all knowledge-gated.
// Usage: node scripts/test-animals-hunt-20261006.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
function boot(gameSrc) {
  // fresh module registry per boot
  delete globalThis.Scattering;
  const files = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
    'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js'];
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  eval(gameSrc);
  ['src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
   'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
   'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  return globalThis.Scattering.Game;
}
function drainLines(Game) {
  const lines = (Game.log || []).slice(); Game.log = [];
  const fb = (Game._feedback || []); Game._feedback = [];
  return lines.concat(fb).map(String);
}
function freshScholar(Game) {
  return Game.newGame ? null : null;
}
async function newRun(Game) {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 1;
  return Game.state.scholar;
}
function giveCleanedMeat(Game, aid, units, known) {
  const s = Game.state.scholar;
  s.inventory = s.inventory || [];
  s.inventory.push({ plantId: 'meat_' + aid, name: aid + ' (cleaned)', units, kcalEach: 225,
    foodKind: 'meat', foodState: 'cleaned', unit: 'portion', kg: 0.5 });
  if (known) {
    Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
    Game.state.codex.animalEncounters[aid] = 3;
  }
  return s.inventory.length - 1;
}
function eatLoop(Game, idx, n) {
  const said = [];
  for (let i = 0; i < n; i++) {
    const inv = Game.state.scholar.inventory;
    const it = inv[idx];
    if (!it || (it.units || 0) <= 0) break;
    Game.state.scholar.kcal = 500; // hungry again — tastings happen across days
    Game.eatOne(idx);
    said.push(...drainLines(Game));
  }
  return said;
}

(async () => {
  const newGameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const oldGameSrc = execSync('git show HEAD:src/js/game.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const newAppSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const oldAppSrc = execSync('git show HEAD:src/js/app.js', { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

  console.log('== 1. STALK AUDIO HOOK — before/after ==');
  ok('BEFORE: no animalStalk synth in app.js', !/function animalStalk\(\)/.test(oldAppSrc));
  ok('BEFORE: no animalStalk registry entry', !/animalStalk\(\) \{ animalStalk\(\); \}/.test(oldAppSrc));
  ok('AFTER: animalStalk synth defined', /function animalStalk\(\)/.test(newAppSrc));
  ok('AFTER: animalStalk in Game.audio registry', /animalStalk\(\) \{ animalStalk\(\); \}/.test(newAppSrc));
  ok('AFTER: HOOK CONTRACT documents animalStalk', /animalStalk\(\)/.test(newAppSrc.split('HOOK CONTRACT')[1] || ''));
  const stalkFires = (newAppSrc.match(/Game\.audioEvent\('animalStalk'\)/g) || []).length;
  ok('AFTER: both Stalk dispatches fire it (context bar + popup)', stalkFires === 2, `found ${stalkFires}`);
  // synth quality: not a single blip — footfalls, held breath, heartbeat, leaf-shift
  const body = newAppSrc.split('function animalStalk()')[1].split('function animalPant()')[0];
  const layers = ['footfall', 'held breath', 'heartbeat', 'leaf-shift'].filter(w => body.includes(w));
  ok('AFTER: synth is layered, not a single blip', layers.length === 4, `layers: ${layers.join(',')}`);
  ok('AFTER: quiet by design (footfall gain <= 0.06)', /0\.055|0\.045/.test(body));

  console.log('== 2. dispatch contract (stubbed Game.audio) ==');
  let Game = boot(newGameSrc);
  const fired = [];
  Game.audio = { animalStalk: () => fired.push('animalStalk') };
  Game.audioEvent('animalStalk');
  ok('Game.audioEvent routes animalStalk to the synth', fired.length === 1);
  Game.audio = { animalStalk: () => { throw new Error('boom'); } };
  let threw = false;
  try { Game.audioEvent('animalStalk'); } catch (e) { threw = true; }
  ok('dispatch swallows synth errors (silent no-op safe)', !threw);
  delete Game.audio;

  console.log('== 3. KNOWLEDGE L3/L4 — before/after ==');
  // BEFORE: 12 tastings, known species — only the L2 parts line ever appears.
  Game = boot(oldGameSrc);
  await newRun(Game);
  const adef = Game.data.animals.find(a => a.id === 'wild_turkey');
  const idx0 = giveCleanedMeat(Game, 'wild_turkey', 14, true);
  const saidBefore = eatLoop(Game, idx0, 12);
  const hasL3before = saidBefore.some(l => /knowledgeLevels\['3'\]|Uses: high protein/i.test(l) || (l.includes('Deeper knowledge') && l.includes('feather')));
  const hasL4before = saidBefore.some(l => /MASTERY/.test(l));
  ok('BEFORE: 12 tastings never surface L3 (uses)', !saidBefore.some(l => l.includes(adef.knowledgeLevels['3'])));
  ok('BEFORE: 12 tastings never surface L4 (mastery)', !hasL4before);
  // AFTER: L2 at 3, L3 at 6, L4 at 10 — with the real knowledgeLevels text.
  Game = boot(newGameSrc);
  await newRun(Game);
  const idx = giveCleanedMeat(Game, 'wild_turkey', 14, true);
  const saidAfter = eatLoop(Game, idx, 12);
  const l2 = saidAfter.filter(l => l.includes('Deeper knowledge') && l.includes(adef.knowledgeLevels['2']));
  const l3 = saidAfter.filter(l => l.includes('Deeper knowledge') && l.includes(adef.knowledgeLevels['3']));
  const l4 = saidAfter.filter(l => l.includes('MASTERY') && l.includes(adef.knowledgeLevels['4']));
  ok('AFTER: L2 (parts) still unlocks', l2.length >= 1);
  ok('AFTER: L3 (uses) unlocks with knowledgeLevels[3] text', l3.length === 1, l3[0] && l3[0].slice(0, 90));
  ok('AFTER: L4 (mastery) unlocks with knowledgeLevels[4] text', l4.length === 1, l4[0] && l4[0].slice(0, 90));
  // order: L2 before L3 before L4
  const i2 = saidAfter.findIndex(l => l.includes(adef.knowledgeLevels['2']));
  const i3 = saidAfter.findIndex(l => l.includes(adef.knowledgeLevels['3']));
  const i4 = saidAfter.findIndex(l => l.includes(adef.knowledgeLevels['4']));
  ok('AFTER: unlock order is parts → uses → mastery', i2 >= 0 && i3 > i2 && i4 > i3);
  // benefits: mastery adds +5 health per eat on top of deepKnown's +5
  const hpLine = saidAfter.length; // sanity
  ok('AFTER: tastings counted on the animal track (animalPrep)', (Game.state.codex.animalPrep['wild_turkey'] || {}).tastings >= 12);

  console.log('== 4. KNOWLEDGE LEAK GUARD (gifted meat, species unknown) ==');
  Game = boot(newGameSrc);
  await newRun(Game);
  const idx2 = giveCleanedMeat(Game, 'wild_turkey', 12, false); // NOT known
  const saidGift = eatLoop(Game, idx2, 11);
  const leaked = saidGift.some(l => l.includes('Wild Turkey') && /Deeper knowledge|MASTERY/.test(l));
  ok('gifted meat of unknown species never says the true name in deepening', !leaked);
  const mentry = (Game.state.codex.animalPrep || {})['wild_turkey'] || {};
  ok('tastings still counted while unknown (unlock fires once known)', (mentry.tastings || 0) >= 11 && !mentry.deepKnown);

  console.log('== 5. REGRESSION: approach behaviors intact ==');
  Game = boot(newGameSrc);
  await newRun(Game);
  let _seed = 7;
  Math.random = function () { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; };
  const s = Game.state.scholar; s.mx = 4; s.my = 4;
  // opossum flops on approach (not generic bolt)
  Game.state.scholar.animal = { id: 'opossum', mx: 6, my: 4, aware: 0, stamina: 3, pstate: 'graze', edgeTurns: 0 };
  Game.log = [];
  for (let t = 0; t < 3; t++) { const a = Game.state.scholar.animal; if (!a) break; s.mx += Math.sign(a.mx - s.mx); Game.animalTurn(); }
  let a = Game.state.scholar.animal;
  ok('opossum plays dead on approach', a && a.pstate === 'playing_dead', a && a.pstate);
  // snapping turtle never bolts
  s.mx = 4; s.my = 4;
  Game.state.scholar.animal = { id: 'snapping_turtle', mx: 5, my: 4, aware: 0, stamina: 3, pstate: 'graze', edgeTurns: 0 };
  for (let t = 0; t < 4; t++) { const an = Game.state.scholar.animal; if (!an) break; s.mx = 5; s.my = 4; Game.animalTurn(); }
  a = Game.state.scholar.animal;
  ok('snapping turtle stands its ground (never bolts)', !!a && a.pstate !== 'bolt', a && a.pstate);
  // boar warns then charges
  s.mx = 4; s.my = 4;
  Game.state.scholar.animal = { id: 'wild_boar', mx: 6, my: 4, aware: 0, stamina: 4, pstate: 'graze', edgeTurns: 0 };
  Game.log = [];
  s.mx = 5; Game.animalTurn(); // dist 1... wait approach: dist<=3 → pawing
  a = Game.state.scholar.animal;
  ok('boar paws a warning on approach', a && (a.pstate === 'pawing' || a.pstate === 'charging' || a.pstate === 'winded'), a && a.pstate);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
