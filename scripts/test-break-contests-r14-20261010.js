// BREAK-IT: CONTESTS round 14 (2026-10-10) — hostile-player attacks on fresh
// ground vs r11 (cheer-trap, dead _cxWin/_cxLose, arena-death hygiene,
// genRoster dead-leak), r12 (held-counter terminals, eligibility panel,
// co-winner share), r13 (ratings-dip dead signal, _cxChance, dead
// broadcastWatching, arena-fled comment).
//
// Canon: docs/CANON.md, docs/CONTESTS.md ("Ineligibility: the gravely
// wounded, the very young/old, and anyone currently exiled" — eligibility
// must be answerable as "who can go, AND WHY", r12).
//
// KILLS this round:
//   K1 — ELIGIBILITY BYPASS at the grab: the countdown's recast keep-path
//        checked isMember() only (roster + alive + not severed) while the
//        CAST checked contestEligible() (alive + member + age 15-72 +
//        hp>20 + at Haven). A contestant mauled overnight (hp 100->8) or
//        gone from Haven KEPT their slot and got televised — the System
//        casting someone its own rules list as OFF THE BOARD. Fix: the
//        keep-path re-checks the FRESH eligible set at resolve time; the
//        newly ineligible get the recast treatment (recast from the living
//        eligible, or cancelled) with the honest r12 off-the-board reason
//        said out loud. Player bar unchanged (battered scholar IS eligible).
//   K2 — REWARD DUPLICATION: _contestEnd had no idempotency — a re-entrant
//        call on the same won ac granted the winner's share (villager) or
//        the alien-loot prize (player) TWICE (proved: pantry 5->6->7 on one
//        ac). The multi-take verdict restores state.activeContest per
//        contestant, so any dup participant / re-entrant terminal re-ran
//        the whole 'won' branch. Fix: ac._prizeGranted per (ac, participant)
//        — one grant per contestant per contest; event records (notability,
//        gossip, favor) stay loud. Sibling: _contestResolveOthers resolves
//        once per ac (ac._othersResolved) — no re-rolled fates, no
//        re-granted co-winner shares.
// HELD (documented, not fixed):
//   - Countdown skips: day jumps (+3) resolve once; pendingContest clears;
//     mid-pending save/load JSON-round-trips and resolves once; dead player
//     at countdown recasts (pinned).
//   - Pool reachability: all 44 pool contests drawable at their eligible
//     wave across seeds; wave gates honest (extreme never at wave 1,
//     gauntlet/siege never below wave 3).
//   - Beat census: all 44 pool ids have Declare/Escalate/Climax/Resolve in
//     CX_BEAT_DEFS; every phase-declared beat resolves (no silent no-ops).
//   - contestPlayable: every pool id returns a real non-empty phase array
//     (no pool contest falls to _contestGeneric).
//
// Usage: node scripts/test-break-contests-r14-20261010.js [SEED]
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
  roster.slice(0, 8).forEach(vid => { Game.state.village.health[vid] = 100; });
  // live-consistent vpOf data for the contestants we touch
  clearLog();
  return roster.slice(0, 10);
}
function castAtDawn(participants) {
  // Build a countdown exactly as fireContest does, then resolve at dawn.
  const s = Game.state.scholar;
  Game.state.pendingContest = {
    contestId: 'pit', participant: participants[0], participants: participants.slice(),
    firesDay: s.day, variant: null,
  };
  Game.state.activeContest = null;
  Game.resolveContest();
  return Game.state.activeContest;
}

// ============ K1a — BEFORE model: the old isMember-only keep-path ============
sec('K1a — BEFORE model: the old keep-path televised the gravely wounded (the break, pinned)');
{
  // Faithful model of the PRE-FIX resolveContest keep-path: isMember() =
  // roster + alive + not severed. A contestant at hp 8 (gravely wounded,
  // <=20 bar — OFF THE BOARD per contestEligible and the r12 panel) keeps
  // their slot because isMember() doesn't check wounds.
  function oldKeepPath(who) {
    const v = Game.state.village;
    if (who === 'player') return true;
    if ((v.severed || {})[who]) return false;
    if ((v.roster || []).indexOf(who) < 0) return false;
    try { const vp = Game.vpOf(who); if (vp && vp.dead) return false; } catch (e) {}
    return true; // wounds, age, distance — unchecked
  }
  freshGame(15);
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0];
  Game.state.village.health[V] = 8;
  const keptByOldRule = oldKeepPath(V);
  const inEligible = Game.contestEligible().eligible.some(e => e.id === V);
  const offBoardReason = (Game.contestEligible().ineligible.find(e => e.id === V) || {}).reason;
  ok('BEFORE: old rule keeps the gravely-wounded contestant', keptByOldRule === true);
  ok('BEFORE: same contestant is NOT in the fresh eligible set', inEligible === false);
  ok('BEFORE: the panel calls them off the board', offBoardReason === 'gravely wounded', offBoardReason);
}

