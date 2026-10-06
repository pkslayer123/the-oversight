#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06), DRIFTER run 3 — "the grab on the road".
// Covered earlier today: road out, catch-up sim, join/live/leave, villageTalk
// knowledge trade, boomerang presence-gating, homecoming basics.
// NEW territory this run:
//   (a) contest GRABS the drifter far from home (mid-road, camped wild) — is
//       the interruption coherent when you're nowhere near the village?
//   (b) home contest grabs you while you're JOINED to another village —
//       the System takes you across the map; what does the fiction say?
//   (c) fog-of-war navigation: does the road actually get recorded on the
//       world map as you walk it (markSeen/marked visited)?
// Played as a player, judged like a player. Run: node scripts/play-feel-20261006-drifter2.js
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

function note(t) { console.log(t); }
const says = [];
const osay = Game.say.bind(Game), osys = Game.sysSay.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
Game.sysSay = (t) => { says.push('[SYS] ' + String(t)); return osys(t); };
function flush(tag, max = 8) {
  for (const t of says.splice(0).slice(0, max)) note(`   | ${tag} ${String(t).slice(0, 160)}`);
}
function vstate(label) {
  const s = Game.state.scholar, m = Game.map;
  note(`   [${label}] day=${s.day} part=${s.part} @node(${m.px},${m.py}) kcal=${Math.round(s.kcal||0)} hp=${Math.round(s.health||0)} joined=${s.joinedVillage||'—'} over=${!!Game.over}`);
}
function rig(seq) { const o = Math.random; let i = 0; Math.random = () => seq[i++ % seq.length]; return () => { Math.random = o; }; }
async function endDayQuiet() { says.length = 0; try { Game.endDay(); } catch (e) { note('ENDDAY ERROR: ' + e.message); } }
function travelStep(tx, ty) { says.length = 0; try { Game.travelTo(tx, ty); } catch (e) { note('TRAVEL ERROR: ' + e.message); } }
function stepToward(tx, ty) {
  const axes = [];
  if (Game.map.px !== tx) axes.push([Game.map.px + Math.sign(tx - Game.map.px), Game.map.py]);
  if (Game.map.py !== ty) axes.push([Game.map.px, Game.map.py + Math.sign(ty - Game.map.py)]);
  for (const [nx, ny] of axes) {
    const bx = Game.map.px, by = Game.map.py;
    travelStep(nx, ny);
    if (Game.map.px !== bx || Game.map.py !== by) return true;
  }
  return false;
}
function byId(id) { return Game.contestPool().find(c => c.id === id); }
// drive the contest modal to completion: always pick choice 0 (Participate/first option)
function driveContest() {
  let steps = 0, last = null, u0 = rig([0.99]);
  while (Game.state.activeContest && steps < 20) {
    try { last = Game.contestChoose(0); } catch (e) { note('contestChoose ERROR: ' + e.message); break; }
    steps++;
  }
  u0();
  return { steps, done: !Game.state.activeContest, last };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  // established villager at day 15: contests live, trust earned, needs honest
  s.day = 15;
  Game.state.village.trust[Game.villagerId] = 70;
  s.kcal = 3200; s.health = 100; s.water = [{ days: 2 }];
  const ovs = Game.state.otherVillages || [];
  note(`Distant villages: ${ovs.map(v => `${v.name}@(${v.x},${v.y})`).join(' | ')}`);
  vstate('setup');

  // ============ ACT 1: the long road + fog of war ============
  note('\n=== ACT 1: fog of war — is the road recorded? ===');
  note(`   mapSeen haven (${Game.map.px},${Game.map.py}) = ${Game.mapSeen(Game.map.px, Game.map.py)}`);
  const hx = Game.map.px, hy = Game.map.py;
  const dist = v => Math.abs(v.x - hx) + Math.abs(v.y - hy);
  const target = ovs.slice().sort((a, b) => dist(b) - dist(a))[0]; // FARTHEST — the real drift
  note(`   Farthest village: ${target.name} @(${target.x},${target.y}), ${dist(target)} tiles out`);
  let seenBefore = Object.keys(s.seenTiles || {}).length;
  let guard = 30, walked = [];
  while (guard-- > 0 && (Game.map.px !== target.x || Game.map.py !== target.y)) {
    if (!stepToward(target.x, target.y)) { note('   road blocked — stopping'); break; }
    walked.push(`(${Game.map.px},${Game.map.py})`);
  }
  note(`   Road: ${walked.join(' -> ')}`);
  const seenAfter = Object.keys(Game.state.scholar.seenTiles || {}).length;
  note(`   seenTiles ${seenBefore} -> ${seenAfter} ${seenAfter >= seenBefore + walked.length - 1 ? 'PASS (road recorded)' : 'CHECK'}`);
  note(`   mapSeen current tile = ${Game.mapSeen(Game.map.px, Game.map.py)}`);
  note(`   mapSeen haven (home, now far) = ${Game.mapSeen(hx, hy)}`);
  note(`   fog: mapSeen an unvisited far corner (0,0) = ${Game.mapSeen(0, 0)}`);
  vstate('arrived-far');

  // ============ ACT 2: grabbed mid-road, far from home ============
  note('\n=== ACT 2: THE GRAB ON THE ROAD — contest takes you far from home ===');
  // camp wild: one step away from the village tile so we're truly "away"
  Game.checkVillageProximity();
  says.length = 0;
  // step one tile off the village so we're camped wild, miles from haven
  const offX = Math.max(0, Math.min(6, target.x + 1)), offY = target.y;
  travelStep(offX, offY);
  vstate('camped-wild');
  flush('camp', 4);
  // force the contest: player-preferred pick, announced a day early (natural flow)
  {
    const u0 = rig([0.5]); // no System whim override; player preferred
    Game.state.showBudget = null; Game.state.pendingContest = null;
    Game.fireContest(Object.assign({}, byId('hide'), { givesChoice: false }));
    u0();
  }
  flush('announce', 6);
  const pc = Game.state.pendingContest;
  note(`   pending: ${pc && pc.contestId} participant=${pc && pc.participant} firesDay=${pc && pc.firesDay}`);
  note(`   fiction check: does the announcement acknowledge where you are? (you are ${dist(target)}+ tiles from haven)`);
  await endDayQuiet(); // countdown resolves next day
  flush('fires', 6);
  note(`   activeContest=${!!Game.state.activeContest} id=${Game.state.activeContest && Game.state.activeContest.contestId}`);
  if (Game.state.activeContest) {
    const r = driveContest();
    note(`   modal drove ${r.steps} steps, done=${r.done}`);
    flush('after', 10);
  }
  vstate('post-contest');
  note(`   position after contest: (${Game.map.px},${Game.map.py}) — moved? teleport? dropped back at camp?`);
  note(`   kcal=${Math.round(s.kcal||0)} hp=${Math.round(s.health||0)} over=${!!Game.over}`);

  // ============ ACT 3: joined + home contest grabs you across the map ============
  if (!Game.over) {
    note('\n=== ACT 3: JOINED, then the home System grabs you ===');
    travelStep(target.x, target.y);
    Game.checkVillageProximity();
    says.length = 0;
    Game.joinVillage(target.id);
    flush('join', 3);
    // live one day at their fire so tickJoinedVillage has state
    await endDayQuiet();
    vstate('joined-day');
    const jvPantry0 = Math.round(target.pantryKcal || 0);
    note(`   their pantry=${jvPantry0} pop=${target.population} day=${target.day} (scholar day=${s.day})`);
    {
      const u0 = rig([0.5]);
      Game.state.showBudget = null; Game.state.pendingContest = null;
      Game.fireContest(Object.assign({}, byId('oath'), { givesChoice: false }));
      u0();
    }
    flush('announce2', 6);
    await endDayQuiet(); // fires next day while we're AT their fire
    flush('fires2', 6);
    if (Game.state.activeContest) {
      const r = driveContest();
      note(`   modal drove ${r.steps} steps, done=${r.done}`);
      flush('after2', 8);
    }
    vstate('post-contest2');
    note(`   still joined? ${Game.state.scholar.joinedVillage === target.id ? 'yes' : 'NO — membership lost!'}`);
    note(`   their pantry ${jvPantry0} -> ${Math.round(target.pantryKcal||0)} (did their day keep simming while you were taken?)`);
    note(`   position after: (${Game.map.px},${Game.map.py}) — back at their fire?`);
    // one more day: does the joined village resume living?
    await endDayQuiet();
    note(`   next day: their day=${target.day} vs scholar day=${s.day} pantry=${Math.round(target.pantryKcal||0)}`);
  }

  // ============ ACT 4: the long return — homecoming + away news ============
  if (!Game.over) {
    note('\n=== ACT 4: the long road home — homecoming beat ===');
    says.length = 0;
    Game.leaveVillage();
    flush('leave', 2);
    guard = 30;
    const daysAwayStart = (s.day || 1) - (s.lastHavenDay || 1);
    note(`   days away so far: ${daysAwayStart}`);
    while (guard-- > 0 && (Game.map.px !== hx || Game.map.py !== hy)) {
      if (!stepToward(hx, hy)) { note('   road home blocked — stopping'); break; }
      if (guard % 3 === 0) { s.kcal = Math.max(s.kcal || 0, 1500); s.water = [{ days: 2 }]; } // honest survival: forage a little, drink
    }
    vstate('at-haven-node');
    const daysAway = (s.day || 1) - (s.lastHavenDay || s.day);
    note(`   walked home; days away = ${daysAway}`);
    says.length = 0;
    Game.returnToVillage();
    flush('homecoming', 10);
    note(`   homecoming fired for ${daysAway} days away: ${says.length === 0 ? 'CHECK (no beat)' : 'PASS (beat present)'}`);
  }

  note('\n=== DRIFTER-2 RUN COMPLETE ===');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
