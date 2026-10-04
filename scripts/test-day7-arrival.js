// Day 7 System arrival rewrite. Usage: node scripts/test-day7-arrival.js
// Covers: beats fire in staged order; no beat dumps multiple unlocks;
// the System's voice never shows correct understanding of food/nutrition
// (blocklist); the cold-fusion confusion beat exists; the rounding-error
// grace note exists; the journal->interface transformation is staged;
// mechanical unlocks (abilities, codex, labels, wave 2) all still apply.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 7;
}
const sysLines = (beats) => beats.flatMap(b => b.lines).filter(l => l.who === 'sys').map(l => l.text);

(async () => {
  await Game.init();

  // 1. STAGED BEATS: ordered, well-formed.
  freshGame();
  Game.checkSystemArrival();
  const beats = Game.systemArrivalBeats();
  ok('beats is an array', Array.isArray(beats));
  ok('beats fire in staged order', JSON.stringify(beats.map(b => b.id)) ===
    JSON.stringify(['glitch', 'contact', 'watched', 'food', 'gifts', 'button']));
  ok('every beat has >= 2 lines and a button', beats.every(b =>
    b.lines.length >= 2 && typeof b.button === 'string' && b.button.length > 0));
  ok('narration and System voices are distinguished', beats.some(b =>
    b.lines.some(l => l.who === 'narr')) && beats.some(b => b.lines.some(l => l.who === 'sys')));

  // 2. FICTION GUARDRAIL: the System never shows correct food/nutrition understanding.
  const BLOCK = [/\bcalories?\b/i, /nutrition/i, /balanced diet/i, /protein/i, /vitamin/i,
    /carbohydrate/i, /metabolism/i, /spoil/i, /cook/i];
  const violations = sysLines(beats).filter(t => BLOCK.some(re => re.test(t)));
  ok('no correct food/nutrition claims in System voice', violations.length === 0);

  // 3. THE FOOD CONFUSION: cold fusion, face-holes, the buried pellet.
  const sys = sysLines(beats).join(' ');
  ok('cold-fusion confusion beat exists', /fusion/i.test(sys));
  ok('face-hole confusion present', /face-hole/i.test(sys));
  ok('buried pellet callback present', /bury the pellet/i.test(sys));

  // 4. GRACE NOTE: anomalous reading filed as rounding error, dots unconnected.
  ok('rounding-error grace note exists', /rounding error/i.test(sys));
  ok('System never connects the dots', !/superpower|mana|advantage/i.test(sys));

  // 5. TRANSFORMATION STAGED: journal->interface is a beat moment, not a log aside.
  const gifts = beats.find(b => b.id === 'gifts');
  ok('gifts beat stages the journal transformation', gifts.lines.some(l => /journal/i.test(l.text)));

  // 6. FORESHADOWING: the trailer tells you what's in store.
  const watched = sysLines([beats.find(b => b.id === 'watched')]).join(' ');
  ok('foreshadows audience/favor', /fans/i.test(watched));
  ok('foreshadows villages living their own games', /own tiny games/i.test(watched));
  const buttonBeat = sysLines([beats.find(b => b.id === 'button')]).join(' ');
  ok('foreshadows wave-2 monsters', /calibration fauna/i.test(buttonBeat));

  // 7. NO DUMPED UNLOCKS: each mechanical effect applied exactly once.
  ok('systemArrived set', Game.state.systemArrived === true);
  ok('ability gift offered once (3 choices)', (Game.state.scholar.abilityChoices || []).length === 3);
  ok('codex unlocked', Game.state.scholar.codexUnlocked === true);
  ok('dial glitched', Game.state.dialGlitch === true);
  const roster = Game.state.village.roster || [];
  ok('everyone labeled', roster.every(vid => Game.state.village.knownNames[vid]));
  ok('wave-2 events scheduled', (Game.state.scholar.timedEvents || []).length === 4);

  // 8. IDEMPOTENT: a second arrival changes nothing.
  Game.checkSystemArrival();
  ok('second arrival adds no choices', (Game.state.scholar.abilityChoices || []).length === 3);
  ok('second arrival schedules no events', (Game.state.scholar.timedEvents || []).length === 4);

  // 9. TRANSLATOR PITCH: conditional on week-1 miming.
  freshGame();
  Game.state.scholar.week1 = { langStruggle: 2 };
  ok('translator pitch appears after miming week', sysLines(Game.systemArrivalBeats()).join(' ').includes('translation-shaped gift'));
  Game.state.scholar.week1 = {};
  ok('translator pitch absent otherwise', !sysLines(Game.systemArrivalBeats()).join(' ').includes('translation-shaped gift'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
