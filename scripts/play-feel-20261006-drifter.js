#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): the DRIFTER loop — leave haven, travel far,
// approach a distant village (catch-up sim), join them, live at their fire,
// leave, and come home. Played as a player, judged like a player.
// Run: node scripts/play-feel-20261006-drifter.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const says = [];
function note(t) { console.log(t); }
const interesting = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); interesting.push(String(t)); return osay(t); };
function flushSays(tag, max = 6) {
  const take = says.splice(0).slice(0, max);
  for (const t of take) note(`   | ${tag} ${String(t).slice(0, 150)}`);
}

function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} part=${s.part} @node(${m.px},${m.py}) kcal=${Math.round(s.kcal||0)} hp=${Math.round(s.health||0)} water=${JSON.stringify(s.water||[]).slice(0,60)} joined=${s.joinedVillage||'—'}`);
}
function homeState(label) {
  const v = Game.state.village;
  note(`   [${label} home] day=${v.day} pantry_kcal=${Math.round(Game.pantryKcalLive(v))} mouths=${(v.roster||[]).length}`);
}
function villState(v, label) {
  note(`   [${label} ${v.name}] day=${v.day} pop=${v.population} pantry=${Math.round(v.pantryKcal||0)} focus=${(v.knowledgeProfile||{}).focus||'?'} plants_known=${Object.keys(((v.knowledgeProfile||{}).plants)||{}).length}`);
}

async function endDayQuiet() {
  says.length = 0;
  try { Game.endDay(); } catch (e) { note('ENDDAY ERROR: ' + e.message); }
}

function travelStep(tx, ty) {
  says.length = 0;
  const r = Game.travelTo(tx, ty);
  return r;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  note('=== DRIFTER RUN: the road out ===');
  // The drifter is an ESTABLISHED villager (trust earned), not a day-one stranger.
  // Half-rations at trust 15 would starve a fresh character sitting idle — by
  // design (Steve: trust-gated rations), so we play the archetype honestly.
  Game.state.village.trust[Game.villagerId] = 70;
  note(`   trust set to 70 (established villager; villagerId=${Game.villagerId})`);
  const ovs = (Game.state.otherVillages || []);
  note(`Distant villages: ${ovs.map(v => `${v.name} @(${v.x},${v.y}) pop=${v.population} day=${v.day} generated=${!!v.generated}`).join(' | ')}`);
  vstate('start'); homeState('start');
  if (!ovs.length) { note('NO OTHER VILLAGES — drifter loop is dead on arrival. ABORT.'); process.exit(1); }

  // --- ACT 1: three days at home, living normally (forage-lite: pantry feeds us) ---
  note('\n=== ACT 1: three days at haven, an established life ===');
  for (let d = 1; d <= 3; d++) {
    await endDayQuiet();
    const s2 = Game.state.scholar;
    note(`   day ${s2.day}: kcal=${Math.round(s2.kcal||0)} hp=${Math.round(s2.health||0)} over=${!!Game.over}`);
  }
  vstate('day3'); homeState('day3');
  const homePantryDay3 = Math.round(Game.pantryKcalLive(Game.state.village));
  if (Game.over) { note('DIED during ACT 1 — abort'); process.exit(1); }

  // --- ACT 2: walk out. pick the nearest village, travel node by node (orthogonal steps) ---
  note('\n=== ACT 2: the road out ===');
  const px0 = Game.map.px, py0 = Game.map.py;
  const dist = v => Math.abs(v.x - px0) + Math.abs(v.y - py0);
  const target = ovs.slice().sort((a, b) => dist(a) - dist(b))[0];
  note(`Target: ${target.name} @(${target.x},${target.y}), ${dist(target)} tiles away.`);
  let guard = 20;
  const travelLog = [];
  function stepToward(tx, ty) {
    // one orthogonal step; if blocked on one axis, try the other
    const axes = [];
    if (Game.map.px !== tx) axes.push([Game.map.px + Math.sign(tx - Game.map.px), Game.map.py]);
    if (Game.map.py !== ty) axes.push([Game.map.px, Game.map.py + Math.sign(ty - Game.map.py)]);
    for (const [nx, ny] of axes) {
      const before = { x: Game.map.px, y: Game.map.py };
      says.length = 0;
      travelStep(nx, ny);
      if (Game.map.px !== before.x || Game.map.py !== before.y) return true;
    }
    return false;
  }
  while (guard-- > 0 && (Game.map.px !== target.x || Game.map.py !== target.y)) {
    if (!stepToward(target.x, target.y)) {
      note('   fully blocked — stopping road');
      const bl = says.splice(0).filter(t => /creek|fallen|rubble|washed|blocks/i.test(t));
      for (const t of bl.slice(0, 2)) note(`   | block ${String(t).slice(0, 120)}`);
      break;
    }
    const t = Game.playerTile();
    travelLog.push(`(${Game.map.px},${Game.map.py}) ${t ? t.type : '?'}`);
    flushSays('road', 3);
  }
  note(`Road: ${travelLog.join(' -> ')}`);
  vstate('arrived-near');

  // --- ACT 3: first sight — the smoke announcement + catch-up sim ---
  note('\n=== ACT 3: first sight — smoke on the horizon ===');
  says.length = 0;
  Game.checkVillageProximity();
  flushSays('sight', 8);
  villState(target, 'after-catchup');
  const s = Game.state.scholar;
  const okDay = target.day === s.day;
  note(`   catch-up watermark: village.day=${target.day} vs scholar.day=${s.day} => ${okDay ? 'PASS (no double-count)' : 'FAIL (day mismatch!)'}`);
  const pk = Math.round(target.pantryKcal || 0);
  const sane = pk >= 0 && pk <= target.population * 8000;
  note(`   pantry=${pk} (cap ${target.population * 8000}) => ${sane ? 'PASS (bounded, no balloon)' : 'FAIL'}`);
  const prof = target.knowledgeProfile || {};
  note(`   knowledgeProfile: focus=${prof.focus || 'MISSING'} plants=${Object.keys(prof.plants||{}).length} ${prof.focus ? 'PASS' : 'FAIL (no living-knowledge profile)'}`);

  // step onto their tile
  note('\n=== stepping onto their clearing ===');
  travelStep(target.x, target.y);
  flushSays('tile', 4);
  vstate('at-village');

  // --- ACT 4: join them, live 3 days at their fire ---
  note('\n=== ACT 4: joining the village ===');
  says.length = 0;
  Game.joinVillage(target.id);
  flushSays('join', 4);
  vstate('joined');
  for (let d = 1; d <= 3; d++) {
    note(`--- their day ${d} (our day ${Game.state.scholar.day}) ---`);
    const pk0 = Math.round(target.pantryKcal || 0), kcal0 = Math.round(Game.state.scholar.kcal || 0);
    await endDayQuiet();
    villState(target, `after-day${d}`);
    const dk = Math.round(target.pantryKcal || 0) - pk0;
    note(`   their pantry Δ=${dk}, my kcal ${kcal0} -> ${Math.round(Game.state.scholar.kcal || 0)}`);
    if (Math.round(target.pantryKcal || 0) === pk0 && d > 1) note('   WARNING: joined village pantry static — tickJoinedVillage may not be firing');
  }
  // check for double-count: village.day should track scholar.day exactly
  note(`   watermark: village.day=${target.day} vs scholar.day=${Game.state.scholar.day} => ${target.day === Game.state.scholar.day ? 'PASS' : 'FAIL'}`);

  // --- ACT 4b: the drifter's real verb — sit, talk, trade knowledge ---
  note('\n=== ACT 4b: villageTalk — sitting with them ===');
  says.length = 0;
  Game.villageTalk(target.id);
  flushSays('talk1', 5);
  note(`   ov.trust after first sit: ${target.trust}`);
  note('   -- same-day repeat --');
  says.length = 0;
  Game.villageTalk(target.id);
  flushSays('talk2', 3);
  // earn their face: a few sits across days
  for (let i = 0; i < 2; i++) { await endDayQuiet(); says.length = 0; Game.villageTalk(target.id); flushSays('sit' + i, 4); }
  note(`   ov.trust now: ${target.trust}`);
  // force trust to teaching range and verify knowledge transfer works
  target.trust = 35;
  const knownBefore = Object.keys(Game.state.codex.plants || {}).length;
  says.length = 0;
  Game.villageTalk(target.id);
  flushSays('teach', 6);
  const knownAfter = Object.keys(Game.state.codex.plants || {}).length;
  note(`   codex plants ${knownBefore} -> ${knownAfter} ${knownAfter > knownBefore ? 'PASS (taught)' : 'check'}`);
  // lean-village food gift
  note('   -- villageShareFood --');
  says.length = 0;
  try { Game.villageShareFood(target.id, { giftKcal: 700 }); } catch (e) { note('   sharefood error: ' + e.message); }
  flushSays('share', 4);

  // --- ACT 5: leave, walk home, verify home lived ---
  note('\n=== ACT 5: leaving and the road home ===');
  says.length = 0;
  Game.leaveVillage();
  flushSays('leave', 3);
  vstate('solo');
  const h = { x: px0, y: py0 };
  guard = 20;
  const roadHome = [];
  while (guard-- > 0 && (Game.map.px !== h.x || Game.map.py !== h.y)) {
    if (!stepToward(h.x, h.y)) { note('   road home blocked — stopping'); break; }
    const t = Game.playerTile();
    roadHome.push(`(${Game.map.px},${Game.map.py}) ${t ? t.type : '?'}`);
    says.length = 0; // keep road chatter down; already judged in ACT 2
  }
  note(`Road home: ${roadHome.join(' -> ')}`);
  vstate('home-node'); homeState('home-node');
  note(`   home pantry day3=${homePantryDay3} now=${Math.round(Game.pantryKcalLive(Game.state.village))}`);
  // camp wild one night away from the fire to test the away meal path
  note('\n=== ACT 6: one night camped wild near haven (no pantry meal) ===');
  says.length = 0;
  await endDayQuiet();
  const wildSays = says.splice(0).filter(t => /camp wild|no pantry|pack/i.test(t));
  for (const t of wildSays.slice(0, 3)) note(`   | wild ${String(t).slice(0, 140)}`);
  vstate('after-wild'); homeState('after-wild');

  note('\n=== DRIFTER RUN COMPLETE ===');
  note('interesting-log count: ' + interesting.length);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
