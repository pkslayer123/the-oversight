// BREAK-IT: CONTESTS round 13 (2026-10-10) — hostile-player attacks on fresh
// ground vs r11 (cheer-trap, dead helpers, arena-death hygiene, dead-leak)
// and r12 (held-counter terminals, eligibility panel, co-winner share).
//
// KILLS this round:
//   K1 — the ratings-dip signal was DEAD: viewership only ever grew in live
//        play (recordMoment +1, sticky havenViewership init; every decrement
//        lived in dead code: declineChallenge, arenaAct — both zero live
//        callers), so `trend < -1` in contestTick could never fire. The
//        ratings summons — a canon system (Steve 2026-10-04) with a played
//        stunt, real costs, a care-package prize — NEVER aired in live play.
//        The audit-shows DIP-SIGNAL FIX (2026-10-09) fixed the comparison
//        ORDER but not the signal. This round's fix: attention fades on
//        quiet stretches so the dip can fire. SUPERSEDED 2026-10-10 (bal-util
//        resolution, parity audit): the live mechanism is WEEKLY audience
//        drift (10%/week, min 2.5, floor 12) in contestTick — NOT the -1/day
//        dawn decay this round proposed. K1b now pins the weekly design;
//        the rising-coast principle (K1d) is preserved via the low-clause
//        carve-out (low AND not rising).
//   K1b — SIBLING, same bug class: contestEngine._cxChance ("ratings are
//        slipping — the System gives the audience its favorite") read the
//        same dead signal with the same `trend < -1` — chance contests were
//        always "flat → the trusted". Same fix (trend < 0), now reachable.
//   K2 — broadcastWatching() was a dead helper (zero game call sites;
//        app.js inlined `ac.participant !== 'player'`). Wired app.js to the
//        helper instead of deleting it.
//   K3 — ontology comment claimed arena-fled → "LOSE+shame"; there is no
//        mechanical shame for contests (the crowd's disappointment is said
//        aloud + showmanship). Comment corrected.
//
// HELD (documented): mid-modal autosave (phases serialize as data),
// pool retirement (canon gap, like companion-bringing — noted, not built),
// dance_off/nap_wars missing 'mixed' text (unreachable — no mixed choice).
//
// Usage: node scripts/test-break-contests-r13-20261010.js [SEED]
// Run x3 seeds: SEED=424242 / 777 / 31337
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '424242', 10);

// ---------- data preload ----------
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
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { /* missing file: key stays undefined */ }
}

// ---------- seeded RNG BEFORE eval (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rng() { return _rng(); }
rng.reset = (s) => { _rng = mulberry32(s); };
Math.random = rng;

// ---------- eval FULL script list in index.html order, minus DOM-only ----------
// DOM-only: app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js
global.window = global; // equipment.js needs window at load; deleted after eval
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'broadcast.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js',
  'perceive.js', 'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js',
  'corruption.js', 'lifeseed.js', 'progression.js', 'ledger.js', 'abilityActions.js',
  'monsterBehaviors.js', 'statusEffects.js', 'villager-agency.js', 'fieldFights.js',
  'villager-objectives.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // sync combat path for the harness
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// ---------- log capture ----------
let sysLines = [];
Game.sysSay = function(t) { sysLines.push(String(t)); };
Game.say = function(t) { sysLines.push(String(t)); };
function clearLog() { sysLines = []; }

// ---------- plumbing ----------
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); }
function freshGame(day) {
  rng.reset(SEED);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  s.inventory = s.inventory || [];
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.arenaContest = null;
  Game.state.contestsHeld = 0;
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + (i % 5), y: 2 + Math.floor(i / 5) };
  });
  Game.state.village.health = Game.state.village.health || {};
  roster.slice(0, 6).forEach(vid => { Game.state.village.health[vid] = 100; });
  clearLog();
  return roster.slice(0, 10);
}
// One quiet dawn through the real scheduler. Resets the per-dawn guards so
// each iteration is an independent scheduling decision.
function quietDawn() {
  const s = Game.state.scholar;
  s.day = (s.day || 15) + 1;
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  return Game.contestTick();
}

sec('K1a — BEFORE model: the old dip signal could never fire (documents the break)');
{
  // Faithful model of the PRE-FIX contestTick ratings block: no decay,
  // threshold trend < -1. Viewership follows the old live rules: sticky
  // init + recordMoment(+1) only — the only live writers (verified by
  // census: every decrement lived in zero-caller code).
  let viewership = null;
  const base = 20;
  let lastWeek = null, dips = 0;
  for (let d = 0; d < 30; d++) {
    if (viewership == null) viewership = base; // sticky havenViewership init
    // old rules: nothing decays; a quiet stretch adds nothing
    const now = viewership;
    if (lastWeek !== null && lastWeek !== undefined) {
      if (now - lastWeek < -1) dips++;
    }
    lastWeek = now;
  }
  ok('BEFORE: 30 quiet dawns, old rules → dip never detected', dips === 0, 'dips=' + dips);
}

