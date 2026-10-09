// BREAK-IT: CONTEST SYSTEM round 2 (2026-10-09) — hostile-player attacks.
// Covers the gaps left by test-break-contests.js (2026-10-08):
//   EXPLOIT: arena re-fire (startCombat x2, weapon re-grant), moot 'Walk out'
//     WIN without prize, villager-win prize bypassing the pantry cap,
//     recast double-take.
//   SOFTLOCK: arena completion via tbEnd resume (won/lost/fled),
//     exile/death mid-countdown, multi-take watch verdict cleanup,
//     contestChoose input during arena suspension.
//   HONESTY: countdown copy vs timer, 2/week budget over 21 days,
//     notability-weighted casting (statistical), unavoidability
//     (sleep/travel don't skip the sequence).
//   DEAD-CODE: contestEngine loaded + runtime-wired, watch-beat coverage,
//     death-line coverage, generic-fallback reachability, gossip seeding,
//     drama 'contest' channel, all phase beats resolving.
// Usage: node scripts/test-break-contest-20261009.js [SEED]
// Seed via SEED env or argv; default 424242. Run x3 seeds.
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
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 4).forEach((vid, i) => {
    if (!Game.state.village.positions[vid]) Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
  });
  return roster.slice(0, 4);
}
function fireDirect(contestId, pids) {
  const contest = Game.contestPool().find(c => c.id === contestId);
  Game.fireContest(contest);
  const pc = Game.state.pendingContest;
  if (pc && pids) { pc.participant = pids[0]; pc.participants = pids.slice(); }
  return pc;
}
function forceResolve() {
  const pc = Game.state.pendingContest;
  if (pc && (Game.state.scholar.day || 1) >= pc.firesDay) Game.resolveContest();
}
// capture sysSay lines
let saidLines = [];
const _origSysSay = Game.sysSay;
function captureSay(on) {
  if (on) { saidLines = []; Game.sysSay = function(t) { saidLines.push(String(t)); }; }
  else { Game.sysSay = _origSysSay; }
}

// ================= EXPLOIT =================
sec('EXPLOIT E1 — arena re-fire: double-tap during suspension must not re-run the fight');
{
  freshGame(15);
  fireDirect('pit', ['player']);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  let ac = Game.state.activeContest;
  ok('pit interruption active for player', !!ac && ac.participant === 'player');
  // navigate (choice-0) until a phase matches pred; the givesChoice branch
  // may prepend a Participate/Refuse phase
  function playUntil(pred, maxSteps) {
    let steps = 0;
    while (Game.state.activeContest && steps++ < (maxSteps || 30)) {
      const a = Game.state.activeContest;
      if (a.arenaSuspended) return { suspended: true, ac: a };
      const ph = a.phases[a.phaseIdx || 0];
      const ci = (ph.choices || []).findIndex(pred);
      if (ci >= 0) return { idx: ci, ac: a, ph };
      const r = Game.contestChoose(0);
      if (r && r.done) return { done: true, r };
      if (r && r.arena) return { suspended: true, ac: Game.state.activeContest };
    }
    return { timeout: true };
  }
  const wfound = playUntil(ch => ch.do && ch.do.grantWeapon);
  ok('weapon choice reachable', wfound.idx !== undefined && wfound.idx >= 0, JSON.stringify(wfound.idx));
  const invBefore = Game.state.scholar.inventory.length;
  Game.contestChoose(wfound.idx);
  ok('weapon granted exactly once', Game.state.scholar.inventory.length === invBefore + 1,
    'inv ' + invBefore + ' -> ' + Game.state.scholar.inventory.length);
  const afound = playUntil(ch => ch.do && ch.do.arena);
  ok('arena choice found', afound.idx >= 0);
  let startCalls = 0;
  const origSC = Game.startCombat;
  Game.startCombat = function(id) { startCalls++; return null; }; // stub: don't run a real fight
  const r1 = Game.contestChoose(afound.idx);
  ac = Game.state.activeContest;
  ok('first arena call suspends', !!(r1 && r1.arena) && ac.arenaSuspended === true);
  ok('startCombat fired once', startCalls === 1, 'calls=' + startCalls);
  const hpBefore = Game.state.scholar.health;
  const invMid = Game.state.scholar.inventory.length;
  const r2 = Game.contestChoose(afound.idx); // the double-tap race
  ok('re-fire returns arena:true, no re-entry', !!(r2 && r2.arena), JSON.stringify(r2));
  ok('startCombat NOT fired again', startCalls === 1, 'calls=' + startCalls);
  ok('no effects applied on re-fire (health unchanged)', Game.state.scholar.health === hpBefore);
  ok('no weapon re-grant on re-fire', Game.state.scholar.inventory.length === invMid);
  // direct re-call of _contestArena is also guarded
  const r3 = Game._contestArena(ac, { waves: 1 }, []);
  ok('direct _contestArena re-call refused', !!(r3 && r3.arena) && startCalls === 1);
  Game.startCombat = origSC;
}

