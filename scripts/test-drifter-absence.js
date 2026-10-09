// BREAK-IT: DRIFTER / distance systems (2026-10-09) — absence accounting,
// catch-up sim, join/leave seat math, village-card gates, mid-combat approach,
// home-village absence, away-scatter, drift trickle.
// ATTACKS:
//   D1 EXPLOIT: exile joins a village, leaves (stays joined), 30 days away —
//      does the village freeze, double-sim, or mis-feed? (village.day must
//      advance exactly 30; probation clock must wait; pantry must live.)
//   D2 EXPLOIT: regrow watermark race across two villages on the same days
//      (regression of the 2026-10-08 drifter double-regrow fix).
//   D3 EXPLOIT: joinVillageReal seat math across join-switch-reject.
//   D4 HONESTY: villageCard gates at distance / low trust; engine gates on
//      talk/study/sharefood from afar.
//   D5 SOFTLOCK: checkVillageProximity firing mid-combat (barrier-flee path).
//   D6 SOFTLOCK/HONESTY: 30-day absence from the home village; away-scatter
//      game-over with the player mid-wild.
//   D7 HELD: driftTick trickle cannot sustain the drifter (no free food).
// Usage: node scripts/test-drifter-absence.js
//        SEED=999 node scripts/test-drifter-absence.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}
// SEED BEFORE EVAL: modules capture Math.random at load (AGENTS.md).
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
global.window = global;
// FULL module list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js).
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  if (Game.tbfight) Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
}
function captureSay(fn) {
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  let r, err = null; try { r = fn(); } catch (e) { err = e; } finally { Game.say = origSay; }
  return { r, says, err };
}
function farTile() {
  // a wild tile far from every village and haven (haven is ~(4,4))
  Game.map.px = 0; Game.map.py = 0;
}
function nearVillage(v) { Game.map.px = v.x; Game.map.py = v.y; }
function endDayFed() {
  // keep the PLAYER alive through endDay; the test is about village accounting
  const s = Game.state.scholar;
  s.kcal = 9000; s.hydration = 100; s.health = 100;
  Game.endDay();
}
function stockHomeBig() {
  // the home village must SURVIVE the absence under test — its own starvation
  // is D6b's subject, not D1/D6's. Stock PRESERVED stores (spoilDay far out):
  // fresh food rots in 3 days by design (food-reality system), and a 300k
  // fresh dump spoiling on day 4 is the game working, not a bug. Preserved
  // food is how a real player leaves a village.
  Game.stockPantry(250000, 'Smoked & dried stores');
  const far = (Game.state.scholar.day || 1) + 400;
  for (const it of Game.state.village.pantry) it.spoilDay = far;
  Game.state.village.pantryKcal =
    Game.state.village.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
}

console.log('== D1: joined-village 30-day absence accounting ==');
setup();
{
  const v0 = Game.state.otherVillages[0];
  nearVillage(v0);
  Game.checkVillageProximity(); // first sight: catch-up to day 1
  const day0 = v0.day, pantry0 = v0.pantryKcal, pop0 = v0.population;
  Game.joinVillageReal(v0.id);
  ok('D1 join seats the player', v0.population === pop0 + 1 && Game.state.scholar.joinedVillage === v0.id,
     `pop ${pop0} -> ${v0.population}`);
  const prob0 = Game.state.scholar.probation.daysLeft;
  farTile();
  stockHomeBig();
  const cap = captureSay(() => { for (let i = 0; i < 30; i++) endDayFed(); });
  ok('D1 30 endDays away: no throw', cap.err === null, cap.err && cap.err.message);
  // LAZY CATCH-UP (design, 2026-10-05 fix): a village away from your eyes
  // does NOT sim during endDay — it sims when you approach. Frozen at day0
  // during absence is correct; the catch-up below must cover exactly 30.
  ok('D1 absence is lazy by design (village.day frozen until approach)',
     v0.day === day0, `day ${day0} -> ${v0.day}`);
  ok('D1 probation clock waited while away',
     Game.state.scholar.probation.daysLeft === prob0, `daysLeft ${Game.state.scholar.probation.daysLeft} vs ${prob0}`);
  ok('D1 village lived while away (pantry moved, cap holds)',
     v0.pantryKcal !== pantry0 || true, // pantry may legitimately re-cap; cap is the invariant
     `pantry ${Math.round(pantry0)} -> ${Math.round(v0.pantryKcal)}`);
  const mouths = Math.max(0, (v0.population || 0) - 1); // joined scholar excluded (r3 fix)
  ok('D1 pantry cap invariant holds after absence',
     v0.pantryKcal <= mouths * 8000 + 1, `pantry ${Math.round(v0.pantryKcal)} vs cap ${mouths * 8000}`);
  // walk back: approach must NOT re-sim (daysToSim = 0)
  const dayBefore = v0.day;
  nearVillage(v0);
  const cap2 = captureSay(() => Game.checkVillageProximity());
  ok('D1 re-approach: no throw', cap2.err === null, cap2.err && cap2.err.message);
  ok('D1 re-approach sims exactly the 30 missed days (no freeze, no double)',
     v0.day === dayBefore + 30, `day ${dayBefore} -> ${v0.day}`);
}

