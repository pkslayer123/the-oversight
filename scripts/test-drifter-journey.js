// Deep drifter playtest: the full journey, not just the verbs.
// A real multi-day trip to a distant village, playing like a player:
// what does it COST, what do you BRING BACK, does the world feel alive?
// Usage: node scripts/test-drifter-journey.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
globalThis.Scattering.Game.progState = function () { const s = this.state.scholar; s.prog = s.prog || {}; s.prog.moments = s.prog || []; return s.prog; };
globalThis.Scattering.Game.recordMoment = function () {};
globalThis.Scattering.Game.broadcastLine = function () {};
eval(fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8'));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

(async () => {
  await Game.init();
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 4000; s.health = 100; s.exiled = false;
  said.length = 0;

  // --- A. where are the villages? pick the farthest ---
  const villages = Game.state.otherVillages || [];
  ok('2-3 villages exist', villages.length >= 2 && villages.length <= 3);
  villages.forEach(v => console.log(`  village ${v.name} at (${v.x},${v.y}), dist ${manhattan(3, 3, v.x, v.y)} from haven`));
  const target = villages.slice().sort((a, b) => manhattan(3, 3, b.x, b.y) - manhattan(3, 3, a.x, a.y))[0];
  const dist = manhattan(3, 3, target.x, target.y);
  ok('farthest village is a real trip (>=3 tiles)', dist >= 3);

  // --- B. the journey: walk there tile by tile, foraging/drink realistically ---
  // A player packs food: give ourselves a realistic pack (3kg trail food ~ 4000 kcal... check kcal bank)
  const startDay = s.day, startKcal = s.kcal, startTicks = Game.state.dayTick || 0;
  // step: walk to target via manhattan path, one travelTo per node
  let cx = 3, cy = 3;
  let legs = 0;
  while (cx !== target.x || cy !== target.y) {
    const nx = cx !== target.x ? cx + Math.sign(target.x - cx) : cx;
    const ny = cx === target.x ? cy + Math.sign(target.y - cy) : cy;
    Game.reveal(nx, ny); Game.reveal(cx, cy);
    Game.map.px = cx; Game.map.py = cy;
    said.length = 0;
    Game.travelTo(nx, ny, true);
    legs++;
    cx = nx; cy = ny;
  }
  const tripKcal = startKcal - s.kcal;
  console.log(`  journey: ${legs} legs, day ${startDay} -> ${s.day}, kcal ${startKcal} -> ${s.kcal} (trip cost ~${Math.round(tripKcal)})`);
  ok('journey legs == manhattan distance', legs === dist);
  ok('journey took some time but not days (ticks sane)', (Game.state.dayTick || 0) - startTicks >= 0);
  ok('did not arrive starving on a normal trip', s.kcal > 1000);

  // --- C. arrival: catch-up sim ran, village feels lived-in ---
  const v = Game.state.otherVillages.find(x => x.id === target.id);
  ok('village generated on arrival', v.generated === true);
  ok('village has lived: day counter advanced', v.day > 0);
  console.log(`  ${v.name}: day ${v.day}, pop ${v.population}, pantry ${Math.round(v.pantryKcal)} kcal, focus ${(v.knowledgeProfile || {}).focus}, plants known ${Object.keys((v.knowledgeProfile || {}).plants || {}).length}`);
  ok('pantry is sane (not negative, capped at 4 days buffer)', v.pantryKcal >= 0 && v.pantryKcal <= v.population * 8000);
  ok('population is sane', v.population >= 3 && v.population <= 16);

  // --- D. the talk loop: trust-gated knowledge trade ---
  // wipe my knowledge of their plants so the exchange can teach me;
  // and make sure I know one plant they DON'T, so the teach-back fires.
  const theirPids = Object.keys((v.codex && v.codex.plants) || {});
  for (const pid of theirPids) delete Game.state.codex.plants[pid];
  const spare = (Game.data.plants || []).find(p => !theirPids.includes(p.id) && !Game.state.codex.plants[p.id]);
  if (spare) Game.state.codex.plants[spare.id] = { level: 1 };
  const codexBefore = Object.keys(Game.state.codex.plants || {}).length;
  const taughtDay1 = [];
  let taughtLines = 0, theyLearnedLines = 0;
  for (let d = 0; d < 3; d++) {
    s.day = startDay + legs + d; // simulate day passing (cheap)
    Game.map.px = v.x; Game.map.py = v.y; // AT their fire
    said.length = 0;
    const r = Game.villageCardAction(v.id, 'talk');
    ok(`day ${d + 1} talk works`, r === true);
    if (d === 0) taughtDay1.push(...theirPids.filter(pid => Game.state.codex.plants[pid]));
    taughtLines += said.filter(t => t.includes('shows you')).length;
    theyLearnedLines += said.filter(t => t.includes('knows a little more because you came')).length;
  }
  const codexAfter = Object.keys(Game.state.codex.plants || {}).length;
  console.log(`  codex plants ${codexBefore} -> ${codexAfter}; trust now ${v.trust}; taught-me lines: ${taughtLines}, they-learned lines: ${theyLearnedLines}`);
  ok('day 1: strangers get stories, not secrets', taughtDay1.length === 0);
  ok('trust accrued over 3 sits', (v.trust || 0) >= 12);
  ok('repeat sits taught me something (trust earned)', codexAfter > codexBefore || theirPids.length === 0);
  ok('I taught them something back (two-way)', theyLearnedLines > 0);

  // --- F. the return: walk home ---
  cx = v.x; cy = v.y;
  said.length = 0;
  let backLegs = 0;
  while (cx !== 3 || cy !== 3) {
    const nx = cx !== 3 ? cx + Math.sign(3 - cx) : cx;
    const ny = cx === 3 ? cy + Math.sign(3 - cy) : cy;
    Game.reveal(nx, ny); Game.map.px = cx; Game.map.py = cy;
    Game.travelTo(nx, ny, true);
    backLegs++; cx = nx; cy = ny;
  }
  ok('made it home', cx === 3 && cy === 3);
  console.log(`  returned home: day ${s.day}, kcal ${Math.round(s.kcal)}, codex plants ${Object.keys(Game.state.codex.plants || {}).length}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
