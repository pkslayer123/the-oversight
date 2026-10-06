// Contest feel playtest run 3 (Steve 2026-10-06): PLAY 3 contests as a player.
// Run 1 (play-contest-fear.js): pit, maw, riddle, confession, honey, secrets.
// Run 2 (play-contest-fear-2.js): gauntlet, hide (watch), oath.
// This run: SIEGE (wave-3 extreme, never played — survive AND die),
// STARVE (endurance template, never played — full natural flow fire->resolve),
// DUEL (choice -> REFUSE path — refusal as a played sequence, not a skip).
// Turn hygiene: contestChoose only; never a trailing Game.tbAdvance().
// Usage: node scripts/play-contest-fear-3.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function rig(seq) {
  const o = Math.random; let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = o; };
}
let said = [];
let saying = false; // re-entrancy guard: say/sysSay cross-call through `this`
function hookSay() {
  said = [];
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => {
    if (saying) return orig(t);
    saying = true;
    said.push(String(t)); console.log('  ' + String(t).split('\n').join('\n  '));
    const r = orig(t); saying = false; return r;
  };
  Game.sysSay = (t) => {
    if (saying) return origSys(t);
    saying = true;
    said.push('[SYS] ' + String(t)); console.log('  ' + String(t).split('\n').join('\n  '));
    const r = origSys(t); saying = false; return r;
  };
}
function fresh(day) {
  hookSay(); // hook BEFORE depart so arrival text is captured quietly
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false;
  Game.log = [];
  Game.state.showBudget = null;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.contestsSeen = {};
  Game.state.notability = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  return s;
}
function byId(id) { return Game.contestPool().find(c => c.id === id); }
function playThrough(choiceIdxs, rngSeq) {
  const unrig = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 14) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) break;
    const ci = choiceIdxs[Math.min(steps, choiceIdxs.length - 1)];
    const idx = Math.min(ci, phase.choices.length - 1);
    console.log(`\n>>> YOU CHOOSE: ${phase.choices[idx].label} (${phase.choices[idx].sub || ''})`);
    result = Game.contestChoose(idx);
    steps++;
    if (result && result.done) break;
  }
  unrig();
  return result;
}
function banner(t) { console.log('\n' + '='.repeat(64) + '\n' + t + '\n' + '='.repeat(64)); }

(async () => {
  await Game.init();

  // ============ 1. SIEGE — survive run ============
  banner('PLAY 1: SIEGE (extreme, grabbed player) — survive run');
  {
    const s = fresh(26);
    Game.state.waveKills = { 1: 5, 2: 8 }; // unlock wave 3
    const siege = byId('siege');
    console.log(`wave=${Game.unlockedWave()} pool-has-siege=${!!siege}`);
    const unrig = rig([0.99, 0.99, 0.99]); // whim off; player preferred; grabbed
    Game.contestInterruption(Object.assign({}, siege, { givesChoice: false }), 'player');
    // hold the line, fall back, bring the fence down — smart play, no clowning
    const res = playThrough([0, 1, 1], [0.2, 0.5, 0.3, 0.8]);
    unrig();
    console.log(`\n--- outcome: ${res ? res.outcome : 'UNRESOLVED'} | hp ${s.health} | trauma ${s.trauma} | kcal ${s.kcal} ---`);
  }

  // ============ 2. SIEGE — death run ============
  banner('PLAY 2: SIEGE (extreme, grabbed player) — reckless run');
  {
    const s = fresh(26);
    Game.state.waveKills = { 1: 5, 2: 8 };
    const unrig = rig([0.99, 0.99, 0.99]);
    Game.contestInterruption(Object.assign({}, byId('siege'), { givesChoice: false }), 'player');
    // stand in the open, meet them head-on, hold the line — max damage path
    const res = playThrough([1, 0, 0], [0.99, 0.99, 0.99, 0.02]);
    unrig();
    console.log(`\n--- outcome: ${res ? res.outcome : 'UNRESOLVED'} | hp ${s.health} | over=${Game.state.over} ---`);
  }

  // ============ 3. STARVE — full natural flow ============
  banner('PLAY 3: STARVE (endurance) — fire day 15 -> resolve day 16, choice -> participate');
  {
    const s = fresh(15);
    // natural: fireContest today (announcement + countdown), resolve tomorrow
    const unrig = rig([0.99, 0.5]); // whim off; player preferred
    Game.fireContest(byId('starve'));
    unrig();
    console.log(`pending: contestId=${Game.state.pendingContest.contestId} firesDay=${Game.state.pendingContest.firesDay}`);
    // next dawn: resolve -> interruption with the CHOICE phase (choice roll < 0.3)
    s.day = 16;
    const unrig2 = rig([0.2]); // givesChoice rolls < 0.3 -> choice offered
    Game.resolveContest();
    const ac = Game.state.activeContest;
    console.log(`interruption phase=${ac && ac.phase} choices=${ac && ac.phases[0].choices.length}`);
    const res = playThrough([0, 1, 0, 0], [0.2, 0.5, 0.3, 0.8]); // participate + path
    unrig2();
    console.log(`\n--- outcome: ${res ? res.outcome : 'UNRESOLVED'} | hp ${s.health} | trauma ${s.trauma} | kcal ${s.kcal} ---`);
  }

  // ============ 4. DUEL — choice -> REFUSE ============
  banner('PLAY 4: DUEL (blood) — choice -> REFUSE (refusal as a played sequence)');
  {
    const s = fresh(15);
    const unrig = rig([0.99, 0.99, 0.2]); // whim off; player preferred; choice offered
    Game.contestInterruption(byId('duel'), 'player');
    unrig();
    const ac = Game.state.activeContest;
    console.log(`interruption phase=${ac.phase} phase0=${ac.phases[0].choices.map(c => c.label).join(' / ')}`);
    const res = playThrough([1], [0.5]); // REFUSE
    console.log(`\n--- outcome: ${res ? res.outcome : 'UNRESOLVED'} | hp ${s.health} | trauma ${s.trauma} ---`);
    console.log(`activeContest cleared: ${Game.state.activeContest === null}`);
  }

  console.log('\nrun-3 playtest complete.');
})();
