// Journal pacing (Steve 2026-10-05): pre-codex, knowledge enters ONLY by
// word of mouth, manual jots, or the player's own identification work.
// Passive observation doesn't auto-record; village spread is slow word of
// mouth, not instant broadcast. Post-codex the Codex automates transfer.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  const v = Game.state.village;
  const roster = (v.roster || []).filter(rid => rid !== Game.villagerId);

  // --- pre-codex framing ---
  ok('pre-codex: not unlocked', !s.codexUnlocked);
  ok('pre-codex: journalName is Journal', Game.journalName() === 'Journal');

  // pick fresh plants (background may pre-know some)
  const allPids = (Game.data.plants || []).map(p => p.id).filter(id => !Game.plantKnown(id));
  ok('enough fresh plants for test', allPids.length >= 3);
  const [pidA, pidB, pidC] = allPids;

  // --- self-identification auto-jots (Steve's ruling) ---
  ok('identifyPlant works (fireside)', Game.identifyPlant(pidA, 'fireside') === true);
  const entry = Game.state.codex.plants[pidA];
  ok('self-ID auto-jots to player knowledge', !!entry && entry.level === 1);
  ok('pre-codex entry flagged as journal', entry.journal === true);
  ok('player taught[] synced', (v.taught[Game.villagerId] || []).includes(pidA));

  // --- village does NOT instantly know (slow word of mouth) ---
  // use a second fresh plant for a clean before/after; villagers may know it
  // from background, so count NEW knowers
  const preB = new Set(roster.filter(rid => (v.taught[rid] || []).includes(pidB)));
  ok('identifyPlant works (fireside) on second plant', Game.identifyPlant(pidB, 'fireside') === true);
  const blackberryKnowers = roster.filter(rid => (v.taught[rid] || []).includes(pidB) && !preB.has(rid));
  ok('at most one witness learns instantly', blackberryKnowers.length <= 1);
  ok('rumor seeded for slow spread', !!(v.plantRumors || {})[pidB]);

  // --- one spread tick teaches at most one per plant (deterministic cap) ---
  const before = blackberryKnowers.length;
  Game.spreadPlantKnowledge();
  const after = roster.filter(rid => (v.taught[rid] || []).includes(pidB) && !preB.has(rid)).length;
  ok('single spread tick teaches at most one', after - before <= 1);

  // --- spread completes over many ticks (slow, not instant) ---
  for (let i = 0; i < 300 && roster.some(rid => !(v.taught[rid] || []).includes(pidB)); i++) {
    Game.spreadPlantKnowledge();
  }
  ok('word of mouth eventually reaches everyone', roster.every(rid => (v.taught[rid] || []).includes(pidB)));
  Game.spreadPlantKnowledge(); // one more tick lets the rumor clear
  ok('rumor cleared when done', !(v.plantRumors || {})[pidB]);

  // --- manual jot path: queue does NOT auto-write; jot does ---
  let journalCalls = 0;
  const origJL = Game.journalLearn;
  Game.journalLearn = function (...a) { journalCalls++; return origJL.apply(this, a); };
  Game.queueJotNote('test label', 'test note text');
  ok('queueJotNote stashes pending', !!(Game.pendingJot() || {}).text);
  ok('queue does not auto-write to journal', journalCalls === 0);
  const ticksBefore = s.dayTicks || 0;
  Game.jotPendingNote();
  ok('jot writes to journal', journalCalls === 1);
  ok('jot clears pending', !Game.pendingJot());
  ok('jot costs honest ticks', (s.dayTicks || 0) > ticksBefore);
  Game.journalLearn = origJL;

  // --- post-codex: automation framing ---
  Game.state.systemArrived = true;
  s.codexUnlocked = true;
  ok('post-codex: journalName is Codex', Game.journalName() === 'Codex');
  ok('identifyPlant works post-codex', Game.identifyPlant(pidC, 'fireside') === true);
  ok('post-codex entry flagged as codex', Game.state.codex.plants[pidC].journal === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
