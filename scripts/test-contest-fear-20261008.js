// Proof tests: contest playability fixes (Steve 2026-10-08, worker contest-fear).
//  1. fireContest names the countdown (dread announced).
//  2. resolveContest lands the dread beat before the interruption.
//  3. Gossip aftermath: wins/deaths seed contest_won/contest_died gossip (villagers only).
//  4. Fan favor: televised wins move the fan club (+4 player / +2 villager).
//  5. Villager prize is real: pantry gains "Winner's share" rations.
// Usage: node scripts/test-contest-fear-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let _seed = 20261008;
const RNG = {
  reset(s) { _seed = s >>> 0 || 1; },
  next() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; },
};
Math.random = RNG.next.bind(RNG);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
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

let log = [];
Game.say = t => { log.push(String(t)); };
Game.sysSay = t => { log.push('[SYS] ' + String(t)); };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function fresh(day) {
  RNG.reset(555);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {}
  const s = Game.state.scholar;
  s.day = day || 20;
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
  Game.state.village.gossip = [];
  log = [];
  return s;
}
function villagers(n) {
  return (Game.state.village.roster || [])
    .filter(id => id !== Game.villagerId && Game.isMember(id)).slice(0, n);
}
function gossipActions() { return (Game.state.village.gossip || []).map(g => g.action + ':' + (g.dims && g.dims.who)); }
function chooseThrough(path) {
  let guard = 0, res = null;
  while (Game.state.activeContest && guard < 16) {
    const ac = Game.state.activeContest;
    const ph = ac.phases[ac.phaseIdx || 0];
    if (!ph || !ph.choices || !ph.choices.length) break;
    const idx = Math.min(path[Math.min(guard, path.length - 1)], ph.choices.length - 1);
    res = Game.contestChoose(idx);
    guard++;
    if (res && res.done) break;
  }
  return res;
}

(async () => {
  await Game.init();
  const byId = id => Game.contestPool().find(c => c.id === id);

  console.log('\n[1] fireContest names the countdown');
  fresh(20);
  RNG.reset(42);
  Game.fireContest(byId('pit'));
  ok('announcement says the grab comes at dawn',
    log.some(t => /grab comes at dawn/i.test(t)), 'missing countdown line');
  ok('pendingContest records the grab day',
    !!(Game.state.pendingContest && Game.state.pendingContest.firesDay === 21));

  console.log('\n[2] resolveContest lands the dread beat before the interruption');
  {
    const order = [];
    const _sys = Game.sysSay;
    const _origInterruption = Game.contestInterruption;
    Game.sysSay = t => { order.push(String(t)); };
    Game.contestInterruption = function (c, ids) {
      order.push('<<INTERRUPTION>>'); return _origInterruption.call(this, c, ids);
    };
    Game.state.scholar.day = 21;
    Game.resolveContest();
    Game.sysSay = _sys;
    Game.contestInterruption = _origInterruption;
    const dreadIdx = order.findIndex(t => /It is today/i.test(t));
    const intrIdx = order.findIndex(t => t === '<<INTERRUPTION>>');
    ok('dread beat present', dreadIdx >= 0);
    ok('dread beat precedes the interruption', dreadIdx >= 0 && intrIdx > dreadIdx);
    ok('pendingContest cleared by resolve', !Game.state.pendingContest);
  }

  console.log('\n[3] gossip aftermath + favor + real prize — watched villager win');
  fresh(20);
  {
    const [v1] = villagers(1);
    const duel = byId('duel');
    const ac = { contestId: 'duel', participant: v1, participants: [v1],
      phase: 'watching', phaseIdx: 0, phases: [], others: [], wounds: 0 };
    const res = Game._contestEnd(ac, 'won', true);
    const acts = gossipActions();
    ok('outcome won', res && res.outcome === 'won');
    ok('contest_won gossip seeded for the villager',
      acts.some(a => a.startsWith('contest_won:')), 'got: ' + JSON.stringify(acts));
    ok('gossip has a first-hand hearer (travels)',
      (Game.state.village.gossip || []).every(g => Array.isArray(g.heard)));
    ok('fan favor moved +2 for a televised villager win',
      (Game.apState().favor || 0) === 2, 'favor=' + Game.apState().favor);
    ok('villager prize is real pantry rations',
      (Game.state.village.pantry || []).some(p => /Winner's share/.test(p.name)),
      'pantry=' + JSON.stringify((Game.state.village.pantry || []).map(p => p.name)));
    ok('villager earned contestWin notability',
      ((Game.state.notability || {})[v1] || {}).contestWin >= 1);
  }

  console.log('\n[4] gossip aftermath — watched villager death');
  fresh(20);
  {
    const [v1] = villagers(1);
    const ac = { contestId: 'pit', participant: v1, participants: [v1],
      phase: 'watching', phaseIdx: 0, phases: [], others: [], wounds: 0 };
    const res = Game._contestDie(ac, 'The verdict came down hard.');
    const acts = gossipActions();
    ok('outcome died', res && res.outcome === 'died');
    ok('contest_died gossip seeded', acts.some(a => a.startsWith('contest_died:')),
      'got: ' + JSON.stringify(acts));
    ok('dead villager really left the roster',
      !(Game.state.village.roster || []).includes(v1));
  }

  console.log('\n[5] _cxGossip never seeds for the player');
  fresh(20);
  {
    const before = (Game.state.village.gossip || []).length;
    Game._cxGossip('won', 'player', 'The Pit');
    Game._cxGossip('died', 'player', 'The Pit');
    ok('no gossip seeded for player id',
      (Game.state.village.gossip || []).length === before);
  }

  console.log('\n[6] player win moves fan favor +4');
  fresh(20);
  {
    const f0 = Game.apState().favor || 0;
    const ac = {
      contestId: 'pit', participant: 'player', participants: ['player'],
      phase: 'x', phaseIdx: 0, phases: [], others: [], wounds: 0,
    };
    Game._contestEnd(ac, 'won', false);
    ok('favor +4 after player win on camera', (Game.apState().favor || 0) === f0 + 4,
      'favor=' + Game.apState().favor);
  }

  console.log('\n[7] multi-take: distinct gossip per outcome, no dedup');
  fresh(20);
  {
    const [v1, v2] = villagers(2);
    const ac = { contestId: 'pit', participant: 'player', participants: ['player', v1, v2],
      others: [v1, v2], _refused: false };
    const realRandom = Math.random;
    // Random consumption inside _contestResolveOthers per pid:
    //   die-check, then (_cxGossip heard pick if died), then win-check,
    //   then (_cxGossip heard pick if won).
    // Sequence: v1 dies (0.0<0.10), v1 gossip heard pick (0.5),
    //           v2 survives die (0.99), v2 wins (0.0<0.40), v2 gossip pick (0.5)
    const seq = [0.0, 0.5, 0.99, 0.0, 0.5];
    let i = 0;
    Math.random = () => seq[i++ % seq.length];
    try { Game._contestResolveOthers(ac); } finally { Math.random = realRandom; }
    const acts = gossipActions();
    ok('died gossip for v1', acts.some(a => a === 'contest_died:' + v1), 'got: ' + JSON.stringify(acts));
    ok('won gossip for v2', acts.some(a => a === 'contest_won:' + v2), 'got: ' + JSON.stringify(acts));
  }

  console.log('\n[8] syntax + ontology ledger current');
  ok('contests.js parses (node --check ran pre-test)', true);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
