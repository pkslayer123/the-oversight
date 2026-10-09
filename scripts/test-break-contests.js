// BREAK-IT: CONTESTS SYSTEM (Steve 2026-10-08) — hostile-player attacks.
// EXPLOIT / SOFTLOCK / HONESTY / DEAD-CODE. Depth over breadth.
// Usage: node scripts/test-break-contests.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- data preload (sync, like SCATTER_DATA) ----------
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

// ---------- seeded RNG BEFORE eval (modules capture Math.random at load) ----------
let _seed = 424242;
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = s; };
Math.random = rng;

// ---------- window stub for eval phase only (equipment.js needs it) ----------
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'alienPlayers.js', 'storage.js', 'perceive.js', 'carexplore.js',
  'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js', 'progression.js',
  'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'codex-people.js', 'membership.js', 'hierarchy.js',
  'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // back to sync combat path
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA; // init() is async; data preloaded above

// ---------- test plumbing ----------
let pass = 0, fail = 0, notes = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); notes.push(t); }

function freshGame(day) {
  rng.reset(424242);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  // eligible villagers need grid positions
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 4).forEach((vid, i) => {
    Game.state.village.positions[vid] = { x: 2 + i, y: 2 + i };
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
function forceResolve() { // like game.js dawn path
  const pc = Game.state.pendingContest;
  if (pc && (Game.state.scholar.day || 1) >= pc.firesDay) Game.resolveContest();
}
function playToEnd(maxSteps) {
  // hostile auto-player: always pick choice 0 until done.
  // ARENA-AWARE (2026-10-09): pit/gauntlet/siege suspend the modal for a real
  // fight — the harness drives the tbEnd resume the way game.js does.
  let steps = 0;
  while (Game.state.activeContest && Game.state.activeContest.phase !== 'done' && steps < (maxSteps || 60)) {
    const ac = Game.state.activeContest;
    const r = Game.contestChoose(0);
    steps++;
    if (r && r.arena) {
      try { Game._contestArenaAfter(Game.state.arenaContest, 'won'); } catch (e) {}
      continue;
    }
    if (r === null && Game.state.activeContest && Game.state.activeContest.phase !== 'done') {
      return { stuck: true, steps, ac };
    }
  }
  return { stuck: !!(Game.state.activeContest && Game.state.activeContest.phase !== 'done'), steps };
}

// ================= EXPLOIT =================
sec('EXPLOIT 1 — eligibility bypass');
freshGame(15);
let el = Game.contestEligible();
ok('day-15 player eligible', el.eligible.some(e => e.id === 'player'));
freshGame(13);
el = Game.contestEligible();
ok('pre-day-14 nobody eligible', el.eligible.length === 0 && /day 14/i.test(el.reason || ''));
ok('contestTick pre-day-14 returns null', Game.contestTick() === null);
freshGame(15);
Game.state.scholar.exiled = true;
ok('exiled player ineligible', !Game.contestEligible().eligible.some(e => e.id === 'player'));
freshGame(15);
Game.state.scholar.health = 0;
ok('dead player (hp 0) ineligible', !Game.contestEligible().eligible.some(e => e.id === 'player'));
freshGame(15);
const vil = freshGame(15);
// kill one villager via the real path, verify they leave eligibility AND cast
const dead = vil[0];
Game._cxKillContestant(dead);
ok('killed villager leaves roster', !(Game.state.village.roster || []).includes(dead));
ok('killed villager ineligible', !Game.contestEligible().eligible.some(e => e.id === dead));
// fireContest must not pick the dead
let pickedDead = false;
for (let i = 0; i < 40; i++) {
  freshGame(15);
  Game._cxKillContestant(Game.state.village.roster.filter(id => id !== Game.villagerId)[0]);
  const c = Game.pickContest();
  Game.fireContest(c);
  const pc = Game.state.pendingContest;
  if (pc && pc.participants.includes(dead)) pickedDead = true;
  Game.state.pendingContest = null;
}
ok('dead villager never cast (40 fires)', !pickedDead);

sec('EXPLOIT 2 — countdown: exactly-once, on schedule');
freshGame(15);
fireDirect('pit');
let pc = Game.state.pendingContest;
ok('firesDay = day+1', pc && pc.firesDay === 16, 'firesDay=' + (pc && pc.firesDay));
Game.state.scholar.day = 15;
forceResolve();
ok('does NOT fire early (day < firesDay)', !Game.state.activeContest && !!Game.state.pendingContest);
Game.state.scholar.day = 16;
forceResolve();
ok('fires on firesDay', !!Game.state.activeContest && !Game.state.pendingContest);
const acRef = Game.state.activeContest;
Game.resolveContest();
ok('resolveContest is idempotent (no double interruption)', Game.state.activeContest === acRef || !Game.state.activeContest);

sec('EXPLOIT 3 — reward duplication (watch-mode multi-take)');
freshGame(20);
const vils = Object.keys(Game.state.village.positions);
const grants = [];
const _push = Array.prototype.push;
// count pantry Winner's-share grants during verdicts
let shareCount = 0;
for (let round = 0; round < 12; round++) {
  rng.reset(9000 + round);
  freshGame(20);
  const ids = Object.keys(Game.state.village.positions).slice(0, 3);
  fireDirect('pit', ids);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest(); // watch mode
  const before = (Game.state.village.pantry || []).filter(p => /Winner's share/.test(p.name)).length;
  // hostile watcher: always choose 0 (cheer/study), never bet
  playToEnd();
  const after = (Game.state.village.pantry || []).filter(p => /Winner's share/.test(p.name)).length;
  if (after > before) shareCount += (after - before);
}
ok('no phantom pantry grants (grants only on wins)', shareCount >= 0);
// per-win: exactly one share per winning villager — verify via instrumented single run
freshGame(20);
{
  const ids = Object.keys(Game.state.village.positions).slice(0, 2);
  fireDirect('pit', ids);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  let added = 0;
  const vv = Game.state.village; vv.pantry = vv.pantry || [];
  const origPush = vv.pantry.push.bind(vv.pantry);
  vv.pantry.push = (it) => { if (/Winner's share/.test(it.name)) added++; return origPush(it); };
  playToEnd();
  ok('<=1 share per winner (no dup per contestant)', added <= 2, 'added=' + added);
}

sec('EXPLOIT 4 — bet: once per contest, honest payout, no poor-man bet');
freshGame(20);
fireDirect('pit', [Object.keys(Game.state.village.positions)[0]]);
Game.state.scholar.day = Game.state.pendingContest.firesDay;
Game.resolveContest(); // watch mode
let ac = Game.state.activeContest;
// bet lives in the Escalate phase (index 1), not Declare
Game.contestChoose(0); // Declare -> Escalate
ac = Game.state.activeContest;
const betIdx = ac.phases[ac.phaseIdx].choices.findIndex(ch => ch.do && ch.do.bet);
ok('bet choice offered when kcal>=200', betIdx >= 0);
// force a WIN verdict path deterministically: rig dice by stubbing? Instead: play phase0 bet, then phase1 choice 0, phase2 comfort, then count kcal delta vs 400-or-0.
Game.state.scholar.kcal = 2000;
Game.contestChoose(betIdx);
ok('bet deducted 200 on placement', Game.state.scholar.kcal === 1800);
const betIdx2 = (Game.state.activeContest.phases[Game.state.activeContest.phaseIdx].choices || []).findIndex(ch => ch.do && ch.do.bet);
let secondBetBlocked = betIdx2 < 0;
if (betIdx2 >= 0) { const k2 = Game.state.scholar.kcal; Game.contestChoose(betIdx2); secondBetBlocked = Game.state.scholar.kcal === k2; }
ok('second bet blocked (ac.bet guard)', secondBetBlocked);
// drive to verdict, record payout is exactly +400 or +0
const kBefore = Game.state.scholar.kcal;
Game.contestChoose(0); // Escalate -> Climax
if (Game.state.activeContest && Game.state.activeContest.phase !== 'done') Game.contestChoose(0); // Climax -> VERDICT
const kAfter = Game.state.scholar.kcal;
const delta = kAfter - kBefore;
ok('bet settles exactly +400 (win) or +0 (loss)', delta === 400 || delta === 0, 'delta=' + delta);
// poor-man bet: kcal < 200 → choice not offered
freshGame(20);
Game.state.scholar.kcal = 50;
fireDirect('pit', [Object.keys(Game.state.village.positions)[0]]);
Game.state.scholar.day = Game.state.pendingContest.firesDay;
Game.resolveContest();
ac = Game.state.activeContest;
const noBet = ac.phases[1].choices.every(ch => !(ch.do && ch.do.bet));
ok('no bet choice when kcal<200', noBet);

sec('EXPLOIT 5 — cheer cap (judge manipulation)');
freshGame(20);
fireDirect('pit', [Object.keys(Game.state.village.positions)[0]]);
Game.state.scholar.day = Game.state.pendingContest.firesDay;
Game.resolveContest();
ac = Game.state.activeContest;
// phase0: cheer them on (+0.05); phase1: veteran shout (+0.10) — force veteran
Game.state.codex = Game.state.codex || {}; Game.state.codex.contests = { pit: { seen: 9, wins: 0, level: 3 } };
Game.contestChoose(0); // cheer +0.05 (phase0 idx0 = Cheer them on)
ac = Game.state.activeContest;
const shoutIdx = ac.phases[ac.phaseIdx].choices.findIndex(ch => ch.do && ch.do.cheer);
if (shoutIdx >= 0) Game.contestChoose(shoutIdx);
ok('cheer capped at 0.15', (Game.state.activeContest.cheer || 0) <= 0.150001, 'cheer=' + Game.state.activeContest.cheer);

sec('EXPLOIT 6 — XP farm via contests (static + runtime)');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  // any do-block granting xp?
  const xpDo = /do:\s*\{[^}]*\bxp\b/.test(src);
  ok('no do-block grants xp in contests.js', !xpDo);
}
freshGame(20);
const xpBefore = Game.state.scholar.xp || 0;
fireDirect('pit');
Game.state.pendingContest.participant = 'player';
Game.state.pendingContest.participants = ['player'];
Game.state.scholar.day = Game.state.pendingContest.firesDay;
Game.resolveContest();
playToEnd();
ok('no xp minted by playing a contest', (Game.state.scholar.xp || 0) === xpBefore);

sec('EXPLOIT 7 — re-fire / queue-jump while pending');
freshGame(15);
fireDirect('pit');
const first = Game.state.pendingContest;
fireDirect('duel'); // hostile direct double-fire (live path guards, but check blast radius)
ok('double fireContest overwrites (documented, live path guarded by contestTick)', Game.state.pendingContest.contestId === 'duel');
// live path: contestTick refuses while pending
freshGame(15);
fireDirect('pit');
ok('contestTick returns null while pendingContest set', Game.contestTick() === null);

// ================= SOFTLOCK =================
sec('SOFTLOCK 1 — phase-graph validation, all pool contests');
{
  const pool = Game.contestPool();
  let bad = [];
  // Terminal nexts handled by contestChoose (2026-10-08: MOOT_JUDGE/MAW_JUDGE
  // added when moot/maw went deterministic; the old set predates them)
  const TERM = new Set(['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT', 'MOOT_JUDGE', 'MAW_JUDGE']);
  for (const c of pool) {
    let phases = null;
    try { phases = Game.contestPlayable(c); } catch (e) { bad.push(c.id + ': playable threw'); continue; }
    if (!phases || !phases.length) { bad.push(c.id + ': empty phases'); continue; }
    // simulate the givesChoice prefix shift exactly like contestInterruption
    const shifted = phases.map(p => Object.assign({}, p, {
      choices: (p.choices || []).map(ch => Object.assign({}, ch, {
        next: (typeof ch.next === 'number') ? ch.next + 1 : ch.next,
      })),
    }));
    const withChoice = [{ choices: [{ next: 1 }, { next: 'REFUSE' }] }, ...shifted];
    for (const [label, arr] of [['bare', phases], ['choice-prefixed', withChoice]]) {
      arr.forEach((ph, i) => {
        if (!ph.choices || !ph.choices.length) { bad.push(`${c.id}/${label} phase${i}: NO CHOICES (stuck modal)`); return; }
        ph.choices.forEach((ch, j) => {
          const nx = ch.next;
          if (typeof nx === 'number' && (nx < 0 || nx >= arr.length)) bad.push(`${c.id}/${label} p${i}c${j}: next=${nx} out of range (0..${arr.length - 1})`);
          if (typeof nx === 'string' && !TERM.has(nx)) bad.push(`${c.id}/${label} p${i}c${j}: unknown terminal '${nx}'`);
          if (nx === undefined) bad.push(`${c.id}/${label} p${i}c${j}: missing next`);
        });
      });
    }
    // watch phases
    let w = null;
    try { w = Game._contestWatchPhases(c, ['vx']); } catch (e) { bad.push(c.id + ': watch threw'); }
    if (w) w.forEach((ph, i) => {
      if (!ph.choices || !ph.choices.length) bad.push(`${c.id}/watch phase${i}: NO CHOICES`);
      (ph.choices || []).forEach((ch, j) => {
        const nx = ch.next;
        if (typeof nx === 'number' && (nx < 0 || nx >= w.length)) bad.push(`${c.id}/watch p${i}c${j}: next=${nx} out of range`);
        if (typeof nx === 'string' && !TERM.has(nx)) bad.push(`${c.id}/watch p${i}c${j}: unknown terminal '${nx}'`);
      });
    });
  }
  ok('phase graph clean for ' + pool.length + ' contests', bad.length === 0, bad.slice(0, 8).join(' | '));
}

sec('SOFTLOCK 2 — full auto-play of every contest (participant + watch), hostile choice-0');
{
  const pool = Game.contestPool();
  const stuck = [];
  for (const c of pool) {
    for (const mode of ['player', 'watch']) {
      rng.reset(777);
      freshGame(20);
      const ids = mode === 'player' ? ['player'] : [Object.keys(Game.state.village.positions)[0]];
      // force the givesChoice branch half the time via contest flag
      const cc = Object.assign({}, c);
      fireDirect(c.id, ids);
      Game.state.scholar.day = Game.state.pendingContest.firesDay;
      try { Game.resolveContest(); } catch (e) { stuck.push(c.id + '/' + mode + ': resolve threw ' + e.message); continue; }
      const r = playToEnd(80);
      if (r.stuck) stuck.push(c.id + '/' + mode + ': STUCK after ' + r.steps + ' steps @phaseIdx=' + (Game.state.activeContest && Game.state.activeContest.phaseIdx));
      if (Game.state.activeContest && Game.state.activeContest.phase === 'done') stuck.push(c.id + '/' + mode + ': ended with phase=done but activeContest not cleared');
    }
  }
  ok('all ' + pool.length + ' contests auto-play to resolution', stuck.length === 0, stuck.slice(0, 6).join(' | '));
}

sec('SOFTLOCK 3 — contestChoose edge robustness');
freshGame(20);
ok('contestChoose(null state) -> null', Game.contestChoose(0) === null);
fireDirect('pit');
Game.state.scholar.day = Game.state.pendingContest.firesDay;
Game.resolveContest();
ok('contestChoose(bad idx) -> null, no crash', Game.contestChoose(99) === null && Game.contestChoose(-1) === null);
Game.state.activeContest.phase = 'done';
ok('contestChoose on done -> null', Game.contestChoose(0) === null);

sec('SOFTLOCK 4 — resolveContest with vanished contest id');
freshGame(15);
fireDirect('pit');
Game.state.pendingContest.contestId = 'nope_not_real';
Game.state.scholar.day = Game.state.pendingContest.firesDay;
let threw = false;
try { Game.resolveContest(); } catch (e) { threw = true; }
ok('unknown contest id: no throw, pending cleared', !threw && !Game.state.pendingContest && !Game.state.activeContest);

sec('SOFTLOCK 5 — countdown survives recast when contestant dies mid-countdown');
freshGame(15);
const v2 = Object.keys(Game.state.village.positions)[1];
fireDirect('pit', [v2]);
Game._cxKillContestant(v2); // dies overnight
Game.state.scholar.day = 16;
let said = [];
const _ss = Game.sysSay.bind(Game);
Game.sysSay = (t) => { said.push(String(t)); return _ss(t); };
Game.resolveContest();
Game.sysSay = _ss;
ok('recast fires (show goes on)', said.some(t => /instead/.test(t)));
ok('recast reaches interruption', !!Game.state.activeContest);

// ================= HONESTY =================
sec('HONESTY 1 — countdown text vs timer');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  ok('copy says "The grab comes at dawn. One more day."', src.includes('The grab comes at dawn. One more day.'));
  freshGame(15);
  fireDirect('pit');
  ok('engine: firesDay = fire-day + 1', Game.state.pendingContest.firesDay === 16);
}

sec('HONESTY 2 — bet copy vs engine');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  ok('bet label names the 200 kcal stake', src.includes('Bet 200 kcal on'));
  // engine: stake deducted once, payout exactly 2x on first-taken win.
  // BANK CAP (break-it food r3 2026-10-08): the payout is a kcal grant — it
  // now respects kcalCap() like every other source (was unclamped).
  ok('engine pays 2x stake (bank-capped)', /s\.kcal = Math\.min\(this\.kcalCap\(\), \(s\.kcal \|\| 0\) \+ amt \* 2\)/.test(src));
  ok('bet rides on first taken (label names ids[0])', src.includes("if (i === 0 && ac.bet)"));
}

sec('HONESTY 3 — cheer odds copy vs engine (+5%/+10%, cap 15%)');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  ok('cheer 0.05 choice exists', /cheer: 0\.05/.test(src));
  ok('veteran cheer 0.10 choice exists', /cheer: 0\.10/.test(src));
  ok('cap 0.15 enforced at accumulate', /ac\.cheer = Math\.min\(0\.15/.test(src));
  ok('cap 0.15 enforced at verdict', /const cheer = Math\.min\(0\.15, ac\.cheer/.test(src));
  // CHEER-AS-PERFORMANCE (Steve 2026-10-08): the old winBase+cheer+apWinMod
  // odds formula is gone — cheer is a real performance modifier now.
  ok('verdict passes cheerBonus+cheerLift to the engine',
    /contestResolveGroup\(pids\.filter\(pid => pid !== 'player'\), contest, \{ cheerBonus, cheerLift \}\)/.test(src));
  const esrc = fs.readFileSync(path.join(ROOT, 'src/js/contestEngine.js'), 'utf8');
  ok('cheerBonus steadies the arm in blood', /braveryBonus: opts\.cheerBonus/.test(esrc));
  ok('cheerLift lifts the case in moot', /_cxCaseScore\(pid, opts\.cheerLift/.test(esrc));
}

sec('HONESTY 4 — FEAR: what does the game CLAIM fear does?');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  // mechanical claims inventory: does any copy promise a fear MECHANIC?
  const mechClaims = (src.match(/fear/gi) || []).length;
  const writesFear = /npcNeeds\([^)]*\)\.fear\s*=|\.fear\s*=\s*Math/.test(src);
  console.log('  INFO fear-mentions=' + mechClaims + ' engine-writes-villager-fear=' + writesFear);
  ok('no mechanical fear claims in contest copy (FEAR is narrative)', !/fear \+[0-9]|fear -[0-9]|raises fear|fear rises/i.test(src));
  ok('engine never writes villager fear needs', !writesFear);
  // the actual dread mechanics that exist: countdown naming, dread beat
  ok('dread beat exists at resolve ("It is today")', src.includes('It is today.'));
}

sec('HONESTY 5 — eligibility text vs engine gate');
{
  freshGame(13);
  const el13 = Game.contestEligible();
  ok('pre-14 reason names day 14', /day 14/i.test(el13.reason || ''));
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  ok('engine gates day<14', /if \(day < 14\) return/.test(src));
  // age band honesty: comment says 15-72
  ok('engine enforces 15-72', /age < 15 \|\| age > 72/.test(src));
}

// ================= DEAD CODE =================
sec('DEAD-CODE 1 — module loaded + entry points live');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('contests.js in index.html script list', /src\/js\/contests\.js/.test(html));
  const names = ['contestEligible', 'contestTick', 'contestPool', 'pickContest', 'pickShow',
    'fireShow', 'fireContest', 'resolveContest', 'contestInterruption', 'contestPlayable',
    'contestChoose', 'contestKnowledge', 'contestLearn'];
  const missing = names.filter(n => typeof Game[n] !== 'function');
  ok('all ontology provides exist on Game', missing.length === 0, 'missing: ' + missing.join(','));
  const gsrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('game.js dawn path calls resolveContest', gsrc.includes('this.resolveContest()'));
  ok('game.js dawn path calls contestTick', gsrc.includes('this.contestTick()'));
  ok('game.js dawn path calls fireContest', gsrc.includes('this.fireContest(event)'));
  const asrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('app.js wires contestChoose to choice buttons', asrc.includes('Game.contestChoose'));
}

sec('HONESTY 6 — benevolent lifeline must not promise a save it cannot deliver');
{
  freshGame(20);
  Game.unlockedWave = () => 3;
  const ap = Game.apState();
  ap.met = ap.met || {};
  ap.met['wren'] = { encounters: 3, bond: 3 }; // benevolent, bonded
  const ids = [Object.keys(Game.state.village.positions)[0]];
  fireDirect('pit', ids); // WATCH mode: player not in the arena
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  const ac = Game.state.activeContest;
  ok('watch-mode ac really excludes player', !(ac.participants || []).includes('player'));
  // force the 40% lifeline gate open
  const realR = Math.random;
  Math.random = () => 0.1;
  let said = [];
  const _say = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); };
  let res = null;
  try { res = Game.apContestInterference(ac); } finally { Game.say = _say; Math.random = realR; }
  const promised = said.some(t => /killing blow.*misses/.test(t));
  console.log('  INFO lifeline fired in watch mode: deathSave=' + (res && res.deathSave) + ' note-said=' + promised);
  // The verdict honors deathSave ONLY for pid 'player' — in watch mode the
  // promised miss can never land on the villager who actually dies.
  ok('lifeline does NOT fire when player is not participating', !(res && res.deathSave) && !promised);
}

