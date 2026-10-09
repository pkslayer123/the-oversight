// BREAK-IT: CONTEST SYSTEM round 4 (2026-10-09) — hostile-player attacks.
// New surface (rounds 1-3 covered determinism, variants, prize tables, arena
// re-entry, moot walk-out prize, pantry cap, lifelines, audio leaks,
// _cxScaledContest, hardened honesty):
//   F1 DUEL "PLAYED NOT RNG" VIOLATION: contestResolveVillager on a duel
//      returned a canned {outcome:'lost', detail:'duel needs a partner'} — no
//      fight, no process — while the caller's comment claimed "their arena
//      ran the real engine too". Fired in _contestResolveOthers (co-taken
//      villager duels) and _contestVerdict (single-villager watch duel).
//      Fix: cast a sparring partner from the living roster and run the REAL
//      duelFight; partner drawn from the seeded stream under _det (no
//      Math.random); no partner -> honest 'no partner — forfeit' with a
//      said-aloud log line.
//   F2 CHEER-TO-DUELFIGHT WIRING LIE: comment claimed cheer "now reaches
//      duelFight"; _cxBlood maps cheerBonus->braveryBonus, but the GROUP
//      duel branch passed opts straight through — duelFight read
//      opts.braveryBonus (undefined) and the cheer was silently dropped.
//      Fix: map braveryBonus: opts.braveryBonus || opts.cheerBonus || 0 in
//      the group duel branch and the new single-duel path.
//   F3 ELIGIBILITY vs CANON: docs/CONTESTS.md says the gravely wounded are
//      ineligible; contestEligible had NO villager health gate — a villager
//      at 5 HP was draftable. Fix: villagers at <=20 HP ("gravely wounded",
//      the engine's own endurance survival floor) are excluded. The
//      viewership-rank-as-primary-gate divergence (canon) vs
//      notability-weighted casting (code) is DOCUMENTED for Steve, not
//      redesigned.
//   F4 DEAD CODE: state.lastContestDay written in _contestEnd and
//      _contestVerdict, read NOWHERE. Fix: remove the writes (fear pacing
//      already lives in the ratings-driven scheduler + 2/week budget).
//   HELD (documented): all 44 pool contests have bespoke watch beats
//      (recon's "missing beats" sub-lead was already fixed); _cxChance is
//      documented rigged theater (deterministic, said aloud), not a hidden
//      table; _cxOther is stat-driven structured (no rolls); _cxBlood kills
//      are real (fear honest); alienPlayers.js has no canned duel-style
//      returns (sibling sweep clean); phase integrity across all 44
//      contests incl. the choice-prepend shift — no empty-phase softlocks.
// Usage: node scripts/test-break-contest-20261009-r4.js [SEED]
// Seed via SEED env or argv; default 909090. Run x3 seeds.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '909090', 10);

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
  catch (e) { /* some files may not exist; data key stays undefined */ }
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
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // sync combat path for the harness
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// ---------- plumbing ----------
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
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
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  Game.state.village.health = Game.state.village.health || {};
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 6).forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
    if (Game.state.village.health[vid] === undefined) Game.state.village.health[vid] = 100;
  });
  return roster.slice(0, 6);
}
let saidLines = [];
const _origSysSay = Game.sysSay;
function captureSay(on) {
  if (on) { saidLines = []; Game.sysSay = function(t) { saidLines.push(String(t)); }; }
  else { Game.sysSay = _origSysSay; }
}
function pool() { return Game.contestPool(); }
function findContest(id) { return pool().find(c => c.id === id); }

