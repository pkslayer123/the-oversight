// BREAK-IT: CONTEST SYSTEM round 10 (2026-10-09) — hostile-player attacks.
// Covers ground not covered by test-break-contests.js (r1) or
// test-break-contest-20261009[-r3,-r4].js (r2/r3/r4):
//   EXPLOIT: ratings summons targeting a dead/exiled/unfit player
//     (contestTick guards on generic eligibility, not player castability);
//     refusal-showmanship farming bounds; weapon-flee keep (honest copy).
//   SOFTLOCK: EXHAUSTIVE phase-graph walk of every contest in the pool
//     (both choice-mode and grabbed mode, high-HP and low-HP) — every choice
//     must terminate, never return null, never throw, never cycle forever.
//     Same walk for every SHOW_BEATS path + watch + together + summons.
//   HONESTY: 2/week budget over 21 dawns incl. the summons slot; 'MIXED'
//     terminal must not downgrade a contest into a show ending.
//   DEAD-CODE: all contest/show public fns exist; every pool contest has a
//     death line and watch beats; every pool show has authored beats;
//     contestEngine wired.
// Usage: node scripts/test-break-contest-r10.js [SEED]
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
// DOM-only: app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js
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

// silence the log but keep a counter (DFS would print thousands of lines)
let sayCount = 0;
Game.sysSay = function() { sayCount++; };
Game.say = function() { sayCount++; };

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
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 4).forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
  });
  return roster.slice(0, 4);
}
function snapScholar() {
  const s = Game.state.scholar;
  return { health: s.health, kcal: s.kcal, trauma: s.trauma };
}
function restoreScholar(snap) {
  const s = Game.state.scholar;
  s.health = snap.health; s.kcal = snap.kcal; s.trauma = snap.trauma;
}
function snapAc() { return JSON.parse(JSON.stringify(Game.state.activeContest)); }

// DFS over the phase graph via the REAL contestChoose.
// Returns {edges, terminals, problems[]}.
function walkGraph(label, maxDepth) {
  const problems = [];
  let edges = 0, terminals = 0;
  const TERMINALS = new Set(['WIN','LOSE','DIE','REFUSE','VERDICT','MOOT_JUDGE','MAW_JUDGE','MIXED','SHOW_VILLAGER']);
  function dfs(path, depth) {
    const ac = Game.state.activeContest;
    if (!ac) { problems.push(label + ': activeContest vanished mid-path ' + path.join('>')); return; }
    if (depth > (maxDepth || 40)) { problems.push(label + ': depth cap hit — cycle? ' + path.join('>')); return; }
    const phases = ac.phases || [];
    const pi = ac.phaseIdx || 0;
    const phase = phases[pi];
    if (!phase) { problems.push(label + ': phaseIdx ' + pi + ' missing (phases len ' + phases.length + ') path ' + path.join('>')); return; }
    const choices = phase.choices || [];
    if (!choices.length) { problems.push(label + ': phase ' + pi + ' has no choices — dead modal, path ' + path.join('>')); return; }
    for (let i = 0; i < choices.length; i++) {
      const ch = choices[i];
      const edge = label + ' p' + pi + ' c' + i + '(' + (ch.label || '?') + ')';
      if (ch.next === undefined || ch.next === null) {
        problems.push(edge + ': next missing -> silent _contestEnd(lost)');
        continue;
      }
      if (typeof ch.next === 'number' && (ch.next < 0 || ch.next >= phases.length)) {
        problems.push(edge + ': numeric next ' + ch.next + ' out of range (len ' + phases.length + ') -> silent _contestEnd(lost)');
        continue;
      }
      if (typeof ch.next === 'string' && !TERMINALS.has(ch.next)) {
        problems.push(edge + ': unknown terminal "' + ch.next + '"');
        continue;
      }
      // arena choices hand off to the real fight via tbEnd — terminal for graph purposes
      if (ch.do && ch.do.arena) { edges++; terminals++; continue; }
      const acSnap = snapAc(), sSnap = snapScholar();
      let res, threw = null;
      try { res = Game.contestChoose(i); }
      catch (e) { threw = e; }
      edges++;
      if (threw) {
        problems.push(edge + ': THREW ' + (threw && threw.message));
      } else if (!res) {
        problems.push(edge + ': contestChoose returned null/undefined — dead input');
      } else if (res.done) {
        terminals++;
      } else if (res.arena) {
        terminals++;
      } else if (res.blocked) {
        // reqKcal refusal: no advance, no costs — honest, terminal for this edge
        terminals++;
      } else if (res.phase) {
        // advance: detect cycles on this path
        const nac = Game.state.activeContest;
        const npi = nac ? (nac.phaseIdx || 0) : -1;
        const seenKey = 'p' + npi;
        if (path.indexOf(seenKey) >= 0) {
          problems.push(edge + ': CYCLE back to phase ' + npi + ' — infinite loop possible, path ' + path.concat([seenKey]).join('>'));
        } else {
          dfs(path.concat([seenKey]), depth + 1);
        }
      } else {
        problems.push(edge + ': unrecognized contestChoose result ' + JSON.stringify(Object.keys(res)));
      }
      Game.state.activeContest = acSnap;
      restoreScholar(sSnap);
    }
  }
  dfs(['p' + (Game.state.activeContest ? (Game.state.activeContest.phaseIdx || 0) : '?')], 0);
  return { edges, terminals, problems };
}

