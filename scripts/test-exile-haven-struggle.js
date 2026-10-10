// Exile haven: founding is a struggle, joining existing havens.
// Steve (2026-10-06): "A New Haven should be able to be founded but I think
// not so easily. The exiled person should have to struggle to make their own,
// or more likely they join an existing village/haven that has capacity."
//
// FOUND arc: foundHaven() is gated behind a real project — 7+ solo days,
// claimed site, hut+ (shelter tier 2), 10000 kcal cached.
// JOIN arc: petition respects capacity (full = refused), acceptance puts you
// on 14-day probation at their fire (half shares, trust 5), served or failed.
// Usage: node scripts/test-exile-haven-struggle.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

// Deterministic RNG (mulberry32)
(function seed() {
  let a = 0xE411E;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}
function setPack(pid, kcal) {
  // REAL food in the real inventory (drifter loop 2026-10-07: the exile
  // economy no longer reads the NPC abstract pack — stock actual items).
  const per = 500, units = Math.ceil(kcal / per);
  Game.state.scholar.inventory.push({
    name: 'Test rations', kcalEach: per, units, spoilDay: 9999, safe: true,
    kg: 0.2, unit: 'pack', edible: true, foodState: 'ready', foodKind: 'plant',
  });
}

(async () => {
  await Game.init();

  console.log('== 1. FOUND ARC: instant founding is refused ==');
  Game.debugScenario('day1');
  const pid = Game.villagerId;
  Game.exilePlayer('test');
  const s = Game.state.scholar;
  ok('exile sets the solo clock', s.exileStartDay === s.day);
  ok('foundHaven refused on day one of exile', Game.foundHaven() !== true);
  const missing = Game.foundingMissing();
  ok('checklist names all four requirements', missing.length === 4);
  const acts = Game.exileSelfActions().map(a => a.id);
  ok('claimsite offered, foundhaven present-but-gated',
    acts.includes('claimsite') && acts.includes('foundhaven'));
  const fh = Game.exileSelfActions().find(a => a.id === 'foundhaven');
  ok('foundhaven action disabled with reasons in hint', fh.disabled === true && /solo/.test(fh.hint));

  console.log('== 2. FOUND ARC: the project, step by step ==');
  ok('build before claim refused', Game.exileSelfDo('buildshelter') !== true);
  Game.exileSelfDo('claimsite');
  ok('site claimed', Game.foundingState().siteClaimed === true);
  ok('shelter without timber refused', Game.exileSelfDo('buildshelter') !== true);
  const wood0 = Game.woodCount();
  Game.exileSelfDo('gathertimber');
  const wood1 = Game.woodCount();
  ok('gathering yields timber', wood1 - wood0 >= 6 && wood1 - wood0 <= 9);
  while (Game.woodCount() < 8) Game.exileSelfDo('gathertimber');
  Game.exileSelfDo('buildshelter');
  ok('lean-to raised (tier 1)', Game.foundingState().shelterTier === 1);
  ok('hut still required', Game.foundingMissing().some(m => /hut/.test(m)));
  while (Game.woodCount() < 16) Game.exileSelfDo('gathertimber');
  Game.exileSelfDo('buildshelter');
  ok('hut raised (tier 2)', Game.foundingState().shelterTier === 2);
  // solo-days requirement: 6 days in is still too soon
  s.day = s.exileStartDay + 6;
  ok('6 solo days: still refused', Game.foundHaven() !== true);
  s.day = s.exileStartDay + 7;
  // caching: real pack -> stockpile flow
  setPack(pid, 3000);
  const packBefore = Game.playerPackKcal();
  Game.exileSelfDo('cachefood');
  ok('caching moves pack kcal to the stockpile',
    Math.round(Game.foundingState().stockpileKcal) === 3000 && Game.playerPackKcal() < packBefore);
  Game.foundingState().stockpileKcal = 10000; // rest of the loop is days of packing
  ok('checklist clear after ~2 weeks of work', Game.foundingMissing().length === 0);

  console.log('== 3. FOUND ARC: the fork, earned ==');
  const oldName = Game.state.village.name;
  const r = Game.foundHaven();
  ok('foundHaven succeeds after the struggle', r === true);
  ok('new village object, new name', Game.state.village.name !== oldName && Game.state.village.day === 1);
  ok('old village archived', (Game.state.pastVillages || []).some(v => v && v.name === oldName));
  ok('hut carried into the new haven', Game.state.village.buildingType === 'hut');
  ok('exile over, project spent', s.exiled === false && s.founding === null);

  // ============ JOIN ARC ============
  console.log('== 4. JOIN ARC: capacity is real ==');
  await Game.init();
  Game.debugScenario('day1');
  const pid2 = Game.villagerId;
  Game.exilePlayer('test');
  const s2 = Game.state.scholar;
  if (!Game.state.otherVillages || !Game.state.otherVillages.length) Game.genVillages();
  const ovs = Game.state.otherVillages;
  ok('other villages exist', ovs.length >= 2);
  ok('villages generated with capacity', ovs.every(v => v.capacity > (v.population || 0)));
  const full = ovs[0];
  full.capacity = full.population; // no room
  ok('villageRoom reports 0 when full', Game.villageRoom(full) === 0);
  // FOG (break-it travel 2026-10-09): the card gates on seen tiles, and
  // petition refuses from afar — walk up first so both asserts test the
  // CAPACITY reason, not distance/fog.
  Game.map.px = full.x; Game.map.py = full.y;
  try { Game.checkVillageProximity(); } catch (e) {}
  const cardFull = Game.villageCard(full.id);
  ok('card shows no room to an exile', /no room/.test(cardFull.sub));
  ok('petition at a full village refused', Game.petitionVillage(full.id) === false);

  console.log('== 5. JOIN ARC: petition accepted -> probation ==');
  const home = ovs[1];
  home.capacity = (home.population || 8) + 2;
  Game.map.px = home.x; Game.map.py = home.y; // petition happens face to face
  try { Game.checkVillageProximity(); } catch (e) {}
  Game.state.village.gossip = [];
  Game.state.codex.skills = { read_people: { level: 3 } };
  setPack(pid2, 2000);
  const oldName5 = Game.state.village.name;
  const popBefore = home.population;
  const okPet = Game.petitionVillage(home.id, { giftKcal: 1500 });
  ok('petition accepted with food + skills', okPet === true);
  ok('old village archived on join (hard reset)',
    (Game.state.pastVillages || []).some(x => x && x.name === oldName5));
  ok('probation set: 14 days', s2.probation && s2.probation.villageId === home.id && s2.probation.daysLeft === 14);
  ok('outsider trust starts at 5', home.trust === 5);
  ok('population grew by one', home.population === popBefore + 1);
  ok('exile phase over', s2.exiled === false);

  console.log('== 6. JOIN ARC: outsider status bites ==');
  Game.map.px = home.x; Game.map.py = home.y; // at their fire
  home.pantryKcal = 5000;
  s2.kcal = 0;
  Game.villageMeal();
  ok('probation meal is half shares (<=1000)', s2.kcal <= 1000 && s2.kcal > 0);
  Game.villageTalk(home.id);
  ok('talk still works on probation', home.trust > 5); // showing up earns a little

  console.log('== 7. JOIN ARC: probation served -> voted in ==');
  home.trust = 20;
  s2.probation.daysLeft = 1;
  Game.probationTick();
  ok('probation cleared on success', !s2.probation);
  ok('still a member', s2.joinedVillage === home.id && s2.exiled === false);

  console.log('== 8. JOIN ARC: probation failed -> back on the road ==');
  const home2 = ovs[2] || ovs[0];
  home2.capacity = (home2.population || 8) + 2;
  home2.trust = 5;
  s2.probation = { villageId: home2.id, daysLeft: 1 };
  s2.joinedVillage = home2.id;
  Game.map.px = home2.x; Game.map.py = home2.y;
  Game.probationTick();
  ok('rejected: membership revoked', s2.joinedVillage === null && !s2.probation);
  ok('rejected: back in the exile phase', s2.exiled === true && s2.drifting === true);
  ok('rejected: solo clock restarted', s2.exileStartDay === s2.day);

  console.log('== 9. drift smoke discovery runs clean ==');
  s2.drifting = true;
  Game.map.px = 3; Game.map.py = 3; // out in the wild, not on a village tile
  const dd0 = s2.driftDays || 0;
  for (let i = 0; i < 200; i++) { try { Game.driftTick(); } catch (e) { ok('driftTick never throws (' + e.message + ')', false); break; } }
  ok('200 drift days tick clean', (s2.driftDays || 0) === dd0 + 200);
  ok('smoke sightings hint villages', ovs.some(v => v.hinted));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