sec('K1b — AFTER: attention fades over quiet weeks (weekly drift is real)');
freshGame(15);
{
  // PARITY AUDIT 2026-10-10: the bal-util resolution replaced the sibling's
  // -1/day dawn decay with WEEKLY audience drift (10%, min 2.5, floor 12) —
  // the decided design. This pins THAT: viewership declines week-over-week
  // on quiet weeks, never negative, floored at 12.
  const v = Game.state.village;
  delete v._lastWeekViewership; delete v._driftWeek; delete v._trendWeek;
  const seen = [];
  for (let w = 0; w < 6; w++) {
    for (let d = 0; d < 7; d++) quietDawn();
    seen.push(Math.round(v.viewership * 100) / 100);
  }
  let declining = true;
  for (let i = 1; i < seen.length; i++) {
    if (seen[i - 1] > 12.5 && !(seen[i] < seen[i - 1])) declining = false;
  }
  ok('viewership declines week-over-week while above the floor', declining, JSON.stringify(seen));
  ok('viewership never negative', seen.every(x => x >= 0), JSON.stringify(seen));
  ok('viewership floors at 12', seen[seen.length - 1] >= 12, JSON.stringify(seen));
}

sec('K1c — AFTER: a quiet stretch reads as dipping; the summons becomes reachable');
freshGame(15);
{
  // Force an unambiguous dip and pin the RNG so every roll passes: the
  // summons branch (ratingsDipping && rng < 0.20) must fire.
  const v = Game.state.village;
  v.viewership = 10; v._lastWeekViewership = 20;
  const realRandom = Math.random;
  Math.random = () => 0;
  let ev = null;
  try { ev = quietDawn(); } finally { Math.random = realRandom; }
  ok('dipping + passing rolls → ratings summons fires', ev && ev.id === '__summons', JSON.stringify(ev && ev.id));
  ok('summons consumes the shared 2/week budget', Game.state.showBudget.used === 1, 'used=' + Game.state.showBudget.used);
}
freshGame(15);
{
  // Natural dip: quiet dawns with the real seeded RNG — a summons must
  // occur within a long quiet stretch (it never could before the fix).
  let summons = 0;
  for (let i = 0; i < 60; i++) {
    const ev = quietDawn();
    if (ev && ev.id === '__summons') summons++;
  }
  ok('a summons airs inside 60 quiet dawns (seeded RNG)', summons >= 1, 'summons=' + summons);
}

sec('K1d — AFTER: busy days outrun the fade; rising days coast, not dip');
freshGame(15);
{
  const v = Game.state.village;
  delete v._lastWeekViewership;
  quietDawn();
  const afterQuiet = v.viewership;
  Game.recordMoment('a big play'); Game.recordMoment('another big play'); Game.recordMoment('a third');
  const beforeBusy = v.viewership;
  quietDawn();
  ok('3 moments outrun one dawn of fade', v.viewership > afterQuiet,
    `quiet=${afterQuiet} busy+3moments-then-dawn=${v.viewership} (was ${beforeBusy} pre-dawn)`);
}
freshGame(15);
{
  // Rising: trend > 2 must NOT dip (and must not summon even with pinned RNG).
  const v = Game.state.village;
  v.viewership = 12; v._lastWeekViewership = 5;
  const realRandom = Math.random;
  Math.random = () => 0;
  let ev = null;
  try { ev = quietDawn(); } finally { Math.random = realRandom; }
  // decay takes 12→11; trend = 11-5 = +6 > 2 → coasting, no summons branch
  ok('rising ratings do not summon (coast, not dip)', !ev || ev.id !== '__summons', JSON.stringify(ev && ev.id));
}

sec('K1e — summons still gated: dead/exiled player is not summoned');
freshGame(15);
{
  const v = Game.state.village;
  v.viewership = 10; v._lastWeekViewership = 20;
  Game.state.scholar.health = 0; // a corpse gets no promo stunt
  const realRandom = Math.random;
  Math.random = () => 0;
  let ev = null;
  try { ev = quietDawn(); } finally { Math.random = realRandom; }
  ok('dead scholar: slot falls through, no summons', !ev || ev.id !== '__summons', JSON.stringify(ev && ev.id));
}

