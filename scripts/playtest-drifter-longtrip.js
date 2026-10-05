// DRIFTER playtest run 2026-10-05: the long trip, late visit.
// Narrated: a day-25 journey to the farthest village. Do the catch-up sim
// villages actually LIVE (not just pantry math)? Does the trip cost right?
// What do you bring home? Play like a player, report story + friction.
// Usage: node scripts/playtest-drifter-longtrip.js [--seed N]
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

let seed = 7;
const argSeed = (process.argv.find(a => a.startsWith('--seed')) || '').split('=')[1];
if (argSeed) seed = parseInt(argSeed, 10);
let rngState = seed >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

const allSaid = [];
let logMark = 0;
function freshLines() { const l = allSaid.slice(logMark); logMark = allSaid.length; return l; }
function beat(title) {
  console.log('\n' + '='.repeat(64));
  console.log('  ' + title);
  console.log('='.repeat(64));
  for (const l of freshLines()) console.log('  | ' + (l || '').toString().slice(0, 220));
}
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
function snap(v) { return `day ${v.day}, pop ${v.population}, pantry ${Math.round(v.pantryKcal)} kcal, focus ${v.knowledgeProfile ? v.knowledgeProfile.focus : '?'}, plants ${Object.keys((v.knowledgeProfile || {}).plants || {}).length}`; }
function villageLore(v) {
  // turf health: stock sum within 4 of the village
  let stock = 0;
  for (let ty = 0; ty < 7; ty++) for (let tx = 0; tx < 7; tx++) {
    const t = Game.tileAt(tx, ty);
    if (t && manhattan(tx, ty, v.x, v.y) <= 4) stock += (t.stock || 0);
  }
  return `turf stock ~${stock}`;
}

