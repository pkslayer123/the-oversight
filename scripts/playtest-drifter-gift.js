// DRIFTER probe 2026-10-05: the lean village and the fat pack.
// Setup: day-25 game, home village fed. Player packs a heavy haul and walks
// to a STARVING distant village. Questions:
//  1. Does the smoke-line promise ("Food would talk here") have any mechanic behind it?
//  2. What does the villageCard offer a non-exiled drifter at their fire?
//  3. What does a long walk cost, tile by tile, with a night on the road?
// Usage: node scripts/playtest-drifter-gift.js [--seed N]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js', 'src/js/justice.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
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
  for (const l of freshLines()) console.log('  | ' + (l || '').toString().slice(0, 240));
}
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
const ME = () => Game.state.scholar.villagerId;

(async () => {
  await Game.init();
  const _say = Game.say.bind(Game);
  Game.say = (m) => { allSaid.push(m); return _say(m); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 4000; s.health = 100; s.hydration = 100;
  freshLines();

  const villages = Game.state.otherVillages || [];
  const target = villages.slice().sort((a, b) => manhattan(3, 3, b.x, b.y) - manhattan(3, 3, a.x, a.y))[0];
  const dist = manhattan(3, 3, target.x, target.y);
  console.log(`seed ${seed}. ${villages.length} villages. target: ${target.name} @ (${target.x},${target.y}) dist ${dist}`);

  // Run 20 days so the world has history, keeping the home village fed.
  for (let d = 0; d < 20; d++) {
    const v = Game.state.village;
    v.pantryKcal = Math.max(v.pantryKcal || 0, 30000);
    v.hungryDays = 0;
    s.kcal = 4000; s.hydration = 100; if (s.health < 100) s.health = 100;
    try { Game.endDay(); } catch (e) {}
    if (Game.over) { console.log('GAME OVER during prelude at day', s.day); break; }
  }
  // STARVE the target village: catch it up then zero its pantry.
  try { Game.catchUpSim(target); } catch (e) { console.log('catchUpSim threw:', e.message); }
  target.pantryKcal = 0;
  freshLines();
  console.log(`\n${target.name}: day ${target.day}, pop ${target.population}, pantry ${target.pantryKcal} kcal (STARVING)`);

  // ===== ACT 1: the walk, tile by tile, with a night on the road =====
  s.kcal = 4000; s.hydration = 100;
  Game.state.village.pack = Game.state.village.pack || {};
  Game.state.village.pack[ME()] = { day: s.day, kcal: 3200 }; // a heavy haul, packed for the trip
  const kcalOut0 = s.kcal, dayOut0 = s.day;
  let cx = 3, cy = 3, legs = 0;
  const perLeg = [];
  while (cx !== target.x || cy !== target.y) {
    const nx = cx !== target.x ? cx + Math.sign(target.x - cx) : cx;
    const ny = cx === target.x ? cy + Math.sign(target.y - cy) : cy;
    const before = Math.round(s.kcal), tb = Game.state.dayTicks || 0;
    Game.reveal(nx, ny); Game.reveal(cx, cy);
    Game.map.px = cx; Game.map.py = cy;
    try { Game.travelTo(nx, ny, true); } catch (e) { console.log('  travelTo threw:', e.message); break; }
    perLeg.push({ kcal: before - Math.round(s.kcal), ticks: (Game.state.dayTicks || 0) - tb });
    legs++; cx = nx; cy = ny;
    // halfway: sleep on the road
    if (legs === Math.ceil(dist / 2) && !s.exiled) {
      console.log('\n  --- night on the road: sleep exposed ---');
      const h0 = Math.round(s.health);
      try { Game.sleep(); } catch (e) { console.log('  sleep threw:', e.message); }
      console.log(`  health ${h0} -> ${Math.round(s.health)} (weather was ${Game.state.weather})`);
    }
  }
  beat(`ACT 1 — arrived at ${target.name} (${legs} legs, day ${s.day})`);
  console.log(`  walk cost: kcal ${Math.round(kcalOut0)} -> ${Math.round(s.kcal)}, day ${dayOut0} -> ${s.day}`);
  console.log('  per-leg:', JSON.stringify(perLeg));

  // ===== ACT 2: the card. What can a non-exiled drifter DO at a starving fire? =====
  let card = null;
  try { card = Game.villageCard(target.id); } catch (e) { console.log('  villageCard threw:', e.message); }
  beat('ACT 2 — the village card at a starving fire');
  console.log('  card sub:', card && card.sub);
  (card && card.actions || []).forEach(a => console.log(`  action: ${a.label} — ${a.hint}`));
  if (card && card.hint) console.log('  hint:', card.hint);
  console.log('  pack carried:', Game.packKcal(ME()), 'kcal');

  // ===== ACT 3: talk, then look for any food-sharing verb =====
  try { Game.villageTalk(target.id); } catch (e) { console.log('  villageTalk threw:', e.message); }
  beat('ACT 3 — sit & talk (does food talk?)');
  console.log('  trust now:', target.trust, '| pantry now:', Math.round(target.pantryKcal || 0));
  console.log('  pack still:', Game.packKcal(ME()), 'kcal');
  const said = allSaid.join('\n');
  console.log('  "food would talk" appeared in text:', /Food would talk/.test(said));
  console.log('  any action id on card containing "food"/"share"/"gift"/"give":',
    JSON.stringify((card.actions || []).map(a => a.id)));

  // ===== ACT 4: the fix — share food at the starving fire =====
  // top up the pack so both tiers are exercisable
  Game.state.village.pack[ME()] = { day: s.day, kcal: 2000 };
  let card2 = null;
  try { card2 = Game.villageCard(target.id); } catch (e) { console.log('  villageCard threw:', e.message); }
  console.log('\n  card actions now:', JSON.stringify((card2.actions || []).map(a => a.id)));
  const pantry0 = Math.round(target.pantryKcal || 0), trust0 = target.trust || 0;
  let r = null;
  try { r = Game.villageCardAction(target.id, 'sharefood', { giftKcal: 700 }); } catch (e) { console.log('  sharefood threw:', e.message); }
  beat('ACT 4 — share a day\'s food (700) at the starving fire');
  console.log(`  returned: ${r} | pantry ${pantry0} -> ${Math.round(target.pantryKcal || 0)} | trust ${trust0} -> ${target.trust} | pack now ${Game.packKcal(ME())}`);
  // second share, same day: diminished trust
  const trust1 = target.trust;
  try { Game.villageCardAction(target.id, 'sharefood', { giftKcal: 700 }); } catch (e) { console.log('  sharefood#2 threw:', e.message); }
  console.log(`  second gift same day: trust ${trust1} -> ${target.trust} (diminished), pantry ${Math.round(target.pantryKcal || 0)}`);
  // feast tier
  Game.state.village.pack[ME()] = { day: s.day, kcal: 2000 };
  const trust2 = target.trust;
  try { Game.villageCardAction(target.id, 'sharefood', { giftKcal: 1500 }); } catch (e) { console.log('  feast threw:', e.message); }
  console.log(`  feast 1500: trust ${trust2} -> ${target.trust}, pack now ${Game.packKcal(ME())}`);
  // broke drifter: honest refusal
  Game.state.village.pack[ME()] = { day: s.day, kcal: 300 };
  const rBroke = Game.villageCardAction(target.id, 'sharefood', { giftKcal: 700 });
  console.log(`  broke attempt returned: ${rBroke}, pantry unchanged: ${Math.round(target.pantryKcal || 0)}`);

  console.log('\nDONE.');
})();