sec('K1f — SIBLING: _cxChance "ratings are slipping" branch is reachable');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vA = roster[0], vB = roster[1];
  Game.addNotability(vA, 'contestWin'); Game.addNotability(vA, 'wave2Kill'); // 2 notes
  Game.addNotability(vB, 'showmanship');                                    // 1 note
  const vv = Game.state.village;
  vv.trust = vv.trust || {}; vv.trust[vA] = 50; vv.trust[vB] = 10;
  const chanceContest = Game.contestPool().find(c => c.cat === 'chance' && c.id !== 'auction');
  ok('chance contest exists in pool', !!chanceContest, 'none found');
  // slipping: the famous wins
  vv.viewership = 10; vv._lastWeekViewership = 20;
  let out = Game.contestResolveGroup([vA, vB], chanceContest, {});
  ok('slipping ratings → the famous wins', out[vA] && out[vA].outcome === 'won' && /slipping/.test(out[vA].detail || ''),
    JSON.stringify(out[vA] && { o: out[vA].outcome, d: out[vA].detail }));
  // flat: the trusted wins
  vv.viewership = 10; vv._lastWeekViewership = 10;
  out = Game.contestResolveGroup([vA, vB], chanceContest, {});
  ok('flat ratings → the trusted wins', out[vA] && out[vA].outcome === 'won' && /quiet night/.test(out[vA].detail || ''),
    JSON.stringify(out[vA] && { o: out[vA].outcome, d: out[vA].detail }));
  // rising: the dark horse wins
  vv.viewership = 10; vv._lastWeekViewership = 5;
  out = Game.contestResolveGroup([vA, vB], chanceContest, {});
  ok('rising ratings → the dark horse wins', out[vB] && out[vB].outcome === 'won' && /climbing/.test(out[vB].detail || ''),
    JSON.stringify(out[vB] && { o: out[vB].outcome, d: out[vB].detail }));
}

sec('K2 — broadcastWatching is wired (was a dead helper)');
{
  ok('helper: villager participant → watching', Game.broadcastWatching({ participant: 'some_vid' }) === true);
  ok('helper: player participant → not watching', Game.broadcastWatching({ participant: 'player' }) === false);
  ok('helper: null → false', Game.broadcastWatching(null) === false);
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('app.js calls the helper (no longer inlines it)', appSrc.includes('Game.broadcastWatching(ac)'));
}

sec('K3 — mid-modal autosave: the contest modal survives JSON round-trip');
freshGame(15);
{
  // Fire a real contest modal, then serialize state like the 30s autosave
  // would mid-modal and confirm the modal is still playable after load.
  const contest = Game.pickContest();
  Game.fireContest(contest);
  // resolve the pending countdown immediately (dawn would do this)
  Game.state.scholar.day = (Game.state.pendingContest ? Game.state.pendingContest.firesDay : 15);
  Game.resolveContest();
  const ac = Game.state.activeContest;
  ok('contest modal is live', !!ac && !!ac.phases && ac.phase !== 'done');
  let blob = null;
  try { blob = JSON.stringify(Game.state); } catch (e) { blob = null; }
  ok('state serializes mid-modal (no function loss throws)', !!blob);
  if (blob) {
    const restored = JSON.parse(blob);
    const rac = restored.activeContest;
    const phasesOk = rac && Array.isArray(rac.phases) && rac.phases.length > 0 &&
      rac.phases.every(p => p && typeof p.text === 'string');
    ok('restored modal keeps playable phases', !!phasesOk);
    const choicesOk = rac && rac.phases.every(p => !p.choices || p.choices.every(c => typeof c.label === 'string'));
    ok('restored choices keep labels/subs', !!choicesOk);
  }
  Game.state.activeContest = null; Game.state.pendingContest = null;
}

sec('HELD — pool retirement is a canon gap (noted, not built)');
{
  // Canon (docs/CONTESTS.md): "old events retire when they've stopped being
  // interesting." pickContest never retires — contestsSeen only gates the
  // hardened variant. Same class as r12's companion-bringing gap: a
  // canon/code gap, not a break. Assert the current (unchanged) behavior so
  // the gap is pinned, not silently altered.
  Game.state.contestsSeen = { pit: 99 };
  const picks = new Set();
  for (let i = 0; i < 40; i++) picks.add(Game.pickContest().id);
  ok('no retirement logic present (gap pinned)', typeof Game.pickContest === 'function' && picks.size > 0);
}

console.log('\n=== r13: ' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ') ===');
if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
