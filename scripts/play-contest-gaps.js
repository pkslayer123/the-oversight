// Playtest-as-player for contest gaps (Steve 2026-10-06).
// PART 1: TAKEN — player + 3 villagers taken for Starve (4 participants).
//   Played with real RNG, first-choice drive. Judge: fear, others' fates.
// PART 2: WATCH — two villagers taken for the Pit (high risk). Watcher
//   chooses: cheer, bet 200, go to them. Judge: agency, consequences.
// Prints full transcripts. Usage: node scripts/play-contest-gaps.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/membership.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/party.js', 'src/js/carexplore.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const lines = [];
function emit(s) { lines.push(s); console.log(s); }
const _say = Game.say.bind(Game);
const _sys = Game.sysSay.bind(Game);
Game.say = function(t) { lines.push(String(t)); return _say(t); };
Game.sysSay = function(t) { lines.push('📺SYS ' + String(t)); return _sys(t); };

function seatVillagers() {
  const v = Game.state.village;
  v.positions = v.positions || {};
  (v.roster || []).forEach((rid, i) => {
    try { Game.npcSetNode(rid, Game.map.px, Game.map.py); } catch (e) {}
    v.positions[rid] = { mx: 1 + (i % 7), my: 1 + (Math.floor(i / 7) % 7) };
  });
}

function showChoices(ac) {
  const ph = ac.phases[ac.phaseIdx];
  if (!ph || !ph.choices) return null;
  return ph.choices.map((c, i) => `    [${i}] ${c.label}${c.sub ? ' — ' + c.sub : ''}`).join('\n');
}

function drive(label, choicePlan, maxSteps) {
  emit(`\n========== ${label} ==========`);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < (maxSteps || 24)) {
    const ac = Game.state.activeContest;
    const ph = ac.phases[ac.phaseIdx];
    emit(`\n--- phase ${ac.phaseIdx} (${ac.phase}) ---`);
    if (ph && ph.text) emit(ph.text.split('\n').slice(0, 6).join('\n'));
    const cs = showChoices(ac);
    if (cs) emit('  choices:\n' + cs);
    let idx = 0;
    if (choicePlan && choicePlan[steps] !== undefined) idx = choicePlan[steps];
    const nChoices = (ph && ph.choices) ? ph.choices.length : 1;
    idx = Math.min(idx, nChoices - 1);
    emit(`  >> choose [${idx}] ${(ph && ph.choices && ph.choices[idx]) ? ph.choices[idx].label : ''}`);
    const before = lines.length;
    result = Game.contestChoose(idx);
    // print only NEW lines since the choice (the beat results)
    const fresh = lines.slice(before, lines.length);
    if (fresh.length) emit('  ' + fresh.join('\n  ').slice(0, 1200));
    steps++;
    if (result && result.done) break;
  }
  emit(`\n>>> sequence done: ${JSON.stringify(result)}`);
  emit(`>>> player: hp=${Math.round(Game.state.scholar.health)} kcal=${Math.round(Game.state.scholar.kcal)} trauma=${Game.state.scholar.trauma === undefined ? 'n/a' : Math.round(Game.state.scholar.trauma)} over=${!!Game.state.over}`);
  emit(`>>> roster now: ${(Game.state.village.roster || []).length} villagers`);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  seatVillagers();
  Game.state.scholar.day = 15;
  Game.state.systemArrived = true;
  Game.state.showBudget = 10;
  const roster = (Game.state.village.roster || []).slice();
  const starve = Game.contestPool().find(c => c.id === 'starve');
  const pit = Game.contestPool().find(c => c.id === 'pit');

  // PART 1: taken with three villagers
  emit('########## PART 1: TAKEN (Starve, 4 participants) ##########');
  Game.state.scholar.kcal = 2200;
  Game.state.pendingContest = {
    contestId: starve.id, participant: 'player',
    participants: ['player', roster[0], roster[1], roster[2]],
    firesDay: Game.state.scholar.day, variant: null,
  };
  Game.resolveContest();
  // participate (0), then first choices throughout
  drive('PART 1 — taken for Starve', [0], 24);

  // PART 2: watch two villagers in the Pit
  emit('\n\n########## PART 2: WATCH (The Pit, 2 villagers) ##########');
  Game.state.over = false;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2000;
  Game.state.scholar.trauma = 0;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  const roster2 = (Game.state.village.roster || []).slice();
  Game.state.pendingContest = {
    contestId: pit.id, participant: roster2[0], participants: roster2.slice(0, 2),
    firesDay: Game.state.scholar.day, variant: null,
  };
  Game.resolveContest();
  // cheer (0) → bet (1, kcal>=200 puts it second) → go to them (0)
  drive('PART 2 — watching the Pit', [0, 1, 0], 12);

  fs.writeFileSync('/tmp/contest-gaps-playtest.txt', lines.join('\n'));
  emit('\nTranscript saved to /tmp/contest-gaps-playtest.txt');
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