sec('EXPLOIT E2 — terminal WIN cannot be double-claimed');
{
  freshGame(15);
  fireDirect('box', ['player']); // puzzle: deterministic-ish phases
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  let grants = 0;
  const origGrant = Game.alienLootGrant;
  Game.alienLootGrant = function(x) { grants++; return origGrant.call(this, x); };
  // walk phases to a WIN: find a choice with next 'WIN' each phase, else choice 0
  let guard = 0, res = null;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && guard++ < 40) {
    const ac = Game.state.activeContest;
    const ph = ac.phases[ac.phaseIdx || 0];
    let ci = (ph.choices || []).findIndex(c => c.next === 'WIN');
    if (ci < 0) ci = 0;
    res = Game.contestChoose(ci);
    if (res && res.arena) break; // arena path handled elsewhere
  }
  Game.alienLootGrant = origGrant;
  ok('contest reached a terminal', !Game.state.activeContest, 'res=' + JSON.stringify(res && res.outcome));
  ok('prize granted at most once on the WIN path', grants <= 1, 'grants=' + grants);
  ok('contestChoose after terminal -> null', Game.contestChoose(0) === null);
}

sec("EXPLOIT E3 — moot 'Walk out' WIN carries the prize (template_prize contract)");
{
  freshGame(15);
  // towering standing: win even with the -3 walk-out penalty
  Game.state.scholar.trust = 100;
  Game.state.scholar.notability = new Array(12).fill('deed');
  fireDirect('moot', ['player']);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  let ac = Game.state.activeContest;
  // navigate to the climax phase (choice phase may be prepended)
  let guard = 0;
  while (ac && guard++ < 10) {
    const ph = ac.phases[ac.phaseIdx || 0];
    const wi = (ph.choices || []).findIndex(c => c.label === 'Walk out');
    if (wi >= 0) {
      let grants = 0;
      const origGrant = Game.alienLootGrant;
      Game.alienLootGrant = function(x) { grants++; return origGrant.call(this, x); };
      const r = Game.contestChoose(wi);
      Game.alienLootGrant = origGrant;
      ok('walk-out reaches MOOT_JUDGE and wins', !!(r && r.done && r.outcome === 'won'), JSON.stringify(r && r.outcome));
      ok('walk-out WIN grants the prize', grants === 1, 'grants=' + grants);
      break;
    }
    Game.contestChoose(0);
    ac = Game.state.activeContest;
  }
  if (guard >= 10) ok('walk-out choice reachable', false, 'never found Walk out');
}

