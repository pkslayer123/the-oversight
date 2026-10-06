#!/usr/bin/env node
// RushIndicator design verdict playtest (Steve 2026-10-06).
// Question: should rush-pattern monsters (hushwolf) get a grid rush indicator,
// or is instant-no-telegraph the correct design?
// Method: fight hushwolves as a player, capture the narration + combat log,
// judge fairness and whether an indicator would help or betray the fiction.
// Usage: node scripts/play-rush-verdict.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); } }

function P() { return Game.tbFighter('p'); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}

(async () => {
  console.log('=== FIGHT 1: hushwolf pack, player waits (no action) ===');
  await Game.init();
  Game.debugScenario('hushpuppy');
  Game.canSee = () => true;
  let waits = 0;
  while (!Game.tbfight && waits < 10) { waits++; Game.doAction('wait'); }
  ok('combat starts', !!Game.tbfight, 'no combat');
  if (!Game.tbfight) { console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

  // Capture narration lines during the fight
  const seen = [];
  const origSay = Game.sayLine;
  Game.sayLine = function (line, ...rest) {
    seen.push(String(line).slice(0, 140));
    return origSay2b.call(this, line, ...rest);
  };

  const p0 = P();
  const hp0 = p0.hp;
  let rounds = 0, rushHits = 0, telegraphsSeen = 0;
  // Play 6 rounds: alternate wait / move away
  while (Game.tbfight && !Game.tbfight.over && rounds < 6) {
    rounds++;
    const pf = P();
    const before = pf ? pf.hp : 0;
    // check for any telegraph on wolves this round
    for (const m of (Game.tbfight.fighters || [])) {
      if (m.kind === 'monster' && m.alive && m.telegraph) {
        telegraphsSeen++;
        seen.push(`[TELEGRAPH on ${m.name}: ${JSON.stringify(m.telegraph.pattern || m.telegraph).slice(0, 80)}]`);
      }
    }
    endTurn();
    const pf2 = P();
    const after = pf2 ? pf2.hp : 0;
    if (after < before) { rushHits++; seen.push(`[round ${rounds}: player took ${before - after} dmg]`); }
  }
  Game.sayLine = origSay;
  console.log(`rounds played: ${rounds}, rounds player took damage: ${rushHits}, telegraphs seen: ${telegraphsSeen}`);
  console.log('--- narration sample ---');
  seen.slice(0, 25).forEach(l => console.log('  ' + l));

  ok('rush hits landed (fight is real)', rushHits > 0, 'no damage taken — fight may be broken');
  ok('no grid telegraphs during rush (by design)', telegraphsSeen === 0, telegraphsSeen + ' telegraphs seen');

  console.log('\n=== FIGHT 2: does the player get ANY warning? (audio/cues) ===');
  const warns = [];
  const origSay2b = Game.say;
  Game.say = function (line, ...rest) {
    const s = String(line);
    if (/quiet|silent|birds|hush|still|breath/i.test(s)) warns.push(s.slice(0, 120));
    return origSay2b.call(this, line, ...rest);
  };
  await Game.init();
  Game.debugScenario('hushpuppy');
  Game.canSee = () => true;
  waits = 0;
  while (!Game.tbfight && waits < 10) { waits++; Game.doAction('wait'); }
  rounds = 0;
  while (Game.tbfight && !Game.tbfight.over && rounds < 5) { rounds++; endTurn(); }
  Game.say = origSay2b;
  console.log(`environmental warning lines captured: ${warns.length}`);
  warns.slice(0, 8).forEach(l => console.log('  WARN: ' + l));
  ok('fight gives environmental/diegetic warning (not grid)', warns.length > 0, 'no warning at all — unfair');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
