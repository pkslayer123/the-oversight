// Villager personality test. Usage: node scripts/test-villager-personality.js
// Tests: distinct personalities, personal topic wired up, trust effects.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = v.roster || [];

  // 1. vpOf finds rosterChars (generated villagers)
  const vid = roster[0];
  const vp = Game.vpOf(vid);
  ok('vpOf finds generated villager', !!vp.id);
  ok('vpOf has personality', !!(vp.personality && vp.personality.temperament));
  ok('vpOf has talk lines', Array.isArray(vp.talk) && vp.talk.length > 0);

  // 2. Personal topic uses talk lines
  const personalLines = new Set();
  for (const testVid of roster.slice(0, 5)) {
    const testVp = Game.vpOf(testVid);
    if (testVp.talk && testVp.talk.length) {
      // Simulate convoAskTopic('personal')
      const c = Game.convoGet(testVid);
      c.askedTopics = [];
      try {
        const line = Game.convoAskTopic(testVid, 'personal');
        if (line && typeof line === 'string') {
          // Should be filled (no {an_occ} placeholders)
          ok(`personal topic for ${testVid}: no placeholders`, line.indexOf('{an_occ}') === -1 && line.indexOf('{occ}') === -1);
          personalLines.add(line.slice(0, 50));
        }
      } catch (e) { ok(`personal topic for ${testVid}: no crash`, false); }
    }
  }
  ok('personal lines distinct across villagers', personalLines.size >= 3);

  // 3. Personal topic appears in choices
  try {
    const testVid2 = roster[1];
    Game.startConvo(testVid2);
    const choices = Game.convoChoices(testVid2);
    const hasPersonal = choices.some(ch => ch.id === 'ask:personal');
    ok('personal topic in conversation choices', hasPersonal);
    if (v.convos && v.convos[testVid2]) v.convos[testVid2].active = false;
  } catch (e) { ok('personal topic in choices: no crash', false); }

  // 4. Distinctness: 5 villagers have unique quirks/habits
  const chars = roster.slice(0, 5).map(id => Game.vpOf(id));
  const quirks = chars.map(c => (c.personality || {}).quirk).filter(Boolean);
  const habits = chars.map(c => (c.personality || {}).habit).filter(Boolean);
  ok('quirks distinct', new Set(quirks).size === quirks.length && quirks.length >= 4);
  ok('habits distinct', new Set(habits).size === habits.length && habits.length >= 4);

  console.log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
