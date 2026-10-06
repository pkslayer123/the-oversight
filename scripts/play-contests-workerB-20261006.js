// Contest fun/fear playtest — Worker B (Steve 2026-10-06).
// Play Gauntlet (two paths to the closer) and Duel (mercy vs cruelty) as
// the PLAYER, plus one full WATCH-MODE run where a villager is taken.
// Judge: fear (do I feel it?), fun (do I care?), pacing, legibility.
// Usage: node scripts/play-contests-workerB-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/membership.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// Seeded RNG — deterministic playthroughs we can reason about
let seed = 987654321;
function srand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

const transcript = [];
const _say = Game.say.bind(Game);
Game.say = function(t) { transcript.push(t); _say(t); };
function strip(t) { return String(t).replace(/^📺 SYSTEM: "/, '').replace(/"$/, ''); }

function playContest(id, choicePath, label, participant) {
  transcript.length = 0;
  Game.state.over = false;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2200;
  Game.state.scholar.trauma = 0;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  const contest = Game.contestPool().find(c => c.id === id);
  const realRandom = Math.random;
  Math.random = () => 0.99; // grabbed path for player
  Game.contestInterruption(Object.assign({}, contest, { givesChoice: false }), participant || 'player');
  Math.random = srand;
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 12) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) break;
    const idx = choicePath[steps] !== undefined ? choicePath[steps] : 0;
    const ch = phase.choices[Math.min(idx, phase.choices.length - 1)];
    transcript.push(`\n>>> YOU CHOOSE: ${ch.label} (${ch.sub})`);
    result = Game.contestChoose(Math.min(idx, phase.choices.length - 1));
    steps++;
    if (result && result.done) break;
  }
  Math.random = realRandom;
  console.log(`\n${'='.repeat(64)}`);
  console.log(`PLAY: ${label} [${id}] choices=[${choicePath.join(',')}] as ${participant || 'player'}`);
  console.log(`${'='.repeat(64)}`);
  for (const t of transcript) console.log(strip(t));
  console.log(`\n--- outcome: ${result ? result.outcome : 'UNRESOLVED'} | hp ${Math.round(Game.state.scholar.health)} | trauma ${Game.state.scholar.trauma} | kcal ${Math.round(Game.state.scholar.kcal)} ---`);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.systemArrived = true;

  // 1. GAUNTLET reckless — spend everything, arrive bleeding, stand and fight.
  playContest('gauntlet', [0, 0, 0], 'Gauntlet — reckless, arrive bleeding');
  // 2. GAUNTLET cautious — arena craft, beg the crowd, run the clock.
  playContest('gauntlet', [2, 2, 1], 'Gauntlet — cautious, run the clock');
  // 3. DUEL merciful — study, then accept the yield.
  playContest('duel', [1, 1], 'Duel — the merciful win');
  // 4. DUEL cruel — deal offered, advantage pressed.
  playContest('duel', [0, 0], 'Duel — no mercy');
  // 5. WATCH MODE — a villager is taken for the Gauntlet. Cheer, bet, comfort.
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const taken = roster[0];
  playContest('gauntlet', [0, 1, 0], `Gauntlet — watch ${Game.displayName(taken)} taken`, taken);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