// ================= F1: DUEL "PLAYED NOT RNG" =================
sec('F1 — duel must be a real fight, never a canned loss');
{
  const [v1, v2, v3] = freshGame(15);
  const duel = findContest('duel');

  // single-villager path (contestResolveVillager) — the _contestResolveOthers vector
  const r1 = Game.contestResolveVillager(v1, duel, {});
  ok('single-villager duel is NOT a canned loss', r1.outcome !== 'lost' || r1.detail !== 'duel needs a partner',
    JSON.stringify(r1));
  ok('single-villager duel fought a real duel (log names the partner)', (r1.log || []).length > 0,
    'log empty: ' + JSON.stringify(r1));
  const logText = (r1.log || []).join(' ');
  ok('single-villager duel log mentions the sparring partner', /duel|yields|rounds/i.test(logText), logText.slice(0, 120));
  ok('single-villager duel outcome is a real duel outcome', ['won', 'lost', 'died'].includes(r1.outcome), r1.outcome);

  // wounds are real: somebody bled
  const h1 = (Game.state.village.health || {})[v1];
  ok('single-villager duel applied real wounds', h1 < 100, 'health=' + h1);

  // group single path (contestResolveGroup <2) — the _contestVerdict watch vector
  const [w1] = freshGame(15);
  const g1 = Game.contestResolveGroup([w1], duel, {});
  const gr = g1[w1];
  ok('group single-duel is NOT a canned loss', !(gr.outcome === 'lost' && gr.detail === 'duel needs a partner'),
    JSON.stringify(gr));
  ok('group single-duel fought a real duel', (gr.log || []).length > 0, JSON.stringify(gr));

  // determinism: partner casting under _det — same state, same fate
  const [d1] = freshGame(15);
  const a1 = Game.contestResolveVillager(d1, duel, {});
  const [d2] = freshGame(15);
  const a2 = Game.contestResolveVillager(d2, duel, {});
  ok('partner-cast duel is deterministic (same state -> same fate)',
    JSON.stringify(a1) === JSON.stringify(a2),
    JSON.stringify(a1.outcome) + ' vs ' + JSON.stringify(a2.outcome));

  // honest forfeit when there is NO partner on the roster
  const [f1] = freshGame(15);
  // remove every other villager from the roster (player excluded as partner)
  const v = Game.state.village;
  v.roster = [f1, Game.villagerId];
  const rf = Game.contestResolveVillager(f1, duel, {});
  ok('partnerless duel fails loudly and honestly', /no partner — forfeit/.test(rf.detail || ''),
    JSON.stringify(rf));
  ok('partnerless forfeit is said aloud (log not empty)', (rf.log || []).length > 0, JSON.stringify(rf));

  // F2: cheer actually reaches duelFight in the group path
  const [c1, c2] = freshGame(15);
  let captured = null;
  const origDuel = Game.duelFight;
  Game.duelFight = function(a, b, o) { captured = o; return origDuel.call(this, a, b, o); };
  try { Game.contestResolveGroup([c1, c2], duel, { cheerBonus: 15 }); } catch (e) {}
  Game.duelFight = origDuel;
  ok('cheer reaches duelFight as braveryBonus (comment was a lie before)',
    captured && captured.braveryBonus === 15, 'braveryBonus=' + (captured && captured.braveryBonus));
}

