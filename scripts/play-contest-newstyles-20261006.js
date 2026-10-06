// FEEL-PLAYTEST the 4 new contest styles (price/impress/exchange/auction),
// added in d0a4870 (Steve 2026-10-06), as a PLAYER judging fun and fear.
// Drive every branch/choice at least once across runs, including losing,
// refusing, dying, and watch-mode (non-participant show).
// Evidence note: evidence/2026-10-06/contest-newstyles-feel-20261006.md
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/contests.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let seed = 987654321;
function srand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

const FULL = {}; // label -> transcript (for the evidence note)

// Play one contest. opts: {randomFn, givesChoice, participant, codexLevel}
function play(id, choicePath, label, opts = {}) {
  const transcript = [];
  const _say = Game.say.bind(Game);
  const _sysSay = Game.sysSay.bind(Game);
  Game.say = function(t) { transcript.push(t); };
  Game.sysSay = function(t) { transcript.push(t); };
  Game.state.over = false;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2200;
  Game.state.scholar.trauma = 0;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  // knowledge level control
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = Game.state.codex.contests || {};
  if (opts.codexLevel != null) {
    Game.state.codex.contests[id] = { seen: opts.codexLevel === 3 ? 6 : 3, wins: 1, level: opts.codexLevel };
  } else {
    delete Game.state.codex.contests[id];
  }
  const contest = Game.contestPool().find(c => c.id === id);
  const realRandom = Math.random;
  Math.random = () => 0.99; // stable during interruption setup
  const part = opts.participant || 'player';
  try {
    Game.contestInterruption(Object.assign({}, contest, { givesChoice: !!opts.givesChoice }), part);
  } catch (e) {
    Game.say = _say; Game.sysSay = _sysSay; Math.random = realRandom;
    return { error: 'interruption threw: ' + e.message };
  }
  Math.random = opts.randomFn || srand;
  let steps = 0, result = null, stuck = false;
  while (Game.state.activeContest && steps < 14) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase) { stuck = true; break; }
    if (!phase.choices || !phase.choices.length) {
      if (phase.next === 'WIN' || phase.next === 'LOSE' || result) break;
      stuck = true; break;
    }
    const idx = Math.min(choicePath[steps % choicePath.length], phase.choices.length - 1);
    const ch = phase.choices[idx];
    transcript.push(`>>> CHOOSE: ${ch.label}`);
    try {
      result = Game.contestChoose(idx);
    } catch (e) {
      Game.say = _say; Game.sysSay = _sysSay; Math.random = realRandom;
      return { error: 'choose threw: ' + e.message, transcript };
    }
    steps++;
    if (result && result.done) break;
  }
  if (Game.state.activeContest && steps >= 14 && !result) stuck = true;
  Game.say = _say; Game.sysSay = _sysSay; Math.random = realRandom;
  const outcome = result ? result.outcome : (Game.state.activeContest ? 'UNRESOLVED' : 'ended');
  FULL[label] = { transcript, outcome, steps };
  return { outcome, transcript, stuck, steps };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2200;
  Game.state.systemArrived = true;
  const roster = Game.state.village.roster || [];
  const villagerId = typeof roster[1] === 'string' ? roster[1] : (roster[1] && roster[1].id);
  const NO_DEATH = () => 0.99, ALWAYS_DEATH = () => 0.0;

  const runs = [
    // PRICE — social horror, extreme (no-death random so paths resolve cleanly)
    ['price', [0, 0, 0], 'price-volunteer-winpath', { randomFn: NO_DEATH }],
    ['price', [2, 2, 2], 'price-deflect-survive', { randomFn: NO_DEATH }],
    ['price', [1, 1, 1], 'price-defiant-losepath', { randomFn: NO_DEATH }],
    ['price', [0, 0, 0], 'price-volunteer-death', { randomFn: ALWAYS_DEATH }],
    ['price', [1], 'price-refuse-choice', { givesChoice: true, randomFn: NO_DEATH }],
    // IMPRESS — creation, medium
    ['impress', [0, 0, 0], 'impress-grief-win', { randomFn: NO_DEATH }],
    ['impress', [2, 2, 2], 'impress-silence-losepath', { randomFn: NO_DEATH }],
    ['impress', [0, 1, 0], 'impress-double-down-death', { randomFn: ALWAYS_DEATH }],
    // EXCHANGE — team relay, high
    ['exchange', [0, 0, 0], 'exchange-sprint-win', { randomFn: NO_DEATH }],
    ['exchange', [1, 1, 2], 'exchange-fall-short-lose', { randomFn: NO_DEATH }],
    ['exchange', [2, 1, 0], 'exchange-shortcut-death', { randomFn: ALWAYS_DEATH }],
    // AUCTION — economic horror, high
    ['auction', [0, 0, 0], 'auction-everything-win', { randomFn: NO_DEATH }],
    ['auction', [1, 1, 2], 'auction-walk-away-lose', { randomFn: NO_DEATH }],
    ['auction', [2, 1, 1], 'auction-bluff-death', { randomFn: ALWAYS_DEATH }],
  ];

  console.log('=== PLAYER RUNS ===');
  for (const [id, p, label, opts] of runs) {
    const r = play(id, p, label, opts || {});
    console.log(`${label}: outcome=${r.outcome || 'ERROR'} steps=${r.steps || 0} stuck=${!!r.stuck} ${r.error || ''}`);
  }

  // WATCH MODE for each new style (villager taken, player watches the show)
  if (villagerId) {
    console.log('=== WATCH RUNS (villager taken: ' + Game.displayName(villagerId) + ') ===');
    for (const id of ['price', 'impress', 'exchange', 'auction']) {
      const r = play(id, [0, 0, 0], 'watch-' + id, { participant: villagerId, randomFn: NO_DEATH });
      console.log(`watch-${id}: outcome=${r.outcome || 'ERROR'} steps=${r.steps || 0} stuck=${!!r.stuck} ${r.error || ''}`);
    }
    // veteran watcher knowledge gate
    const r = play('price', [0, 0, 0], 'watch-price-veteran', { participant: villagerId, codexLevel: 2, randomFn: NO_DEATH });
    console.log(`watch-price-veteran: outcome=${r.outcome || 'ERROR'} ${r.error || ''}`);
    // player-knowledge gate: veteran INTRO coaching on the player's own run
    const r2 = play('auction', [1, 1, 2], 'play-auction-veteran-intro', { codexLevel: 2, randomFn: NO_DEATH });
    console.log(`play-auction-veteran-intro: outcome=${r2.outcome || 'ERROR'} ${r2.error || ''}`);
  } else {
    console.log('NO VILLAGER ID AVAILABLE — watch runs skipped');
  }

  // Persist transcripts for the evidence note
  const out = 'evidence/2026-10-06/contest-newstyles-feel-20261006.json';
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify(FULL, null, 1));
  console.log('transcripts saved to', out, Object.keys(FULL).length, 'runs');
})().catch(e => { console.error('DRIVER FAILED:', e); process.exit(1); });