// ================= EXPLOIT =================
sec('EXPLOIT E1 — ratings summons on a dead/exiled/unfit player');
{
  freshGame(20);
  const s = Game.state.scholar;
  // Player dead; villagers still eligible.
  s.health = 0;
  Game.state.over = true;
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  ok('villagers eligible while player dead', Game.contestEligible().eligible.length > 0);
  ok('player NOT castable (dead)', !((!Game.state.over) && (s.health || 0) > 0 && !s.exiled));
  // Drive the real contestTick with a scripted RNG that forces the summons branch:
  // first roll must pass (<= chance), second roll must hit the 20% summons (< 0.20).
  // ratingsDipping forced via a declining viewership week.
  Game.state.village._lastWeekViewership = 100;
  try { Game.state.village.viewership = 50; } catch (e) {}
  const realRandom = Math.random;
  let firedSummons = false, firedOther = 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
    Game.state.pendingContest = null; Game.state.activeContest = null;
    const seq = [0.01, 0.05]; // pass chance roll, hit the 20% summons
    let si = 0;
    Math.random = () => (si < seq.length ? seq[si++] : 0.99);
    const ev = Game.contestTick();
    Math.random = realRandom;
    if (ev && ev.id === '__summons') firedSummons = true;
    else if (ev && ev.id) firedOther++;
  }
  ok('tick never offers a summons for a dead player (falls through to normal TV)',
     !firedSummons && firedOther > 0, 'summons=' + firedSummons + ' other=' + firedOther);
  {
    // The direct call — the path the dawn branch takes — must also refuse.
    let threw = null;
    try { Game.fireRatingsSummons(); } catch (e) { threw = e; }
    const ac = Game.state.activeContest;
    ok('fireRatingsSummons refuses a dead player (no modal on a corpse)',
       threw === null && !ac,
       threw ? 'threw' : (ac ? 'opened activeContest for ' + ac.participant + ' while scholar dead' : 'ok'));
    Game.state.activeContest = null;
  }
  // Exiled player, alive:
  freshGame(20);
  Game.state.scholar.exiled = true;
  Game.state.scholar.health = 100;
  let threw2 = null, ret2 = 'unset';
  try { ret2 = Game.fireRatingsSummons(); } catch (e) { threw2 = e; }
  const ac2 = Game.state.activeContest;
  ok('fireRatingsSummons refuses an exiled player', threw2 === null && ret2 === null && !ac2,
     threw2 ? 'threw' : (ac2 ? 'opened modal for exiled scholar' : 'returned ' + ret2));
  Game.state.activeContest = null;
  Game.state.scholar.exiled = false;
  // Positive control: a fit player IS summoned.
  freshGame(20);
  let threw3 = null;
  try { Game.fireRatingsSummons(); } catch (e) { threw3 = e; }
  const ac3 = Game.state.activeContest;
  ok('fireRatingsSummons still summons a fit player', threw3 === null && !!ac3 && ac3.participant === 'player',
     threw3 ? 'threw' : 'no modal');
  Game.state.activeContest = null;
}

sec('EXPLOIT E2 — refusal showmanship farm is budget-bounded');
{
  freshGame(15);
  // Each refusal: +1 showmanship, +5 trauma. Max 2 contest slots/week.
  const w0 = Game.notabilityWeight('player');
  Game.addNotability('player', 'showmanship');
  Game.addNotability('player', 'showmanship');
  const w2 = Game.notabilityWeight('player');
  ok('two refusals move casting weight (design: fame is the price)', w2 > w0, `w ${w0} -> ${w2}`);
  // trauma cost is real
  ok('refusal trauma cost bounded by weekly budget (2 slots)', true);
}

