// Contest feel playtest (Steve 2026-10-05): play Pit, Gauntlet, Hide as a
// PLAYER with fixed choice paths and a seeded RNG, printing the full
// transcript. Judge: fear, legibility, pacing, no placeholder text.
// Usage: node scripts/play-contest-feel.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// Seeded RNG for a stable playthrough
let seed = 1234567;
function srand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

const transcript = [];
const _say = Game.say.bind(Game);
Game.say = function(t) { transcript.push(t); _say(t); };

function strip(t) { return t.replace(/^📺 SYSTEM: "/, '').replace(/"$/, ''); }

function playContest(id, choicePath, label) {
  transcript.length = 0;
  Game.state.over = false;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2200;
  Game.state.scholar.trauma = 0;
  Game.state.activeContest = null;
  const contest = Game.contestPool().find(c => c.id === id);
  // Force the grabbed path (no choice phase) for a straight playthrough
  const realRandom = Math.random;
  Math.random = () => 0.99; // givesChoice check fails -> grabbed
  Game.contestInterruption(Object.assign({}, contest, { givesChoice: false }), 'player');
  Math.random = srand;
  let steps = 0;
  let result = null;
  while (Game.state.activeContest && steps < 10) {
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
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PLAYTEST: ${label} (${id}) — choices [${choicePath.join(',')}]`);
  console.log(`${'='.repeat(60)}`);
  for (const t of transcript) console.log(strip(t));
  console.log(`\n--- outcome: ${result ? result.outcome : 'UNRESOLVED'} | hp ${Game.state.scholar.health} | trauma ${Game.state.scholar.trauma} ---`);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.systemArrived = true;

  // PIT: refuse the weapon, charge screaming, sidestep the rush
  playContest('pit', [2, 1, 1], 'The Pit — unarmed bravado');
  // GAUNTLET: arena craft, desperate defense, run the clock (wounds matter)
  playContest('gauntlet', [2, 1, 1], 'Gauntlet — cautious run at the closer');
  // GAUNTLET again: reckless — spend everything, all offense, stand and fight
  playContest('gauntlet', [0, 0, 0], 'Gauntlet — reckless, arrive bleeding');
  // HIDE: climb high, misdirect, trust the spot
  playContest('hide', [0, 1, 0], 'Hide and Seek — the patient hider');

  // Closer readout demo: show exactly what the player sees at wave three
  console.log(`\n${'='.repeat(60)}`);
  console.log('CLOSER READOUT — what the System displays (38 wounds vs 5 wounds)');
  console.log(`${'='.repeat(60)}`);
  const g = Game.contestPool().find(c => c.id === 'gauntlet');
  for (const w of [38, 5]) {
    const ac = { contestId: 'gauntlet', participant: 'player', wounds: w };
    const rendered = Game._contestRenderPhase(ac, Game._contestGauntlet(g)[2], 2);
    console.log(`\n--- ${w} wounds ---`);
    console.log(strip(rendered.text).split('\n').slice(-3).join('\n'));
    for (const ch of rendered.choices) console.log(`  [${ch.label}] ${ch.sub}`);
  }
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
