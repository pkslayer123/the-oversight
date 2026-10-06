// REPRO: codex confirmation label says "what X did" instead of the actual
// occupation. After a liar confesses ("I was a librarian"), confirmField
// (src/js/codex-people.js:341-343) builds the label as
//   `what ${this.personFirst(vid)} did`
// producing: "Confirmed about the person in their 50s, the librarian: what
// the person in their 50s, the librarian did. That's not gossip anymore."
// Expected: the label names the confirmed occupation, e.g. "librarian".
// Usage: node scripts/test-social-confirm-label.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
let sayLog = [];
Game.say = (t) => { sayLog.push(String(t)); };

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  const rid = Game.state.village.roster.filter(id => id !== Game.villagerId)[0];
  const truth = (Game.vpOf(rid).lies.occupation || {}).truth;
  for (let t = 0; t < 8; t++) { try { Game.observePerson(rid); } catch (e) {} }
  Game.startConvo(rid);
  sayLog = [];
  const ch = Game.convoChoices(rid) || [];
  const conf = ch.find(c => String(c.id).indexOf('confront:') === 0);
  if (!conf) { console.log('SKIP: no confront choice (no doubt caught)'); process.exit(0); }
  Game.convoTurn(rid, conf.id);
  const bad = sayLog.filter(l => /Confirmed about.*: what .* did\. That's not gossip/.test(l));
  console.log('truth was:', truth);
  console.log('confirm lines:', sayLog.filter(l => /Confirmed about/.test(l)).map(l => l.slice(0, 110)));
  if (bad.length) {
    console.log('FAIL: confirmation label is "what X did" instead of the occupation:');
    bad.slice(0, 2).forEach(l => console.log('  ' + l.slice(0, 130)));
    process.exit(1);
  }
  console.log('PASS: no "what X did" confirmation label');
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
