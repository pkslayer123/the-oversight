// Drifter archetype playtest (2026-10-07 run).
// Travel far, distant villages, catch-up simulation, return.
// Questions:
//  - Do traveler rumors ever arrive BEFORE first approach? (rumor roll lives in
//    simVillageDay, which only runs inside catchUpSim/tickJoinedVillage.)
//  - catchUpSim feel: arrive at a village on day ~12; do they have history
//    (news with NAMES: "Mara had a baby") or numbers?
//  - Road feel: travel cost, encounters, safe-tile villages.
//  - Return: what's home been doing while you were gone?
// Seeded mulberry32 (default 20261007, SEED env override). Exits nonzero on failure.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only

const SCRIPTS = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of SCRIPTS) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`FAILED loading ${f}: ${e.message}`); process.exit(2); }
}
delete global.window;

const Game = globalThis.Scattering.Game;
let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL: ' + msg); };
const pass = (msg) => console.log('  ok: ' + msg);

const says = [];
const origSay = Game.say.bind(Game);
Game.say = (t, ...a) => { says.push(String(t)); return origSay(t, ...a); };
const sayCount = () => says.length;
const newSays = (since) => says.slice(since);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  pass(`departed day ${Game.state.scholar.day}, pos (${Game.map.px},${Game.map.py})`);

  const villages = Game.state.otherVillages || [];
  if (!villages.length) fail('no distant villages generated');
  const distOf = v => Math.abs(v.x - 4) + Math.abs(v.y - 4);
  villages.sort((a, b) => distOf(b) - distOf(a));
  console.log(`distant villages (${villages.length}):`);
  for (const v of villages) console.log(`  ${v.name} @(${v.x},${v.y}) dist=${distOf(v)} pop=${v.population} generated=${v.generated}`);
  const far = villages[0];

  // ---- PHASE A: idle days at haven. Do rumors arrive before any approach? ----
  // (With the 2026-10-07 rumor fix, endDay now rolls rumors for unvisited villages.)
  let rumorsBefore = 0;
  let myId = Game.villagerId, mantlePasses = 0;
  for (let d = 0; d < 6; d++) {
    const before = Game.state.scholar.day;
    // eat to stay alive; forage once if needed
    try { Game.eat(); } catch (e) {}
    try { Game.endDay(); } catch (e) { fail('endDay threw: ' + e.message); break; }
    const after = Game.state.scholar.day;
    if (Game.villagerId !== myId) { mantlePasses++; myId = Game.villagerId; console.log(`  mantle passed (died) on idle day ${d} — continuing as ${myId}`); }
    else if (after === before) fail(`day did not advance on idle loop ${d}`);
    const rs = (Game.state.scholar.rumors || []).length;
    rumorsBefore = Math.max(rumorsBefore, rs);
  }
  console.log(`idle 6 days at haven: rumors queued = ${rumorsBefore} (scholar day now ${Game.state.scholar.day}, mantle passes ${mantlePasses})`);
  if (rumorsBefore > 0) pass(`traveler rumor arrived BEFORE any approach (${rumorsBefore}) — the fix works`);
  else console.log('  note: no rumor in 6 idle days (chance-based; ~14%/day at dist 5 — try more seeds)');

  // ---- PHASE A2: long-arc probe. What does a village's history look like after
  // 45 days? (white-box: advance the day watermark, run catch-up directly.)
  // The design promise is "when you return after 20 days, you hear 'Mara had a
  // baby' — not 'pop 14->12'." Births need 270 days; what fills news on the
  // game's actual timescale?
  {
    const probe = villages[1];
    const savedDay = Game.state.scholar.day;
    Game.state.scholar.day = savedDay + 40;
    const newsBefore = (probe.news || []).length;
    try { Game.catchUpSim(probe); } catch (e) { fail('long-arc catchUpSim threw: ' + e.message); }
    const living = (probe.roster || []).filter(p => p.alive), dead = (probe.roster || []).filter(p => !p.alive);
    console.log(`--- long-arc probe: ${probe.name} simmed to day ${probe.day} ---`);
    console.log(`  roster: ${living.length} living, ${dead.length} dead, news lines: ${(probe.news || []).length} (was ${newsBefore})`);
    for (const n of (probe.news || []).slice(0, 10)) console.log('    ' + String(n).slice(0, 140));
    if (!(probe.news || []).length) console.log('  FEEL NOTE: 45 days of living produced ZERO news — the news system only records deaths/births; mundane history (weddings, quarrels, roofs raised) does not exist.');
    Game.state.scholar.day = savedDay; // restore; catchUpSim watermark (probe.day) stays honest
  }

  // sanity: villages should be ungenerated until approached (excluding the probe village)
  if (villages.some(v => v.generated && v.id !== villages[1].id)) fail('a village got generated without approach');

  // ---- PHASE B: the road. Step node-by-node toward the farthest village. ----
  const preRoadRumorsForTarget = (Game.state.scholar.rumors || []).filter(r => r.villageId === target.id).length;
  const stepToward = (tx, ty) => {
    const cands = Game.travelTargets();
    // pick the reachable tile minimizing manhattan distance to target
    let best = null, bd = 1e9;
    for (const c of cands) {
      const dd = Math.abs(c.x - tx) + Math.abs(c.y - ty);
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  };
  let roadDays = 0, roadSteps = 0, encounters = 0, roadSaysStart = sayCount();
  const target = far;
  const GUARD = 60;
  while ((Math.abs(Game.map.px - target.x) + Math.abs(Game.map.py - target.y) > 0) && roadSteps < GUARD) {
    const nx = Game.map.px, ny = Game.map.py;
    const step = stepToward(target.x, target.y);
    if (!step) { fail(`no travel target from (${nx},${ny}) toward (${target.x},${target.y})`); break; }
    const wasFighting = !!Game.tbfight;
    try { Game.travelTo(step.x, step.y); } catch (e) { fail(`travelTo threw: ${e.message}`); break; }
    roadSteps++;
    if (Game.tbfight && !wasFighting) { encounters++; console.log(`  road encounter at (${step.x},${step.y})`); }
    // player-real pacing: 2 road legs a day, eat, then sleep into next day
    if (roadSteps % 2 === 0) {
      try { Game.eat(); } catch (e) {}
      try { Game.endDay(); } catch (e) { fail('road endDay threw: ' + e.message); break; }
      roadDays++;
    }
  }
  pass(`road: ${roadSteps} legs, ${roadDays} days on the road, ${encounters} encounters, pos (${Game.map.px},${Game.map.py})`);
  const arrived = (Math.abs(Game.map.px - target.x) + Math.abs(Game.map.py - target.y) === 0);
  if (!arrived) fail(`did not reach ${target.name}; stopped at (${Game.map.px},${Game.map.py})`);
  const approachSays = newSays(roadSaysStart).filter(s => /smoke on the horizon|Traveler passed/i.test(s));
  console.log('--- approach lines ---');
  for (const s of approachSays.slice(0, 4)) console.log('  ' + s.slice(0, 220));
  if (!approachSays.some(s => /smoke on the horizon/i.test(s))) fail('no "smoke on the horizon" first-sight line');

  // ---- PHASE C: the village has lived. Read its history. ----
  const v = Game.state.otherVillages.find(x => x.id === target.id);
  console.log(`--- ${v.name} after catch-up ---`);
  console.log(`  simmed days: ${v.day}, population: ${v.population}, pantry: ${Math.round(v.pantryKcal || 0)} kcal`);
  console.log(`  focus: ${(v.knowledgeProfile || {}).focus || '?'}, codex plants: ${Object.keys((v.knowledgeProfile || {}).plants || {}).length}`);
  const roster = v.roster || [];
  const living = roster.filter(p => p.alive), dead = roster.filter(p => !p.alive);
  console.log(`  roster: ${living.length} living, ${dead.length} dead`);
  if (!roster.length) fail('no roster generated — deaths have no names');
  else pass(`roster generated: ${living.length} living of ${roster.length}`);
  for (const d of dead.slice(0, 5)) console.log(`  💀 ${d.name}, ${d.cause}, day ${d.deathDay}`);
  console.log(`  news (${(v.news || []).length}):`);
  for (const n of (v.news || []).slice(0, 8)) console.log('    ' + n.slice(0, 160));
  const rumors = Game.state.scholar.rumors || [];
  console.log(`  rumors queued total: ${rumors.length}`);
  for (const r of rumors.slice(0, 4)) console.log('    RUMOR: ' + String(r.text).slice(0, 160));
  if (preRoadRumorsForTarget > 0) pass(`heard about ${v.name} from a traveler BEFORE walking there (${preRoadRumorsForTarget} rumor(s)) — design intent restored`);
  // every news line should name someone, not a number
  const numOnly = (v.news || []).filter(n => !/\b[A-Z][a-z]+\b/.test(n.replace(/[💀👶🕯️]/g, '')));
  if (numOnly.length) console.log(`  note: ${numOnly.length} news lines without a name: ${numOnly[0].slice(0,80)}`);
  else pass('news lines all name people (death has names)');

  // study their codex
  const beforePlants = Object.keys(Game.state.codex.plants || {}).length;
  let studyRes = '';
  try { studyRes = Game.studyVillageCodex(v.id); } catch (e) { studyRes = 'THREW: ' + e.message; }
  const afterPlants = Object.keys(Game.state.codex.plants || {}).length;
  console.log(`  studyVillageCodex: ${String(studyRes).split('\n').length} lines, codex plants ${beforePlants} → ${afterPlants}`);
  if (String(studyRes).startsWith('THREW')) fail(studyRes);
  if (afterPlants <= beforePlants) console.log('  note: learned nothing new from their codex (all overlap — fine on one seed)');

  // ---- PHASE D: return home. What's home been doing? ----
  const homeDay0 = Game.state.scholar.day;
  const homeKcal0 = (Game.state.village || {}).pantryKcal;
  let rSteps = 0;
  while ((Game.map.px !== 4 || Game.map.py !== 4) && rSteps < GUARD) {
    const step = stepToward(4, 4);
    if (!step) { fail('no travel target on return'); break; }
    try { Game.travelTo(step.x, step.y); } catch (e) { fail('return travelTo threw: ' + e.message); break; }
    rSteps++;
    if (rSteps % 2 === 0) { try { Game.eat(); } catch (e) {} try { Game.endDay(); } catch (e) {} }
  }
  const daysGone = Game.state.scholar.day - homeDay0;
  pass(`returned home: ${rSteps} legs over ${daysGone} days, scholar day ${Game.state.scholar.day}`);
  if (Game.map.px !== 4 || Game.map.py !== 4) fail('did not make it home');
  const hv = Game.state.village || {};
  console.log(`  home: pop=${hv.population}, pantry=${Math.round(hv.pantryKcal || 0)} kcal (was ${Math.round(homeKcal0 || 0)})`);

  // ---- PHASE E: re-approach check — does the village keep living after you leave? ----
  const vDayAtLeave = v.day;
  try { Game.endDay(); } catch (e) {}
  const vDayAfter = v.day;
  console.log(`  village day at leave: ${vDayAtLeave}, after one home day: ${vDayAfter}`);
  if (vDayAfter !== vDayAtLeave) console.log('  note: distant village simmed without approach (check whether intended)');
  else pass('distant village froze while away (catch-up on re-approach, per design)');

  console.log(failures ? `\n${failures} FAILURES` : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH: ' + (e && e.stack || e)); process.exit(2); });
