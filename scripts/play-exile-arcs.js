// PLAYER DRIVE: exile arcs as a player (Steve 2026-10-06 verification).
// Plays: exile -> found-arc project -> fork; then exile -> drift -> petition
// -> probation -> vote. Prints the actual narration at each beat for feel.
// Usage: node scripts/play-exile-arcs.js
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
let said = [];
const origSay = () => {};
function drain(tag) {
  if (!said.length) return;
  console.log(`\n--- ${tag} ---`);
  for (const t of said) console.log('  ' + String(t).slice(0, 220));
  said = [];
}
(async () => {
  await Game.init();
  const hook = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return hook(t); } catch (e) {} };

  console.log('================ FOUND ARC ================');
  Game.debugScenario('day1');
  const pid = Game.villagerId;
  const oldName = Game.state.village.name;
  console.log(`old haven: ${oldName}, roster ${(Game.state.village.roster || []).length}`);
  Game.recordCrime('theft', { kcal: 500 });
  Game.exilePlayer('moot');
  drain('exile narration');

  console.log('\n> try to found immediately:');
  console.log('  foundHaven():', Game.foundHaven());
  drain('refusal');
  console.log('  missing:', JSON.stringify(Game.foundingMissing()));

  console.log('\n> the project, step by step:');
  Game.exileSelfDo('claimsite'); drain('claim site');
  Game.addWood(100);
  Game.exileSelfDo('buildshelter'); drain('lean-to');
  Game.exileSelfDo('buildshelter'); drain('hut');
  Game.state.scholar.day = Game.state.scholar.exileStartDay + 7;
  const v = Game.state.village; v.pack = v.pack || {};
  v.pack[pid] = { day: Game.state.scholar.day, kcal: 12000 };
  Game.exileSelfDo('cachefood'); Game.exileSelfDo('cachefood'); Game.exileSelfDo('cachefood'); Game.exileSelfDo('cachefood');
  drain('caching');
  console.log('  missing now:', JSON.stringify(Game.foundingMissing()));

  console.log('\n> FOUND IT:');
  console.log('  foundHaven():', Game.foundHaven());
  drain('fork narration');
  const nv = Game.state.village;
  console.log(`  new haven: ${nv.name} (day ${nv.day}), roster ${(nv.roster || []).length}, shelter ${nv.buildingType}`);
  console.log(`  archived: ${(Game.state.pastVillages || []).map(x => x.name).join(', ')}`);
  console.log(`  exiled=${Game.state.scholar.exiled} foundedHaven=${Game.state.scholar.foundedHaven} pack items=${(Game.state.scholar.inventory || []).length}`);

  console.log('\n\n================ JOIN ARC ================');
  await Game.init();
  Game.debugScenario('day1');
  const pid2 = Game.villagerId;
  Game.exilePlayer('moot');
  said = [];
  if (!Game.state.otherVillages || !Game.state.otherVillages.length) Game.genVillages();
  const ovs = Game.state.otherVillages;
  const home = ovs.find(x => Game.villageRoom(x) > 0);
  console.log(`petitioning ${home.name} (room ${Game.villageRoom(home)})`);
  Game.state.codex.skills = { read_people: { level: 3 } };
  const v2 = Game.state.village; v2.pack = v2.pack || {};
  v2.pack[pid2] = { day: Game.state.scholar.day, kcal: 3000 };
  console.log('  petition:', Game.petitionVillage(home.id, { giftKcal: 1500 }));
  drain('petition narration');
  console.log(`  joinedVillage=${Game.state.scholar.joinedVillage} probation=${JSON.stringify(Game.state.scholar.probation)} trust=${home.trust} pop=${home.population}`);

  console.log('\n> a meal at their fire:');
  Game.map.px = home.x; Game.map.py = home.y;
  home.pantryKcal = 5000;
  Game.state.scholar.kcal = 0;
  Game.villageMeal();
  drain('probation meal');
  console.log(`  scholar kcal after meal: ${Math.round(Game.state.scholar.kcal)}`);

  console.log('\n> serve the 14 days, earn trust:');
  home.trust = 20;
  Game.state.scholar.probation.daysLeft = 1;
  Game.probationTick();
  drain('day-14 vote');
  console.log(`  probation=${JSON.stringify(Game.state.scholar.probation)} joined=${Game.state.scholar.joinedVillage} exiled=${Game.state.scholar.exiled}`);

  console.log('\n> the failed-probation branch:');
  const home2 = ovs.find(x => x.id !== home.id && Game.villageRoom(x) > 0) || home;
  Game.state.scholar.probation = { villageId: home2.id, daysLeft: 1 };
  Game.state.scholar.joinedVillage = home2.id;
  home2.trust = 5;
  Game.map.px = home2.x; Game.map.py = home2.y;
  Game.probationTick();
  drain('rejection');
  console.log(`  joined=${Game.state.scholar.joinedVillage} exiled=${Game.state.scholar.exiled} drifting=${Game.state.scholar.drifting}`);
})();
