#!/usr/bin/env node
// DRIFTER playtest 2026-10-06 07:30 CDT (run 2): THE BOOMERANG DRIFT, honest edition.
// Full index.html load order. The drifter EATS (topped up: this run tests the
// village sim, not starvation). Visit A, join, talk daily (earn trust), live 3
// days. Leave for B, talk, camp wild 2 days. Walk BACK to A: does the village
// live while you're gone (re-approach catch-up — the 2026-10-05 freeze fix)?
// Then return home. Abort honestly on death.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js',
 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const says = [];
function note(t) { console.log(t); }
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flushSays(tag, max = 10) {
  const take = says.splice(0).slice(0, max);
  for (const t of take) note(`   | ${tag} ${String(t).slice(0, 170)}`);
}
function feed() { const s = Game.state.scholar; s.kcal = 3000; s.hydration = 100; if (s.health < 90) s.health = 100; }
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} @(${m.px},${m.py}) kcal=${Math.round(s.kcal || 0)} hp=${Math.round(s.health || 0)} joined=${s.joinedVillage || '—'} over=${!!Game.over}`);
}
function homeState(label) {
  const v = Game.state.village;
  note(`   [${label} HOME] pantry=${Math.round(Game.pantryKcalLive(v))} mouths=${(v.roster || []).length}`);
}
function villState(v, label) {
  note(`   [${label} ${v.name}] day=${v.day} pop=${v.population} pantry=${Math.round(v.pantryKcal || 0)} trust=${Math.round(v.trust || 0)} focus=${(v.knowledgeProfile || {}).focus || '?'} plants=${Object.keys(((v.knowledgeProfile || {}).plants) || {}).length} generated=${!!v.generated}`);
}
function endDayAlive() {
  feed();
  try { Game.endDay(); } catch (e) { note('ENDDAY ERROR: ' + e.message); }
  if (Game.over) { note('*** PLAYER DIED — aborting honestly ***'); flushSays('death', 6); process.exit(3); }
}
function stepToward(tx, ty) {
  const px = Game.map.px, py = Game.map.py;
  if (px === tx && py === ty) return false;
  const nx = px !== tx ? px + Math.sign(tx - px) : px;
  const ny = px === tx ? py + Math.sign(ty - py) : py;
  try { Game.reveal(nx, ny); } catch (e) {}
  Game.travelTo(nx, ny, true);
  if (Game.over) { note('*** DIED ON THE ROAD ***'); process.exit(3); }
  if (Game.map.px === px && Game.map.py === py) { note(`   BLOCKED at (${px},${py}) -> (${nx},${ny})`); return false; }
  return true;
}
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  note('=== DRIFTER: THE BOOMERANG DRIFT (honest edition) ===');
  Game.state.village.trust[Game.villagerId] = 70;
  const ovs = (Game.state.otherVillages || []);
  const home = { x: Game.map.px, y: Game.map.py };
  const sorted = ovs.slice().sort((a, b) => manhattan(home.x, home.y, a.x, a.y) - manhattan(home.x, home.y, b.x, b.y));
  const A = sorted[0], B = sorted[sorted.length - 1];
  note(`   villages: ${ovs.map(v => `${v.name} @(${v.x},${v.y})`).join(' | ')}`);
  note(`   A=${A.name} (near), B=${B.name} (far)`);
  vstate('start'); homeState('start');

  note('\n=== ACT 1: two days at haven, then the road ===');
  for (let d = 0; d < 2; d++) { Game.state.village.pantryKcal = Math.max(Game.state.village.pantryKcal || 0, 60000); endDayAlive(); }
  vstate('day3'); homeState('day3');

  note('\n=== ACT 2: walk to A ===');
  says.length = 0;
  let guard = 30;
  while (guard-- > 0 && (Game.map.px !== A.x || Game.map.py !== A.y)) { if (!stepToward(A.x, A.y)) break; }
  flushSays('walk', 12);
  villState(A, 'A@firstsight');

  note('\n=== ACT 3: join A, talk daily, live 3 days ===');
  says.length = 0;
  Game.joinVillage(A.id);
  flushSays('join', 4);
  for (let d = 1; d <= 3; d++) {
    says.length = 0;
    try { Game.villageTalk(A.id); } catch (e) { note('talk err: ' + e.message); }
    flushSays('talk', 6);
    says.length = 0;
    endDayAlive();
    villState(A, `A-day${d}`);
    vstate(`A-day${d}`);
    flushSays('day', 6);
  }

  note('\n=== ACT 4: leave A, walk to B ===');
  says.length = 0;
  Game.leaveVillage();
  flushSays('leave', 3);
  const aWhenLeft = { day: A.day, pop: A.population, pantry: Math.round(A.pantryKcal || 0), plants: Object.keys((A.knowledgeProfile || {}).plants || {}).length, trust: Math.round(A.trust || 0) };
  note(`   A when left: ${JSON.stringify(aWhenLeft)}`);
  guard = 40;
  while (guard-- > 0 && (Game.map.px !== B.x || Game.map.py !== B.y)) { if (!stepToward(B.x, B.y)) break; }
  flushSays('walkB', 12);
  villState(B, 'B@firstsight');
  note('   talk at B, camp wild 2 days:');
  says.length = 0;
  try { Game.villageTalk(B.id); } catch (e) {}
  flushSays('talkB', 6);
  for (let d = 1; d <= 2; d++) { says.length = 0; endDayAlive(); vstate(`B-wild${d}`); flushSays('wild', 5); }

  note('\n=== ACT 5: THE BOOMERANG — back to A ===');
  guard = 40;
  while (guard-- > 0 && (Game.map.px !== A.x || Game.map.py !== A.y)) { if (!stepToward(A.x, A.y)) break; }
  flushSays('walkback', 14);
  villState(A, 'A@return');
  const gap = A.day - aWhenLeft.day;
  note(`   RESULT: day gap while away = ${gap} (need >= 2) ${gap >= 2 ? 'PASS — A lived' : 'FAIL — A froze'}`);
  note(`   pop ${aWhenLeft.pop} -> ${A.population} | pantry ${aWhenLeft.pantry} -> ${Math.round(A.pantryKcal || 0)} | plants ${aWhenLeft.plants} -> ${Object.keys((A.knowledgeProfile || {}).plants || {}).length} | trust ${aWhenLeft.trust} -> ${Math.round(A.trust || 0)}`);
  let stock = 0;
  for (let ty = 0; ty < 7; ty++) for (let tx = 0; tx < 7; tx++) {
    const t = Game.tileAt(tx, ty);
    if (t && manhattan(tx, ty, A.x, A.y) <= 4 && (t.stock || 0) > 0) stock += (t.stock || 0);
  }
  note(`   turf stock within 4 of A: ${stock}`);

  note('\n=== ACT 6: the road home ===');
  guard = 40;
  while (guard-- > 0 && (Game.map.px !== home.x || Game.map.py !== home.y)) { if (!stepToward(home.x, home.y)) break; }
  says.length = 0;
  endDayAlive();
  flushSays('home', 8);
  vstate('home'); homeState('home');

  note('\n=== BOOMERANG DRIFT COMPLETE ===');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