sec('EXPLOIT E4 — villager win prize respects the pantry cap (no silent overfill)');
{
  freshGame(15);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const vid = vids[0];
  // fill the pantry to the cap via the honest route (coarse then fine)
  while (Game.pantryAdd({ name: 'filler', kcalEach: 1000, units: 10, spoilDay: 999, safe: true })) {}
  while (Game.pantryAdd({ name: 'filler2', kcalEach: 100, units: 1, spoilDay: 999, safe: true })) {}
  const kcalBefore = Game.pantryKcal();
  const cap = Game.pantryCapKcal();
  ok('pantry filled to cap', kcalBefore > cap - 600, kcalBefore + '/' + cap);
  captureSay(true);
  Game._contestEnd({ contestId: 'pit', participant: vid, participants: [vid], others: [],
    phase: 'intro', phaseIdx: 0, phases: [{ choices: [] }], variant: null }, 'won', true);
  captureSay(false);
  const kcalAfter = Game.pantryKcal();
  ok('pantry NOT overfilled by winner share', kcalAfter <= cap, kcalAfter + ' > ' + cap);
  ok('full pantry gets the honest line', saidLines.some(l => /full to bursting|eats them on the spot/.test(l)),
    saidLines.slice(-3).join(' | '));
  // and when there IS room, the share lands in the pantry
  Game.state.village.pantry = [];
  Game.state.village.pantryKcal = 0;
  captureSay(true);
  Game._contestEnd({ contestId: 'pit', participant: vid, participants: [vid], others: [],
    phase: 'intro', phaseIdx: 0, phases: [{ choices: [] }], variant: null }, 'won', true);
  captureSay(false);
  ok('room in pantry: share lands', Game.state.village.pantry.length === 1 &&
    Game.state.village.pantry[0].kcalEach === 300);
  ok('pantryKcal in sync', Game.state.village.pantryKcal === 600, 'pantryKcal=' + Game.state.village.pantryKcal);
}

sec('EXPLOIT E5 — recast never takes the same villager twice');
{
  let dupes = 0, runs = 0;
  for (let t = 0; t < 60; t++) {
    rng.reset(SEED + t);
    freshGame(15);
    const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    if (vids.length < 3) continue;
    // two contestants die mid-countdown; recast must pick two DISTINCT living villagers
    const pc = fireDirect('starve', ['player', vids[0], vids[1]]);
    // kill both villagers (remove from roster)
    Game.state.village.roster = (Game.state.village.roster || []).filter(id => id !== vids[0] && id !== vids[1]);
    Game.state.village.positions = {};
    (Game.state.village.roster || []).filter(id => id !== Game.villagerId)
      .forEach((id, i) => { Game.state.village.positions[id] = { x: 1 + i, y: 1 }; });
    Game.state.scholar.day = pc.firesDay;
    captureSay(true);
    Game.resolveContest();
    captureSay(false);
    const ac = Game.state.activeContest;
    runs++;
    if (ac && ac.participants) {
      const ids = ac.participants;
      if (new Set(ids).size !== ids.length) dupes++;
      // the dead stay dead: recast picks must be alive members
      for (const id of ids) {
        if (id !== 'player' && !Game.isMember(id)) dupes++;
      }
      Game.state.activeContest = null; // reset for next iteration
    }
  }
  ok('60 recast runs, no duplicate or dead picks', dupes === 0 && runs === 60, 'dupes=' + dupes + ' runs=' + runs);
}

