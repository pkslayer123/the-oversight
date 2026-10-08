// Contest playability audit (Steve 2026-10-07: worker contest-fear).
// Play the FULL contest flow AS A PLAYER and judge feel:
//   eligibility -> contestTick -> fireContest (warning) -> countdown dread ->
//   resolveContest (teleport, unavoidable) -> interruption -> contest ->
//   aftermath/prizes -> gossip.
// Also: watch-mode (player not taken), refuse path, alien-players integration check.
//
// Harness: FULL src/js/*.js list in index.html order minus app.js, sprites.js,
// tile-scenes.js, move-anim.js, drama.js. One shared resettable RNG installed
// BEFORE eval (modules capture Math.random at load). window stubbed for eval,
// deleted before playing (else combat goes async and stalls).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- resettable shared RNG (installed BEFORE module eval) ----
let _seed = 20261008;
const RNG = {
  reset(s) { _seed = s >>> 0 || 1; },
  next() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; },
};
Math.random = RNG.next.bind(RNG);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

// window stub for the eval phase only (equipment.js needs it)
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js', 'src/js/villager-agency.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// ---- output capture ----
let log = [];
const _say = Game.say.bind(Game), _sys = Game.sysSay.bind(Game);
Game.say = t => { log.push(['say', String(t)]); return _say(t); };
Game.sysSay = t => { log.push(['sys', String(t)]); return _sys(t); };

function banner(t) { console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70)); }
function showLog(limit, tag) {
  const rows = tag ? log.filter(([k]) => k === tag) : log;
  rows.slice(-(limit || 40)).forEach(([k, t]) => console.log('  [' + k + '] ' + t.split('\n').join('\n  ')));
}
function fresh(day) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {} // villagers need grid positions to be eligible
  const s = Game.state.scholar;
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.showBudget = null;
  Game.state.contestsSeen = {};
  Game.state.notability = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  log = [];
  return s;
}
function playThrough(choiceIdxs) {
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 16) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase) { console.log('  STUCK: phase missing'); break; }
    if (!phase.choices || !phase.choices.length) { console.log('  STUCK: phase has no choices and no advance'); break; }
    const ci = choiceIdxs[Math.min(steps, choiceIdxs.length - 1)];
    const idx = Math.min(ci, phase.choices.length - 1);
    console.log(`\n>>> YOU CHOOSE: ${phase.choices[idx].label} (${phase.choices[idx].sub || ''})`);
    result = Game.contestChoose(idx);
    steps++;
    if (result && result.done) break;
  }
  return { result, steps };
}