// ============ K1b — AFTER: wounded contestant recast with honest reason ============
sec('K1b — AFTER: gravely-wounded contestant is recast at the grab, reason said out loud');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0], W = roster[1];
  Game.state.village.health[V] = 8; // mauled overnight
  rng.reset(SEED);
  const ac = castAtDawn([V]);
  const parts = (ac && ac.participants) || [];
  ok('show still goes on (countdown is a promise)', !!ac, 'no activeContest');
  ok('wounded contestant does NOT keep the slot', !parts.includes(V), JSON.stringify(parts));
  ok('recast announced with the honest reason',
    sysLines.some(l => l.includes('was going to take') && l.includes('gravely wounded')),
    sysLines.filter(l => l.includes('was going to take')).join(' | '));
  ok('replacement is a living eligible', parts.length === 1 && Game.contestEligible().eligible.some(e => e.id === parts[0]), JSON.stringify(parts));
}

// ============ K1c — AFTER: away-from-Haven contestant recast ============
sec('K1c — AFTER: contestant gone from Haven overnight is recast');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0];
  // Live-consistent "away": no grid position, nodePos off the Haven node.
  delete Game.state.village.positions[V];
  Game.state.village.nodePos = Game.state.village.nodePos || {};
  Game.state.village.nodePos[V] = { nx: 9, ny: 9 };
  Game.state.village.px = 4; Game.state.village.py = 4;
  const reason = (Game.contestEligible().ineligible.find(e => e.id === V) || {}).reason;
  ok('setup: contestant reads as away from Haven', reason === 'away from Haven', reason);
  rng.reset(SEED);
  const ac = castAtDawn([V]);
  const parts = (ac && ac.participants) || [];
  ok('away contestant does NOT keep the slot', !parts.includes(V), JSON.stringify(parts));
  ok('recast announced with the honest reason',
    sysLines.some(l => l.includes('was going to take') && l.includes('away from Haven')),
    sysLines.filter(l => l.includes('was going to take')).join(' | '));
}

// ============ K1d — dead player at countdown: recast, no corpse televised ============
sec('K1d — dead player at countdown: recast to the living, show goes on');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.scholar.health = 0; // the scholar died overnight
  rng.reset(SEED);
  const ac = castAtDawn(['player']);
  const parts = (ac && ac.participants) || [];
  ok('show goes on (unavoidable)', !!ac, 'no activeContest');
  ok('dead player is not televised', !parts.includes('player'), JSON.stringify(parts));
  ok('replacement is a living villager', parts.length === 1 && parts[0] !== 'player'
    && Game.contestEligible().eligible.some(e => e.id === parts[0]), JSON.stringify(parts));
  Game.state.scholar.health = 100;
}

// ============ K1e — healthy contestants keep slots (no recast churn) ============
sec('K1e — healthy contestants keep their slots (no spurious recast)');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0], W = roster[1];
  rng.reset(SEED);
  const ac = castAtDawn([V, W]);
  const parts = (ac && ac.participants) || [];
  ok('both healthy contestants keep slots', parts.includes(V) && parts.includes(W), JSON.stringify(parts));
  ok('no recast chatter for a clean grab', !sysLines.some(l => l.includes('was going to take')));
}

// ============ K1f — battered player still castable (canon: the System is not kind) ============
sec('K1f — battered (not dead) player keeps the slot');
freshGame(15);
{
  Game.state.scholar.health = 12; // battered, but alive
  rng.reset(SEED);
  const ac = castAtDawn(['player']);
  const parts = (ac && ac.participants) || [];
  ok('battered player keeps the slot', parts.includes('player'), JSON.stringify(parts));
  Game.state.scholar.health = 100;
}

// ============ K1g — nobody left: honest cancellation ============
sec('K1g — no living eligible left: the show is cancelled out loud');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0];
  // Everyone but V is dead; V is gravely wounded -> no recast candidates.
  // The player must be out too, or the show correctly takes YOU instead.
  const v = Game.state.village;
  Game.state.scholar.health = 0; // the scholar died overnight as well
  roster.forEach(id => { if (id !== V) { try { const vp = Game.vpOf(id); if (vp) vp.dead = true; } catch (e) {} } });
  v.health[V] = 5;
  rng.reset(SEED);
  const ac = castAtDawn([V]);
  ok('no activeContest when no one is left', !ac, 'activeContest=' + JSON.stringify(ac && ac.participants));
  ok('cancellation said out loud', sysLines.some(l => l.includes('no one left to take instead')), sysLines.join(' | ').slice(0, 300));
}