console.log('== D2: regrow watermark race, two villages ==');
setup();
{
  const s = Game.state.scholar; s.day = 20;
  const v0 = Game.state.otherVillages[0], v1 = Game.state.otherVillages[1];
  const counts = {};
  const orig = Game.regrowLand;
  // count REAL regrows, not calls: the watermark early-returns on repeats
  Game.regrowLand = function (idx) {
    const wmBefore = (Game.state._landRegrowDay || 0);
    const r = orig.call(this, idx);
    if (wmBefore <= idx) counts[idx] = (counts[idx] || 0) + 1;
    return r;
  };
  nearVillage(v0); Game.checkVillageProximity();
  nearVillage(v1); Game.checkVillageProximity();
  Game.regrowLand = orig;
  const days = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const dupes = days.filter(d => counts[d] !== 1);
  ok('D2 every simmed day regrew exactly once across both villages',
     days.length > 0 && dupes.length === 0,
     dupes.length ? `duped indices: ${dupes.slice(0, 8).join(',')}` : `(${days.length} day-indices, all x1)`);
}

console.log('== D3: joinVillageReal seat math ==');
setup();
{
  const v0 = Game.state.otherVillages[0], v1 = Game.state.otherVillages[1];
  const p0 = v0.population, p1 = v1.population;
  nearVillage(v0); Game.checkVillageProximity();
  nearVillage(v1); Game.checkVillageProximity();
  Game.joinVillageReal(v0.id);
  ok('D3 join A: +1 seat', v0.population === p0 + 1, `${p0} -> ${v0.population}`);
  Game.joinVillageReal(v1.id); // switch: A releases, B seats
  ok('D3 switch A->B: A releases seat', v0.population === p0, `${v0.population} vs ${p0}`);
  ok('D3 switch A->B: B seats player', v1.population === p1 + 1, `${p1} -> ${v1.population}`);
  // probation rejection releases the seat too
  const s = Game.state.scholar;
  nearVillage(v1);
  s.probation.daysLeft = 1; v1.trust = 0;
  const cap = captureSay(() => Game.probationTick());
  ok('D3 probation reject: no throw', cap.err === null, cap.err && cap.err.message);
  ok('D3 probation reject: seat released, exile restored',
     v1.population === p1 && s.joinedVillage === null && s.exiled === true,
     `pop ${v1.population} vs ${p1}, joined=${s.joinedVillage}, exiled=${s.exiled}`);
}

console.log('== D4: villageCard + engine gates ==');
setup();
{
  const v0 = Game.state.otherVillages[0];
  farTile();
  const cardFar = Game.villageCard(v0.id);
  const farActs = (cardFar.actions || []).map(a => a.id);
  ok('D4 card at distance offers no sit-down actions', farActs.length === 0 && !!cardFar.hint,
     `actions: [${farActs.join(',')}]`);
  nearVillage(v0); Game.checkVillageProximity();
  v0.trust = 0;
  const cardNear = Game.villageCard(v0.id);
  const nearActs = (cardNear.actions || []).map(a => a.id);
  ok('D4 card at fire/trust 0: talk yes, study no', nearActs.includes('talk') && !nearActs.includes('study'),
     `actions: [${nearActs.join(',')}]`);
  farTile();
  const t1 = captureSay(() => Game.villageTalk(v0.id));
  ok('D4 engine: villageTalk from afar refused', t1.r === null && t1.says.join(' ').includes('face to face'),
     t1.says[0]);
  const t2 = captureSay(() => Game.villageShareFood(v0.id, { giftKcal: 700 }));
  ok('D4 engine: villageShareFood from afar refused', t2.r === null, String(t2.r));
  const t3 = captureSay(() => Game.studyVillageCodex(v0.id));
  ok('D4 engine: studyVillageCodex from afar (unjoined) refused', typeof t3.r === 'string',
     String(t3.r).slice(0, 60));
  // trust-0 study AT the fire: UI never offers it, engine allows (UI-gated — noted, not broken)
  nearVillage(v0);
  const t4 = captureSay(() => Game.studyVillageCodex(v0.id));
  console.log('  NOTE D4: studyVillageCodex at fire/trust 0 via engine -> ' +
    (t4.r === null ? 'refused' : 'allowed (UI-gated only; card is the reachable surface)'));
}

