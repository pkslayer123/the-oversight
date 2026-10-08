// Regression tests for the 2026-10-06 social-scenario audit fixes (Steve).
// Bug classes:
//  1. Player verb agreement in moot verdicts ("You pay. And stays — this time.").
//  2. Observe-branch narration rendered as the villager's own dialogue
//     (`Nora: "You study Nora at the fire..."`) and said twice.
// Usage: node scripts/test-social-audit-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js','src/js/convoTopics.js',
 'src/js/journal.js','src/js/party.js','src/js/party-formal.js','src/js/truth.js','src/js/contests.js',
 'src/js/storage.js','src/js/perceive.js','src/js/carexplore.js','src/js/justice.js','src/js/food.js',
 'src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js','src/js/progression.js','src/js/ledger.js',
 'src/js/villager-agency.js','src/js/codex-people.js','src/js/membership.js','src/js/hierarchy.js',
 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };

(async () => {
  await Game.init();

  // --- 1. player-accused weregild verdict: verb agreement ---
  // Deterministic: drive sentenceCase directly with a fabricated convicted
  // case whose belief sits in the weregild band (avg < -10, not exile-worthy).
  // resolveCase gets a fake id and no-ops; the sentence text is what we assert.
  Game.debugScenario('mootAccused');
  const me = Game.villagerId;
  const npcs = Game.npcIds().filter(id => id !== me);
  const fake = { id: 'audit_fake_case', accused: [me], charge: 'theft', flipped: null, target: npcs[0], belief: {} };
  for (const id of npcs) fake.belief[id] = -20; // avg -20: weregild band for theft
  sayLog = [];
  Game.sentenceCase(fake);
  const vtext = sayLog.join('\n');
  ok('verdict: weregild sentence spoken', /The sentence is spoken low/.test(vtext));
  ok('verdict: no "You pay. And stays"', !/You pay\. And stays/.test(vtext));
  ok('verdict: "You pay. And stay" agreement', /You pay\. And stay — this time/.test(vtext), vtext.slice(0, 160));
  // non-player accused still reads "pays / stays"
  const fake2 = { id: 'audit_fake_case2', accused: [npcs[0]], charge: 'theft', flipped: null, target: me, belief: {} };
  for (const id of npcs) fake2.belief[id] = -20;
  sayLog = [];
  Game.sentenceCase(fake2);
  const vtext2 = sayLog.join('\n');
  ok('verdict: third-person "pays / stays" intact', /pays\. And stays — this time/.test(vtext2), vtext2.slice(0, 160));

  // --- 2. observe: narration said once, as narration, not as the villager's speech ---
  Game.debugScenario('liars');
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const p = roster[0];
  const first = Game.nameFirst(p);
  // natural path: converse until the 'observe' choice surfaces (thread-coherence:
  // observe waits for an active thread to resolve, so leave between convos)
  let obs = null, rounds = 0;
  while (!obs && rounds++ < 5) {
    Game.startConvo(p);
    let chx = (Game.convoChoices(p) || []).map(x => x.id);
    obs = (Game.convoChoices(p) || []).find(x => x.id === 'observe');
    if (obs) break;
    Game.convoTurn(p, chx.includes('ask:personal') ? 'ask:personal' : chx[0]);
    chx = (Game.convoChoices(p) || []).map(x => x.id);
    obs = (Game.convoChoices(p) || []).find(x => x.id === 'observe');
    if (obs) break;
    if (chx.includes('leave')) Game.convoTurn(p, 'leave');
    else if (chx.includes('goon')) Game.convoTurn(p, 'goon');
  }
  ok('observe choice offered after conversing', !!obs);
  sayLog = [];
  if (obs) {
    Game.convoTurn(p, 'observe');
    const dname = Game.displayName(p);
    const dEsc = dname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // the observation is player narration: exactly one non-dialogue, non-journal line
    const narration = sayLog.filter(l => !new RegExp('^' + dEsc + ':').test(l) && !/^📓/.test(l));
    ok('observation narrated exactly once', narration.length === 1, `got ${narration.length}: ${narration.join(' // ').slice(0, 200)}`);
    // and never misattributed as the villager's own dialogue: the bug rendered
    // third-person observation ("You study Nora...") as `Nora: "..."`.
    // Genuine reaction speech starts with second-person "You ..." and never
    // names the villager in third person — that's the discriminator.
    const misattributed = sayLog.some(l =>
      new RegExp('^' + dEsc + ': "You [^"]*\\b' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(l));
    ok('observation not rendered as villager dialogue', !misattributed);
    // the villager's actual beat is a reaction line, present in the transcript as 'them'
    const cg = Game.convoGet(p);
    const lastThem = cg.transcript.filter(t => t.who === 'them').slice(-1)[0];
    ok('villager beat is a reaction, not the observation',
      !!lastThem && !/You (study|watch) /.test(lastThem.text) && !/in your eyeline/.test(lastThem.text),
      (lastThem && lastThem.text || '(none)').slice(0, 120));
  }

  // --- 3. observedReact pool exists and renders ---
  const pool = Game.truthLinePools && Game.truthLinePools.observedReact;
  ok('observedReact pool exists with lines', !!(pool && pool.length >= 3));

  console.log(`\nsocial-audit-20261006: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