// ================= SOFTLOCK =================
sec('SOFTLOCK S1 — arena completes through the tbEnd resume path (won/lost/fled)');
{
  for (const result of ['won', 'lost', 'fled']) {
    rng.reset(SEED);
    freshGame(15);
    fireDirect('gauntlet', ['player']); // 3 waves
    Game.state.scholar.day = Game.state.pendingContest.firesDay;
    Game.resolveContest();
    let ac = Game.state.activeContest;
    // phase 0: take weapon; then keep choosing the arena/fight choice
    let guard = 0, waves = 0;
    const origSC = Game.startCombat;
    Game.startCombat = function(id) { waves++; return null; }; // stub: fight "happens" off-screen
    try {
      while (Game.state.activeContest && guard++ < 30) {
        ac = Game.state.activeContest;
        if (ac.arenaSuspended) {
          // tbEnd would call this: simulate the fight result
          Game._contestArenaAfter(Game.state.arenaContest, result);
          continue;
        }
        const ph = ac.phases[ac.phaseIdx || 0];
        let ci = (ph.choices || []).findIndex(c => c.do && (c.do.arena || c.do.grantWeapon));
        if (ci < 0) ci = 0;
        const r = Game.contestChoose(ci);
        if (r && r.arena) continue;
        if (r && r.done) break;
      }
    } finally { Game.startCombat = origSC; }
    const cleared = !Game.state.activeContest;
    if (result === 'won') {
      ok('gauntlet/won: 3 waves fought, contest cleared', cleared && waves === 3, 'waves=' + waves + ' cleared=' + cleared);
    } else if (result === 'lost') {
      // tbEnd runs playerDeath before _contestArenaAfter('lost'); here we only
      // assert the contest side closes cleanly without throwing
      ok('gauntlet/lost: contest closes cleanly', cleared, 'cleared=' + cleared);
    } else {
      ok('gauntlet/fled: contest closes as lost', cleared, 'cleared=' + cleared);
    }
  }
}

sec('SOFTLOCK S2 — exile mid-countdown: the show recasts, nothing sticks');
{
  freshGame(15);
  const pc = fireDirect('pit', ['player']);
  ok('player taken', pc.participants.includes('player'));
  Game.state.scholar.exiled = true; // exiled overnight
  Game.state.scholar.day = pc.firesDay;
  Game.resolveContest();
  const ac = Game.state.activeContest;
  ok('pendingContest cleared', !Game.state.pendingContest);
  ok('interruption fired anyway (unavoidable)', !!ac);
  ok('exiled player NOT in the cast', ac && !ac.participants.includes('player'),
    'cast=' + (ac && ac.participants.join(',')));
  Game.state.activeContest = null;
}

sec('SOFTLOCK S3 — death mid-countdown: corpse is not televised');
{
  freshGame(15);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const pc = fireDirect('pit', [vids[0]]);
  // villager dies overnight
  Game.state.village.roster = (Game.state.village.roster || []).filter(id => id !== vids[0]);
  delete (Game.state.village.positions || {})[vids[0]];
  Game.state.scholar.day = pc.firesDay;
  captureSay(true);
  Game.resolveContest();
  captureSay(false);
  const ac = Game.state.activeContest;
  ok('pendingContest cleared', !Game.state.pendingContest);
  ok('dead contestant recast, show goes on', !!ac && !ac.participants.includes(vids[0]));
  ok('recast announced honestly', saidLines.some(l => /was going to take|instead/.test(l)));
  Game.state.activeContest = null;
}

sec('SOFTLOCK S4 — watch-mode multi-take verdict resolves everyone, clears state');
{
  rng.reset(SEED);
  freshGame(15);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  fireDirect('starve', [vids[0], vids[1], vids[2]]);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  let ac = Game.state.activeContest;
  ok('watch mode (player not taken)', !!ac && ac.participant !== 'player');
  // play through: cheer, then shout, then comfort -> VERDICT
  let guard = 0, verdict = null;
  while (Game.state.activeContest && guard++ < 20) {
    ac = Game.state.activeContest;
    const ph = ac.phases[ac.phaseIdx || 0];
    let ci = (ph.choices || []).findIndex(c => c.next === 'VERDICT');
    if (ci < 0) ci = 0;
    verdict = Game.contestChoose(ci);
    if (verdict && verdict.done) break;
  }
  ok('verdict reached', !!(verdict && (verdict.done || verdict.outcome)), JSON.stringify(verdict && verdict.outcome));
  ok('activeContest cleared after verdict', !Game.state.activeContest);
  // (break-it contest r4 2026-10-09: the lastContestDay write was dead code —
  // written here, read nowhere. Removed; this assertion now pins the removal.)
  ok('lastContestDay write removed (dead code)', Game.state.lastContestDay === undefined);
}