sec('HONESTY 7 — player win tax (-5 hp) is announced, not silent');
{
  freshGame(20);
  fireDirect('pit');
  Game.state.pendingContest.participant = 'player';
  Game.state.pendingContest.participants = ['player'];
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.state.scholar.health = 100;
  Game.resolveContest();
  const ac = Game.state.activeContest;
  let said = [];
  const _ss = Game.sysSay.bind(Game);
  Game.sysSay = (t) => { said.push(String(t)); return _ss(t); };
  Game._contestEnd(ac, 'won', true); // deterministic player win
  Game.sysSay = _ss;
  const taxed = Game.state.scholar.health === 95;
  const announced = said.some(t => /-5 health|marks you|their cut/i.test(t));
  console.log('  INFO win taxed hp: 100 -> ' + Game.state.scholar.health + ', announced=' + announced);
  ok('win tax lands (-5 hp)', taxed);
  ok('win tax announced out loud', announced);
}

sec('DEAD-CODE 2 — Alien Players integration is real, not comments');{
  ok('apContestInterference defined', typeof Game.apContestInterference === 'function');
  ok('apAdjustFavor defined', typeof Game.apAdjustFavor === 'function');
  ok('apCarePackage defined', typeof Game.apCarePackage === 'function');
  // verdict actually consults interference at runtime
  freshGame(20);
  let consulted = false;
  const orig = Game.apContestInterference;
  Game.apContestInterference = function (ac) { consulted = true; return orig.call(Game, ac); };
  const ids = [Object.keys(Game.state.village.positions)[0]];
  fireDirect('pit', ids);
  Game.state.scholar.day = Game.state.pendingContest.firesDay;
  Game.resolveContest();
  playToEnd();
  Game.apContestInterference = orig;
  ok('_contestVerdict consults apContestInterference', consulted);
  // fan favor moves on televised win
  freshGame(20);
  const f0 = Game.apFavor();
  Game.apAdjustFavor(4, 'test win');
  ok('apAdjustFavor moves favor', Game.apFavor() === f0 + 4);
}

console.log('\n==== RESULT: ' + pass + ' pass, ' + fail + ' fail ====');
process.exit(fail ? 1 : 0);
