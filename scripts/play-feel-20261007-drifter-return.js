#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06), DRIFTER run 5 — "the long way home".
// NEW territory: the READMISSION arc (membership.js, landed 2026-10-07, never
// played as a player). Exile -> road (roadDaily pack-only survival) ->
// petition the old village -> readmission or honest refusal.
// Two scenarios:
//   A: paid amends before exile (confrontation reparations for real food) ->
//      16 road days -> seekReadmission. The designed arc: does it feel earned?
//   B: fled with 0 amends -> road -> petition. Amends are unearnable on the
//      road — the arc is permanently unmeetable. Honest? Good design?
// Played as a player, judged like a player. Run: node scripts/play-feel-20261007-drifter-return.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs it at load)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let rngState = 7707 >>> 0;
const realRandom = Math.random;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

const says = [];
const osay = Game.say.bind(Game), osys = Game.sysSay.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
Game.sysSay = (t) => { says.push('[SYS] ' + String(t)); return osys(t); };
function note(t) { console.log(t); }
function flush(tag, max = 12) {
  for (const t of says.splice(0).slice(0, max)) note(`   | ${tag} ${String(t).slice(0, 180)}`);
}
function giveFood(kcalEach, units, name) {
  Game.state.scholar.inventory.push({ name: name || 'Trail ration', kcalEach, units, spoilDay: 9999, safe: true, kg: 0.2, unit: 'pack', edible: true, foodState: 'ready', foodKind: 'plant' });
}
function invKcal() {
  return Game.state.scholar.inventory.reduce((t, i) => t + ((i.kcalEach || 0) > 0 && (i.units || 0) > 0 ? (i.units || 0) * (i.kcalEach || 0) : 0), 0);
}
function vstate(label) {
  const s = Game.state.scholar;
  note(`   [${label}] day=${s.day} kcal=${Math.round(s.kcal || 0)} hp=${Math.round(s.health || 0)} exiled=${!!s.exiled} inv=${invKcal()}kcal`);
}