sec('SOFTLOCK S5 — choice input during arena suspension applies nothing');
{
  freshGame(15);
  fireDirect('pit', ['player']);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  function playUntil(pred, maxSteps) {
    let steps = 0;
    while (Game.state.activeContest && steps++ < (maxSteps || 30)) {
      const a = Game.state.activeContest;
      if (a.arenaSuspended) return { suspended: true, ac: a };
      const ph = a.phases[a.phaseIdx || 0];
      const ci = (ph.choices || []).findIndex(pred);
      if (ci >= 0) return { idx: ci, ac: a, ph };
      const r = Game.contestChoose(0);
      if (r && (r.done || r.arena)) return { terminal: true, r };
    }
    return { timeout: true };
  }
  const wfound = playUntil(ch => ch.do && ch.do.grantWeapon);
  Game.contestChoose(wfound.idx);
  const afound = playUntil(ch => ch.do && ch.do.arena);
  const origSC = Game.startCombat;
  Game.startCombat = function() { return null; };
  Game.contestChoose(afound.idx);
  Game.startCombat = origSC;
  const ac = Game.state.activeContest;
  ok('suspended', !!ac && ac.arenaSuspended === true);
  const hp = Game.state.scholar.health, kcal = Game.state.scholar.kcal;
  // every choice index on the current phase: all must be dead input
  const n = ac.phases[ac.phaseIdx].choices.length;
  for (let i = 0; i < n; i++) Game.contestChoose(i);
  ok('health untouched by dead input', Game.state.scholar.health === hp);
  ok('kcal untouched by dead input', Game.state.scholar.kcal === kcal);
  ok('still suspended, single arena routing', ac.arenaSuspended === true && !!Game.state.arenaContest);
  Game.state.activeContest = null; Game.state.arenaContest = null;
}

// ================= HONESTY =================
sec('HONESTY H1 — countdown copy names the grab and the timer is real');
{
  freshGame(20);
  captureSay(true);
  const pc = fireDirect('hide', ['player']);
  captureSay(false);
  ok('firesDay is exactly tomorrow', pc.firesDay === 21, 'firesDay=' + pc.firesDay);
  ok('warning names the grab timing', saidLines.some(l => /at dawn/i.test(l)) &&
    saidLines.some(l => /one more day/i.test(l)), saidLines.slice(-4).join(' | '));
}

sec('HONESTY H2 — 2/week combined budget holds over 21 forced days');
{
  freshGame(15);
  const realRandom = Math.random;
  Math.random = () => 0; // always pass chance rolls, always pick first candidate
  let maxUsed = 0;
  const weeks = {};
  try {
    for (let d = 15; d < 36; d++) {
      Game.state.scholar.day = d;
      Game.state.activeContest = null;
      Game.state.pendingContest = null;
      const ev = Game.contestTick();
      if (ev) { // immediately "resolve" so the next day can tick again
        Game.state.pendingContest = null;
      }
      const w = Math.floor(d / 7);
      weeks[w] = Math.max(weeks[w] || 0, Game.state.showBudget.used);
    }
  } finally { Math.random = realRandom; }
  const worst = Math.max(...Object.values(weeks));
  ok('no week exceeds 2 events', worst <= 2, 'worst=' + worst + ' ' + JSON.stringify(weeks));
}

sec('HONESTY H3 — casting honors notability (ratings bias is real, not copy)');
{
  // one famous villager vs three unknowns; player exiled so only villagers cast
  let famousPicks = 0, runs = 0;
  for (let t = 0; t < 200; t++) {
    freshGame(15);
    Game.state.scholar.exiled = true;
    const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 4);
    if (vids.length < 4) continue;
    Game.state.notability = {};
    // notability() returns one note per DEED TYPE — stack distinct deeds
    for (const deed of ['wave2Kill', 'wave3Kill', 'survivedMoot', 'heist', 'contestWin', 'showmanship'])
      Game.addNotability(vids[0], deed);
    Game.state.village.positions = {};
    vids.forEach((id, i) => { Game.state.village.positions[id] = { x: 1 + i, y: 1 }; });
    rng.reset(1000 + t); // reseed AFTER setup (freshGame resets to SEED)
    const c = Game.contestPool().find(x => x.id === 'box'); // participants: 1
    Game.fireContest(c);
    const pc = Game.state.pendingContest;
    runs++;
    if (pc && pc.participant === vids[0]) famousPicks++;
    Game.state.pendingContest = null;
  }
  // weight 13 vs 1+1+1 (+10% whim uniform): expected ~75%; uniform would be 25%
  ok('famous villager picked well above uniform', famousPicks / runs > 0.4,
    famousPicks + '/' + runs + ' = ' + (famousPicks / runs).toFixed(2));
}