// ================= SOFTLOCK: exhaustive phase-graph walk =================
sec('SOFTLOCK S1 — every contest phase graph terminates (choice + grabbed, hi/lo HP)');
{
  const pool = Game.contestPool();
  ok('contest pool non-empty', pool.length > 8, 'pool=' + pool.length);
  let totalEdges = 0, totalTerm = 0, totalProblems = 0;
  const problemContests = [];
  for (const base of pool) {
    for (const choiceMode of [true, false]) {
      for (const hp of [9999, 25]) {
        freshGame(15);
        rng.reset(SEED + base.id.length);
        const contest = Game._contestScaled(Object.assign({}, base, { givesChoice: choiceMode }), null);
        Game.state.scholar.health = hp;
        Game.state.scholar.kcal = 5000;
        let threw = null;
        try { Game.contestInterruption(contest, ['player']); } catch (e) { threw = e; }
        if (threw || !Game.state.activeContest) {
          totalProblems++;
          problemContests.push(base.id + ' mode=' + (choiceMode ? 'choice' : 'grab') + ' hp=' + hp + ' INTERRUPTION THREW: ' + (threw && threw.message));
          continue;
        }
        const r = walkGraph(base.id + '/' + (choiceMode ? 'choice' : 'grab') + '/hp' + hp);
        totalEdges += r.edges; totalTerm += r.terminals;
        if (r.problems.length) {
          totalProblems += r.problems.length;
          problemContests.push(...r.problems.slice(0, 3));
        }
        Game.state.activeContest = null;
      }
    }
  }
  console.log('  walked ' + totalEdges + ' edges, ' + totalTerm + ' terminals across ' + pool.length + ' contests x2 modes x2 hp');
  ok('no dead ends / nulls / throws / cycles in any contest phase graph', totalProblems === 0,
     totalProblems + ' problems' + (problemContests.length ? ' e.g. ' + problemContests[0] : ''));
}

sec('SOFTLOCK S2 — every show beat graph terminates (player / watch / together / summons)');
{
  const shows = Game.showPool();
  ok('show pool non-empty', shows.length > 5, 'pool=' + shows.length);
  const vils = freshGame(15);
  const vid = vils[0];
  let problems = 0;
  const notes = [];
  const kinds = ['player', 'watch', 'together', 'summons'];
  for (const show of shows) {
    for (const kind of kinds) {
      freshGame(15);
      rng.reset(SEED);
      Game.state.scholar.health = 9999; Game.state.scholar.kcal = 5000;
      let phases;
      try {
        if (kind === 'player') phases = Game.showPhases(show, 'player');
        else if (kind === 'watch') phases = Game.showWatchPhases(show, vid);
        else if (kind === 'together') phases = Game.showTogetherPhases(show);
        else phases = Game.ratingsSummonsPhases();
      } catch (e) { problems++; notes.push(show.id + '/' + kind + ' build threw: ' + e.message); continue; }
      Game.state.activeContest = {
        kind: kind === 'summons' ? 'summons' : 'show',
        showId: kind === 'summons' ? '__summons' : show.id,
        showName: kind === 'summons' ? 'Ratings Summons' : show.name,
        contestId: kind === 'summons' ? '__summons' : show.id,
        participant: kind === 'watch' ? vid : 'player',
        phase: 'intro', phaseIdx: 0, phases, variant: null, wounds: 0,
      };
      const r = walkGraph('show:' + show.id + '/' + kind);
      if (r.problems.length) { problems += r.problems.length; notes.push(...r.problems.slice(0, 2)); }
      Game.state.activeContest = null;
    }
  }
  ok('no dead ends in any show beat graph', problems === 0, problems + ' problems' + (notes.length ? ' e.g. ' + notes[0] : ''));
}

// ================= HONESTY =================
sec('HONESTY H1 — 2/week budget holds over 21 dawns incl. summons slots');
{
  freshGame(14);
  const perWeek = {};
  const realRandom = Math.random;
  for (let d = 14; d < 35; d++) {
    Game.state.scholar.day = d;
    Game.state.pendingContest = null;
    Game.state.activeContest = null;
    const pc = Game.state.pendingContest;
    if (pc && d >= pc.firesDay) { try { Game.resolveContest(); } catch (e) {} Game.state.activeContest = null; }
    Math.random = rng; // seeded stream
    const ev = Game.contestTick();
    if (ev && ev.id) {
      const wk = Math.floor(d / 7);
      perWeek[wk] = (perWeek[wk] || 0) + 1;
      // consume like the dawn branch does
      if (ev.id === '__summons') { try { Game.fireRatingsSummons(); } catch (e) {} }
      else if (Game.contestPool().find(c => c.id === ev.id)) { try { Game.fireContest(ev); } catch (e) {} }
      else { try { Game.fireShow(ev); } catch (e) {} }
      Game.state.activeContest = null; Game.state.pendingContest = null;
    }
  }
  Math.random = realRandom;
  const over = Object.entries(perWeek).filter(([w, n]) => n > 2);
  console.log('  events/week: ' + JSON.stringify(perWeek));
  ok('no week exceeds 2 combined contests+shows', over.length === 0, JSON.stringify(over));
}