async function scenarioA() {
  note('\n==================== SCENARIO A: the one who paid ====================');
  note('Theft -> confrontation -> pay real reparations -> moot exiles anyway -> road -> return');
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.village.day = 15;
  Game.state.village.trust[Game.villagerId] = 30;
  s.kcal = 3200; s.health = 100;
  giveFood(400, 30, 'Dried venison');
  giveFood(300, 20, 'Parched corn');
  const road = [];
  giveFood(350, 80, 'Smoked fish'); // road food: 28000 kcal
  vstate('setup');

  // --- earn amends: steal from the commons, get confronted, pay ---
  note('\n== the crime ==');
  Game.recordCrime('theft', { victim: 'commons', witnessed: true });
  Game.recordCrime('theft', { victim: 'commons', witnessed: true });
  for (let d = 0; d < 3 && !Game.over; d++) { says.length = 0; try { Game.endDay(); } catch (e) { note('ENDDAY: ' + e.message); } }
  flush('justice-ladder');
  const j = Game.justiceState();
  note(`   stage=${j.stage} heat=${Game.justiceHeat()} pending=${!!j.pendingConfront} by=${j.confrontedBy || 'none'}`);
  if (j.pendingConfront && j.confrontedBy) {
    const owed = Game.justiceRestitutionOwed();
    note(`   owed=${owed} inv=${invKcal()}kcal — paying like a player who wants to stay`);
    Game.justiceRespond('pay');
    flush('pay');
    note(`   amendsCredit=${Game.justiceState().amendsCredit} stage=${Game.justiceState().stage}`);
  } else {
    note('   !! no confrontation offered — amends path never opened (BUG CANDIDATE)');
  }

  // --- the moot exiles anyway ---
  note('\n== exile ==');
  Game.exilePlayer('moot');
  flush('exile');
  const a0 = Game.exileArcState();
  note(`   arc stage=${a0.stage} amendsCredit=${Game.justiceState().amendsCredit} severed=${!!(Game.state.village.severed || {})[Game.villagerId]}`);
  vstate('exiled');

  // --- early petition: should be refused, honestly itemized ---
  note('\n== petition at day 3 (too soon) ==');
  for (let d = 0; d < 3 && !Game.over; d++) { says.length = 0; try { Game.endDay(); } catch (e) { note('ENDDAY: ' + e.message); } }
  const conds = Game.readmissionConditions();
  note('   conditions: ' + conds.map(c => (c.met ? '[met] ' : '[UNMET] ') + c.label.split(' — ')[0]).join(' | '));
  const early = Game.seekReadmission();
  flush('early-petition');
  note(`   seekReadmission -> ${early} (expect false, honest refusal)`);

  // --- the long road ---
  note('\n== the road (to day 16 out) ==');
  for (let d = 0; d < 14 && !Game.over; d++) { says.length = 0; try { Game.endDay(); } catch (e) { note('ENDDAY: ' + e.message); } }
  const a = Game.exileArcState();
  note(`   roadDays=${a.roadDays} beats=${(a.roadBeats || []).length} roadExposed=${!!s.roadExposed} stage=${a.stage}`);
  vstate('post-road');
  note('   road beats:');
  for (const b of (a.roadBeats || []).slice(0, 6)) note(`      d${b.day}: ${b.text.slice(0, 90)}`);

  // --- the petition, at last ---
  note('\n== the petition (day 16+) ==');
  const conds2 = Game.readmissionConditions();
  note('   conditions: ' + conds2.map(c => (c.met ? '[met] ' : '[UNMET] ') + c.label.split(' — ')[0]).join(' | '));
  const r = Game.seekReadmission();
  flush('petition');
  note(`   seekReadmission -> ${r}`);
  const a2 = Game.exileArcState();
  note(`   after: exiled=${!!s.exiled} arc=${a2.stage} severed-now=${!!(Game.state.village.severed || {})[Game.villagerId]} codexCut=${!!s.codexCut} roadExposed=${!!s.roadExposed}`);
  vstate('readmitted?');

  // --- does the village still feed its own? ---
  if (r) {
    note('\n== back at the fire ==');
    s.kcal = 500;
    says.length = 0;
    try { Game.takeFromPantry(1200); } catch (e) { note('   takeFromPantry ERROR: ' + e.message); }
    flush('pantry');
    note(`   pantry draw after readmission: kcal=${Math.round(s.kcal || 0)} (exile block lifted?)`);
    const ss = Game.standingSummary();
    note(`   standing: ${JSON.stringify(ss)}`);
  }
  return !Game.over;
}

async function scenarioB() {
  note('\n==================== SCENARIO B: the one who fled ====================');
  note('Fled before the verdict: 0 amends, no way to earn any on the road. Ever.');
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.village.day = 15;
  s.kcal = 3200; s.health = 100;
  giveFood(350, 100, 'Smoked fish');
  Game.exilePlayer('fled');
  says.length = 0;
  note(`   amendsCredit=${Game.justiceState().amendsCredit}`);
  for (let d = 0; d < 20 && !Game.over; d++) { says.length = 0; try { Game.endDay(); } catch (e) { note('ENDDAY: ' + e.message); } }
  const a = Game.exileArcState();
  note(`   20 road days: roadDays=${a.roadDays} alive=${!Game.over} hp=${Math.round(s.health || 0)} inv=${invKcal()}kcal`);
  const conds = Game.readmissionConditions();
  note('   conditions: ' + conds.map(c => (c.met ? '[met] ' : '[UNMET] ') + c.label.split(' — ')[0]).join(' | '));
  const r = Game.seekReadmission();
  flush('fled-petition');
  note(`   seekReadmission -> ${r}`);
  note(`   amends still ${Game.justiceState().amendsCredit}: there is NO road action that earns amends.`);
  return !Game.over;
}

(async () => {
  const a = await scenarioA();
  note(`\nSCENARIO A ${a ? 'SURVIVED' : 'DIED'}`);
  const b = await scenarioB();
  note(`SCENARIO B ${b ? 'SURVIVED' : 'DIED'}`);
  note('\nDONE.');
  Math.random = realRandom;
  process.exit(0);
})().catch(e => { console.error('CRASH:', e.message, e.stack && e.stack.split('\n')[1]); process.exit(1); });