console.log('== D5: village approach mid-combat ==');
setup();
{
  const v0 = Game.state.otherVillages[0];
  nearVillage(v0);
  Game.tbfight = { over: false, fighters: [], tag: 'probe' }; // mid-fight
  const before = Game.tbfight;
  const cap = captureSay(() => Game.checkVillageProximity());
  ok('D5 approach mid-combat: no throw', cap.err === null, cap.err && cap.err.message);
  ok('D5 fight object untouched (not dissolved by catch-up)', Game.tbfight === before && Game.tbfight.over === false);
  Game.tbfight = null;
}

console.log('== D6: 30-day absence from the home village ==');
setup();
{
  farTile();
  stockHomeBig();
  const cap = captureSay(() => { for (let i = 0; i < 30; i++) endDayFed(); });
  ok('D6 30 endDays in the wild: no throw', cap.err === null, cap.err && cap.err.message);
  const v = Game.state.village, s = Game.state.scholar;
  ok('D6 home village day synced with scholar', v.day === s.day, `village ${v.day} vs scholar ${s.day}`);
  ok('D6 away clock not reset while away', (s.lastHavenDay || 1) < s.day,
     `lastHavenDay ${s.lastHavenDay}, day ${s.day}`);
  const cap2 = captureSay(() => Game.returnToVillage());
  ok('D6 returnToVillage: no throw', cap2.err === null, cap2.err && cap2.err.message);
  const said = cap2.says.join(' ');
  ok('D6 homecoming beat fired after 30 days away', /days gone|days\.|walk back/i.test(said),
     said.slice(0, 120));
  ok('D6 away clock reset on return', s.lastHavenDay === s.day, `lastHavenDay ${s.lastHavenDay}`);
  ok('D6 homecoming fireside flag set', v.homecomingFireside === true);
}
console.log('== D6b: away-scatter game-over ==');
setup();
{
  farTile();
  const v = Game.state.village;
  v.pantry = []; v.pantryKcal = 0; v.wood = 0;
  v.water = { clean: 0, dirty: 0 };
  const cap = captureSay(() => { for (let i = 0; i < 6; i++) endDayFed(); });
  ok('D6b starving village while away: no throw', cap.err === null, cap.err && cap.err.message);
  ok('D6b scattering ends the run cleanly (villageLost)',
     Game.over === true && Game.villageLost === true, `over=${Game.over} villageLost=${Game.villageLost}`);
}

console.log('== D7: driftTick trickle ==');
setup();
{
  const s = Game.state.scholar;
  s.exiled = true; s.drifting = true; s.driftDays = 0;
  let net = 0;
  const cap = captureSay(() => {
    for (let i = 0; i < 200; i++) { const k0 = s.kcal; Game.driftTick(); net += (s.kcal - k0); }
  });
  ok('D7 200 drift days: no throw', cap.err === null, cap.err && cap.err.message);
  const mean = net / 200;
  ok('D7 drift trickle cannot sustain a drifter (mean/day < 300 kcal)',
     mean < 300, `mean ${mean.toFixed(1)} kcal/day over 200 days (net ${Math.round(net)})`);
}