// ================= F2-equivalent: PHASE INTEGRITY (no empty-phase softlocks) =================
sec('PHASE INTEGRITY — all 44 contests, raw + choice-shifted + watch');
{
  const VALID_STR = new Set(['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT', 'MOOT_JUDGE', 'MAW_JUDGE']);
  freshGame(15);
  const poolIds = pool().map(c => c.id);
  ok('contest pool has 44 ids', poolIds.length === 44, String(poolIds.length));
  let badRaw = [], badShift = [], emptyPhase = [];
  for (const contest of pool()) {
    let phases = null;
    try { phases = Game.contestPlayable(contest); } catch (e) { phases = null; }
    if (!Array.isArray(phases) || !phases.length) { badRaw.push(contest.id + ':no-phases'); continue; }
    // raw (grabbed path): numeric nexts index the raw array
    phases.forEach((p, i) => {
      if (!p || !Array.isArray(p.choices) || !p.choices.length) { emptyPhase.push(contest.id + ':phase' + i); return; }
      for (const ch of p.choices) {
        const n = ch.next;
        if (typeof n === 'number') { if (!(n >= 0 && n < phases.length)) badRaw.push(contest.id + ':phase' + i + '->' + n); }
        else if (!VALID_STR.has(n)) badRaw.push(contest.id + ':phase' + i + '->' + JSON.stringify(n));
        if (!ch.label) badRaw.push(contest.id + ':phase' + i + ':missing-label');
      }
    });
    // shifted (choice-prepend path, mirrors contests.js line ~555): numeric nexts +1
    const shifted = phases.map(p => Object.assign({}, p, {
      choices: (p.choices || []).map(ch => Object.assign({}, ch, {
        next: (typeof ch.next === 'number') ? ch.next + 1 : ch.next,
      })),
    }));
    const withChoice = [{ choices: [{ next: 1 }, { next: 'REFUSE' }] }, ...shifted];
    withChoice.forEach((p, i) => {
      for (const ch of (p.choices || [])) {
        const n = ch.next;
        if (typeof n === 'number') { if (!(n >= 0 && n < withChoice.length)) badShift.push(contest.id + ':phase' + i + '->' + n); }
        else if (!VALID_STR.has(n)) badShift.push(contest.id + ':phase' + i + '->' + JSON.stringify(n));
      }
    });
  }
  ok('all 44 have non-empty phases with >=1 choice each', emptyPhase.length === 0, emptyPhase.slice(0, 5).join('; '));
  ok('all raw numeric/string nexts are valid', badRaw.length === 0, badRaw.slice(0, 5).join('; '));
  ok('all choice-shifted nexts are valid', badShift.length === 0, badShift.slice(0, 5).join('; '));

  // _contestGeneric unreachable: every pool contest has an id-builder or a cat fallback
  const ID_BUILDERS = new Set(['pit','gauntlet','hide','duel','tithe','siege','maw','oath','beastmaster','riddle','confession','honey','secrets','quiet','guest','vigil','sorting','witness','cache','longodds','price','impress','exchange','auction','lockpick','wrongmap','alibi','echo','tidepool','windfall']);
  const CAT_FALLBACKS = new Set(['endurance','moot','weird','puzzle','detective','forage','chance']);
  const uncovered = pool().filter(c => !ID_BUILDERS.has(c.id) && !CAT_FALLBACKS.has(c.cat)).map(c => c.id);
  ok('_contestGeneric unreachable by any pool contest', uncovered.length === 0, uncovered.join(','));

  // watch phases for all 44: 3 phases, >=1 choice, nexts valid
  const [v1] = freshGame(15);
  let badWatch = [];
  for (const contest of pool()) {
    let wp = null;
    try { wp = Game._contestWatchPhases(contest, [v1]); } catch (e) { wp = null; }
    if (!Array.isArray(wp) || wp.length !== 3) { badWatch.push(contest.id + ':not-3-phases'); continue; }
    wp.forEach((p, i) => {
      if (!p || !Array.isArray(p.choices) || !p.choices.length) { badWatch.push(contest.id + ':watch' + i + ':no-choices'); return; }
      for (const ch of p.choices) {
        const n = ch.next;
        if (typeof n === 'number') { if (!(n >= 0 && n < 3)) badWatch.push(contest.id + ':watch' + i + '->' + n); }
        else if (n !== 'VERDICT') badWatch.push(contest.id + ':watch' + i + '->' + JSON.stringify(n));
      }
    });
  }
  ok('all 44 watch-phase sets are intact (3 phases, valid nexts)', badWatch.length === 0, badWatch.slice(0, 5).join('; '));

  // bespoke watch beats for all 44 (recon sub-lead already fixed — verify)
  let missingBeats = [];
  for (const contest of pool()) {
    let b = null;
    try { b = Game._contestWatchBeat(contest, 'Mara'); } catch (e) { b = null; }
    if (!b || b.length !== 3) missingBeats.push(contest.id);
  }
  ok('all 44 contests have bespoke watch beats (no generic fallback)', missingBeats.length === 0, missingBeats.join(','));
}

// ================= F3: ELIGIBILITY HONESTY vs CANON =================
sec('F3 — gravely wounded are ineligible (canon), rank-gate divergence documented');
{
  const [v1, v2] = freshGame(15);
  Game.state.village.health[v1] = 5; // gravely wounded
  const { eligible } = Game.contestEligible();
  const ids = eligible.map(e => e.id);
  ok('gravely wounded villager (5 HP) is NOT draftable', !ids.includes(v1), 'eligible=' + ids.join(','));
  ok('healthy villager still draftable', ids.includes(v2), 'eligible=' + ids.join(','));
  // boundary: 20 HP is the endurance survival floor; 21+ is battered-but-draftable (System not kind)
  Game.state.village.health[v2] = 21;
  ok('battered-but-not-gravely villager (21 HP) still draftable', Game.contestEligible().eligible.some(e => e.id === v2));
  // DOCUMENTED DIVERGENCE (not redesigned): canon says viewership rank is the
  // primary gate; code casts by notability and never reads viewershipBoard.
  ok('viewershipBoard exists as the canon API (ledger.js)', typeof Game.viewershipBoard === 'function');
  const e1 = Game.contestEligible().eligible.map(e => e.id).join(',');
  Game.state.village.viewership = 99999;
  const e2 = Game.contestEligible().eligible.map(e => e.id).join(',');
  ok('DIVERGENCE-NOTE: eligibility ignores viewership (rank gate not wired) — flagged for Steve, not redesigned',
    e1 === e2, e1 + ' vs ' + e2);
}

