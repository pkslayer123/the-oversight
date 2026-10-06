// REPRO: villagers speak third-person prototype text as first-person dialogue,
// with doubled quotes. Two sub-cases:
//  (a) want/secret hooks (src/js/conversation.js:759,767): the prototype
//      "want" text is third-person ("They want to fix the water filter.
//      They've been thinking about it for days.") but voiceLine() wraps it in
//      quotes as the villager's SPOKEN line; conversation.js:2279 then wraps it
//      AGAIN as  Name: "line"  ->  Felix: ""They want to ...""
//  (b) confrontDoubt (src/js/truth.js): returned lines are pre-quoted
//      ('"Never mind."'), and the convoTurn handler (truth.js:1025) wraps them
//      again:  Malik: ""I wasn't a Brain surgeon...""
// Expected: one quote layer, and wants/secrets voiced in first person (or
// rendered as narration, not speech).
// Usage: node scripts/test-social-voice-hooks.js
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
let fail = 0;
function check(name, cond, detail) {
  console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
  if (!cond) fail++;
}

(async () => {
  await Game.init();

  // (a) want hook: drive the opener directly until the 30% hook fires
  Game.debugScenario('liars');
  const rid = Game.state.village.roster.filter(id => id !== Game.villagerId)[0];
  Game.state.village.trust[rid] = 50;
  Game.startConvo(rid);
  sayLog = [];
  let wantLine = null;
  for (let i = 0; i < 60 && !wantLine; i++) {
    Game.convoGet(rid).wantHooked = false; // re-arm: we test the line, not the gating
    const r = Game.convoOpening(rid);
    if (r && r.thread === 'want') {
      Game.say(`${Game.displayName(rid)}: "${r.line}"`); // what conversation.js:2279 does
      wantLine = sayLog[sayLog.length - 1];
    }
  }
  check('want-hook fires', !!wantLine);
  if (wantLine) {
    check('want-hook single quote layer', !/:\s*""/.test(wantLine), wantLine.slice(0, 110));
    check('want-hook not third-person speech', !/They're |They want to|They've been/.test(wantLine), wantLine.slice(0, 110));
  }

  // (b) confront doubled quotes: loop fresh scenarios until a confess
  // branch fires (line starts with a quote), then check the wrap
  let doubled = null, tried = 0;
  for (let a = 0; a < 15 && !doubled && tried < 15; a++) {
    Game.debugScenario('liars');
    const r2 = Game.state.village.roster.filter(id => id !== Game.villagerId)[0];
    for (let t = 0; t < 8; t++) { try { Game.observePerson(r2); } catch (e) {} }
    const d = (Game.getDoubts(r2, true) || [])[0];
    if (!d) continue;
    tried++;
    const res = Game.confrontDoubt(r2, d.id);
    if (res && res.ok && /^"/.test(res.line || '')) {
      const wrapped = `${Game.displayName(r2)}: "${res.line}"`; // truth.js:1025
      if (/:\s*""/.test(wrapped)) doubled = wrapped;
    }
  }
  check('confront attempts made', tried > 0);
  check('confront single quote layer', !doubled, doubled && doubled.slice(0, 110));

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