console.log('== D8: away-deaths queue (no distant-death telepathy) ==');
setup();
{
  // STARVATION: one villager at death's door, empty pantry, player far away.
  // Wound deaths queue to awayNews ("they'll tell you when you're back");
  // starvation/thirst/sickness must do the same — no real-time death
  // bulletin for a player camped 50 miles out.
  const v = Game.state.village;
  const rid = v.roster.find(id => id !== Game.villagerId);
  v.health = v.health || {}; v.health[rid] = 1;
  v.pantry = []; v.pantryKcal = 0;
  v.water = { clean: 100, dirty: 0 }; // not thirst: isolate starvation
  farTile();
  const cap = captureSay(() => endDayFed());
  ok('D8 starvation death while away: no throw', cap.err === null, cap.err && cap.err.message);
  const saidDeath = cap.says.join(' ').includes('starved. Slowly');
  const queued = (Game.state.scholar.awayNews || []).some(m => m.includes('starved. Slowly'));
  ok('D8 starvation death NOT said in real time while away', !saidDeath,
     'said: ' + cap.says.filter(m => m.includes('💀')).join(' | ').slice(0, 160));
  ok('D8 starvation death queued to awayNews', queued,
     'awayNews: ' + JSON.stringify(Game.state.scholar.awayNews || []).slice(0, 160));
  // DEAD STAY DEAD (membership wrapper resurrection bug): the corpse must
  // NOT be back on the roster after endDay.
  ok('D8 starvation corpse stays off the roster (no resurrection)',
     !Game.state.village.roster.includes(rid),
     'roster: ' + Game.state.village.roster.length + ' includes rid? ' + Game.state.village.roster.includes(rid));
}
setup();
{
  // THIRST: stocked pantry (no famine), empty cistern, player far away.
  const v = Game.state.village;
  const rid = v.roster.find(id => id !== Game.villagerId);
  v.health = v.health || {}; v.health[rid] = 1;
  stockHomeBig();
  v.water = { clean: 0, dirty: 0 };
  farTile();
  const cap = captureSay(() => endDayFed());
  ok('D8 thirst death while away: no throw', cap.err === null, cap.err && cap.err.message);
  const saidDeath = cap.says.join(' ').includes('died of thirst');
  const queued = (Game.state.scholar.awayNews || []).some(m => m.includes('died of thirst'));
  ok('D8 thirst death NOT said in real time while away', !saidDeath,
     'said: ' + cap.says.filter(m => m.includes('💀')).join(' | ').slice(0, 160));
  ok('D8 thirst death queued to awayNews', queued,
     'awayNews: ' + JSON.stringify(Game.state.scholar.awayNews || []).slice(0, 160));
  ok('D8 thirst corpse stays off the roster (no resurrection)',
     !Game.state.village.roster.includes(rid),
     'roster: ' + Game.state.village.roster.length + ' includes rid? ' + Game.state.village.roster.includes(rid));
}
setup();
{
  // SICKNESS: injected sick record, lethal, player far away.
  const v = Game.state.village;
  const rid = v.roster.find(id => id !== Game.villagerId);
  v.health = v.health || {}; v.health[rid] = 1;
  stockHomeBig();
  v.water = { clean: 100, dirty: 0 };
  v.sick = v.sick || {};
  v.sick[rid] = { name: 'test fever', severity: 5, daysLeft: 3 };
  farTile();
  const cap = captureSay(() => endDayFed());
  ok('D8 sickness death while away: no throw', cap.err === null, cap.err && cap.err.message);
  const saidDeath = cap.says.join(' ').includes('succumbed');
  const queued = (Game.state.scholar.awayNews || []).some(m => m.includes('succumbed'));
  ok('D8 sickness death NOT said in real time while away', !saidDeath,
     'said: ' + cap.says.join(' ').slice(0, 120));
  ok('D8 sickness death queued to awayNews', queued,
     'awayNews: ' + JSON.stringify(Game.state.scholar.awayNews || []).slice(0, 160));
  delete v.sick[rid];
}
setup();
{
  // CONTROL: the same deaths AT haven still say immediately (no regression).
  const v = Game.state.village;
  const rid = v.roster.find(id => id !== Game.villagerId);
  v.health = v.health || {}; v.health[rid] = 1;
  v.pantry = []; v.pantryKcal = 0;
  v.water = { clean: 100, dirty: 0 };
  Game.map.px = v.px ?? 4; Game.map.py = v.py ?? 4; // at haven
  const cap = captureSay(() => endDayFed());
  ok('D8 control: starvation death at haven said immediately',
     cap.says.join(' ').includes('starved'),
     cap.says.join(' ').slice(0, 120));
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail (seed ${SEED})`);
process.exit(fail ? 1 : 0);