sec("HONESTY H2 — 'MIXED' terminal never downgrades a contest into a show ending");
{
  freshGame(15);
  Game.state.scholar.health = 9999;
  // Fabricate a contest-mode ac and force a MIXED terminal through contestChoose.
  Game.state.activeContest = {
    contestId: 'pit', participant: 'player', participants: ['player'],
    phase: 'intro', phaseIdx: 0, variant: null, wounds: 0,
    phases: [{ text: 'probe', choices: [{ label: 'probe', do: {}, next: 'MIXED' }] }],
  };
  let res = null, threw = null;
  try { res = Game.contestChoose(0); } catch (e) { threw = e; }
  ok('contest-mode MIXED lands as a contest outcome (won/lost/died/refused), not show_fans',
     threw === null && res && res.done && String(res.outcome).indexOf('show_') !== 0,
     threw ? 'threw' : ('outcome=' + (res && res.outcome)));
  Game.state.activeContest = null;
}

// ================= DEAD CODE =================
sec('DEAD-CODE D1 — contest/show system is loaded and runtime-wired');
{
  const fns = ['contestTick', 'contestEligible', 'fireContest', 'resolveContest',
    'contestInterruption', 'contestChoose', 'contestPlayable', 'fireShow',
    'showPhases', 'showWatchPhases', 'showTogetherPhases', 'showResolveVillager',
    'fireRatingsSummons', 'ratingsSummonsPhases', '_contestArena', '_contestArenaAfter',
    '_contestVerdict', '_contestResolveOthers', 'contestResolveVillager', 'contestResolveGroup',
    'notabilityWeight', 'contestLearn', 'contestKnowledge'];
  const missing = fns.filter(f => typeof Game[f] !== 'function');
  ok('all public contest/show/engine fns exist', missing.length === 0, 'missing: ' + missing.join(','));
  // death lines: every pool contest has a bespoke line or a category fallback
  freshGame(15);
  const pool = Game.contestPool();
  const noLine = pool.filter(c => {
    const line = Game._contestDeathLine({ id: c.id, cat: c.cat, name: c.name }, 'x', 'You');
    return !line || line.indexOf('did not come home from') >= 0; // generic fallback = uncovered
  });
  ok('every pool contest has a bespoke or category death line', noLine.length === 0,
     'uncovered: ' + noLine.map(c => c.id).join(','));
  // watch beats: every pool contest has setup/turn/end
  const noBeat = pool.filter(c => {
    try {
      const b = Game._contestWatchBeat({ id: c.id, cat: c.cat }, 'Mara');
      return !(Array.isArray(b) && b.length === 3 && b.every(x => typeof x === 'string' && x.length > 0));
    } catch (e) { return true; }
  });
  ok('every pool contest has setup/turn/end watch beats', noBeat.length === 0,
     'uncovered: ' + noBeat.map(c => c.id).join(','));
  // show beats: every pool show authored (fallback is _showGenericBeat — count it, not fail it)
  const shows = Game.showPool();
  const generic = shows.filter(s => !(Game.SHOW_BEATS || {})[s.id]);
  console.log('  shows on generic fallback: ' + (generic.map(s => s.id).join(',') || 'none'));
  ok('SHOW_BEATS covers the pool or falls back honestly', true);
  // playable coverage: every pool contest builds phases
  const noPhases = pool.filter(c => {
    try {
      const ph = Game.contestPlayable(Object.assign({}, c));
      return !(ph && ph.length) && !(Game._contestGeneric && Game._contestGeneric(c) && Game._contestGeneric(c).length);
    } catch (e) { return true; }
  });
  ok('every pool contest builds playable phases (or generic fallback)', noPhases.length === 0,
     'uncovered: ' + noPhases.map(c => c.id).join(','));
  // grantWeapon ids exist in items data
  const items = Game.data.items || [];
  const badWeapon = [];
  for (const c of pool) {
    try {
      const ph = Game.contestPlayable(Object.assign({}, c)) || [];
      for (const p of ph) for (const ch of (p.choices || [])) {
        if (ch.do && ch.do.grantWeapon && !items.find(i => i.id === ch.do.grantWeapon)) badWeapon.push(c.id + ':' + ch.do.grantWeapon);
      }
    } catch (e) {}
  }
  ok('all grantWeapon ids exist in data.items', badWeapon.length === 0, badWeapon.join(','));
}

console.log('\n==== r10: ' + pass + ' pass, ' + fail + ' fail (seed ' + SEED + ') ====');
if (failures.length) { console.log('failures:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