(async () => {
  await Game.init();

  // ============ 1. ELIGIBILITY VISIBILITY ============
  banner('AUDIT 1: eligibility panel (visible eligibility — Steve\'s design)');
  fresh(15);
  const { eligible, reason } = Game.contestEligible();
  console.log('reason:', reason);
  console.log('eligible count:', eligible.length);
  eligible.slice(0, 4).forEach(e => console.log('  -', e.name, JSON.stringify(e.notability || []), JSON.stringify(e.notes || [])));
  console.log('... (remaining hidden for brevity)');
  fresh(10);
  console.log('day 10 (locked):', JSON.stringify(Game.contestEligible()));

  // ============ 2. FULL NATURAL FLOW: tick -> warning -> countdown -> resolve ============
  banner('AUDIT 2: FULL NATURAL FLOW — tick -> warning -> 1-day countdown -> resolve -> play PIT');
  fresh(20);
  Game.state.showBudget = null; Game.state.pendingContest = null;
  let fired = null;
  for (let d = 20; d < 30 && !fired; d++) {
    Game.state.scholar.day = d;
    fired = Game.contestTick();
  }
  console.log('contestTick fired:', fired ? fired.name || fired.id : 'NONE in 10 days (bad if no event)');
  showLog(25);
  if (fired && fired.id && Game.contestPool().find(c => c.id === fired.id)) {
    // simulate the countdown: pendingContest.firesDay
    const pc = Game.state.pendingContest;
    if (pc) {
      banner('COUNTDOWN DREAD: day before the grab — what does the player hear?');
      // Fire the contest to simulate the announcement path
      Game.state.pendingContest = null;
      Game.state.activeContest = null;
      log = [];
      Game.fireContest(fired);
      showLog(20);
      console.log('\npendingContest:', JSON.stringify(Game.state.pendingContest));
    }
  }

  // ============ 3. RESOLVE -> TELEPORT -> GRABBED PLAY (pit, aggressive) ============
  banner('AUDIT 3: resolveContest -> teleport -> grabbed PIT (no choice) — play it');
  fresh(20);
  const pit = Game.contestPool().find(c => c.id === 'pit');
  RNG.reset(42);
  log = [];
  Game.contestInterruption(Object.assign({}, pit, { givesChoice: false }), ['player']);
  showLog(30);
  const r1 = playThrough([0, 0, 0]); // aggressive-ish first options
  console.log('\n--- after playthrough ---');
  showLog(25);
  console.log('outcome:', JSON.stringify(r1.result));
  console.log('scholar:', { health: Game.state.scholar.health, kcal: Game.state.scholar.kcal, trauma: Game.state.scholar.trauma });
  console.log('codex.contests.pit:', JSON.stringify(Game.contestKnowledge('pit')));

  // ============ 4. WATCH MODE: player not taken ============
  banner('AUDIT 4: WATCH MODE — villagers taken, player watches');
  fresh(20);
  RNG.reset(7);
  const vids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id)).slice(0, 2);
  console.log('watching taken:', vids.map(v => Game.displayName(v)).join(', '));
  log = [];
  Game.contestInterruption(Object.assign({}, Game.contestPool().find(c => c.id === 'duel')), vids);
  showLog(30);
  const r4 = playThrough([0, 1, 0]);
  console.log('\n--- after watch ---');
  showLog(30);
  console.log('verdict result:', JSON.stringify(r4.result));

  // ============ 5. REFUSE PATH ============
  banner('AUDIT 5: REFUSE path — "say no on camera"');
  fresh(20);
  RNG.reset(99);
  log = [];
  Game.contestInterruption(Object.assign({}, Game.contestPool().find(c => c.id === 'oath')), ['player']);
  showLog(20);
  // choose REFUSE if choice phase present
  {
    const ac = Game.state.activeContest;
    if (ac && ac.phase === 'choice') {
      const ph = ac.phases[0];
      const refuseIdx = ph.choices.findIndex(c => c.next === 'REFUSE');
      console.log('refuse choice index:', refuseIdx);
      const res = Game.contestChoose(refuseIdx);
      console.log('refuse outcome:', JSON.stringify(res));
      showLog(20);
    } else {
      console.log('NOTE: no choice phase offered — player was grabbed (design: choice ~30%)');
    }
  }

  // ============ 6. ALIEN PLAYERS INTEGRATION ============
  banner('AUDIT 6: Alien Players integration into contests (alienPlayers.js READ-ONLY)');
  fresh(25);
  console.log('apEligible:', Game.apEligible ? Game.apEligible() : 'NO apEligible');
  const personas = Game.apPersonas ? Game.apPersonas() : [];
  console.log('persona count:', personas.length, '| first:', personas[0] && personas[0].id);
  console.log('apState keys:', Game.apState ? Object.keys(Game.apState()) : 'n/a');
  // grep-level integration: which contests.js references call into alienPlayers?
  const src = fs.readFileSync(path.join(ROOT, 'src/js/contests.js'), 'utf8');
  const hooks = ['apEligible', 'apPersona', 'apState', 'apKnown', 'alienPlayers', 'favor'].map(h =>
    h + ':' + (src.split(h).length - 1));
  console.log('contest.js references:', hooks.join(' | '));

  // ============ 7. PRIZE PATH ============
  banner('AUDIT 7: prize path — what does a WIN actually give?');
  fresh(20);
  RNG.reset(1234);
  log = [];
  Game.contestInterruption(Object.assign({}, Game.contestPool().find(c => c.id === 'pit')), ['player']);
  // find a WIN outcome path: play all choices, walk to a WIN choice
  {
    let guard = 0, lastRes = null;
    while (Game.state.activeContest && guard < 16) {
      const ac = Game.state.activeContest;
      const ph = ac.phases[ac.phaseIdx || 0];
      if (!ph || !ph.choices || !ph.choices.length) break;
      const winIdx = ph.choices.findIndex(c => c.next === 'WIN' || (c.do && c.do.prize));
      const idx = winIdx >= 0 ? winIdx : 0;
      console.log('>>> choose:', ph.choices[idx].label);
      lastRes = Game.contestChoose(idx);
      guard++;
      if (lastRes && lastRes.done) break;
    }
    console.log('end result:', JSON.stringify(lastRes));
    showLog(20);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