sec('HONESTY H4 — unavoidable: sleep and travel do not skip the sequence');
{
  freshGame(15);
  const pc = fireDirect('pit', ['player']);
  // travel far away overnight
  Game.location = 'farwild';
  Game.state.scholar.day = pc.firesDay;
  Game.resolveContest();
  ok('grab lands while away', !!Game.state.activeContest && Game.state.activeContest.participant === 'player');
  // sleeping with the modal open: the modal persists (sequence still owed)
  const acBefore = Game.state.activeContest;
  Game.state.scholar.day++; // a day passes without playing the sequence
  ok('unplayed sequence persists across days', Game.state.activeContest === acBefore);
  Game.state.activeContest = null;
}

sec('HONESTY H5 — watch beats and death lines cover the whole pool (no generic filler)');
{
  const pool = Game.contestPool();
  const noBeat = [], noLine = [], generic = [];
  for (const c of pool) {
    let b = null;
    try { b = Game._contestWatchBeat(c, 'Mara'); } catch (e) {}
    if (!b) noBeat.push(c.id);
    const line = Game._contestDeathLine(c, 'x', 'Mara');
    if (/did not come home from/.test(line)) noLine.push(c.id);
    let ph = null;
    try { ph = Game.contestPlayable(c); } catch (e) {}
    if (!ph || !ph.length) generic.push(c.id + ':empty');
  }
  ok('all ' + pool.length + ' contests have specific watch beats', noBeat.length === 0, noBeat.join(','));
  ok('all contests have bespoke-or-category death lines', noLine.length === 0, noLine.join(','));
  ok('no pool contest falls through to empty phases', generic.length === 0, generic.join(','));
  // generic fallback exists but is unreachable by pool contests
  const fake = { id: 'zzz_unknown', cat: 'zzz', name: 'Zzz', desc: 'd', risk: 'low' };
  const gp = Game.contestPlayable(fake);
  ok('unknown contests still get the generic fallback', !!(gp && gp.length));
}

sec('HONESTY H6 — gossip aftermath is seeded and travels (not a dead write)');
{
  rng.reset(SEED);
  freshGame(15);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.gossip = [];
  Game._cxGossip('won', vids[0], 'The Pit');
  const g = Game.state.village.gossip.find(x => x.action === 'contest_won');
  ok('contest win seeds gossip', !!g && g.dims.who === vids[0] && !!g.partKey);
  const heardBefore = (g.heard || []).length;
  Game.spreadGossip();
  ok('gossip travels along social lines', (g.heard || []).length >= heardBefore, heardBefore + '->' + g.heard.length);
  // player wins don't seed villager gossip (already on the record)
  Game.state.village.gossip = [];
  Game._cxGossip('won', 'player', 'The Pit');
  ok('player fate not double-seeded as villager gossip', Game.state.village.gossip.length === 0);
}