(async () => {
  await Game.init();
  const _say = Game.say.bind(Game);
  Game.say = (m) => { allSaid.push(m); return _say(m); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 4000; s.health = 100; s.exiled = false;
  freshLines();

  const villages = Game.state.otherVillages || [];
  const target = villages.slice().sort((a, b) => manhattan(3, 3, b.x, b.y) - manhattan(3, 3, a.x, a.y))[0];
  const dist = manhattan(3, 3, target.x, target.y);
  console.log(`DRIFTER LONG-TRIP — seed ${seed}. ${villages.length} villages.`);
  villages.forEach(v => console.log(`  ${v.name} @ (${v.x},${v.y}) dist ${manhattan(3, 3, v.x, v.y)}`));
  console.log(`  target: ${target.name}, dist ${dist}\n`);

  // ===== ACT 1: 20 days pass at home. The village is kept fed (a real player
  // feeds it); the point of this run is the drift, not home starvation. =====
  for (let d = 0; d < 20; d++) {
    const v = Game.state.village;
    v.pantryKcal = Math.max(v.pantryKcal || 0, 25000); // fed village
    v.hungryDays = 0;
    s.kcal = 4000; s.hydration = 100; if (s.health < 100) s.health = 100; // fed player
    try { Game.endDay(); } catch (e) {}
    if (Game.over) { console.log('GAME OVER during act 1 at day', s.day); break; }
  }
  beat(`ACT 1 — day ${s.day} at home. Now the trip.`);
  console.log(`  home pantry: ${Math.round(Game.state.village.pantryKcal || 0)} kcal`);
  villages.forEach(v => console.log(`  ${v.name}: UNGENERATED day=${v.day} (still a rumor)`));

  // ===== ACT 2: the walk out =====
  const kcalOut0 = s.kcal, dayOut0 = s.day, tick0 = Game.state.dayTick || 0;
  let cx = 3, cy = 3, legs = 0;
  while (cx !== target.x || cy !== target.y) {
    const nx = cx !== target.x ? cx + Math.sign(target.x - cx) : cx;
    const ny = cx === target.x ? cy + Math.sign(target.y - cy) : cy;
    Game.reveal(nx, ny); Game.reveal(cx, cy);
    Game.map.px = cx; Game.map.py = cy;
    Game.travelTo(nx, ny, true);
    legs++; cx = nx; cy = ny;
  }
  beat(`ACT 2 — arrived at ${target.name} (${legs} legs, day ${s.day})`);
  console.log(`  cost of the walk: kcal ${Math.round(kcalOut0)} -> ${Math.round(s.kcal)}, dayTick advanced, day ${dayOut0} -> ${s.day}`);
  console.log(`  target now: ${snap(target)}, ${villageLore(target)}`);

  // ===== ACT 3: talk / trade =====
  try {
    const talk = Game.villageTalk ? Game.villageTalk(target.id) : null;
    console.log('  villageTalk:', JSON.stringify(talk).slice(0, 300));
  } catch (e) { console.log('  villageTalk threw:', e.message); }
  beat('ACT 3 — the visit (talk/trade lines above ^)');

  // ===== ACT 4: stay the night, come back tomorrow. Trust should open the teaching path. =====
  console.log('\n  --- camp at Emberhold overnight ---');
  s.kcal = 3000; s.hydration = 100;
  Game.endDay();
  console.log(`  next day ${s.day}, ov.trust=${target.trust}`);
  const codexBefore = Object.keys(Game.state.codex.plants || {}).length;
  try { Game.villageTalk(target.id); } catch (e) { console.log('  villageTalk#2 threw:', e.message); }
  const taught = freshLines();
  beat('ACT 4 — second sit (do they teach?)');
  console.log(`  my codex plants: ${codexBefore} -> ${Object.keys(Game.state.codex.plants || {}).length}`);

  // ===== ACT 5: join them, then leave. =====
  console.log('\n  --- join Emberhold ---');
  try { Game.joinVillage(target.id); } catch (e) { console.log('  joinVillage threw:', e.message); }
  beat('ACT 5 — joined');
  console.log(`  joinedVillage=${Game.state.scholar.joinedVillage}`);
  try { Game.leaveVillage(); } catch (e) { console.log('  leaveVillage threw:', e.message); }
  console.log(`  after leave: joinedVillage=${Game.state.scholar.joinedVillage}`);

  // ===== ACT 6: the second village — they were ALSO living all this time =====
  const other = villages.find(v => v !== target);
  if (other && !other.generated) {
    console.log(`\n  ... ${other.name} is still a rumor (day=${other.day}, generated=${other.generated}). Walk there.`);
    let ox = cx, oy = cy;
    while (ox !== other.x || oy !== other.y) {
      const nx = ox !== other.x ? ox + Math.sign(other.x - ox) : ox;
      const ny = ox === other.x ? oy + Math.sign(other.y - oy) : oy;
      Game.reveal(nx, ny); Game.reveal(ox, oy);
      Game.map.px = ox; Game.map.py = oy;
      Game.travelTo(nx, ny, true);
      ox = nx; oy = ny;
    }
    beat(`ACT 5 — second village ${other.name} (day ${s.day})`);
    console.log(`  ${snap(other)}, ${villageLore(other)}`);
  }

  // ===== ACT 6: return home =====
  let hx = Game.map.px, hy = Game.map.py;
  while (hx !== 3 || hy !== 3) {
    const nx = hx !== 3 ? hx + Math.sign(3 - hx) : hx;
    const ny = hx === 3 ? hy + Math.sign(3 - hy) : hy;
    Game.reveal(nx, ny); Game.reveal(hx, hy);
    Game.map.px = hx; Game.map.py = hy;
    Game.travelTo(nx, ny, true);
    hx = nx; hy = ny;
  }
  beat('ACT 6 — home');
  console.log(`  day ${s.day}, kcal ${Math.round(s.kcal)}, home pantry ${Math.round(Game.state.village.pantryKcal || 0)} kcal`);
  console.log('\nDONE.');
})().catch(e => { console.error('CRASH:', e.message, '\n', e.stack.split('\n').slice(0, 8).join('\n')); process.exit(1); });
