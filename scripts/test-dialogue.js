// Dialogue grammar tests: one coherent grammar — spoken dialogue = speech,
// narration/action = caption. The classifier is the leading quote, enforced
// identically in both render paths. Plus: no doubled quotes anywhere,
// death fires grief dialogue, mantle metaphor gated by integration stage.
// Usage: node scripts/test-dialogue.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();

  // --- 1. cleanDialogue / quoteWrap ---
  ok('cleanDialogue collapses leading doubles', Game.cleanDialogue('""Noted."') === '"Noted."');
  ok('cleanDialogue collapses trailing doubles', Game.cleanDialogue('"Noted.""') === '"Noted."');
  ok('cleanDialogue leaves singles alone', Game.cleanDialogue('"Noted."') === '"Noted."');
  ok('cleanDialogue leaves narration alone', Game.cleanDialogue('Nods slowly.') === 'Nods slowly.');
  ok('quoteWrap strips then wraps', Game.quoteWrap('"PLANTS LIKE YOU!"') === '"PLANTS LIKE YOU!"');
  ok('quoteWrap wraps bare', Game.quoteWrap('PLANTS LIKE YOU!') === '"PLANTS LIKE YOU!"');

  // --- 2. data scan: no doubled quotes in dialogue strings ---
  const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));
  const dlgStrings = [];
  const walk = (o) => {
    if (typeof o === 'string') { dlgStrings.push(o); return; }
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === 'object') { Object.values(o).forEach(walk); }
  };
  walk(cg.convo); walk(cg.moodTalk); walk(cg.temperamentTalk); walk(cg.talkTemplates);
  const abs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
  abs.forEach(a => { if (a.flavor) dlgStrings.push(a.flavor); if (a.description) dlgStrings.push(a.description); });
  const doubled = dlgStrings.filter(t => /(^|\s)""/.test(t) || /""(\s|$)/.test(t));
  ok('no doubled quotes in dialogue data (' + dlgStrings.length + ' strings)', doubled.length === 0);
  if (doubled.length) console.log('  doubled:', doubled.slice(0, 3).map(t => t.slice(0, 60)));

  // --- 3. simulated conversation: transcript has no doubled quotes ---
  Game.debugScenario('day1');
  const vid = Game.state.village.roster.find(id => id !== Game.villagerId);
  Game.state.village.bgLangs[vid] = { native: 'english', levels: { english: 3 } };
  Game.startConvo(vid);
  const questions = (Game.data.characterGen.convo.questions || []).slice(0, 6);
  for (const q of questions) {
    try { Game.convoTurn(vid, 'q:' + q.id); } catch (e) {}
    const c = Game.convoGet(vid);
    const pend = c.pendingQ;
    if (pend && pend.answers && pend.answers[0]) {
      try { Game.convoTurn(vid, 'ans:' + pend.id + ':' + pend.answers[0].id); } catch (e) {}
    }
  }
  const tr = Game.convoGet(vid).transcript || [];
  ok('transcript non-empty', tr.length > 0);
  const badTr = tr.filter(e => /(^|\s)""/.test(e.text) || /""(\s|$)/.test(e.text));
  ok('no doubled quotes in transcript', badTr.length === 0);
  // speech/narration split exists: at least one quoted (speech) and the
  // grammar is stable — quoted lines classify as speech
  const speech = tr.filter(e => /^\s*"/.test(Game.cleanDialogue(e.text)));
  ok('some transcript lines are speech', speech.length > 0);

  // --- 4. death fires grief dialogue ---
  Game.debugScenario('day1');
  const v2 = Game.state.village;
  const victim = v2.roster.find(id => id !== Game.villagerId);
  const vname = (Game.data.villagers.find(x => x.id === victim) || {}).name || 'victim';
  Game.registerDeath({ kind: 'person', villagerId: victim, name: vname, cause: 'test', witnesses: [] });
  ok('grief set by registerDeath', (v2.grief || 0) > 0);
  const other = v2.roster.find(id => id !== Game.villagerId && id !== victim);
  Game.state.village.bgLangs[other] = { native: 'english', levels: { english: 3 } };
  const op = Game.convoOpening(other);
  ok('grief opener fires', op && op.thread === 'grief');

  // --- 5. mantle metaphor gated by integration stage ---
  Game.debugScenario('day1');
  const log = [];
  const origSay = Game.say;
  Game.say = (t) => { log.push(String(t)); };
  try {
    // pre-System: journal + pen is honest
    Game.state.systemArrived = false;
    Game.playerDeath('test');
    const pre = log.join('\n');
    ok('pre-System mantle mentions journal', /picks up the journal/i.test(pre));
    ok('pre-System no digital sync', !/overlaying everything, syncing/i.test(pre));
  } finally { Game.say = origSay; }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
