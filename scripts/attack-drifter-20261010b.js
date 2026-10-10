#!/usr/bin/env node
// DRIFTER hostile attacks, run 2 of 2026-10-10 (playtest loop, archetype 8).
// This morning's proof covered travel ping-pong, synergy streak, catch-up
// re-entry, regrow watermark, combat travel refusal. TODAY'S NEW ANGLES:
//   E1 EXPLOIT: guest-meal circuit — ally everywhere, eat 1500 x N/day. Cost vs payoff.
//   E2 HONESTY: probation says "half shares" — villageMeal draws full 2000. Copy vs engine.
//   E3 EXPLOIT: re-petition the village you already joined — phantom population + trust reset.
//   E4 EXPLOIT: join A -> join B -> join A seat accounting (phantom mouths).
//   S1 SOFTLOCK: joined village record destroyed mid-probation — engine must not strand.
//   H1 HONESTY: proposeAlliance promises "their fire is open" — verify recognizedAbroad real.
//   H2 HONESTY: first-sight announcement vs actual village state.
'use strict';
const { Game, SEED } = require('./drifter-harness.js');

let failures = 0, checks = 0;
function check(cond, label, extra) {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
  else console.log(`  ok   ${label}${extra ? ' — ' + extra : ''}`);
}
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function clearSays() { says.splice(0); }
function feed(kcal) { const s = Game.state.scholar; s.kcal = kcal || 4000; s.hydration = 100; if (s.health < 95) s.health = 100; }