// ============ K2a — double _contestEnd: prize granted ONCE ============
sec('K2a — REWARD DUPLICATION: re-entrant _contestEnd grants the winner\'s share once');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0];
  sysLines = [];
  const ac = { contestId: 'pit', participant: V, participants: [V], others: [], phase: 'watching', phaseIdx: 0, phases: [], variant: null, wounds: 0 };
  const pantryBefore = (Game.state.village.pantry || []).length;
  Game.state.activeContest = ac;
  Game._contestEnd(ac, 'won', true);
  const after1 = (Game.state.village.pantry || []).length;
  Game.state.activeContest = ac; // verdict-loop-style restore, hostile re-entry
  Game._contestEnd(ac, 'won', true);
  const after2 = (Game.state.village.pantry || []).length;
  ok('first win grants exactly one share', after1 === pantryBefore + 1, `${pantryBefore}->${after1}`);
  ok('re-entrant win grants NOTHING more', after2 === after1, `${after1}->${after2}`);
  ok('share line said once', sysLines.filter(l => l.includes("winner's share")).length === 1,
    sysLines.filter(l => l.includes("winner's share")).length + ' share lines');
}

// ============ K2b — multi-winner parity: two different winners each get one share ============
sec('K2b — the guard is per (ac, participant): two real winners each get their share');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0], W = roster[1];
  sysLines = [];
  const ac = { contestId: 'pit', participant: V, participants: [V, W], others: [], phase: 'watching', phaseIdx: 0, phases: [], variant: null, wounds: 0 };
  const pantryBefore = (Game.state.village.pantry || []).length;
  Game.state.activeContest = ac;
  Game._contestEnd(ac, 'won', true); // verdict loop: participant = V
  ac.participant = W; // verdict loop mutates per contestant
  Game.state.activeContest = ac;
  Game._contestEnd(ac, 'won', true); // W wins too
  const after = (Game.state.village.pantry || []).length;
  ok('two winners → two shares (r12 co-winner parity intact)', after === pantryBefore + 2, `${pantryBefore}->${after}`);
}

// ============ K2c — _contestResolveOthers double-call resolves once ============
sec('K2c — _contestResolveOthers is idempotent per ac');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0];
  sysLines = [];
  const ac = { contestId: 'pit', participant: 'player', participants: ['player', V], others: [V], phase: 'intro', phaseIdx: 0, phases: [], variant: null, wounds: 0 };
  rng.reset(SEED);
  Game._contestResolveOthers(ac);
  const lines1 = sysLines.length;
  rng.reset(SEED);
  Game._contestResolveOthers(ac);
  const lines2 = sysLines.length;
  ok('second call is a no-op', lines2 === lines1, `${lines1}->${lines2}`);
  ok('guard flag set', ac._othersResolved === true);
}

// ============ K3a — day jump: pending contest resolves exactly once ============
sec('K3a — COUNTDOWN SKIP: sleeping through days resolves the pending contest once');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0];
  sysLines = [];
  Game.state.pendingContest = { contestId: 'pit', participant: V, participants: [V], firesDay: 16, variant: null };
  // The player sleeps 3 days. Dawn loop (game.js): each dawn checks
  // day >= firesDay, then contestTick refuses while pending.
  let resolves = 0;
  const origResolve = Game.resolveContest;
  for (let d = 16; d <= 18; d++) {
    Game.state.scholar.day = d;
    const pc = Game.state.pendingContest;
    if (pc && d >= pc.firesDay) { origResolve.call(Game); resolves++; }
  }
  ok('resolved exactly once across 3 dawns', resolves === 1, 'resolves=' + resolves);
  ok('pendingContest cleared', Game.state.pendingContest === null);
  ok('interruption landed', !!Game.state.activeContest);
}