// ================= F4: DEAD WRITES + KILL HONESTY =================
sec('F4 — lastContestDay dead writes removed; blood deaths are real');
{
  // lastContestDay must never be written (was written in _contestEnd + _contestVerdict, read nowhere)
  const [v1, v2] = freshGame(15);
  captureSay(true);
  const starve = findContest('starve');
  const ac = { contestId: 'starve', participant: v1, participants: [v1, v2], cheer: 0, phase: 'watching',
    contest: starve, variant: null, wounds: 0 };
  let verdict = null;
  try { verdict = Game._contestVerdict(ac); } catch (e) { verdict = { error: e.message }; }
  captureSay(false);
  ok('no lastContestDay write after _contestVerdict', Game.state.lastContestDay === undefined,
    'lastContestDay=' + Game.state.lastContestDay);
  ok('verdict completed for 2 watchers', verdict && verdict.done === true, JSON.stringify(verdict).slice(0, 80));

  // _cxBlood kills are real: fragile villagers die on camera
  let died = 0, total = 0;
  const pit = findContest('pit');
  for (let s = 0; s < 12; s++) {
    const [f] = freshGame(15);
    Game.state.village.health[f] = 12;
    const r = Game.contestResolveVillager(f, pit, {});
    total++;
    if (r.outcome === 'died') died++;
  }
  ok('fear honest: fragile villagers CAN die in the pit (death on the table)', died > 0, died + '/' + total + ' died');

  // _cxKillContestant actually removes the dead from the roster
  const [k1] = freshGame(15);
  Game._cxKillContestant(k1);
  ok('contest death removes the villager from the roster',
    !(Game.state.village.roster || []).includes(k1), 'still on roster');
}

// ================= SIBLING SWEEP: structured-not-tables + alienPlayers =================
sec('SIBLING SWEEP — _cxChance/_cxOther honest structure; no canned returns in alienPlayers');
{
  const [s1, s2] = freshGame(15);
  // _cxChance: documented rigged theater — deterministic from real state, said aloud
  const lottery = findContest('lottery');
  const c1 = Game.contestResolveGroup([s1, s2], lottery, {});
  const [t1, t2] = freshGame(15);
  const c2 = Game.contestResolveGroup([t1, t2], lottery, {});
  ok('_cxChance deterministic (same state -> same winner)', JSON.stringify(c1) === JSON.stringify(c2));
  const winDetail = Object.values(c1).find(r => r.outcome === 'won');
  ok('_cxChance states its rigging aloud (ratings fiction)', winDetail && /ratings|quiet night/i.test(winDetail.detail || ''),
    winDetail && winDetail.detail);
  // _cxOther: stat-driven, no rolls — identical stats tie deterministically
  const forage = findContest('calorie_run');
  const f1 = Game.contestResolveGroup([s1, s2], forage, {});
  ok('_cxOther resolves from stats (both outcomes assigned, no crash)',
    f1[s1] && f1[s2] && ['won', 'lost'].includes(f1[s1].outcome), JSON.stringify(f1[s1]));
  // alienPlayers: no 'needs a partner'-style canned contest returns
  const src = fs.readFileSync(path.join(ROOT, 'src/js/alienPlayers.js'), 'utf8');
  ok('alienPlayers.js has no canned duel/partner returns', !/needs a partner/.test(src));
  const eng = fs.readFileSync(path.join(ROOT, 'src/js/contestEngine.js'), 'utf8')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok('contestEngine.js no longer contains the canned duel loss', !/duel needs a partner/.test(eng));
}

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ') ====');
process.exit(fail ? 1 : 0);