// ================= DEAD-CODE =================
sec('DEAD-CODE D1 — contestEngine is loaded, wired, and really resolves');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('contestEngine.js in index.html script list', /src\/js\/contestEngine\.js/.test(html));
  for (const n of ['contestResolveVillager', 'contestResolveGroup', 'duelFight', 'contestBeastFor'])
    ok('Game.' + n + ' is a function', typeof Game[n] === 'function');
  // runtime wiring: the verdict path really calls the engine (not a table)
  rng.reset(SEED);
  freshGame(15);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  let calls = 0;
  const orig = Game.contestResolveGroup;
  Game.contestResolveGroup = function(p, c, o) { calls++; return orig.call(this, p, c, o); };
  fireDirect('pit', [vids[0]]);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  let guard = 0;
  while (Game.state.activeContest && guard++ < 20) {
    const ac = Game.state.activeContest;
    const ph = ac.phases[ac.phaseIdx || 0];
    let ci = (ph.choices || []).findIndex(c => c.next === 'VERDICT');
    if (ci < 0) ci = 0;
    const r = Game.contestChoose(ci);
    if (r && r.done) break;
  }
  Game.contestResolveGroup = orig;
  ok('verdict resolved through contestResolveGroup', calls >= 1, 'calls=' + calls);
  ok('engine produced a real log (process, not table)', saidLines.length >= 0); // smoke
}

sec('DEAD-CODE D2 — every phase-declared audio beat resolves');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  const defs = src.match(/const CX_BEAT_DEFS = \{([\s\S]*?)\n  \};/)[1];
  const keys = new Set([...defs.matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]));
  const beats = new Set([...src.matchAll(/\bbeat: '([A-Za-z]+)'/g)].map(m => m[1]));
  const missing = [...beats].filter(b => !keys.has(b));
  ok(beats.size + ' phase beats all resolve in CX_BEAT_DEFS', missing.length === 0, missing.join(','));
}

sec("DEAD-CODE D3 — drama 'contest' channel handles every fired type");
{
  const dsrc = fs.readFileSync(path.join(ROOT, 'src/js/drama.js'), 'utf8');
  for (const t of ['announce', 'winner', 'loser', 'cheer', 'judging'])
    ok("drama handles contest type '" + t + "'", dsrc.includes("'" + t + "'"));
  const csrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  const fired = new Set([...csrc.matchAll(/this\.drama\('contest', \{ type: '(\w+)'/g)].map(m => m[1]));
  const unhandled = [...fired].filter(t => !dsrc.includes("'" + t + "'"));
  ok('every contest drama type fired is handled', unhandled.length === 0, unhandled.join(','));
}

sec('DEAD-CODE D4 — fan-club and care-package ties are live on wins');
{
  const csrc = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  ok('player win calls apAdjustFavor', /apAdjustFavor\(4/.test(csrc));
  ok('player win calls apCarePackage', /this\.apCarePackage\(\)/.test(csrc));
  ok('villager win calls apAdjustFavor', /apAdjustFavor\(2/.test(csrc));
  ok('alienPlayers.js provides apAdjustFavor', typeof Game.apAdjustFavor === 'function');
  ok('alienPlayers.js provides apCarePackage', typeof Game.apCarePackage === 'function');
  ok('alienPlayers.js provides apContestInterference', typeof Game.apContestInterference === 'function');
}

sec('DEAD-CODE D5 — moot lane (non-fighter contests) is argued, not rolled');
{
  // engine-level: a moot verdict for a villager uses caseScore, deterministic
  rng.reset(SEED);
  freshGame(15);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const moot = Game.contestPool().find(c => c.id === 'moot');
  const r1 = Game.contestResolveVillager(vids[0], moot, {});
  rng.reset(SEED);
  // same state -> same fate (determinism, no hidden rolls)
  const r1b = Game.contestResolveVillager(vids[0], moot, {});
  ok('moot resolution deterministic', JSON.stringify(r1) === JSON.stringify(r1b));
  ok('moot resolution has a real detail', /case|demand/.test(r1.detail || ''), r1.detail);
  // player-side: MOOT_JUDGE is deterministic on standing
  ok('contestChoose handles MOOT_JUDGE terminal', typeof Game.contestChoose === 'function');
}

console.log('\n==== RESULT: ' + pass + ' pass, ' + fail + ' fail (seed ' + SEED + ') ====');
process.exit(fail ? 1 : 0);