// ============ K3b — save/load mid-pending: JSON round-trip, still resolves once ============
sec('K3b — mid-countdown save/load: pendingContest survives the round-trip, resolves once');
freshGame(15);
{
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const V = roster[0];
  Game.state.pendingContest = { contestId: 'pit', participant: V, participants: [V], firesDay: 16, variant: null };
  // Faithful save/load: the pending object is plain data.
  const snap = JSON.parse(JSON.stringify(Game.state.pendingContest));
  Game.state.pendingContest = null; // "reload"
  Game.state.pendingContest = snap;
  ok('pendingContest JSON-round-trips intact', Game.state.pendingContest.contestId === 'pit'
    && Game.state.pendingContest.participants[0] === V && Game.state.pendingContest.firesDay === 16);
  Game.state.scholar.day = 16;
  rng.reset(SEED);
  Game.resolveContest();
  ok('resolves after load', !!Game.state.activeContest);
  ok('pendingContest cleared after resolve', Game.state.pendingContest === null);
}

// ============ K4 — DEAD CODE: every pool contest is drawable at its eligible wave ============
sec('K4 — DEAD CODE: pool reachability — every contest drawable, gates honest');
{
  const pool = Game.contestPool();
  ok('pool is live data (44 contests)', pool.length === 44, 'len=' + pool.length);
  const realWave = Game.unlockedWave;
  const draws = {};
  function sweep(wave, n) {
    Game.unlockedWave = () => wave;
    for (let i = 0; i < n; i++) {
      rng.reset(SEED + i * 7919 + wave * 131);
      const c = Game.pickContest();
      if (c && c.id) draws[c.id] = draws[c.id] || {};
      if (c && c.id) draws[c.id][wave] = (draws[c.id][wave] || 0) + 1;
    }
  }
  sweep(1, 4000); sweep(5, 4000);
  Game.unlockedWave = realWave;
  const extreme = pool.filter(c => c.risk === 'extreme').map(c => c.id);
  const missing = pool.filter(c => !draws[c.id]).map(c => c.id);
  ok('every pool contest drawn at some eligible wave (8000 draws)', missing.length === 0, 'missing=' + JSON.stringify(missing));
  const extremeAt1 = extreme.filter(id => (draws[id] || {})[1]);
  ok('extreme contests never drawn at wave 1 (gate honest)', extremeAt1.length === 0, JSON.stringify(extremeAt1));
  const siegeAtLow = ['gauntlet', 'siege'].filter(id => (draws[id] || {})[1]);
  ok('gauntlet/siege never drawn below wave 3', siegeAtLow.length === 0, JSON.stringify(siegeAtLow));
  const extremeAt5 = extreme.filter(id => (draws[id] || {})[5]);
  ok('extreme contests ARE drawable at wave 5 (not dead content)', extremeAt5.length === extreme.length, JSON.stringify(extremeAt5));
}

// ============ K5 — DEAD CODE: beat census — no silent no-ops for pool contests ============
sec('K5 — DEAD CODE: every pool contest has its 4 phase beats; every declared beat resolves');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js', 'contests.js'), 'utf8');
  const pool = Game.contestPool();
  const missingBeats = [];
  for (const c of pool) {
    for (const kind of ['Declare', 'Escalate', 'Climax', 'Resolve']) {
      const name = Game._cxB(c.id, kind);
      // CX_BEAT_DEFS keys appear in source as "<name>: [" 
      if (!src.includes(name + ':')) missingBeats.push(name);
    }
  }
  ok('all 44 pool contests have Declare/Escalate/Climax/Resolve in CX_BEAT_DEFS', missingBeats.length === 0, 'missing=' + JSON.stringify(missingBeats.slice(0, 8)));
  // Every beat declared on any playable phase must resolve too.
  const declared = new Set();
  for (const c of pool) {
    let phases = null;
    try { phases = Game.contestPlayable(c); } catch (e) {}
    (phases || []).forEach(p => { if (p && p.beat) declared.add(p.beat); });
  }
  const unresolvable = [...declared].filter(b => !src.includes(b + ':'));
  ok('every phase-declared beat resolves in CX_BEAT_DEFS (' + declared.size + ' beats)', unresolvable.length === 0, 'missing=' + JSON.stringify(unresolvable));
}

// ============ K6 — contestPlayable: every pool contest returns a real sequence ============
sec('K6 — every pool contest is playable (non-empty phases, none fall to generic)');
{
  const pool = Game.contestPool();
  const bad = [];
  for (const c of pool) {
    let phases = null;
    try { phases = Game.contestPlayable(c); } catch (e) { bad.push(c.id + ':throws'); continue; }
    if (!phases || !phases.length) bad.push(c.id + ':empty');
  }
  ok('all 44 pool contests return non-empty phase arrays', bad.length === 0, JSON.stringify(bad));
}

console.log(`\n==== r14: ${pass} passed, ${fail} failed (seed ${SEED}) ====`);
if (failures.length) { console.log('failures:'); failures.forEach(f => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