async function main() {
  console.log(`seed=${SEED}`);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  feed();
  const villages = Game.state.otherVillages || [];
  check(villages.length >= 2, 'setup: 2-3 distant villages exist', `n=${villages.length}`);
  const [vA, vB] = villages;
  console.log(`  villages: ${villages.map(v => `${v.name}@(${v.x},${v.y}) pop=${v.population}`).join(' | ')}`);

  // Teleport adjacent to vA (engine-level; travel cost is not today's target)
  function standNextTo(v) { Game.map.px = v.x; Game.map.py = Math.max(0, v.y - 1); }
  // Force alliance path open: knowsVillage requires heard-of or visited; opinion>=10
  function befriend(v) {
    v.generated = v.generated || true;
    if (!v.knowledgeProfile) v.knowledgeProfile = Game.genVillageKnowledgeProfile(v);
    if (!v.roster) Game.genVillageRoster(v);
    Game.catchUpSim(v);
    v.opinion = 10;
  }

  // ---------- E1: guest-meal circuit ----------
  console.log('\n== E1: guest-meal circuit (ally everywhere, eat everywhere) ==');
  clearSays();
  for (const v of villages) befriend(v);
  // give Haven pantry the feast money for alliances
  Game.state.village.pantry = Game.state.village.pantry || [];
  const feastItem = { id: 'feast_probe', name: 'feast probe', kcal: 5000, qty: 5, fresh: true };
  Game.state.village.pantry.push(feastItem);
  let allied = 0;
  for (const v of villages) {
    standNextTo(v);
    // knowsVillage: visited counts?
    const knows = Game.knowsVillage ? Game.knowsVillage(v) : 'n/a';
    const r = Game.proposeAlliance(v.id);
    if (r === true) allied++;
    console.log(`  proposeAlliance ${v.name}: knows=${knows} -> ${r}`);
  }
  check(allied >= 1, 'E1a: at least one alliance formable after befriending', `allied=${allied}/${villages.length}`);
  // now the circuit: visit each allied village, eat guest meal, same day
  const day0 = s.day;
  let totalGained = 0;
  const ticks0 = s.dayTicks || 0;
  for (const v of villages) {
    if (!Game.isAllied || !Game.isAllied('haven', v.id)) continue;
    standNextTo(v);
    const before = s.kcal;
    s.kcal = 500; // arrive hungry so the meal serves
    const pantryBefore = v.pantryKcal;
    const got = Game.guestMeal(v.id);
    totalGained += (got || 0);
    console.log(`  meal @${v.name}: got=${got} pantry ${Math.round(pantryBefore)}->${Math.round(v.pantryKcal)}`);
    check((v.pantryKcal || 0) <= pantryBefore, `E1b: ${v.name} pantry actually dropped`, '');
  }
  const ticksSpent = (s.dayTicks || 0) - ticks0;
  console.log(`  circuit total: +${totalGained} kcal for ${ticksSpent} ticks, day advanced: ${s.day !== day0}`);
  check(s.day === day0, 'E1c: whole circuit fits in one day', `day ${day0}->${s.day}`);
  // second lap same day must refuse everywhere (guests, not locusts)
  let secondLap = 0;
  for (const v of villages) {
    if (!Game.isAllied || !Game.isAllied('haven', v.id)) continue;
    standNextTo(v); s.kcal = 500;
    const got = Game.guestMeal(v.id);
    if (got) secondLap += got;
  }
  check(secondLap === 0, 'E1d: second lap same day refused everywhere', `got=${secondLap}`);

  // ---------- H1: proposeAlliance promise (runs BEFORE E2's exile) ----------
  console.log('\n== H1: alliance promise vs engine ==');
  clearSays();
  const alliedIds = villages.filter(v => Game.isAllied && Game.isAllied('haven', v.id)).map(v => v.id);
  console.log(`  allied: ${alliedIds.join(',')} | isMember: ${Game.isMember(Game.villagerId)} exiled: ${!!s.exiled}`);
  let recogOk = true;
  for (const v of villages) {
    if (alliedIds.includes(v.id)) {
      const rec = Game.recognizedAbroad(Game.villagerId, v);
      if (!rec) { recogOk = false; console.log(`  NOT recognized at ${v.name} despite alliance`); }
    }
  }
  check(recogOk, 'H1a: recognizedAbroad true at every allied fire', '');

  // ---------- E2: probation half-shares honesty ----------
  console.log('\n== E2: probation "half shares" vs engine ==');
  clearSays();
  s.exiled = true; s.drifting = true; // exile so petition is the path
  standNextTo(vA);
  // force petition success: judgment 50 base; rig via gift + reputation is fiddly —
  // call joinVillageReal directly (the engine path petition takes on success)
  const popBefore = vA.population;
  Game.joinVillageReal(vA.id);
  check(s.joinedVillage === vA.id, 'E2a: joined', '');
  check(vA.population === popBefore + 1, 'E2b: seat taken (pop+1)', `${popBefore}->${vA.population}`);
  check(!!(s.probation && s.probation.villageId === vA.id), 'E2c: probation active', JSON.stringify(s.probation));
  // endDay at their fire; measure the meal draw
  Game.map.px = vA.x; Game.map.py = vA.y;
  vA.pantryKcal = 50000;
  s.kcal = 500;
  const mealBefore = vA.pantryKcal;
  Game.endDay();
  const drawn = mealBefore - vA.pantryKcal - 0; // village also ate; measure scholar gain instead
  const gained = s.kcal - 500;
  console.log(`  probation meal: scholar gained ${gained} kcal (fiction says HALF shares)`);
  check(gained <= 1100, 'E2d: probation meal is half shares (<=1100)', `gained=${gained}`);

  // ---------- E3: re-petition the village you already joined ----------
  // Stronger: make the player a voted-in full member first (trust 20, no
  // probation) — the old code reset trust to 5 AND restarted 14-day probation.
  console.log('\n== E3: re-petition / re-join the SAME village ==');
  clearSays();
  vA.trust = 20; s.probation = null;
  const popA = vA.population, trustA = vA.trust;
  Game.joinVillageReal(vA.id); // already joined to vA
  console.log(`  rejoin same: pop ${popA}->${vA.population}, trust ${trustA}->${vA.trust}, probation=${JSON.stringify(s.probation)}`);
  check(vA.population === popA, 'E3a: no phantom seat on rejoin', `${popA}->${vA.population}`);
  check(vA.trust === trustA, 'E3b: trust not reset on rejoin', `${trustA}->${vA.trust}`);
  check(s.probation === null, 'E3c: probation not restarted on rejoin', '');
  const pet = Game.petitionVillage(vA.id, { giftKcal: 1500 });
  check(pet === true, 'E3d: petitioning own village short-circuits as already-in', `->${pet}`);
  check(says.join(' ').includes('already one of'), 'E3e: honest narration', '');

  // ---------- E4: join A -> join B -> join A seat accounting ----------
  console.log('\n== E4: village switching seat accounting ==');
  clearSays();
  const popB0 = vB.population;
  Game.joinVillageReal(vB.id);
  check(s.joinedVillage === vB.id, 'E4a: now joined to B', '');
  check(vA.population === popA - 1, 'E4b: A seat released on switch', `${popA}->${vA.population}`);
  check(vB.population === popB0 + 1, 'E4c: B seat taken', `${popB0}->${vB.population}`);
  Game.joinVillageReal(vA.id);
  check(vB.population === popB0, 'E4d: B seat released on switch back', `->${vB.population}`);

  // ---------- S1: joined village destroyed mid-probation ----------
  console.log('\n== S1: joined village record vanishes mid-probation ==');
  clearSays();
  // rejoin vA fresh for a clean probation
  s.probation = { villageId: vA.id, daysLeft: 10 };
  s.joinedVillage = vA.id; s.exiled = false; s.drifting = false;
  Game.map.px = vA.x; Game.map.py = vA.y;
  // destroy the village record
  Game.state.otherVillages = Game.state.otherVillages.filter(x => x.id !== vA.id);
  let threw = false;
  try {
    Game.probationTick();
    Game.villageMeal();
    Game.tickJoinedVillage();
    Game.endDay();
  } catch (e) { threw = true; console.log('  threw: ' + e.message); }
  check(!threw, 'S1a: no exception with destroyed joined village', '');
  check(s.joinedVillage === null && s.exiled === true && s.drifting === true,
    'S1b: road takes you back (exile restored, drift reachable)', `joined=${s.joinedVillage} exiled=${s.exiled} drifting=${s.drifting}`);
  const driftOk = Game.drift();
  check(driftOk === true, 'S1c: drift() reachable after loss', '');

  // ---------- H2: first-sight announcement ----------
  console.log('\n== H2: first-sight announcement honesty ==');
  // craft a fresh unapproached village far in the future for a clean first sight
  const vNew = { id: 'village_probe', name: 'Probeville', x: 8, y: 8, day: 0,
    population: 9, pantryKcal: 18000, knowledge: 2, generated: false };
  Game.state.otherVillages.push(vNew);
  s.day = 60;
  Game.map.px = 7; Game.map.py = 7;
  clearSays();
  Game.checkVillageProximity();
  const announce = says.join(' ');
  console.log('  announced: ' + announce.slice(0, 220));
  check(announce.includes('Probeville'), 'H2a: names the village', '');
  check(vNew.generated === true && vNew.day === 60, 'H2b: caught up to today', `day=${vNew.day} generated=${vNew.generated}`);
  check(announce.includes('60 day'), 'H2c: says 60 days in (matches v.day)', '');
  const leanSaid = announce.includes('lean');
  check(leanSaid === ((vNew.pantryKcal || 0) <= 0), 'H2d: lean note matches pantry reality', `pantry=${Math.round(vNew.pantryKcal)} leanSaid=${leanSaid}`);

  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
